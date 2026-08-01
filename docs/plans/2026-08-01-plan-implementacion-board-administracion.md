# Board de administración — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usá `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para seguimiento.

**Goal:** Un board interno en `/board` — chats de consultantes reales (ver y anotar), métricas de uso, y el sistema de revisión mudado adentro — protegido por auth de email autorizado.

**Architecture:** Rutas nuevas dentro del `frontend/` existente. NextAuth v5 con magic link de Resend y allowlist `ALLOWED_EMAILS`; adapter Prisma (no pg-adapter) porque Prisma es dueño del schema. El gate grueso vive en `src/proxy.ts` (Next 16 renombró `middleware.ts`) y cubre solo `/board/*` y `/api/board/*`, dejando el chat público intacto; cada page y handler repite `auth()` server-side. La lógica vive en `lib/board/*` y los handlers son delgados, como el resto del proyecto.

**Tech Stack:** Next 16 (App Router) · React 19 · NextAuth v5 beta · @auth/prisma-adapter · Resend · Prisma 6 · Recharts 3 · Zod 4 · SWR · CSS Modules · Vitest · Playwright

**Spec:** `docs/plans/2026-08-01-board-administracion.md` — leerlo antes de empezar.

**Worktree:** `/home/bryan/LegalSeller/.claude/worktrees/board`, rama `feat/board-administracion`. Todos los comandos corren desde `frontend/` salvo que se indique otra cosa.

## Global Constraints

Copiadas del spec y de `CLAUDE.md`. **Aplican a todas las tareas.**

- **NUNCA `any`** — `unknown` + Zod. Contratos como schema Zod, tipos con `z.infer`.
- **NUNCA `console.log`** — usar `logger` de `@/utils/logger`.
- **NUNCA el browser habla directo con la DB o con Mastra** — todo por el BFF.
- **Toda query de métricas excluye conversaciones de revisión** (`esRevision = false`), vía el helper de la Tarea 5. Sin excepción.
- Naming: **código en inglés camelCase**; identificadores de dominio, archivos y prosa en **español rioplatense**.
- Sin emojis en código, prompts ni UI.
- Versiones exactas: `next-auth@^5.0.0-beta.32`, `@auth/prisma-adapter@^2.11.3`, `resend@^6.18.1`, `recharts@^3.10.1` (v3 obligatoria: v2 no soporta React 19).
- El archivo de middleware en Next 16 es **`src/proxy.ts`**, nunca `src/middleware.ts` (no falla: simplemente no se ejecuta).
- Conventional commits. Antes de cada commit: `pnpm lint && pnpm typecheck`.
- Tests unitarios junto al código (`*.test.ts`); E2E en `tests/*.spec.ts`.

---

## Estructura de archivos

**Crear:**

| Archivo | Responsabilidad |
|---|---|
| `src/auth.config.ts` | Config edge-safe de NextAuth (pages, sesión, callbacks). Sin adapter ni providers. |
| `src/auth.ts` | Instancia real: adapter Prisma + provider Resend + callback `signIn`. |
| `src/proxy.ts` | Gate grueso de `/board/*` y `/api/board/*`. |
| `src/lib/board/allowlist.ts` | `isAllowed` / `parseAllowedEmails`. Aislado para testear sin next-auth. |
| `src/lib/board/mailer.ts` | HTML del magic link con identidad Jurco. |
| `src/lib/board/identidad.ts` | `getIdentidadBoard()`: sesión Auth.js o cookie del runner. |
| `src/lib/board/rango.ts` | Rango temporal: schema Zod y cálculo de la fecha `desde`. |
| `src/lib/board/scope.ts` | Filtro y JOIN que excluyen conversaciones de revisión. |
| `src/lib/board/costos.ts` | Tabla de precios por modelo y `estimarCostoUsd`. |
| `src/lib/board/metricas-funnel.ts` | Funnel y demanda por categoría (Prisma). |
| `src/lib/board/metricas-agente.ts` | Costo, latencia, tools y volumen (SQL crudo sobre `mastra`). |
| `src/lib/board/metricas.ts` | Orquestador: `Promise.all` de las cuatro familias. |
| `src/lib/board/conversaciones.ts` | Listado y detalle de conversaciones reales. |
| `src/app/api/auth/[...nextauth]/route.ts` | Handlers de Auth.js. |
| `src/app/api/board/metricas/route.ts` | GET métricas. |
| `src/app/api/board/conversaciones/route.ts` | GET listado. |
| `src/app/api/board/conversaciones/[id]/route.ts` | GET detalle. |
| `src/app/login/page.tsx` · `LoginForm.tsx` · `login.module.css` | Login. |
| `src/app/login/check-email/page.tsx` | "Revisá tu correo". |
| `src/app/board/layout.tsx` · `board.module.css` | Shell con sidebar + `auth()`. |
| `src/app/board/page.tsx` | Métricas. |
| `src/app/board/chats/page.tsx` · `[id]/page.tsx` | Chats. |
| `src/app/board/revision/page.tsx` | Revisión mudada. |
| `src/components/board/*` | Sidebar, KPIs, gráficos, tabla, detalle. |
| `tests/board-auth.spec.ts` · `tests/board.spec.ts` | E2E. |

**Modificar:**

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` | Modelos de Auth.js + índice en `Conversation`. |
| `src/app/api/revision/**/route.ts` (6 archivos) | `getExperto()` → `getIdentidadBoard()`. |
| `src/app/revision/page.tsx` | Reemplazado por redirect a `/board/revision`. |
| `src/lib/validations/index.ts` | Exportar los schemas del board. |
| `tests/revision.spec.ts` | Login por sesión en vez de clave tipeada. |
| `.env.example`, `CLAUDE.md`, `docs/guia-arquitectura.md`, `docs/guia-codificacion-frontend.md` | Documentación. |

**Eliminar:** `src/components/revision/AccesoForm.tsx`.

---

## Tarea 1: Auth punta a punta

Primera por diseño: NextAuth v5 está en beta sobre un Next muy nuevo. Si hay fricción, tiene que aparecer antes de construir nada encima.

**Files:**
- Modify: `frontend/package.json`, `frontend/prisma/schema.prisma`
- Create: `frontend/src/lib/board/allowlist.ts`, `frontend/src/lib/board/allowlist.test.ts`, `frontend/src/lib/board/mailer.ts`, `frontend/src/auth.config.ts`, `frontend/src/auth.ts`, `frontend/src/app/api/auth/[...nextauth]/route.ts`, `frontend/src/app/login/page.tsx`, `frontend/src/app/login/LoginForm.tsx`, `frontend/src/app/login/login.module.css`, `frontend/src/app/login/check-email/page.tsx`

**Interfaces:**
- Produces: `isAllowed(email: string | null | undefined, raw?: string): boolean` · `parseAllowedEmails(raw: string | undefined): string[]` · `enviarMagicLink(params: { para: string; url: string }): Promise<void>` · `auth()` (de `@/auth`, devuelve `Session | null`) · `authConfig` (de `@/auth.config`)

- [ ] **Paso 1: Instalar dependencias**

```bash
cd frontend
pnpm add next-auth@^5.0.0-beta.32 @auth/prisma-adapter@^2.11.3 resend@^6.18.1
```

- [ ] **Paso 2: Escribir el test de la allowlist (falla)**

Crear `frontend/src/lib/board/allowlist.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { isAllowed, parseAllowedEmails } from "./allowlist";

describe("parseAllowedEmails", () => {
  it("separa por comas, normaliza a minúsculas y descarta vacíos", () => {
    expect(parseAllowedEmails(" Ana@Jurco.uy , bruno@jurco.uy ,, ")).toEqual([
      "ana@jurco.uy",
      "bruno@jurco.uy",
    ]);
  });

  it("lista ausente devuelve array vacío", () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
  });
});

describe("isAllowed", () => {
  it("acepta un email de la lista sin importar mayúsculas ni espacios", () => {
    expect(isAllowed("  Ana@Jurco.uy ", "ana@jurco.uy,bruno@jurco.uy")).toBe(true);
  });

  it("rechaza un email que no está en la lista", () => {
    expect(isAllowed("intruso@example.com", "ana@jurco.uy")).toBe(false);
  });

  // Fail-closed: una env faltante en producción NUNCA debe abrir el board.
  it("lista vacía deniega todo", () => {
    expect(isAllowed("ana@jurco.uy", "")).toBe(false);
    expect(isAllowed("ana@jurco.uy", undefined)).toBe(false);
  });

  it("email nulo o vacío es rechazado", () => {
    expect(isAllowed(null, "ana@jurco.uy")).toBe(false);
    expect(isAllowed("", "ana@jurco.uy")).toBe(false);
  });
});
```

- [ ] **Paso 3: Correr el test y verificar que falla**

Run: `pnpm test:unit --run src/lib/board/allowlist.test.ts`
Expected: FAIL — "Failed to resolve import ./allowlist"

- [ ] **Paso 4: Implementar la allowlist**

Crear `frontend/src/lib/board/allowlist.ts`:

```typescript
/**
 * Allowlist de acceso al board. Fail-closed por diseño: una lista vacía o
 * ausente deniega a todos, para que una env faltante en producción nunca
 * termine abriendo el board en vez de cerrarlo.
 */
export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(
  email: string | null | undefined,
  raw: string | undefined = process.env.ALLOWED_EMAILS,
): boolean {
  const permitidos = parseAllowedEmails(raw);
  if (permitidos.length === 0) return false;
  const candidato = (email ?? "").trim().toLowerCase();
  if (!candidato) return false;
  return permitidos.includes(candidato);
}
```

- [ ] **Paso 5: Correr el test y verificar que pasa**

Run: `pnpm test:unit --run src/lib/board/allowlist.test.ts`
Expected: PASS — 6 tests

- [ ] **Paso 6: Agregar los modelos de Auth.js al schema Prisma**

Agregar al final de `frontend/prisma/schema.prisma`:

```prisma
/// Identidad del equipo interno en el board (/board). NO tiene relación con
/// el consultante del chat público, cuya identidad es la cookie anónima
/// `ls_session` y no se persiste como usuario. Modelos requeridos por
/// @auth/prisma-adapter: los nombres y campos los fija el adapter.
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?

  accounts Account[]
  sessions Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}

/// La estrategia de sesión es JWT, así que esta tabla queda casi sin uso —
/// el adapter la exige de todos modos por contrato de tipos.
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

- [ ] **Paso 7: Generar y aplicar la migración**

```bash
cd frontend
pnpm prisma migrate dev --name auth-board
pnpm prisma generate
```

Expected: la migración crea `User`, `Account`, `Session`, `VerificationToken`. Si Prisma reporta drift por tablas de Mastra, verificá que `PostgresStore` esté configurado con `schemaName: "mastra"` (gotcha en `CLAUDE.md`) antes de continuar — **no aceptes un reset de la base**.

- [ ] **Paso 8: Escribir el mailer con identidad Jurco**

Crear `frontend/src/lib/board/mailer.ts`:

```typescript
import "server-only";

import { Resend } from "resend";

let cliente: Resend | null = null;

function getResend(): Resend {
  if (!cliente) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY no está configurada");
    cliente = new Resend(apiKey);
  }
  return cliente;
}

/**
 * HTML del magic link con la identidad Jurco (navy #132a3b sobre blanco
 * frío, acento acero #3185c9). El proyecto de referencia ~/observability
 * trae este template con la marca Colar: reusarlo haría que al equipo legal
 * le llegue un mail de acceso firmado por otro producto, que es exactamente
 * la pinta de un phishing.
 */
function renderHtml(url: string): string {
  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#f4f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:48px 16px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e2e8ee;border-radius:10px;padding:40px 32px;">
            <tr>
              <td style="text-align:center;">
                <div style="font-size:22px;font-weight:700;color:#132a3b;letter-spacing:0.05em;margin-bottom:8px;">JURCO</div>
                <div style="font-size:13px;color:#64778a;margin-bottom:32px;">Acceso al board</div>
                <p style="color:#3c4f60;font-size:14px;line-height:1.6;margin:0 0 24px;">
                  Entrá al board con este enlace. Es válido por 24 horas y se puede usar una sola vez.
                </p>
                <a href="${url}" style="display:inline-block;background-color:#3185c9;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:4px;font-size:14px;font-weight:500;">Entrar al board</a>
                <p style="color:#64778a;font-size:12px;line-height:1.6;margin:32px 0 0;">
                  Si el botón no funciona, copiá este enlace en tu navegador:<br>
                  <span style="color:#9fb0bf;word-break:break-all;">${url}</span>
                </p>
                <p style="color:#9fb0bf;font-size:11px;margin:24px 0 0;">
                  Si no pediste este acceso, ignorá este mensaje.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function enviarMagicLink(params: { para: string; url: string }): Promise<void> {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM no está configurada");
  const { error } = await getResend().emails.send({
    from,
    to: params.para,
    subject: "Tu acceso al board de Jurco",
    html: renderHtml(params.url),
    text: `Entrá al board con este enlace (válido 24 horas, un solo uso): ${params.url}`,
  });
  if (error) throw new Error(`Resend rechazó el envío: ${error.message}`);
}
```

- [ ] **Paso 9: Escribir la config edge-safe**

Crear `frontend/src/auth.config.ts`. **No importa Prisma ni el provider**: este módulo lo carga `proxy.ts`, que corre en el runtime Edge donde Prisma no existe.

```typescript
import type { NextAuthConfig } from "next-auth";

const SIETE_DIAS_SEGUNDOS = 7 * 24 * 60 * 60;

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
    verifyRequest: "/login/check-email",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.email = typeof token.email === "string" ? token.email : "";
        session.user.name = typeof token.name === "string" ? token.name : null;
      }
      return session;
    },
  },
  session: { strategy: "jwt", maxAge: SIETE_DIAS_SEGUNDOS },
} satisfies NextAuthConfig;
```

- [ ] **Paso 10: Escribir la instancia de NextAuth**

Crear `frontend/src/auth.ts`:

```typescript
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";

import { authConfig } from "@/auth.config";
import { isAllowed } from "@/lib/board/allowlist";
import { enviarMagicLink } from "@/lib/board/mailer";
import { prisma } from "@/lib/prisma";
import { logger } from "@/utils/logger";

if (!process.env.ALLOWED_EMAILS?.trim()) {
  // Fail-closed es correcto, pero silencioso: sin este aviso el síntoma es
  // un login que rebota sin explicación.
  logger.warn("ALLOWED_EMAILS vacía — ningún email puede entrar al board");
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
      async sendVerificationRequest({ identifier, url }) {
        await enviarMagicLink({ para: identifier, url });
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    signIn({ user }) {
      return isAllowed(user.email);
    },
  },
});
```

- [ ] **Paso 11: Exponer los handlers de Auth.js**

Crear `frontend/src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Paso 12: Escribir el formulario de login**

Crear `frontend/src/app/login/LoginForm.tsx`:

```typescript
"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import styles from "./login.module.css";

export function LoginForm({ errorInicial }: { errorInicial: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(
    errorInicial ? "No pudimos iniciar sesión con ese email." : null,
  );

  async function onSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const limpio = email.trim();
    if (!limpio) {
      setError("Ingresá tu email.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      // signIn con redirect:false NO tira ante un rechazo de auth: resuelve con
      // { error }. Y el server devuelve 200 aun con AccessDenied (el cliente manda
      // X-Auth-Return-Redirect: 1). Si no se inspecciona el resultado, un email
      // fuera de la allowlist y un fallo de Resend se muestran como éxito.
      const resultado = await signIn("resend", { email: limpio, redirect: false, callbackUrl: "/board" });
      if (resultado?.error) {
        // Mismo mensaje para "no autorizado" y "no existe": el form no es un
        // oráculo de la allowlist.
        setError("No pudimos iniciar sesión con ese email.");
        setEnviando(false);
        return;
      }
      router.push("/login/check-email");
    } catch {
      setError("No pudimos enviar el enlace. Intentá de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(evento) => void onSubmit(evento)}>
      <label className={styles.label} htmlFor="email">
        Tu email
      </label>
      <input
        id="email"
        className={styles.input}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(evento) => setEmail(evento.target.value)}
        disabled={enviando}
      />
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <button className={styles.boton} type="submit" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviarme el enlace"}
      </button>
    </form>
  );
}
```

- [ ] **Paso 13: Escribir la página de login y la de confirmación**

Crear `frontend/src/app/login/page.tsx` (server component: si ya hay sesión, no tiene sentido mostrar el form):

```typescript
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BrandMark } from "@/components/brand/BrandMark";

import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sesion = await auth();
  if (sesion) redirect("/board");
  const { error } = await searchParams;

  return (
    <main className={styles.shell}>
      <div className={styles.tarjeta}>
        <span className={styles.wordmark}>
          <BrandMark size={22} />
          Jurco
        </span>
        <h1 className={styles.titulo}>Board</h1>
        <p className={styles.subtitulo}>Te enviamos un enlace de acceso por correo.</p>
        <LoginForm errorInicial={error ?? null} />
      </div>
    </main>
  );
}
```

Crear `frontend/src/app/login/check-email/page.tsx`:

```typescript
import { BrandMark } from "@/components/brand/BrandMark";

