/* Dust Runner '87 — legacy game script, imported from the artifact by tools/import-artifact.py.
 * Do not hand-edit for gameplay changes yet: phase 2 splits this into packages/core/src/{sim,render,ui,audio}.
 * Runs as a classic script after three r128 (global THREE) and src/boot.ts (global DR87). */

(() => {
const LAPS = 3, N = 720, W = 20, MAXS = 60, ACC = 26, BRK = 48;

/* ---------- renderer / scene ---------- */
const canvas = document.getElementById('gl');
// graphics presets: phones start on Battery saver so they stay cool
const QUALITY = DR87.data["quality"];
const IS_TOUCH = matchMedia('(pointer:coarse)').matches;
let quality = IS_TOUCH ? 'saver' : 'high';
try { const sq = localStorage.getItem('dustrunner-quality'); if (sq && QUALITY[sq]) quality = sq; } catch(_){}
let Q = QUALITY[quality], dynScale = 1;
const renderer = new THREE.WebGLRenderer({canvas, antialias:!IS_TOUCH, powerPreference: IS_TOUCH ? 'low-power' : 'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 3200);
/* ---------- the look: a comic-ink post pass ----------
   The scene renders into a texture (with depth), then one full-screen pass draws it back as a printed page:
   ink lines where depth or surface direction jumps, softly stepped tones, halftone dots creeping into the
   shadows, cool shadows / warm lights, a touch of grain and a vignette. Toggle in Settings. */
let lookOn = true; try { lookOn = (localStorage.getItem('dustrunner-look') || 'comic') !== 'clean'; } catch(_){}
const post = { rt:null, w:0, h:0, ok:false, scene:new THREE.Scene(), cam:new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
post.ok = !!(renderer.capabilities.isWebGL2 || renderer.extensions.get('WEBGL_depth_texture'));
post.mat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse:{ value:null }, tDepth:{ value:null }, res:{ value:new THREE.Vector2(1,1) }, near:{ value:.5 }, far:{ value:3200 }, projInv:{ value:new THREE.Matrix4() }, time:{ value:0 }, ink:{ value:1 }, toon:{ value:.55 }, dark:{ value:0 }, rush:{ value:0 }, boostK:{ value:0 }, aspect:{ value:1.7 },
    look:{ value:1 }, hf:{ value:new THREE.Vector4() }, hfC:{ value:new THREE.Vector4() }, hfR:{ value:new THREE.Vector2(1, 2) }, fogCol:{ value:new THREE.Color() }, camWorld:{ value:new THREE.Matrix4() }, camPos:{ value:new THREE.Vector3() } },
  depthTest:false, depthWrite:false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
precision highp float;
uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 res; uniform float near; uniform float far; uniform mat4 projInv; uniform float time; uniform float ink; uniform float toon; uniform float dark;
uniform float look; uniform vec4 hf; uniform vec4 hfC; uniform vec2 hfR; uniform vec3 fogCol; uniform mat4 camWorld; uniform vec3 camPos; uniform float rush; uniform float boostK; uniform float aspect;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7)))*43758.5453); }
float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y), mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
varying vec2 vUv;
float linD(vec2 uv){ float z = texture2D(tDepth, uv).x; float zn = z*2.0 - 1.0; return (2.0*near*far)/(far + near - zn*(far - near)); }
vec3 vpos(vec2 uv){ float z = texture2D(tDepth, uv).x; vec4 c = vec4(uv*2.0 - 1.0, z*2.0 - 1.0, 1.0); vec4 v = projInv*c; return v.xyz/v.w; }
vec3 nrm(vec2 uv, vec2 px){ vec3 dx = vpos(uv + vec2(px.x, 0.0)) - vpos(uv - vec2(px.x, 0.0)); vec3 dy = vpos(uv + vec2(0.0, px.y)) - vpos(uv - vec2(0.0, px.y)); return normalize(cross(dx, dy)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
void main(){
  vec2 px = 1.0/res; vec3 col = texture2D(tDiffuse, vUv).rgb;
  float d0 = linD(vUv);
  // speed: the picture smears outward from a point just below the horizon (strongest on the road and at the edges), thin streaks race past,
  // and the frame closes in a little — all of it scaled by how fast the player is going, more under a boost
  if (rush > 0.02){
    vec2 c0 = vec2(0.5, 0.42), q = vUv - c0; q.x *= aspect; float r = length(q);
    float low = 0.6 + 0.6*smoothstep(0.1, -0.35, vUv.y - 0.5);                       // the road under the camera smears more than the sky
    float amt = smoothstep(0.08, 0.6, r)*rush*(0.018 + 0.016*boostK)*low;
    vec2 dir = (vUv - c0)*amt; vec3 acc = col;
    for (int k = 1; k <= 6; k++){ acc += texture2D(tDiffuse, vUv - dir*float(k)/6.0).rgb; }
    col = acc/7.0;
    float ang = atan(q.y, q.x), lanes = 90.0, lane = floor(ang*lanes/6.2832 + 0.5), fl = fract(ang*lanes/6.2832 + 0.5) - 0.5;
    float h1 = hash(vec2(lane, 3.7)), h2 = hash(vec2(lane, 9.1));
    float run = r*(2.2 + 2.0*h1) - time*(5.0 + 7.0*h2)*(0.6 + rush);
    float seg = fract(run), on = step(0.86 - 0.1*boostK, hash(vec2(lane, floor(run))));
    float body = smoothstep(0.0, 0.3, seg)*smoothstep(0.55, 0.3, seg)*(1.0 - smoothstep(0.0, 0.5, abs(fl)*(2.2 + 2.0*r)));
    float streak = on*body*smoothstep(0.22, 0.75, r)*smoothstep(0.3, 1.0, rush)*(0.3 + 0.3*boostK)*low;
    col += vec3(1.0, 0.96, 0.9)*streak;
    col *= 1.0 - smoothstep(0.45, 1.05, r)*0.35*rush; }
  // a cloud bank lying in a height band over part of the circuit (Cirrus Reach's Sky Arcade): measured along each view ray,
  // with soft top and bottom, a soft edge round its sector and drifting lumps, so it is one smooth volume with no surfaces to cut
  float fogAmt = 0.0;
  if (hf.w > 0.0){
    vec3 rd = (camWorld*vec4(vpos(vUv), 1.0)).xyz - camPos; float L = min(length(rd), 2600.0); rd = normalize(rd)*L; float acc = 0.0;
    for (int k = 0; k < 12; k++){ vec3 p = camPos + rd*((float(k) + 0.5)/12.0);
      float band = smoothstep(hf.x - hf.z, hf.x + hf.z, p.y)*(1.0 - smoothstep(hf.y - hf.z, hf.y + hf.z, p.y));
      float a = atan(p.z - hfC.y, p.x - hfC.x), sect = smoothstep(hfC.z - 0.3, hfC.z + 0.15, a)*(1.0 - smoothstep(hfC.w - 0.15, hfC.w + 0.3, a));
      float ring = 1.0 - smoothstep(hfR.x, hfR.y, length(p.xz - hfC.xy));
      acc += band*sect*ring*(0.4 + 1.2*vn3(p*0.016 + vec3(time*0.02, 0.0, time*0.014))); }
    fogAmt = 1.0 - exp(-acc/12.0*L*hf.w);
    col = mix(col, fogCol, fogAmt); }
  if (look < 0.5){ gl_FragColor = vec4(col, 1.0); return; }   // comic look off: only the cloud bank
  // ink: a jump in depth (silhouettes) or in surface direction (box edges, panel folds); thinner with distance, none on the sky
  // second difference, not first: flat ground seen at a grazing angle changes depth fast from pixel to pixel but evenly,
  // so only a real break (a silhouette) leaves a residue — this keeps far road and terrain from inking into a dark band
  float dl = linD(vUv - vec2(px.x, 0.0)), dr = linD(vUv + vec2(px.x, 0.0)), dd = linD(vUv - vec2(0.0, px.y)), du = linD(vUv + vec2(0.0, px.y));
  float e = abs(dl + dr - 2.0*d0) + abs(dd + du - 2.0*d0);
  float edgeD = smoothstep(0.02, 0.08, e/d0);
  vec3 n0 = nrm(vUv, px), n1 = nrm(vUv + vec2(px.x*1.5, 0.0), px), n2 = nrm(vUv + vec2(0.0, px.y*1.5), px);
  float edgeN = smoothstep(0.25, 0.6, max(1.0 - dot(n0, n1), 1.0 - dot(n0, n2))) * smoothstep(260.0, 40.0, d0);   // reconstructed normals get noisy far out
  float sky = step(far*0.9, d0);
  float line = max(edgeD, edgeN) * (1.0 - sky) * smoothstep(700.0, 60.0, d0) * ink * (1.0 - fogAmt);
  // tones: lift into soft steps (a printed-cel feel without flattening the textures)
  vec3 lw = vec3(0.299, 0.587, 0.114); float l = dot(col, lw);
  float steps = 6.0, f = fract(l*steps), lq = (floor(l*steps) + smoothstep(0.3, 0.7, f) + 0.5)/steps;
  col *= mix(1.0, (lq + 0.02)/(l + 0.02), toon*(1.0 - sky*0.7));
  // grade: cool shadows, warm lights, saturated, punchier
  col = mix(col, col*vec3(0.82, 0.90, 1.24), (1.0 - l)*0.30);
  col = mix(col, col*vec3(1.08, 1.01, 0.90), l*0.16);
  float l2 = dot(col, lw); col = mix(vec3(l2), col, 1.16);
  col = (col - 0.5)*1.07 + 0.5;
  // ink on top, then paper grain and a vignette
  col = mix(col, vec3(0.05, 0.035, 0.08), line*0.88);
  col += (hash(gl_FragCoord.xy + fract(time)*113.0) - 0.5)*0.022;
  vec2 q = vUv - 0.5; col *= 1.0 - dot(q, q)*0.6;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}` });
post.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post.mat));
function postEnsure(){
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (post.rt && post.w === size.x && post.h === size.y) return;
  if (post.rt) post.rt.dispose();
  const depth = new THREE.DepthTexture(size.x, size.y); depth.type = THREE.UnsignedIntType;
  post.rt = new THREE.WebGLRenderTarget(size.x, size.y, { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat, depthTexture:depth, depthBuffer:true, stencilBuffer:false });
  post.rt.texture.encoding = renderer.outputEncoding;            // the scene writes exactly what it used to write to the screen
  post.w = size.x; post.h = size.y; post.mat.uniforms.res.value.set(size.x, size.y);
  post.mat.uniforms.tDiffuse.value = post.rt.texture; post.mat.uniforms.tDepth.value = depth;
}
function renderFrame(){
  skyCam.copy(camera); skyCam.near = 10; skyCam.far = 400000; skyCam.updateProjectionMatrix();
  const drawBoth = () => { renderer.render(skyScene, skyCam); const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth(); renderer.render(scene, camera); renderer.autoClear = ac; };
  const fogA = world && world.arcade && world.arcade.fog;
  const rushNow = player && (state === 'race' || state === 'done') && camMode !== 3 && !paused ? Math.min(1.4, Math.hypot(player.vx, player.vz)/MAXS) : 0;
  if ((!lookOn && !fogA && rushNow < .3) || !post.ok){ post.mat.uniforms.rush.value = 0; renderer.setRenderTarget(null); drawBoth(); return; }
  postEnsure();
  renderer.setRenderTarget(post.rt); drawBoth(); renderer.setRenderTarget(null);
  const u = post.mat.uniforms; u.near.value = camera.near; u.far.value = camera.far; u.projInv.value.copy(camera.projectionMatrixInverse); u.time.value = performance.now()/1000; u.dark.value = world && world.dark ? 1 : 0;
  u.look.value = lookOn ? 1 : 0;
  u.rush.value += (Math.max(0, (rushNow - .3)/.7) - u.rush.value)*.12; u.boostK.value += ((player.boost > 0 ? 1 : 0) - u.boostK.value)*.1; u.aspect.value = post.w/Math.max(1, post.h);
  if (fogA){ const f = fogA; u.hf.value.set(f.y0, f.y1, f.soft, f.density); u.hfC.value.set(TRACK_C.x, TRACK_C.z, f.sector[0]*Math.PI/180, f.sector[1]*Math.PI/180); u.hfR.value.set(TRACK_R*1.05, TRACK_R*1.35);
    u.fogCol.value.setHex(world.fog[0]); u.camWorld.value.copy(camera.matrixWorld); u.camPos.value.setFromMatrixPosition(camera.matrixWorld); }
  else u.hf.value.w = 0;
  renderer.render(post.scene, post.cam);
}
function setLook(on){ lookOn = on; try { localStorage.setItem('dustrunner-look', on ? 'comic' : 'clean'); } catch(_){}
  const b = document.getElementById('lookBtn'); if (b){ b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Comic ink on' : 'Comic ink off'; } }


/* ---------- worlds: one planet per vehicle-building civilisation ---------- */
const hemi = new THREE.HemisphereLight(0xcfe2ff, 0xb8834e, 0.75); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2b8, 1.15);
sun.castShadow = true;
sun.shadow.mapSize.set(1024,1024);
const sc = sun.shadow.camera; sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 300;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const SUN_OFF = new THREE.Vector3(-90, 120, -60);

/* ---------- textures ---------- */
function noiseTex(base, specks, size, rays){
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0,0,size,size);
  if (rays) rays(x, size);
  for (let i=0;i<size*size/9;i++){ x.fillStyle = specks[(Math.random()*specks.length)|0]; x.globalAlpha = Math.random()*.5; x.fillRect(Math.random()*size, Math.random()*size, 1+Math.random()*2, 1+Math.random()*2); }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
function textTex(w,h,draw){ const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h); const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; t.anisotropy=8; return t; }
const rnd = (a,b) => a + Math.random()*(b-a);
const wrapA = a => Math.atan2(Math.sin(a),Math.cos(a));
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

/* sky dome: world-fixed, follows the camera so it never clips */
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 24), new THREE.MeshBasicMaterial({side:THREE.BackSide, fog:false, depthWrite:false}));
skyDome.renderOrder = -10;
// the sky has its own scene and camera (huge far plane), drawn first; the world is drawn over it with a cleared depth buffer,
// so sky objects can be as big and as far away as they need to be without being clipped by the world camera
const skyScene = new THREE.Scene(), skyCam = new THREE.PerspectiveCamera(62, 1, 10, 400000); skyScene.add(skyDome);
function skyTexture(w){
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const x = c.getContext('2d'); x.scale(2, 2);     // twice the old resolution, same layout
  const g = x.createLinearGradient(0,0,0,512); for (const [o,col] of w.sky) g.addColorStop(o,col); x.fillStyle = g; x.fillRect(0,0,1024,512);
  if (w.skyExtra) w.skyExtra(x, 1024, 512);
  { const top = x.createLinearGradient(0, 0, 0, 80); top.addColorStop(0, w.sky[0][1]); top.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = top; x.fillRect(0, 0, 1024, 80); }   // calm the pole, where the dome pinches the paint into streaks
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}

/* ---------- celestial objects: real geometry instead of paint ----------
   Stars, suns and the ringed sun of the Conduit used to be painted into the 1024px sky texture, so they turned into blurry,
   pixelated blobs whenever the camera looked up at them. Now each is a real object in a sky group that rides with the camera:
   stars are round, twinkling points sized in screen pixels; suns are spheres with crisp edges; the Conduit's sun has its bands
   cut by a shader and a real ring that passes in front of and behind it. The painted dome keeps only the soft gradients and glows. */
const skyGroup = new THREE.Group(); skyGroup.renderOrder = -9; skyScene.add(skyGroup);
const SKY_D = 2200, SKY_ST = { t:0 };
// a direction on the sky from the old painted-texture coordinates, so everything stays where it was painted
function skyDir(u, v){ const ph = u*Math.PI*2, th = v*Math.PI; return new THREE.Vector3(-Math.cos(ph)*Math.sin(th), Math.cos(th), Math.sin(ph)*Math.sin(th)); }
const skyAng = px => px*Math.PI/512;              // painted pixel radius → angular radius
const haloTex = (stops) => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const g = x.createRadialGradient(128,128,0,128,128,128);
  for (const [o, col] of stops) g.addColorStop(o, col); x.fillStyle = g; x.fillRect(0,0,256,256); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; };
const starMat = new THREE.ShaderMaterial({ uniforms:{ uT:{value:0}, uPR:{value:1} }, transparent:true, depthWrite:false, depthTest:true, fog:false, blending:THREE.AdditiveBlending,
  vertexShader:'attribute float size; attribute float ph; attribute vec3 col; uniform float uT, uPR; varying vec3 vC; varying float vA;\n'+
    'void main(){ vC = col; float tw = .78 + .22*sin(uT*(1.3 + fract(ph*7.)*2.6) + ph*6.283); vA = tw; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize = size*uPR*(.85 + .15*tw); }',
  fragmentShader:'varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord - .5; float d = length(p)*2.; float core = smoothstep(1., .0, d); core *= core; float a = core*vA; if (a < .01) discard; gl_FragColor = vec4(vC*a, a); }' });
function makeStars(n, vMin, vMax, tint, sizeK){
  const pos = new Float32Array(n*3), size = new Float32Array(n), ph = new Float32Array(n), col = new Float32Array(n*3), R = SKY_D*1.08;
  const c1 = new THREE.Color(), base = new THREE.Color(tint || 0xdde6ff);
  for (let i=0;i<n;i++){ const u = Math.random(), z0 = Math.cos(vMin*Math.PI), z1 = Math.cos(vMax*Math.PI), cz = z0 + (z1 - z0)*Math.random(), th = Math.acos(cz);   // uniform over the band of sky
    const d = skyDir(u, th/Math.PI); pos[i*3] = d.x*R; pos[i*3+1] = d.y*R; pos[i*3+2] = d.z*R;
    const b = Math.pow(Math.random(), 2.6); size[i] = (2.2 + b*5.2)*(sizeK || 1); ph[i] = Math.random();
    c1.copy(base).offsetHSL(rnd(-.05, .05), rnd(-.1, .15), 0).multiplyScalar(.8 + .6*b); col[i*3] = c1.r; col[i*3+1] = c1.g; col[i*3+2] = c1.b; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); g.setAttribute('col', new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(g, starMat); p.frustumCulled = false; p.renderOrder = -9; return p;
}
// a plain sun: a crisp sphere and a soft halo behind it
function makeSun(u, v, px, col, haloRGB, a, light){
  const d = skyDir(u, v), r = SKY_D*Math.tan(skyAng(px)), G = new THREE.Group(); G.position.copy(d).multiplyScalar(SKY_D);
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 24), new THREE.MeshBasicMaterial({ color:col, fog:false, transparent:true, opacity:a })); s.renderOrder = -8; G.add(s);
  const h = new THREE.Sprite(new THREE.SpriteMaterial({ map:haloTex([[0,`rgba(${haloRGB},${a})`],[.15,`rgba(${haloRGB},${a*.6})`],[.45,`rgba(${haloRGB},${a*.18})`],[1,`rgba(${haloRGB},0)`]]), fog:false, depthTest:false, depthWrite:false, transparent:true, blending: light ? THREE.NormalBlending : THREE.AdditiveBlending, opacity: light ? .55 : 1 }));
  h.scale.setScalar(light ? r*5 : r*8); h.renderOrder = -9; G.add(h); return G;
}
// the Conduit's retro sun: banded lower half cut cleanly by the shader, a real ring round it, and a warm halo
function makeRetroSun(u, v, px){
  const DIST = 60000, d = skyDir(u, v), r = DIST*Math.sin(Math.min(1.2, skyAng(px))), G = new THREE.Group(); G.position.copy(d).multiplyScalar(DIST); G.lookAt(0, 0, 0);
  const sunM = new THREE.ShaderMaterial({ fog:false, extensions:{ derivatives:true },
    vertexShader:'varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader:'uniform float uR; uniform vec3 uUp; uniform float uSinA; varying vec3 vW; varying vec3 vN;\n'+
      'vec3 ramp(float t){ vec3 a = vec3(1.,.965,.816), b = vec3(1.,.827,.416), c = vec3(1.,.478,.29), e = vec3(1.,.247,.525);\n'+
      '  if (t < .45) return mix(a, b, t/.45); if (t < .8) return mix(b, c, (t-.45)/.35); return mix(c, e, (t-.8)/.2); }\n'+
      'void main(){ float y = clamp(dot(normalize(vW - cameraPosition), uUp)/uSinA, -1., 1.), t = clamp((1. - y)*.5, 0., 1.); vec3 col = ramp(t); col = pow(col, vec3(2.2));\n'+
      '  float fw = fwidth(y)*1.2, cut = 0.;\n'+
      '  for (int k=0;k<7;k++){ float fk = float(k), y0 = -(.12 + fk*.13), y1 = y0 - (2. + fk*1.9)/64.; cut = max(cut, smoothstep(y0 + fw, y0 - fw, y)*smoothstep(y1 - fw, y1 + fw, y)); }\n'+
      '  col *= .9 + .1*clamp(vN.z, 0., 1.);\n'+
      '  gl_FragColor = vec4(mix(col, vec3(.0035,.004,.016), cut), 1.); }',
    uniforms:{ uR:{ value:r }, uUp:{ value:new THREE.Vector3(0, 1, 0).applyQuaternion(G.quaternion) }, uSinA:{ value:r/DIST } } });   // bands laid out by viewing angle, so they sit where the eye expects however close the sphere is
  const sun = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 48), sunM); sun.renderOrder = -8; G.add(sun);
  const ringM = new THREE.ShaderMaterial({ fog:false, transparent:true, depthWrite:false, side:THREE.DoubleSide, extensions:{ derivatives:true }, uniforms:{ uR:{ value:r } },
    vertexShader:'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader:'uniform float uR; varying vec2 vP; float band(float q, float c, float w){ float fw = fwidth(q)*1.2; return smoothstep(c - w - fw, c - w + fw, q)*smoothstep(c + w + fw, c + w - fw, q); }\n'+
      'void main(){ float q = length(vP)/uR; float a = .92*band(q, 1.75, .045) + .55*band(q, 2.05, .028) + .18*band(q, 1.9, .1);\n'+
      '  if (a < .005) discard; vec3 col = mix(vec3(1.,.9,.78), vec3(1.,.78,.66), smoothstep(1.7, 2.1, q)); gl_FragColor = vec4(pow(col, vec3(2.2)), a); }' });
  const ring = new THREE.Mesh(new THREE.RingGeometry(r*1.55, r*2.2, 160, 1), ringM); ring.rotation.x = Math.PI/2 - .284; ring.renderOrder = -7; G.add(ring);
  const h = new THREE.Sprite(new THREE.SpriteMaterial({ map:haloTex([[0,'rgba(255,170,90,.55)'],[.25,'rgba(255,170,90,.45)'],[.55,'rgba(255,90,140,.18)'],[1,'rgba(120,40,160,0)']]), fog:false, depthTest:false, depthWrite:false, transparent:true, blending:THREE.AdditiveBlending }));
  h.scale.setScalar(r*5.2); h.renderOrder = -9; G.add(h);
  return G;
}
// a lit planet or moon: a sphere shaded by a fixed light (soft terminator, faint latitude bands or craters, a rim of atmosphere),
// optionally with a ring; placed far away and sized by angle like the Conduit's sun
function makePlanet(u, v, px, o){
  const DIST = 60000, d = skyDir(u, v), r = DIST*Math.sin(Math.min(1.2, skyAng(px))), G = new THREE.Group(); G.position.copy(d).multiplyScalar(DIST); G.lookAt(0, 0, 0);
  const L = o.faceLit ? d.clone().negate().add(new THREE.Vector3(...o.faceLit)).normalize() : new THREE.Vector3(...(o.light || [-.6, .5, .6])).normalize();
  const m = new THREE.ShaderMaterial({ fog:false, uniforms:{ uA:{ value:new THREE.Color(o.base) }, uB:{ value:new THREE.Color(o.dark) }, uL:{ value:L }, uCr:{ value:o.craters ? 1 : 0 }, uBand:{ value:o.bands || 0 }, uRim:{ value:new THREE.Color(o.rim || 0xffffff) } },
    vertexShader:'varying vec3 vN; varying vec3 vO; varying vec3 vV; void main(){ vO = normalize(position); vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader:'uniform vec3 uA, uB, uL, uRim; uniform float uCr, uBand; varying vec3 vN; varying vec3 vO; varying vec3 vV;\n'+
      'float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }\n'+
      'float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }\n'+
      'void main(){ float lit = smoothstep(-.25, .55, dot(vN, uL)); vec3 c = mix(uB, uA, lit);\n'+
      '  float tex = n3(vO*3.) *.6 + n3(vO*7.)*.4; c *= .9 + .18*tex;\n'+
      '  if (uBand > 0.) c *= 1. + uBand*(sin(vO.y*18. + n3(vO*2.)*4.)*.5);\n'+
      '  if (uCr > 0.){ float cr = smoothstep(.62, .7, n3(vO*5.)) - smoothstep(.72, .8, n3(vO*5.))*.6 + smoothstep(.66, .74, n3(vO*11. + 3.))*.5; c *= 1. - .16*cr; }\n'+
      '  float rim = pow(1. - max(dot(vN, vV), 0.), 2.5); c = mix(c, uRim, rim*.55*(.35 + .65*lit));\n'+
      '  gl_FragColor = vec4(c, 1.); }' });
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 32), m); s.renderOrder = -8; G.add(s);
  if (o.ring){ const ringM = new THREE.ShaderMaterial({ fog:false, transparent:true, depthWrite:false, side:THREE.DoubleSide, extensions:{ derivatives:true }, uniforms:{ uR:{ value:r }, uC:{ value:new THREE.Color(o.ringCol || 0xeaf4ff) } },
      vertexShader:'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader:'uniform float uR; uniform vec3 uC; varying vec2 vP; float band(float q, float c, float w){ float fw = fwidth(q)*1.2; return smoothstep(c - w - fw, c - w + fw, q)*smoothstep(c + w + fw, c + w - fw, q); }\n'+
        'void main(){ float q = length(vP)/uR; float a = .55*band(q, 1.5, .12) + .8*band(q, 1.78, .08) + .35*band(q, 2.05, .1) + .5*band(q, 2.3, .03);\n'+
        '  if (a < .005) discard; gl_FragColor = vec4(uC, a*.85); }' });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r*1.3, r*2.45, 160, 1), ringM); ring.rotation.x = Math.PI/2 - (o.ringTilt || .3); ring.rotation.y = o.ringRoll || 0; ring.renderOrder = -7;
    const rg = new THREE.Group(); rg.rotation.z = o.ringRoll || 0; rg.add(ring); G.add(rg); }
  if (o.halo){ const h = new THREE.Sprite(new THREE.SpriteMaterial({ map:haloTex([[0,`rgba(${o.halo},.35)`],[.4,`rgba(${o.halo},.15)`],[1,`rgba(${o.halo},0)`]]), fog:false, depthTest:false, depthWrite:false, transparent:true }));
    h.scale.setScalar(r*3.2); h.renderOrder = -9; G.add(h); }
  return G;
}
// a banded gas giant: latitude belts warped by turbulence, a great storm, soft terminator, a wide pale ring system
function makeGiant(u, v, px, o){
  const DIST = 60000, d = skyDir(u, v), r = DIST*Math.sin(Math.min(1.2, skyAng(px))), G = new THREE.Group(); G.position.copy(d).multiplyScalar(DIST); G.lookAt(0, 0, 0);
  const tilt = new THREE.Group(); tilt.rotation.z = o.roll || 0; G.add(tilt);
  const Lg = d.clone().negate().add(new THREE.Vector3(...(o.lightOff || [.55, .35, 0]))).normalize();     // lit mostly from the viewer's side, the terminator off to one edge
  const m = new THREE.ShaderMaterial({ fog:false, uniforms:{ uL:{ value:Lg } },
    vertexShader:'varying vec3 vN; varying vec3 vO; varying vec3 vV; void main(){ vO = normalize(position); vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader:'uniform vec3 uL; varying vec3 vN; varying vec3 vO; varying vec3 vV;\n'+
      'float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }\n'+
      'float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }\n'+
      'float fbm(vec3 p){ return n3(p)*.5 + n3(p*2.1)*.25 + n3(p*4.3)*.125 + n3(p*8.7)*.0625; }\n'+
      'void main(){ vec3 p = vO; float lat = p.y + (fbm(p*vec3(2.,6.,2.))-.5)*.16 + (fbm(p*vec3(6.,18.,6.))-.5)*.05;\n'+
      '  float b = sin(lat*22.) *.5 + .5, b2 = sin(lat*9. + 1.3)*.5 + .5;\n'+
      '  vec3 cream = vec3(.93,.84,.68), tan = vec3(.78,.58,.4), rust = vec3(.55,.32,.2), dark = vec3(.32,.2,.14);\n'+
      '  vec3 c = mix(cream, tan, b); c = mix(c, rust, smoothstep(.55, .95, b2)*.75); c = mix(c, dark, smoothstep(.85, 1., b)*.35*(1. - abs(p.y)));\n'+
      '  vec2 sp = vec2(atan(p.z, p.x) - .6, p.y + .28); float e = length(sp*vec2(1., 2.2)); c = mix(c, vec3(.78,.36,.22), smoothstep(.2, .1, e)*.9); c = mix(c, vec3(.95,.7,.5), smoothstep(.07, .0, e)*.5);   // the great storm\n'+
      '  c *= .88 + .2*fbm(p*14.);\n'+
      '  float lit = smoothstep(-.18, .5, dot(vN, uL)); c = mix(c*.06, c, lit);\n'+
      '  float rim = pow(1. - max(dot(vN, vV), 0.), 3.); c = mix(c, vec3(1.,.9,.75), rim*.35*lit);\n'+
      '  gl_FragColor = vec4(pow(c, vec3(1.6)), 1.); }' });
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 48), m); s.renderOrder = -8; tilt.add(s);
  const ringM = new THREE.ShaderMaterial({ fog:false, transparent:true, depthWrite:false, side:THREE.DoubleSide, extensions:{ derivatives:true }, uniforms:{ uR:{ value:r } },
    vertexShader:'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader:'uniform float uR; varying vec2 vP; float hh(float x){ return fract(sin(x*127.1)*43758.5); }\n'+
      'void main(){ float q = length(vP)/uR; if (q < 1.35 || q > 2.5) discard; float fw = fwidth(q);\n'+
      '  float k = floor(q*90.), fine = mix(hh(k), hh(k + 1.), smoothstep(0., 1., fract(q*90.)));\n'+
      '  float a = (.35 + .65*fine)*smoothstep(1.35, 1.42, q)*smoothstep(2.5, 2.38, q);\n'+
      '  a *= 1. - .85*smoothstep(1.86 - fw, 1.86, q)*smoothstep(1.94 + fw, 1.94, q);       // a dark gap in the rings\n'+
      '  vec3 c = mix(vec3(.82,.84,.86), vec3(.66,.64,.62), fine);\n'+
      '  gl_FragColor = vec4(pow(c, vec3(1.4)), a*.82); }' });
  const ring = new THREE.Mesh(new THREE.RingGeometry(r*1.3, r*2.55, 220, 1), ringM); ring.rotation.x = Math.PI/2 - (o.ringTilt || .3); ring.renderOrder = -7; tilt.add(ring);
  return G;
}
// a band of the galaxy: many faint stars packed close to a great circle
function makeStarBand(n, axis, width){
  const ax = new THREE.Vector3(...axis).normalize(), t1 = new THREE.Vector3(1, 0, 0).cross(ax).normalize(), t2 = ax.clone().cross(t1), R = SKY_D*1.08;
  const pos = new Float32Array(n*3), size = new Float32Array(n), ph = new Float32Array(n), col = new Float32Array(n*3), v = new THREE.Vector3(), c = new THREE.Color();
  for (let i=0;i<n;i++){ const a = Math.random()*Math.PI*2, off = (Math.random() + Math.random() + Math.random() - 1.5)*width;
    v.copy(t1).multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a)).addScaledVector(ax, off).normalize(); if (v.y < -.05){ i--; continue; }
    pos[i*3] = v.x*R; pos[i*3+1] = v.y*R; pos[i*3+2] = v.z*R; size[i] = 1.4 + Math.pow(Math.random(), 4)*3.5; ph[i] = Math.random();
    c.setHSL(rnd(.55, .68), rnd(.1, .5), rnd(.55, .85)); col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); g.setAttribute('col', new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(g, starMat); p.frustumCulled = false; p.renderOrder = -9; return p;
}
// drifting asteroids high in the black: lit rock, tumbling slowly
function makeAsteroids(n){
  const m = new THREE.ShaderMaterial({ fog:false, uniforms:{ uL:{ value:skyDir(.262, .335).negate().add(new THREE.Vector3(.55, .35, 0)).normalize() } },
    vertexShader:'varying vec3 vN; void main(){ vec4 p = vec4(position,1.); vec3 nn = normal;\n#ifdef USE_INSTANCING\n p = instanceMatrix*p; nn = mat3(instanceMatrix)*nn;\n#endif\n vN = normalize(mat3(modelMatrix)*nn); gl_Position = projectionMatrix*viewMatrix*modelMatrix*p; }',
    fragmentShader:'uniform vec3 uL; varying vec3 vN; void main(){ float l = max(dot(vN, uL), 0.); vec3 c = vec3(.46,.44,.42)*(.32 + .85*l); gl_FragColor = vec4(c, 1.); }' });
  const im = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), m, n), o = new THREE.Object3D(), data = [];
  for (let i=0;i<n;i++){ const cl = Math.random() < .6, u = cl ? (Math.random() < .5 ? rnd(.02, .14) : rnd(.38, .5)) : Math.random(), v = cl ? rnd(.25, .42) : rnd(.08, .44), d = skyDir(u, v), D = rnd(9000, 22000), s = D*Math.tan(rnd(.003, .014));
    data.push({ d, D, s, rx:Math.random()*6, ry:Math.random()*6, w:rnd(-.3, .3), sq:rnd(.55, 1) }); }
  const step = (t) => { for (let i=0;i<n;i++){ const a = data[i]; o.position.copy(a.d).multiplyScalar(a.D); o.rotation.set(a.rx + t*a.w, a.ry + t*a.w*.7, 0); o.scale.set(a.s, a.s*a.sq, a.s*(.7 + a.sq*.3)); o.updateMatrix(); im.setMatrixAt(i, o.matrix); } im.instanceMatrix.needsUpdate = true; };
  step(0); im.frustumCulled = false; im.renderOrder = -8; im.userData.update = (t) => step(t); return im;
}
// comets: a bright head and a long fading tail, crossing the sky on a slow arc every so often
function makeComets(k){
  const G = new THREE.Group(), tailT = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 256, 0); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.08, 'rgba(200,235,255,.85)'); g.addColorStop(.5, 'rgba(140,200,255,.55)'); g.addColorStop(1, 'rgba(90,150,255,0)'); x.fillStyle = g;
    x.beginPath(); x.moveTo(0, 32); x.quadraticCurveTo(80, 4, 256, 0); x.lineTo(256, 64); x.quadraticCurveTo(80, 60, 0, 32); x.fill(); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; })();
  const headT = haloTex([[0,'rgba(255,255,255,1)'],[.15,'rgba(220,240,255,.9)'],[.4,'rgba(150,200,255,.25)'],[1,'rgba(120,180,255,0)']]);
  const C = [];
  for (let i=0;i<k;i++){ const tail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(.5, 0, 0), new THREE.MeshBasicMaterial({ map:tailT, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false, side:THREE.DoubleSide }));
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map:headT, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
    tail.matrixAutoUpdate = false; tail.renderOrder = head.renderOrder = -8; G.add(tail, head); C.push({ tail, head, t:-rnd(2, 10)*(i + 1), dur:1, a:null, b:null }); }
  const D = 30000, X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), M = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Vector3();
  const pick = c => { const u0 = Math.random(), v0 = rnd(.12, .36), ang = rnd(.5, 1.1)*(Math.random() < .5 ? 1 : -1); c.a = skyDir(u0, v0); c.b = skyDir(u0 + ang*.12, Math.min(.44, v0 + rnd(.04, .12)));
    c.dur = rnd(8, 13); c.t = 0; c.len = rnd(.3, .45)*D; c.wid = c.len*rnd(.06, .09); };
  G.userData.update = (t, dt) => { for (const c of C){ c.t += dt; if (c.t < 0){ c.tail.visible = c.head.visible = false; continue; } if (!c.a) pick(c);
      const u = c.t/c.dur; if (u >= 1){ c.a = null; c.t = -rnd(4, 14); continue; }
      const fade = Math.min(1, u*6, (1 - u)*5); p.copy(c.a).lerp(c.b, u).normalize().multiplyScalar(D); q.copy(c.a).lerp(c.b, Math.min(1, u + .01)).normalize().multiplyScalar(D);
      X.copy(p).sub(q).normalize();                              // the tail trails behind the head
      Z.copy(p).negate().normalize(); Z.addScaledVector(X, -Z.dot(X)).normalize(); Y.crossVectors(Z, X);
      M.makeBasis(X, Y, Z).scale(new THREE.Vector3(c.len, c.wid, 1)).setPosition(p); c.tail.matrix.copy(M); c.tail.matrixWorldNeedsUpdate = true;
      c.head.position.copy(p); c.head.scale.setScalar(c.wid*3.2); c.tail.material.opacity = fade; c.head.material.opacity = fade; c.tail.visible = c.head.visible = true; } };
  return G;
}
const CELEST = {
  desert:  () => [ makeSun(.71, .3, 46*.8, 0xffffff, '255,236,196', .95, true), makeSun(.645, .405, 17, 0xfff4dc, '255,226,180', .9, true) ],
  quarry:  () => [ makeStars(2400, 0, .5, 0xffffff, 1), makeStarBand(4200, [.35, .55, .76], .09), makeGiant(.262, .335, 62, { roll:-.28, ringTilt:.24 }),
                 makePlanet(.13, .33, 7, { base:0xd8d2c8, dark:0x4a4640, craters:true, faceLit:[.55,.35,0] }), makePlanet(.355, .37, 9, { base:0xc8c4c0, dark:0x3a3836, craters:true, faceLit:[.55,.35,0] }),
                 makePlanet(.075, .4, 5, { base:0xe0d8cc, dark:0x504a44, craters:true, faceLit:[.55,.35,0] }), makeAsteroids(70), makeComets(2) ],
  tundra:  () => [ makePlanet(.31, .24, 44, { base:0xe8f2ff, dark:0x7f97c8, rim:0xffffff, bands:.06, ring:true, ringTilt:.38, ringRoll:-.35, ringCol:0xeef6ff, light:[-.5,.4,.75] }),
                 makePlanet(.36, .17, 9, { base:0xf2f6ff, dark:0x8fa3cc, craters:true }), makePlanet(.27, .3, 7, { base:0xf4f2fa, dark:0x9aa6c8, craters:true }),
                 makePlanet(.16, .27, 26, { base:0xf2f6ff, dark:0x95a8d0, craters:true, light:[-.7,.3,.6] }) ],
  conduit: () => [ makeStars(2200, 0, .5, 0xdde6ff, 1), makeStars(700, .52, .98, 0xffc890, .7), makeRetroSun(.78, .418, 160) ],
};
function buildCelestial(w){
  for (const o of skyGroup.children.slice()){ skyGroup.remove(o); o.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material && m.material !== starMat){ if (m.material.map) m.material.map.dispose(); m.material.dispose(); } }); }
  const f = CELEST[w.id]; if (f) for (const o of f()) skyGroup.add(o);
}
function celestialUpdate(dt){ skyGroup.position.copy(camera.position); SKY_ST.t += dt; starMat.uniforms.uT.value = SKY_ST.t; starMat.uniforms.uPR.value = renderer.getPixelRatio();
  for (const o of skyGroup.children) if (o.userData.update) o.userData.update(SKY_ST.t, dt); }

/* world list */
const WORLDS = {
  desert: { id:'desert', sig:'Mesa Hairpin', name:'Mojave Basin', planet:'Earth', home:'truck', banner:'MOJAVE BASIN RALLY  ·  STAGE 4',
    blurb:'Earth, home of the rally crews. A dirt road through dune country under twin suns: under sandstone arches, past hoodoos, and over a steel bridge where the desert pours into a canyon. Dust devils wander the basin, tumbleweeds blow across the road and sand drifts bog you down.',
    hazardText:'Tumbleweeds · sand drifts · dust devils · canyon bridge', customGround:true,
    ctrl:[[280,0],[269,57],[239,107],[199,144],[154,171],[109,189],[65,199],[21,204],[-21,204],[-65,199],[-109,189],[-154,171],[-199,144],[-239,107],[-269,57],[-280,0],[-212,-30],[-202,-48],[-140,-54],[-84,-44],[-77,-56],[-110,-102],[-131,-161],[-120,-177],[-109,-189],[-65,-199],[-21,-204],[-7,-206],[44,-228],[77,-174],[137,-182],[152,-127],[192,-94],[239,-107],[269,-57]],
    sky:[[0,'#4f86c0'],[.18,'#7fa8cc'],[.33,'#c3d0c6'],[.44,'#ecdcb4'],[.49,'#f3d9a6'],[.5,'#efcf98'],[1,'#e2b47c']], fog:[0xe9cfa0,320,1750],
    skyExtra:(x,w,h)=>{ const sun = (cx, cy, r, a) => { const g = x.createRadialGradient(cx, cy, r*.6, cx, cy, r*4); g.addColorStop(0, `rgba(255,248,226,${a})`); g.addColorStop(1, 'rgba(255,240,210,0)'); x.fillStyle = g; x.fillRect(cx - r*4, cy - r*4, r*8, r*8);
        x.fillStyle = `rgba(255,250,236,${a})`; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); };
      // the twin suns are real spheres now (CELEST.desert)
      for (let i=0;i<14;i++){ const cx = Math.random()*w, cy = h*rnd(.3, .47), rw = rnd(80, 260); const g = x.createRadialGradient(cx, cy, 0, cx, cy, rw); g.addColorStop(0, 'rgba(225,195,150,.35)'); g.addColorStop(1, 'rgba(225,195,150,0)'); x.fillStyle = g; x.fillRect(cx - rw, cy - rw, rw*2, rw*2); } },
    hemi:[0xcfe2ff,0xb8834e,.75], sun:[0xffe2b8,1.15], sunDir:[-90,120,-60], bg:0xefd0a0,
    ground:['#d6a565',['#e8c08a','#b8844c','#c99558','#f1d2a0']], road:['#86603d',['#9b7350','#6c4a2d','#a27c56'],'rgba(60,38,20,.35)'],
    curb:[0x3a2a1c,0xf5a623], post:[0x2e241a,0xf5a623], gate:{bg:'#1f2228',fg:'#f0b44c',line:'#26b8b2',post:0x2b2f36},
    pad:'#5ef0e6', padFill:'rgba(38,184,178,.25)', dust:0xdcb98a },
  forge: { id:'forge', sig:'The Anvil chicane · Meltdown Gap', name:'Basalt Forge', planet:'Ignis Prime', home:'tank', banner:'BASALT FORGE  ·  THE STONEWRIGHTS’ CIRCUIT',
    blurb:'Ignis Prime, forge-world of the stonewrights who build the Bulwark. Black basalt under an ember sky; lava fissures split the road and stone pillars stand in the racing line.',
    hazardText:'Lava fissures · basalt pillars · eruptions · Meltdown Gap',
    // the Meltdown Gap: a 1400 m canyon across the bottom straight; the road over it melted through in the middle, so the field
    // is flung across a ~650 m gap from a lip on the old causeway (at: straight's midpoint in ctrl units; gap in metres)
    elev:[[0,0],[120,0],[240,0]], canyon:{ at:[0,-330], gap:650, vmin:78, ramp:10, grade:.7, depth:300, wMax:400, len:1400 }, customGround:true,
    ctrl:[[262,0],[255,54],[234,104],[203,147],[163,181],[128,205],[106,261],[45,195],[19,274],[-19,217],[-67,235],[-72,223],[-119,207],[-163,181],[-203,147],[-234,104],[-255,54],[-262,0],[-268,-60],[-288,-125],[-315,-190],[-338,-250],[-335,-298],[-300,-325],[-240,-330],[-160,-330],[-80,-330],[0,-330],[80,-330],[160,-330],[240,-330],[300,-325],[335,-298],[338,-250],[315,-190],[288,-125],[268,-60]],
    sky:[[0,'#2a0805'],[.22,'#6a1608'],[.4,'#b3300f'],[.47,'#e8581c'],[.5,'#ff9a3c'],[.53,'#7a2612'],[1,'#1d0f0b']], fog:[0x6a2412,160,1200],
    hemi:[0xffa070,0x2a1814,.7], sun:[0xffa060,1.15], sunDir:[70,80,-90], bg:0x4a2016,
    ground:['#2a2421',['#3a322e','#1c1816','#46392f','#5a2a12'], (x,s)=>{ x.strokeStyle='rgba(255,110,30,.55)'; x.lineWidth=1.4; for(let i=0;i<14;i++){ x.beginPath(); let px=Math.random()*s, py=Math.random()*s; x.moveTo(px,py); for(let k=0;k<5;k++){ px+=rnd(-30,30); py+=rnd(-30,30); x.lineTo(px,py);} x.stroke(); } }],
    road:['#3b3431',['#4a413c','#2a2421','#5e3b26'],'rgba(0,0,0,.35)'],
    curb:[0x1c1918,0xff7a2a], post:[0x1c1918,0xff7a2a], gate:{bg:'#120c0a',fg:'#ff8a3a',line:'#ffcf6a',post:0x1a1513},
    pad:'#ffcf6a', padFill:'rgba(255,140,40,.25)', dust:0x6e625c },
  tundra: { id:'tundra', sig:'Spire double-apex', name:'Glacier Spire', planet:'Velka IV', home:'walker', banner:'GLACIER SPIRE  ·  STRIDE OF THE VELKANS',
    blurb:'Velka IV, frozen homeworld of the walker-builders. A glacier road under a ringed sky: over a crevasse on an icicle-hung truss bridge, beneath floating ice islands and humming energy spires. Ice sheets steal your grip and crystal spires grow out of the road.',
    hazardText:'Ice sheets · crystal spires · crevasse bridge', customGround:true,
    ctrl:[[270,0],[261,55],[236,105],[201,146],[159,176],[114,198],[69,211],[23,217],[-23,217],[-69,211],[-114,198],[-159,176],[-201,146],[-184,124],[-192,85],[-126,34],[-171,21],[-171,-15],[-127,-29],[-195,-79],[-184,-124],[-201,-146],[-159,-176],[-114,-198],[-69,-211],[-23,-217],[23,-217],[69,-211],[114,-198],[159,-176],[201,-146],[236,-105],[261,-55]],
    sky:[[0,'#6c97d2'],[.2,'#92b5e2'],[.35,'#c2d5ef'],[.44,'#e6d8ea'],[.49,'#f4dbe5'],[.5,'#eef2f8'],[1,'#dfe9f4']], fog:[0xe6edf7,320,1800],
    hemi:[0xe0f0ff,0x8aa0b8,.85], sun:[0xfff1e0,1.05], sunDir:[-60,70,90], bg:0xe6edf7,
    // the planet and moons are real objects (CELEST.tundra)
    ground:['#e9f0f6',['#ffffff','#d2deea','#c4d4e4','#f4f8fc']], road:['#5d87ad',['#6c96bb','#4f7aa0','#86acc9'],'rgba(225,246,255,.35)'],
    curb:[0xeaf6ff,0x3ab8f0], post:[0xeaf6ff,0x3ab8f0], gate:{bg:'#0f1a2e',fg:'#bfe6ff',line:'#5ef0e6',post:0x2a3b52},
    pad:'#ff7ad9', padFill:'rgba(255,90,200,.22)', dust:0xf2f7ff },
  cirrus: { id:'cirrus', sig:'Skyhook curl', name:'Cirrus Reach', planet:'Aeolis', home:'jet', banner:'CIRRUS REACH  ·  SKYWAY OF THE AEOLI',
    blurb:'Aeolis, the cloud-world of the jet-builders. A skyway laid across a sea of cloud; energy gates pulse open and shut and wind jets shove you sideways.',
    hazardText:'Energy gates · wind jets',
    ctrl:[[280,0],[270,57],[242,108],[203,148],[159,177],[113,197],[68,209],[23,214],[-23,214],[-68,209],[-113,197],[-159,177],[-169,141],[-178,117],[-139,79],[-82,23],[-85,7],[-160,7],[-208,-49],[-207,-75],[-242,-108],[-203,-148],[-159,-177],[-113,-197],[-68,-209],[-23,-214],[23,-214],[68,-209],[108,-187],[152,-181],[152,-127],[187,-108],[242,-108],[270,-57]],
    sky:[[0,'#1c4fae'],[.3,'#4d8fe0'],[.46,'#a9d2f7'],[.5,'#fff1fb'],[1,'#f3eefc']], fog:[0xf1f0fb,240,1600],
    hemi:[0xffffff,0xc8c4ff,.95], sun:[0xfff8e6,1.1], sunDir:[-40,140,50], bg:0xf1f0fb,
    ground:['#f6f4fc',['#ffffff','#e6e2f6','#ece9fa','#dcd7f2']], road:['#1f2645',['#2a3358','#171c36','#33406e'],'rgba(120,220,255,.18)'],
    curb:[0xffffff,0x40e0ff], post:[0xffffff,0x40e0ff], gate:{bg:'#101633',fg:'#ffffff',line:'#40e0ff',post:0x2a3466},
    pad:'#ffe066', padFill:'rgba(255,220,80,.22)', dust:0xffffff,
    // the Sky Arcade: from the start line the skyway climbs onto one tall tier of arches to 120 m, holds round the north sweep,
    // and comes down round the west end; a cloud bank lies over the top (drawn in the post pass) — preview approved 14 Oct
    arcade:{ height:120, up:[2, 70], top:[70, 100], down:[100, 170], fog:{ y0:111, y1:146, soft:10, density:.02, sector:[20, 150] } },
    elev:(() => { const sm = u => u*u*(3 - 2*u), k = []; for (let a = 0; a < 360; a += 5){ let h = 0;
      if (a >= 2 && a <= 70) h = 120*sm((a - 2)/68); else if (a > 70 && a < 100) h = 120; else if (a >= 100 && a <= 170) h = 120*(1 - sm((a - 100)/70)); k.push([a, h]); } return k; })(),
    deck:W/2 + 1.8,
    // the Sky Loop: a 50 m full-width vertical loop on the south bend, 90 m after the third boost pad — preview approved 14 Oct
    loop:{ height:50, frac:.6, gap:23, shift:28, look:'cirrus' } },   // Cirrus navy steel, cyan chevrons (picked in the preview)
  quarry: { id:'quarry', sig:'Switchbacks', name:'Ferrous Moon', planet:'Haulk-3', home:'quad', banner:'FERROUS MOON  ·  HAULK-3 CARGO RUN',
    blurb:'Haulk-3, the mining moon where the cargo walkers are built. A haul road across grey regolith under a ringed gas giant, comets streaking overhead. Launch off the Gravity Jump and float over the rift in low gravity; craters jolt you and cargo crates block the lanes.',
    hazardText:'Gravity jump · cargo crates · craters', customGround:true,
    elev:[[0,0],[90,0],[180,0],[270,0]], jumps:[{lip:30, land:49, ramp:10, kick:3.4, g:7}],
    ctrl:[[265,0],[257,55],[234,104],[200,145],[160,177],[115,200],[70,214],[23,221],[-23,221],[-70,214],[-115,200],[-160,177],[-200,145],[-234,104],[-257,55],[-265,0],[-221,-15],[-213,-31],[-145,-39],[-82,-31],[-78,-41],[-126,-82],[-166,-137],[-154,-160],[-137,-166],[-82,-126],[-41,-78],[-31,-82],[-39,-145],[-31,-213],[-15,-221],[23,-221],[70,-214],[115,-200],[160,-177],[200,-145],[234,-104],[257,-55]],
    sky:[[0,'#010206'],[.4,'#04060c'],[.485,'#121420'],[.5,'#2a2a30'],[1,'#161618']], fog:[0x26272d,700,3000],
    hemi:[0xc0c8e0,0x2a2826,.5], sun:[0xffffff,1.5], sunDir:[-110,80,120], bg:0x26272d,
    // stars are real points now (CELEST.quarry)
    ground:['#8f8d8b',['#a3a19e','#76736f','#b0aeab','#84817d']], road:['#7f776e',['#8c847a','#6a635b','#978e84'],'rgba(40,34,28,.3)'],
    curb:[0x1a1a1a,0xf2c230], post:[0x1a1a1a,0xf2c230], gate:{bg:'#141414',fg:'#f2c230',line:'#f2c230',post:0x2a2a2a},
    pad:'#5ef0e6', padFill:'rgba(38,184,178,.25)', dust:0x9b9590 },
  hive: { id:'hive', sig:'The Lattice chicanes · The Vault', name:'Hive Lattice', planet:'Unity Prime', home:'drone', banner:'HIVE LATTICE  ·  UNITY PRIME CIRCUIT', dark:true,
    tube:{ ang:267, len:800, wall:14, roof:11 },   // the Vault: an 800 m unlit tunnel following the bottom straight and both its bends bored through a hive block, headlights only
    blurb:'Unity Prime, a planet the Collective has plated over with machinery. The road threads a city of humming cube-towers under a green storm; charged floor plates jolt your steering, data pylons stand in the line, and the sky earths itself onto the track.',
    hazardText:'Charged plates · data pylons · lightning storm',
    ctrl:[[262,0],[262,110],[238,190],[170,232],[85,236],[60,178],[-60,178],[-85,236],[-170,232],[-238,190],[-262,110],[-262,-20],[-196,-48],[-196,-122],[-262,-150],[-238,-206],[-170,-236],[-60,-238],[60,-238],[170,-236],[238,-206],[262,-120]],
    sky:[[0,'#010503'],[.28,'#031709'],[.44,'#083318'],[.49,'#1f7a43'],[.5,'#5dffa0'],[.515,'#0d3a1e'],[.6,'#05140b'],[1,'#020604']], fog:[0x07170d,170,1150],
    hemi:[0x9affc8,0x0a1a10,.62], sun:[0xc8ffe0,.85], sunDir:[60,120,80], bg:0x07170d,
    skyExtra:(x,w,h)=>{ x.strokeStyle='rgba(90,255,160,.08)'; x.lineWidth=1; for (let i=0;i<w;i+=48){ x.beginPath(); x.moveTo(i,0); x.lineTo(i,h*.47); x.stroke(); } for (let j=0;j<h*.47;j+=48){ x.beginPath(); x.moveTo(0,j); x.lineTo(w,j); x.stroke(); }
      for (let i=0;i<260;i++){ x.fillStyle=`rgba(160,255,200,${Math.random()*.6+.2})`; x.fillRect(Math.random()*w, Math.random()*h*.45, 1, 1); } },
    ground:['#0d1511',['#111b15','#0a110d','#15231b','#0e1712'], (x,s)=>{ x.strokeStyle='rgba(60,255,140,.22)'; x.lineWidth=1; for (let i=0;i<=s;i+=s/4){ x.beginPath(); x.moveTo(i,0); x.lineTo(i,s); x.stroke(); x.beginPath(); x.moveTo(0,i); x.lineTo(s,i); x.stroke(); }
      x.strokeStyle='rgba(60,255,140,.5)'; x.lineWidth=1.5; for (let k=0;k<3;k++){ let px=Math.round(Math.random()*8)*s/8, py=Math.round(Math.random()*8)*s/8; x.beginPath(); x.moveTo(px,py); for (let m=0;m<4;m++){ if (Math.random()<.5) px+=Math.round(rnd(-2,2))*s/8; else py+=Math.round(rnd(-2,2))*s/8; x.lineTo(px,py);} x.stroke(); } }],
    road:['#1c2224',['#22292b','#151a1c','#283032'],'rgba(60,255,140,.10)'],
    curb:[0x0c100e,0x3cff8a], post:[0x0c100e,0x3cff8a], gate:{bg:'#050a07',fg:'#3cff8a',line:'#3cff8a',post:0x101612},
    pad:'#3cff8a', padFill:'rgba(60,255,140,.22)', dust:0x2a3a30 },
  conduit: { id:'conduit', sig:'The Ascent · Star Leap · Keyhole', name:'Halcyon Conduit', planet:'Orbital ring over Vesper', home:'rally', banner:'HALCYON CONDUIT  ·  STARLIGHT RUN',
    blurb:'A transit ring nobody switched off, hanging over the night side of Vesper. The road climbs through a lit tunnel, launches you across open space at the stars, and dives back down through a second conduit. Solar wind sweeps the high deck.',
    hazardText:'Star jumps · tunnels · solar wind · girder bypass',
    ctrl:[[270,0],[264,45],[247,87],[218,126],[181,160],[135,186],[83,204],[28,214],[-28,214],[-83,204],[-126,174],[-169,143],[-210,114],[-247,87],[-264,60],[-258,40],[-236,30],[-214,22],[-200,0],[-214,-22],[-236,-30],[-258,-40],[-264,-60],[-247,-87],[-218,-126],[-191,-169],[-135,-186],[-78,-192],[-28,-214],[28,-214],[83,-204],[130,-178],[176,-151],[218,-126],[247,-87],[264,-45]],
    elev:[[0,0],[30,0],[52,8],[78,52],[104,104],[118,122],[126,124],[140,104],[178,104],[206,100],[236,56],[262,10],[286,0],[300,8],[316,0],[322,0],[340,0]],
    jumps:[{lip:126, land:138, ramp:10, kick:6}, {lip:300, land:311, ramp:8, kick:5}], tunnels:[[50,116],[210,262]], dark:true, groundY:-160, rails:W/2+3.2,
    sky:[[0,'#02030a'],[.33,'#070b1c'],[.46,'#171a44'],[.495,'#4a2060'],[.5,'#2a1440'],[.54,'#0a0c1e'],[1,'#03040a']], fog:[0x070a18,360,1900],
    hemi:[0x6a7cff,0x05060e,.5], sun:[0xc8d8ff,.9], sunDir:[60,140,-40], bg:0x070a18,
    skyExtra:(x,w,h)=>{   // stars and the ringed sun are real objects now (CELEST.conduit); only the nebula glows are painted
      for (const [cx,cy,r,col] of [[w*.3,h*.22,150,'rgba(120,60,200,'],[w*.72,h*.3,190,'rgba(40,120,220,'],[w*.55,h*.14,110,'rgba(230,80,140,']]){ const gr=x.createRadialGradient(cx,cy,0,cx,cy,r); gr.addColorStop(0,col+'.28)'); gr.addColorStop(.5,col+'.12)'); gr.addColorStop(1,col+'0)'); x.fillStyle=gr; x.fillRect(cx-r,cy-r,r*2,r*2); }
      x.fillStyle='rgba(2,3,10,.9)'; x.fillRect(0,h*.5,w,h*.5); },
    ground:['#07091a',['#0b1026','#05070f','#111a3a'], (x,s)=>{ x.strokeStyle='rgba(255,70,200,.55)'; x.lineWidth=3; x.strokeRect(1.5,1.5,s-3,s-3); x.strokeStyle='rgba(255,70,200,.18)'; x.lineWidth=7; x.strokeRect(3.5,3.5,s-7,s-7); for (let i=0;i<260;i++){ x.fillStyle=`rgba(${220+Math.random()*35|0},${170+Math.random()*60|0},${90+Math.random()*80|0},${.35+Math.random()*.6})`; const d=Math.random()<.1?3:1.5; x.fillRect(Math.random()*s,Math.random()*s,d,d); } x.strokeStyle='rgba(255,190,110,.35)'; x.lineWidth=1; for (let i=0;i<5;i++){ x.beginPath(); x.moveTo(Math.random()*s,Math.random()*s); x.lineTo(Math.random()*s,Math.random()*s); x.stroke(); } }],
    road:['#242a44',['#2e3556','#1b2038','#353d66'],'rgba(120,210,255,.28)'],
    curb:[0x0f1322,0x5ef0e6], post:[0xe8f0ff,0x5ef0e6], gate:{bg:'#070a18',fg:'#9fe0ff',line:'#5ef0e6',post:0x1a2030},
    pad:'#ffe066', padFill:'rgba(255,220,80,.22)', dust:0x6a7aa8 },
};
const WORLD_ORDER = ['desert','forge','tundra','cirrus','quarry','conduit','hive'];
let world = WORLDS.desert;
try { const sw = localStorage.getItem('dustrunner-world'); if (sw && WORLDS[sw]) world = WORLDS[sw]; } catch(_){}

/* ---------- track + world state ---------- */
const P = [], T = [], R = [];
// one vehicle-gated shortcut per world: a straight cut across the signature corner over ground only some vehicles can take
const CUTS = {
  desert: { a:188, b:236, kinds:['tank','quad','walker','rally','hover'], surf:'sand',   name:'DUNE CUT',          who:'tracks, legs & buggy', col:0xe0b070 },
  forge:  { a:62,  b:102, kinds:['tank','quad'],          surf:'lava',   name:'FISSURE CROSSING',  who:'Bulwark · Burro',  col:0xff7a2a },
  tundra: { a:152, b:208, kinds:['walker','quad','tank'], surf:'ice',    name:'ICE BRIDGE',        who:'legs & tracks',    col:0x9fe0ff },
  cirrus: { a:140, b:200, kinds:['truck','walker','jet','rally','hover'], surf:'wind',   name:'WIND GAP',          who:'light & fast',     col:0xffffff },
  quarry: { a:226, b:268, kinds:['quad','tank','walker'], surf:'crater', name:'CRATER RIM',        who:'tracks & legs',    col:0xf2c230 },
  conduit:{ a:168, b:192, kinds:['jet','walker'],         surf:'grate',  name:'GIRDER BYPASS',     who:'hover & legs',     col:0x5ef0e6 },
};
let CUT = null;                                     // the live cut: {A,B,dir,len,iA,iB,...}
// elevation: a height per sample (flat worlds stay at 0), road gaps you must jump, and tunnel spans
const H = new Float32Array(N), GAP = new Uint8Array(N), NOROAD = new Uint8Array(N); let JUMPS = [], TUNNELS = [];
const CRAIL = new Uint8Array(N); let CANYON = null; let quakeT = 0, quakeAmp = 0, quakeDur = 1;   // quake*: the ground shaking after an eruption   // CRAIL: road samples over the Meltdown Gap's drop (no ground beside the road: hard rails, no roadside props)   // NOROAD: the ground road is left out here (the loop carries the track)
const G_AIR = 22;                                   // gravity for jumps (arcade-heavy)
const slopeAt = i => (H[(i+2)%N] - H[(i-2+N)%N])/(4*segLen);
// road height under a point, interpolated along the track from its nearest sample (per-sample heights would make everything step up ramps)
function trackY(x, z, i){ if (!world.elev) return 0; const p = P[i], t = T[i], s = (x - p.x)*t.x + (z - p.z)*t.z, n = Math.floor(s/segLen), u = s/segLen - n;
  const a = ((i + n) % N + N) % N, b = (a + 1) % N; return H[a] + (H[b] - H[a])*u; }
function slopeAtPos(x, z, i){ if (!world.elev) return 0; const t = T[i]; return (trackY(x + t.x*2.5, z + t.z*2.5, i) - trackY(x - t.x*2.5, z - t.z*2.5, i))/5; }
// A hairpin tighter than the road can turn folds the road ribbon over on its inside: the inner kerb crosses the tarmac and
// stretches into big slabs. After sampling the centreline, ease any such bend open (locally, a few samples either side)
// until every bend is at least MIN_R, then resample evenly. Corners that are already wide enough are left exactly as drawn.
let TRACK_TAG = '';                                        // set when a layout was eased: ghosts recorded on the old corners no longer apply
function easeHairpins(){
  TRACK_TAG = '';
  const MIN_R = W/2 + 3.5;                                   // kerb outer edge (W/2 + 1.7) plus a margin
  const rad = i => { const a = P[(i - 2 + N) % N], b = P[i], c = P[(i + 2) % N];
    const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ca = Math.hypot(a.x - c.x, a.z - c.z);
    const cr = Math.abs((b.x - a.x)*(c.z - a.z) - (b.z - a.z)*(c.x - a.x)); return cr < 1e-9 ? 1e9 : ab*bc*ca/(2*cr); };
  const rad1 = i => { const a = P[(i - 1 + N) % N], b = P[i], c = P[(i + 1) % N];                  // and over one sample either side: a kink between two samples is a fold too
    const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ca = Math.hypot(a.x - c.x, a.z - c.z);
    const cr = Math.abs((b.x - a.x)*(c.z - a.z) - (b.z - a.z)*(c.x - a.x)); return cr < 1e-9 ? 1e9 : ab*bc*ca/(2*cr); };
  let moved = false;
  for (let it = 0; it < 600; it++){
    const hot = new Uint8Array(N); let any = false;
    for (let i = 0; i < N; i++) if (rad(i) < MIN_R || rad1(i) < MIN_R){ any = true; for (let k = -5; k <= 5; k++) hot[(i + k + N) % N] = 1; }
    if (!any) break; moved = true;
    const nx = new Float32Array(N), nz = new Float32Array(N);
    for (let i = 0; i < N; i++){ const a = P[(i - 1 + N) % N], c = P[(i + 1) % N]; nx[i] = hot[i] ? P[i].x + ((a.x + c.x)/2 - P[i].x)*.5 : P[i].x; nz[i] = hot[i] ? P[i].z + ((a.z + c.z)/2 - P[i].z)*.5 : P[i].z; }
    for (let i = 0; i < N; i++){ P[i].x = nx[i]; P[i].z = nz[i]; }
  }
  if (!moved) return;
  TRACK_TAG = '-eased';
  const eased = new THREE.CatmullRomCurve3(P.map(p => p.clone()), true, 'centripetal');
  for (let i = 0; i < N; i++){ const t = i/N; P[i].copy(eased.getPointAt(t)); T[i].copy(eased.getTangentAt(t).setY(0).normalize()); R[i].set(T[i].z, 0, -T[i].x); }
  segLen = eased.getLength()/N;
}
function buildElevation(){
  H.fill(0); GAP.fill(0); CRAIL.fill(0); CANYON = null; JUMPS = []; TUNNELS = [];
  if (world.tube){ const tb = world.tube, c = angleIndex(tb.ang);                 // a tunnel on a flat world: centred where the track crosses polar angle ang, len metres long
    const half = Math.round(tb.len/2/segLen); TUNNELS.push({ a:(c - half + N) % N, b:(c + half) % N, lim:tb.wall - 1.7, tube:tb }); }
  if (!world.elev) return;
  // elev: [theta°, height] knots around the loop → smooth height per sample (Catmull-Rom over the knots, by polar angle)
  const knots = world.elev.slice().sort((a,b) => a[0]-b[0]), ang = i => { let a = Math.atan2(P[i].z - TRACK_C.z, P[i].x - TRACK_C.x)*180/Math.PI; return (a + 360) % 360; };
  const K = knots.length, kv = j => knots[((j % K) + K) % K][1], kt = j => knots[((j % K) + K) % K][0] + 360*Math.floor(j / K);
  for (let i=0;i<N;i++){ const a = ang(i); let j = 0; while (j < K && knots[j][0] <= a) j++; j--; if (j < 0) j = K - 1;
    const t0 = kt(j), t1 = kt(j+1), u = Math.max(0, Math.min(1, (a - t0 + (a < t0 ? 360 : 0)) / ((t1 - t0) || 1)));
    const p0 = kv(j-1), p1 = kv(j), p2 = kv(j+1), p3 = kv(j+2);                         // Catmull-Rom
    H[i] = .5*((2*p1) + (-p0 + p2)*u + (2*p0 - 5*p1 + 4*p2 - p3)*u*u + (-p0 + 3*p1 - 3*p2 + p3)*u*u*u); }
  // jumps: a ramp kicks up over the last samples before the lip, then the road is missing until the landing
  for (const j of (world.jumps || [])){ const lip = angleIndex(j.lip), land = angleIndex(j.land), ramp = j.ramp || 10, kick = j.kick || 7;
    for (let k=0;k<=ramp;k++){ const i = (lip - ramp + k + N) % N; const u = k/ramp; H[i] += kick*u*u; }
    for (let i = (lip + 1) % N; i !== land; i = (i + 1) % N) GAP[i] = 1;
    let gap = 0; for (let i = lip; i !== land; i = (i + 1) % N) gap += segLen;
    JUMPS.push({ lip, land, ramp, angle: Math.atan2(kick*2, ramp*segLen), landY: H[land], g: j.g || 0, gap }); }
  if (world.canyon) buildCanyonGap(world.canyon);
  for (const t of (world.tunnels || [])) TUNNELS.push({ a: angleIndex(t[0]), b: angleIndex(t[1]) });
  for (let i=0;i<N;i++) P[i].y = H[i];
}
/* ---------- the Meltdown Gap (Basalt Forge): a canyon 1400 m long lying across the bottom straight, ~800 m rim to rim where the
   road crosses and 300 m deep, a lava river along its floor. The old causeway reaches out from both rims and has melted through
   in the middle: a lip on the near stub flings the field across the gap (a "mega" jump: everyone leaves at no less than vmin, on a
   low arc that always lands on the far stub) ---------- */
function buildCanyonGap(cy){
  const ax = cy.at[0]*1.65, az = cy.at[1]*1.65; let o = 0, bd = 1e18;
  for (let i=0;i<N;i++){ const d = (P[i].x - ax)**2 + (P[i].z - az)**2; if (d < bd){ bd = d; o = i; } }
  const O = P[o].clone(), A = T[o].clone(), B = R[o].clone(), u = i => (P[i].x - O.x)*A.x + (P[i].z - O.z)*A.z;
  let lip = o, land = o; for (let k=0; k<N/3 && u(lip) > -cy.gap/2; k++) lip = (lip - 1 + N) % N; for (let k=0; k<N/3 && u(land) < cy.gap/2; k++) land = (land + 1) % N;
  // the kicker: a curved ramp that steepens to cy.grade (rise over run: .7 = 70 %, about 35°) at the lip
  const ramp = cy.ramp || 8, grade = cy.grade || .1, kick = grade/2*ramp*segLen;
  for (let k=0;k<=ramp;k++){ const i = (lip - ramp + k + N) % N, w = k/ramp; H[i] += kick*w*w; }
  for (let i = (lip + 1) % N; i !== land; i = (i + 1) % N) GAP[i] = 1;
  let gap = 0; for (let i = lip; i !== land; i = (i + 1) % N) gap += segLen;
  JUMPS.push({ lip, land, ramp, angle: Math.atan(grade), landY: H[land], g: 9, gap, mega:true, vmin: cy.vmin || 78, grade, lipY: H[lip] });
  // the canyon runs mostly outward from the circuit: 550 m into the infield, the rest out into the basalt
  const inward = Math.sign((TRACK_C.x - O.x)*B.x + (TRACK_C.z - O.z)*B.z) || 1, L = cy.len || 1400, vIn = 550;
  const vLo = inward > 0 ? -(L - vIn) : -vIn, vHi = inward > 0 ? vIn : L - vIn;
  CANYON = { o, O, A, B, lip, land, gap, depth: cy.depth || 300, wMax: cy.wMax || 400, vLo, vHi, UW:(cy.wMax || 400) + 110 };
  for (let i=0;i<N;i++){ if (GAP[i]) continue; for (const l of [0, -(W/2 + 17), W/2 + 17]) if (canyonAt(P[i].x + R[i].x*l, P[i].z + R[i].z*l) < -.5){ CRAIL[i] = 1; break; } }
}
// height of the ground at (x, z) in the canyon: 0 on the plateau, down terraced basalt walls to the floor
function canyonAt(x, z){ const C = CANYON; if (!C) return 0;
  const dx = x - C.O.x, dz = z - C.O.z, u = dx*C.A.x + dz*C.A.z, v = dx*C.B.x + dz*C.B.z;
  if (v <= C.vLo || v >= C.vHi || Math.abs(u) > C.UW) return 0;
  const half = (C.vHi - C.vLo)/2, sN = (v - (C.vHi + C.vLo)/2)/half, e = 1 - sN*sN; if (e <= 0) return 0;
  const sd = u < 0 ? 1.7 : 4.1;                                                                     // the two walls wander on their own
  const w = C.wMax*Math.pow(e, .32) + (mNoise(v/140 + sd*3, sd) - .5)*70*Math.min(1, e*3) + (mNoise(v/45 - sd, sd*2.3) - .5)*24;
  const inside = w - Math.abs(u); if (inside <= 0) return 0;
  const t = Math.min(1, inside/130), k = Math.floor(t*6), f = t*6 - k, q = clamp((f - .45)/.55, 0, 1), step = Math.min(1, (k + q*q*(3 - 2*q))/6);   // ledges
  return -C.depth*step*(.7 + .3*Math.min(1, e*3)) - (mNoise(u/55 + 9, v/55) - .5)*10*t;
}
const canyonNear = (x, z, m) => { const C = CANYON; if (!C) return false; const dx = x - C.O.x, dz = z - C.O.z, u = dx*C.A.x + dz*C.A.z, v = dx*C.B.x + dz*C.B.z;
  return v > C.vLo - m && v < C.vHi + m && Math.abs(u) < C.UW + m; };
const inCanyonSpan = i => !!CANYON && ((i - CANYON.lip + 60 + N) % N) < ((CANYON.land - CANYON.lip + 120 + N) % N);
const inTunnel = i => TUNNELS.some(t => ((i - t.a + N) % N) <= ((t.b - t.a + N) % N));
const vaultK = () => TUNNELS.length && TUNNELS[0].tube ? 1 : 0;   // the tunnel is an unlit one (the Hive's Vault), not a neon-lit conduit
const tunnelLim = i => { for (const t of TUNNELS) if (t.lim && ((i - t.a + N) % N) <= ((t.b - t.a + N) % N)) return t.lim; return 0; };   // walls you can scrape
const KIND_NAME = { truck:'Sirocco', tank:'Bulwark', walker:'Strider', jet:'Kestrel', quad:'Burro', rally:'Fennec', hover:'Cicada', drone:'Nexus' };
function angleIndex(deg){ let best = 0, bd = 1e9; const want = Math.atan2(Math.sin(deg*Math.PI/180), Math.cos(deg*Math.PI/180));
  for (let i=0;i<N;i++){ const a = Math.atan2(P[i].z - TRACK_C.z, P[i].x - TRACK_C.x); const d = Math.abs(wrapA(a - want)); if (d < bd){ bd = d; best = i; } } return best; }
function buildCut(g){
  const def = CUTS[world.id]; CUT = null; if (!def) return;
  const iA = angleIndex(def.a), iB = angleIndex(def.b);
  // the strip starts on the side of the road it leaves from (and rejoins on the side it comes in from): compare the chord with the road a few samples in
  const side = (i0, i1, k) => { const dx = P[i1].x - P[i0].x, dz = P[i1].z - P[i0].z, L = Math.hypot(dx, dz) || 1, j = (i0 + k + N) % N, s = Math.abs(k)*segLen;
    const qx = P[i0].x + dx/L*s, qz = P[i0].z + dz/L*s; return Math.sign((qx - P[j].x)*R[j].x + (qz - P[j].z)*R[j].z) || 1; };
  const inward = i => Math.sign(R[i].x*(TRACK_C.x - P[i].x) + R[i].z*(TRACK_C.z - P[i].z)) || 1;
  const latA = side(iA, iB, 7)*(W/2 - 3), latB = side(iB, iA, -7)*(W/2 - 3);
  const A = new THREE.Vector3(P[iA].x + R[iA].x*latA, P[iA].y, P[iA].z + R[iA].z*latA), B = new THREE.Vector3(P[iB].x + R[iB].x*latB, P[iB].y, P[iB].z + R[iB].z*latB);
  const dir = B.clone().sub(A); dir.y = 0; const len = dir.length(); dir.divideScalar(len); const nrm = new THREE.Vector3(dir.z, 0, -dir.x);
  CUT = Object.assign({ iA, iB, A, B, dir, nrm, len, half: 4.6, saves: ((iB - iA + N) % N)*segLen - len, inA: inward(iA), inB: inward(iB) }, def);
  // height along the strip. On a raised track the road can fall away under a straight strip (or curl back beneath it): near each mouth,
  // while the strip still lies over the road, it follows the road so the two meet flush; between, it is a straight ramp. Physics and
  // drawing share this one profile, so a car is always on what it is drawn on.
  { const K = 80, ext = 3/len, ys = new Float32Array(K + 1), over = new Uint8Array(K + 1), at = u => A.clone().addScaledVector(dir, len*u);
    for (let k = 0; k <= K; k++){ const u = -ext + (1 + 2*ext)*k/K, p = at(u), l = locate({ x:p.x, z:p.z, idx:k < K/2 ? iA : iB });
      ys[k] = trackY(p.x, p.z, l.i); over[k] = Math.abs(l.lat) < W/2 + 2 ? 1 : 0; }
    let ka = 0; while (ka < K && over[ka]) ka++;                        // first sample where the strip has left the road at the A end
    let kb = K; while (kb > ka && over[kb]) kb--;                       // and where it reaches it again at the B end
    const ya = ka > 0 ? ys[ka - 1] : A.y, yb = kb < K ? ys[kb + 1] : B.y;
    for (let k = ka; k <= kb; k++) ys[k] = ya + (yb - ya)*(kb === ka ? 0 : (k - ka)/(kb - ka));
    CUT.ys = ys; CUT.yAt = u => { const t = clamp((u + ext)/(1 + 2*ext), 0, 1)*K, k = Math.min(K - 1, Math.floor(t)); return ys[k] + (ys[k + 1] - ys[k])*(t - k); };
    const uOf = k => -ext + (1 + 2*ext)*k/K; CUT.uA = ka > 0 ? uOf(ka - 1) : -1; CUT.uB = kb < K ? uOf(kb + 1) : 2;
    // at an exact spot: where the strip lies on the road near a mouth it IS the road there (banked, curving); elsewhere the profile
    CUT.yAtXZ = (x, z, u, i, lat) => { if (u <= CUT.uA || u >= CUT.uB){ const l = lat === undefined ? locate({ x, z, idx: i ?? (u < .5 ? iA : iB) }) : { i, lat }; if (Math.abs(l.lat) < W/2 + 2) return trackY(x, z, l.i); } return CUT.yAt(u); };
    CUT.flat = !world.elev; }
  // surface strip: a ribbon that follows the profile
  // the surface never lies on the road: every point of it that falls inside the kerbs is pushed out to the kerb line, so the strip
  // meets the road flush along the kerb instead of lying over it as a patch of sand or lava (the road is the road)
  const KERB = W/2 + 1.75, nearestI = (x, z) => { let bi = 0, bd = 1e18; for (let i = 0; i < N; i++){ const d = (x - P[i].x)**2 + (z - P[i].z)**2; if (d < bd){ bd = d; bi = i; } } return bi; };
  const toKerb = (q, sideHint) => { const i = nearestI(q.x, q.z), lat = (q.x - P[i].x)*R[i].x + (q.z - P[i].z)*R[i].z; if (Math.abs(lat) >= KERB) return false;
    const sd = sideHint || Math.sign(lat) || 1; q.x = P[i].x + R[i].x*KERB*sd; q.z = P[i].z + R[i].z*KERB*sd; return true; };
  const quad = (hw, y, extM) => { const K = 80, e = extM/len, pos = [], uv = [], idx = [], reps = Math.max(1, Math.round(len/24)), gone = [];
    const AC = [-1, -.5, 0, .5, 1], nA = AC.length;                     // five points across, so the strip can follow a banked road where it lies on it
    for (let k = 0; k <= K; k++){ const u = -e + (1 + 2*e)*k/K, p = A.clone().addScaledVector(dir, len*u), hint = u < .5 ? Math.sign(latA) : Math.sign(latB); let moved = 0;
      for (const sd of AC){ const q = p.clone().addScaledVector(nrm, sd*hw); if (toKerb(q, hint)) moved++; pos.push(q.x, CUT.yAtXZ(q.x, q.z, u) + y, q.z); uv.push((sd + 1)/2, (k/K)*reps); }
      gone.push(moved === nA); }
    for (let k = 0; k < K; k++){ if (gone[k] && gone[k + 1]) continue;       // a row wholly inside the kerbs has collapsed onto the kerb line: nothing to draw between two of them
      for (let j = 0; j < nA - 1; j++){ const a = k*nA + j, b = a + nA; idx.push(a, b, a + 1, a + 1, b, b + 1); } }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gg.setIndex(idx); gg.computeVertexNormals(); return gg; };
  const tex = cutTexture(def.surf);
  const mat = def.surf === 'wind' ? new THREE.MeshBasicMaterial({ map:tex, transparent:true, opacity:.55, depthWrite:false, side:THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ map:tex, side:THREE.DoubleSide });
  const strip = new THREE.Mesh(quad(CUT.half + .6, .05, 3), mat); strip.receiveShadow = true; g.add(strip);
  if (def.surf === 'lava'){ const glow = new THREE.Mesh(quad(CUT.half + 1.6, .03, 3), new THREE.MeshBasicMaterial({ color:0xff5a1a, transparent:true, opacity:.18, depthWrite:false, side:THREE.DoubleSide })); g.add(glow); }
  // markers along both edges in the cut colour, and a sign at the mouth saying who may use it
  const pm = new THREE.MeshLambertMaterial({ color:def.col, emissive:new THREE.Color(def.col), emissiveIntensity:.25 }), post = new THREE.InstancedMesh(new THREE.BoxGeometry(.4,1.1,.4), pm, Math.ceil(len/9)*2 + 2), o = new THREE.Object3D(); let n = 0;
  for (let d = 0; d <= len; d += 9) for (const sd of [-1,1]){ const q = A.clone().addScaledVector(dir, d).addScaledVector(nrm, sd*(CUT.half + 1)); if (nearTrack(q.x, q.z, W/2 + 1.6)) continue;   // where the strip lies on the road its posts would stand in the lane
    o.position.set(q.x, CUT.yAt(d/len) + .55, q.z); o.updateMatrix(); post.setMatrixAt(n++, o.matrix); }
  post.count = n; g.add(post);
  const sign = textTex(512,160,(x,w,h)=>{ x.fillStyle='#1d1210'; x.fillRect(0,0,w,h); x.fillStyle='#'+def.col.toString(16).padStart(6,'0'); x.fillRect(0,0,w,10); x.fillRect(0,h-10,w,10);
    x.textAlign='center'; x.textBaseline='middle'; x.fillStyle='#fff6e6'; x.font='bold 54px Impact, Arial Black, sans-serif'; x.fillText('⟶ ' + def.name, w/2, 54);
    x.fillStyle='#'+def.col.toString(16).padStart(6,'0'); x.font='bold 36px Impact, Arial Black, sans-serif'; x.fillText(def.kinds.map(k => KIND_NAME[k]).join(' · '), w/2, 114); });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.8), new THREE.MeshBasicMaterial({ map:sign, side:THREE.DoubleSide }));
  const iS = (iA - Math.round(22/segLen) + N) % N, sS = -Math.sign(latA), legM = new THREE.MeshLambertMaterial({ color:0x2b2f36 });   // 22 m before the mouth, following the road (not the mouth's tangent, which can cross it)
  if (world.rails){                                                                                // a ring road has no verge: the sign hangs out past the rail from a pole on the shoulder
    const pl = P[iS].clone().addScaledVector(R[iS], sS*(world.rails - .6)), sp = P[iS].clone().addScaledVector(R[iS], sS*(world.rails + 4.7));
    board.position.set(sp.x, sp.y + 3.3, sp.z); board.rotation.y = Math.atan2(T[iS].x, T[iS].z) + Math.PI; g.add(board);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(.25, 4.8, .25), legM); pole.position.set(pl.x, pl.y + 2.4, pl.z); g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(5.5, .2, .2), legM); arm.position.set((pl.x + sp.x)/2 - R[iS].x*sS*.3, pl.y + 4.7, (pl.z + sp.z)/2 - R[iS].z*sS*.3); arm.rotation.y = Math.atan2(R[iS].x, R[iS].z) + Math.PI/2; g.add(arm);
  } else {
    const sp = P[iS].clone().addScaledVector(R[iS], sS*(W/2 + 5.9));                               // on the verge, its near leg just past the kerb, facing the car
    board.position.set(sp.x, sp.y + 3.4, sp.z); board.rotation.y = Math.atan2(T[iS].x, T[iS].z) + Math.PI; g.add(board);
    for (const sd of [-1,1]){ const leg = new THREE.Mesh(new THREE.BoxGeometry(.25,2.2,.25), legM); leg.position.set(sp.x + Math.cos(board.rotation.y)*sd*4, sp.y + 1.1, sp.z - Math.sin(board.rotation.y)*sd*4); g.add(leg); } }
  // chevrons on the road pointing into the mouth
  const chev = textTex(128,128,(x,w,h)=>{ x.strokeStyle='#'+def.col.toString(16).padStart(6,'0'); x.lineWidth=16; x.lineJoin='round'; for (let k=0;k<2;k++){ x.beginPath(); x.moveTo(20,30+k*44); x.lineTo(64,70+k*44); x.lineTo(108,30+k*44); x.stroke(); } });
  const arrow = new THREE.Mesh(new THREE.PlaneGeometry(6,6), new THREE.MeshBasicMaterial({ map:chev, transparent:true, depthWrite:false })); arrow.rotation.order = 'YXZ';
  const ap = A.clone().addScaledVector(dir, -4); arrow.position.set(ap.x, ap.y + .1, ap.z); arrow.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI; arrow.rotation.x = -Math.PI/2; g.add(arrow);
}
function cutTexture(surf){
  return noiseTex(
    { sand:'#d9a862', lava:'#2a1a16', ice:'#cfe8f8', wind:'#ffffff', crater:'#6f6a66', grate:'#161c2c' }[surf],
    { sand:['#e8c08a','#b8844c'], lava:['#3a2420','#1a0e0c'], ice:['#ffffff','#a9d2ee'], wind:['#ffffff','#e6f2ff'], crater:['#8e8a86','#4f4a46'], grate:['#22304a','#0a0e18'] }[surf], 128,
    surf === 'lava' ? (x,s)=>{ x.strokeStyle='rgba(255,120,30,.8)'; x.lineWidth=3; for (let i=0;i<8;i++){ x.beginPath(); let px=Math.random()*s, py=Math.random()*s; x.moveTo(px,py); for (let k=0;k<5;k++){ px+=rnd(-25,25); py+=rnd(-25,25); x.lineTo(px,py); } x.stroke(); } }
    : surf === 'wind' ? (x,s)=>{ x.strokeStyle='rgba(120,200,255,.5)'; x.lineWidth=2; for (let i=0;i<14;i++){ const y=Math.random()*s; x.beginPath(); x.moveTo(0,y); x.lineTo(s,y+rnd(-6,6)); x.stroke(); } }
    : surf === 'crater' ? (x,s)=>{ for (let i=0;i<12;i++){ x.fillStyle='rgba(30,26,24,.55)'; x.beginPath(); x.arc(Math.random()*s,Math.random()*s,rnd(4,12),0,7); x.fill(); } }
    : surf === 'grate' ? (x,s)=>{ x.strokeStyle='rgba(94,240,230,.35)'; x.lineWidth=2; for (let k=0;k<s;k+=16){ x.beginPath(); x.moveTo(k,0); x.lineTo(k,s); x.stroke(); x.beginPath(); x.moveTo(0,k); x.lineTo(s,k); x.stroke(); } x.fillStyle='rgba(0,0,0,.5)'; for (let i=0;i<s;i+=16) for (let j=0;j<s;j+=16) x.fillRect(i+3,j+3,10,10); }
    : undefined);
}
// where a car stands relative to the cut: u along it (0..1) and the side distance; null when off it
// does the straight line from (x,z) to (tx,tz) stay on the road between sample i0 and i0+span? (so an AI only heads for a cut mouth it can reach directly)
function lineOnRoad(x, z, tx, tz, i0, span){
  for (let q=1;q<=3;q++){ const u = q/4, px = x + (tx-x)*u, pz = z + (tz-z)*u; let best = 1e12, bi = i0;
    for (let k=0;k<=span;k++){ const i = (i0+k)%N, dx = px-P[i].x, dz = pz-P[i].z, d = dx*dx+dz*dz; if (d < best){ best = d; bi = i; } }
    const lat = (px-P[bi].x)*R[bi].x + (pz-P[bi].z)*R[bi].z; if (Math.abs(lat) > W/2 + 2.5) return false; }
  return true;
}
function cutAt(c){ if (!CUT) return null; const dx = c.x - CUT.A.x, dz = c.z - CUT.A.z, u = (dx*CUT.dir.x + dz*CUT.dir.z)/CUT.len, d = dx*CUT.nrm.x + dz*CUT.nrm.z;
  return (u > -.02 && u < 1.02 && Math.abs(d) < CUT.half) ? { u, d } : null; }
const cutOK = c => !!(CUT && CUT.kinds.includes(c.kind));
// where the road has a hard rail: everywhere on a ring road (world.rails), or only where a raised deck is in the air (world.deck)
const railAt = i => world.rails || (world.deck && (H[i] || 0) > 1.5 ? world.deck - .2 : 0) || (CRAIL[i] ? W/2 + 1.6 : 0);   // the causeway stubs over the Meltdown Gap are railed
let segLen = 1, BOOSTS = [], TRACK_C = new THREE.Vector3(), TRACK_R = 400;
const HAZ = { solids:[], zones:[], updaters:[] };          // solids: collide; zones: change grip/speed; updaters: animate
let worldGroup = new THREE.Group(); scene.add(worldGroup);
function nearTrack(x,z,minD){ const m2=minD*minD; for (let i=0;i<N;i+=3){ const dx=x-P[i].x, dz=z-P[i].z; if (dx*dx+dz*dz<m2) return true; } return false; }
const atTrack = (f, lat, y=0) => { const i = ((Math.round(f*N)%N)+N)%N; return {i, x:P[i].x+R[i].x*lat, y: y + P[i].y, z:P[i].z+R[i].z*lat, h:Math.atan2(T[i].x,T[i].z)}; };
// a ribbon over the road between two track indices and two lateral offsets (used for hazard surfaces)
function stripGeo(i0, len, lat0, lat1, y, vScale){
  if (lat0 > lat1){ const t = lat0; lat0 = lat1; lat1 = t; }   // always wound to face up: the other way round the strip shows only from below
  const pos=[], uv=[], idx=[];
  for (let k=0;k<=len;k++){ const i=(i0+k)%N, p=P[i], r=R[i];
    pos.push(p.x+r.x*lat0, p.y+y, p.z+r.z*lat0, p.x+r.x*lat1, p.y+y, p.z+r.z*lat1);
    uv.push(0, k/len*vScale, 1, k/len*vScale);
    if (k<len && !GAP[i]){ const a=k*2; idx.push(a,a+2,a+1, a+1,a+2,a+3); } }   // nothing painted on the road hangs over a jump gap
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function addZone(type, f, len, lat0, lat1, mesh, extra){
  const i0 = ((Math.round(f*N)%N)+N)%N;
  const z = Object.assign({type, i0, len, lat0, lat1, mesh}, extra||{});
  HAZ.zones.push(z); if (mesh) worldGroup.add(mesh); return z;
}
function addSolid(o){ HAZ.solids.push(o); return o; }

// small additive particle systems for hazard effects (sparks, glitter, wind streaks)
function makeFx(color, n, additive, gravity){
  const pos = new Float32Array(n*3), al = new Float32Array(n), sz = new Float32Array(n), vel = new Float32Array(n*3), life = new Float32Array(n), max = new Float32Array(n).fill(1);
  let head = 0;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('alpha', new THREE.BufferAttribute(al,1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('size', new THREE.BufferAttribute(sz,1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms:{col:{value:new THREE.Color(color)}, scale:{value:innerHeight*.55}},
    vertexShader:'attribute float alpha;attribute float size;varying float vA;uniform float scale;void main(){vA=alpha;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*scale/-mv.z;gl_Position=projectionMatrix*mv;}',
    fragmentShader:'varying float vA;uniform vec3 col;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(col,vA*(1.-d*2.));}' });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  return { mat,
    emit(x,y,z,vx,vy,vz,size,l){ const i=head; head=(head+1)%n; pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z; vel[i*3]=vx; vel[i*3+1]=vy; vel[i*3+2]=vz; sz[i]=size; life[i]=max[i]=l; },
    update(dt){ for (let i=0;i<n;i++){ if (life[i]<=0){ al[i]=0; continue; } life[i]-=dt; const k=i*3; pos[k]+=vel[k]*dt; pos[k+1]+=vel[k+1]*dt; pos[k+2]+=vel[k+2]*dt; vel[k+1]-=gravity*dt; al[i]=Math.max(0,life[i]/max[i]); }
      g.attributes.position.needsUpdate = g.attributes.alpha.needsUpdate = g.attributes.size.needsUpdate = true; } };
}
const sparks = makeFx(0xff8a2a, 400, true, 14);
const glitter = makeFx(0xcfefff, 300, true, 0);


/* ---------- Basalt Forge: live volcanoes, lava rivers and the stonewrights' works ----------
   Volcanoes stand close to the circuit with lava running down their flanks and smoke columns climbing into a red sky.
   On Ignis Prime the "surprise" is an eruption: the nearest cone blows and throws lava bombs onto the road;
   each bomb leaves a pool of lava (slows and scorches until it crusts over) and often a basalt boulder you have to steer round. */
const VOLC = [];                      // active cones near the track: {x, z, top, r, erupt, puff}
const VDEBRIS = { pools:[], rocks:[] };
const smokeFx = makeFx(0x2a201c, 1400, false, -0.35);      // heavy, dark, slowly rising
const ashFx = makeFx(0x6a4a3a, 300, false, -0.3);        // paler ash at the plume's edge
const lavaFx = makeFx(0xff6a14, 700, false, 26);         // molten blobs thrown out of the crater, falling back
const lavaHotFx = makeFx(0xffd27a, 400, true, 26);
const volFlareTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,240,190,1)'); g.addColorStop(.3,'rgba(255,150,50,.8)'); g.addColorStop(1,'rgba(255,60,10,0)'); x.fillStyle = g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); })();
// molten rock: domain-warped noise in world space (so neighbouring pieces flow together), hot veins between drifting crust plates
const LAVA_GLSL = `
uniform float uT; uniform float uCool; uniform float uA; uniform float uShape; varying vec2 vU; varying vec3 vW;
float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h1(i), h1(i+vec2(1.,0.)), f.x), mix(h1(i+vec2(0.,1.)), h1(i+vec2(1.,1.)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = .5; for (int i=0;i<4;i++){ s += a*n2(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; } return s; }
void main(){
  vec2 p = vW.xz*.09;
  vec2 q = vec2(fbm(p + vec2(0.0, uT*.06)), fbm(p + vec2(5.2, 1.3) - uT*.05));
  float n = fbm(p*1.7 + q*2.4 + vec2(uT*.09, -uT*.06));
  float vein = 1.0 - smoothstep(0.0, mix(.16, .035, uCool), abs(n - .5));
  float plate = smoothstep(.36, .62, fbm(p*3.1 - q*1.5 + uT*.03));
  vec3 hot = mix(vec3(1.0, .30, .03), vec3(1.0, .86, .38), vein);
  vec3 crust = mix(vec3(.13, .055, .03), vec3(.05, .03, .025), uCool);
  float crustAmt = clamp(mix(plate*.6, 1.0, uCool) - vein*(1.0 - uCool*.7), 0.0, 1.0);
  vec3 col = mix(hot, crust, crustAmt);
  float e = uShape > .5 ? 1.0 - smoothstep(.36, .5, length(vU - .5) + (n - .5)*.18) : smoothstep(0.0, .14 + (n-.5)*.1, vU.x)*smoothstep(1.0, .86 - (n-.5)*.1, vU.x);
  gl_FragColor = vec4(col, uA*e);
}`;
function lavaMat(shape, extra){
  return new THREE.ShaderMaterial(Object.assign({ uniforms:{ uT:{value:0}, uCool:{value:0}, uA:{value:1}, uShape:{value:shape} }, transparent:true, depthWrite:false,
    vertexShader:'varying vec2 vU; varying vec3 vW; void main(){ vU = uv; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader:LAVA_GLSL }, extra||{}));
}
// cone skin: black basalt with lava running down from the crater (a matching emissive map makes the runs glow)
function volcanoTextures(){
  const mk = (glowOnly) => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
    if (glowOnly){ x.fillStyle = '#000'; x.fillRect(0,0,256,256); } else { const g = x.createLinearGradient(0,0,0,256); g.addColorStop(0,'#3a2420'); g.addColorStop(.25,'#211715'); g.addColorStop(1,'#16100e'); x.fillStyle = g; x.fillRect(0,0,256,256);
      for (let i=0;i<260;i++){ x.fillStyle = `rgba(${Math.random()<.5?60:10},${Math.random()<.5?40:8},${Math.random()<.5?34:6},.5)`; x.fillRect(Math.random()*256, Math.random()*256, rnd(2,8), rnd(2,10)); } }
    return [c, x]; };
  const [cc, cx] = mk(false), [ec, ex] = mk(true);
  const runs = []; for (let i=0;i<13;i++){ let px = (i + Math.random()*.6)/13*256, py = 0; const pts = [[px,py]], len = rnd(.35,.95)*256; while (py < len){ py += rnd(8,18); px += rnd(-9,9); pts.push([px,py]); } runs.push({pts, w:rnd(2.5,6)}); }
  for (const [x, glow] of [[cx,false],[ex,true]]){
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (const r of runs){ for (let k=1;k<r.pts.length;k++){ const f = 1 - k/r.pts.length;
        x.strokeStyle = glow ? `rgba(255,${120+110*f|0},${30+60*f|0},${.35+.65*f})` : `rgba(255,${90+100*f|0},20,${.5+.5*f})`; x.lineWidth = r.w*(.4+.8*f);
        x.beginPath(); x.moveTo(r.pts[k-1][0], r.pts[k-1][1]); x.lineTo(r.pts[k][0], r.pts[k][1]); x.stroke(); } }
    const g = x.createLinearGradient(0,0,0,40); g.addColorStop(0, glow ? 'rgba(255,170,60,1)' : 'rgba(255,120,40,.9)'); g.addColorStop(1,'rgba(255,90,20,0)'); x.fillStyle = g; x.fillRect(0,0,256,40); }
  const map = new THREE.CanvasTexture(cc), em = new THREE.CanvasTexture(ec); map.wrapS = em.wrapS = THREE.RepeatWrapping; map.encoding = em.encoding = THREE.sRGBEncoding; return { map, em };
}
let VOLC_TEX = null;
function buildVolcano(g, x, z, h, near){
  VOLC_TEX = VOLC_TEX || volcanoTextures();
  const r = h*rnd(1.05, 1.35), mat = new THREE.MeshLambertMaterial({ map:VOLC_TEX.map, emissive:0xffffff, emissiveMap:VOLC_TEX.em, emissiveIntensity:near ? 1 : .75 });
  if (!near){ mat.color.set(0x5a4642); mat.fog = false; }   // the far cones: dark basalt silhouettes on the ember sky, not lifted by the haze
  const geo = new THREE.CylinderGeometry(r*.13, r, h, 18, 6, true);                      // a cone with its top knocked off: the crater
  { const p = geo.attributes.position; for (let i=0;i<p.count;i++){ const y = p.getY(i); if (y > h/2 - .01) continue; const k = 1 + (Math.random()-.5)*.14*(1 - (y + h/2)/h*.5); p.setX(i, p.getX(i)*k); p.setZ(i, p.getZ(i)*k); } geo.computeVertexNormals(); }
  const m = new THREE.Mesh(geo, mat); m.position.set(x, h/2 - 2, z); m.rotation.y = Math.random()*6; m.castShadow = near; m.receiveShadow = true; g.add(m);
  const top = h - 2, cr = r*.13;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(cr*.95, 16), lavaMat(1, { fog:false })); pool.rotation.x = -Math.PI/2; pool.position.set(x, top - .6, z); g.add(pool);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:volFlareTex, color:0xff7a2a, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true, opacity:.75, fog:false }));
  glow.position.set(x, top + cr*.6, z); glow.scale.setScalar(cr*5); g.add(glow);
  const v = { x, z, top, r, cr, h, near, pool, glow, erupt:0, puff:rnd(0, 4), lean:new THREE.Vector2(rnd(-1,1), rnd(-1,1)).normalize() };
  VOLC.push(v);
  return v;
}
// steel truss: the stonewrights' derricks and the bridge rails
function lattice(g, x, z, h, w, mat, glowTop){
  const o = new THREE.Group(); o.position.set(x, 0, z); o.rotation.y = Math.random()*6; g.add(o);
  const leg = new THREE.BoxGeometry(.5, h, .5); leg.translate(0, h/2, 0);
  for (const [sx, sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ const l = new THREE.Mesh(leg, mat); l.position.set(sx*w/2, 0, sz*w/2); l.rotation.z = -sx*.06; l.rotation.x = sz*.06; l.castShadow = true; o.add(l); }
  for (let y = h*.15; y < h; y += h/6){ const k = 1 - y/h*.12; for (const [ax, rot] of [[0,0],[0,Math.PI/2]]){ for (const s of [-1,1]){ const b = new THREE.Mesh(new THREE.BoxGeometry(w*k, .3, .3), mat); b.rotation.y = rot; b.position.set(rot ? s*w*k/2 : 0, y, rot ? 0 : s*w*k/2); o.add(b);
      const d = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(w*k, h/6), .22, .22), mat); d.rotation.y = rot; d.rotation[rot ? 'x' : 'z'] = Math.atan2(h/6, w*k)*s; d.position.set(rot ? s*w*k/2 : 0, y + h/12, rot ? 0 : s*w*k/2); o.add(d); } } }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w*1.3, .5, w*1.3), mat); deck.position.y = h; o.add(deck);
  if (glowTop){ const l = new THREE.Mesh(new THREE.SphereGeometry(.7, 8, 6), new THREE.MeshBasicMaterial({ color:0xff5a1a })); l.position.y = h + 1.4; o.add(l); }
  return o;
}
function hotBoardTex(){ const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = '#1a1412'; x.fillRect(0,0,512,96);
  for (const [a, b] of [[0,170],[342,512]]){ x.save(); x.beginPath(); x.rect(a, 8, b - a, 80); x.clip(); x.fillStyle = '#f2a51c'; x.fillRect(a, 8, b - a, 80); x.fillStyle = '#16110e'; for (let i=-4;i<12;i++){ x.beginPath(); x.moveTo(a + i*32, 88); x.lineTo(a + i*32 + 16, 88); x.lineTo(a + i*32 + 56, 8); x.lineTo(a + i*32 + 40, 8); x.fill(); } x.restore(); }
  x.fillStyle = '#f07a1c'; x.fillRect(176, 8, 160, 80); x.fillStyle = '#1a1210'; x.font = 'bold 54px Impact, "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('HOT', 256, 50);
  x.strokeStyle = '#0d0907'; x.lineWidth = 6; x.strokeRect(3, 3, 506, 90); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; }
function forgeWorks(g){
  const C = TRACK_C, o = new THREE.Object3D();
  // 1. live volcanoes close to the circuit, spread round the lap, each with its own smoke column
  for (const f of [.07, .27, .46, .63, .83]){
    for (let tries=0; tries<10; tries++){ const sd = Math.random() < .5 ? -1 : 1, lat = sd*rnd(70, 120), p = atTrack(f + rnd(-.02,.02), lat), h = rnd(46, 72);
      if (nearTrack(p.x, p.z, h*1.25 + 14) || canyonNear(p.x, p.z, h*1.4 + 20)) continue; buildVolcano(g, p.x, p.z, h, true); break; } }
  // 2. obsidian shards: black glassy blades jutting out of the basalt
  const shG = new THREE.ConeGeometry(1, 1, 4); shG.translate(0, .5, 0);
  const shards = new THREE.InstancedMesh(shG, new THREE.MeshStandardMaterial({ color:0x0f0b0c, roughness:.35, metalness:.15 }), 260); let n = 0;
  while (n < 260){ const a = Math.random()*Math.PI*2, d = 40 + Math.random()*620, cx = Math.cos(a)*d + C.x, cz = Math.sin(a)*d + C.z; if (nearTrack(cx, cz, W/2 + 12) || canyonNear(cx, cz, 15)) continue;
    const k = 3 + Math.random()*4|0, big = Math.random() < .25 ? rnd(2, 3.4) : 1;
    for (let j=0;j<k && n<260;j++){ const r = rnd(1.2, 3)*big, hs = r*rnd(3.5, 7), px = cx + rnd(-5,5)*big, pz = cz + rnd(-5,5)*big;
      if (nearTrack(px, pz, W/2 + 4 + r + hs*.45)) continue;                                   // a tall blade leaning .45 rad reaches a long way sideways: none over the road
      o.position.set(px, -1, pz); o.rotation.set(rnd(-.45,.45), Math.random()*6, rnd(-.45,.45)); o.scale.set(r, hs, r*rnd(.6, 1)); o.updateMatrix(); shards.setMatrixAt(n++, o.matrix); } }
  shards.castShadow = true; g.add(shards);
  // 3. the stonewrights' works: derricks, tanks and smoking stacks beside the road
  const steel = new THREE.MeshLambertMaterial({ color:0x3a3330 }), tankM = new THREE.MeshLambertMaterial({ color:0x7d7570 }), bandM = new THREE.MeshLambertMaterial({ color:0x2a2422 });
  const STACKS = [];
  for (const f of [.04, .16, .33, .52, .71, .9]){
    for (let tries=0; tries<8; tries++){ const p = atTrack(f + rnd(-.015, .015), (Math.random() < .5 ? -1 : 1)*rnd(24, 44)); if (nearTrack(p.x, p.z, W/2 + 14) || canyonNear(p.x, p.z, 10)) continue;
      const kind = Math.random();
      if (kind < .4) lattice(g, p.x, p.z, rnd(20, 32), rnd(4, 6), steel, true);
      else if (kind < .75){ for (let j=0;j<2;j++){ const r = rnd(2.4, 3.6), hh = rnd(5, 9), t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hh, 16), tankM); t.position.set(p.x + j*r*2.3, hh/2, p.z); t.castShadow = true; g.add(t);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI*2, 0, Math.PI/2), tankM); dome.position.set(t.position.x, hh, p.z); g.add(dome);
          for (const yb of [.25, .7]){ const b = new THREE.Mesh(new THREE.CylinderGeometry(r*1.03, r*1.03, .35, 16), bandM); b.position.set(t.position.x, hh*yb, p.z); g.add(b); } } }
      else { const hh = rnd(18, 28), s = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, hh, 10), bandM); s.position.set(p.x, hh/2, p.z); s.castShadow = true; g.add(s);
        const lip = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, .5, 10), new THREE.MeshBasicMaterial({ color:0xff6a1a })); lip.position.set(p.x, hh, p.z); g.add(lip); STACKS.push({ x:p.x, y:hh, z:p.z }); }
      break; } }
  // 4. HOT boards at the roadside where the road runs closest to a cone
  const hotT = hotBoardTex(), hotM = new THREE.MeshLambertMaterial({ map:hotT }), postM = new THREE.MeshLambertMaterial({ color:0x1a1513 });
  for (const v of VOLC){ let best = 0, bd = 1e9; for (let i=0;i<N;i+=2){ const d = Math.hypot(P[i].x - v.x, P[i].z - v.z); if (d < bd){ bd = d; best = i; } }
    const sd = Math.sign((v.x - P[best].x)*R[best].x + (v.z - P[best].z)*R[best].z) || 1;
    for (const di of [-6, 0, 6]){ const i = (best + di + N) % N, px = P[i].x + R[i].x*(W/2 + 3.2)*sd, pz = P[i].z + R[i].z*(W/2 + 3.2)*sd;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 1.4), hotM); b.position.set(px, 1.1, pz); b.rotation.y = Math.atan2(-R[i].x*sd, -R[i].z*sd); g.add(b);   // face the road
      const back = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 1.4), postM); back.position.copy(b.position); back.rotation.y = b.rotation.y + Math.PI; g.add(back);
      for (const s of [-1,1]){ const post = new THREE.Mesh(new THREE.BoxGeometry(.25, 1.6, .25), postM); post.position.set(px + T[i].x*s*3.4, .8, pz + T[i].z*s*3.4); g.add(post); } } }
  // 5. lava: a river crossing under a bridge on the back straight, and lakes out in the basalt
  const lavaMats = [];
  { let bi = 0, best = -1; for (let i=0;i<N;i++){ const s = Math.abs(T[i].dot(T[(i+12)%N])); if (s > best && Math.abs(i/N - .58) < .1 && !inCanyonSpan(i)){ best = s; bi = i; } }      // a straight stretch for the bridge
    const tr = T[bi], rr = R[bi], wv = rnd(0, 6), mat = lavaMat(0, { fog:false }); lavaMats.push(mat);
    for (const sd of [-1, 1]){ const pts = [], uvs = [], idx = []; const n0 = 40;
      for (let k=0;k<=n0;k++){ const s = (W/2 + 2.2) + k*4.2, wob = Math.sin(k*.35 + wv)*Math.min(1, k/6)*9, wid = 7 + Math.sin(k*.5 + wv*2)*2.2 + Math.min(1, k/6)*3;
        const cx = P[bi].x + rr.x*s*sd + tr.x*wob, cz = P[bi].z + rr.z*s*sd + tr.z*wob;
        pts.push(cx - tr.x*wid, .03, cz - tr.z*wid, cx + tr.x*wid, .03, cz + tr.z*wid); uvs.push(0, k/n0, 1, k/n0); if (k < n0){ const a = k*2; idx.push(a, a+1, a+2, a+1, a+3, a+2); } }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx);
      const m = new THREE.Mesh(geo, mat); m.renderOrder = 1; g.add(m); }
    // the bridge: truss rails along both edges and dark piers dropping into the glow
    const span = 9; for (const sd of [-1, 1]){ for (let k=-span;k<=span;k++){ const i = (bi + k + N) % N, px = P[i].x + R[i].x*(W/2 + 1.9)*sd, pz = P[i].z + R[i].z*(W/2 + 1.9)*sd, yaw = Math.atan2(T[i].x, T[i].z);
        const post = new THREE.Mesh(new THREE.BoxGeometry(.35, 2.2, .35), steel); post.position.set(px, 1.1, pz); g.add(post);
        if (k < span){ const j = (i + 1) % N, qx = P[j].x + R[j].x*(W/2 + 1.9)*sd, qz = P[j].z + R[j].z*(W/2 + 1.9)*sd, len = Math.hypot(qx - px, qz - pz);
          for (const y of [.5, 2.1]){ const b = new THREE.Mesh(new THREE.BoxGeometry(.3, .3, len + .1), steel); b.position.set((px + qx)/2, y, (pz + qz)/2); b.rotation.y = yaw; g.add(b); }
          const d = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, Math.hypot(len, 1.6)), steel); d.position.set((px + qx)/2, 1.3, (pz + qz)/2); d.rotation.order = 'YXZ'; d.rotation.y = yaw; d.rotation.x = (k % 2 ? 1 : -1)*Math.atan2(1.6, len); g.add(d); } } }
    const glowRail = new THREE.MeshBasicMaterial({ color:0xff8a2a }); for (const sd of [-1,1]) g.add(new THREE.Mesh(stripGeo((bi - span + N) % N, span*2, (W/2 + 1.75)*sd - .12, (W/2 + 1.75)*sd + .12, 2.25, 1), glowRail));
    FORGE.bridge = bi; }
  for (let i=0;i<26;i++){ let x, z, rad = rnd(8, 26); let tries = 0; do { const a = Math.random()*Math.PI*2, d = 40 + Math.random()*640; x = Math.cos(a)*d + C.x; z = Math.sin(a)*d + C.z; } while ((nearTrack(x, z, W/2 + rad + 6) || canyonNear(x, z, rad + 15)) && ++tries < 30);
    const mat = lavaMats[0]; const m = new THREE.Mesh(new THREE.CircleGeometry(rad, 22), lavaMat(1, { fog:false })); lavaMats.push(m.material); m.rotation.x = -Math.PI/2; m.position.set(x, .03, z); m.scale.y = rnd(.45, 1); m.rotation.z = Math.random()*6; m.renderOrder = 1; g.add(m); }
  // 6. the road itself: glowing seams in the tarmac and a hot orange edge line on both sides
  const crackT = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d'); x.lineCap = 'round';
    for (let i=0;i<7;i++){ let px = rnd(20, 236), py = rnd(0, 512); x.beginPath(); x.moveTo(px, py); const steps = 4 + Math.random()*5|0;
      for (let k=0;k<steps;k++){ px = clamp(px + rnd(-40, 40), 4, 252); py += rnd(-30, 50); x.lineTo(px, py); }
      x.shadowColor = 'rgba(255,70,10,1)'; x.shadowBlur = 8; x.strokeStyle = 'rgba(255,110,30,.9)'; x.lineWidth = rnd(1.2, 2.4); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const crackM = new THREE.MeshBasicMaterial({ map:crackT, transparent:true, opacity:.75, depthWrite:false, blending:THREE.AdditiveBlending });
  const roadLen = N*segLen; g.add(new THREE.Mesh(stripGeo(0, N, -W/2 + .3, W/2 - .3, .05, roadLen/26), crackM));
  const edgeM = new THREE.MeshBasicMaterial({ color:0xff8a2a });
  for (const sd of [-1, 1]) g.add(new THREE.Mesh(stripGeo(0, N, sd*(W/2 - .05) - .22, sd*(W/2 - .05) + .22, .075, 1), edgeM));
  // 7. everything that moves: lava flowing, cones smoking and puffing, stacks venting, embers in the air, the road edge breathing
  let smokeAcc = 0;
  HAZ.updaters.push((t, dt) => { dt = dt || 1/60;
    for (const m of lavaMats) m.uniforms.uT.value = t; crackM.opacity = .42 + .16*Math.sin(t*1.7); edgeM.color.setRGB(1, .45 + .1*Math.sin(t*2.3), .12);
    smokeAcc += dt*(quality === 'saver' ? .55 : 1);
    for (const v of VOLC){ v.pool.material.uniforms.uT.value = t; v.puff -= dt; if (v.erupt > 0) v.erupt -= dt;
      const hot = v.erupt > 0 ? 1 : 0;
      v.glow.material.opacity = .6 + .25*Math.sin(t*3 + v.x) + hot*.4; v.glow.scale.setScalar(v.cr*(5 + hot*4 + Math.sin(t*5 + v.z)*.4));
      // a steady smoke column, leaning with the wind; much thicker while it erupts
      const rate = (4 + hot*14)*dt*(quality === 'saver' ? .5 : 1); let k = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
      while (k-- > 0){ const a = Math.random()*6.28, rr = Math.random()*v.cr*.8;
        const sc = v.near ? 1 : v.h/70; smokeFx.emit(v.x + Math.cos(a)*rr, v.top + rnd(0, 3), v.z + Math.sin(a)*rr, v.lean.x*rnd(1.5, 4)*sc, (rnd(5, 9) + hot*8)*Math.sqrt(sc), v.lean.y*rnd(1.5, 4)*sc, rnd(30, 56)*(1 + hot*.5)*sc, rnd(8, 12));
        if (Math.random() < .45){ const up = rnd(14, 70)*sc, drift = up/8;   // the billowing upper column: bigger puffs further up, carried off by the wind
          smokeFx.emit(v.x + v.lean.x*drift + rnd(-4,4)*sc, v.top + up, v.z + v.lean.y*drift + rnd(-4,4)*sc, v.lean.x*rnd(3, 7)*sc, rnd(2, 5)*Math.sqrt(sc), v.lean.y*rnd(3, 7)*sc, rnd(60, 110)*sc*(1 + hot*.4), rnd(6, 9)); }
        if (Math.random() < .3) ashFx.emit(v.x + rnd(-4,4), v.top + rnd(4, 10), v.z + rnd(-4,4), v.lean.x*rnd(2, 6), rnd(4, 7), v.lean.y*rnd(2, 6), rnd(24, 40)*(v.near ? 1 : v.h/70), rnd(6, 9)); }
      // little burps of lava between eruptions, a fountain during one
      if (v.puff <= 0){ v.puff = rnd(2.5, 6); for (let j=0;j<10;j++) lavaFx.emit(v.x + rnd(-1,1), v.top, v.z + rnd(-1,1), rnd(-6,6), rnd(14, 24), rnd(-6,6), rnd(1.6, 2.8), rnd(1.2, 2)); }
      if (hot && Math.random() < .9){ for (let j=0;j<4;j++){ lavaFx.emit(v.x + rnd(-2,2), v.top, v.z + rnd(-2,2), rnd(-12,12), rnd(26, 46), rnd(-12,12), rnd(2, 3.6), rnd(1.6, 2.8)); lavaHotFx.emit(v.x + rnd(-1.5,1.5), v.top + 1, v.z + rnd(-1.5,1.5), rnd(-8,8), rnd(22, 38), rnd(-8,8), rnd(1.2, 2.2), rnd(1, 1.8)); } }
      // lava runs dribbling down the flanks
      if (Math.random() < dt*3){ const a = Math.random()*6.28; lavaHotFx.emit(v.x + Math.cos(a)*v.cr, v.top - 1, v.z + Math.sin(a)*v.cr, Math.cos(a)*4, 1, Math.sin(a)*4, rnd(1, 1.8), rnd(.8, 1.4)); } }
    for (const s of STACKS) if (Math.random() < dt*2) smokeFx.emit(s.x + rnd(-.5,.5), s.y + 1, s.z + rnd(-.5,.5), rnd(-.5,.5), rnd(3, 5), rnd(-.5,.5), rnd(4, 8), rnd(4, 6));
    // hot ash drifting through the whole scene
    if (Math.random() < dt*30){ const p = cars[0] || {x:0, z:0}; embers.emit(p.x + rnd(-90, 90), rnd(1, 30), p.z + rnd(-90, 90), rnd(-2, 2), rnd(1, 3), rnd(-2, 2), rnd(.5, 1.2), rnd(1.5, 3)); }
    smokeFx.update(dt); ashFx.update(dt); lavaFx.update(dt); lavaHotFx.update(dt);
  });
}
// ---- the Meltdown Gap's scenery: the ground with the canyon cut into it, terraced basalt walls glowing from below, the lava river,
// lava falls pouring over the rims, the two causeway stubs on their basalt piers (the near one ending in a melted lip) ----
function forgeCanyon(g){
  const C = CANYON, gT = noiseTex(world.ground[0], world.ground[1], 256, world.ground[2]); gT.wrapS = gT.wrapT = THREE.RepeatWrapping; gT.repeat.set(1, 1);
  const TC = TRACK_C, uvOf = (pos) => { const uv = new Float32Array(pos.count*2); for (let i=0;i<pos.count;i++){ uv[i*2] = pos.getX(i)/20; uv[i*2+1] = pos.getZ(i)/20; } return new THREE.BufferAttribute(uv, 2); };
  const wp = (u, v) => [C.O.x + C.A.x*u + C.B.x*v, C.O.z + C.A.z*u + C.B.z*v];
  // 1. the plateau: one big sheet with a hole where the canyon patch goes (the patch meets it at height 0)
  const v0 = C ? C.vLo - 30 : 0, v1 = C ? C.vHi + 30 : 0;
  { const sh = new THREE.Shape(), E = 2200; sh.moveTo(TC.x - E, -(TC.z - E)); sh.lineTo(TC.x + E, -(TC.z - E)); sh.lineTo(TC.x + E, -(TC.z + E)); sh.lineTo(TC.x - E, -(TC.z + E)); sh.lineTo(TC.x - E, -(TC.z - E));
    if (C){ const hole = new THREE.Path(), cs = [wp(-C.UW, v0), wp(C.UW, v0), wp(C.UW, v1), wp(-C.UW, v1)]; hole.moveTo(cs[0][0], -cs[0][1]); for (const q of cs.slice(1)) hole.lineTo(q[0], -q[1]); hole.lineTo(cs[0][0], -cs[0][1]); sh.holes.push(hole); }
    const geo = new THREE.ShapeGeometry(sh); geo.rotateX(-Math.PI/2); geo.setAttribute('uv', uvOf(geo.attributes.position));
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map:gT })); m.receiveShadow = true; m.userData.noSolid = true; g.add(m); }
  if (!C) return;
  // 2. the canyon patch: a heightfield over the hole, coloured into banded basalt and lit orange from the river below
  const SU = Math.round(2*C.UW/6), SV = Math.round((v1 - v0)/6), pos = [], col = [], glow = [], idx = [];
  for (let b=0;b<=SV;b++) for (let a=0;a<=SU;a++){ const u = -C.UW + a/SU*2*C.UW, v = v0 + b/SV*(v1 - v0), [x, z] = wp(u, v), y = canyonAt(x, z);
    pos.push(x, y, z); const d = clamp(-y/C.depth, 0, 1), band = .78 + .22*Math.sin(y*.42 + mNoise(x/90, z/90)*3), base = y > -.5 ? 1 : (.55 + .2*band)*(1 - .35*d);
    col.push(base*(1 + .5*d), base*(1 - .05*d), base*(1 - .25*d)); glow.push(clamp((-y - 150)/140, 0, 1)**1.6); }
  for (let b=0;b<SV;b++) for (let a=0;a<SU;a++){ const i = b*(SU + 1) + a; idx.push(i, i + SU + 1, i + 1, i + 1, i + SU + 1, i + SU + 2); }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  cg.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 1)); cg.setIndex(idx); cg.computeVertexNormals(); cg.setAttribute('uv', uvOf(cg.attributes.position));
  { const nr = cg.attributes.normal; if (nr.getY(0) < 0){ idx.reverse(); cg.setIndex(idx); cg.computeVertexNormals(); } }   // faces up
  const cm = new THREE.MeshLambertMaterial({ map:gT, vertexColors:true });
  cm.userData.patchKey = 'canyon1'; cm.userData.patchShader = (sh) => { if (!sh.fragmentShader.includes('#include <emissivemap_fragment>') || sh.fragmentShader.includes('vCGlow')) return;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float glow; varying float vCGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCGlow = glow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCGlow;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1., .34, .07)*vCGlow*.85;'); };
  const canyonMesh = new THREE.Mesh(cg, cm); canyonMesh.receiveShadow = true; canyonMesh.userData.noSolid = true; g.add(canyonMesh);
  // 3. the lava river on the floor
  const lavaMats = [];
  { const y = -C.depth + 16, q = [wp(-C.UW, C.vLo), wp(C.UW, C.vLo), wp(-C.UW, C.vHi), wp(C.UW, C.vHi)], geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([q[0][0], y, q[0][1], q[1][0], y, q[1][1], q[2][0], y, q[2][1], q[3][0], y, q[3][1]], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2)); geo.setIndex([0, 2, 1, 1, 2, 3]);
    const mat = lavaMat(0, { fog:false, side:THREE.DoubleSide, fragmentShader:LAVA_GLSL.replace('vec2 p = vW.xz*.09;', 'vec2 p = vW.xz*.011;') }); mat.uniforms.uCool.value = .22; lavaMats.push(mat);
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 1; m.userData.noSolid = true; g.add(m); }
  // 4. lava falls: streams pouring over the rims down the terraces
  const fallM = new THREE.ShaderMaterial({ uniforms:{ uT:{ value:0 } }, transparent:true, depthWrite:false, side:THREE.DoubleSide, fog:false,
    vertexShader:'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader:'uniform float uT; varying vec2 vU; float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); } float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1.,0.)), f.x), mix(h(i+vec2(0.,1.)), h(i+vec2(1.,1.)), f.x), f.y); }\n' +
      'void main(){ float s = n(vec2(vU.x*7., vU.y*9. - uT*2.2))*.6 + n(vec2(vU.x*15., vU.y*21. - uT*3.4))*.4; float edge = smoothstep(0., .22 + s*.12, vU.x)*smoothstep(1., .78 - s*.12, vU.x);\n' +
      '  vec3 c = mix(vec3(1., .32, .04), vec3(1., .85, .4), smoothstep(.45, .85, s)); c = mix(c, vec3(.35, .06, .02), smoothstep(.2, .0, s)*.6); gl_FragColor = vec4(c*1.15, edge*(.75 + .25*s)); }' });
  { let made = 0; for (let t=0; t<60 && made < 6; t++){ const v = rnd(C.vLo*.8, C.vHi*.8); if (Math.abs(v) < 160) continue; const sd = Math.random() < .5 ? -1 : 1;
      let uR = 0; for (let uu = C.UW; uu > 0; uu -= 2){ const [x, z] = wp(sd*uu, v); if (canyonAt(x, z) < -1){ uR = uu + 2; break; } } if (!uR) continue;
      const pts = [], uvs = [], ix = [], wdt = rnd(26, 46), steps = 34;
      for (let k=0;k<=steps;k++){ const uu = uR - k*4.2, y0 = canyonAt(...wp(sd*uu, v)); for (const e of [-1, 1]){ const [x, z] = wp(sd*uu, v + e*wdt/2); pts.push(x, Math.max(y0, canyonAt(x, z)) + 1.2, z); uvs.push(e < 0 ? 0 : 1, k/steps); }
        if (k < steps){ const a = k*2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(ix);
      const m = new THREE.Mesh(geo, fallM); m.renderOrder = 2; m.userData.noSolid = true; g.add(m); made++; } }
  // 5. the causeway stubs: basalt piers under the road from each rim out to the break, flaring wide toward the floor
  const pierM = new THREE.MeshLambertMaterial({ color:0x3a302c }), steel = new THREE.MeshLambertMaterial({ color:0x3a3330 });
  const stubs = []; { let i = C.lip, k = 0; while (CRAIL[(i - 1 + N) % N] && k++ < 200) i = (i - 1 + N) % N; stubs.push([i, C.lip]); i = C.land; k = 0; while (CRAIL[(i + 1) % N] && k++ < 200) i = (i + 1) % N; stubs.push([C.land, i]); }
  const hw = W/2 + 3, flare = 46, bot = -C.depth - 20;
  for (const [a, b] of stubs){ const n = (b - a + N) % N, pts = [], ix = [], prof = [[-hw - flare, bot], [-hw, -.4], [hw, -.4], [hw + flare, bot]];
    for (let k=-3;k<=n;k++){ const i = (a + k + N) % N; for (const [l, y] of prof) pts.push(P[i].x + R[i].x*l, (y > -1 ? H[i] + y : y), P[i].z + R[i].z*l); if (k < n){ const o = (k + 3)*4; for (const s of [0, 1, 2]) ix.push(o + s, o + s + 4, o + s + 1, o + s + 1, o + s + 4, o + s + 5); } }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.setIndex(ix); geo.computeVertexNormals();
    { const pa = geo.attributes.position, uv = new Float32Array(pa.count*2); for (let q=0;q<pa.count;q++){ uv[q*2] = (pa.getX(q)*C.A.x + pa.getZ(q)*C.A.z)/16; uv[q*2+1] = pa.getY(q)/9; } geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }   // basalt grain running down the piers
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map:gT, color:0x6e605a, side:THREE.DoubleSide })); m.castShadow = m.receiveShadow = true; m.userData.noSolid = true; g.add(m);
    // the broken end: a molten face where the causeway melted through, and the road sagging over it
    const e = a === C.lip || b === C.lip ? C.lip : C.land, sgn = e === C.lip ? 1 : -1, fpts = [];
    for (const [l, y] of prof) fpts.push(P[e].x + R[e].x*l + T[e].x*sgn*.3, y > -1 ? H[e] + y : y, P[e].z + R[e].z*l + T[e].z*sgn*.3);
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fpts, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, .2, 0, .8, 0, 1, 1], 2));   // v = 0 at the road, 1 at the foot: the flow runs down the face fg.setIndex([0, 1, 2, 0, 2, 3]);
    const face = new THREE.Mesh(fg, fallM); face.userData.noSolid = true; g.add(face);
    const roadM = new THREE.MeshLambertMaterial({ color:0x2e2826 }), hotM = new THREE.MeshBasicMaterial({ color:0xff6a1a });
    for (let k=0;k<4;k++){ const lat = (k - 1.5)*W/4.2 + rnd(-1, 1), len = rnd(6, 13), tilt = rnd(.5, 1.1), slab = new THREE.Mesh(new THREE.BoxGeometry(W/4.6, .5, len), roadM);
      slab.position.set(P[e].x + R[e].x*lat + T[e].x*sgn*len*.42*Math.cos(tilt), H[e] - .3 - Math.sin(tilt)*len*.5, P[e].z + R[e].z*lat + T[e].z*sgn*len*.42*Math.cos(tilt));
      slab.rotation.order = 'YXZ'; slab.rotation.y = Math.atan2(T[e].x, T[e].z); slab.rotation.x = sgn*tilt; slab.rotation.z = rnd(-.2, .2); slab.userData.noSolid = true; g.add(slab);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(W/4.6 + .1, .55, .6), hotM); edge.position.set(0, 0, sgn*len/2); slab.add(edge); }
    C[e === C.lip ? 'lipEnd' : 'landEnd'] = e;
    // guard rails along the stub: posts, two bars and diagonal braces, an orange glow strip on top
    for (const sd of [-1, 1]) for (let k=0;k<=n;k++){ const i = (a + k) % N, j = (i + 1) % N, px = P[i].x + R[i].x*(W/2 + 1.9)*sd, pz = P[i].z + R[i].z*(W/2 + 1.9)*sd, yaw = Math.atan2(T[i].x, T[i].z);
      const post = new THREE.Mesh(new THREE.BoxGeometry(.35, 2.2, .35), steel); post.position.set(px, H[i] + 1.1, pz); post.userData.noSolid = true; g.add(post);
      if (k < n){ const qx = P[j].x + R[j].x*(W/2 + 1.9)*sd, qz = P[j].z + R[j].z*(W/2 + 1.9)*sd, len = Math.hypot(qx - px, qz - pz), dy = H[j] - H[i];
        for (const y of [.5, 2.1]){ const bar = new THREE.Mesh(new THREE.BoxGeometry(.3, .3, Math.hypot(len, dy) + .1), steel); bar.position.set((px + qx)/2, (H[i] + H[j])/2 + y, (pz + qz)/2); bar.rotation.order = 'YXZ'; bar.rotation.y = yaw; bar.rotation.x = -Math.atan2(dy, len); bar.userData.noSolid = true; g.add(bar); }
        const d = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, Math.hypot(len, 1.6)), steel); d.position.set((px + qx)/2, (H[i] + H[j])/2 + 1.3, (pz + qz)/2); d.rotation.order = 'YXZ'; d.rotation.y = yaw; d.rotation.x = (k % 2 ? 1 : -1)*Math.atan2(1.6, len); d.userData.noSolid = true; g.add(d); } }
    const glowRail = new THREE.MeshBasicMaterial({ color:0xff8a2a }); for (const sd of [-1, 1]){ const m2 = new THREE.Mesh(stripGeo(a, n, (W/2 + 1.75)*sd - .12, (W/2 + 1.75)*sd + .12, 2.25, 1), glowRail); m2.userData.noSolid = true; g.add(m2); } }
  // 6. a gantry ahead of the lip: MELTDOWN GAP, flat out
  { const i = (C.lip - 34 + N) % N, gw = new THREE.Group(); gw.position.set(P[i].x, H[i], P[i].z); gw.rotation.y = Math.atan2(T[i].x, T[i].z); g.add(gw);
    const postM = new THREE.MeshLambertMaterial({ color:0x1a1513 });
    for (const sx of [-1, 1]){ const m = new THREE.Mesh(new THREE.BoxGeometry(.9, 10, .9), postM); m.position.set(sx*(W/2 + 3), 5, 0); m.castShadow = true; gw.add(m); }
    const tex = textTex(1024, 128, (x, w, h) => { x.fillStyle = '#120c0a'; x.fillRect(0, 0, w, h); x.fillStyle = '#f2a51c'; for (let k=-2;k<w/40+2;k++){ x.beginPath(); x.moveTo(k*40, 0); x.lineTo(k*40 + 20, 0); x.lineTo(k*40 - 10, 18); x.lineTo(k*40 - 30, 18); x.fill(); x.beginPath(); x.moveTo(k*40, h - 18); x.lineTo(k*40 + 20, h - 18); x.lineTo(k*40 - 10, h); x.lineTo(k*40 - 30, h); x.fill(); }
      x.fillStyle = '#ff8a3a'; x.font = 'bold 66px Impact, "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('MELTDOWN GAP  ·  ' + Math.round(C.gap/10)*10 + ' M  ·  FLAT OUT', w/2, h/2 + 3); });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, 3), new THREE.MeshBasicMaterial({ map:tex })); board.position.set(0, 9, -.5); board.rotation.y = Math.PI; gw.add(board);
    const back = new THREE.Mesh(new THREE.BoxGeometry(W + 6.4, 3.2, .8), postM); back.position.set(0, 9, 0); gw.add(back); gw.traverse(o => { if (o.isMesh) o.userData.noSolid = true; }); }
  // 7. alive: the river and falls flow, heat rises (smoke from the river, sparks lifting out of the canyon), molten drips off the broken ends
  const ends = [C.lipEnd, C.landEnd].filter(e => e != null);
  HAZ.updaters.push((t, dt) => { dt = dt || 1/60; for (const m of lavaMats) m.uniforms.uT.value = t; fallM.uniforms.uT.value = t;
    const p = cars[0]; if (!p || Math.hypot(p.x - C.O.x, p.z - C.O.z) > 1500) return;
    const q = quality === 'saver' ? .5 : 1;
    if (Math.random() < dt*6*q){ const u = rnd(-C.UW*.6, C.UW*.6), v = rnd(C.vLo*.75, C.vHi*.75), [x, z] = wp(u, v); smokeFx.emit(x, -C.depth + 18, z, rnd(-3, 3), rnd(9, 16), rnd(-3, 3), rnd(50, 110), rnd(8, 12)); }
    if (Math.random() < dt*40*q){ const u = rnd(-C.UW*.7, C.UW*.7), v = rnd(-300, 300), [x, z] = wp(u, v); embers.emit(x, rnd(-C.depth + 20, -40), z, rnd(-3, 3), rnd(12, 30), rnd(-3, 3), rnd(.8, 1.8), rnd(3, 6)); }
    for (const e of ends) if (Math.random() < dt*5){ const l = rnd(-W/2, W/2); lavaFx.emit(P[e].x + R[e].x*l, H[e] - 1, P[e].z + R[e].z*l, rnd(-1, 1), rnd(-2, 0), rnd(-1, 1), rnd(1.4, 2.6), rnd(3, 5)); } });
}
const FORGE = { bridge:-1 };
// ---- eruptions: the nearest cone blows and lobs lava bombs onto the road ----
function volcanoFor(tx, tz){ let best = null, bd = 1e9; for (const v of VOLC){ if (!v.near) continue; const d = Math.hypot(v.x - tx, v.z - tz); if (d < bd){ bd = d; best = v; } } return best; }
function volcanoAftermath(x, gy, z, ti, lat, nrm){
  // a pool of lava where the bomb burst: it slows and scorches until it crusts over
  const pm = lavaMat(1, { fog:false, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 }), rad = rnd(3, 3.8);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(rad, 20), pm); pool.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), nrm); pool.position.set(x, gy, z).addScaledVector(nrm, .08); pool.renderOrder = 2; surGroup.add(pool);
  const span = Math.max(1, Math.round(rad/segLen)), zone = { type:'lava', i0:(ti - span + N) % N, len:span*2, lat0:lat - rad*.85, lat1:lat + rad*.85, dyn:true };
  HAZ.zones.unshift(zone);                                                    // ahead of the fixed fissures, so the newest lava is what you feel
  VDEBRIS.pools.push({ mesh:pool, zone, t:0 });
  if (VDEBRIS.pools.length > 14) dropPool(VDEBRIS.pools[0]);
  // and often a boulder of fresh basalt, still glowing in its cracks, that you have to steer round
  if (Math.random() < .6){ const rr = rnd(1.3, 1.9), geo = new THREE.DodecahedronGeometry(rr, 0); geo.scale(rnd(.9, 1.3), rnd(.7, 1), rnd(.9, 1.3));
    const rm = new THREE.MeshLambertMaterial({ color:0x120d0c, emissive:0xff4a0a, emissiveIntensity:1.2 }); const rock = new THREE.Mesh(geo, rm);
    const off = rnd(-1.2, 1.2), rlat = clamp(lat + off, -W/2 + 2, W/2 - 2), rx = P[ti].x + R[ti].x*rlat, rz = P[ti].z + R[ti].z*rlat;
    rock.position.set(rx, (world.elev ? trackY(rx, rz, ti) : 0) + rr*.6, rz); rock.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3); rock.castShadow = true; surGroup.add(rock);
    try { inkPatch(rm, null); } catch(_){}
    const solid = addSolid({ i:ti, lat:rlat, r:rr*1.05, soft:0, x:rx, z:rz, half:rr, dyn:true });
    VDEBRIS.rocks.push({ mesh:rock, solid, t:0, y0:rock.position.y, rr });
    if (VDEBRIS.rocks.length > 10) dropRock(VDEBRIS.rocks[0]); }
}
function dropPool(p){ surGroup.remove(p.mesh); p.mesh.material.dispose(); p.mesh.geometry.dispose(); const i = HAZ.zones.indexOf(p.zone); if (i >= 0) HAZ.zones.splice(i, 1); VDEBRIS.pools.splice(VDEBRIS.pools.indexOf(p), 1); }
function dropRock(r){ surGroup.remove(r.mesh); r.mesh.material.dispose(); r.mesh.geometry.dispose(); const i = HAZ.solids.indexOf(r.solid); if (i >= 0) HAZ.solids.splice(i, 1); VDEBRIS.rocks.splice(VDEBRIS.rocks.indexOf(r), 1); }
function volcanoDebrisUpdate(dt){
  for (const p of VDEBRIS.pools.slice()){ p.t += dt; const u = p.mesh.material.uniforms; u.uT.value = clockT; u.uCool.value = clamp((p.t - 7)/5, 0, 1);
    if (p.t > 11){ const i = HAZ.zones.indexOf(p.zone); if (i >= 0) HAZ.zones.splice(i, 1); }                    // crusted over: safe to drive on
    u.uA.value = clamp(1 - (p.t - 16)/3, 0, 1); if (p.t > 19) dropPool(p);
    if (p.t < 9 && Math.random() < dt*6) sparks.emit(p.mesh.position.x + rnd(-2,2), p.mesh.position.y + .2, p.mesh.position.z + rnd(-2,2), rnd(-1,1), rnd(2,5), rnd(-1,1), rnd(.3,.6), rnd(.4,.8)); }
  for (const r of VDEBRIS.rocks.slice()){ r.t += dt; r.mesh.material.emissiveIntensity = Math.max(0, 1.2 - r.t*.12);
    if (r.t < 6 && Math.random() < dt*2) smokeFx.emit(r.mesh.position.x, r.mesh.position.y + r.rr, r.mesh.position.z, rnd(-.5,.5), rnd(1.5,3), rnd(-.5,.5), rnd(2.5, 4), rnd(1.5, 2.5));
    if (r.t > 24){ r.mesh.position.y = r.y0 - (r.t - 24)*1.4; if (r.solid){ const i = HAZ.solids.indexOf(r.solid); if (i >= 0) HAZ.solids.splice(i, 1); r.solid = null; } }
    if (r.t > 26) dropRock(r); }
}
function clearVolcanoDebris(){ while (VDEBRIS.pools.length) dropPool(VDEBRIS.pools[0]); while (VDEBRIS.rocks.length) dropRock(VDEBRIS.rocks[0]); }


/* ---------- Hive Lattice (Unity Prime): a planet plated over by the Collective ----------
   Cube-towers with green-lit panel seams, conduits on the deck, data pylons beaming into a green storm,
   whole cube-ships hanging in the sky. Its surprise is a lightning storm: the sky earths itself onto the road. */
function hivePanelTex(seed, glowOnly){
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = glowOnly ? '#000' : '#1b2120'; x.fillRect(0,0,256,256);
  if (!glowOnly){ for (let i=0;i<26;i++){ const w = Math.round(rnd(2, 8))*16, h = Math.round(rnd(1, 5))*16, px = Math.round(rnd(0,16))*16, py = Math.round(rnd(0,16))*16, v = Math.random() < .5 ? 34 : 22;
      x.fillStyle = `rgb(${v},${v+6},${v+4})`; x.fillRect(px, py, w, h); x.strokeStyle = 'rgba(0,0,0,.7)'; x.lineWidth = 2; x.strokeRect(px, py, w, h); } }
  // lit seams: right-angle traces and small square lights, the Collective's green
  x.lineCap = 'square';
  for (let i=0;i<7;i++){ let px = Math.round(rnd(0,16))*16, py = Math.round(rnd(0,16))*16; x.beginPath(); x.moveTo(px, py);
    for (let k=0;k<5;k++){ if (Math.random() < .5) px += Math.round(rnd(-4,4))*16; else py += Math.round(rnd(-4,4))*16; x.lineTo(px, py); }
    x.strokeStyle = glowOnly ? 'rgba(80,255,150,.95)' : 'rgba(60,255,140,.8)'; x.lineWidth = rnd(1.5, 3); x.stroke(); }
  for (let i=0;i<10;i++){ x.fillStyle = glowOnly ? 'rgba(120,255,170,1)' : 'rgba(120,255,170,.9)'; const s = Math.random() < .3 ? 6 : 4; x.fillRect(Math.round(rnd(0,32))*8, Math.round(rnd(0,32))*8, s, s); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; return t;
}
let HIVE_TEX = null;
function hiveMat(rep){ HIVE_TEX = HIVE_TEX || { map:hivePanelTex(1, false), em:hivePanelTex(1, true) };
  const map = HIVE_TEX.map.clone(), em = HIVE_TEX.em.clone(); map.needsUpdate = em.needsUpdate = true; map.repeat.set(rep[0], rep[1]); em.repeat.set(rep[0], rep[1]);
  return new THREE.MeshLambertMaterial({ map, emissive:0xffffff, emissiveMap:em, emissiveIntensity:.8 }); }
const HIVE = { cubes:[], pylons:[], flashT:0 };
function hiveScenery(g){
  const C = TRACK_C, o = new THREE.Object3D();
  HIVE.cubes.length = 0; HIVE.pylons.length = 0;
  // cube-towers: stacks of plated blocks, the city of the hive
  const towerMat = hiveMat([1, 1]), boxG = new THREE.BoxGeometry(1, 1, 1); boxG.translate(0, .5, 0);
  const towers = new THREE.InstancedMesh(boxG, towerMat, 380); let n = 0;
  while (n < 380){ const a = Math.random()*Math.PI*2, d = 50 + Math.pow(Math.random(), .7)*900, cx = Math.cos(a)*d + C.x, cz = Math.sin(a)*d + C.z;
    const w = rnd(10, 26); if (nearTrack(cx, cz, W/2 + w*.8 + 10)) continue;
    const h = (d < 220 ? rnd(12, 40) : rnd(30, 140))*(Math.random() < .15 ? 1.8 : 1);
    o.position.set(cx, 0, cz); o.rotation.set(0, Math.round(Math.random()*4)*Math.PI/2 + rnd(-.05,.05), 0); o.scale.set(w, h, w*rnd(.6, 1.2)); o.updateMatrix(); towers.setMatrixAt(n++, o.matrix);
    if (n < 380 && Math.random() < .5){ const w2 = w*rnd(.4, .7), h2 = h*rnd(.2, .5); o.position.set(cx + rnd(-2,2), h, cz + rnd(-2,2)); o.scale.set(w2, h2, w2); o.updateMatrix(); towers.setMatrixAt(n++, o.matrix); } }
  towers.castShadow = towers.receiveShadow = true; g.add(towers);
  // cube-ships hanging in the storm, turning slowly
  const shipMat = hiveMat([3, 3]); shipMat.emissiveIntensity = 1.1;
  for (let i=0;i<4;i++){ const a = i/4*Math.PI*2 + rnd(0,.8), d = rnd(900, 1500), s = rnd(140, 300), cube = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), shipMat);
    cube.position.set(Math.cos(a)*d + C.x, rnd(260, 520), Math.sin(a)*d + C.z); cube.rotation.set(rnd(-.3,.3), Math.random()*3, rnd(-.3,.3)); g.add(cube); HIVE.cubes.push({ m:cube, spin:rnd(-.02, .02) }); }
  // conduits: fat pipes on the deck running out from the road, banded with green rings
  const pipeM = new THREE.MeshLambertMaterial({ color:0x2a312e }), ringM = new THREE.MeshBasicMaterial({ color:0x3cff8a });
  for (let i=0;i<14;i++){ const f = i/14 + rnd(0, .03), sd = Math.random() < .5 ? -1 : 1, p0 = atTrack(f, sd*(W/2 + 14)), len = rnd(60, 180), r = rnd(1.4, 2.6);
    const dir = new THREE.Vector3(R[p0.i].x*sd, 0, R[p0.i].z*sd).applyAxisAngle(UPV, rnd(-.6, .6)), mid = new THREE.Vector3(p0.x, r, p0.z).addScaledVector(dir, len/2);
    if (nearTrack(mid.x, mid.z, W/2 + 8) || nearTrack(p0.x + dir.x*len, p0.z + dir.z*len, W/2 + 8)) continue;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), pipeM); pipe.position.copy(mid); pipe.quaternion.setFromUnitVectors(UPV, dir); pipe.castShadow = true; g.add(pipe);
    for (let k=6;k<len;k+=rnd(10, 18)){ const ring = new THREE.Mesh(new THREE.CylinderGeometry(r*1.08, r*1.08, .5, 12), ringM); ring.position.set(p0.x, r, p0.z).addScaledVector(dir, k); ring.quaternion.copy(pipe.quaternion); g.add(ring); } }
  // data pylons: tall square spires a little off the road, each throwing a beam of light into the clouds
  const pyM = hiveMat([1, 6]), beamM = new THREE.MeshBasicMaterial({ color:0x3cff8a, transparent:true, opacity:.22, depthWrite:false, blending:THREE.AdditiveBlending, fog:false });
  for (let i=0;i<10;i++){ const sd = i % 2 ? 1 : -1, p = atTrack(i/10 + .03, sd*rnd(26, 48)); if (nearTrack(p.x, p.z, W/2 + 12)) continue;
    const h = rnd(40, 70), py = new THREE.Mesh(new THREE.BoxGeometry(4, h, 4), pyM); py.position.set(p.x, h/2, p.z); py.castShadow = true; g.add(py);
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(3.4), ringM); cap.position.set(p.x, h + 4, p.z); g.add(cap);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.4, 600, 10, 1, true), beamM); beam.position.set(p.x, h + 304, p.z); g.add(beam);
    HIVE.pylons.push({ x:p.x, z:p.z, top:h + 4, cap, beam }); }
  // the road: a lit seam down both edges, and a pulse of light that runs along them lap after lap
  const edgeM = new THREE.ShaderMaterial({ uniforms:{ uT:{value:0} }, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader:'uniform float uT; varying vec2 vU; void main(){ float p = fract(vU.y*6.0 - uT*.35); float pulse = smoothstep(.0,.03,p)*smoothstep(.12,.03,p); float a = .55 + pulse*1.4; gl_FragColor = vec4(vec3(.24,1.,.55)*a, 1.0); }' });
  for (const sd of [-1, 1]) g.add(new THREE.Mesh(stripGeo(0, N, sd*(W/2 - .05) - .18, sd*(W/2 - .05) + .18, .075, 1), edgeM));
  // a circuit trace inlaid down the middle of the tarmac
  const traceT = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 512; const x = c.getContext('2d'); x.strokeStyle = 'rgba(60,255,140,.9)'; x.lineWidth = 3; x.lineCap = 'square';
    let px = 32; x.beginPath(); x.moveTo(px, 0); for (let y=0; y<512; y+=32){ if (Math.random() < .35) px = px === 32 ? (Math.random() < .5 ? 12 : 52) : 32; x.lineTo(px, y + 16); } x.lineTo(32, 512); x.stroke();
    for (let i=0;i<10;i++){ x.fillStyle = 'rgba(120,255,170,.95)'; x.fillRect(rnd(4, 56), rnd(0, 512), 5, 5); }
    const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; return t; })();
  const traceM = new THREE.MeshBasicMaterial({ map:traceT, transparent:true, opacity:.55, depthWrite:false, blending:THREE.AdditiveBlending });
  g.add(new THREE.Mesh(stripGeo(0, N, -1.6, 1.6, .05, N*segLen/40), traceM));
  HAZ.updaters.push((t, dt) => { dt = dt || 1/60; edgeM.uniforms.uT.value = t; traceM.opacity = .4 + .15*Math.sin(t*2.2);
    for (const cb of HIVE.cubes) cb.m.rotation.y += cb.spin*dt;
    for (const p of HIVE.pylons){ p.cap.rotation.y += dt*1.4; p.beam.material.opacity = .16 + .08*Math.sin(t*3 + p.x); }
    // the storm overhead: silent sheet lightning inside the clouds, and data motes drifting up from the deck
    if (Math.random() < dt*.35 && !HIVE.flashT) HIVE.flashT = .18;
    if (HIVE.flashT > 0){ HIVE.flashT = Math.max(0, HIVE.flashT - dt); }
    if (Math.random() < dt*25 && !(cars[0] && inTunnel(cars[0].idx))){ const p = cars[0] || {x:0, z:0}; glitter.emit(p.x + rnd(-80, 80), rnd(.5, 6), p.z + rnd(-80, 80), 0, rnd(1.5, 4), 0, rnd(.4, .8), rnd(1.5, 3)); } });
}
// ---- the Vault: an 80 m tunnel bored through a hive block. No lights to speak of inside — the headlamps show the way ----
function hiveTunnel(g){
  const t = TUNNELS.find(t => t.tube); if (!t) return;
  const TG = new THREE.Group(), top = new THREE.Group(); TG.add(top); g.add(TG);
  const L = t.tube.wall, Y = t.tube.roof, OW = L + 11, OY = Y + 7, span = (t.b - t.a + N) % N, up = new THREE.Vector3(0, 1, 0);
  // sweep a cross-section (lateral, height) along the road samples
  const sweep = (prof, uRep, vRep) => { const pos = [], uv = [], idx = [], np = prof.length, acc = [0];
    for (let k=1;k<np;k++) acc.push(acc[k-1] + Math.hypot(prof[k][0] - prof[k-1][0], prof[k][1] - prof[k-1][1]));
    for (let s=0;s<=span;s++){ const i = (t.a + s) % N; for (let k=0;k<np;k++){ pos.push(P[i].x + R[i].x*prof[k][0], P[i].y + prof[k][1], P[i].z + R[i].z*prof[k][0]); uv.push(acc[k]/uRep, s*segLen/vRep); } }
    for (let s=0;s<span;s++) for (let k=0;k<np-1;k++){ const a = s*np + k, b = a + 1, c = a + np, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); return geo; };
  // inside: dark plating that only shows where a lamp falls on it, the odd panel seam glinting faintly
  const inMap = HIVE_TEX.map.clone(); inMap.needsUpdate = true; const inM = new THREE.MeshPhongMaterial({ map:inMap, color:0x6f7d76, specular:0x1c2a22, shininess:18, side:THREE.DoubleSide });   // no glow: the plating only shows where a lamp falls
  for (const sd of [-1, 1]){ const f = new THREE.Mesh(stripGeo(t.a, span, sd < 0 ? -L : W/2 + .3, sd < 0 ? -(W/2 + .3) : L, .03, 4), new THREE.MeshPhongMaterial({ color:0x161c19, specular:0x000000, shininess:1 })); f.receiveShadow = true; TG.add(f); }
  const outM = hiveMat([1, 1]); outM.side = THREE.DoubleSide;
  const C = 3;   // chamfered top corners
  for (const sd of [-1, 1]){ const w = new THREE.Mesh(sweep([[sd*L, 0], [sd*L, Y - C]], 8, 8), inM); w.receiveShadow = true; TG.add(w);
    const o = new THREE.Mesh(sweep([[sd*OW, 0], [sd*OW, OY]], 8, 8), outM); o.castShadow = true; TG.add(o); }
  const roofIn = new THREE.Mesh(sweep([[-L, Y - C], [-L + C, Y], [L - C, Y], [L, Y - C]], 8, 8), inM); roofIn.receiveShadow = true; top.add(roofIn);
  const roofOut = new THREE.Mesh(sweep([[-OW, OY], [OW, OY]], 8, 8), outM); roofOut.castShadow = true; top.add(roofOut);
  // portals: a plated face round the bore with a lit green outline, and a signal block over the mouth
  const hole = [[-L, 0], [-L, Y - C], [-L + C, Y], [L - C, Y], [L, Y - C], [L, 0]];
  const sh = new THREE.Shape(); sh.moveTo(-OW, 0); sh.lineTo(-OW, OY); sh.lineTo(OW, OY); sh.lineTo(OW, 0); sh.lineTo(L, 0); for (let k=hole.length-2;k>=1;k--) sh.lineTo(hole[k][0], hole[k][1]); sh.lineTo(-L, 0); sh.lineTo(-OW, 0);
  const faceG = new THREE.ExtrudeGeometry(sh, { depth:2.4, bevelEnabled:false }), faceM = hiveMat([.08, .08]);
  const glowM = new THREE.MeshBasicMaterial({ color:0x3cff8a }), dimM = new THREE.MeshBasicMaterial({ color:0x1d7a45 }), m4 = new THREE.Matrix4();
  const seat = (obj, i, lat, y, along) => { m4.makeBasis(R[i], up, T[i]); obj.quaternion.setFromRotationMatrix(m4); obj.position.set(P[i].x + R[i].x*lat + T[i].x*along, P[i].y + y, P[i].z + R[i].z*lat + T[i].z*along); return obj; };
  const signals = [];
  for (const [i, back] of [[t.a, -2.2], [t.b, -.2]]){
    TG.add(seat(new THREE.Mesh(faceG, faceM), i, 0, 0, back));
    for (const along of [back - .08, back + 2.48]) for (let k=0;k<hole.length-1;k++){ const [x0, y0] = hole[k], [x1, y1] = hole[k+1], len = Math.hypot(x1 - x0, y1 - y0);
      const bar = seat(new THREE.Mesh(new THREE.BoxGeometry(len + .5, .5, .3), glowM), i, (x0 + x1)/2, (y0 + y1)/2, along); bar.rotateZ(Math.atan2(y1 - y0, x1 - x0)); TG.add(bar); }
    const blk = seat(new THREE.Mesh(new THREE.BoxGeometry(12, 4, 3.4), hiveMat([3, 1])), i, 0, OY + 2, back + 1.2); top.add(blk);
    const core = seat(new THREE.Mesh(new THREE.BoxGeometry(12.2, .7, 3.6), glowM.clone()), i, 0, OY + 2.4, back + 1.2); top.add(core); signals.push(core.material); }
  // the block above: plated cubes heaped on the roof, the bore just one more seam in the city
  const cubeM = hiveMat([1, 1]);
  for (let s=2;s<span-1;s+=Math.max(2, Math.round(rnd(8, 14)/segLen))){ const i = (t.a + s) % N, w = rnd(8, 18), h = rnd(4, 16), lat = rnd(-OW + w/2, OW - w/2);
    const c = seat(new THREE.Mesh(new THREE.BoxGeometry(w, h, rnd(6, 14)), cubeM), i, lat, OY + h/2, 0); c.castShadow = true; top.add(c); }
  // inside, almost nothing: a dim green marker low on each wall every 12 m, and a dashed seam down the roof
  const mkG = new THREE.BoxGeometry(.18, .22, 1.4), mkN = Math.ceil(span*segLen/12)*2 + 2, mk = new THREE.InstancedMesh(mkG, dimM, mkN); let n = 0; const o = new THREE.Object3D();
  for (let s=1;s<span;s+=Math.max(1, Math.round(12/segLen))){ const i = (t.a + s) % N; for (const sd of [-1, 1]){ if (n >= mkN) break; seat(o, i, sd*(L - .12), 1.1, 0); o.updateMatrix(); mk.setMatrixAt(n++, o.matrix); } }
  mk.count = n; TG.add(mk);
  const dashG = new THREE.BoxGeometry(.3, .08, 2.2), dN = Math.ceil(span*segLen/9) + 2, dash = new THREE.InstancedMesh(dashG, new THREE.MeshBasicMaterial({ color:0x0f3a22 }), dN); n = 0;
  for (let s=1;s<span;s+=Math.max(1, Math.round(9/segLen))){ if (n >= dN) break; const i = (t.a + s) % N; seat(o, i, 0, Y - .06, 0); o.updateMatrix(); dash.setMatrixAt(n++, o.matrix); }
  dash.count = n; top.add(dash);
  // structural ribs every ~36 m: dark steel frames round the bore that flick past in the headlights, so the speed reads in the dark
  const ribS = new THREE.Shape(), ins = .7; ribS.moveTo(-L, 0); for (let k=1;k<hole.length;k++) ribS.lineTo(hole[k][0], hole[k][1]);
  ribS.lineTo(L - ins, 0); ribS.lineTo(L - ins, Y - C - .3); ribS.lineTo(L - C - .3, Y - ins); ribS.lineTo(-L + C + .3, Y - ins); ribS.lineTo(-L + ins, Y - C - .3); ribS.lineTo(-L + ins, 0); ribS.lineTo(-L, 0);
  const ribG = new THREE.ExtrudeGeometry(ribS, { depth:1.2, bevelEnabled:false }), ribN = Math.ceil(span*segLen/36) + 2;
  const ribs = new THREE.InstancedMesh(ribG, new THREE.MeshPhongMaterial({ color:0x3a4842, specular:0x2a3a32, shininess:30 }), ribN); n = 0;
  for (let s=Math.round(18/segLen);s<span-2;s+=Math.max(2, Math.round(36/segLen))){ if (n >= ribN) break; seat(o, (t.a + s) % N, 0, 0, -.6); o.updateMatrix(); ribs.setMatrixAt(n++, o.matrix); }
  ribs.count = n; ribs.receiveShadow = true; top.add(ribs);
  TG.traverse(m => { if (m.isMesh) m.userData.noSolid = true; });
  HIVE.tunnel = { a:t.a, b:t.b };
  HAZ.updaters.push(tt => { top.visible = !(camMode === 3 && state === 'race'); for (const m of signals) m.color.setRGB(.15, .55 + .45*Math.abs(Math.sin(tt*2.4)), .3); });
}
function hiveHazards(g){
  // charged floor plates: the field jolts your steering and drags you down (the Collective's own drones ride it out)
  const plateT = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d'); x.fillStyle = 'rgba(30,255,120,.16)'; x.fillRect(0,0,128,128);
    x.strokeStyle = 'rgba(80,255,160,.95)'; x.lineWidth = 3; for (let i=0;i<=128;i+=32){ x.beginPath(); x.moveTo(i,0); x.lineTo(i,128); x.stroke(); x.beginPath(); x.moveTo(0,i); x.lineTo(128,i); x.stroke(); }
    x.fillStyle = 'rgba(160,255,200,1)'; for (let i=0;i<=128;i+=32) for (let j=0;j<=128;j+=32) x.fillRect(i-4, j-4, 8, 8);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); return t; })();
  const plateM = new THREE.MeshBasicMaterial({ map:plateT, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:.8 });
  const zones = [];
  for (const [f, len, a, b] of [[.22, 8, -10, 1], [.46, 8, -1, 10], [.71, 8, -10, 2], [.93, 7, -3, 10]]) zones.push(addZone('shock', f, len, a, b, new THREE.Mesh(stripGeo(Math.round(f*N), len, a, b, .07, 3), plateM)));
  HAZ.updaters.push(t => { plateM.opacity = .55 + .35*Math.abs(Math.sin(t*9))*(.5 + .5*Math.sin(t*1.3));
    for (const z of zones) if (Math.random() < .5){ const k = (z.i0 + Math.random()*z.len|0) % N, lat = rnd(z.lat0, z.lat1); glitter.emit(P[k].x + R[k].x*lat, .3, P[k].z + R[k].z*lat, rnd(-2,2), rnd(2,6), rnd(-2,2), rnd(.3,.6), rnd(.2,.5)); } });
  // data pylons standing in the racing line
  const pyM = hiveMat([1, 2]), coreM = new THREE.MeshBasicMaterial({ color:0x3cff8a });
  for (const [f, lat] of [[.12, 4], [.33, -5], [.4, 5], [.58, -4], [.8, 5], [.86, -4]]){
    const p = atTrack(f, lat), h = rnd(7, 11), m = new THREE.Mesh(new THREE.BoxGeometry(3, h, 3), pyM); m.position.set(p.x, h/2, p.z); m.rotation.y = p.h; m.castShadow = true; g.add(m);
    const core = new THREE.Mesh(new THREE.BoxGeometry(3.1, .5, 3.1), coreM); core.position.set(p.x, h*.7, p.z); core.rotation.y = p.h; g.add(core);
    addSolid({ i:p.i, lat, r:2.1, soft:0, x:p.x, z:p.z, half:2.1 }); }
}
// ---- lightning: a bolt from the storm down to a marked spot on the road ----
const BOLTS = [];
function boltPath(x0, y0, z0, x1, y1, z1, jag){
  const pts = [], n = 16; for (let i=0;i<=n;i++){ const u = i/n, k = Math.sin(u*Math.PI)*jag*(1 - u*.4);
    pts.push(new THREE.Vector3(x0 + (x1 - x0)*u + (i && i < n ? rnd(-k, k) : 0), y0 + (y1 - y0)*u, z0 + (z1 - z0)*u + (i && i < n ? rnd(-k, k) : 0))); } return pts; }
function lightningStrike(x, y, z){
  const top = y + 150, sx = x + rnd(-30, 30), sz = z + rnd(-30, 30), pts = boltPath(sx, top, sz, x, y, z, 9);
  const mk = (p, r, col, op) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p, false, 'catmullrom', 0), p.length*2, r, 5, false),
    new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:op, depthWrite:false, blending:THREE.AdditiveBlending, fog:false })); surGroup.add(m); return m; };
  const parts = [mk(pts, .35, 0xf2fff6, 1), mk(pts, 1.6, 0x3cff8a, .4)];
  for (let b=0;b<3;b++){ const k = 4 + Math.random()*8|0, p0 = pts[k], br = boltPath(p0.x, p0.y, p0.z, p0.x + rnd(-30,30), p0.y - rnd(25, 60), p0.z + rnd(-30,30), 6); parts.push(mk(br, .18, 0xd8ffe6, .8)); }
  BOLTS.push({ parts, t:0 });
  HIVE.flashT = .22;
  for (let k=0;k<40;k++) glitter.emit(x, y + .5, z, rnd(-14,14), rnd(3,14), rnd(-14,14), rnd(.4,.9), rnd(.3,.8));
}
function boltsUpdate(dt){
  for (const b of BOLTS.slice()){ b.t += dt; const fl = b.t < .3 ? (Math.random() < .35 ? .25 : 1) : Math.max(0, 1 - (b.t - .3)/.2);
    b.parts.forEach((m, i) => { m.material.opacity = (i === 1 ? .4 : i === 0 ? 1 : .8)*fl; });
    if (b.t > .5){ for (const m of b.parts){ surGroup.remove(m); m.geometry.dispose(); m.material.dispose(); } BOLTS.splice(BOLTS.indexOf(b), 1); } }
}
function clearBolts(){ for (const b of BOLTS) for (const m of b.parts){ surGroup.remove(m); m.geometry.dispose(); m.material.dispose(); } BOLTS.length = 0; }
const UPV = new THREE.Vector3(0, 1, 0);


/* ---------- Mojave Basin: dunes, a canyon with a sandfall, sandstone arches and hoodoos, dust devils under twin suns ----------
   The flat plane is replaced by a sculpted ground: dunes swell up away from the road, and a deep canyon cuts across
   the circuit — the road crosses it on a steel truss bridge. Sand pours over the canyon rim in a sandfall and runs along
   the floor; dust devils wander the basin and shove anyone they catch. */
const MOJ = { canyon:[], canyons:[], cw:104, depth:80, bridge:-1, devils:[] };
function mHash(x, z){ const s = Math.sin(x*127.1 + z*311.7)*43758.5453; return s - Math.floor(s); }
function mNoise(x, z){ const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx*fx*(3 - 2*fx), v = fz*fz*(3 - 2*fz);
  const a = mHash(ix, iz), b = mHash(ix + 1, iz), c = mHash(ix, iz + 1), d = mHash(ix + 1, iz + 1); return a + (b - a)*u + (c - a)*v + (a - b - c + d)*u*v; }
function distTrack(x, z){ let m = 1e18; for (let i=0;i<N;i+=2){ const dx = x - P[i].x, dz = z - P[i].z, d = dx*dx + dz*dz; if (d < m) m = d; }
  if (CUT){ const ax = CUT.A.x, az = CUT.A.z, bx = CUT.B.x, bz = CUT.B.z, l2 = (bx-ax)**2 + (bz-az)**2, t = clamp(((x-ax)*(bx-ax) + (z-az)*(bz-az))/l2, 0, 1), dx = x - (ax + (bx-ax)*t), dz = z - (az + (bz-az)*t); m = Math.min(m, dx*dx + dz*dz); }
  return Math.sqrt(m); }
function distPoly(C, x, z){ let m = 1e18, best = 0; for (let i=0;i<C.length-1;i++){ const a = C[i], b = C[i+1], l2 = (b.x-a.x)**2 + (b.z-a.z)**2, t = clamp(((x-a.x)*(b.x-a.x) + (z-a.z)*(b.z-a.z))/(l2||1), 0, 1), dx = x - (a.x + (b.x-a.x)*t), dz = z - (a.z + (b.z-a.z)*t), d = dx*dx + dz*dz; if (d < m){ m = d; best = i + t; } } return { d:Math.sqrt(m), s:best }; }
function distCanyon(x, z){ return distPoly(MOJ.canyon, x, z); }
// ground height: sharp-crested dunes and terraced tablelands away from the road, canyons carved through everything
function mojaveH(x, z, dt){
  const C = TRACK_C, r = Math.hypot(x - C.x, z - C.z);
  if (dt === undefined) dt = distTrack(x, z);
  const A = clamp((dt - 26)/90, 0, 1)*(1 - clamp((r - 640)/220, 0, 1));
  const n1 = mNoise(x/140, z/140), n2 = mNoise(x/55 + 9, z/55 - 4), ridge = 1 - Math.abs(2*mNoise(x/90 - 3, z/120 + 7) - 1);
  // dunes: a sharp wind-cut crest with a long gentle back slope
  const dn = mNoise(x/120 + 3, z/170 - 2), crest = Math.pow(1 - Math.abs(2*((x*.0045 + z*.0028 + dn*1.6) % 1 + 1) % 1 - 1), 2.2);
  const dunes = 15*crest*(.5 + n1) + 7*ridge*ridge + 3*n2 - 3;
  // tablelands: flat-topped rock benches stepping up in ledges, where the rock pokes through the sand
  const mask = clamp((mNoise(x/300 + 11, z/300 - 5) - .52)/.12, 0, 1), tv = (mNoise(x/110 - 7, z/110 + 3)*.7 + n2*.3)*44, tstep = Math.floor(tv/9)*9 + 9*clamp((tv % 9 - 7.2)/1.8, 0, 1);
  let h = A*(dunes*(1 - mask) + tstep*mask);
  for (const cy of MOJ.canyons){ const { d } = distPoly(cy.pts, x, z), w = cy.w + (mNoise(x/40, z/40) - .5)*8;
    h *= clamp((d - w)/45, 0, 1);                                                             // the rim is flat: dunes and benches stop short of the drop
    if (d < w){ const k = clamp((w - d)/9, 0, 1), dep = cy.depth*k; h = Math.min(h, -Math.round(dep/7)*7*.35 - dep*.65); } }       // terraced walls
  return h;
}
function sandstoneTex(){ const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
  let y = 0; const cols = ['#c98a5a','#d39a68','#c3814f','#d8a271','#bf7a52','#cf9464','#dbab7c']; while (y < 256){ const h = rnd(6, 26); x.fillStyle = cols[Math.random()*cols.length|0]; x.fillRect(0, y, 64, h); y += h; }
  for (let i=0;i<200;i++){ x.fillStyle = `rgba(80,40,20,${Math.random()*.25})`; x.fillRect(Math.random()*64, Math.random()*256, rnd(1,6), 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; return t; }
function streakTex(col){ const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d'); x.clearRect(0,0,64,256);
  for (let i=0;i<70;i++){ const px = Math.random()*64, w = rnd(1, 5), a = rnd(.15, .7); const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(.3, `rgba(${col},${a})`); g.addColorStop(.7, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g; const y0 = rnd(-100, 150); x.fillRect(px, y0, w, rnd(80, 256)); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; return t; }
// a dust twister: a bent, swaying funnel of dust drawn as two swirling shells (an outer veil and a denser core), a rolling
// skirt of dust round its foot and grit spiralling up the column. Everything is shaped in the vertex shader, so it breathes.
const TW_VS = `uniform float uT, uH, uR0, uR1, uBend, uSeed, uWob, uPow; varying vec3 vW; varying vec3 vN; varying vec2 vA;
void main(){ float y = position.y, ang = atan(position.z, position.x);
  float r = mix(uR0, uR1, pow(y, uPow))*(1. + uWob*(.55*sin(ang*3. + y*13. - uT*5. + uSeed) + .45*sin(ang*5. - y*21. + uT*7.)));
  vec3 ax = vec3(sin(y*2.4 + uT*.6 + uSeed)*uBend*y*y, y*uH, cos(y*1.8 + uT*.45 + uSeed*1.3)*uBend*.7*y*y);
  vec3 p = ax + vec3(cos(ang)*r, 0., sin(ang)*r); vA = vec2(ang, y);
  vec4 w = modelMatrix*vec4(p, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix)*vec3(cos(ang), .25, sin(ang))); gl_Position = projectionMatrix*viewMatrix*w; }`;
const TW_FS = `uniform float uT, uTw, uSpd, uA, uSeed, uFog; uniform vec3 uLo, uHi, uFogC; varying vec3 vW; varying vec3 vN; varying vec2 vA;
float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
void main(){ float y = vA.y, a = vA.x + y*uTw - uT*uSpd;
  vec3 q = vec3(cos(a)*2.2, sin(a)*2.2, y*7. - uT*.8 + uSeed);
  float s = n3(q)*.55 + n3(q*2.3 + 4.)*.3 + n3(q*5.1 - 2.)*.15;
  float streak = smoothstep(.3, .75, s);
  vec3 V = normalize(cameraPosition - vW); float edge = 1. - abs(dot(normalize(vN), V)); edge = .35 + .65*pow(edge, .7);
  float dens = mix(1., .45, y)*smoothstep(1., .72, y)*smoothstep(0., .04, y)*(.25 + .75*streak)*edge;
  vec3 c = mix(uLo, uHi, clamp(y*.9 + s*.25, 0., 1.))*(.82 + .3*s);
  float lit = .75 + .25*clamp(dot(normalize(vN), normalize(vec3(-.6, .5, .6))), 0., 1.); c *= lit;
  c = mix(c, uFogC, uFog);
  gl_FragColor = vec4(c, clamp(dens*uA, 0., 1.)); }`;
function makeTwister(o){
  const G = new THREE.Group(), shells = [];
  const geo = new THREE.CylinderGeometry(1, 1, 1, 40, 56, true); geo.translate(0, .5, 0);
  const shell = (H, R0, R1, opt) => { const m = new THREE.ShaderMaterial({ vertexShader:TW_VS, fragmentShader:TW_FS, transparent:true, depthWrite:false, side:THREE.DoubleSide, fog:false,
      uniforms:{ uT:{value:0}, uH:{value:H}, uR0:{value:R0}, uR1:{value:R1}, uBend:{value:opt.bend}, uSeed:{value:opt.seed}, uWob:{value:opt.wob}, uPow:{value:opt.pow || 1.7},
        uTw:{value:opt.tw}, uSpd:{value:opt.spd}, uA:{value:opt.a*(o.alpha || 1)}, uFog:{value:o.fog || 0}, uLo:{value:new THREE.Color(opt.lo)}, uHi:{value:new THREE.Color(opt.hi)}, uFogC:{value:new THREE.Color(o.fogC || 0xe9cfa0)} } });
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = opt.ro || 0; G.add(mesh); shells.push(m); return mesh; };
  const H = o.h, R0 = o.r0, R1 = o.r1, seed = Math.random()*10, bend = o.bend == null ? H*.18 : o.bend;
  shell(H, R0*.55, R1*.62, { bend, seed, wob:.14, tw:5.5, spd:4.2, a:1.15, lo:0xa0703e, hi:0xdcae70, ro:1 });                 // dense core, spinning fast
  shell(H*1.02, R0*1.15, R1, { bend, seed, wob:.2, tw:3.5, spd:2.4, a:.72, lo:0xc0905a, hi:0xf0d4a2, ro:2 });                // the outer veil
  shell(H*.12, R0*3.2, R0*1.3, { bend:0, seed:seed + 3, wob:.3, tw:2, spd:3, a:.85, pow:.6, lo:0xb0804e, hi:0xe6c28c, ro:3 });   // the rolling skirt of dust at its foot
  // grit spiralling up the column
  const nG = o.grit || 0, grit = nG ? new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color:0xb48a5c }), nG) : null, gd = [], ob = new THREE.Object3D();
  if (grit){ for (let i=0;i<nG;i++) gd.push({ y:Math.random(), a:Math.random()*6.28, s:rnd(.15, .45)*(o.r0/2), v:rnd(.08, .2) }); grit.frustumCulled = false; G.add(grit); }
  return { G, update(t, dt){ for (const m of shells) m.uniforms.uT.value = t;
      if (grit){ for (let i=0;i<nG;i++){ const d = gd[i]; d.y += d.v*dt; if (d.y > .8) d.y -= .8; d.a += dt*(5 - d.y*3);
          const y = d.y, r = (R0*.55 + (R1*.62 - R0*.55)*Math.pow(y, 1.7))*1.25, bx = Math.sin(y*2.4 + t*.6 + seed)*bend*y*y, bz = Math.cos(y*1.8 + t*.45 + seed*1.3)*bend*.7*y*y;
          ob.position.set(bx + Math.cos(d.a)*r, y*H, bz + Math.sin(d.a)*r); ob.rotation.set(d.a, d.a*1.3, 0); ob.scale.setScalar(d.s); ob.updateMatrix(); grit.setMatrixAt(i, ob.matrix); }
        grit.instanceMatrix.needsUpdate = true; } } };
}
const sandCloudFx = makeFx(0xdcbf92, 700, false, -0.15);
function mojaveWorks(g){
  const C = TRACK_C, o = new THREE.Object3D();
  // 1. the canyon: crosses the circuit square-on at the straightest stretch of the back half, meandering off both ways
  let bi = 0, best = -1; for (let i=0;i<N;i++){ const f = i/N; if (f < .56 || f > .7) continue; const s = T[i].dot(T[(i + 14) % N]) + T[i].dot(T[(i - 14 + N) % N]); if (s > best){ best = s; bi = i; } }
  MOJ.bridge = bi; MOJ.canyon = [];
  { const B = P[bi], rr = R[bi], tt = T[bi], ph = rnd(0, 6), side = [];
    for (const sd of [-1, 1]){ const pts = []; for (let k=0;k<70;k++){ const s = k*9*sd, wob = 50*Math.sin(Math.abs(s)/95 + ph*sd)*clamp((Math.abs(s) - 30)/80, 0, 1);
        const x = B.x + rr.x*s + tt.x*wob, z = B.z + rr.z*s + tt.z*wob; if (Math.hypot(x - C.x, z - C.z) > 760) break;
        if (Math.abs(s) > 40){ let near = false; for (let i=0;i<N;i+=3){ const di = Math.min((i - bi + N) % N, (bi - i + N) % N); if (di < 30) continue; if (Math.hypot(P[i].x - x, P[i].z - z) < MOJ.cw + W/2 + 30){ near = true; break; } } if (near) break; }
        pts.push({ x, z }); } side.push(pts); }
    MOJ.canyon = [...side[0].reverse(), ...side[1].slice(1)];
    MOJ.canyons = [{ pts:MOJ.canyon, w:MOJ.cw, depth:MOJ.depth }];
    // side canyons branching off the main one, well clear of the road
    for (const frac of [.18, .82]){ const k0 = Math.round(MOJ.canyon.length*frac), p0 = MOJ.canyon[k0], p1 = MOJ.canyon[Math.min(MOJ.canyon.length - 1, k0 + 1)]; if (!p0 || !p1) continue;
      const tx = p1.x - p0.x, tz = p1.z - p0.z, tl = Math.hypot(tx, tz) || 1; let ang = Math.atan2(tz, tx) + (Math.random() < .5 ? 1 : -1)*rnd(.7, 1.1); const pts = [{ x:p0.x, z:p0.z }]; let x = p0.x, z = p0.z;
      for (let k=0;k<30;k++){ ang += rnd(-.25, .25); x += Math.cos(ang)*9; z += Math.sin(ang)*9; if (Math.hypot(x - C.x, z - C.z) > 760 || distTrack(x, z) < 70) break; pts.push({ x, z }); }
      if (pts.length > 6) MOJ.canyons.push({ pts, w:14, depth:30 }); } }
  // 2. sculpted ground: an inner field of dunes and canyon, a flat ring beyond it out to the horizon
  const gT = noiseTex(world.ground[0], world.ground[1], 256, world.ground[2]); gT.repeat.set(90, 90);
  const SZ = 1800, SEG = 240, geo = new THREE.PlaneGeometry(SZ, SZ, SEG, SEG); geo.rotateX(-Math.PI/2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count*3), strata = [[.86,.52,.33],[.93,.64,.42],[.78,.42,.27],[.97,.75,.52],[.72,.36,.24]];
  for (let i=0;i<pos.count;i++){ const x = pos.getX(i) + C.x, z = pos.getZ(i) + C.z, h = mojaveH(x, z); pos.setY(i, h);
    let c = [1, 1, 1]; if (h < -1.5){ const band = strata[Math.floor((-h + mNoise(x/30, z/30)*3)/5) % strata.length], k = clamp(-h/6, 0, 1); const sh = 1 - .38*clamp(-h/MOJ.depth, 0, 1); c = [(1 + (band[0]*1.15 - 1)*k)*sh, (1 + (band[1]*1.15 - 1)*k)*sh, (1 + (band[2]*1.15 - 1)*k)*sh]; if (h < -MOJ.depth*.9){ c = [.72, .58, .44]; } }
    else if (h > 4){ const k = clamp((h - 4)/20, 0, 1)*.12; c = [1 + k*.3, 1 + k*.1, 1 - k*.2]; }
    cols[i*3] = c[0]; cols[i*3+1] = c[1]; cols[i*3+2] = c[2]; }
  geo.computeVertexNormals();
  { const nr = geo.attributes.normal, rockA = [[.78,.47,.3],[.86,.58,.38],[.72,.4,.26],[.9,.66,.45],[.68,.36,.24]];
    for (let i=0;i<pos.count;i++){ const ny = nr.getY(i), y = pos.getY(i); if (ny > .86 || y < -1.5) continue;     // canyon walls are already banded
      const k = clamp((.86 - ny)/.3, 0, 1), band = rockA[Math.floor((y + 60 + mNoise(pos.getX(i)/25, pos.getZ(i)/25)*3)/4.5) % rockA.length], sh = .9 + .1*ny;
      cols[i*3] = (1 + (band[0]*1.12 - 1)*k)*sh; cols[i*3+1] = (1 + (band[1]*1.12 - 1)*k)*sh; cols[i*3+2] = (1 + (band[2]*1.12 - 1)*k)*sh; } }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map:gT, vertexColors:true })); ground.position.set(C.x, 0, C.z); ground.receiveShadow = true; g.add(ground);
  const rT = gT.clone(); rT.needsUpdate = true; rT.repeat.set(300, 300);
  const ring = new THREE.Mesh(new THREE.RingGeometry(860, 3200, 72, 1), new THREE.MeshLambertMaterial({ map:rT })); ring.rotation.x = -Math.PI/2; ring.position.set(C.x, -.3, C.z); ring.receiveShadow = true; g.add(ring);
  // 3. the bridge: a steel deck-arch over the canyon — two rust-red ribs springing from the canyon walls, slim columns carrying a slab deck,
  //    a dark fascia with an amber band, and a low guardrail along both edges (the hard rail the cars bounce off)
  const deckM = new THREE.MeshLambertMaterial({ color:0x4a3a2c, side:THREE.DoubleSide }), fasciaM = new THREE.MeshLambertMaterial({ color:0x3b2a20, side:THREE.DoubleSide }),
    amberM = new THREE.MeshLambertMaterial({ color:0xf5a623, emissive:0x3a2200, side:THREE.DoubleSide }), archM = new THREE.MeshLambertMaterial({ color:0x8a3c1e }),
    railM = new THREE.MeshLambertMaterial({ color:0x2a2420, side:THREE.DoubleSide }), footM = new THREE.MeshLambertMaterial({ color:0x6e4f3a });
  let span = 0; while (span < 80 && mojaveH(P[(bi + span) % N].x, P[(bi + span) % N].z, 0) < -1) span++;
  let spanB = 0; while (spanB < 80 && mojaveH(P[(bi - spanB + N) % N].x, P[(bi - spanB + N) % N].z, 0) < -1) spanB++;
  const i0 = (bi - spanB - 2 + N) % N, len = span + spanB + 4;
  MOJ.bridgeSpan = { i0, len };
  const wall = (lat, y0, y1, mat) => { const pos = [], idx = []; for (let k=0;k<=len;k++){ const i = (i0 + k) % N, x = P[i].x + R[i].x*lat, z = P[i].z + R[i].z*lat; pos.push(x, P[i].y + y0, z, x, P[i].y + y1, z); if (k < len){ const a = k*2; idx.push(a, a+2, a+1, a+1, a+2, a+3); } }
    const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setIndex(idx); ge.computeVertexNormals(); const m = new THREE.Mesh(ge, mat); g.add(m); return m; };
  const beam = (a, b, sx, sy, mat) => { if (!(a.distanceTo(b) > .05)) return null; const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, a.distanceTo(b) + .05), mat); m.position.copy(a).add(b).multiplyScalar(.5); m.lookAt(b); m.castShadow = true; g.add(m); return m; };
  const at = (kf, lat, y) => { const k0 = Math.max(0, Math.min(len - 1, Math.floor(kf))), u = kf - k0, ia = (i0 + k0) % N, ib = (ia + 1) % N;
    const px = P[ia].x + (P[ib].x - P[ia].x)*u, pz = P[ia].z + (P[ib].z - P[ia].z)*u, rx = R[ia].x + (R[ib].x - R[ia].x)*u, rz = R[ia].z + (R[ib].z - R[ia].z)*u; return new THREE.Vector3(px + rx*lat, y, pz + rz*lat); };
  const EDGE = W/2 + 2.2, DECK_B = -2.4;
  { g.add(new THREE.Mesh(stripGeo(i0, len, -EDGE, EDGE, -.05, 1), deckM));                        // the slab: top, underside, fascia, amber band
    g.add(new THREE.Mesh(stripGeo(i0, len, -EDGE, EDGE, DECK_B, 1), fasciaM));
    for (const sd of [-1, 1]){ wall(sd*EDGE, DECK_B, -.55, fasciaM); wall(sd*(EDGE + .02), -.55, -.05, amberM); } }
  // guardrail: posts every other sample, a dark top rail and an amber mid rail
  for (const sd of [-1, 1]){ const lat = sd*(EDGE - .35);
    wall(lat, .78, 1.08, railM); wall(lat, .38, .58, amberM);
    for (let k=0;k<=len;k+=2){ const i = (i0 + k) % N, post = new THREE.Mesh(new THREE.BoxGeometry(.22, 1.15, .22), railM); post.position.set(P[i].x + R[i].x*lat, P[i].y + .55, P[i].z + R[i].z*lat); g.add(post); }
    for (let k=0;k<len;k++){ const i = (i0 + k) % N; addSolid({ i, lat:sd*EDGE, r:1.3, soft:0, x:P[i].x + R[i].x*sd*EDGE, z:P[i].z + R[i].z*sd*EDGE, half:1.3, rail:true }); } }
  // the arch: two braced steel truss ribs springing deep in the canyon walls and rising to just under the deck, tall spandrel
  // columns carrying the deck, X-bracing between the ribs, concrete abutments on both rims and portal pylons at each end.
  // Every steel member goes into a few instanced batches, so the extra detail costs almost nothing to draw.
  const RIB = W/2 - 1.2, yC = DECK_B - .8, gH = (kf, lat) => { const p = at(kf, lat, 0); return mojaveH(p.x, p.z, 0); };
  const gMin = k => Math.min(gH(k, -RIB), gH(k, RIB)), yT = -MOJ.depth*.42;
  let kA = 1, kB = len - 1;
  while (kA < len/2 - 2 && gMin(kA) > yT) kA += .25;
  while (kB > len/2 + 2 && gMin(kB) > yT) kB -= .25;
  const ySA = Math.max(gMin(kA), -MOJ.depth*.6) - .5, ySB = Math.max(gMin(kB), -MOJ.depth*.6) - .5;
  const kM = (kA + kB)/2, half = (kB - kA)/2, archY = kf => { const u = (kf - kM)/half; return yC + ((kf < kM ? ySA : ySB) - yC)*Math.pow(Math.abs(u), 2.2); };
  const ribD = kf => 2.6 + 4.2*Math.pow(Math.abs((kf - kM)/half), 1.5);         // the rib truss deepens toward its feet
  const BATCH = new Map(), ub = new THREE.BoxGeometry(1, 1, 1), bo = new THREE.Object3D();
  const bm = (a, b, sx, sy, mat) => { const L = a.distanceTo(b); if (!(L > .05)) return; bo.position.copy(a).add(b).multiplyScalar(.5); bo.lookAt(b); bo.scale.set(sx, sy, L + .05); bo.updateMatrix();
    let arr = BATCH.get(mat); if (!arr) BATCH.set(mat, arr = []); arr.push(bo.matrix.clone()); };
  const n = Math.max(24, Math.round((kB - kA)*2));
  for (const sd of [-1, 1]){ const lat = sd*RIB;
    for (let s=0;s<=n;s++){ const k = kA + (kB - kA)*s/n, top = at(k, lat, archY(k)), bot = at(k, lat, archY(k) - ribD(k));
      bm(top, bot, .45, .45, archM);                                                                   // verticals
      if (s < n){ const k2 = kA + (kB - kA)*(s + 1)/n, top2 = at(k2, lat, archY(k2)), bot2 = at(k2, lat, archY(k2) - ribD(k2));
        bm(top, top2, 1.1, 1.0, archM); bm(bot, bot2, 1.1, 1.0, archM);                                // chords
        bm(s % 2 ? top : bot, s % 2 ? bot2 : top2, .35, .35, archM); } } }                            // diagonals, alternating (a Warren truss)
  // lateral bracing: struts and X-braces tying the two ribs together
  for (let s=0;s<=n;s+=2){ const k = kA + (kB - kA)*s/n, yt = archY(k), yb = yt - ribD(k);
    bm(at(k, -RIB, yt), at(k, RIB, yt), .4, .4, archM); bm(at(k, -RIB, yb), at(k, RIB, yb), .4, .4, archM);
    if (s + 2 <= n){ const k2 = kA + (kB - kA)*(s + 2)/n; bm(at(k, -RIB, yt), at(k2, RIB, archY(k2)), .25, .25, archM); bm(at(k, RIB, yt), at(k2, -RIB, archY(k2)), .25, .25, archM); } }
  // spandrel columns from the rib (or the canyon wall beyond it) up to the deck, braced in pairs, with a cross-girder under the deck
  for (let k = 1; k <= len - 1; k += 1.5){ const onArch = k > kA + .2 && k < kB - .2;
    const ys = [-1, 1].map(sd => onArch ? archY(k) : gH(k, sd*RIB) - 1);
    if (Math.max(...ys) > DECK_B - 1.2) continue;
    for (const [j, sd] of [[0, -1], [1, 1]]) bm(at(k, sd*RIB, ys[j]), at(k, sd*RIB, DECK_B), .7, .7, onArch ? archM : fasciaM);
    bm(at(k, -RIB - 1.5, DECK_B - .45), at(k, RIB + 1.5, DECK_B - .45), .6, .9, fasciaM);
    const lo = Math.max(...ys); if (DECK_B - lo > 8){ const ym = (lo + DECK_B)/2; bm(at(k, -RIB, ym), at(k, RIB, ym), .3, .3, archM); bm(at(k, -RIB, lo + 1), at(k, RIB, ym), .22, .22, archM); bm(at(k, RIB, lo + 1), at(k, -RIB, ym), .22, .22, archM); } }
  // skewbacks: the concrete blocks each rib foot bears on, set into the canyon walls
  for (const sd of [-1, 1]) for (const k of [kA, kB]){ const p = at(k, sd*RIB, archY(k) - ribD(k)*.5 - 5), f = new THREE.Mesh(new THREE.BoxGeometry(6, 18, 7), footM); f.position.copy(p); f.rotation.y = Math.atan2(T[(i0 + Math.round(k)) % N].x, T[(i0 + Math.round(k)) % N].z); f.castShadow = true; g.add(f); }
  for (const [mat, arr] of BATCH){ const im = new THREE.InstancedMesh(ub, mat, arr.length); arr.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.userData.noSolid = true; g.add(im); }
  // abutments: stepped concrete under each end of the deck, down the canyon rim
  for (const k of [1.5, len - 1.5]){ const p = at(k, 0, 0), yaw = Math.atan2(T[(i0 + Math.round(k)) % N].x, T[(i0 + Math.round(k)) % N].z), gy = Math.min(gH(k, 0), -2);
    for (let j=0;j<3;j++){ const hgt = 8 + j*7, b = new THREE.Mesh(new THREE.BoxGeometry(W + 6 - j*2, hgt, 5 + j*1.5), footM); b.position.set(p.x, DECK_B - hgt/2 + .2 - j*2, p.z); b.rotation.y = yaw; b.castShadow = b.receiveShadow = true; g.add(b); } }
  // portal pylons at both ends of the span: tall steel towers with an amber stripe and a red aircraft light
  for (const k of [2, len - 2]){ const yaw = Math.atan2(T[(i0 + k) % N].x, T[(i0 + k) % N].z);
    for (const sd of [-1, 1]){ const p = at(k, sd*(EDGE + 1.6), 0), Pq = new THREE.Group(); Pq.position.copy(p); Pq.rotation.y = yaw; g.add(Pq);
      const tw = new THREE.Mesh(new THREE.BoxGeometry(1.6, 16, 1.6), archM); tw.position.y = 8 + DECK_B; tw.castShadow = true; Pq.add(tw);
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1, 1.7), amberM); band.position.y = 10; Pq.add(band);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.2, .8, 2.2), fasciaM); cap.position.y = 14 + DECK_B + .4; Pq.add(cap);
      const lt = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5), new THREE.MeshBasicMaterial({ color:0xff3a22 })); lt.position.y = 15.4 + DECK_B; Pq.add(lt); } }
  // crosswind on the bridge: gusts funnel down the gorge and shove everything sideways — mostly one way, with lulls and sudden peaks.
  //    Sand streaks race across the deck and windsocks on the portal towers stand out with the gusts.
  { const side = Math.random() < .5 ? -1 : 1, windT = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.clearRect(0,0,128,128);
      for (let k=0;k<26;k++){ const y = Math.random()*128, w = rnd(20, 70), a = rnd(.2, .6); const gr = x.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,236,200,0)'); gr.addColorStop(.5, `rgba(255,236,200,${a})`); gr.addColorStop(1, 'rgba(255,236,200,0)'); x.fillStyle = gr; x.fillRect(rnd(0, 128 - w), y, w, rnd(1, 2.5)); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
    windT.repeat.set(2, Math.max(2, Math.round(len/3)));
    const wm = new THREE.MeshBasicMaterial({ map:windT, transparent:true, opacity:.5, depthWrite:false }); wm.userData.fx = true;
    const zone = addZone('wind', (i0 + 1)/N, len - 2, -W/2 - 2, W/2 + 2, new THREE.Mesh(stripGeo((i0 + 1) % N, len - 2, -EDGE, EDGE, .12, 1), wm), { dir:side });
    // windsocks on the four portal towers
    const sockT = textTex(64, 16, (x, w, h) => { for (let k=0;k<5;k++){ x.fillStyle = k % 2 ? '#f6f0e6' : '#ff5a2a'; x.fillRect(k*w/5, 0, w/5 + 1, h); } });
    const sockG = new THREE.CylinderGeometry(.25, .55, 3, 10, 1, true); sockG.rotateZ(Math.PI/2); sockG.translate(1.5, 0, 0);
    const socks = []; for (const k of [2, len - 2]) for (const sd of [-1, 1]){ const p = at(k, sd*(EDGE + 1.6), 0), m = new THREE.Mesh(sockG, new THREE.MeshLambertMaterial({ map:sockT, side:THREE.DoubleSide })); m.position.set(p.x, DECK_B + 16.6, p.z); m.userData.noSolid = true; g.add(m); socks.push(m); }
    const wDir = new THREE.Vector3(R[(i0 + (len >> 1)) % N].x*side, 0, R[(i0 + (len >> 1)) % N].z*side), sockYaw = Math.atan2(-wDir.z, wDir.x);
    // little dust twirls spun up by the gusts, skating across the deck with the wind
    const TWL = []; for (let q=0;q<4;q++){ const tw = makeTwister({ h:rnd(6, 9), r0:.5, r1:rnd(2.4, 3.4), bend:1.5, alpha:1.6 }); tw.G.traverse(o => o.userData.noSolid = true); g.add(tw.G); TWL.push({ tw, k:2 + Math.random()*(len - 4), lat:rnd(-W, W), life:rnd(0, 1), v:rnd(.7, 1.2) }); }
    let warnT = 0;
    HAZ.updaters.push((t, dt) => { dt = dt || 1/60;
      for (const q of TWL){ const kk = .55 + 1.1*(Math.max(0, Math.sin(t*.7)) + .45*Math.max(0, Math.sin(t*2.3 + 1)));
        q.lat += side*q.v*(6 + 10*kk)*dt; q.life += dt*.25; if (Math.abs(q.lat) > W/2 + 14 || q.life > 1){ q.lat = -side*(W/2 + rnd(4, 12)); q.k = 2 + Math.random()*(len - 4); q.life = 0; q.v = rnd(.7, 1.2); }
        const p = at(q.k, q.lat, 0), sc = Math.sin(Math.min(1, q.life)*Math.PI)*Math.min(1, kk); q.tw.G.position.set(p.x, -.2, p.z); q.tw.G.scale.set(sc, sc*(.8 + .2*kk), sc); q.tw.G.visible = sc > .05; q.tw.update(t, dt); }
      const gust = Math.max(0, Math.sin(t*.7)) + .45*Math.max(0, Math.sin(t*2.3 + 1)) + .25*Math.sin(t*5.1);
      const k = .55 + 1.1*gust;                                                // 0.3× … 2× the base push of a wind field
      zone.dir = side*k; wm.opacity = .25 + .35*Math.min(1, k); windT.offset.x -= dt*(1.5 + 2.5*k)*side;
      for (const m of socks){ m.rotation.y = sockYaw + Math.sin(t*9 + m.position.x)*.15/(.4 + k); m.rotation.z = -.9*(1 - Math.min(1, k)) + Math.sin(t*13 + m.position.z)*.06; m.scale.x = .55 + .45*Math.min(1, k); }
      if (Math.random() < dt*(8 + 22*k)){ const j = (i0 + 1 + Math.floor(Math.random()*(len - 2))) % N, lat = -side*rnd(W/2, W/2 + 6);
        sandCloudFx.emit(P[j].x + R[j].x*lat, rnd(.3, 3), P[j].z + R[j].z*lat, wDir.x*rnd(18, 34)*k, rnd(-.5, 1.5), wDir.z*rnd(18, 34)*k, rnd(2, 5), rnd(1, 2)); }
      warnT -= dt; if (state === 'race' && warnT <= 0){ const pl = player, di = (pl.idx - i0 + N) % N; if (di < len && !(pl.air || pl.airT > 0)){ showToast('Crosswind!', 900); warnT = 6; } } }); }
  // nothing generic floats off the edge of the deck: every trackside marker over the drop (studs, posts, flags, boards) is left out
  tidyOffDeck(i0, len, EDGE);
  // 4. a sandfall pouring over the canyon rim beside the bridge, and sand flowing along the canyon floor
  const flowMats = [];
  { const cy = MOJ.canyon; let mi = 3, fsd = 1, bestD = -1, bestT = 0;        // the spot on either rim that is farthest from any road: the sandfall never stands beside the track
    for (let k=1;k<cy.length - 2;k++){ const p = cy[k], q = cy[k + 1], l = Math.hypot(q.x - p.x, q.z - p.z) || 1;   // searched along every segment, not just at the few control points
      for (let t = 0; t < 1; t += 1/12) for (const sd of [-1, 1]){ const cx = p.x + (q.x - p.x)*t, cz = p.z + (q.z - p.z)*t, x = cx - (q.z - p.z)/l*MOJ.cw*sd, z = cz + (q.x - p.x)/l*MOJ.cw*sd;
        if (Math.hypot(x - C.x, z - C.z) > 720) continue; const dd = distTrack(x, z); if (dd > bestD){ bestD = dd; mi = k; fsd = sd; bestT = t; } } }
    const a0 = cy[mi], b0 = cy[mi + 1], a = { x: a0.x + (b0.x - a0.x)*bestT, z: a0.z + (b0.z - a0.z)*bestT }, b = { x: a.x + (b0.x - a0.x), z: a.z + (b0.z - a0.z) };
    const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz), nx = -tz/tl, nz = tx/tl;
    const fallT = streakTex('235,200,150'), fallM = new THREE.MeshLambertMaterial({ map:fallT, transparent:true, opacity:.9, depthWrite:false, side:THREE.DoubleSide, color:0xf0d0a0, emissive:0x5a3a20 }); fallM.userData.fx = true; flowMats.push({ t:fallT, v:-.9 });
    const fallT2 = streakTex('250,225,185'), fallM2 = new THREE.MeshLambertMaterial({ map:fallT2, transparent:true, opacity:.55, depthWrite:false, side:THREE.DoubleSide, color:0xfff0d0, emissive:0x6a4a2a }); fallM2.userData.fx = true; flowMats.push({ t:fallT2, v:-1.4 });
    // the curtain is 38 m wide: narrow it to keep its lip clear of the road (it was spilling across the deck and through passing cars)
    const clearAt = w => { const ex = a.x + nx*(MOJ.cw - 2)*fsd, ez = a.z + nz*(MOJ.cw - 2)*fsd, ux = tx/tl, uz = tz/tl;   // every corner of the curtain and of the sand slide on the lip
      for (const s of [-1, 0, 1]) for (const o of [-1.5, 4 - 5, 4, 4 + 5]){ const x = ex + ux*s*w/2 + nx*fsd*o, z = ez + uz*s*w/2 + nz*fsd*o; if (distTrack(x, z) < W/2 + 3) return false; } return true; };
    MOJ.fall = null; let wFit = 38; while (wFit >= 14 && !clearAt(wFit)) wFit -= 2;
    for (const sd of (wFit >= 14 ? [fsd] : [])){ const ex = a.x + nx*(MOJ.cw - 2)*sd, ez = a.z + nz*(MOJ.cw - 2)*sd, w = wFit, Hh = MOJ.depth + 4;
      // a curtain that pours over the lip in an arc, then drops straight: shaped, not a flat card; a looser veil in front of it
      const curtain = (mat, bulge, wid, seed) => { const ge = new THREE.PlaneGeometry(wid, Hh, 16, 24), pa = ge.attributes.position;
        for (let i=0;i<pa.count;i++){ const x = pa.getX(i), y = pa.getY(i), t = (Hh/2 - y)/Hh, out = bulge*Math.sqrt(Math.min(1, t*5)) + Math.sin(x*.35 + seed)*1.2*t + t*t*3;
          pa.setXYZ(i, x*(1 + t*.25), y, out); }
        ge.computeVertexNormals(); const m = new THREE.Mesh(ge, mat); m.position.set(ex - nx*sd*1.5, -Hh/2 + 2, ez - nz*sd*1.5); m.rotation.y = Math.atan2(-nx*sd, -nz*sd); m.userData.noSolid = true; g.add(m); return m; };
      curtain(fallM, 5, w, 0); curtain(fallM2, 8, w*1.15, 2);
      const lipG = new THREE.PlaneGeometry(w, 10, 16, 4), lp = lipG.attributes.position; for (let i=0;i<lp.count;i++){ const y = lp.getY(i); lp.setZ(i, (y + 5)*(y + 5)*-.12); }   // sand sliding to the edge
      const lip = new THREE.Mesh(lipG, fallM); lip.position.set(ex + nx*sd*4, .7, ez + nz*sd*4); lip.rotation.set(-Math.PI/2 + .12, 0, 0); lip.rotation.order = 'YXZ'; lip.rotation.y = Math.atan2(-nx*sd, -nz*sd); lip.userData.noSolid = true; g.add(lip);
      MOJ.fall = { x:ex - nx*sd*8, z:ez - nz*sd*8, nx:-nx*sd, nz:-nz*sd, w }; }
    // the floor river
    const pts = [], uvs = [], idx = []; for (let k=0;k<cy.length;k++){ const p = cy[k], q = cy[Math.min(cy.length - 1, k + 1)], r0 = cy[Math.max(0, k - 1)], dx = q.x - r0.x, dz = q.z - r0.z, l = Math.hypot(dx, dz) || 1, wx = -dz/l, wz = dx/l, wid = 9;
      pts.push(p.x - wx*wid, -MOJ.depth + .6, p.z - wz*wid, p.x + wx*wid, -MOJ.depth + .6, p.z + wz*wid); uvs.push(0, k*.25, 1, k*.25); if (k < cy.length - 1){ const a2 = k*2; idx.push(a2, a2+1, a2+2, a2+1, a2+3, a2+2); } }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); rg.setIndex(idx); rg.computeVertexNormals();
    const rT2 = streakTex('245,215,165'), riverM = new THREE.MeshLambertMaterial({ map:rT2, transparent:true, opacity:.9, depthWrite:false, color:0xe8c290 }); flowMats.push({ t:rT2, v:-.35 });
    g.add(new THREE.Mesh(rg, riverM)); }
  // 5. sandstone arches — one spans the road — and hoodoo spires
  const ssT = sandstoneTex(), ssM = new THREE.MeshLambertMaterial({ map:ssT });
  // natural rock arches: chunky, uneven blocks laid along a lopsided curve, a flat slab on top, legs that splay into the ground
  const rockBox = new THREE.BoxGeometry(1, 1, 1);
  const arch = (x, z, yaw, span, h, thick) => { const gy = Math.min(0, mojaveH(x, z)); const A = new THREE.Group(); A.position.set(x, gy, z); A.rotation.y = yaw; g.add(A);
    const n = 14, lean = rnd(-.15, .15);
    for (let k=0;k<=n;k++){ const u = k/n, a = Math.PI*(1 - u), px = Math.cos(a)*span/2, py = Math.sin(a)*h*(1 + lean*(u - .5)) + (k === 0 || k === n ? 0 : 0);
      const th = thick*(.75 + .5*Math.pow(Math.abs(u - .5)*2, 1.5))*rnd(.85, 1.15), b = new THREE.Mesh(rockBox, ssM);
      b.position.set(px + rnd(-.4,.4), py, rnd(-.6,.6)); b.rotation.z = a - Math.PI/2 + rnd(-.12,.12); b.rotation.y = rnd(-.08,.08); b.scale.set(span/n*1.55, th, thick*rnd(1.4, 2)); A.add(b); }
    const top = new THREE.Mesh(rockBox, ssM); top.position.set(rnd(-2,2), h + thick*.35, 0); top.scale.set(span*.42, thick*.7, thick*2.1); top.rotation.z = rnd(-.05,.05); A.add(top);
    for (const sd of [-1, 1]){ for (let j=0;j<3;j++){ const leg = new THREE.Mesh(rockBox, ssM); leg.position.set(sd*(span/2 + j*.6*sd*0), -j*3 - 1, rnd(-.5,.5)); leg.scale.set(thick*(1.6 + j*.5), 5, thick*(2 + j*.4)); leg.rotation.y = rnd(-.2,.2); A.add(leg); } }
    A.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } }); return A; };
  { const f = .14 + rnd(0, .04), p = atTrack(f, 0); MOJ.gate = f; arch(p.x, p.z, p.h, W + 24, rnd(17, 21), 3.6); }   // the gateway arch over the road: it spans across the road
  for (let k=0;k<6;k++){ for (let t=0;t<30;t++){ const a = Math.random()*Math.PI*2, d = rnd(80, 640), x = C.x + Math.cos(a)*d, z = C.z + Math.sin(a)*d, sp = rnd(30, 64);
      if (distTrack(x, z) < sp/2 + 20 || distCanyon(x, z).d < MOJ.cw + 20) continue; arch(x, z, Math.random()*6, sp, sp*rnd(.5, .75), sp*rnd(.08, .12)); break; } }
  // buttes and chimney rocks: stacks of blocks, flat-topped, stepping in as they rise
  const butte = (x, z, s) => { const gy = mojaveH(x, z) - 1, G = new THREE.Group(); G.position.set(x, gy, z); G.rotation.y = Math.random()*6; g.add(G);
    let y = 0, w = rnd(7, 11)*s, dpt = w*rnd(.6, 1); const tiers = 3 + Math.random()*3|0;
    for (let k=0;k<tiers;k++){ const hh = rnd(6, 12)*s*(k === tiers - 1 ? .7 : 1), b = new THREE.Mesh(rockBox, ssM); b.position.set(rnd(-.8,.8)*s, y + hh/2, rnd(-.8,.8)*s); b.scale.set(w, hh, dpt); b.rotation.y = rnd(-.15,.15); b.castShadow = true; G.add(b);
      y += hh; w *= rnd(.62, .88); dpt *= rnd(.62, .9); if (w < 1.6*s) break; }
    return G; };
  let hn = 0; for (let t=0;t<500 && hn<40;t++){ const a = Math.random()*Math.PI*2, d = rnd(60, 720), x = C.x + Math.cos(a)*d, z = C.z + Math.sin(a)*d; if (distTrack(x, z) < 30 || distCanyon(x, z).d < MOJ.cw + 12) continue;
    const k = 1 + Math.random()*3|0, s0 = rnd(.8, 1.6)*(d > 320 ? 1.5 : 1); for (let j=0;j<k;j++){ butte(x + rnd(-14,14)*s0, z + rnd(-14,14)*s0, s0*rnd(.6, 1.1)); hn++; } }
  // low rock shelves at the roadside, like the slabs in the foreground of a postcard
  for (let t=0;t<60;t++){ const i = (Math.random()*N)|0, sd = Math.random() < .5 ? -1 : 1, lat = sd*rnd(W/2 + 8, W/2 + 22), x = P[i].x + R[i].x*lat, z = P[i].z + R[i].z*lat;
    if (distTrack(x, z) < W/2 + 6 || distCanyon(x, z).d < MOJ.cw + 4) continue; const sl = new THREE.Mesh(rockBox, ssM); const w = rnd(4, 10);
    sl.position.set(x, rnd(.3, .9), z); sl.scale.set(w, rnd(.8, 2.2), w*rnd(.5, .9)); sl.rotation.set(rnd(-.08,.08), Math.random()*6, rnd(-.08,.08)); sl.castShadow = sl.receiveShadow = true; g.add(sl); }
  // 6. desert scrub and fallen rock, sitting on the dunes
  const scrubG = new THREE.ConeGeometry(.5, 2.2, 4); scrubG.translate(0, 1.1, 0);
  const scrub = new THREE.InstancedMesh(scrubG, new THREE.MeshLambertMaterial({ color:0x6f7a3c }), 900); let sn = 0;
  while (sn < 900){ const a = Math.random()*Math.PI*2, d = 25 + Math.random()*700, cx = C.x + Math.cos(a)*d, cz = C.z + Math.sin(a)*d; const dt = distTrack(cx, cz); if (dt < W/2 + 6) continue; const h = mojaveH(cx, cz, dt); if (h < -2) continue;
    for (let j=0;j<6 && sn<900;j++){ const s = rnd(.4, 1.1); o.position.set(cx + rnd(-1.2,1.2), h - .1, cz + rnd(-1.2,1.2)); o.rotation.set(rnd(-.9,.9), Math.random()*6, rnd(-.9,.9)); o.scale.set(s, s*rnd(.7,1.4), s); o.updateMatrix(); scrub.setMatrixAt(sn++, o.matrix); } }
  scrub.userData.soft = true; g.add(scrub);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color:0xa76a43 }), 260); let rn = 0;
  while (rn < 260){ const a = Math.random()*Math.PI*2, d = 30 + Math.random()*720, x = C.x + Math.cos(a)*d, z = C.z + Math.sin(a)*d, dt = distTrack(x, z); if (dt < W/2 + 10) continue; const s = .6 + Math.pow(Math.random(), 3)*5;
    o.position.set(x, mojaveH(x, z, dt) + s*.2, z); o.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3); o.scale.set(s, s*rnd(.5, 1), s*rnd(.8, 1.3)); o.updateMatrix(); rocks.setMatrixAt(rn++, o.matrix); }
  rocks.castShadow = rocks.receiveShadow = true; g.add(rocks);
  // mesas far out, as before
  const mesaMat = new THREE.MeshLambertMaterial({ color:0xb35f3c }), mesaCap = new THREE.MeshLambertMaterial({ color:0xcf8a58 });
  for (let i=0;i<20;i++){ const a = i/20*Math.PI*2 + Math.random()*.2, d = TRACK_R + 620 + Math.random()*450, r = 50 + Math.random()*90, h = 40 + Math.random()*90;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r*1.35, h, 7), mesaMat); m.position.set(Math.cos(a)*d + C.x, h/2 - 1, Math.sin(a)*d + C.z); m.rotation.y = Math.random()*3; g.add(m);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r*.98, r, h*.12, 7), mesaCap); cap.position.set(m.position.x, h*.97 - 1, m.position.z); cap.rotation.y = m.rotation.y; g.add(cap); }
  // 6b. the skyline: three painted bands of mesas and buttes, each paler with distance (they ignore the fog — the haze is painted in)
  const skyBand = (rad, hgt, col, seed, alphaTop) => { const c = document.createElement('canvas'); c.width = 2048; c.height = 256; const x = c.getContext('2d'); x.clearRect(0,0,2048,256);
    x.fillStyle = col; x.beginPath(); x.moveTo(0, 256); let px = 0, y = 256*rnd(.55, .8);
    while (px < 2048){ const kind = Math.random(); if (kind < .35){ const w = rnd(60, 220), top = 256*rnd(.25, .55); x.lineTo(px + rnd(8, 20), top); x.lineTo(px + w, top + rnd(-6, 6)); px += w + rnd(8, 20); x.lineTo(px, 256*rnd(.6, .85)); }   // flat-topped mesa
      else if (kind < .5){ const w = rnd(14, 34), top = 256*rnd(.12, .4); x.lineTo(px + 4, top); x.lineTo(px + w, top); px += w + 4; x.lineTo(px, 256*rnd(.6, .85)); }   // a lone butte
      else { px += rnd(30, 90); x.lineTo(px, 256*rnd(.62, .86)); } }                                                                                       // low ridge
    x.lineTo(2048, 256); x.closePath(); x.fill();
    const g2 = x.createLinearGradient(0, 0, 0, 256); g2.addColorStop(0, 'rgba(255,240,215,0)'); g2.addColorStop(.6, `rgba(240,215,175,${alphaTop})`); g2.addColorStop(1, 'rgba(236,210,162,.6)'); x.globalCompositeOperation = 'source-atop'; x.fillStyle = g2; x.fillRect(0, 0, 2048, 256);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.x = 2; t.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, hgt, 64, 1, true), new THREE.MeshBasicMaterial({ map:t, transparent:true, side:THREE.BackSide, fog:false, depthWrite:false }));
    m.position.set(C.x, hgt/2 - 6, C.z); m.rotation.y = seed; m.renderOrder = -1; g.add(m); };
  skyBand(3000, 430, '#c79c86', 0, .42); skyBand(2650, 330, '#b47c5c', 1.7, .28); skyBand(2300, 240, '#9a5f3e', 3.1, .16);
  // dust plumes billowing up off the far basin
  const plumeT = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    for (let i=0;i<26;i++){ const px = rnd(30, 98), py = rnd(25, 110), r = rnd(14, 34), gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(214,180,135,.55)'); gr.addColorStop(1, 'rgba(214,180,135,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); }
    return new THREE.CanvasTexture(c); })();
  const PLUMES = [];
  for (let i=0;i<9;i++){ const a = rnd(0, 6.28), d = rnd(1300, 2100), sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:plumeT, transparent:true, opacity:rnd(.5, .8), depthWrite:false, fog:false }));
    const s0 = rnd(380, 700); sp.scale.set(s0, s0*rnd(.7, 1.1), 1); sp.position.set(C.x + Math.cos(a)*d, s0*.32, C.z + Math.sin(a)*d); g.add(sp); PLUMES.push({ sp, a, d, v:rnd(.004, .01) }); }
  // a big twister on the horizon, like the one in the poster
  { const tw = makeTwister({ h:720, r0:30, r1:210, bend:110, fog:.25, fogC:0xe9cfa0 }), a = rnd(0, 6.28); tw.G.position.set(C.x + Math.cos(a)*1700, -10, C.z + Math.sin(a)*1700); g.add(tw.G); MOJ.bigDev = { m:tw.G, tw, a }; }
  // 7. the road: a hot amber line glowing along both edges, and black-and-yellow chevron boards on the bends
  const edgeM = new THREE.MeshBasicMaterial({ color:0xffb43a });
  for (const sd of [-1, 1]) g.add(new THREE.Mesh(stripGeo(0, N, sd*(W/2 - .1) - .32, sd*(W/2 - .1) + .32, .075, 1), edgeM));
  const chevT = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#16120e'; x.fillRect(0,0,256,64); x.fillStyle = '#f5c21c';
    for (let i=0;i<4;i++){ const x0 = 22 + i*58; x.beginPath(); x.moveTo(x0, 10); x.lineTo(x0 + 22, 32); x.lineTo(x0, 54); x.lineTo(x0 + 14, 54); x.lineTo(x0 + 36, 32); x.lineTo(x0 + 14, 10); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; })();
  const chevM = new THREE.MeshLambertMaterial({ map:chevT }), backM = new THREE.MeshLambertMaterial({ color:0x16120e });
  for (let i=0;i<N;i+=4){ const turn = wrapA(Math.atan2(T[(i + 10) % N].x, T[(i + 10) % N].z) - Math.atan2(T[i].x, T[i].z)); if (Math.abs(turn) < .32 || (i % 12)) continue;
    const sd = turn > 0 ? -1 : 1, j = (i + 6) % N, px = P[j].x + R[j].x*(W/2 + 4)*sd, pz = P[j].z + R[j].z*(W/2 + 4)*sd;           // on the outside of the bend, facing the oncoming cars
    const b = new THREE.Mesh(new THREE.PlaneGeometry(3.6, .9), chevM), bk = new THREE.Mesh(new THREE.PlaneGeometry(3.6, .9), backM), yaw = Math.atan2(-T[j].x, -T[j].z);
    b.position.set(px, 1.2, pz); b.rotation.y = yaw; bk.position.copy(b.position); bk.rotation.y = yaw + Math.PI; g.add(b); g.add(bk);
    if (sd*turn < 0) b.scale.x = -1; }
  // 8. dust devils wandering the basin
  MOJ.devils = [];
  for (let k=0;k<2;k++){ const tw = makeTwister({ h:rnd(70, 90), r0:3.2, r1:rnd(20, 26), grit:22 }), m = tw.G; m.userData.noSolid = true; m.traverse(x => x.userData.noSolid = true); g.add(m); const a = Math.random()*6, d = rnd(120, 360); MOJ.devils.push({ m, tw, x:C.x + Math.cos(a)*d, z:C.z + Math.sin(a)*d, hx:0, hz:0, t:0, hitT:0 }); }
  // 9. everything that moves
  HAZ.updaters.push((t, dt) => { dt = dt || 1/60;
    for (const f of flowMats) f.t.offset.y = (f.t.offset.y + f.v*dt) % 1;
    // the sandfall throws a haze off its foot
    if (MOJ.fall && Math.random() < dt*10){ const F = MOJ.fall; sandCloudFx.emit(F.x + rnd(-F.w/2, F.w/2)*F.nz, -MOJ.depth + rnd(0, 6), F.z - rnd(-F.w/2, F.w/2)*F.nx, F.nx*rnd(2, 6), rnd(2, 6), F.nz*rnd(2, 6), rnd(10, 22), rnd(3, 5)); }
    // dust blowing across the far basin
    if (Math.random() < dt*6){ const a = Math.random()*6.28, d = rnd(200, 700); sandCloudFx.emit(C.x + Math.cos(a)*d, rnd(2, 20), C.z + Math.sin(a)*d, 9, rnd(0, 1.5), 3, rnd(40, 90), rnd(6, 10)); }
    // dust devils: drift on a slow random heading, turn back toward the road now and then, spin, pick up dust, shove whoever they catch
    for (const D of MOJ.devils){ D.t -= dt; if (D.t <= 0){ D.t = rnd(5, 10); const toward = Math.random() < .6, i = (Math.random()*N)|0, tx = toward ? P[i].x : C.x + rnd(-500, 500), tz = toward ? P[i].z : C.z + rnd(-500, 500), l = Math.hypot(tx - D.x, tz - D.z) || 1; D.hx = (tx - D.x)/l*rnd(5, 9); D.hz = (tz - D.z)/l*rnd(5, 9); }
      D.x += D.hx*dt; D.z += D.hz*dt; if (Math.hypot(D.x - C.x, D.z - C.z) > 700){ D.hx = (C.x - D.x)*.01; D.hz = (C.z - D.z)*.01; }
      const gy = mojaveH(D.x, D.z); D.m.position.set(D.x, gy - 1, D.z); D.tw.update(t, dt);
      if (Math.random() < .7){ const a = Math.random()*6.28, rr = rnd(2, 10), y = rnd(0, 40); sandCloudFx.emit(D.x + Math.cos(a)*rr*(1 + y/30), gy + y, D.z + Math.sin(a)*rr*(1 + y/30), -Math.sin(a)*12, rnd(3, 8), Math.cos(a)*12, rnd(4, 10)*(1 + y/30), rnd(1, 2)); }
      if (Math.random() < .3) emit(D.x + rnd(-3,3), gy + .5, D.z + rnd(-3,3), rnd(-6,6), rnd(2,6), rnd(-6,6), rnd(2, 4), rnd(.8, 1.4));
      if (state === 'race') for (const c of cars){ if (c.air || c.airT > 0) continue; const dx = c.x - D.x, dz = c.z - D.z, d = Math.hypot(dx, dz); if (d > 15) continue;
        const k = (1 - d/15)*(c.prof.home === world.id ? .5 : 1), tx2 = -dz/(d||1), tz2 = dx/(d||1);
        c.vx += (tx2*34 - dx/(d||1)*8)*k*dt; c.vz += (tz2*34 - dz/(d||1)*8)*k*dt; c.vx *= 1 - .5*k*dt; c.vz *= 1 - .5*k*dt;
        if (c.player && D.hitT <= 0){ D.hitT = 3; showToast('Dust devil!', 900); addShake(.35); } }
      D.hitT -= dt; }
    for (const pl of PLUMES){ pl.a += pl.v*dt; pl.sp.position.x = C.x + Math.cos(pl.a)*pl.d; pl.sp.position.z = C.z + Math.sin(pl.a)*pl.d; pl.sp.material.rotation += dt*.01; }
    if (MOJ.bigDev){ const B = MOJ.bigDev; B.tw.update(t, dt); B.a += dt*.004; B.m.position.x = C.x + Math.cos(B.a)*1700; B.m.position.z = C.z + Math.sin(B.a)*1700;
      if (Math.random() < dt*20) sandCloudFx.emit(B.m.position.x + rnd(-60, 60), rnd(0, 120), B.m.position.z + rnd(-60, 60), rnd(-20,20), rnd(4, 14), rnd(-20,20), rnd(60, 140), rnd(4, 7)); }
    sandCloudFx.update(dt);
  });
}
/* ---------- Glacier Spire: a snowfield cut by an ice crevasse, under a pastel sky with a ringed planet and moons ----------
   The ground is sculpted like the Mojave: snow drifts and stepped ice shelves away from the road, and a deep crevasse with
   sheer columnar ice walls and frozen falls cuts across the circuit; the road crosses it on a steel truss bridge hung with
   icicles. Inverted ice islands float overhead, some carrying energy spires with glowing rings; ice blocks, crystal shards,
   arches and frosted shrubs line the way, and snow drifts down all the time. */
const GLA = { canyon:[], canyons:[], cw:26, depth:70, bridge:-1 };
function glacierH(x, z, dt){
  const C = TRACK_C, r = Math.hypot(x - C.x, z - C.z);
  if (dt === undefined) dt = distTrack(x, z);
  const A = clamp((dt - 22)/70, 0, 1)*(1 - clamp((r - 660)/220, 0, 1));
  const n1 = mNoise(x/150, z/150), n2 = mNoise(x/48 + 9, z/48 - 4), ridge = 1 - Math.abs(2*mNoise(x/95 - 3, z/130 + 7) - 1);
  const drifts = 7*n1 + 5*ridge*ridge + 2.5*n2 - 3;                                      // wind-packed snow
  // ice shelves: flat-topped benches with sheer edges, stepping up in tall tiers
  const mask = clamp((mNoise(x/280 + 21, z/280 - 15) - .5)/.08, 0, 1), tv = (mNoise(x/120 - 17, z/120 + 13)*.75 + n2*.25)*52, tstep = Math.floor(tv/13)*13 + 13*clamp((tv % 13 - 11.6)/1.4, 0, 1);
  let h = A*(drifts*(1 - mask) + (tstep + 2)*mask);
  for (const cy of GLA.canyons){ const { d } = distPoly(cy.pts, x, z), w = cy.w + (mNoise(x/35, z/35) - .5)*7;
    h *= clamp((d - w)/26, 0, 1);                                                             // a flat lip before the drop
    if (d < w){ const k = clamp((w - d)/4.5, 0, 1); h = Math.min(h, -cy.depth*k); } }          // near-vertical walls
  return h;
}
function iceTex(){ const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#f2fbff'); g.addColorStop(.25, '#bfe3fa'); g.addColorStop(.7, '#86bfe8'); g.addColorStop(1, '#5d97cf'); x.fillStyle = g; x.fillRect(0, 0, 64, 256);
  for (let i=0;i<26;i++){ x.fillStyle = `rgba(255,255,255,${rnd(.12,.45)})`; x.fillRect(Math.random()*64, Math.random()*256, rnd(1,3), rnd(30,160)); }
  for (let i=0;i<10;i++){ x.strokeStyle = `rgba(40,90,150,${rnd(.15,.35)})`; x.lineWidth = 1; x.beginPath(); let px = Math.random()*64, py = Math.random()*256; x.moveTo(px, py); for (let k=0;k<4;k++){ px += rnd(-10,10); py += rnd(-30,30); x.lineTo(px, py); } x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; return t; }
const snowPuffFx = makeFx(0xf4f9ff, 500, false, -0.05);
function glacierWorks(g){
  const C = TRACK_C, o = new THREE.Object3D();
  // 1. the crevasse: crosses the circuit square-on at a long straight, well clear of the Ice Bridge cut, wandering off both ways
  const cutD = (x, z) => { if (!CUT) return 1e9; const ax = CUT.A.x, az = CUT.A.z, bx = CUT.B.x, bz = CUT.B.z, l2 = (bx-ax)**2 + (bz-az)**2, t = clamp(((x-ax)*(bx-ax) + (z-az)*(bz-az))/l2, 0, 1); return Math.hypot(x - (ax + (bx-ax)*t), z - (az + (bz-az)*t)); };
  let bi = 0, best = -1e9; for (let i=0;i<N;i++){ const s = T[i].dot(T[(i + 16) % N]) + T[i].dot(T[(i - 16 + N) % N]) + Math.min(1, cutD(P[i].x, P[i].z)/200); if (s > best){ best = s; bi = i; } }
  GLA.bridge = bi;
  { const B = P[bi], rr = R[bi], tt = T[bi], ph = rnd(0, 6), side = [];
    for (const sd of [-1, 1]){ const pts = []; for (let k=0;k<80;k++){ const s = k*9*sd, wob = 45*Math.sin(Math.abs(s)/110 + ph*sd)*clamp((Math.abs(s) - 34)/80, 0, 1);
        const x = B.x + rr.x*s + tt.x*wob, z = B.z + rr.z*s + tt.z*wob; if (Math.hypot(x - C.x, z - C.z) > 780) break;
        if (cutD(x, z) < GLA.cw + 26) break;
        if (Math.abs(s) > 40){ let near = false; for (let i=0;i<N;i+=3){ const di = Math.min((i - bi + N) % N, (bi - i + N) % N); if (di < 32) continue; if (Math.hypot(P[i].x - x, P[i].z - z) < GLA.cw + W/2 + 30){ near = true; break; } } if (near) break; }
        pts.push({ x, z }); } side.push(pts); }
    GLA.canyon = [...side[0].reverse(), ...side[1].slice(1)];
    GLA.canyons = [{ pts:GLA.canyon, w:GLA.cw, depth:GLA.depth }]; }
  // 2. the ground: snow, blue in the hollows; the crevasse walls glassy blue, darkening with depth
  const gT = noiseTex(world.ground[0], world.ground[1], 256, world.ground[2]); gT.repeat.set(90, 90);
  const SZ = 1800, SEG = 240, geo = new THREE.PlaneGeometry(SZ, SZ, SEG, SEG); geo.rotateX(-Math.PI/2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count*3);
  for (let i=0;i<pos.count;i++){ const x = pos.getX(i) + C.x, z = pos.getZ(i) + C.z, h = glacierH(x, z); pos.setY(i, h); }
  geo.computeVertexNormals();
  { const nr = geo.attributes.normal;
    for (let i=0;i<pos.count;i++){ const ny = nr.getY(i), y = pos.getY(i); let c;
      if (y < -1.5){ const k = clamp(-y/GLA.depth, 0, 1), wall = clamp((.92 - ny)/.45, 0, 1), blue = [.62 - .3*k, .8 - .25*k, .98 - .1*k], fl = [.86, .93, 1.02];
        c = [fl[0] + (blue[0] - fl[0])*wall, fl[1] + (blue[1] - fl[1])*wall, fl[2] + (blue[2] - fl[2])*wall]; }   // sheer blue ice walls, packed snow on the floor
      else if (ny < .8){ const k = clamp((.8 - ny)/.4, 0, 1); c = [1 - .38*k, 1 - .2*k, 1.02]; }                                               // shelf cliffs: blue ice shows through
      else { const hol = clamp(-y/4, 0, 1)*.06; c = [1 - hol*1.4, 1 - hol*.6, 1.02]; }
      cols[i*3] = c[0]; cols[i*3+1] = c[1]; cols[i*3+2] = c[2]; } }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map:gT, vertexColors:true })); ground.position.set(C.x, 0, C.z); ground.receiveShadow = true; g.add(ground);
  const rT = gT.clone(); rT.needsUpdate = true; rT.repeat.set(300, 300);
  const ring = new THREE.Mesh(new THREE.RingGeometry(860, 3200, 72, 1), new THREE.MeshLambertMaterial({ map:rT, color:0xf4f8ff })); ring.rotation.x = -Math.PI/2; ring.position.set(C.x, -.3, C.z); ring.receiveShadow = true; g.add(ring);
  const iT = iceTex(), iceM = new THREE.MeshLambertMaterial({ map:iT, emissive:0x1d4a78, emissiveIntensity:.18 }), snowM = new THREE.MeshLambertMaterial({ color:0xfbfdff });
  const glowIceM = new THREE.MeshStandardMaterial({ color:0xbfe8ff, roughness:.15, metalness:.05, emissive:0x3a9ad8, emissiveIntensity:.45, transparent:true, opacity:.9 });
  const icicleG = new THREE.ConeGeometry(.5, 1, 5); icicleG.rotateX(Math.PI); icicleG.translate(0, -.5, 0);         // hangs down from y=0
  const ICI = []; const icicle = (x, y, z, len, w) => ICI.push([x, y, z, len, w || len*.12]);
  // 3. columnar ice walls: tall prisms standing against the crevasse walls, frozen falls in between
  { const colG = new THREE.CylinderGeometry(1, 1.1, 1, 6); colG.translate(0, .5, 0);
    const cols2 = new THREE.InstancedMesh(colG, iceM, 520); let n = 0;
    for (const cy of GLA.canyons){ const pts = cy.pts; for (let k=0;k<pts.length-1 && n < 520;k++){ const a = pts[k], b = pts[k+1], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz/l, nz = dx/l;
        for (const sd of [-1, 1]) for (let j=0;j<2 && n < 520;j++){ const u = Math.random(), off = cy.w - rnd(.2, 1.6), x = a.x + dx*u + nx*off*sd, z = a.z + dz*u + nz*off*sd;
          if (distTrack(x, z) < W/2 + 8) continue; const top = glacierH(x + nx*sd*6, z + nz*sd*6), r = rnd(1.2, 2.6), hgt = (Math.min(top, 0) + cy.depth)*rnd(.6, .97);
          o.position.set(x, -cy.depth, z); o.rotation.set(rnd(-.03,.03), Math.random()*6, rnd(-.03,.03)); o.scale.set(r, Math.max(4, hgt), r*rnd(.8, 1.2)); o.updateMatrix(); cols2.setMatrixAt(n++, o.matrix);
          if (Math.random() < .25) icicle(x - nx*sd*r, -cy.depth + hgt, z - nz*sd*r, rnd(2, 6)); } } }
    cols2.count = n; cols2.castShadow = cols2.receiveShadow = true; g.add(cols2); }
  const flowMats = [];
  { const cy = GLA.canyon, mi = Math.max(2, Math.min(cy.length - 3, cy.findIndex(p => Math.hypot(p.x - P[bi].x, p.z - P[bi].z) < 12) + 7));
    const fallT = streakTex('235,248,255'), fallM = new THREE.MeshLambertMaterial({ map:fallT, transparent:true, opacity:.95, depthWrite:false, side:THREE.DoubleSide, color:0xd6efff, emissive:0x2a5a8a }); flowMats.push({ t:fallT, v:-.12 });
    for (const [k, sd] of [[mi, 1], [Math.max(2, mi - 14), -1], [Math.min(cy.length - 3, mi + 18), -1]]){ const a = cy[k], b = cy[k + 1]; if (!a || !b) continue; const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1, nx = -tz/tl, nz = tx/tl;
      const ex = a.x + nx*(GLA.cw - 3)*sd, ez = a.z + nz*(GLA.cw - 3)*sd, w = rnd(22, 34);
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(w, GLA.depth + 2, 1, 1), fallM); fall.position.set(ex - nx*sd*2.5, -GLA.depth/2, ez - nz*sd*2.5); fall.rotation.y = Math.atan2(nx*sd, nz*sd); g.add(fall);
      for (let j=0;j<10;j++){ const u = rnd(-.5, .5)*w; icicle(ex - nx*sd*3 + tz/tl*u, rnd(-1, .5), ez - nz*sd*3 - tx/tl*u, rnd(4, 12), rnd(.5, 1.2)); } } }
  // a frozen river on the crevasse floor
  { const cy = GLA.canyon, pts = [], uvs = [], idx = []; for (let k=0;k<cy.length;k++){ const p = cy[k], q = cy[Math.min(cy.length - 1, k + 1)], r0 = cy[Math.max(0, k - 1)], dx = q.x - r0.x, dz = q.z - r0.z, l = Math.hypot(dx, dz) || 1, wx = -dz/l, wz = dx/l, wid = 10;
      pts.push(p.x - wx*wid, -GLA.depth + .4, p.z - wz*wid, p.x + wx*wid, -GLA.depth + .4, p.z + wz*wid); uvs.push(0, k*.25, 1, k*.25); if (k < cy.length - 1){ const a2 = k*2; idx.push(a2, a2+1, a2+2, a2+1, a2+3, a2+2); } }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); rg.setIndex(idx); rg.computeVertexNormals();
    g.add(new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color:0x9fd2f2, roughness:.08, metalness:.1, emissive:0x2a6aa0, emissiveIntensity:.25 }))); }
  // 4. the bridge: a dark steel truss slung under a slab deck, two raking struts down to the walls, a cyan-lit guardrail, icicles everywhere
  const deckM = new THREE.MeshLambertMaterial({ color:0x3a4656, side:THREE.DoubleSide }), fasciaM = new THREE.MeshLambertMaterial({ color:0x2a3442, side:THREE.DoubleSide }),
    cyanM = new THREE.MeshLambertMaterial({ color:0x7ff0ff, emissive:0x1a8aa0, emissiveIntensity:.6, side:THREE.DoubleSide }), steelM = new THREE.MeshLambertMaterial({ color:0x4a5668 }),
    railM = new THREE.MeshLambertMaterial({ color:0x26303c, side:THREE.DoubleSide });
  let span = 0; while (span < 40 && glacierH(P[(bi + span) % N].x, P[(bi + span) % N].z, 0) < -1) span++;
  let spanB = 0; while (spanB < 40 && glacierH(P[(bi - spanB + N) % N].x, P[(bi - spanB + N) % N].z, 0) < -1) spanB++;
  const i0 = (bi - spanB - 3 + N) % N, len = span + spanB + 6;
  GLA.bridgeSpan = { i0, len };
  const wall = (lat, y0, y1, mat) => { const ps = [], idx = []; for (let k=0;k<=len;k++){ const i = (i0 + k) % N, x = P[i].x + R[i].x*lat, z = P[i].z + R[i].z*lat; ps.push(x, P[i].y + y0, z, x, P[i].y + y1, z); if (k < len){ const a = k*2; idx.push(a, a+2, a+1, a+1, a+2, a+3); } }
    const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3)); ge.setIndex(idx); ge.computeVertexNormals(); const m = new THREE.Mesh(ge, mat); g.add(m); return m; };
  const beam = (a, b, sx, sy, mat) => { if (!(a.distanceTo(b) > .05)) return null; const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, a.distanceTo(b) + .05), mat); m.position.copy(a).add(b).multiplyScalar(.5); m.lookAt(b); m.castShadow = true; g.add(m); return m; };
  const at = (kf, lat, y) => { const k0 = Math.max(0, Math.min(len - 1, Math.floor(kf))), u = kf - k0, ia = (i0 + k0) % N, ib = (ia + 1) % N;
    const px = P[ia].x + (P[ib].x - P[ia].x)*u, pz = P[ia].z + (P[ib].z - P[ia].z)*u, rx = R[ia].x + (R[ib].x - R[ia].x)*u, rz = R[ia].z + (R[ib].z - R[ia].z)*u; return new THREE.Vector3(px + rx*lat, y, pz + rz*lat); };
  const EDGE = W/2 + 2.2, DECK_B = -1.8, TR = W/2 + 1.4, BOT = -8.5;
  g.add(new THREE.Mesh(stripGeo(i0, len, -EDGE, EDGE, -.05, 1), deckM));
  g.add(new THREE.Mesh(stripGeo(i0, len, -EDGE, EDGE, DECK_B, 1), fasciaM));
  for (const sd of [-1, 1]){ wall(sd*EDGE, DECK_B, -.05, fasciaM); wall(sd*(EDGE + .03), -.5, -.25, cyanM);
    const lat = sd*(EDGE - .35); wall(lat, .8, 1.1, railM); wall(lat, .42, .58, cyanM);
    for (let k=0;k<=len;k+=2){ const i = (i0 + k) % N, post = new THREE.Mesh(new THREE.BoxGeometry(.22, 1.2, .22), railM); post.position.set(P[i].x + R[i].x*lat, P[i].y + .55, P[i].z + R[i].z*lat); g.add(post); }
    for (let k=0;k<len;k++){ const i = (i0 + k) % N; addSolid({ i, lat:sd*EDGE, r:1.3, soft:0, x:P[i].x + R[i].x*sd*EDGE, z:P[i].z + R[i].z*sd*EDGE, half:1.3, rail:true }); } }
  // the truss: top chord along the deck edge, bottom chord below, verticals and alternating diagonals (a Warren truss)
  const gH = (kf, lat) => { const p = at(kf, lat, 0); return glacierH(p.x, p.z, 0); };
  let kA = 1, kB = len - 1; while (kA < len/2 - 2 && Math.min(gH(kA, -TR), gH(kA, TR)) > BOT - 1) kA += .5; while (kB > len/2 + 2 && Math.min(gH(kB, -TR), gH(kB, TR)) > BOT - 1) kB -= .5;
  for (const sd of [-1, 1]){ const lat = sd*TR;
    beam(at(kA, lat, BOT), at(kB, lat, BOT), .7, .8, steelM); beam(at(kA - 1, lat, DECK_B - .3), at(kB + 1, lat, DECK_B - .3), .6, .6, steelM);
    const nP = Math.max(2, Math.round((kB - kA)/2)); for (let j=0;j<=nP;j++){ const k = kA + (kB - kA)*j/nP; beam(at(k, lat, BOT), at(k, lat, DECK_B - .3), .4, .4, steelM);
      if (j < nP){ const k2 = kA + (kB - kA)*(j + 1)/nP; if (j % 2) beam(at(k, lat, BOT), at(k2, lat, DECK_B - .3), .35, .35, steelM); else beam(at(k, lat, DECK_B - .3), at(k2, lat, BOT), .35, .35, steelM); }
      for (let q=0;q<2;q++) icicle(at(k + rnd(-.8,.8), lat, 0).x, BOT - .4, at(k, lat, 0).z, rnd(1.5, 5), rnd(.25, .5)); }
    // raking struts from the bottom chord's quarter points down to footings on the crevasse walls (the big X of the poster)
    for (const [kq, kw] of [[kA + (kB - kA)*.3, kA - 1.5], [kB - (kB - kA)*.3, kB + 1.5]]){ const footY = Math.max(-GLA.depth*.55, gH(kw, lat) - 1.5);
      beam(at(kq, lat, BOT), at(kw, lat, footY), 1, 1.1, steelM);
      const ft = new THREE.Mesh(new THREE.BoxGeometry(3.2, 6, 3.2), fasciaM); ft.position.copy(at(kw, lat, footY - 2.4)); g.add(ft); } }
  for (let j=0;j<=6;j++){ const k = kA + (kB - kA)*j/6; beam(at(k, -TR, BOT), at(k, TR, BOT), .4, .5, steelM); if (j < 6){ const k2 = kA + (kB - kA)*(j + 1)/6; beam(at(k, -TR, BOT), at(k2, TR, BOT), .3, .3, steelM); } }
  for (let k=0;k<=len;k+=1) for (const sd of [-1, 1]) if (Math.random() < .7){ const p = at(k + rnd(-.4, .4), sd*(EDGE + .05), 0); icicle(p.x, DECK_B, p.z, rnd(1, 4.5), rnd(.18, .4)); }
  // nothing generic floats off the edge of the deck: every trackside marker over the drop (studs, posts, flags, boards) is left out
  tidyOffDeck(i0, len, EDGE);
  // 5. ice blocks: sheer-sided glacier blocks with snow caps, big shelves out in the field and smaller ones at the roadside
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const block = (x, z, w, d, h, yaw) => { const gy = glacierH(x, z) - 1.5, B = new THREE.Group(); B.position.set(x, gy, z); B.rotation.y = yaw; g.add(B);
    const m = new THREE.Mesh(unit, iceM); m.scale.set(w, h, d); m.position.y = h/2; m.castShadow = m.receiveShadow = true; B.add(m);
    const cap = new THREE.Mesh(unit, snowM); cap.scale.set(w*1.04, h*.07 + .6, d*1.04); cap.position.y = h + .2; B.add(cap);
    for (let j=0;j<Math.round(w/2);j++){ const u = rnd(-.5, .5); for (const s of [-1, 1]){ const lp = new THREE.Vector3(u*w, h - .1, s*d*.52).applyAxisAngle(UPV, yaw); icicle(x + lp.x, gy + lp.y, z + lp.z, rnd(1, h*.25), rnd(.25, .6)); } }
    return B; };
  let bn = 0; for (let t=0;t<400 && bn<26;t++){ const a = Math.random()*Math.PI*2, d = rnd(90, 700), x = C.x + Math.cos(a)*d, z = C.z + Math.sin(a)*d, w = rnd(16, 46)*(d > 400 ? 1.4 : 1);
    if (distTrack(x, z) < w*.75 + 22 || distCanyon2(x, z) < GLA.cw + w*.7 + 8) continue; block(x, z, w, w*rnd(.5, .9), rnd(14, 34)*(d > 400 ? 1.5 : 1), Math.random()*6); bn++; }
  for (let t=0;t<90;t++){ const i = (Math.random()*N)|0, sd = Math.random() < .5 ? -1 : 1, lat = sd*rnd(W/2 + 9, W/2 + 24), x = P[i].x + R[i].x*lat, z = P[i].z + R[i].z*lat, w = rnd(3, 9);
    if (distTrack(x, z) < W/2 + 6 + w*.5 || distCanyon2(x, z) < GLA.cw + 6) continue; block(x, z, w, w*rnd(.6, 1), rnd(3, 11), Math.random()*6); }
  // 6. crystal shards in clusters, glowing faintly from inside
  { const sG = new THREE.ConeGeometry(1, 1, 6); sG.translate(0, .5, 0); const shards = new THREE.InstancedMesh(sG, glowIceM, 360); let n = 0;
    while (n < 360){ const a = Math.random()*Math.PI*2, d = 30 + Math.random()*720, cx = C.x + Math.cos(a)*d, cz = C.z + Math.sin(a)*d, dt = distTrack(cx, cz); if (dt < W/2 + 10 || distCanyon2(cx, cz) < GLA.cw + 4) continue;
      const gy = glacierH(cx, cz, dt), k = 3 + Math.random()*5|0, big = Math.random() < .2 ? 2.2 : 1;
      for (let j=0;j<k && n<360;j++){ const r = rnd(.7, 1.8)*big; o.position.set(cx + rnd(-3,3)*big, gy - .5, cz + rnd(-3,3)*big); o.rotation.set(rnd(-.45,.45), Math.random()*3, rnd(-.45,.45)); o.scale.set(r, r*rnd(4, 9), r); o.updateMatrix(); shards.setMatrixAt(n++, o.matrix); } }
    shards.castShadow = true; g.add(shards); }
  // 7. ice arches — one spans the road — built from blocks along a lopsided curve, with a snow crust on top
  const arch = (x, z, yaw, sp, h, thick) => { const gy = Math.min(0, glacierH(x, z)), A = new THREE.Group(); A.position.set(x, gy, z); A.rotation.y = yaw; g.add(A); const n = 16, lean = rnd(-.12, .12);
    for (let k=0;k<=n;k++){ const u = k/n, a = Math.PI*(1 - u), px = Math.cos(a)*sp/2, py = Math.sin(a)*h*(1 + lean*(u - .5)), th = thick*(.7 + .6*Math.pow(Math.abs(u - .5)*2, 1.5))*rnd(.9, 1.1);
      const b = new THREE.Mesh(unit, iceM); b.position.set(px, py, rnd(-.4,.4)); b.rotation.z = a - Math.PI/2; b.scale.set(sp/n*1.5, th, thick*1.8); A.add(b);
      if (k > 1 && k < n - 1){ const s = new THREE.Mesh(unit, snowM); s.position.set(px, py + th*.5, 0); s.rotation.z = a - Math.PI/2; s.scale.set(sp/n*1.5, .7, thick*1.9); A.add(s);
        const wp = new THREE.Vector3(px, py - th*.5, 0).applyAxisAngle(UPV, yaw); if (Math.random() < .8) icicle(x + wp.x, gy + wp.y, z + wp.z, rnd(1.5, 5), rnd(.3, .6)); } }
    for (const sd of [-1, 1]){ const leg = new THREE.Mesh(unit, iceM); leg.position.set(sd*sp/2, -3, 0); leg.scale.set(thick*2, 8, thick*2.2); A.add(leg); }
    A.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } }); return A; };
  { const f = (GLA.bridge/N + .38) % 1, p = atTrack(f, 0); GLA.gate = f; arch(p.x, p.z, p.h, W + 22, rnd(16, 19), 3.2); }
  for (let k=0;k<5;k++){ for (let t=0;t<40;t++){ const a = Math.random()*Math.PI*2, d = rnd(120, 680), x = C.x + Math.cos(a)*d, z = C.z + Math.sin(a)*d, sp = rnd(34, 70);
      if (distTrack(x, z) < sp/2 + 20 || distCanyon2(x, z) < GLA.cw + 20) continue; arch(x, z, Math.random()*6, sp, sp*rnd(.45, .7), sp*rnd(.08, .11)); break; } }
  // 8. frosted shrubs: bare branches rimed white
  { const brG = new THREE.CylinderGeometry(.05, .14, 1, 4); brG.translate(0, .5, 0); const br = new THREE.InstancedMesh(brG, new THREE.MeshLambertMaterial({ color:0xe6f2fc, emissive:0x2a4a6a, emissiveIntensity:.1 }), 1600); let n = 0;
    while (n < 1600){ const a = Math.random()*Math.PI*2, d = 24 + Math.random()*640, cx = C.x + Math.cos(a)*d, cz = C.z + Math.sin(a)*d, dt = distTrack(cx, cz); if (dt < W/2 + 7 || distCanyon2(cx, cz) < GLA.cw + 3) continue;
      const gy = glacierH(cx, cz, dt), s = rnd(1.2, 3.2); for (let j=0;j<12 && n<1600;j++){ o.position.set(cx + rnd(-.4,.4), gy - .2, cz + rnd(-.4,.4)); o.rotation.set(rnd(-1, 1), Math.random()*6, rnd(-1, 1)); o.scale.set(1, s*rnd(.5, 1.2), 1); o.updateMatrix(); br.setMatrixAt(n++, o.matrix); } }
    g.add(br); }
  // 9. floating ice islands: inverted shards of glacier with a snow crown and a fringe of icicles; some carry an energy spire with glowing rings
  const ISL = [], ringM = new THREE.MeshBasicMaterial({ color:0x9ff4ff, transparent:true, opacity:.75, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
  const spireM = new THREE.MeshStandardMaterial({ color:0xd6f6ff, emissive:0x6ad8ff, emissiveIntensity:.9, roughness:.2, metalness:.1 });
  const spire = (G, y0, h, r) => { const s = new THREE.Mesh(new THREE.CylinderGeometry(r*.45, r, h, 6), spireM); s.position.y = y0 + h/2; G.add(s);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(r*.45, h*.12, 6), spireM); tip.position.y = y0 + h + h*.06; G.add(tip);
    const rings = []; for (let k=0;k<3;k++){ const rg = new THREE.Mesh(new THREE.TorusGeometry(r*(2.4 + k*.8), r*.14, 6, 48), ringM); rg.rotation.x = Math.PI/2; rg.position.y = y0 + h*(.42 + k*.16); G.add(rg); rings.push(rg); }
    const beamM2 = new THREE.MeshBasicMaterial({ color:0xbff8ff, transparent:true, opacity:.25, blending:THREE.AdditiveBlending, depthWrite:false });
    const bm = new THREE.Mesh(new THREE.CylinderGeometry(r*.5, r*.5, h*1.6, 8, 1, true), beamM2); bm.position.y = y0 + h*.8; G.add(bm); return rings; };
  for (let i=0;i<16;i++){ let x, z, tries = 0; do { const a = Math.random()*Math.PI*2, d = rnd(140, 820); x = C.x + Math.cos(a)*d; z = C.z + Math.sin(a)*d; tries++; } while (distTrack(x, z) < 60 && tries < 30);
    const r = rnd(18, 42), y = rnd(50, 150), G = new THREE.Group(); G.position.set(x, y, z); g.add(G);
    const bh = r*rnd(1.5, 2.2), body = new THREE.Mesh(new THREE.ConeGeometry(r, bh, 7), iceM); body.rotation.x = Math.PI; body.position.y = -bh/2; G.add(body);
    for (let k=0;k<3;k++){ const a = rnd(0, 6.28), ch = new THREE.Mesh(new THREE.ConeGeometry(r*rnd(.35, .55), bh*rnd(.5, .8), 6), iceM); ch.rotation.set(Math.PI + rnd(-.25,.25), 0, rnd(-.25,.25)); ch.position.set(Math.cos(a)*r*.45, -bh*rnd(.25, .4), Math.sin(a)*r*.45); G.add(ch); }
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(r*1.06, r*1.02, r*.18, 7), snowM); crown.position.y = r*.05; G.add(crown);
    const lump = new THREE.Mesh(new THREE.SphereGeometry(r*.75, 9, 5, 0, Math.PI*2, 0, Math.PI/2), snowM); lump.scale.y = .35; lump.position.y = r*.12; G.add(lump);
    const icG = new THREE.Group(); G.add(icG); for (let k=0;k<14;k++){ const a = k/14*Math.PI*2 + rnd(-.1,.1), ic = new THREE.Mesh(icicleG, iceM), L = rnd(.15, .45)*r; ic.scale.set(r*.05, L, r*.05); ic.position.set(Math.cos(a)*r*.98, -r*.04, Math.sin(a)*r*.98); icG.add(ic); }
    const rings = Math.random() < .4 ? spire(G, r*.15, r*rnd(2.2, 3.4), r*.16) : null;
    ISL.push({ G, y, ph:Math.random()*6, rings, spin:rnd(-.02, .02) }); }
  // two great spires standing on the far ice, beams into the sky
  for (let k=0;k<2;k++){ const a = rnd(0, 6.28), d = rnd(560, 760), x = C.x + Math.cos(a)*d, z = C.z + Math.sin(a)*d, G = new THREE.Group(); G.position.set(x, glacierH(x, z), z); g.add(G);
    ISL.push({ G, y:G.position.y, ph:0, rings:spire(G, 0, rnd(220, 300), rnd(9, 13)), spin:0, fixed:true }); }
  // 10. the far skyline: low glacier shelves and ranges, paler with distance
  const skyBand = (rad, hgt, col, seed, haze) => { const c = document.createElement('canvas'); c.width = 2048; c.height = 256; const x = c.getContext('2d'); x.clearRect(0,0,2048,256);
    x.fillStyle = col; x.beginPath(); x.moveTo(0, 256); let px = 0;
    while (px < 2048){ const kind = Math.random(); if (kind < .4){ const w = rnd(90, 300), top = 256*rnd(.5, .72); x.lineTo(px + rnd(4, 10), top); x.lineTo(px + w, top + rnd(-4, 4)); px += w + rnd(4, 10); x.lineTo(px, 256*rnd(.75, .9)); }   // flat ice shelf
      else if (kind < .6){ const w = rnd(40, 120), top = 256*rnd(.2, .45); x.lineTo(px + w*.5, top); px += w; x.lineTo(px, 256*rnd(.7, .85)); }                                 // a peak
      else { px += rnd(30, 90); x.lineTo(px, 256*rnd(.72, .9)); } }
    x.lineTo(2048, 256); x.closePath(); x.fill();
    const g2 = x.createLinearGradient(0, 0, 0, 256); g2.addColorStop(0, 'rgba(255,255,255,.35)'); g2.addColorStop(.6, `rgba(232,236,248,${haze})`); g2.addColorStop(1, 'rgba(230,236,246,.7)'); x.globalCompositeOperation = 'source-atop'; x.fillStyle = g2; x.fillRect(0, 0, 2048, 256);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.x = 2; t.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, hgt, 64, 1, true), new THREE.MeshBasicMaterial({ map:t, transparent:true, side:THREE.BackSide, fog:false, depthWrite:false }));
    m.position.set(C.x, hgt/2 - 6, C.z); m.rotation.y = seed; m.renderOrder = -1; g.add(m); };
  skyBand(3000, 360, '#d6dff0', 0, .5); skyBand(2650, 270, '#b9cbe6', 1.7, .32); skyBand(2300, 190, '#9cb6dc', 3.1, .18);
  // snow swirls blowing off the far ice
  const swirlT = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    for (let i=0;i<40;i++){ const a = i/40*Math.PI*3, rr = 8 + i*1.3, px = 64 + Math.cos(a)*rr, py = 64 + Math.sin(a)*rr*.6, r = rnd(6, 14), gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); }
    return new THREE.CanvasTexture(c); })();
  const SW = []; for (let i=0;i<7;i++){ const a = rnd(0, 6.28), d = rnd(900, 1900), sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:swirlT, transparent:true, opacity:rnd(.4, .7), depthWrite:false, fog:false }));
    const s0 = rnd(220, 480); sp.scale.set(s0, s0*.7, 1); sp.position.set(C.x + Math.cos(a)*d, s0*.3, C.z + Math.sin(a)*d); g.add(sp); SW.push({ sp, a, d, v:rnd(.004, .01) }); }
  // 11. the road: cyan light lines along both edges, blue-and-white chevron barriers on the bends
  const edgeM = new THREE.MeshBasicMaterial({ color:0x8ff6ff });
  for (const sd of [-1, 1]) g.add(new THREE.Mesh(stripGeo(0, N, sd*(W/2 - .1) - .3, sd*(W/2 - .1) + .3, .075, 1), edgeM));
  const chevT = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#eaf6ff'; x.fillRect(0,0,256,64); x.fillStyle = '#2f7fc8';
    for (let i=0;i<4;i++){ const x0 = 22 + i*58; x.beginPath(); x.moveTo(x0, 10); x.lineTo(x0 + 22, 32); x.lineTo(x0, 54); x.lineTo(x0 + 14, 54); x.lineTo(x0 + 36, 32); x.lineTo(x0 + 14, 10); x.fill(); }
    x.strokeStyle = '#7ff0ff'; x.lineWidth = 4; x.strokeRect(2, 2, 252, 60); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; })();
  const chevM = new THREE.MeshLambertMaterial({ map:chevT, emissive:0x1a3a5a, emissiveIntensity:.2 }), backM = new THREE.MeshLambertMaterial({ color:0xc8dcec });
  const barG = new THREE.BoxGeometry(3.6, 1.1, .7);
  for (let i=0;i<N;i+=4){ const turn = wrapA(Math.atan2(T[(i + 10) % N].x, T[(i + 10) % N].z) - Math.atan2(T[i].x, T[i].z)); if (Math.abs(turn) < .3 || (i % 8)) continue;
    const sd = turn > 0 ? -1 : 1, j = (i + 6) % N, px = P[j].x + R[j].x*(W/2 + 4.2)*sd, pz = P[j].z + R[j].z*(W/2 + 4.2)*sd;
    if (distCanyon2(px, pz) < GLA.cw + 4) continue;
    const yaw = Math.atan2(-T[j].x, -T[j].z), b = new THREE.Mesh(barG, [backM, backM, snowM, backM, chevM, backM]); b.position.set(px, .55, pz); b.rotation.y = yaw; b.castShadow = true; g.add(b);
    if (sd*turn < 0) b.scale.x = -1; }
  // 12. snow falling around the camera all the time
  const FL = 1600, fpos = new Float32Array(FL*3), fvel = new Float32Array(FL);
  for (let i=0;i<FL;i++){ fpos[i*3] = rnd(-90, 90); fpos[i*3+1] = rnd(-10, 50); fpos[i*3+2] = rnd(-90, 90); fvel[i] = rnd(1.5, 3.5); }
  const fGeo = new THREE.BufferGeometry(); fGeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  const flakeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); const gr = x.createRadialGradient(16,16,0,16,16,16); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.5,'rgba(255,255,255,.6)'); gr.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0,0,32,32); return new THREE.CanvasTexture(c); })();
  const flakes = new THREE.Points(fGeo, new THREE.PointsMaterial({ map:flakeTex, size:.45, transparent:true, depthWrite:false, opacity:.9, color:0xffffff })); flakes.frustumCulled = false; g.add(flakes);
  // 13. everything that moves
  const ICN = ICI.length, icM = new THREE.InstancedMesh(icicleG, iceM, Math.max(1, ICN)); for (let n=0;n<ICN;n++){ const [x, y, z, L, w] = ICI[n]; o.position.set(x, y, z); o.rotation.set(rnd(-.05,.05), Math.random()*6, rnd(-.05,.05)); o.scale.set(w, L, w); o.updateMatrix(); icM.setMatrixAt(n, o.matrix); } icM.count = ICN; g.add(icM);
  HAZ.updaters.push((t, dt) => { dt = dt || 1/60;
    for (const f of flowMats) f.t.offset.y = (f.t.offset.y + f.v*dt) % 1;
    for (const I of ISL){ if (!I.fixed){ I.G.position.y = I.y + Math.sin(t*.35 + I.ph)*3.5; I.G.rotation.y += I.spin*dt; }
      if (I.rings) I.rings.forEach((rg, k) => { rg.rotation.z = t*(.4 + k*.25)*(k % 2 ? -1 : 1); rg.position.y += Math.sin(t*1.2 + k*2)*.02; rg.material.opacity = .55 + .25*Math.sin(t*2 + k); }); }
    for (const s of SW){ s.a += s.v*dt; s.sp.position.x = C.x + Math.cos(s.a)*s.d; s.sp.position.z = C.z + Math.sin(s.a)*s.d; s.sp.material.rotation -= dt*.15; }
    // snowfall wraps round the camera
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, p = fGeo.attributes.position.array;
    for (let i=0;i<FL;i++){ p[i*3+1] -= fvel[i]*dt; p[i*3] += Math.sin(t*.7 + i)*dt*.8 + 2.2*dt; p[i*3+2] += Math.cos(t*.5 + i*1.3)*dt*.6;
      if (p[i*3+1] < cy - 12) p[i*3+1] += 62; if (p[i*3+1] > cy + 50) p[i*3+1] -= 62;
      if (p[i*3] < cx - 90) p[i*3] += 180; else if (p[i*3] > cx + 90) p[i*3] -= 180; if (p[i*3+2] < cz - 90) p[i*3+2] += 180; else if (p[i*3+2] > cz + 90) p[i*3+2] -= 180; }
    fGeo.attributes.position.needsUpdate = true;
    // gusts lift powder off the field
    if (Math.random() < dt*5){ const a = Math.random()*6.28, d = rnd(150, 650); snowPuffFx.emit(C.x + Math.cos(a)*d, rnd(1, 12), C.z + Math.sin(a)*d, 10, rnd(0, 2), 4, rnd(30, 70), rnd(5, 9)); }
    snowPuffFx.update(dt);
  });
}
function distCanyon2(x, z){ let m = 1e9; for (const cy of GLA.canyons) m = Math.min(m, distPoly(cy.pts, x, z).d); return m; }

/* ---------- Ferrous Moon: grey regolith, craters, a rift crossed by a low-gravity jump, under a ringed gas giant ----------
   Sculpted ground like the Mojave: pocked regolith, cratered bowls with raised rims, rocky crags; a deep rift cuts across
   the track and the road launches over it from a ramp — the GRAVITY JUMP: low gravity carries you in a long, slow arc to
   the far side through glowing field rings. Lamp posts, watchtowers and chevron boards line the haul road. */
const FER = { rift:[], rw:24, depth:70, craters:[], jump:null };
function ferrousH(x, z, dt){
  const C = TRACK_C, r = Math.hypot(x - C.x, z - C.z);
  if (dt === undefined) dt = distTrack(x, z);
  const A = clamp((dt - 16)/60, 0, 1)*(1 - clamp((r - 680)/220, 0, 1));
  const n1 = mNoise(x/130, z/130), n2 = mNoise(x/40 + 9, z/40 - 4), n3 = mNoise(x/12 - 3, z/12 + 5);
  let h = 4.5*n1 + 1.6*n2 + .5*n3 - 2.6;
  for (const c of FER.craters){ const d = Math.hypot(x - c.x, z - c.z); if (d > c.r*1.7) continue; const q = d/c.r;
    h += q < 1 ? -c.dep*(1 - q*q) : 0; h += c.rim*Math.exp(-Math.pow((q - 1)/.22, 2)); }
  h *= A;
  if (FER.rift.length){ const { d } = distPoly(FER.rift, x, z), w = FER.rw + (mNoise(x/30, z/30) - .5)*5;
    h *= clamp((d - w)/14, 0, 1); if (d < w){ const k = clamp((w - d)/5, 0, 1); h = Math.min(h, -FER.depth*k - (mNoise(x/9, z/9) - .5)*4*k); } }
  return h;
}
const regolithFx = makeFx(0xb8b2aa, 500, false, -0.02);
function ferrousWorks(g){
  const C = TRACK_C, o = new THREE.Object3D(), J = JUMPS.find(j => j.g) || JUMPS[0];
  // 1. the rift: crosses the track square-on under the middle of the jump gap, wandering off both ways
  FER.rift = []; FER.craters = [];
  if (J){ const gapN = (J.land - J.lip + N) % N, jm = (J.lip + Math.round(gapN/2)) % N, B = P[jm], rr = R[jm], tt = T[jm], side = [];
    const halfGap = Math.min(Math.hypot(P[J.lip].x - B.x, P[J.lip].z - B.z), Math.hypot(P[J.land].x - B.x, P[J.land].z - B.z));
    FER.rw = Math.max(12, halfGap - 6);
    for (const sd of [-1, 1]){ const pts = []; for (let k=0;k<70;k++){ const s = k*9*sd, wob = 40*Math.sin(Math.abs(s)/90 + sd)*clamp((Math.abs(s) - 40)/80, 0, 1);
        const x = B.x + rr.x*s + tt.x*wob, z = B.z + rr.z*s + tt.z*wob; if (Math.hypot(x - C.x, z - C.z) > 760) break;
        if (Math.abs(s) > 40){ let near = false; for (let i=0;i<N;i+=3){ const di = Math.min((i - jm + N) % N, (jm - i + N) % N); if (di < 40) continue; if (Math.hypot(P[i].x - x, P[i].z - z) < FER.rw + W/2 + 26){ near = true; break; } } if (near) break;
          if (CUT){ const ax = CUT.A.x, az = CUT.A.z, bx = CUT.B.x, bz = CUT.B.z, l2 = (bx-ax)**2 + (bz-az)**2, t = clamp(((x-ax)*(bx-ax) + (z-az)*(bz-az))/l2, 0, 1); if (Math.hypot(x - (ax + (bx-ax)*t), z - (az + (bz-az)*t)) < FER.rw + 20) break; } }
        pts.push({ x, z }); } side.push(pts); }
    FER.rift = [...side[0].reverse(), ...side[1].slice(1)]; FER.jump = { jm, J }; }
  // craters: big bowls out in the field, smaller ones close by
  for (let t=0;t<400 && FER.craters.length < 34;t++){ const a = Math.random()*Math.PI*2, d = rnd(60, 720), x = C.x + Math.cos(a)*d, z = C.z + Math.sin(a)*d, r = rnd(12, d > 300 ? 70 : 34);
    if (distTrack(x, z) < r*1.4 + 14 || (FER.rift.length && distPoly(FER.rift, x, z).d < FER.rw + r*1.3)) continue; FER.craters.push({ x, z, r, dep:r*rnd(.18, .3), rim:r*rnd(.05, .1) }); }
  // 2. the ground: grey regolith, darker in the crater floors and down the rift walls
  const gT = noiseTex(world.ground[0], world.ground[1], 256, world.ground[2]); gT.repeat.set(110, 110);
  const SZ = 1800, SEG = 240, geo = new THREE.PlaneGeometry(SZ, SZ, SEG, SEG); geo.rotateX(-Math.PI/2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count*3);
  for (let i=0;i<pos.count;i++) pos.setY(i, ferrousH(pos.getX(i) + C.x, pos.getZ(i) + C.z));
  geo.computeVertexNormals();
  { const nr = geo.attributes.normal; for (let i=0;i<pos.count;i++){ const ny = nr.getY(i), y = pos.getY(i), wall = clamp((.9 - ny)/.5, 0, 1), deep = clamp(-y/FER.depth, 0, 1);
      const k = 1 - .35*wall - .45*deep - (y < -1 ? .08 : 0); cols[i*3] = k*1.02; cols[i*3+1] = k; cols[i*3+2] = k*.97; } }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map:gT, vertexColors:true })); ground.position.set(C.x, 0, C.z); ground.receiveShadow = true; g.add(ground);
  const rT = gT.clone(); rT.needsUpdate = true; rT.repeat.set(320, 320);
  const ring = new THREE.Mesh(new THREE.RingGeometry(860, 3200, 72, 1), new THREE.MeshLambertMaterial({ map:rT, color:0xcfcac4 })); ring.rotation.x = -Math.PI/2; ring.position.set(C.x, -.3, C.z); ring.receiveShadow = true; g.add(ring);
  const rockM = new THREE.MeshLambertMaterial({ color:0x6a6764 }), darkM = new THREE.MeshLambertMaterial({ color:0x3e3c3a }), yel = new THREE.MeshLambertMaterial({ color:0xf2c230, emissive:0x3a2a00 });
  // 3. rocks: boulders scattered everywhere, rubble along the crater rims and the rift lip, big crags out in the field
  { const dg = new THREE.DodecahedronGeometry(1, 0), rocks = new THREE.InstancedMesh(dg, rockM, 900); let n = 0;
    const put = (x, z, s) => { if (n >= 900) return; const dt = distTrack(x, z); if (dt < W/2 + 6) return; o.position.set(x, ferrousH(x, z, dt) + s*.15, z); o.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3); o.scale.set(s, s*rnd(.5, .9), s*rnd(.8, 1.3)); o.updateMatrix(); rocks.setMatrixAt(n++, o.matrix); };
    for (let t=0;t<520;t++){ const a = Math.random()*Math.PI*2, d = 25 + Math.random()*740; put(C.x + Math.cos(a)*d, C.z + Math.sin(a)*d, .4 + Math.pow(Math.random(), 3)*4); }
    for (const c of FER.craters) for (let k=0;k<6;k++){ const a = Math.random()*6.28; put(c.x + Math.cos(a)*c.r*rnd(.95, 1.25), c.z + Math.sin(a)*c.r*rnd(.95, 1.25), rnd(.6, 2.2)); }
    for (let k=0;k<FER.rift.length;k++) for (const sd of [-1, 1]){ const a = FER.rift[k], b = FER.rift[Math.min(FER.rift.length - 1, k + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; put(a.x - dz/l*(FER.rw + rnd(1, 6))*sd, a.z + dx/l*(FER.rw + rnd(1, 6))*sd, rnd(.5, 2)); }
    rocks.count = n; rocks.castShadow = rocks.receiveShadow = true; g.add(rocks);
    const crag = (x, z, s) => { const G = new THREE.Group(); G.position.set(x, ferrousH(x, z) - s*.3, z); g.add(G);
      for (let k=0;k<5;k++){ const m = new THREE.Mesh(new THREE.TetrahedronGeometry(s*rnd(.5, 1), 0), k ? rockM : darkM); m.position.set(rnd(-s, s)*.6, s*rnd(.1, .5), rnd(-s, s)*.6); m.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3); m.scale.y = rnd(1, 1.8); m.castShadow = m.receiveShadow = true; G.add(m); } };
    let cn = 0; for (let t=0;t<300 && cn<22;t++){ const a = Math.random()*Math.PI*2, d = rnd(70, 700), x = C.x + Math.cos(a)*d, z = C.z + Math.sin(a)*d, s = rnd(8, 26)*(d > 350 ? 1.6 : 1);
      if (distTrack(x, z) < s + 18 || (FER.rift.length && distPoly(FER.rift, x, z).d < FER.rw + s)) continue; crag(x, z, s); cn++; } }
  // 4. the gravity jump: a ramp body under the raised road, launch chevrons, a sign gantry, field rings over the rift
  if (J){ const ramp = J.ramp || 10, i0 = (J.lip - ramp + N) % N;
    const skirt = (lat) => { const ps = [], idx = []; for (let k=0;k<=ramp;k++){ const i = (i0 + k) % N, x = P[i].x + R[i].x*lat, z = P[i].z + R[i].z*lat; ps.push(x, -1, z, x, P[i].y, z); if (k < ramp){ const a = k*2; idx.push(a, a+2, a+1, a+1, a+2, a+3); } }
      const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3)); ge.setIndex(idx); ge.computeVertexNormals(); g.add(new THREE.Mesh(ge, new THREE.MeshLambertMaterial({ color:0x4a4846, side:THREE.DoubleSide }))); };
    skirt(-(W/2 + 1.8)); skirt(W/2 + 1.8);
    { const L = P[J.lip], hgt = L.y + 1, face = new THREE.Mesh(new THREE.PlaneGeometry(W + 3.6, hgt), new THREE.MeshLambertMaterial({ color:0x3a3836, side:THREE.DoubleSide })); face.position.set(L.x, hgt/2 - 1, L.z); face.rotation.y = Math.atan2(T[J.lip].x, T[J.lip].z); g.add(face);
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(W + 3.6, .5), yel); stripe.position.set(L.x + T[J.lip].x*.02, L.y - .3, L.z + T[J.lip].z*.02); stripe.rotation.y = face.rotation.y; g.add(stripe); }
    // launch chevrons glowing on the ramp
    const chT = textTex(128, 128, (x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = '#7ff0ff'; x.lineWidth = 14; x.lineJoin = 'round'; for (let k=0;k<2;k++){ x.beginPath(); x.moveTo(18, 92 - k*46); x.lineTo(64, 52 - k*46); x.lineTo(110, 92 - k*46); x.stroke(); } });
    chT.wrapT = THREE.RepeatWrapping; chT.repeat.set(1, ramp/2); const chM = new THREE.MeshBasicMaterial({ map:chT, transparent:true, depthWrite:false, color:0xbff8ff });
    g.add(new THREE.Mesh(stripGeo(i0, ramp, -4, 4, .09, ramp/2), chM)); HAZ.updaters.push((t, dt) => { chT.offset.y = (chT.offset.y - (dt || 1/60)*1.4) % 1; });
    // the sign gantry before the ramp
    { const k = (i0 - 14 + N) % N, Q = P[k], yaw = Math.atan2(T[k].x, T[k].z), Gt = new THREE.Group(); Gt.position.set(Q.x, Q.y, Q.z); Gt.rotation.y = yaw; g.add(Gt);
      for (const sd of [-1, 1]){ const leg = new THREE.Mesh(new THREE.BoxGeometry(.6, 8, .6), darkM); leg.position.set(sd*(W/2 + 3), 4, 0); Gt.add(leg); }
      const sT = textTex(512, 96, (x, w, h) => { x.fillStyle = '#121214'; x.fillRect(0, 0, w, h); x.fillStyle = '#f2c230'; for (let i=0;i<w;i+=40){ x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 20, 0); x.lineTo(i, 12); x.fill(); x.beginPath(); x.moveTo(i, h); x.lineTo(i + 20, h); x.lineTo(i, h - 12); x.fill(); }
        x.fillStyle = '#7ff0ff'; x.font = 'bold 52px Impact, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('▲ LOW-G JUMP ▲', w/2, h/2 + 2); });
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, 2.4), new THREE.MeshBasicMaterial({ map:sT })); bd.position.set(0, 7.2, -.05); bd.rotation.y = Math.PI; Gt.add(bd);
      const bk = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, 2.4), darkM); bk.position.set(0, 7.2, .05); Gt.add(bk); }
    // field rings hung along the flight arc over the rift, slowly turning, and motes rising out of the rift
    const gapN = (J.land - J.lip + N) % N, ringM2 = new THREE.MeshBasicMaterial({ color:0x7ff0ff, transparent:true, opacity:.55, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, fog:false });
    const RINGS = []; for (let q=1;q<=3;q++){ const k = (J.lip + Math.round(gapN*q/4)) % N, u = q/4, Q = P[k], hy = P[J.lip].y + 4 + 18*4*u*(1 - u);
      const rg = new THREE.Mesh(new THREE.TorusGeometry(10, .32, 8, 56), ringM2); rg.position.set(Q.x, hy, Q.z); rg.lookAt(Q.x + T[k].x, hy, Q.z + T[k].z); g.add(rg); RINGS.push(rg); }
    const FJ = FER.jump; HAZ.updaters.push((t, dt) => { RINGS.forEach((rg, i) => { rg.rotation.z = t*(.5 + i*.2); rg.material.opacity = .4 + .2*Math.sin(t*2.4 + i); });
      if (Math.random() < .6){ const Q = P[FJ.jm]; regolithFx.emit(Q.x + rnd(-20, 20), -FER.depth*rnd(.2, .9), Q.z + rnd(-20, 20), rnd(-.5, .5), rnd(2, 5), rnd(-.5, .5), rnd(1.5, 3), rnd(4, 7)); } }); }
  // 5. haul-road furniture: lamp posts on alternating sides, watchtowers and comm masts out on the regolith
  { const poleM = new THREE.MeshLambertMaterial({ color:0x8c8a88 }), lampM = new THREE.MeshBasicMaterial({ color:0xfff1c8 }), poolT = haloTex([[0,'rgba(255,236,190,.55)'],[.5,'rgba(255,226,170,.18)'],[1,'rgba(255,220,160,0)']]);
    const poolM = new THREE.MeshBasicMaterial({ map:poolT, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending });
    for (let i=0;i<N;i+=14){ if (GAP[i] || GAP[(i + 3) % N]) continue; const sd = (i/14|0) % 2 ? 1 : -1, bendIn = wrapA(Math.atan2(T[(i + 10) % N].x, T[(i + 10) % N].z) - Math.atan2(T[(i - 10 + N) % N].x, T[(i - 10 + N) % N].z)); if (Math.abs(bendIn) > .45) continue; const lat = sd*(W/2 + 8), x = P[i].x + R[i].x*lat, z = P[i].z + R[i].z*lat, yaw = Math.atan2(T[i].x, T[i].z);
      const G = new THREE.Group(); G.position.set(x, P[i].y, z); G.rotation.y = yaw; g.add(G);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 7, 6), poleM); pole.position.y = 3.5; G.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, .14, .2), poleM); arm.position.set(-sd*1, 7, 0); G.add(arm);
      const head = new THREE.Mesh(new THREE.BoxGeometry(.9, .22, .5), poleM); head.position.set(-sd*2, 6.95, 0); G.add(head);
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(.8, .4), lampM); lens.rotation.x = Math.PI/2; lens.position.set(-sd*2, 6.83, 0); G.add(lens);
    }
    const towerAt = (x, z, h) => { const G = new THREE.Group(); G.position.set(x, ferrousH(x, z), z); g.add(G);
      for (const [dx, dz] of [[-1.4,-1.4],[1.4,-1.4],[-1.4,1.4],[1.4,1.4]]){ const leg = new THREE.Mesh(new THREE.BoxGeometry(.35, h, .35), darkM); leg.position.set(dx, h/2, dz); leg.castShadow = true; G.add(leg); }
      for (let y=3;y<h;y+=4){ const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, .2, .2), darkM); b.position.y = y; G.add(b); const b2 = b.clone(); b2.rotation.y = Math.PI/2; G.add(b2); }
      const cab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3, 4.2), yel); cab.position.y = h + 1.5; G.add(cab);
      const win = new THREE.Mesh(new THREE.BoxGeometry(4.25, .8, 4.25), new THREE.MeshBasicMaterial({ color:0x1a1a1c })); win.position.y = h + 1.9; G.add(win);
      const bc = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5), new THREE.MeshBasicMaterial({ color:0xff3a2a })); bc.position.y = h + 3.4; G.add(bc); return bc; };
    const masts = (x, z, h) => { const G = new THREE.Group(); G.position.set(x, ferrousH(x, z), z); g.add(G);
      for (let k=0;k<3;k++){ const a = k/3*Math.PI*2, leg = new THREE.Mesh(new THREE.CylinderGeometry(.08, .25, h, 4), darkM); leg.position.set(Math.cos(a)*1.2, h/2, Math.sin(a)*1.2); leg.rotation.set(Math.sin(a)*.08, 0, -Math.cos(a)*.08); G.add(leg); }
      for (let y=2;y<h;y+=3){ const r = new THREE.Mesh(new THREE.TorusGeometry(1.2*(1 - y/h) + .2, .06, 4, 3), darkM); r.rotation.x = Math.PI/2; r.position.y = y; G.add(r); }
      const bc = new THREE.Mesh(new THREE.SphereGeometry(.35, 8, 6), new THREE.MeshBasicMaterial({ color:0xff3a2a })); bc.position.y = h + .4; G.add(bc); return bc; };
    const beacons = []; let tn = 0;
    for (let t=0;t<200 && tn<18;t++){ const i = (Math.random()*N)|0, sd = Math.random() < .5 ? -1 : 1, lat = sd*rnd(W/2 + 14, W/2 + 60), x = P[i].x + R[i].x*lat, z = P[i].z + R[i].z*lat;
      if (distTrack(x, z) < W/2 + 12 || (FER.rift.length && distPoly(FER.rift, x, z).d < FER.rw + 8)) continue; beacons.push(tn % 2 ? masts(x, z, rnd(14, 22)) : towerAt(x, z, rnd(9, 16))); tn++; }
    HAZ.updaters.push(t => { for (let k=0;k<beacons.length;k++) beacons[k].visible = Math.sin(t*3 + k*1.7) > -.2; }); }
  // 6. chevron boards on the bends: black and yellow
  { const chevT = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#141414'; x.fillRect(0,0,256,64); x.fillStyle = '#f2c230';
      for (let i=0;i<4;i++){ const x0 = 22 + i*58; x.beginPath(); x.moveTo(x0, 10); x.lineTo(x0 + 22, 32); x.lineTo(x0, 54); x.lineTo(x0 + 14, 54); x.lineTo(x0 + 36, 32); x.lineTo(x0 + 14, 10); x.fill(); }
      x.strokeStyle = '#f2c230'; x.lineWidth = 4; x.strokeRect(2, 2, 252, 60); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; })();
    const chevM = new THREE.MeshLambertMaterial({ map:chevT, emissive:0x2a2000, emissiveIntensity:.4 });
    for (let i=0;i<N;i+=4){ const turn = wrapA(Math.atan2(T[(i + 10) % N].x, T[(i + 10) % N].z) - Math.atan2(T[i].x, T[i].z)); if (Math.abs(turn) < .3 || (i % 8) || GAP[i]) continue;
      const sd = turn > 0 ? -1 : 1, j = (i + 6) % N, px = P[j].x + R[j].x*(W/2 + 4.2)*sd, pz = P[j].z + R[j].z*(W/2 + 4.2)*sd, yaw = Math.atan2(-T[j].x, -T[j].z);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1), chevM), bk = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1), darkM); b.position.set(px, P[j].y + 1.2, pz); b.rotation.y = yaw; bk.position.copy(b.position); bk.rotation.y = yaw + Math.PI; if (sd*turn < 0) b.scale.x = -1; g.add(b); g.add(bk);
      for (const s of [-1, 1]){ const leg = new THREE.Mesh(new THREE.BoxGeometry(.14, 1.2, .14), darkM); leg.position.set(px + Math.cos(yaw)*s*1.4, P[j].y + .4, pz - Math.sin(yaw)*s*1.4); g.add(leg); } } }
  // 7. the skyline: grey ranges on the horizon
  const skyBand = (rad, hgt, col, seed) => { const c = document.createElement('canvas'); c.width = 2048; c.height = 256; const x = c.getContext('2d'); x.clearRect(0,0,2048,256);
    x.fillStyle = col; x.beginPath(); x.moveTo(0, 256); let px = 0; while (px < 2048){ const w = rnd(30, 160), top = 256*rnd(.35, .8); x.lineTo(px + w*.5, top); px += w; x.lineTo(px, 256*rnd(.7, .9)); }
    x.lineTo(2048, 256); x.closePath(); x.fill(); x.globalCompositeOperation = 'source-atop'; const g2 = x.createLinearGradient(0, 0, 0, 256); g2.addColorStop(0, 'rgba(235,235,240,.55)'); g2.addColorStop(.5, 'rgba(160,160,168,.15)'); g2.addColorStop(1, 'rgba(40,40,46,.4)'); x.fillStyle = g2; x.fillRect(0, 0, 2048, 256);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.x = 2; t.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, hgt, 64, 1, true), new THREE.MeshBasicMaterial({ map:t, transparent:true, side:THREE.BackSide, fog:false, depthWrite:false })); m.position.set(C.x, hgt/2 - 6, C.z); m.rotation.y = seed; m.renderOrder = -1; g.add(m); };
  skyBand(3000, 300, '#8e8c8e', 0); skyBand(2600, 220, '#6c6a6c', 2.1);
  // 8. moving bits: falling into the rift off the road sends you back to the landing side
  HAZ.updaters.push((t, dt) => { regolithFx.update(dt || 1/60);
    if (state !== 'race' || !FER.jump) return; const FJ = FER.jump;
    for (const c of cars){ if (c.air || c.airT > 0 || c.rec) continue; if (distPoly(FER.rift, c.x, c.z).d > FER.rw - 3) continue;
      const i = (FJ.J.land + 4) % N; c.x = P[i].x; c.z = P[i].z; c.y = H[i]; c.h = Math.atan2(T[i].x, T[i].z); c.vx = c.vz = c.f = c.l = 0; c.idx = i; if (c.player){ showToast('Into the rift!', 1000); addShake(.5); } } });
}

/* ---------- per-world scenery ---------- */
/* ---------- Cirrus Reach: the Sky Arcade ----------
   One tall tier of round-headed arches carries the skyway up to 120 m. Bays widen where it is tall so the arches keep a Roman
   proportion; on the ramps each bay stops under its lower end so nothing pokes through the road. The deck gets a stone slab edge,
   an underside and a low parapet with a cyan cap, left open where the Wind Gap strip leaves the road. All of it is merged into a
   handful of meshes and marked as scenery (no physics props, no roadside tidy obstacles). */
function mergeGeos(list){
  let n = 0; const parts = list.map(g => { const ng = g.index ? g.toNonIndexed() : g; n += ng.attributes.position.count; return ng; });
  const pos = new Float32Array(n*3), nor = new Float32Array(n*3); let o = 0;
  for (const g of parts){ pos.set(g.attributes.position.array, o*3); nor.set(g.attributes.normal.array, o*3); o += g.attributes.position.count; g.dispose(); }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.computeBoundingSphere(); return m;
}
function arcadeBay(b, h0, h1, pier, crown){                       // a wall from h0 to h1, span b, with one round-headed opening at its foot
  const rr = Math.max(1, Math.min(b/2 - pier, (h1 - h0) - crown - 1.2)), ys = h1 - crown - rr, sh = new THREE.Shape();
  sh.moveTo(0, h0);
  if (ys > h0 + .5){ sh.lineTo(b/2 - rr, h0); sh.lineTo(b/2 - rr, ys); sh.absarc(b/2, ys, rr, Math.PI, 0, true); sh.lineTo(b/2 + rr, h0); }
  sh.lineTo(b, h0); sh.lineTo(b, h1); sh.lineTo(0, h1); sh.lineTo(0, h0);
  return sh;
}
function cirrusArcade(g){
  const D = W*.8, BASE = -10, arch = [], wall = [], Y = new THREE.Vector3(0, 1, 0);
  for (let i = 0, step = 3; i < N; i += step){
    step = H[i] > 70 ? 6 : H[i] > 40 ? 4 : 3; const j = (i + step) % N, top = Math.min(H[i], H[j]) - 1.4; if ((H[i] + H[j])/2 < 2) continue;
    const A = P[i], B = P[j], dx = B.x - A.x, dz = B.z - A.z, b = Math.hypot(dx, dz) + .05, X = new THREE.Vector3(dx, 0, dz).normalize(), Z = new THREE.Vector3().crossVectors(X, Y);
    const m4 = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(A.x, 0, A.z);
    const low = top < 6, geo = new THREE.ExtrudeGeometry(arcadeBay(b, BASE, top, low ? 1.6 : 1.8, low ? .8 : 1.4), { depth:D, bevelEnabled:false, curveSegments:10 });
    geo.deleteAttribute('uv'); geo.translate(0, 0, -D/2); geo.applyMatrix4(m4); (low ? wall : arch).push(geo);
  }
  const archM = new THREE.MeshLambertMaterial({ color:0xc4bde0 }), shadeM = new THREE.MeshLambertMaterial({ color:0xa69ec8 });
  for (const [list, mat] of [[arch, archM], [wall, shadeM]]){ if (!list.length) continue; const m = new THREE.Mesh(mergeGeos(list), mat); m.castShadow = m.receiveShadow = true; m.userData.noSolid = true; g.add(m); }
  // deck edges, underside and parapet, only where the road is in the air
  const deck = world.deck, raised = i => H[i] > .6 || H[(i + 1) % N] > .6;
  const sideA = CUT ? Math.sign((CUT.A.x - P[CUT.iA].x)*R[CUT.iA].x + (CUT.A.z - P[CUT.iA].z)*R[CUT.iA].z) : 0;
  const open = (i, sd) => { if (!CUT) return false; const x = P[i].x + R[i].x*deck*sd, z = P[i].z + R[i].z*deck*sd, ddx = x - CUT.A.x, ddz = z - CUT.A.z,
    u = (ddx*CUT.dir.x + ddz*CUT.dir.z)/CUT.len, d = ddx*CUT.nrm.x + ddz*CUT.nrm.z; return u > -.05 && u < 1.05 && Math.abs(d) < CUT.half + 2; };   // the Wind Gap leaves through here
  const strip = (a0, a1, y0, y1, keep) => { const pos = [];
    for (let i = 0; i < N; i++){ if (!raised(i) || (keep && !keep(i))) continue; const j = (i + 1) % N, q = (k, a, y) => [P[k].x + R[k].x*a, H[k] + y, P[k].z + R[k].z*a];
      const v = [q(i, a0, y0), q(i, a1, y1), q(j, a0, y0), q(j, a1, y1)]; for (const t of [0, 2, 1, 1, 2, 3]) pos.push(...v[t]); }
    const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.computeVertexNormals(); return ge; };
  const stone = new THREE.MeshLambertMaterial({ color:0xd9d4ef, side:THREE.DoubleSide }), stoneDark = new THREE.MeshLambertMaterial({ color:0x9a92bf, side:THREE.DoubleSide }), cap = new THREE.MeshLambertMaterial({ color:0x40e0ff });
  const parts = [[strip(deck, -deck, -1.4, -1.4), stoneDark]];
  for (const sd of [-1, 1]){ const wallHere = i => !open(i, sd);
    parts.push([strip(deck*sd, deck*sd, .05, -1.4), stone]);
    parts.push([strip((deck - .45)*sd, (deck - .45)*sd, 1.15, .05, wallHere), stoneDark], [strip(deck*sd, deck*sd, .05, 1.15, wallHere), stone], [strip((deck - .5)*sd, (deck + .05)*sd, 1.2, 1.2, wallHere), cap]);
    parts.push([strip((W/2 + 1.7)*sd, deck*sd, .07, .07), stone]); }                        // the strip between the curb and the parapet
  for (const [ge, mat] of parts){ const m = new THREE.Mesh(ge, mat); m.receiveShadow = true; m.castShadow = mat !== cap; m.userData.noSolid = true; g.add(m); }
}

/* ---------- the Sky Loop: a full vertical loop that IS the track on the south bend of Cirrus Reach ----------
   The road is straightened through the loop's footprint (eased in and out over 30 samples either side), the ground road between
   the two feet is left out, and the loop's deck is laid with the road's own surface and curbs, picking up exactly where the road
   stops and handing back exactly where it resumes. One run of yellow chevrons starts on the road before the foot, goes round the
   whole loop and runs off the exit, so the markings read as a single line.
   Side profile: curvature eases in over the first and last 45% of the loop's length (no kink at either foot), tightest over the top:
   a stretched teardrop whose way down crosses in front of the way up, like the curl in the reference. To let the two full-width
   branches pass, the deck drifts 28 m to one side through the loop, the way a coaster loop does: it leaves the foot dead straight,
   the drift builds up and dies away inside the loop, and the exit runs on a line parallel to the entry, 28 m to the inside of the
   bend. The road beyond eases back onto the circuit. Round the outside: a dark steel box truss and a red beacon on top. */
const LOOPK = (() => {
  const E = .45, M = 4000, ease = s => { const u = s < E ? s/E : s > 1 - E ? (1 - s)/E : 1; return u >= 1 ? 1 : u*u*(3 - 2*u); };
  let I = 0; for (let k = 0; k < M; k++) I += ease((k + .5)/M)/M;
  const k0 = 2*Math.PI/I, xs = new Float64Array(M + 1), ys = new Float64Array(M + 1); let x = 0, y = 0, p = 0;
  for (let k = 0; k < M; k++){ const s = (k + .5)/M; p += k0*ease(s)/M; x += Math.cos(p)/M; y += Math.sin(p)/M; xs[k + 1] = x; ys[k + 1] = y; }
  let hh = 0; for (let k = 0; k <= M; k++) hh = Math.max(hh, ys[k]);
  // unit-length side profile: [along, up] at fraction s of the way round
  return { at(s){ const f = Math.max(0, Math.min(1, s))*M, i = Math.min(M - 1, Math.floor(f)), u = f - i; return [xs[i] + (xs[i + 1] - xs[i])*u, ys[i] + (ys[i + 1] - ys[i])*u]; }, D:x, Hh:hh,
    span(height, seg){ return Math.max(4, Math.round(this.D*height/this.Hh/seg)); } };
})();
const LOOK_SETS = { ref:{ steel:0x1c1f24, steelHi:0x2a2e35, chev:'#ffcc33' }, cirrus:{ steel:0x2a3466, steelHi:0x3a4682, chev:'#7ff0ff' } };
// straighten the road through the loop's footprint: inside [i0, i1] the samples lie on the chord, and the correction fades out over
// K samples either side so the road eases onto and off the straight. T and R are recomputed where anything moved. Returns i1.
// shift: how far the exit line sits beside the entry line; side: +1 / -1 along the road's right vector. Returns { i1, F, Rb, side }.
const LOOP_W0 = .15, LOOP_W1 = .85;                                              // where, along the loop, the sideways drift happens
const loopDrift = s => { const u = Math.max(0, Math.min(1, (s - LOOP_W0)/(LOOP_W1 - LOOP_W0))); return u*u*(3 - 2*u); };
function loopStraighten(i0, span, K, shift, side){
  const i1 = (i0 + span) % N, A = P[i0].clone(), ch = P[i1].clone().sub(A); ch.y = 0; const chL = ch.length(), F = ch.clone().divideScalar(chL || 1), Rb = new THREE.Vector3(F.z, 0, -F.x);
  const sm = u => u*u*(3 - 2*u), K2 = Math.round(K*1.5);                        // the exit side has the sideways offset to shed too: a longer ease
  for (let d = -K; d <= span + K2; d++){ const j = (i0 + d + N) % N, w = d < 0 ? sm(1 + d/K) : d > span ? sm(1 - (d - span)/K2) : 1;
    const along = d*(chL/span), lat = side*shift*loopDrift(d/span);
    const q = A.clone().addScaledVector(F, along).addScaledVector(Rb, lat); P[j].x += (q.x - P[j].x)*w; P[j].z += (q.z - P[j].z)*w; }
  for (let d = -K - 1; d <= span + K2 + 1; d++){ const j = (i0 + d + N) % N, a = P[(j - 1 + N) % N], b = P[(j + 1) % N];
    T[j].set(b.x - a.x, 0, b.z - a.z).normalize(); R[j].set(T[j].z, 0, -T[j].x); }
  for (let d = 0; d < span; d++) NOROAD[(i0 + d) % N] = 1;
  return { i1, F, Rb, side };
}
// i0: road sample the loop leaves from; height: top of the deck above the road; seg: metres per road sample; roadMat: the road's
// own material (the deck is the road); curbCols: the two curb colours; lookId: steel colours
function makeLoop(i0, height, seg, lookId, roadMat, curbCols, shift = 28, side = 1){
  const look = LOOK_SETS[lookId] || LOOK_SETS.ref, UP = new THREE.Vector3(0, 1, 0);
  const L = height/LOOPK.Hh, D = LOOPK.D*L, span = LOOPK.span(height, seg), i1 = (i0 + span) % N, HW = W/2 + 1.7;
  const F = T[i0].clone(), Rb = new THREE.Vector3(F.z, 0, -F.x);                   // the straightened road's own direction: both feet share it
  const sm = s => s*s*(3 - 2*s), lat = s => side*shift*loopDrift(s);               // 0 and flat at the entry; the full shift, flat again, at the exit
  const O = new THREE.Vector3(P[i0].x, 0, P[i0].z);
  const raw = s => { const [x, y] = LOOPK.at(s); return O.clone().addScaledVector(F, x*L).addScaledVector(Rb, lat(s)).addScaledVector(UP, y*L); };
  // pin both feet exactly onto the road (position and height), spreading the small correction smoothly along the loop
  const A = new THREE.Vector3(P[i0].x, H[i0], P[i0].z), B = new THREE.Vector3(P[i1].x, H[i1], P[i1].z), eA = A.sub(raw(0)), eB = B.sub(raw(1));
  const pos = s => { const w = sm(s); return raw(s).addScaledVector(eA, 1 - w).addScaledVector(eB, w).addScaledVector(UP, .04); };   // .04: the road surface's own lift
  const n = Math.ceil(L/1.2), Ps = [], Ts = [], Us = [], Ss = [];
  for (let k = 0; k <= n; k++) Ps.push(pos(k/n));
  for (let k = 0; k <= n; k++){ const a = Ps[Math.max(0, k - 1)], b = Ps[Math.min(n, k + 1)], t = b.clone().sub(a).normalize();
    const u = new THREE.Vector3().crossVectors(t, Rb).normalize(), sd = new THREE.Vector3().crossVectors(u, t).normalize(); Ts.push(t); Us.push(u); Ss.push(sd); }
  Ts[0].copy(T[i0]); Ts[n].copy(T[i1]); Us[0].set(0, 1, 0); Us[n].set(0, 1, 0); Ss[0].copy(R[i0]); Ss[n].copy(R[i1]);   // the feet share the road's frame exactly
  const frameAt = (s, out) => { const f = Math.max(0, Math.min(1, s))*n, k = Math.min(n - 1, Math.floor(f)), u = f - k;
    out.p.lerpVectors(Ps[k], Ps[k + 1], u); out.t.lerpVectors(Ts[k], Ts[k + 1], u).normalize(); out.u.lerpVectors(Us[k], Us[k + 1], u).normalize(); out.s.crossVectors(out.u, out.t).normalize(); return out; };
  const g = new THREE.Group(); g.name = 'skyLoop';
  // sweep a polyline profile ([side, up] offsets, either may be a function of s) along the loop; each segment its own strip, so edges stay crisp.
  // v runs in metres from the road's own texture coordinate at the foot, so the surface continues without a seam
  const val = (v, s) => typeof v === 'function' ? v(s) : v;
  const sweep = (pts, vRep, vOff = 0, cols = null) => { const ps = [], uv = [], cc = [], idx = []; let base = 0;
    for (let q = 0; q < pts.length - 1; q++){
      for (let k = 0; k <= n; k++){ const s = k/n, P0 = Ps[k], S0 = Ss[k], U0 = Us[k], v = vOff + s*L/vRep, [a0, b0] = [val(pts[q][0], s), val(pts[q][1], s)], [a1, b1] = [val(pts[q + 1][0], s), val(pts[q + 1][1], s)];
        ps.push(P0.x + S0.x*a0 + U0.x*b0, P0.y + S0.y*a0 + U0.y*b0, P0.z + S0.z*a0 + U0.z*b0, P0.x + S0.x*a1 + U0.x*b1, P0.y + S0.y*a1 + U0.y*b1, P0.z + S0.z*a1 + U0.z*b1);
        uv.push(0, v, 1, v); if (cols){ const c = cols(s); cc.push(c.r, c.g, c.b, c.r, c.g, c.b); }
        if (k < n){ const a = base + k*2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
      base += (n + 1)*2; }
    const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (cols) ge.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); ge.setIndex(idx); ge.computeVertexNormals(); return ge; };
  const steel = new THREE.MeshLambertMaterial({ color:look.steel, side:THREE.DoubleSide }), steelHi = new THREE.MeshLambertMaterial({ color:look.steelHi, side:THREE.DoubleSide });
  const add = (ge, mat, cast = true) => { const m = new THREE.Mesh(ge, mat); m.castShadow = cast; m.receiveShadow = true; m.userData.noSolid = true; g.add(m); return m; };
  // the running surface is the road itself; the curbs continue the road's own block pattern (one block per three samples)
  add(sweep([[-W/2, 0], [W/2, 0]], 14, i0*seg/14), roadMat);
  const cA = new THREE.Color(curbCols[0]), cB = new THREE.Color(curbCols[1]), curbCol = s => (Math.floor((i0 + s*L/seg)/3) % 2) ? cA : cB;
  const curbM = new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide });
  for (const sd of [-1, 1]) add(sweep([[sd*W/2, .03], [sd*HW, .03]], 14, 0, curbCol), curbM, false);
  // low walls that grow out of the curb over the first metres and sink back before the exit, slab edges, underside
  const wallH = s => 1.0*Math.min(1, s/.06, (1 - s)/.06);
  for (const sd of [-1, 1]) add(sweep([[sd*(HW - .35), .03], [sd*(HW - .35), wallH], [sd*HW, wallH], [sd*HW, -.9]], 12), steel);
  add(sweep([[-HW, -.9], [HW, -.9]], 12), steelHi);
  // the truss band round the outside: two outer chords and zig-zag webbing back to the deck's edges, ties across every few metres
  const OUT = -3.4, CW = HW - 1.1, mem = [], memAdd = (a, b, th) => mem.push([a, b, th]);
  for (const sd of [-1, 1]) add(sweep([[sd*CW - .28, OUT - .28], [sd*CW + .28, OUT - .28], [sd*CW + .28, OUT + .28], [sd*CW - .28, OUT + .28], [sd*CW - .28, OUT - .28]], 12), steel);
  const at = (k, sd, side, up) => Ps[k].clone().addScaledVector(Ss[k], sd*side).addScaledVector(Us[k], up);
  const step = Math.max(2, Math.round(2.6/1.2));
  for (let k = 0; k + step <= n; k += step){ const kk = k + step, km = k + (step >> 1);
    for (const sd of [-1, 1]){ memAdd(at(k, sd, HW - .5, -.9), at(km, sd, CW, OUT), .22); memAdd(at(km, sd, CW, OUT), at(kk, sd, HW - .5, -.9), .22); }
    if ((k/step) % 2 === 0){ memAdd(at(km, -1, CW, OUT), at(km, 1, CW, OUT), .2); memAdd(at(k, -1, CW, OUT), at(kk, 1, CW, OUT), .14); } }
  // the back and front of the circle (for framing views and the spec)
  let kb = 0, kf = 0; { let xb = 1e9, xf = -1e9; for (let k = 0; k <= n; k++){ const s = k/n, u = Ps[k].clone().sub(O).dot(F); if (s > .3 && s < .9 && u < xb){ xb = u; kb = k; } if (s > .1 && s < .7 && u > xf){ xf = u; kf = k; } } }
  const centre = Ps[kb].clone().lerp(Ps[kf], .5);
  // a red beacon on a short mast at the very top
  { const kt = Math.round(n/2), b0 = at(kt, 0, 0, OUT - .3), b1 = b0.clone().addScaledVector(Us[kt], -3.2); memAdd(b0, b1, .25);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(.45, 12, 8), new THREE.MeshBasicMaterial({ color:0xff3a2a })); beacon.position.copy(b1); g.add(beacon); g.userData.beacon = beacon; }
  // all the steel members in one draw call
  { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color:look.steel }), mem.length), o = new THREE.Object3D(), Z = new THREE.Vector3(0, 0, 1);
    mem.forEach(([a, b, th], q) => { const d = b.clone().sub(a), len = d.length(); o.position.copy(a).lerp(b, .5); o.quaternion.setFromUnitVectors(Z, d.divideScalar(len || 1)); o.scale.set(th, th, len); o.updateMatrix(); im.setMatrixAt(q, o.matrix); });
    im.castShadow = true; im.receiveShadow = true; im.userData.noSolid = true; g.add(im); }
  // one run of chevrons: on the road from `lead` samples before the foot, round the whole loop, and `tail` samples past the exit
  { const lead = 18, tail = 10, fr = [], push = (p, sdv, u) => fr.push({ p, s:sdv, u });
    for (let d = -lead; d < 0; d++){ const j = (i0 + d + N) % N; push(new THREE.Vector3(P[j].x, H[j] + .04, P[j].z), R[j], UP); }
    for (let k = 0; k <= n; k++) push(Ps[k], Ss[k], Us[k]);
    for (let d = 1; d <= tail; d++){ const j = (i1 + d) % N; push(new THREE.Vector3(P[j].x, H[j] + .04, P[j].z), R[j], UP); }
    const ps = [], uv = [], idx = [], hw = W/2 - 1; let v = 0;
    fr.forEach((f, q) => { if (q) v += f.p.distanceTo(fr[q - 1].p)/8; const a = f.p.clone().addScaledVector(f.s, -hw).addScaledVector(f.u, .07), b = f.p.clone().addScaledVector(f.s, hw).addScaledVector(f.u, .07);
      ps.push(a.x, a.y, a.z, b.x, b.y, b.z); uv.push(0, v, 1, v); if (q < fr.length - 1){ const i = q*2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); } });
    const chT = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d'); x.strokeStyle = look.chev; x.lineWidth = 14; x.lineJoin = 'round';
      for (let k = 0; k < 2; k++){ x.beginPath(); x.moveTo(20, 92 - k*46); x.lineTo(64, 52 - k*46); x.lineTo(108, 92 - k*46); x.stroke(); }
      const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; return t; })();
    const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx);
    const m = new THREE.Mesh(ge, new THREE.MeshBasicMaterial({ map:chT, transparent:true, depthWrite:false, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 })); m.userData.noSolid = true; m.renderOrder = 2; g.add(m); }
  return { g, i0, i1, span, L, D, height, frameAt, n, Ps, Us, Ss, Ts, F, Rb, lat, centre:centre.setY(height*.5), kb, kf };
}
// the loop as built for this world (null elsewhere); cars ride it through loopStep
let SKYLOOP = null, LOOPSPAN = null, ROAD_MAT = null;
const LOOP_G = 9.8*.6, LOOP_VMIN = 21, LOOP_VIN = 26;     // arcade gravity on the loop; nobody drops below ~72 km/h; slow cars are pushed in at ~88 km/h
const _lf = { p:new THREE.Vector3(), t:new THREE.Vector3(), u:new THREE.Vector3(), s:new THREE.Vector3() }, _lm = new THREE.Matrix4(), _lUp = new THREE.Vector3(0, 1, 0);
function cirrusLoop(g){
  if (!LOOPSPAN) return;
  SKYLOOP = makeLoop(LOOPSPAN.i0, world.loop.height, segLen, world.loop.look, ROAD_MAT, world.curb, world.loop.shift, LOOPSPAN.side);
  g.add(SKYLOOP.g);
  const bc = SKYLOOP.g.userData.beacon; if (bc) HAZ.updaters.push(t => bc.material.color.setRGB(.6 + .4*Math.abs(Math.sin(t*2.5)), .12, .08));
}
// a car reaching the loop's foot is taken onto it (once a lap), keeping its place across the deck
function loopEnter(c, loc){
  const Lp = SKYLOOP, k = (loc.i - Lp.i0 + N) % N;
  if (k > Lp.span - 2 || c.air || c.rec || (c.prog < (c._loopPrg ?? -1e9) + N/2) || Math.abs(loc.lat) > W/2 + 2) return false;
  const f = c.vx*Math.sin(c.h) + c.vz*Math.cos(c.h); if (f < 2) return false;
  const v0 = Math.max(f, LOOP_VIN);
  c.loop = { s:k <= 2 ? 0 : k/Lp.span, v0, v:v0, off:clamp(loc.lat, -(W/2 - 1.5), W/2 - 1.5), p0:c.prog - k };
  c.drift = 0; c.driftHeld = false; c.steerV = 0; c.airT = 0;
  return true;
}
function loopStep(c, inp, dt){
  const Lp = SKYLOOP, st = c.loop; c.rec = null; c.air = null;
  if (c.boost > 0) st.v0 = Math.min(st.v0 + 14*dt, MAXS*1.5);                   // a boost still pushes you round faster
  st.s += st.v*dt/Lp.L;
  if (st.s >= 1){                                                                   // off the loop: back on the road at the exit, at the entry speed
    const i = Lp.i1, v = st.v0; c.loop = null; c._loopPrg = st.p0 + Lp.span;
    c.x = P[i].x + R[i].x*st.off; c.z = P[i].z + R[i].z*st.off; c.y = world.elev ? trackY(c.x, c.z, i) : (H[i] || 0); c.h = Math.atan2(T[i].x, T[i].z);
    c.vx = T[i].x*v; c.vz = T[i].z*v; c.f = v; c.l = 0;
    let d = i - c.idx; if (d > N/2) d -= N; if (d < -N/2) d += N; c.prog += d; c.idx = i; c.lat = st.off;
    c.meter = Math.min(100, (c.meter || 0) + 12); if (c.player){ styleToast('Loop +12'); addShake(.25); }
    syncMesh(c, dt); return;
  }
  Lp.frameAt(st.s, _lf);
  const y = _lf.p.y - (H[Lp.i0] || 0); st.v = Math.max(LOOP_VMIN, Math.sqrt(Math.max(0, st.v0*st.v0 - 2*LOOP_G*y)));
  c.x = _lf.p.x + _lf.s.x*st.off; c.y = _lf.p.y + _lf.s.y*st.off; c.z = _lf.p.z + _lf.s.z*st.off;
  c.h = Math.atan2(Lp.F.x, Lp.F.z); c.vx = Lp.F.x*st.v; c.vz = Lp.F.z*st.v; c.f = st.v; c.l = 0; c.steerV *= .8; c.lat = st.off; c.off = false;
  c.boost = Math.max(0, c.boost - dt); c.thr = !!inp.thr; c.brk = !!inp.brk; c.accel = 0; c.spinA += st.v*dt/.5; c.airT = 0;
  const ni = (Lp.i0 + Math.round(Lp.span*st.s)) % N; let d = ni - c.idx; if (d > N/2) d -= N; if (d < -N/2) d += N; c.prog += d; c.idx = ni;
  syncMesh(c, dt);
  c.group.quaternion.setFromRotationMatrix(_lm.makeBasis(_lf.s, _lf.u, _lf.t));      // the whole car rolls round with the deck
}

const SCENERY = {
  desert(g){ mojaveWorks(g); },
  forge(g){
    forgeCanyon(g);
    const o = new THREE.Object3D(), C = TRACK_C;
    const colGeo = new THREE.CylinderGeometry(1,1,1,6); colGeo.translate(0,.5,0);
    const cols = new THREE.InstancedMesh(colGeo, new THREE.MeshLambertMaterial({color:0x2e2826}), 320);
    let n=0; while(n<320){ const a=Math.random()*Math.PI*2, d=30+Math.random()*800; const cx=Math.cos(a)*d+C.x, cz=Math.sin(a)*d+C.z;
      if (nearTrack(cx,cz,W/2+14) || canyonNear(cx, cz, 20)) continue; const k = 3+Math.random()*6|0, base = rnd(2,12);
      for (let j=0;j<k && n<320;j++){ const r=rnd(1.2,2.4); o.position.set(cx+rnd(-5,5), 0, cz+rnd(-5,5)); o.rotation.set(0,Math.random(),0); o.scale.set(r, base*rnd(.4,1.2), r); o.updateMatrix(); cols.setMatrixAt(n++, o.matrix); } }
    cols.castShadow = cols.receiveShadow = true; g.add(cols);
    // volcanoes on the horizon: lava-streaked cones, glowing craters and smoke columns
    for (let i=0;i<9;i++){ const a=i/9*Math.PI*2+rnd(0,.4), d=TRACK_R+600+rnd(0,500), h=rnd(160,320); buildVolcano(g, Math.cos(a)*d+C.x, Math.sin(a)*d+C.z, h, false); }
    forgeWorks(g);
  },
  tundra(g){ glacierWorks(g); },
  cirrus(g){
    const o = new THREE.Object3D(), C = TRACK_C;
    const puffs = new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,8), new THREE.MeshLambertMaterial({color:0xffffff}), 380);
    let n=0; while(n<380){ const a=Math.random()*Math.PI*2, d=26+Math.random()*900; const x=Math.cos(a)*d+C.x, z=Math.sin(a)*d+C.z;
      const s=rnd(4,14), sx=s*rnd(1,2), sz=s*rnd(1,2); if (nearTrack(x,z,W/2+6+Math.max(sx,sz))) continue;   // a puff keeps its whole width off the road and verge
      o.position.set(x,-s*.45,z); o.scale.set(sx,s*rnd(.5,.8),sz); o.updateMatrix(); puffs.setMatrixAt(n++,o.matrix); }
    puffs.receiveShadow = true; g.add(puffs);
    // floating islands and ringed spires
    const rock = new THREE.MeshLambertMaterial({color:0x8d86a8}), grass = new THREE.MeshLambertMaterial({color:0x8fd6a8});
    const ringM = new THREE.MeshBasicMaterial({color:0x40e0ff, transparent:true, opacity:.7});
    for (let i=0;i<28;i++){ let x,z; do { const a=Math.random()*Math.PI*2, d=60+Math.random()*900; x=Math.cos(a)*d+C.x; z=Math.sin(a)*d+C.z; } while (nearTrack(x,z,W/2+40));
      const r=rnd(10,34), y=rnd(30,140);
      const isl = new THREE.Group(); isl.position.set(x,y,z);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, r*1.4, 7), rock); cone.rotation.x = Math.PI; cone.position.y = -r*.7; isl.add(cone);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r*1.02, r, 2, 7), grass); isl.add(top);
      g.add(isl); const ph = Math.random()*6; HAZ.updaters.push(t => { isl.position.y = y + Math.sin(t*.4+ph)*3; });
    }
    for (let i=0;i<10;i++){ const a=i/10*Math.PI*2+rnd(0,.3), d=TRACK_R+300+rnd(0,500), h=rnd(160,300);
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(4, 10, h, 6), new THREE.MeshLambertMaterial({color:0xf3f1fb})); sp.position.set(Math.cos(a)*d+C.x, h/2-20, Math.sin(a)*d+C.z); g.add(sp);
      for (let k=0;k<3;k++){ const ring = new THREE.Mesh(new THREE.TorusGeometry(16+k*6, .9, 6, 40), ringM); ring.rotation.x=Math.PI/2; ring.position.set(sp.position.x, h*.4+k*22, sp.position.z); g.add(ring); const ph=k+i; HAZ.updaters.push(t => { ring.rotation.z = t*.3*(k%2?1:-1)+ph; }); } }
    if (world.arcade) cirrusArcade(g);
    if (world.loop) cirrusLoop(g);
  },
  quarry(g){ ferrousWorks(g); },
};

/* ---------- Halcyon Conduit: neon tunnels, star gates over the gaps, a ring of orbital pylons ---------- */
let STARGATES = [];
let playerLamp = null;
function conduitScenery(g){
  const o = new THREE.Object3D(), C = TRACK_C;
  // the bypass leaves and rejoins the road through the rail: leave those few metres open on the inward side
  const mouth = (i, sd) => { if (!CUT) return false; const dA = (i - CUT.iA + N) % N, dB = (CUT.iB - i + N) % N; if (dA > 34 && dB > 34) return false;
    const s = (P[i].x - CUT.A.x)*CUT.dir.x + (P[i].z - CUT.A.z)*CUT.dir.z, qx = CUT.A.x + CUT.dir.x*s, qz = CUT.A.z + CUT.dir.z*s;   // the strip's centreline level with this sample
    const lat = (qx - P[i].x)*R[i].x + (qz - P[i].z)*R[i].z; return Math.sign(lat) === sd && Math.abs(Math.abs(lat) - world.rails) < CUT.half + 1.2; };
  // tunnels: a dark glossy tube round the road with neon rings every few samples
  const inner = new THREE.MeshStandardMaterial({ color:0x141a28, roughness:.85, metalness:.15, side:THREE.BackSide }), outer = new THREE.MeshStandardMaterial({ color:0x0b0e18, roughness:.6, metalness:.4 });
  const ringM = [new THREE.MeshBasicMaterial({ color:0x5ef0e6 }), new THREE.MeshBasicMaterial({ color:0xff5ad9 }), new THREE.MeshBasicMaterial({ color:0xffe066 })];
  const ringG = new THREE.TorusGeometry(14.7, .3, 6, 40), stripG = new THREE.BoxGeometry(.5, .14, 1);
  for (const t of TUNNELS){ const span = (t.b - t.a + N) % N, pts = []; for (let k=0;k<=span;k++){ const i = (t.a + k) % N; pts.push(new THREE.Vector3(P[i].x, P[i].y + 5.5, P[i].z)); }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); const tube = new THREE.TubeGeometry(curve, span, 15, 16, false);   // 15 m: at road level the wall sits just outside the rails
    const mIn = new THREE.Mesh(tube, inner); mIn.receiveShadow = true; g.add(mIn); const mOut = new THREE.Mesh(tube, outer); mOut.castShadow = true; g.add(mOut);
    for (let k=4;k<span-3;k+=6){ const i = (t.a + k) % N, r = new THREE.Mesh(ringG, ringM[(k/6|0)%3]); r.position.set(P[i].x, P[i].y + 5.5, P[i].z); r.lookAt(P[i].x + T[i].x, P[i].y + 5.5 + (P[(i+1)%N].y - P[i].y)/segLen, P[i].z + T[i].z); g.add(r); }
    // light strips along both edges of the road inside
    const n = span*2, strips = new THREE.InstancedMesh(stripG, ringM[0], n); let c = 0;
    for (let k=0;k<span;k++){ const i = (t.a + k) % N; for (const sd of [-1,1]){ o.position.set(P[i].x + R[i].x*(W/2+1.2)*sd, P[i].y + .12, P[i].z + R[i].z*(W/2+1.2)*sd); o.rotation.set(0, Math.atan2(T[i].x,T[i].z), 0); o.updateMatrix(); strips.setMatrixAt(c++, o.matrix); } }
    strips.count = c; g.add(strips); }
  // every jump: launch pylons at the lip, a landing deck apron, and a star gate hanging over the gap
  STARGATES = [];
  const pyl = new THREE.MeshLambertMaterial({ color:0x1a2030 }), glowM = new THREE.MeshBasicMaterial({ color:0xffe066 });
  for (const j of JUMPS){ const i = j.lip;
    for (const sd of [-1,1]){ const px = P[i].x + R[i].x*(W/2+2.8)*sd, pz = P[i].z + R[i].z*(W/2+2.8)*sd; const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 14, 1.2), pyl); m.position.set(px, P[i].y + 7, pz); m.castShadow = true; g.add(m);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), glowM); tip.position.set(px, P[i].y + 14.6, pz); g.add(tip); }
    // apron: a wider plate at the landing so a slightly wide landing still counts
    const L = j.land, ap = new THREE.Mesh(new THREE.PlaneGeometry(W + 10, 72), new THREE.MeshLambertMaterial({ color:0x1b2038 })); ap.rotation.order = 'YXZ'; ap.rotation.y = Math.atan2(T[L].x, T[L].z); ap.rotation.x = -Math.PI/2; const lp = P[(L+10)%N]; ap.position.set(lp.x, lp.y + .02, lp.z); ap.receiveShadow = true; g.add(ap);
    // the star gate: fly through it for a boost
    const mid = (i + Math.round(((j.land - i + N) % N)/2)) % N, gy = Math.max(P[i].y, P[L].y) + 11;
    const gate = new THREE.Group(); gate.position.set(P[mid].x, gy, P[mid].z); gate.lookAt(P[mid].x + T[mid].x, gy, P[mid].z + T[mid].z); g.add(gate);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9.5, .5, 8, 48), new THREE.MeshBasicMaterial({ color:0xffe066 })); gate.add(ring);
    const halo = new THREE.Mesh(new THREE.RingGeometry(7.5, 9.2, 48), new THREE.MeshBasicMaterial({ color:0xffd27a, transparent:true, opacity:.22, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending })); gate.add(halo);
    for (let k=0;k<8;k++){ const st = new THREE.Mesh(new THREE.OctahedronGeometry(.7), glowM); const a = k/8*Math.PI*2; st.position.set(Math.cos(a)*11.5, Math.sin(a)*11.5, 0); gate.add(st); }
    STARGATES.push({ x:P[mid].x, y:gy, z:P[mid].z, r:9, ring, halo, used:new Set() });
    HAZ.updaters.push((t) => { ring.rotation.z = t*.6; halo.material.opacity = .18 + Math.sin(t*3)*.08; }); }
  // steel grating shoulders between the curb and the rail, in runs that stop at every gap
  { const grate = new THREE.MeshLambertMaterial({ color:0x1a2236 });
    for (const sd of [-1,1]){ const skip = i => GAP[i] || mouth(i, sd); let i0 = 0;
      while (i0 < N){ if (skip(i0)){ i0++; continue; } let len = 0; while (i0 + len < N - 1 && !skip(i0 + len + 1)) len++;
        const m = new THREE.Mesh(stripGeo(i0, len, (W/2 + 1.7)*sd, (world.rails + .45)*sd, .02, 1), grate); m.receiveShadow = true; g.add(m); i0 += len + 1; } } }
  // guard rails the whole way round (the physics has a hard rail at world.rails): a low steel bar with a lit cap, cyan left / magenta right
  { const railG = new THREE.BoxGeometry(.32, .5, segLen*2 + .3), capG = new THREE.BoxGeometry(.4, .1, segLen*2 + .3), bar = new THREE.MeshLambertMaterial({ color:0x2a3450 });
    const caps = [new THREE.MeshBasicMaterial({ color:0x5ef0e6 }), new THREE.MeshBasicMaterial({ color:0xff5ad9 })];
    const rails = new THREE.InstancedMesh(railG, bar, N), capL = new THREE.InstancedMesh(capG, caps[0], N/2|0), capR = new THREE.InstancedMesh(capG, caps[1], N/2|0); let nr = 0, nl = 0, nn = 0;
    for (let i=0;i<N;i+=2){ if (GAP[i] || GAP[(i+1)%N] || inTunnel(i)) continue; const yaw = Math.atan2(T[i].x, T[i].z), pitch = -Math.atan(slopeAt(i));
      for (const sd of [-1,1]){ if (mouth(i, sd)) continue; const d = world.rails + .2; o.position.set(P[i].x + R[i].x*d*sd, P[i].y + .3, P[i].z + R[i].z*d*sd); o.rotation.set(pitch, yaw, 0, 'YXZ'); o.updateMatrix(); rails.setMatrixAt(nr++, o.matrix);
        o.position.y = P[i].y + .58; o.updateMatrix(); if (sd > 0) capL.setMatrixAt(nl++, o.matrix); else capR.setMatrixAt(nn++, o.matrix); } }
    rails.count = nr; capL.count = nl; capR.count = nn; g.add(rails); g.add(capL); g.add(capR); }
  // the ring city: orbital pylons and drifting rock far around the track, at many heights
  const towerG = new THREE.BoxGeometry(1,1,1), towers = new THREE.InstancedMesh(towerG, new THREE.MeshLambertMaterial({ color:0x141a2c }), 90), lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({ color:0x9fe0ff }), 90);
  let seed = 3; const rnd2 = () => { seed = (seed*9301 + 49297) % 233280; return seed/233280; }; let n = 0;
  while (n < 90){ const a = rnd2()*Math.PI*2, d = 60 + rnd2()*520, x = Math.cos(a)*d + C.x, z = Math.sin(a)*d + C.z; if (nearTrack(x, z, W/2 + 16)) continue;
    const hgt = 20 + rnd2()*110, wdt = 3 + rnd2()*7, base = -160 + rnd2()*40; o.position.set(x, base + hgt/2, z); o.scale.set(wdt, hgt, wdt); o.rotation.set(0, rnd2()*3, 0); o.updateMatrix(); towers.setMatrixAt(n, o.matrix);
    o.position.y = base + hgt + 1; o.scale.set(wdt*.5, 2, wdt*.5); o.updateMatrix(); lamps.setMatrixAt(n, o.matrix); n++; }
  towers.count = lamps.count = n; g.add(towers); g.add(lamps);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color:0x2a3048 }), 120); n = 0;
  while (n < 120){ const a = rnd2()*Math.PI*2, d = 40 + rnd2()*700, x = Math.cos(a)*d + C.x, z = Math.sin(a)*d + C.z; if (nearTrack(x, z, W/2 + 14)) continue;
    const sc = 2 + Math.pow(rnd2(), 2)*14; o.position.set(x, -60 + rnd2()*230, z); o.scale.set(sc, sc*(.6 + rnd2()*.6), sc); o.rotation.set(rnd2()*3, rnd2()*3, rnd2()*3); o.updateMatrix(); rocks.setMatrixAt(n++, o.matrix); }
  rocks.castShadow = true; g.add(rocks);
  // slow drift so the rocks feel weightless
  HAZ.updaters.push((t, dt) => { rocks.rotation.y = t*.004; });
}
function conduitHazards(g){
  // solar wind across the high deck, like the Aeolian jets
  const arrowT = crossTex((x,w,h)=>{ x.clearRect(0,0,w,h); x.strokeStyle='rgba(255,255,255,.85)'; x.lineWidth=7; x.lineJoin='round'; for (const yy of [32,96]){ x.beginPath(); x.moveTo(20,yy-22); x.lineTo(64,yy); x.lineTo(20,yy+22); x.stroke(); } });
  for (const [f,len,dir] of [[angleIndex(150)/N,12,-1],[angleIndex(200)/N,12,1]]){   // after the landing deck, and on the keyhole's exit leg
    const t = arrowT.clone(); t.needsUpdate = true; t.repeat.set(3, 4); if (dir < 0) t.repeat.x = -3;
    const m = new THREE.Mesh(stripGeo(Math.round(f*N),len,-W/2,W/2,.06,1), new THREE.MeshBasicMaterial({map:t, transparent:true, opacity:.5, color:0xffd27a, depthWrite:false}));
    addZone('wind', f, len, -W/2, W/2, m, {dir});
    HAZ.updaters.push((tt,dt) => { t.offset.x -= dt*1.6; if (Math.random()<.7){ const k = (Math.round(f*N)+Math.random()*len|0)%N, lat = rnd(-W/2,W/2);
      glitter.emit(P[k].x+R[k].x*lat, P[k].y + rnd(.5,4), P[k].z+R[k].z*lat, -R[k].x*dir*rnd(14,22), 0, -R[k].z*dir*rnd(14,22), rnd(.2,.4), rnd(.4,.8)); } });
  }
};

/* ---------- per-world hazards ---------- */
function crossTex(draw, w=128, h=128){ const t = textTex(w,h,draw); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
const HAZARDS = {
  desert(g){
    // sand drifts on part of the road: soft sand slows everyone but the rally trucks
    const sandT = crossTex((x,w,h)=>{ x.clearRect(0,0,w,h); for (let i=0;i<9;i++){ x.strokeStyle='rgba(231,196,140,.95)'; x.lineWidth=10; x.beginPath(); for (let u=0;u<=w;u+=8){ const y=i*h/9+Math.sin(u*.08+i)*4; u?x.lineTo(u,y):x.moveTo(u,y);} x.stroke(); } });
    const sandM = new THREE.MeshLambertMaterial({map:sandT, transparent:true, color:0xead2a2});
    for (const [f,len,a,b] of [[.25,16,-10,-1],[.52,16,1,10],[.73,14,-10,-2]]) addZone('sand', f, len, a, b, new THREE.Mesh(stripGeo(Math.round(f*N),len,a,b,.06,4), sandM));
    // tumbleweeds roll across the road
    const twGeo = new THREE.IcosahedronGeometry(1.3, 1), twMat = new THREE.MeshLambertMaterial({color:0x9a7a46, wireframe:true});
    for (const [f,ph] of [[.12,0],[.34,9],[.46,4],[.64,14],[.88,7]]){
      const base = atTrack(f,0); const m = new THREE.Mesh(twGeo, twMat); m.castShadow = true; g.add(m);
      const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(.9,0), new THREE.MeshLambertMaterial({color:0x7a5a30, wireframe:true})); m.add(inner);
      const o = addSolid({i:base.i, lat:0, r:1.4, soft:.22, x:base.x, z:base.z, mesh:m, half:1.4});
      HAZ.updaters.push(t => { const span = 50, s = ((t*7 + ph*4) % span) - span/2; o.lat = s; const i=base.i;
        o.x = P[i].x + R[i].x*s; o.z = P[i].z + R[i].z*s; const hop = Math.abs(Math.sin(t*5+ph))*1.2;
        m.position.set(o.x, 1.3+hop, o.z); m.rotation.set(t*4+ph, 0, t*3); });
    }
  },
  forge(g){
    // lava fissures across part of the road (stonewright tanks barely notice them)
    const lavaM = new THREE.ShaderMaterial({ uniforms:{uT:{value:0}}, transparent:true, depthWrite:false,
      vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform float uT;varying vec2 vU;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}void main(){float e=smoothstep(0.,.25,vU.y)*smoothstep(1.,.75,vU.y);float k=n(vec2(vU.x*9.,vU.y*3.-uT*.6))*.6+n(vec2(vU.x*21.+uT,vU.y*7.))*.4;vec3 c=mix(vec3(.9,.18,.02),vec3(1.,.85,.35),k);gl_FragColor=vec4(c*(.75+.5*k),e*.98);}' });
    HAZ.updaters.push(t => { lavaM.uniforms.uT.value = t; });
    for (const [f,a,b] of [[.2,-10,3],[.47,-3,10],[.69,-10,2],[.9,-1,10]]){ if (inCanyonSpan(Math.round(f*N))) continue; addZone('lava', f, 4, a, b, new THREE.Mesh(stripGeo(Math.round(f*N),4,a,b,.07,1), lavaM)); }
    // basalt pillars standing in the racing line
    const pGeo = new THREE.CylinderGeometry(1.9, 2.2, 1, 6); pGeo.translate(0,.5,0);
    const pMat = new THREE.MeshLambertMaterial({color:0x34302d}), capM = new THREE.MeshBasicMaterial({color:0xff7a2a});
    for (const [f,lat] of [[.31,-4],[.35,5],[.56,0],[.62,-6],[.8,-5],[.84,4]]){
      if (inCanyonSpan(Math.round(f*N) % N)) continue;
      const p = atTrack(f,lat), h = rnd(6,10); const m = new THREE.Mesh(pGeo, pMat); m.scale.y = h; m.position.set(p.x,0,p.z); m.castShadow = m.receiveShadow = true; g.add(m);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.95,1.95,.25,6), capM); cap.position.set(p.x,h,p.z); g.add(cap);
      addSolid({i:p.i, lat, r:2.1, soft:0, x:p.x, z:p.z, half:2.1}); }
  },
  tundra(g){
    // glassy ice sheets: grip drops away (Velkan walkers keep their footing)
    const iceT = crossTex((x,w,h)=>{ x.fillStyle='rgba(200,235,255,.75)'; x.fillRect(0,0,w,h); x.strokeStyle='rgba(255,255,255,.9)'; x.lineWidth=1.5; for (let i=0;i<14;i++){ x.beginPath(); let px=Math.random()*w, py=Math.random()*h; x.moveTo(px,py); for (let k=0;k<4;k++){ px+=rnd(-25,25); py+=rnd(-25,25); x.lineTo(px,py);} x.stroke(); } });
    const iceM = new THREE.MeshStandardMaterial({map:iceT, transparent:true, roughness:.05, metalness:.2, color:0xd8f0ff, envMapIntensity:1});
    for (const [f,len,a,b] of [[.21,22,-10,10],[.5,20,-10,2],[.76,18,-2,10]]) addZone('ice', f, len, a, b, new THREE.Mesh(stripGeo(Math.round(f*N),len,a,b,.06,6), iceM));
    // crystal spires growing out of the road
    const cGeo = new THREE.ConeGeometry(1.6, 1, 6); cGeo.translate(0,.5,0);
    const cMat = new THREE.MeshStandardMaterial({color:0x9fd8ff, roughness:.1, metalness:.15, transparent:true, opacity:.9, emissive:0x3f8fd0, emissiveIntensity:.45});
    for (const [f,lat] of [[.3,3],[.34,-5],[.6,-2],[.65,6],[.88,-3],[.92,5]]){
      const p = atTrack(f,lat); const grp = new THREE.Group(); grp.position.set(p.x,0,p.z);
      for (let k=0;k<4;k++){ const m = new THREE.Mesh(cGeo, cMat); const s=rnd(.5,1); m.scale.set(s, rnd(5,10)*s, s); m.position.set(rnd(-.8,.8),0,rnd(-.8,.8)); m.rotation.set(rnd(-.25,.25),Math.random()*3,rnd(-.25,.25)); m.castShadow=true; grp.add(m); }
      g.add(grp); addSolid({i:p.i, lat, r:1.9, soft:0, x:p.x, z:p.z, half:1.9}); }
  },
  cirrus(g){
    // wind jets: arrow fields that push you sideways (Aeolian jets ride them out)
    const arrowT = crossTex((x,w,h)=>{ x.clearRect(0,0,w,h); x.strokeStyle='rgba(255,255,255,.85)'; x.lineWidth=7; x.lineJoin='round'; for (const yy of [32,96]){ x.beginPath(); x.moveTo(20,yy-22); x.lineTo(64,yy); x.lineTo(20,yy+22); x.stroke(); x.beginPath(); x.moveTo(60,yy-22); x.lineTo(104,yy); x.lineTo(60,yy+22); x.stroke(); } });
    for (const [f,len,dir] of [[.17,18,1],[.57,18,-1],[.82,16,1]]){
      const t = arrowT.clone(); t.needsUpdate = true; t.repeat.set(3, 4);
      const m = new THREE.Mesh(stripGeo(Math.round(f*N),len,-W/2,W/2,.06,1), new THREE.MeshBasicMaterial({map:t, transparent:true, opacity:.55, color:0x9fe8ff, depthWrite:false}));
      if (dir < 0){ t.repeat.x = -3; }
      addZone('wind', f, len, -W/2, W/2, m, {dir});
      HAZ.updaters.push((tt,dt) => { t.offset.x -= dt*1.6; if (Math.random()<.8){ const k = (Math.round(f*N)+Math.random()*len|0)%N, lat = rnd(-W/2,W/2);
        glitter.emit(P[k].x+R[k].x*lat, P[k].y + rnd(.5,4), P[k].z+R[k].z*lat, -R[k].x*dir*rnd(14,22), 0, -R[k].z*dir*rnd(14,22), rnd(.2,.4), rnd(.4,.8)); } });
    }
    // energy gates: half-width barriers that pulse on and off
    const pylon = new THREE.MeshLambertMaterial({color:0x2a3466});
    for (const [f,side,ph] of [[.28,-1,0],[.42,1,1.3],[.7,-1,.6],[.92,1,2]]){
      const p0 = atTrack(f,0), i = p0.i, latC = side*5;
      const grp = new THREE.Group(); grp.position.set(P[i].x+R[i].x*latC, P[i].y, P[i].z+R[i].z*latC); grp.rotation.y = Math.atan2(R[i].x,R[i].z) + Math.PI/2; g.add(grp);
      for (const s of [-5.3,5.3]){ const py = new THREE.Mesh(new THREE.BoxGeometry(.8,5,.8), pylon); py.position.set(s,2.5,0); py.castShadow=true; grp.add(py); }
      const fieldM = new THREE.MeshBasicMaterial({color:0x40e0ff, transparent:true, opacity:.6, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending});
      const field = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 4.2), fieldM); field.position.y = 2.4; grp.add(field);
      const on = t => ((t + ph) % 3.8) < 2.2;
      HAZ.updaters.push(t => { const a = on(t); const warn = ((t+ph)%3.8) > 3.3;
        fieldM.opacity = a ? .5 + .15*Math.sin(t*20) : (warn ? .25*(Math.sin(t*30)>0?1:0) : .04); fieldM.color.setHex(a ? 0x40e0ff : 0xff5a8a); });
      for (const d of [-3.4,0,3.4]){ const lat = latC + d; addSolid({i, lat, r:1.9, soft:0, x:P[i].x+R[i].x*lat, z:P[i].z+R[i].z*lat, active:()=>on(clockT), half:1.9}); }
      for (const d of [-5.3,5.3]){ const lat = latC + d; addSolid({i, lat, r:.75, soft:0, x:P[i].x+R[i].x*lat, z:P[i].z+R[i].z*lat, half:.75}); }   // the pylons stand whether the field is up or not
    }
  },
  quarry(g){
    // craters gouged into the haul road: a hard jolt (cargo walkers step through)
    const crT = crossTex((x,w,h)=>{ x.clearRect(0,0,w,h); const gr = x.createRadialGradient(w/2,h/2,4,w/2,h/2,w/2); gr.addColorStop(0,'rgba(30,22,18,.95)'); gr.addColorStop(.7,'rgba(70,50,40,.8)'); gr.addColorStop(.85,'rgba(150,130,115,.9)'); gr.addColorStop(1,'rgba(150,130,115,0)'); x.fillStyle=gr; x.fillRect(0,0,w,h); });
    const crM = new THREE.MeshLambertMaterial({map:crT, transparent:true, depthWrite:false});
    for (const [f,a,b] of [[.36,-9,-1],[.62,0,9],[.86,-4,5]]) addZone('crater', f, 6, a, b, new THREE.Mesh(stripGeo(Math.round(f*N),6,a,b,.06,1), crM));
    // stacks of cargo crates left in the lanes
    const crateT = textTex(128,128,(x,w,h)=>{ x.fillStyle='#c98a2a'; x.fillRect(0,0,w,h); x.strokeStyle='#5a3a12'; x.lineWidth=8; x.strokeRect(4,4,w-8,h-8); x.beginPath(); x.moveTo(8,8); x.lineTo(w-8,h-8); x.moveTo(w-8,8); x.lineTo(8,h-8); x.stroke(); x.fillStyle='#1a1a1a'; x.font='bold 22px Impact, sans-serif'; x.fillText('HK-3',38,72); });
    const crateM = new THREE.MeshLambertMaterial({map:crateT}), bGeo = new THREE.BoxGeometry(2.6,2.6,2.6);
    for (const [f,lat] of [[.24,-5],[.27,4],[.5,-1],[.53,6],[.78,-6],[.81,2],[.94,-2]]){
      const p = atTrack(f,lat), yaw = Math.random()*3, grp = new THREE.Group(); grp.position.set(p.x,0,p.z); grp.rotation.y = yaw;
      // 1–3 crates: the bottom ones stand side by side, just touching (never inside each other); a third sits on top, straddling them
      const nb = 1 + Math.random()*3|0, S = 2.6, base = nb === 1 ? [[0, 0]] : [[-(S + .12)/2, rnd(-.3, .3)], [(S + .12)/2, rnd(-.3, .3)]];
      const crate = (x, y, z, ry) => { const m = new THREE.Mesh(bGeo, crateM); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; grp.add(m); };
      for (const [x, z] of base) crate(x, S/2, z, rnd(-.05, .05));
      if (nb === 3) crate(rnd(-.25, .25), S*1.5, rnd(-.15, .15), rnd(-.2, .2));
      g.add(grp);
      for (const [x, z] of base){ const wx = p.x + Math.cos(yaw)*x + Math.sin(yaw)*z, wz = p.z - Math.sin(yaw)*x + Math.cos(yaw)*z;   // one collision circle per crate, covering its corners
        addSolid({i:p.i, lat:(wx - P[p.i].x)*R[p.i].x + (wz - P[p.i].z)*R[p.i].z, r:1.8, soft:0, x:wx, z:wz, half:1.8}); } }
  },
};

/* ---------- racing lines: minimum-curvature path through each world, computed when the world is built ---------- */
const RL = { road:new Float32Array(N), wide:new Float32Array(N), kRoad:new Float32Array(N), kWide:new Float32Array(N) };
function racingLine(out, bound){
  // elastic band: pull every point toward the midpoint of its neighbours, keep it inside the bounds
  out.fill(0);
  const px = i => P[i].x + R[i].x*out[i], pz = i => P[i].z + R[i].z*out[i];
  for (const [k, iters] of [[14,140],[7,120],[3,60]]){
    for (let it=0; it<iters; it++) for (let i=0;i<N;i++){
      const a = (i-k+N)%N, b = (i+k)%N;
      const mx = (px(a)+px(b))/2, mz = (pz(a)+pz(b))/2;
      const want = (mx-P[i].x)*R[i].x + (mz-P[i].z)*R[i].z;
      out[i] = clamp(out[i] + (want-out[i])*.6, -bound, bound);
    }
  }
}
function lineCurvature(lat, out){
  const k = 4, px = i => P[i].x + R[i].x*lat[i], pz = i => P[i].z + R[i].z*lat[i];
  for (let i=0;i<N;i++){
    const a = (i-k+N)%N, b = (i+k)%N;
    const ax = px(a), az = pz(a), bx = px(i), bz = pz(i), cx = px(b), cz = pz(b);
    const cr = Math.abs((bx-ax)*(cz-az) - (bz-az)*(cx-ax));
    const d = Math.hypot(bx-ax,bz-az)*Math.hypot(cx-bx,cz-bz)*Math.hypot(cx-ax,cz-az);
    out[i] = d > 1e-6 ? 2*cr/d : 0;
  }
  // light smoothing so single-sample spikes don't cause panic braking
  const tmp = Float32Array.from(out);
  for (let i=0;i<N;i++){ let s = 0; for (let j=-3;j<=3;j++) s += tmp[(i+j+N)%N]; out[i] = s/7; }
}
function buildRacingLines(){
  racingLine(RL.road, W/2 - 2.4); lineCurvature(RL.road, RL.kRoad);
  racingLine(RL.wide, W/2 + 2.5); lineCurvature(RL.wide, RL.kWide);
}
// fastest speed a vehicle can hold through curvature k, from its own steering model (see step())
function cornerSpeed(prof, k){
  const grip = Math.pow(clamp(prof.gripRoad/7.5, .65, 1.4), .45);
  const v = prof.pivot ? prof.turn/(k + prof.turn*.42/MAXS) : prof.turn/(k + 1.05/MAXS);
  return v*grip;
}
// per-car table of the speed it may carry at each track index (rebuilt when the world or vehicle changes)
function speedPlan(c, roadOnly){
  const wide = c.prof.offMax >= .8 && !roadOnly, key = world.id + c.kind + wide;
  if (c._plan && c._planKey === key) return c._plan;
  const k = wide ? RL.kWide : RL.kRoad, v = new Float32Array(N);
  for (let i=0;i<N;i++) v[i] = Math.min(cornerSpeed(c.prof, k[i]), MAXS*1.6);
  c._plan = v; c._planKey = key; c._planWide = wide; return v;
}

let clockT = 0;                                   // world clock (pauses with the game) for gates and movers
function disposeTree(o){ o.traverse(m => { if (m.geometry) m.geometry.dispose(); const mats = m.material ? (Array.isArray(m.material)?m.material:[m.material]) : []; mats.forEach(mt => { for (const k in mt) if (mt[k] && mt[k].isTexture) mt[k].dispose(); mt.dispose(); }); }); }

/* ---------- every surface lit per pixel ----------
   Lambert materials light at their vertices only, so a lamp or the UFO's glow on a big flat mesh (a ground plane, a curb strip, a deck,
   a terrain tile) comes out as a flat patch cut off along the triangle it fell in. Each one is swapped for the same look in a
   per-pixel material (no specular, so it shades exactly like the Lambert did) before the ink pass wires it up. */
const _ppCache = new Map();
function perPixelMat(m){
  if (!m || !m.isMeshLambertMaterial) return m;
  let n = _ppCache.get(m.uuid); if (n) return n;
  n = new THREE.MeshPhongMaterial({ color:m.color, map:m.map, emissive:m.emissive, emissiveMap:m.emissiveMap, emissiveIntensity:m.emissiveIntensity, alphaMap:m.alphaMap, envMap:m.envMap, reflectivity:m.reflectivity,
    vertexColors:m.vertexColors, transparent:m.transparent, opacity:m.opacity, side:m.side, fog:m.fog, alphaTest:m.alphaTest, depthWrite:m.depthWrite, depthTest:m.depthTest, blending:m.blending,
    polygonOffset:m.polygonOffset, polygonOffsetFactor:m.polygonOffsetFactor, polygonOffsetUnits:m.polygonOffsetUnits, wireframe:m.wireframe, specular:0x000000, shininess:1 });
  n.name = m.name; Object.assign(n.userData, m.userData); if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) n.onBeforeCompile = m.onBeforeCompile;
  _ppCache.set(m.uuid, n); return n;
}
function perPixelLights(root){ root.traverse(o => { if (!o.isMesh || !o.material) return; o.material = Array.isArray(o.material) ? o.material.map(perPixelMat) : perPixelMat(o.material); }); }
function buildWorld(id){
  world = WORLDS[id] || WORLDS.desert;
  // clear the previous world
  scene.remove(worldGroup); disposeTree(worldGroup); worldGroup = new THREE.Group(); scene.add(worldGroup);
  clearVolcanoDebris(); VOLC.length = 0;
  HAZ.solids.length = 0; HAZ.zones.length = 0; HAZ.updaters.length = 0; TIDY.length = 0; SKYLOOP = null;
  // atmosphere and light
  if (skyDome.material.map) skyDome.material.map.dispose();
  skyDome.material.map = skyTexture(world); skyDome.material.needsUpdate = true; buildCelestial(world);
  skyScene.background = new THREE.Color(world.bg); scene.background = null;
  scene.fog = new THREE.Fog(world.fog[0], world.fog[1], world.fog[2]);
  hemi.color.setHex(world.hemi[0]); hemi.groundColor.setHex(world.hemi[1]); hemi.intensity = world.hemi[2];
  sun.color.setHex(world.sun[0]); sun.intensity = world.sun[1]; SUN_OFF.set(...world.sunDir);
  // track geometry
  const S = 1.65, ctrl = world.ctrl.map(p => new THREE.Vector3(p[0]*S, 0, p[1]*S));
  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
  P.length = T.length = R.length = 0;
  for (let i=0;i<N;i++){ const t = i/N; const p = curve.getPointAt(t); const tg = curve.getTangentAt(t).setY(0).normalize(); P.push(p); T.push(tg); R.push(new THREE.Vector3(tg.z,0,-tg.x)); }
  segLen = curve.getLength()/N;
  easeHairpins();
  const bb = new THREE.Box3().setFromPoints(P); bb.getCenter(TRACK_C); TRACK_R = bb.getSize(new THREE.Vector3()).length()/2;
  NOROAD.fill(0); LOOPSPAN = null;
  if (world.loop){ const i0 = (Math.round(world.loop.frac*N) + world.loop.gap) % N, sp = LOOPK.span(world.loop.height, segLen), side = Math.sign(R[i0].x*(TRACK_C.x - P[i0].x) + R[i0].z*(TRACK_C.z - P[i0].z)) || 1;   // the drift goes to the inside of the bend
    loopStraighten(i0, sp, 30, world.loop.shift, side); LOOPSPAN = { i0, i1:(i0 + sp) % N, span:sp, side }; }
  buildElevation();
  buildRacingLines();
  // ground
  const gTex = noiseTex(world.ground[0], world.ground[1], 256, world.ground[2]); gTex.repeat.set(220,220);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4400,4400), new THREE.MeshLambertMaterial({map:gTex}));
  ground.rotation.x = -Math.PI/2; ground.position.set(TRACK_C.x, world.groundY || 0, TRACK_C.z); ground.receiveShadow = true; if (!world.customGround) worldGroup.add(ground);
  // road + curbs
  const rd = world.road;
  const rTex = noiseTex(rd[0], rd[1], 256, (x,s)=>{ for (const u of [.27,.73]) { const g = x.createLinearGradient((u-.09)*s,0,(u+.09)*s,0); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(.5,rd[2]); g.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0,0,s,s); } });
  { const pos=[], uv=[], idx=[];
    for (let i=0;i<=N;i++){ const k=i%N, p=P[k], r=R[k];
      pos.push(p.x-r.x*W/2, p.y+.04, p.z-r.z*W/2, p.x+r.x*W/2, p.y+.04, p.z+r.z*W/2); uv.push(0, i*segLen/14, 1, i*segLen/14);
      if (i<N && !GAP[k] && !NOROAD[k]){ const a=i*2; idx.push(a,a+2,a+1, a+1,a+2,a+3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({map:rTex, specular:0x000000, shininess:1, side:THREE.DoubleSide})); m.receiveShadow = true; worldGroup.add(m); ROAD_MAT = m.material;   // lit per pixel: the road's only vertices are at its edges, so a headlamp has to be shaded in the fragment
    const cp=[], cc=[]; const cA = new THREE.Color(world.curb[0]), cB = new THREE.Color(world.curb[1]);
    for (let i=0;i<N;i++){ const j=(i+1)%N; const col = (Math.floor(i/3)%2)?cA:cB; if (GAP[i] || NOROAD[i] || (vaultK() && inTunnel(i))) continue;   // no kerbs in the Vault: the bore has its own floor
      for (const side of [-1,1]){ const a0=W/2*side, a1=(W/2+1.7)*side;
        const q=[[P[i],R[i],a0],[P[i],R[i],a1],[P[j],R[j],a0],[P[j],R[j],a1]].map(([p,r,o])=>[p.x+r.x*o,p.y+.07,p.z+r.z*o]);
        const tri = side>0 ? [0,2,1,1,2,3] : [0,1,2,1,3,2]; for (const t of tri){ cp.push(...q[t]); cc.push(col.r,col.g,col.b); } } }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp,3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(cc,3)); cg.computeVertexNormals();
    const curb = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({vertexColors:true})); curb.receiveShadow = true; worldGroup.add(curb); }
  // start gate
  { const gw = world.gate, g = new THREE.Group(); g.position.copy(P[0]); g.rotation.y = Math.atan2(T[0].x,T[0].z);
    const post = new THREE.MeshLambertMaterial({color:gw.post});
    for (const s of [-1,1]){ const m = new THREE.Mesh(new THREE.BoxGeometry(.9,8.6,.9), post); m.position.set(s*(W/2+2.6),4.3,0); m.castShadow=true; g.add(m); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W+6.4,2.2,.6), post); beam.position.y = 8.2; beam.castShadow = true; g.add(beam);
    const tex = textTex(1024,96,(x,w,h)=>{ x.fillStyle=gw.bg; x.fillRect(0,0,w,h); x.fillStyle=gw.fg; x.font='bold 54px Impact, Arial Black, sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(world.banner,w/2,h/2+2); x.fillStyle=gw.line; x.fillRect(0,0,w,6); x.fillRect(0,h-6,w,6); });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(W+6,2), new THREE.MeshBasicMaterial({map:tex})); pl.position.set(0,8.2,-.31); pl.rotation.y = Math.PI; g.add(pl);
    const chk = textTex(256,32,(x,w,h)=>{ for(let i=0;i<16;i++)for(let j=0;j<2;j++){ x.fillStyle=(i+j)%2?'#111':'#f4f0e6'; x.fillRect(i*16,j*16,16,16);} });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(W,2), new THREE.MeshLambertMaterial({map:chk})); line.rotation.x=-Math.PI/2; line.position.y=.06; g.add(line);
    worldGroup.add(g); }
  // boost pads: chevrons point the way you drive
  BOOST_MESH = [];
  BOOSTS = [.16,.4,.6,.84].map(f => Math.round(f*N)).map(i => { let k = i, tries = 0; while ((GAP[k] || (JUMPS.some(j => ((k - j.lip + N) % N) > N - 16))) && tries++ < 60) k = (k + 1) % N; return k; }).filter(k => !inCanyonSpan(k));   // the Meltdown Gap has its own long amplifier
  BOOST_LONG = [];
  if (CANYON){ const a = (CANYON.lip - 25 + N) % N, len = 14;                          // a long speed amplifier on the causeway, ending where the kicker starts to rise
    for (let k=0;k<=len;k+=2) BOOST_LONG.push((a + k) % N);
    const tex = textTex(128, 256, (x, w, h) => { x.fillStyle = 'rgba(255,140,40,.28)'; x.fillRect(0, 0, w, h); x.strokeStyle = '#ffd36a'; x.lineWidth = 16; x.lineJoin = 'round'; x.shadowColor = 'rgba(255,120,30,1)'; x.shadowBlur = 12;
      for (let k=0;k<2;k++){ const y = 170 - k*110; x.beginPath(); x.moveTo(14, y); x.lineTo(64, y - 52); x.lineTo(114, y); x.stroke(); } });
    tex.wrapT = THREE.RepeatWrapping; const am = new THREE.MeshBasicMaterial({ map:tex, transparent:true, depthWrite:false });
    const strip = new THREE.Mesh(stripGeo(a, len, -4.2, 4.2, .1, len*segLen/9), am); strip.renderOrder = 3; strip.userData.noSolid = true; worldGroup.add(strip);
    const glow = new THREE.MeshBasicMaterial({ color:0xffa040 }); for (const sd of [-1, 1]){ const e = new THREE.Mesh(stripGeo(a, len, sd*4.4 - .15, sd*4.4 + .15, .11, 1), glow); e.userData.noSolid = true; worldGroup.add(e); }
    HAZ.updaters.push((t) => { tex.offset.y = -t*1.6; glow.color.setRGB(1, .55 + .25*Math.sin(t*9), .2); }); }
  { const tex = textTex(128,256,(x,w,h)=>{ x.fillStyle=world.padFill; x.fillRect(0,0,w,h); x.strokeStyle=world.pad; x.lineWidth=14; x.lineJoin='round';
      for (let k=0;k<3;k++){ const y=200-k*70; x.beginPath(); x.moveTo(18,y); x.lineTo(64,y-46); x.lineTo(110,y); x.stroke(); } });
    const mat = new THREE.MeshBasicMaterial({map:tex, transparent:true, depthWrite:false});
    for (const i of BOOSTS){ const m = new THREE.Mesh(new THREE.PlaneGeometry(6,11), mat); m.rotation.order='YXZ';
      m.rotation.y = Math.atan2(T[i].x,T[i].z) + Math.PI;   // the texture's chevrons point to the plane's -z after laying it flat; turn it to face travel
      m.rotation.x = -Math.PI/2; m.position.set(P[i].x,P[i].y+.09,P[i].z); worldGroup.add(m); BOOST_MESH.push(m); } }
  // trackside posts
  { const step = 18, count = Math.floor(N/step)*2;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(.32,1.5,.32), new THREE.MeshLambertMaterial(), count);
    const o = new THREE.Object3D(); let n=0; const a = new THREE.Color(world.post[0]), b = new THREE.Color(world.post[1]);
    for (let i=0;i<N;i+=step) for (const s of [-1,1]){ if(n>=count)break; if (GAP[i] || CRAIL[i] || world.rails) continue; o.position.set(P[i].x+R[i].x*(W/2+3.4)*s,P[i].y+.75,P[i].z+R[i].z*(W/2+3.4)*s); o.updateMatrix(); im.setMatrixAt(n,o.matrix); im.setColorAt(n,(n%4<2)?a:b);
      tidyAdd({ kind:'post', parts:[{ obj:im, k:n }], i, lat:(W/2+3.4)*s, y0:0, y1:1.5, pts:[[0,0]], r:.25, pri:2 }); n++; }
    im.count = n; im.castShadow = true; worldGroup.add(im); }
  roadside(worldGroup);
  try { buildCut(worldGroup); } catch(e){ console.warn('cut', e); CUT = null; }
  STARGATES = [];
  (world.id === 'hive' ? hiveScenery : (SCENERY[world.id] || conduitScenery))(worldGroup); if (world.id === 'hive') hiveTunnel(worldGroup);
  try { perPixelLights(worldGroup); } catch(e){ console.warn('perpixel', e); }
  try { inkPatchTree(worldGroup); } catch(e){ console.warn('ink', e); }
  try { for (const c of cars) inkPatchTree(c.group); } catch(_){}   // first build runs before the cars exist; they are patched when their rigs are made
  const hzFrom = worldGroup.children.length;
  (world.id === 'hive' ? hiveHazards : (HAZARDS[world.id] || conduitHazards))(worldGroup);
  try { fitHazards(worldGroup.children.slice(hzFrom)); } catch(e){ console.warn('fitHazards', e); }
  try { perPixelLights(worldGroup); inkPatchTree(worldGroup); } catch(e){ console.warn('perpixel', e); }   // hazards are built after the first pass
  try { tidyRoadside(); } catch(e){ console.warn('tidy', e); }
  try { propSolids(); } catch(e){ console.warn('props', e); }
  if (playerLamp) playerLamp.visible = !!world.dark;
  try { dust.material.uniforms.col.value.setHex(world.dust); } catch(_){}
  try { buildMap(); } catch(_){}
}

/* ---------- tidy the roadside: a small marker never stands inside something else ----------
   Studs, posts, flags, chevron boards and 3-2-1 boards are laid out by simple rules (every so many metres, at a set offset from
   the curb), so on some tracks one lands inside a gantry leg, the start gate, a building, a rock, or another marker. Once the
   world is built, each marker is checked against everything solid around it, the most important first (3-2-1 boards, then
   chevrons, flags, posts, studs). One that collides slides along the road to the nearest free spot within ~10 samples, or is
   left out if there isn't one. Markers that stay become obstacles for the ones checked after them. */
// Hazards are drawn by hand and given a collision circle by hand; the two drift apart (an ice spike drawn 2.5 m wide with a 1.9 m circle,
// a pillar wider than its circle), so cars drove into what they could see. After the hazards are built, size each fixed hazard's circle to
// what is actually drawn around it at bumper height. Then move any boost pad that ended up under a hazard to the nearest clear stretch.
let BOOST_MESH = [], BOOST_LONG = [];   // BOOST_LONG: sample indices of a long speed amplifier strip (pads every 2 samples, fixed in place)
function fitHazards(hzObjs){
  const fixed = HAZ.solids.filter(s => !s.rail && !s.prop && !s.dyn && !s.active && isFinite(s.x));
  if (fixed.length){
    const far = new Array(fixed.length).fill(0), M = new THREE.Matrix4(), v = new THREE.Vector3();
    for (const root of hzObjs) root.traverse(o => {
      if (!o.isMesh || !o.visible || !o.geometry || !o.geometry.attributes.position || o.isSprite) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.wireframe || m.blending === THREE.AdditiveBlending || (m.transparent && m.opacity < .6)) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); o.updateMatrixWorld(true);
      const pa = o.geometry.attributes.position, n = o.isInstancedMesh ? o.count : 1;
      for (let k = 0; k < n; k++){
        if (o.isInstancedMesh){ o.getMatrixAt(k, M); M.premultiply(o.matrixWorld); } else M.copy(o.matrixWorld);
        if (o.geometry.boundingSphere.radius*M.getMaxScaleOnAxis() > 12) continue;          // strips, zones and ribbons are surfaces, not obstacles
        for (let q = 0; q < pa.count; q++){ v.fromBufferAttribute(pa, q).applyMatrix4(M);
          let bi = -1, bd = 1e9; for (let j = 0; j < fixed.length; j++){ const s = fixed[j], d = Math.hypot(v.x - s.x, v.z - s.z); if (d < bd){ bd = d; bi = j; } }
          if (bi < 0 || bd > fixed[bi].r + 3) continue; const gy = H[fixed[bi].i] || 0;
          if (v.y < gy + .2 || v.y > gy + 2.4) continue;                                     // only what a bumper or a body can touch
          if (bd > far[bi]) far[bi] = bd; } } });
    fixed.forEach((s, j) => { if (far[j] > s.r + .25){ s.r = Math.min(far[j]*.95, s.r + 2.5); s.half = s.r; } });
  }
  // boost pads (6 m wide, 11 m long, centred on the road) that sit under a hazard move along to the nearest clear stretch
  const clash = k => GAP[k] || JUMPS.some(j => ((k - j.lip + N) % N) > N - 16) || HAZ.solids.some(s => !s.rail && !s.prop && !s.dyn && isFinite(s.x) && (() => { let d = (s.i - k + N) % N; if (d > N/2) d -= N; return Math.abs(d)*segLen < 5.5 + s.r && Math.abs(s.lat || 0) < 3 + s.r; })());
  BOOSTS.forEach((i, b) => { if (!clash(i)) return;
    for (const d of [3, -3, 5, -5, 7, -7, 9, -9, 12, -12, 15, -15, 20, -20, 25, -25, 30]){ const k = (i + d + N) % N; if (clash(k)) continue;
      BOOSTS[b] = k; const m = BOOST_MESH[b]; if (m){ m.position.set(P[k].x, P[k].y + .09, P[k].z); m.rotation.y = Math.atan2(T[k].x, T[k].z) + Math.PI; } break; } });
}
const TIDY = [];
let TIDY_REPORT = null;
function tidyAdd(it){ TIDY.push(it); return it; }
// the markers between samples i0..i0+len that reach past the deck edge (a bridge over a drop) are left out: there is only air under them
function tidyOffDeck(i0, len, edge){ for (const it of TIDY){ if (it.hidden) continue; const d = (it.i - i0 + N) % N; if (d > len) continue;
    const reach = Math.abs(it.lat) + Math.max(...it.pts.map(([a]) => Math.abs(a))) + it.r; if (reach > edge - .1){ tidyHide(it); it.why = 'over the drop'; } } }
// a marker's slot has a floor under it? not beside a kicker ramp (the road rises, the ground does not), nor past the edge of a raised deck
function tidyFloorAt(it, j){
  const reach = Math.abs(it.lat) + Math.max(...it.pts.map(([a]) => Math.abs(a))) + it.r;
  if (world.deck && (H[j] || 0) > .3 && reach > world.deck - .3) return false;
  if (world.rails && CUT){ const dA = (j - CUT.iA + N) % N, dB = (CUT.iB - j + N) % N;             // the shoulder is cut away where the shortcut passes through the rail (as conduitScenery lays it)
    if (dA <= 34 || dB <= 34){ const s = (P[j].x - CUT.A.x)*CUT.dir.x + (P[j].z - CUT.A.z)*CUT.dir.z, qx = CUT.A.x + CUT.dir.x*s, qz = CUT.A.z + CUT.dir.z*s, cl = (qx - P[j].x)*R[j].x + (qz - P[j].z)*R[j].z;
      if (Math.sign(cl) === Math.sign(it.lat) && Math.abs(Math.abs(cl) - world.rails) < CUT.half + 1.2) return false; } }
  if (!world.rails) for (const jp of JUMPS){ const d = (j - (jp.lip - jp.ramp) + N) % N; if (d <= jp.ramp && (H[j] || 0) - (H[(jp.lip - jp.ramp + N) % N] || 0) > .3 && reach > W/2 + 1.4) return false; }
  return true; }
const _tm = new THREE.Matrix4(), _tb = new THREE.Box3(), _tp = new THREE.Vector3(), _tq = new THREE.Quaternion(), _ts = new THREE.Vector3(), _tqy = new THREE.Quaternion(), _tY = new THREE.Vector3(0, 1, 0);
function tidyRoadside(){
  // obstacles are kept as oriented boxes (their own box in their own frame), filed in an 8 m grid by their world bounds:
  // a board standing at an angle only blocks where the board is, not the whole square around it
  const CELL = 8, grid = new Map(), key = (cx, cz) => cx*73856093 ^ cz*19349663, I4 = new THREE.Matrix4();
  const insert = ob => { const b = ob.wb; for (let cx = Math.floor(b.min.x/CELL); cx <= Math.floor(b.max.x/CELL); cx++) for (let cz = Math.floor(b.min.z/CELL); cz <= Math.floor(b.max.z/CELL); cz++){ const k = key(cx, cz); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(ob); } };
  const pv = new THREE.Vector3();
  const hit = (x, z, ys, r) => { const a = grid.get(key(Math.floor(x/CELL), Math.floor(z/CELL))); if (!a) return null;
    for (const ob of a){ const b = ob.wb; if (x < b.min.x - r || x > b.max.x + r || z < b.min.z - r || z > b.max.z + r) continue;
      for (const y of ys){ if (y < b.min.y || y > b.max.y) continue; pv.set(x, y, z).applyMatrix4(ob.inv); const lb = ob.lb, mx = r/ob.s.x, my = .02/ob.s.y, mz = r/ob.s.z;   // the margin is a marker's width, sideways only
        if (pv.x > lb.min.x - mx && pv.x < lb.max.x + mx && pv.y > lb.min.y - my && pv.y < lb.max.y + my && pv.z > lb.min.z - mz && pv.z < lb.max.z + mz) return ob; } }
    return null; };
  // everything solid near the road that is not itself a movable marker; very large pieces (terrain, the road, skirts, banners) are left out,
  // and so are surfaces to stand on: slabs and decks (thin for their size) and sheets lying on the ground (decals, pools, drifts)
  const mine = new Set(); for (const it of TIDY) for (const p of it.parts) mine.add(p.obj || p);
  worldGroup.updateMatrixWorld(true);
  worldGroup.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.visible || mine.has(o) || o.userData.noSolid) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.blending === THREE.AdditiveBlending || (m.transparent && m.opacity < .35) || (m.userData && m.userData.fx) || m.wireframe) return;
    const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const gb = g.boundingBox; if (!gb || gb.isEmpty()) return;
    const n = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < n; k++){
      if (o.isInstancedMesh){ o.getMatrixAt(k, _tm); _tm.premultiply(o.matrixWorld); } else _tm.copy(o.matrixWorld);
      _tm.decompose(_tp, _tq, _ts); const s3 = new THREE.Vector3(Math.abs(_ts.x) || 1e-6, Math.abs(_ts.y) || 1e-6, Math.abs(_ts.z) || 1e-6);
      const lx = (gb.max.x - gb.min.x)*s3.x, ly = (gb.max.y - gb.min.y)*s3.y, lz = (gb.max.z - gb.min.z)*s3.z;
      if (ly < .8 && Math.max(lx, lz) > 3) continue;
      { const thin = Math.min(lx, ly, lz); if (thin < .05){ _tp.set(lx === thin ? 1 : 0, lx === thin ? 0 : ly === thin ? 1 : 0, lx === thin || ly === thin ? 0 : 1).applyQuaternion(_tq); if (Math.abs(_tp.y) > .5) continue; } }
      const wb = gb.clone().applyMatrix4(_tm);
      if (wb.max.x - wb.min.x > 16 || wb.max.z - wb.min.z > 16 || wb.max.y - wb.min.y < .3) continue;
      insert({ wb, lb:gb, inv:_tm.clone().invert(), s:s3, src:o }); } });
  const big = [], _ray = new THREE.Raycaster(), _rp = new THREE.Vector3(), _rd = new THREE.Vector3(1, 0, 0);
  worldGroup.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.visible || mine.has(o) || o.userData.noSolid) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!m || (m.transparent && m.opacity < .6) || m.wireframe || m.blending === THREE.AdditiveBlending || (m.userData && m.userData.fx)) return;
    const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const gb = g.boundingBox; if (!gb || gb.isEmpty()) return;
    const wb = gb.clone().applyMatrix4(o.matrixWorld), lx = wb.max.x - wb.min.x, lz = wb.max.z - wb.min.z, ly = wb.max.y - wb.min.y, tris = g.index ? g.index.count/3 : g.attributes.position.count/3;
    if (Math.max(lx, lz) <= 16 || Math.max(lx, lz) > 260 || ly < 2 || ly > 400 || tris > 40000 || lx*lz > 20000 && ly < 8) return;   // not terrain sheets, decks, the road
    big.push({ o, wb, m, side:m.side }); });
  const inBig = (it, j) => { if (!big.length) return false; const p = P[j], r = R[j], x = p.x + r.x*it.lat, z = p.z + r.z*it.lat, y = p.y + (it.y0 + it.y1)/2;
    for (const b of big){ const wb = b.wb; if (x < wb.min.x || x > wb.max.x || z < wb.min.z || z > wb.max.z || y < wb.min.y || y > wb.max.y) continue;
      b.m.side = THREE.DoubleSide; _rp.set(x, y, z); _ray.set(_rp, _rd); _ray.far = wb.max.x - x + 5; const n = _ray.intersectObject(b.o, false).length; b.m.side = b.side;
      if (n % 2 === 1) return true; }
    return false; };
  // where a marker would stand at sample j: its footprint points, each tested at the marker's foot (above the deck), middle and top
  const ptsAt = (it, j) => { const p = P[j], r = R[j], t = T[j], ax = p.x + r.x*it.lat, az = p.z + r.z*it.lat, tall = it.y1 - it.y0 > .4,
      ys = tall ? [p.y + it.y0 + .35, p.y + (it.y0 + it.y1)/2, p.y + it.y1 - .05] : [p.y + it.y0 + .2];
    return { ys, xz:it.pts.map(([a, l]) => [ax + r.x*a + t.x*l, az + r.z*a + t.z*l]), p }; };
  const at = (it, j, out) => { const f = ptsAt(it, j); for (const [x, z] of f.xz){ const ob = hit(x, z, f.ys, it.r); if (ob){ if (out) out.push(ob); return false; } } return true; };
  const offDeck = (it, j) => !tidyFloorAt(it, j);                                            // beside a raised deck or a kicker ramp there is only air
  const onCut = (it, j) => { if (!CUT) return false; const x = P[j].x + R[j].x*it.lat, z = P[j].z + R[j].z*it.lat, dx = x - CUT.A.x, dz = z - CUT.A.z, u = (dx*CUT.dir.x + dz*CUT.dir.z)/CUT.len, d = dx*CUT.nrm.x + dz*CUT.nrm.z;
    return u > -.03 && u < 1.03 && Math.abs(d) < CUT.half + 1.4; };                            // nothing stands in the shortcut's lane where it leaves and rejoins the road
  const free = (it, j) => !GAP[j] && !CRAIL[j] && !(it.noTunnel && inTunnel(j)) && !offDeck(it, j) && !onCut(it, j) && at(it, j) && !inBig(it, j);
  const claim = (it, j) => { const f = ptsAt(it, j); for (const [x, z] of f.xz){
      const wb = new THREE.Box3(new THREE.Vector3(x - it.r, f.p.y + it.y0, z - it.r), new THREE.Vector3(x + it.r, f.p.y + it.y1, z + it.r));
      insert({ wb, lb:wb, inv:I4, s:new THREE.Vector3(1, 1, 1), src:it }); } };
  const rep = { checked:TIDY.length, moved:[], hidden:[] };
  const order = TIDY.slice().sort((a, b) => b.pri - a.pri);
  for (const it of order){
    if (it.hidden) continue;
    if (SKYLOOP && ((it.i - SKYLOOP.i0 + 4 + N) % N) <= SKYLOOP.span + 8){ tidyHide(it); rep.hidden.push(it.kind + ' @' + it.i + ' (under the loop)'); continue; }
    if (free(it, it.i)){ claim(it, it.i); continue; }
    if (offDeck(it, it.i)){ tidyHide(it); rep.hidden.push(it.kind + ' @' + it.i + ' (nothing under it)'); continue; }
    if (onCut(it, it.i)){ let to = -1; for (const d of [1, -1, 2, -2, 3, -3, 4, -4, 6, -6, 8, -8]){ const j = (it.i + d + N) % N; if (free(it, j)){ to = j; break; } }
      if (to >= 0){ tidyMove(it, to); claim(it, to); rep.moved.push(it.kind + ' @' + it.i + '→' + to + ' (was in the shortcut lane)'); } else { tidyHide(it); rep.hidden.push(it.kind + ' @' + it.i + ' (in the shortcut lane)'); } continue; }
    if (inBig(it, it.i)){ let to = -1; for (const d of [1, -1, 2, -2, 3, -3, 4, -4, 6, -6]){ const j = (it.i + d + N) % N; if (free(it, j)){ to = j; break; } }
      if (to >= 0){ tidyMove(it, to); claim(it, to); rep.moved.push(it.kind + ' @' + it.i + '→' + to + ' (was inside scenery)'); } else { tidyHide(it); rep.hidden.push(it.kind + ' @' + it.i + ' (inside scenery)'); } continue; }
    const why = [], from = it.i; at(it, it.i, why); const ob = why[0], by = ob && ob.src, w = ob && ob.wb,
      byName = by ? (by.kind ? 'marker:' + by.kind : (by.name || (by.geometry && by.geometry.type) || by.type) + ' ' + [w.max.x - w.min.x, w.max.y - w.min.y, w.max.z - w.min.z].map(v => v.toFixed(1)).join('×') + ' y' + w.min.y.toFixed(1)) : '?';
    let to = -1; for (const d of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 8, -8, 10, -10]){ const j = (it.i + d + N) % N; if (free(it, j)){ to = j; break; } }
    if (to >= 0){ tidyMove(it, to); claim(it, to); rep.moved.push(it.kind + ' @' + from + '→' + to + ' (was in ' + byName + ')'); }
    else { tidyHide(it); rep.hidden.push(it.kind + ' @' + from + ' (in ' + byName + ')'); }
  }
  rep.hidden.push(...TIDY.filter(it => it.why).map(it => it.kind + ' @' + it.i + ' (' + it.why + ')'));
  TIDY_REPORT = rep;
  if (rep.moved.length || rep.hidden.length) console.info('roadside tidy · ' + world.name + ': ' + rep.moved.length + ' moved, ' + rep.hidden.length + ' left out of ' + rep.checked);
}
// move a marker from its sample to another, keeping its offset from the road and its angle to it
function tidyMove(it, j){
  const i = it.i, hd = k => Math.atan2(T[k].x, T[k].z), dA = hd(j) - hd(i);
  const ax = P[i].x + R[i].x*it.lat, az = P[i].z + R[i].z*it.lat, bx = P[j].x + R[j].x*it.lat, bz = P[j].z + R[j].z*it.lat, dy = P[j].y - P[i].y, c = Math.cos(dA), sn = Math.sin(dA);
  _tqy.setFromAxisAngle(_tY, dA);
  const shift = v => { const rx = v.x - ax, rz = v.z - az; v.x = bx + rx*c + rz*sn; v.z = bz - rx*sn + rz*c; v.y += dy; };
  for (const pt of it.parts){
    if (pt.obj){ pt.obj.getMatrixAt(pt.k, _tm); _tm.decompose(_tp, _tq, _ts); shift(_tp); _tq.premultiply(_tqy); _tm.compose(_tp, _tq, _ts); pt.obj.setMatrixAt(pt.k, _tm); pt.obj.instanceMatrix.needsUpdate = true; }
    else { shift(pt.position); pt.rotation.y += dA; pt.updateMatrix(); }
  }
  it.i = j;
}
function tidyHide(it){
  for (const pt of it.parts){
    if (pt.obj){ _tm.makeScale(1e-4, 1e-4, 1e-4).setPosition(0, -5000, 0); pt.obj.setMatrixAt(pt.k, _tm); pt.obj.instanceMatrix.needsUpdate = true; }
    else { pt.visible = false; pt.userData.noSolid = true; }
  }
  it.hidden = true;
}

// things close to the road that stream past: that is what sells 200 km/h on a flat plain
function roadside(g){
  const o = new THREE.Object3D(), a = new THREE.Color(world.post[0]), b = new THREE.Color(world.post[1]), lm = new THREE.MeshLambertMaterial();
  // reflector studs along both curbs every ~10 m
  { const step = 3, count = Math.ceil(N/step)*2, im = new THREE.InstancedMesh(new THREE.BoxGeometry(.5,.26,.7), new THREE.MeshLambertMaterial({emissive:new THREE.Color(world.post[1]), emissiveIntensity:.35, color:world.post[1]}), count); let n=0;
    for (let i=0;i<N;i+=step) for (const sd of [-1,1]){ if (GAP[i] || CRAIL[i]) continue; o.position.set(P[i].x+R[i].x*(W/2+2.1)*sd,P[i].y+.13,P[i].z+R[i].z*(W/2+2.1)*sd); o.rotation.set(0,Math.atan2(T[i].x,T[i].z),0); o.updateMatrix(); tidyAdd({ kind:'stud', parts:[{ obj:im, k:n }], i, lat:(W/2+2.1)*sd, y0:0, y1:.26, pts:[[0,0]], r:.3, pri:1 }); im.setMatrixAt(n++,o.matrix); }
    im.count = n; g.add(im); }
  // tall flags on one side every ~40 m, alternating colours; a cheap parallax layer at eye height
  { const step = 12, count = Math.ceil(N/step), pole = new THREE.InstancedMesh(new THREE.BoxGeometry(.18,5.2,.18), new THREE.MeshLambertMaterial({color:0x2b2f36}), count), flag = new THREE.InstancedMesh(new THREE.BoxGeometry(.08,1.1,1.9), lm, count); let n=0;
    for (let i=0;i<N;i+=step){ if (GAP[i] || CRAIL[i] || inTunnel(i) || world.rails) continue; const sd = (Math.floor(i/step)%2) ? 1 : -1, h = Math.atan2(T[i].x,T[i].z); o.position.set(P[i].x+R[i].x*(W/2+6.5)*sd,P[i].y+2.6,P[i].z+R[i].z*(W/2+6.5)*sd); o.rotation.set(0,h,0); o.scale.set(1,1,1); o.updateMatrix(); pole.setMatrixAt(n,o.matrix);
      o.position.y = P[i].y+4.4; o.updateMatrix(); flag.setMatrixAt(n,o.matrix); flag.setColorAt(n, n%3===0 ? a : b);
      tidyAdd({ kind:'flag', parts:[{ obj:pole, k:n }, { obj:flag, k:n }], i, lat:(W/2+6.5)*sd, y0:0, y1:5.2, pts:[[0,0],[0,.95],[0,-.95]], r:.25, pri:3, noTunnel:true }); n++; }
    pole.count = flag.count = n; pole.castShadow = true; g.add(pole); g.add(flag); }
  // chevron boards through the bends, facing the car that arrives, and 3-2-1 boards on the way into the slow ones
  { const bends = []; for (let i=0;i<N;i++){ const j=(i+10)%N, k=(i-10+N)%N; const turn = wrapA(Math.atan2(T[j].x,T[j].z) - Math.atan2(T[k].x,T[k].z)); bends.push(turn); }
    const chevLat = world.rails ? world.rails - .9 : W/2 + 3.2, cdLat = world.rails ? world.rails - .9 : W/2 + 3.0;   // on a ring road the boards stand on the shoulder, inside the rail
    const chev = textTex(128,64,(x,w,h)=>{ x.fillStyle='#f4f0e6'; x.fillRect(0,0,w,h); x.fillStyle='#e0542e'; x.lineWidth=0; for (let k=0;k<3;k++){ x.beginPath(); const u=k*40+6; x.moveTo(u,6); x.lineTo(u+22,32); x.lineTo(u,58); x.lineTo(u+12,58); x.lineTo(u+34,32); x.lineTo(u+12,6); x.closePath(); x.fill(); } });
    const chevL = textTex(128,64,(x,w,h)=>{ x.translate(w,0); x.scale(-1,1); x.fillStyle='#f4f0e6'; x.fillRect(0,0,w,h); x.fillStyle='#e0542e'; for (let k=0;k<3;k++){ x.beginPath(); const u=k*40+6; x.moveTo(u,6); x.lineTo(u+22,32); x.lineTo(u,58); x.lineTo(u+12,58); x.lineTo(u+34,32); x.lineTo(u+12,6); x.closePath(); x.fill(); } });
    const boardGeo = new THREE.PlaneGeometry(3.2,1.6), mR = new THREE.MeshLambertMaterial({map:chev, side:THREE.DoubleSide}), mL = new THREE.MeshLambertMaterial({map:chevL, side:THREE.DoubleSide});
    let last = -99; for (let i=0;i<N;i+=4){ const t = bends[i]; if (Math.abs(t) < .22 || i - last < 6 || GAP[i] || CRAIL[i]) continue; last = i;
      const sd = t > 0 ? -1 : 1;                                   // boards sit on the outside of the bend
      // the board stands along the roadside, its face turned to the road, the chevrons pointing the way you drive
      const yaw = Math.atan2(-R[i].x*sd, -R[i].z*sd), ax = Math.cos(yaw), az = -Math.sin(yaw);   // face toward the road; ax/az: the board's +x (the texture's right) in the world
      const m = new THREE.Mesh(boardGeo, (ax*T[i].x + az*T[i].z) > 0 ? mR : mL); m.position.set(P[i].x+R[i].x*chevLat*sd, P[i].y+1.1, P[i].z+R[i].z*chevLat*sd); m.rotation.y = yaw; m.castShadow = true; g.add(m);
      tidyAdd({ kind:'chevron', parts:[m], i, lat:chevLat*sd, y0:.3, y1:1.9, pts:[[0,-1.6],[0,-.8],[0,0],[0,.8],[0,1.6]], r:.15, pri:4 }); }
    // countdown boards before the three sharpest bends
    const peaks = []; for (let i=0;i<N;i++) if (Math.abs(bends[i]) > .32 && Math.abs(bends[i]) >= Math.abs(bends[(i+1)%N]) && Math.abs(bends[i]) > Math.abs(bends[(i-1+N)%N])) peaks.push(i);
    peaks.sort((x,y) => Math.abs(bends[y]) - Math.abs(bends[x]));
    const used = []; for (const pk of peaks){ if (used.some(u => Math.abs(((pk-u)%N+N)%N) < 60 || Math.abs(((u-pk)%N+N)%N) < 60)) continue; used.push(pk); if (used.length >= 3) break;
      for (const [n, dist] of [[3,150],[2,100],[1,50]]){ const i = ((pk - Math.round(dist/segLen) - 12) % N + N) % N, sd = bends[pk] > 0 ? 1 : -1;   // inside of the bend, where you look
        const tex = textTex(64,64,(x,w,h)=>{ x.fillStyle='#f4f0e6'; x.fillRect(0,0,w,h); x.fillStyle='#1d1210'; x.fillRect(4,4,w-8,h-8); x.fillStyle='#f0b44c'; x.font='bold 42px Impact, Arial Black, sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(String(n),w/2,h/2+2); });
        if (GAP[i] || CRAIL[i]) continue;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6,1.6), new THREE.MeshLambertMaterial({map:tex, side:THREE.DoubleSide})); m.position.set(P[i].x+R[i].x*cdLat*sd, P[i].y+1.3, P[i].z+R[i].z*cdLat*sd); m.rotation.y = Math.atan2(T[i].x,T[i].z) + Math.PI; g.add(m);
        const st = new THREE.Mesh(new THREE.BoxGeometry(.14,1.3,.14), new THREE.MeshLambertMaterial({color:0x2b2f36})); st.position.copy(m.position).setY(P[i].y+.5); g.add(st);
        tidyAdd({ kind:'countdown', parts:[m, st], i, lat:cdLat*sd, y0:0, y1:2.1, pts:[[-.8,0],[0,0],[.8,0]], r:.15, pri:5 }); } }
  }
}

// which hazard surface is a car on? scaled down for the civilisation that builds that vehicle
function hazardAt(c, loc){
  const out = {slow:1, drag:0, grip:1, push:0, type:null};
  for (const z of HAZ.zones){
    let k = loc.i - z.i0; if (k < 0) k += N;
    if (k > z.len || loc.lat < z.lat0 || loc.lat > z.lat1) continue;
    const s = c.prof.home === world.id ? .3 : 1;
    out.type = z.type; out.zone = z;
    if (z.type==='sand'){ out.slow = 1-.38*s; out.drag = .8*s; }
    else if (z.type==='lava'){ out.slow = 1-.45*s; out.drag = 1.6*s; }
    else if (z.type==='ice'){ out.grip = 1-.85*s; }
    else if (z.type==='wind'){ out.push = z.dir*18*s; }
    else if (z.type==='crater'){ out.bump = .3*s; out.slow = 1-.2*s; }
    else if (z.type==='shock'){ out.slow = 1-.22*s; out.push = Math.sin(clockT*11 + (c.x||0)*.3)*26*s; }   // the field shoves you side to side
    break;
  }
  return out;
}
// bump against solid obstacles (pillars, crystals, crates, live gates, tumbleweeds)
function obstacleCollide(c){
  if (c._obsHit > 0) c._obsHit -= 1/60;
  if (c.recCool > 0) c.recCool -= 1/60;
  if (c.air || c.rec || c.loop) return;
  const flying = c.airT > 0;                                   // an Updraft or a leap clears obstacles, but not a bridge's rails: those hold in the air too
  const cr = c.prof.rad*.42, sh = active(c,'shield');
  // the body is a capsule along the heading (nose to tail, as wide as the vehicle), not one circle: bumpers and walker legs no longer sink into things
  const ex = extentsOf(c), rc = clamp(ex.halfW, cr*.8, cr + .7), fwd = Math.max(0, ex.nose - rc), back = Math.min(Math.max(0, -ex.tail - rc), fwd + .5), hx = Math.sin(c.h), hz = Math.cos(c.h);
  const nb = PROP_BINS.length, b0 = Math.floor(c.idx/PROP_BIN), near = HAZ.solids.slice();
  if (nb) for (let d = -3; d <= 3; d++) for (const o of PROP_BINS[((b0 + d) % nb + nb) % nb]) near.push(o);
  for (const o of near){
    if (flying && !o.rail) continue;
    if (o.active && !o.active()) continue;
    if (!(o.r >= 0) || !isFinite(o.x) || !isFinite(o.z)) continue;
    if (o.prop){ if ((o.alias || o).down) continue; let di = c.idx - o.i; if (di > N/2) di -= N; if (di < -N/2) di += N; if (di > 30 || di < -30) continue;
      const cy = c.y || 0; if (cy > o.y1 || cy + 2 < o.y0) continue; }
    const ox = o.x - c.x, oz = o.z - c.z; if (Math.abs(ox) > o.r + rc + fwd + back || Math.abs(oz) > o.r + rc + fwd + back) continue;
    const t = clamp(ox*hx + oz*hz, -back, fwd), dx = -ox + hx*t, dz = -oz + hz*t, d = Math.hypot(dx,dz), min = o.r + rc;   // nearest point of the body's spine to the obstacle
    if (d >= min || d === 0) continue;
    const nx = dx/d, nz = dz/d;
    const vn = c.vx*nx + c.vz*nz; const wasHit = c._obsHit > 0;
    if (o.prop && o.light && vn < 0){ knockProp(o.alias || o, nx, nz, -vn); const keep = c.player ? .8 : .95; c.vx *= keep; c.vz *= keep; if (c.player && state !== 'insp'){ thud(.35); addShake(.15); } else carThud(c, .35); continue; }   // boards and poles go flat; you lose a little speed
    if (o.prop && !o.soft && !sh && vn < -PROP_HIT && !(c.recCool > 0)){ crashOut(c, o, nx, nz, -vn); return; }
    c.x += nx*(min-d); c.z += nz*(min-d);
    if (o.soft){ c.vx *= 1-o.soft; c.vz *= 1-o.soft; if (vn < 0){ c.vx -= nx*vn*.5; c.vz -= nz*vn*.5; } }
    else if (vn < 0 && sh){ c.vx -= nx*vn; c.vz -= nz*vn; }
    else if (vn < 0){ const first = !wasHit; c._obsHit = .3; c.vx -= nx*vn*1.35; c.vz -= nz*vn*1.35; if (first){ c.vx *= .82; c.vz *= .82; } else { c.vx *= .97; c.vz *= .97; }
      // glance off instead of grinding: keep rolling along the road and turn the nose away from the obstacle
      const tg = T[o.i] || T[c.idx], vt = c.vx*tg.x + c.vz*tg.z; if (vt < 10){ c.vx += tg.x*(10 - vt)*.35; c.vz += tg.z*(10 - vt)*.35; }
      c.h += Math.sign(nx*Math.cos(c.h) - nz*Math.sin(c.h))*.035;
      if (c.player && first) addShake(Math.min(-vn/30,.7));
      if (-vn > 6) carThud(c, Math.min(-vn/25,1));
      if (c.player && -vn > 6){ for (let k=0;k<8;k++) sparks.emit(o.x+nx*o.r, rnd(.5,2.5), o.z+nz*o.r, nx*rnd(2,8)+rnd(-3,3), rnd(2,6), nz*rnd(2,8)+rnd(-3,3), rnd(.3,.6), rnd(.3,.6)); } }
  }
}
/* ---------- roadside props are solid ----------
   After a world is built, everything standing beside the track within driving reach (rocks, posts, boards, poles, gate legs)
   gets a collision proxy. Light props (boards, signs, thin poles) are knocked flat; heavy ones (rocks, posts, structures)
   stop you hard: the car is thrown up and carried back onto the tarmac a little further on, in full view, then released. */
const PROPS = [];
const PROP_HIT = 7;                                       // closing speed (m/s) that turns a bump into a crash
const _pm = new THREE.Matrix4(), _pm2 = new THREE.Matrix4(), _pb = new THREE.Box3(), _pv = new THREE.Vector3();
// a prop's footprint where a car can touch it: its real vertices between ankle and roof height, reduced to a centre, a long axis and half-lengths
function propFootprint(e, gy){
  const pa = e.obj.geometry.attributes.position; if (!pa) return null;
  const xs = [], zs = [], v = _pv.clone(); let sx = 0, sz = 0;
  for (let q = 0; q < pa.count; q++){ v.fromBufferAttribute(pa, q).applyMatrix4(e.m); if (v.y < gy + .1 || v.y > gy + 2.6) continue; xs.push(v.x); zs.push(v.z); sx += v.x; sz += v.z; }
  if (xs.length < 3){ return null; }
  const n = xs.length, mx = sx/n, mz = sz/n; let cxx = 0, czz = 0, cxz = 0;
  for (let q = 0; q < n; q++){ const dx = xs[q] - mx, dz = zs[q] - mz; cxx += dx*dx; czz += dz*dz; cxz += dx*dz; }
  const th = .5*Math.atan2(2*cxz, cxx - czz), ax = Math.cos(th), az = Math.sin(th);
  let u0 = 1e9, u1 = -1e9, w0 = 1e9, w1 = -1e9;
  for (let q = 0; q < n; q++){ const dx = xs[q] - mx, dz = zs[q] - mz, u = dx*ax + dz*az, w = -dx*az + dz*ax; u0 = Math.min(u0, u); u1 = Math.max(u1, u); w0 = Math.min(w0, w); w1 = Math.max(w1, w); }
  const um = (u0 + u1)/2, wm = (w0 + w1)/2, cx = mx + ax*um - az*wm, cz = mz + az*um + ax*wm;
  let rmax = 0; for (let q = 0; q < n; q++) rmax = Math.max(rmax, Math.hypot(xs[q] - cx, zs[q] - cz));
  return { cx, cz, ax, az, a:(u1 - u0)/2, b:(w1 - w0)/2, rmax };
}
const PROP_BIN = 10;                                        // props are filed in bins of 10 samples: a car only checks the bins around it
let PROP_ALL = [], PROP_BINS = [];
function propAdd(o){ PROP_ALL.push(o); PROP_BINS[Math.floor(o.i/PROP_BIN)].push(o); return o; }
function propSolids(){
  PROPS.length = 0; PROP_ALL = []; PROP_BINS = Array.from({ length: Math.ceil(N/PROP_BIN) }, () => []);
  const lim = world.rails || (W/2 + 17), taken = new Set(HAZ.solids.map(s => s.mesh).filter(Boolean)), all = [];
  worldGroup.updateMatrixWorld(true);
  worldGroup.traverse(obj => {
    if (!obj.isMesh || !obj.geometry || !obj.visible || taken.has(obj) || obj.userData.noSolid) return;
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (!mat || mat.wireframe || mat.blending === THREE.AdditiveBlending || (mat.transparent && mat.opacity < .5)) return;
    const g = obj.geometry; if (!g.boundingBox) g.computeBoundingBox();
    const n = obj.isInstancedMesh ? obj.count : 1;
    for (let k = 0; k < n; k++){
      if (obj.isInstancedMesh){ obj.getMatrixAt(k, _pm); _pm.premultiply(obj.matrixWorld); } else _pm.copy(obj.matrixWorld);
      _pb.copy(g.boundingBox).applyMatrix4(_pm); _pb.getCenter(_pv); if (!isFinite(_pv.x) || !isFinite(_pv.z) || !isFinite(_pb.min.y) || !isFinite(_pb.max.y)) continue;   // a broken transform must never become a solid
      const hx = (_pb.max.x - _pb.min.x)/2, hz = (_pb.max.z - _pb.min.z)/2, ht = _pb.max.y - _pb.min.y;
      if (Math.max(hx, hz) > 14 || ht > 400) continue;
      all.push({ obj, k, x:_pv.x, z:_pv.z, y0:_pb.min.y, y1:_pb.max.y, hx, hz, ht, type:g.type, m:_pm.clone() });
    } });
  for (const e of all){
    let best = 1e18, i = 0; for (let j = 0; j < N; j += 3){ const dx = e.x - P[j].x, dz = e.z - P[j].z, d = dx*dx + dz*dz; if (d < best){ best = d; i = j; } }
    for (let j = i - 3; j <= i + 3; j++){ const q = (j + N) % N, dx = e.x - P[q].x, dz = e.z - P[q].z, d = dx*dx + dz*dz; if (d < best){ best = d; i = q; } }
    const d = Math.sqrt(best), gy = H[i] || 0;
    let r = Math.min(Math.max(e.hx, e.hz), (e.hx + e.hz)*.6);
    if (r < .06 || e.y0 > gy + 1.5 || e.y1 < gy + .7) continue;          // too thin, floating overhead, or flat on the ground
    if (d < W/2 + 1.2 || d - r > lim || (world.rails && d > world.rails)) continue;   // on the road/kerb, out of reach, or part of a wall
    if (CUT && cutAt({ x:e.x, z:e.z })) continue;                         // keep the shortcut strip clear
    if (HAZ.solids.some(s => Math.hypot(s.x - e.x, s.z - e.z) < (s.r || 0)) || PROP_ALL.some(s => Math.abs(s.x - e.x) < 15 && Math.hypot(s.x - e.x, s.z - e.z) < s.r)) continue;
    const light = e.ht <= 6 && (e.type === 'PlaneGeometry' || (e.ht > 3*Math.max(e.hx, e.hz) && Math.max(e.hx, e.hz) < .6));   // boards, signs, thin poles; anything taller is structure
    // fit the real footprint at bumper height: one circle for a round-ish prop, a row of circles along a long one (a slab, a board, a fallen column)
    const fp = propFootprint(e, gy), circles = [];
    if (!fp) circles.push([e.x, e.z, r]);
    else if (fp.a <= 1.5*Math.max(fp.b, .25)) circles.push([fp.cx, fp.cz, fp.rmax*.95]);
    else { const b = Math.max(fp.b, .25), n = Math.min(8, Math.ceil(fp.a/b)), span = Math.max(0, fp.a - b);
      for (let k = 0; k < n; k++){ const u = n === 1 ? 0 : -span + 2*span*k/(n - 1); circles.push([fp.cx + fp.ax*u, fp.cz + fp.az*u, Math.hypot(b, span/Math.max(1, n - 1))*1.02]); } }
    let first = null;
    for (const [x, z, r0] of circles){
      let dc = 1e18; for (let j = i - 12; j <= i + 12; j++){ const q = (j + N) % N; dc = Math.min(dc, Math.hypot(x - P[q].x, z - P[q].z)); }
      const rc = Math.min(r0, dc - W/2 - .8);                               // a tilted spike's box can overhang the road: never let a proxy reach the tarmac
      if (rc < .1 && first) continue;
      const o = propAdd({ i, lat:(x - P[i].x)*R[i].x + (z - P[i].z)*R[i].z, r:Math.max(rc, .25), soft: (e.type === 'SphereGeometry' || e.obj.userData.soft) ? .25 : 0, x, z, half:Math.max(rc, .25), prop:true, light, y0:e.y0, y1:e.y1, ent:e,
        riders: first ? undefined : [], alias: first || undefined, bx: fp ? fp.cx : e.x, bz: fp ? fp.cz : e.z });
      if (!first){ first = o; PROPS.push(o); } } }
  // whatever sits on a light prop (the flag on a pole, the post under a board) falls with it
  for (const o of PROPS) if (o.light) for (const e of all) if (e !== o.ent && Math.hypot(e.x - o.bx, e.z - o.bz) < .7 && e.y0 > o.y0 - 1.6 && e.y0 < o.y1 + 1) o.riders.push(e);
  HAZ.updaters.push((t, dt) => propsUpdate(dt || 1/60));
}
// lay a prop over around its base, falling away from the car; works for single meshes and instances alike
function propPose(e, base, axis, ang){
  const inst = e.obj.isInstancedMesh;
  if (!e.m0){ e.m0 = new THREE.Matrix4(); if (inst) e.obj.getMatrixAt(e.k, e.m0); else e.m0.copy(e.obj.matrix); }
  const par = inst ? e.obj.matrixWorld : (e.obj.parent ? e.obj.parent.matrixWorld : _pm2.identity());   // world = par * local
  _pm.makeTranslation(base.x, base.y, base.z).multiply(_pm2.makeRotationAxis(axis, ang)).multiply(new THREE.Matrix4().makeTranslation(-base.x, -base.y, -base.z));
  const local = new THREE.Matrix4().copy(par).invert().multiply(_pm).multiply(par).multiply(e.m0);
  if (inst){ e.obj.setMatrixAt(e.k, local); e.obj.instanceMatrix.needsUpdate = true; }
  else local.decompose(e.obj.position, e.obj.quaternion, e.obj.scale);
}
function knockProp(o, nx, nz, spd){
  o.down = true; o.kt = 0; o.dt = 0; o.kv = Math.min(1, spd/30);
  o.base = new THREE.Vector3(o.bx ?? o.x, o.y0, o.bz ?? o.z); o.axis = new THREE.Vector3(-nz, 0, nx).normalize().negate();   // tip away from the car
  for (let k = 0; k < 10; k++) sparks.emit(o.x, o.y0 + rnd(.4, 1.6), o.z, -nx*rnd(3, 9) + rnd(-3, 3), rnd(2, 6), -nz*rnd(3, 9) + rnd(-3, 3), rnd(.3, .6), rnd(.3, .6));
}
function propsUpdate(dt){
  for (const o of PROPS){ if (!o.down) continue;
    o.dt = (o.dt || 0) + dt;
    if (o.dt > 8 && Math.hypot(player.x - o.x, player.z - o.z) > 70){ propStand(o); continue; }   // stands back up once you're well clear
    if (o.kt >= 1) continue;
    o.kt = Math.min(1, o.kt + dt*(2.4 + 2*o.kv)); const a = (Math.PI/2 - .08)*(o.kt*o.kt);
    propPose(o.ent, o.base, o.axis, a); for (const e of o.riders) propPose(e, o.base, o.axis, a); }
}
function propStand(o){
  o.down = false; o.dt = 0;
  for (const e of [o.ent, ...o.riders]){ if (!e.m0) continue;
    if (e.obj.isInstancedMesh){ e.obj.setMatrixAt(e.k, e.m0); e.obj.instanceMatrix.needsUpdate = true; } else e.m0.decompose(e.obj.position, e.obj.quaternion, e.obj.scale); }
}
function propsReset(){ for (const o of PROPS) if (o.down) propStand(o); }
// a hard hit on something heavy: the car is thrown and set back on the tarmac a few metres on, facing down the road
function crashOut(c, o, nx, nz, hit){
  const spd = Math.hypot(c.vx, c.vz);
  let i = (c.idx + 4) % N, guard = 0; while (GAP[i] && guard++ < N) i = (i + 1) % N;
  const lat0 = (c.x - P[i].x)*R[i].x + (c.z - P[i].z)*R[i].z, lat = clamp(lat0, -(W/2 - 3.5), W/2 - 3.5);
  const th = Math.atan2(T[i].x, T[i].z);
  c.rec = { t:0, dur:.9, x0:c.x, z0:c.z, y0:c.y || 0, h0:c.h, x1:P[i].x + R[i].x*lat, z1:P[i].z + R[i].z*lat, i1:i, h1:c.h + wrapA(th - c.h), sd:Math.sign(lat0) || 1, v:Math.max(12, spd*.45) };
  c.vx = c.vz = c.f = c.l = 0; c.drift = 0; c.driftHeld = false; c.boost = 0; c.air = null; c.steerV = 0;
  const cx = o.x + nx*o.r, cz = o.z + nz*o.r, cy = (c.y || 0);
  for (let k = 0; k < 16; k++) sparks.emit(cx, cy + rnd(.5, 2.5), cz, nx*rnd(2, 10) + rnd(-4, 4), rnd(3, 8), nz*rnd(2, 10) + rnd(-4, 4), rnd(.35, .7), rnd(.4, .8));
  for (let k = 0; k < 14; k++) emit(cx + rnd(-1.5, 1.5), cy + .4, cz + rnd(-1.5, 1.5), rnd(-5, 5), rnd(1, 4), rnd(-5, 5), rnd(1.6, 2.8), rnd(.7, 1.1));
  carThud(c, Math.min(hit/22, 1)); if (c.player && state !== 'insp'){ addShake(Math.min(hit/25, 1)); showToast('Crash!', 900); }
}
function recoverStep(c, dt){
  const r = c.rec; r.t += dt; const k = Math.min(1, r.t/r.dur), e = k*k*(3 - 2*k);
  c.x = r.x0 + (r.x1 - r.x0)*e; c.z = r.z0 + (r.z1 - r.z0)*e;
  const gy1 = trackY(r.x1, r.z1, r.i1);
  c.y = r.y0 + (gy1 - r.y0)*e + Math.sin(k*Math.PI)*3.2;
  c.h = r.h0 + (r.h1 - r.h0)*e;
  c.thr = c.brk = false; c.accel = 0; c.f = c.l = 0; c.steerV = 0;
  if (Math.random() < .5) emit(c.x + rnd(-1, 1), c.y + .3, c.z + rnd(-1, 1), rnd(-1, 1), rnd(.5, 1.5), rnd(-1, 1), rnd(1, 1.8), rnd(.4, .7));
  if (k >= 1){ c.rec = null; c.y = gy1; c.h = r.h1; c.vx = Math.sin(c.h)*r.v; c.vz = Math.cos(c.h)*r.v; c.f = r.v; c.recCool = 1.2;
    for (let j = 0; j < 12; j++) emit(c.x + rnd(-2, 2), gy1 + .3, c.z + rnd(-2, 2), rnd(-5, 5), rnd(1, 3), rnd(-5, 5), rnd(1.4, 2.4), rnd(.6, 1));
    carThud(c, .45); }
}
buildWorld(world.id);

/* ---------- the truck (original design) ---------- */
function roundel(num, ring){ return textTex(128,128,(x,w,h)=>{ x.fillStyle=ring; x.beginPath(); x.arc(64,64,62,0,7); x.fill(); x.fillStyle='#f6f1e4'; x.beginPath(); x.arc(64,64,52,0,7); x.fill(); x.fillStyle='#16181c'; x.font='bold 64px Impact, Arial Black, sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(num,64,68); }); }
function makeTruck(o){
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const M = (c,e) => new THREE.MeshStandardMaterial(Object.assign({color:c, roughness:.6, metalness:.15, flatShading:true}, e||{}));
  const mBody=M(o.body,{roughness:.42,metalness:.3}), mDark=M(o.dark,{roughness:.8}), mAcc=M(o.accent,{roughness:.5}), mFlare=M(o.flare,{roughness:.7});
  const mGlass=M(0x182330,{roughness:.1,metalness:.75}), mTire=M(0x1a1a1c,{roughness:.95}), mRim=M(o.rim,{metalness:.55,roughness:.35});
  const lamp=new THREE.MeshBasicMaterial({color:0xfff2c8}), tail=new THREE.MeshBasicMaterial({color:0xff3a22});
  const add=(mesh,x,y,z,parent)=>{ mesh.position.set(x,y,z); mesh.castShadow=true; (parent||body).add(mesh); return mesh; };
  const box=(w,h,l,mat,x,y,z)=>add(new THREE.Mesh(new THREE.BoxGeometry(w,h,l),mat),x,y,z);
  function ext(pts,depth,mat){ const s=new THREE.Shape(); s.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++) s.lineTo(pts[i][0],pts[i][1]); s.closePath();
    const geo=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false}); geo.translate(0,0,-depth/2); const m=new THREE.Mesh(geo,mat); m.rotation.y=-Math.PI/2; m.castShadow=true; body.add(m); return m; }

  // wedge body: low nose rising to a long flat rear deck
  ext([[-2.25,.62],[2.2,.62],[2.36,.84],[2.3,1.06],[.95,1.3],[-1.95,1.42],[-2.3,1.3]], 2.0, mBody);
  // canopy
  ext([[1.0,1.29],[-.05,1.96],[-1.55,1.99],[-1.96,1.41]], 1.72, mGlass);
  box(1.78,.09,1.62,mBody, 0,2.02,-.78);                 // roof cap
  box(1.86,.34,4.3,mDark, 0,.52,0);                      // chassis
  box(2.12,.3,.32,mDark, 0,.66,2.33);                    // front bar
  box(2.12,.3,.3,mDark, 0,.66,-2.33);                    // rear bar
  const skid = box(1.5,.08,.7,mAcc, 0,.42,2.15); skid.rotation.x=.35;
  for (const z of [1.45,-1.45]) box(2.26,.2,1.36,mFlare, 0,1.07,z);  // rally flares
  box(2.02,.12,3.0,mAcc, 0,.84,-.05);                    // side stripe
  box(.62,.02,1.15,mAcc, 0,1.22,1.55).rotation.x=.17;    // hood stripe
  for (const s of [-1,1]){
    box(.4,.16,.05,lamp, s*.62,.97,2.37);
    box(.42,.13,.05,tail, s*.66,1.12,-2.33);
    const r = new THREE.Mesh(new THREE.PlaneGeometry(.66,.66), new THREE.MeshBasicMaterial({map:roundel(o.num,o.ring)}));
    r.position.set(s*1.012,1.12,.0); r.rotation.y = s*Math.PI/2; body.add(r);
  }
  box(1.5,.12,.2,mDark, 0,2.13,.02);                     // light bar
  for (const x of [-.54,-.18,.18,.54]){ const c=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.08,12),lamp); c.rotation.x=Math.PI/2; add(c,x,2.15,.13); }
  const snork = new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,1.05,8), mDark); snork.rotation.x=-.32; add(snork,1.03,1.62,.86);
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.28,16), mTire); spare.rotation.x=Math.PI/2; add(spare,0,1.06,-2.5);
  const spareRim = new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.3,8), mRim); spareRim.rotation.x=Math.PI/2; add(spareRim,0,1.06,-2.5);

  const steer=[], spin=[];
  for (const [x,z] of [[.98,1.45],[-.98,1.45],[.98,-1.45],[-.98,-1.45]]){
    const pivot = new THREE.Group(); pivot.position.set(x,.5,z); g.add(pivot);
    const sp = new THREE.Group(); pivot.add(sp);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.44,18), mTire); t.rotation.z=Math.PI/2; t.castShadow=true; sp.add(t);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.46,8), mRim); rim.rotation.z=Math.PI/2; sp.add(rim);
    if (z>0) steer.push(pivot); spin.push(sp);
  }
  return {group:g, body, steer, spin};
}

const LIVERIES = [
  {name:'You', num:'87', body:0xe8b03a, dark:0x2b2f36, accent:0x1aa9a4, flare:0x3a3f47, rim:0xe9e3d3, ring:'#1aa9a4'},
  {name:'R. Vega', num:'14', body:0x3e7cc2, dark:0x23262c, accent:0xf6c548, flare:0x2b3240, rim:0xd9d3c3, ring:'#f6c548'},
  {name:'A. Okafor', num:'33', body:0xd2542f, dark:0x24272d, accent:0x1f2a33, flare:0x3b2a24, rim:0xf0b44c, ring:'#1f2a33'},
  {name:'M. Lindqvist', num:'5', body:0x5f8d4b, dark:0x22262a, accent:0xe8dfc8, flare:0x343b30, rim:0xe8dfc8, ring:'#5f8d4b'},
  {name:'J. Sato', num:'21', body:0x8a5bd6, dark:0x23262c, accent:0xf2f0ea, flare:0x3a3350, rim:0xf2f0ea, ring:'#8a5bd6'},
];

/* ---------- vehicle handling ---------- */
const VEHICLES = DR87.data["vehicles"];
let vehicle = 'truck';
try { const sv = localStorage.getItem('dustrunner-vehicle'); if (sv && VEHICLES[sv]) vehicle = sv; } catch(_){}

/* ---------- cars ---------- */
const cars = [];
const GRID = [[N-7,-5],[N-7,5],[N-19,-5],[N-19,5],[N-31,0]];
const playerSlot = 2;
LIVERIES.forEach((L,k)=>{
  const t = makeTruck(L); scene.add(t.group);
  t.group.userData.car = null;
  cars.push({L, ...t, prof:VEHICLES.truck, x:0,z:0,h:0,vx:0,vz:0,f:0,l:0,steerV:0,idx:0,prog:0,laps:0,lapStart:0,lapTimes:[],finished:false,finishTime:0,boost:0,spinA:0,player:k===0,
    ai: k===0 ? {skill:.86, seed:0, lane:0} : {skill:[0,.93,.965,.9,.95][k], seed:k*1.7, lane:[0,2.5,-2.5,0,-1.5][k]},
    kind:'truck', rigs:{}, stock:[...t.body.children], wheelPivots:t.group.children.filter(ch => ch !== t.body)});
  t.group.userData.car = cars[cars.length-1];
});
const player = cars[0];
playerLamp = new THREE.PointLight(0x9fd0ff, 1.4, 70, 1.6); playerLamp.position.set(0, 2.6, 2.5); playerLamp.visible = !!world.dark; player.group.add(playerLamp);

function placeOnGrid(){
  const slots = [playerSlot, 0, 1, 3, 4];
  cars.forEach((c,k)=>{ const [i,lat] = GRID[slots[k]];
    c.x = P[i].x + R[i].x*lat; c.z = P[i].z + R[i].z*lat; c.h = Math.atan2(T[i].x,T[i].z);
    c.vx=c.vz=c.f=c.l=c.steerV=0; c.loop=null; c._loopPrg=undefined; c.idx=i; c.prog=i-N; c.laps=0; c.lapTimes=[]; c.lapStart=0; c.finished=false; c.finishTime=0; c.boost=0;
    c.meter=0; c.abilT=0; c.abilId=null; c.stun=0; c.airT=0; c.air=null; c.y=H[i]; c.drift=0; trailsClear(c); c.driftHeld=false; c.tractUntil=0; c._nm={}; c.beamTarget=null; c.rec=null; c.recCool=0; if (c._shield) c._shield.visible=false; if (c._nitro) c._nitro.visible=false;
    syncMesh(c,0); });
}

function locate(c){
  let best=1e12, bi=c.idx;
  for (let k=-25;k<=45;k++){ const i=(c.idx+k+N)%N; const dx=c.x-P[i].x, dz=c.z-P[i].z, d=dx*dx+dz*dz; if (d<best){best=d;bi=i;} }
  if (best>3600){ for (let i=0;i<N;i++){ const dx=c.x-P[i].x, dz=c.z-P[i].z, d=dx*dx+dz*dz; if (d<best){best=d;bi=i;} } }
  return {i:bi, lat:(c.x-P[bi].x)*R[bi].x + (c.z-P[bi].z)*R[bi].z};
}

/* ---------- difficulty: how hard the rivals race ---------- */
const LEVELS = {
  easy:   { name:'Easy',   note:'Rivals ease off, miss hazards and slip up',
            pace:.88, corner:.5,  brakeMargin:10, steer:2.0, wobble:1.3, see:10, zones:false, blind:.45, seek:0,  defend:false, lapse:.25, launch:[.5,1.3],  ahead:.8,  behind:1.03, cut:.15 },
  normal: { name:'Normal', note:'Balanced rivals who dodge most hazards',
            pace:1,   corner:.42, brakeMargin:7,  steer:2.4, wobble:1,   see:30, zones:true,  blind:.1,  seek:.5, defend:false, lapse:.05, launch:[.1,.45],  ahead:.9,  behind:1.07, overtake:true, cut:.6 },
  hard:   { name:'Hard',   note:'Rivals race the line, brake late, overtake and stay on your tail',
            pace:1.0, corner:.34, brakeMargin:1.5, steer:2.9, wobble:.45, see:45, zones:true,  blind:0,   seek:1,  defend:true,  lapse:0,   launch:[0,.08],   ahead:.97, behind:1.12,
            smart:true, overtake:true, decel:24, cornerMargin:.97, roles:true, skills:[.97,1.0], cut:1 },
};
let level = 'normal';
try { const sl = localStorage.getItem('dustrunner-level'); if (sl && LEVELS[sl]) level = sl; } catch(_){}
// roll each rival's race-day traits from the level: reaction at the start, which obstacles they miss, whether they chase boost pads
function prepRivals(){
  const Lv = LEVELS[level];
  for (const sg of STARGATES) sg.used.clear();
  for (const c of cars){ if (c.player) continue; const ai = c.ai;
    ai.launch = Lv.launch[0] + Math.random()*(Lv.launch[1]-Lv.launch[0]);
    ai.blind = new Set(HAZ.solids.filter(() => Math.random() < Lv.blind));
    ai.seek = Math.random() < Lv.seek; ai.lapseUntil = 0; ai.lapseNext = 0;
    ai.useCut = Math.random() < (Lv.cut ?? .5);
    ai.base = ai.base ?? ai.skill; ai.skill = Lv.skills ? rnd(Lv.skills[0], Lv.skills[1]) : ai.base;
    ai.margin = Lv.cornerMargin ? Lv.cornerMargin + rnd(-.025,.02) : 0;
    ai.stuckT = 0; ai.revUntil = 0; ai.tries = 0; ai.passUntil = 0; ai.lastT = undefined; ai.progMark = undefined; ai.progT = 0; }
  // Hard: every rival plays a part in the race story, so the pack moves like a pack, not like a rubber band
  if (Lv.roles){ const roles = ['hare','hunter','blocker','steady'].sort(() => Math.random()-.5); let k = 0; for (const c of cars) if (!c.player) c.ai.role = roles[k++ % roles.length]; }
  else for (const c of cars) if (!c.player) c.ai.role = null;
}
// hare: flies early, fades on the last lap. hunter: sits on your tail and attacks on the straights late on.
// blocker: wants to be the one just ahead of you. steady: a clean, constant benchmark pace.
function roleMul(c, g){
  const lap = player.laps, lastLap = lap >= LAPS-1, ai = c.ai;
  switch (ai.role){
    case 'hare':    return lap === 0 ? 1.06 : lastLap ? .95 : 1.0;
    case 'hunter':  if (g > .012) return .92;                                   // got ahead: let you back past
                    if (g < -.06) return 1.12;                                  // dropped: close back up
                    return lastLap && (c._planWide ? RL.kWide : RL.kRoad)[c.idx] < .004 ? 1.06 : 1.0;   // attack on the straights
    case 'blocker': if (g < -.025) return 1.09; if (g > .07) return .94; return 1.0;
    default:        return 1.0;
  }
}

function respawnRival(c){
  // put it back a little ahead of where it got stuck (never behind: that just walks it backwards), in a lane that's clear of obstacles and rivals
  let i = (c.idx + 4) % N; while (NOROAD[i]) i = (i + 1) % N; const clear = lat => !HAZ.solids.some(o => { let a = o.i - i; if (a > N/2) a -= N; if (a < -N/2) a += N; return a > -4 && a < 12 && Math.abs(o.lat - lat) < o.r + 4; })
    && !cars.some(o => o !== c && Math.hypot(o.x - (P[i].x + R[i].x*lat), o.z - (P[i].z + R[i].z*lat)) < 7);
  const lat = [0, -4.5, 4.5, -7, 7].find(clear) ?? 0;
  c.x = P[i].x + R[i].x*lat; c.z = P[i].z + R[i].z*lat; c.y = world.elev ? trackY(c.x, c.z, i) : H[i]; c.air = null; c.h = Math.atan2(T[i].x, T[i].z); c.f = 10; c.l = 0; c.vx = T[i].x*10; c.vz = T[i].z*10;
  c.prog += 4; c.idx = i; c.lat = lat;
  for (let k=0;k<14;k++) emit(c.x+rnd(-3,3), c.y+.5, c.z+rnd(-3,3), rnd(-4,4), rnd(1,3), rnd(-4,4), rnd(1.5,2.5), rnd(.6,1));
}
function aiInput(c,t){
  const Lv = LEVELS[level], ai = c.ai, smart = Lv.smart && !c.player;
  const sp = Math.abs(c.f);
  const dtA = Math.min(.1, Math.max(0, t - (ai.lastT ?? t))); ai.lastT = t;
  if (!c.player && state==='race' && raceTime < (ai.launch||0)) return {thr:false, brk:false, steer:0, hand:false, maxMul:1};   // a held start, not a reverse
  // stuck against something: back out with the nose turning toward the road, respawn if it keeps failing
  if (!c.player && state==='race' && raceTime > (ai.launch||0) + 2.5){
    if (sp > 12) ai.tries = 0;
    if (!ai.revUntil){ if (sp < 2.5) ai.stuckT = (ai.stuckT||0) + dtA; else if (sp > 6) ai.stuckT = 0; }
    if (ai.stuckT > 1.2 && !ai.revUntil){ const d = wrapA(Math.atan2(T[c.idx].x, T[c.idx].z) - c.h); ai.revUntil = t + 1.1; ai.revSteer = Math.sign(d) || 1; ai.tries = (ai.tries||0) + 1; }
    if (ai.revUntil){ if (t < ai.revUntil) return {thr:false, brk:true, steer:ai.revSteer, hand:false, maxMul:1}; ai.revUntil = 0; ai.stuckT = 0; }
    if ((ai.tries||0) >= 3){ respawnRival(c); ai.tries = 0; ai.stuckT = 0; }
    // moving but going nowhere (grinding a wall, pinned on the fence out in the sand): judge by progress round the lap, not by speed
    if (ai.progMark === undefined || c.prog > ai.progMark + 1){ ai.progMark = c.prog; ai.progT = 0; } else ai.progT = (ai.progT||0) + dtA;
    if (ai.progT > (c.off && Math.abs(c.lat||0) > W/2 + 5 ? 1.6 : 2.6)){ respawnRival(c); ai.progT = 0; ai.progMark = c.prog; ai.tries = 0; ai.stuckT = 0; ai.revUntil = 0; }
  }
  const plan = smart ? speedPlan(c) : null;
  let look = smart ? Math.round(6 + sp*.24) : Math.round(9 + sp*.32); const lookFull = look;
  // in a tight bend a long look-ahead cuts the corner (and parks the car on the inside rail): shorten it so the road turns no more than ~35° over it
  for (let k=4;k<=look;k+=2){ if (Math.acos(clamp(T[c.idx].dot(T[(c.idx+k)%N]),-1,1)) > .6){ look = Math.max(4, k - 2); break; } }
  const ti = (c.idx+look)%N, lookK = look/lookFull;
  // where across the road to aim: Hard follows the racing line (the wide one for vehicles that shrug off sand)
  let lane = smart ? (c._planWide ? RL.wide : RL.road)[ti] + Math.sin(t*.3 + ai.seed)*.6
                   : ai.lane + Math.sin(t*.35 + ai.seed)*2.6*Lv.wobble;
  const lim = smart && c._planWide ? W/2 + 2.5 : W/2 - 1.6, homeHere = c.prof.home === world.id;
  // boost hunters line up on the pad ahead
  if (ai.seek) for (const b of BOOSTS){ let a = b - c.idx; if (a < 0) a += N; if (a > 2 && a < look + 25){ lane *= .2; break; } }
  // passing: closing on someone in the same lane, pick the side with room and commit to it for a moment
  if (Lv.overtake && !c.player){
    if (t < (ai.passUntil||0)) lane = ai.passLane;
    else for (const o of cars){ if (o === c) continue;
      let a = o.idx - c.idx; if (a < 0) a += N; if (a < 1 || a > 8) continue;
      const ol = o.lat || 0; if (Math.abs(ol - lane) > 4.4 || sp < 12 || sp < Math.abs(o.f)*.97) continue;
      const sideA = ol + 6.2, sideB = ol - 6.2, okA = sideA < lim, okB = sideB > -lim;
      if (!okA && !okB) break;
      ai.passLane = (okA && (!okB || Math.abs(sideA - lane) < Math.abs(sideB - lane))) ? sideA : sideB;
      ai.passUntil = t + 1.8; lane = ai.passLane; break; }
  }
  // on Hard, a rival with you right behind moves across to cover your line
  if (Lv.defend && !c.player && !(t < (ai.passUntil||0))){ let a = c.idx - player.idx; if (a < 0) a += N; if (a > 0 && a < 22 && Math.abs((player.lat||0) - (c.lat||0)) < 7) lane = lane*.45 + (player.lat||0)*.55; }
  const berth = 3.4 + (smart ? sp*.035 + c.prof.rad*.15 : 0);
  // gather what blocks the road ahead (the nearest group of obstacles), then take the clear gap closest to where we wanted to be
  const blocks = [];
  for (const o of HAZ.solids){ if (o.active && !o.active() && !(o.half > 1.8)) continue; if (ai.blind && ai.blind.has(o)) continue;
    let a = o.i - c.idx; if (a < 0) a += N; if (a < 1 || a > look + Lv.see) continue; blocks.push({a, lo:o.lat - o.r - berth, hi:o.lat + o.r + berth}); }
  if (Lv.see > 12) for (const m of METEORS){ if (!m.live) continue; let a = m.ti - c.idx; if (a < 0) a += N; if (a < 1 || a > look + Lv.see) continue; blocks.push({a, lo:m.lat - 4.5 - berth*.4, hi:m.lat + 4.5 + berth*.4}); }
  if (!homeHere && Lv.zones) for (const z of HAZ.zones){ if (z.lat1 - z.lat0 > W*.85) continue;
    let a = z.i0 - c.idx; if (a < 0) a += N; const inside = a >= N - z.len; if (!inside && a > look + 25) continue;
    blocks.push({a: inside ? 0 : a, lo:z.lat0 - 3.4, hi:z.lat1 + 3.4}); }
  let nearA = 1e9;
  if (blocks.length){
    const a0 = Math.min(...blocks.map(b => b.a)), group = blocks.filter(b => b.a <= a0 + (smart ? 22 : 10));
    const free = x => x >= -lim && x <= lim && !group.some(b => x > b.lo && x < b.hi);
    if (!free(lane)){
      const cands = [lane, ...group.flatMap(b => [b.lo, b.hi]), -lim, lim].filter(free);
      if (cands.length){ let best = cands[0]; for (const x of cands) if (Math.abs(x - lane) < Math.abs(best - lane)) best = x; lane = best; nearA = Math.min(...group.map(b => b.a)); }
    }
  }
  // a vehicle that can't use the shortcut keeps off its mouths, so it never clips the strip and gets the wrong-vehicle penalty
  if (CUT && !cutOK(c)){ const dA = (CUT.iA - c.idx + N) % N, pA = (c.idx - CUT.iA + N) % N;
    if (dA < 10 || pA < 12){ lane = clamp(lane, -W/2 + 3.5, W/2 - 3.5); } }
  lane = clamp(lane, -lim, lim);
  if (lookK < 1) lane = (c.lat||0) + (lane - (c.lat||0))*Math.max(.35, lookK);   // a short look-ahead would turn lane changes into lunges: ease across instead
  // with an obstacle close ahead, aim at the gap beside it rather than past it
  const aimI = (smart && nearA < look) ? (c.idx + Math.max(3, nearA)) % N : ti;
  let tx = P[aimI].x + R[aimI].x*lane, tz = P[aimI].z + R[aimI].z*lane, onCut = false;
  if (CUT && ai.useCut && cutOK(c)){ const k = ((CUT.iA - c.idx) % N + N) % N;
    if (c.onCut){ const sA = clamp(c.onCut.u*CUT.len + 24 + sp*.6, 0, CUT.len + 16); tx = CUT.A.x + CUT.dir.x*sA; tz = CUT.A.z + CUT.dir.z*sA; onCut = true; ai.softSteer = true; }   // follow the strip's centreline, not the far end
    else if (k > 0 && k < 32 && lineOnRoad(c.x, c.z, CUT.A.x, CUT.A.z, c.idx, k)){ tx = CUT.A.x; tz = CUT.A.z; onCut = true; ai.mouthK = k; } else ai.mouthK = 0; }
  const diff = wrapA(Math.atan2(tx-c.x, tz-c.z) - c.h); ai._tx = tx; ai._tz = tz; ai._diff = diff; ai._lane = lane; ai._look = look;
  // pace: base skill, then keep the pack close to you
  let skill = ai.skill * (c.player ? 1 : Lv.pace);
  const g = (c.prog - player.prog)/N;
  if (!c.player){
    if (Lv.roles) skill *= roleMul(c, g);
    else { if (g > .12) skill *= Lv.ahead; else if (g < -.12) skill *= Lv.behind; }
  }
  let target;
  const slopeAhead = world.elev ? (H[(c.idx+30)%N] - H[c.idx])/(30*segLen) : 0;   // + climbing, − diving: a dive adds speed, so brake earlier
  if (smart){
    // brake for the slowest corner ahead that can't be reached at the current speed
    const decel = Math.max(Lv.decel*.5, Lv.decel + 18*Math.min(0, slopeAhead)), margin = ai.margin || Lv.cornerMargin;
    target = MAXS * skill * c.prof.maxMul + (c.boost > 0 ? 24 : 0);
    const horizon = Math.min(150, 12 + (sp*sp)/(2*decel)/segLen);
    for (let j=0; j<=horizon; j++){ const v = plan[(c.idx+j)%N]*margin; const allow = Math.sqrt(v*v + 2*decel*j*segLen); if (allow < target) target = allow; }
    if (nearA < 18) target *= c.prof.gripRoad < 7 ? .8 : .9;   // ease off while swerving round something; skittish vehicles more
  } else {
    const ahead = (c.idx+48)%N, bend = Math.acos(clamp(T[c.idx].dot(T[ahead]),-1,1));
    target = MAXS*skill*(1 - Math.min(bend,1.3)*Lv.corner)*(1 + Math.min(0, slopeAhead)*.8);
  }
  if (onCut) target = Math.max(target*.9, MAXS*skill*c.prof.maxMul*.8);
  if (!CUT) ai.mouthK = 0;   // a mouth remembered from the last world's shortcut (this one may have none)
  if (ai.mouthK){ const bend = Math.abs(wrapA(Math.atan2(CUT.dir.x, CUT.dir.z) - Math.atan2(T[c.idx].x, T[c.idx].z))); if (bend > .35) target = Math.min(target, 26 + 30*Math.max(0, 1 - bend/1.2)); }   // a sharp mouth: slow to make the turn in
  for (const j of JUMPS){ const k = (j.lip - c.idx + N) % N; if (k < 45) target = MAXS*1.1*c.prof.maxMul; }   // never lift before a jump
  let thr = sp < target - (smart ? .3 : 0);
  if (!c.player && Lv.lapse && state==='race'){
    if (t > ai.lapseNext){ ai.lapseNext = t + 1; if (Math.random() < Lv.lapse) ai.lapseUntil = t + rnd(.5,1.1); }
    if (t < ai.lapseUntil) thr = false;
  }
  const sg = ai.softSteer ? Math.min(Lv.steer, 1.5) : Lv.steer; ai.softSteer = false;   // on the strip a hot gain just oscillates across it
  return {thr, brk: sp > target + Lv.brakeMargin, steer: clamp(-diff*sg,-1,1), hand:false, maxMul:skill};
}

function step(c, inp, dt){
  if (!isFinite(c.x) || !isFinite(c.z) || !isFinite(c.vx) || !isFinite(c.vz) || !isFinite(c.h)){   // safety net: a car with broken numbers goes back on the road instead of vanishing
    const i = ((c.idx|0) % N + N) % N; c.x = P[i].x; c.z = P[i].z; c.y = H[i] || 0; c.h = Math.atan2(T[i].x, T[i].z); c.vx = c.vz = c.f = c.l = c.steerV = 0; c.air = null; c.rec = null; }
  const fx=Math.sin(c.h), fz=Math.cos(c.h), rx=fz, rz=-fx;
  let f = c.vx*fx + c.vz*fz, l = c.vx*rx + c.vz*rz;
  if (c.loop){ if (SKYLOOP) { loopStep(c, inp, dt); return; } c.loop = null; }
  const loc = locate(c);
  let d = loc.i - c.idx; if (d > N/2) d -= N; if (d < -N/2) d += N; c.prog += d; c.idx = loc.i;
  if (SKYLOOP && loopEnter(c, loc)){ loopStep(c, inp, dt); return; }
  if (c.rec){ recoverStep(c, dt); c.lat = loc.lat; c.off = false; syncMesh(c, dt); return; }
  // in the air: the car flies on, no steering or drive until it lands (or falls short)
  if (c.air){ c.y += c.air.vy*dt; c.air.vy -= (c.air.g || G_AIR)*dt; c.x += c.vx*dt; c.z += c.vz*dt; if (!c.air.mega){ c.vx *= 1 - .04*dt; c.vz *= 1 - .04*dt; }
    // air control: a little nose authority so a curve can be followed; the velocity drifts after the nose
    c.steerV += (clamp(inp.steer||0,-1,1) - c.steerV)*Math.min(1, dt*5); c.h -= c.steerV*(c.air.mega ? .12 : .55)*dt;
    if (c.air.mega){ const i0 = c.idx, lt = (c.x - P[i0].x)*R[i0].x + (c.z - P[i0].z)*R[i0].z, want = Math.atan2(T[i0].x, T[i0].z) - clamp(lt*.012, -.12, .12); c.h += wrapA(want - c.h)*Math.min(1, dt*.9); }   // a long flight: kept lined up with the far stub
    { const spd = Math.hypot(c.vx, c.vz), k = Math.min(1, dt*1.6); c.vx += (Math.sin(c.h)*spd - c.vx)*k; c.vz += (Math.cos(c.h)*spd - c.vz)*k; }
    const l2 = locate(c); let d2 = l2.i - c.idx; if (d2 > N/2) d2 -= N; if (d2 < -N/2) d2 += N; c.prog += d2; c.idx = l2.i; c.lat = l2.lat; c.off = false;
    // the walls are solid in the air too: a tunnel bore, a ring road's rails or a raised deck's edge stop a flying car the same as a rolling one
    { const aLim = TUNNELS.length ? tunnelLim(c.idx) : 0, aRail = aLim || railAt(c.idx), keep = aRail ? aRail - .4 : 0; if (c._railT) c._railT = Math.max(0, c._railT - dt);
      if (keep && Math.abs(c.lat) > keep){ const rn = R[c.idx], sg = Math.sign(c.lat), push = Math.abs(c.lat) - keep; c.x -= rn.x*push*sg; c.z -= rn.z*push*sg; c.lat = keep*sg;
        const vl = c.vx*rn.x + c.vz*rn.z; if (vl*sg > 0){ c.vx -= rn.x*vl*1.2; c.vz -= rn.z*vl*1.2; } c.vx *= .97; c.vz *= .97; c.h += wrapA(Math.atan2(T[c.idx].x, T[c.idx].z) - c.h)*.2;
        if (Math.random() < .7) sparks.emit(c.x + rn.x*sg*1.6, (c.y||0) + .6, c.z + rn.z*sg*1.6, -rn.x*rnd(1,4)*sg - c.vx*.1, rnd(1,4), -rn.z*rnd(1,4)*sg - c.vz*.1, rnd(.3,.6), rnd(.3,.6));
        if (!c._railT && earK(c) > 0){ c._railT = .4; carThud(c, .25); if (c.player && state !== 'insp') addShake(.12); } }
      if (aLim || (TUNNELS.length && inTunnel(c.idx))){ const top = trackY(c.x, c.z, c.idx) + 11.5; if (c.y > top){ c.y = top; if (c.air.vy > 0) c.air.vy = -c.air.vy*.25; } } }   // and a bore has a roof
    const gy = trackY(c.x, c.z, c.idx), over = !GAP[c.idx];
    if (over && c.y <= gy + .05 && c.air.t > .15){ c.y = gy; const hard = -c.air.vy; c.air = null; c.vx *= .94; c.vz *= .94;
      carThud(c, Math.min(hard/30, 1)); if (c.player){ if (state !== 'insp'){ addShake(Math.min(hard/60, .6)); if (hard > 14) styleToast('Landed'); } c.meter = Math.min(100, (c.meter||0) + 10); }
      for (let k=0;k<16;k++) emit(c.x+rnd(-2,2), gy+.3, c.z+rnd(-2,2), rnd(-6,6), rnd(1,3), rnd(-6,6), rnd(1.4,2.4), rnd(.6,1)); }
    else if (!over && c.y < (JUMPS.find(j => ((c.idx - j.lip + N) % N) < ((j.land - j.lip + N) % N)) || {landY:0}).landY - 30){   // fell short: back on the landing deck
      const j = JUMPS.find(j => ((c.idx - j.lip + N) % N) < ((j.land - j.lip + N) % N)) || JUMPS[0], i = (j.land + 4) % N;
      c.x = P[i].x; c.z = P[i].z; c.y = H[i]; c.h = Math.atan2(T[i].x,T[i].z); c.vx = c.vz = c.f = c.l = 0; c.idx = i; c.air = null; if (c.player){ showToast('Short!', 900); addShake(.5); } }
    for (const sg of STARGATES){ if (!sg.used.has(c) && Math.hypot(c.x - sg.x, c.y - sg.y, c.z - sg.z) < sg.r){ sg.used.add(c); c.boost = Math.max(c.boost, 1.6); c.boostEvt = true; if (c.player){ flashBoost(); styleToast('Star gate!'); c.meter = Math.min(100, (c.meter||0) + 12); } } }
    c.air && (c.air.t += dt);
    c.f = c.vx*Math.sin(c.h) + c.vz*Math.cos(c.h); c.l = 0; c.boost = Math.max(0, c.boost - dt); c.thr = !!inp.thr; c.brk = !!inp.brk; c.accel = 0; c.spinA += c.f*dt/.5;
    syncMesh(c, dt); return; }
  const cutRaw = cutAt(c), onRoad = Math.abs(loc.lat) < W/2 - .5; let cut = cutRaw && (onRoad && !cutOK(c) ? null : cutRaw);   // where the strip overlaps the road it's just road for everyone else
  if (cut && !CUT.flat && !c.air){ const gap = Math.abs(CUT.yAtXZ(c.x, c.z, cut.u, loc.i, loc.lat) - trackY(c.x, c.z, loc.i));
    if (gap > 1.2 && !c.onCut) cut = null;                               // the strip is above or below you here: you are on the road, it passes over/under
    else if (gap > 1.2 && c.onCut && onRoad && Math.abs((c.y || 0) - CUT.yAtXZ(c.x, c.z, cut.u, loc.i, loc.lat)) > 1.2) cut = null; }   // (only stay on the strip if that is where you are)
  const ok = cut && cutOK(c);
  c.onCut = cut; if (cut && c.player && !ok && !c._cutWarn){ c._cutWarn = true; showToast(CUT.who.replace(/^\w/, ch => ch.toUpperCase()) + ' only', 1100); }
  if (!cut) c._cutWarn = false;
  const rail0 = railAt(loc.i), off = ok ? false : (Math.abs(loc.lat) > (rail0 ? rail0 - .6 : W/2 + 1) || !!cut);
  c.off = off; c.lat = loc.lat;
  if (!off && Math.abs(loc.lat) < 4.4){ for (const b of BOOST_LONG){ const k = (c.idx - b + N) % N; if (k <= 1){ if (c.boost < 1.2){ c.boostHit = true; c.boostEvt = true; } c.boost = Math.max(c.boost, 2.2); if (c.player) flashBoost(); break; } } }
  if (!off && Math.abs(loc.lat) < 3.5){ for (const b of BOOSTS){ let k=c.idx-b; if (k>N/2)k-=N; if(k<-N/2)k+=N; if (k>=-3 && k<=3){ if (c.boost < 1.2){ c.boostHit = true; c.boostEvt = true; } c.boost = 1.5; if (c.player) flashBoost(); } } }
  const pf = c.prof;
  c.thr = !!inp.thr; c.brk = !!inp.brk;
  const am = abilityMods(c);
  let hz = am.immune ? {slow:1, drag:0, grip:1, push:0, type:null} : (cut && !ok ? {slow:.45, drag:1.3, grip:.7, push:0, type:'cut'} : hazardAt(c, loc)); c.hz = hz.type;
  if (am.anchor){ hz = Object.assign({}, hz, { push:0, grip:1, slow:Math.max(hz.slow, .85), drag:Math.min(hz.drag, .2) }); }   // Groundhook: wind can't move it, ice can't loosen it
  if (hz.bump && c.zoneIn !== hz.zone){ f *= 1 - hz.bump; c.hop = .5; carThud(c, .5); }
  c.zoneIn = hz.zone || null;
  let draft = 0;
  for (const o of cars){ if (o === c) continue; const dx = o.x-c.x, dz = o.z-c.z, along = dx*fx + dz*fz;
    if (along < 4 || along > 26 || Math.abs(dx*rx + dz*rz) > 2.8) continue; draft = Math.max(draft, 1 - (along-4)/22); }
  c.draft = draft;
  let maxS = (MAXS*(inp.maxMul||1)*pf.maxMul*(off && !(c.airT>0) && !am.anchor ? pf.offMax : 1)*(1 + .09*draft) + (c.boost>0?24:0) + Math.max(0, am.top)) * hz.slow;
  if (c.stun > 0){ c.stun -= dt; maxS *= .35; c.h += Math.sin(raceTime*17)*dt*2.6; }
  if (inp.thr) f += (f<maxS ? ACC*pf.acc*am.acc*(c.boost>0?1.9:1)*(off && !am.anchor ? pf.offAcc : 1) : 0)*dt;
  if (inp.brk) f -= (f>0 ? BRK : ACC*.55)*dt;
  f = Math.max(f,-14);
  f -= f*((off && !am.anchor ? pf.offDrag : .18)*(1 - .4*draft) + hz.drag)*dt;
  if (!inp.thr && !inp.brk) f -= Math.sign(f)*Math.min(Math.abs(f), 5*dt);
  if (f > maxS) f -= (f-maxS)*2.4*dt;
  const drift = inp.hand && !pf.pivot;
  if (inp.hand) f -= Math.sign(f)*Math.min(Math.abs(f), (pf.pivot ? (Math.abs(c.steerV) > .25 ? 11 : 22) : 9)*dt);   // tracks and legs: a held slide while turning is a power-pivot, not a stop
  const grip = (drift ? 1.4 : (off ? pf.gripOff : pf.gripRoad)) * hz.grip * am.grip;
  l *= Math.exp(-grip*dt);
  c.vx = fx*f + rx*l; c.vz = fz*f + rz*l;
  if (hz.push){ c.vx += R[loc.i].x*hz.push*dt; c.vz += R[loc.i].z*hz.push*dt; }
  if (hz.type==='lava' && Math.random() < .6) sparks.emit(c.x+rnd(-2,2), .4, c.z+rnd(-2,2), rnd(-2,2)+c.vx*.2, rnd(5,10), rnd(-2,2)+c.vz*.2, rnd(.4,.8), rnd(.4,.9));
  if (hz.type==='ice' && Math.abs(l) > 4 && Math.random() < .5) glitter.emit(c.x, .3, c.z, rnd(-2,2), rnd(1,3), rnd(-2,2), rnd(.3,.5), .6);
  c.steerV += (inp.steer - c.steerV)*Math.min(1, dt*9);
  const sp = Math.abs(f);
  const spF = Math.min(sp/MAXS,1);
  const rate = (pf.pivot
    ? pf.turn*(1-.42*spF)*(f < -.5 ? -1 : 1)                 // tracks: turns on the spot
    : (pf.turn - 1.05*spF) * Math.min(sp/7,1) * Math.sign(f||1)) * (am.anchor ? 1.6 : 1);
  c.h -= c.steerV*rate*dt*(drift?1.4:1);
  c.accel = (f - (c.f||0))/Math.max(dt,1e-3);
  c.x += c.vx*dt; c.z += c.vz*dt;
  // invisible fence out in the sand
  const tLim = TUNNELS.length ? tunnelLim(loc.i) : 0, rail = tLim || railAt(loc.i), lim = rail || (W/2 + 17);
  if (!cut && Math.abs(loc.lat) > lim){ const push = (Math.abs(loc.lat)-lim)*Math.sign(loc.lat); c.x -= R[loc.i].x*push; c.z -= R[loc.i].z*push;
    if (rail){ // a hard rail on a ring road: scrub the sideways velocity, keep most of the forward speed, throw sparks
      const rn = R[loc.i], vl = c.vx*rn.x + c.vz*rn.z; if (vl*Math.sign(loc.lat) > 0){ c.vx -= rn.x*vl*1.25; c.vz -= rn.z*vl*1.25; } c.vx *= .96; c.vz *= .96;
      if (Math.random() < .7) sparks.emit(c.x + rn.x*Math.sign(loc.lat)*1.6, (c.y||0) + .6, c.z + rn.z*Math.sign(loc.lat)*1.6, -rn.x*rnd(1,4)*Math.sign(loc.lat) - c.vx*.1, rnd(1,4), -rn.z*rnd(1,4)*Math.sign(loc.lat) - c.vz*.1, rnd(.3,.6), rnd(.3,.6));
      if (!c._railT && earK(c) > 0){ c._railT = .4; carThud(c, .25); if (c.player && state !== 'insp') addShake(.12); } }
    else { c.vx *= .6; c.vz *= .6; } }
  if (c._railT) c._railT = Math.max(0, c._railT - dt);
  c.boost = Math.max(0, c.boost-dt);
  driftStep(c, inp, dt, sp, drift);
  if (c.airT > 0){ c.airT -= dt; if (c.airT <= 0){                 // touchdown after a leap
    for (let k=0;k<24;k++){ const a = k/24*Math.PI*2; emit(c.x, .4, c.z, Math.cos(a)*10, rnd(.5,2), Math.sin(a)*10, rnd(1.4,2.4), rnd(.6,1)); }
    const ek = earAt(c.x, c.z, 70); if (ek > 0) thud(ek); if (c.player && state !== 'insp') addShake(.5); } }
  // slopes: climbing bleeds speed, diving adds it; the lip of a jump throws you off the road
  if (world.elev){ const sl = slopeAtPos(c.x, c.z, c.idx); f -= 18*sl*dt; c.vx = fx*f + rx*l; c.vz = fz*f + rz*l;
    for (const j of JUMPS){ const k = (c.idx - j.lip + N) % N; if (k >= 0 && k < 6 && f > 4 && !c.air && j.mega){   // the Meltdown Gap: everyone is flung across at vmin or better, on an arc sized to land on the far stub
        const tx = T[j.lip].x, tz = T[j.lip].z, v = Math.max(f, j.vmin), tf = j.gap*1.1/v; c.vx = tx*v; c.vz = tz*v; c.h = Math.atan2(tx, tz); c.f = v;
        const vy = v*j.grade, gg = 2*((c.y || j.lipY) - j.landY + vy*tf)/(tf*tf);      // leaves along the ramp's face; the arc's gravity is sized so it comes down on the far stub
        c.air = { vy, g: gg, t: 0, mega: true }; if (c.player){ styleToast('Meltdown leap!'); addShake(.35); } break; }
      if (k >= 0 && k < 6 && f > 4 && !c.air){ c.air = { vy: Math.max(6, f*Math.tan(j.angle)*(c.boost > 0 ? 1.15 : 1)), t: 0 }; if (j.g){ c.air.g = j.g; c.air.vy = clamp(Math.max(c.air.vy, j.g*j.gap*1.3/(2*Math.max(f, 22))), 6, 24); if (c.player){ styleToast('Low-G!'); } }   // the gravity jump: a long floaty arc that always clears the rift at racing speed c.y = Math.max(trackY(c.x, c.z, c.idx), H[j.lip] - 1);
      if (c.player){ styleToast('Airborne'); addShake(.2); } break; } } }
  // the wall is hard: after everything else has moved the car this step (the velocity rebuilt from slip on a raised road, a drift, a slope),
  // it is still inside the rail or the tunnel bore, with no velocity left pointing into the wall
  if (rail && !cut && !c.air){ const lc = locate(c), keep = rail - .05;
    if (Math.abs(lc.lat) > keep){ const rn = R[lc.i], sg = Math.sign(lc.lat), push = Math.abs(lc.lat) - keep; c.x -= rn.x*push*sg; c.z -= rn.z*push*sg; c.lat = keep*sg;
      const vl = c.vx*rn.x + c.vz*rn.z; if (vl*sg > 0){ c.vx -= rn.x*vl; c.vz -= rn.z*vl; } f = c.vx*fx + c.vz*fz; l = c.vx*rx + c.vz*rz; } }
  c.y = world.elev ? (c.air ? c.y : (c.onCut && CUT && !CUT.flat) ? CUT.yAtXZ(c.x, c.z, c.onCut.u, c.idx, c.lat) : trackY(c.x, c.z, c.idx)) : 0;
  c.f = f; c.l = l;
  c.spinA += f*dt/.5;
  syncMesh(c, dt);
}

function syncMesh(c, dt){
  if (c.hop){ c.hop = Math.max(0, c.hop - dt*2.2); }
  c.group.position.set(c.x, (c.y || 0) + (quakeT > 0 && !c.air ? Math.abs(Math.sin(performance.now()*.037 + c.x))*.18*quakeAmp*Math.min(1, quakeT) : 0), c.z); c.group.rotation.order = 'YXZ'; c.group.rotation.y = c.h;   // a quake jolts the cars on the ground
  { const want = c.air ? clamp(-Math.atan2(c.air.vy, Math.max(Math.abs(c.f), 8))*.7, -.5, .5) : (world.elev ? -Math.atan(slopeAtPos(c.x, c.z, c.idx)) : 0);
    c.group.rotation.x += (want - c.group.rotation.x)*Math.min(1, dt*(c.air ? 4 : 10)); }
  const heavy = c.prof.pivot;
  const roll = clamp((-c.l*.018 + c.steerV*Math.min(Math.abs(c.f)/MAXS,1)*.05)*(heavy?.35:1), -.12, .12);
  c.body.rotation.z += (roll - c.body.rotation.z)*Math.min(1, dt*6);
  const pitch = heavy ? clamp(-(c.accel||0)*.0016, -.05, .05) : 0;
  c.body.rotation.x += (pitch - c.body.rotation.x)*Math.min(1, dt*4);
  const tnow = performance.now();
  c.body.position.y = heavy
    ? Math.sin(tnow*.09)*.012*(1+Math.min(Math.abs(c.f)/20,2)) + (c.off ? Math.sin(tnow*.021 + c.x)*.05 : 0)
    : (c.off ? Math.sin(tnow*.03 + c.x)*.03 : 0);
  if (c.hop) c.body.position.y += Math.sin(c.hop/.5*Math.PI)*.9;
  if (c.airT > 0){ const p = 1 - c.airT/c.airDur; c.body.position.y += airLift(c); c.body.rotation.x = c.airKind === 'flight' ? -.04 : -.25 + .5*p; }
  for (const s of c.steer) s.rotation.y = -c.steerV*.42;
  for (const s of c.spin) s.rotation.x = c.spinA;
  if (c.rec){ const k = Math.min(1, c.rec.t/c.rec.dur), s = Math.sin(k*Math.PI); c.body.rotation.z = -c.rec.sd*s*.9; c.body.rotation.x = -s*.35; c.group.rotation.x = 0; }
  c.body.visible = !(c.recCool > .3 && Math.floor(performance.now()/90) % 2);   // blink: you're back, and can't crash again for a moment
}

function collide(){
  for (let a=0;a<cars.length;a++) for (let b=a+1;b<cars.length;b++){
    const A=cars[a], B=cars[b]; if (A.airT>0 || B.airT>0 || A.air || B.air || A.rec || B.rec || A.loop || B.loop) continue; const RAD=(A.prof.rad+B.prof.rad)/2;
    const dx=A.x-B.x, dz=A.z-B.z; const d=Math.hypot(dx,dz);
    if (d>0 && d<RAD){
      const mA=A.prof.mass*(active(A,'shield')?5:active(A,'hook')?2.5:1), mB=B.prof.mass*(active(B,'shield')?5:active(B,'hook')?2.5:1), nx=dx/d, nz=dz/d, over=RAD-d;
      A.x+=nx*over*mB/(mA+mB); A.z+=nz*over*mB/(mA+mB); B.x-=nx*over*mA/(mA+mB); B.z-=nz*over*mA/(mA+mB);
      const vr=(A.vx-B.vx)*nx + (A.vz-B.vz)*nz;
      if (vr<0){ const j=-vr*1.3/(1/mA+1/mB); A.vx+=nx*j/mA; A.vz+=nz*j/mA; B.vx-=nx*j/mB; B.vz-=nz*j/mB;
        if (Math.abs(vr)>6){ const ek = Math.max(earK(A), earK(B)); if (ek > 0) thud(Math.min(Math.abs(vr)/30,1)*ek); if ((A.player||B.player) && state !== 'insp') addShake(Math.min(Math.abs(vr)/40,.5)); } }
    }
  }
}

/* ---------- drift-to-boost: hold the handbrake through a corner, release for a burst ---------- */
const DRIFT = { tiers:[.3,.65,.97], names:['Mini', 'Super', 'Ultra'], boost:[.9,1.5,2.3], charge:1.3 };
function driftStep(c, inp, dt, sp, sliding){
  c.drift = c.drift || 0;
  const turning = Math.abs(c.steerV) > .25 || Math.abs(c.l||0) > 4;
  const charging = inp.hand && sp > 16 && turning && !c.off && !c.finished;
  if (charging){ c.drift = Math.min(1, c.drift + dt/DRIFT.charge); c.driftHeld = true; c.driftOff = 0;
    if (c.player && sp > 20 && Math.random() < .7) sparks.emit(c.x - Math.sin(c.h)*c.prof.rad*.4 + rnd(-1,1), .3, c.z - Math.cos(c.h)*c.prof.rad*.4 + rnd(-1,1), -c.vx*.15 + rnd(-3,3), rnd(2,5), -c.vz*.15 + rnd(-3,3), rnd(.25,.45), rnd(.25,.5)); }
  else if (c.driftHeld && (!inp.hand || !turning)){           // released (or straightened up): cash in
    c.driftOff = (c.driftOff||0) + dt;
    if (!inp.hand || c.driftOff > .25){
      let tier = -1; for (let i = DRIFT.tiers.length-1; i >= 0; i--) if (c.drift >= DRIFT.tiers[i]){ tier = i; break; }
      if (tier >= 0 && c.drift > .3){ c.boost = Math.max(c.boost, DRIFT.boost[tier]); c.driftTier = tier; c.boostEvt = true;
        if (c.player){ flashBoost(); styleToast(DRIFT.names[tier] + ' drift boost'); c.meter = Math.min(100, (c.meter||0) + 6 + tier*6); addShake(.15 + tier*.1); }
        for (let k=0;k<10+tier*8;k++) sparks.emit(c.x - Math.sin(c.h)*c.prof.rad*.4, .4, c.z - Math.cos(c.h)*c.prof.rad*.4, -c.vx*.3 + rnd(-4,4), rnd(2,7), -c.vz*.3 + rnd(-4,4), rnd(.3,.6), rnd(.3,.7)); }
      c.drift = 0; c.driftHeld = false; c.driftOff = 0; }
  } else if (!inp.hand){ c.drift = Math.max(0, c.drift - dt*2); c.driftHeld = false; }
  if (c.off && c.driftHeld){ c.drift = 0; c.driftHeld = false; }
}

/* ---------- dust ---------- */
const PN = 600;
const pPos=new Float32Array(PN*3), pAl=new Float32Array(PN), pSz=new Float32Array(PN), pVel=new Float32Array(PN*3), pLife=new Float32Array(PN), pMax=new Float32Array(PN).fill(1);
let pHead = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos,3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('alpha', new THREE.BufferAttribute(pAl,1).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('size', new THREE.BufferAttribute(pSz,1).setUsage(THREE.DynamicDrawUsage));
const dust = new THREE.Points(pGeo, new THREE.ShaderMaterial({
  transparent:true, depthWrite:false, uniforms:{col:{value:new THREE.Color(0xdcb98a)}, scale:{value:400}},
  vertexShader:'attribute float alpha;attribute float size;varying float vA;uniform float scale;void main(){vA=alpha;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*scale/-mv.z;gl_Position=projectionMatrix*mv;}',
  fragmentShader:'varying float vA;uniform vec3 col;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(col,vA*(1.-d*2.));}'
}));
dust.material.uniforms.col.value.setHex(world.dust);
dust.frustumCulled = false; scene.add(dust);
function emit(x,y,z,vx,vy,vz,size,life){ const i=pHead; pHead=(pHead+1)%PN; pPos[i*3]=x;pPos[i*3+1]=y;pPos[i*3+2]=z; pVel[i*3]=vx;pVel[i*3+1]=vy;pVel[i*3+2]=vz; pSz[i]=size; pLife[i]=pMax[i]=life; }
function updateDust(dt){
  for (let i=0;i<PN;i++){ if (pLife[i]<=0){ pAl[i]=0; continue; } pLife[i]-=dt; const k=i*3; pPos[k]+=pVel[k]*dt; pPos[k+1]+=pVel[k+1]*dt; pPos[k+2]+=pVel[k+2]*dt; pVel[k]*=.95; pVel[k+2]*=.95; pSz[i]+=dt*2.4; pAl[i]=Math.max(0,pLife[i]/pMax[i])*.5; }
  pGeo.attributes.position.needsUpdate = pGeo.attributes.alpha.needsUpdate = pGeo.attributes.size.needsUpdate = true;
}
function carDust(c, dt){
  if (c.air || c.loop || (Q.fx < 1 && Math.random() > Q.fx)) return;
  const sp = Math.abs(c.f), slip = Math.abs(c.l);
  const pd = c.prof;
  const rate = ((c.off ? sp*1.2 : sp*.25) + slip*3 + (c.boost>0?20:0) + (pd.pivot ? Math.abs(c.steerV)*6 : 0))*pd.dust;
  c._acc = (c._acc||0) + rate*dt;
  const fx=Math.sin(c.h), fz=Math.cos(c.h);
  while (c._acc > 1){ c._acc -= 1;
    const s = Math.random()<.5?-1:1; const x=c.x-fx*pd.dustBack+fz*s*pd.dustW, z=c.z-fz*pd.dustBack-fx*s*pd.dustW;
    emit(x,(c.y||0)+.4,z, -c.vx*.15+(Math.random()-.5)*3, 1+Math.random()*1.5, -c.vz*.15+(Math.random()-.5)*3, 1.2+Math.random()*1.2, .9+Math.random()*.8); }
}

/* ---------- input ---------- */
const keys = {};
const touchState = {left:false,right:false,gas:false,brake:false,hand:false,steerX:0,stickGas:false,stickBrk:false};
addEventListener('keydown', e=>{ const k=e.key.toLowerCase(); keys[k]=true;
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
  if (e.repeat) return;
  if (k==='escape' || k==='p'){ togglePause(); return; }
  if (k==='enter' && paused && !(e.target && e.target.closest && e.target.closest('button'))){ startRace(); return; }
  if (k==='e' || k==='shift') useAbility(player);
  if (k==='c') cycleCam();
  if (k==='r') resetPlayer(); if (k==='m') toggleMute(); });
addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });
const touchUI = document.getElementById('touch');
const showTouch = () => { touchUI.classList.add('show'); document.body.classList.add('touchmode'); };
if (matchMedia('(pointer:coarse)').matches) showTouch();
addEventListener('touchstart', showTouch, {once:true, passive:true});
// floating analog stick: it appears under your thumb; x steers (with a soft centre), pushing up adds gas, pulling down brakes
(function stickControl(){
  const zone = document.getElementById('stickZone'), stick = document.getElementById('stick'), knob = document.getElementById('stickKnob');
  const R = 52, DEAD = .07; let id = null, cx = 0, cy = 0;
  const home = () => { stick.style.left = '24px'; stick.style.top = ''; stick.style.bottom = '24px'; };
  const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px,${dy}px)`; };
  const release = () => { id = null; touchState.steerX = 0; touchState.stickGas = touchState.stickBrk = false; setKnob(0,0); stick.classList.add('idle'); stick.classList.remove('gas','brk'); home(); };
  zone.addEventListener('pointerdown', e => {
    e.preventDefault(); ensureAudio(); if (id !== null) return; id = e.pointerId; try { zone.setPointerCapture(id); } catch(_){}
    const r = zone.getBoundingClientRect(), half = 66;
    cx = clamp(e.clientX - r.left, half, r.width - half); cy = clamp(e.clientY - r.top, half, r.height - half);
    stick.style.left = (cx - half) + 'px'; stick.style.top = (cy - half) + 'px'; stick.style.bottom = 'auto';
    stick.classList.remove('idle'); move(e);
  });
  const move = e => {
    if (e.pointerId !== id) return; e.preventDefault();
    const r = zone.getBoundingClientRect();
    let dx = e.clientX - r.left - cx, dy = e.clientY - r.top - cy; const d = Math.hypot(dx,dy);
    if (d > R){ dx *= R/d; dy *= R/d; }
    setKnob(dx, dy);
    const x = dx/R, y = dy/R, ax = Math.max(0, (Math.abs(x) - DEAD)/(1 - DEAD));
    touchState.steerX = Math.sign(x) * Math.pow(ax, 1.35);
    touchState.stickGas = y < -.5; touchState.stickBrk = y > .55;
    stick.classList.toggle('gas', touchState.stickGas); stick.classList.toggle('brk', touchState.stickBrk);
  };
  zone.addEventListener('pointermove', move);
  for (const ev of ['pointerup','pointercancel','lostpointercapture']) zone.addEventListener(ev, e => { if (e.pointerId === id) release(); });
  release();
})();
document.querySelectorAll('.tbtn[data-k]').forEach(el=>{
  const k = el.dataset.k;
  const on = e=>{ e.preventDefault(); touchState[k]=true; el.classList.add('down'); try{el.setPointerCapture(e.pointerId);}catch(_){} ensureAudio(); };
  const off = e=>{ touchState[k]=false; el.classList.remove('down'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
});
addEventListener('contextmenu', e=>e.preventDefault());
document.getElementById('abilBtn').addEventListener('pointerdown', e => { e.preventDefault(); ensureAudio(); useAbility(player); });
document.getElementById('camBtn').addEventListener('click', () => cycleCam());
function rawInput(){
  const L = keys['arrowleft']||keys['a']||touchState.left, Rr = keys['arrowright']||keys['d']||touchState.right;
  const digital = (Rr?1:0)-(L?1:0), analog = +touchState.steerX || 0;
  return { thr: !!(keys['arrowup']||keys['w']||touchState.gas||touchState.stickGas), brk: !!(keys['arrowdown']||keys['s']||touchState.brake||touchState.stickBrk),
           steer: digital || analog, hand: !!(keys[' '] || touchState.hand) };
}
// Assisted: the car follows the racing line and brakes for corners by itself; you choose the lane, when to drift,
// when to brake extra and when to fire the ability (the phone scheme, but it works with keys too)
let ctrlMode = IS_TOUCH ? 'assist' : 'manual'; try { const sc = localStorage.getItem('dustrunner-ctrl'); if (sc === 'assist' || sc === 'manual') ctrlMode = sc; } catch(_){}
let assistT = 0;
function assistInput(raw){
  const c = player, now = performance.now()/1000, dt = Math.min(.1, now - (assistT || now)); assistT = now;
  const sp = Math.abs(c.f), plan = speedPlan(c, true), look = Math.round(6 + sp*.16), ti = (c.idx+look)%N;   // always the road line: assisted drivers stay on the road
  c.assistLane = (c.assistLane || 0) + (raw.steer*4 - (c.assistLane || 0))*Math.min(1, dt*5);
  const lim = W/2 - 3.5; let lane = clamp(RL.road[ti]*.8 + c.assistLane, -lim, lim);
  // keep off whatever is parked on the line ahead (same gap logic as the rivals)
  const berth = 3.2 + sp*.03 + c.prof.rad*.15, blocks = [];
  for (const o of HAZ.solids){ if (o.active && !o.active() && !(o.half > 1.8)) continue; let a = o.i - c.idx; if (a < 0) a += N; if (a < 1 || a > look + 30) continue; blocks.push({a, lo:o.lat - o.r - berth, hi:o.lat + o.r + berth}); }
  if (c.prof.home !== world.id) for (const z of HAZ.zones){ if (z.lat1 - z.lat0 > W*.85) continue; let a = z.i0 - c.idx; if (a < 0) a += N; const inside = a >= N - z.len; if (!inside && a > look + 25) continue; blocks.push({a: inside ? 0 : a, lo:z.lat0 - 3.2, hi:z.lat1 + 3.2}); }
  let nearA = 1e9;
  if (blocks.length){ const a0 = Math.min(...blocks.map(b => b.a)), group = blocks.filter(b => b.a <= a0 + 20);
    const free = x => x >= -lim && x <= lim && !group.some(b => x > b.lo && x < b.hi);
    if (!free(lane)){ const cands = [lane, ...group.flatMap(b => [b.lo, b.hi]), -lim, lim].filter(free); if (cands.length){ let best = cands[0]; for (const x of cands) if (Math.abs(x - lane) < Math.abs(best - lane)) best = x; lane = best; nearA = a0; } } }
  // follow the road's own direction a little way ahead, and ease across to the lane over ~22 m (no corner cutting)
  const hi = (c.idx + (nearA < look ? 3 : 5)) % N, roadH = Math.atan2(T[hi].x, T[hi].z), e = lane - (c.lat || 0);
  let diff = wrapA(roadH + Math.atan2(e, 22 + sp*.15) - c.h);
  // the shortcut is yours to choose: push toward its mouth as you reach it (or just drive onto it) and the assist takes you through
  if (CUT && cutOK(c)){ const k = ((CUT.iA - c.idx) % N + N) % N, inward = Math.sign(R[CUT.iA].x*(CUT.A.x - P[CUT.iA].x) + R[CUT.iA].z*(CUT.A.z - P[CUT.iA].z));
    if (k > 0 && k < 26 && raw.steer*inward < -.3) c.assistCut = true; else if (k > 40 && !c.onCut) c.assistCut = false;
    if (c.onCut || (c.assistCut && k < 26)){ const sA = c.onCut ? clamp(c.onCut.u*CUT.len + 16 + sp*.45, 0, CUT.len + 16) : null, e2 = c.onCut ? { x: CUT.A.x + CUT.dir.x*sA, z: CUT.A.z + CUT.dir.z*sA } : CUT.A; diff = wrapA(Math.atan2(e2.x - c.x, e2.z - c.z) - c.h); } }
  // speed: brake for the slowest corner that can't be reached at this speed, a touch earlier than a Hard rival would
  let target = MAXS*c.prof.maxMul*1.05 + (c.boost > 0 ? 24 : 0); const decel = 20, horizon = Math.min(150, 12 + (sp*sp)/(2*decel)/segLen);
  const margin = .93*(.8 + .2*clamp((c.prof.gripRoad - 5)/5, 0, 1));            // the plan is a full-lock limit; low-grip vehicles need more in hand
  for (let j=0; j<=horizon; j++){ const v = plan[(c.idx+j)%N]*margin; const allow = Math.sqrt(v*v + 2*decel*j*segLen); if (allow < target) target = allow; }
  if (nearA < 18) target *= .9;
  if (c.onCut) target = Math.max(target, MAXS*c.prof.maxMul*.8);
  for (const j of JUMPS){ const k = (j.lip - c.idx + N) % N; if (k < 45) target = MAXS*1.1*c.prof.maxMul; }
  if (Math.abs(c.l||0) > 5 && !raw.hand && !c.onCut) target = Math.min(target, sp - 6);        // already sliding wide: shed speed now
  const thr = !raw.brk && sp < target, brk = raw.brk || sp > target + 4;
  // a held slide lets the back step out; steer a little less so the drift stays on the road
  return { thr, brk, steer: clamp(-diff*2.8, -1, 1)*(raw.hand ? .85 : 1), hand: raw.hand };
}
function playerInput(){ const raw = rawInput(); return (ctrlMode === 'assist' && state === 'race') ? assistInput(raw) : raw; }
function setCtrl(m){ ctrlMode = m; try { localStorage.setItem('dustrunner-ctrl', m); } catch(_){} document.querySelectorAll('#cpick .gopt').forEach(b => b.setAttribute('aria-checked', String(b.dataset.c === m))); document.body.classList.toggle('assist', m === 'assist'); keyHintText(); }
function keyHintText(){
  const touch = !matchMedia('(pointer:fine)').matches;
  $('keyHint').innerHTML = ctrlMode === 'assist'
    ? (touch ? 'Assisted: the car holds the racing line and brakes for corners. Push the stick left or right to change lane, hold DRIFT through a corner and release for a boost, BRAKE to slow more, ★ fires your ability, ◎ changes camera.'
             : 'Assisted: the car holds the racing line and brakes for corners. <kbd>←</kbd><kbd>→</kbd> change lane · hold <kbd>Space</kbd> through a corner and release for a boost · <kbd>↓</kbd> brake more · <kbd>E</kbd> ability · <kbd>C</kbd> camera · <kbd>R</kbd> back on track')
    : (touch ? 'Drag the stick on the left to steer (push up for gas, down to brake). GAS and BRAKE on the right, DRIFT through corners for a boost, ★ fires your ability, ◎ changes camera, ↺ puts you back on track.'
             : '<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive · hold <kbd>Space</kbd> through a corner and release for a drift boost · <kbd>E</kbd> ability · <kbd>C</kbd> camera · <kbd>R</kbd> back on track · <kbd>Esc</kbd> pause');
}
function resetPlayer(){
  if (state!=='race' || paused || player.loop) return;
  let i = player.idx; while (GAP[i] || NOROAD[i]) i = (i + 1) % N; player.x=P[i].x; player.z=P[i].z; player.y=H[i]; player.air=null; player.idx=i; player.h=Math.atan2(T[i].x,T[i].z); player.vx=player.vz=player.f=player.l=0;
  showToast('Back on track', 900);
}
document.getElementById('resetBtn').addEventListener('click', resetPlayer);

/* ---------- audio ---------- */
let actx=null, oscA, oscB, filt, gain, muted=false;
// volume levels (0..1), remembered; every sound effect runs through one bus whose gain is the Sound level
const volLoad = (k, d) => { try { const v = parseFloat(localStorage.getItem(k)); return isFinite(v) ? clamp(v, 0, 1) : d; } catch(_){ return d; } };
let sfxVol = volLoad('dustrunner-sfxvol', 1), musVol = volLoad('dustrunner-musvol', 1), sfxMaster = null;
function sfxBus(){ if (!sfxMaster){ sfxMaster = actx.createGain(); sfxMaster.gain.value = sfxVol; sfxMaster.connect(actx['destination']); } return sfxMaster; }
function setSfxVol(v){ sfxVol = clamp(v, 0, 1); try { localStorage.setItem('dustrunner-sfxvol', String(sfxVol)); } catch(_){} if (sfxMaster) sfxMaster.gain.setTargetAtTime(sfxVol, actx.currentTime, .03); }
function setMusVol(v){ musVol = clamp(v, 0, 1); try { localStorage.setItem('dustrunner-musvol', String(musVol)); } catch(_){} }
function ensureAudio(){
  if (actx || muted) return;
  try {
    actx = new (window.AudioContext||window.webkitAudioContext)();
    oscA = actx.createOscillator(); oscA.type='sawtooth'; oscB = actx.createOscillator(); oscB.type='square';
    filt = actx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=520; gain = actx.createGain(); gain.gain.value=0;
    const gB = actx.createGain(); gB.gain.value=.5;
    oscA.connect(filt); oscB.connect(gB).connect(filt); filt.connect(gain).connect(sfxBus());
    oscA.start(); oscB.start();
    buildTankAudio();
  } catch(_) { actx = null; }
}
// Tank voice: diesel rumble with a lumpy idle, track-link clatter that speeds up with the tank, and squeal when slewing
let tk = null;
function buildTankAudio(){
  const A = actx, out = sfxBus();
  const noise = A.createBuffer(1, A.sampleRate*2, A.sampleRate); const nd = noise.getChannelData(0);
  for (let i=0;i<nd.length;i++) nd[i] = Math.random()*2-1;
  const src = () => { const s = A.createBufferSource(); s.buffer = noise; s.loop = true; s.start(); return s; };
  const rumA = A.createOscillator(); rumA.type='sawtooth';
  const rumB = A.createOscillator(); rumB.type='square';
  const rumLP = A.createBiquadFilter(); rumLP.type='lowpass'; rumLP.frequency.value=240; rumLP.Q.value=4;
  const rumBg = A.createGain(); rumBg.gain.value=.35;
  const trem = A.createGain(); trem.gain.value=.7;
  const lfo = A.createOscillator(); lfo.type='sine'; lfo.frequency.value=7;
  const lfoD = A.createGain(); lfoD.gain.value=.3; lfo.connect(lfoD).connect(trem.gain);
  const rumOut = A.createGain(); rumOut.gain.value=0;
  rumA.connect(rumLP); rumB.connect(rumBg).connect(rumLP); rumLP.connect(trem).connect(rumOut).connect(out);
  const rumNoise = src(); const rnLP = A.createBiquadFilter(); rnLP.type='lowpass'; rnLP.frequency.value=120; const rnG = A.createGain(); rnG.gain.value=.5;
  rumNoise.connect(rnLP).connect(rnG).connect(trem);
  const clat = src(); const clBP = A.createBiquadFilter(); clBP.type='bandpass'; clBP.frequency.value=1500; clBP.Q.value=1.1;
  const clMod = A.createGain(); clMod.gain.value=.5;
  const clLfo = A.createOscillator(); clLfo.type='square'; clLfo.frequency.value=2;
  const clDepth = A.createGain(); clDepth.gain.value=.5; clLfo.connect(clDepth).connect(clMod.gain);
  const clOut = A.createGain(); clOut.gain.value=0;
  clat.connect(clBP).connect(clMod).connect(clOut).connect(out);
  const sq = src(); const sqBP = A.createBiquadFilter(); sqBP.type='bandpass'; sqBP.frequency.value=2900; sqBP.Q.value=9;
  const sqOut = A.createGain(); sqOut.gain.value=0; sq.connect(sqBP).connect(sqOut).connect(out);
  [rumA,rumB,lfo,clLfo].forEach(o=>o.start());
  tk = {rumA,rumB,lfo,rumOut,rumLP,clLfo,clOut,clBP,sqOut,sqBP};
  // walker voice: turbine whine plus a servo note that rises with stride rate
  const tb = A.createOscillator(); tb.type='sawtooth'; const tbBP = A.createBiquadFilter(); tbBP.type='bandpass'; tbBP.Q.value=8; tbBP.frequency.value=1800;
  const tbN = src(); const tnBP = A.createBiquadFilter(); tnBP.type='bandpass'; tnBP.frequency.value=2400; tnBP.Q.value=2;
  const tbOut = A.createGain(); tbOut.gain.value=0; tb.connect(tbBP).connect(tbOut); tbN.connect(tnBP).connect(tbOut); tbOut.connect(out);
  const sv = A.createOscillator(); sv.type='triangle'; const svOut = A.createGain(); svOut.gain.value=0; sv.connect(svOut).connect(out);
  tb.start(); sv.start();
  tk.walk = {tb, tbBP, tbOut, sv, svOut};
  // jet voice: burner roar (low noise), compressor whine (sine pair) and a hiss on top
  const jr = src(); const jrLP = A.createBiquadFilter(); jrLP.type='lowpass'; jrLP.frequency.value=500; jrLP.Q.value=.7;
  const jrOut = A.createGain(); jrOut.gain.value=0; jr.connect(jrLP).connect(jrOut).connect(out);
  const jw1 = A.createOscillator(); jw1.type='sine'; const jw2 = A.createOscillator(); jw2.type='sine';
  const jwOut = A.createGain(); jwOut.gain.value=0; jw1.connect(jwOut); jw2.connect(jwOut); jwOut.connect(out);
  const jh = src(); const jhBP = A.createBiquadFilter(); jhBP.type='bandpass'; jhBP.frequency.value=5200; jhBP.Q.value=.8;
  const jhOut = A.createGain(); jhOut.gain.value=0; jh.connect(jhBP).connect(jhOut).connect(out);
  jw1.start(); jw2.start();
  tk.jet = {jrLP, jrOut, jw1, jw2, jwOut, jhOut};
  tk.noise = noise;
}
// your own walker's footfall: a heavy thud and a short hydraulic hiss
function stompSound(k=1){
  if (!actx || muted || !tk) return;
  thud(.9*k);
  const A = actx, t0 = A.currentTime, s = A.createBufferSource(); s.buffer = tk.noise;
  const hp = A.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=2500; const g = A.createGain();
  g.gain.setValueAtTime(.0001,t0); g.gain.exponentialRampToValueAtTime(.05,t0+.03); g.gain.exponentialRampToValueAtTime(.0001,t0+.28);
  s.connect(hp).connect(g).connect(sfxBus()); s.start(t0, Math.random()); s.stop(t0+.3);
}
function thud(k){
  if (!actx || muted) return;
  const A = actx, t0 = A.currentTime, o = A.createOscillator(), g = A.createGain();
  o.type='sine'; o.frequency.setValueAtTime(90,t0); o.frequency.exponentialRampToValueAtTime(38,t0+.25);
  g.gain.setValueAtTime(.18*k,t0); g.gain.exponentialRampToValueAtTime(.001,t0+.3);
  o.connect(g).connect(sfxBus()); o.start(t0); o.stop(t0+.32);
}
const unloaded = c => (c.air || c.airT > 0) && !c.loop ? 1 : 0;                       // no road under the wheels: nothing for the engine to push against
let _audT = 0;
function freeOf(c, dt){ const want = unloaded(c); c._freeK = (c._freeK || 0) + (want - (c._freeK || 0))*Math.min(1, dt*(want ? 9 : 14)); return c._freeK; }
// how loud a car's own effects (bumps, landings, crashes, ability) are: in a race only your vehicle's at full; in the Inspector
// every car's, fading with its distance from the UFO, so riding along with any racer you hear what it hears
function earK(c){ if (state === 'insp'){ const L = audioListener(), d = Math.hypot(c.x - L.x, (c.y || 0) - L.y, c.z - L.z), k = 1/(1 + Math.pow(d/18, 2)); return k < .03 ? 0 : k; } return c.player ? 1 : 0; }
const carThud = (c, k) => { const e = earK(c); if (e > 0) thud(k*e); };
// distance-faded effects heard from the listener (an impact, a stomp near the road): 1 - d/r, 0 beyond r
const earAt = (x, z, r) => { const L = audioListener(), d = Math.hypot(x - L.x, z - L.z); return d < r ? 1 - d/r : 0; };
// where the ears are: the player's vehicle in a race, the Inspector's UFO (the camera) while inspecting
function audioListener(){ if (state === 'insp') return { x:camera.position.x, y:camera.position.y, z:camera.position.z, vx:INSP.vx || 0, vz:INSP.vz || 0 };
  return { x:player.x, y:player.y || 0, z:player.z, vx:player.vx, vz:player.vz }; }
function updateAudio(){
  if (!actx) return;
  const tNow = performance.now(), adt = Math.min(.1, (tNow - _audT)/1000 || .016); _audT = tNow;
  const free = freeOf(player, adt), rev = free*(player.thr ? 1 : .55);                   // unloaded and on the throttle the revs run away; off it they still float up
  const sp = Math.abs(player.f); const gear = Math.min(4, Math.floor(sp/15)); const frac = (sp - gear*15)/15;
  const f = (48 + gear*7 + frac*70 + (player.boost>0?18:0))*(1 + .5*rev);
  oscA.frequency.setTargetAtTime(f, actx.currentTime, .05); oscB.frequency.setTargetAtTime(f*.5, actx.currentTime, .05);
  const silent = muted||paused||state==='menu', isTank = player.kind==='tank', isWalker = player.kind==='walker' || player.kind==='quad' || player.kind==='hover', isJet = player.kind==='jet' || player.kind==='drone', now = actx.currentTime, spF = Math.min(sp/MAXS,1);
  // in the inspector you listen from the UFO: your vehicle's engine fades with distance like any other
  const lis = audioListener(), pD = Math.hypot(player.x - lis.x, (player.y || 0) - lis.y, player.z - lis.z), pA = state === 'insp' ? 1/(1 + Math.pow(pD/16, 2)) : 1;
  filt.frequency.setTargetAtTime(520 + 1100*rev, now, .06);                                         // the car: screaming up through the harmonics, brighter and a touch louder
  gain.gain.setTargetAtTime((silent||isTank||isWalker||isJet ? 0 : (.045 + spF*.03)*(1 + .35*rev))*pA, now, .1);
  if (!tk) return;
  const thr = !silent && isTank;
  const rf = (24 + spF*30 + (player.boost>0?10:0) + (keys['arrowup']||keys['w']||touchState.gas ? 4 : 0))*(1 + .4*rev);   // the diesel races with the tracks spinning free
  tk.rumA.frequency.setTargetAtTime(rf, now, .12); tk.rumB.frequency.setTargetAtTime(rf*1.5, now, .12);
  tk.lfo.frequency.setTargetAtTime((6 + spF*9)*(1 + .8*rev), now, .2);
  tk.rumLP.frequency.setTargetAtTime(200 + spF*380 + 420*rev, now, .15);
  tk.rumOut.gain.setTargetAtTime((thr ? (.11 + spF*.05)*(1 + .3*rev) : 0)*pA, now, .12);
  tk.clLfo.frequency.setTargetAtTime((1.5 + sp*.62)*(1 + .6*free), now, .08);                       // the track links whip round with nothing under them
  tk.clBP.frequency.setTargetAtTime(player.off ? 900 : 1500, now, .2);
  tk.clOut.gain.setTargetAtTime((thr ? Math.min(sp/8,1)*(player.off?.05:.075) + Math.abs(player.steerV)*.02 : 0)*pA, now, .08);
  tk.sqBP.frequency.setTargetAtTime(2600 + Math.abs(player.steerV)*700, now, .1);
  tk.sqOut.gain.setTargetAtTime((thr ? Math.abs(player.steerV)*(1-spF*.6)*.022*(player.off?.4:1) : 0)*pA, now, .1);
  const wk = tk.walk, on = !silent && isWalker;
  wk.tb.frequency.setTargetAtTime((180 + spF*260 + (player.boost>0?120:0))*(1 + .45*rev), now, .15);    // the turbine spools up with the legs off the ground
  wk.tbBP.frequency.setTargetAtTime(1400 + spF*1600 + 1400*rev, now, .15);
  wk.tbOut.gain.setTargetAtTime((on ? (.018 + spF*.03)*(1 + .5*rev) : 0)*pA, now, .15);
  wk.sv.frequency.setTargetAtTime((110 + spF*90 + Math.abs(player.steerV)*40 + 70*free)*(player.kind==='quad'?1.5:1), now, .1);
  wk.svOut.gain.setTargetAtTime((on ? .02 + spF*.025 : 0)*pA, now, .12);
  const jt = tk.jet, jon = !silent && isJet, thrust = jon ? (player.thr ? 1 : .35) + (player.boost>0 ? .6 : 0) + .7*rev : 0;   // in the air the burners open right up
  jt.jrLP.frequency.setTargetAtTime(260 + thrust*700 + spF*300, now, .12);
  jt.jrOut.gain.setTargetAtTime((jon ? .06 + thrust*.09 : 0)*pA, now, .1);
  jt.jw1.frequency.setTargetAtTime((700 + spF*1500 + thrust*300)*(1 + .3*rev), now, .25); jt.jw2.frequency.setTargetAtTime((1405 + spF*3000 + thrust*500)*(1 + .3*rev), now, .25);
  jt.jwOut.gain.setTargetAtTime((jon ? .008 + spF*.014 : 0)*pA, now, .2);
  jt.jhOut.gain.setTargetAtTime((jon ? thrust*.02 : 0)*pA, now, .1);
  try { rivalsAudio(silent || !(state === 'race' || state === 'count' || state === 'done' || state === 'insp'), adt); } catch(_){}
}

/* ---------- the rivals' engines: each one you can hear, placed in the stereo field, louder as it closes, pitched up as it comes at you and
   down as it goes by (Doppler), with a whoosh of air at the moment it passes. One small synth voice per rival in its vehicle's family:
   car (saw + sub-square), tank (lumpy diesel + rumble), walker/quad/hover (turbine whine + servo note), jet/drone (burner roar + whine). ---------- */
const RIV = { voices:new Map(), fwd:new THREE.Vector3(), right:new THREE.Vector3(), rel:new THREE.Vector3(), noise:null };
const RIV_FAMILY = k => k === 'tank' ? 'tank' : (k === 'walker' || k === 'quad' || k === 'hover') ? 'walker' : (k === 'jet' || k === 'drone') ? 'jet' : 'car';
function rivNoise(){ if (RIV.noise) return RIV.noise; if (tk && tk.noise) return RIV.noise = tk.noise; const A = actx, b = A.createBuffer(1, A.sampleRate*2, A.sampleRate), d = b.getChannelData(0); for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1; return RIV.noise = b; }
function rivVoice(c){
  let v = RIV.voices.get(c); if (v && v.kind === c.kind) return v;
  if (v) rivVoiceStop(c);
  const A = actx, fam = RIV_FAMILY(c.kind), out = sfxBus();
  const pan = A.createStereoPanner ? A.createStereoPanner() : null, g = A.createGain(), tg = A.createGain(); g.gain.value = 0; tg.gain.value = 1;
  const lp = A.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
  lp.connect(tg).connect(g); if (pan) g.connect(pan).connect(out); else g.connect(out);
  const oA = A.createOscillator(), oB = A.createOscillator(), gB = A.createGain(), n = A.createBufferSource(), nF = A.createBiquadFilter(), nG = A.createGain();
  n.buffer = rivNoise(); n.loop = true; nG.gain.value = 0; gB.gain.value = .5;
  if (fam === 'car'){ oA.type = 'sawtooth'; oB.type = 'square'; nF.type = 'bandpass'; nF.frequency.value = 900; }
  else if (fam === 'tank'){ oA.type = 'sawtooth'; oB.type = 'square'; nF.type = 'lowpass'; nF.frequency.value = 120; nG.gain.value = .5; }
  else if (fam === 'walker'){ oA.type = 'sawtooth'; oB.type = 'triangle'; gB.gain.value = 1; nF.type = 'bandpass'; nF.frequency.value = 2400; nF.Q.value = 2; nG.gain.value = .25; }
  else { oA.type = 'sine'; oB.type = 'sine'; gB.gain.value = .6; nF.type = 'lowpass'; nF.frequency.value = 500; nG.gain.value = 1.2; }
  oA.connect(lp); oB.connect(gB).connect(lp); n.connect(nF).connect(nG).connect(lp);
  let trem = null; if (fam === 'tank'){ trem = A.createOscillator(); trem.type = 'sine'; trem.frequency.value = 7; const td = A.createGain(); td.gain.value = .35; trem.connect(td).connect(tg.gain); trem.start(); }   // a lumpy idle: the tremolo rides a unity stage, not the volume
  if (fam === 'car'){ const bp = A.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 520; oA.disconnect(); oA.connect(bp).connect(lp); gB.disconnect(); gB.connect(bp); v = { bp }; } else v = {};
  oA.start(); oB.start(); n.start(0, Math.random()*1.5);
  Object.assign(v, { kind:c.kind, fam, oA, oB, gB, n, nF, nG, lp, g, pan, trem, along:0, whooshT:0 });
  RIV.voices.set(c, v); return v;
}
function rivVoiceStop(c){ const v = RIV.voices.get(c); if (!v) return; try { for (const o of [v.oA, v.oB, v.n, v.trem]) if (o) o.stop(); } catch(_){} try { v.g.disconnect(); } catch(_){} RIV.voices.delete(c); }
// a short rush of air as a rival goes by, swept across the stereo field in the direction it went
function whoosh(k, fromPan, toPan){
  if (!actx || muted) return; const A = actx, t0 = A.currentTime, s = A.createBufferSource(); s.buffer = rivNoise();
  const f = A.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = .9; f.frequency.setValueAtTime(600, t0); f.frequency.exponentialRampToValueAtTime(2200, t0 + .12); f.frequency.exponentialRampToValueAtTime(400, t0 + .5);
  const g = A.createGain(); g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(.16*k, t0 + .1); g.gain.exponentialRampToValueAtTime(.0001, t0 + .55);
  let node = f.connect(g); if (A.createStereoPanner){ const p = A.createStereoPanner(); p.pan.setValueAtTime(fromPan, t0); p.pan.linearRampToValueAtTime(toPan, t0 + .4); node = g.connect(p); }
  s.connect(f); node.connect(sfxBus()); s.start(t0, Math.random()); s.stop(t0 + .6);
}
function rivalsAudio(silent, adt){
  if (!actx || !cars || cars.length < 2) return;
  const now = actx.currentTime, A = actx, lis = audioListener(); adt = adt || .016;
  camera.getWorldDirection(RIV.fwd); RIV.fwd.y = 0; if (RIV.fwd.lengthSq() < 1e-6) RIV.fwd.set(Math.sin(player.h), 0, Math.cos(player.h)); RIV.fwd.normalize();
  RIV.right.set(-RIV.fwd.z, 0, RIV.fwd.x);
  // the three nearest are voiced; the rest are quiet
  const order = cars.filter(c => !c.player).map(c => ({ c, d:Math.hypot(c.x - lis.x, c.z - lis.z) })).sort((a, b) => a.d - b.d);
  order.forEach((o, rank) => {
    const c = o.c, d = o.d; if (!RIV.voices.has(c) && (silent || rank > 2 || d > 140)) return;
    const v = rivVoice(c), fam = v.fam;
    const sp = Math.hypot(c.vx, c.vz), spF = Math.min(sp/MAXS, 1), boost = c.boost > 0 ? 1 : 0, rfree = freeOf(c, adt)*(c.thr ? 1 : .55);
    RIV.rel.set(c.x - lis.x, 0, c.z - lis.z); const along = RIV.rel.dot(RIV.fwd), side = RIV.rel.dot(RIV.right);
    // Doppler: the rate at which the gap closes, measured along the line between the two
    const ux = d > .5 ? RIV.rel.x/d : 0, uz = d > .5 ? RIV.rel.z/d : 0, vrel = (c.vx - lis.vx)*ux + (c.vz - lis.vz)*uz, dop = (1 - clamp(vrel/95, -.22, .22))*(1 + .42*rfree);   // Doppler, and a free-revving engine off the ground
    const near = 1/(1 + Math.pow(d/16, 2)), vol = silent || rank > 2 ? 0 : near*(.7 + .3*spF + .3*boost);
    const tc = .06;
    if (fam === 'car'){ const gear = Math.min(4, Math.floor(sp/15)), frac = (sp - gear*15)/15, f = (48 + gear*7 + frac*70 + boost*18)*dop;
      v.oA.frequency.setTargetAtTime(f, now, tc); v.oB.frequency.setTargetAtTime(f*.5, now, tc); v.bp.frequency.setTargetAtTime(420 + spF*300, now, .1); v.g.gain.setTargetAtTime(vol*.07, now, .08); }
    else if (fam === 'tank'){ const rf = (24 + spF*30 + boost*10)*dop; v.oA.frequency.setTargetAtTime(rf, now, .1); v.oB.frequency.setTargetAtTime(rf*1.5, now, .1); v.trem.frequency.setTargetAtTime(6 + spF*9, now, .2); v.g.gain.setTargetAtTime(vol*.16, now, .1); }
    else if (fam === 'walker'){ const tb = (180 + spF*260 + boost*120)*dop; v.oA.frequency.setTargetAtTime(tb, now, .12); v.oB.frequency.setTargetAtTime((110 + spF*90)*(c.kind === 'quad' ? 1.5 : 1)*dop, now, .1); v.nF.frequency.setTargetAtTime(1400 + spF*1600, now, .15); v.g.gain.setTargetAtTime(vol*.055, now, .1); }
    else { const thrust = (c.thr ? 1 : .35) + boost*.6; v.nF.frequency.setTargetAtTime(260 + thrust*700 + spF*300, now, .12); v.oA.frequency.setTargetAtTime((700 + spF*1500 + thrust*300)*dop, now, .2); v.oB.frequency.setTargetAtTime((1405 + spF*3000 + thrust*500)*dop, now, .2); v.g.gain.setTargetAtTime(vol*.09, now, .1); }
    v.lp.frequency.setTargetAtTime((fam === 'jet' ? 2600 : 420 + 2200*near)*(1 + .6*rfree), now, .15);                 // far away only the low end carries
    if (v.pan) v.pan.pan.setTargetAtTime(clamp(side/Math.max(6, d*.8), -.9, .9), now, .08);
    // the pass: it crosses the camera's line while the gap is changing fast — a whoosh swept from where it was to where it went
    v.whooshT = Math.max(0, v.whooshT - 1/60);
    const jumped = v.d !== undefined && Math.abs(d - v.d) > 8;                                     // a respawn or reset is not a pass
    if (!silent && !jumped && d < 13 && v.whooshT <= 0 && Math.sign(along) !== Math.sign(v.along) && v.along !== 0 && Math.abs(vrel) > 5 && Math.abs(vrel) < 60){
      const p0 = clamp(side/8, -.8, .8), toward = along > v.along ? 1 : -1; whoosh(Math.min(1, Math.abs(vrel)/25)*(1 - d/14), p0 - .35*toward, p0 + .35*toward); v.whooshT = 1.2; }
    v.along = along; v.d = d; });
  for (const [c, v] of RIV.voices){ if (!cars.includes(c) || (v.d > 160)) rivVoiceStop(c); }
}
function toggleMute(){ muted=!muted; document.getElementById('muteBtn').style.opacity = muted ? .45 : 1; if (!muted){ ensureAudio(); if (typeof musicKick === 'function') musicKick(); }
  const sb = document.getElementById('sndBtn'); if (sb){ sb.setAttribute('aria-pressed', String(!muted)); sb.textContent = muted ? 'Sound off' : 'Sound on'; } }
document.getElementById('muteBtn').addEventListener('click', toggleMute);

/* ---------- music: Midnight Velocity, looping under the menu and the race ---------- */
let musicOn = true; try { musicOn = (localStorage.getItem('dustrunner-music') || 'on') !== 'off'; } catch(_){}
const music = new Audio(DR87.asset('music/music.mp3')); music.loop = true; music.preload = 'auto'; music.volume = 0; let musicStarted = false;
// worlds with their own race track: it takes over from the main theme for the countdown, the race and the results, crossfading both ways
const WORLD_MUSIC = { desert:'music-desert.mp3', forge:'music-forge.mp3', tundra:'music-tundra.mp3', cirrus:'music-cirrus.mp3', quarry:'music-quarry.mp3', hive:'music-hive.mp3' };   // Mojave Basin: Sirocco Drive · Basalt Forge: Full Throttle Canyon · Glacier Spire: North of the Finish · Cirrus Reach: Blue Horizon Sprint · Ferrous Moon: Gas Giant Ascent · Hive Lattice: Midnight Pursuit
const TRACKS = { main:music }; for (const [w, src] of Object.entries(WORLD_MUSIC)){ const a = new Audio(DR87.asset('music/' + src)); a.loop = true; a.preload = 'auto'; a.volume = 0; TRACKS[w] = a; }
function musicKick(){ if (musicStarted || !musicOn || muted) return; const pr = music.play(); if (pr && pr.then) pr.then(() => { musicStarted = true; }).catch(() => {}); else musicStarted = true; }
function musicUpdate(dt){
  const racing = state === 'race' || state === 'count' || state === 'done' || state === 'insp';   // the inspector plays each world's own track too, so switching worlds switches the music
  const base = (!musicOn || muted || document.hidden) ? 0 : ((state === 'race' || state === 'count') ? .38 : state === 'done' ? .48 : state === 'insp' ? .45 : .55) * (paused ? .45 : 1) * musVol;
  const active = (racing && world && TRACKS[world.id]) ? world.id : 'main';
  for (const [k, a] of Object.entries(TRACKS)){ const want = k === active ? base : 0;
    a.volume = Math.max(0, Math.min(1, a.volume + (want - a.volume)*Math.min(1, dt*1.8)));
    if (!musicStarted) continue;
    if (want === 0 && a.volume < .015 && !a.paused) a.pause();
    else if (want > 0 && a.paused){ if (k !== 'main' && a.volume < .02) a.currentTime = 0; a.play().catch(() => {}); } }   // a world's track starts from the top each time it comes in
}
function setMusic(on){ musicOn = on; try { localStorage.setItem('dustrunner-music', on ? 'on' : 'off'); } catch(_){}
  const b = document.getElementById('musBtn'); if (b){ b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Music on' : 'Music off'; } if (on) musicKick(); }
document.addEventListener('pointerdown', musicKick); document.addEventListener('keydown', musicKick);

/* ---------- HUD ---------- */
const $ = id => document.getElementById(id);
const fmt = s => { if (!isFinite(s)) return '–'; const m=Math.floor(s/60), r=s-m*60; return m+':'+(r<10?'0':'')+r.toFixed(2); };
let bestLap = Infinity; try { const b = parseFloat(localStorage.getItem('dustrunner-best')); if (b>0) bestLap=b; } catch(_){}
let toastTimer=0;
function showToast(txt, ms){ const t=$('toast'); t.textContent=txt; t.classList.add('on'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('on'), ms||1200); }
let boostTimer=0;
function flashBoost(){ $('boostTag').classList.add('on'); clearTimeout(boostTimer); boostTimer=setTimeout(()=>$('boostTag').classList.remove('on'),1500); }
const ord = n => n+(['th','st','nd','rd'][n]||'th');

const mapC = $('map'), mctx = mapC.getContext('2d');
let mapBase, mapScale, mapOff;
function buildMap(){
  const css = mapC.clientWidth || 118, dpr = Math.min(devicePixelRatio||1,2); mapC.width = mapC.height = css*dpr;
  let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9; for (const p of P){ minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z); }
  const pad = 10*dpr; mapScale = (mapC.width-pad*2)/Math.max(maxX-minX,maxZ-minZ);
  mapOff = [pad - minX*mapScale + ((mapC.width-pad*2)-(maxX-minX)*mapScale)/2, pad - minZ*mapScale + ((mapC.height-pad*2)-(maxZ-minZ)*mapScale)/2];
  mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = mapC.width; const x = mapBase.getContext('2d');
  x.lineJoin='round'; x.beginPath(); P.forEach((p,i)=>{ const X=p.x*mapScale+mapOff[0], Y=p.z*mapScale+mapOff[1]; i?x.lineTo(X,Y):x.moveTo(X,Y); }); x.closePath();
  x.strokeStyle='rgba(255,240,215,.25)'; x.lineWidth=7*dpr; x.stroke(); x.strokeStyle='#e9d6b8'; x.lineWidth=2.2*dpr; x.stroke();
  const s=P[0]; x.fillStyle='#f6f1e4'; x.fillRect(s.x*mapScale+mapOff[0]-4*dpr, s.z*mapScale+mapOff[1]-1.5*dpr, 8*dpr, 3*dpr);
  mapC._dpr = dpr;
}
function drawMap(){
  if (!mapBase) return; const dpr = mapC._dpr; mctx.clearRect(0,0,mapC.width,mapC.height); mctx.drawImage(mapBase,0,0);
  for (let k=cars.length-1;k>=0;k--){ const c=cars[k]; mctx.fillStyle = '#'+new THREE.Color(c.L.body).getHexString(); mctx.strokeStyle='#1d1210'; mctx.lineWidth=1.5*dpr;
    mctx.beginPath(); mctx.arc(c.x*mapScale+mapOff[0], c.z*mapScale+mapOff[1], (c.player?4.5:3.4)*dpr, 0, 7); mctx.fill(); mctx.stroke(); }
}

function standings(){ return [...cars].sort((a,b)=> (b.finished?1e9-b.finishTime:b.prog) - (a.finished?1e9-a.finishTime:a.prog)); }

/* ---------- game state ---------- */
let menuZoom = 0, menuOrbit = 0; const _menuR = new THREE.Vector3();
let paused=false, state='menu', raceTime=0, countT=0, doneT=0, last=performance.now(), camH=0, wrongT=0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();

function startRace(){
  ensureAudio(); if (actx && actx.state==='suspended') actx.resume(); musicKick();
  placeOnGrid(); prepRivals(); propsReset(); raceTime=0; countT=3.6; doneT=0; state='count'; surpriseReset(); for (const c of cars) burnClear(c);
  slowmo = 0; finishCam = 0; shells.splice(0).forEach(s => scene.remove(s.m));
  stopCelebration(); cel.newBest = false; cel.place = 0; if (tour) tour.banked = false;
  loadGhost(); ghostVisual(); ghost.rec = { p:[], next:0, prog0: player.prog };
  setPaused(false);
  $('menu').hidden = true; $('res').hidden = true; $('pauseBtn').hidden = false;
  document.body.classList.remove('inmenu'); slide = null; closeSettings();
  camH = player.h; snapCam();
}
$('startBtn').addEventListener('click', () => { if (raceMode === 'tour') startTour(); else { tour = null; startRace(); } });
$('gpick').addEventListener('click', e => { const b = e.target.closest('.gopt'); if (!b || !QUALITY[b.dataset.q]) return;
  quality = b.dataset.q; try { localStorage.setItem('dustrunner-quality', quality); } catch(_){} applyQuality(); });
$('mpick').addEventListener('click', e => { const b = e.target.closest('.mode'); if (!b) return; raceMode = b.dataset.m;
  document.querySelectorAll('#mpick .mode').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  $('startBtn').textContent = raceMode === 'tour' ? 'Start Grand Tour' : 'Start race'; });

/* ---------- guided first race: a few timed tips, once ---------- */
let seen = false; try { seen = !!localStorage.getItem('dustrunner-seen'); } catch(_){}
const tutor = { on: !seen, i: 0, until: 0, shownAt: -9, fired: new Set() };
function tipShow(html, ms){ const el = $('tip'); el.innerHTML = html; el.classList.add('on'); tutor.until = clockT + (ms||4)/1 ; }
function tipHide(){ $('tip').classList.remove('on'); }
function tutorUpdate(){
  if (!tutor.on){ return; }
  if (tutor.until && clockT > tutor.until){ tutor.until = 0; tipHide(); }
  const touch = document.body.classList.contains('touchmode'), assist = ctrlMode === 'assist', k = (key, label) => touch ? '<b>' + label + '</b>' : '<kbd>' + key + '</kbd>';
  const once = (id, cond, html, ms) => { if (tutor.fired.has(id) || !cond || (clockT - tutor.shownAt) < 1.2) return; tutor.fired.add(id); tutor.shownAt = clockT; tipShow(html, ms); };
  const i = player.idx, sp = Math.abs(player.f);
  once('grid', state === 'count' && countT < 3.2, assist ? 'Your first race. <b>Assisted</b> controls: the car drives the line — you pick lanes and drifts.' : 'Your first race. Hold ' + k('↑','GAS') + ' when the lights go.', 4);
  once('steer', state === 'race' && raceTime > 2.5, assist ? 'Push ' + (touch ? 'the stick' : '<kbd>←</kbd><kbd>→</kbd>') + ' to change lane. The car brakes for corners by itself.' : 'Steer with ' + k('← →','the stick') + '. Brake with ' + k('↓','BRAKE') + ' before tight corners — the <b>3·2·1</b> boards count you in.', 5);
  { const nextPad = BOOSTS.map(b => ((b - i) % N + N) % N).sort((a,b)=>a-b)[0]; once('pad', state === 'race' && nextPad < 40 && nextPad > 8, 'Chevron pads on the road give a <b>boost</b> — line one up.', 3.5); }
  once('drift', state === 'race' && raceTime > 9 && sp > 25 && Math.abs(player.steerV) > .35, 'Hold ' + k('Space','DRIFT') + ' through a corner and <b>release for a boost</b>. Longer slide, bigger burst.', 5);
  once('drifted', (player.driftTier ?? -1) >= 0, 'That is a <b>' + DRIFT.names[player.driftTier||0] + ' drift</b>. Chain them on every bend.', 3.5);
  once('meteor', state === 'race' && !!SUR.ev, '<b>' + surStyle().name.charAt(0) + surStyle().name.slice(1).toLowerCase() + '!</b> The red rings show where they land — swerve, or let the ring close on a rival.', 4.5);
  once('abil', state === 'race' && player.meter >= 100 && player.abilT <= 0, '<b>' + abilOf(player).name + '</b> is charged — press ' + k('E','★') + '. Sliding, slipstreams and near misses fill it.', 4.5);
  once('lap2', state === 'race' && player.laps === 1, 'Lap 2. Rivals brake late on <b>Hard</b> — medals unlock it, and new paint.', 4);
  once('final', state === 'race' && player.laps === LAPS-1, 'Final lap. Finish on the podium for a <b>Silver</b> medal.', 3.5);
  { const j = JUMPS[0]; if (j){ const k = (j.lip - i + N) % N; once('jump', state === 'race' && k < 60 && k > 10, '<b>Jump ahead.</b> Keep it flat out — and fly through the star gate for a boost.', 4); } }
}
function tutorDone(){ if (!tutor.on) return; tutor.on = false; tipHide(); try { localStorage.setItem('dustrunner-seen', '1'); } catch(_){} }

/* ---------- pause / restart ---------- */
function canPause(){ return (state==='count' || state==='race') && $('res').hidden; }
function setPaused(on){
  paused = !!on; if (!on) autoPaused = false;
  $('pauseScr').hidden = !paused;
  for (const k in keys) keys[k] = false;
  for (const k in touchState) touchState[k] = false;
  document.querySelectorAll('.tbtn.down').forEach(el => el.classList.remove('down'));
  $('pauseBtn').textContent = paused ? '▶' : 'Ⅱ';
  $('pauseBtn').setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  if (paused){
    const place = standings().indexOf(player)+1;
    $('pauseInfo').textContent = LEVELS[level].name + ' · ' + (state==='count' ? 'On the grid' : 'Lap ' + Math.min(LAPS, player.laps+1) + '/' + LAPS + ' · ' + ord(place)) + ' · ' + fmt(raceTime);
    $('resumeBtn').focus({preventScroll:true});
  }
  last = performance.now();
}
function togglePause(){ if (paused) setPaused(false); else if (canPause()) setPaused(true); }
function quitToMenu(){
  tipHide(); stopCelebration(); tour = null; slowmo = 0; finishCam = 0; if (ghost.mesh) ghost.mesh.visible = false; $('ghostDelta').hidden = true;
  setTimeout(rollRivals, 0);
  setPaused(false); state='menu'; doneT=0; placeOnGrid(); propsReset(); surpriseReset();
  $('res').hidden = true; $('menu').hidden = false; $('pauseBtn').hidden = true;
  document.body.classList.add('inmenu'); showStep(1);
  $('toast').classList.remove('on');
}
$('pauseBtn').addEventListener('click', togglePause);
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('pauseQ').addEventListener('click', e => { const b = e.target.closest('.gopt'); if (!b) return; quality = b.dataset.q; try { localStorage.setItem('dustrunner-quality', quality); } catch(_){} applyQuality(); });
$('restartBtn').addEventListener('click', startRace);
$('quitBtn').addEventListener('click', quitToMenu);

/* ---------- your own car (GLB / glTF / FBX from your device) ---------- */
const TRUCK_LEN = 4.7;
// Each racer carries its truck parts plus, once built, a tank and/or walker rig; only the active one shows.
let customCar = null;                              // a model you loaded from your device (overrides your look)
const MODELS = { tank:null, walker:null, jet:null, quad:null };       // source meshes, filled as the bundled models load
function ensureRig(c, kind){
  if (c.rigs[kind] || !MODELS[kind]) return c.rigs[kind];
  const wrap = new THREE.Group(); let rig;
  // every racer gets its own material so rivals can wear their team colour
  const src = { geometry: MODELS[kind].geometry, material: MODELS[kind].material.clone(), scene: MODELS[kind].scene };
  if (!c.player) src.material.color.copy(new THREE.Color(0xffffff).lerp(new THREE.Color(c.L.body), .62));
  if (kind==='rally'){ rig = buildRallyRig(src, c); }
  else if (kind==='hover'){ rig = buildHoverRig(src, c); wrap.scale.setScalar(HOVER_S); }
  else if (kind==='drone'){ rig = buildDroneRig(src, c); wrap.scale.setScalar(DRONE_S); }
  else if (kind==='tank'){ rig = buildTankRig(src); wrap.scale.setScalar(5.3); }
  else if (kind==='jet'){ rig = buildJetRig(src); }
  else if (kind==='quad'){ rig = buildQuadRig(src); }
  else { rig = buildWalkerRig(src); }
  wrap.add(rig.root); wrap.visible = false; c.body.add(wrap); try { inkPatchTree(wrap); } catch(_){}
  return (c.rigs[kind] = {wrap, rig});
}
function refreshLook(c){
  const hidden = c.player && !!customCar;
  const showStock = c.kind==='truck' && !hidden;
  c.stock.forEach(p => p.visible = showStock); c.wheelPivots.forEach(p => p.visible = showStock);
  for (const k in c.rigs) c.rigs[k].wrap.visible = !hidden && c.kind===k;
}
function setKind(c, kind){
  if (kind!=='truck' && !MODELS[kind]) kind = 'truck';
  if (kind!=='truck') ensureRig(c, kind);
  c.kind = kind; c.prof = VEHICLES[kind];
  refreshLook(c);
}
function applyLook(){ refreshLook(player); }
function disposeObj(o){ o.traverse(m => { if (m.isMesh){ m.geometry && m.geometry.dispose(); const mats = Array.isArray(m.material)?m.material:[m.material]; mats.forEach(mt => { if(!mt) return; for (const k in mt) if (mt[k] && mt[k].isTexture) mt[k].dispose(); mt.dispose(); }); } }); }
function removeCustom(){ if (!customCar) return; player.body.remove(customCar.wrap); disposeObj(customCar.wrap); customCar = null; applyLook(); $('carInfo').hidden = true; renderSpec(); }

function installCustom(obj, name){
  removeCustom();
  obj.traverse(m => { if (m.isMesh){ m.castShadow = true; const mats = Array.isArray(m.material)?m.material:[m.material];
    mats.forEach(mt => { if (!mt) return; if (mt.map) mt.map.encoding = THREE.sRGBEncoding; if (mt.emissiveMap) mt.emissiveMap.encoding = THREE.sRGBEncoding; mt.needsUpdate = true; }); } });
  const wrap = new THREE.Group(), inner = new THREE.Group(); inner.add(obj); wrap.add(inner);
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) throw new Error('empty');
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  obj.position.sub(ctr); obj.position.y += size.y/2;            // centre it, base on the ground
  inner.rotation.y = size.x > size.z ? Math.PI/2 : 0;            // longest horizontal axis becomes forward
  wrap.scale.setScalar(TRUCK_LEN / Math.max(size.x, size.z, .001));
  player.body.add(wrap); customCar = {wrap, inner, name}; applyLook();
  $('carName').textContent = name; $('carInfo').hidden = false; renderSpec();
  showToast('Car loaded', 1000);
}

// The viewer blocks XHR/fetch to blob: URLs, so hand picked files to the loaders straight from a FileReader.
const blobFiles = new Map();
const origFileLoad = THREE.FileLoader.prototype.load;
THREE.FileLoader.prototype.load = function(url, onLoad, onProgress, onError){
  const full = this.manager.resolveURL((this.path || '') + url);
  const file = blobFiles.get(full);
  if (!file) return origFileLoad.call(this, url, onLoad, onProgress, onError);
  const mgr = this.manager; mgr.itemStart(full);
  const r = new FileReader();
  r.onload = () => { try { onLoad && onLoad(r.result); } catch(e){ onError && onError(e); } mgr.itemEnd(full); };
  r.onerror = () => { onError && onError(new Error('could not read ' + file.name)); mgr.itemError(full); mgr.itemEnd(full); };
  if (this.responseType === 'arraybuffer') r.readAsArrayBuffer(file); else r.readAsText(file);
  return r;
};
function status(msg, err){ const s = $('carStatus'); s.textContent = msg || ''; s.classList.toggle('err', !!err); $('carInfo').hidden = false; }
function loadCustom(fileList){
  const files = [...fileList]; if (!files.length){ status('No file was picked.', true); return; }
  const model = files.find(f => /\.(glb|gltf|fbx)$/i.test(f.name));
  if (!model){ status('Picked: ' + files.map(f=>f.name).join(', ') + '. Add a .glb, .gltf or .fbx to the selection.', true); return; }
  const isFbx = /\.fbx$/i.test(model.name);
  if (isFbx && !THREE.FBXLoader){ status('The FBX loader did not load in this viewer. Export the car as .glb instead.', true); return; }
  if (!isFbx && !THREE.GLTFLoader){ status('The glTF loader did not load in this viewer.', true); return; }
  const urls = new Map(files.map(f => [f.name.toLowerCase(), URL.createObjectURL(f)]));
  files.forEach(f => blobFiles.set(urls.get(f.name.toLowerCase()), f));
  const mgr = new THREE.LoadingManager();
  mgr.setURLModifier(u => { const base = decodeURIComponent(String(u).split(/[\\/]/).pop().split('?')[0]).toLowerCase(); return urls.get(base) || u; });
  const url = urls.get(model.name.toLowerCase());
  $('carName').textContent = model.name;
  status('Reading ' + Math.round(model.size/1024/1024*10)/10 + ' MB…');
  const cleanup = () => setTimeout(() => urls.forEach(u => { URL.revokeObjectURL(u); blobFiles.delete(u); }), 4000);
  const fail = e => { console.error(e); status('Could not load it: ' + (e && e.message ? e.message : (e instanceof Event ? 'the viewer refused to read the file' : e)), true); cleanup(); };
  const ok = obj => { try { let n=0; obj.traverse(m => { if (m.isMesh) n++; }); if (!n) throw new Error('the file has no meshes'); installCustom(obj, model.name); status(n + (n===1?' mesh':' meshes') + ' loaded. Use Rotate if it faces the wrong way.'); } catch(e){ fail(e); } cleanup(); };
  try {
    if (isFbx) new THREE.FBXLoader(mgr).load(url, ok, undefined, fail);
    else {
      // GLTFLoader picks ImageBitmapLoader (fetch-based, blocked here) when createImageBitmap exists; hide it while the parser is set up
      const cib = window.createImageBitmap; try { window.createImageBitmap = undefined; } catch(_){}
      const gl = new THREE.GLTFLoader(mgr);
      const restore = () => { try { window.createImageBitmap = cib; } catch(_){} };
      gl.load(url, g => { restore(); ok(g.scene); }, undefined, e => { restore(); fail(e); });
      setTimeout(restore, 15000);
    }
  } catch(e){ fail(e); }
}
$('pickBtn').addEventListener('click', () => { status('Opening the file picker…'); $('carFile').click(); });
$('carFile').addEventListener('change', e => { loadCustom(e.target.files); e.target.value = ''; });
// drag a model (and its textures) anywhere onto the page
const app = $('app'); let dragDepth = 0;
app.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; app.classList.add('drop'); });
app.addEventListener('dragover', e => { e.preventDefault(); });
app.addEventListener('dragleave', () => { if (--dragDepth <= 0){ dragDepth = 0; app.classList.remove('drop'); } });
app.addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; app.classList.remove('drop'); if (e.dataTransfer && e.dataTransfer.files.length) loadCustom(e.dataTransfer.files); });
$('flipBtn').addEventListener('click', () => { if (customCar) customCar.inner.rotation.y += Math.PI/2; });
$('stockBtn').addEventListener('click', removeCustom);
$('stockBtn').textContent = 'Remove';

/* ---------- Bulwark rig: cuts the single tank mesh into moving parts ---------- */
// All numbers are in the model's own units (length 1, ground at y=0, barrel toward +z, +x = left side).
const RIG = {
  deckY: .449,                       // hull deck: everything above is turret
  turretPivot: [0, .449, -.12],
  barrelZ: .14, barrelPivot: [0, .645, .12],
  rod: { y:.705, x:.03, z:-.33, pivot:[0, .705, -.403] },
  wheels: [.173, -.056, -.31].map(z => ({z, y:.151})), wheelHalf:.088, wheelX:.388,
  track: { z0:-.49, z1:.37, y0:.004, y1:.306, r:.09, xc:.326, w:.232, th:.026, link:.04 },
};
const tankSmoke = (() => {
  const N = 220, pos = new Float32Array(N*3), al = new Float32Array(N), sz = new Float32Array(N), vel = new Float32Array(N*3), life = new Float32Array(N), max = new Float32Array(N).fill(1);
  let head = 0;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('alpha', new THREE.BufferAttribute(al,1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('size', new THREE.BufferAttribute(sz,1).setUsage(THREE.DynamicDrawUsage));
  const mat = dust.material.clone(); mat.uniforms = THREE.UniformsUtils.clone(dust.material.uniforms); mat.uniforms.col.value = new THREE.Color(0x3b3633);
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  return {
    mat,
    emit(p, v, size, l){ const i=head; head=(head+1)%N; pos[i*3]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.z; vel[i*3]=v.x; vel[i*3+1]=v.y; vel[i*3+2]=v.z; sz[i]=size; life[i]=max[i]=l; },
    update(dt){
      for (let i=0;i<N;i++){ if (life[i]<=0){ al[i]=0; continue; } life[i]-=dt; const k=i*3;
        pos[k]+=vel[k]*dt; pos[k+1]+=vel[k+1]*dt; pos[k+2]+=vel[k+2]*dt; vel[k]*=.96; vel[k+1]=vel[k+1]*.97+.6*dt; vel[k+2]*=.96;
        sz[i]+=dt*1.8; al[i]=Math.max(0,life[i]/max[i])*.55; }
      g.attributes.position.needsUpdate = g.attributes.alpha.needsUpdate = g.attributes.size.needsUpdate = true;
    }
  };
})();

function buildTankRig(src){
  let geo = src.geometry.index ? src.geometry.toNonIndexed() : src.geometry;
  const mat = src.material;
  const P = geo.attributes.position, Nn = geo.attributes.normal, U = geo.attributes.uv;
  const triCount = P.count/3;
  const buckets = { hull:[], turret:[], barrel:[], rod:[] };
  RIG.wheels.forEach((_,i) => { buckets['wL'+i] = []; buckets['wR'+i] = []; });
  for (let t=0;t<triCount;t++){
    let cx=0, cy=0, cz=0;
    for (let k=0;k<3;k++){ cx+=P.getX(t*3+k); cy+=P.getY(t*3+k); cz+=P.getZ(t*3+k); }
    cx/=3; cy/=3; cz/=3;
    let b = 'hull';
    if (cy > RIG.deckY){
      if (cy > RIG.rod.y && Math.abs(cx) < RIG.rod.x && cz < RIG.rod.z) b = 'rod';
      else if (cz > RIG.barrelZ) b = 'barrel';
      else b = 'turret';
    } else if (Math.abs(cx) > RIG.wheelX){
      RIG.wheels.forEach((w,i) => { if (Math.abs(cz-w.z) < RIG.wheelHalf && Math.abs(cy-w.y) < RIG.wheelHalf) b = (cx>0?'wL':'wR')+i; });
    }
    buckets[b].push(t);
  }
  // orange panels on the hull and turret become lamps: rear-facing ones are tail/brake lights, the rest running lights
  const px = (() => { try { const im = mat.map && mat.map.image; if (!im) return null; const W = 256, cv = document.createElement('canvas'); cv.width = cv.height = W;
    const x = cv.getContext('2d'); x.drawImage(im, 0, 0, W, W); const d = x.getImageData(0,0,W,W).data;
    return (u,v) => { const ix = Math.min(W-1, Math.max(0, (((u%1)+1)%1)*W|0)), iy = Math.min(W-1, Math.max(0, (((v%1)+1)%1)*W|0)), o = (iy*W+ix)*4; return [d[o],d[o+1],d[o+2]]; }; } catch(e){ console.warn(e); return null; } })();
  const isOrange = ([r,g,b]) => r > 165 && g > 60 && g < 200 && b < 95 && r - b > 110 && r > g + 30;
  ['hullTail','hullGlow','turTail','turGlow'].forEach(k => buckets[k] = []);
  const lampsAt = { hullTail:[], turTail:[] };
  if (px && U) for (const from of ['hull','turret']){
    const keep = [];
    for (const t of buckets[from]){
      let u=0, v=0; for (let k=0;k<3;k++){ u+=U.getX(t*3+k); v+=U.getY(t*3+k); }
      if (!isOrange(px(u/3, v/3))){ keep.push(t); continue; }
      const a = new THREE.Vector3().fromBufferAttribute(P,t*3), b2 = new THREE.Vector3().fromBufferAttribute(P,t*3+1), c3 = new THREE.Vector3().fromBufferAttribute(P,t*3+2);
      const n = b2.clone().sub(a).cross(c3.clone().sub(a)).normalize();
      const rear = n.z < -.55, key = (from==='hull' ? 'hull' : 'tur') + (rear ? 'Tail' : 'Glow');
      buckets[key].push(t);
      if (rear) lampsAt[key].push(a.add(b2).add(c3).divideScalar(3));
    }
    buckets[from] = keep;
  }
  const lampMat = (col, base) => { const m = mat.clone(); m.emissive = new THREE.Color(col); m.emissiveMap = mat.map; m.emissiveIntensity = base; return m; };
  const tailMat = lampMat(0xff3a1c, .45), glowMat = lampMat(0xffb070, .7);
  const part = (name, pivot, material) => {
    const ts = buckets[name], n = ts.length*3;
    const p = new Float32Array(n*3), nr = new Float32Array(n*3), uv = new Float32Array(n*2);
    let j = 0;
    for (const t of ts) for (let k=0;k<3;k++){ const v=t*3+k;
      p[j*3]=P.getX(v)-pivot[0]; p[j*3+1]=P.getY(v)-pivot[1]; p[j*3+2]=P.getZ(v)-pivot[2];
      if (Nn){ nr[j*3]=Nn.getX(v); nr[j*3+1]=Nn.getY(v); nr[j*3+2]=Nn.getZ(v); }
      if (U){ uv[j*2]=U.getX(v); uv[j*2+1]=U.getY(v); }
      j++; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p,3));
    if (Nn) g.setAttribute('normal', new THREE.BufferAttribute(nr,3)); else g.computeVertexNormals();
    if (U) g.setAttribute('uv', new THREE.BufferAttribute(uv,2));
    const m = new THREE.Mesh(g, material || mat); m.castShadow = true; m.receiveShadow = true; return m;
  };
  const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const root = new THREE.Group();
  const hull = part('hull',[0,0,0]); root.add(hull);
  root.add(part('hullTail',[0,0,0],tailMat), part('hullGlow',[0,0,0],glowMat));
  const turret = new THREE.Group(); turret.position.fromArray(RIG.turretPivot); root.add(turret);
  turret.add(part('turret', RIG.turretPivot), part('turTail', RIG.turretPivot, tailMat), part('turGlow', RIG.turretPivot, glowMat));
  // soft red halos over each tail-lamp cluster, brightest under braking
  const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,120,70,1)'); g.addColorStop(.35,'rgba(255,60,30,.55)'); g.addColorStop(1,'rgba(255,30,10,0)'); x.fillStyle = g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); })();
  const haloMat = new THREE.SpriteMaterial({map:haloTex, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true, opacity:.2});
  const halos = [];
  const cluster = (pts, parent, offset) => {
    const groups = [];
    for (const p of pts){ let g = groups.find(q => q.c.distanceTo(p) < .09); if (!g){ g = {c:p.clone(), s:new THREE.Vector3(), n:0}; groups.push(g); } g.s.add(p); g.n++; g.c.copy(g.s).divideScalar(g.n); }
    for (const g of groups){ if (g.n < 2) continue; const sp = new THREE.Sprite(haloMat); sp.position.copy(g.c).sub(new THREE.Vector3(...offset)); sp.position.z -= .02; sp.scale.setScalar(.16); parent.add(sp); halos.push(sp); }
  };
  const barrel = new THREE.Group(); barrel.position.fromArray(sub(RIG.barrelPivot, RIG.turretPivot)); turret.add(barrel);
  const barrelMesh = part('barrel', RIG.barrelPivot); barrel.add(barrelMesh);
  cluster(lampsAt.hullTail, root, [0,0,0]); cluster(lampsAt.turTail, turret, RIG.turretPivot);
  // dark sleeve behind the barrel root so tilting or recoiling never shows daylight through the mantlet
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(.18, .17, .1), new THREE.MeshStandardMaterial({color:new THREE.Color(0x151312).convertSRGBToLinear(), roughness:1}));
  sleeve.position.set(0, RIG.barrelPivot[1]-RIG.turretPivot[1], .1-RIG.turretPivot[2]); turret.add(sleeve);
  const rod = new THREE.Group(); rod.position.fromArray(sub(RIG.rod.pivot, RIG.turretPivot)); turret.add(rod);
  rod.add(part('rod', RIG.rod.pivot));

  // wheels, each with a dark well behind it so the corners never show a hole while spinning
  const lin = h => new THREE.Color(h).convertSRGBToLinear();
  const wellMat = new THREE.MeshStandardMaterial({color:lin(0x151312), roughness:1});
  const wheels = [];
  for (const s of ['L','R']) RIG.wheels.forEach((w,i) => {
    const side = s==='L' ? 1 : -1;
    const piv = [0, w.y, w.z];
    const grp = new THREE.Group(); grp.position.fromArray(piv); root.add(grp);
    grp.add(part('w'+s+i, piv)); grp.userData.side = side; wheels.push(grp);
    const well = new THREE.Mesh(new THREE.BoxGeometry(.006, .2, .2), wellMat); well.position.set(side*(RIG.wheelX-.003), w.y, w.z); root.add(well);
  });

  // track links running round both tracks
  const tr = RIG.track, straightZ = (tr.z1-tr.z0) - 2*tr.r, straightY = (tr.y1-tr.y0) - 2*tr.r, arc = Math.PI/2*tr.r;
  const perim = 2*straightZ + 2*straightY + 4*arc;
  const nLinks = Math.round(perim / (tr.link*1.5)), gap = perim / nLinks;
  const linkGeo = new THREE.BoxGeometry(tr.w, tr.th, tr.link);
  const linkMat = new THREE.MeshStandardMaterial({color:lin(0x3d3834), roughness:.6, metalness:.25});
  const tracks = [1,-1].map(side => { const im = new THREE.InstancedMesh(linkGeo, linkMat, nLinks); im.castShadow = true; im.userData = {side, s:0}; im.frustumCulled = false; root.add(im); return im; });
  // walk the rounded rectangle: top run rear→front, down the front, bottom run front→rear, up the back
  const segs = [];
  const cz0 = tr.z0+tr.r, cz1 = tr.z1-tr.r, cy0 = tr.y0+tr.r, cy1 = tr.y1-tr.r;
  segs.push({len:straightZ, at:u => [cz0+u, tr.y1, 0]});
  segs.push({len:arc, at:u => { const a=u/tr.r; return [cz1+Math.sin(a)*tr.r, cy1+Math.cos(a)*tr.r, -a]; }});
  segs.push({len:straightY, at:u => [tr.z1, cy1-u, -Math.PI/2]});
  segs.push({len:arc, at:u => { const a=u/tr.r; return [cz1+Math.cos(a)*tr.r, cy0-Math.sin(a)*tr.r, -Math.PI/2-a]; }});
  segs.push({len:straightZ, at:u => [cz1-u, tr.y0, -Math.PI]});
  segs.push({len:arc, at:u => { const a=u/tr.r; return [cz0-Math.sin(a)*tr.r, cy0-Math.cos(a)*tr.r, -Math.PI-a]; }});
  segs.push({len:straightY, at:u => [tr.z0, cy0+u, -Math.PI*1.5]});
  segs.push({len:arc, at:u => { const a=u/tr.r; return [cz0-Math.cos(a)*tr.r, cy1+Math.sin(a)*tr.r, -Math.PI*1.5-a]; }});
  const loopAt = s => { s = ((s%perim)+perim)%perim; for (const sg of segs){ if (s <= sg.len) return sg.at(s); s -= sg.len; } return segs[0].at(0); };
  const o = new THREE.Object3D();
  function placeLinks(im){
    const side = im.userData.side;
    for (let i=0;i<nLinks;i++){ const [z,y,a] = loopAt(i*gap + im.userData.s);
      o.position.set(side*tr.xc, y, z); o.rotation.set(a,0,0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }
    im.instanceMatrix.needsUpdate = true;
  }
  tracks.forEach(placeLinks);

  // motion state
  const st = { brake:0, turretYaw:0, barrelPitch:0, barrelV:0, kick:0, ant:{x:0,z:0,vx:0,vz:0}, wheelA:{L:0,R:0}, prevH:null, prevF:0, smokeT:0, prevThr:false };
  const tmp = new THREE.Vector3(), tmpV = new THREE.Vector3();
  const SCALE = 5.3, HALF = tr.xc*SCALE, WHEEL_R = .09*SCALE;

  function update(c, dt, mode){
    if (dt <= 0) return;
    const t = performance.now()/1000;
    // yaw rate from heading change
    let yaw = 0; if (st.prevH !== null) yaw = wrapA(c.h - st.prevH)/dt; st.prevH = c.h;
    if (Math.abs(yaw) > 6) yaw = 0;                          // teleports (restart, back-on-track) are not turns
    const f = c.f || 0; let accel = (f - st.prevF)/dt; st.prevF = f;
    if (Math.abs(accel) > 150) accel = 0;
    const vL = mode==='idle' ? 0 : f - yaw*HALF, vR = mode==='idle' ? 0 : f + yaw*HALF;

    // tracks and wheels (model units)
    tracks[0].userData.s += vL*dt/SCALE; tracks[1].userData.s += vR*dt/SCALE;
    tracks.forEach(placeLinks);
    st.wheelA.L += vL*dt/WHEEL_R; st.wheelA.R += vR*dt/WHEEL_R;
    for (const w of wheels) w.rotation.x = w.userData.side>0 ? st.wheelA.L : st.wheelA.R;

    // turret: lock on to the nearest rival ahead, otherwise lean into turns; idle sweep on the menu
    let target;
    if (mode==='idle') target = Math.sin(t*.45)*.7;
    else {
      target = -c.steerV*.3; let best = 75;
      for (const o2 of cars){ if (o2===c) continue; const dx=o2.x-c.x, dz=o2.z-c.z, d=Math.hypot(dx,dz); if (d<4 || d>best) continue;
        const b = wrapA(Math.atan2(dx,dz) - c.h); if (Math.abs(b) < 1.25){ best = d; target = b; } }
    }
    const dy = wrapA(target - st.turretYaw), slew = 1.6*dt;
    st.turretYaw += clamp(dy, -slew, slew); turret.rotation.y = st.turretYaw;

    // barrel: stabiliser spring that lags under acceleration, plus recoil kick on boost pads
    if (c.boostHit || c.fireKick){ c.boostHit = false; c.fireKick = false; st.kick = 1; st.barrelV -= 2.5;
      barrelMesh.getWorldPosition(tmp); const muzzle = barrel.localToWorld(tmpV.set(0, 0, .5-RIG.barrelPivot[2]));
      const fx=Math.sin(c.h+st.turretYaw), fz=Math.cos(c.h+st.turretYaw);
      for (let i=0;i<14;i++) tankSmoke.emit(muzzle, {x:fx*(6+Math.random()*6)+(Math.random()-.5)*3+c.vx*.6, y:.8+Math.random()*2, z:fz*(6+Math.random()*6)+(Math.random()-.5)*3+c.vz*.6}, 1.6+Math.random()*1.6, .8+Math.random()*.7);
    }
    const pitchTarget = clamp(-accel*.0025, -.07, .06);
    st.barrelV += ((pitchTarget - st.barrelPitch)*70 - st.barrelV*9)*dt; st.barrelPitch += st.barrelV*dt;
    barrel.rotation.x = clamp(st.barrelPitch, -.07, .06);
    st.kick = Math.max(0, st.kick - dt*3.2); barrelMesh.position.z = -Math.sin(Math.min(st.kick,1)*Math.PI/2)*.07;

    // antenna whip: 2-axis spring pushed by acceleration, cornering and rough ground
    const a = st.ant, k = 55, d = 4.5;
    let Fx = -accel*.012 + (c.off && mode!=='idle' ? (Math.random()-.5)*Math.abs(f)*.25 : 0);
    let Fz = yaw*Math.abs(f)*.012 + (c.off && mode!=='idle' ? (Math.random()-.5)*Math.abs(f)*.25 : 0) - dy*2;
    a.vx += (-k*a.x - d*a.vx + Fx)*dt; a.vz += (-k*a.z - d*a.vz + Fz)*dt;
    a.x = clamp(a.x + a.vx*dt, -.45, .45); a.z = clamp(a.z + a.vz*dt, -.45, .45);
    rod.rotation.set(a.x, 0, a.z);

    // brake lights: brighten on the brake key or hard deceleration, dim running glow otherwise
    const braking = mode!=='idle' && ((c.player && (keys['arrowdown']||keys['s']||keys[' ']||touchState.brake)) || accel < -18);
    st.brake += ((braking ? 1 : 0) - st.brake)*Math.min(1, dt*(braking ? 14 : 5));
    tailMat.emissiveIntensity = .45 + st.brake*2.4;
    haloMat.opacity = .18 + st.brake*.8;
    for (const h of halos) h.scale.setScalar(.14 + st.brake*.12);
    // diesel exhaust: a black puff when the throttle opens, a light trail while pulling
    const thr = mode!=='idle' && !c.finished && (c.player ? (keys['arrowup']||keys['w']||touchState.gas) : accel > 3);
    st.smokeT -= dt;
    const puff = (n, size) => { for (let i=0;i<n;i++){ const sx = (i%2?1:-1)*.13;
      const p = root.localToWorld(tmp.set(sx, .44, -.48)); tankSmoke.emit(p, {x:-Math.sin(c.h)*2+(Math.random()-.5)*1.2+c.vx*.3, y:2+Math.random()*1.5, z:-Math.cos(c.h)*2+(Math.random()-.5)*1.2+c.vz*.3}, size, 1+Math.random()*.8); } };
    if (thr && !st.prevThr) puff(10, 1.4);
    else if (thr && st.smokeT <= 0 && Math.abs(f) < 45){ puff(2, .9); st.smokeT = .09; }
    else if (mode==='idle' && st.smokeT <= 0){ puff(1, .6); st.smokeT = .35; }
    st.prevThr = thr;
  }
  return { root, update, reset(){ st.prevH = null; st.prevF = 0; } };
}

/* ---------- vehicle picker, rival mix and bundled models ---------- */
const KIND_WORD = {truck:['truck','trucks'], tank:['tank','tanks'], walker:['walker','walkers'], jet:['jet','jets'], quad:['quad walker','quad walkers'], rally:['buggy','buggies'], hover:['hover-walker','hover-walkers'], drone:['interceptor','interceptors']};
function lineupText(){
  const n = {}; cars.forEach(c => { if (!c.player) n[c.kind] = (n[c.kind]||0)+1; });
  return ['truck','tank','walker','jet','quad','rally','hover','drone'].filter(k => n[k]).map(k => n[k]+' '+KIND_WORD[k][n[k]>1?1:0]).join(' · ');
}
const WTHUMB = {"hive": "data:image/jpeg;base64,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", "desert": "data:image/jpeg;base64,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", "forge": "data:image/jpeg;base64,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", "tundra": "data:image/jpeg;base64,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", "cirrus": "data:image/jpeg;base64,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", "quarry": "data:image/jpeg;base64,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", "conduit": "data:image/jpeg;base64,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"};
/* ---------- start flow: step 1 vehicle garage, step 2 world & mode ---------- */
const VORDER = ['truck','tank','walker','jet','quad','rally','hover','drone'];
const VID = {truck:'vTruck', tank:'vTank', walker:'vWalker', jet:'vJet', quad:'vQuad', rally:'vRally', hover:'vHover', drone:'vDrone'};
const VINFO = {
  truck:  { kicker:'Rally truck · Earth',        tag:'V8 rally-raid wedge · 4WD · 1.6 t',     ability:'Nitro',       abilityText:'A hard 2.6 s burst of speed with blue tail flames.', s:[80,76,53,50,33] },
  tank:   { kicker:'Tracked tank · Ignis Prime', tag:'Twin diesel · tracks · 14 t',            ability:'Shockshell',  abilityText:'A homing shell that spins out the rival ahead.',     s:[72,59,85,90,100] },
  walker: { kicker:'Two-legged walker · Velka IV', tag:'Hydraulic legs · turbine · 9 t',       ability:'Leap',        abilityText:'Jumps clear over obstacles, hazards and rivals.',    s:[80,70,64,80,67] },
  jet:    { kicker:'Jet runner · Aeolis',        tag:'Twin turbojet · guide wheels · 3.2 t',   ability:'Afterburner', abilityText:'A 3 s blue-flame surge; grip drops while it burns.', s:[86,87,37,60,43] },
  quad:   { kicker:'Quad walker · Haulk-3',      tag:'Four servo legs · fuel cells · 6 t',     ability:'Ram Shield',  abilityText:'4 s bubble: ignores hazards and shoves rivals aside.', s:[77,72,71,85,73] },
  rally:  { kicker:'Night-rally buggy · Vesper ring', tag:'Flat-six · long-travel suspension · 1.4 t', ability:'Groundhook', abilityText:'3.5 s hooked into the ground: corners flat out with no slide, full speed over sand, wind and ice can\'t move it, meteors can\'t stun it.', s:[83,82,88,62,40] },
  hover:  { kicker:'Hover-walker · Aeolis', tag:'Twin lift turbines · servo legs · 4.8 t', ability:'Updraft', abilityText:'2.6 s on full turbines: it lifts off and flies a short hop over hazards, rivals, sand and gaps.', s:[78,75,70,80,52] },
  drone:  { kicker:'Hover interceptor · Unity Prime', tag:'Gravity pods · fusion core · 2.1 t', ability:'Tractor Beam', abilityText:'2.6 s green beam locks on to the rival ahead: they drag, you get hauled past.', s:[86,84,62,74,44] },
};
const STAT_LABELS = ['Top speed','Acceleration','Handling','Off-road','Toughness'];
const CIV = { desert:'the rally crews', forge:'the stonewrights', tundra:'the Velkans', cirrus:'the Aeoli', quarry:'the cargo guilds', conduit:'the ring runners', hive:'the Collective' };
const LV_NOTE = { easy:'Relaxed rivals who miss hazards and slip up.', normal:'Balanced rivals who dodge most hazards.', hard:'Rivals race the line, brake late and overtake.' };
// body paint resprays the bodywork; Factory keeps the original paint (upgrades and add-ons will slot in beside them)
const SKINS = DR87.data["skins"];
let skinPick = {}; try { skinPick = JSON.parse(localStorage.getItem('dustrunner-skins') || '{}') || {}; } catch(_){}

/* ---------- medals per world and what they unlock ---------- */
const MEDAL_NAMES = DR87.data["medal-names"];
let medals = {}; try { medals = JSON.parse(localStorage.getItem('dustrunner-medals') || '{}') || {}; } catch(_){}
const medalOf = id => (medals[id] && medals[id].m) || 0;
const medalPts = () => WORLD_ORDER.reduce((a, id) => a + medalOf(id), 0);          // bronze 1 … platinum 4, max 20
// what a finish earns: Platinum for a win on Hard, Gold for a win, Silver for a podium (or an Easy win), Bronze for finishing
function medalFor(place, lv){ if (place === 1) return lv === 'hard' ? 4 : lv === 'easy' ? 2 : 3; if (place <= 3) return lv === 'easy' ? 1 : 2; return 1; }
const UNLOCKS = DR87.data["unlocks"];
const unlockOf = id => UNLOCKS.find(u => u.id === id);
const unlocked = id => { const u = unlockOf(id); return !u || medalPts() >= u.pts; };
const skinOf = v => { const sk = SKINS.find(s => s.id === skinPick[v]); return sk && unlocked(sk.id) ? sk : SKINS[0]; };
function awardMedal(place){
  const m = medalFor(place, level), cur = medals[world.id] || { m:0 }, best = Math.min(...player.lapTimes), before = medalPts();
  const up = m > cur.m; medals[world.id] = { m: Math.max(cur.m, m), lap: Math.min(cur.lap || Infinity, best), lv: up ? level : cur.lv };
  try { localStorage.setItem('dustrunner-medals', JSON.stringify(medals)); } catch(_){}
  const pts = medalPts(); return { m, up, pts, fresh: UNLOCKS.filter(u => before < u.pts && pts >= u.pts) };
}
// the one thing to go for next, for the world screen and the results card
function nextGoal(){
  const m = medalOf(world.id), pts = medalPts();
  if (m < 3) return m < 2 ? { t:'Finish on the podium here for <b>Silver</b>', why:'medal' } : { t:'Win ' + world.name + ' on Normal for <b>Gold</b>', why:'medal' };
  if (m < 4) return { t:'Win ' + world.name + ' on <b>Hard</b> for Platinum', why:'medal' };
  const u = UNLOCKS.find(u => pts < u.pts); if (u) return { t:'<b>' + u.name + '</b> unlocks at ' + u.pts + ' medal points · you have <span class="pts">' + pts + '</span>', why:'unlock' };
  const open = WORLD_ORDER.find(id => medalOf(id) < 3); if (open) return { t:'Next: <b>' + WORLDS[open].name + '</b> · ' + (medalOf(open) ? 'win it for Gold' : 'race it for a medal'), why:'world' };
  const lap = medals[world.id] && medals[world.id].lap; return { t: lap ? 'Beat your best lap here: <b>' + fmt(lap) + '</b>' : 'Set a lap record here', why:'lap' };
}
function medalBadge(m, cls){ return m ? '<span class="mdl m' + m + ' ' + (cls||'') + '" title="' + MEDAL_NAMES[m] + '">' + ['','B','S','G','P'][m] + '</span>' : ''; }
function renderUnlocks(){
  const pts = medalPts();
  document.querySelectorAll('#skinGrid .skin').forEach(b => { const u = unlockOf(b.dataset.s), lock = u && pts < u.pts; b.classList.toggle('locked', !!lock); b.setAttribute('aria-disabled', String(!!lock));
    const sm = b.querySelector('small'); if (lock){ if (!sm) b.insertAdjacentHTML('beforeend', '<small>' + u.pts + ' pts</small>'); else sm.textContent = u.pts + ' pts'; } else if (sm) sm.remove(); });
  const hardBtn = document.querySelector('#lpick .lopt[data-l="hard"]'), hardLock = !unlocked('hard'); if (hardBtn){ hardBtn.classList.toggle('locked', hardLock); hardBtn.title = hardLock ? 'Unlocks at 3 medal points' : ''; }
  document.querySelectorAll('.wcard').forEach(b => { const old = b.querySelector('.mdl'); if (old) old.remove(); b.insertAdjacentHTML('beforeend', medalBadge(medalOf(b.dataset.w))); });
  const g = nextGoal(); $('goalLine').innerHTML = (pts ? '<span class="pts">' + pts + '</span> medal points · ' : '') + 'Next goal: ' + g.t;
}
let menuStep = 1;
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);

// Body paint: a real respray, not a tint. Each model's texture is read in the shader; the body panels (picked by
// tone and hue per vehicle) are replaced by the paint, shaded from the original texture so panel lines and grime
// survive, and given a metallic finish. Lights, mechanical parts and accents keep their own colours.
const PAINT_KEY = {
  // only the coloured livery is resprayed; grey/black structure, joints, glass and lamps keep their own look
  tank:   { hue:{ h:.11,  w:.07,  minS:.2, minV:.14, maxV:.82, ref:.36 } },   // olive armour plates (the tank's livery), not the lamps
  walker: { hue:{ h:.085, w:.045, minS:.3, minV:.3,  maxV:1.1, ref:.8 } },    // orange shell panels
  jet:    { hue:{ h:.115, w:.045, minS:.3, minV:.3,  maxV:1.1, ref:.82 } },   // yellow stripes and wing panels
  quad:   { hue:{ h:.09,  w:.045, minS:.3, minV:.3,  maxV:1.1, ref:.82 } },   // yellow cargo box and leg covers
  hover:  { hue:{ h:.1,   w:.05,  minS:.25, minV:.22, maxV:1.1, ref:.6 } },   // brass hull plates, not the blue turbine panels
  drone:  { grey:{ minV:.38, ref:.62 } },                                    // the pale hull plating, not the dark vents or the orange lights
};
function paintUniforms(m, kind){
  if (m.userData.paint) return m.userData.paint;
  const k = PAINT_KEY[kind], g = k.grey, h = k.hue;
  const u = { uPaint:{value:new THREE.Color(1,1,1)}, uAmt:{value:0}, uMetal:{value:.72}, uRough:{value:.26},
    uG:{value: g ? 1 : 0}, uGMinV:{value: g ? g.minV : 0}, uGRef:{value: g ? g.ref : 1},
    uH:{value: h ? 1 : 0}, uHue:{value: h ? h.h : 0}, uHw:{value: h ? h.w : .1}, uHMinS:{value: h ? h.minS : .2}, uHMinV:{value: h ? h.minV : 0}, uHMaxV:{value: h ? h.maxV : 2}, uHRef:{value: h ? h.ref : 1} };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform vec3 uPaint;\nuniform float uAmt, uMetal, uRough, uG, uGMinV, uGRef, uH, uHue, uHw, uHMinS, uHMinV, uHMaxV, uHRef;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
  float paintMask = 0.0;
#ifdef USE_MAP
  {
    vec3 sc = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0/2.2));
    float mx = max(sc.r, max(sc.g, sc.b)), mn = min(sc.r, min(sc.g, sc.b)), dd = mx - mn;
    float v = mx, s = mx > 0.0001 ? dd/mx : 0.0, h = 0.0;
    if (dd > 0.0001){ if (mx == sc.r) h = mod((sc.g - sc.b)/dd, 6.0); else if (mx == sc.g) h = (sc.b - sc.r)/dd + 2.0; else h = (sc.r - sc.g)/dd + 4.0; h /= 6.0; }
    float grey = uG * (1.0 - smoothstep(0.14, 0.28, s)) * smoothstep(uGMinV, uGMinV + 0.12, v);
    float hd = abs(h - uHue); hd = min(hd, 1.0 - hd);
    float hue = uH * (1.0 - smoothstep(uHw, uHw + 0.05, hd)) * smoothstep(uHMinS - 0.08, uHMinS, s) * smoothstep(uHMinV, uHMinV + 0.1, v) * (1.0 - smoothstep(uHMaxV - 0.08, uHMaxV, v));
    float ref = hue > grey ? uHRef : uGRef;
    paintMask = max(grey, hue) * uAmt;
    diffuseColor.rgb = mix(diffuseColor.rgb, uPaint * clamp(v / ref, 0.3, 1.35), paintMask);
  }
#endif`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, uRough, paintMask);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix(metalnessFactor, uMetal, paintMask);');
    if (m.userData.patchShader) m.userData.patchShader(sh);
  };
  m.customProgramCacheKey = () => 'paint-' + kind + (m.userData.patchKey || '');
  m.needsUpdate = true;
  return (m.userData.paint = u);
}
// metallic paint needs something to reflect: borrow the desert sky probe while painted
function paintEnv(m, on, strength){
  if (m.userData.env0 === undefined) m.userData.env0 = { map: m.envMap || null, k: m.envMapIntensity };
  const want = on ? (m.userData.env0.map || desertEnv()) : m.userData.env0.map;
  if (m.envMap !== want){ m.envMap = want; m.needsUpdate = true; }
  m.envMapIntensity = on ? Math.max(m.userData.env0.k || 0, strength) : m.userData.env0.k;
}
function applySkin(){
  const sk = skinOf(player.kind);
  if (player.kind === 'truck'){
    const m = player.stock[0] && player.stock[0].material;       // the wedge body paint (roof cap shares it)
    if (!m) return;
    if (m.userData.base === undefined) m.userData.base = { c: m.color.getHex(), mt: m.metalness, r: m.roughness };
    const b = m.userData.base;
    if (sk.c == null){ m.color.setHex(b.c); m.metalness = b.mt; m.roughness = b.r; paintEnv(m, false); }
    else { m.color.setHex(sk.c); m.metalness = .7; m.roughness = .26; paintEnv(m, true, 1); }
    return;
  }
  const r = player.rigs[player.kind]; if (!r) return;
  if (player.kind === 'rally'){ for (const m of r.rig.paint){ if (m.userData.base === undefined) m.userData.base = { c:m.color.getHex(), mt:m.metalness, r:m.roughness }; const b = m.userData.base;
      if (sk.c == null){ m.color.setHex(b.c); m.metalness = b.mt; m.roughness = b.r; } else { m.color.setHex(sk.c).convertSRGBToLinear(); m.metalness = .55; m.roughness = .3; } } return; }
  const seen = new Set();
  r.wrap.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
    if (!m || seen.has(m) || !m.map || !m.isMeshStandardMaterial || m.transparent) return; seen.add(m);
    const u = paintUniforms(m, player.kind);
    u.uAmt.value = sk.c == null ? 0 : 1;
    if (sk.c != null) u.uPaint.value.setHex(sk.c).convertSRGBToLinear();
    paintEnv(m, sk.c != null, .9);
  }); });
}
function renderSpec(){
  if (level === 'hard' && !unlocked('hard')) level = 'normal';
  const v = VEHICLES[vehicle], vi = VINFO[vehicle], sk = skinOf(vehicle);
  $('vKick').textContent = vi.kicker; $('vName').textContent = v.name;
  const tg = $('vTag'); tg.textContent = customCar ? 'Wearing your model: ' + customCar.name : vi.tag; tg.classList.toggle('mine', !!customCar);
  $('vStats').innerHTML = vi.s.map((n,k) => '<div class="st"><span>'+STAT_LABELS[k]+'</span><span class="bar"><i style="width:'+n+'%"></i></span><b>'+n+'</b></div>').join('');
  $('vAbil').textContent = vi.ability; $('vAbilText').textContent = vi.abilityText;
  $('vHome').textContent = WORLDS[v.home].name;
  $('vSel').innerHTML = 'Selected: <b>'+v.name+'</b> · '+sk.name+' paint';
  VORDER.forEach(k => { const el = $(VID[k]); el.setAttribute('aria-selected', String(k===vehicle)); el.tabIndex = k===vehicle ? 0 : -1; });
  document.querySelectorAll('#skinGrid .skin').forEach(b => b.setAttribute('aria-checked', String(b.dataset.s === sk.id)));
  // step 2
  const home = v.home === world.id;
  $('wKick').textContent = world.planet + (world.home ? ' · built by ' + CIV[world.id] : ' · ' + CIV[world.id]);
  $('wName').textContent = world.name; $('wBlurb').textContent = world.blurb;
  const cutDef = CUTS[world.id];
  $('wChips').innerHTML = world.hazardText.split(' · ').map(h => '<span class="chip haz">'+cap1(h)+'</span>').join('')
    + (world.sig ? '<span class="chip sig">' + world.sig + '</span>' : '')
    + (cutDef ? '<span class="chip cut' + (cutDef.kinds.includes(vehicle) ? ' ok' : '') + '">' + cap1(cutDef.name.toLowerCase()) + ' · ' + (cutDef.kinds.includes(vehicle) ? 'open to you' : cutDef.who) + '</span>' : '')
    + (home ? '<span class="chip home">Home turf · hazards bite less</span>' : '');
  $('youName').textContent = customCar ? 'Your model' : v.name;
  $('youMeta').textContent = (customCar ? v.name + ' handling' : sk.name + ' paint') + ' · ' + vi.ability;
  document.querySelectorAll('.wcard').forEach(b => b.setAttribute('aria-checked', String(b.dataset.w === world.id)));
  document.querySelectorAll('#lpick .lopt').forEach(b => b.setAttribute('aria-checked', String(b.dataset.l === level)));
  $('lvNote').textContent = LV_NOTE[level];
  $('rivalLine').textContent = (cars.length-1) + ' rivals: ' + lineupText();
  renderUnlocks();
}
(function buildSkins(){
  $('skinGrid').innerHTML = SKINS.map(s => '<button class="skin" role="radio" aria-checked="false" data-s="'+s.id+'" aria-label="'+s.name+' paint"><i style="background:'+s.chip+'"></i>'+s.name+'</button>').join('');
  $('skinGrid').addEventListener('click', e => { const b = e.target.closest('.skin'); if (!b) return;
    if (!unlocked(b.dataset.s)){ const u = unlockOf(b.dataset.s); showToast(u.name + ' unlocks at ' + u.pts + ' medal points · you have ' + medalPts(), 1600); return; }
    skinPick[vehicle] = b.dataset.s; try { localStorage.setItem('dustrunner-skins', JSON.stringify(skinPick)); } catch(_){}
    applySkin(); renderSpec(); });
})();
$('shufBtn').addEventListener('click', () => rollRivals());
// world cards: a snapshot of each planet, and the vehicle that calls it home
(function buildWorldPicker(){
  const homeOf = id => Object.values(VEHICLES).find(v => v.home === id);
  $('wpick').innerHTML = WORLD_ORDER.map(id => { const w = WORLDS[id], h = homeOf(id);
    return '<button class="wcard" role="radio" aria-checked="false" data-w="'+id+'" aria-label="'+w.name+', '+w.planet+'"><img src="'+WTHUMB[id]+'" alt=""><b>'+w.name+'</b><span>'+(h ? h.name.split(' ')[0]+' home' : w.planet)+'</span></button>'; }).join('');
  $('wpick').addEventListener('click', e => { const b = e.target.closest('.wcard'); if (b) selectWorld(b.dataset.w); });
})();
$('lpick').addEventListener('click', e => { const b = e.target.closest('.lopt'); if (!b || !LEVELS[b.dataset.l]) return;
  if (b.dataset.l === 'hard' && !unlocked('hard')){ showToast('Hard rivals unlock at 3 medal points · you have ' + medalPts(), 1600); return; }
  level = b.dataset.l; try { localStorage.setItem('dustrunner-level', level); } catch(_){} renderSpec(); });
function selectWorld(id){
  if ((state!=='menu' && state!=='done') || !WORLDS[id] || id === world.id) return;
  buildWorld(id);
  try { localStorage.setItem('dustrunner-world', id); } catch(_){}
  placeOnGrid(); camH = player.h; snapCam();
  renderSpec();
}
function selectVehicle(v){
  if (state!=='menu' && state!=='done') return;
  if (v!=='truck' && !MODELS[v]) return;
  vehicle = v; setKind(player, v); applySkin();
  try { $(VID[v]).scrollIntoView({block:'nearest', inline:'nearest'}); } catch(_){}   // one scrolling row of pills on narrow screens: keep the chosen one in view
  try { localStorage.setItem('dustrunner-vehicle', v); } catch(_){}
  renderSpec();
}
// carousel: the outgoing vehicle slides off one side and the next slides in from the other (the camera pans, the car stays put)
let slide = null;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function availableKinds(){ return VORDER.filter(k => k==='truck' || MODELS[k]); }
function goVehicle(v, dir){
  if (state!=='menu' || (v!=='truck' && !MODELS[v])) return;
  if (slide){ if (!slide.swapped){ slide.to = v; slide.dir = dir; } else { selectVehicle(v); } return; }
  if (v === vehicle) return;
  if (reduceMotion || menuStep !== 1) { selectVehicle(v); return; }
  slide = { to:v, dir, t:0, swapped:false };
}
function stepVehicle(d){ const av = availableKinds(); const i = av.indexOf(slide && !slide.swapped ? slide.to : vehicle); goVehicle(av[(i + d + av.length) % av.length], d); }
VORDER.forEach(k => $(VID[k]).addEventListener('click', () => { const av = availableKinds(); goVehicle(k, av.indexOf(k) >= av.indexOf(vehicle) ? 1 : -1); }));
$('vPrev').addEventListener('click', () => stepVehicle(-1));
$('vNext').addEventListener('click', () => stepVehicle(1));
// swipe the stage to change vehicle
(function swipe(){
  const st = $('vStage'); let x0 = null, y0 = 0, id = null;
  st.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; x0 = e.clientX; y0 = e.clientY; id = e.pointerId; });
  st.addEventListener('pointerup', e => { if (x0 === null || e.pointerId !== id) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)*1.3) stepVehicle(dx < 0 ? 1 : -1); });
  st.addEventListener('pointercancel', () => { x0 = null; });
})();
function menuSlideOffset(dt){
  if (!slide) return 0;
  const T1 = .2, T2 = .3, ease = u => u*u*(3-2*u);
  slide.t += dt;
  if (slide.t < T1) return slide.dir * ease(slide.t/T1);
  if (!slide.swapped){ slide.swapped = true; selectVehicle(slide.to); }
  const u = Math.min(1, (slide.t - T1)/T2), off = -slide.dir * (1 - (1 - Math.pow(1-u, 3)));
  if (u >= 1) slide = null;
  return off;
}
// steps
function showStep(n){
  menuStep = n;
  $('stepV').hidden = n !== 1; $('stepW').hidden = n !== 2;
  $('stepBtn1').toggleAttribute('aria-current', n === 1); if (n === 1) $('stepBtn1').setAttribute('aria-current','step');
  $('stepBtn2').toggleAttribute('aria-current', n === 2); if (n === 2) $('stepBtn2').setAttribute('aria-current','step');
  $('stepBtn1').classList.toggle('done', n === 2); $('stepLine').classList.toggle('on', n === 2);
  $('stepBtn1').querySelector('i').textContent = n === 2 ? '✓' : '1';
  $('menu').scrollTop = 0; closeSettings();
  if (n === 2 && slide){ if (!slide.swapped) selectVehicle(slide.to); slide = null; }
}
$('stepBtn1').addEventListener('click', () => showStep(1));
$('stepBtn2').addEventListener('click', () => showStep(2));
$('toWorld').addEventListener('click', () => { showStep(2); const c = document.querySelector('.wcard[aria-checked="true"]'); c && c.focus({preventScroll:true}); });
$('backV').addEventListener('click', () => { showStep(1); $(VID[vehicle]).focus({preventScroll:true}); });
// settings sheet: graphics, sound, your own model, controls
function closeSettings(){ $('setSheet').hidden = true; $('setBtn').setAttribute('aria-expanded','false'); }
$('setBtn').addEventListener('click', e => { e.stopPropagation(); const open = $('setSheet').hidden; $('setSheet').hidden = !open; $('setBtn').setAttribute('aria-expanded', String(open)); });
$('menu').addEventListener('pointerdown', e => { if (!$('setSheet').hidden && !e.target.closest('#setSheet,#setBtn')) closeSettings(); });
$('sndBtn').addEventListener('click', () => toggleMute());
$('musBtn').addEventListener('click', () => setMusic(!musicOn)); setMusic(musicOn);
// volume sliders: Sound scales every effect (engines, hits, UI), Music scales whichever track is playing; dragging a level up from 0 also switches that channel back on
{ const bind = (id, get, set, onUp) => { const r = $(id), out = $(id + 'V'), show = () => { const v = Math.round(get()*100); r.value = v; out.textContent = v + '%'; r.style.setProperty('--p', v + '%'); };
    show(); r.addEventListener('input', () => { set(r.value/100); show(); if (r.value > 0) onUp(); }); };
  bind('sfxVol', () => sfxVol, setSfxVol, () => { if (muted) toggleMute(); });
  bind('musVol', () => musVol, setMusVol, () => { if (!musicOn) setMusic(true); }); }
$('surBtn').addEventListener('click', () => setSurprise(!surpriseOn));
$('lookBtn').addEventListener('click', () => setLook(!lookOn)); setLook(lookOn);
addEventListener('keydown', e => {
  if (state!=='menu' || $('menu').hidden || e.repeat) return;
  if (e.key === 'Escape'){ closeSettings(); return; }
  if (!$('setSheet').hidden) return;
  const inGroup = e.target && e.target.closest && e.target.closest('#skinGrid,#wpick,#lpick,#mpick,input');
  if (menuStep === 1 && !inGroup && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')){
    stepVehicle(e.key === 'ArrowRight' ? 1 : -1);
    if (e.target && e.target.classList && e.target.classList.contains('vpill')) setTimeout(() => $(VID[slide ? slide.to : vehicle]).focus({preventScroll:true}), 0);
  }
  if (e.key === 'Enter' && (e.target === document.body || e.target === $('menu'))){ if (menuStep === 1) showStep(2); else $('startBtn').click(); }
});
// keep the car centred in the stage: shift the camera's view window instead of moving the car
function menuViewOffset(){
  const st = $(menuStep === 1 ? 'vStage' : 'wStage'), W = canvas.clientWidth, H = canvas.clientHeight;
  const r = st.getBoundingClientRect();
  if (!r.width || !W){ if (camera.view && camera.view.enabled) camera.clearViewOffset(); return; }
  let cx = r.left + r.width/2, cy = r.top + r.height*(menuStep === 1 ? .55 : (r.width < r.height*1.4 ? .24 : .42));
  const ox = Math.max(-W*.35, Math.min(W*.35, W/2 - cx)), oy = Math.max(-H*.3, Math.min(H*.3, H/2 - cy));
  camera.setViewOffset(W, H, ox, oy, W, H);
}
// Rivals: every available vehicle type appears at least once, the rest drawn at random, grid order shuffled
function rollRivals(){
  const kinds = ['truck', ...['tank','walker','jet','quad','rally','hover','drone'].filter(k => MODELS[k])];
  const rivals = cars.filter(c => !c.player);
  const shuffle = a => { for (let i=a.length-1;i>0;i--){ const j = Math.random()*(i+1)|0; [a[i],a[j]] = [a[j],a[i]]; } return a; };
  let pool = shuffle([...kinds]).slice(0, rivals.length);           // as many different types as there are seats
  while (pool.length < rivals.length) pool.push(kinds[Math.random()*kinds.length|0]);
  pool = shuffle(pool);
  rivals.forEach((c,i) => setKind(c, pool[i]));
  if (state==='menu') placeOnGrid();
  renderSpec();
}
function loadModel(kind, file, key, btn, sub, okText){
  return loadGLBScript(file, key).then(parseGLB).then(g => {
    let src = null; g.scene.traverse(m => { if (m.isMesh && !src) src = m; });
    if (!src) throw new Error('no mesh in ' + file);
    MODELS[kind] = (kind === 'rally' || kind === 'hover' || kind === 'drone') ? { scene:g.scene, multi:true, geometry:src.geometry, material:src.material } : src;
    ensureRig(player, kind);                     // build once up front so a problem shows here, not mid-race
    $(btn).disabled = false; $(sub).textContent = okText;
  }).catch(e => { console.error(kind, e); MODELS[kind] = null; $(sub).textContent = 'Unavailable'; });
}
(function loadModels(){
  const want = vehicle; vehicle = 'truck'; applySkin(); renderSpec();
  if (!THREE.GLTFLoader){ $('tankSub').textContent = $('walkerSub').textContent = $('jetSub').textContent = $('quadSub').textContent = $('rallySub').textContent = $('hoverSub').textContent = $('droneSub').textContent = 'Unavailable'; return; }
  Promise.all([
    loadModel('tank', 'tank-model.js', 'BULWARK_GLB', 'vTank', 'tankSub', 'Tank · heavy, sand-proof'),
    loadModel('walker', 'walker-model.js', 'STRIDER_GLB', 'vWalker', 'walkerSub', 'Walker · tall, nimble'),
    loadModel('jet', 'jet-model.js', 'KESTREL_GLB', 'vJet', 'jetSub', 'Jet · fastest, slides'),
    loadModel('quad', 'quad-model.js', 'BURRO_GLB', 'vQuad', 'quadSub', 'Quad · steady, sure-footed'),
    loadModel('rally', 'rally-model.js', 'RALLY_GLB', 'vRally', 'rallySub', 'Buggy · sharpest turn-in'),
    loadModel('hover', 'hover-model.js', 'HOVER_GLB', 'vHover', 'hoverSub', 'Hover-walker · short flights'),
    loadModel('drone', 'drone-model.js', 'BORG_GLB', 'vDrone', 'droneSub', 'Hover · fastest off the line'),
  ]).then(() => {
    if (state!=='menu') return;
    rollRivals();
    if (want!=='truck' && MODELS[want]) selectVehicle(want);
  });
})();
/* ---------- Strider walker rig ---------- */
const WALK = { hipY:.62, ankleY:.32, hip:[.48,.62,.07], ankle:[.5,.32,.1], pod:[.62,1.06,.1], scale:3.1 };
function loadGLBScript(src, key){
  // DR87 repo: models ship as binary GLBs under assets/models (was base64 in *-model.js)
  const file = DR87.asset('models/' + src.replace(/-model\.js$/, '') + '.glb');
  return fetch(file).then(r => { if (!r.ok) throw new Error(file + ' ' + r.status); return r.arrayBuffer(); });
}
function parseGLB(buf){
  return new Promise((res, rej) => {
    const cib = window.createImageBitmap; try { window.createImageBitmap = undefined; } catch(_){}
    try { new THREE.GLTFLoader().parse(buf, '', res, rej); } catch(e){ rej(e); } finally { try { window.createImageBitmap = cib; } catch(_){} }
  });
}
var _desertEnv;   // var, not let: body paint can ask for the sky probe before this line has run
function desertEnv(){
  if (_desertEnv) return _desertEnv;
  const es = new THREE.Scene();
  // vertex-coloured sky dome (built-in material, so the baker gets correctly encoded colours)
  const sg = new THREE.SphereGeometry(10, 48, 24), pa = sg.attributes.position, cols = [];
  const sunD = new THREE.Vector3(-.5,.6,-.4).normalize(), v = new THREE.Vector3(), lerp = (a,b,t) => a+(b-a)*Math.max(0,Math.min(1,t));
  for (let i=0;i<pa.count;i++){ v.fromBufferAttribute(pa,i).normalize(); const y = v.y; let r,g,b;
    if (y >= 0){ const t = Math.min(1, y/.6); r = lerp(.95,.36,t); g = lerp(.82,.56,t); b = lerp(.62,.8,t); }
    else { const t = Math.min(1, -y/.6); r = lerp(.84,.55,t); g = lerp(.62,.38,t); b = lerp(.38,.22,t); }
    const sun = Math.pow(Math.max(v.dot(sunD),0), 24)*2.2; cols.push(r+sun, g+sun*.9, b+sun*.7); }
  sg.setAttribute('color', new THREE.Float32BufferAttribute(cols,3));
  es.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({vertexColors:true, side:THREE.BackSide})));
  const pm = new THREE.PMREMGenerator(renderer);
  _desertEnv = pm.fromScene(es, .02).texture; pm.dispose();
  return _desertEnv;
}
function buildWalkerRig(src){
  const geo = src.geometry.index ? src.geometry.toNonIndexed() : src.geometry, mat = src.material;
  // chrome needs something to reflect: a small desert sky/sand environment, baked once
  try { mat.envMap = desertEnv(); mat.envMapIntensity = 1.1; mat.needsUpdate = true; } catch(e){ console.warn(e); }
  const P = geo.attributes.position, Nn = geo.attributes.normal, U = geo.attributes.uv;
  const B = { torso:[], legL:[], legR:[], footL:[], footR:[], podL:[], podR:[] };
  for (let t=0;t<P.count/3;t++){
    let cx=0, cy=0; for (let k=0;k<3;k++){ cx+=P.getX(t*3+k); cy+=P.getY(t*3+k); } cx/=3; cy/=3;
    const sd = cx > 0 ? 'L' : 'R';
    let b = 'torso';
    if (Math.abs(cx) > .6 && cy > .84) b = 'pod'+sd;
    else if (cy < WALK.hipY && Math.abs(cx) > .12) b = (cy < WALK.ankleY ? 'foot' : 'leg') + sd;
    B[b].push(t);
  }
  const part = (name, pivot) => {
    const ts = B[name], n = ts.length*3, p = new Float32Array(n*3), nr = new Float32Array(n*3), uv = new Float32Array(n*2); let j = 0;
    for (const t of ts) for (let k=0;k<3;k++){ const v=t*3+k;
      p[j*3]=P.getX(v)-pivot[0]; p[j*3+1]=P.getY(v)-pivot[1]; p[j*3+2]=P.getZ(v)-pivot[2];
      if (Nn){ nr[j*3]=Nn.getX(v); nr[j*3+1]=Nn.getY(v); nr[j*3+2]=Nn.getZ(v); }
      if (U){ uv[j*2]=U.getX(v); uv[j*2+1]=U.getY(v); } j++; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p,3));
    if (Nn) g.setAttribute('normal', new THREE.BufferAttribute(nr,3)); else g.computeVertexNormals();
    if (U) g.setAttribute('uv', new THREE.BufferAttribute(uv,2));
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
  };
  const root = new THREE.Group(); root.scale.setScalar(WALK.scale);
  root.rotation.y = Math.PI;                 // the model's toes point to -z; the game drives toward +z
  const torso = new THREE.Group(); torso.position.set(0, WALK.hipY, 0); root.add(torso);
  torso.add(part('torso', [0, WALK.hipY, 0]));
  const pods = {}, legs = {}, feet = {};
  for (const [sd, sx] of [['L',1],['R',-1]]){
    const pp = [sx*WALK.pod[0], WALK.pod[1], WALK.pod[2]];
    const pg = new THREE.Group(); pg.position.set(pp[0], pp[1]-WALK.hipY, pp[2]); torso.add(pg); pg.add(part('pod'+sd, pp)); pods[sd] = pg;
    const hp = [sx*WALK.hip[0], WALK.hip[1], WALK.hip[2]], ap = [sx*WALK.ankle[0], WALK.ankle[1], WALK.ankle[2]];
    const lg = new THREE.Group(); lg.position.fromArray(hp); root.add(lg); lg.add(part('leg'+sd, hp)); legs[sd] = lg;
    const ft = new THREE.Group(); ft.position.set(ap[0]-hp[0], ap[1]-hp[1], ap[2]-hp[2]); lg.add(ft); ft.add(part('foot'+sd, ap)); feet[sd] = ft;
  }
  const st = { ph:0, amp:0, prevCos:1 };
  const tmp = new THREE.Vector3();
  function update(c, dt, mode){
    const sp = Math.abs(c.f || 0), turning = Math.abs(c.steerV || 0);
    const want = mode==='idle' ? .08 : clamp(sp/22, 0, 1)*.42 + (sp < 4 ? turning*.22 : 0);
    st.amp += (want - st.amp)*Math.min(1, dt*4);
    st.ph += (mode==='idle' ? 1.6 : (sp/2.4 + (sp < 4 ? turning*3 : 0)) * Math.PI/2) * dt * (c.f < -.5 ? -1 : 1);
    const s = Math.sin(st.ph), co = Math.cos(st.ph), A = st.amp;
    legs.L.rotation.x =  s*A; legs.R.rotation.x = -s*A;
    legs.L.position.y = WALK.hip[1] + Math.max(0,  co)*A*.11;
    legs.R.position.y = WALK.hip[1] + Math.max(0, -co)*A*.11;
    feet.L.rotation.x = -legs.L.rotation.x*.85 - Math.max(0,  co)*A*.35;
    feet.R.rotation.x = -legs.R.rotation.x*.85 - Math.max(0, -co)*A*.35;
    torso.position.y = WALK.hipY - Math.abs(s)*A*.05 + .01;
    torso.rotation.z = s*A*.09; torso.rotation.y = -s*A*.07; torso.rotation.x = -clamp(sp/MAXS,0,1)*.09;
    pods.L.rotation.x = -s*A*.55; pods.R.rotation.x = s*A*.55;
    // footfalls: each foot plants as its swing reverses; a thud scaled by distance to you, and a puff of dust
    if (mode !== 'idle' && A > .12 && Math.sign(co) !== Math.sign(st.prevCos)){
      const sd = co < 0 ? 'L' : 'R';
      feet[sd].getWorldPosition(tmp);
      for (let i=0;i<6;i++) emit(tmp.x, .3, tmp.z, (Math.random()-.5)*5, .6+Math.random(), (Math.random()-.5)*5, 1.4+Math.random(), .7+Math.random()*.5);
      if (state==='race' || state==='count' || state==='done'){ if (c.player) stompSound(); else if (!c.ghost) { const d = Math.hypot(c.x-player.x, c.z-player.z); if (d < 70) thud(.75*(1 - d/70)); } }
      else if (state === 'insp' && !c.ghost){ const e = earK(c); if (e > 0) stompSound(e); }
    }
    st.prevCos = co;
  }
  return { root, update };
}


/* ---------- Kestrel: thrust-driven jet runner; wheels only steer, the two rear thrusters push ---------- */
const JETM = { scale:2.9, hip:[.495,.47,-.136], hub:[.518,.109,.204], hubR:.06, legX:.41, legY:.5, nozzle:[.29,.6,.56], nozzleR:.085 };
const flameMat = () => new THREE.ShaderMaterial({
  transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
  uniforms:{ uTime:{value:0}, uPower:{value:.2}, uBoost:{value:0}, uSeed:{value:Math.random()*10} },
  vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:[
    'uniform float uTime,uPower,uBoost,uSeed;varying vec2 vU;',
    'float h(float n){return fract(sin(n)*43758.5453);}',
    'float nz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float a=h(i.x+i.y*57.),b=h(i.x+1.+i.y*57.),c=h(i.x+(i.y+1.)*57.),d=h(i.x+1.+(i.y+1.)*57.);return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}',
    'void main(){',
    '  float t=vU.y;                       // 0 at the nozzle, 1 at the tip',
    '  float n=nz(vec2(vU.x*6.+uSeed, t*5.-uTime*14.))*.6+nz(vec2(vU.x*13., t*11.-uTime*23.))*.4;',
    '  float body=pow(1.-t,1.4)*(.55+.45*n);',
    '  vec3 hot=mix(vec3(1.,.95,.75),vec3(.75,.9,1.),uBoost);',
    '  vec3 mid=mix(vec3(1.,.55,.12),vec3(.35,.6,1.),uBoost);',
    '  vec3 tip=mix(vec3(.85,.18,.04),vec3(.25,.25,.9),uBoost);',
    '  vec3 col=mix(hot,mid,smoothstep(0.,.35,t)); col=mix(col,tip,smoothstep(.35,1.,t));',
    '  float a=body*(.35+.65*uPower);',
    '  gl_FragColor=vec4(col*a*1.6,a);',
    '}'].join('\n')
});
// the Cicada's burners: the same flame, in a deep blue that still reads as blue over bright sand (additive white would wash out)
const blueFlameMat = (solid) => { const m = flameMat(); if (solid) m.blending = THREE.NormalBlending; m.fragmentShader = m.fragmentShader
    .replace(/vec3 hot=.*?;/, 'vec3 hot=vec3(.45,.75,1.);').replace(/vec3 mid=.*?;/, 'vec3 mid=vec3(.1,.35,1.);').replace(/vec3 tip=.*?;/, 'vec3 tip=vec3(.08,.1,.75);')
    .replace('gl_FragColor=vec4(col*a*1.6,a);', solid ? 'gl_FragColor=vec4(col*1.1,min(1.,a*1.1));' : 'gl_FragColor=vec4(col*a*1.25,a);'); return m; };   // solid: a real blue envelope, alpha-blended
function buildJetRig(src){
  const geo = src.geometry.index ? src.geometry.toNonIndexed() : src.geometry, mat = src.material;
  try { mat.envMap = desertEnv(); mat.envMapIntensity = .5; mat.needsUpdate = true; } catch(e){}
  const P = geo.attributes.position, Nn = geo.attributes.normal, U = geo.attributes.uv;
  const B = { body:[], legL:[], legR:[], hubL:[], hubR:[] };
  for (let t=0;t<P.count/3;t++){
    let cx=0, cy=0, cz=0; for (let k=0;k<3;k++){ cx+=P.getX(t*3+k); cy+=P.getY(t*3+k); cz+=P.getZ(t*3+k); } cx/=3; cy/=3; cz/=3;
    const sd = cx > 0 ? 'L' : 'R'; let b = 'body';
    if (Math.abs(cx) > JETM.hub[0]-.002 && Math.hypot(cy-JETM.hub[1], cz-JETM.hub[2]) < JETM.hubR) b = 'hub'+sd;
    else if (Math.abs(cx) > JETM.legX && cy < JETM.legY) b = 'leg'+sd;
    B[b].push(t);
  }
  const part = (name, pivot) => {
    const ts = B[name], n = ts.length*3, p = new Float32Array(n*3), nr = new Float32Array(n*3), uv = new Float32Array(n*2); let j = 0;
    for (const t of ts) for (let k=0;k<3;k++){ const v=t*3+k;
      p[j*3]=P.getX(v)-pivot[0]; p[j*3+1]=P.getY(v)-pivot[1]; p[j*3+2]=P.getZ(v)-pivot[2];
      if (Nn){ nr[j*3]=Nn.getX(v); nr[j*3+1]=Nn.getY(v); nr[j*3+2]=Nn.getZ(v); }
      if (U){ uv[j*2]=U.getX(v); uv[j*2+1]=U.getY(v); } j++; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p,3));
    if (Nn) g.setAttribute('normal', new THREE.BufferAttribute(nr,3)); else g.computeVertexNormals();
    if (U) g.setAttribute('uv', new THREE.BufferAttribute(uv,2));
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
  };
  const root = new THREE.Group(); root.scale.setScalar(JETM.scale);
  root.rotation.y = Math.PI;                       // model faces -z (head and eyes at that end); nozzles at +z blow backward
  root.add(part('body', [0,0,0]));
  const legs = {}, hubs = {};
  for (const [sd, sx] of [['L',1],['R',-1]]){
    const hp = [sx*JETM.hip[0], JETM.hip[1], JETM.hip[2]], cp = [sx*JETM.hub[0], JETM.hub[1], JETM.hub[2]];
    const lg = new THREE.Group(); lg.position.fromArray(hp); root.add(lg); lg.add(part('leg'+sd, hp)); legs[sd] = lg;
    const hb = new THREE.Group(); hb.position.set(cp[0]-hp[0], cp[1]-hp[1], cp[2]-hp[2]); lg.add(hb); hb.add(part('hub'+sd, cp)); hubs[sd] = hb;
  }
  // thrusters: two layered flame cones (outer flame + hot core) and a glow card at each nozzle
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,240,200,1)'); g.addColorStop(.3,'rgba(255,150,50,.6)'); g.addColorStop(1,'rgba(255,80,0,0)'); x.fillStyle = g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); })();
  const coneGeo = (r) => { const g = new THREE.CylinderGeometry(r*.25, r, 1, 20, 8, true); g.translate(0,.5,0); g.rotateX(Math.PI/2); return g; };   // base at nozzle, tip along +z
  const outerGeo = coneGeo(JETM.nozzleR), coreGeo = coneGeo(JETM.nozzleR*.55);
  const jets = [];
  for (const sx of [1,-1]){
    const n = new THREE.Group(); n.position.set(sx*JETM.nozzle[0], JETM.nozzle[1], JETM.nozzle[2]); root.add(n);
    const outer = new THREE.Mesh(outerGeo, flameMat()), core = new THREE.Mesh(coreGeo, flameMat());
    outer.renderOrder = 5; core.renderOrder = 6; n.add(outer, core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true, opacity:.6}));
    glow.position.z = .03; glow.scale.setScalar(.3); n.add(glow);
    jets.push({n, outer, core, glow});
  }
  const st = { power:.2, boost:0, spin:0, steer:0 };
  const tmp = new THREE.Vector3();
  function update(c, dt, mode){
    const t = performance.now()/1000, sp = Math.abs(c.f||0);
    // thrust level: idle burble, full burn on throttle, extra-long blue flame on boost
    const want = mode==='idle' ? .18 : (c.thr ? .85 + Math.min(sp/MAXS,1)*.15 : (c.brk ? .05 : .28));
    st.power += (want - st.power)*Math.min(1, dt*(want > st.power ? 9 : 4));
    st.boost += ((c.boost > 0 || active(c,'burner') ? 1 : 0) - st.boost)*Math.min(1, dt*6);
    for (const [i,j] of jets.entries()){
      const flick = 1 + Math.sin(t*61 + i*2.1)*.06 + Math.sin(t*37.3 + i)*.05;
      const len = (.25 + st.power*1.15 + st.boost*1.1) * flick;
      const wid = 1.15 + st.power*.15 + st.boost*.3;
      j.outer.scale.set(wid, wid, len);
      j.core.scale.set(1.05, 1.05, len*.6);
      for (const m of [j.outer.material, j.core.material]){ m.uniforms.uTime.value = t; m.uniforms.uPower.value = st.power; m.uniforms.uBoost.value = st.boost; }
      j.glow.material.opacity = .25 + st.power*.6 + st.boost*.3; j.glow.scale.setScalar(.22 + st.power*.18 + st.boost*.15);
      j.glow.material.color.setRGB(1 - st.boost*.4, 1 - st.boost*.15, 1);
    }
    // guide wheels: the struts caster toward the turn (they steer, they don't drive) and the hub caps roll
    st.steer += ((mode==='idle' ? Math.sin(t*.8)*.25 : c.steerV*.38) - st.steer)*Math.min(1, dt*10);
    legs.L.rotation.y = legs.R.rotation.y = st.steer;
    st.spin -= (c.f||0)*dt/(.11*JETM.scale);
    hubs.L.rotation.x = hubs.R.rotation.x = st.spin;
    // jet wash kicks up sand behind the thrusters
    if (mode!=='idle' && st.power > .5 && Math.random() < st.power*(c.off ? .9 : .45)){
      for (const j of jets){ j.n.getWorldPosition(tmp); const bx = -Math.sin(c.h), bz = -Math.cos(c.h);
        emit(tmp.x + bx*2.5, .3, tmp.z + bz*2.5, bx*8 + c.vx*.4 + (Math.random()-.5)*4, .8 + Math.random(), bz*8 + c.vz*.4 + (Math.random()-.5)*4, 1.2 + Math.random(), .6 + Math.random()*.5); }
    }
  }
  return { root, update };
}


/* ---------- Burro: four-legged cargo walker; diagonal-pair trot ---------- */
const QUADM = { scale:3.0, cutY:.8, centreZ:.08, hips:{ FL:[.34,.8,.26], FR:[-.334,.8,.263], RL:[.336,.8,-.313], RR:[-.333,.8,-.308] } };
function buildQuadRig(src){
  const geo = src.geometry.index ? src.geometry.toNonIndexed() : src.geometry, mat = src.material;
  try { mat.envMap = desertEnv(); mat.envMapIntensity = .45; mat.needsUpdate = true; } catch(e){}
  const P = geo.attributes.position, Nn = geo.attributes.normal, U = geo.attributes.uv;
  const B = { body:[], FL:[], FR:[], RL:[], RR:[] };
  for (let t=0;t<P.count/3;t++){
    let cx=0, cy=0, cz=0; for (let k=0;k<3;k++){ cx+=P.getX(t*3+k); cy+=P.getY(t*3+k); cz+=P.getZ(t*3+k); } cx/=3; cy/=3; cz/=3;
    let b = 'body';
    if (cy < QUADM.cutY && Math.abs(cz) > QUADM.centreZ) b = (cz > 0 ? 'F' : 'R') + (cx > 0 ? 'L' : 'R');
    B[b].push(t);
  }
  const part = (name, pivot) => {
    const ts = B[name], n = ts.length*3, p = new Float32Array(n*3), nr = new Float32Array(n*3), uv = new Float32Array(n*2); let j = 0;
    for (const t of ts) for (let k=0;k<3;k++){ const v=t*3+k;
      p[j*3]=P.getX(v)-pivot[0]; p[j*3+1]=P.getY(v)-pivot[1]; p[j*3+2]=P.getZ(v)-pivot[2];
      if (Nn){ nr[j*3]=Nn.getX(v); nr[j*3+1]=Nn.getY(v); nr[j*3+2]=Nn.getZ(v); }
      if (U){ uv[j*2]=U.getX(v); uv[j*2+1]=U.getY(v); } j++; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p,3));
    if (Nn) g.setAttribute('normal', new THREE.BufferAttribute(nr,3)); else g.computeVertexNormals();
    if (U) g.setAttribute('uv', new THREE.BufferAttribute(uv,2));
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
  };
  const root = new THREE.Group(); root.scale.setScalar(QUADM.scale);
  const body = new THREE.Group(); body.position.set(0, QUADM.cutY, 0); root.add(body);
  body.add(part('body', [0, QUADM.cutY, 0]));
  const legs = {};
  for (const k of ['FL','FR','RL','RR']){ const hp = QUADM.hips[k]; const lg = new THREE.Group(); lg.position.fromArray(hp); root.add(lg); lg.add(part(k, hp)); legs[k] = lg; }
  const PHASE = { FL:0, RR:0, FR:Math.PI, RL:Math.PI };       // trot: diagonal pairs move together
  const st = { ph:0, amp:0, prev:{FL:1,FR:1,RL:1,RR:1} };
  const tmp = new THREE.Vector3();
  function update(c, dt, mode){
    const sp = Math.abs(c.f || 0), turning = Math.abs(c.steerV || 0);
    const want = mode==='idle' ? .05 : clamp(sp/20, 0, 1)*.34 + (sp < 4 ? turning*.2 : 0);
    st.amp += (want - st.amp)*Math.min(1, dt*5);
    st.ph += (mode==='idle' ? 1.4 : (sp/1.9 + (sp < 4 ? turning*4 : 0)) * Math.PI/2) * dt * (c.f < -.5 ? -1 : 1);
    const A = st.amp;
    for (const k in legs){
      const s = Math.sin(st.ph + PHASE[k]), co = Math.cos(st.ph + PHASE[k]);
      legs[k].rotation.x = -s*A;
      legs[k].position.y = QUADM.hips[k][1] + Math.max(0, co)*A*.13;
      if (mode !== 'idle' && A > .1 && co < 0 && st.prev[k] >= 0 && (k==='FL' || k==='FR')){
        legs[k].getWorldPosition(tmp);
        for (let i=0;i<4;i++) emit(tmp.x, .3, tmp.z, (Math.random()-.5)*4, .5+Math.random(), (Math.random()-.5)*4, 1+Math.random(), .6+Math.random()*.4);
        if (state==='race' || state==='count' || state==='done'){ if (c.player) stompSound(.5); else if (!c.ghost) { const d = Math.hypot(c.x-player.x, c.z-player.z); if (d < 60) thud(.45*(1 - d/60)); } }
        else if (state === 'insp' && !c.ghost){ const e = earK(c); if (e > 0) stompSound(.5*e); }
      }
      st.prev[k] = co;
    }
    const s2 = Math.sin(st.ph*2);
    body.position.y = QUADM.cutY + Math.abs(s2)*A*.025 - A*.02;
    body.rotation.x = clamp(-(c.accel||0)*.0015, -.06, .06) + Math.sin(st.ph*2)*A*.02;
    body.rotation.z = Math.sin(st.ph)*A*.03 - (c.steerV||0)*clamp(sp/MAXS,0,1)*.05;
  }
  return { root, update };
}


/* =====================================================================
   Signature abilities, style meter, ghost lap, camera modes, Grand Tour
   ===================================================================== */
const ABIL = {
  truck:  { id:'nitro',  name:'Nitro',       dur:2.6,  hint:'a hard burst of speed' },
  tank:   { id:'shell',  name:'Shockshell',  dur:.5,   hint:'a shell that spins out the rival ahead' },
  walker: { id:'leap',   name:'Leap',        dur:1.3,  hint:'a jump clean over hazards and rivals' },
  jet:    { id:'burner', name:'Afterburner', dur:3.0,  hint:'a long blue-flame surge' },
  quad:   { id:'shield', name:'Ram Shield',  dur:4.0,  hint:'a shield that ignores hazards and shoves rivals aside' },
  drone:  { id:'beam',   name:'Tractor Beam', dur:2.6,  hint:'locks on to the rival ahead: they drag, you get hauled past' },
  hover:  { id:'flight', name:'Updraft',     dur:2.6,  hint:'lifts off on its turbines and flies a short hop over everything' },
  rally:  { id:'hook',   name:'Groundhook',  dur:3.5,  hint:'hooks into the road: flat-out corners, no slide, sand and wind can\'t touch it' },
};
const abilOf = c => ABIL[c.kind] || ABIL.truck;
const active = (c, id) => c.abilT > 0 && c.abilId === id;
let shake = 0;
function addShake(k){ shake = Math.min(1.2, shake + k); }

/* ---------- style meter: fills from clean, brave driving ---------- */
function updateMeter(c, dt){
  if (c.abilT > 0){ c.abilT -= dt; if (c.abilT <= 0) endAbility(c); return; }   // abilities run out even after the finish / results
  if (state !== 'race' || c.finished) return;
  if (c.meter >= 100) return;
  let g = 2.2;                                             // a trickle just for racing
  if ((c.draft||0) > .3) g += 9;                           // tucked into a slipstream
  if (Math.abs(c.l||0) > 5 && Math.abs(c.f||0) > 15) g += 14;   // sliding through a corner
  if (c.boostEvt){ c.boostEvt = false; c.meter += 14; if (c.player) styleToast('Boost +14'); }
  // near miss: slipping past a rival with a hand's width to spare
  for (const o of cars){ if (o === c) continue;
    const dx = o.x - c.x, dz = o.z - c.z, fx = Math.sin(c.h), fz = Math.cos(c.h);
    const along = dx*fx + dz*fz, lat = Math.abs(dx*fz - dz*fx), clear = (c.prof.rad + o.prof.rad)*.5;
    if (Math.abs(along) < 2.5 && lat > clear*.9 && lat < clear + 2.6 && Math.abs(c.f) > Math.abs(o.f) + 3){
      c._nm = c._nm || {}; if (!(raceTime < (c._nm[o.L.name]||0))){ c._nm[o.L.name] = raceTime + 2.5; c.meter += 8; if (c.player) styleToast('Near miss +8'); } } }
  c.meter = Math.min(100, c.meter + g*dt);
  if (c.player && c.meter >= 100) { showToast(abilOf(c).name + ' ready', 900); readyChime(); }
}
let styleT = 0;
function styleToast(txt){ const el = $('styleTag'); el.textContent = txt; el.classList.add('on'); clearTimeout(styleT); styleT = setTimeout(() => el.classList.remove('on'), 900); }

/* ---------- using an ability ---------- */
function useAbility(c){
  if (state !== 'race' || c.finished || c.meter < 100 || c.abilT > 0 || paused || c.loop) return false;
  const A = abilOf(c); c.meter = 0; c.abilId = A.id; c.abilT = A.dur;
  if (A.id === 'shell') fireShell(c);
  if (A.id === 'leap'){ c.airT = A.dur; c.airDur = A.dur; c.airKind = 'leap'; }
  if (A.id === 'flight'){ c.airT = A.dur; c.airDur = A.dur; c.airKind = 'flight'; }
  if (A.id === 'beam'){ c.beamTarget = beamTargetFor(c); if (c.player && c.beamTarget) styleToast('Locked on ' + (c.beamTarget.L ? c.beamTarget.L.name.replace(/^.*\. /,'') : '')); }
  if (A.id === 'shield') shieldFor(c).visible = true;
  if (A.id === 'nitro') nitroFor(c).visible = true;
  if (c.player && state !== 'insp'){ showToast(A.name + '!', 800); abilitySound(A.id); addShake(.25); }
  else if (state === 'insp'){ const e = earK(c); if (e > 0) abilitySound(A.id, e); }
  return true;
}
function endAbility(c){
  c.abilT = 0;
  if (c.abilId === 'shield' && c._shield) c._shield.visible = false;
  if (c.abilId === 'nitro' && c._nitro) c._nitro.visible = false;
  c.abilId = null;
}
// physics effects of an active ability, folded into step()
function abilityMods(c){
  const m = { top:0, acc:1, grip:1, immune:false, mass:1, anchor:false };
  if (c.stun > 0){ m.top = -999; }
  if (active(c,'nitro'))  { m.top = 22; m.acc = 1.8; }
  if (active(c,'burner')) { m.top = 30; m.acc = 1.6; m.grip = .8; }
  if (active(c,'leap'))   { m.top = 6; m.immune = true; }
  if (active(c,'flight')) { m.top = 12; m.acc = 1.25; m.immune = true; }
  if (active(c,'beam'))   { m.top = 14; m.acc = 1.35; const t = c.beamTarget; if (t && !t.finished){ t.tractUntil = raceTime + .12;          // reel in towards the target, and keep the lock while it's in reach
      const dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz); if (d > 110) c.beamTarget = null; } }
  if ((c.tractUntil || 0) > raceTime){ m.top -= 16; m.acc *= .65; }   // caught in someone's beam
  if (active(c,'shield')) { m.immune = true; m.mass = 5; }
  if (active(c,'hook'))   { m.grip = 3.2; m.top = 8; m.acc = 1.3; m.mass = 2.5; m.anchor = true; }   // hooked into the ground: no slide, no off-road or wind penalty, hard to shove
  return m;
}

/* nitro: twin blue flames from the truck's tail */
function nitroFor(c){
  if (c._nitro) return c._nitro;
  const g = new THREE.Group(); g.position.set(0, .95, -2.45); c.body.add(g);
  for (const sx of [-.55,.55]){ const cone = new THREE.Mesh(new THREE.ConeGeometry(.22, 1.6, 12, 1, true), new THREE.MeshBasicMaterial({color:0x7fd8ff, transparent:true, opacity:.85, blending:THREE.AdditiveBlending, depthWrite:false}));
    cone.rotation.x = -Math.PI/2; cone.position.set(sx, 0, -.8); g.add(cone); }
  g.visible = false; c._nitro = g; return g;
}
/* ram shield: a pulsing bubble */
function shieldFor(c){
  if (c._shield) return c._shield;
  const m = new THREE.Mesh(new THREE.SphereGeometry(c.prof.rad*.62, 28, 18), new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
    uniforms:{ uT:{value:0} },
    vertexShader:'varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform float uT;varying vec3 vN;varying vec3 vV;void main(){float f=pow(1.-abs(dot(vN,vV)),2.2);float hex=.5+.5*sin(vN.y*40.+uT*6.)*sin(vN.x*40.);vec3 c=mix(vec3(1.,.75,.2),vec3(1.,.95,.6),hex);gl_FragColor=vec4(c*(f*1.4+.06),f*.9+.05);}' }));
  m.position.y = c.prof.rad*.45; m.visible = false; c.body.add(m); c._shield = m; return m;
}
/* shockshell: a glowing round that homes on the first rival ahead */
const shells = [];
function fireShell(c){
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  let target = null, best = 130;
  for (const o of cars){ if (o === c || o.finished) continue; const dx = o.x-c.x, dz = o.z-c.z, d = Math.hypot(dx,dz);
    if (d < 8 || d > best) continue; const ang = Math.abs(wrapA(Math.atan2(dx,dz) - c.h)); if (ang < .35){ best = d; target = o; } }
  const m = new THREE.Mesh(new THREE.SphereGeometry(.55, 12, 8), new THREE.MeshBasicMaterial({color:0xffc070}));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({map:shellGlow(), blending:THREE.AdditiveBlending, depthWrite:false, transparent:true})); glow.scale.setScalar(3.2); m.add(glow);
  m.position.set(c.x + fx*4, 3.4, c.z + fz*4); scene.add(m);
  shells.push({ m, vx:fx*120 + c.vx, vz:fz*120 + c.vz, owner:c, target, life:1.6 });
  c.fireKick = true;
  { const ek = earAt(c.x, c.z, 80); if (ek > 0) thud(.6*ek); }
}
let _shellGlow = null;
function shellGlow(){ if (_shellGlow) return _shellGlow; const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'); const g = x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,240,200,1)'); g.addColorStop(.35,'rgba(255,140,40,.7)'); g.addColorStop(1,'rgba(255,60,0,0)'); x.fillStyle = g; x.fillRect(0,0,64,64); return (_shellGlow = new THREE.CanvasTexture(cv)); }
function updateShells(dt){
  for (let i = shells.length-1; i >= 0; i--){ const s = shells[i]; s.life -= dt;
    if (s.target){ const dx = s.target.x - s.m.position.x, dz = s.target.z - s.m.position.z, d = Math.hypot(dx,dz) || 1, sp = Math.hypot(s.vx,s.vz);
      s.vx += (dx/d*sp - s.vx)*Math.min(1, dt*4); s.vz += (dz/d*sp - s.vz)*Math.min(1, dt*4); }
    s.m.position.x += s.vx*dt; s.m.position.z += s.vz*dt; s.m.position.y = Math.max(1.6, s.m.position.y - dt*2);
    sparks.emit(s.m.position.x, s.m.position.y, s.m.position.z, rnd(-2,2), rnd(-1,2), rnd(-2,2), rnd(.4,.7), .35);
    let hit = null;
    for (const o of cars){ if (o === s.owner) continue; if (Math.hypot(o.x - s.m.position.x, o.z - s.m.position.z) < o.prof.rad*.55 + 1){ hit = o; break; } }
    if (hit || s.life <= 0){
      const p = s.m.position;
      for (let k=0;k<40;k++) sparks.emit(p.x, p.y, p.z, rnd(-14,14), rnd(2,14), rnd(-14,14), rnd(.6,1.2), rnd(.4,.9));
      for (let k=0;k<10;k++) tankSmoke.emit(p.clone(), {x:rnd(-4,4), y:rnd(1,4), z:rnd(-4,4)}, rnd(2,3.5), rnd(1,1.8));
      const ek = earAt(p.x, p.z, 90); if (ek > 0){ thud(.9*ek); if (state !== 'insp') addShake(.6*ek); }
      if (hit && !(active(hit,'shield') || active(hit,'leap') || active(hit,'flight'))){ const hk = active(hit,'hook'); if (!hk) hit.stun = 1.6; hit.vx *= hk ? .75 : .35; hit.vz *= hk ? .75 : .35; burnCar(hit, p.x, p.y, p.z); hit.burnU.fireT = 2.2;
        if (hit.player) showToast('Hit by ' + s.owner.L.name.replace(/^.*\. /,'') + '’s shell!', 1100);
        else if (s.owner.player) showToast('Direct hit!', 900); }
      scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); shells.splice(i,1);
    }
  }
}
/* =====================================================================
   Surprises: things that drop on a race without being asked.
   For now: a meteor shower. A rumble and a red banner, then rocks come
   screaming in on everyone — red rings on the road mark where each one
   lands, so a quick swerve saves you. A direct hit stuns and spins.
   ===================================================================== */
const SUR_LV = { easy:{ n:7, fallT:1.7, first:[24,40], gap:[60,90] }, normal:{ n:11, fallT:1.35, first:[18,36], gap:[50,80] }, hard:{ n:15, fallT:1.1, first:[14,30], gap:[45,70] } };
const SUR_STYLE = { hive:{ name:'LIGHTNING STORM', core:0xeafff4, glow:0x3cff8a, trail:0x9affc8 }, forge:{ name:'ERUPTION', core:0xffd080, glow:0xff4a10, trail:0xff7a30 }, tundra:{ name:'ICE FALL', core:0xf4fbff, glow:0x9fd8ff, trail:0xcfefff },
                    cirrus:{ name:'SKYFALL', core:0xfff4d8, glow:0xffd080, trail:0xffe0a0 }, def:{ name:'METEOR SHOWER', core:0xffe2b0, glow:0xff8a30, trail:0xffa050 } };
let surpriseOn = true; try { surpriseOn = (localStorage.getItem('dustrunner-surprise') || 'on') !== 'off'; } catch(e){}
const SUR = { next: 1e9, ev: null, n: 0 };
const METEORS = [], CRATERS = [], FLASHES = [];
const surGroup = new THREE.Group(); scene.add(surGroup);
const embers = makeFx(0xffb070, 240, true, 0);                         // sky streaks: distant rocks burning in far behind the horizon
const flareTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,255,240,1)'); g.addColorStop(.25,'rgba(255,200,120,.9)'); g.addColorStop(.6,'rgba(255,110,40,.35)'); g.addColorStop(1,'rgba(255,60,20,0)'); x.fillStyle = g; x.fillRect(0,0,128,128); return new THREE.CanvasTexture(c); })();
const rockGeo = new THREE.DodecahedronGeometry(1.3, 0), glowGeo = new THREE.DodecahedronGeometry(2.1, 0);
const trailGeo = (() => { const g = new THREE.ConeGeometry(1.5, 22, 8, 1, true); g.translate(0, -11, 0); return g; })();   // apex at the rock, tail streaming behind
// a scorch mark: soft-edged and ragged, so it never reads as a hard black disc, and lit like the road so headlights and pod glows still land on it
const scorchTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64,64,0,64,64,62);
  g.addColorStop(0,'rgba(0,0,0,.92)'); g.addColorStop(.35,'rgba(0,0,0,.8)'); g.addColorStop(.7,'rgba(0,0,0,.35)'); g.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0,0,128,128);
  x.globalCompositeOperation = 'destination-out'; for (let i=0;i<70;i++){ const a = Math.random()*6.283, d = rnd(30, 62); x.fillStyle = `rgba(0,0,0,${rnd(.2,.6)})`; x.beginPath(); x.arc(64 + Math.cos(a)*d, 64 + Math.sin(a)*d, rnd(3, 9), 0, 7); x.fill(); }
  x.globalCompositeOperation = 'source-over'; for (let i=0;i<12;i++){ const a = Math.random()*6.283; x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = rnd(1.5, 3); x.beginPath(); x.moveTo(64 + Math.cos(a)*20, 64 + Math.sin(a)*20); x.lineTo(64 + Math.cos(a)*rnd(46, 62), 64 + Math.sin(a)*rnd(46, 62)); x.stroke(); }
  return new THREE.CanvasTexture(c); })();
const ringGeo = new THREE.RingGeometry(2.4, 3.5, 28), dotGeo = new THREE.CircleGeometry(2.4, 18), craterGeo = new THREE.PlaneGeometry(9, 9), rimGeo = new THREE.RingGeometry(3.0, 3.9, 24);
const shaftGeo = (() => { const g = new THREE.CylinderGeometry(.55, 1.5, 70, 10, 1, true); g.translate(0, 35, 0); return g; })();   // a column of light standing on the target: readable from the chase camera at any distance
const UP = new THREE.Vector3(0,1,0);
function surStyle(){ return SUR_STYLE[world.id] || SUR_STYLE.def; }
function meteorFromPool(){
  let m = METEORS.find(m => !m.live);
  if (!m){ const st = surStyle();
    m = { live:false, rock:new THREE.Mesh(rockGeo, new THREE.MeshBasicMaterial({ color:st.core })), glow:new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color:st.glow, transparent:true, opacity:.4, depthWrite:false })),
          trail:new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color:st.trail, transparent:true, opacity:.55, depthWrite:false, side:THREE.DoubleSide })),
          ring:new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color:0xff2a2a, transparent:true, opacity:.95, depthWrite:false, side:THREE.DoubleSide, fog:false })),
          dot:new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color:0xff3a2a, transparent:true, opacity:.35, depthWrite:false, side:THREE.DoubleSide, fog:false })),
          shaft:new THREE.Mesh(shaftGeo, new THREE.MeshBasicMaterial({ color:0xff2e1e, transparent:true, opacity:.5, depthWrite:false, side:THREE.DoubleSide, fog:false })) };
    m.ring.rotation.x = m.dot.rotation.x = -Math.PI/2; m.ring.renderOrder = m.dot.renderOrder = 3; m.shaft.renderOrder = 4;
    for (const o of [m.rock, m.glow, m.trail, m.ring, m.dot, m.shaft]){ o.visible = false; surGroup.add(o); }
    METEORS.push(m); }
  const st = surStyle(); m.rock.material.color.set(st.core); m.glow.material.color.set(st.glow); m.trail.material.color.set(st.trail);
  return m;
}
function surpriseAnnounce(ev){
  const t = $('toast'); t.classList.add('alert'); showToast((world.id === 'forge' ? '🌋 ' : world.id === 'hive' ? '⚡ ' : '☄ ') + surStyle().name, 1800); setTimeout(() => t.classList.remove('alert'), 1900);
  rumble(); addShake(.25);
}
function surpriseReset(){ SUR.ev = null; SUR.n = 0; const L = SUR_LV[level] || SUR_LV.normal; SUR.next = rnd(L.first[0], L.first[1]);
  for (const m of METEORS) meteorKill(m); clearCraters(); clearVolcanoDebris(); clearBolts(); for (const v of VOLC) v.erupt = 0; }
function clearCraters(){ for (const c of CRATERS){ surGroup.remove(c.disc); surGroup.remove(c.rim); c.disc.material.dispose(); c.rim.material.dispose(); } CRATERS.length = 0;
  for (const f of FLASHES) surGroup.remove(f.s); FLASHES.length = 0; }
function meteorKill(m){ m.live = false; for (const o of [m.rock, m.glow, m.trail, m.ring, m.dot, m.shaft]) o.visible = false; }
function spawnMeteor(ev){
  const L = SUR_LV[level] || SUR_LV.normal;
  // who gets it: the player half the time (that's who's watching), otherwise a random rival still racing
  let car = player; if (player.finished || Math.random() > .5){ const others = cars.filter(c => !c.player && !c.finished); if (others.length) car = others[Math.random()*others.length|0]; }
  let ti = -1;
  // never on a ramp, lip or landing deck, nor on a crest where the road bends over (a flat crater can't lie on it)
  const onJump = k => JUMPS.some(j => { const a = (k - (j.lip - (j.ramp||8) - 4) + N) % N, len = ((j.land + 14) - (j.lip - (j.ramp||8) - 4) + N) % N; return a <= len; });
  const crest = k => world.elev && Math.abs(slopeAt((k + 3) % N) - slopeAt((k - 3 + N) % N)) > .06;
  for (let tries=0; tries<8 && ti < 0; tries++){ const k = (car.idx + Math.round(rnd(12, 34))) % N; if (!GAP[k] && !inTunnel(k) && !onJump(k) && !crest(k)) ti = k; }
  if (ti < 0) return;
  const lat = clamp((car.lat||0) + rnd(-6, 6), -W/2 + 4.2, W/2 - 4.2);          // the whole crater (3.9 m rim) stays on the tarmac
  const tx = P[ti].x + R[ti].x*lat, tz = P[ti].z + R[ti].z*lat, ty = trackY(tx, tz, ti);
  const m = meteorFromPool(); m.live = true; m.ti = ti; m.lat = lat; m.tx = tx; m.ty = ty; m.tz = tz; m.t = 0; m.fallT = L.fallT;
  const speed = 105, d = ev.dir; m.sx = tx + d.x*speed*m.fallT; m.sy = ty + d.y*speed*m.fallT; m.sz = tz + d.z*speed*m.fallT; m.arc = 0;
  const vol = world.id === 'forge' ? volcanoFor(tx, tz) : null;
  m.bolt = world.id === 'hive'; if (m.bolt){ m.fallT = rnd(1.3, 1.6); }   // lightning: no rock to watch, just the ring closing — then the strike
  if (vol){ const dist = Math.hypot(vol.x - tx, vol.z - tz); m.sx = vol.x; m.sy = vol.top + 1; m.sz = vol.z; m.fallT = clamp(dist/60, 1.7, 3.4); m.arc = 16 + dist*.24;
    const fresh = !(vol.erupt > 0); vol.erupt = Math.max(vol.erupt, 2.6);
    const pd = Math.hypot(player.x - vol.x, player.z - vol.z); if (pd < 260){ addShake(.12); }
    if (fresh) volcanoBlast(vol, pd); }
  m.rock.rotation.set(rnd(0,3), rnd(0,3), rnd(0,3));
  m.trail.quaternion.setFromUnitVectors(UP, new THREE.Vector3(-d.x, -d.y, -d.z));   // nose along the fall direction
  m.trail.scale.setScalar(m.arc ? .45 : 1);
  m.ring.position.set(tx, ty + .09, tz); m.dot.position.set(tx, ty + .1, tz); m.shaft.position.set(tx, ty, tz);
  for (const o of [m.rock, m.glow, m.trail, m.ring, m.dot, m.shaft]) o.visible = true;
  if (m.bolt){ m.rock.visible = m.glow.visible = m.trail.visible = false; m.shaft.material.color.set(0x3cff8a); m.ring.material.color.set(0x9affc8); } else m.shaft.material.color.set(0xff2e1e);
  m.ring.scale.setScalar(1.6);
}
function stepMeteor(m, dt){
  m.t += dt; const u = Math.min(1, m.t/m.fallT);
  const x = m.sx + (m.tx - m.sx)*u, y = m.sy + (m.ty - m.sy)*u + (m.arc ? m.arc*4*u*(1 - u) : 0), z = m.sz + (m.tz - m.sz)*u;
  if (m.arc){ const vy = (m.ty - m.sy) + m.arc*4*(1 - 2*u), vel = new THREE.Vector3(m.tx - m.sx, vy, m.tz - m.sz).normalize(); m.trail.quaternion.setFromUnitVectors(UP, vel);   // a lobbed bomb: the tail follows the arc
    if (Math.random() < .5) smokeFx.emit(x, y, z, rnd(-1,1), rnd(0,2), rnd(-1,1), rnd(3, 5), rnd(1.2, 2)); }
  m.rock.position.set(x, y, z); m.glow.position.set(x, y, z); m.trail.position.set(x, y, z);
  m.rock.rotation.x += dt*9; m.rock.rotation.y += dt*6; m.glow.rotation.copy(m.rock.rotation);
  // the target ring tightens and brightens as the rock arrives
  m.ring.scale.setScalar(1.6 - .6*u); m.ring.material.opacity = .6 + .4*u; m.ring.material.color.setRGB(1, .15 + .7*u*u, .15 + .5*u*u); m.dot.material.opacity = .25 + .45*u;
  const pulse = 1 + .25*Math.sin(m.t*22); m.shaft.scale.set(pulse*(1.3 - .5*u), 1, pulse*(1.3 - .5*u)); m.shaft.material.opacity = .3 + .35*u;
  if (m.bolt){ m.ring.material.color.setRGB(.3 + .7*u*u, 1, .55 + .45*u*u); if (u > .6 && Math.random() < .5) glitter.emit(m.tx + rnd(-2,2), m.ty + .3, m.tz + rnd(-2,2), rnd(-2,2), rnd(1,5), rnd(-2,2), rnd(.3,.6), rnd(.15,.3)); }
  else if (Math.random() < .5) embers.emit(x + rnd(-1,1), y + rnd(-1,1), z + rnd(-1,1), rnd(-3,3), rnd(-2,4), rnd(-3,3), rnd(1.2,2.4), rnd(.3,.6));
  if (u >= 1) meteorImpact(m);
}
function meteorImpact(m){
  const x = m.tx, y = m.ty, z = m.tz, st = surStyle();
  meteorKill(m);
  if (m.bolt) lightningStrike(x, y, z);
  // the blast: flash, sparks, dust, a crater that stays
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:flareTex, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true, opacity:1 })); s.position.set(x, y + 2.5, z); s.scale.setScalar(2); surGroup.add(s); FLASHES.push({ s, t:0 });
  for (let k=0;k<46;k++) sparks.emit(x, y + .5, z, rnd(-16,16), rnd(4,18), rnd(-16,16), rnd(.6,1.3), rnd(.5,1.1));
  for (let k=0;k<22;k++) emit(x + rnd(-2,2), y + .4, z + rnd(-2,2), rnd(-9,9), rnd(2,7), rnd(-9,9), rnd(2,3.6), rnd(.9,1.6));
  for (let k=0;k<10;k++) tankSmoke.emit({x:x + rnd(-2,2), y:y + 1, z:z + rnd(-2,2)}, {x:rnd(-4,4), y:rnd(2,6), z:rnd(-4,4)}, rnd(2.5,4), rnd(1.2,2));
  for (let k=0;k<12;k++){ const a = k/12*Math.PI*2; embers.emit(x, y + .6, z, Math.cos(a)*rnd(10,18), rnd(2,6), Math.sin(a)*rnd(10,18), rnd(1.5,2.5), rnd(.4,.8)); }
  if (CRATERS.length >= 28){ const o = CRATERS.shift(); surGroup.remove(o.disc); surGroup.remove(o.rim); o.disc.material.dispose(); o.rim.material.dispose(); }
  const disc = new THREE.Mesh(craterGeo, new THREE.MeshLambertMaterial({ map:scorchTex, color: world.dark ? 0x1a2024 : 0x2a2018, transparent:true, opacity:.85, depthWrite:false })), rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({ color:st.glow, transparent:true, opacity:.9, depthWrite:false }));
  // lie on the road itself: tilt the decal to the road's slope at the impact point (flat across, the road has no camber)
  const ti = m.ti != null ? m.ti : locate({x, z}).i, sl = world.elev ? slopeAtPos(x, z, ti) : 0, gy = world.elev ? trackY(x, z, ti) : y;
  const nrmV = new THREE.Vector3(-T[ti].x*sl, 1, -T[ti].z*sl).normalize(), qd = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrmV), spin = new THREE.Quaternion().setFromAxisAngle(nrmV, rnd(0, 6));
  if (world.id === 'forge'){ disc.material.dispose(); rim.material.dispose(); volcanoAftermath(x, gy, z, ti, m.lat || 0, nrmV);
    for (let k=0;k<26;k++) lavaFx.emit(x, gy + .5, z, rnd(-9,9), rnd(6,16), rnd(-9,9), rnd(1,2), rnd(.6,1.1)); }
  else {
  disc.quaternion.copy(spin).multiply(qd); rim.quaternion.copy(qd);
  disc.position.set(x, gy, z).addScaledVector(nrmV, .06); rim.position.set(x, gy, z).addScaledVector(nrmV, .07);
  disc.material.polygonOffset = rim.material.polygonOffset = true; disc.material.polygonOffsetFactor = rim.material.polygonOffsetFactor = -2; disc.material.polygonOffsetUnits = rim.material.polygonOffsetUnits = -2;
  disc.renderOrder = rim.renderOrder = 2; surGroup.add(disc); surGroup.add(rim); CRATERS.push({ disc, rim }); }
  // who's under it
  const dp = Math.hypot(player.x - x, player.z - z), ek = earAt(x, z, 110); if (ek > 0){ thud(Math.min(1, 1.3*ek)); boom(Math.min(1, 1.2*ek)); if (state !== 'insp') addShake(Math.min(1, 1.1*ek)); }
  for (const c of cars){ if (c.air || c.finished) continue; const d = Math.hypot(c.x - x, c.z - z), hitR = 4.6 + c.prof.rad*.35;
    if (d < hitR){
      if (active(c,'shield') || active(c,'leap') || active(c,'flight')){ if (c.player) showToast(active(c,'flight') ? 'Flew clear!' : 'Shield held!', 800); continue; }
      if (active(c,'hook')){ c.vx *= .8; c.vz *= .8; burnCar(c, x, y + 1, z); if (c.player){ showToast('Hooked in — held the road!', 1000); addShake(.5); } continue; }
      c.stun = 1.3; c.vx *= .3; c.vz *= .3; const nx = (c.x - x)/(d||1), nz = (c.z - z)/(d||1); c.vx += nx*7; c.vz += nz*7; c.hop = .6; burnCar(c, x, y + 1, z);
      if (c.player){ showToast(st.name === 'LAVA BOMBS' ? 'Lava bomb hit!' : st.name === 'ICE FALL' ? 'Ice hit!' : 'Meteor hit!', 1100); addShake(1); c.drift = 0; c.driftHeld = false; }
      else if (dp < 60 && c.L) styleToast(c.L.name.replace(/^.*\. /,'') + ' got hit'); }
    else if (d < 11){ const nx = (c.x - x)/d, nz = (c.z - z)/d; c.vx += nx*5*(1 - d/11); c.vz += nz*5*(1 - d/11);
      if (c.player){ c.meter = Math.min(100, (c.meter||0) + 6); styleToast('Near miss'); } }
  }
}
function surpriseUpdate(dt){
  for (const f of FLASHES.slice()){ f.t += dt; const k = f.t/.45; f.s.scale.setScalar(2 + 26*Math.min(1, k*1.6)); f.s.material.opacity = Math.max(0, 1 - k); if (k >= 1){ surGroup.remove(f.s); f.s.material.dispose(); FLASHES.splice(FLASHES.indexOf(f), 1); } }
  for (const c of CRATERS) if (c.rim.material.opacity > 0) c.rim.material.opacity = Math.max(0, c.rim.material.opacity - dt*.25);
  for (const m of METEORS) if (m.live) stepMeteor(m, dt);
  embers.update(dt); flames.update(dt); flameCore.update(dt); volcanoDebrisUpdate(dt); boltsUpdate(dt);
  if (!surpriseOn) return;
  const L = SUR_LV[level] || SUR_LV.normal;
  if (!SUR.ev && state === 'race' && !player.finished && raceTime > SUR.next){
    SUR.ev = { t:0, warn:2.2, dur:6.5, spawnT:.2, n:0, total:L.n, dir:new THREE.Vector3(rnd(-.7,.7), 1, rnd(-.7,.7)).normalize() };
    SUR.n++; SUR.next = raceTime + rnd(L.gap[0], L.gap[1]); surpriseAnnounce(SUR.ev); }
  const ev = SUR.ev; if (!ev) return;
  ev.t += dt;
  // distant streaks across the sky the whole time the shower is on
  if (ev.t < ev.warn + ev.dur && Math.random() < dt*9){ const px = player.x + rnd(-420,420), pz = player.z + rnd(-420,420), py = (player.y||0) + rnd(90,230);
    embers.emit(px, py, pz, -ev.dir.x*rnd(60,110) + rnd(-10,10), -ev.dir.y*rnd(60,110), -ev.dir.z*rnd(60,110) + rnd(-10,10), rnd(3,6), rnd(.8,1.4)); }
  if (ev.t > ev.warn && ev.n < ev.total){ ev.spawnT -= dt; if (ev.spawnT <= 0){ spawnMeteor(ev); ev.n++; ev.spawnT = (ev.dur/ev.total)*rnd(.55,1.45); } }
  if (ev.n >= ev.total && !METEORS.some(m => m.live)) SUR.ev = null;
}
function setSurprise(on){ surpriseOn = on; try { localStorage.setItem('dustrunner-surprise', on ? 'on' : 'off'); } catch(e){}
  const b = $('surBtn'); if (b){ b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Surprises on' : 'Surprises off'; } }
function rumble(){ if (!actx || muted) return; const A = actx, t0 = A.currentTime, len = 2.4, buf = A.createBuffer(1, A.sampleRate*len|0, A.sampleRate), d = buf.getChannelData(0);
  for (let i=0;i<d.length;i++) d[i] = (Math.random()*2 - 1); const src = A.createBufferSource(); src.buffer = buf; const f = A.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(70, t0); f.frequency.linearRampToValueAtTime(140, t0 + len);
  const g = A.createGain(); g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(.22, t0 + .5); g.gain.setValueAtTime(.22, t0 + 1.6); g.gain.exponentialRampToValueAtTime(.0001, t0 + len);
  src.connect(f).connect(g).connect(sfxBus()); src.start(t0); src.stop(t0 + len); }
// a cone blowing: a thunderclap that arrives with the delay of distance, a long rolling rumble under it, and the ground quaking
function volcanoBlast(vol, dist){
  const k = clamp(1 - dist/1500, .3, 1), delay = Math.min(dist/340, 1.6);
  quakeDur = 3.2 + 1.6*k; setTimeout(() => { quakeAmp = Math.max(quakeT > 0 ? quakeAmp : 0, .35 + .55*k); quakeT = quakeDur; }, delay*1000*.6);   // the ground wave runs ahead of the sound
  volcanoThunder(k, delay);
}
function volcanoThunder(k, delay){ if (!actx || muted || k <= 0) return; const A = actx, t0 = A.currentTime + (delay || 0), out = sfxBus();
  const noise = (len, brown) => { const b = A.createBuffer(1, A.sampleRate*len|0, A.sampleRate), d = b.getChannelData(0); let last = 0;
    for (let i=0;i<d.length;i++){ const w = Math.random()*2 - 1; if (brown){ last = (last + .02*w)/1.02; d[i] = last*3.5; } else d[i] = w; } return b; };
  // the crack: a hard broadband burst
  { const src = A.createBufferSource(); src.buffer = noise(.5, false); const f = A.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t0); f.frequency.exponentialRampToValueAtTime(200, t0 + .45);
    const g = A.createGain(); g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(.9*k, t0 + .015); g.gain.exponentialRampToValueAtTime(.0001, t0 + .5); src.connect(f).connect(g).connect(out); src.start(t0); src.stop(t0 + .55); }
  // the roll: deep brown noise rumbling on for seconds, swelling and fading in waves
  { const len = 5.5, src = A.createBufferSource(); src.buffer = noise(len, true); const f = A.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(320, t0); f.frequency.exponentialRampToValueAtTime(70, t0 + len);
    const g = A.createGain(); g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(1.1*k, t0 + .12);
    for (let i=1;i<=6;i++) g.gain.exponentialRampToValueAtTime((i % 2 ? .45 : .9)*k*(1 - i/7) + .001, t0 + .12 + i*.75);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + len); src.connect(f).connect(g).connect(out); src.start(t0); src.stop(t0 + len); }
  // the boom you feel: a sub drop
  { const o = A.createOscillator(), g = A.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(62, t0); o.frequency.exponentialRampToValueAtTime(26, t0 + 2.2);
    g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(.55*k, t0 + .05); g.gain.exponentialRampToValueAtTime(.0001, t0 + 2.4); o.connect(g).connect(out); o.start(t0); o.stop(t0 + 2.5); }
}
function boom(k){ if (!actx || muted || k <= 0) return; const A = actx, t0 = A.currentTime, len = .7, buf = A.createBuffer(1, A.sampleRate*len|0, A.sampleRate), d = buf.getChannelData(0);
  for (let i=0;i<d.length;i++) d[i] = (Math.random()*2 - 1)*(1 - i/d.length); const src = A.createBufferSource(); src.buffer = buf; const f = A.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t0); f.frequency.exponentialRampToValueAtTime(120, t0 + len);
  const g = A.createGain(); g.gain.setValueAtTime(.5*k, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + len); src.connect(f).connect(g).connect(sfxBus()); src.start(t0); src.stop(t0 + len); }
setSurprise(surpriseOn);

/* ---------- scorch marks: a meteor that hits a vehicle leaves a burn on the paint ----------
   Done in the paint itself: every material on the car gets a small shader patch that darkens the surface
   around up to 6 burn points (in the car's own space, so the marks ride with the body), with a sooty
   noisy edge, flat roughness, and an ember glow that cools over a few seconds. Nothing is added to
   the geometry, so it works on the box-built Sirocco, the GLB rigs and a loaded custom model alike. */
const BURN_MAX = 6;
const BURN_GLSL_DECL = `
uniform vec4 uBurn[6]; uniform float uBurnHeat[6]; uniform float uBurnT; varying vec3 vBurnPos;
float bHash(vec3 p){ p = fract(p*0.3183099 + vec3(0.1, 0.17, 0.23)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }
float bNoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(bHash(i), bHash(i + vec3(1,0,0)), f.x), mix(bHash(i + vec3(0,1,0)), bHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(bHash(i + vec3(0,0,1)), bHash(i + vec3(1,0,1)), f.x), mix(bHash(i + vec3(0,1,1)), bHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float bFbm(vec3 p){ return 0.55*bNoise(p) + 0.3*bNoise(p*2.1 + 5.0) + 0.15*bNoise(p*4.3 + 9.0); }
void burnMasks(out float soot, out float ember){ soot = 0.0; ember = 0.0;
  for (int i=0;i<6;i++){ if (uBurn[i].w <= 0.0) continue; vec3 q = vBurnPos - uBurn[i].xyz; float d = length(q)/uBurn[i].w; float n = bFbm(vBurnPos*2.2 + float(i)*7.1);
    float m = 1.0 - smoothstep(0.38, 1.0, d + (n - 0.5)*0.9); soot = max(soot, m);
    float c = 1.0 - smoothstep(0.05, 0.6, d + (n - 0.5)*0.6); float veins = smoothstep(0.46, 0.56, bFbm(vBurnPos*4.0 + float(i)*2.3 + 11.0)); ember = max(ember, c*(0.15 + 0.85*veins)*uBurnHeat[i]); } }`;
// halftone printed on the surfaces themselves (object space, so it rides with whatever it's on — no screen-fixed dot sheet)
const INK_GLSL_DECL = `
varying vec3 vInkPos;
float inkDots(vec3 lit){ float lum = dot(lit, vec3(0.299, 0.587, 0.114)); float shade = 1.0 - smoothstep(0.04, 0.42, lum);
  vec3 q = vInkPos*2.9; vec3 cell = fract(q) - 0.5; float dd = length(cell);
  float fw = fwidth(q.x) + fwidth(q.y) + fwidth(q.z); float fade = 1.0 - smoothstep(0.35, 0.8, fw);      // cells smaller than a few pixels dissolve instead of shimmering
  return smoothstep(0.45*shade + 0.03, 0.45*shade - 0.07, dd)*fade; }`;
function inkPatch(mat, c){
  if (!mat || mat.isShaderMaterial || mat.isSpriteMaterial || mat.isPointsMaterial || mat.isMeshBasicMaterial || mat.isLineBasicMaterial || mat.transparent) return;
  const owner = c || 'world'; if (mat.userData.inkOwner === owner) return;
  if (mat.userData.inkOwner && mat.userData.inkOwner !== 'world') return;   // already wired to another car (shared material): leave it
  mat.userData.inkOwner = owner; const burn = !!c; if (burn) burnUniforms(c);
  mat.onBeforeCompile = (sh) => {
    if (burn){ sh.uniforms.uBurn = c.burnU.uBurn; sh.uniforms.uBurnHeat = c.burnU.uBurnHeat; sh.uniforms.uBurnT = c.burnU.uBurnT; sh.uniforms.uCarInv = c.burnU.uCarInv; }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vInkPos;' + (burn ? ' uniform mat4 uCarInv; varying vec3 vBurnPos;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vInkPos = transformed;\n#ifdef USE_INSTANCING\n vInkPos = (instanceMatrix * vec4(transformed, 1.0)).xyz;\n#endif\n' + (burn ? ' vec4 wp = modelMatrix * vec4(transformed, 1.0); vBurnPos = (uCarInv * wp).xyz;' : '') + ' }');
    let f = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + INK_GLSL_DECL + (burn ? BURN_GLSL_DECL : ''));
    if (burn){
      f = f.replace('#include <map_fragment>', '#include <map_fragment>\nfloat bSoot, bEmber; burnMasks(bSoot, bEmber);\n{ vec3 ash = vec3(0.07, 0.06, 0.055); vec3 soot = vec3(0.025, 0.02, 0.02); diffuseColor.rgb = mix(diffuseColor.rgb, mix(ash, soot, bSoot), bSoot*0.93); }');
      if (f.includes('#include <roughnessmap_fragment>')) f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.97, bSoot);');
      if (f.includes('#include <metalnessmap_fragment>')) f = f.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - bSoot*0.85;');
      f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float fl = 0.72 + 0.28*sin(uBurnT*11.0 + vBurnPos.x*23.0 + vBurnPos.z*17.0); totalEmissiveRadiance += vec3(1.0, 0.36, 0.06) * bEmber * fl * 1.6; }');
    }
    f = f.replace('#include <output_fragment>', '{ float dk = inkDots(outgoingLight)*uInkAmt; outgoingLight *= 1.0 - dk*0.3; }\n#include <output_fragment>');
    sh.uniforms.uInkAmt = inkAmtU; sh.fragmentShader = f;
    if (mat.userData.patchShader) mat.userData.patchShader(sh);   // a rig's own extra (e.g. the Cicada's circuit signals)
  };
  mat.extensions = Object.assign(mat.extensions || {}, { derivatives:true });
  mat.customProgramCacheKey = () => (burn ? 'inkburn1' : 'ink1') + (mat.userData.patchKey || '');
  mat.needsUpdate = true;
}
const inkAmtU = { value: 1 };
function carOf(o){ while (o){ if (o.userData && o.userData.car) return o.userData.car; o = o.parent; } return null; }
function inkPatchTree(root){ root.traverse(o => { if (!o.isMesh || !o.material) return; const c = carOf(o); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => inkPatch(m, c && !c.ghost ? c : null)); }); }
const burnPatch = (mat, c) => inkPatch(mat, c);
function burnUniforms(c){
  if (c.burnU) return c.burnU;
  const arr = []; for (let i=0;i<BURN_MAX;i++) arr.push(new THREE.Vector4(0,0,0,0));
  return c.burnU = { uBurn:{ value: arr }, uBurnHeat:{ value: new Float32Array(BURN_MAX) }, uBurnT:{ value: 0 }, uCarInv:{ value: new THREE.Matrix4() }, n: 0, smokeT: 0, fireT: 0, spots: [] };
}
function burnClear(c){ if (!c.burnU) return; for (const v of c.burnU.uBurn.value) v.set(0,0,0,0); c.burnU.uBurnHeat.value.fill(0); c.burnU.n = 0; c.burnU.smokeT = 0; c.burnU.fireT = 0; c.burnU.spots.length = 0; }
// scorch the car from an impact at world point (x,y,z): a big mark on the side facing it, up high, plus a smaller splash on the roof
function burnCar(c, x, y, z){
  const u = burnUniforms(c), ext = extentsOf(c);
  c.body.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(c.body.matrixWorld).invert();
  const lp = new THREE.Vector3(x, y, z).applyMatrix4(inv);                    // impact in car space
  const hw = Math.max(1.2, ext.halfW || 1.6), top = Math.min(Math.max(1.6, ext.top), 3.0);   // tall aerials and heads don't count: the marks sit on the body
  const side = Math.abs(lp.x) > Math.abs(lp.z) * (hw/Math.max(ext.nose, 1));  // which face is nearest the blast
  const add = (px, py, pz, r) => { const i = u.n % BURN_MAX; u.uBurn.value[i].set(px, py, pz, r); u.uBurnHeat.value[i] = 1; u.spots.push({ i, p:new THREE.Vector3(px,py,pz), t:0 }); u.n++; };
  const big = clamp(0.5*(hw + top), 1.3, 2.3);
  if (side) add(Math.sign(lp.x)*hw*0.95, top*0.62, clamp(lp.z, ext.tail*0.8, ext.nose*0.8), big);
  else add(clamp(lp.x, -hw*0.8, hw*0.8), top*0.62, Math.sign(lp.z)*(lp.z > 0 ? ext.nose : -ext.tail)*0.95, big);
  add(rnd(-hw*0.5, hw*0.5), top, rnd(ext.tail*0.6, ext.nose*0.6), big*0.62);
  // patch every lit material the car is currently wearing
  c.body.traverse(o => { if (!o.isMesh || !o.visible) return; const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach(m => burnPatch(m, c)); });
  u.smokeT = 8; u.fireT = Math.max(u.fireT||0, 5.2);
}
const flames = makeFx(0xff5a14, 420, false, -7);                     // fire: solid orange tongues that rise (negative gravity) and die fast — solid, so they read in daylight too
const flameCore = makeFx(0xffd27a, 220, true, -9);                  // and a hot additive core
function burnUpdate(c, dt){
  const u = c.burnU; if (!u || !u.n) return;
  if (u.fireT > 0){ u.fireT -= dt; const k = Math.min(1, u.fireT/3.5);                       // flames: fierce for a second, then guttering out
    const rate = 110*k + 8; let n = rate*dt + (Math.random() < (rate*dt % 1) ? 1 : 0); c.body.updateMatrixWorld();
    for (let j=0;j<n;j++){ const sp = u.spots[Math.random()*u.spots.length|0]; if (!sp) break;
      const r = u.uBurn.value[sp.i].w*0.6, wp = sp.p.clone().add(new THREE.Vector3(rnd(-r,r), rnd(-.2,.3), rnd(-r,r))).applyMatrix4(c.body.matrixWorld);
      flames.emit(wp.x, wp.y, wp.z, c.vx*.6 + rnd(-1,1), rnd(2.5,5.5), c.vz*.6 + rnd(-1,1), rnd(.55,1.3)*(.6 + .6*k), rnd(.22,.45));
      if (Math.random() < .6) flameCore.emit(wp.x, wp.y + .15, wp.z, c.vx*.65 + rnd(-.5,.5), rnd(3,6), c.vz*.65 + rnd(-.5,.5), rnd(.35,.8)*(.5 + .7*k), rnd(.12,.3));
      if (Math.random() < .25*k) sparks.emit(wp.x, wp.y, wp.z, c.vx*.5 + rnd(-4,4), rnd(3,8), c.vz*.5 + rnd(-4,4), rnd(.25,.45), rnd(.4,.9)); }
    if (c.player && u.fireT > 0 && Math.random() < dt*.5) addShake(.08); }
  c.body.updateMatrixWorld(); u.uCarInv.value.copy(c.body.matrixWorld).invert(); u.uBurnT.value += dt;
  const heat = u.uBurnHeat.value; for (let i=0;i<BURN_MAX;i++) if (heat[i] > 0) heat[i] = Math.max(0, heat[i] - dt*0.16);
  if (u.smokeT > 0){ u.smokeT -= dt; if (Math.random() < dt*14*Math.min(1, u.smokeT/4)){ const s = u.spots[Math.random()*u.spots.length|0]; if (s){ const wp = s.p.clone().applyMatrix4(c.body.matrixWorld);
    tankSmoke.emit({x:wp.x + rnd(-.3,.3), y:wp.y + .2, z:wp.z + rnd(-.3,.3)}, {x:c.vx*.25 + rnd(-.6,.6), y:rnd(1.5,3), z:c.vz*.25 + rnd(-.6,.6)}, rnd(1,1.8), rnd(.9,1.5)); } } }
}

/* ---------- Fennec rally buggy rig: a multi-part GLB with named nodes (body, hub_fl/fr → wheel_fl/fr, wheel_rl/rr, headlight, taillight, rooflamp) ---------- */
const flameTongueTex = (() => { const W = 128, Hh = 48, c = document.createElement('canvas'); c.width = W; c.height = Hh; const x = c.getContext('2d'), im = x.createImageData(W, Hh), d = im.data;
  for (let j=0;j<Hh;j++) for (let i=0;i<W;i++){ const u = i/(W-1), v = (j/(Hh-1))*2 - 1, half = .3 + .7*Math.sin(Math.min(1, u*1.25)*Math.PI*.5)*(1 - u*.6);   // bulges just past the pipe, tapers to the tip
      const inside = Math.max(0, 1 - (v/half)*(v/half)), hot = inside*(1 - u), a = Math.pow(inside, .8)*Math.pow(1 - u, .9), k = (j*W + i)*4;
      // solid paint, not light: pale yellow core → orange → red-orange rim, so it reads against bright sand as well as a dark tunnel
      d[k] = 235 + 20*hot; d[k+1] = 60 + 140*Math.pow(hot, .7) + 50*hot*hot; d[k+2] = 10 + 170*hot*hot*hot; d[k+3] = Math.min(255, a*255); }
  x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; })();
const flameDiscTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,248,200,1)'); g.addColorStop(.35,'rgba(255,170,40,.95)'); g.addColorStop(.7,'rgba(240,80,15,.5)'); g.addColorStop(1,'rgba(220,50,10,0)'); x.fillStyle = g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); })();
const tongueGeo = (() => { const g = new THREE.PlaneGeometry(1, 1); g.rotateY(-Math.PI/2); g.translate(0, 0, -.5); return g; })();   // runs from z=0 (the pipe) to z=-1 (the tip), width across y
function buildRallyRig(src, c){
  const root = src.scene.clone(true), parts = {};
  root.traverse(o => { if (o.name) parts[o.name] = o; if (o.isMesh){ o.castShadow = true; o.receiveShadow = false; o.material = o.material.clone(); } });
  // the orange bodywork is the paint; rivals wear their team colour on it
  const paint = []; root.traverse(o => { if (o.isMesh && o.material.name === 'rodin_material_12') paint.push(o.material); });
  if (c && !c.player) paint.forEach(m => m.color.copy(new THREE.Color(0xffffff).lerp(new THREE.Color(c.L.body), .7)));
  const lensOn = (m, col) => { m.emissive = new THREE.Color(col); m.emissiveIntensity = 0; };
  if (parts.headlight) lensOn(parts.headlight.material, 0xfff2c0); if (parts.taillight) lensOn(parts.taillight.material, 0xff2a1a); if (parts.rooflamp) lensOn(parts.rooflamp.material, 0xfff0b0);
  const wheels = ['wheel_fl','wheel_fr','wheel_rl','wheel_rr'].map(n => parts[n]).filter(Boolean), hubs = ['hub_fl','hub_fr'].map(n => parts[n]).filter(Boolean);
  // the two big exhausts out the back spit fire: a steady afterfire on the throttle, a blaze under boost or Groundhook, a backfire bang on lift-off
  const TIPS = [new THREE.Vector3(-.745, 1.5, -2.92), new THREE.Vector3(.745, 1.5, -2.92)];
  const glow = TIPS.map(t => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:lampTex, color:0xffa040, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true, opacity:0 })); sp.position.copy(t).add(new THREE.Vector3(0,0,-.1)); sp.scale.setScalar(1.1); root.add(sp); return sp; });
  const disc = TIPS.map(t => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:flameDiscTex, depthWrite:false, transparent:true, opacity:0 })); sp.position.copy(t).add(new THREE.Vector3(0,0,-.22)); sp.scale.setScalar(.6); root.add(sp); return sp; });   // the burning mouth, seen from behind
  // a crossed pair of flame tongues trails out of each pipe; its length and brightness follow the throttle
  const tongueM = new THREE.MeshBasicMaterial({ map:flameTongueTex, transparent:true, opacity:0, depthWrite:false, side:THREE.DoubleSide, fog:false }); tongueM.userData.fx = true;
  const tongues = TIPS.map(t => { const g = new THREE.Group(); g.position.copy(t); for (let k=0;k<2;k++){ const m = new THREE.Mesh(tongueGeo, tongueM); m.rotation.z = k*Math.PI/2; g.add(m); } root.add(g); return g; });
  // Groundhook: a cyan anchor ring under the car, claw sparks off all four wheels, the body squats
  const ringM = new THREE.MeshBasicMaterial({ color:0x3fe8de, transparent:true, opacity:0, depthWrite:false, side:THREE.DoubleSide, fog:false }); ringM.userData.fx = true;
  const hookRing = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.55, 48), ringM); hookRing.rotation.x = -Math.PI/2; hookRing.position.y = .14; hookRing.visible = false; root.add(hookRing);
  const hookTicks = new THREE.Mesh(new THREE.RingGeometry(2.7, 3.1, 8, 1, 0, Math.PI*2), ringM); hookTicks.rotation.x = -Math.PI/2; hookTicks.position.y = .14; hookTicks.visible = false; root.add(hookTicks);
  const WHEELS = [[-1.2, 0, 1.3], [1.2, 0, 1.3], [-1.2, 0, -1.25], [1.2, 0, -1.25]];
  const st = { ex:0, wasThr:false, bang:0, hookK:0 }, tmp = new THREE.Vector3(), back = new THREE.Vector3();
  return { root, parts, paint,
    lamps: { head:[[-.47, 1.05, 2.1], [.47, 1.05, 2.1]], tail:[[-.64, 1.06, -2.0], [.64, 1.06, -2.0]], headSize:.5, tailSize:.5 },   // the square headlight lenses; the rear lights sit just under the pipes, so their glow hangs a touch low to clear them from the chase cam
    update(c, dt, mode){
      for (const w of wheels) w.rotation.x = c.spinA;
      for (const h of hubs) h.rotation.y = -c.steerV*.42;
      if (c.ghost) return;                                                   // the hologram keeps its wheels turning and nothing else
      // lamps: lenses glow at night, the roof bar blazes under Groundhook
      const nk = typeof nightK === 'number' ? nightK : 0, hook = active(c, 'hook') ? 1 : 0;
      if (parts.headlight) parts.headlight.material.emissiveIntensity = nk*2.4 + hook*.4;
      if (parts.taillight) parts.taillight.material.emissiveIntensity = nk*2.6 + (c.brk ? 1.2 : 0);
      if (parts.rooflamp) parts.rooflamp.material.emissiveIntensity = nk*1.2 + hook*(2.5 + Math.sin(clockT*30)*1.5);
      // Groundhook fx
      st.hookK += (hook - st.hookK)*Math.min(1, dt*8);
      root.position.y = -.12*st.hookK;
      hookRing.visible = hookTicks.visible = st.hookK > .02;
      if (hookRing.visible){ const pulse = .75 + .25*Math.sin(clockT*14); ringM.opacity = .6*st.hookK*pulse; hookRing.rotation.z = clockT*2.2; hookTicks.rotation.z = -clockT*1.4; const sc = 1 + .08*Math.sin(clockT*9); hookRing.scale.set(sc, sc, 1);
        const spd = Math.abs(c.f || 0); if (spd > 4 && mode !== 'idle'){ root.updateWorldMatrix(true, false); const bk = new THREE.Vector3(-Math.sin(c.h || 0), 0, -Math.cos(c.h || 0));
          for (const w of WHEELS){ if (Math.random() > .55*st.hookK) continue; tmp.set(w[0] + rnd(-.15,.15), .12, w[2] + rnd(-.2,.2)); root.localToWorld(tmp);
            const vx = (c.vx || 0)*.3 + bk.x*rnd(4,9) + rnd(-2,2), vz = (c.vz || 0)*.3 + bk.z*rnd(4,9) + rnd(-2,2);
            (Math.random() < .5 ? sparks : glitter).emit(tmp.x, tmp.y, tmp.z, vx, rnd(1.5,4.5), vz, rnd(.25,.45), rnd(.25,.5)); } } }
      // exhaust fire
      const sp = Math.abs(c.f || 0), big = (c.boost > 0 || hook) ? 1 : 0;
      const want = mode === 'idle' ? .16 : (c.thr ? .38 + .62*Math.min(1, sp/MAXS) : 0) + big*1.1;
      st.ex += (want - st.ex)*Math.min(1, dt*(want > st.ex ? 9 : 4));
      if (st.wasThr && !c.thr && sp > 14 && mode !== 'idle') st.bang = 1.25; st.wasThr = !!c.thr;           // lift-off: unburnt fuel bangs out of the pipes
      const bang = st.bang > 0 ? st.bang : 0; st.bang = Math.max(0, st.bang - dt*6);
      const ex = Math.min(2.2, st.ex + bang);
      root.updateWorldMatrix(true, false); back.set(-Math.sin(c.h || 0), 0, -Math.cos(c.h || 0));
      const flick = .75 + .25*Math.sin(clockT*47 + (c.player ? 0 : 2)) + .12*Math.sin(clockT*131);
      for (let i=0;i<2;i++){ glow[i].material.opacity = Math.min(.45, ex*.14 + bang*.3)*flick; glow[i].scale.setScalar(.3 + ex*.2);
        disc[i].material.opacity = Math.min(1, ex*1.1)*(.8 + .2*flick); disc[i].scale.setScalar((.2 + .15*ex)*(.9 + .2*flick));
        tongues[i].scale.set(.3 + .22*ex, .3 + .22*ex, (.3 + 1.0*ex + bang*1.2)*(.8 + .3*flick)); tongues[i].rotation.z = clockT*(i ? -9 : 11); }
      tongueM.opacity = Math.min(1, .2 + ex*.6)*(.85 + .15*flick); tongueM.color.setHex(ex > 1.2 ? 0xb8d8ff : 0xffffff);
      if (ex < .05) return;
      const rate = 32*ex + (bang > 0 ? 160*bang : 0); let n = rate*dt; n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
      for (let j=0;j<n;j++){ const t = TIPS[j & 1]; tmp.copy(t).addScalar(0).add(new THREE.Vector3(rnd(-.07,.07), rnd(-.07,.07), rnd(-.1,.05))); root.localToWorld(tmp);
        const push = 2.4 + 3.2*ex + bang*4, vx = (c.vx || 0)*.82 + back.x*push + rnd(-.7,.7), vz = (c.vz || 0)*.82 + back.z*push + rnd(-.7,.7), vy = rnd(-.2,1.2) + bang*1.5;
        flames.emit(tmp.x, tmp.y, tmp.z, vx, vy, vz, rnd(.16,.3)*(.75 + .55*ex), rnd(.08,.16)*(1 + bang*.6));
        if (Math.random() < .6) flameCore.emit(tmp.x, tmp.y, tmp.z, vx, vy + .3, vz, rnd(.14,.26)*(.7 + .6*ex), rnd(.06,.13)*(1 + bang*.5));
        if (bang > 0 && Math.random() < .35) sparks.emit(tmp.x, tmp.y, tmp.z, vx + rnd(-3,3), vy + rnd(1,4), vz + rnd(-3,3), rnd(.2,.35), rnd(.3,.6)); }
    } };
}

/* ---------- night lights: every vehicle carries headlamps, a spot on the roof and tail lights; they come on in the dark ----------
   Cheap arcade lights: additive flare sprites on the lamps, a pair of translucent beam cones and a pool of light on the road ahead,
   plus one real SpotLight for the player's own car. Fades in on dark worlds and inside tunnels, where the world light is pulled down. */
let nightK = 0, tunnelK = 0, nightLit = false; const NEON_SKY = new THREE.Color(0x62d8ff), NEON_GROUND = new THREE.Color(0xd63aa8);
const lampTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.18,'rgba(255,250,230,.95)'); g.addColorStop(.45,'rgba(255,220,150,.35)'); g.addColorStop(1,'rgba(255,200,120,0)'); x.fillStyle = g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); })();
const poolTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,240,200,.9)'); g.addColorStop(.5,'rgba(255,230,170,.35)'); g.addColorStop(1,'rgba(255,220,150,0)'); x.fillStyle = g; x.fillRect(0,0,128,128); return new THREE.CanvasTexture(c); })();
const LAMP_CACHE = {};
function probeLamps(c){
  // read the lamp positions off the model itself: sample the visible bodywork in body space, then sit each flare on the front (or rear) face
  // at lamp height, a little inboard of that face's own width — so it hugs a narrow hull instead of hovering beside the tracks
  c.body.updateWorldMatrix(true, true); const inv = new THREE.Matrix4().copy(c.body.matrixWorld).invert(), rel = new THREE.Matrix4(), v = new THREE.Vector3(), pts = [];
  c.body.traverse(o => { if (!o.isMesh || !o.visible || o.isSprite || !o.geometry || !o.geometry.attributes.position) return;
    if (o.material && (o.material.transparent || (o.material.userData && o.material.userData.fx))) return;
    let q = o; while (q && q !== c.body){ if (!q.visible) return; q = q.parent; }
    rel.copy(inv).multiply(o.matrixWorld); const a = o.geometry.attributes.position, step = Math.max(1, Math.floor(a.count/1500));
    for (let i=0;i<a.count;i+=step){ v.fromBufferAttribute(a, i).applyMatrix4(rel); if (isFinite(v.x) && isFinite(v.y) && isFinite(v.z)) pts.push(v.x, v.y, v.z); } });
  if (pts.length < 30) return null;
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z0=1e9,z1=-1e9; for (let i=0;i<pts.length;i+=3){ const x=pts[i],y=pts[i+1],z=pts[i+2]; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; if(z<z0)z0=z; if(z>z1)z1=z; }
  const H = y1 - y0, Lz = z1 - z0;
  const face = (front, yk) => {
    const yl = y0 + H*yk, band = Math.max(.25, H*.12), q = Lz*.22;                       // the lamp height, and how deep into the vehicle the face may sit
    let hw = 0, n = 0; for (let i=0;i<pts.length;i+=3){ const y=pts[i+1], z=pts[i+2]; if (Math.abs(y - yl) > band) continue; if (front ? z < z1 - q : z > z0 + q) continue; hw = Math.max(hw, Math.abs(pts[i])); n++; }
    if (!n) hw = (x1 - x0)/2;
    const xs = Math.max(.35, hw*.62), out = [];
    for (const sd of [-1,1]){ let zb = front ? -1e9 : 1e9, yb = yl, m = 0;
      for (let i=0;i<pts.length;i+=3){ const x=pts[i], y=pts[i+1], z=pts[i+2]; if (Math.abs(x - xs*sd) > Math.max(.3, hw*.22) || Math.abs(y - yl) > band) continue; if (front ? z > zb : z < zb){ zb = z; yb = y; } m++; }
      if (!m) zb = front ? z1 : z0;
      out.push([xs*sd, yb, zb + (front ? .09 : -.09)]); }
    const ym = (out[0][1] + out[1][1])/2, zm = (out[0][2] + out[1][2])/2; out[0][1] = out[1][1] = ym; out[0][2] = out[1][2] = zm;   // a matched pair
    return out; };
  return { head:face(true, .42), tail:face(false, .46), headSize:Math.min(.75, .35 + H*.1), tailSize:Math.min(.6, .3 + H*.08) };
}
function lampSpec(c){
  // where this vehicle's lamps actually sit, in body space: a rig can say exactly (the Fennec does); otherwise they are read off the model
  const r = c.rigs && c.rigs[c.kind]; if (r && r.rig && r.rig.lamps) return r.rig.lamps;
  const key = c.kind + (c.player && customCar ? ':custom' : ''); if (LAMP_CACHE[key]) return LAMP_CACHE[key];
  let spec = null; try { spec = probeLamps(c); } catch(_){}
  if (!spec){ const ext = extentsOf(c), hw = Math.max(.7, ext.halfW*.6), hy = Math.max(.55, Math.min(ext.top*.4, 1.3)), ty = Math.max(.55, Math.min(ext.top*.45, 1.5));
    spec = { head:[[-hw, hy, ext.nose + .1], [hw, hy, ext.nose + .1]], tail:[[-hw, ty, ext.tail - .05], [hw, ty, ext.tail - .05]], headSize:.7, tailSize:.55 }; }
  if (!(c.player && customCar)) LAMP_CACHE[key] = spec; return spec;
}
function lightsFor(c){
  if (c._lights && c._lightsKind === c.kind) return c._lights;
  if (c._lights){ c.body.remove(c._lights.g); }
  const ext = extentsOf(c), spec = lampSpec(c), g = new THREE.Group();
  // small additive flares sitting right on the lenses: a lamp seen head-on, not a ball of light next to the car
  const mk = (col, size, p, op) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:lampTex, color:col, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:true, transparent:true, opacity:op })); s.position.set(p[0], p[1], p[2]); s.scale.setScalar(size); g.add(s); return s; };
  const head = spec.head.map(p => mk(0xfff4d0, spec.headSize, p, 1));
  const tail = spec.tail.map(p => mk(0xff3020, spec.tailSize, p, .9));
  // a flat pool of light can only sit on flat road: anything long dips under the next rise and gets clipped, so the player's road is lit by a real spotlight
  // (it follows the surface) and rivals get a short, low pool right at the nose where the road is still level with them
  let pool = null; if (!c.player){ pool = new THREE.Mesh(new THREE.PlaneGeometry(8, 13), new THREE.MeshBasicMaterial({ map:poolTex, color:0xfff0c8, transparent:true, opacity:.3, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
    pool.rotation.x = -Math.PI/2; pool.position.set(0, .3, ext.nose + 6.5); pool.renderOrder = 4; g.add(pool); }
  const tailPool = new THREE.Mesh(new THREE.PlaneGeometry(5, 6), new THREE.MeshBasicMaterial({ map:poolTex, color:0xff2a18, transparent:true, opacity:.3, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
  tailPool.rotation.x = -Math.PI/2; tailPool.position.set(0, .28, ext.tail - 2.2); tailPool.renderOrder = 4; g.add(tailPool);
  let spotLight = null, tailLight = null; if (c.player){ const hp = spec.head[0], tp = spec.tail[0]; spotLight = new THREE.SpotLight(0xfff0d0, 0, 85, .5, .7, 1.0); spotLight.position.set(0, hp[1] + .25, hp[2]); spotLight.target.position.set(0, -1.6, hp[2] + 30); g.add(spotLight); g.add(spotLight.target);
    tailLight = new THREE.PointLight(0xff3a22, 0, 7, 2); tailLight.position.set(0, tp[1] + .2, tp[2] - .3); g.add(tailLight); }
  // in an unlit tunnel the lamps throw visible beams: a soft cone of light in the dust ahead, fading out down the bore
  let beam = null; if (c.player){ const hp = spec.head[0], bg = new THREE.CylinderGeometry(5.5, .45, 30, 28, 1, true); bg.translate(0, 15, 0); bg.rotateX(Math.PI/2);
    beam = new THREE.Mesh(bg, new THREE.ShaderMaterial({ uniforms:{ uK:{value:0} }, transparent:true, depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, fog:false,
      vertexShader:'varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ vZ = position.z/30.; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader:'uniform float uK; varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ float a = pow(1. - vZ, 1.8)*smoothstep(0., .1, vZ)*uK; gl_FragColor = vec4(vec3(1., .94, .8)*a, a); }' }));
    beam.position.set(0, hp[1] + .1, hp[2] + .2); beam.rotation.x = .07; beam.renderOrder = 5; beam.visible = false; beam.frustumCulled = false; g.add(beam);
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(11, 30), new THREE.MeshBasicMaterial({ map:poolTex, color:0xfff0c8, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
    carpet.rotation.x = -Math.PI/2; carpet.position.set(0, .3, ext.nose + 15); carpet.renderOrder = 4; carpet.visible = false; g.add(carpet); beam.userData.carpet = carpet; }   // a red wash over the player's own tail so the lamps read from behind
  g.visible = false; c.body.add(g);
  c._lightsKind = c.kind; return c._lights = { g, head, tail, pool, tailPool, spotLight, tailLight, beam, spec };
}
// how much solid surface is under a car's light pools: 1 on the road, fading to 0 as it leaves the ground (jumps, Updraft, gaps)
// or slides off the edge of a raised road over the void — a pool of light only shows where there is something to land on
// lay a flat light pool on the road itself: take its anchor point on the car, drop it onto the road surface under that point and tilt it
// to the road's slope, so a pool never sinks into a rise or hangs over a dip (it used to ride flat with the car and got cut on slopes)
const _gv = new THREE.Vector3(), _gq = new THREE.Quaternion(), _gq2 = new THREE.Quaternion(), _gn = new THREE.Vector3(), _gm = new THREE.Matrix4(), _gpi = new THREE.Matrix4(), _gs = new THREE.Vector3(1,1,1), _gx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI/2), _gy = new THREE.Vector3(0,1,0);
function glueToRoad(m, c){
  const par = m.parent; if (!par) return; if (!m.userData.anchor){ m.userData.anchor = m.position.clone(); m.userData.s0 = m.scale.clone(); }
  par.updateWorldMatrix(true, false); _gv.copy(m.userData.anchor).applyMatrix4(par.matrixWorld); par.matrixWorld.decompose(_gn, _gq, _gs); _gs.multiply(m.userData.s0);
  const i = c.idx || 0, y = world.elev ? trackY(_gv.x, _gv.z, i) : (H[i] || 0), sl = world.elev ? slopeAtPos(_gv.x, _gv.z, i) : 0;
  _gn.set(-T[i].x*sl, 1, -T[i].z*sl).normalize();
  _gq.setFromUnitVectors(_gy, _gn); _gq2.setFromAxisAngle(_gy, c.h || 0); _gq.multiply(_gq2).multiply(_gx);
  _gv.y = y + .07; _gm.compose(_gv, _gq, _gs); _gpi.copy(par.matrixWorld).invert(); _gm.premultiply(_gpi); _gm.decompose(m.position, m.quaternion, m.scale);
}
function poolGround(c){
  if (GAP[c.idx]) return 0;
  const surf = world.elev ? trackY(c.x, c.z, c.idx) : (H[c.idx] || 0), up = Math.max(0, (c.y || 0) - surf) + (c.airT > 0 ? 2 : 0);
  let k = clamp(1 - up/1.4, 0, 1);
  if (world.elev){ const lat = Math.abs(c.lat || 0); k *= clamp((W/2 + 2 - lat)/2.5, 0, 1); }
  return k;
}
function lightsUpdate(c, dt){
  const k = Math.min(1.5, nightK + tunnelK*(.5 + .5*nightK)); if (k < .02 && !(c._lights && c._lights.g.visible)) return;   // dark worlds, and any tunnel
  const L = lightsFor(c); L.g.visible = k > .02; if (!L.g.visible) return;
  const brake = c.brk && Math.abs(c.f) > 3 ? 1 : 0, bloom = 1 + .35*tunnelK;
  for (const s of L.head){ s.material.opacity = Math.min(1, k); s.scale.setScalar(L.spec.headSize*bloom); }
  for (const s of L.tail){ s.material.opacity = Math.min(1, k*(.8 + .2*brake)); s.scale.setScalar(L.spec.tailSize*(bloom + brake*.5)); }
  const gk = poolGround(c); if (L.pool){ L.pool.material.opacity = Math.min(.5, .22*k*(1 + .6*tunnelK))*gk; L.pool.visible = gk > .01; } L.tailPool.material.opacity = Math.min(.5, .16*k*(1 + .6*tunnelK)*(1 + brake))*gk; L.tailPool.visible = gk > .01; if (gk > .01){ if (L.pool) glueToRoad(L.pool, c); glueToRoad(L.tailPool, c); }
  const vk = tunnelK*vaultK();   // an unlit bore: wider, stronger lamps and a visible beam
  if (L.spotLight){ L.spotLight.intensity = 2.2*k*(1 + .8*tunnelK + 2.2*vk); L.spotLight.angle = .5 + .22*vk; L.spotLight.distance = 85 + 25*vk; }
  if (L.beam){ L.beam.visible = vk > .02; const cp = L.beam.userData.carpet; cp.visible = L.beam.visible && gk > .01;
    if (L.beam.visible) L.beam.material.uniforms.uK.value = .09*vk*Math.min(1, k); if (cp.visible){ cp.material.opacity = .42*vk*Math.min(1, k)*gk; glueToRoad(cp, c); } }
  if (L.tailLight) L.tailLight.intensity = (1.1 + .9*brake)*k*(1 + .5*tunnelK);
}

/* ---------- speed trails: at speed each vehicle's tail lights draw a glowing ribbon behind it, with its reflection lying on the road ----------
   The ribbon is the tail lamp's own light smeared over the last second of travel (so it is a light the vehicle already carries, not a new one);
   it fades in from ~110 km/h, is at full strength at the top speed and flares brighter and whiter under a boost. */
const TRAIL_N = 44, TRAIL_LIFE = .85, _trHead = new THREE.Vector3(), _trSide = new THREE.Vector3(), _trTmp = new THREE.Vector3();
const trailMat = (ground) => new THREE.ShaderMaterial({ transparent:true, depthWrite:false, depthTest:true, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog:false,
  uniforms:{ uCol:{ value:new THREE.Color(0xff3a22) }, uK:{ value:0 }, uBoost:{ value:0 } },
  vertexShader:'attribute float age; attribute float edge; varying float vA; varying float vE; void main(){ vA = age; vE = edge; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }',
  fragmentShader:'uniform vec3 uCol; uniform float uK; uniform float uBoost; varying float vA; varying float vE; void main(){ float a = pow(1. - vA, 2.1)*smoothstep(0., .06, vA)*uK; float core = 1. - smoothstep(0., 1., abs(vE)); vec3 col = mix(uCol, vec3(1., .85, .7), uBoost*.55 + core*.25*uBoost); gl_FragColor = vec4(col*a*(' + (ground ? '.55' : '1.') + ' + core*.6), a*(.6 + .4*core)); }' });
function trailsFor(c){
  if (c._trails && c._trailsKind === c.kind) return c._trails;
  if (c._trails) for (const t of c._trails.all) scene.remove(t.mesh);
  const spec = lampSpec(c), all = [];
  const mk = (lamp, ground) => { const g = new THREE.BufferGeometry(), pos = new Float32Array(TRAIL_N*2*3), age = new Float32Array(TRAIL_N*2), edge = new Float32Array(TRAIL_N*2), idx = [];
    for (let k=0;k<TRAIL_N-1;k++){ const a = k*2; idx.push(a, a+2, a+1, a+1, a+2, a+3); }
    for (let k=0;k<TRAIL_N;k++){ edge[k*2] = -1; edge[k*2+1] = 1; age[k*2] = age[k*2+1] = 1; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('age', new THREE.BufferAttribute(age, 1)); g.setAttribute('edge', new THREE.BufferAttribute(edge, 1)); g.setIndex(idx);
    const mesh = new THREE.Mesh(g, trailMat(ground)); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false; mesh.userData.noSolid = true; scene.add(mesh);
    return { mesh, lamp, ground, pts:[], w:ground ? .5 : .24 }; };
  for (const tp of spec.tail){ all.push(mk(tp, false)); all.push(mk(tp, true)); }
  c._trailsKind = c.kind; return c._trails = { all };
}
function trailsUpdate(c, dt){
  const sp = Math.hypot(c.vx, c.vz), want = (state === 'race' || state === 'done' || (state === 'insp' && DEMO.on)) && !c.finished ? smoothstep01((sp/MAXS - .5)/.45) : 0;
  c._trailK = (c._trailK || 0) + (want - (c._trailK || 0))*Math.min(1, dt*4);
  if (c._trailK < .01 && !c._trails){ return; }
  const T3 = trailsFor(c), boost = c.boost > 0 ? 1 : 0, now = clockT;
  c._trailB = (c._trailB || 0) + (boost - (c._trailB || 0))*Math.min(1, dt*5);
  c.body.updateWorldMatrix(true, false);
  const gk = c.loop ? 0 : poolGround(c), roadY = world.elev ? trackY(c.x, c.z, c.idx) : (H[c.idx] || 0);
  for (const t of T3.all){
    _trHead.set(t.lamp[0], t.lamp[1], t.lamp[2] - .15).applyMatrix4(c.body.matrixWorld);
    if (t.ground){ _trHead.y = roadY + .08; }
    _trSide.set(Math.cos(c.h), 0, -Math.sin(c.h)).multiplyScalar(t.w*.5);
    const P0 = t.pts; const last = P0.length ? P0[P0.length - 1] : null;
    if (last && _trHead.distanceTo(last.p) > 14) P0.length = 0;                              // teleported (respawn, reset): start a fresh ribbon
    if (!last || _trHead.distanceToSquared(last.p) > .09) P0.push({ p:_trHead.clone(), s:_trSide.clone(), t:now, g:t.ground ? gk : 1 });
    while (P0.length && now - P0[0].t > TRAIL_LIFE) P0.shift(); while (P0.length > TRAIL_N) P0.shift();
    const k = c._trailK*(t.ground ? gk*.7 : 1)*(1 + .5*c._trailB), vis = k > .01 && P0.length > 2;
    t.mesh.visible = vis; if (!vis) continue;
    const pos = t.mesh.geometry.attributes.position, age = t.mesh.geometry.attributes.age, n = P0.length;
    for (let k2=0;k2<TRAIL_N;k2++){ const q = P0[Math.min(n - 1, Math.max(0, n - 1 - k2))], a = k2 < n ? (now - q.t)/TRAIL_LIFE : 1;
      pos.setXYZ(k2*2, q.p.x - q.s.x, q.p.y, q.p.z - q.s.z); pos.setXYZ(k2*2+1, q.p.x + q.s.x, q.p.y, q.p.z + q.s.z); age.setX(k2*2, Math.min(1, a)); age.setX(k2*2+1, Math.min(1, a)); }
    pos.needsUpdate = true; age.needsUpdate = true;
    t.mesh.material.uniforms.uK.value = Math.min(1.2, k*.62); t.mesh.material.uniforms.uBoost.value = c._trailB;
  }
}
const smoothstep01 = x => { x = Math.max(0, Math.min(1, x)); return x*x*(3 - 2*x); };
function trailsClear(c){ if (!c._trails) return; for (const t of c._trails.all){ t.pts.length = 0; t.mesh.visible = false; } }
function nightUpdate(dt){
  const wantN = world.dark ? 1 : 0, wantT = (inTunnel(player.idx) || inTunnel((player.idx + 2) % N)) ? 1 : 0, vk = vaultK();   // the lamps come up just before the mouth
  nightK += (wantN - nightK)*Math.min(1, dt*2.5); tunnelK += (wantT - tunnelK)*Math.min(1, dt*(2.2 + 1.6*vk));
  // inside a tunnel the world light drops away: only the neon, the lamps and the cars' own lights are left
  sun.intensity = world.sun[1]*(1 - .92*tunnelK); hemi.intensity = world.hemi[2]*(1 - (.74 + .22*vk)*tunnelK);
  if (tunnelK > .001 || nightLit){ hemi.color.set(world.hemi[0]).lerp(NEON_SKY, tunnelK*.75*(1 - vk)); hemi.groundColor.set(world.hemi[1]).lerp(NEON_GROUND, tunnelK*.75*(1 - vk)); nightLit = tunnelK > .001; }
  if (playerLamp) playerLamp.intensity = 1.4*(1 - (.7 + .3*vk)*tunnelK);
  if (world.id === 'hive' && HIVE.flashT > 0){ const k = HIVE.flashT/.22*(1 - tunnelK); hemi.intensity += 2.4*k*(Math.random() < .3 ? .4 : 1); sun.intensity += 1.2*k; }   // lightning lights up the whole lattice      // the soft fill around the player steps back in the tunnel: the headlamps do the lighting
  for (const c of cars){ lightsUpdate(c, dt); trailsUpdate(c, dt); }
}


/* ---------- Cicada hover-walker rig: a textured multi-part GLB (root_0..root_15). Two side turbines hold it up while the legs walk;
   the rotors are added here and spin with the throttle, and under Updraft they carry it off the ground ---------- */
const HOVER_S = 1.35;
function buildHoverRig(src, c){
  const root = src.scene.clone(true), parts = {};
  const mat = src.material.clone(); if (c && !c.player) mat.color.copy(new THREE.Color(0xffffff).lerp(new THREE.Color(c.L.body), .45));
  root.traverse(o => { if (o.name) parts[o.name] = parts[o.name] || o; if (o.isMesh){ o.material = mat; o.castShadow = true; o.receiveShadow = false; } });
  const nodeOf = n => { let o = parts[n]; while (o && o.parent && o.parent !== root) o = o.parent; return o; };
  // electric signals on the blue turbine panels: the panels are part of the texture, so the shader finds them by colour (deep blue,
  // with pale-blue circuit traces) and runs pulses of light along the traces, with sparks hopping between cells and a faint flicker
  const sigU = { value:0 }, sigK = { value:.4 };
  mat.userData.patchKey = 'sig1';
  mat.userData.patchShader = (sh) => { sh.uniforms.uSig = sigU; sh.uniforms.uSigK = sigK; const f = sh.fragmentShader;
    if (!f.includes('#include <emissivemap_fragment>') || f.includes('uSigK')) return;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSigPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSigPos = transformed;');
    sh.fragmentShader = f.replace('#include <common>', '#include <common>\nuniform float uSig, uSigK; varying vec3 vSigPos;\nfloat sigH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ vec3 cc = diffuseColor.rgb; float blu = smoothstep(.04, .16, cc.b - max(cc.r, cc.g*1.02));        // the blue panels only, never the brass
  float lum = dot(cc, vec3(.3, .55, .15)), trace = blu*smoothstep(.22, .42, lum), deep = blu*(1. - smoothstep(.18, .34, lum));
  vec3 q = vSigPos;                                                                                     // model space: the panel is ~1 m tall
  float p1 = fract(q.y*1.6 - uSig*.9 + sign(q.x)*.37), p2 = fract(q.y*2.3 + q.z*1.7 + uSig*.6 + sign(q.x)*.61);   // pulses running down the traces, a second set climbing
  float band = smoothstep(0., .04, p1)*smoothstep(.16, .04, p1) + .6*smoothstep(0., .04, p2)*smoothstep(.12, .04, p2);
  vec2 cell = floor(q.yz*vec2(16., 16.)) + sign(q.x)*7.; float spark = step(.93 - .04*uSigK, sigH(cell + floor(uSig*10.)));
  float flick = .55 + .45*sin(uSig*23. + sigH(floor(q.yz*5.))*6.28);
  totalEmissiveRadiance += vec3(.45, .85, 1.)*trace*(band*2.6 + spark*1.8)*(.5 + uSigK) + vec3(.1, .3, 1.)*deep*(.04 + .12*flick*band + .05*flick)*(.6 + uSigK); }`); };
  // legs: everything below the hips, split by side; each side steps as one piece
  const legL = new THREE.Group(), legR = new THREE.Group(); root.add(legL, legR); root.updateMatrixWorld(true);
  for (const n of ['root_5','root_6','root_9','root_10','root_11','root_12','root_13','root_14','root_15']){ const o = nodeOf(n); if (!o) continue; (o.position.x < 0 ? legL : legR).attach(o); }
  const hips = nodeOf('root_2');
  // rotors on the outer face of each side turbine
  const bladeM = new THREE.MeshStandardMaterial({ color:0x5a4a30, metalness:.7, roughness:.35 }), hubM = new THREE.MeshStandardMaterial({ color:0x9a7a46, metalness:.8, roughness:.3 });
  const blurM = new THREE.MeshBasicMaterial({ color:0x2a241b, transparent:true, opacity:0, depthWrite:false, side:THREE.DoubleSide }); blurM.userData.fx = true;
  const glowM = new THREE.MeshBasicMaterial({ color:0x4aa8ff, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog:false }); glowM.userData.fx = true;
  // the duct's opening on the outer face is r .34 at x ±1.28, with a cone nose at its centre reaching the face: the rotor sits just inside
  // the lip (x ±1.245), its blades running from the hub to r .315 so they fill the opening without crossing the rim
  const bladeG = new THREE.BoxGeometry(.03, .24, .1); bladeG.translate(0, .195, 0);
  const rotors = [];
  for (const n of ['root_3','root_4']){ const t = nodeOf(n); if (!t) continue; const sd = Math.sign(t.position.x) || 1;
    const r = new THREE.Group(); r.position.set(t.position.x + sd*.324, t.position.y, t.position.z); root.add(r);
    const spin = new THREE.Group(); r.add(spin);
    for (let k=0;k<9;k++){ const holder = new THREE.Group(); holder.rotation.x = k/9*Math.PI*2; const b = new THREE.Mesh(bladeG, bladeM); b.rotation.y = .42*sd; holder.add(b); spin.add(holder); }   // nine pitched blades
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.075, .095, .09, 16), hubM); hub.rotation.z = -sd*Math.PI/2; hub.position.x = sd*.02; spin.add(hub);   // caps the cone nose
    const blur = new THREE.Mesh(new THREE.CircleGeometry(.325, 32), blurM); blur.rotation.y = Math.PI/2; blur.position.x = sd*.012; r.add(blur);
    const glow = new THREE.Mesh(new THREE.RingGeometry(.27, .335, 32), glowM); glow.rotation.y = Math.PI/2; glow.position.x = -sd*.04; r.add(glow);
    rotors.push({ r, spin, sd, t }); }
  // blue burners: a flame out of each of the four rear pods (their blue cores), a low idle burn that lengthens with the throttle
  // and roars out under boost and Updraft
  const burnGeo = (r) => { const g = new THREE.CylinderGeometry(r*.3, r, 1, 18, 6, true); g.translate(0, .5, 0); g.rotateX(-Math.PI/2); return g; };   // base at the nozzle, tip along -z (out the back)
  const bOuter = burnGeo(.085), bCore = burnGeo(.05);
  const bGlowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), gr = x.createRadialGradient(32,32,0,32,32,32);
    gr.addColorStop(0,'rgba(220,240,255,1)'); gr.addColorStop(.35,'rgba(90,160,255,.7)'); gr.addColorStop(1,'rgba(40,80,255,0)'); x.fillStyle = gr; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(cv); })();
  const burners = [];
  for (const [x, y, r] of [[-.277, 2.555, .085], [.277, 2.555, .085], [-.307, 2.225, .095], [.307, 2.225, .095]]){
    const n = new THREE.Group(); n.position.set(x, y, -1.75); root.add(n); const k = r/.085;
    const outer = new THREE.Mesh(bOuter, blueFlameMat(true)), core = new THREE.Mesh(bCore, blueFlameMat()); outer.renderOrder = 6; core.renderOrder = 7;
    outer.userData.k = core.userData.k = k; n.add(outer, core);
    for (const m of [outer.material, core.material]) m.userData.fx = true;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:bGlowTex, color:0x9fc8ff, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true, opacity:.6 })); glow.material.userData.fx = true;
    glow.position.z = -.02; glow.scale.setScalar(.22*k); n.add(glow);
    burners.push({ n, outer, core, glow, k }); }
  const st = { phase:0, spinA:0, rpm:0, fly:0, bob:0, burn:.2, boost:0 }, tmp = new THREE.Vector3();
  return { root, parts, mat,
    update(c, dt, mode){
      const sp = Math.abs(c.f || 0), flying = c.airT > 0 && c.airKind === 'flight';
      st.fly += ((flying ? 1 : 0) - st.fly)*Math.min(1, dt*(flying ? 6 : 3));
      // turbines: idle hum, faster with the throttle, flat out under Updraft
      const want = mode === 'idle' ? 14 : 16 + sp*.55 + (c.thr ? 8 : 0) + st.fly*55 + (c.boost > 0 ? 12 : 0);
      st.rpm += (want - st.rpm)*Math.min(1, dt*3); st.spinA += st.rpm*dt;
      for (const R of rotors){ R.spin.rotation.x = st.spinA; }
      sigK.value += ((mode === 'idle' ? .3 : .45 + Math.min(1, sp/40)*.35 + st.fly*.6) - sigK.value)*Math.min(1, dt*3); sigU.value += dt*(.7 + sigK.value*1.2);   // signals run faster as the turbines spool up
      // burners: idle flicker, a long blue flame on the throttle, flat out under boost or Updraft
      const bw = mode === 'idle' ? .22 : (c.thr ? .75 + Math.min(sp/MAXS, 1)*.25 : (c.brk ? .08 : .3));
      st.burn += (bw - st.burn)*Math.min(1, dt*(bw > st.burn ? 8 : 4)); st.boost += ((c.boost > 0 || flying ? 1 : 0) - st.boost)*Math.min(1, dt*6);
      { const t = performance.now()/1000;
        for (const [i, B] of burners.entries()){ const fl = 1 + Math.sin(t*59 + i*1.7)*.07 + Math.sin(t*33.1 + i)*.05, len = (.2 + st.burn*.95 + st.boost*.9)*fl*B.k, wid = 1 + st.burn*.12 + st.boost*.25;
          B.outer.scale.set(wid, wid, len); B.core.scale.set(1, 1, len*.62);
          for (const m of [B.outer.material, B.core.material]){ m.uniforms.uTime.value = t; m.uniforms.uPower.value = .35 + st.burn*.65; m.uniforms.uBoost.value = .85 + st.boost*.15; }   // always blue
          B.glow.material.opacity = .35 + st.burn*.45 + st.boost*.2; B.glow.scale.setScalar((.18 + st.burn*.08 + st.boost*.1)*B.k); } }   // both turbines turn forward: the top of each rotor runs toward the nose, like a rolling wheel
      blurM.opacity = Math.min(.55, Math.max(0, (st.rpm - 18)/60)); glowM.opacity = .15 + .55*st.fly + Math.min(.2, sp/200);
      // walking: the two legs swap, stride length follows the speed; a light, hoisted gait — the turbines carry most of the weight
      const walk = mode === 'idle' ? 0 : Math.min(1, sp/6)*(1 - st.fly);
      st.phase += (mode === 'idle' ? dt*1.2 : (sp/2.6 + .5)*dt*Math.PI*.5)*(1 - st.fly*.9);
      const sL = Math.sin(st.phase), cL = Math.cos(st.phase);
      const stride = .34*walk, lift = .2*walk + .03;
      legL.position.set(0, Math.max(0, cL)*lift + st.fly*.35, sL*stride - st.fly*.15); legL.rotation.x = -sL*.1*walk - st.fly*.25;
      legR.position.set(0, Math.max(0, -cL)*lift + st.fly*.35, -sL*stride - st.fly*.15); legR.rotation.x = sL*.1*walk - st.fly*.25;
      if (hips){ hips.rotation.z = sL*.04*walk; }
      // the hull floats on the turbines: a slow bob, and a step bump
      root.position.y = (Math.sin(clockT*2.1 + (c.player ? 0 : c.x))*.04 + Math.abs(sL)*.03*walk)*(1 - st.fly);
      root.rotation.x = -.05*Math.min(1, sp/40) + st.fly*.06;
      // downwash: dust kicked up under the turbines when it lifts off or idles low
      if (mode !== 'idle' && (st.fly > .1 || Math.random() < .05)){ root.updateWorldMatrix(true, false);
        for (const R of rotors){ if (Math.random() > .35 + st.fly*.5) continue; tmp.set(R.r.position.x, 0, R.r.position.z); root.localToWorld(tmp);
          const gy = (c.y || 0) + .2, a = Math.random()*Math.PI*2; emit(tmp.x, gy, tmp.z, Math.cos(a)*rnd(3,7) + (c.vx || 0)*.3, rnd(.3,1.2), Math.sin(a)*rnd(3,7) + (c.vz || 0)*.3, rnd(1.2,2.2)*(.6 + st.fly), rnd(.5,.9)); } }
    } };
}
// how high a car rides above the road while airborne from an ability: a Leap is a ballistic arc, an Updraft climbs, holds and settles
function airLift(c){
  if (!(c.airT > 0)) return 0; const p = 1 - c.airT/c.airDur;
  if (c.airKind === 'flight'){ const u = Math.min(1, p/.2, (1 - p)/.28), e = u*u*(3 - 2*u); return 6.5*e + .35*Math.sin(p*13)*e; }
  return 28*p*(1-p);
}


/* ---------- Nexus hover interceptor rig: one textured mesh riding on four gravity pods ----------
   The hull floats and banks; each pod glows and pushes a shimmer of air onto the deck. Tractor Beam throws a green beam onto the rival ahead. */
const DRONE_S = 2.6;
const PODS = [[-.47, .02, .6], [.47, .02, .6], [-.48, .02, -.62], [.48, .02, -.62]];
const podTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,230,1)'); g.addColorStop(.3,'rgba(255,190,90,.85)'); g.addColorStop(1,'rgba(255,120,30,0)'); x.fillStyle = g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); })();
function buildDroneRig(src, c){
  const root = src.scene.clone(true), mat = src.material.clone();
  if (c && !c.player) mat.color.copy(new THREE.Color(0xffffff).lerp(new THREE.Color(c.L.body), .45));
  root.traverse(o => { if (o.isMesh){ o.material = mat; o.castShadow = true; o.receiveShadow = false; } });
  const hull = new THREE.Group(); while (root.children.length) hull.add(root.children[0]); root.add(hull);
  // pod glows under the hull, and a soft pool of light each throws on the road
  const pods = PODS.map(p => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:podTex, color:0xffb060, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true, opacity:.9 })); s.position.set(p[0], p[1] - .02, p[2]); s.scale.setScalar(.42); hull.add(s); return s; });
  const poolM = new THREE.MeshBasicMaterial({ map:podTex, color:0xffa040, transparent:true, opacity:.35, depthWrite:false, blending:THREE.AdditiveBlending }); poolM.userData.fx = true;
  const pools = PODS.map(p => { const m = new THREE.Mesh(new THREE.PlaneGeometry(.9, .9), poolM); m.rotation.x = -Math.PI/2; m.position.set(p[0], .03, p[2]); m.renderOrder = 4; root.add(m); return m; });
  // the tractor beam: a tapered green column from the nose to whoever it has locked on to
  const beamM = new THREE.MeshBasicMaterial({ color:0x3cff8a, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog:false }); beamM.userData.fx = true;
  const beamG = new THREE.CylinderGeometry(.35, 1.4, 1, 10, 1, true); beamG.translate(0, .5, 0); beamG.rotateX(Math.PI/2);       // runs from z=0 to z=1
  const beam = new THREE.Mesh(beamG, beamM); beam.visible = false; if (!(c && c.ghost)) scene.add(beam);
  const coreM = new THREE.MeshBasicMaterial({ color:0xeafff2, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }); coreM.userData.fx = true;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(.1, .3, 1, 6, 1, true).translate(0, .5, 0).rotateX(Math.PI/2), coreM); core.visible = false; if (!(c && c.ghost)) scene.add(core);
  const st = { bob:0, roll:0, pitch:0 }, a = new THREE.Vector3(), b = new THREE.Vector3();
  return { root, mat, beam,
    update(c, dt, mode){
      // floats on its pods: a slow bob, banks into turns, noses down under braking
      const sp = Math.abs(c.f || 0);
      hull.position.y = .32 + Math.sin(clockT*2.4 + (c.player ? 0 : c.x))*.035 + (mode === 'idle' ? .02 : 0);
      st.roll += ((-(c.steerV || 0)*Math.min(1, sp/30)*.16) - st.roll)*Math.min(1, dt*5); hull.rotation.z = st.roll;
      st.pitch += (((c.brk ? .05 : 0) - (c.thr ? .025 : 0)*Math.min(1, sp/20)) - st.pitch)*Math.min(1, dt*4); hull.rotation.x = st.pitch;
      const pk = .8 + .2*Math.sin(clockT*18) + Math.min(.4, sp/120) + (c.boost > 0 ? .4 : 0);
      for (const s of pods){ s.material.opacity = Math.min(1, pk); s.scale.setScalar(.36 + .1*pk); } const gk = poolGround(c); poolM.opacity = (.22 + .14*pk)*gk; for (const m of pools){ m.visible = gk > .01; if (m.visible) glueToRoad(m, c); }
      if (c.ghost) return;
      if (mode !== 'idle' && sp > 6 && Math.random() < .35){ root.updateWorldMatrix(true, false); const p = PODS[Math.random()*4|0]; a.set(p[0], 0, p[2]); root.localToWorld(a);
        emit(a.x, (c.y || 0) + .2, a.z, rnd(-2,2) - (c.vx || 0)*.15, rnd(.2,1), rnd(-2,2) - (c.vz || 0)*.15, rnd(.8,1.4), rnd(.3,.6)); }
      // Tractor Beam
      const on = active(c, 'beam') && c.beamTarget && !c.beamTarget.finished;
      beam.visible = core.visible = on;
      if (on){ const t = c.beamTarget; a.set(c.x + Math.sin(c.h)*2.2, (c.y || 0) + 1.2, c.z + Math.cos(c.h)*2.2); b.set(t.x, (t.y || 0) + 1.4, t.z);
        const L = a.distanceTo(b); for (const m of [beam, core]){ m.position.copy(a); m.lookAt(b); m.scale.set(1, 1, L); }
        const fl = .7 + .3*Math.sin(clockT*40); beamM.opacity = .32*fl; coreM.opacity = .85*fl;
        if (Math.random() < .6) glitter.emit(b.x + rnd(-1.5,1.5), b.y + rnd(-1,1), b.z + rnd(-1.5,1.5), rnd(-3,3), rnd(-1,3), rnd(-3,3), rnd(.4,.8), rnd(.2,.4)); }
    } };
}
// the rival a Tractor Beam locks on to: the nearest one ahead, within reach and roughly in front
function beamTargetFor(c){
  let best = null, bd = 1e9;
  for (const o of cars){ if (o === c || o.finished || o.ghost) continue; let dp = o.prog - c.prog; if (dp < 0 || dp > 45) continue;
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz); if (d > 95) continue; if (Math.abs(wrapA(Math.atan2(dx, dz) - c.h)) > .9) continue; if (d < bd){ bd = d; best = o; } }
  return best;
}

/* AI: when to spend a full meter */
function aiAbility(c){
  if (c.player || c.meter < 100 || c.abilT > 0 || state !== 'race') return;
  const Lv = LEVELS[level], ai = c.ai;
  if (level === 'easy'){ if (Math.random() < .004) useAbility(c); return; }
  const A = abilOf(c);
  if (A.id === 'shell'){
    for (const o of cars){ if (o === c) continue; const dx = o.x-c.x, dz = o.z-c.z, d = Math.hypot(dx,dz);
      if (d > 12 && d < 110 && Math.abs(wrapA(Math.atan2(dx,dz) - c.h)) < .25 && (level === 'hard' ? true : Math.random() < .02)){ useAbility(c); return; } }
    return;
  }
  if (A.id === 'beam'){ if (beamTargetFor(c) && (level === 'hard' || Math.random() < .05)) useAbility(c); return; }
  if (A.id === 'leap' || A.id === 'shield' || A.id === 'flight'){
    for (const o of HAZ.solids){ let a = o.i - c.idx; if (a < 0) a += N; if (a > 4 && a < 14 && Math.abs(o.lat - (c.lat||0)) < o.r + 3){ useAbility(c); return; } }
    for (const z of HAZ.zones){ let a = z.i0 - c.idx; if (a < 0) a += N; if (a > 2 && a < 10 && (c.lat||0) > z.lat0 - 2 && (c.lat||0) < z.lat1 + 2 && c.prof.home !== world.id){ useAbility(c); return; } }
  }
  // speed abilities: fire on a straight where nothing needs braking for
  const plan = speedPlan(c); let ok = true; for (let j=0;j<40;j++) if (plan[(c.idx+j)%N] < MAXS*.95){ ok = false; break; }
  if (ok && (level === 'hard' || Math.random() < .03)) useAbility(c);
}

/* ---------- sounds for abilities ---------- */
function readyChime(){ if (!actx || muted) return; const A = actx, t0 = A.currentTime;
  for (const [f,dt] of [[660,0],[990,.09]]){ const o = A.createOscillator(), g = A.createGain(); o.type='triangle'; o.frequency.value=f;
    g.gain.setValueAtTime(.0001,t0+dt); g.gain.exponentialRampToValueAtTime(.06,t0+dt+.02); g.gain.exponentialRampToValueAtTime(.0001,t0+dt+.25); o.connect(g).connect(sfxBus()); o.start(t0+dt); o.stop(t0+dt+.3); } }
function abilitySound(id, k = 1){ if (!actx || muted || !tk) return; const A = actx, t0 = A.currentTime, abOut = A.createGain(); abOut.gain.value = k; abOut.connect(sfxBus());
  const s = A.createBufferSource(); s.buffer = tk.noise; const f = A.createBiquadFilter(); const g = A.createGain();
  f.type = id === 'shell' ? 'lowpass' : 'bandpass'; f.frequency.setValueAtTime(id === 'shell' ? 900 : 600, t0); f.frequency.exponentialRampToValueAtTime(id === 'shell' ? 120 : 2600, t0 + .5);
  g.gain.setValueAtTime(.0001,t0); g.gain.exponentialRampToValueAtTime(id === 'shell' ? .3 : .12, t0+.03); g.gain.exponentialRampToValueAtTime(.0001, t0+.7);
  s.connect(f).connect(g).connect(abOut); s.start(t0); s.stop(t0+.75);
  if (id === 'shell') thud(k); }

/* =====================================================================
   Ghost: your best lap per world and vehicle, replayed as a translucent twin
   ===================================================================== */
const ghost = { rec:null, best:null, mesh:null, car:null, key:'' };
const ghostKey = () => 'dustrunner-ghost-' + world.id + TRACK_TAG + '-' + player.kind;
function loadGhost(){
  ghost.key = ghostKey(); ghost.best = null;
  try { const g = JSON.parse(localStorage.getItem(ghost.key) || 'null'); if (g && g.p && g.p.length > 30) ghost.best = g; } catch(_){}
}
// The ghost is a full replica of your vehicle (wheels, tracks, legs, thrusters) drawn as a hologram and driven from the recording.
const ghostMat = new THREE.MeshBasicMaterial({color:0x7fe8ff, transparent:true, opacity:.28, depthWrite:false, blending:THREE.AdditiveBlending});
function ghostDispose(g){
  scene.remove(g.group);
  g.group.traverse(o => { if (!o.isMesh && !o.isPoints) return; o.geometry && o.geometry.dispose();
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m && m !== ghostMat) m.dispose(); }); });
}
function ghostVisual(){
  if (ghost.car){ ghostDispose(ghost.car); ghost.car = null; ghost.mesh = null; }
  const t = makeTruck(LIVERIES[0]);
  const g = { L:LIVERIES[0], ...t, prof:VEHICLES[player.kind], x:player.x, z:player.z, h:player.h, idx:player.idx||0, y:player.y||0, vx:0, vz:0, f:0, l:0, steerV:0, spinA:0, boost:0, accel:0,
    thr:true, brk:false, off:false, hop:0, airT:0, abilT:0, player:false, ghost:true, kind:'truck', rigs:{}, stock:[...t.body.children],
    wheelPivots:t.group.children.filter(ch => ch !== t.body), prevF:0, steerS:0 };
  scene.add(t.group);
  setKind(g, player.kind);
  if (customCar){ g.stock.forEach(p => p.visible = false); g.wheelPivots.forEach(p => p.visible = false); for (const k in g.rigs) g.rigs[k].wrap.visible = false; g.body.add(customCar.wrap.clone(true)); }
  // hologram look: solid parts become translucent cyan; engine flames and glows keep their own shaders so the burn still shows
  g.group.traverse(o => {
    if (o.isSprite || o.isPoints || (o.material && o.material.userData && o.material.userData.fx)){ o.visible = false; return; }
    if (!o.isMesh) return; o.castShadow = false; o.receiveShadow = false;
    const swap = m => { if (!m || m.isShaderMaterial || m.blending === THREE.AdditiveBlending) return m;
      if (m.map && m.map.image && m.map.image.tagName === 'CANVAS') m.map.dispose();
      if (m.map && m.map === (MODELS[player.kind] && MODELS[player.kind].material.map)) {} // shared model texture: leave it alone
      m.dispose(); return ghostMat; };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  g.group.visible = false; ghost.car = g; ghost.mesh = g.group;
}
function ghostRecord(){
  if (!ghost.rec) return;
  const lt = raceTime - player.lapStart;
  if (lt >= ghost.rec.next){ ghost.rec.p.push(+player.x.toFixed(2), +player.z.toFixed(2), +player.h.toFixed(3), player.prog - ghost.rec.prog0); ghost.rec.next += .1; }   // y comes from the track height on replay
}
function ghostLapDone(lt){
  // keep this lap if it beats the stored one, then start recording the next
  if (ghost.rec && ghost.rec.p.length > 40 && (!ghost.best || lt < ghost.best.t)){
    ghost.best = { t: lt, p: ghost.rec.p };
    try { localStorage.setItem(ghost.key, JSON.stringify(ghost.best)); } catch(_){}
    if (player.laps < LAPS) showToast('New ghost lap', 900);
  }
  ghost.rec = { p:[], next:0, prog0: player.prog };
}
function ghostUpdate(dt){
  const g = ghost.best, m = ghost.mesh, gc = ghost.car; if (!m) return;
  if (!g || state !== 'race' || player.finished){ m.visible = false; $('ghostDelta').hidden = true; return; }
  const lt = raceTime - player.lapStart, n = g.p.length/4, f = lt/.1, i = Math.floor(f);
  if (i >= n-1){ m.visible = false; return; }
  const a = i*4, b = (i+1)*4, u = f - i, P4 = g.p;
  gc.x = P4[a] + (P4[b]-P4[a])*u; gc.z = P4[a+1] + (P4[b+1]-P4[a+1])*u;
  const dh = wrapA(P4[b+2]-P4[a+2]); gc.h = P4[a+2] + dh*u;
  if (dt > 0){
    // rebuild what the rigs need from the recording: speed, acceleration, steering, throttle
    const sp = Math.hypot(P4[b]-P4[a], P4[b+1]-P4[a+1]) / .1;
    gc.f += (sp - gc.f)*Math.min(1, dt*8);
    gc.vx = Math.sin(gc.h)*gc.f; gc.vz = Math.cos(gc.h)*gc.f;
    const acc = (gc.f - gc.prevF)/dt; gc.prevF = gc.f; gc.accel += (clamp(acc, -80, 80) - gc.accel)*Math.min(1, dt*5);
    const yawRate = Math.abs(dh) < 1 ? dh/.1 : 0;
    gc.steerS += (clamp(-yawRate/(gc.prof.turn*.8), -1, 1) - gc.steerS)*Math.min(1, dt*8); gc.steerV = gc.steerS;
    gc.thr = gc.accel > -8; gc.brk = gc.accel < -18;
    gc.spinA += gc.f*dt/.5;
    if (world.elev){ const lg = locate(gc); gc.idx = lg.i; if (GAP[lg.i]){ const j = JUMPS.find(j => ((lg.i - j.lip + N) % N) < ((j.land - j.lip + N) % N)); const u = j ? ((lg.i - j.lip + N) % N) / ((j.land - j.lip + N) % N) : .5; gc.y = (j ? Math.max(H[j.lip], H[j.land]) : 0) + Math.sin(u*Math.PI)*9; } else gc.y = trackY(gc.x, gc.z, lg.i); }
    syncMesh(gc, dt);
    const r = gc.rigs[gc.kind]; if (r && r.wrap.visible) r.rig.update(gc, dt, 'drive');
  }
  m.visible = Math.hypot(gc.x - player.x, gc.z - player.z) > 3;
  // live delta: when did the ghost reach the distance you have covered this lap?
  const myProg = player.prog - (ghost.rec ? ghost.rec.prog0 : player.prog);
  let lo = 0, hi = n-1; while (lo < hi){ const mid = (lo+hi) >> 1; if (P4[mid*4+3] < myProg) lo = mid+1; else hi = mid; }
  const delta = lt - lo*.1, el = $('ghostDelta');
  el.hidden = false; el.textContent = (delta >= 0 ? '+' : '−') + Math.abs(delta).toFixed(2) + ' vs ghost'; el.classList.toggle('ahead', delta < 0);
}

/* =====================================================================
   Cameras, finish slow-motion, speed lines
   ===================================================================== */
const CAMS = ['Chase','High','Bumper','Top'];
let camMode = 0, slowmo = 0, finishCam = 0, megaCam = 0;
// the model's extents in the car's own frame (+z nose, +y up), measured from the meshes once per vehicle
function extentsOf(c){
  const key = c.kind + (customCar ? ':custom' : '');
  if (c._extKey === key && c._ext) return c._ext;
  c.group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(c.group.matrixWorld).invert(), box = new THREE.Box3(), tmp = new THREE.Box3(), m = new THREE.Matrix4();
  const walk = o => { if (!o.visible) return; if (o.isMesh && o.geometry && !o.isSprite && !o.isPoints){ if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)); box.union(tmp); } for (const ch of o.children) walk(ch); };
  walk(c.group);
  if (box.isEmpty()){ box.min.set(-2,0,-c.prof.rad*.5); box.max.set(2, 2, c.prof.rad*.5); }
  c._ext = { nose: Math.min(box.max.z, c.prof.rad*1.2), tail: box.min.z, top: Math.min(box.max.y, 6), halfW: Math.min(Math.max(-box.min.x, box.max.x), 4) }; c._extKey = key; return c._ext;
}
try { camMode = +localStorage.getItem('dustrunner-cam') || 0; } catch(_){}
function cycleCam(){ camMode = (camMode+1) % CAMS.length; try { localStorage.setItem('dustrunner-cam', camMode); } catch(_){} showToast(CAMS[camMode] + ' cam', 700); }
const lines = (() => { const cv = document.createElement('canvas'); cv.id = 'lines'; cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'; $('app').insertBefore(cv, $('gl').nextSibling); return cv; })();
const lctx = lines.getContext('2d');
let lineAmt = 0;
function drawLines(dt){
  const sp = Math.abs(player.f||0)/MAXS, want = state==='race' ? clamp((sp - .8)*2.2, 0, 1)*.6 + (player.boost > 0 || active(player,'nitro') || active(player,'burner') ? .7 : 0) : 0;
  if (!Q.lines){ if (lineAmt){ lineAmt = 0; lctx.clearRect(0,0,lines.width,lines.height); } return; }
  lineAmt += (Math.min(1,want) - lineAmt)*Math.min(1, dt*5);
  const w = lines.clientWidth, h = lines.clientHeight;
  if (lines.width !== w || lines.height !== h){ lines.width = w; lines.height = h; }
  if (lineAmt < .03 && lines._clear) return;
  lctx.clearRect(0,0,w,h); lines._clear = lineAmt < .03;
  if (lineAmt < .03 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cx = w/2, cy = h*.46, R0 = Math.min(w,h)*.32;
  lctx.lineCap = 'round';
  for (let i=0;i<46*lineAmt;i++){ const a = Math.random()*Math.PI*2, r1 = R0*(1 + Math.random()*.6), r2 = r1 + Math.min(w,h)*(.12 + Math.random()*.25)*lineAmt;
    lctx.strokeStyle = `rgba(255,248,230,${(.1 + Math.random()*.25)*lineAmt})`; lctx.lineWidth = 1 + Math.random()*2;
    lctx.beginPath(); lctx.moveTo(cx + Math.cos(a)*r1, cy + Math.sin(a)*r1*.62); lctx.lineTo(cx + Math.cos(a)*r2, cy + Math.sin(a)*r2*.62); lctx.stroke(); }
}

/* =====================================================================
   Grand Tour: seven worlds, points after each race, a champion at the end
   ===================================================================== */
const TOUR_POINTS = [10,7,5,3,1];
let raceMode = 'single', tour = null;
function startTour(){
  tour = { i:0, pts:new Map(cars.map(c => [c, 0])), log:[] };
  if (world.id !== WORLD_ORDER[0]) { buildWorld(WORLD_ORDER[0]); renderSpec(); }
  startRace();
}
function tourAward(st){
  const row = st.map((c,i) => { const p = TOUR_POINTS[i] || 0; tour.pts.set(c, tour.pts.get(c) + p); return {c, p}; });
  tour.log.push({world: world.name, row});
}
function tourNext(){
  tour.i++;
  buildWorld(WORLD_ORDER[tour.i]); renderSpec();
  startRace();
}

$('againBtn').addEventListener('click', () => {
  stopCelebration();
  if (tour){ bankTour(); if (tour.i < WORLD_ORDER.length-1) tourNext(); else startTour(); }
  else { state='menu'; rollRivals(); startRace(); }
});
$('resMenuBtn').addEventListener('click', quitToMenu);

function lapCheck(c){
  const done = Math.floor(c.prog/N);
  if (done > c.laps && !c.finished){
    c.laps = done; const lt = raceTime - c.lapStart; c.lapStart = raceTime; c.lapTimes.push(lt);
    if (c.player) ghostLapDone(lt);
    if (c.player){
      $('last').textContent = fmt(lt);
      if (lt < bestLap){ bestLap = lt; cel.newBest = true; try{ localStorage.setItem('dustrunner-best', String(lt)); }catch(_){} if (c.laps<LAPS) showToast('Best lap'); }
      if (c.laps === LAPS-1) setTimeout(()=>showToast('Final lap'), bestLap===lt?1100:0);
    }
    if (c.laps >= LAPS){ c.finished = true; c.finishTime = raceTime; if (c.player){ doneT = 2.6; slowmo = 1.5; finishCam = 2.4; playerFinished(); }
      else if (state==='done' && !$('res').hidden) renderResults(c); }
  }
}

/* =====================================================================
   Finish celebration: banner, fireworks, confetti, fanfare, live results
   ===================================================================== */
const FW = [makeFx(0xffc64a, 700, true, 5), makeFx(0x3fe8de, 500, true, 5), makeFx(0xff6a3a, 500, true, 5), makeFx(0xfff3dc, 400, true, 5)];
const cel = { queue:[], t:99, place:0, newBest:false, orbit:0, base:0 };
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
// a rocket climbs, then bursts into a sphere of sparks; the colours rotate
// rockets go up where you are looking, so they land in frame whichever way the camera faces
const _fwDir = new THREE.Vector3();
function launchFirework(delay, big){ cel.queue.push({ t:delay, kind:'trail', col:(Math.random()*FW.length)|0, big }); }
function fireworksUpdate(dt){
  for (let i = cel.queue.length-1; i >= 0; i--){
    const q = cel.queue[i]; q.t -= dt; if (q.t > 0) continue; cel.queue.splice(i,1);
    if (q.kind === 'trail'){
      camera.getWorldDirection(_fwDir); _fwDir.y = 0; _fwDir.normalize();
      const d = rnd(38, 60), lat = rnd(-1, 1)*d*.45;
      q.x = camera.position.x + _fwDir.x*d - _fwDir.z*lat; q.z = camera.position.z + _fwDir.z*d + _fwDir.x*lat; q.y = rnd(15, 25);
      for (let k=0;k<10;k++) FW[3].emit(q.x + rnd(-.2,.2), 1 + k*q.y/10, q.z + rnd(-.2,.2), 0, 1.5, 0, .5, .15 + k*.05);
      cel.queue.push({ t:.5, kind:'burst', x:q.x, z:q.z, y:q.y, col:q.col, big:q.big });
    } else {
      const n = q.big ? 120 : 70, sp = q.big ? 13 : 10, fx = FW[q.col], fx2 = FW[(q.col+1) % 3];
      for (let k=0;k<n;k++){
        const u = Math.random()*2-1, th = Math.random()*Math.PI*2, r = Math.sqrt(1-u*u), s = sp*(.75 + Math.random()*.35);
        (k % 4 ? fx : fx2).emit(q.x, q.y, q.z, r*Math.cos(th)*s, u*s + 2, r*Math.sin(th)*s, rnd(.9, 1.5), rnd(1.1, 1.9));
      }
      popSound(q.big ? .9 : .6, Math.hypot(q.x - camera.position.x, q.z - camera.position.z));
    }
  }
  for (const f of FW) f.update(dt);
}
// fanfare: a rising arpeggio and a held chord for a win, shorter for the podium, two notes otherwise
let celNoise = null;
function fanfare(place){
  if (!actx || muted) return; const A = actx, t0 = A.currentTime + .05;
  const tone = (f, at, dur, vol, type) => { const o = A.createOscillator(), g = A.createGain(); o.type = type || 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(.0001, t0+at); g.gain.exponentialRampToValueAtTime(vol, t0+at+.02); g.gain.setValueAtTime(vol, t0+at+dur*.6); g.gain.exponentialRampToValueAtTime(.0001, t0+at+dur);
    o.connect(g).connect(sfxBus()); o.start(t0+at); o.stop(t0+at+dur+.05); };
  if (place === 1){
    [[523,0],[659,.12],[784,.24],[1047,.36]].forEach(([f,at]) => { tone(f, at, .22, .07); tone(f/2, at, .22, .03, 'square'); });
    for (const f of [523, 659, 784, 1047]) tone(f, .52, 1.4, .045);
    tone(262, .52, 1.4, .03, 'square');
  } else if (place <= 3){
    [[392,0],[523,.13],[659,.26]].forEach(([f,at]) => tone(f, at, .24, .06));
    for (const f of [523, 659, 784]) tone(f, .42, 1, .035);
  } else { tone(440, 0, .25, .05); tone(392, .2, .6, .05); }
}
function popSound(v, dist){
  if (!actx || muted) return; const A = actx, t0 = A.currentTime;
  if (!celNoise){ celNoise = A.createBuffer(1, A.sampleRate*.6, A.sampleRate); const d = celNoise.getChannelData(0); for (let i=0;i<d.length;i++) d[i] = (Math.random()*2-1)*Math.pow(1 - i/d.length, 3); }
  const s = A.createBufferSource(), f = A.createBiquadFilter(), g = A.createGain(); s.buffer = celNoise;
  f.type = 'lowpass'; f.frequency.value = 1400; const vol = .22*v*Math.max(.25, 1 - dist/140);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(.0001, t0+.6);
  s.connect(f).connect(g).connect(sfxBus()); s.start(t0); s.stop(t0+.65);
}
// DOM confetti over the scene (behind the results card): side cannons, a fountain from the foot of the screen, pops across the sky and a
// slow rain of foil; pieces are rectangles, discs, stars and long streamers in the world's own colours plus gold and white
const confetti = (() => {
  const cv = $('confetti'), cx = cv.getContext('2d'); let parts = [], raf = 0, last = 0, rainT = 0, pops = [], wind = 0, windT = 0;
  const BASE = ['#f0b44c','#ffd98a','#ff6b3b','#fff6e6'];
  const hex = v => typeof v === 'number' ? '#' + v.toString(16).padStart(6, '0') : v;
  const bright = c => { const n = parseInt(c.slice(1), 16); return (.299*(n >> 16 & 255) + .587*(n >> 8 & 255) + .114*(n & 255))/255 > .42; };   // no dark pieces: they read as dirt
  const palette = () => { const w = (typeof world !== 'undefined' && world) || {}; const acc = [].concat(w.curb || [], w.post || [], w.pad ? [w.pad] : []).map(hex).filter(c => /^#[0-9a-f]{6}$/i.test(c) && bright(c));
    return BASE.concat(acc.length ? acc : ['#26b8b2','#7fe8ff','#7cc47a']); };
  let COLS = BASE;
  function size(){ const d = Math.min(devicePixelRatio || 1, 1.5); cv.width = innerWidth*d; cv.height = innerHeight*d; cx.setTransform(d,0,0,d,0,0); }
  function piece(x, y, vx, vy, kind){
    const k = kind || (Math.random() < .14 ? 'ribbon' : Math.random() < .12 ? 'star' : Math.random() < .3 ? 'disc' : 'rect'), big = k === 'ribbon';
    parts.push({ k, x, y, vx, vy, w: big ? rnd(5, 8) : rnd(6, 12), h: big ? rnd(70, 130) : rnd(9, 17), r: rnd(0, 6.3), vr: big ? rnd(-3, 3) : rnd(-11, 11), c: COLS[(Math.random()*COLS.length)|0],
      foil: Math.random() < .35, f: rnd(0, 6.3), fs: rnd(3.5, 7), life: big ? rnd(4.5, 6.5) : rnd(3.5, 5.5), tail: big ? [] : null, drag: big ? .18 : .35 }); }
  function cannons(n){ const W = innerWidth, H = innerHeight;
    for (let i=0;i<n;i++){ const s = i % 2 ? 1 : -1, x = s < 0 ? -10 : W + 10; piece(x, H*(.8 + rnd(-.08, .08)), -s*rnd(300, 760), -rnd(560, 1080)); } }
  function fountain(n){ const W = innerWidth, H = innerHeight;
    for (let i=0;i<n;i++){ const a = -Math.PI/2 + rnd(-.42, .42), v = rnd(700, 1250); piece(W/2 + rnd(-30, 30), H + 10, Math.cos(a)*v, Math.sin(a)*v); } }
  function pop(x, y, n){ for (let i=0;i<n;i++){ const a = Math.random()*Math.PI*2, v = rnd(120, 420); piece(x, y, Math.cos(a)*v, Math.sin(a)*v - 120, Math.random() < .5 ? 'disc' : 'rect'); } }
  function star(w){ cx.beginPath(); for (let i=0;i<10;i++){ const a = i*Math.PI/5 - Math.PI/2, r = i % 2 ? w*.42 : w; cx.lineTo(Math.cos(a)*r, Math.sin(a)*r); } cx.closePath(); cx.fill(); }
  function tick(now){
    const dt = Math.min(.05, (now - last)/1000 || .016); last = now;
    windT -= dt; if (windT <= 0){ windT = rnd(.6, 1.6); wind = rnd(-90, 90); }
    if (rainT > 0){ rainT -= dt; for (let k=0;k<3;k++) piece(rnd(0, innerWidth), -14, rnd(-30,30), rnd(40,140)); }
    for (let i = pops.length-1; i >= 0; i--){ const q = pops[i]; q.t -= dt; if (q.t <= 0){ pops.splice(i, 1); pop(q.x, q.y, q.n); } }
    cx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => (p.life -= dt) > 0 && p.y < innerHeight + 40);
    for (const p of parts){
      const k = Math.pow(p.drag, dt); p.vy += 620*dt; p.vx = (p.vx - wind)*k + wind; p.vy = Math.min(p.vy, (p.k === 'ribbon' ? 130 : 170) + Math.sin(p.f)*40); p.f += dt*p.fs; p.r += p.vr*dt;
      p.x += (p.vx + Math.sin(p.f)*(p.k === 'ribbon' ? 70 : 40))*dt; p.y += p.vy*dt;
      const flash = p.foil && Math.sin(p.f*2.3) > .75, al = Math.min(1, p.life);
      cx.globalAlpha = al; cx.fillStyle = flash ? '#ffffff' : p.c;
      if (p.k === 'ribbon'){ const t = p.tail; t.unshift([p.x, p.y]); if (t.length > 9) t.length = 9;
        cx.strokeStyle = cx.fillStyle; cx.lineWidth = p.w*(.6 + .4*Math.abs(Math.cos(p.f))); cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.beginPath(); cx.moveTo(t[0][0], t[0][1]);
        for (let j=1;j<t.length;j++) cx.lineTo(t[j][0] + Math.sin(p.f + j*.9)*6, t[j][1]); cx.stroke(); continue; }
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.scale(1, Math.cos(p.f*1.7));
      if (p.k === 'disc'){ cx.beginPath(); cx.arc(0, 0, p.w*.55, 0, 6.2832); cx.fill(); }
      else if (p.k === 'star') star(p.w*.75);
      else cx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      cx.restore();
    }
    cx.globalAlpha = 1;
    if (parts.length || rainT > 0 || pops.length) raf = requestAnimationFrame(tick); else { raf = 0; cv.hidden = true; }
  }
  return {
    // n: how big a show (pieces from the cannons); rain: seconds of slow foil rain afterwards. A big show also gets the fountain,
    // a second volley from the cannons and a scatter of pops across the top of the screen
    burst(n, rain){ if (REDUCED) return; cv.hidden = false; size(); COLS = palette(); cannons(n);
      if (n >= 100){ fountain(Math.round(n*.6)); pops.push({ t:.35, x:innerWidth*.5, y:innerHeight*.28, n:36 });
        for (let i=0;i<6;i++) pops.push({ t:.5 + i*.3 + rnd(0, .15), x:innerWidth*(.12 + .76*Math.random()), y:innerHeight*(.1 + .3*Math.random()), n:22 });
        pops.push({ t:1.1, x:-20, y:innerHeight*.5, n:0 }); setTimeout(() => { if (!cv.hidden) cannons(Math.round(n*.5)); }, 900); }
      else if (n >= 50){ fountain(Math.round(n*.4)); for (let i=0;i<2;i++) pops.push({ t:.4 + i*.35, x:innerWidth*(.3 + .4*Math.random()), y:innerHeight*.25, n:18 }); }
      rainT = Math.max(rainT, rain || 0); if (!raf){ last = performance.now(); raf = requestAnimationFrame(tick); } },
    stop(){ parts = []; pops = []; rainT = 0; cv.hidden = true; cx.clearRect(0, 0, innerWidth, innerHeight); },
  };
})();
// the moment you cross the line
function playerFinished(){
  const place = standings().indexOf(player) + 1; cel.place = place; cel.t = 0;
  cel.medal = awardMedal(place); tutorDone();
  const b = $('finBanner');
  $('finPlace').innerHTML = place + '<small>' + ord(place).slice(String(place).length) + '</small>';
  $('finLine').textContent = place === 1 ? 'Stage win' : place <= 3 ? 'Podium finish' : 'Finished';
  b.className = 'p' + Math.min(place, 4); b.hidden = false; void b.offsetWidth; b.classList.add('on');
  fanfare(place);
  if (place <= 3){
    const n = place === 1 ? 9 : 4;
    for (let i=0;i<n;i++) launchFirework(.25 + i*(place === 1 ? .45 : .6), place === 1 && i % 3 === 0);
    confetti.burst(place === 1 ? 180 : 80, place === 1 ? 3 : .8);
  }
}
function celebrateUpdate(dt){ cel.t += dt; fireworksUpdate(dt); }
function stopCelebration(){ cel.queue.length = 0; document.body.classList.remove('inresults'); $('finBanner').hidden = true; $('finBanner').classList.remove('on'); confetti.stop(); }

// Grand Tour points: shown provisionally while rivals are still out, banked when you leave the screen (or everyone is in)
function tourPts(st){
  if (tour.banked) return tour.pts;
  const m = new Map(tour.pts); st.forEach((c,i) => m.set(c, m.get(c) + (TOUR_POINTS[i] || 0))); return m;
}
function bankTour(){ if (tour && !tour.banked){ tourAward(standings()); tour.banked = true; } }
function tourTableHTML(st){
  const order = [...tourPts(st).entries()].sort((a,b) => b[1]-a[1]), n = tour.log.length + (tour.banked ? 0 : 1);
  return '<tr class="th"><td></td><td>Grand Tour · after ' + n + ' of ' + WORLD_ORDER.length + (tour.banked ? '' : ' <small>provisional</small>') + '</td><td class="t">Pts</td></tr>'
    + order.map(([c,p],i) => `<tr class="${c.player?'me':''}"><td class="n">${i+1}</td><td>#${c.L.num} ${c.L.name}<small>${c.prof.name}</small></td><td class="t">${p}</td></tr>`).join('');
}
function renderResults(justIn){
  const st = standings(); const place = st.indexOf(player)+1;
  $('resTitle').textContent = (place===1 ? '1st · Stage win' : ord(place)+' place');
  $('resKicker').textContent = world.name + ' · ' + LEVELS[level].name;
  const allIn = st.every(c => c.finished);
  $('resTable').innerHTML = st.map((c,i) => {
    const time = c.finished ? fmt(c.finishTime) : '<span class="run"><i></i>Lap ' + Math.min(LAPS, c.laps+1) + '/' + LAPS + '</span>';
    const gap = c.finished && i > 0 && st[0].finished ? '<em>+' + (c.finishTime - st[0].finishTime).toFixed(2) + '</em>' : '';
    return `<tr class="${c.player?'me':''}${c===justIn?' just':''}" style="--i:${i}"><td class="n"><span class="medal m${i+1}">${i+1}</span></td><td>#${c.L.num} ${c.L.name}<small>${c.prof.name}</small></td><td class="t">${gap}${time}</td></tr>`; }).join('')
    + `<tr class="best" style="--i:${st.length}"><td></td><td>Your best lap${cel.newBest ? ' <span class="rec">New record</span>' : ''}</td><td class="t">${fmt(Math.min(...player.lapTimes))}</td></tr>`;
  if (tour){
    if (allIn) bankTour();
    $('resTable').innerHTML += tourTableHTML(st);
    const last = tour.i >= WORLD_ORDER.length-1;
    if (last){ const order = [...tourPts(st).entries()].sort((a,b) => b[1]-a[1]), pos = order.findIndex(([c]) => c.player) + 1;
      $('resTitle').textContent = pos === 1 ? 'Grand Tour Champion' : ord(pos) + ' overall'; $('resKicker').textContent = 'Grand Tour · ' + LEVELS[level].name; $('againBtn').textContent = 'New Grand Tour'; }
    else $('againBtn').textContent = 'Next: ' + WORLDS[WORLD_ORDER[tour.i+1]].name;
  } else $('againBtn').textContent = 'Race again';
  $('res').classList.toggle('win', place === 1);
  if (cel.medal){ const md = cel.medal; $('resMedal').hidden = false;
    $('resMedal').innerHTML = medalBadge(md.m) + '<span>' + MEDAL_NAMES[md.m] + ' medal · ' + world.name + (md.up ? ' <span class="new">New</span>' : ' · best so far: ' + MEDAL_NAMES[medalOf(world.id)]) + '</span><span style="margin-left:auto;color:#c9b597">' + md.pts + ' pts</span>';
    $('resGoal').innerHTML = (md.fresh.length ? '<b>Unlocked: ' + md.fresh.map(u => u.name).join(', ') + '</b> · ' : '') + 'Next goal: ' + nextGoal().t; }
  else { $('resMedal').hidden = true; $('resGoal').innerHTML = ''; }
}
function showResults(){
  $('finBanner').hidden = true; $('finBanner').classList.remove('on');
  const tb = $('resTable'); tb.classList.add('intro'); setTimeout(() => tb.classList.remove('intro'), 1600);
  renderResults();
  $('res').hidden = false; state='done'; $('pauseBtn').hidden = true; cel.orbit = 0; cel.base = player.h + 2.4;
  document.body.classList.add('inresults');
  if (cel.place === 1){ confetti.burst(110, 2); for (let i=0;i<8;i++) launchFirework(.5 + i*.55, i % 2 === 0); }
  else if (cel.place <= 3){ confetti.burst(60, 0); for (let i=0;i<3;i++) launchFirework(.6 + i*.9, false); }
  if (tour && tour.i >= WORLD_ORDER.length-1 && $('resTitle').textContent === 'Grand Tour Champion'){ confetti.burst(220, 4); fanfare(1); }
}

function snapCam(){ const pc=player.prof, fx=Math.sin(camH), fz=Math.cos(camH), py = player.y||0; camPos.set(player.x-fx*pc.camBack, py+pc.camH+.2, player.z-fz*pc.camBack); camLook.set(player.x+fx*4, py+pc.lookH, player.z+fz*4); }

function applyPixelRatio(){ renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr) * dynScale); renderer.setSize(innerWidth, innerHeight, false); }
function applyQuality(){
  Q = QUALITY[quality]; dynScale = 1;
  const sh = Q.shadow > 0;
  if (renderer.shadowMap.enabled !== sh){ renderer.shadowMap.enabled = sh; scene.traverse(o => { if (o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m => m.needsUpdate = true); }); }
  sun.castShadow = sh;
  if (sh){ if (sun.shadow.mapSize.x !== Q.shadow){ sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; } } }
  renderer.shadowMap.autoUpdate = !(sh && Q.shadowEvery > 1);
  renderer.shadowMap.type = Q.shadow >= 1024 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  applyPixelRatio();
  document.querySelectorAll('.gopt').forEach(b => b.setAttribute('aria-checked', String(b.dataset.q === quality)));
}
function resize(){ const w=innerWidth, h=innerHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); buildMap(); dust.material.uniforms.scale.value = h*.55; if (typeof tankSmoke !== 'undefined') tankSmoke.mat.uniforms.scale.value = h*.55; sparks.mat.uniforms.scale.value = glitter.mat.uniforms.scale.value = h*.55; try { embers.mat.uniforms.scale.value = flames.mat.uniforms.scale.value = flameCore.mat.uniforms.scale.value = h*.55; for (const f of [smokeFx, ashFx, lavaFx, lavaHotFx, sandCloudFx]) f.mat.uniforms.scale.value = h*.55; } catch(_){} }
addEventListener('resize', resize);

let lastDraw = 0, frameN = 0, perfAcc = 0, perfN = 0, perfT = 0, mapT = 0;
function frame(now){
  // frame cap: the preset's rate while racing, a slow tick on menus and pause screens
  const racing = (state==='race' || state==='count' || state==='insp' || (state==='done' && $('res').hidden)) && !paused;
  const menuAnim = state==='menu' && (slide || Math.abs(menuZoom - (menuStep===2 ? 1 : 0)) > .01);
  const celebrating = state==='done' && cel.t < 7;
  const cap = racing ? Q.fps : (menuAnim || celebrating) ? (Q.fps || 60) : 20;
  if (cap && now - lastDraw < 1000/cap - 3){ requestAnimationFrame(frame); return; }
  const gap = now - lastDraw; lastDraw = now; frameN++;
  // dynamic resolution: if frames keep arriving late, draw fewer pixels; give them back when there's headroom
  if (racing && Q.fps){ perfAcc += gap; perfN++; perfT += gap;
    if (perfT > 2000){ const avg = perfAcc/perfN, target = 1000/Q.fps;
      if (avg > target*1.3 && dynScale > .6){ dynScale = Math.max(.6, dynScale - .12); applyPixelRatio(); }
      else if (avg < target*1.08 && dynScale < 1){ dynScale = Math.min(1, dynScale + .06); applyPixelRatio(); }
      perfAcc = perfN = perfT = 0; } }
  if (Q.shadow && Q.shadowEvery > 1) renderer.shadowMap.needsUpdate = frameN % Q.shadowEvery === 0;
  let dt = Math.min(.05, (now-last)/1000); last = now;
  const dtReal = dt; if (slowmo > 0 && !paused){ slowmo -= dt; dt *= .3; }
  const t = now/1000;

  if (!paused && (state==='count' || state==='race')) tutorUpdate();
  if (!paused && state==='count'){
    const before = Math.ceil(countT-.6); countT -= dt; const after = Math.ceil(countT-.6);
    if (after!==before && after>0) showToast(String(after), 700);
    if (countT<=.6 && before>0) showToast('GO!', 700);
    if (countT<=.6){ state='race'; }
    for (const c of cars) syncMesh(c, dt);
  }
  if (!paused && (state==='race' || state==='done')){
    raceTime += dt;
    for (const c of cars){
      const inp = (c.player && !c.finished) ? playerInput() : (c.player ? Object.assign(aiInput(c,t),{maxMul:.55}) : aiInput(c,t));
      step(c, inp, dt); lapCheck(c); carDust(c, dt); updateMeter(c, dt); aiAbility(c);
    }
    if (state==='race' && !player.finished) ghostRecord();
    collide();
    for (const c of cars) obstacleCollide(c);
    if (doneT>0){ doneT-=dt; if (doneT<=0) showResults(); }
    // wrong way
    const sp = Math.hypot(player.vx,player.vz);
    if (state==='race' && sp>8 && (player.vx*T[player.idx].x + player.vz*T[player.idx].z) < -sp*.4){ wrongT += dt; if (wrongT>.8){ showToast('Wrong way', 600); wrongT=0; } } else wrongT=0;
  }
  if (!paused){
    updateDust(dt); clockT += dt;
    for (const u of HAZ.updaters) u(clockT, dt);
    sparks.update(dt); glitter.update(dt); celebrateUpdate(dtReal);
  }
  if (!paused){
    const mode = state==='menu' || state==='count' || (state==='insp' && !DEMO.on) ? 'idle' : 'drive';
    for (const c of cars){ const r = c.rigs[c.kind]; if (r && r.wrap.visible) r.rig.update(c, dt, mode); }
    tankSmoke.update(dt); updateShells(dt); surpriseUpdate(dt); for (const c of cars) burnUpdate(c, dt); nightUpdate(dt);
    for (const c of cars) if (c._shield && c._shield.visible) c._shield.material.uniforms.uT.value = clockT;
  }
  ghostUpdate(paused ? 0 : dt); drawLines(dtReal); musicUpdate(dtReal);

  // camera
  if (state==='insp'){ inspFrame(dtReal); }
  else if (state==='menu'){
    // garage: slow orbit close in; world step: pull back and up to show the planet
    menuZoom += ((menuStep===2 ? 1 : 0) - menuZoom) * (1 - Math.exp(-dtReal*3.5));
    const z = menuZoom*menuZoom*(3-2*menuZoom), pv = player.prof.pivot;
    menuOrbit += dtReal * (.25 - .13*z);
    const aspect = (canvas.clientWidth || 1) / (canvas.clientHeight || 1), fit = Math.max(1, 1.25/aspect);   // narrow screens: step back so the whole vehicle fits
    const a = menuOrbit, mr = (pv ? 13 : 10) * (1 + 1.6*z) * fit, ch = (pv ? 4.6 : 3.2) * (1 - z) + 11*z, lh = (pv ? 1.9 : 1.2) * (1 - z) + 3*z;
    camera.up.set(0, 1, 0); camera.position.set(player.x+Math.sin(a)*mr, (player.y||0)+ch, player.z+Math.cos(a)*mr); camera.lookAt(player.x, (player.y||0)+lh, player.z);
    const off = menuSlideOffset(dtReal);
    if (off){ _menuR.set(1,0,0).applyQuaternion(camera.quaternion); camera.position.addScaledVector(_menuR, off*mr*1.7); }
    camera.fov = 50; menuViewOffset(); camera.updateProjectionMatrix();
  } else if (state==='done' && !$('res').hidden && !paused){
    // results: a slow victory orbit around your vehicle, framed beside the results card on wide screens
    cel.orbit += dtReal*.16; const pc = player.prof, R = pc.camBack*1.5, a = cel.base + cel.orbit;
    camPos.lerp(new THREE.Vector3(player.x + Math.sin(a)*R, (player.y||0) + pc.camH*1.15, player.z + Math.cos(a)*R), 1 - Math.exp(-dtReal*2.5));
    camLook.lerp(new THREE.Vector3(player.x, (player.y||0) + pc.lookH + 1.2, player.z), 1 - Math.exp(-dtReal*4));
    camera.up.set(0, 1, 0); camera.position.copy(camPos); camera.lookAt(camLook);
    camera.fov += (55 - camera.fov)*Math.min(1, dtReal*2);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (W >= 900 && H > 500) camera.setViewOffset(W, H, -W*.2, 0, W, H); else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    camera.updateProjectionMatrix();
  } else {
    if (camera.view && camera.view.enabled) camera.clearViewOffset();
    const sp = Math.hypot(player.vx,player.vz);
    const velH = sp>4 ? Math.atan2(player.vx,player.vz) : player.h;
    const tgtH = player.h + wrapA(velH-player.h)*.35;
    camH += wrapA(tgtH-camH)*Math.min(1, dt*4.5);
    const fx=Math.sin(camH), fz=Math.cos(camH);
    const pc = player.prof, air = airLift(player);
    const spK = Math.min(sp/MAXS, 1.4), rushK = Math.max(0, Math.min(1, (spK - .3)/.7));
    let back = pc.camBack*(.82 - .1*rushK) + spK*1.4, hgt = pc.camH*(.72 - .14*rushK), lookF = 7 + 3*rushK, lookH = pc.lookH*(.85 - .14*rushK);   // close and low, lower still at speed: the road and the roadside rush past
    if (camMode === 1){ back *= 1.55; hgt *= 1.9; lookF = 9; }
    megaCam += ((player.air && player.air.mega ? 1 : 0) - megaCam)*Math.min(1, dt*(player.air ? .9 : 2.5));   // the Meltdown Gap: the camera eases back and up for the view
    if (camMode < 2 && megaCam > .001){ back += 16*megaCam; hgt += 9*megaCam; lookF += 26*megaCam; lookH -= 22*megaCam; }
    if (camMode === 2){ const ext = extentsOf(player); back = -(ext.nose + 1.0); hgt = Math.max(pc.lookH*.75 + .4, ext.top*.62); lookF = 40; lookH = pc.lookH*.6; }   // hood cam: just ahead of the model's actual nose, whatever the vehicle
    const k = camMode === 2 ? 1 : 1-Math.exp(-dt*7);
    if (camMode === 3 && finishCam <= 0){                 // top-down: straight above, the nose pointing up the screen and the track scrolling under the car
      const py = player.y || 0, tk = typeof tunnelK === 'number' ? tunnelK : 0, up = (24 + Math.min(sp/MAXS, 1.4)*7)*(1 - tk) + 16*tk, ahead = (7 + Math.min(sp/MAXS, 1.4)*5)*(1 - .5*tk);   // inside a tunnel it ducks under the roof and widens its view
      camPos.lerp(new THREE.Vector3(player.x + fx*ahead, py + up + air*.6, player.z + fz*ahead), 1-Math.exp(-dt*8));
      camLook.lerp(new THREE.Vector3(player.x + fx*ahead, py, player.z + fz*ahead), 1-Math.exp(-dt*8));
    } else
    if (finishCam > 0){                                   // slow side-on sweep past the line
      finishCam -= dtReal; const a = player.h + Math.PI/2 + (1 - finishCam/2.4)*.9;
      camPos.lerp(new THREE.Vector3(player.x + Math.sin(a)*pc.camBack*.9, (player.y||0) + pc.camH*.7, player.z + Math.cos(a)*pc.camBack*.9), 1-Math.exp(-dtReal*5));
      camLook.set(player.x, (player.y||0) + pc.lookH, player.z);
    } else {
      const py = player.y || 0, gy = world.elev ? trackY(player.x-fx*back, player.z-fz*back, player.idx) : 0;        // behind the car the road may be higher or lower: keep the camera above it
      camPos.lerp(new THREE.Vector3(player.x-fx*back, Math.max(py, gy) + hgt + air, player.z-fz*back), k);
      // on a star jump the camera follows the nose: it tilts up at the stars while climbing, then down at the deck as the car drops
      const fly = player.air ? clamp(player.air.vy, -16, 22)*.55 : (world.elev ? slopeAtPos(player.x, player.z, player.idx)*lookF*.8 : 0);
      camLook.lerp(new THREE.Vector3(player.x+fx*lookF, py + lookH + air + fly, player.z+fz*lookF), camMode === 2 ? 1 : 1-Math.exp(-dt*12));
    }
    if (player.loop && SKYLOOP && camMode !== 3 && finishCam <= 0){
      // in the loop the camera rides the deck itself: a set distance back round the curve and a few metres above the deck there,
      // so it can never cut a chord through the structure (the loop is tight: a point straight back along the nose lands on the deck)
      const Lp = SKYLOOP, st = player.loop, sb = st.s - back/Lp.L, ch = camMode === 2 ? hgt : Math.max(hgt, 4.5);
      Lp.frameAt(Math.max(0, sb), _lf); const cp = _lf.p.clone().addScaledVector(_lf.s, st.off);
      if (sb < 0) cp.addScaledVector(_lf.t, sb*Lp.L);                              // still on the road before the foot
      cp.addScaledVector(_lf.u, ch);
      Lp.frameAt(st.s, _lf); const lp = _lf.p.clone().addScaledVector(_lf.s, st.off);
      camPos.lerp(cp, camMode === 2 ? 1 : 1 - Math.exp(-dt*18));
      camLook.lerp(lp.addScaledVector(_lf.t, Math.min(lookF, 6)).addScaledVector(_lf.u, lookH), camMode === 2 ? 1 : 1 - Math.exp(-dt*18)); }
    _lUp.lerp(player.loop && camMode !== 3 ? _lf.u : new THREE.Vector3(0, 1, 0), 1 - Math.exp(-dt*7)).normalize();   // eases back to level as you come off
    camera.position.copy(camPos);
    if (quakeT > 0){ quakeT = Math.max(0, quakeT - dtReal); const env = Math.min(1, (quakeDur - quakeT)/.25)*Math.pow(quakeT/quakeDur, .7); shake = Math.max(shake, quakeAmp*env);
      if (state === 'race' && Math.random() < env*dtReal*40) emit(player.x + rnd(-30, 30), (player.y||0) + .2, player.z + rnd(-30, 30), rnd(-2, 2), rnd(1, 3), rnd(-2, 2), rnd(1.6, 3), rnd(.8, 1.4)); if (!quakeT) quakeAmp = 0; }
    if (shake > 0){ camera.position.x += rnd(-1,1)*shake*.5; camera.position.y += rnd(-1,1)*shake*.35; shake = Math.max(0, shake - dtReal*2.2); }
    if (camMode !== 3 && finishCam <= 0){ const j = rushK*rushK*(.035 + .03*(player.boost > 0 ? 1 : 0)); camera.position.x += rnd(-1,1)*j; camera.position.y += rnd(-1,1)*j*.7; }   // a fine judder at the top end
    if (camMode === 3 && finishCam <= 0) camera.up.set(fx, 0, fz); else camera.up.copy(_lUp);   // looking straight down, "up" on screen is the way the car is heading
    camera.lookAt(camLook);
    // the camera never sits inside a vehicle: nudged out of any rival it has run into (hood cam ramming someone, a rival parked where the chase camera is), hidden only if it still is
    for (const c of cars){ if (c.player && camMode !== 2) { if (c._camHide){ c._camHide = false; c.group.visible = true; } continue; }
      const dx = camera.position.x - c.x, dz = camera.position.z - c.z, d = Math.hypot(dx, dz), keep = c.prof.rad*.6, near = Math.abs((c.y||0) + 1.2 - camera.position.y) < 4;
      let d2 = d; if (!c.player && near && d < keep){ const k = (keep - d)/(d||1); camera.position.x += dx*k; camera.position.z += dz*k; if (d < .05){ camera.position.x += keep; } d2 = keep; }
      const inside = near && d2 < c.prof.rad*.3; if (inside !== !!c._camHide){ c._camHide = inside; c.group.visible = !inside; } }
    if (camMode === 2){ const dx = camera.position.x - player.x, dz = camera.position.z - player.z, dpl = dx*Math.sin(player.h) + dz*Math.cos(player.h), inCab = dpl < extentsOf(player).nose + .4;   // pushed back into our own cabin: hide the car rather than stare at the dashboard
      if (inCab !== !!player._camHide){ player._camHide = inCab; player.group.visible = !inCab; } }
    const fov = camMode === 3 ? 52 + 14*(typeof tunnelK === 'number' ? tunnelK : 0) : 60 + spK*19 + (player.boost>0?8:0) + 10*megaCam + (active(player,'hook')?5:0);
    camera.fov += (fov-camera.fov)*Math.min(1,dt*3); camera.updateProjectionMatrix();
  }
  skyDome.position.copy(camera.position); celestialUpdate(dt || 1/60);
  sun.position.set(player.x+SUN_OFF.x, (player.y||0)+SUN_OFF.y, player.z+SUN_OFF.z); sun.target.position.set(player.x,player.y||0,player.z);
  if (state==='insp') inspSun();

  // HUD
  const st = standings(); const place = st.indexOf(player)+1;
  $('pos').innerHTML = place+'<small>/'+cars.length+'</small>';
  $('lap').innerHTML = Math.min(LAPS, Math.max(1, player.laps+1))+'<small>/'+LAPS+'</small>';
  $('time').textContent = fmt(player.finished ? player.finishTime : raceTime);
  $('best').textContent = fmt(bestLap);
  const kmh = Math.round(Math.abs(player.f)*3.4);
  $('kmh').textContent = kmh;
  $('draftTag').classList.toggle('on', state==='race' && (player.draft||0) > .3);
  { const d = $('drift'), v = player.drift||0, on = state==='race' && (player.driftHeld || v > .05);
    d.classList.toggle('on', on);
    if (on){ const tier = v >= DRIFT.tiers[2] ? 3 : v >= DRIFT.tiers[1] ? 2 : v >= DRIFT.tiers[0] ? 1 : 0; d.className = 'hud panel on t' + tier;
      $('driftBar').style.width = (v*100) + '%'; $('driftLbl').textContent = tier ? DRIFT.names[tier-1].toUpperCase() + ' · release' : 'DRIFT'; } }
  { const box = $('abil'), on = state==='race' || state==='count'; box.hidden = !on;
    if (on){ const A = abilOf(player), act = player.abilT > 0, ready = !act && player.meter >= 100;
      $('abilName').textContent = A.name; $('abilKey').textContent = act ? 'active' : ready ? (matchMedia('(pointer:coarse)').matches ? 'tap ★' : 'ready · E') : Math.floor(player.meter) + '%';
      $('abilBar').style.width = (act ? player.abilT/A.dur*100 : player.meter) + '%';
      box.classList.toggle('ready', ready); box.classList.toggle('on', act); $('abilBtn').classList.toggle('ready', ready); } }
  // gap to the racer directly ahead and behind, refreshed four times a second
  if ((state==='race' || state==='count') && (frame._gapT = (frame._gapT||0) + dt) > .25){ frame._gapT = 0;
    const box = $('gaps'); box.hidden = false;
    const i = st.indexOf(player), ref = Math.max(12, Math.abs(player.f));
    const fmtGap = (o, sign) => { if (!o) return sign > 0 ? 'Leading' : 'Last'; const s = Math.abs(o.prog - player.prog)*segLen/ref;
      return (sign > 0 ? '▲ ' : '▼ ') + o.L.name.replace(/^.*\. /,'') + ' <b>' + (sign > 0 ? '+' : '−') + s.toFixed(1) + 's</b>'; };
    $('gapA').innerHTML = fmtGap(st[i-1], 1); $('gapB').innerHTML = fmtGap(st[i+1], -1);
  } else if (state==='menu') $('gaps').hidden = true;
  $('bar').firstElementChild.style.width = Math.min(100, kmh/(MAXS*3.4+80)*100)+'%';
  mapT += dtReal; if (mapT > .1){ mapT = 0; drawMap(); } updateAudio();

  renderFrame();
  requestAnimationFrame(frame);
}

/* ---------- Inspector: an admin UFO that flies over any world, carries its own lights and probes what it looks at ----------
   Opened with I (menu, results or pause) or the Inspector button in Settings. The UFO hovers at 30 km/h and, with Shift held,
   runs up to 400 km/h; it climbs high enough to see the whole track. Its hull and dome reflect and refract the real world around
   it (a cube camera rides with it), and its glow and spot beam are real lights, so whatever they hit shows how that surface
   answers light. The panel cycles worlds and vehicles, parks the vehicle under the UFO, and reads out the material under the crosshair. */
const IN_HOVER = 30/3.4, IN_TURBO = 400/3.4;                 // the game's speedo reads |speed|×3.4 km/h
const IN_COLS = [ { n:'White', c:0xffffff }, { n:'Warm', c:0xffc27a }, { n:'Cyan', c:0x4ff4ff }, { n:'Green', c:0x7dff8a }, { n:'Magenta', c:0xff4fd8 }, { n:'Red', c:0xff3a2a } ];
const IN_CAMS = ['Chase cam', 'Pilot cam', 'Top-down'];
const IN_FOGS = ['Fog: lifts with height', 'Fog: as in race', 'Fog: off'];
const INSP = { on:false, ufo:null, x:0, y:12, z:0, h:0, vx:0, vy:0, vz:0, idx:0, turbo:0, turboLock:false, keys:{},
  cam:0, oy:0, op:0, zoom:1, lamp:true, beam:true, col:2, inten:1, reach:1, fog:0, rivals:true, probe:true,
  probeT:0, readT:0, capN:0, fps:0, fpsAcc:0, fpsN:0, bank:0, pitch:0, t:0, ground:0, roadY:0 };
const inCubeRT = new THREE.WebGLCubeRenderTarget(IS_TOUCH ? 128 : 256, { format:THREE.RGBFormat, generateMipmaps:true, minFilter:THREE.LinearMipmapLinearFilter, encoding:THREE.sRGBEncoding });
const inCube = new THREE.CubeCamera(.5, 3200, inCubeRT);

function inspBuildUfo(){
  const ufo = new THREE.Group(), body = new THREE.Group(); ufo.add(body);
  const env = inCubeRT.texture;
  // hull panels: seams around and across, painted once into the colour map
  const panelTex = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#cfd5dd'; x.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 2600; i++){ x.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)'; x.fillRect(Math.random()*1024, Math.random()*256, 2 + Math.random()*6, 1); }
    x.strokeStyle = '#3a3f46'; x.lineWidth = 3;
    for (const v of [.18, .42, .62, .8]){ x.beginPath(); x.moveTo(0, v*256); x.lineTo(1024, v*256); x.stroke(); }
    for (let i = 0; i < 24; i++){ const u = i/24*1024, off = (i % 2) ? 0 : 26; x.beginPath(); x.moveTo(u + off, .18*256); x.lineTo(u + off, .8*256); x.stroke(); }
    x.strokeStyle = 'rgba(200,120,60,.55)'; x.lineWidth = 1.5; for (const v of [.2, .44]){ x.beginPath(); x.moveTo(0, v*256); x.lineTo(1024, v*256); x.stroke(); }   // the thin copper trims of the reference
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; return t; })();
  const bellyTex = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 256);
    x.strokeStyle = '#fff'; x.lineWidth = 3; for (let i = 0; i < 12; i++){ const u = (i + .5)/12*1024; x.beginPath(); x.moveTo(u, 30); x.lineTo(u, 200); x.stroke(); }
    x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(0, 22, 1024, 5); x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(0, 120, 1024, 3);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t; })();
  const hullM = new THREE.MeshStandardMaterial({ map:panelTex, color:0xffffff, metalness:1, roughness:.16, envMap:env, envMapIntensity:1.15 });
  const bellyM = new THREE.MeshStandardMaterial({ color:0x2a3a2c, metalness:.85, roughness:.3, envMap:env, envMapIntensity:.9, emissive:new THREE.Color(0x4ff4ff), emissiveMap:bellyTex, emissiveIntensity:1.3 });
  const top = new THREE.LatheGeometry([[1.18,.9],[1.22,.86],[1.5,.78],[2.0,.58],[2.6,.32],[3.0,.14],[3.07,.06],[3.08,0]].map(p => new THREE.Vector2(p[0], p[1])), 72);
  const belly = new THREE.LatheGeometry([[3.08,0],[3.0,-.1],[2.6,-.3],[2.0,-.5],[1.3,-.62],[.5,-.68],[0,-.69]].map(p => new THREE.Vector2(p[0], p[1])), 72);
  const hull = new THREE.Mesh(top, hullM), bel = new THREE.Mesh(belly, bellyM); hull.castShadow = bel.castShadow = true; body.add(hull, bel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.06, .09, 10, 96), new THREE.MeshStandardMaterial({ color:0x1d2228, metalness:1, roughness:.25, envMap:env })); rim.rotation.x = Math.PI/2; body.add(rim);
  // the glass dome: a shader that refracts the cube-camera view with a little dispersion, and reflects it at grazing angles
  const domeM = new THREE.ShaderMaterial({ fog:false,
    uniforms:{ env:{ value:env }, tint:{ value:new THREE.Color(0xbff7ff) }, ior:{ value:1.45 }, disp:{ value:.035 }, glowCol:{ value:new THREE.Color(0x4ff4ff) }, glow:{ value:.35 } },
    vertexShader:'varying vec3 vN; varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader:'uniform samplerCube env; uniform vec3 tint; uniform float ior; uniform float disp; uniform vec3 glowCol; uniform float glow; varying vec3 vN; varying vec3 vW;\n' +
      'void main(){ vec3 V = normalize(vW - cameraPosition); vec3 N = normalize(vN); float c = clamp(dot(-V, N), 0.0, 1.0); float fr = mix(.05, 1.0, pow(1.0 - c, 4.0));\n' +
      ' vec3 refr = vec3(textureCube(env, refract(V, N, 1.0/(ior - disp))).r, textureCube(env, refract(V, N, 1.0/ior)).g, textureCube(env, refract(V, N, 1.0/(ior + disp))).b);\n' +
      ' vec3 refl = textureCube(env, reflect(V, N)).rgb; vec3 col = mix(refr*tint, refl, fr) + glowCol*glow*pow(1.0 - c, 2.0);\n' +
      ' gl_FragColor = vec4(col, 1.0); }' });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.18, 48, 20, 0, Math.PI*2, 0, Math.PI/2), domeM); dome.position.y = .88; body.add(dome);
  const domeRing = new THREE.Mesh(new THREE.TorusGeometry(1.2, .06, 8, 64), new THREE.MeshBasicMaterial({ color:0x4ff4ff })); domeRing.rotation.x = Math.PI/2; domeRing.position.y = .9; body.add(domeRing);
  // rim lamps (a chasing ring) and the upper portholes: lit lenses on the hull, not lights of their own
  const lampG = new THREE.SphereGeometry(.075, 10, 8), rimN = 36;
  const rimL = new THREE.InstancedMesh(lampG, new THREE.MeshBasicMaterial({ color:0xffffff }), rimN), m4 = new THREE.Matrix4();
  for (let i = 0; i < rimN; i++){ const a = i/rimN*Math.PI*2; m4.makeTranslation(Math.sin(a)*3.11, .0, Math.cos(a)*3.11); rimL.setMatrixAt(i, m4); rimL.setColorAt(i, new THREE.Color(0x4ff4ff)); }
  body.add(rimL);
  // portholes: flat lit lenses laid on the hull's slope (raised beads read as ink blots once the comic pass outlines them)
  const portN = 10, portG = new THREE.CircleGeometry(.16, 20); portG.rotateX(-Math.PI/2);
  const port = new THREE.InstancedMesh(portG, new THREE.MeshBasicMaterial({ color:0xffe6b0, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 }), portN);
  { const tilt = Math.atan2(.4, 1), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    for (let i = 0; i < portN; i++){ const a = (i + .5)/portN*Math.PI*2; e.set(tilt, a, 0, 'YXZ'); q.setFromEuler(e); pv.set(Math.sin(a)*1.9, .625, Math.cos(a)*1.9); m4.compose(pv, q, one); port.setMatrixAt(i, m4); } }
  body.add(port);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(.26, 20, 12), new THREE.MeshBasicMaterial({ color:0x4ff4ff })); lens.position.y = -.66; lens.scale.y = .5; body.add(lens);
  // the emitters: a wide glow under the belly and a spot beam straight down (both real lights: they only show where they land on something)
  const glow = new THREE.PointLight(0x4ff4ff, 0, 40, 2); glow.position.set(0, -1.1, 0); ufo.add(glow);
  const spot = new THREE.SpotLight(0x4ff4ff, 0, 140, .42, .55, 1.4); spot.position.set(0, -.8, 0); spot.target.position.set(0, -60, 0); ufo.add(spot, spot.target);
  spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -.0006; spot.shadow.camera.near = .6; spot.shadow.camera.far = 400;
  ufo.traverse(o => { o.userData.insp = true; });
  return { ufo, body, hull, bel, dome, domeM, rimL, port, lens, bellyM, domeRing, glow, spot };
}

function inspSetColor(){
  if (!INSP.ufo) return; const U = INSP.ufo, col = new THREE.Color(IN_COLS[INSP.col].c);
  U.glow.color.copy(col); U.spot.color.copy(col); U.lens.material.color.copy(col); U.bellyM.emissive.copy(col);
  document.querySelectorAll('#ipCols .ipSw').forEach((b, i) => b.setAttribute('aria-pressed', String(i === INSP.col)));
}
function inspApplyLights(){
  if (!INSP.ufo) return; const U = INSP.ufo, on = INSP.lamp;
  U.glow.intensity = on ? 2.4*INSP.inten : 0; U.glow.distance = 42*INSP.reach;
  U.spot.intensity = (on && INSP.beam) ? 3.2*INSP.inten : 0; U.spot.distance = 150*INSP.reach;
  U.spot.castShadow = Q.shadow > 0;
  U.lens.visible = on; U.bellyM.emissiveIntensity = on ? 1.3 : .15;
  $('ipLamp').setAttribute('aria-pressed', String(on)); $('ipLamp').textContent = on ? 'Glow on' : 'Glow off';
  $('ipBeam').setAttribute('aria-pressed', String(INSP.beam)); $('ipBeam').textContent = INSP.beam ? 'Spot beam on' : 'Spot beam off';
  $('ipLampT').setAttribute('aria-pressed', String(on));
}

// the road surface under a point: the nearest track sample, and how far from it
function inspNearest(x, z){
  let best = 1e18, bi = INSP.idx;
  for (let k = -40; k <= 40; k++){ const i = (INSP.idx + k + N) % N, dx = x - P[i].x, dz = z - P[i].z, d = dx*dx + dz*dz; if (d < best){ best = d; bi = i; } }
  if (best > 3600) for (let i = 0; i < N; i += 2){ const dx = x - P[i].x, dz = z - P[i].z, d = dx*dx + dz*dz; if (d < best){ best = d; bi = i; } }
  INSP.idx = bi; const lat = (x - P[bi].x)*R[bi].x + (z - P[bi].z)*R[bi].z;
  const y = world.elev ? trackY(x, z, bi) : (H[bi] || 0);
  return { i:bi, lat, y, d:Math.sqrt(best) };
}

function inspPlaceAtStart(){
  const i = player.idx || 0, t = T[i];
  INSP.x = P[i].x - t.x*16; INSP.z = P[i].z - t.z*16; INSP.idx = i;
  INSP.y = (world.elev ? trackY(INSP.x, INSP.z, i) : (H[i] || 0)) + 7;
  INSP.h = Math.atan2(t.x, t.z); INSP.vx = INSP.vy = INSP.vz = 0; INSP.oy = 0; INSP.op = 0; INSP.capN = 0; INSP.fresh = true;
}

function inspEnter(){
  if (INSP.on) return;
  if (paused) setPaused(false);
  tipHide(); stopCelebration(); tour = null; slowmo = 0; finishCam = 0; doneT = 0;
  if (ghost.mesh) ghost.mesh.visible = false; $('ghostDelta').hidden = true;
  placeOnGrid(); propsReset(); surpriseReset();
  $('res').hidden = true; $('menu').hidden = true; $('pauseScr').hidden = true; $('pauseBtn').hidden = true; closeSettings();
  $('finBanner').hidden = true; $('toast').classList.remove('on');
  document.body.classList.remove('inmenu'); document.body.classList.add('inspecting'); slide = null;
  if (camera.view && camera.view.enabled) camera.clearViewOffset();
  if (!INSP.ufo) INSP.ufo = inspBuildUfo();
  scene.add(INSP.ufo.ufo);
  state = 'insp'; INSP.on = true; INSP.keys = {};
  inspPlaceAtStart();
  camera.far = 16000; camera.fov = 60; camera.updateProjectionMatrix();
  renderer.info.autoReset = false; renderer.info.reset();
  $('insp').hidden = false;
  if (matchMedia('(max-width:600px)').matches) inspMin(true);
  inspRenderPanel(); inspSetColor(); inspApplyLights(); inspSetRivals(INSP.rivals); inspRenderDemo();
  showToast('Inspector', 900);
}
function inspExit(toMenu){
  if (!INSP.on) return;
  demoStop(true); DEMO.follow = -1;
  INSP.on = false; INSP.keys = {};
  scene.remove(INSP.ufo.ufo);
  for (const c of cars) c.group.visible = true;
  scene.fog = new THREE.Fog(world.fog[0], world.fog[1], world.fog[2]);
  camera.far = 3200; camera.updateProjectionMatrix();
  renderer.info.autoReset = true;
  $('insp').hidden = true; document.body.classList.remove('inspecting');
  state = 'menu';
  if (toMenu) quitToMenu();
}

function inspWorld(id){
  if (!WORLDS[id]) return;
  const racing = DEMO.on; demoStop(true);
  if (id !== world.id){
    buildWorld(id); try { localStorage.setItem('dustrunner-world', id); } catch(_){}
    try { rollRivals(); } catch(_){}
    placeOnGrid(); propsReset(); try { renderSpec(); } catch(_){}
    inspSetRivals(INSP.rivals);
  }
  inspPlaceAtStart(); inspRenderPanel();
  showToast(WORLDS[id].name, 900);
  if (racing) demoStart();
}
function inspStepWorld(d){ const i = WORLD_ORDER.indexOf(world.id); inspWorld(WORLD_ORDER[(i + d + WORLD_ORDER.length) % WORLD_ORDER.length]); }
function inspCar(k){
  if (k !== 'truck' && !MODELS[k]) return;
  const keep = { x:player.x, z:player.z, h:player.h, y:player.y, idx:player.idx };
  vehicle = k; setKind(player, k); try { applySkin(); } catch(_){}
  try { localStorage.setItem('dustrunner-vehicle', k); } catch(_){} try { renderSpec(); } catch(_){}
  Object.assign(player, keep); syncMesh(player, 1); inspRenderPanel();
  showToast(VEHICLES[k].name, 800);
}
function inspStepCar(d){ const av = availableKinds(); inspCar(av[(av.indexOf(vehicle) + d + av.length) % av.length]); }
function inspBring(){
  player.loop = null;
  const n = inspNearest(INSP.x, INSP.z), i = n.i, lat = clamp(n.lat, -W/2 + 2.5, W/2 - 2.5);
  player.x = P[i].x + R[i].x*lat; player.z = P[i].z + R[i].z*lat; player.idx = i;
  player.h = Math.atan2(T[i].x, T[i].z); if (Math.sin(INSP.h)*T[i].x + Math.cos(INSP.h)*T[i].z < 0) player.h += Math.PI;   // facing the way the UFO is
  player.y = world.elev ? trackY(player.x, player.z, i) : (H[i] || 0);
  player.vx = player.vz = player.f = player.l = 0; player.air = null; player.airT = 0;
  syncMesh(player, 1); showToast('Parked', 700);
}
function inspDrive(){ inspExit(false); tour = null; startRace(); }
function inspSetRivals(on){ INSP.rivals = on; for (const c of cars) if (!c.player){ c.group.visible = on || !INSP.on; }
  const b = $('ipRiv'); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Rivals shown' : 'Rivals hidden'; }
function inspMin(on){ $('ipPanel').classList.toggle('min', on); $('ipMin').textContent = on ? '+' : '–'; $('ipMin').setAttribute('aria-expanded', String(!on)); }
function inspOverview(){                                   // straight up over the middle of the circuit, high enough to see all of it
  if (DEMO.follow >= 0) demoFollow(-1);
  INSP.x = TRACK_C.x; INSP.z = TRACK_C.z; INSP.vx = INSP.vz = INSP.vy = 0; INSP.capN = 0;
  const n = inspNearest(INSP.x, INSP.z); INSP.roadY = n.y; INSP.y = n.y + clamp(TRACK_R*1.2, 160, 2000);
  INSP.cam = 0; INSP.op = 0; INSP.oy = 0; camPos.set(INSP.x, INSP.y + 40, INSP.z - 10); INSP.fresh = true; inspRenderPanel(); }
function inspSector(){ if (DEMO.follow >= 0) demoFollow(-1); const i = (inspNearest(INSP.x, INSP.z).i + Math.round(N/8)) % N, t = T[i];
  const up = INSP.y - INSP.roadY; INSP.x = P[i].x; INSP.z = P[i].z; INSP.idx = i; INSP.h = Math.atan2(t.x, t.z); INSP.vx = INSP.vz = 0;
  INSP.y = (world.elev ? trackY(P[i].x, P[i].z, i) : (H[i] || 0)) + Math.max(4, up); INSP.fresh = true; }

function inspRenderPanel(){
  $('ipWorlds').innerHTML = WORLD_ORDER.map((id, n) => '<button class="ipChip" data-w="' + id + '" aria-pressed="' + (id === world.id) + '" title="' + WORLDS[id].sig + ' · key ' + (n + 1) + '">' + WORLDS[id].name + '</button>').join('');
  $('ipCars').innerHTML = availableKinds().map(k => '<button class="ipChip" data-v="' + k + '" aria-pressed="' + (k === vehicle) + '">' + VEHICLES[k].name + '</button>').join('');
  if (!$('ipCols').children.length) $('ipCols').innerHTML = IN_COLS.map((c, i) => '<button class="ipSw" data-c="' + i + '" title="' + c.n + '" aria-label="' + c.n + ' light" style="background:#' + c.c.toString(16).padStart(6, '0') + '"></button>').join('');
  $('ipCam').textContent = IN_CAMS[INSP.cam]; $('ipFog').textContent = IN_FOGS[INSP.fog];
  $('ipInk').setAttribute('aria-pressed', String(lookOn)); $('ipInk').textContent = lookOn ? 'Comic ink on' : 'Comic ink off';
  $('ipProbeB').setAttribute('aria-pressed', String(INSP.probe)); $('ipProbeB').textContent = INSP.probe ? 'Probe on' : 'Probe off'; $('ipReticle').hidden = !INSP.probe || INSP.cam !== 1;
}

/* ---------- panel and keys ---------- */
$('ipWorlds').addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (b) inspWorld(b.dataset.w); });
$('ipCars').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) inspCar(b.dataset.v); });
$('ipCols').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; INSP.col = +b.dataset.c; inspSetColor(); });
$('ipBring').addEventListener('click', inspBring);
$('ipDemo').addEventListener('click', () => DEMO.on ? demoStop() : demoStart());
$('ipFollow').addEventListener('click', () => demoFollow(DEMO.follow + 1 > cars.length ? -1 : DEMO.follow + 1));
$('ipBoard').addEventListener('click', e => { const b = e.target.closest('[data-car]'); if (!b) return; const k = +b.dataset.car + 1; demoFollow(DEMO.follow === k ? -1 : k); });
// a clicked button keeps focus, and Space (climb) would press it again: hand focus back to the page, sliders excepted
$('ipPanel').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTimeout(() => b.blur(), 0); });
$('ipDrive').addEventListener('click', inspDrive);
$('ipExit').addEventListener('click', () => inspExit(true));
$('ipMin').addEventListener('click', () => inspMin(!$('ipPanel').classList.contains('min')));
$('ipLamp').addEventListener('click', () => { INSP.lamp = !INSP.lamp; inspApplyLights(); });
$('ipLampT').addEventListener('click', () => { INSP.lamp = !INSP.lamp; inspApplyLights(); });
$('ipBeam').addEventListener('click', () => { INSP.beam = !INSP.beam; inspApplyLights(); });
$('ipCam').addEventListener('click', () => { INSP.cam = (INSP.cam + 1) % IN_CAMS.length; INSP.op = 0; INSP.probeT = 1; inspRenderPanel(); });
$('ipOver').addEventListener('click', inspOverview);
$('ipFog').addEventListener('click', () => { INSP.fog = (INSP.fog + 1) % IN_FOGS.length; inspRenderPanel(); });
$('ipRiv').addEventListener('click', () => inspSetRivals(!INSP.rivals));
$('ipInk').addEventListener('click', () => { setLook(!lookOn); inspRenderPanel(); });
$('ipProbeB').addEventListener('click', () => { INSP.probe = !INSP.probe; inspRenderPanel(); });
$('ipTurboT').addEventListener('click', () => { INSP.turboLock = !INSP.turboLock; $('ipTurboT').setAttribute('aria-pressed', String(INSP.turboLock)); });
{ const rng = (id, key) => { const r = $(id), o = $(id + 'V'); r.addEventListener('input', () => { INSP[key] = r.value/100; o.textContent = r.value + '%'; inspApplyLights(); }); };
  rng('ipInt', 'inten'); rng('ipReach', 'reach'); }
document.querySelectorAll('#ipTouch .ipK[data-k]').forEach(b => { const k = b.dataset.k;
  const dn = e => { e.preventDefault(); INSP.keys[k] = true; b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch(_){} };
  const up = () => { INSP.keys[k] = false; b.classList.remove('down'); };
  b.addEventListener('pointerdown', dn); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up); });
// the settings sheet and the pause screen each get a way in
{ const sheetBtn = document.createElement('button'); sheetBtn.className = 'ghost tog'; sheetBtn.id = 'inspBtn'; sheetBtn.textContent = 'Open the inspector (I)'; sheetBtn.title = 'Fly a UFO over any world: lights, reflections, every vehicle';
  const lbl = document.createElement('div'); lbl.className = 'lbl2'; lbl.textContent = 'Admin';
  const anchor = $('lookBtn').previousElementSibling; anchor.parentNode.insertBefore(lbl, anchor); anchor.parentNode.insertBefore(sheetBtn, anchor);
  sheetBtn.addEventListener('click', inspEnter);
  const pb = document.createElement('button'); pb.className = 'ghost'; pb.textContent = 'Inspector'; pb.addEventListener('click', inspEnter); $('quitBtn').after(pb); }

addEventListener('keydown', e => {
  const k = e.key.toLowerCase(), inField = e.target && e.target.closest && e.target.closest('input,textarea,select');
  if (!INSP.on){
    if (k === 'i' && !e.repeat && !inField && (state === 'menu' || state === 'done' || paused)){ e.preventDefault(); e.stopImmediatePropagation(); inspEnter(); }
    return;
  }
  if (inField && k.startsWith('arrow')) return;                     // let a slider take its arrows
  e.stopImmediatePropagation(); musicKick();
  if (['arrowup','arrowdown','arrowleft','arrowright',' ','pageup','pagedown','home'].includes(k)) e.preventDefault();
  INSP.keys[k] = true;
  if (DEMO.follow >= 0 && DEMO.on && ['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){ demoFollow(-1); showToast('Free flight', 600); }
  if (e.repeat) return;
  if (k === 'escape' || k === 'i') inspExit(true);
  else if (k === 'enter' && !(e.target && e.target.closest && e.target.closest('button'))) inspDrive();
  else if (k === '[' ) inspStepWorld(-1);
  else if (k === ']') inspStepWorld(1);
  else if (k >= '1' && k <= '9' && WORLD_ORDER[+k - 1]) inspWorld(WORLD_ORDER[+k - 1]);
  else if (k === 'v') inspStepCar(e.shiftKey ? -1 : 1);
  else if (k === 'b') inspBring();
  else if (k === 'l') { INSP.lamp = !INSP.lamp; inspApplyLights(); }
  else if (k === 'k') { INSP.beam = !INSP.beam; inspApplyLights(); }
  else if (k === 't') { INSP.col = (INSP.col + 1) % IN_COLS.length; inspSetColor(); }
  else if (k === 'c') { INSP.cam = (INSP.cam + 1) % IN_CAMS.length; INSP.op = 0; INSP.probeT = 1; inspRenderPanel(); showToast(IN_CAMS[INSP.cam], 600); }
  else if (k === 'o') inspOverview();
  else if (k === 'g') inspSetRivals(!INSP.rivals);
  else if (k === 'h') inspMin(!$('ipPanel').classList.contains('min'));
  else if (k === 'n') inspSector();
  else if (k === 'home') { if (DEMO.follow >= 0) demoFollow(-1); inspPlaceAtStart(); }
  else if (k === 'y') DEMO.on ? demoStop() : demoStart();
  else if (k === 'u') { if (!DEMO.on) showToast('Start the demo first · Y', 900); else { demoFollow(DEMO.follow + 1 > cars.length ? -1 : DEMO.follow + 1); showToast(demoFollowLabel().replace('Follow: ', 'Following '), 700); } }
  else if (k === 'm') toggleMute();
}, true);
addEventListener('keyup', e => { if (INSP.on) INSP.keys[e.key.toLowerCase()] = false; }, true);
addEventListener('blur', () => { INSP.keys = {}; });
// drag to look around the UFO, wheel or pinch-less zoom with the wheel
{ let drag = null;
  canvas.addEventListener('pointerdown', e => { if (!INSP.on) return; drag = { id:e.pointerId, x:e.clientX, y:e.clientY }; try { canvas.setPointerCapture(e.pointerId); } catch(_){} });
  canvas.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    INSP.oy -= dx*.006; INSP.op = clamp(INSP.op + dy*.005, -1.2, 1.2); });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('dblclick', () => { if (INSP.on){ INSP.oy = 0; INSP.op = 0; INSP.zoom = 1; } });
  canvas.addEventListener('wheel', e => { if (!INSP.on) return; e.preventDefault(); INSP.zoom = clamp(INSP.zoom*Math.exp(e.deltaY*.0012), .35, 4); }, { passive:false }); }

/* ---------- demo race: every car on autopilot, lap after lap with no finish, while the UFO watches or rides along ---------- */
const DEMO = { on:false, t:0, follow:-1, stuckT:0, progMark:0, boardT:0 };     // follow: -1 free flight, 0 the leader, k the k-th car
INSP.followUp = 9;
function demoTarget(){ if (!DEMO.on || DEMO.follow < 0) return null; return DEMO.follow === 0 ? standings()[0] : cars[DEMO.follow - 1] || null; }
function demoReset(){
  placeOnGrid(); propsReset(); surpriseReset(); for (const c of cars) burnClear(c);
  shells.splice(0).forEach(o => scene.remove(o.m));
}
function demoStart(){
  inspSetRivals(true); demoReset(); prepRivals();
  raceTime = 0; DEMO.t = -3; DEMO.on = true; DEMO.stuckT = 0; DEMO.progMark = player.prog;
  player.ai.skill = .95; player.ai.lastT = undefined;           // your vehicle drives itself, at a rival's pace
  if (DEMO.follow < 0) demoFollow(0);
  inspRenderDemo(); showToast('3', 600);
}
function demoStop(quiet){
  if (!DEMO.on) return; DEMO.on = false; player.ai.skill = .86;
  for (const c of cars) if (c.abilT > 0){ c.abilT = 0; try { endAbility(c); } catch(_){} }
  demoReset(); inspRenderDemo(); if (!quiet) showToast('Demo stopped', 700);
}
function demoFollow(f){
  DEMO.follow = f;
  if (f >= 0){ INSP.followUp = clamp(INSP.y - INSP.roadY, 4, 600); if (INSP.followUp < 5) INSP.followUp = 9; INSP.oy = 0; }
  inspRenderDemo();
}
function demoFollowLabel(){ const c = demoTarget(); return DEMO.follow < 0 ? 'Follow: off' : DEMO.follow === 0 ? 'Follow: leader' : 'Follow: ' + (c ? c.L.name.replace(/^.*\. /, '') : '—'); }
function demoStep(dt){
  if (!DEMO.on || dt <= 0) return;
  const t = performance.now()/1000;
  if (DEMO.t < 0){                                           // on the grid: 3 · 2 · 1 · GO
    const a = Math.ceil(-DEMO.t); DEMO.t += dt; const b = Math.ceil(-DEMO.t);
    if (b !== a) showToast(b > 0 ? String(b) : 'GO!', 600);
    for (const c of cars) syncMesh(c, dt);
    return;
  }
  DEMO.t += dt;
  const was = state; state = 'race';                          // the race code asks "is a race on?" in many places: for this step, one is
  try {
    raceTime += dt;
    for (const c of cars){
      step(c, aiInput(c, t), dt);
      c.laps = Math.max(c.laps, Math.floor(c.prog/N));        // laps count up and nobody finishes
      carDust(c, dt);
      if (c.player){ if (c.abilT > 0){ c.abilT -= dt; if (c.abilT <= 0) endAbility(c); } else { c.meter = Math.min(100, c.meter + 4*dt); if (c.meter >= 100 && Math.random() < .01) useAbility(c); } }
      else { updateMeter(c, dt); aiAbility(c); }
    }
    collide(); for (const c of cars) obstacleCollide(c);
    // the rivals rescue themselves when stuck; your vehicle on autopilot needs the same help
    if (player.prog > DEMO.progMark + 1){ DEMO.progMark = player.prog; DEMO.stuckT = 0; }
    else if ((DEMO.stuckT += dt) > 3){ respawnRival(player); DEMO.stuckT = 0; DEMO.progMark = player.prog; }
  } finally { state = was; }
  if ((DEMO.boardT += dt) > .25){ DEMO.boardT = 0; inspRenderBoard(); }
}
function inspRenderDemo(){
  const b = $('ipDemo'); b.textContent = DEMO.on ? 'Stop demo race' : 'Start demo race'; b.classList.toggle('go', !DEMO.on);
  $('ipFollow').textContent = demoFollowLabel(); $('ipFollow').disabled = !DEMO.on;
  $('ipBoard').hidden = !DEMO.on; if (DEMO.on) inspRenderBoard();
}
function inspRenderBoard(){
  const st = standings(), lead = st[0], ref = Math.max(12, Math.abs(lead.f)), tgt = demoTarget();
  $('ipBoard').innerHTML = '<div class="ipBH"><span>Lap ' + (lead.laps + 1) + '</span><span>' + fmt(Math.max(0, raceTime)) + '</span></div>' +
    st.map((c, i) => '<button class="ipBR" data-car="' + cars.indexOf(c) + '" aria-pressed="' + (c === tgt) + '">' +
      '<b>' + (i + 1) + '</b><i style="background:#' + new THREE.Color(c.L.body).getHexString() + '"></i>' +
      '<span>' + (c.player ? 'You' : c.L.name.replace(/^.*\. /, '')) + ' <em>' + VEHICLES[c.kind].name + '</em></span>' +
      '<small>' + (i === 0 ? Math.round(Math.abs(c.f)*3.4) + ' km/h' : '+' + ((lead.prog - c.prog)*segLen/ref).toFixed(1) + 's') + '</small></button>').join('');
}

/* ---------- each frame ---------- */
const _inV = new THREE.Vector3(), _inRay = new THREE.Raycaster(), _inC = new THREE.Vector2(0, 0);
function inspFly(dt){
  const k = INSP.keys, U = INSP.ufo;
  const fwd = ((k.w || k.arrowup) ? 1 : 0) - ((k.s || k.arrowdown) ? 1 : 0);
  const turn = ((k.a || k.arrowleft) ? 1 : 0) - ((k.d || k.arrowright) ? 1 : 0);
  const side = (k.e ? 1 : 0) - (k.q ? 1 : 0);
  const lift = ((k.r || k[' '] || k.pageup) ? 1 : 0) - ((k.f || k.x || k.pagedown) ? 1 : 0);
  const turboOn = !!(k.shift || INSP.turboLock);
  INSP.turbo += ((turboOn ? 1 : 0) - INSP.turbo)*Math.min(1, dt*(turboOn ? 1.1 : 2.5));
  const tgt = demoTarget();
  if (tgt && (fwd || turn || side)){ DEMO.follow = -1; inspRenderDemo(); showToast('Free flight', 600); }
  const follow = demoTarget();
  let sp = Math.hypot(INSP.vx, INSP.vz), n, floor;
  if (follow){
    // riding with a racer: behind it and above, at a height R / F still sets; it keeps pace at any speed
    INSP.followUp = clamp(INSP.followUp + lift*dt*(6 + INSP.followUp*.6), 2.5, 600);
    const back = 5 + INSP.followUp*.15, ox = INSP.x, oz = INSP.z, oy = INSP.y, k2 = 1 - Math.exp(-dt*5);
    INSP.h += wrapA(follow.h - INSP.h)*Math.min(1, dt*3);
    const wx = follow.x - Math.sin(INSP.h)*back, wz = follow.z - Math.cos(INSP.h)*back, wy = (follow.y || 0) + INSP.followUp;
    INSP.x += follow.vx*dt; INSP.z += follow.vz*dt;
    INSP.x += (wx - INSP.x)*k2; INSP.z += (wz - INSP.z)*k2; INSP.y += (wy - INSP.y)*k2;
    if (dt > 0){ INSP.vx = (INSP.x - ox)/dt; INSP.vz = (INSP.z - oz)/dt; INSP.vy = (INSP.y - oy)/dt; }
    n = inspNearest(INSP.x, INSP.z); INSP.roadY = n.y; floor = n.y + 1.5; INSP.y = Math.max(INSP.y, floor); sp = Math.hypot(INSP.vx, INSP.vz);
  } else {
    INSP.h += turn*dt*(1.7/(1 + sp/45));
    const mfx = Math.sin(INSP.h), mfz = Math.cos(INSP.h), mrx = -mfz, mrz = mfx;      // right = forward turned a quarter clockwise seen from above
    let dx = mfx*fwd + mrx*side, dz = mfz*fwd + mrz*side; const dl = Math.hypot(dx, dz); if (dl > 1){ dx /= dl; dz /= dl; }
    const maxS = IN_HOVER + (IN_TURBO - IN_HOVER)*INSP.turbo;
    const tvx = dx*maxS, tvz = dz*maxS, acc = (turboOn ? 55 : 14)*(dl > 0 ? 1 : 1.6);       // 0 → 400 km/h in a little over two seconds once turbo spools
    const ex = tvx - INSP.vx, ez = tvz - INSP.vz, el = Math.hypot(ex, ez), st = Math.min(el, acc*dt);
    if (el > 1e-4){ INSP.vx += ex/el*st; INSP.vz += ez/el*st; }
    INSP.x += INSP.vx*dt; INSP.z += INSP.vz*dt;
    n = inspNearest(INSP.x, INSP.z); INSP.roadY = n.y;
    floor = (n.d < W/2 + 6 ? n.y : Math.min(n.y, world.groundY || 0)) + 1.5;
    const alt = Math.max(0, INSP.y - n.y), vMax = (turboOn ? 70 : 7) + alt*.35;   // climbs faster the higher it is, so the overview is seconds away
    INSP.vy += (lift*vMax - INSP.vy)*Math.min(1, dt*(lift ? 3 : 5));
    INSP.y = clamp(INSP.y + INSP.vy*dt, floor, n.y + 2200); if (INSP.y <= floor && INSP.vy < 0) INSP.vy = 0;
  }
  INSP.ground = floor;
  const fx = Math.sin(INSP.h), fz = Math.cos(INSP.h), rx = -fz, rz = fx;
  // pose: lean into turns and slides, nose down when speeding up, a lazy hover bob
  const latV = INSP.vx*rx + INSP.vz*rz, fwdV = INSP.vx*fx + INSP.vz*fz;
  INSP.bank += (clamp(-turn*.18*(.4 + sp/40) - latV*.012, -.45, .45) - INSP.bank)*Math.min(1, dt*4);
  INSP.pitch += (clamp(fwd*.08*(1 + INSP.turbo) - (fwdV < 0 ? -.02 : 0), -.2, .25) - INSP.pitch)*Math.min(1, dt*3);
  INSP.t += dt;
  const g = U.ufo; g.position.set(INSP.x, INSP.y + Math.sin(INSP.t*2.1)*.12*(1 - INSP.turbo), INSP.z); g.rotation.order = 'YXZ'; g.rotation.y = INSP.h;
  U.body.rotation.set(INSP.pitch, 0, INSP.bank);
  U.spot.target.position.set(0, -60, 0);
  // rim lamps chase round the hull; at turbo they run fast and hot
  const rimN = U.rimL.count, ph = INSP.t*(3 + INSP.turbo*14), cyan = new THREE.Color(0x4ff4ff), hot = new THREE.Color(0xffb15a), c = new THREE.Color();
  for (let i = 0; i < rimN; i++){ const w = .35 + .65*Math.pow(.5 + .5*Math.sin(i/rimN*Math.PI*6 - ph), 3); c.copy(cyan).lerp(hot, INSP.turbo*.6).multiplyScalar(w); U.rimL.setColorAt(i, c); }
  U.rimL.instanceColor.needsUpdate = true;
  return { sp, alt:INSP.y - n.y, n };
}

function inspCamera(dt, snap){
  const U = INSP.ufo, alt = Math.max(0, INSP.y - INSP.roadY), sm = s => s*s*(3 - 2*s);
  const hi = sm(clamp((alt - 10)/260, 0, 1));
  let pos, look;
  U.body.visible = INSP.cam !== 1;
  if (INSP.cam === 1){                                       // pilot: under the belly, looking where it flies and a little down
    const yaw = INSP.h + INSP.oy, p = -.22 - .9*hi - INSP.op*.8;
    pos = new THREE.Vector3(INSP.x, INSP.y - 1.0, INSP.z);
    look = pos.clone().add(new THREE.Vector3(Math.sin(yaw)*Math.cos(p), Math.sin(p), Math.cos(yaw)*Math.cos(p)));
    camera.position.copy(pos); camera.up.set(0, 1, 0); camera.lookAt(look);
  } else if (INSP.cam === 2){                                // top-down over the UFO, north up its heading
    const up = (18 + alt*.9)*INSP.zoom;
    camPos.lerp(new THREE.Vector3(INSP.x, INSP.y + up, INSP.z), 1 - Math.exp(-dt*6));
    camera.position.copy(camPos); camera.up.set(Math.sin(INSP.h + INSP.oy), 0, Math.cos(INSP.h + INSP.oy)); camera.lookAt(INSP.x, INSP.y - 1, INSP.z);
  } else {                                                   // chase: behind and above, tipping toward straight-down as it climbs
    const yaw = INSP.h + INSP.oy, p = clamp(.26 + 1.12*hi + INSP.op, -.25, 1.5), d = (13 + alt*.55)*INSP.zoom;
    const want = new THREE.Vector3(INSP.x - Math.sin(yaw)*Math.cos(p)*d, INSP.y + Math.sin(p)*d, INSP.z - Math.cos(yaw)*Math.cos(p)*d);
    want.y = Math.max(want.y, INSP.ground + .6);
    if (snap){ camPos.copy(want); camLook.set(INSP.x, INSP.y, INSP.z); }
    camPos.lerp(want, 1 - Math.exp(-dt*7));
    camLook.lerp(new THREE.Vector3(INSP.x + Math.sin(INSP.h)*3*(1 - hi), INSP.y - .4, INSP.z + Math.cos(INSP.h)*3*(1 - hi)), 1 - Math.exp(-dt*10));
    camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(camLook);
  }
  const fov = 60 + INSP.turbo*14*Math.min(1, Math.hypot(INSP.vx, INSP.vz)/IN_TURBO);
  camera.fov += (fov - camera.fov)*Math.min(1, dt*3); camera.updateProjectionMatrix();
  // fog: as raced, lifted with the camera's height so the whole track shows from above, or off
  const camUp = Math.max(0, camera.position.y - INSP.roadY), f = world.fog;
  if (!scene.fog) scene.fog = new THREE.Fog(f[0], f[1], f[2]);
  if (INSP.fog === 0){ scene.fog.near = f[1] + camUp*1.2; scene.fog.far = f[2] + camUp*3.2; }
  else if (INSP.fog === 1){ scene.fog.near = f[1]; scene.fog.far = f[2]; }
  else { scene.fog.near = 1e6; scene.fog.far = 1e6 + 1; }
}

// the hull and dome reflect what is really around them: a cube camera rides with the UFO and redraws one face of its view per frame
// (all six every sixth frame), so the reflections stay live without drawing the world six extra times a frame
function inspCapture(){
  const U = INSP.ufo, face = INSP.capN++ % 6, cams = inCube.children, rt = inCubeRT;
  const skyParent = skyDome.parent, au = renderer.shadowMap.autoUpdate, nu = renderer.shadowMap.needsUpdate, prevRT = renderer.getRenderTarget();
  U.ufo.visible = false; scene.add(skyDome); skyDome.position.set(INSP.x, INSP.y, INSP.z);
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
  inCube.position.set(INSP.x, INSP.y + .3, INSP.z); inCube.updateMatrixWorld(true);
  rt.texture.generateMipmaps = face === 5;                // mip the cube once, after its last face, as CubeCamera does
  try { renderer.setRenderTarget(rt, face); renderer.render(scene, cams[face]); } catch(e){ console.warn(e); }
  rt.texture.generateMipmaps = true; renderer.setRenderTarget(prevRT);
  renderer.shadowMap.autoUpdate = au; renderer.shadowMap.needsUpdate = nu;
  if (skyParent) skyParent.add(skyDome); U.ufo.visible = true;
}
function inspCaptureAll(){ for (let k = 0; k < 6; k++) inspCapture(); }

// what's under the crosshair: which surface, and how it answers light
const inHex = c => c ? '#' + c.getHexString() : '–';
function inspProbe(){
  if (!INSP.probe){ return; }
  // pilot cam: what the crosshair is on; the other cams look at the UFO itself, so they probe what its beam lands on
  const aim = INSP.cam === 1;
  if (aim) _inRay.setFromCamera(_inC, camera); else { _inRay.set(_inV.set(INSP.x, INSP.y - 1.2, INSP.z), new THREE.Vector3(0, -1, 0)); _inRay.camera = camera; }
  _inRay.far = 2500; $('ipProbeL').textContent = aim ? 'Under the crosshair' : 'Under the beam';
  let hits = []; try { hits = _inRay.intersectObjects(scene.children, true); } catch(_){ return; }
  const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const h = hits.find(x => { const o = x.object, m = Array.isArray(o.material) ? o.material[0] : o.material;
    return o.isMesh && !o.userData.insp && m && !(m.userData && m.userData.fx) && m.blending !== THREE.AdditiveBlending && !(m.transparent && (m.opacity < .08 || m.depthWrite === false)) && m.visible !== false && shown(o); });
  const el = $('ipProbe');
  if (!h){ el.innerHTML = '<b>Aim</b><span>nothing in reach</span>'; return; }
  const o = h.object, m = Array.isArray(o.material) ? o.material[h.face ? h.face.materialIndex : 0] || o.material[0] : o.material;
  let nm = o.name; for (let p = o.parent; !nm && p && p !== scene; p = p.parent) nm = p.name;
  const owner = cars.find(c => { for (let p = o; p; p = p.parent) if (p === c.group) return true; return false; });
  const rows = [['Object', owner ? (owner.player ? 'Your ' : 'Rival ') + VEHICLES[owner.kind].name + (nm ? ' · ' + nm : '') : (nm || (o.isInstancedMesh ? 'instanced mesh' : 'world mesh'))],
    ['Material', m.type.replace('Material', '') + (o.isInstancedMesh ? ' · ×' + o.count : '')],
    ['Distance', h.distance.toFixed(1) + ' m']];
  if (m.color) rows.push(['Colour', '<i style="background:' + inHex(m.color) + '"></i>' + inHex(m.color)]);
  if (m.metalness !== undefined) rows.push(['Metal/rough', m.metalness.toFixed(2) + ' / ' + m.roughness.toFixed(2)]);
  if (m.shininess !== undefined) rows.push(['Shininess', m.shininess.toFixed(0) + ' · spec ' + inHex(m.specular)]);
  rows.push(['Lit by lights', m.isMeshBasicMaterial || m.isShaderMaterial && !m.lights ? 'no (unlit)' : m.isMeshLambertMaterial ? 'diffuse only' : 'diffuse + specular']);
  rows.push(['Reflects', m.envMap ? 'env map ×' + (m.envMapIntensity !== undefined ? m.envMapIntensity.toFixed(2) : (m.reflectivity || 1).toFixed(2)) : 'no env map']);
  if (m.transmission) rows.push(['Refracts', 'transmission ' + m.transmission.toFixed(2) + ' · ior ' + (m.ior || 1.5).toFixed(2)]);
  if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0) rows.push(['Emissive', '<i style="background:' + inHex(m.emissive) + '"></i>×' + (m.emissiveIntensity || 1).toFixed(2)]);
  if (m.transparent) rows.push(['Opacity', m.opacity.toFixed(2) + (m.blending === THREE.AdditiveBlending ? ' · additive' : '')]);
  const maps = ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','bumpMap','alphaMap'].filter(k => m[k]); if (maps.length) rows.push(['Maps', maps.join(', ')]);
  rows.push(['Shadows', (o.castShadow ? 'casts' : '–') + ' · ' + (o.receiveShadow ? 'receives' : '–')]);
  el.innerHTML = rows.map(r => '<b>' + r[0] + '</b><span>' + r[1] + '</span>').join('');
}

function inspFrame(dt){
  demoStep(dt);
  const f = inspFly(dt), fresh = !!INSP.fresh;
  inspCamera(dt, fresh);
  skyDome.position.copy(camera.position);
  if (fresh){ INSP.fresh = false; INSP.capN = 0; inspCaptureAll(); } else inspCapture();
  // speed readout
  const kmh = Math.round(f.sp*3.4);
  $('ipKmh').textContent = kmh;
  const mEl = $('ipMode'), tb = INSP.turbo > .5; mEl.textContent = tb ? 'TURBO' : 'HOVER'; mEl.classList.toggle('turbo', tb);
  $('ipAlt').textContent = Math.round(f.alt) + ' m up';
  INSP.fpsAcc += dt; INSP.fpsN++;
  if ((INSP.probeT += dt) > .25){ INSP.probeT = 0; inspProbe(); }
  if ((INSP.readT += dt) > .2){
    const frames = Math.max(1, INSP.fpsN); INSP.fps = INSP.fpsN/INSP.fpsAcc; INSP.fpsAcc = 0; INSP.fpsN = 0; INSP.readT = 0;
    const ri = renderer.info, lights = []; scene.traverseVisible(o => { if (o.isLight && o.intensity > 0) lights.push(o); });
    $('ipStats').innerHTML = [['World', world.name + ' · ' + world.planet], ['Sector', 'sample ' + f.n.i + ' of ' + N + ' · ' + (Math.abs(f.n.lat) < W/2 ? 'over the road' : Math.round(Math.abs(f.n.lat) - W/2) + ' m off it')],
      ['Position', Math.round(INSP.x) + ', ' + Math.round(INSP.y) + ', ' + Math.round(INSP.z)], ['Heading', ((INSP.h*180/Math.PI % 360 + 360) % 360).toFixed(0) + '°'],
      ['Frame rate', INSP.fps.toFixed(0) + ' fps · ' + Math.round(dynScale*100) + '% res'], ['Draw calls', Math.round(ri.render.calls/frames) + ' · ' + Math.round(ri.render.triangles/frames/1000) + 'k tris'],
      ['Lights on', lights.length + ' · ' + ri.programs.length + ' shaders'], ['Look', (lookOn ? 'comic ink' : 'clean') + ' · ' + QUALITY[quality].name]]
      .map(r => '<b>' + r[0] + '</b><span>' + r[1] + '</span>').join('');
    renderer.info.reset();
  }
  // the vehicle list fills in as the bundled models finish loading
  if ($('ipCars').children.length !== availableKinds().length) inspRenderPanel();
}
function inspSun(){ const gx = INSP.x, gz = INSP.z, gy = INSP.roadY; sun.position.set(gx + SUN_OFF.x, gy + SUN_OFF.y, gz + SUN_OFF.z); sun.target.position.set(gx, gy, gz); }
// the minimap shows the UFO too: a cyan arrow with its heading
{ const draw0 = drawMap; drawMap = function(){ draw0(); if (!INSP.on || !mapBase) return; const dpr = mapC._dpr || 1, x = INSP.x*mapScale + mapOff[0], y = INSP.z*mapScale + mapOff[1], h = INSP.h;
  mctx.save(); mctx.translate(x, y); mctx.rotate(-h); mctx.fillStyle = '#4ff4ff'; mctx.strokeStyle = '#06262a'; mctx.lineWidth = 1.5*dpr;
  mctx.beginPath(); mctx.moveTo(0, 7*dpr); mctx.lineTo(5*dpr, -5*dpr); mctx.lineTo(0, -2*dpr); mctx.lineTo(-5*dpr, -5*dpr); mctx.closePath(); mctx.fill(); mctx.stroke(); mctx.restore(); }; }
try { if (/inspect/i.test(location.hash)) setTimeout(inspEnter, 300); } catch(_){}
window.DR87_INSPECTOR = { tidy:() => TIDY_REPORT, goto:(i, lat = 0, up = 6) => { i = ((i % N) + N) % N; if (DEMO.follow >= 0) demoFollow(-1); INSP.x = P[i].x + R[i].x*lat; INSP.z = P[i].z + R[i].z*lat; INSP.idx = i; INSP.h = Math.atan2(T[i].x, T[i].z); INSP.y = (world.elev ? trackY(INSP.x, INSP.z, i) : (H[i] || 0)) + up; INSP.vx = INSP.vy = INSP.vz = 0; INSP.fresh = true; }, world:(id) => inspWorld(id), demo:() => ({ on:DEMO.on, t:DEMO.t, follow:DEMO.follow, race:raceTime, cars:cars.map(c => [c.L.name, Math.round(c.prog), Math.round(Math.abs(c.f)*3.4), c.laps]) }), state:INSP, open:inspEnter, close:() => inspExit(true), player:() => ({ x:player.x, z:player.z, gx:player.group.position.x, gz:player.group.position.z, idx:player.idx }) };   // for poking at it from the console

placeOnGrid(); resize(); applyQuality(); camH = player.h; snapCam();
$('best').textContent = fmt(bestLap);
setCtrl(ctrlMode); $('cpick').addEventListener('click', e => { const b = e.target.closest('.gopt'); if (b) setCtrl(b.dataset.c); });
var autoPaused = false;
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (canPause() && !paused) setPaused(true); });   // window lost focus (alt-tab): release held keys and pause
document.addEventListener('visibilitychange', ()=>{ last = performance.now();
  if (document.hidden && canPause() && !paused){ setPaused(true); autoPaused = true; }
  else if (!document.hidden && autoPaused && paused){ autoPaused = false; setPaused(false); if (state === 'race' && !player.finished){ countT = 3.6; state = 'count'; } }   // back in the tab: straight back to racing, with a 3-2-1 to get your hands on the controls
  if (actx) document.hidden ? actx.suspend() : actx.resume(); });
document.body.classList.add('inmenu');
requestAnimationFrame(frame);
})();
