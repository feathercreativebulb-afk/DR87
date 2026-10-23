#!/usr/bin/env python3
"""DR87 Halloween event: turn the Model Lab build (Hollow Ridge, v31+) into the event game page.

    python3 patch_event.py <lab index.html> <out folder>

Writes <out>/index.html: the game script with the event module and hooks, the Lab's test bench removed.
The repo importer (tools/import-artifact.py) then turns that page into repo source.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
src, out = sys.argv[1], sys.argv[2]
html = open(src).read()


def rep(old, new, count=1, where=None):
    global html
    n = html.count(old)
    if n != count:
        sys.exit(f'patch_event: expected {count} of {old[:70]!r}, found {n}')
    html = html.replace(old, new)


# ---------- strip the Lab's test bench: its panel, its tab, its scripts and its styles ----------
a = html.index('<aside id="lab"'); i = a + 6; depth = 1
while depth:
    o, c = html.find('<aside', i), html.find('</aside>', i)
    if o != -1 and o < c: depth += 1; i = o + 6
    else: depth -= 1; i = c + 8
html = html[:a] + html[i:]
html = re.sub(r'<button id="labTab"[^>]*>.*?</button>', '', html, flags=re.S)
for m in list(re.finditer(r'<script>(.*?)</script>', html, re.S)):
    if 'Model Lab' in m.group(1)[:200]:
        html = html.replace(m.group(0), '')
styles = re.findall(r'<style>(.*?)</style>', html, re.S)
for s in styles:
    if '#lab' in s and len(s) < 40000:
        html = html.replace('<style>' + s + '</style>', '')
rep('<title>DR87 Model Lab</title>', "<title>Dust Runner '87 · Halloween Night</title>")

# ---------- the event module, spliced in with the worlds ----------
mod = open(os.path.join(HERE, 'event-game.js')).read()
rep("\n/* ---------- racing lines: minimum-curvature path", "\n" + mod + "\n/* ---------- racing lines: minimum-curvature path")

# ---------- the frame loop: net cars are posed from their snapshots, benched cars sit out ----------
rep("      const inp = (c.player && !c.finished) ? playerInput()",
    "      if (c.bench) continue; if (c.net){ EV.netDrive(c, dt); continue; }\n      const inp = (c.player && !c.finished) ? playerInput()")
rep("if (countT<=.6){ state='race'; }\n    for (const c of cars) syncMesh(c, dt);",
    "if (countT<=.6){ state='race'; }\n    for (const c of cars){ if (c.net) EV.netDrive(c, dt); else if (!c.bench) syncMesh(c, dt); }")
rep("    collide();\n    for (const c of cars) obstacleCollide(c);", "    collide();\n    for (const c of cars) if (!c.net && !c.bench) obstacleCollide(c);")
# collisions: other people's cars are solid. Each screen moves only the cars it drives: someone else's car is an obstacle that
# moves (it isn't pushed here), and on their screen they bounce off yours, so both sides react to the same contact.
a = html.index("function collide(){"); b = html.index("\n}\n", a) + 3
html = html[:a] + """function collide(){
  for (let a=0;a<cars.length;a++) for (let b=a+1;b<cars.length;b++){
    const A=cars[a], B=cars[b]; if (A.bench || B.bench || (A.net && B.net)) continue;
    if (A.airT>0 || B.airT>0 || A.air || B.air || A.rec || B.rec || A.loop || B.loop) continue;
    if ((A.net && !A.group.visible) || (B.net && !B.group.visible) || Math.abs((A.y||0) - (B.y||0)) > 3) continue;   // a remote car mid-jump or on the loop is above or below
    const RAD=(A.prof.rad+B.prof.rad)/2;
    const dx=A.x-B.x, dz=A.z-B.z; const d=Math.hypot(dx,dz);
    if (d>0 && d<RAD){
      const mA=A.prof.mass*(active(A,'shield')?5:active(A,'hook')?2.5:1), mB=B.prof.mass*(active(B,'shield')?5:active(B,'hook')?2.5:1), nx=dx/d, nz=dz/d, over=RAD-d;
      const wA = A.net ? 0 : B.net ? 1 : mB/(mA+mB), wB = B.net ? 0 : A.net ? 1 : mA/(mA+mB);
      A.x+=nx*over*wA; A.z+=nz*over*wA; B.x-=nx*over*wB; B.z-=nz*over*wB;
      const vr=(A.vx-B.vx)*nx + (A.vz-B.vz)*nz;
      if (vr<0){
        if (A.net || B.net){ const k = -vr*1.3; if (!A.net){ A.vx+=nx*k; A.vz+=nz*k; } if (!B.net){ B.vx-=nx*k; B.vz-=nz*k; } }
        else { const j=-vr*1.3/(1/mA+1/mB); A.vx+=nx*j/mA; A.vz+=nz*j/mA; B.vx-=nx*j/mB; B.vz-=nz*j/mB; }
        if ((A.player||B.player) && Math.abs(vr)>6){ thud(Math.min(Math.abs(vr)/30,1)); addShake(Math.min(Math.abs(vr)/40,.5)); } }
    }
  }
}
""" + html[b:]
rep("function standings(){ return [...cars]", "function standings(){ return cars.filter(c => !c.bench)")
rep("$('pos').innerHTML = place+'<small>/'+cars.length+'</small>';", "$('pos').innerHTML = place+'<small>/'+st.length+'</small>';")
rep("cars.forEach((c,k)=>{ const [i,lat] = GRID[slots[k]];", "cars.forEach((c,k)=>{ const [i,lat] = GRID[c.gridSlot ?? slots[k]];")
rep("renderFrame();\n  requestAnimationFrame(frame);", "try { EV.frameHook(dtReal); } catch(e){ console.warn('event frame', e); }\n  renderFrame();\n  requestAnimationFrame(frame);")

# ---------- fixed steps: slow devices are not slowed down ----------
# The frame step used to be capped at 50 ms, so below 20 fps the race ran in slow motion and cost real seconds on the
# event clock. Now a slow frame is simulated as several steps of at most 50 ms (down to 4 fps); fast frames are unchanged.
rep("  let dt = Math.min(.05, (now-last)/1000); last = now;\n  const dtReal = dt; if (slowmo > 0 && !paused){ slowmo -= dt; dt *= .3; }\n  const t = now/1000;\n",
    "  const dtAll = Math.min(.25, (now-last)/1000); last = now;\n"
    "  const SUB = Math.max(1, Math.ceil(dtAll/.05 - 1e-9)); let dt = 0, dtReal = 0, slowK = 1;\n"
    "  for (let _s = 0; _s < SUB; _s++){\n"
    "  dt = dtAll/SUB; dtReal = dt; slowK = 1; if (slowmo > 0 && !paused){ slowmo -= dt; dt *= .3; slowK = .3; }\n"
    "  const t = now/1000 - (SUB - 1 - _s)*dtReal;\n")
rep("  ghostUpdate(paused ? 0 : dt); drawLines(dtReal); musicUpdate(dtReal);",
    "  }\n  dtReal = dtAll; dt = dtAll*slowK;   // camera, HUD and audio run once per drawn frame\n  ghostUpdate(paused ? 0 : dt); drawLines(dtReal); musicUpdate(dtReal);")

# ---------- fewer draw calls: bats and ghosts ----------
# The 18 bats were 54 meshes (body and two wings each); now they are two instanced meshes, posed every frame from the same
# per-bat transforms. Each ghost was 6 meshes; now it is 2 (body + arms in the ghost material, eyes + mouth in black).
rep("    for (let k = 0; k < 18; k++){ const B = new THREE.Group(), L = new THREE.Mesh(wing, batM), Rw = new THREE.Mesh(wing, batM); Rw.scale.x = -1; B.add(L); B.add(Rw);\n"
    "      const body = new THREE.Mesh(new THREE.SphereGeometry(.28, 6, 5), batM); body.scale.z = 1.8; B.add(body); B.scale.setScalar(1.4); g.add(B);\n",
    "    const batW = new THREE.InstancedMesh(wing, batM, 36), batB = new THREE.InstancedMesh(new THREE.SphereGeometry(.28, 6, 5), batM, 18);\n"
    "    batW.frustumCulled = batB.frustumCulled = false; batW.instanceMatrix.setUsage(THREE.DynamicDrawUsage); batB.instanceMatrix.setUsage(THREE.DynamicDrawUsage);\n"
    "    batW.userData.noSolid = batB.userData.noSolid = true; g.add(batW); g.add(batB); HR.batIM = { W:batW, B:batB, m:new THREE.Matrix4(), bm:new THREE.Matrix4().makeScale(1, 1, 1.8) };\n"
    "    for (let k = 0; k < 18; k++){ const B = new THREE.Object3D(), L = new THREE.Object3D(), Rw = new THREE.Object3D(); Rw.scale.x = -1; B.scale.setScalar(1.4);\n")
rep("    const f = Math.sin(t*16 + b.ph*5)*.7; b.L.rotation.z = f; b.Rw.rotation.z = -f; }\n",
    "    const f = Math.sin(t*16 + b.ph*5)*.7; b.L.rotation.z = f; b.Rw.rotation.z = -f; }\n"
    "  if (HR.batIM){ const I = HR.batIM; HR.bats.forEach((b, k) => { b.m.updateMatrix(); b.L.updateMatrix(); b.Rw.updateMatrix();\n"
    "      I.W.setMatrixAt(2*k, I.m.multiplyMatrices(b.m.matrix, b.L.matrix)); I.W.setMatrixAt(2*k + 1, I.m.multiplyMatrices(b.m.matrix, b.Rw.matrix)); I.B.setMatrixAt(k, I.m.multiplyMatrices(b.m.matrix, I.bm)); });\n"
    "    I.W.instanceMatrix.needsUpdate = I.B.instanceMatrix.needsUpdate = true; }\n")
# particle systems with nothing alive are skipped: no draw call and no buffer upload (there are ~25, most idle at any moment)
rep("  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);\n  return { mat,\n    emit(x,y,z,vx,vy,vz,size,l){ const i=head;",
    "  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.visible = false; scene.add(pts);\n  return { mat,\n    emit(x,y,z,vx,vy,vz,size,l){ pts.visible = true; const i=head;")
rep("    update(dt){ for (let i=0;i<n;i++){ if (life[i]<=0){ al[i]=0; continue; } life[i]-=dt;",
    "    update(dt){ let live = 0; for (let i=0;i<n;i++){ if (life[i]<=0){ al[i]=0; continue; } live++; life[i]-=dt;")
rep("vel[k+1]-=gravity*dt; al[i]=Math.max(0,life[i]/max[i]); }\n      g.attributes.position.needsUpdate = g.attributes.alpha.needsUpdate = g.attributes.size.needsUpdate = true; } };",
    "vel[k+1]-=gravity*dt; al[i]=Math.max(0,life[i]/max[i]); }\n      pts.visible = live > 0; if (live) g.attributes.position.needsUpdate = g.attributes.alpha.needsUpdate = g.attributes.size.needsUpdate = true; } };")
rep("pk.userData.noSolid = true; st.userData.noSolid = true; g.add(pk); g.add(st);\n}\n",
    "pk.userData.noSolid = true; st.userData.noSolid = true; g.add(pk); g.add(st); HR.fullPkIM = [pk];   // EV.applyReach swaps in a lighter pumpkin on Saver\n}\n")
a = html.index("function hrGhostMesh(mat, eyeM){"); b = html.index("\n}\n", a) + 3
html = html[:a] + """function hrGhostMesh(mat, eyeM){
  if (!HR.ghostParts){   // merge the parts once: body + arms share the ghost material, eyes + mouth share the black one
    const M = (geo, s, p, rz) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); const o = new THREE.Object3D(); o.scale.set(...s); o.position.set(...p); o.rotation.z = rz || 0; o.updateMatrix(); g.applyMatrix4(o.matrix); return g; };
    const merge = list => { const out = new THREE.BufferGeometry(); for (const k of ['position', 'normal']){ const arr = new Float32Array(list.reduce((n, g) => n + g.attributes[k].array.length, 0)); let o = 0; for (const g of list){ arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new THREE.BufferAttribute(arr, 3)); } out.computeBoundingSphere(); return out; };
    const body = HR.ghostGeo || (HR.ghostGeo = hrGhostGeo()), eye = new THREE.SphereGeometry(.17, 10, 8), mo = new THREE.SphereGeometry(.2, 10, 8), arm = new THREE.SphereGeometry(.32, 10, 8);
    HR.ghostParts = { body:merge([M(body, [1, 1, 1], [0, 0, 0]), ...[-1, 1].map(sx => M(arm, [1.4, .7, .7], [sx*1.2, 1.55, .25], sx*.5))]),
      face:merge([...[-.38, .38].map(sx => M(eye, [1, 1.5, .5], [sx, 2.25, 1.07])), M(mo, [1, 1.25, .45], [0, 1.72, 1.12])]) };
  }
  const G = new THREE.Group(); G.add(new THREE.Mesh(HR.ghostParts.body, mat)); G.add(new THREE.Mesh(HR.ghostParts.face, eyeM));
  G.traverse(m => { if (m.isMesh) m.userData.noSolid = true; });
  return G;
}
""" + html[b:]

# ---------- race flow ----------
rep("function canPause(){ return ", "function canPause(){ if (EV.online) return false; return ")   # online races run on a shared clock
rep("if (c.laps >= LAPS){", "if (c.laps >= LAPS && !(EV.practice && c.player)){")            # practice laps never end
rep("playerFinished(); }", "playerFinished(); EV.playerDone(); }")
rep("if (doneT<=0) showResults();", "if (doneT<=0){ if (EV.online) EV.afterFinish(); else showResults(); }")
rep("function quitToMenu(){", "function quitToMenu(){\n  if (EV.on){ EV.toLobby(); if (EV.hooks.lobby) EV.hooks.lobby(); return; }")
rep("if (k === 'i' && !e.repeat && !inField &&", "if (k === 'i' && !EV.on && !e.repeat && !inField &&")            # no inspector UFO for players
rep("if (!surpriseOn) return;", "if (!surpriseOn || world.id === 'demo') return;")
rep("var ECO = (() => {", "var ECO = null; var ECO_OFF = (() => {")                             # no coins or tries at the event

# ---------- the witch is the voice of the night ----------
W = json.load(open(os.path.join(HERE, 'witch-lines.json')))
m = re.search(r'const LINES = (\{.*?\});\n', html)
lines = json.loads(m.group(1))
lines['hollow'] = W['hollow']; lines['demo'] = W['demo']
html = html.replace(m.group(0), 'const LINES = ' + json.dumps(lines, ensure_ascii=False) + ';\n')
rep("hazard:2, lap:2, best:2, lasttry:2, gust:1, ghost:2, witch:2 };",
    "hazard:2, lap:2, best:2, lasttry:2, gust:1, ghost:2, witch:2, follow:3, follow2:3, follow3:3, follow4:3, spider:2, practice:3, welcome:3, waiting:2, join:3, soon:3, over:4, finish:4, cackle:1, bestlap:2 };")
rep("showToast('🧙 WITCH!', 1300); setTimeout(() => styleToast('Follow her sparkle trail'), 600); hrSay('witch', 18000);",
    "showToast('🧙 FOLLOW ME!', 1300); setTimeout(() => styleToast('Ride her sparkles for a boost'), 600); hrSay(['follow','follow2','follow3','follow4'][Math.random()*4|0], 9000);")
rep("if (VOX) VOX.say('best'); }", "if (VOX) VOX.say(world.id === 'hollow' || world.id === 'demo' ? 'bestlap' : 'best'); }")

# ---------- only the event: no way into the full game ----------
# start in Hollow Ridge (the full game starts in the last world you picked), never show the game's own menu, no Lab handle
rep("try { const sw = localStorage.getItem('dustrunner-world'); if (sw && WORLDS[sw]) world = WORLDS[sw]; } catch(_){}", "world = WORLDS.hollow;   // Halloween event: Hollow Ridge only")
a = html.index("window.__DR87 = {"); b = html.index("};", a) + 2
html = html[:a] + "/* (the Model Lab's window.__DR87 handle is left out of the event build) */" + html[b:]

# desktop starts on Balanced (60 fps cap, light shadows) instead of High: event players bring all kinds of laptops
rep("let quality = IS_TOUCH ? 'saver' : 'high';", "let quality = IS_TOUCH ? 'saver' : 'balanced';")

# dynamic resolution may go down to half resolution (was 60%) on a struggling laptop
rep("if (avg > target*1.3 && dynScale > .6){ dynScale = Math.max(.6, dynScale - .12); applyPixelRatio(); }",
    "try { EV.shedStep(avg > target*1.3, avg < target*1.08); } catch(_){}   // at half resolution and still late: shed shadows, ink, smog\n"
    "      if (avg > target*1.3 && dynScale > .5){ dynScale = Math.max(.5, dynScale - .12); applyPixelRatio(); }")

# ---------- styles: name tags over other racers ----------
css = """
/* DR87 Halloween event */
#evTags{position:fixed;inset:0;pointer-events:none;z-index:6;overflow:hidden}
#evTags .evTag{position:absolute;left:0;top:0;opacity:0;padding:3px 9px 4px;border-radius:6px;background:rgba(14,8,26,.78);border:1.5px solid #ff8a1f;
  color:#ffd8a0;font:400 15px/1 Bungee,Impact,sans-serif;letter-spacing:.14em;white-space:nowrap;box-shadow:0 0 14px rgba(255,138,31,.35);will-change:transform}
#evTags .evTag::after{content:'';position:absolute;left:50%;bottom:-6px;margin-left:-5px;border:5px solid transparent;border-top-color:#ff8a1f;border-bottom:0}
body.evRacing #pauseBtn{display:none!important}
#ecoHud,.ecoStat{display:none!important}
#menu,#wpick,#stepW,#setSheet,#insp{display:none!important}
body.evPractice #pos,body.evPractice #lap{display:none!important}
"""
styles = re.findall(r'<style>(.*?)</style>', html, re.S)
game_css = max(styles, key=len)
html = html.replace(game_css, game_css + css, 1)

os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w').write(html)
print('event page', len(html)//1024, 'KB')