import styles from "../login.module.css";

export default function CheckEmailPage() {
  return (
    <main className={styles.shell}>
      <div className={styles.tarjeta}>
        <span className={styles.wordmark}>
          <BrandMark size={22} />
          Jurco
        </span>
        <h1 className={styles.titulo}>Revisá tu correo</h1>
        <p className={styles.subtitulo}>
          Te mandamos un enlace de acceso. Es válido por 24 horas y se usa una sola vez.
        </p>
      </div>
    </main>
  );
}
```

Crear `frontend/src/app/login/login.module.css` consumiendo los tokens de `globals.css` (sin colores hardcodeados):

```css
.shell {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--space-6);
  background: var(--paper);
}

.tarjeta {
  width: 100%;
  max-width: 26rem;
  background: var(--surface);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-soft);
  padding: var(--space-8);
  text-align: center;
}

.wordmark {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-family-display);
  letter-spacing: var(--tracking-display);
  text-transform: uppercase;
  color: var(--navy);
}

.titulo {
  font-family: var(--font-family-display);
  font-size: var(--text-xl);
  color: var(--ink-900);
  margin-top: var(--space-4);
}

.subtitulo {
  font-size: var(--text-sm);
  color: var(--ink-500);
  margin-top: var(--space-2);
}

.form {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-6);
  text-align: left;
}

.label {
  font-size: var(--text-sm);
  color: var(--ink-700);
}

.input {
  font: inherit;
  padding: var(--space-3);
  border: 1px solid var(--ink-300);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink-900);
}

.boton {
  font: inherit;
  margin-top: var(--space-2);
  padding: var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--on-navy);
  cursor: pointer;
}

.boton:disabled {
  background: var(--ink-300);
  cursor: progress;
}

.error {
  font-size: var(--text-sm);
  color: var(--state-error);
}
```

- [ ] **Paso 14: Verificar el login punta a punta a mano**

Configurar en `frontend/.env`: `AUTH_SECRET` (generar con `npx auth secret`), `ALLOWED_EMAILS` con tu email, `RESEND_API_KEY` y `EMAIL_FROM` (la cuenta de Resend ya verificada de `~/observability`, con display name `Jurco <no-reply@…>`).

```bash
cd frontend && pnpm dev
```

Abrir `http://127.0.0.1:3000/login`, pedir el enlace, abrirlo desde el correo. Expected: redirige a `/board` (404 todavía — la ruta no existe hasta la Tarea 4; lo que se verifica es que la sesión se creó). Probar además con un email **fuera** de `ALLOWED_EMAILS`: expected, vuelve a `/login` con error.

**Si algo de NextAuth v5 no funciona sobre Next 16, es acá donde hay que resolverlo — no seguir a la Tarea 2 con el login a medias.**

- [ ] **Paso 15: Commit**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit --run
git add frontend/package.json frontend/pnpm-lock.yaml frontend/prisma frontend/src/auth.ts frontend/src/auth.config.ts frontend/src/lib/board frontend/src/app/api/auth frontend/src/app/login
git commit -m "feat(board): auth por email autorizado con magic link de Resend"
```

---

## Tarea 2: Proxy — cerrar el board sin cerrar el producto

**Files:**
- Create: `frontend/src/proxy.ts`, `frontend/tests/board-auth.spec.ts`
- Test: `frontend/tests/board-auth.spec.ts`

**Interfaces:**
- Consumes: `authConfig` de `@/auth.config` (Tarea 1)
- Produces: gate activo sobre `/board/*` y `/api/board/*`

- [ ] **Paso 1: Escribir el E2E de no-regresión (falla)**

Crear `frontend/tests/board-auth.spec.ts`. El primer test es el más importante del plan: protege el producto entero.

```typescript
import { expect, test } from "@playwright/test";

test("el chat público sigue abierto sin sesión", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByLabel("Escribí tu consulta")).toBeVisible();

  // El endpoint del chat no debe pedir sesión: un 401/302 acá es el producto caído.
  const respuesta = await request.post("/api/chat/stream", {
    data: { message: "hola" },
    failOnStatusCode: false,
  });
  expect(respuesta.status()).not.toBe(401);
  expect(respuesta.status()).not.toBe(302);

  const salud = await request.get("/api/health", { failOnStatusCode: false });
  expect(salud.status()).toBe(200);
});

test("/board sin sesión redirige a /login", async ({ page }) => {
  await page.goto("/board");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel("Tu email")).toBeVisible();
});

test("/api/board/* sin sesión responde 401", async ({ request }) => {
  const respuesta = await request.get("/api/board/metricas?rango=7d", { failOnStatusCode: false });
  expect(respuesta.status()).toBe(401);
});
```

- [ ] **Paso 2: Correr el E2E y verificar que falla**

Run: `pnpm test tests/board-auth.spec.ts`
Expected: FAIL — `/board` devuelve 404 en vez de redirigir; `/api/board/metricas` devuelve 404 en vez de 401.

- [ ] **Paso 3: Escribir el proxy**

Crear `frontend/src/proxy.ts`:

```typescript
import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Gate grueso del board. Next 16 renombró `middleware.ts` a `proxy.ts`:
 * con el nombre viejo este archivo no se ejecutaría y el board quedaría
 * abierto sin ningún error visible.
 *
 * El matcher cubre SOLO el board. El chat público (`/`, `/api/chat/*`,
 * `/api/health`) queda fuera a propósito.
 *
 * `/api/revision/*` también queda fuera, por dos razones: `POST
 * /api/revision/acceso` es el login del runner de escenarios (si exigiéramos
 * sesión ahí, el runner no podría autenticarse nunca), y su credencial es un
 * HMAC que se verifica con `node:crypto`, ausente en el runtime Edge. Esas
 * rutas se protegen en el handler con `getIdentidadBoard()`, que entiende
 * las dos credenciales.
 */
export default auth((request) => {
  if (request.auth) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const destino = new URL("/login", request.url);
  destino.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(destino);
});

export const config = {
  matcher: ["/board/:path*", "/api/board/:path*"],
};
```

- [ ] **Paso 4: Crear un stub de `/board` y del endpoint para que el E2E sea verificable**

Crear `frontend/src/app/board/page.tsx` (provisorio, lo reemplaza la Tarea 7):

```typescript
export default function BoardPage() {
  return <main>Board</main>;
}
```

Crear `frontend/src/app/api/board/metricas/route.ts` (provisorio, lo reemplaza la Tarea 7):

```typescript
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ pendiente: true });
}
```

- [ ] **Paso 5: Correr el E2E y verificar que pasa**

Run: `pnpm test tests/board-auth.spec.ts`
Expected: PASS — 3 tests. Si el primero falla, **parar**: el matcher está capturando el chat público.

- [ ] **Paso 6: Commit**

```bash
cd frontend && pnpm lint && pnpm typecheck
git add frontend/src/proxy.ts frontend/src/app/board frontend/src/app/api/board frontend/tests/board-auth.spec.ts
git commit -m "feat(board): gate de /board en proxy.ts sin tocar el chat público"
```

---

## Tarea 3: Identidad dual en `/api/revision/*`

**Files:**
- Create: `frontend/src/lib/board/identidad.ts`, `frontend/src/lib/board/identidad.test.ts`
- Modify: `frontend/src/app/api/revision/sesiones/route.ts`, `frontend/src/app/api/revision/sesiones/[id]/route.ts`, `frontend/src/app/api/revision/sesiones/[id]/notas/route.ts`, `frontend/src/app/api/revision/sesiones/[id]/mensajes/route.ts`, `frontend/src/app/api/revision/notas/[notaId]/route.ts`, `frontend/src/app/api/revision/notas/[notaId]/respuestas/route.ts`, `frontend/src/app/api/revision/sesiones/route.test.ts`, `frontend/src/app/api/revision/sesiones/[id]/route.test.ts`

**Interfaces:**
- Consumes: `auth()` de `@/auth` (Tarea 1) · `getExperto()` de `@/lib/revision/experto-cookie` (existente)
- Produces: `getIdentidadBoard(): Promise<IdentidadBoard | null>` donde `IdentidadBoard = { nombre: string; tipo: "humano" | "runner" }`

- [ ] **Paso 1: Escribir el test de identidad (falla)**

Crear `frontend/src/lib/board/identidad.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => authMock);

const expertoMock = vi.hoisted(() => ({ getExperto: vi.fn() }));
vi.mock("@/lib/revision/experto-cookie", () => expertoMock);

import { getIdentidadBoard } from "./identidad";

describe("getIdentidadBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.auth.mockResolvedValue(null);
    expertoMock.getExperto.mockResolvedValue(null);
  });

  it("con sesión Auth.js devuelve el nombre de la cuenta como humano", async () => {
    authMock.auth.mockResolvedValue({ user: { name: "Dra. García", email: "garcia@jurco.uy" } });
    expect(await getIdentidadBoard()).toEqual({ nombre: "Dra. García", tipo: "humano" });
  });

  it("sesión sin nombre cae al email", async () => {
    authMock.auth.mockResolvedValue({ user: { name: null, email: "garcia@jurco.uy" } });
    expect(await getIdentidadBoard()).toEqual({ nombre: "garcia@jurco.uy", tipo: "humano" });
  });

  it("sin sesión pero con cookie del runner devuelve tipo runner", async () => {
    expertoMock.getExperto.mockResolvedValue({ nombre: "Asistente técnico" });
    expect(await getIdentidadBoard()).toEqual({ nombre: "Asistente técnico", tipo: "runner" });
  });

  // La sesión humana gana: si alguien tiene ambas, la autoría real es la persona.
  it("con ambas credenciales prevalece la sesión Auth.js", async () => {
    authMock.auth.mockResolvedValue({ user: { name: "Dra. García", email: "garcia@jurco.uy" } });
    expertoMock.getExperto.mockResolvedValue({ nombre: "Asistente técnico" });
    expect(await getIdentidadBoard()).toEqual({ nombre: "Dra. García", tipo: "humano" });
  });

  it("sin ninguna credencial devuelve null", async () => {
    expect(await getIdentidadBoard()).toBeNull();
  });
});
```

- [ ] **Paso 2: Correr el test y verificar que falla**

Run: `pnpm test:unit --run src/lib/board/identidad.test.ts`
Expected: FAIL — "Failed to resolve import ./identidad"

- [ ] **Paso 3: Implementar `getIdentidadBoard`**

Crear `frontend/src/lib/board/identidad.ts`:

```typescript
import "server-only";

import { auth } from "@/auth";
import { getExperto } from "@/lib/revision/experto-cookie";

export interface IdentidadBoard {
  nombre: string;
  tipo: "humano" | "runner";
}

/**
 * Resuelve quién está operando el board. Dos credenciales válidas:
 * la sesión Auth.js de una persona, y la cookie firmada con REVISION_CLAVE
 * que usa el runner de escenarios (`pnpm escenario`), que no puede completar
 * un magic link. La sesión humana tiene prioridad para que la autoría
 * registrada en las notas sea la de la persona real.
 */
export async function getIdentidadBoard(): Promise<IdentidadBoard | null> {
  const sesion = await auth();
  const usuario = sesion?.user;
  if (usuario) {
    const nombre = usuario.name?.trim() || usuario.email?.trim();
    if (nombre) return { nombre, tipo: "humano" };
  }

  const runner = await getExperto();
  if (runner) return { nombre: runner.nombre, tipo: "runner" };

  return null;
}
```

- [ ] **Paso 4: Correr el test y verificar que pasa**

Run: `pnpm test:unit --run src/lib/board/identidad.test.ts`
Expected: PASS — 5 tests

- [ ] **Paso 5: Cambiar los seis handlers de revisión**

En cada uno de estos archivos, reemplazar el import y la llamada:

- `src/app/api/revision/sesiones/route.ts` (2 llamadas)
- `src/app/api/revision/sesiones/[id]/route.ts` (2 llamadas)
- `src/app/api/revision/sesiones/[id]/notas/route.ts` (1)
- `src/app/api/revision/sesiones/[id]/mensajes/route.ts` (1)
- `src/app/api/revision/notas/[notaId]/route.ts` (1)
- `src/app/api/revision/notas/[notaId]/respuestas/route.ts` (1)

Import viejo:

```typescript
import { getExperto } from "@/lib/revision/experto-cookie";
```

Import nuevo:

```typescript
import { getIdentidadBoard } from "@/lib/board/identidad";
```

Llamada vieja:

```typescript
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
```

Llamada nueva (el nombre de la variable no cambia, así que los usos de `experto.nombre` más abajo siguen compilando):

```typescript
    const experto = await getIdentidadBoard();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
```

`src/app/api/revision/acceso/route.ts` **no se toca**: sigue siendo el login del runner.

- [ ] **Paso 6: Adaptar los tests de handlers existentes**

En `src/app/api/revision/sesiones/route.test.ts` y `src/app/api/revision/sesiones/[id]/route.test.ts`, reemplazar el mock:

```typescript
const expertoMock = vi.hoisted(() => ({ getExperto: vi.fn() }));
vi.mock("@/lib/revision/experto-cookie", () => expertoMock);
```

por:

```typescript
const identidadMock = vi.hoisted(() => ({ getIdentidadBoard: vi.fn() }));
vi.mock("@/lib/board/identidad", () => identidadMock);
```

y en cada uso, `expertoMock.getExperto` pasa a ser `identidadMock.getIdentidadBoard`, con el valor resuelto ahora incluyendo `tipo`:

```typescript
    identidadMock.getIdentidadBoard.mockResolvedValue({ nombre: "Dra. García", tipo: "humano" });
