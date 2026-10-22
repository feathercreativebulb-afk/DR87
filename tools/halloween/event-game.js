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

  // ---------- the lobby backdrop: Hollow Ridge, your vehicle turning on the grid ----------
  function toLobby(){
    E.online = null; E.practice = false;
    if (state !== 'menu'){ if (VOX) VOX.stop(); tipHide(); stopCelebration(); slowmo = 0; finishCam = 0; setPaused(false); state = 'menu'; doneT = 0; }
    unbench(); useWorld('hollow'); placeOnGrid(); propsReset(); surpriseReset();
    $('res').hidden = true; $('menu').hidden = true; $('pauseBtn').hidden = true; $('finBanner').hidden = true; $('gaps').hidden = true;
    document.body.classList.add('inmenu'); document.body.classList.remove('inresults', 'evRacing', 'evPractice');
    camH = player.h; snapCam();
  }

  // ---------- practice: alone on the Practice Grid, endless laps ----------
  function startPractice(kind){
    E.online = null; E.practice = true; unbench(); useWorld('demo'); setVehicle(kind);
    for (const c of cars) if (!c.player) bench(c);
    tutor.on = false; startRace(); for (const c of cars) if (!c.player) bench(c);
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
    E.practice = false; unbench(); useWorld('hollow'); setVehicle(cfg.myKind);
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
    E.online.timer = setTimeout(() => { if (!E.online) return; startRace(); countT = .6 + Math.max(0, (E.online.goAt - now())/1000); E.online.started = true;
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
    const rt = now() - 140; let i = b.length - 1; while (i > 0 && b[i-1].t > rt) i--;
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
      E.sendT += dt; if (E.sendT > .1){ E.sendT = 0; call('pose', poseOf(player)); }
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
  };
})();
window.__EV = EV;
