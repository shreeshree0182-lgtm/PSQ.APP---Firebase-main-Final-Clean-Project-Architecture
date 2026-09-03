# PaintPro — Professional Painting Estimation

A React + Vite single-page application for professional painting, joinery, and
surface-finishing estimation (Interior, Exterior, Wood/Metal/Joinery, Wallpaper,
Texture).

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
```

## Production build

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally to sanity-check it
```

`dist/` is a fully static bundle — drop it into any static host (Vercel,
Netlify, GitHub Pages, S3 + CloudFront, nginx, etc.). No server-side runtime
required.

## Demo login credentials

The app ships with hardcoded demo users (no backend auth):

| Card ID | PIN  | Role              |
|---------|------|-------------------|
| SUP001  | 1234 | Senior Supervisor |
| SUP002  | 5678 | Site Supervisor   |
| ADM001  | 9999 | Admin             |

Supervisor logins can create and edit projects. Admin login shows a
read-only cross-project overview and does not expose project creation.

## Project structure

```
├── index.html
├── package.json
├── vite.config.js
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx      # React root, mounts <App/>
    ├── App.jsx        # the entire application (single-file by design)
    ├── index.css      # minimal global reset — the app styles itself inline
    └── assets/        # empty, reserved for future static assets
```

## Known, intentional limitations (not bugs)

- **No real persistence backend.** The app calls `window.storage` (a
  Claude-artifact-specific API) for cloud save; every call is wrapped in
  `try/catch` with optional chaining, so outside that environment it silently
  no-ops rather than crashing. Project data will not persist across page
  reloads until a real backend (or `localStorage`, or an API) is wired up.
- **Single JS bundle (~508KB).** The entire app is one large component file,
  so Vite's build emits one chunk over its 500KB warning threshold. This is a
  warning, not an error, and doesn't affect functionality. Splitting it into
  real code-split modules is a separate refactor decision, not something done
  here.
- **Demo auth only.** Login credentials are hardcoded in source
  (`const USERS` in `App.jsx`). Fine for demos/internal use; replace with
  real authentication before any real-world / multi-tenant deployment.

## Verified before shipping

- `npm install`, `npm run build`, and `npm run dev` all run clean.
- Fixed a real runtime bug: `NumInp` used bare `React.useState`/`useRef`/
  `useEffect` without a default `React` import — this threw
  `ReferenceError: React is not defined` the moment any screen using a
  number input mounted (which is most of the app past the landing screen).
  Fixed by adding `React` to the top-level import in `App.jsx`. Confirmed
  fixed via headless execution: logged in, navigated through Client → Job
  Details → Floors, and typed directly into number/text inputs repeatedly
  (stress-testing the exact component that broke) with zero console errors.
- A full mechanical click-through of every downstream screen (Interior,
  Exterior, Wood/Metal/Joinery, Summary) was not completed — progressing
  further requires satisfying real form validation (specific room/measurement
  data) that a generic automated script can't fill in meaningfully. If you
  hit an error on those specific screens, report it with the exact steps and
  it can be fixed directly.
