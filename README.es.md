<div align="center">

# 🗂️ MeperBoard

**Un tablero kanban y backlog local-first para tus issues y pull requests de GitHub.**

Sincronización de solo lectura con GitHub, almacenamiento offline-first, UX pensada para teclado — con el pulido de una herramienta moderna para desarrolladores.

<p>
  <a href="https://meperboard.vercel.app"><strong>Demo en vivo ↗</strong></a>
  ·
  <a href="#caracteristicas">Características</a>
  ·
  <a href="#primeros-pasos">Primeros pasos</a>
  ·
  <a href="#como-funciona">Cómo funciona</a>
  ·
  <a href="#arquitectura">Arquitectura</a>
  ·
  <a href="#contribuir">Contribuir</a>
  ·
  <span>🌐 <a href="./README.md">English</a></span>
</p>

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-blue?logo=react">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7-blue?logo=typescript">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss">
  <img alt="Vitest" src="https://img.shields.io/badge/tests-537%20passing-22c55e?logo=vitest">
  <img alt="License MIT" src="https://img.shields.io/badge/licencia-MIT-a78bfa?logo=opensourceinitiative">
</p>

</div>

---

## ✨ Características

### Tablero, como lo piensa tu cerebro
- **Tablero kanban** con tarjetas drag-and-drop ([dnd-kit](https://dndkit.com/)) y animaciones fluidas de [Framer Motion](https://motion.dev/).
- **Mapeo inteligente de columnas** — los issues y PRs caen en la columna correcta automáticamente según su estado en GitHub, y tus movimientos manuales se conservan incluso tras re-sincronizar.
- **Agrupación por slices y features** — los slices que coinciden con el título de un epic se agrupan en una jerarquía padre/hijo (`Expenses module - slice 3` → `Expenses`).

### Backlog, sin el ruido
- **Filtra y ordena** por etiqueta, tipo y campo con un orden determinista.
- **Backlog paginado** (25/50/100 por página) con paginador visible — nada de scroll infinito.

### Local-first y privado
- **Almacenamiento offline-first** en [IndexedDB](https://dexie.org/) vía Dexie. Tus datos son tuyos, en tu máquina.
- **Tarjetas locales** que la sincronización de GitHub nunca toca — creá, editá y borrá tarjetas que se mantienen mientras sincronizás.
- **De solo lectura por defecto** — MeperBoard espeja GitHub unidireccionalmente y solo manda `GET` a menos que un deployment opte por escrituras (`WRITE_MODE=enabled`). Las escrituras quedan en una allowlist estricta de issues: crear, comentar, cerrar/reabrir, labels.

### GitHub, conectado
- **Iniciá sesión con GitHub** vía una GitHub App — sin pegar tokens. Los permisos read-only cubren el sync; las escrituras opt-in requieren el permiso **Issues: Read and write** de la App.
- **Token por usuario** guardado en una cookie cifrada HTTP-only, jamás expuesto al JavaScript del cliente.
- **Selector de repositorios en vivo** — navegá y cambiá entre tus repositorios desde una command palette.
- **Manejo transparente de rate limit** con back-off automático e indicador de rate limit en vivo.

### Keyboard-first, como debe ser
- **Command palette ⌘K** — navegá, cambiá el tema, cambiá de repo, sincronizá y más, todo desde el teclado.
- Accesibilidad completa por teclado en el tablero (movés tarjetas con flechas) y en la palette.
- Un sistema de diseño dark-first inspirado en Linear con paletas de acento intercambiables.

---

## 🚀 Primeros pasos

### Requisitos
- Node.js 20+
- Una cuenta de GitHub (para el flujo OAuth) — opcional si solo querés la experiencia anónima de solo lectura.

### Instalación

```bash
git clone https://github.com/meperdev/MeperBoard.git
cd MeperBoard
npm install
```

### Ejecutar en local

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

> Sin `AUTH_SECRET`, la app corre en **modo desarrollo** con un secreto de respaldo inseguro. Para usar autenticación de GitHub, ver [Configuración](#configuracion).

### Scripts

| Script | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm start` | Servidor de producción |
| `npm run test` | Correr la suite de tests (Vitest) |
| `npm run test:watch` | Tests en modo watch |
| `npm run typecheck` | Type-check con `tsc --noEmit` |

---

## ⚙️ Configuración

MeperBoard usa algunas variables de entorno para la autenticación con GitHub. Ninguna es obligatoria para correr el tablero en local; la auth de GitHub simplemente no estará disponible hasta que las configures.

| Variable | Requerida | Propósito |
| --- | --- | --- |
| `AUTH_SECRET` | ✅ (producción) | Secreto usado para derivar la clave AES que cifra las cookies de sesión. **Debe ser ≥ 32 caracteres.** |
| `GITHUB_CLIENT_ID` | ✅ (auth) | Client ID de tu [GitHub App](https://docs.github.com/en/apps/creating-github-apps). |
| `GITHUB_CLIENT_SECRET` | ✅ (auth) | Client secret de tu GitHub App. |
| `ALLOWED_ORIGIN` | recomendada | Lista de orígenes permitidos para el proxy. Por defecto `https://meperboard.vercel.app`. |
| `AUTH_MODE` | opcional | `oauth` (default) o `pat` — usá `pat` para autenticar con un personal access token clásico en self-hosting. |
| `GITHUB_TOKEN` | modo `pat` | Personal access token usado en `AUTH_MODE=pat`. |

### Configurar una GitHub App (para OAuth)

1. Creá una [GitHub App](https://github.com/settings/apps/new) para tu dominio.
2. Configurá la **callback URL** como `https://<tu-dominio>/api/auth/callback`.
3. Otorgá acceso **Read-only** a **Issues** y **Pull requests** (Metadata es requerida y de solo lectura por defecto). Las escrituras son opt-in: otorgá **Issues: Read and write** y seteá `WRITE_MODE=enabled` solo si las querés.
4. **Habilitá "Expire user authorization tokens"** — MeperBoard depende del refresh de tokens.
5. Copiá el **Client ID** y generá un **Client secret**.

> MeperBoard es de solo lectura por defecto: sin `WRITE_MODE=enabled` nunca manda un request de escritura. Optar por las escrituras es una decisión del deployment — ver [Seguridad](#seguridad).

---

## 🔒 Seguridad

- **De solo lectura por defecto.** El proxy de GitHub acepta solo requests `GET` y aplica una allow-list de rutas del repositorio. Las escrituras son imposibles salvo que el deployment setee `WRITE_MODE=enabled`, y aun así pasan solo por la allowlist estricta de issues (crear, comentar, cerrar/reabrir, labels) — mismo origen, con el token del propio caller.
- **Los tokens nunca llegan al navegador.** Los user access tokens se cifran (`jose` JWE, `A256GCM`) en una cookie `httpOnly + Secure + SameSite=Lax`. El JavaScript del cliente jamás puede leerlos.
- **Estado de sesión cifrado.** El `state` de OAuth se guarda en una cookie cifrada de un solo uso para prevenir CSRF.
- **Content-Security-Policy estricta** con nonce por request, más renderizado de Markdown sanitizado ([DOMPurify](https://github.com/cure53/DOMPurify)) para cuerpos de issues/PRs.
- **Protección contra open relay.** El proxy valida el `Origin`/`Referer` de la request contra `ALLOWED_ORIGIN` y bloquea callers no autorizados.

Ver la [guía de self-hosting](/docs/SELF_HOST.md) para la alternativa con PAT.

---

## 🧠 Cómo funciona

MeperBoard es un **espejo local-first**: trae tus issues y PRs de GitHub a una base de datos IndexedDB en tu dispositivo, y los renderiza desde esa copia local. La sincronización es siempre de solo lectura y siempre a tu manera. Las escrituras, cuando un deployment las habilita, son acciones explícitas que disparás vos (crear, comentar, cerrar/reabrir, labels) — nunca un efecto colateral de un sync.

```mermaid
flowchart LR
  A[GitHub API] -->|GET /issues /pulls| P[Proxy read-only por defecto]
  P -->|espejo unidireccional| DB[(IndexedDB / Dexie)]
  DB --> B[Tablero]
  DB --> L[Backlog]
  DB --> D[Detalle de issue]
  L --> P
```

Vos ponés tu propia identidad (OAuth con GitHub App) y tu propio navegador — MeperBoard es una capa delgada y bien tipada sobre tus propios datos.

---

## 🏛️ Arquitectura

- **Next.js 16** (App Router) + **React 19** + **TypeScript** + **Tailwind CSS 4**.
- **Dexie / IndexedDB** para el store offline-first (`repos`, `github_items`, `local_items`, `columns`, `epics`, `column_overrides`).
- **TanStack Query** para server-state y caché optimista.
- **Conector de sync unidireccional** con capa de estrategias de columna pluggable.
- **Proxy de GitHub de solo lectura por defecto** (`/api/github/[...path]`) — GET-only salvo `WRITE_MODE=enabled`, con check de origen e inyección de token.

```
src/
├── app/            # Rutas de Next.js (páginas + API routes)
├── components/     # Componentes React (tablero, backlog, header, ui)
├── data/           # Repositorios y tipos de Dexie
├── domain/         # Conector de sync, lógica del proxy, estrategias de columna, rate limiter
├── lib/            # Auth (session, oauth), utilidades
└── state/          # Hooks de TanStack Query y proyecciones
```

---

## 🧪 Tests

La suite de tests corre con [Vitest](https://vitest.dev/) con [Testing Library](https://testing-library.com/) y `fake-indexeddb`.

```bash
npm run test
```

- **Unit** — lógica de dominio pura (proxy, conector, rate limiter, estrategias de columna, cripto de sesión).
- **Integración / Componente** — componentes y hooks renderizados contra un IndexedDB mockeado.

> 537 tests en 62 archivos.

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Para empezar:

1. **Fork** del repo y creá una rama de feature.
2. Seguí las convenciones existentes: TypeScript estricto, conventional commits, TDD (escribí el test que falla primero).
3. Mantené intacto el default de solo lectura — cualquier escritura nueva debe quedar detrás del gate opt-in `WRITE_MODE` y de la allowlist estricta de issues (ver [`odd/tasks/github-write-path.md`](./odd/tasks/github-write-path.md)).
4. Corré `npm run typecheck` y `npm run test` antes de abrir un PR.

> Este proyecto se construye con un flujo de trabajo TDD estricto. El comportamiento nuevo llega con su test.

---

## 📄 Licencia

Publicado bajo la [Licencia MIT](./LICENSE).

Copyright © 2026 [Santiago Villabona (meperdev)](https://github.com/meperdev).

---

<div align="center">

Hecho con ❤️ para la gente que ama su backlog.

</div>
