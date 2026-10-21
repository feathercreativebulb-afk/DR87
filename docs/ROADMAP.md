# Roadmap

From the [DR87 Standalone Game Plan](https://claude.ai/code/artifact/17250faa-500b-49bc-a279-f323bcde09a9). Each phase ends on a gate that must pass before the next starts.

## Phase 1 · Foundations (weeks 1–2) — in progress

- [x] Repo with npm workspaces: `apps/web`, `apps/mobile`, `apps/desktop`, `packages/core`, `packages/data`, `packages/platform`
- [x] Game imported from the artifact into `packages/core/src/legacy` by a repeatable importer (`tools/import-artifact.py`)
- [x] three r128, loaders and fonts bundled locally: no CDN calls, runs offline
- [x] Models as binary GLBs (10 MB, was 13.8 MB of base64 JS), loaded with `fetch`
- [x] Vehicles, skins, unlocks, medals and quality presets lifted into JSON
- [x] PWA: manifest, icons, service worker (cache-first, offline after first play)
- [x] CI: typecheck, unit tests, build, browser smoke test at desktop and phone sizes; deploy to GitHub Pages from `main`
- [x] Shells: Capacitor config + Android project, Tauri 2 config + Rust shell + icons
- [ ] Record reference laps per vehicle on Mojave Basin (input + lap time), the baseline for the phase 2 gate
- [ ] Music rights documented (Gemini-generated; Content ID check per track)
- [ ] **Gate:** repo build matches the artifact in every world (screenshot pass per world)

## Phase 2 · Core refactor (weeks 3–5)

- [ ] Fixed 60 Hz simulation step with interpolated rendering (today physics runs on frame time)
- [ ] Split `legacy/game.js` into `sim/`, `render/`, `ui/`, `audio/` modules (TypeScript)
- [ ] `WORLDS` into `packages/data` (its geometry helpers move into `sim/track`)
- [ ] three.js r128 → current (`outputEncoding` → `outputColorSpace`, ES module loaders)
- [ ] **Gate:** recorded input laps within 2% of reference at 30, 60 and 144 Hz; playable on desktop and phone

## Phase 3 · Platforms (weeks 6–8)

- [ ] Saves through `@dr87/platform`: Capacitor Preferences + iCloud / Play Games, Tauri file + Steam Cloud
- [ ] Gamepad (Gamepad API, Steam Input), key remapping, Capacitor Haptics on drift-boost and impacts
- [ ] Performance budgets: under 150 draw calls and 300k triangles on Balanced
- [ ] Music as AAC/Opus, streamed; worlds 3–7 as on-demand packs on mobile
- [ ] **Gate:** 60 fps on Balanced on Samsung A54 and iPhone 12; playtest round 1

## Phase 4 · Content and polish (weeks 9–12)

- [ ] First-run flow, menus and HUD at phone and desktop sizes
  - known: at very short landscape heights (≤ 340 px) the race clock sits under the pause button
- [ ] Settings, remapping, accessibility pass
- [ ] **Gate:** content freeze

## Phase 5 · Store services (weeks 13–15)

- [ ] Achievements and leaderboards (Game Center, Play Games, Steam)
- [ ] Crash reporting, store pages, trailer, AI-content disclosures
- [ ] **Gate:** playtest round 2; TestFlight, Play internal and Steam betas

## Phase 6 · Launch (weeks 16–18)

- [ ] Device lab and 2-hour soak tests, store certification
- [ ] **Gate:** 1.0 live on all stores
