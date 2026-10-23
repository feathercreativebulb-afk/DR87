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
rep("if (avg > target*1.3 && dynScale > .6){ dynScale = Math.max(.6, dynScale - .12); applyPixelRatio(); }", "if (avg > target*1.3 && dynScale > .5){ dynScale = Math.max(.5, dynScale - .12); applyPixelRatio(); }")

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
