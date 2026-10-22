#!/bin/bash
# Lab build -> event page -> repo branch (halloween-2026)
set -e
cd /home/claude/event
python3 patch_event.py /home/claude/lab/index.html out
rm -rf out/vox && cp -r vox out/vox
python3 -c "import re;h=open('out/index.html').read();open('/tmp/e.js','w').write(max(re.findall(r'<script>(.*?)</script>',h,re.S),key=len))" && node --check /tmp/e.js
cd /home/claude/dr87 && python3 tools/import-artifact.py /home/claude/event/out
