# Decisión: v1 sin registro/login, chat directo en el home

**Fecha:** 2026-07-19 · **Estado:** aprobada (directiva del producto)

## Decisión

La primera versión no tiene registro ni login. El chat con el agente `consultas` se muestra directamente en la home (`/`).

## Consecuencias

1. **Identidad anónima por cookie de sesión.** El BFF genera una cookie HttpOnly `ls_session` (UUID) en el primer mensaje. Ese id es a la vez el `resourceId` de Mastra y la clave de aislamiento de la conversación. Una conversación por sesión: `threadId = "chat-" + sessionId`.
2. **Schema mínimo.** Se eliminan `User` y `Consulta` del schema de Prisma: el corpus es global (sin ownership por usuario) y las conversaciones viven en el storage de Mastra (threads por sesión). Cuando llegue el historial multi-conversación o auth, se agregan los modelos con una migración.
3. **Auth.js queda como evolución.** El patrón completo (JWT, adapter Prisma, proxy) sigue documentado en la guía de codificación frontend §10 para cuando se necesite. Al introducirlo, decidir si se migran las sesiones anónimas.
4. **Superficie pública.** La ruta `POST /api/chat/stream` es pública: requiere rate limiting por sesión/IP antes de exponer el producto a tráfico real (pendiente, ver README).

## Alternativas descartadas

- **Stateless total (sin cookie):** perdería la memoria de conversación entre recargas y el aislamiento de threads en Mastra.
- **Mantener `User`/`Consulta` en el schema sin usarlos:** contradice YAGNI (lineamientos §3); agregar modelos cuando exista la feature.
