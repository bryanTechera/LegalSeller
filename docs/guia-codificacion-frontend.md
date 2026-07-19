# Guía de codificación — Frontend (Next.js)

Patrones concretos para `frontend/`. Provienen de un frontend Next.js en producción; los fragmentos de código son el patrón a replicar. Complementa a `docs/guia-arquitectura.md` §3.

## 1. Tooling

- Next.js (App Router) + React 19, `reactStrictMode: true`, `reactCompiler: true` (auto-memoización: no escribir `useMemo`/`useCallback` manuales salvo necesidad probada).
- `tsconfig.json`: `strict: true`, alias `@/* → ./src/*`, `moduleResolution: "bundler"`.
- Scripts: `dev`, `build`, `start`, `lint` → `eslint .`, `typecheck` → `tsc --noEmit`, `test:unit` → `vitest`, `test` → `playwright test --project=chromium`, más `prisma:generate|migrate|studio` y `postinstall` → `prisma generate`.
- ESLint (flat): `eslint-config-next/core-web-vitals`; `no-console` warn permitiendo solo `debug/info/warn/error`; `no-unused-vars` con `^_`; reglas del React Compiler como **error** (`set-state-in-effect`, `purity`, `refs`, `preserve-manual-memoization`).
- `next.config.ts`: headers de seguridad completos (HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy) + **CSP** (con `unsafe-eval` solo en dev); `images.remotePatterns` acotado; `serverExternalPackages` para pino y similares.
- `instrumentation.ts`: valida env al arranque, registra contexto de logging (AsyncLocalStorage), graceful shutdown (SIGTERM/SIGINT con deadline), captura `unhandledRejection`/`uncaughtException`, exporta `onRequestError`.

## 2. Estructura de `src/`

```
src/
├── app/               # rutas: route groups (auth)/(public), área autenticada, api/, actions/
│   ├── api/           # route handlers
│   ├── actions/       # server actions ('use server')
│   ├── layout.tsx     # fuentes, providers, metadata global
│   └── error.tsx / not-found.tsx / loading.tsx (+ por segmento)
├── components/        # shared/, ui/, layout/ + carpetas por feature
├── hooks/             # useCamelCase.ts
├── lib/               # capa de dominio: servicios, integraciones, validations/, prisma.ts, auth.ts
├── stores/            # Zustand: un store por dominio + barrel index.ts
├── styles/            # CSS compartido y tokens
├── types/             # tipos TS + *.d.ts
├── utils/             # utilidades puras (logger, fechas)
└── proxy.ts           # middleware de Next 16 (auth básica + redirects)
```

Componentes: carpeta `ComponentName/` con `ComponentName.tsx` + `ComponentName.module.css` + `index.ts`. UI específica de una página puede vivir junto a la ruta.

## 3. Server vs Client Components

- **Server por defecto**; `'use client'` solo en el nivel hoja (eventos, hooks, APIs de browser).
- Datos server → client vía props serializables. **Nunca pasar funciones como props a Client Components.** Providers como client wrappers montados en el layout server, con Server Components como `children`.
- No leer cookies/headers en layouts (rompe rendering estático).

Página server típica:

```tsx
export default async function ConsultasPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const data = await prisma.consulta.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
  });
  return <ConsultasScreen data={data} />;
}
```

## 4. Route Handlers (la API del cliente)

Patrón fijo para cada `app/api/**/route.ts`:

