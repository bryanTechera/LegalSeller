# SEO Ola 1 — acciones sobre producción (fuera del código)

Complemento de [2026-08-06-auditoria-seo.md](2026-08-06-auditoria-seo.md). Todo lo
que sigue se hace en consolas externas, no en el repo, y por eso no entró en el PR.

Orden sugerido: 1 y 2 antes del deploy (así el primer rastreo ya encuentra todo
bien), el resto después.

---

## 1. Prender el CDN de Railway — servicio `frontend`

**Por qué.** El HTML sale con `cache-control: s-maxage=31536000` y hoy no lo consume
nadie: ninguna respuesta de producción trae `x-cache` ni `age`. Ese header es
exactamente el que el modo Auto del CDN necesita. Los tres servicios corren en
`europe-west4` (Ámsterdam) para una audiencia uruguaya, así que hoy cada request
cruza el Atlántico: el TTFB medido el 2026-08-06 fue de 0,76 a 0,91 s.

**Cómo.** Railway → proyecto `legalseller` → servicio `frontend` → Settings → Edge →
activar **CDN Caching**. Es gratis, reversible, no toca DNS ni código. Los SSE del
chat quedan excluidos por diseño.

**Cómo verificar.**

```bash
curl -sSI https://dudaya.com/ | grep -iE "x-cache|age|cache-control"
```

Tiene que aparecer `x-cache` (y `age` en el segundo request). Hoy no aparece ninguno.

**Después de esto**, evaluar mover la región a `us-east4-eqdc4a`. Es un segundo paso
y beneficia también al backend y a la base; no lo hagas junto con el CDN o no vas a
saber cuál de los dos movió el número.

---

## 2. Dar de alta `www.dudaya.com`

**Por qué.** El subdominio ya tiene DNS apuntando a Railway pero no está registrado
como custom domain, así que el edge sirve el certificado wildcard `*.up.railway.app`
y el navegador corta la conexión:

```
curl: (60) SSL: no alternative certificate subject name matches target host name 'www.dudaya.com'
```

No afecta la indexación (Google no rastrea un host que nada enlaza) pero pierde a
quien tipea `www.`. Y por el `includeSubDomains` del HSTS que ya servimos, el error
es **no salteable** para cualquiera que haya visitado el apex antes.

**Cómo.** Railway → servicio `frontend` → Settings → Networking → Custom Domain →
agregar `www.dudaya.com`. Esperar el certificado. Después, redirigir `www` al apex
con un 301 (Railway lo ofrece como opción del dominio; si no, se agrega a
`redirects()` en `frontend/next.config.ts`, que ya tiene el bloque).

**Cómo verificar.**

```bash
curl -sS -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://www.dudaya.com/
```

Esperado: `301 -> https://dudaya.com/`. Hoy: error de TLS.

---

## 3. Search Console

**Por qué.** Es el único lugar donde se ven las consultas reales con las que la gente
llega (o no llega), qué está indexado y si hay una acción manual. Además es el insumo
para decidir qué categoría de `dominio-consultas.md` conviene habilitar próximo. Hoy
no hay ninguna medición: ni GA4, ni GSC, ni atribución de origen en la base.

**Cómo.** [search.google.com/search-console](https://search.google.com/search-console)
→ agregar propiedad **de dominio** (`dudaya.com`, cubre subdominios y protocolos) →
verificar por **registro TXT en DNS**.

> Verificá por DNS, no por archivo HTML. El Dockerfile no copia `public/` a la imagen
> de producción, así que un archivo de verificación andaría en `pnpm dev` y daría 404
> en producción. Si preferís meta tag, el campo es `metadata.verification.google` en
> `frontend/src/app/layout.tsx` — decime el token y lo agrego.

**Una vez verificado**, no hay sitemap que enviar todavía: el sitio tiene una sola URL
pública. El `sitemap.ts` es parte de la Ola 2 y ahí sí se envía.

---

## 4. Cerrar el proxy TCP de la Postgres de producción

**Esto no es SEO** — apareció durante la auditoría y lo dejo acá para que no se
pierda.

**Por qué.** El servicio `pgvector` tiene un proxy TCP público y un dominio HTTP
activos. Se abrieron para la ingesta puntual del 2026-07-21
([plan](2026-07-21-ingesta-corpus-produccion.md)) y quedaron.

**Cómo.** Railway → servicio `pgvector` → Settings → Networking → quitar el TCP Proxy
del puerto 5432 y el dominio público. El backend y el frontend usan la red privada,
así que no deberían notarlo — verificá que `DATABASE_URL_PRIVATE` esté en uso antes de
sacarlo.

---

## Lo que NO hay que hacer todavía

- **No instalar GA4 ni GTM tal cual.** La CSP de `frontend/next.config.ts`
  (`script-src 'self'`, `connect-src 'self'`) los bloquea y la instalación falla en
  silencio. Si se elige GA4 hay que abrir la CSP; si se elige Plausible o Umami
  self-hosted bajo el propio dominio, no hace falta tocarla y además no requiere
  banner de cookies. La decisión es de la Ola 2.
- **No crear `frontend/public/`.** El Dockerfile no lo copia. Todo archivo servido
  desde la raíz (`robots.txt`, `sitemap.xml`, la imagen de OG, el manifest) va por
  convención del App Router, que se compila dentro de `.next` y sí viaja a la imagen.
