/* =====================================================================
   DR87 Halloween event build: the game side of online races and the practice track.
   The lobby, sign-up and the network live in apps/web/src/event (TypeScript); they drive this through window.__EV.
   - Online race: Hollow Ridge, 5 cars = you + up to 2 other people (net cars, posed from their snapshots) + AI.
     Net cars never collide with anyone and no hazard here costs a try, so nobody can wreck another person's race.
   - Practice: the Practice Grid (white and grey road on a wireframe terrain), alone, endless laps, swap vehicle any time.
   ===================================================================== */
WORLDS.demo = { id:'demo', sig:'Practice Grid', name:'Practice Grid', planet:'Training', home:null, banner:'PRACTICE GRID  ·  DUST RUNNER 87', customGround:true,
  blurb:'A plain practice circuit: no hazards, no loops, no jumps.', hazardText:'Nothing. Just driving.',
  ctrl:[[262,0],[252,66],[220,120],[170,150],[112,146],[66,168],[30,214],[-40,226],[-112,212],[-176,176],[-226,116],[-254,44],[-252,-36],[-220,-98],[-160,-130],[-100,-118],[-50,-146],[-14,-200],[60,-222],[140,-206],[208,-156],[246,-84]],
  sky:[[0,'#06070a'],[.3,'#0b0d12'],[.45,'#151820'],[.5,'#1e222b'],[.52,'#0d0f14'],[1,'#07080b']], fog:[0x0b0d12,380,1900],
  hemi:[0xe8ecf4,0x3a3f4a,.95], sun:[0xffffff,1.0], sunDir:[-80,140,60], bg:0x0b0d12,
  ground:['#0d0f14',['#12151b','#0b0d12']],
  road:['#b9bec7',['#c6cad1','#aab0ba','#bfc3cb'],'rgba(90,96,108,.5)'],
  curb:[0xf4f5f7,0x7c828d], post:[0xf4f5f7,0x6a707b], gate:{bg:'#14161b',fg:'#f4f5f7',line:'#9aa0aa',post:0xc4c8cf},
  pad:'#ffffff', padFill:'rgba(255,255,255,.18)', dust:0xc8ccd2 };
CELEST.demo = () => [ makeStars(900, 0, .5, 0xc8d0e0, .55) ];
HAZARDS.demo = () => {};
SCENERY.demo = function demoScenery(g){
  // wireframe terrain: flat round the road, rolling hills further out; a dark skin underneath so the wires read as ground
  const S = 3600, n = 150, geo = new THREE.PlaneGeometry(S, S, n, n); geo.rotateX(-Math.PI/2);
  const pa = geo.attributes.position, samp = []; for (let i = 0; i < N; i += 3) samp.push(P[i]);
  const hill = (x, z) => 34*Math.sin(x*.0042 + 1.3)*Math.cos(z*.0037 - .4) + 16*Math.sin(x*.011 + z*.009) + 7*Math.cos(x*.023 - z*.019);
  for (let k = 0; k < pa.count; k++){
    const x = pa.getX(k) + TRACK_C.x, z = pa.getZ(k) + TRACK_C.z; let d = 1e9;
    for (const p of samp){ const dx = x - p.x, dz = z - p.z, q = dx*dx + dz*dz; if (q < d) d = q; }
    d = Math.sqrt(d); const u = clamp((d - 34)/170, 0, 1), w = u*u*(3 - 2*u);
    pa.setY(k, -.35 + w*(hill(x, z) + 18*w));
  }
  geo.computeVertexNormals();
  const skin = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color:0x0a0c10, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1 }));
  const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color:0x8a93a6, wireframe:true, transparent:true, opacity:.42, depthWrite:false }));
  for (const m of [skin, wire]){ m.position.set(TRACK_C.x, 0, TRACK_C.z); m.userData.noSolid = true; m.userData.noInk = true; g.add(m); }
  // a faint grid line under the road edges, so the road sits in the wire world
  const edge = []; for (let i = 0; i <= N; i++){ const k = i % N; for (const s of [-1, 1]){ const o = (W/2 + 2.4)*s; edge.push(P[k].x + R[k].x*o, .02, P[k].z + R[k].z*o); } }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
  const idx = []; for (let i = 0; i < N; i++){ idx.push(i*2, i*2 + 2, i*2 + 1, i*2 + 3); } eg.setIndex(idx);
  const lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color:0xb8c0d0, transparent:true, opacity:.5 })); lines.userData.noSolid = true; g.add(lines);
};