```

- [ ] **Paso 7: Correr toda la suite unitaria**

Run: `pnpm test:unit --run`
Expected: PASS — sin regresiones en los tests de revisión.

- [ ] **Paso 8: Commit**

```bash
cd frontend && pnpm lint && pnpm typecheck
git add frontend/src/lib/board/identidad.ts frontend/src/lib/board/identidad.test.ts frontend/src/app/api/revision
git commit -m "feat(board): identidad dual en /api/revision (sesión o runner)"
```

---

## Tarea 4: Shell del board y mudanza de revisión

**Files:**
- Create: `frontend/src/app/board/layout.tsx`, `frontend/src/components/board/BoardShell/Sidebar.tsx`, `frontend/src/components/board/BoardShell/board.module.css`, `frontend/src/app/board/revision/page.tsx`
- Modify: `frontend/src/app/revision/page.tsx`, `frontend/tests/revision.spec.ts`
- Delete: `frontend/src/components/revision/AccesoForm.tsx`

**Interfaces:**
- Consumes: `auth()` de `@/auth` (Tarea 1) · `ListadoSesiones`, `SesionView` de `@/components/revision/*` (existentes, sin cambios)
- Produces: layout `/board` con sidebar; `/board/revision` operativa

- [ ] **Paso 1: Escribir el sidebar**

Crear `frontend/src/components/board/BoardShell/Sidebar.tsx`:

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand/BrandMark";

import styles from "./board.module.css";

const SECCIONES = [
  { href: "/board", etiqueta: "Métricas" },
  { href: "/board/chats", etiqueta: "Chats" },
  { href: "/board/revision", etiqueta: "Revisión" },
] as const;

export function Sidebar({ usuario }: { usuario: string }) {
  const pathname = usePathname();

  return (
    <nav className={styles.sidebar} aria-label="Secciones del board">
      <span className={styles.wordmark}>
        <BrandMark size={22} />
        Jurco
      </span>
      <ul className={styles.nav}>
        {SECCIONES.map((seccion) => {
          const activa =
            seccion.href === "/board" ? pathname === "/board" : pathname.startsWith(seccion.href);
          return (
            <li key={seccion.href}>
              <Link
                href={seccion.href}
                className={activa ? `${styles.link} ${styles.linkActivo}` : styles.link}
                aria-current={activa ? "page" : undefined}
              >
                {seccion.etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
      <span className={styles.usuario}>{usuario}</span>
    </nav>
  );
}
```

- [ ] **Paso 2: Escribir el CSS del shell**

El sidebar necesita un velo claro sobre el navy para el hover, y no existe token para eso. Agregarlo a `frontend/src/app/globals.css`, junto a `--on-navy-muted`:

```css
  --overlay-on-navy: rgb(255 255 255 / 8%);
```

Va como token y no como literal en el módulo porque `globals.css` es la fuente única de color del proyecto ("no se hardcodean colores ni tamaños en los CSS Modules", su propio encabezado) y porque un board con sidebar va a necesitar más de un estado sobre navy.

Crear `frontend/src/components/board/BoardShell/board.module.css`:

```css
.shell {
  display: grid;
  grid-template-columns: 15rem 1fr;
  min-height: 100dvh;
  background: var(--paper);
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-4);
  background: var(--navy);
  color: var(--on-navy);
}

.wordmark {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-family-display);
  letter-spacing: var(--tracking-display);
  text-transform: uppercase;
}

.nav {
  display: grid;
  gap: var(--space-1);
  list-style: none;
}

.link {
  display: block;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--on-navy-muted);
  text-decoration: none;
  font-size: var(--text-sm);
}

.link:hover {
  background: var(--overlay-on-navy);
  color: var(--on-navy);
}

.linkActivo {
  background: var(--accent);
  color: var(--on-navy);
}

.usuario {
  margin-top: auto;
  font-size: var(--text-xs);
  color: var(--on-navy-muted);
  word-break: break-all;
}

.contenido {
  padding: var(--space-8);
  overflow-x: auto;
}

@media (width <= 48rem) {
  .shell {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Paso 3: Escribir el layout con verificación server-side**

Crear `frontend/src/app/board/layout.tsx`. El `auth()` acá es defensa en profundidad: el proxy ya filtró, pero un fallo del matcher no debe alcanzar para exponer datos.

```typescript
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import { Sidebar } from "@/components/board/BoardShell/Sidebar";
import styles from "@/components/board/BoardShell/board.module.css";

export default async function BoardLayout({ children }: { children: ReactNode }) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  return (
    <div className={styles.shell}>
      <Sidebar usuario={sesion.user.name ?? sesion.user.email ?? ""} />
      <main className={styles.contenido}>{children}</main>
    </div>
  );
}
```

- [ ] **Paso 4: Mudar la revisión a `/board/revision`**

Crear `frontend/src/app/board/revision/page.tsx` con el contenido de `src/app/revision/page.tsx`, **sin** el estado `acceso` ni `AccesoForm` (la autenticación ya la resolvió el layout) y sin el header propio (lo da el shell):

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";

import { ListadoSesiones, type SesionResumen } from "@/components/revision/ListadoSesiones";
import { SesionView } from "@/components/revision/SesionView";
import styles from "@/components/revision/revision.module.css";

type Vista = { tipo: "cargando" } | { tipo: "listado" } | { tipo: "sesion"; id: string };

export default function BoardRevisionPage() {
  const [vista, setVista] = useState<Vista>({ tipo: "cargando" });
  const [sesiones, setSesiones] = useState<SesionResumen[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargarListado = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/revision/sesiones");
      if (!response.ok) {
        setError("No pudimos cargar las sesiones. Recargá la página.");
        setVista({ tipo: "listado" });
        return;
      }
      const payload = (await response.json()) as { sesiones: SesionResumen[] };
      setSesiones(payload.sesiones);
      setVista({ tipo: "listado" });
    } catch {
      setError("No pudimos cargar las sesiones. Recargá la página.");
      setVista({ tipo: "listado" });
    }
  }, []);

  useEffect(() => {
    // Wrapper inline: react-hooks/set-state-in-effect solo traza llamadas
    // directas a funciones referenciadas por identificador.
    void (async () => {
      await cargarListado();
    })();
  }, [cargarListado]);

  const crearSesion = useCallback(async (titulo: string) => {
    try {
      const response = await fetch("/api/revision/sesiones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(titulo ? { titulo } : {}),
      });
      if (!response.ok) {
        setError("No pudimos crear la sesión.");
        return;
      }
      const payload = (await response.json()) as { sesion: { id: string } };
      setVista({ tipo: "sesion", id: payload.sesion.id });
    } catch {
      setError("No pudimos crear la sesión.");
    }
  }, []);

  if (vista.tipo === "cargando") return null;

  return (
    <div className={`${styles.columna}${vista.tipo === "sesion" ? ` ${styles.columnaSesion}` : ""}`}>
      {vista.tipo === "listado" ? (
        <>
          <header className={styles.encabezado}>
            <h1 className={styles.titulo}>Sesiones de revisión</h1>
            <p className={styles.subtitulo}>Espacio compartido del equipo legal</p>
          </header>
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}
          <ListadoSesiones
            sesiones={sesiones}
            onAbrir={(id) => setVista({ tipo: "sesion", id })}
            onCrear={crearSesion}
          />
        </>
      ) : (
        <SesionView id={vista.id} onVolver={() => void cargarListado()} />
      )}
    </div>
  );
}
```

- [ ] **Paso 5: Reemplazar `/revision` por un redirect y borrar `AccesoForm`**

Reemplazar el contenido completo de `frontend/src/app/revision/page.tsx`:

```typescript
import { redirect } from "next/navigation";

/** La revisión vive dentro del board desde 2026-08-01; el acceso es la sesión del board. */
export default function RevisionPage() {
  redirect("/board/revision");
}
```

```bash
rm frontend/src/components/revision/AccesoForm.tsx
```

- [ ] **Paso 6: Adaptar el E2E de revisión**

En `frontend/tests/revision.spec.ts`, reemplazar el bloque de acceso por clave. Sustituir estas líneas:

```typescript
const CLAVE = process.env.REVISION_CLAVE ?? "";

test.skip(!CLAVE, "REVISION_CLAVE no seteada — E2E de revisión deshabilitado");

test("ciclo de revisión: acceso → sesión → chat → nota inline → responder → resolver", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/revision");

  await page.getByLabel("Tu nombre").fill("Dra. E2E");
  await page.getByLabel("Clave de acceso").fill(CLAVE);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByRole("heading", { name: "Sesiones de revisión" })).toBeVisible();
```

por:

```typescript
const CLAVE = process.env.REVISION_CLAVE ?? "";

test.skip(!CLAVE, "REVISION_CLAVE no seteada — E2E de revisión deshabilitado");

