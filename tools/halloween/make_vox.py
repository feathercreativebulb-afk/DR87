"""Witch clips -> the game's announcer files (vox/<world>-<id>.mp3) + witch-lines.json for patch_event.py."""
import json, shutil, os
man = json.load(open('/home/claude/vox3/out/witch/manifest.json'))['lines']
txt = {k: v['text'] for k, v in man.items()}
hollow = ['count3','count2','count1','go','hazard','gust','ghost','lap','bestlap','win','second','third','noprize','follow','follow2','follow3','follow4',
          'spider','welcome','lobby','practice','waiting','join','soon','over','finish','cackle','grid','best']
demo = ['count3','count2','count1','go','practice','bestlap','cackle','follow','welcome']
src = {'best': 'bestlap'}
shutil.rmtree('vox', ignore_errors=True); os.makedirs('vox')
out = {'hollow': {}, 'demo': {}}
for w, ids in (('hollow', hollow), ('demo', demo)):
    for i in ids:
        f = src.get(i, i); out[w][i] = txt[f]; shutil.copy(f'/home/claude/vox3/out/witch/witch-{f}.mp3', f'vox/{w}-{i}.mp3')
json.dump(out, open('witch-lines.json', 'w'), indent=1, ensure_ascii=False)
print(sum(len(v) for v in out.values()), 'clips')
