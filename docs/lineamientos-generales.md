# Lineamientos generales — LegalSeller

Este documento define las convenciones transversales del proyecto. Destila la experiencia de dos proyectos previos en producción (un backend de agentes Mastra y un frontend Next.js) y las adapta al dominio legal. Es la referencia por defecto: ante duda, se sigue lo que dice acá; ante conflicto entre reglas, se sigue la más estricta.

## 1. Stack tecnológico

| Capa | Tecnología | Notas |
|---|---|---|
| Runtime | Node.js >= 22 | Imágenes Docker en `node:24-alpine` |
| Package manager | pnpm (fijado en `packageManager`) | Nunca npm ni yarn |
| Lenguaje | TypeScript `strict: true` | ES Modules (`"type": "module"`) en el backend |
| Backend IA | Mastra v1 (`@mastra/core` y subpaquetes) | Server nativo de Mastra, sin Express/Hono propio |
| LLM | Vercel AI Gateway (`@ai-sdk/gateway`) | Un solo punto de acceso a todos los modelos |
| Frontend | Next.js (App Router) + React 19 | React Compiler activado |
| Base de datos | PostgreSQL + pgvector | Compartida entre servicios; Prisma en el frontend, `pg` directo en el backend |
| Validación | Zod v4 | Fuente de verdad de todos los contratos |
| Testing | Vitest (unit) + Playwright (e2e) + evals LLM | Tests unitarios colocados junto al código |
| Deploy | Railway + Docker multi-stage | Healthchecks obligatorios |

## 2. Idiomas y naming

Convención probada en los proyectos anteriores; se mantiene tal cual:

- **Código TypeScript (variables, funciones, clases): inglés, `camelCase`** — `searchDocumentsTool`, `buildTools()`, `makeLogger()`. Excepción: términos del dominio legal establecidos pueden quedar en español (`expediente`, `contrato`, `consulta`) cuando traducirlos genera ambigüedad.
- **IDs de Mastra (agentes, tools, workflows, skills) y nombres de archivo: `kebab-case` en español** — `buscar-documentos`, `agente-experto-legal.ts`.
- **Tipos e interfaces: `PascalCase`**; constantes `SCREAMING_SNAKE_CASE`; hooks `useCamelCase`; componentes React `PascalCase.tsx`; CSS Modules `kebab-case.module.css`.
- **Prosa user-facing y agent-facing (UI, prompts, mensajes de error al usuario): español.** Comentarios de código y mensajes de commit: inglés.
- **Tags XML en prompts: siempre en español** (`<rol>`, `<reglas>`, `<contexto>`, `<ejemplos>`). Nunca mezclar tags en inglés en contenido inyectado al modelo.

## 3. Principios esenciales

1. **Type safety obligatorio.** Prohibido `any`; usar `unknown` + Zod para datos externos. Funciones exportadas con tipo de retorno explícito.
2. **Zod como fuente de verdad.** Los contratos (inputs de tools, bodies de API, env, formularios) se definen como schema Zod y los tipos se derivan con `z.infer`.
3. **KISS / YAGNI.** Construir lo que el MVP necesita. Buscar patrones existentes en el repo antes de crear una abstracción nueva.
4. **Root cause sobre parches.** Ante un bug, entender la causa antes de proponer un fix. No acumular workarounds.
5. **Security first.** Autenticación y autorización siempre server-side. Ownership verificado en cada query (`where: { id, userId }`). Secretos solo en el server. Sanitizar todo contenido generado por LLM antes de renderizarlo como HTML.
6. **Sin `console.log` en código de producción.** ESLint lo bloquea. Usar el logger estructurado (ver guías de codificación). Excepciones: tests y scripts.
7. **Degradación graceful en tools de agentes.** Un error dentro de una tool no tira el proceso: se devuelve `{ status: "error", mensaje }` con un mensaje en español que el agente pueda comunicar al usuario.
8. **Errores accionables al arranque.** Env vars requeridas faltantes → `throw` con mensaje claro al iniciar, no fallos silenciosos en runtime.
9. **Mensajes de error de dos niveles.** El detalle técnico va al log; al usuario le llega un mensaje amigable en español, nunca el stack trace.
10. **Cambio mínimo coherente.** Cada cambio revisa su "radio de vecinos" (tests, docs, tipos afectados) pero no reescribe lo que no toca.
11. **Documentar decisiones.** Toda decisión de arquitectura no trivial deja un documento fechado en `docs/plans/` (specs y planes de implementación). Esto dio trazabilidad total en los proyectos anteriores.
12. **Sin archivos markdown temporales** sueltos en la raíz; los documentos viven en `docs/`.

## 4. Workflow de Git

- Ramas: `main` (producción) y `develop` (preproducción); trabajo en `feature/*`, `fix/*`, `hotfix/*`.
- **Nunca push directo a `main` ni `develop`**: siempre PR.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- **Antes de cada commit: `typecheck` (donde aplique) + `lint` + tests relevantes.** Pre-commit hooks con husky + lint-staged (ESLint `--fix` sobre archivos staged).
- Nunca commitear sin revisión del diff completo.

## 5. Variables de entorno

- `.env.example` **siempre actualizado y comentado** por secciones (una sección por servicio/integración, cada variable con comentario de propósito y ejemplo).
- Validación al arranque: el frontend valida en `instrumentation.ts`; el backend hace guard + `throw` con mensaje accionable en los módulos de config que consumen cada variable.
- Frontend: secretos sin prefijo (solo server); lo expuesto al browser con `NEXT_PUBLIC_`. Módulos server-only blindados con `import "server-only"`.
- Ninguna URL de servicio externo hardcodeada: siempre vía env con default sensato para desarrollo local.

## 6. Documentación del proyecto

Estructura de conocimiento (misma que funcionó en los proyectos previos):

- `CLAUDE.md` (raíz): fuente de verdad para asistentes de código — comandos, stack, reglas críticas, gotchas.
- `docs/lineamientos-generales.md` (este documento): convenciones transversales.
- `docs/guia-arquitectura.md`: arquitectura de servicios, flujo de datos, RAG.
- `docs/guia-codificacion-backend.md` y `docs/guia-codificacion-frontend.md`: patrones concretos de código.
- `docs/plans/`: specs y planes de implementación fechados (`YYYY-MM-DD-nombre.md`) — registro de decisiones.

Regla operativa: cuando se descubre un gotcha de producción (comportamiento no obvio de Mastra, Next, Prisma, etc.), se documenta en `CLAUDE.md` en el momento. Los ~60 gotchas acumulados del proyecto anterior fueron uno de sus activos más valiosos.

## 7. Calidad y testing (resumen)

- **Vitest** para lógica determinista: validadores, parsers, servicios, activación de reglas, state machines. Archivos `*.test.ts` junto al código que testean.
- **Playwright** para flujos visibles al usuario (e2e del frontend). Selectores por prioridad: `getByRole` > `getByText` > `getByTestId`; nunca CSS/XPath.
- **Evals con LLM-as-judge** para calidad de respuestas de agentes: datasets versionados por agente, scorers con juez barato, thresholds que bloquean el build para los criterios críticos (ver guía backend §9).
- El detalle de configuración vive en cada guía de codificación.