test("ciclo de revisión: sesión → chat → nota inline → responder → resolver", async ({ page }) => {
  test.setTimeout(120_000);

  await iniciarSesionBoard(page);
  await page.goto("/board/revision");

  await expect(page.getByRole("heading", { name: "Sesiones de revisión" })).toBeVisible();
```

y agregar el import del helper arriba: `import { iniciarSesionBoard } from "./helpers/sesion-board";`

**Por qué un helper y no la credencial del runner.** `/board/*` está detrás del proxy, que exige una **sesión NextAuth**. La cookie `ls_experto` del runner solo la entienden los handlers de `/api/revision/*` — y eso es correcto por diseño: `pnpm escenario` habla con la API, nunca carga páginas. Pero este E2E sí maneja el browser, así que necesita una sesión de verdad. La acuña directo con `encode` de `next-auth/jwt`, que es el patrón estándar para testear apps protegidas con Auth.js.

Crear `frontend/tests/helpers/sesion-board.ts`:

```typescript
import type { Page } from "@playwright/test";
import { encode } from "next-auth/jwt";

/** El salt de Auth.js v5 ES el nombre de la cookie. Sin prefijo __Secure en HTTP local. */
const COOKIE_SESION = "authjs.session-token";

/**
 * Deja a `page` con una sesión del board ya iniciada, sin pasar por el magic
 * link (que necesitaría un inbox). Requiere que AUTH_SECRET sea el mismo que
 * usa el dev server — Playwright lo levanta con `pnpm dev`, que lee el mismo
 * `.env`, así que coinciden.
 */
export async function iniciarSesionBoard(page: Page, email = "e2e@jurco.uy"): Promise<void> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET no está seteada — el helper no puede acuñar la sesión");

  const token = await encode({
    token: { email, name: "Dra. E2E" },
    secret,
    salt: COOKIE_SESION,
  });

  await page.context().addCookies([
    { name: COOKIE_SESION, value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
}
```

El `test.skip` de arriba del archivo pasa a cubrir las dos env que el test necesita:

```typescript
const CLAVE = process.env.REVISION_CLAVE ?? "";
const SECRETO = process.env.AUTH_SECRET ?? "";

test.skip(!CLAVE || !SECRETO, "Faltan REVISION_CLAVE o AUTH_SECRET — E2E de revisión deshabilitado");
```

- [ ] **Paso 7: Correr los E2E**

Run: `pnpm test tests/revision.spec.ts tests/board-auth.spec.ts`
Expected: PASS. El ciclo de revisión completo funciona desde `/board/revision`.

- [ ] **Paso 8: Commit**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit --run
git add frontend/src/app/board frontend/src/app/revision frontend/src/components/board frontend/src/components/revision frontend/tests/revision.spec.ts
git commit -m "feat(board): shell con sidebar y revisión mudada a /board/revision"
```

---

## Tarea 5: Alcance de métricas, índice y funnel

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create: `frontend/src/lib/board/rango.ts`, `frontend/src/lib/board/rango.test.ts`, `frontend/src/lib/board/scope.ts`, `frontend/src/lib/board/metricas-funnel.ts`, `frontend/src/lib/board/metricas-funnel.test.ts`

**Interfaces:**
- Produces:
  - `type Rango = "7d" | "30d" | "90d" | "todo"` · `rangoSchema: z.ZodEnum` · `fechaDesde(rango: Rango, ahora: Date): Date | null`
  - `conversacionesReales(desde: Date | null): Prisma.ConversationWhereInput` · `JOIN_REALES: Prisma.Sql`
  - `interface Funnel { iniciadas: number; clasificadas: number; conCaso: number; captadas: number; fueraDeCobertura: number }`
  - `interface DemandaCategoria { categoria: string; conversaciones: number }`
  - `interface PedidoFueraDeCobertura { conversationId: string; fecha: string; resumen: string | null }`
  - `interface Demanda { categorias: DemandaCategoria[]; subcategorias: { subcategoria: string; casos: number }[]; fueraDeCobertura: PedidoFueraDeCobertura[] }`
  - `calcularFunnel(desde: Date | null): Promise<Funnel>` · `calcularDemanda(desde: Date | null): Promise<Demanda>`

- [ ] **Paso 1: Agregar el índice a `Conversation`**

En `frontend/prisma/schema.prisma`, dentro del modelo `Conversation`, agregar después de la línea `notas NotaRevision[]`:

```prisma
  @@index([esRevision, createdAt(sort: Desc)])
```

```bash
cd frontend && pnpm prisma migrate dev --name indice-conversaciones-board
```

- [ ] **Paso 2: Escribir el test del rango (falla)**

Crear `frontend/src/lib/board/rango.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { fechaDesde, rangoSchema } from "./rango";

const AHORA = new Date("2026-08-01T12:00:00.000Z");

describe("fechaDesde", () => {
  it("7d resta siete días", () => {
    expect(fechaDesde("7d", AHORA)!.toISOString()).toBe("2026-07-25T12:00:00.000Z");
  });

  it("30d resta treinta días", () => {
    expect(fechaDesde("30d", AHORA)!.toISOString()).toBe("2026-07-02T12:00:00.000Z");
  });

  it("90d resta noventa días", () => {
    expect(fechaDesde("90d", AHORA)!.toISOString()).toBe("2026-05-03T12:00:00.000Z");
  });

  it("todo devuelve null (sin cota inferior)", () => {
    expect(fechaDesde("todo", AHORA)).toBeNull();
  });
});

describe("rangoSchema", () => {
  it("acepta los cuatro valores", () => {
    expect(rangoSchema.parse("7d")).toBe("7d");
    expect(rangoSchema.parse("todo")).toBe("todo");
  });

  it("rechaza un valor desconocido", () => {
    expect(rangoSchema.safeParse("1d").success).toBe(false);
  });
});
```

- [ ] **Paso 3: Correr el test y verificar que falla**

Run: `pnpm test:unit --run src/lib/board/rango.test.ts`
Expected: FAIL — "Failed to resolve import ./rango"

- [ ] **Paso 4: Implementar el rango**

Crear `frontend/src/lib/board/rango.ts`:

```typescript
import { z } from "zod";

export const rangoSchema = z.enum(["7d", "30d", "90d", "todo"]);
export type Rango = z.infer<typeof rangoSchema>;

const DIAS_POR_RANGO: Record<Exclude<Rango, "todo">, number> = { "7d": 7, "30d": 30, "90d": 90 };
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** `null` = sin cota inferior (rango "todo"). `ahora` es inyectable para tests. */
export function fechaDesde(rango: Rango, ahora: Date = new Date()): Date | null {
  if (rango === "todo") return null;
  return new Date(ahora.getTime() - DIAS_POR_RANGO[rango] * MS_POR_DIA);
}
```

- [ ] **Paso 5: Correr el test y verificar que pasa**

Run: `pnpm test:unit --run src/lib/board/rango.test.ts`
Expected: PASS — 6 tests

- [ ] **Paso 6: Escribir el alcance (helper del invariante)**

Crear `frontend/src/lib/board/scope.ts`:

```typescript
import "server-only";

import { Prisma } from "@prisma/client";

/**
 * Alcance de TODA métrica de negocio: solo conversaciones de consultantes
 * reales. Las sesiones de revisión (`esRevision`) son pruebas del equipo
 * legal y corridas del runner de escenarios; contarlas infla el funnel y el
 * costo reportado. El flag cubre también los borradores, porque las corridas
 * autónomas se crean como sesiones de revisión.
 */
export function conversacionesReales(desde: Date | null): Prisma.ConversationWhereInput {
  return { esRevision: false, ...(desde ? { createdAt: { gte: desde } } : {}) };
}

/**
 * Alcance para queries que parten de `Caso` en vez de `Conversation`. Compone
 * sobre `conversacionesReales` en vez de repetir la condición: si algún día
 * "real" pasa a significar algo más, este helper lo hereda solo.
 */
export function casosReales(desde: Date | null): Prisma.CasoWhereInput {
  return {
    conversation: conversacionesReales(null),
    ...(desde ? { createdAt: { gte: desde } } : {}),
  };
}

/**
 * Mismo alcance para SQL crudo sobre el schema `mastra`, que no conoce el
 * flag. Requiere que la tabla de spans o mensajes esté aliasada como `s`.
 */
export const JOIN_REALES = Prisma.sql`
  JOIN public."Conversation" c
    ON c."threadId" = s."threadId"
   AND c."esRevision" = false
`;

/**
 * Alcance para SQL crudo que parte de `Caso`. Requiere los alias `caso` y
 * `conv`. Existe para que ninguna query escriba la condición a mano: la
 * duplicación es justamente el modo de falla que este módulo previene.
 */
export const JOIN_CASO_REAL = Prisma.sql`
  JOIN "Conversation" conv
    ON conv.id = caso."conversationId"
   AND conv."esRevision" = false
`;
```

**Regla del módulo:** ninguna query del board escribe `esRevision` a mano. Si ninguno de los cuatro helpers encaja, el arreglo es agregar un helper acá — no inlinear la condición en el call site. La condición vive en un solo archivo o no sirve de nada.

- [ ] **Paso 7: Escribir el test del funnel (falla)**

Crear `frontend/src/lib/board/metricas-funnel.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    conversation: { count: vi.fn(), groupBy: vi.fn() },
    caso: { count: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => prismaMock);

import { calcularDemanda, calcularFunnel } from "./metricas-funnel";

const DESDE = new Date("2026-07-25T00:00:00.000Z");

describe("calcularFunnel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.conversation.count.mockResolvedValue(0);
    prismaMock.prisma.caso.count.mockResolvedValue(0);
  });

  it("devuelve las cinco etapas", async () => {
    prismaMock.prisma.conversation.count
      .mockResolvedValueOnce(100) // iniciadas
      .mockResolvedValueOnce(80) // clasificadas
      .mockResolvedValueOnce(60); // con caso
    prismaMock.prisma.caso.count
      .mockResolvedValueOnce(25) // captadas
      .mockResolvedValueOnce(10); // fuera de cobertura

    expect(await calcularFunnel(DESDE)).toEqual({
      iniciadas: 100,
      clasificadas: 80,
      conCaso: 60,
      captadas: 25,
      fueraDeCobertura: 10,
    });
  });

  // El invariante del spec §4.1: sin esto, las pruebas del equipo legal y las
  // corridas de `pnpm escenario` inflan cada número del board.
  it("toda etapa filtra por esRevision:false", async () => {
    await calcularFunnel(DESDE);

    for (const llamada of prismaMock.prisma.conversation.count.mock.calls) {
      expect(llamada[0].where).toMatchObject({ esRevision: false });
    }
    for (const llamada of prismaMock.prisma.caso.count.mock.calls) {
      expect(llamada[0].where.conversation).toMatchObject({ esRevision: false });
    }
  });

  it("rango 'todo' (desde null) no aplica cota de fecha", async () => {
    await calcularFunnel(null);
    const primera = prismaMock.prisma.conversation.count.mock.calls[0][0];
    expect(primera.where.createdAt).toBeUndefined();
    expect(primera.where.esRevision).toBe(false);
  });
});

describe("calcularDemanda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.conversation.groupBy.mockResolvedValue([
      { categoria: "laboral", _count: { _all: 40 } },
      { categoria: "familia", _count: { _all: 12 } },
    ]);
    prismaMock.prisma.$queryRaw.mockResolvedValue([{ subcategoria: "despido", casos: 30 }]);
    prismaMock.prisma.caso.findMany.mockResolvedValue([
      {
        conversationId: "c1",
        createdAt: new Date("2026-07-30T10:00:00.000Z"),
        resumen: { brief: "Consulta sobre sucesiones" },
      },
    ]);
  });

  it("agrupa categorías y descarta la categoría nula", async () => {
    prismaMock.prisma.conversation.groupBy.mockResolvedValue([
      { categoria: "laboral", _count: { _all: 40 } },
      { categoria: null, _count: { _all: 7 } },
    ]);
    const demanda = await calcularDemanda(DESDE);
    expect(demanda.categorias).toEqual([{ categoria: "laboral", conversaciones: 40 }]);
  });

  it("lista los pedidos fuera de cobertura con su resumen, no solo el conteo", async () => {
    const demanda = await calcularDemanda(DESDE);
    expect(demanda.fueraDeCobertura).toEqual([
      {
        conversationId: "c1",
        fecha: "2026-07-30T10:00:00.000Z",
        resumen: "Consulta sobre sucesiones",
      },
    ]);
  });

  // Mismo guard que el del funnel: la demanda también es métrica de negocio.
  it("las queries de Prisma filtran por esRevision:false", async () => {
    await calcularDemanda(DESDE);
    expect(prismaMock.prisma.conversation.groupBy.mock.calls[0][0].where).toMatchObject({
      esRevision: false,
    });
    expect(prismaMock.prisma.caso.findMany.mock.calls[0][0].where.conversation).toMatchObject({
      esRevision: false,
    });
  });

  // El SQL crudo no lo ejecuta ningún test (Prisma está mockeado), así que al
  // menos se asegura que el fragmento con el join scopeado esté presente: sin
  // esto, borrar el JOIN_CASO_REAL no rompería nada visible.
  it("el SQL de subcategorías usa el join scopeado", async () => {
    await calcularDemanda(DESDE);
    const sql = JSON.stringify(prismaMock.prisma.$queryRaw.mock.calls[0]);
    expect(sql).toContain("esRevision");
  });
});
```

- [ ] **Paso 8: Correr el test y verificar que falla**

Run: `pnpm test:unit --run src/lib/board/metricas-funnel.test.ts`
Expected: FAIL — "Failed to resolve import ./metricas-funnel"

- [ ] **Paso 9: Implementar funnel y demanda**

Crear `frontend/src/lib/board/metricas-funnel.ts`:

```typescript
import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { casosReales, conversacionesReales, JOIN_CASO_REAL } from "./scope";

export interface Funnel {
  iniciadas: number;
  clasificadas: number;
  conCaso: number;
  captadas: number;
  fueraDeCobertura: number;
}

export interface DemandaCategoria {
  categoria: string;
  conversaciones: number;
}

export interface DemandaSubcategoria {
  subcategoria: string;
  casos: number;
}

export interface PedidoFueraDeCobertura {
  conversationId: string;
  fecha: string;
  resumen: string | null;
}

export interface Demanda {
  categorias: DemandaCategoria[];
  subcategorias: DemandaSubcategoria[];
  fueraDeCobertura: PedidoFueraDeCobertura[];
}

const LIMITE_FUERA_DE_COBERTURA = 50;

export async function calcularFunnel(desde: Date | null): Promise<Funnel> {
  const [iniciadas, clasificadas, conCaso, captadas, fueraDeCobertura] = await Promise.all([
    prisma.conversation.count({ where: conversacionesReales(desde) }),
    prisma.conversation.count({
      where: { ...conversacionesReales(desde), categoria: { not: null } },
    }),
    prisma.conversation.count({ where: { ...conversacionesReales(desde), caso: { isNot: null } } }),
    prisma.caso.count({ where: { ...casosReales(desde), estado: "CAPTADO" } }),
    prisma.caso.count({ where: { ...casosReales(desde), estado: "FUERA_DE_COBERTURA" } }),
  ]);

  return { iniciadas, clasificadas, conCaso, captadas, fueraDeCobertura };
}

const filaSubcategoriaSchema = z.object({
  subcategoria: z.string(),
  casos: z.coerce.number(),
});

/** El brief fáctico que dejó `registrar-caso`; shapes desconocidos → null. */
function extraerResumen(resumen: unknown): string | null {
  if (typeof resumen === "string") return resumen;
  if (resumen && typeof resumen === "object" && "brief" in resumen) {
    const brief = (resumen as { brief: unknown }).brief;
    if (typeof brief === "string") return brief;
  }
  return null;
}

export async function calcularDemanda(desde: Date | null): Promise<Demanda> {
  const [porCategoria, porSubcategoria, pedidos] = await Promise.all([
    prisma.conversation.groupBy({
      by: ["categoria"],
      where: conversacionesReales(desde),
      _count: { _all: true },
    }),
    prisma.$queryRaw`
      SELECT sub AS subcategoria, COUNT(*)::float8 AS casos
      FROM "Caso" caso
      ${JOIN_CASO_REAL}
      CROSS JOIN LATERAL unnest(caso.subcategorias) AS sub
      WHERE (${desde}::timestamptz IS NULL OR caso."createdAt" >= ${desde}::timestamptz)
      GROUP BY sub
      ORDER BY casos DESC`,
    prisma.caso.findMany({
      where: { ...casosReales(desde), estado: "FUERA_DE_COBERTURA" },
      select: { conversationId: true, createdAt: true, resumen: true },
      orderBy: { createdAt: "desc" },
      take: LIMITE_FUERA_DE_COBERTURA,
    }),
  ]);

  return {
    categorias: porCategoria
      .filter((fila): fila is typeof fila & { categoria: string } => fila.categoria !== null)
      .map((fila) => ({ categoria: fila.categoria, conversaciones: fila._count._all }))
      .sort((a, b) => b.conversaciones - a.conversaciones),
    subcategorias: filaSubcategoriaSchema.array().parse(porSubcategoria),
    fueraDeCobertura: pedidos.map((pedido) => ({
      conversationId: pedido.conversationId,
      fecha: pedido.createdAt.toISOString(),
      resumen: extraerResumen(pedido.resumen),
    })),
  };
}
```

- [ ] **Paso 10: Correr el test y verificar que pasa**

Run: `pnpm test:unit --run src/lib/board/metricas-funnel.test.ts`
Expected: PASS — 5 tests

- [ ] **Paso 11: Ejecutar el SQL crudo contra la base real**

Los tests mockean Prisma, así que el string SQL de `calcularDemanda` nunca llega a Postgres — es la única pieza del archivo que TypeScript no cubre, y un SQL plausible-pero-mal es exactamente lo que se escapa por ahí. Con `DATABASE_URL` seteada:

```bash
cd frontend
pnpm tsx --conditions=react-server -e "import('./src/lib/board/metricas-funnel.ts').then(async (m) => { console.info(JSON.stringify(await m.calcularDemanda(null))); console.info(JSON.stringify(await m.calcularFunnel(null))); process.exit(0); })"
```

Expected: dos objetos JSON, sin excepción. Un `operator does not exist`, un `column ... does not exist` o un `syntax error at or near` significa que el SQL está mal — corregirlo contra `lib/revision/timeline.ts`, que tiene los nombres de columna verificados en vivo. Pegar la salida en el reporte: es la única evidencia de que la query corre.

- [ ] **Paso 12: Commit**

```bash
cd frontend && pnpm lint && pnpm typecheck
git add frontend/prisma frontend/src/lib/board/rango.ts frontend/src/lib/board/rango.test.ts frontend/src/lib/board/scope.ts frontend/src/lib/board/metricas-funnel.ts frontend/src/lib/board/metricas-funnel.test.ts
git commit -m "feat(board): funnel de captación y demanda por categoría"
```

---

## Tarea 6: Costo, performance y volumen

**Files:**
- Create: `frontend/src/lib/board/costos.ts`, `frontend/src/lib/board/costos.test.ts`, `frontend/src/lib/board/metricas-agente.ts`, `frontend/src/lib/board/metricas-agente.test.ts`

**Interfaces:**
- Consumes: `JOIN_REALES` de `./scope` (Tarea 5)
- Produces:
  - `estimarCostoUsd(modelo: string, tokensEntrada: number, tokensSalida: number): number | null`
  - `interface UsoModelo { modelo: string; tokensEntrada: number; tokensSalida: number; costoUsd: number | null }`
  - `interface UsoTool { tool: string; llamadas: number }`
  - `interface Latencia { p50Ms: number; p95Ms: number }`
  - `interface PuntoSerie { fecha: string; valor: number }`
  - `interface FranjaHoraria { hora: number; conversaciones: number }`
  - `interface Volumen { porDia: PuntoSerie[]; porHora: FranjaHoraria[]; mensajesPorConversacion: number; tasaAbandono: number }`
  - `calcularAgente(desde: Date | null): Promise<{ modelos: UsoModelo[]; tools: UsoTool[]; latencia: Latencia }>`
  - `calcularVolumen(desde: Date | null): Promise<Volumen>`

- [ ] **Paso 1: Escribir el test de costos (falla)**

Crear `frontend/src/lib/board/costos.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { estimarCostoUsd } from "./costos";

describe("estimarCostoUsd", () => {
  it("calcula el costo de un modelo conocido", () => {
    // gemini-3-flash: 0.30 USD por millón de entrada, 2.50 por millón de salida.
    expect(estimarCostoUsd("google/gemini-3-flash", 1_000_000, 1_000_000)).toBeCloseTo(2.8, 5);
  });

  it("acepta el id de modelo sin el prefijo del proveedor", () => {
    expect(estimarCostoUsd("gemini-3-flash", 1_000_000, 0)).toBeCloseTo(0.3, 5);
  });

  // Un modelo desconocido debe reportar "sin dato", NUNCA costo cero: si algún
  // día se cambia de modelo, un 0 silencioso se lee como "es gratis".
  it("modelo desconocido devuelve null, no cero", () => {
    expect(estimarCostoUsd("openai/gpt-9", 1_000_000, 1_000_000)).toBeNull();
  });

  it("cero tokens con modelo conocido cuesta cero", () => {
    expect(estimarCostoUsd("google/gemini-3-flash", 0, 0)).toBe(0);
  });
});
```

- [ ] **Paso 2: Correr el test y verificar que falla**

Run: `pnpm test:unit --run src/lib/board/costos.test.ts`
Expected: FAIL — "Failed to resolve import ./costos"

- [ ] **Paso 3: Implementar la tabla de costos**

Crear `frontend/src/lib/board/costos.ts`:

```typescript
/**
 * Precios por millón de tokens, en USD. Tabla al 2026-08-01 — verificar
 * contra el proveedor al cambiar de modelo.
 *
 * Un modelo ausente devuelve `null` (sin dato) y nunca 0: reportar costo cero
 * para un modelo desconocido esconde exactamente el evento que interesa ver.
 */
const PRECIOS_POR_MILLON: Record<string, { entrada: number; salida: number }> = {
  "gemini-3-flash": { entrada: 0.3, salida: 2.5 },
  "gemini-embedding-001": { entrada: 0.15, salida: 0 },
};

const UN_MILLON = 1_000_000;

/** Normaliza `google/gemini-3-flash` y `gemini-3-flash` a la misma clave. */
function normalizar(modelo: string): string {
  const partes = modelo.split("/");
  return (partes[partes.length - 1] ?? modelo).trim().toLowerCase();
}

export function estimarCostoUsd(
  modelo: string,
  tokensEntrada: number,
  tokensSalida: number,
): number | null {
  const precio = PRECIOS_POR_MILLON[normalizar(modelo)];
  if (!precio) return null;
  return (
    (tokensEntrada / UN_MILLON) * precio.entrada + (tokensSalida / UN_MILLON) * precio.salida
  );
}
```

- [ ] **Paso 4: Correr el test y verificar que pasa**

Run: `pnpm test:unit --run src/lib/board/costos.test.ts`
Expected: PASS — 4 tests

- [ ] **Paso 5: Escribir el test de métricas del agente (falla)**

Crear `frontend/src/lib/board/metricas-agente.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock("@/lib/prisma", () => prismaMock);

import { calcularAgente, calcularVolumen } from "./metricas-agente";

const DESDE = new Date("2026-07-25T00:00:00.000Z");

describe("calcularAgente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.$queryRaw
      .mockResolvedValueOnce([
        { modelo: "google/gemini-3-flash", tokensEntrada: 2_000_000, tokensSalida: 500_000 },
      ])
      .mockResolvedValueOnce([{ tool: "buscar-documentos", llamadas: 120 }])
      .mockResolvedValueOnce([{ p50Ms: 1800, p95Ms: 7400 }]);
  });

  it("adjunta el costo estimado a cada modelo", async () => {
    const agente = await calcularAgente(DESDE);
    expect(agente.modelos[0]).toEqual({
      modelo: "google/gemini-3-flash",
      tokensEntrada: 2_000_000,
      tokensSalida: 500_000,
      costoUsd: 0.3 * 2 + 2.5 * 0.5,
    });
  });

  it("devuelve tools y latencia", async () => {
    const agente = await calcularAgente(DESDE);
    expect(agente.tools).toEqual([{ tool: "buscar-documentos", llamadas: 120 }]);
    expect(agente.latencia).toEqual({ p50Ms: 1800, p95Ms: 7400 });
  });

  it("sin spans devuelve latencia en cero en vez de romper", async () => {
    vi.clearAllMocks();
    prismaMock.prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const agente = await calcularAgente(DESDE);
    expect(agente.latencia).toEqual({ p50Ms: 0, p95Ms: 0 });
  });
});

describe("calcularVolumen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.$queryRaw
      .mockResolvedValueOnce([{ fecha: "2026-07-30", valor: 12 }])
      .mockResolvedValueOnce([{ hora: 14, conversaciones: 9 }])
      .mockResolvedValueOnce([{ mensajesPorConversacion: 6.4, tasaAbandono: 0.25 }]);
  });

  it("devuelve la serie diaria, la franja horaria y los agregados", async () => {
    expect(await calcularVolumen(DESDE)).toEqual({
      porDia: [{ fecha: "2026-07-30", valor: 12 }],
      porHora: [{ hora: 14, conversaciones: 9 }],
      mensajesPorConversacion: 6.4,
      tasaAbandono: 0.25,
    });
  });

  it("sin datos devuelve ceros en vez de romper", async () => {
    vi.clearAllMocks();
    prismaMock.prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    expect(await calcularVolumen(DESDE)).toEqual({
      porDia: [],
      porHora: [],
      mensajesPorConversacion: 0,
      tasaAbandono: 0,
    });
  });
});
```

- [ ] **Paso 6: Correr el test y verificar que falla**

Run: `pnpm test:unit --run src/lib/board/metricas-agente.test.ts`
Expected: FAIL — "Failed to resolve import ./metricas-agente"

- [ ] **Paso 7: Implementar las métricas del agente**

Crear `frontend/src/lib/board/metricas-agente.ts`.

**Gotcha 1:** `SUM()` sobre un entero en Postgres devuelve `bigint`, y Prisma lo mapea a `BigInt` de JS, que hace explotar `JSON.stringify`. Todo agregado numérico va casteado a `::float8`.

**Gotcha 2 — zona horaria.** `Conversation.createdAt` es `timestamp without time zone` guardando hora UTC, y la sesión de Postgres corre en `Etc/UTC`. Agrupar sobre la columna cruda deja las series **corridas 3 horas**: el gráfico "consultas por hora del día" mentiría sistemáticamente, y toda conversación entre las 21:00 y las 23:59 de Uruguay caería en el día siguiente. Por eso el bucketing convierte con `(c."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Montevideo'`. La conversión va solo en el `SELECT`/`GROUP BY`, nunca en el `WHERE`: ahí impediría usar el índice `[esRevision, createdAt]`, y un corrimiento de 3 horas en el borde de una ventana de 7 o 30 días no cambia nada.

```typescript
import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { estimarCostoUsd } from "./costos";
import { JOIN_REALES } from "./scope";

export interface UsoModelo {
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number | null;
}

export interface UsoTool {
  tool: string;
  llamadas: number;
}

export interface Latencia {
  p50Ms: number;
  p95Ms: number;
}

export interface PuntoSerie {
  fecha: string;
  valor: number;
}

export interface FranjaHoraria {
  hora: number;
  conversaciones: number;
}

export interface Volumen {
  porDia: PuntoSerie[];
  porHora: FranjaHoraria[];
  mensajesPorConversacion: number;
  tasaAbandono: number;
}

const filaModeloSchema = z.object({
  modelo: z.string(),
  tokensEntrada: z.coerce.number(),
  tokensSalida: z.coerce.number(),
});

const filaToolSchema = z.object({ tool: z.string(), llamadas: z.coerce.number() });
const filaLatenciaSchema = z.object({ p50Ms: z.coerce.number(), p95Ms: z.coerce.number() });
const filaSerieSchema = z.object({ fecha: z.string(), valor: z.coerce.number() });
const filaHoraSchema = z.object({ hora: z.coerce.number(), conversaciones: z.coerce.number() });
const filaVolumenSchema = z.object({
  mensajesPorConversacion: z.coerce.number(),
  tasaAbandono: z.coerce.number(),
});

export async function calcularAgente(
  desde: Date | null,
): Promise<{ modelos: UsoModelo[]; tools: UsoTool[]; latencia: Latencia }> {
  const [modelosRaw, toolsRaw, latenciaRaw] = await Promise.all([
    prisma.$queryRaw`
      SELECT COALESCE(s.attributes->>'model', 'desconocido') AS modelo,
             COALESCE(SUM((s.attributes->'usage'->>'inputTokens')::numeric), 0)::float8 AS "tokensEntrada",
             COALESCE(SUM((s.attributes->'usage'->>'outputTokens')::numeric), 0)::float8 AS "tokensSalida"
      FROM mastra.mastra_ai_spans s
      ${JOIN_REALES}
      WHERE s."spanType" = 'model_generation'
        AND (${desde}::timestamptz IS NULL OR s."startedAt" >= ${desde}::timestamptz)
      GROUP BY 1
      ORDER BY "tokensEntrada" DESC`,
    prisma.$queryRaw`
      SELECT s.name AS tool, COUNT(*)::float8 AS llamadas
      FROM mastra.mastra_ai_spans s
      ${JOIN_REALES}
      WHERE s."spanType" = 'tool_call'
        AND (${desde}::timestamptz IS NULL OR s."startedAt" >= ${desde}::timestamptz)
      GROUP BY 1
      ORDER BY llamadas DESC`,
    prisma.$queryRaw`
      SELECT COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (s."endedAt" - s."startedAt")) * 1000), 0)::float8 AS "p50Ms",
             COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (s."endedAt" - s."startedAt")) * 1000), 0)::float8 AS "p95Ms"
      FROM mastra.mastra_ai_spans s
      ${JOIN_REALES}
      WHERE s."spanType" = 'agent_run'
        AND s."endedAt" IS NOT NULL
        AND (${desde}::timestamptz IS NULL OR s."startedAt" >= ${desde}::timestamptz)`,
  ]);

  const modelos = filaModeloSchema
    .array()
    .parse(modelosRaw)
    .map((fila) => ({
      ...fila,
      costoUsd: estimarCostoUsd(fila.modelo, fila.tokensEntrada, fila.tokensSalida),
    }));

  const latencia = filaLatenciaSchema.array().parse(latenciaRaw)[0] ?? { p50Ms: 0, p95Ms: 0 };

  return { modelos, tools: filaToolSchema.array().parse(toolsRaw), latencia };
}

export async function calcularVolumen(desde: Date | null): Promise<Volumen> {
  const [porDiaRaw, porHoraRaw, agregadosRaw] = await Promise.all([
    prisma.$queryRaw`
      SELECT to_char(
               (c."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Montevideo',
               'YYYY-MM-DD'
             ) AS fecha,
             COUNT(*)::float8 AS valor
      FROM "Conversation" c
      WHERE c."esRevision" = false
        AND (${desde}::timestamptz IS NULL OR c."createdAt" >= ${desde}::timestamptz)
      GROUP BY 1
      ORDER BY 1 ASC`,
    prisma.$queryRaw`
      SELECT EXTRACT(
               HOUR FROM (c."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Montevideo'
             )::float8 AS hora,
             COUNT(*)::float8 AS conversaciones
      FROM "Conversation" c
      WHERE c."esRevision" = false
        AND (${desde}::timestamptz IS NULL OR c."createdAt" >= ${desde}::timestamptz)
      GROUP BY 1
      ORDER BY 1 ASC`,
    prisma.$queryRaw`
      WITH por_conversacion AS (
        SELECT c.id,
               COUNT(s.id) FILTER (WHERE s.role = 'user')::float8 AS mensajes_usuario,
               COUNT(s.id)::float8 AS mensajes
        FROM "Conversation" c
        LEFT JOIN mastra.mastra_messages s ON s.thread_id = c."threadId"
        WHERE c."esRevision" = false
          AND (${desde}::timestamptz IS NULL OR c."createdAt" >= ${desde}::timestamptz)
        GROUP BY c.id
      )
      SELECT COALESCE(AVG(mensajes), 0)::float8 AS "mensajesPorConversacion",
             COALESCE(
               COUNT(*) FILTER (WHERE mensajes_usuario <= 1)::float8 / NULLIF(COUNT(*), 0),
               0
             )::float8 AS "tasaAbandono"
      FROM por_conversacion`,
  ]);

  const agregados = filaVolumenSchema.array().parse(agregadosRaw)[0] ?? {
    mensajesPorConversacion: 0,
    tasaAbandono: 0,
  };

  return {
    porDia: filaSerieSchema.array().parse(porDiaRaw),
    porHora: filaHoraSchema.array().parse(porHoraRaw),
    ...agregados,
  };
}
```

- [ ] **Paso 8: Correr el test y verificar que pasa**

Run: `pnpm test:unit --run src/lib/board/metricas-agente.test.ts`
Expected: PASS — 5 tests

- [ ] **Paso 9: Verificar las queries contra la base real**

Los tests mockean Prisma, así que no validan el SQL. Con `DATABASE_URL` apuntando a la base de desarrollo:

```bash
cd frontend
pnpm tsx --conditions=react-server -e "import('./src/lib/board/metricas-agente.ts').then(async (m) => { console.info(JSON.stringify(await m.calcularAgente(null))); console.info(JSON.stringify(await m.calcularVolumen(null))); process.exit(0); })"
```

Expected: dos objetos JSON sin excepciones. Un error `operator does not exist` o `column ... does not exist` significa que un nombre de columna del schema `mastra` no coincide — corregirlo contra `lib/revision/timeline.ts`, que tiene los nombres verificados en vivo.

- [ ] **Paso 10: Commit**

```bash
cd frontend && pnpm lint && pnpm typecheck
git add frontend/src/lib/board/costos.ts frontend/src/lib/board/costos.test.ts frontend/src/lib/board/metricas-agente.ts frontend/src/lib/board/metricas-agente.test.ts
git commit -m "feat(board): costo, latencia, uso de tools y volumen"
```

---

## Tarea 7: Endpoint y pantalla de métricas

**Files:**
- Create: `frontend/src/lib/board/metricas.ts`, `frontend/src/app/api/board/metricas/route.test.ts`, `frontend/src/components/board/Metricas/*`
- Modify: `frontend/src/app/api/board/metricas/route.ts` (reemplaza el stub de la Tarea 2), `frontend/src/app/board/page.tsx` (reemplaza el stub), `frontend/package.json`

**Interfaces:**
- Consumes: `calcularFunnel`, `calcularDemanda` (Tarea 5) · `calcularAgente`, `calcularVolumen` (Tarea 6) · `rangoSchema`, `fechaDesde` (Tarea 5)
- Produces: `interface Metricas { rango: Rango; funnel: Funnel; demanda: Demanda; agente: { modelos: UsoModelo[]; tools: UsoTool[]; latencia: Latencia }; volumen: Volumen }` · `calcularMetricas(rango: Rango): Promise<Metricas>` · `GET /api/board/metricas?rango=<7d|30d|90d|todo>`

- [ ] **Paso 1: Instalar Recharts**

```bash
cd frontend && pnpm add recharts@^3.10.1
```

- [ ] **Paso 2: Escribir el orquestador**

Crear `frontend/src/lib/board/metricas.ts`:

```typescript
import "server-only";

import { calcularAgente, calcularVolumen, type Latencia, type UsoModelo, type UsoTool, type Volumen } from "./metricas-agente";
import { calcularDemanda, calcularFunnel, type Demanda, type Funnel } from "./metricas-funnel";
import { fechaDesde, type Rango } from "./rango";

export interface Metricas {
  rango: Rango;
  funnel: Funnel;
  demanda: Demanda;
  agente: { modelos: UsoModelo[]; tools: UsoTool[]; latencia: Latencia };
  volumen: Volumen;
}

/**
 * Las cuatro familias corren en paralelo: la latencia del endpoint es la de
 * la query más lenta, no la suma de las cuatro.
 */
export async function calcularMetricas(rango: Rango): Promise<Metricas> {
  const desde = fechaDesde(rango);
  const [funnel, demanda, agente, volumen] = await Promise.all([
    calcularFunnel(desde),
    calcularDemanda(desde),
    calcularAgente(desde),
    calcularVolumen(desde),
  ]);
  return { rango, funnel, demanda, agente, volumen };
}
```

- [ ] **Paso 3: Escribir el test del endpoint (falla)**

Crear `frontend/src/app/api/board/metricas/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => authMock);

const metricasMock = vi.hoisted(() => ({ calcularMetricas: vi.fn() }));
vi.mock("@/lib/board/metricas", () => metricasMock);

import { GET } from "./route";

function pedido(query: string): Request {
  return new Request(`http://localhost/api/board/metricas${query}`);
}

describe("GET /api/board/metricas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.auth.mockResolvedValue({ user: { email: "ana@jurco.uy" } });
    metricasMock.calcularMetricas.mockResolvedValue({ rango: "7d" });
  });

  // Defensa en profundidad: el proxy ya filtró, pero el handler no confía en él.
  it("sin sesión responde 401 sin consultar la base", async () => {
    authMock.auth.mockResolvedValue(null);
    const response = await GET(pedido("?rango=7d"));
    expect(response.status).toBe(401);
    expect(metricasMock.calcularMetricas).not.toHaveBeenCalled();
  });

  it("pasa el rango recibido", async () => {
    await GET(pedido("?rango=90d"));
    expect(metricasMock.calcularMetricas).toHaveBeenCalledWith("90d");
  });

  it("sin rango usa 30d por defecto", async () => {
    await GET(pedido(""));
    expect(metricasMock.calcularMetricas).toHaveBeenCalledWith("30d");
  });

  it("rango inválido responde 400", async () => {
    const response = await GET(pedido("?rango=1d"));
    expect(response.status).toBe(400);
    expect(metricasMock.calcularMetricas).not.toHaveBeenCalled();
  });

  it("un error de la capa de datos responde 500 sin filtrar el detalle", async () => {
    metricasMock.calcularMetricas.mockRejectedValue(new Error("column x does not exist"));
    const response = await GET(pedido("?rango=7d"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("column x");
  });
});
```

- [ ] **Paso 4: Correr el test y verificar que falla**

Run: `pnpm test:unit --run src/app/api/board/metricas/route.test.ts`
Expected: FAIL — el stub de la Tarea 2 devuelve 200 con `{ pendiente: true }`

- [ ] **Paso 5: Implementar el endpoint**

Reemplazar el contenido de `frontend/src/app/api/board/metricas/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { calcularMetricas } from "@/lib/board/metricas";
import { rangoSchema } from "@/lib/board/rango";
import { logger } from "@/utils/logger";