```typescript
export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const validation = await parseRequestBody(request, createConsultaSchema);
    if (!validation.success) return validation.response;

    // ownership SIEMPRE en la query
    const recurso = await prisma.consulta.findFirst({
      where: { id: validation.data.id, userId: session.user.id },
    });
    // ... lógica delegada a lib/
    after(() => logger.info("consulta creada", { durationMs: Date.now() - startTime }));
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    trackError({ error, severity: "error", context: { tags: { route: "consultas" } } });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- Errores de negocio con códigos estables (`LIMIT_REACHED`, `DUPLICATE_NAME`) para que el cliente los mapee a mensajes.
- Logging post-respuesta con `after()` de `next/server`.
- GETs no cacheados por defecto; opt-in explícito con `export const revalidate = N` o `force-static`.

**Server Actions** (`app/actions/`, `'use server'`): para flujos server-driven sin polling. Patrón: `auth()` → Prisma → lógica → `redirect()`; devuelven `{ success, ... }` y re-lanzan `NEXT_REDIRECT`.

## 5. Validación (Zod)

- Schemas centralizados en `src/lib/validations/` con barrel; tipos con `z.infer`.
- Server: `parseRequestBody(request, schema)` / `parseSearchParams` devuelven un `NextResponse` 400 listo con mensajes en español (`formatValidationError` mapea paths técnicos a nombres amigables).
- Cliente: formularios con `useState` + `schema.safeParse` campo a campo antes del submit (no se usa react-hook-form). Mismo schema compartido con el server cuando aplica.
- IDs: `z.string().min(1)` + ownership en query — no validar formato cuid/uuid.

## 6. Prisma

- `lib/prisma.ts`: `import "server-only"` + singleton en `globalThis`; `connection_limit`/`pool_timeout` configurables por env; log de queries solo en dev.
- Schema: PKs `cuid()`, `createdAt`/`updatedAt`, `onDelete: Cascade`, índices compuestos según queries reales (`@@index([userId, updatedAt(sort: Desc)])`), `@@unique` de negocio.
- La lógica de negocio vive en `lib/` (módulos por dominio); route handlers y actions delegan.

## 7. Data fetching y estado en el cliente

- **SWR siempre** (nunca hooks de fetch custom): errores tipados `ApiError` (status, retryAfter); fetch condicional con key `null`; config global `revalidateOnFocus: false`, `dedupingInterval: 5000`, retry status-aware (respeta `Retry-After` en 429, backoff con jitter en 502/503, sin retry en 401/403/404). Mutaciones con `useSWRMutation`.
- **Zustand**: selectores atómicos (`useStore(s => s.x)`, nunca destructuring del store completo); un store por dominio; `persist` en sessionStorage con `partialize`; `devtools` solo en dev.
- **Estado persistente vs intención transitoria**: lo que debe sobrevivir a la navegación va al store; el click/toggle efímero va en `useState` local. Resets derivados con setState en fase de render, no en `useEffect` (regla `set-state-in-effect` es error).

## 8. Estilos

- **CSS Modules exclusivamente** + design tokens en variables CSS (`--space-*`, `--text-*`, `--radius-*`, colores semánticos). Prohibido Tailwind, styled-jsx y estilos inline.
- LegalSeller define su propia identidad visual (dominio legal: sobria, alta legibilidad); las reglas de legibilidad se heredan: texto mínimo 13px, contraste WCAG 2.1 AA (4.5:1), line-height >= 1.5, foco visible en todo interactivo, touch targets >= 44px.
- Iconografía: una sola familia de iconos (Phosphor probado), `currentColor`, un solo weight.
- Sanitizar con DOMPurify (isomorphic-dompurify) todo contenido markdown/HTML generado por el LLM antes de renderizar.

## 9. Errores, logging y observabilidad

- `logger` de `@/utils/logger` (JSON estructurado, redacta PII). Prohibido `console.log` en `src/`.
- `trackError({ error, severity, context })` como único entrypoint de reporte; no duplicar con `logger.error`.
- Mensaje al usuario siempre distinto del detalle técnico.
- Boundaries: `error.tsx`, `global-error.tsx`, `not-found.tsx`, `loading.tsx` a nivel raíz y por segmento; `Suspense` con skeleton donde haya `useSearchParams`.

## 10. Auth (Auth.js v5)

- Estrategia JWT (30 días, refresh diario), adapter Prisma. Callback `jwt` throttlea consultas a DB (~1 cada 5 min salvo triggers) y tolera caídas transitorias de conexión (preserva sesión con backoff); invalida token si el usuario fue borrado.
- Rate limit en login por email/IP (Redis si está disponible).
- `proxy.ts` con `matcher` acotado: solo verifica logged-in/out; la autorización real se repite server-side en cada página y handler.
- Webhooks externos (si los hay): validar firma HMAC antes de procesar + idempotencia.

## 11. Testing

- **Vitest** (`environment: jsdom`, `globals: true`): tests colocados en `src/**/*.test.{ts,tsx}`; excluye `tests/**` (e2e). Setup mockea `localStorage` y limpia stores + `vi.clearAllMocks()` en `afterEach`. Foco: `lib/`, hooks, stores, validaciones, edge cases.
- **Playwright** (`testDir: ./tests`): `baseURL` local, trace on-first-retry, screenshots/video en fallo, `webServer` que levanta `pnpm dev` (con rate limit deshabilitado por env). Selectores: `getByRole` > `getByText` > `getByTestId`.
- Unit para lógica determinista; e2e para flujos visibles al usuario. TDD (red-green-refactor) como práctica por defecto.

## 12. SEO y metadata (páginas públicas)

`export const metadata` con `metadataBase` y `title.template`; OG/Twitter images dinámicas; `sitemap.ts`, `robots.ts`, `manifest.ts`; JSON-LD tipado con `schema-dts`. `lang="es"` (o `es-UY` si el producto es local).
