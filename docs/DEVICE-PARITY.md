# Same game on every device: investigation (23 Oct 2026)

**Question:** how can DR87 give the same experience as the MacBook Pro 16" on any device, whatever its processor, memory or graphics?

**Short answer:** separate the parts that must be the same everywhere from the parts that may scale.

- **Same everywhere:** speed, physics, timing, controls, what you can see on the road, and fairness for the prize.
- **Scales with the device:** resolution, shadows, draw distance, scenery density and post effects.
- **The urgent finding:** the first part isn't true today. On a slow device the game runs in slow motion, which costs real seconds on the event clock.

## 1. Must fix for the event: game time slows down on slow devices

- **The cause:** the frame loop caps each step at 50 ms (`let dt = Math.min(.05, …)` in `game.js`). Below 20 fps the simulation can't keep up with real time:
  - at 15 fps the race runs at 75% speed;
  - at 10 fps it runs at 50% speed.
- **Why it matters for the prize:** the official time is the server clock from GO to the line, so a player on a weak laptop or old phone posts a slower time for the same driving.
- **The fix:** split long frames into several physics steps of at most 1/60 s (with a ceiling, e.g. 6 steps a frame). Game time then matches real time down to about 10 fps.
  - This is a small, local change to the race loop and hazard updaters.
  - It is the "fixed 60 Hz simulation step" already planned for phase 2, brought forward. It also makes handling identical at 30, 60 and 144 Hz.
  - Risk: at very low frame rates the bigger effective steps need the existing wall and solid checks to run per step (they do once it's inside the step loop).

## 2. Scale the cost automatically (some of this has shipped)

| Lever | Status | What it does |
|---|---|---|
| Built-in-graphics detection → Saver | Shipped 23 Oct | Intel and phone-class GPUs start on Saver |
| Saver at 60 fps, 80% resolution, no shadows | Shipped | Fill-rate is the bottleneck on Intel UHD |
| Dynamic resolution down to 50% | Shipped | Keeps frame time when a scene gets heavy |
| Draw distance and smog per preset | Shipped | Far scenery skipped behind the fog |
| Warm-up draw | Shipped | No first-sight shader and upload hitches |
| GPU tier from a benchmark database (`detect-gpu`, tiers 0–3 by measured fps) | Next | Better first choice than a name match; tier 0 = no WebGL, show a message |
| Adaptive detail: drop shadows, then the ink pass, then smog when frame time stays high | Next | Today only resolution adapts |
| Pumpkin patches as a lower-poly LOD | Next | 520 pumpkins × 256 triangles = 133k triangles at the start line |
| Lower-resolution Hollow Ridge ground on Saver | Next | Ground is one 115k-triangle mesh |
| Merge static scenery and fewer draw calls (~200 → under 100) | Later | Weak CPUs struggle more with draw calls than with triangles |
| Compressed textures (KTX2/Basis) | Later | Less memory on 2–3 GB phones; faster uploads |

Measured at the start line (Saver): 496k triangles in 187 draw calls; High: 830k in 283.

## 3. Newer renderer (after the event)

- **What:** three.js r128 → current, with `WebGPURenderer`. It falls back to WebGL 2 automatically.
- **Browser support:** WebGPU is reported on by default in Chrome, Edge, Firefox (Windows/macOS) and Safari 26 (macOS Tahoe, iOS) as of 2026.
- **Benefit:** much lower CPU cost per draw call, which helps exactly the weak-processor devices.
- **Cost:** a phase-2 job (the legacy script has to move to ES modules, and the shader patches have to be re-done). Not before this event.

## 4. Cloud streaming: identical pictures, but latency and cost

- **How it works:** the game runs on a server GPU and the device only plays a video stream (WebRTC), so a 2015 phone sees exactly what the MacBook sees.
- **Amazon GameLift Streams:** about $0.50–0.66 per stream-hour (eu-central-1 $0.657). It streams a Windows executable, not a browser game, so DR87 would have to ship as the Tauri Windows build.
- **Self-hosted alternative:** headless Chrome plus WebRTC on a GPU VM. A g4dn.xlarge (1× NVIDIA T4) is $0.658/h on demand or about $0.31/h spot in Frankfurt; probably 2–4 streams at 720p each.
- **The catch for a racing game:** encode, network and decode add input lag on top of the network. It needs good Wi-Fi or 5G, and the servers should be within a few hundred km. A racer feels that lag far more than a turn-based game does.
- **Verdict:** not for this event. It could be a later "play anywhere" mode for devices that score tier 0–1.

## Recommendation

1. **Before 29 Oct:** fixed-step physics (§1), so times are fair on every device.
2. **Before 29 Oct, if time allows:** pumpkin LOD and lower-resolution ground on Saver, plus adaptive detail (§2).
3. **Phase 2:** WebGPU renderer and draw-call merging.
4. **Later, optional:** cloud streaming for the weakest devices.

Sources:
- AWS g4dn.xlarge pricing, eu-central-1: https://www.doit.com/compute/spot/eu-central-1/g4dn.xlarge
- Amazon GameLift Streams setup and pricing (2026): https://tech-insider.org/amazon-gamelift-streams-setup-2026/
- WebGPU baseline 2026 and three.js WebGPURenderer: https://vr.org/articles/webgpu-baseline-2026-three-js-webxr-default
- detect-gpu tiers: https://cdn.jsdelivr.net/npm/@pmndrs/detect-gpu@6.0.15/README.md