const RANGO_POR_DEFECTO = "30d";

export async function GET(request: Request) {
  try {
    const sesion = await auth();
    if (!sesion?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const crudo = new URL(request.url).searchParams.get("rango") ?? RANGO_POR_DEFECTO;
    const rango = rangoSchema.safeParse(crudo);
    if (!rango.success) {
      return NextResponse.json({ error: "El rango solicitado no es válido" }, { status: 400 });
    }

    return NextResponse.json(await calcularMetricas(rango.data));
  } catch (error) {
    logger.error("board/metricas GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Paso 6: Correr el test y verificar que pasa**

Run: `pnpm test:unit --run src/app/api/board/metricas/route.test.ts`
Expected: PASS — 5 tests

- [ ] **Paso 7: Escribir la pantalla de métricas**

Reemplazar `frontend/src/app/board/page.tsx`:

```typescript
import { MetricasPanel } from "@/components/board/Metricas/MetricasPanel";

export default function BoardPage() {
  return <MetricasPanel />;
}
```

Crear `frontend/src/components/board/Metricas/MetricasPanel.tsx`:

```typescript
"use client";

import { useState } from "react";
import useSWR from "swr";

import type { Metricas } from "@/lib/board/metricas";
import type { Rango } from "@/lib/board/rango";

import { GraficoBarras } from "./GraficoBarras";
import { GraficoLinea } from "./GraficoLinea";
import { TarjetaKpi } from "./TarjetaKpi";
import styles from "./metricas.module.css";

const RANGOS: { valor: Rango; etiqueta: string }[] = [
  { valor: "7d", etiqueta: "7 días" },
  { valor: "30d", etiqueta: "30 días" },
  { valor: "90d", etiqueta: "90 días" },
  { valor: "todo", etiqueta: "Todo" },
];

async function traer(url: string): Promise<Metricas> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No pudimos cargar las métricas");
  return (await response.json()) as Metricas;
}

function porcentaje(parte: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((parte / total) * 100)}%`;
}

function segundos(ms: number): string {
  if (ms === 0) return "—";
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Suma el costo de los modelos conocidos. Un modelo sin precio en la tabla
 * aporta `null`, y eso se marca como total parcial en vez de esconderse: un
 * costo que parece completo pero omite un modelo miente más que uno marcado.
 */
function costoTotal(modelos: Metricas["agente"]["modelos"]): string {
  if (modelos.length === 0) return "—";
  const conocidos = modelos.filter((modelo) => modelo.costoUsd !== null);
  const total = conocidos.reduce((suma, modelo) => suma + (modelo.costoUsd ?? 0), 0);
  const parcial = conocidos.length < modelos.length ? " (parcial)" : "";
  return `USD ${total.toFixed(2)}${parcial}`;
}

function miles(n: number): string {
  return new Intl.NumberFormat("es-UY").format(Math.round(n));
}

export function MetricasPanel() {
  const [rango, setRango] = useState<Rango>("30d");
  const { data, error } = useSWR(`/api/board/metricas?rango=${rango}`, traer, {
    dedupingInterval: 30_000,
  });

  return (
    <section>
      <header className={styles.encabezado}>
        <h1 className={styles.titulo}>Métricas</h1>
        <div className={styles.rangos} role="group" aria-label="Rango temporal">
          {RANGOS.map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              className={opcion.valor === rango ? `${styles.rango} ${styles.rangoActivo}` : styles.rango}
              aria-pressed={opcion.valor === rango}
              onClick={() => setRango(opcion.valor)}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <p role="alert" className={styles.error}>No pudimos cargar las métricas.</p>
      ) : !data ? (
        <p className={styles.cargando}>Cargando…</p>
      ) : (
        <>
          <div className={styles.kpis}>
            <TarjetaKpi etiqueta="Conversaciones" valor={String(data.funnel.iniciadas)} />
            <TarjetaKpi
              etiqueta="Tasa de captación"
              valor={porcentaje(data.funnel.captadas, data.funnel.iniciadas)}
            />
            <TarjetaKpi etiqueta="Casos captados" valor={String(data.funnel.captadas)} />
            <TarjetaKpi
              etiqueta="Fuera de cobertura"
              valor={String(data.funnel.fueraDeCobertura)}
            />
            <TarjetaKpi etiqueta="Costo del período" valor={costoTotal(data.agente.modelos)} />
            <TarjetaKpi etiqueta="Latencia mediana" valor={segundos(data.agente.latencia.p50Ms)} />
            <TarjetaKpi etiqueta="Latencia p95" valor={segundos(data.agente.latencia.p95Ms)} />
            <TarjetaKpi
              etiqueta="Mensajes por conversación"
              valor={data.volumen.mensajesPorConversacion.toFixed(1)}
            />
            <TarjetaKpi
              etiqueta="Tasa de abandono"
              valor={porcentaje(data.volumen.tasaAbandono * 100, 100)}
            />
          </div>

          <GraficoBarras
            titulo="Funnel de captación"
            datos={[
              { nombre: "Iniciadas", valor: data.funnel.iniciadas },
              { nombre: "Clasificadas", valor: data.funnel.clasificadas },
              { nombre: "Con caso", valor: data.funnel.conCaso },
              { nombre: "Captadas", valor: data.funnel.captadas },
            ]}
          />

          <GraficoLinea
            titulo="Conversaciones por día"
            datos={data.volumen.porDia.map((punto) => ({ nombre: punto.fecha, valor: punto.valor }))}
          />

          <GraficoBarras
            titulo="Demanda por categoría"
            datos={data.demanda.categorias.map((fila) => ({
              nombre: fila.categoria,
              valor: fila.conversaciones,
            }))}
          />

          <GraficoBarras
            titulo="Demanda por subcategoría"
            datos={data.demanda.subcategorias.map((fila) => ({
              nombre: fila.subcategoria,
              valor: fila.casos,
            }))}
          />

          <GraficoBarras
            titulo="Uso de herramientas"
            datos={data.agente.tools.map((fila) => ({ nombre: fila.tool, valor: fila.llamadas }))}
          />

          <GraficoBarras
            titulo="Consultas por hora del día"
            datos={data.volumen.porHora.map((franja) => ({
              nombre: `${String(franja.hora).padStart(2, "0")}h`,
              valor: franja.conversaciones,
            }))}
          />

          <section className={styles.bloque}>
            <h2 className={styles.subtitulo}>Consumo por modelo</h2>
            {data.agente.modelos.length === 0 ? (
              <p className={styles.ayuda}>Sin datos en este rango.</p>
            ) : (
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th scope="col">Modelo</th>
                    <th scope="col">Tokens de entrada</th>
                    <th scope="col">Tokens de salida</th>
                    <th scope="col">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agente.modelos.map((modelo) => (
                    <tr key={modelo.modelo}>
                      <td>{modelo.modelo}</td>
                      <td>{miles(modelo.tokensEntrada)}</td>
                      <td>{miles(modelo.tokensSalida)}</td>
                      {/* null = modelo sin precio en la tabla, no costo cero. */}
                      <td>{modelo.costoUsd === null ? "sin dato" : `USD ${modelo.costoUsd.toFixed(2)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className={styles.bloque}>
            <h2 className={styles.subtitulo}>Pedidos fuera de cobertura</h2>
            <p className={styles.ayuda}>
              Lo que consultan y todavía no cubrimos. Entrada directa al roadmap de categorías.
            </p>
            <ul className={styles.lista}>
              {data.demanda.fueraDeCobertura.map((pedido) => (
                <li key={pedido.conversationId} className={styles.item}>
                  <span className={styles.fecha}>{pedido.fecha.slice(0, 10)}</span>
                  <span>{pedido.resumen ?? "Sin resumen registrado"}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}
```

- [ ] **Paso 8: Escribir los componentes de gráfico y KPI**

Crear `frontend/src/components/board/Metricas/TarjetaKpi.tsx`:

```typescript
import styles from "./metricas.module.css";

export function TarjetaKpi({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <article className={styles.kpi}>
      <span className={styles.kpiEtiqueta}>{etiqueta}</span>
      <strong className={styles.kpiValor}>{valor}</strong>
    </article>
  );
}
```

Crear `frontend/src/components/board/Metricas/GraficoBarras.tsx`:

```typescript
"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import styles from "./metricas.module.css";

export interface PuntoGrafico {
  nombre: string;
  valor: number;
}

export function GraficoBarras({ titulo, datos }: { titulo: string; datos: PuntoGrafico[] }) {
  return (
    <section className={styles.bloque}>
      <h2 className={styles.subtitulo}>{titulo}</h2>
      {datos.length === 0 ? (
        <p className={styles.ayuda}>Sin datos en este rango.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={datos}>
            <CartesianGrid stroke="#e2e8ee" vertical={false} />
            <XAxis dataKey="nombre" stroke="#64778a" fontSize={13} />
            <YAxis stroke="#64778a" fontSize={13} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="valor" fill="#3185c9" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
```

Crear `frontend/src/components/board/Metricas/GraficoLinea.tsx`:

```typescript
"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { PuntoGrafico } from "./GraficoBarras";
import styles from "./metricas.module.css";

export function GraficoLinea({ titulo, datos }: { titulo: string; datos: PuntoGrafico[] }) {
  return (
    <section className={styles.bloque}>
      <h2 className={styles.subtitulo}>{titulo}</h2>
      {datos.length === 0 ? (
        <p className={styles.ayuda}>Sin datos en este rango.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={datos}>
            <CartesianGrid stroke="#e2e8ee" vertical={false} />
            <XAxis dataKey="nombre" stroke="#64778a" fontSize={13} />
            <YAxis stroke="#64778a" fontSize={13} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="valor" stroke="#3185c9" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
```

**Nota:** Recharts recibe colores por prop, no por CSS, así que los hex van literales acá. Deben coincidir con los tokens de `globals.css`: `--accent: #3185c9`, `--ink-100: #e2e8ee`, `--ink-500: #64778a`.

Crear `frontend/src/components/board/Metricas/metricas.module.css`:

```css
.encabezado {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  margin-bottom: var(--space-6);
}

.titulo {
  font-family: var(--font-family-display);
  font-size: var(--text-2xl);
  color: var(--ink-900);
}

.subtitulo {
  font-family: var(--font-family-display);
  font-size: var(--text-lg);
  color: var(--ink-900);
  margin-bottom: var(--space-2);
}

.rangos {
  display: flex;
  gap: var(--space-1);
}

.rango {
  font: inherit;
  font-size: var(--text-sm);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink-700);
  cursor: pointer;
}

.rangoActivo {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-navy);
}

.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.kpi {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-soft);
}

.kpiEtiqueta {
  font-size: var(--text-sm);
  color: var(--ink-500);
}

.kpiValor {
  font-family: var(--font-family-display);
  font-size: var(--text-2xl);
  color: var(--navy);
}

.bloque {
  padding: var(--space-6);
  margin-bottom: var(--space-6);
  background: var(--surface);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-soft);
}

.ayuda {
  font-size: var(--text-sm);
  color: var(--ink-500);
}

.tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.tabla th,
.tabla td {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--ink-100);
}

.tabla th {
  color: var(--ink-500);
  font-weight: 600;
}

.lista {
  list-style: none;
  margin-top: var(--space-4);
  display: grid;
  gap: var(--space-2);
}

.item {
  display: grid;
  grid-template-columns: 6rem 1fr;
  gap: var(--space-3);
  font-size: var(--text-sm);
  color: var(--ink-700);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--ink-100);
}

.fecha {
  color: var(--ink-500);
}

.cargando {
  color: var(--ink-500);
}

.error {
  color: var(--state-error);
}
```

- [ ] **Paso 9: Verificar la pantalla a mano**

```bash
cd frontend && pnpm dev
```

Entrar a `http://127.0.0.1:3000/board` con sesión. Expected: KPIs, cuatro gráficos y la lista de pedidos fuera de cobertura; cambiar de rango refetchea.

- [ ] **Paso 10: Commit**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit --run
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/lib/board/metricas.ts frontend/src/app/api/board/metricas frontend/src/app/board/page.tsx frontend/src/components/board/Metricas
git commit -m "feat(board): pantalla de métricas con las cuatro familias"
```

---

## Tarea 8: Chats — listado

**Files:**
- Create: `frontend/src/lib/board/conversaciones.ts`, `frontend/src/lib/board/conversaciones.test.ts`, `frontend/src/lib/validations/board.ts`, `frontend/src/app/api/board/conversaciones/route.ts`, `frontend/src/app/board/chats/page.tsx`, `frontend/src/components/board/Chats/ListadoChats.tsx`, `frontend/src/components/board/Chats/chats.module.css`
- Modify: `frontend/src/lib/validations/index.ts`

**Interfaces:**
- Consumes: `conversacionesReales` de `./scope` (Tarea 5) · `fechaDesde`, `rangoSchema` (Tarea 5)
- Produces:
  - `interface ChatResumen { id: string; fecha: string; categoria: string | null; estadoCaso: string | null; mensajes: number; preview: string; notas: number }`
  - `interface PaginaChats { chats: ChatResumen[]; cursor: string | null }` — nombre distinto del componente `ListadoChats` a propósito, para que no colisionen en un mismo import
  - `listarConversaciones(filtros: FiltrosChats): Promise<PaginaChats>` con `FiltrosChats = z.infer<typeof filtrosChatsSchema>`
  - `GET /api/board/conversaciones?rango&categoria&estado&busqueda&cursor`

- [ ] **Paso 1: Escribir el schema de filtros**

Crear `frontend/src/lib/validations/board.ts`:

```typescript
import { z } from "zod";

import { rangoSchema } from "@/lib/board/rango";

export const filtrosChatsSchema = z.object({
  rango: rangoSchema.default("30d"),
  categoria: z.string().min(1).optional(),
  estado: z.enum(["EN_CONVERSACION", "CAPTADO", "FUERA_DE_COBERTURA"]).optional(),
  busqueda: z.string().min(2).max(200).optional(),
  cursor: z.string().min(1).optional(),
});

export type FiltrosChats = z.infer<typeof filtrosChatsSchema>;
```

Agregar a `frontend/src/lib/validations/index.ts`:

```typescript
export * from "./board";
```

- [ ] **Paso 2: Escribir el test del listado (falla)**

Crear `frontend/src/lib/board/conversaciones.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: { conversation: { findMany: vi.fn() }, $queryRaw: vi.fn() },
}));
vi.mock("@/lib/prisma", () => prismaMock);

import { listarConversaciones } from "./conversaciones";

function filaConversacion(id: string) {
  return {
    id,
    threadId: `chat-${id}`,
    categoria: "laboral",
    createdAt: new Date("2026-07-30T10:00:00.000Z"),
    caso: { estado: "CAPTADO" },
    _count: { notas: 2 },
  };
}

describe("listarConversaciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.conversation.findMany.mockResolvedValue([filaConversacion("c1")]);
    prismaMock.prisma.$queryRaw.mockResolvedValue([
      { threadId: "chat-c1", mensajes: 6, preview: "Me despidieron sin causa" },
    ]);
  });

  it("filtra siempre por conversaciones reales", async () => {
    await listarConversaciones({ rango: "30d" });
    const where = prismaMock.prisma.conversation.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ esRevision: false });
  });

  it("combina la fila de negocio con el conteo y el preview de mensajes", async () => {
    const resultado = await listarConversaciones({ rango: "30d" });
    expect(resultado.chats).toEqual([
      {
        id: "c1",
        fecha: "2026-07-30T10:00:00.000Z",
        categoria: "laboral",
        estadoCaso: "CAPTADO",
        mensajes: 6,
        preview: "Me despidieron sin causa",
        notas: 2,
      },
    ]);
  });

  it("una conversación sin mensajes persistidos no rompe el listado", async () => {
    prismaMock.prisma.$queryRaw.mockResolvedValue([]);
    const resultado = await listarConversaciones({ rango: "30d" });
    expect(resultado.chats[0]).toMatchObject({ mensajes: 0, preview: "" });
  });

  it("el filtro de estado se aplica sobre el caso", async () => {
    await listarConversaciones({ rango: "30d", estado: "CAPTADO" });
    const where = prismaMock.prisma.conversation.findMany.mock.calls[0][0].where;
    expect(where.caso).toMatchObject({ estado: "CAPTADO" });
  });

  it("devuelve cursor null cuando la página no está llena", async () => {
    const resultado = await listarConversaciones({ rango: "30d" });
    expect(resultado.cursor).toBeNull();
  });

  // La búsqueda tiene que acotar ANTES de paginar: si filtrara después, un
  // match fuera de las 30 más recientes no aparecería nunca.
  it("con búsqueda restringe el findMany a los threads que matchean", async () => {
    prismaMock.prisma.$queryRaw
      .mockResolvedValueOnce([{ threadId: "chat-c9" }])
      .mockResolvedValueOnce([{ threadId: "chat-c9", mensajes: 4, preview: "Me despidieron" }]);
    prismaMock.prisma.conversation.findMany.mockResolvedValue([filaConversacion("c9")]);

    await listarConversaciones({ rango: "30d", busqueda: "despido" });

    const where = prismaMock.prisma.conversation.findMany.mock.calls[0][0].where;
    expect(where.threadId).toEqual({ in: ["chat-c9"] });
  });

  it("búsqueda sin coincidencias devuelve vacío sin consultar conversaciones", async () => {
    prismaMock.prisma.$queryRaw.mockResolvedValueOnce([]);
    prismaMock.prisma.conversation.findMany.mockClear();

    const resultado = await listarConversaciones({ rango: "30d", busqueda: "inexistente" });

    expect(resultado).toEqual({ chats: [], cursor: null });
    expect(prismaMock.prisma.conversation.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Paso 3: Correr el test y verificar que falla**

Run: `pnpm test:unit --run src/lib/board/conversaciones.test.ts`
Expected: FAIL — "Failed to resolve import ./conversaciones"

- [ ] **Paso 4: Implementar el listado**

Crear `frontend/src/lib/board/conversaciones.ts`:

```typescript
import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import type { FiltrosChats } from "@/lib/validations/board";
import { prisma } from "@/lib/prisma";

import { fechaDesde } from "./rango";
import { conversacionesReales } from "./scope";

export interface ChatResumen {
  id: string;
  fecha: string;
  categoria: string | null;
  estadoCaso: string | null;
  mensajes: number;
  preview: string;
  notas: number;
}

/** Una página del listado. El componente homónimo vive en components/board/Chats. */
export interface PaginaChats {
  chats: ChatResumen[];
  cursor: string | null;
}

const POR_PAGINA = 30;
const LARGO_PREVIEW = 140;

const filaResumenSchema = z.object({
  threadId: z.string(),
  mensajes: z.coerce.number(),
  preview: z.string(),
});

const filaThreadSchema = z.object({ threadId: z.string() });

export async function listarConversaciones(filtros: FiltrosChats): Promise<ListadoChats> {
  const desde = fechaDesde(filtros.rango);

  // La búsqueda acota el conjunto ANTES de paginar. Filtrando después, un
  // término solo se encontraría entre las 30 conversaciones más recientes y
  // el resto quedaría afuera sin aviso — una búsqueda que omite en silencio
  // es peor que no tenerla. Además deja `mensajes` y `preview` correctos:
  // salen de la conversación entera, no de las filas que matchearon.
  let threadsCoincidentes: string[] | null = null;
  if (filtros.busqueda) {
    const filasCoincidentes = filaThreadSchema.array().parse(
      await prisma.$queryRaw`
        SELECT DISTINCT m.thread_id AS "threadId"
        FROM mastra.mastra_messages m
        WHERE m.content::text ILIKE ${`%${filtros.busqueda}%`}`,
    );
    threadsCoincidentes = filasCoincidentes.map((fila) => fila.threadId);
    if (threadsCoincidentes.length === 0) return { chats: [], cursor: null };
  }

  const where: Prisma.ConversationWhereInput = {
    ...conversacionesReales(desde),
    ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
    ...(filtros.estado ? { caso: { estado: filtros.estado } } : {}),
    ...(threadsCoincidentes ? { threadId: { in: threadsCoincidentes } } : {}),
  };

  const filas = await prisma.conversation.findMany({
    where,
    select: {
      id: true,
      threadId: true,
      categoria: true,
      createdAt: true,
      caso: { select: { estado: true } },
      _count: { select: { notas: true } },
    },
    orderBy: { createdAt: "desc" },
    take: POR_PAGINA,
    ...(filtros.cursor ? { skip: 1, cursor: { id: filtros.cursor } } : {}),
  });

  const threadIds = filas.map((fila) => fila.threadId);
  const resumenes =
    threadIds.length === 0
      ? []
      : filaResumenSchema.array().parse(
          await prisma.$queryRaw`
            SELECT m.thread_id AS "threadId",
                   COUNT(*)::float8 AS mensajes,
                   COALESCE(
                     (ARRAY_AGG(m.content::text ORDER BY m."createdAt" ASC)
                      FILTER (WHERE m.role = 'user'))[1],
                     ''
                   ) AS preview
            FROM mastra.mastra_messages m
            WHERE m.thread_id IN (${Prisma.join(threadIds)})
            GROUP BY m.thread_id`,
        );

  const porThread = new Map(resumenes.map((resumen) => [resumen.threadId, resumen]));

  const chats = filas.map((fila) => {
    const resumen = porThread.get(fila.threadId);
    return {
      id: fila.id,
      fecha: fila.createdAt.toISOString(),
      categoria: fila.categoria,
      estadoCaso: fila.caso?.estado ?? null,
      mensajes: resumen?.mensajes ?? 0,
      preview: recortar(resumen?.preview ?? ""),
      notas: fila._count.notas,
    };
  });

  return {
    chats,
    cursor: filas.length === POR_PAGINA ? (filas[filas.length - 1]?.id ?? null) : null,
  };
}

/**
 * El content de mastra_messages viene en varios shapes (string plano, JSON
 * serializado, formato v2 con parts). Para el preview alcanza con limpiar el
 * ruido estructural y recortar — el texto exacto lo resuelve la timeline.
 */
function recortar(crudo: string): string {
  const limpio = crudo
    .replace(/[{}[\]"]/g, " ")
    .replace(/\b(format|parts|type|text)\b\s*:?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpio.length > LARGO_PREVIEW ? `${limpio.slice(0, LARGO_PREVIEW)}…` : limpio;
}
```

- [ ] **Paso 5: Correr el test y verificar que pasa**

Run: `pnpm test:unit --run src/lib/board/conversaciones.test.ts`
Expected: PASS — 5 tests

- [ ] **Paso 6: Escribir el endpoint del listado**

Crear `frontend/src/app/api/board/conversaciones/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { listarConversaciones } from "@/lib/board/conversaciones";
import { filtrosChatsSchema, parseSearchParams } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function GET(request: Request) {
  try {
    const sesion = await auth();
    if (!sesion?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const validation = parseSearchParams(new URL(request.url).searchParams, filtrosChatsSchema);
    if (!validation.success) return validation.response;

    return NextResponse.json(await listarConversaciones(validation.data));
  } catch (error) {
    logger.error("board/conversaciones GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Paso 7: Escribir la pantalla del listado**

Crear `frontend/src/app/board/chats/page.tsx`:

```typescript
import { ListadoChats } from "@/components/board/Chats/ListadoChats";

export default function ChatsPage() {
  return <ListadoChats />;
}
```

Crear `frontend/src/components/board/Chats/ListadoChats.tsx`:

```typescript
"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import type { PaginaChats } from "@/lib/board/conversaciones";
import type { Rango } from "@/lib/board/rango";

import styles from "./chats.module.css";

const ESTADOS = ["EN_CONVERSACION", "CAPTADO", "FUERA_DE_COBERTURA"] as const;

async function traer(url: string): Promise<PaginaChats> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No pudimos cargar los chats");
  return (await response.json()) as PaginaChats;
}

export function ListadoChats() {
  const [rango, setRango] = useState<Rango>("30d");
  const [estado, setEstado] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [consulta, setConsulta] = useState("");

  const params = new URLSearchParams({ rango });
  if (estado) params.set("estado", estado);
  if (consulta.length >= 2) params.set("busqueda", consulta);

  const { data, error, isLoading } = useSWR(
    `/api/board/conversaciones?${params.toString()}`,
    traer,
    { dedupingInterval: 15_000 },
  );

  return (
    <section>
      <header className={styles.encabezado}>
        <h1 className={styles.titulo}>Chats</h1>
        <form
          className={styles.filtros}
          onSubmit={(evento) => {
            evento.preventDefault();
            setConsulta(busqueda.trim());
          }}
        >
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Rango</span>
            <select value={rango} onChange={(e) => setRango(e.target.value as Rango)}>
              <option value="7d">7 días</option>
              <option value="30d">30 días</option>
              <option value="90d">90 días</option>
              <option value="todo">Todo</option>
            </select>
          </label>
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS.map((valor) => (
                <option key={valor} value={valor}>
                  {valor.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Buscar</span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Texto en los mensajes"
            />
          </label>
          <button type="submit" className={styles.boton}>
            Buscar
          </button>
        </form>
      </header>

      {error ? <p role="alert" className={styles.error}>No pudimos cargar los chats.</p> : null}
      {isLoading || !data ? (
        <p className={styles.cargando}>Cargando…</p>
      ) : data.chats.length === 0 ? (
        <p className={styles.cargando}>No hay conversaciones en este rango.</p>
      ) : (
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Categoría</th>
              <th scope="col">Estado</th>
              <th scope="col">Mensajes</th>
              <th scope="col">Consulta</th>
              <th scope="col">Notas</th>
            </tr>
          </thead>
          <tbody>
            {data.chats.map((chat) => (
              <tr key={chat.id}>
                <td>{chat.fecha.slice(0, 10)}</td>
                <td>{chat.categoria ?? "—"}</td>
                <td>{chat.estadoCaso?.replace(/_/g, " ").toLowerCase() ?? "—"}</td>
                <td>{chat.mensajes}</td>
                <td>
                  <Link href={`/board/chats/${chat.id}`} className={styles.link}>
                    {chat.preview || "Sin mensajes"}
                  </Link>
                </td>
                <td>{chat.notas > 0 ? chat.notas : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

Crear `frontend/src/components/board/Chats/chats.module.css`:

```css
.encabezado {
  display: grid;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.titulo {
  font-family: var(--font-family-display);
  font-size: var(--text-2xl);
  color: var(--ink-900);
}

.filtros {
  display: flex;
  gap: var(--space-3);
  align-items: flex-end;
  flex-wrap: wrap;
}

.campo {
  display: grid;
  gap: var(--space-1);
  font-size: var(--text-sm);
}

.campo select,
.campo input {
  font: inherit;
  padding: var(--space-2);
  border: 1px solid var(--ink-300);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink-900);
}

.etiqueta {
  color: var(--ink-500);
}

.boton {
  font: inherit;
  padding: var(--space-2) var(--space-4);
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--on-navy);
  cursor: pointer;
}

.tabla {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.tabla th,
.tabla td {
  text-align: left;
  padding: var(--space-3);
  border-bottom: 1px solid var(--ink-100);
}

.tabla th {
  color: var(--ink-500);
  font-weight: 600;
}

.link {
  color: var(--accent-strong);
}

.cargando {
  color: var(--ink-500);
}

.error {
  color: var(--state-error);
}
```

- [ ] **Paso 8: Commit**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit --run
git add frontend/src/lib/board/conversaciones.ts frontend/src/lib/board/conversaciones.test.ts frontend/src/lib/validations frontend/src/app/api/board/conversaciones frontend/src/app/board/chats frontend/src/components/board/Chats
git commit -m "feat(board): listado de chats con filtros y búsqueda"
```

---

## Tarea 9: Chats — detalle con timeline, caso y notas

**Contexto crítico:** `crearNota()` tiene un guard `esRevision: true` que rechaza conversaciones reales, y `scripts/feedback-pull.ts` filtra igual. Los dos se abren de forma explícita en esta tarea (spec §5.2). El aislamiento de `/api/revision/*` **no** se toca.

**Files:**
- Create: `frontend/src/app/api/board/conversaciones/[id]/route.ts`, `frontend/src/app/api/board/conversaciones/[id]/notas/route.ts`, `frontend/src/app/board/chats/[id]/page.tsx`, `frontend/src/components/board/Chats/DetalleChat.tsx`, `frontend/tests/board.spec.ts`
- Modify: `frontend/src/lib/revision/notas.ts`, `frontend/src/lib/revision/notas.test.ts`, `frontend/src/lib/board/conversaciones.ts`, `frontend/src/lib/board/conversaciones.test.ts`, `frontend/scripts/feedback-pull.ts`, `frontend/src/components/board/Chats/chats.module.css`

**Interfaces:**
- Consumes (firmas verificadas en el código actual):
  - `construirTimeline(threadId: string, opciones?: { conSpans?: boolean }): Promise<ItemTimeline[]>` de `@/lib/revision/timeline`
  - `getCasoDeSesion(conversationId: string): Promise<CasoSnapshot | null>` de `@/lib/revision/sesiones`
  - `listarNotasDeSesion(conversationId: string): Promise<NotaConRespuestas[]>` de `@/lib/revision/notas` — **el nombre es `listarNotasDeSesion`, no `listarNotas`**
  - `NotaThread({ nota, onResponder, onResolver })` con `onResponder: (notaId: string, texto: string) => Promise<boolean>` y `onResolver: (notaId: string) => Promise<boolean>`
  - `NotaComposer({ cita, onCancelar, onGuardar })` con `cita: string | null` y `onGuardar: (texto: string) => Promise<boolean>`
- Produces:
  - `crearNota` con parámetro nuevo `alcance?: "revision" | "chat-real"` (default `"revision"`)
  - `interface DetalleConversacion { id: string; threadId: string; categoria: string | null; fecha: string; timeline: ItemTimeline[]; caso: CasoSnapshot | null; notas: NotaConRespuestas[] }`
  - `obtenerConversacion(id: string): Promise<DetalleConversacion | null>`
  - `GET /api/board/conversaciones/[id]` · `POST /api/board/conversaciones/[id]/notas`

- [ ] **Paso 1: Escribir el test del guard de `crearNota` (falla)**

Agregar a `frontend/src/lib/revision/notas.test.ts`, dentro del `describe("crearNota")` existente (usar el `prismaMock` que ya declara el archivo en su tope):

```typescript
  it("por defecto sigue rechazando una conversación real", async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(null);
    const nota = await crearNota({
      conversationId: "c1",
      origen: "EXPERTO",
      autor: "Dra. García",
      texto: "Nota",
    });
    expect(nota).toBeNull();
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "c1",
      esRevision: true,
    });
  });

  // El board anota chats de consultantes reales: es el caso de uso que le da
  // sentido al loop nota -> fix -> eval sobre fallas de producción.
  it("con alcance chat-real acepta una conversación no-revisión", async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({ id: "c1" });
    prismaMock.notaRevision.create.mockResolvedValue({ id: "n1" });
    const nota = await crearNota({
      conversationId: "c1",
      origen: "DEV",
      autor: "ana@jurco.uy",
      texto: "Afirmó un plazo sin pasar por buscar-documentos",
      alcance: "chat-real",
    });
    expect(nota).toEqual({ id: "n1" });
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].where).toEqual({ id: "c1" });
  });
```

- [ ] **Paso 2: Correr el test y verificar que falla**

Run: `pnpm test:unit --run src/lib/revision/notas.test.ts`
Expected: FAIL — el segundo test falla porque `crearNota` sigue exigiendo `esRevision: true`.

- [ ] **Paso 3: Abrir el guard con un parámetro explícito**

En `frontend/src/lib/revision/notas.ts`, agregar el campo al parámetro de `crearNota` y reemplazar el bloque del guard.

Firma — agregar después de `citaTexto?: string;`:

```typescript
  /**
   * Qué conversaciones acepta. "revision" (default) preserva el aislamiento
   * original del sistema de revisión: los seis call sites de /api/revision/*
   * no cambian de comportamiento. "chat-real" lo habilita solo para el board,
   * que anota conversaciones de consultantes reales (spec §5.2).
   */
  alcance?: "revision" | "chat-real";
```

Guard viejo:

```typescript
  // Blindaje esRevision a nivel lib: ninguna nota puede colgarse de una
  // conversación real de consultante, venga de la ruta o de un script.
  const conversation = await prisma.conversation.findFirst({
    where: { id: params.conversationId, esRevision: true },
    select: { id: true },
  });
  if (!conversation) return null;
```

Guard nuevo:

```typescript
  // Blindaje a nivel lib: por defecto una nota solo puede colgarse de una
  // sesión de revisión. El board pasa alcance "chat-real" explícitamente para
  // anotar conversaciones de consultantes; ninguna otra ruta lo hace.
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: params.conversationId,
      ...(params.alcance === "chat-real" ? {} : { esRevision: true }),
    },
    select: { id: true },
  });
  if (!conversation) return null;
```

- [ ] **Paso 4: Correr el test y verificar que pasa**

Run: `pnpm test:unit --run src/lib/revision/notas.test.ts`
Expected: PASS — incluidos los tests previos del archivo, sin cambios.

- [ ] **Paso 5: Escribir el test del detalle (falla)**

Agregar a `frontend/src/lib/board/conversaciones.test.ts`. Extender el mock de Prisma del tope del archivo para incluir `findFirst` y agregar estos mocks:

```typescript
const timelineMock = vi.hoisted(() => ({ construirTimeline: vi.fn() }));
vi.mock("@/lib/revision/timeline", () => timelineMock);

const sesionesMock = vi.hoisted(() => ({ getCasoDeSesion: vi.fn() }));
vi.mock("@/lib/revision/sesiones", () => sesionesMock);

const notasMock = vi.hoisted(() => ({ listarNotasDeSesion: vi.fn() }));
vi.mock("@/lib/revision/notas", () => notasMock);
```

```typescript
import { obtenerConversacion } from "./conversaciones";

describe("obtenerConversacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.conversation.findFirst.mockResolvedValue({
      id: "c1",
      threadId: "chat-c1",
      categoria: "laboral",
      createdAt: new Date("2026-07-30T10:00:00.000Z"),
    });
    timelineMock.construirTimeline.mockResolvedValue([{ tipo: "mensaje", id: "m1" }]);
    sesionesMock.getCasoDeSesion.mockResolvedValue({ estado: "CAPTADO" });
    notasMock.listarNotasDeSesion.mockResolvedValue([]);
  });

  it("arma el detalle con timeline, caso y notas", async () => {
    const detalle = await obtenerConversacion("c1");
    expect(detalle).toMatchObject({
      id: "c1",
      threadId: "chat-c1",
      categoria: "laboral",
      timeline: [{ tipo: "mensaje", id: "m1" }],
      caso: { estado: "CAPTADO" },
      notas: [],
    });
  });

  it("pide la timeline con spans", async () => {
    await obtenerConversacion("c1");
    expect(timelineMock.construirTimeline).toHaveBeenCalledWith("chat-c1", { conSpans: true });
  });

  // Una sesión de revisión no es un chat de consultante: no se sirve por acá.
  it("una conversación de revisión no se encuentra", async () => {
    prismaMock.prisma.conversation.findFirst.mockResolvedValue(null);
    expect(await obtenerConversacion("s1")).toBeNull();
    expect(prismaMock.prisma.conversation.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "s1",
      esRevision: false,
    });
  });
});
```

- [ ] **Paso 6: Correr el test y verificar que falla**

Run: `pnpm test:unit --run src/lib/board/conversaciones.test.ts`
Expected: FAIL — "obtenerConversacion is not a function"

- [ ] **Paso 7: Implementar `obtenerConversacion`**

Agregar a `frontend/src/lib/board/conversaciones.ts`:

```typescript
import { listarNotasDeSesion, type NotaConRespuestas } from "@/lib/revision/notas";
import { getCasoDeSesion, type CasoSnapshot } from "@/lib/revision/sesiones";
import { construirTimeline, type ItemTimeline } from "@/lib/revision/timeline";

export interface DetalleConversacion {
  id: string;
  threadId: string;
  categoria: string | null;
  fecha: string;
  timeline: ItemTimeline[];
  caso: CasoSnapshot | null;
  notas: NotaConRespuestas[];
}

/**
 * Detalle de un chat de consultante real. El filtro `esRevision: false` no es
 * cosmético: evita que el detalle del board sirva sesiones de prueba como si
 * fueran conversaciones de producción.
 */
export async function obtenerConversacion(id: string): Promise<DetalleConversacion | null> {
  const conversacion = await prisma.conversation.findFirst({
    where: { id, esRevision: false },
    select: { id: true, threadId: true, categoria: true, createdAt: true },
  });
  if (!conversacion) return null;

  const [timeline, caso, notas] = await Promise.all([
    construirTimeline(conversacion.threadId, { conSpans: true }),
    getCasoDeSesion(conversacion.id),
    listarNotasDeSesion(conversacion.id),
  ]);

  return {
    id: conversacion.id,
    threadId: conversacion.threadId,
    categoria: conversacion.categoria,
    fecha: conversacion.createdAt.toISOString(),
    timeline,
    caso,
    notas,
  };
}
```

- [ ] **Paso 8: Correr el test y verificar que pasa**

Run: `pnpm test:unit --run src/lib/board/conversaciones.test.ts`
Expected: PASS — 8 tests (5 del listado + 3 del detalle)

- [ ] **Paso 9: Escribir el endpoint de detalle**

Crear `frontend/src/app/api/board/conversaciones/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { obtenerConversacion } from "@/lib/board/conversaciones";
import { logger } from "@/utils/logger";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sesion = await auth();
    if (!sesion?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const detalle = await obtenerConversacion(id);
    if (!detalle) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    return NextResponse.json(detalle);
  } catch (error) {
    logger.error("board/conversaciones/[id] GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Paso 10: Escribir el endpoint de notas del board**

Crear `frontend/src/app/api/board/conversaciones/[id]/notas/route.ts`. Es la única ruta que pasa `alcance: "chat-real"`:

```typescript
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { obtenerConversacion } from "@/lib/board/conversaciones";
import { crearNota } from "@/lib/revision/notas";
import { crearNotaSchema, parseRequestBody } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sesion = await auth();
    const autor = sesion?.user?.name?.trim() || sesion?.user?.email?.trim();
    if (!autor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const conversacion = await obtenerConversacion(id);
    if (!conversacion) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const validation = await parseRequestBody(request, crearNotaSchema);
    if (!validation.success) return validation.response;

    // origen DEV: la nota nace del equipo técnico mirando producción, así que
    // queda RESPONDIDA (pendiente del experto), no ABIERTA.
    const nota = await crearNota({
      conversationId: conversacion.id,
      origen: "DEV",
      autor,
      texto: validation.data.texto,
      messageId: validation.data.messageId,
      citaTexto: validation.data.citaTexto,
      alcance: "chat-real",
    });
    if (!nota) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ nota }, { status: 201 });
  } catch (error) {
    logger.error("board/conversaciones/[id]/notas POST failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Paso 11: Verificar que responder y resolver no necesitan cambios**

```bash
cd frontend && grep -n -A10 "export async function responderNota\|export async function resolverNota" src/lib/revision/notas.ts | grep -n "esRevision"
```

Expected: **sin resultados**. Las dos funciones operan por `notaId` y no consultan `esRevision`, así que los endpoints existentes `/api/revision/notas/[notaId]` y `/api/revision/notas/[notaId]/respuestas` sirven también a las notas del board. Si el grep devuelve algo, esas rutas necesitan el mismo tratamiento que `crearNota` — pararlo y reportarlo.

- [ ] **Paso 12: Abrir `feedback-pull` a los chats reales**

Sin esto, una nota sobre producción nunca llega al equipo dev y el loop queda cortado justo donde el board aporta.

En `frontend/scripts/feedback-pull.ts`, reemplazar la query:

```typescript
  const sesiones = await prisma.conversation.findMany({
    where: { esRevision: true, notas: { some: { estado: "ABIERTA" } } },
    select: { id: true, threadId: true, titulo: true, creadaPor: true },
    orderBy: { updatedAt: "desc" },
  });
```

por:

```typescript
  // Incluye sesiones de revisión Y chats reales anotados desde el board: las
  // fallas de producción son el material más valioso del loop nota -> fix -> eval.
  const sesiones = await prisma.conversation.findMany({
    where: { notas: { some: { estado: "ABIERTA" } } },
    select: { id: true, threadId: true, titulo: true, creadaPor: true, esRevision: true },
    orderBy: { updatedAt: "desc" },
  });
```

y en el cuerpo del `for`, reemplazar la llamada al formateador:

```typescript
    writeFileSync(archivo, formatearSesionMarkdown({ sesion, timeline, notas }), "utf8");
```

por:

```typescript
    const etiquetada = {
      id: sesion.id,
      threadId: sesion.threadId,
      titulo: sesion.esRevision ? sesion.titulo : `[chat real] ${sesion.titulo ?? sesion.id}`,
      creadaPor: sesion.creadaPor,
    };
    writeFileSync(archivo, formatearSesionMarkdown({ sesion: etiquetada, timeline, notas }), "utf8");
```

Reemplazar también el mensaje de salida vacía:

```typescript
    process.stdout.write("No hay sesiones de revisión con notas abiertas.\n");
```

por:

```typescript
    process.stdout.write("No hay conversaciones con notas abiertas.\n");
```

Verificar:

```bash
cd frontend && pnpm feedback:pull
```

Expected: corre sin error. Los chats reales anotados aparecen con el prefijo `[chat real]`.

- [ ] **Paso 13: Escribir la pantalla de detalle**

Crear `frontend/src/app/board/chats/[id]/page.tsx`:

```typescript
import { DetalleChat } from "@/components/board/Chats/DetalleChat";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalleChat id={id} />;
}
```

Crear `frontend/src/components/board/Chats/DetalleChat.tsx`:

```typescript
"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { NotaComposer } from "@/components/revision/NotaComposer";
import { NotaThread } from "@/components/revision/NotaThread";
import type { DetalleConversacion } from "@/lib/board/conversaciones";

import styles from "./chats.module.css";

async function traer(url: string): Promise<DetalleConversacion> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No pudimos cargar la conversación");
  return (await response.json()) as DetalleConversacion;
}

function hora(iso: string): string {
  return new Date(iso).toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DetalleChat({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useSWR(`/api/board/conversaciones/${id}`, traer);
  const [anotando, setAnotando] = useState<{ messageId: string | null; cita: string | null } | null>(
    null,
  );

  const guardarNota = async (texto: string): Promise<boolean> => {
    const response = await fetch(`/api/board/conversaciones/${id}/notas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texto,
        ...(anotando?.messageId ? { messageId: anotando.messageId } : {}),
        ...(anotando?.cita ? { citaTexto: anotando.cita } : {}),
      }),
    });
    if (!response.ok) return false;
    setAnotando(null);
    await mutate();
    return true;
  };

  const responderNota = async (notaId: string, texto: string): Promise<boolean> => {
    const response = await fetch(`/api/revision/notas/${notaId}/respuestas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    if (!response.ok) return false;
    await mutate();
    return true;
  };

  const resolverNota = async (notaId: string): Promise<boolean> => {
    const response = await fetch(`/api/revision/notas/${notaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "RESUELTA" }),
    });
    if (!response.ok) return false;
    await mutate();
    return true;
  };

  if (error) return <p role="alert" className={styles.error}>No pudimos cargar la conversación.</p>;
  if (isLoading || !data) return <p className={styles.cargando}>Cargando…</p>;

  return (
    <section className={styles.detalle}>
      <div>
        <header className={styles.encabezado}>
          <Link href="/board/chats" className={styles.link}>
            ← Chats
          </Link>
          <h1 className={styles.titulo}>{data.categoria ?? "Sin clasificar"}</h1>
          <p className={styles.etiqueta}>{hora(data.fecha)}</p>
        </header>

        <ol className={styles.timeline}>
          {data.timeline.map((item) => {
            if (item.tipo === "mensaje") {
              return (
                <li
                  key={item.id}
                  className={item.rol === "user" ? styles.mensajeUsuario : styles.mensajeAgente}
                >
                  <p>{item.texto}</p>
                  <button
                    type="button"
                    className={styles.botonNota}
                    onClick={() => setAnotando({ messageId: item.id, cita: item.texto.slice(0, 300) })}
                  >
                    Dejar nota
                  </button>
                </li>
              );
            }
            if (item.tipo === "tool-call") {
              return (
                <li key={item.spanId} className={styles.traza}>
                  {item.tool}
                  {item.agente ? ` · ${item.agente}` : ""}
                  {item.error ? " · con error" : ""}
                </li>
              );
            }
            if (item.tipo === "turno-agente") {
              return (
                <li key={item.spanId} className={styles.traza}>
                  turno de {item.agente}
                </li>
              );
            }
            return (
              <li key={item.spanId} className={styles.traza}>
                {item.modelo ?? "modelo desconocido"} · {item.tokensEntrada} entrada /{" "}
                {item.tokensSalida} salida
              </li>
            );
          })}
        </ol>
      </div>

      <aside className={styles.panel}>
        <section className={styles.bloqueLateral}>
          <h2 className={styles.subtitulo}>Caso</h2>
          {data.caso ? (
            <dl className={styles.datos}>
              <dt>Estado</dt>
              <dd>{data.caso.estado.replace(/_/g, " ").toLowerCase()}</dd>
              <dt>Categoría</dt>
              <dd>{data.caso.categoria ?? "—"}</dd>
              <dt>Subcategorías</dt>
              <dd>{data.caso.subcategorias.join(", ") || "—"}</dd>
              <dt>Contacto</dt>
              <dd>
                {[data.caso.contactoNombre, data.caso.contactoTelefono, data.caso.contactoEmail]
                  .filter(Boolean)
                  .join(" · ") || "Sin contacto registrado"}
              </dd>
            </dl>
          ) : (
            <p className={styles.etiqueta}>Todavía no se abrió un caso.</p>
          )}
        </section>

        <section className={styles.bloqueLateral}>
          <h2 className={styles.subtitulo}>Notas</h2>
          {anotando ? (
            <NotaComposer
              cita={anotando.cita}
              onCancelar={() => setAnotando(null)}
              onGuardar={guardarNota}
            />
          ) : (
            <button
              type="button"
              className={styles.botonNota}
              onClick={() => setAnotando({ messageId: null, cita: null })}
            >
              Nota sobre la conversación
            </button>
          )}
          {data.notas.map((nota) => (
            <NotaThread
              key={nota.id}
              nota={nota}
              onResponder={responderNota}
              onResolver={resolverNota}
            />
          ))}
        </section>
      </aside>
    </section>
  );
}
```

**Verificar el método de resolver**: el `fetch` de `resolverNota` usa `PATCH`. Confirmar contra el handler real antes de dar la tarea por buena:

```bash
cd frontend && grep -n "export async function" 'src/app/api/revision/notas/[notaId]/route.ts'
```

Si el handler exporta `PUT` o `POST` en vez de `PATCH`, ajustar el método en el componente.

- [ ] **Paso 14: Agregar los estilos del detalle**

Agregar a `frontend/src/components/board/Chats/chats.module.css`:

```css
.detalle {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 22rem;
  gap: var(--space-6);
  align-items: start;
}

.timeline {
  list-style: none;
  display: grid;
  gap: var(--space-3);
}

.mensajeUsuario,
.mensajeAgente {
  padding: var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--ink-100);
  font-size: var(--text-sm);
}

.mensajeUsuario {
  background: var(--accent-soft);
}

.mensajeAgente {
  background: var(--surface);
}

.traza {
  font-size: var(--text-xs);
  color: var(--ink-500);
  padding-left: var(--space-4);
}

.botonNota {
  font: inherit;
  font-size: var(--text-xs);
  margin-top: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--ink-300);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink-700);
  cursor: pointer;
}

.panel {
  display: grid;
  gap: var(--space-4);
  position: sticky;
  top: var(--space-6);
}

.bloqueLateral {
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-md);
}

.subtitulo {
  font-family: var(--font-family-display);
  font-size: var(--text-base);
  color: var(--ink-900);
  margin-bottom: var(--space-3);
}

.datos {
  display: grid;
  grid-template-columns: 8rem 1fr;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.datos dt {
  color: var(--ink-500);
}

@media (width <= 60rem) {
  .detalle {
    grid-template-columns: 1fr;
  }

  .panel {
    position: static;
  }
}
```

- [ ] **Paso 15: Escribir el E2E del board**

Crear `frontend/tests/board.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

import { iniciarSesionBoard } from "./helpers/sesion-board";

const SECRETO = process.env.AUTH_SECRET ?? "";

test.skip(!SECRETO, "AUTH_SECRET no seteada — E2E del board deshabilitado");

test("el board lista chats y abre el detalle", async ({ page }) => {
  test.setTimeout(120_000);
  await iniciarSesionBoard(page);

  await page.goto("/board/chats");
  await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible();

  const filas = page.locator("tbody tr");
  if ((await filas.count()) === 0) {
    test.skip(true, "Sin conversaciones reales en la base de prueba");
  }

  await filas.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/board\/chats\/.+/);
});
```

**Nota:** la credencial de runner autentica `/api/revision/*` pero **no** `/api/board/*`, que exige sesión Auth.js. Si este test necesita datos del board, debe correr con una sesión real — por eso salta cuando no hay conversaciones. La cobertura dura del gate ya la da `tests/board-auth.spec.ts`.

- [ ] **Paso 16: Verificar a mano el ciclo completo**

```bash
cd frontend && pnpm dev
```

Con sesión, entrar a `/board/chats`, abrir una conversación real y dejar una nota anclada a un mensaje. Confirmar que aparece en el panel. Después:

```bash
cd frontend && pnpm feedback:pull
```

Expected: el archivo de esa conversación aparece bajo `tmp/feedback-legal/` con el prefijo `[chat real]` en el título. **Ese es el criterio de aceptación de la tarea**: sin eso, la nota quedó en la base pero el loop no la levanta.

- [ ] **Paso 17: Commit**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit --run
git add frontend/src/lib/board frontend/src/lib/revision/notas.ts frontend/src/lib/revision/notas.test.ts frontend/scripts/feedback-pull.ts frontend/src/app/api/board frontend/src/app/board frontend/src/components/board frontend/tests/board.spec.ts
git commit -m "feat(board): detalle de chat con timeline, caso y notas sobre producción"
```

---

## Tarea 10: Documentación y despliegue

**Files:**
- Modify: `frontend/.env.example`, `CLAUDE.md`, `docs/guia-arquitectura.md`, `docs/guia-codificacion-frontend.md`

- [ ] **Paso 1: Documentar las env nuevas**

Agregar a `frontend/.env.example`:

```bash
# Board de administración (/board) — auth por email autorizado
AUTH_SECRET=            # generar con: npx auth secret
ALLOWED_EMAILS=         # lista separada por comas; vacía = nadie entra (fail-closed)
RESEND_API_KEY=         # cuenta de Resend; el dominio de EMAIL_FROM debe estar verificado
EMAIL_FROM="Jurco <no-reply@tu-dominio.com>"

# Credencial de servicio del runner de escenarios (`pnpm escenario`).
# Ya no es una clave que un humano tipea: los humanos entran al board por email.
REVISION_CLAVE=
```

- [ ] **Paso 2: Actualizar `CLAUDE.md`**

En la tabla de documentación, agregar la fila del spec:

```markdown
| `docs/plans/2026-08-01-board-administracion.md` | Board interno `/board`: chats reales, métricas de uso y revisión, detrás de auth por email autorizado |
```

Agregar a la sección de gotchas:

```markdown
- Gotchas del board (2026-08-01): en Next 16 el archivo de middleware es `src/proxy.ts`, no `src/middleware.ts` — con el nombre viejo no se ejecuta y **no da error**, así que un gate copiado de otro proyecto deja la ruta abierta en silencio; el matcher del proxy cubre solo `/board/*` y `/api/board/*` (meter ahí el chat público tumba el producto, y meter `/api/revision/*` deja fuera al runner de escenarios, cuyo login es `POST /api/revision/acceso` y cuya credencial es un HMAC que el runtime Edge no puede verificar); `SUM()` sobre enteros en Postgres vuelve como `BigInt` de JS y hace explotar `JSON.stringify`, así que todo agregado numérico de métricas va casteado a `::float8`; `recharts` 2.x no soporta React 19 (peer `^18` hasta 2.15) — va la v3.
- Notas sobre conversaciones reales (2026-08-01): `crearNota` acepta un `alcance` que default a `"revision"` y mantiene el guard `esRevision: true`; **solo** `/api/board/conversaciones/[id]/notas` pasa `"chat-real"`. Si agregás una ruta que anote conversaciones de consultantes, declaralo explícito ahí — no borres el guard. `feedback:pull` ya trae ambos orígenes y prefija los reales con `[chat real]`.
```

- [ ] **Paso 3: Actualizar `docs/guia-arquitectura.md` §3.4**

Al final de la subsección "Identidad", agregar:

```markdown
**Dos identidades conviven** (desde 2026-08-01): el **consultante** del chat público, con la cookie anónima `ls_session` descrita arriba; y el **equipo interno** en `/board`, con sesión Auth.js (JWT 7 días) sobre allowlist `ALLOWED_EMAILS`. No se cruzan: el consultante nunca se persiste como `User`, y la sesión del board no habilita nada en el chat público. El runner de escenarios agrega una tercera credencial, de máquina, sobre `/api/revision/*`: la cookie `ls_experto` firmada con `REVISION_CLAVE`. Detalle en `docs/plans/2026-08-01-board-administracion.md`.
```

- [ ] **Paso 4: Actualizar `docs/guia-codificacion-frontend.md` §10**

Reemplazar el encabezado `## 10. Auth (Auth.js v5) — fase posterior` y su primer párrafo por:

```markdown
## 10. Auth (Auth.js v5)

**El chat público sigue sin auth**: identidad por cookie de sesión anónima (`lib/session.ts`, ver guía de arquitectura §3.4). El **board interno** (`/board`) sí tiene auth desde 2026-08-01, implementada así:

- Estrategia JWT (7 días), adapter Prisma, provider Resend (magic link), allowlist `ALLOWED_EMAILS` verificada en el callback `signIn` — fail-closed si la lista está vacía.
- `src/proxy.ts` (Next 16 renombró `middleware.ts`) con matcher acotado a `/board/*` y `/api/board/*`; la autorización real se repite server-side en cada page y handler.
- Config partida en `auth.config.ts` (edge-safe, sin Prisma) y `auth.ts` (adapter + provider), porque el proxy corre en el runtime Edge.
```

- [ ] **Paso 5: Correr la verificación completa**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit --run && pnpm test
```

Expected: todo verde. **Ningún claim de "listo" antes de ver esta salida.**

- [ ] **Paso 6: Commit**

```bash
git add frontend/.env.example CLAUDE.md docs/guia-arquitectura.md docs/guia-codificacion-frontend.md
git commit -m "docs(board): env, gotchas e identidades del board"
```

- [ ] **Paso 7: Desplegar en el orden del spec §7**

**El paso b antes del c — invertirlos deja al equipo legal sin acceso.**

a. Configurar en Railway: `AUTH_SECRET`, `ALLOWED_EMAILS`, `RESEND_API_KEY`, `EMAIL_FROM`. Confirmar que `REVISION_CLAVE` sigue seteada.
b. Desplegar, sumar los emails del equipo legal a `ALLOWED_EMAILS` y **verificar con al menos una persona del equipo legal que entra**.
c. Recién entonces avisar que `/revision` quedó redirigido a `/board/revision` y que la clave compartida ya no se usa desde el navegador.
d. Correr `pnpm escenario listar` contra producción para confirmar que el runner sigue autenticando.

---

## Notas para quien ejecuta

- **Orden estricto.** La Tarea 1 valida NextAuth v5 sobre Next 16, que es el riesgo que puede obligar a repensar el enfoque. La Tarea 2 protege el chat público. Si cualquiera de las dos falla, parar y reportar en vez de seguir.
- **El invariante `esRevision: false`** aparece en las Tareas 5, 6, 8 y 9. Cada vez que agregues una query sobre conversaciones, preguntate si pasa por `conversacionesReales()` o `JOIN_REALES`. Si no, la métrica está contando pruebas del equipo legal como si fueran consultantes.
- **Guards que se abren a propósito.** La Tarea 9 modifica dos protecciones existentes: el `esRevision: true` de `crearNota` y el filtro equivalente de `feedback-pull`. Las dos son intencionales y están justificadas en el spec §5.2. Se abren con un parámetro con nombre, nunca borrando el chequeo — si en la revisión ves un `crearNota` sin `alcance` explícito apuntando a una conversación real, es un bug.
- **Firmas de `lib/revision/*` verificadas** contra el código actual: `construirTimeline(threadId, { conSpans })`, `getCasoDeSesion(conversationId)`, `listarNotasDeSesion(conversationId)`, `NotaThread({ nota, onResponder, onResolver })`, `NotaComposer({ cita, onCancelar, onGuardar })`. Lo único sin verificar es el **método HTTP** del handler que resuelve una nota — el paso 13 de la Tarea 9 lo chequea antes de dar la tarea por buena.
- **Verificación antes de afirmar.** Ninguna tarea se reporta completa sin la salida del comando de test correspondiente pegada en el reporte.
