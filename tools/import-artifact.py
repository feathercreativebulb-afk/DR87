#!/usr/bin/env python3
"""Import the Dust Runner '87 artifact into the repo.

The game was built as one claude.ai artifact: a single index.html with all code
inline, models shipped as base64 inside *-model.js files, and MP3s beside it.
This tool turns that into repo source, so the artifact can keep being the
playground while the repo is the product:

    packages/core/src/legacy/game.js     the game script, patched (see PATCHES)
    packages/core/src/legacy/game.css    the game's styles
    packages/core/src/legacy/markup.html the game's DOM (HUD, menus, touch pads)
    packages/data/*.json                 pure-data tables lifted out of the script
    assets/models/*.glb                  real binary GLBs (no base64, ~25% smaller)
    assets/music/*.mp3                   music tracks

Usage:
    python3 tools/import-artifact.py <folder with index.html, *-model.js, music*.mp3>

Re-run it whenever the artifact changes; it is idempotent and fails loudly if a
patch no longer applies, so a drifted artifact never imports silently broken.
"""
import base64, json, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEGACY = ROOT / 'packages/core/src/legacy'
DATA = ROOT / 'packages/data'
MODELS = ROOT / 'assets/models'
MUSIC = ROOT / 'assets/music'

# Tables that are pure data (checked by evaluating them, see check_tables).
# WORLDS is not here: it computes geometry inline and moves in phase 2.
TABLES = {'VEHICLES': 'vehicles', 'SKINS': 'skins', 'UNLOCKS': 'unlocks',
          'MEDAL_NAMES': 'medal-names', 'QUALITY': 'quality'}


def fail(msg):
    sys.exit(f'import-artifact: {msg}')


def split_page(html):
    """Return (css, markup, script) from the artifact page."""
    styles = re.findall(r'<style>(.*?)</style>', html, re.S)
    # the first <style> is the artifact host's wrapper skeleton; the game's own is the longest
    css = max(styles, key=len)
    body_start = html.find('</style>', html.find(css)) + len('</style>')
    first_script = html.find('<script', body_start)
    markup = html[body_start:first_script].strip()
    inline = [m for m in re.finditer(r'<script>(.*?)</script>', html, re.S)]
    if not inline:
        fail('no inline game script found')
    script = max(inline, key=lambda m: len(m.group(1))).group(1)
    return css, markup, script


def literal_span(js, name):
    m = re.search(r'const ' + name + r'\s*=\s*', js)
    if not m:
        fail(f'table {name} not found')
    i = start = m.end(); depth = 0; quote = None
    while i < len(js):
        c = js[i]
        if quote:
            if c == '\\': i += 2; continue
            if c == quote: quote = None
        elif c in '"\'`': quote = c
        elif js.startswith('//', i): i = js.index('\n', i); continue
        elif c in '{[(': depth += 1
        elif c in '}])':
            depth -= 1
            if depth == 0: i += 1; break
        i += 1
    return start, i


def check_tables(js):
    """Evaluate each table in Node and keep only those that are pure JSON."""
    out = {}
    for name, slug in TABLES.items():
        a, b = literal_span(js, name)
        src = js[a:b]
        probe = ("const v=(" + src + ");const ok=x=>x===null||['string','boolean'].includes(typeof x)||"
                 "(typeof x==='number'&&isFinite(x))||(Array.isArray(x)?x.every(ok):"
                 "(typeof x==='object'&&Object.values(x).every(ok)));"
                 "if(!ok(v))process.exit(3);process.stdout.write(JSON.stringify(v));")
        r = subprocess.run(['node', '-e', probe], capture_output=True, text=True)
        if r.returncode != 0:
            fail(f'table {name} is no longer pure data; leave it in code or update TABLES')
        out[name] = (a, b, slug, json.loads(r.stdout))
    return out


PATCHES = [
    # 1. models: fetch a real .glb instead of injecting a base64 <script>
    (r'function loadGLBScript\(src, key\)\{.*?\n[ \t]*\}\n(?=[ \t]*function parseGLB)',
     "function loadGLBScript(src, key){\n"
     "  // DR87 repo: models ship as binary GLBs under assets/models (was base64 in *-model.js)\n"
     "  const file = DR87.asset('models/' + src.replace(/-model\\.js$/, '') + '.glb');\n"
     "  return fetch(file).then(r => { if (!r.ok) throw new Error(file + ' ' + r.status); return r.arrayBuffer(); });\n"
     "}\n"),
    # 2. music: tracks live under assets/music
    (r"new Audio\('music\.mp3'\)", "new Audio(DR87.asset('music/music.mp3'))"),
    (r"const a = new Audio\(src\);", "const a = new Audio(DR87.asset('music/' + src));"),
]


def main():
    if len(sys.argv) != 2:
        fail(__doc__)
    src = Path(sys.argv[1])
    html = (src / 'index.html').read_text()
    css, markup, js = split_page(html)

    tables = check_tables(js)
    for name, (a, b, slug, value) in sorted(tables.items(), key=lambda t: -t[1][0]):
        js = js[:a] + f'DR87.data[{json.dumps(slug)}]' + js[b:]
        (DATA / f'{slug}.json').write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

    for pattern, repl in PATCHES:
        js, n = re.subn(pattern, lambda _m, r=repl: r, js, flags=re.S)
        if n == 0:
            fail(f'patch did not apply: {pattern[:60]}')

    header = ("/* Dust Runner '87 — legacy game script, imported from the artifact by tools/import-artifact.py.\n"
              " * Do not hand-edit for gameplay changes yet: phase 2 splits this into packages/core/src/{sim,render,ui,audio}.\n"
              " * Runs as a classic script after three r128 (global THREE) and src/boot.ts (global DR87). */\n")
    LEGACY.mkdir(parents=True, exist_ok=True)
    (LEGACY / 'game.js').write_text(header + js)
    (LEGACY / 'game.css').write_text(css.strip() + '\n')
    (LEGACY / 'markup.html').write_text(markup + '\n')

    MODELS.mkdir(parents=True, exist_ok=True)
    for f in sorted(src.glob('*-model.js')):
        m = re.search(r'window\.(\w+)\s*=\s*"([A-Za-z0-9+/=]+)"', f.read_text())
        if not m:
            fail(f'{f.name}: no base64 payload')
        glb = base64.b64decode(m.group(2))
        if glb[:4] != b'glTF':
            fail(f'{f.name}: payload is not a GLB')
        (MODELS / f.name.replace('-model.js', '.glb')).write_bytes(glb)

    MUSIC.mkdir(parents=True, exist_ok=True)
    for f in sorted(src.glob('music*.mp3')):
        shutil.copy2(f, MUSIC / f.name)

    print(f'imported: game.js {len(js)//1024} KB, {len(tables)} data tables, '
          f'{len(list(MODELS.glob("*.glb")))} models, {len(list(MUSIC.glob("*.mp3")))} tracks')


if __name__ == '__main__':
    main()
