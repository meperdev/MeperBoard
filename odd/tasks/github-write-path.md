# Feature: github-write-path — Opción A "panel de control"

**Objetivo**: que MeperBoard deje de ser solo un espejo: escritura angosta y explícita a GitHub (crear issue, comentar, cerrar/reabrir, labels), con el read-only intacto como default estructural.
**Branch**: `feat/github-write-path` (desde `main` @ `09d35de`). **Entrega**: ask-on-risk. **Runner**: `npm run test` (Vitest) + `npm run typecheck`.
**Forecast (heurística)**: ~1.300 líneas authored (T1 ≈ 350; UI ≈ 800; docs ≈ 150).

## Specs

- **S1 — Gate de escritura (opt-in)**: sin `WRITE_MODE=enabled`, el proxy responde `405 { allow: "GET" }` a POST/PATCH y no llama a GitHub. Con el flag, habilita la allowlist de escritura. El read-only sigue siendo el default. (Autorizado: "Opcion A" + "crear issue, comentar, cerrar/reabrir, labels".)
- **S2 — Allowlist de escritura** (solo forma `repos/{owner}/{repo}`): `POST repos/{o}/{r}/issues` (crear issue); `POST repos/{o}/{r}/issues/{n}/comments` (comentar); `PATCH repos/{o}/{r}/issues/{n}` (cerrar/reabrir, labels, editar). Nada más: `pulls` no se escribe, `repositories/{id}` no se escribe, PUT/DELETE nunca; `{n}` debe ser numérico.
- **S3 — Gate por usuario (opcional)**: `WRITE_ALLOWED_USERS=login1,login2` (case-insensitive). Ausente/vacío → cualquier usuario autenticado escribe. Con lista, solo esos logins. Sin sesión (modo PAT self-host) la lista no aplica.
- **S4 — Origin/Referer check aplica también a escrituras**: mismatch → `403` sin llamada upstream.
- **S5 — Body**: el JSON del request se reenvía verbatim con `content-type: application/json`; el retry por 401 reenvía el mismo body.
- **S6 — Errores**: un `403` upstream de un GET se remapea a `429 "sync paused"` (rate limit) como hoy; en escrituras el `403` se pasa tal cual (permisos). `429` se remapea siempre.
- **S7 — UI (tareas siguientes)**: crear issue (board + backlog), comentar en el detalle, cerrar/reabrir, editar labels; tras cada escritura se refresca el item afectado desde GitHub.
- **S8 — Lectura de labels**: `GET repos/{o}/{r}/labels` entra a la allowlist de lectura (editor de labels).
- **S9 — Auto-sync al abrir** (acompañamiento del diagnóstico): si pasaron >30 min desde el último sync, se dispara solo al cargar la app.

**Dependencia externa (dueño)**: la GitHub App necesita permiso **Issues: Read and write** + reinstalar/re-aprobar; sin eso GitHub responde `403` y la UI lo muestra tal cual (comportamiento aceptado, no un bug).

## Tasks

- [x] **T1 — Proxy write core**: gate `WRITE_MODE` + `WRITE_ALLOWED_USERS` + allowlist de escritura + forwarding de body + retry con body + tests (inline, TDD). Commit: este commit del branch (re-creado tras un restore del workspace; RED 28 → GREEN 73 focales; suite 452/452).
- [ ] **T2 — UI crear issue** (modal en board + backlog).
- [ ] **T3 — UI comentar** desde issue detail/drawer.
- [ ] **T4 — UI cerrar/reabrir**.
- [ ] **T5 — UI labels** (usa S8).
- [ ] **T6 — Auto-sync al abrir (S9) + refetch tras escribir (S7)**.
- [ ] **T7 — Docs**: README (garantía read-only → "read-only por defecto, escritura opt-in como vos") + SELF_HOST.

## Log

- **L1 (2026-10-16)** — pedido: "Opcion A / tambien sigo con la intencion de sincronizar github + docs/plan y quiero ver la opcion del 3 que no sea openspec, no se si algo como las sesiones de mi engram o algo que me aporte valor no se / tambien sube lo ultimo que se hizo para dejarlo limpio antes de comenzar".
- **L2** — Decisión: se implementa A primero; superficies 2 (docs/plan, lectura vía contents API) y 3 (explorar Engram/alternativas) quedan en backlog del producto, no de esta feature.
- **L3** — Cleanup pre-feature pusheado a main: `fdbb40d` fix tests Node 26/jsdom (suite 426/426), `82e5701` branding, `09d35de` housekeeping.
- **L4** — Nota: el remoto se movió a `meperdev/MeperBoard` (GitHub redirect); actualizar `origin` cuando el dueño decida.
- **L5** — T1 implementado con TDD: 28 tests en RED → 73/73 focales en GREEN, suite completa 452/452, typecheck limpio. Gate opt-in `WRITE_MODE=enabled`; gate por login `WRITE_ALLOWED_USERS`; allowlist estricta de issues (create/comment/PATCH); 403 de escritura passthrough (los GET siguen remapeando a sync-paused); body reenviado en el retry de 401.
- **L6** — Nota de entorno: el workspace se restauró a mitad de camino y el commit original del T1 se perdió; los cambios sobrevivieron sin commitear y se recommiteó el mismo contenido. El review nativo corre sobre el commit nuevo (sha nuevo).
