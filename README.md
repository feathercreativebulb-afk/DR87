# Dust Runner '87

Arcade racing across seven alien worlds: eight vehicles with their own handling and abilities, AI rivals, drift-to-boost, medals, unlocks, ghosts and a Grand Tour.

One web build ships everywhere:

| Target | Shell | Folder |
| --- | --- | --- |
| Web / PWA (shareable link, installable, offline) | Vite + service worker | `apps/web` |
| iOS and Android | Capacitor 7 | `apps/mobile` |
| macOS, Windows, Linux / Steam Deck | Tauri 2 | `apps/desktop` |

## Quick start

```bash
nvm use            # Node 22 (see .nvmrc)
npm install
npx playwright install chromium   # once, for the browser smoke test
npm run dev        # http://localhost:5173 — also reachable from your phone on the same Wi-Fi
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with the game |
| `npm run build` | Production build into `apps/web/dist` |
| `npm run preview` | Serve the production build on :4173 |
| `npm test` | Data and asset checks (Vitest) |
| `npm run test:e2e` | Boots the build in Chromium (desktop + phone sizes), loads every vehicle, races |
| `npm run check` | All of the above, the same as CI |
| `npm run import:artifact -- <folder>` | Re-import the game from the claude.ai artifact (see below) |

## The shareable link (GitHub Pages)

Every push to `main` runs CI and, when it's green, publishes the build to GitHub Pages:

1. Push this repo to GitHub.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or run the workflow from the **Actions** tab).

The link is `https://<your-github-user>.github.io/DR87/`. The build uses relative paths, so a custom domain or itch.io works without changes.

## Phones and desktop

**Android** (Android Studio installed):

```bash
npm run mobile:sync                 # build the web app and copy it into the native projects
npm run open:android -w @dr87/mobile
```

**iOS** (Xcode installed, on a Mac):

```bash
npm run add:ios -w @dr87/mobile     # once: generates apps/mobile/ios
npm run mobile:sync
npm run open:ios -w @dr87/mobile
```

Then drag the icons from `apps/mobile/resources/ios-appicon` into `App/Assets.xcassets/AppIcon` in Xcode. Lock orientation to landscape in the target's General tab (Android is already locked).

**Desktop** ([Rust toolchain](https://www.rust-lang.org/tools/install) installed):

```bash
npm run desktop:dev                 # window with live reload
npm run desktop:build               # .dmg / .app on macOS, .msi / .exe on Windows
```

## Repo layout

```
apps/
  web/        Vite entry, PWA manifest, service worker, icons
  mobile/     Capacitor config + generated android/ (ios/ is generated on a Mac)
  desktop/    Tauri config, Rust shell, icons
packages/
  core/       the game — src/legacy/ holds the imported game script, CSS and DOM
  data/       vehicles, skins, unlocks, medals, quality presets (JSON)
  platform/   the only code that knows web vs Capacitor vs Tauri
assets/
  models/     vehicle GLBs (served at media/models/)
  music/      world tracks and the main theme (served at media/music/)
tests/
  unit/       data and asset checks
  e2e/        browser smoke test
tools/        import-artifact.py, make-icons.py
docs/         ROADMAP.md
```

## Working with the artifact

Until phase 2 splits the game into modules, the claude.ai artifact stays the playground and this repo is the product. After changing the game in the artifact, download its files into a folder (`index.html`, `*-model.js`, `music*.mp3`) and run:

```bash
npm run import:artifact -- ~/Downloads/dr87-artifact
npm run check
```

The importer pulls out the script, styles and markup, turns the base64 models into real `.glb` files, lifts the pure-data tables into `packages/data`, and stops with an error if the artifact has drifted so far that a patch no longer applies.

## Notes

- **Music** was generated with Gemini. It's usable but not copyrightable; disclose AI music on the Steam, App Store and Play listings and in the credits. Check each track with YouTube Content ID before launch.
- **Saves** use `localStorage` (keys `dustrunner-*`). Phase 3 moves them to native storage and cloud sync.
- **three.js** is pinned to r128, the version the game was written for. Phase 2 upgrades it.
