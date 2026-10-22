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
rep("const A=cars[a], B=cars[b]; if (", "const A=cars[a], B=cars[b]; if (A.net || B.net || A.bench || B.bench) continue; if (")
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

# ---------- styles: name tags over other racers ----------
css = """
/* DR87 Halloween event */
#evTags{position:fixed;inset:0;pointer-events:none;z-index:6;overflow:hidden}
#evTags .evTag{position:absolute;left:0;top:0;opacity:0;padding:3px 9px 4px;border-radius:6px;background:rgba(14,8,26,.78);border:1.5px solid #ff8a1f;
  color:#ffd8a0;font:400 15px/1 Bungee,Impact,sans-serif;letter-spacing:.14em;white-space:nowrap;box-shadow:0 0 14px rgba(255,138,31,.35);will-change:transform}
#evTags .evTag::after{content:'';position:absolute;left:50%;bottom:-6px;margin-left:-5px;border:5px solid transparent;border-top-color:#ff8a1f;border-bottom:0}
body.evRacing #pauseBtn{display:none!important}
#ecoHud,.ecoStat{display:none!important}
body.evPractice #pos,body.evPractice #lap{display:none!important}
"""
styles = re.findall(r'<style>(.*?)</style>', html, re.S)
game_css = max(styles, key=len)
html = html.replace(game_css, game_css + css, 1)

os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w').write(html)
print('event page', len(html)//1024, 'KB')
