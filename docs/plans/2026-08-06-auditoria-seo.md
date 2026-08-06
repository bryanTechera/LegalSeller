# Auditoría SEO — dudaya.com — 2026-08-06

Auditoría técnica y estratégica del frontend público. Corrida sobre `origin/main`
(e46216d) y contra el sitio en producción.

**Alcance acordado con el equipo:**

- El contenido de `backend/corpus/` **no se publica ni se indexa** (decisión del
  2026-08-06). Toda propuesta de contenido de este informe es material **original
  escrito para buscadores**, no derivado del corpus.
- La aplicación se llama **DudaYa**. El código todavía dice "Jurco" en todos lados;
  eso es un hallazgo, no el estado deseado.

**Estado de implementación (2026-08-06):** la **Ola 1 está implementada** en la rama
`worktree-auditoria-seo` — rebrand a DudaYa en todo el stack, metadata completa,
`noindex` en las rutas internas y los tres fixes de rendimiento. Medido sobre el
build: el payload inicial del home bajó de **355,2 a 263,4 KB gzip (−26%)**. Las
acciones sobre producción (CDN, `www`, Search Console) están en
[2026-08-06-seo-ola-1-checklist-produccion.md](2026-08-06-seo-ola-1-checklist-produccion.md).
Las olas 2 y 3 siguen pendientes.

---

## 1. Veredicto

El sitio está técnicamente sano y comercialmente invisible.

No hay nada roto: el home es estático, se sirve desde el prerender, los headers de
seguridad están bien puestos, `http` redirige a `https`, el 404 devuelve 404 de
verdad y nada bloquea a Googlebot. Ese es exactamente el problema. **Google puede
entrar sin obstáculos a un sitio que tiene una sola URL con 103 palabras.**

El producto vive de que una persona con un problema legal en Uruguay lo encuentre
—"cuánto me corresponde por despido", "plazos de desalojo por mal pagador",
"hasta cuándo puedo reclamar la paternidad"—, y hoy no existe una sola URL a la que
Google pueda mandar ninguna de esas consultas. El funnel del producto (escuchar →
evacuar dudas → captar el caso → derivar) está bien construido de la mitad para
abajo y no tiene boca de entrada.

Lo segundo más importante es más barato: **el sitio se presenta con la marca vieja**.
El dominio dice `dudaya.com` y el `<title>` que sirve Google dice `Jurco`.

No hay una penalización que levantar ni un desastre técnico que reparar. Hay que
construir la superficie que todavía no existe, y ordenar la casa antes de construirla.

---

## 2. Método

Siete auditores en paralelo (metadata, indexación, datos estructurados, contenido,
rendimiento, renderizado, infra) sobre el código, más un verificador adversarial por
dimensión cuyo mandato era refutar, más un crítico de completitud. 15 agentes,
~50 min, 61 hallazgos brutos.

**Ninguno de los 61 fue refutado de plano, pero 43 salieron matizados** — casi
siempre porque el auditor describía el síntoma donde la causa era estructural. Este
informe usa los enunciados corregidos y consolida por causa raíz, no por dimensión:
los 61 hallazgos colapsan en 12 problemas reales.

En paralelo verifiqué en producción con `curl` y sobre el build local todo lo que era
medible de primera mano. **Lo que sigue distingue explícitamente lo medido de lo
estimado.** Los números sin aclaración están medidos.

---

## 3. Lo que ya está bien

Vale decirlo antes de la lista de problemas, porque acota el trabajo:

- El home es estático (`○` en el build, `x-nextjs-cache: HIT`, `x-nextjs-prerender: 1`)
  y no toca la base para renderizar.
- El HTML inicial **sí** trae el hero y las cuatro preguntas sugeridas. `ChatPanel` es
  `"use client"` pero se prerenderiza: no hay `ssr:false` en ningún lado. Un crawler ve
  el texto, no un div vacío.
- `http://` → 301 a `https://`. El 404 devuelve 404 real con `noindex` automático.
  Los redirects de trailing slash están (308).