const EV = (() => {
  const E = { on:true, online:null, practice:false, hooks:{}, sendT:0 };
  const now = () => (E.hooks.now ? E.hooks.now() : Date.now());
  const call = (k, ...a) => { try { return E.hooks[k] && E.hooks[k](...a); } catch(e){ console.warn('event hook ' + k, e); } };
  const labels = document.createElement('div'); labels.id = 'evTags'; labels.setAttribute('aria-hidden', 'true'); document.body.appendChild(labels);

  function kinds(){ return VORDER.filter(k => k === 'truck' || MODELS[k]); }
  function useWorld(id){ if (world.id !== id){ buildWorld(id); placeOnGrid(); camH = player.h; snapCam(); } }
  function unbench(){ for (const c of cars){ c.bench = false; c.net = null; c.gridSlot = undefined; c.group.visible = true; if (c._baseL){ c.L = c._baseL; c._baseL = null; } } for (const t of labels.children) t.remove(); }
  function bench(c){ c.bench = true; c.group.visible = false; c.x = c.z = 1e5; c.vx = c.vz = c.f = 0; }
  function setVehicle(kind){ if (!kinds().includes(kind)) kind = 'truck'; vehicle = kind; setKind(player, kind); try { applySkin(); } catch(_){} }

  // ---------- warm-up: draw everything once, so nothing compiles or uploads mid-race ----------
  // A shader is compiled and a model or texture is sent to the graphics card the first time it is drawn. Normally that is when
  // it first comes into view (the manor over the hill, the castle, the spider on the last lap), and on a slower machine that
  // shows as a hitch. This draws the whole world once, everything forced visible and un-culled, in the same render path as a
  // normal frame (so the same shader variants), then puts everything back and draws the real frame in the same task, so the
  // warm-up frame is never on screen.
  let warmT = 0;
  // Your car's lamp group (a spot and a point light) blinks off for a moment after a crash recovery and in the inspector, and
  // the number of lights is part of every lit shader, so both states are warmed: with your lamps and without.
  function prewarm(){
    const t0 = performance.now(), L = player._lights;
    warmPass();
    if (L && L.g){ const v = L.g.visible; L.g.visible = !v; warmPass(); L.g.visible = v; }
    renderer.shadowMap.needsUpdate = true; try { renderFrame(); } catch(_){}
    return Math.round(performance.now() - t0);
  }
  function warmPass(){
    const saved = [], lights = [];
    // lights keep their real on/off state: the number of lights is part of every lit shader, so warming with extra lights
    // (the inspector UFO's, a hidden lamp group) would compile the wrong variants
    const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    scene.traverse(o => { if (o.isLight) lights.push(o, shown(o)); });
    scene.traverse(o => { saved.push(o, o.visible, o.frustumCulled); o.visible = true; o.frustumCulled = false; });
    for (let i = 0; i < lights.length; i += 2) lights[i].visible = lights[i+1];
    try { renderer.shadowMap.needsUpdate = true; renderFrame(); } catch(e){ console.warn('prewarm', e); }
    for (let i = 0; i < saved.length; i += 3){ saved[i].visible = saved[i+1]; saved[i].frustumCulled = saved[i+2]; }
  }
  // models arrive over the first seconds (manor, castle, witches, spiders, lanterns): warm again as they land
  function warmSoon(){ clearTimeout(warmT); [400, 4000, 12000].forEach((ms, k) => { const t = setTimeout(() => { if (state === 'menu') prewarm(); }, ms); if (!k) warmT = t; }); }

  // ---------- slower graphics chips: shorter view distance, thinner smog ----------
  // Fog already hides the far distance, so on Saver and Balanced the camera stops drawing just past where the fog closes in:
  // far scenery (most of the lanterns, pumpkins and trees) is skipped instead of drawn into the fog. The graveyard smog is a
  // big stack of see-through sprites, the heaviest thing for a laptop's built-in graphics, so it is thinned too.
  const REACH = { saver:{ far:1150, smog:.4 }, balanced:{ far:1900, smog:.75 }, high:{ far:3200, smog:1 } };
  function applyReach(){
    const R = REACH[quality] || REACH.high;
    camera.far = R.far; camera.updateProjectionMatrix();
    if (scene.fog && world.fog){ scene.fog.far = Math.min(world.fog[2], R.far - 60); scene.fog.near = Math.min(world.fog[1], scene.fog.far*.3); }
    try { if (HR.smog && HR.smog.m.geometry) HR.smog.m.geometry.instanceCount = Math.max(1, Math.round(HR_SMOG_N*R.smog)); } catch(_){}
    // Saver: the pumpkin patches and yards use a lighter pumpkin (about half the triangles; the ribs still read from the road)
    try { if (HR_PK.geo){
      if (!HR_PK.lo) HR_PK.lo = hrPumpkinGeo(8, 7, 12);
      const lo = quality === 'saver', seen = new Set();
      for (const p of HR.patchPk.concat(HR.fullPkIM || [])){ const im = p._im || p; if (!im || seen.has(im)) continue; seen.add(im);
        if (!im.userData.pkHi) im.userData.pkHi = im.geometry; im.geometry = lo ? HR_PK.lo : im.userData.pkHi; }
    } } catch(e){ console.warn('pumpkin detail', e); }
    try { if (shed) applyShed(); } catch(_){}
  }
  // ---------- adaptive detail: when even half resolution can't hold the frame rate, shed effects one at a time ----------
  // level 1: no shadows · level 2: no ink outline pass · level 3: smog thinned to a third. Given back one step at a time
  // once frames have room again at full resolution. Changing the graphics preset starts from level 0.
  let shed = 0; const lookWas = { v:null };
  function applyShed(){
    const sh = shed < 1 && Q.shadow > 0;
    if (renderer.shadowMap.enabled !== sh){ renderer.shadowMap.enabled = sh; scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); }); }
    sun.castShadow = sh;
    if (shed >= 2){ if (lookWas.v === null) lookWas.v = lookOn; lookOn = false; } else if (lookWas.v !== null){ lookOn = lookWas.v; lookWas.v = null; }
    try { if (HR.smog && HR.smog.m.geometry){ const R = REACH[quality] || REACH.high; HR.smog.m.geometry.instanceCount = Math.max(1, Math.round(HR_SMOG_N*R.smog*(shed >= 3 ? .33 : 1))); } } catch(_){}
  }
  let shedGood = 0;
  E.shedStep = (late, roomy, atMin = dynScale <= .5 + 1e-6, atMax = dynScale >= 1) => {   // called by the dynamic-resolution check every ~2 s while racing
    if (late && atMin && shed < 3){ shed++; shedGood = 0; applyShed(); console.info('[EV] detail cut to level', shed); }
    else if (roomy && atMax && shed > 0){ if (++shedGood >= 2){ shed--; shedGood = 0; applyShed(); console.info('[EV] detail back to level', shed); } }
    else if (!roomy) shedGood = 0;
  };
  E.resetShed = () => { if (shed){ shed = 0; shedGood = 0; applyShed(); } };

  // Saver on a computer: keep 60 fps (30 felt choppy at the event's speeds) and save the work on pixels instead, rendering at
  // 80% resolution with no shadows; when frames still run late the game's dynamic resolution steps down further. Phones keep 30 fps.
  if (!IS_TOUCH){ Object.assign(QUALITY.saver, { fps:60, dpr:.8, note:'60 fps, lower resolution, no shadows' }); if (quality === 'saver') applyQuality(); }
  // first visit: a laptop's built-in graphics (Intel, or a phone-class chip) starts on Saver
  (function pickStartQuality(){
    let saved = null; try { saved = localStorage.getItem('dustrunner-quality'); } catch(_){}
    if (saved) return;
    try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      if (/Intel|UHD|Iris|HD Graphics|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Microsoft Basic/i.test(name)){ quality = 'saver'; applyQuality(); }
    } catch(_){}
  })();

  // ---------- the lobby backdrop: Hollow Ridge, your vehicle turning on the grid ----------
  function toLobby(){
    E.online = null; E.practice = false;
    if (state !== 'menu'){ if (VOX) VOX.stop(); tipHide(); stopCelebration(); slowmo = 0; finishCam = 0; setPaused(false); state = 'menu'; doneT = 0; }
    unbench(); useWorld('hollow'); placeOnGrid(); propsReset(); surpriseReset();
    $('res').hidden = true; $('menu').hidden = true; $('pauseBtn').hidden = true; $('finBanner').hidden = true; $('gaps').hidden = true;
    document.body.classList.add('inmenu'); document.body.classList.remove('inresults', 'evRacing', 'evPractice');
    camH = player.h; snapCam(); applyReach(); warmSoon();
  }

  // ---------- practice: alone on the Practice Grid, endless laps ----------
  function startPractice(kind){
    E.online = null; E.practice = true; unbench(); useWorld('demo'); applyReach(); setVehicle(kind);
    for (const c of cars) if (!c.player) bench(c);
    tutor.on = false; startRace(); for (const c of cars) if (!c.player) bench(c); prewarm();
    document.body.classList.add('evPractice'); if (VOX) VOX.say('practice', 900);
  }
  function swapVehicle(kind){
    if (!kinds().includes(kind)) return false;
    setVehicle(kind); player.prof = VEHICLES[kind]; player.vx *= .6; player.vz *= .6; player.f *= .6; snapCam();
    for (let k = 0; k < 18; k++) glitter.emit(player.x + rnd(-2,2), (player.y||0) + rnd(.5,3), player.z + rnd(-2,2), rnd(-3,3), rnd(1,4), rnd(-3,3), rnd(.4,.9), rnd(.4,.8));
    return true;
  }

  // ---------- online race ----------
  // cfg: { myKind, mySlot (0..2, by join order), rivals:[{id, tag, kind, slot}], goIn (ms until GO) }
  function startOnline(cfg){
    E.practice = false; unbench(); useWorld('hollow'); applyReach(); setVehicle(cfg.myKind);
    level = 'normal'; rollRivals();
    const order = [2, 0, 1];                         // grid slot per human, by join order; AI fill the rest
    player.gridSlot = order[cfg.mySlot] ?? 2;
    const others = cars.filter(c => !c.player), free = [3, 4, ...order.filter(s => s !== player.gridSlot)];
    cfg.rivals.slice(0, 2).forEach((r, k) => { const c = others[k]; c.net = { id:r.id, tag:r.tag, buf:[], seen:0, gone:false };
      c._baseL = c.L; c.L = Object.assign({}, c.L, { name:r.tag }); setKind(c, r.kind); c.gridSlot = order[r.slot] ?? free.shift();
      const el = document.createElement('div'); el.className = 'evTag'; el.textContent = r.tag; labels.appendChild(el); c.net.el = el; });
    const used = new Set(cars.filter(c => c.gridSlot !== undefined).map(c => c.gridSlot)); let pool = [0,1,2,3,4].filter(s => !used.has(s));
    for (const c of others) if (!c.net){ c.gridSlot = pool.shift(); c._baseL = c.L; c.L = Object.assign({}, c.L, { name:'AI ' + c.L.name.replace(/^.*\. /,'') }); }
    E.online = { cfg, goAt: now() + cfg.goIn, finished:false, started:false };
    tutor.on = false;
    // the countdown is 3 s to GO: start it so GO lands on the shared start time
    const wait = Math.max(0, cfg.goIn - 3000);
    E.online.timer = setTimeout(() => { if (!E.online) return; startRace(); prewarm(); countT = .6 + Math.max(0, (E.online.goAt - now())/1000); E.online.started = true;
      document.body.classList.add('evRacing'); }, wait);
  }
  function leaveOnline(){ if (E.online && E.online.timer) clearTimeout(E.online.timer); toLobby(); }

  // a snapshot from another racer: { t (server ms), p:[x,y,z], q:[x,y,z,w], b:[rz,rx], f, sv, pr (progress), lp (laps), ft (finish time or 0), bo, k }
  function netFeed(id, s){
    const c = cars.find(o => o.net && o.net.id === id); if (!c || !s || !s.p) return;
    const b = c.net.buf; if (b.length && s.t <= b[b.length-1].t) return; b.push(s); if (b.length > 30) b.shift(); c.net.seen = now();
    if (s.k && s.k !== c.kind) setKind(c, s.k);
  }
  function netLeft(id){ const c = cars.find(o => o.net && o.net.id === id); if (c) c.net.gone = true; }
  const _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion();
  function netDrive(c, dt){
    const n = c.net, b = n.buf; if (!b.length){ c.group.visible = false; return; }
    const rt = now() - 110; let i = b.length - 1; while (i > 0 && b[i-1].t > rt) i--;
    const s1 = b[i], s0 = b[Math.max(0, i-1)], span = s1.t - s0.t, u = span > 0 ? clamp((rt - s0.t)/span, 0, 1.6) : 1;
    const L = (a, z) => a + (z - a)*u;
    c.group.position.set(L(s0.p[0], s1.p[0]), L(s0.p[1], s1.p[1]), L(s0.p[2], s1.p[2]));
    _q0.set(...s0.q); _q1.set(...s1.q); c.group.quaternion.copy(_q0).slerp(_q1, Math.min(1, u));
    c.body.rotation.z = L(s0.b[0], s1.b[0]); c.body.rotation.x = L(s0.b[1], s1.b[1]); c.body.position.y = 0;
    c.x = c.group.position.x; c.z = c.group.position.z; c.y = c.group.position.y; c.h = c.group.rotation.y;
    c.f = L(s0.f, s1.f); c.vx = Math.sin(c.h)*c.f; c.vz = Math.cos(c.h)*c.f; c.steerV = s1.sv || 0; c.boost = s1.bo ? .3 : 0;
    c.spinA += c.f*dt/.45; for (const sp of c.spin) sp.rotation.x = c.spinA; for (const st of c.steer) st.rotation.y = -c.steerV*.42;
    c.prog = L(s0.pr, s1.pr); c.laps = s1.lp; c.idx = locate(c).i;
    if (s1.ft && !c.finished){ c.finished = true; c.finishTime = s1.ft; }
    const stale = now() - n.seen > 8000; c.group.visible = !(n.gone && stale) && !c._camHide;
  }
  function poseOf(c){
    const g = c.group, q = g.quaternion;
    return { t:now(), p:[+g.position.x.toFixed(2), +g.position.y.toFixed(2), +g.position.z.toFixed(2)], q:[+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4)],
      b:[+c.body.rotation.z.toFixed(3), +c.body.rotation.x.toFixed(3)], f:+(c.f||0).toFixed(1), sv:+(c.steerV||0).toFixed(2), pr:+c.prog.toFixed(2), lp:c.laps,
      ft:c.finished ? +c.finishTime.toFixed(3) : 0, bo:c.boost > 0 ? 1 : 0, k:c.kind };
  }

  // per frame, after the camera: send our pose, place the name tags
  const _v = new THREE.Vector3();
  function frameHook(dt){
    if (E.online && E.online.started && (state === 'race' || state === 'done')){
      E.sendT += dt; if (E.sendT > 1/15){ E.sendT = 0; call('pose', poseOf(player)); }
    }
    const Wd = canvas.clientWidth, Hd = canvas.clientHeight;
    for (const c of cars){ const n = c.net; if (!n || !n.el) continue;
      const d = Math.hypot(c.x - camera.position.x, c.z - camera.position.z), show = c.group.visible && state !== 'menu' && d < 110;
      if (!show){ n.el.style.opacity = 0; continue; }
      _v.set(c.x, (c.y||0) + c.prof.camH*.75 + 1.4, c.z).project(camera);
      if (_v.z > 1 || _v.z < -1){ n.el.style.opacity = 0; continue; }
      const sc = clamp(1.25 - d/120, .55, 1.15);
      n.el.style.transform = 'translate(' + ((_v.x*.5 + .5)*Wd).toFixed(1) + 'px,' + ((-_v.y*.5 + .5)*Hd).toFixed(1) + 'px) translate(-50%,-100%) scale(' + sc.toFixed(2) + ')';
      n.el.style.opacity = clamp((110 - d)/30, 0, 1).toFixed(2);
    }
  }
  function playerDone(){ if (E.online && !E.online.finished){ E.online.finished = true; call('finish', { local:player.finishTime, laps:player.lapTimes.slice(), kind:player.kind, pose:poseOf(player) }); } }
  function afterFinish(){ call('results', standings().filter(c => !c.bench).map(c => ({ name:c.L.name, net:c.net ? c.net.id : null, me:!!c.player, ai:!c.player && !c.net, finished:c.finished, time:c.finished ? c.finishTime : null }))); }

  return {
    get on(){ return E.on; }, get online(){ return !!E.online; }, get practice(){ return E.practice; },
    hooks:E.hooks, kinds, setVehicle, toLobby, startPractice, swapVehicle, startOnline, leaveOnline, netFeed, netLeft, netDrive, frameHook, playerDone, afterFinish,
    vehicles(){ return VORDER.map(k => ({ kind:k, name:VEHICLES[k].name, tag:VEHICLES[k].tag, blurb:VEHICLES[k].blurb, ready:k === 'truck' || !!MODELS[k] })); },
    get vehicle(){ return vehicle; }, get state(){ return state; }, get lap(){ return player.laps; }, get raceTime(){ return raceTime; },
    say(id, delay){ return VOX ? VOX.say(id, delay) : false; },
    mute(){ toggleMute(); return muted; }, get muted(){ return muted; },
    prewarm, programKeys(){ return renderer.info.programs.map(p => p.name + '|' + p.cacheKey); },
    get quality(){ return quality; }, qualities(){ return Object.entries(QUALITY).map(([id, q]) => ({ id, name:q.name, note:q.note })); },
    setQuality(q){ if (!QUALITY[q]) return; quality = q; try { localStorage.setItem('dustrunner-quality', q); } catch(_){} applyQuality(); E.resetShed(); applyReach(); },
    probe(){ return { x:player.x, z:player.z, y:player.y||0, h:player.h, f:player.f, idx:player.idx, T:[T[player.idx].x, T[player.idx].z], cars:cars.filter(c => c.net).map(c => ({ x:c.x, z:c.z, vis:c.group.visible })) }; },
    drawCalls(){   // debug: which objects make the draw calls in the current view (one per visible mesh in view)
      const fr = new THREE.Frustum(), M = new THREE.Matrix4(); camera.updateMatrixWorld(); M.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); fr.setFromProjectionMatrix(M);
      const out = {}, detail = {}, shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }; let total = 0, key2;
      scene.traverse(o => { if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !shown(o)) return; if (o.frustumCulled && o.geometry){ if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if (!fr.intersectsObject(o)) return; }
        let k = o; while (k.parent && k.parent !== worldGroup && k.parent !== scene) k = k.parent; const key = (k.name || k.type) + (k.userData && k.userData.car ? ':car' : '') + '>' + (o.name || o.type) + ':' + (o.material && o.material.type);
        if (k !== o && o.isMesh && !o.name){ const g = o.geometry; const m = o.material; key2 = (g && g.type) + ' ' + (g && g.parameters ? JSON.stringify(g.parameters).slice(0, 40) : '') + ' blend=' + (m && m.blending) + ' tr=' + (m && m.transparent) + ' map=' + !!(m && m.map) + ' grp=' + k.children.length; detail[key + ' | ' + key2] = (detail[key + ' | ' + key2] || 0) + 1; }
        out[key] = (out[key] || 0) + 1; total++; });
      return { total, top: Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => v + ' ' + k).concat(['--']).concat(Object.entries(detail).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => v + ' ' + k)) };
    },
    breakdown(){   // debug: where the triangles go in the current view
      const fr = new THREE.Frustum(), M = new THREE.Matrix4(); camera.updateMatrixWorld(); M.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); fr.setFromProjectionMatrix(M);
      const out = {}, shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
      scene.traverse(o => { if (!o.isMesh || !shown(o) || !o.geometry) return; if (o.frustumCulled){ if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if (!fr.intersectsObject(o)) return; }
        const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count)/3*(o.isInstancedMesh ? o.count : (g.instanceCount || 1));
        let k = o; while (k.parent && k.parent !== worldGroup && k.parent !== scene) k = k.parent; const per = Math.round((g.index ? g.index.count : g.attributes.position.count)/3); const key = (k.name || k.type) + (k.userData.car ? ':car' : '') + ':' + (o.material && o.material.type) + (k === o ? ' per' + per + (o.isInstancedMesh ? ' x' + o.count : '') + (o.material && o.material.map ? ' tex' : '') : '');
        out[key] = (out[key] || 0) + t; });
      return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + ' ' + Math.round(v/1000) + 'k');
    },
    shedStep:(...a) => E.shedStep(...a), get shed(){ return shed; },
    // debug: a still of one ghost or the bats, rendered from a camera placed next to it (returns a PNG data URL)
    still(kind){ const o = kind === 'bat' ? new THREE.Vector3(HR.bats[0].m.position.x, HR.bats[0].m.position.y, HR.bats[0].m.position.z) : (HR.pitGhosts[0] ? HR.pitGhosts[0].m.getWorldPosition(new THREE.Vector3()) : null); if (!o) return null;
      if (kind !== 'bat') o.y += 2; const d = kind === 'bat' ? 6 : 9; camera.position.set(o.x + d, o.y + 1, o.z + d*.4); camera.lookAt(o); camera.updateMatrixWorld(); renderFrame(); return renderer.domElement.toDataURL('image/jpeg', .8); },
    headless(on = true){ if (!renderer.__render) renderer.__render = renderer.render; renderer.render = on ? () => {} : renderer.__render; },   // tests: a background browser that only drives and sends, never draws
    perf(){ const ar = renderer.info.autoReset; renderer.info.autoReset = false; renderer.info.reset(); renderFrame(); const r = renderer.info.render, out = { tris:r.triangles, calls:r.calls, far:camera.far, q:quality, shed, dyn:dynScale, look:lookOn, shadows:renderer.shadowMap.enabled, smog:(HR.smog && HR.smog.m.geometry.instanceCount) }; renderer.info.autoReset = ar; return out; },
  };
})();
window.__EV = EV;
