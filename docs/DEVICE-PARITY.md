# Same game on every device: investigation (23 Oct 2026)

**Question:** how can DR87 give the same experience as the MacBook Pro 16" on any device, whatever its processor, memory or graphics?

**Short answer:** separate the parts that must be the same everywhere from the parts that may scale.

- **Same everywhere:** speed, physics, timing, controls, what you can see on the road, and fairness for the prize.
- **Scales with the device:** resolution, shadows, draw distance, scenery density and post effects.
- **The urgent finding:** the first part isn't true today. On a slow device the game runs in slow motion, which costs real seconds on the event clock.

## 1. Fixed: game time no longer slows down on slow devices (shipped 23 Oct)

- **The cause:** the frame loop capped each step at 50 ms, so below 20 fps the race ran in slow motion (75% speed at 15 fps, 50% at 10 fps). The official time is the server clock from GO to the line, so a weak laptop or old phone posted slower times for the same driving.
- **The fix:** a long frame is now simulated as several steps of at most 50 ms each, up to 250 ms a frame. Camera, HUD and audio still run once per drawn frame.
  - Game time now matches real time down to **4 fps**. Fast frames are unchanged.
  - The wall, solid and car-to-car checks run inside every step, so a big frame can't push a car through anything.
  - Measured in the test browser (software rendering): at 0.9 fps, race time was 27% of real time (the 250 ms ceiling), against about 3.5% before.

## 2. Scale the cost automatically (some of this has shipped)

| Lever | Status | What it does |
|---|---|---|
| Built-in-graphics detection → Saver | Shipped 23 Oct | Intel and phone-class GPUs start on Saver |
| Saver at 60 fps, 80% resolution, no shadows | Shipped | Fill-rate is the bottleneck on Intel UHD |
| Dynamic resolution down to 50% | Shipped | Keeps frame time when a scene gets heavy |
| Draw distance and smog per preset | Shipped | Far scenery skipped behind the fog |
| Warm-up draw | Shipped | No first-sight shader and upload hitches |
| GPU tier from a benchmark database (`detect-gpu`, tiers 0–3 by measured fps) | Next | Better first choice than a name match; tier 0 = no WebGL, show a message |
| Adaptive detail | Shipped 23 Oct | Once frames stay late at half resolution, it drops shadows, then the ink outline pass, then two thirds of the smog. Each comes back after two good checks at full resolution |
| Lighter pumpkins on Saver | Shipped 23 Oct | The patch and yard pumpkins switch to a model with about half the triangles |
| Fewer draw calls | Shipped 23 Oct | Bats are 2 instanced meshes (were 54 meshes); each ghost is 2 meshes (was 6); idle particle systems are skipped, with no draw and no upload |
| Lower-resolution Hollow Ridge ground on Saver | Not done | The ground is one 115k-triangle mesh, but a coarser grid could poke through the road on the embankments. Intel UHD handles the triangles; pixels and draw calls are its limit |
| Merge static scenery further (cars are now the biggest share) | Later | The 5 cars are ~90 draw calls (wheels, lights and light sprites). Merging them is a phase-2 job |
| Compressed textures (KTX2/Basis) | Later | Less memory on 2–3 GB phones; faster uploads |

Measured at the start line during a race, in the test browser:

| Preset | Before (22 Oct) | After (23 Oct) |
|---|---|---|
| Saver | 501k triangles, 201 draw calls | 428–452k triangles, 149–164 draw calls |
| Balanced | 502k, 201 | 534k, 144 |
| High | 857k, 327 | 905k, 232 |

The triangle counts move by ±5% with where the AI cars are on screen.

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

1. **Done, 23 Oct:** fixed-step physics (§1), lighter pumpkins on Saver, fewer draw calls and adaptive detail (§2).
3. **Phase 2:** WebGPU renderer and draw-call merging.
4. **Later, optional:** cloud streaming for the weakest devices.

Sources:
- AWS g4dn.xlarge pricing, eu-central-1: https://www.doit.com/compute/spot/eu-central-1/g4dn.xlarge
- Amazon GameLift Streams setup and pricing (2026): https://tech-insider.org/amazon-gamelift-streams-setup-2026/
- WebGPU baseline 2026 and three.js WebGPURenderer: https://vr.org/articles/webgpu-baseline-2026-three-js-webxr-default
- detect-gpu tiers: https://cdn.jsdelivr.net/npm/@pmndrs/detect-gpu@6.0.15/README.md