- Headers de seguridad correctos y verificados en vivo (HSTS, CSP, `X-Frame-Options`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`).
- Las fuentes van self-hosted por `next/font` con `display: swap`: sin `<link>` a
  `fonts.googleapis.com` bloqueando el render.
- El favicon está resuelto por convención de archivo (`app/icon.svg`). Declarar
  `metadata.icons` sería peor: pisaría la convención.
- `/board/*` está gateado por [proxy.ts](../../frontend/src/proxy.ts) y devuelve 307 a login.

---

## 4. Hallazgos

Ordenados por impacto sobre el negocio, no por dificultad.

### 4.1 — CRÍTICO · Una sola URL indexable

**Medido.** El App Router tiene 8 `page.tsx`. Solo `/` tiene contenido de producto.
`/login` y `/login/check-email` son el acceso al back-office; `/revision` es un
`redirect()`; las cuatro de `/board` son internas.

El HTML del home trae **103 palabras / 644 caracteres** de texto visible. El `h1` es
el wordmark de la marca. El home **no emite un solo `<a>`**: un crawler entra y no
tiene a dónde ir.

Consecuencia: el sitio compite por exactamente una consulta posible, el nombre de
marca, que nadie con un problema de despido escribe en Google. Sin superficie no hay
canal orgánico, y todo el tráfico tiene que comprarse.

Los otros seis auditores llegaron a esta misma causa por caminos distintos
("superficie rastreable de una URL", "sin superficie para FAQPage", "home sin
contenido legal en el HTML", "sin enlazado interno", "cobertura de intención 4 de 18").
Es un solo problema visto seis veces.

**Qué hacer.** Construir la capa de contenido. Con el corpus fuera de alcance, se
escribe original, y eso tiene tres piezas de distinto costo y ROI:

| Pieza | Qué es | Por qué |
|---|---|---|
| **Calculadoras** | "Calculadora de indemnización por despido", "de licencia y salario vacacional" | Máximo ROI. Intención altísima, se enlazan solas, y la lógica es una fórmula de ley — no reproduce doctrina de nadie. El análisis de referencia ([2026-07-19-analisis-referencia-alex-ai.md:59](2026-07-19-analisis-referencia-alex-ai.md)) ya las tenía en el radar |
| **Landings por categoría/subcategoría** | 5 hubs de categoría + 18 de subcategoría habilitada, escritas para la consulta real | Es la cobertura de intención. Cada una encuadra el problema en lenguaje llano y cierra con el chat como CTA |
| **Páginas de confianza** | Ver 4.3 | Prerrequisito YMYL: sin esto lo demás rankea peor |

Las landings tienen una dependencia que no es técnica: las escribe alguien y **las
valida el equipo legal**. Es el cuello de botella real del proyecto, no el código.

### 4.2 — ALTO · La marca en producción es la vieja

**Medido.** El sitio se sirve desde `dudaya.com` y el `<title>` dice `Jurco`.
198 ocurrencias en el repo, 74 en `frontend/src` + `backend/src`.

| Dónde | Qué expone |
|---|---|
| [layout.tsx:18-19](../../frontend/src/app/layout.tsx) | el `<title>` y el `template` — la superficie SEO más visible |
| [page.tsx:12,19](../../frontend/src/app/page.tsx) | el `h1` del home y el disclaimer del footer |
| [MessageBubble.tsx:33](../../frontend/src/components/chat/MessageBubble/MessageBubble.tsx) | la firma del asistente en **cada** respuesta |
| [login/page.tsx:23](../../frontend/src/app/login/page.tsx), [check-email/page.tsx:11](../../frontend/src/app/login/check-email/page.tsx), [Sidebar.tsx:23](../../frontend/src/components/board/BoardShell/Sidebar.tsx) | pantallas internas |
| [mailer.ts:62](../../frontend/src/lib/board/mailer.ts) | asunto del magic link |
| [identidad-jurco.ts](../../backend/src/mastra/dominios/comunes/rules/identidad-jurco.ts) | la identidad que el agente declara al consultante |

Para SEO importa por tres razones concretas: las búsquedas de marca ("dudaya",
"duda ya uruguay") no encuentran coincidencia en la página; Google construye el
*site name* del SERP a partir del `<title>`, el `og:site_name` y el nodo `WebSite`
—los tres ausentes o equivocados—; y cualquier cosa que se haga de autoridad de marca
antes de unificar el nombre hay que rehacerla.

**Qué hacer.** Unificar antes de invertir en marca. Ojo con `identidad-jurco`:
renombrar la rule arrastra `CRITICAL_RULE_IDS` y los tests de instructions, así que
es su propia tarea con sus propios evals, no un `sed` global.

### 4.3 — ALTO · Cero señales E-E-A-T y sin páginas legales

**Verificado por ausencia.** No existe `/quienes-somos`, `/privacidad`, `/terminos`
ni `/contacto`. Tampoco existe `frontend/public/`.

Este es un producto YMYL en el sentido más literal: despido (dinero), pensión
alimenticia (dinero y familia), violencia de género (integridad física). Google
pondera fuerte, en ese nicho, quién produce el contenido y quién responde por él. El
único texto institucional del sitio son dos líneas de footer, y dicen qué el sitio
**no** es —"no sustituye el asesoramiento de un abogado"—, o sea señal de limitación,
no de autoridad.

Hay una arista que excede al SEO y conviene no perder: el chat capta nombre, teléfono
y email de personas en situación vulnerable, y **no hay aviso de privacidad ni
mención de la Ley 18.331 en todo el proyecto**. Además, lo único que hoy se le promete
al consultante es "tus conversaciones no se usan para entrenar modelos de IA" — cierto,
pero no cubre que un equipo humano las lee y las anota en `/revision`. Eso es un tema
de cumplimiento antes que de posicionamiento.

**Qué hacer.** Cuatro páginas estáticas con `metadata` propia, enlazadas desde un
footer real. `/privacidad` y `/terminos` se redactan con el equipo legal contra la
Ley 18.331. En las landings, bloque de autoría visible ("Revisado por X, fecha") y
`dateModified` en el JSON-LD: en un nicho donde la ley cambia, la frescura es señal.

### 4.4 — ALTO · Cero medición

**Verificado por ausencia.** Sin GA4, sin Search Console, sin Plausible, sin
`verification` en metadata, sin campo de `referrer`/`utm`/`landing` en
`model Conversation`.

El board mide el funnel de la mitad para abajo (iniciadas → clasificadas → captadas)
y está ciego de la mitad para arriba: hoy es imposible saber si Google manda 0 o
10.000 sesiones. Sin Search Console tampoco se puede enviar un sitemap, ver qué está
indexado ni —lo más valioso— leer los queries reales del dominio legal uruguayo, que
son el insumo para decidir qué categoría de `dominio-consultas.md` conviene habilitar
próximo.

**Trampa concreta:** la CSP actual (`script-src 'self'`, `connect-src 'self'`)
**bloquea GA4 y GTM**. La instalación va a fallar en silencio si nadie toca
[next.config.ts:13-21](../../frontend/next.config.ts). Search Console por meta tag o
por TXT en DNS esquiva la CSP; por archivo HTML no, porque el Dockerfile no copia
`public/` (ver 4.9).

**Qué hacer.** Search Console primero (gratis, inmediato, y es el único que da
queries). Analítica después: Plausible o Umami self-hosted bajo el propio dominio
evitan el banner de cookies y el problema de CSP a la vez. Barato y de alto valor:
`referrer` + `landing` en `Conversation` para cruzar origen contra casos captados en
el board que ya existe.

### 4.5 — ALTO · Rendimiento: tres costos medidos

Los tres son de la ruta crítica del home y los tres son fixes de pocas líneas.

**a) 117.520 B de fuentes preloadeadas a prioridad alta.** Tres familias
(Open Sans, Poppins ×3 pesos, Source Serif 4 variable 200-900), las tres con
`preload` implícito. Solo Open Sans pinta el cuerpo. Dejando `preload: false` en las
otras dos y fijando `weight: "600"` en la serif, la ruta crítica baja a **42.964 B**.

**b) `react-markdown` + `remark-gfm` en el arranque: 42,7 KB gzip, el 21,6% del JS
del home.** Es el último script en terminar (177 → 2005 ms en perfil móvil
throttleado), o sea que la hidratación espera al parser de markdown **para renderizar
cero mensajes**: las tarjetas de sugerencia no responden hasta ~2,2 s. Se difiere con
`next/dynamic` desde `ChatPanel` — el chunk se pide con la primera respuesta del
agente, cuando el usuario ya está esperando al LLM y el costo percibido es nulo.
Detalle que importa: el `dynamic()` tiene que llevar `loading: () => null` propio, si
no la suspensión burbujea hasta `app/loading.tsx` y blanquea la página entera.

**c) El fade de 400 ms sobre `.hero` cuesta ~430 ms de LCP.** Medido en A/B sobre el
build real bajo throttling móvil (n=4 por rama, única variable el
`prefers-reduced-motion` emulado): 432/424/440/172 ms con fade contra 0/0/0/0 sin él.
La animación corre en el compositor y el subárbol recién se vuelve elegible cuando
termina. Peor: en desktop sin throttling el LCP quedó atribuido a un `<p>` del footer,
así que el fade además **corrompe la atribución de campo**. Fix: sacar el `<h2>` del
fade y animar solo lo secundario.

Contexto: el home entrega hoy 232 KB gzip de JS en 12 chunks + 115 KB de fuentes.

### 4.6 — ALTO · El `<head>` está prácticamente vacío

**Medido.** Cinco líneas de metadata en total: un `title` de 5 caracteres y una
`description` de 73. Un grep por
`metadataBase|alternates|openGraph|twitter|robots|manifest|applicationName|viewport|themeColor|generateMetadata`
sobre todo `frontend/src` devuelve **un único match**: la línea `export const metadata`
del layout raíz.

Sin `metadataBase`, cualquier Open Graph que se agregue después sale con URLs
relativas y rotas — por eso este ítem va antes que "agregar OG", no después. Hoy un
link a `dudaya.com` compartido por WhatsApp —el canal donde se comparte una consulta
legal en Uruguay— se ve como texto pelado.

También faltan `canonical`, `noindex` en las rutas internas públicas (ver 4.7),
`es-UY` en vez de `es`, y `apple-icon`/`manifest`/`themeColor`.

Nota: **no** hay que agregar `keywords` (Google lo ignora desde 2009) ni hay
`viewport`/`themeColor` mal ubicados dentro de `metadata` — el proyecto no arrastra
ese antipatrón deprecado.

Esto no es una recomendación externa: [guia-codificacion-frontend.md §12](../guia-codificacion-frontend.md)
ya prescribe `metadataBase`, `title.template`, OG/Twitter, `sitemap.ts`, `robots.ts`,
`manifest.ts`, JSON-LD con `schema-dts` y `es-UY`. **Es el estándar propio del proyecto
sin cumplir.**

### 4.7 — MEDIO · Rutas internas indexables

**Medido en producción.** `/login` → 200, `/login/check-email` → 200, `/revision` → 200.
Ninguna tiene `robots: { index: false }`. `/board` sí redirige (307), que alcanza.

No es urgente —nada las enlaza, así que Google difícilmente las descubra— pero son la
puerta del back-office apareciendo en un SERP de marca, y el fix es una línea de
`metadata` por ruta.

### 4.8 — MEDIO · Origen en Ámsterdam y CDN apagado

**Medido.** TTFB de 0,76 a 0,91 s desde acá. El auditor de infra lo explicó con la API
de Railway: los tres servicios corren en `europe-west4-drams3a` (**Ámsterdam**) para
una audiencia uruguaya; el edge termina TLS en Miami (`x-railway-edge: mia1`) y
reenvía por el Atlántico. El sobrecosto atribuible a la región es aproximadamente un
RTT atlántico (~110-150 ms), no el TTFB completo.

Además el HTML sale con `cache-control: s-maxage=31536000` y **nadie lo consume**: el
CDN de Railway está apagado (ninguna respuesta trae `x-cache` ni `age`). El header no
está de más — es justamente el que el modo Auto del CDN necesita.

Y **brotli no está soportado**: verificado pidiendo `Accept-Encoding: br` a secas, el
servidor responde **sin comprimir** (14.096 B); con gzip da 3.402 B. Los navegadores
reales mandan `br, gzip` y caen en gzip, así que el costo es el delta gzip→brotli
(~15%), no el total.

**Qué hacer, en ese orden:** prender el CDN (gratis, un toggle, sin tocar DNS ni
código) y recién después evaluar mover la región a `us-east4`.

### 4.9 — MEDIO · Tres trampas que aparecen recién al implementar

Estas no son problemas hoy. Son las que van a hacer perder una tarde cuando se
encare la capa de contenido, y por eso están acá.

**a) Agregar un enlace interno rompe el chat.** El historial vive solo en
`useState` ([useChatStream.ts:32](../../frontend/src/hooks/useChatStream.ts)) y no hay
rehidratación, pero del lado servidor la conversación **sí** persiste (cookie
`ls_session` de un año, atada al thread). En cuanto exista un `<Link>` a una landing,
un usuario a mitad de conversación que navega y vuelve ve un chat en blanco — y al
escribir, el agente le responde con la memoria de lo que él ya no ve. En un funnel
donde la conversión depende de sentirse escuchado, eso rompe la confianza justo en el
paso de captación. Hay que resolverlo **antes** de enlazar, no después.

**b) No hay forma de pasarle una consulta al chat desde una URL.** Las preguntas
sugeridas viajan por un `onClick`, nunca por una URL. Sin un `?q=`, el CTA de toda
landing es "andá al home y volvé a escribir tu pregunta", que es exactamente donde se
cae la conversión. El fix tiene un costo a evitar: leer `searchParams` en `page.tsx`
dinamiza el home y le saca el prerender. Se resuelve leyéndolo con `useSearchParams()`
dentro de `ChatPanel` (que ya es cliente) envuelto en `<Suspense>`.

**c) Un `sitemap.ts` o rutas por categoría rompen el `docker build`.** La etapa
builder es `COPY . . && pnpm run build` sin `DATABASE_URL` ni backend Mastra
alcanzable, y las migraciones corren *después* (`preDeployCommand`). Next ejecuta
`sitemap.ts` y `generateStaticParams` **en build**: la implementación natural
—consultar la taxonomía— falla en CI con un error de fetch que no menciona SEO por
ningún lado. La taxonomía tiene que salir de un módulo TypeScript en el checkout,
verificado contra `GET /dominios` por un test, no por la red durante el build.

**Bonus relacionado:** el Dockerfile no copia `public/` y el directorio no existe.
Cualquier archivo estático sin convención de App Router (`ads.txt`, verificación HTML
de Bing) va a andar en `pnpm dev` y dar 404 en producción, sin error de build.
`robots.ts`, `sitemap.ts` y `opengraph-image.tsx` **no** están afectados: se compilan
dentro de `.next` y sí llegan a la imagen. O sea: usar siempre las convenciones del
App Router, nunca `public/`.

### 4.10 — MEDIO · Cero datos estructurados

No hay un solo `application/ld+json` en el repo. Con una sola URL el impacto real es
bajo — por eso no está más arriba —, pero se vuelve relevante en cuanto existan las
landings, y conviene decidirlo ahora porque condiciona el `metadataBase` y el host
canónico de los `@id`.

Lo que corresponde: `Organization` + `WebSite` en el layout raíz, `BreadcrumbList` por
nivel, y `FAQPage` en las landings armadas como pregunta/respuesta. Lo que **no**:
`LocalBusiness` (no hay dirección física verificable) ni `AggregateRating` (no hay
ratings reales — inventarlos es penalizable). La CSP actual permite JSON-LD sin
cambios, porque `script-src 'self' 'unsafe-inline'` cubre el script inline.

### 4.11 — DECISIÓN PENDIENTE · Crawlers de IA

No hay `robots.txt` (404), así que hoy **todos los crawlers están permitidos por
default**, incluidos los de IA. No hay `llms.txt`.

Esto no es un default técnico que se resuelve copiando un archivo: este producto
compite por la misma consulta que ChatGPT y Perplexity ya responden. Aparecer citado
como la fuente uruguaya de esa respuesta es un canal de adquisición distinto del SEO
clásico. La reacción instintiva —bloquear a los bots de IA "porque son la
competencia"— cierra ese canal.

Un dato que simplifica la decisión: **como el corpus no se publica, no hay nada que
scrapear**. El activo diferencial queda en la base privada pase lo que pase, así que
permitir agentes de citación no tiene contrapartida. Vale la pena separar en el
`robots.ts` los agentes de citación (permitir) de los de entrenamiento (a decidir).

### 4.12 — MEDIO · Fuera de alcance: `www` y Postgres

Dos cosas que aparecieron y no son SEO, pero no las dejo sin decir:

- **`www.dudaya.com` corta la conexión.** Tiene DNS apuntando a Railway pero no está
  dado de alta como custom domain, así que el edge sirve el certificado wildcard
  `*.up.railway.app` y el navegador rechaza. No afecta indexación (Google no rastrea
  un host que nada enlaza) pero pierde a quien tipea `www.`, y por el
  `includeSubDomains` del HSTS el error es **no salteable** para quien ya visitó el
  apex. Alta del dominio en Railway, redirect 301 a apex.
- **La Postgres de producción tiene proxy TCP público y dominio HTTP.** Se abrió para
  la ingesta puntual del 2026-07-21 y quedó abierto. Es un tema de seguridad, no de
  SEO; lo dejo señalado acá porque salió en esta corrida.

---

## 5. Plan sugerido

Tres olas. La primera no necesita decisiones de nadie; la tercera es la que mueve el
negocio y la que más depende de gente fuera del equipo técnico.

### Ola 1 — Ordenar la casa — IMPLEMENTADA (código) / PENDIENTE (producción)

1. ~~Unificar la marca a **DudaYa**~~ (4.2). Hecho en todo el stack. El nombre ahora
   sale de una constante única por servicio (`backend/src/mastra/dominios/comunes/marca.ts`
   y `frontend/src/lib/marca.ts`), así el próximo cambio es una línea y no 198. La
   rule `identidad-jurco` pasó a `identidad-marca`.
2. ~~`metadataBase`, `title`, `description`, `canonical`, `openGraph`/`twitter` con
   `opengraph-image.tsx`, `lang="es-UY"`~~ (4.6). Hecho y verificado sobre el HTML
   construido.
3. ~~`noindex` en las rutas internas~~ (4.7). `/login` y `/login/check-email` emiten
   `noindex, nofollow`. `/revision` ya no es una página: pasó a redirect **308** de
   config, verificado en runtime — antes servía un 200 con body vacío, que para un
   crawler es una página delgada indexable y no una mudanza.
4. ~~Los tres fixes de rendimiento~~ (4.5). Payload inicial del home: **355,2 →
   263,4 KB gzip**. Detalle en §5.1.
5. Prender el CDN de Railway (4.8) — **pendiente, consola de Railway**.
6. Alta de `www` + redirect (4.12) — **pendiente, consola de Railway**.
7. Search Console (4.4) — **pendiente**, verificar por TXT en DNS.

#### 5.1 — Deltas medidos de la Ola 1

| Métrica (home) | Antes | Después | Delta |
|---|---|---|---|
| JS gzip | 232,1 KB (12 chunks) | 192,4 KB | **−39,7 KB (−17%)** |
| Fuentes precargadas | 117,5 KB (5 archivos) | 62,9 KB (2 archivos) | **−54,6 KB (−46%)** |
| CSS gzip | 8,1 KB | 8,0 KB | — |
| **Payload inicial** | **355,2 KB** | **263,4 KB** | **−91,8 KB (−26%)** |
| HTML | 14.069 B | 16.253 B | +2,2 KB (metadata nueva) |

Dos desvíos deliberados respecto de lo que recomendaba la auditoría, con su razón:

- **Source Serif 4 conserva su `preload`.** La auditoría proponía sacárselo junto con
  el de Poppins, pero `.heroTitle` —el elemento LCP medido— se renderiza con esa
  serif. Sacarle el preload adelantaría el paint con el fallback a costa de un swap
  visible en el titular. El ahorro de bytes se consiguió igual clavándola al único
  peso que usa el CSS (600) en vez del archivo variable 200-900. Poppins sí perdió el
  preload, y de paso el peso 500, que no aparece en ninguna hoja de estilos.
- **`/revision` es un redirect, no un `noindex`.** Para una URL que solo existe para
  mandarte a otro lado, un 308 es estrictamente mejor que pedirle a Google que no
  indexe una página vacía.

Una trampa encontrada al implementar, que vale documentar: **Next mergea la metadata
campo a campo del nivel superior, no en profundidad**. Declarar `openGraph: { url: "/" }`
en `app/page.tsx` borró de un saque el `siteName`, el `type` y el `locale` que venían
del layout. Se detectó leyendo el HTML construido, no el código.

### Ola 2 — Preparar el terreno (habilita la ola 3)

Nada de esto se ve, y sin esto la ola 3 se hace dos veces.

8. Resolver la persistencia del chat ante navegación (4.9a) — **bloqueante** para
   enlazar cualquier cosa.
9. Deep-link `/?q=` vía `useSearchParams` en `ChatPanel` (4.9b). De paso, las cuatro
   preguntas sugeridas se vuelven los primeros `<a>` reales del sitio.
10. Módulo de taxonomía en el checkout + test contra `GET /dominios` (4.9c).
11. `robots.ts` y `sitemap.ts` con la política de crawlers ya decidida (4.11).
12. `Organization` + `WebSite` en JSON-LD (4.10).
13. Analítica y `referrer`/`landing` en `Conversation` (4.4).

### Ola 3 — Construir la superficie (lo que mueve la aguja)

14. Las cuatro páginas de confianza y legales (4.3). `/privacidad` con el equipo legal.
15. La primera calculadora — indemnización por despido. Es el mayor ROI del informe:
    intención altísima, se enlaza sola, y no toca el corpus.
16. Las landings por categoría/subcategoría, escritas originales y validadas por el
    equipo legal. Arrancar por laboral/despido y familia, que son las de mayor volumen
    de consulta.

---

## 6. Decisiones que no son técnicas

Tres cosas que este informe no puede resolver solo:

- **Quién escribe y valida las landings.** Es el cuello de botella real de la ola 3.
  El proyecto ya tiene el canal (`docs/preguntas-legales/`), pero esto no es una duda
  puntual: es producción de contenido sostenida con revisión profesional.
- **La política de crawlers de IA** (4.11). Es una decisión de estrategia de canal.
- **Qué se le promete al consultante sobre sus datos** (4.3). Hoy el footer dice menos
  de lo que el sistema hace.

---

## 7. Nota sobre el corpus

El equipo decidió no indexarlo, y esa decisión además cubre un riesgo que no estaba
sobre la mesa: según [2026-07-19-procesamiento-despido.md](2026-07-19-procesamiento-despido.md),
buena parte del corpus es transcripción **verbatim** de un tratado de 50 páginas
entregado por el equipo legal, con doctrina y jurisprudencia citadas nominalmente.
Publicarlo como HTML lo habría dejado a un Ctrl+F de cualquier titular de derechos y
habría entrado en el terreno de "contenido republicado sin valor agregado" para
Google.

Donde está —base privada, parafraseado por el agente, nunca reproducido— está bien.
Lo que se publique se escribe de cero.
