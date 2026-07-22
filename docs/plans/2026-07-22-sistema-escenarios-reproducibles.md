# Sistema de escenarios reproducibles — spec (2026-07-22)

Mecanismo fijo para que el asistente técnico (Claude Code) reproduzca conversaciones
de prueba contra el sistema de forma **fiel a la interacción real, eficiente y con
introspección** — sin pasar por la UI. Complementa (no reemplaza) a `pnpm evals`
(gate de regresión) y a las sesiones de `/revision` del equipo legal (feedback
humano): esto es la herramienta de **diagnóstico y reproducción** ("reproducí el
caso X") del equipo técnico.

## 1. Decisiones de diseño

| Decisión | Elección | Motivo |
|---|---|---|
| Entorno objetivo | Configurable, **default prod** | El flujo habitual es probar en prod tras el merge; local queda para iterar sin gastar |
| Definición del usuario simulado | **Persona + guion base** | El guion da reproducibilidad; la persona (hechos del caso) permite improvisar en personaje cuando el agente repregunta fuera de guion |
| Validación | **Reporte + expectativas opcionales**, sin gate | El gate de CI sigue siendo `pnpm evals`; acá las expectativas se marcan CUMPLIDA/INCUMPLIDA como señal, no como corte |
| Punto de entrada | **Vía `/revision`** (endpoints de sesiones de revisión) | Mismo `orchestrateChatTurn` que el home; `esRevision: true` excluye la corrida de métricas y leads reales; el equipo legal la ve y anota con el sistema existente (cero UI nueva de feedback) |
| Visibilidad para el equipo legal | **Borrador por default, publicación explícita** | Iterar un escenario 10 veces no debe llenar el listado compartido; se publica la corrida curada |
| Proceso | **Skill `reproducir-escenario`** | El runner es la herramienta; la skill fija cómo se usa (consideraciones, análisis, triage de hallazgos) |

## 2. Escenarios: archivos versionados

`frontend/escenarios/<slug>.json` (git). Que el escenario viva en el repo es lo que
convierte "reproducí X" en un slug estable y no en una descripción ad-hoc.

```json
{
  "titulo": "Divorcio con hijos y desacuerdo por visitas",
  "descripcion": "Valida clasificación a divorcio-sociedad-conyugal, respaldo del corpus al explicar las vías de divorcio, y captación con contacto.",
  "persona": "Mariana Techera (ficticia), 38 años, Montevideo. Casada hace 11 años, dos hijos (6 y 9). Se separó de hecho hace un mes; el padre ve a los chicos de forma irregular y discuten por las visitas. No hay violencia. Trabaja como administrativa, el esposo es taxista. No sabe si necesita el acuerdo de él para divorciarse. Busca entender cómo arrancar y qué pasa con los hijos. Teléfono ficticio: 099 000 001.",
  "turnos": [
    "me quiero divorciar pero tenemos dos hijos chicos y no se como es",
    "el se puede negar? porque no quiere saber nada con divorciarse",
    "y con los nenes como queda el tema de las visitas?",
    "dale, me interesa que me contacte un abogado. soy Mariana, mi telefono es 099 000 001"
  ],
  "expectativas": {
    "clasificacion": { "categoria": "familia", "subcategoria": "divorcio-sociedad-conyugal" },
    "llamoBuscarDocumentos": true,
    "casoCaptado": true,
    "contactoRegistrado": true
  }
}
```

- Contrato como schema Zod en `frontend/scripts/escenario/schema.ts`;
  `persona` y `turnos` obligatorios, `expectativas` opcional y parcial.
- La `persona` incluye SIEMPRE datos de contacto **ficticios** — la corrida crea un
  `Caso` real en la base (excluido de métricas, pero existente).
- Los turnos se escriben en voz de consultante real (minúsculas, sin tildes a veces,
  coloquial) — la fidelidad incluye cómo escribe la gente.
- Expectativas soportadas en v1: `clasificacion` ({categoria, subcategoria?}),
  `llamoBuscarDocumentos` (al menos un tool-call en la corrida),
  `casoCaptado` (Caso.estado = CAPTADO), `contactoRegistrado` (algún campo de
  contacto no nulo).

## 3. Runner CLI

`frontend/scripts/escenario.ts` (tsx, sin imports de libs `server-only`; script
`"escenario": "tsx scripts/escenario.ts"` en `package.json`). HTTP puro contra el
entorno objetivo — no necesita `DATABASE_URL` ni el server local corriendo.

Comandos:

- `pnpm escenario correr <slug> [--url <base>] [--clave <clave>] [--publicar]`
  1. Autentica: `POST /api/revision/acceso` con `{ clave, nombre: "Asistente técnico" }`;
     captura la cookie de experto del `set-cookie`.
  2. Crea la sesión: `POST /api/revision/sesiones` con
     `{ titulo: "[escenario] <slug> — <fecha hora>", origen: "autonoma" }` →
     nace con `origenRevision: AUTONOMA` y `borrador: true`.
  3. Por cada turno del guion: `POST /api/revision/sesiones/:id/mensajes`
     (`{ message }`), parsea el SSE con la misma lógica tolerante de
     `frontend/src/utils/sse.ts` (texto en `payload.text`, tool-calls top-level
     `type: "tool-call"` con `payload.toolName`/`payload.args`), y mide latencia a
     primer byte y total. Ante `429`, espera `Retry-After` y reintenta una vez.
  4. Al final: `GET /api/revision/sesiones/:id` (extendido, ver §5) para el snapshot
     del Caso; evalúa expectativas; escribe el reporte (§4).
  5. Con `--publicar`, además `PATCH /api/revision/sesiones/:id { borrador: false }`.
- `pnpm escenario continuar <sesionId> --mensaje "..."` — agrega UN turno a una
  sesión existente (la vía de improvisación en personaje). Localiza la corrida por
  `sesionId` en `corridas/`, agrega el turno marcado `"origen": "improvisado"`,
  re-consulta el caso, re-evalúa expectativas y re-renderiza el reporte.
- `pnpm escenario publicar <sesionId>` — saca la corrida de borrador.
- `pnpm escenario listar [--borradores]` — sesiones autónomas del entorno objetivo
  (`GET /api/revision/sesiones?borradores=1` para incluir borradores).

Config: URL base por `--url` > `ESCENARIO_URL` > default
`https://frontend-production-1293.up.railway.app`. Clave por `--clave` >
`REVISION_CLAVE` (de `frontend/.env`; debe ser la del entorno objetivo).

Errores: degradación informativa, nunca stack pelado — clave incorrecta (401),
revisión no habilitada (503), sesión inexistente, SSE con evento de error o
respuesta vacía (se registra en el reporte como turno fallido y se corta la
corrida). Exit code 0 salvo error de ejecución — las expectativas incumplidas NO
cambian el exit code (no es un gate).

## 4. Reporte de corrida

`frontend/escenarios/corridas/<slug>/<timestamp>.json` + `.md` (gitignorados —
`frontend/escenarios/corridas/` en `.gitignore`; los escenarios sí se versionan).

JSON (fuente de análisis):

```json
{
  "escenario": "divorcio-con-hijos-visitas",
  "url": "https://frontend-production-1293.up.railway.app",
  "sesionId": "…", "conversationId": "…", "inicio": "2026-07-22T…",
  "turnos": [
    {
      "n": 1, "origen": "guion",
      "usuario": "me quiero divorciar pero…",
      "respuesta": "…texto completo del agente…",
      "toolCalls": [
        { "toolName": "asignar-clasificacion", "args": { "categoria": "familia", "subcategoria": "divorcio-sociedad-conyugal", "brief": "…" } },
        { "toolName": "buscar-documentos", "args": { "consulta": "…", "subcategorias": ["divorcio-sociedad-conyugal"] } }
      ],
      "latenciaPrimerByteMs": 850, "latenciaTotalMs": 9200
    }
  ],
  "expectativas": [
    { "clave": "clasificacion", "esperado": { "categoria": "familia", "subcategoria": "divorcio-sociedad-conyugal" }, "obtenido": { "categoria": "familia", "subcategoria": "divorcio-sociedad-conyugal" }, "cumplida": true }
  ],
  "caso": { "estado": "CAPTADO", "categoria": "familia", "subcategorias": ["divorcio-sociedad-conyugal"], "contactoNombre": "Mariana Techera", "contactoTelefono": "099 000 001", "resumen": { "…": "…" }, "eventos": [ { "tipo": "CLASIFICACION", "createdAt": "…" } ] }
}
```

El `.md` es el mismo contenido legible (transcript con tool-calls intercalados,
tabla de expectativas, snapshot del caso) — para el usuario y para adjuntar en
discusiones. El análisis (errores e ineficiencias) NO lo hace el runner: lo hace
el asistente leyendo el reporte, guiado por la skill (§7).

## 5. Cambios de schema y API

Prisma (`frontend/prisma/schema.prisma`):

```prisma
enum RevisionOrigen {
  EXPERTO
  AUTONOMA
}

model Conversation {
  // … campos existentes …
  /// Quién originó la sesión de revisión (null = conversación normal del home).
  origenRevision RevisionOrigen?
  /// Corrida autónoma aún no publicada: fuera del listado del equipo legal.
  borrador       Boolean         @default(false)
}
```

Migración: backfill `origenRevision = 'EXPERTO'` donde `esRevision = true`.

API (todas detrás de la cookie de experto existente):

- `POST /api/revision/sesiones` — body acepta `origen?: "autonoma"`. Presente →
  `origenRevision: AUTONOMA, borrador: true`; ausente → `EXPERTO, borrador: false`
  (las sesiones de expertos nunca son borrador).
- `GET /api/revision/sesiones` — por default excluye borradores; `?borradores=1`
  los incluye (para `pnpm escenario listar`). El resumen expone `origenRevision`
  y `borrador`.
- `GET /api/revision/sesiones/:id` — respuesta extendida con `caso` (estado,
  categoria, subcategorias, resumen, contacto, eventos) y los campos nuevos de la
  sesión. Sirve al runner y habilita a la UI a mostrar el estado del caso si se
  quiere más adelante.
- `PATCH /api/revision/sesiones/:id` — body Zod `{ borrador: false }` (publicar).
  Único campo mutable en v1.

`listarSesionesRevision()` / `crearSesionRevision()` / `getSesionRevision()` en
`frontend/src/lib/revision/sesiones.ts` se extienden acorde.

## 6. UI de `/revision` (cambio mínimo)

En el listado compartido, las sesiones con `origenRevision: AUTONOMA` muestran un
badge "Generada por el asistente técnico" (junto a `creadaPor`). Nada más: abrir la
sesión, leer la timeline y dejar notas funciona sin cambios, y las notas sobre
corridas autónomas entran solas en `pnpm feedback:pull` → skill
`revisar-feedback-legal`.

## 7. Skill `reproducir-escenario`

`.claude/skills/reproducir-escenario/SKILL.md` — fija el proceso cuando el equipo
pide "reproducí el caso X" o "probá el sistema como usuario". Mismo formato que las
skills existentes (frontmatter + anuncio + checklist por fases + red flags).

Contenido (resumen; la redacción final vive en la skill):

- **Anunciar al inicio** y crear un todo por fase.
- **Fase 1 — Resolver el escenario**: buscar el slug en `frontend/escenarios/`;
  si no existe, crear el archivo siguiendo §2 (persona con hechos concretos
  uruguayos y contacto ficticio; guion de 3-6 turnos en voz de consultante;
  expectativas solo sobre lo que el escenario viene a validar).
- **Fase 2 — Precondiciones**: confirmar el entorno objetivo (default prod) y que
  lo que se quiere probar esté **deployado** (estado del deploy en Railway) antes de
  leer la corrida como señal — reproducir contra prod un cambio que aún no llegó es
  el falso-negativo clásico. Verificar `REVISION_CLAVE` del entorno objetivo.
- **Fase 3 — Correr e improvisar**: `pnpm escenario correr <slug>`. Si el agente
  pregunta algo fuera del guion, responder con `continuar` EN PERSONAJE: solo hechos
  de la `persona`; si falta un hecho, definirlo con criterio y **actualizar la
  persona en el archivo del escenario** (la próxima corrida lo tiene); nunca romper
  la cuarta pared ni "ayudarle" al agente con lenguaje técnico-legal que un
  consultante no usaría.
- **Fase 4 — Analizar el reporte** (la introspección es el punto del mecanismo):
  - Clasificación: ¿correcta y oportuna (primer turno con señal suficiente)?
  - Respaldo: ¿cada afirmación normativa tiene un `buscar-documentos` previo con
    filtros correctos (categoria/subcategorias)? ¿Afirmó algo que la tool no trajo?
  - Captación: ¿`registrar-caso` proactivo? ¿Contacto registrado, Caso en el estado
    esperado, brief fiel a la conversación?
  - Voz: ¿referencias internas ("documento", "corpus", títulos), referencias a la
    UI, frase institucional Jurco ante la pregunta por el origen?
  - Ineficiencias: búsquedas redundantes (misma consulta repetida), turnos de más
    para captar, latencias anómalas por turno.
- **Fase 5 — Cierre**: resumen de hallazgos con evidencia (turno + tool-call);
  triage de cada problema con el mismo árbol que `revisar-feedback-legal`
  (rule · skill · RAG · eval · pregunta enviable al equipo legal · bug de código —
  las dudas de dominio legal NUNCA se resuelven por cuenta propia); publicar la
  corrida (`pnpm escenario publicar`) solo si aporta al equipo legal — las corridas
  de debugging quedan borrador.
- **Red flags**: leer una corrida contra prod sin verificar el deploy; improvisar
  hechos que contradicen la persona; publicar corridas de debugging; tratar las
  expectativas como gate; convertir un hallazgo de dominio legal en fix sin pasar
  por la pregunta al equipo.

## 8. Testing

- Unit (vitest, frontend): evaluador de expectativas (JSON de corrida sintético →
  CUMPLIDA/INCUMPLIDA por clave), render del `.md`, schema Zod del escenario
  (válido/ inválido), y los cambios de rutas (`sesiones` POST con `origen`,
  GET con `caso`, PATCH publicar) en los tests de rutas existentes.
- El parser SSE ya tiene tests (`sse.ts`); el runner lo reutiliza sin duplicar.
- Smoke del runner end-to-end contra local: parte del plan de implementación, no
  test automatizado (requiere stack completo corriendo).

## 9. Fuera de alcance (deliberado)

- Replay de conversaciones reales de usuarios (evolución natural si aparece la
  necesidad de reproducir un bug de producción con transcript real).
- Borrado de corridas borrador (se acumulan invisibles en la DB; si molesta, se
  agrega `pnpm escenario borrar` — implica borrar también el thread de Mastra).
- Comparación automática entre corridas del mismo escenario.
- Modo home anónimo (cookie de sesión del home) — el pipeline es el mismo
  `orchestrateChatTurn`; solo se justificaría para auditar la mecánica de
  cookie/rate-limit del home.

## 10. Documentación a actualizar

- `CLAUDE.md`: comando `pnpm escenario` en la sección Comandos, y la skill
  `reproducir-escenario` en la lista de skills obligatorias (regla SIEMPRE:
  reproducir escenarios con la skill).
- `docs/guia-codificacion-frontend.md`: sección breve sobre el runner si el
  patrón lo amerita al implementarlo.
