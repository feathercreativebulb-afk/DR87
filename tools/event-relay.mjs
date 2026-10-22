// Usage: node tools/event-relay.mjs  (then open the event with ?relay=ws://<this machine>:8787 in each browser)
// Test relay: one shared database tree over WebSocket, so separate browser processes can race each other without Firebase.
import { WebSocketServer } from 'ws';
const tree = {}; const subs = new Set();
const split = p => p.split('/').filter(Boolean);
const getAt = p => { let c = tree; for (const k of split(p)) { if (!c || typeof c !== 'object') return null; c = c[k]; } return c === undefined ? null : c; };
const setAt = (p, v) => { const ks = split(p); let c = tree; for (let i = 0; i < ks.length - 1; i++) { if (!c[ks[i]] || typeof c[ks[i]] !== 'object') c[ks[i]] = {}; c = c[ks[i]]; } if (v === null || v === undefined) delete c[ks.at(-1)]; else c[ks.at(-1)] = v; };
const stamp = v => { if (v && typeof v === 'object') { if (v['.sv'] === 'timestamp') return Date.now(); for (const k in v) v[k] = stamp(v[k]); } return v; };
const notify = () => { for (const s of subs) { const j = JSON.stringify(getAt(s.path)); if (j !== s.last) { s.last = j; s.ws.send(JSON.stringify({ sid: s.sid, v: JSON.parse(j) })); } } };
const wss = new WebSocketServer({ port: Number(process.env.PORT || 8787) });
wss.on('connection', ws => {
  const gone = new Set();
  ws.on('message', raw => {
    const m = JSON.parse(raw); let r = null;
    if (m.op === 'get') r = getAt(m.path);
    else if (m.op === 'set') { setAt(m.path, stamp(m.v)); notify(); }
    else if (m.op === 'update') { for (const [p, v] of Object.entries(m.v)) setAt(p, stamp(v)); notify(); }
    else if (m.op === 'cas') { const cur = getAt(m.path); if (JSON.stringify(cur) === m.expect) { setAt(m.path, stamp(m.v)); notify(); r = { ok: true, v: getAt(m.path) }; } else r = { ok: false, v: cur }; }
    else if (m.op === 'on') { const s = { ws, sid: m.sid, path: m.path, last: '\u0000' }; subs.add(s); notify(); }
    else if (m.op === 'off') { for (const s of subs) if (s.ws === ws && s.sid === m.sid) subs.delete(s); }
    else if (m.op === 'odr') gone.add(m.path);
    else if (m.op === 'odc') gone.delete(m.path);
    if (m.id !== undefined) ws.send(JSON.stringify({ id: m.id, r }));
  });
  ws.on('close', () => { for (const s of subs) if (s.ws === ws) subs.delete(s); for (const p of gone) setAt(p, null); notify(); });
});
console.log('relay on', wss.options.port);
