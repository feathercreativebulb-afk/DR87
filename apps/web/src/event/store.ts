/**
 * The event's database, behind one small interface so the lobby logic is the same code on both backends:
 *  - FirebaseDB: Firebase Realtime Database + anonymous sign-in (the real event).
 *  - LocalDB: the same tree in localStorage, shared between tabs of one browser (offline testing; each tab is one player).
 */
import { FIREBASE } from './config';

export type Unsub = () => void;
export interface DB {
  readonly kind: 'firebase' | 'local' | 'relay';
  readonly uid: string;
  /** server clock, ms */
  now(): number;
  /** value written as "server time now" */
  readonly stamp: unknown;
  get<T = unknown>(path: string): Promise<T | null>;
  set(path: string, v: unknown): Promise<void>;
  /** several paths at once, all relative to the root */
  update(patch: Record<string, unknown>): Promise<void>;
  remove(path: string): Promise<void>;
  push(path: string, v: unknown): Promise<string>;
  /** fn returns the new value, or undefined to abort */
  tx<T>(path: string, fn: (cur: T | null) => T | null | undefined): Promise<{ committed: boolean; value: T | null }>;
  on<T = unknown>(path: string, cb: (v: T | null) => void): Unsub;
  /** the newest child of a list, as they arrive */
  onDisconnectRemove(path: string): Promise<void>;
  onDisconnectCancel(path: string): Promise<void>;
}

export async function openDB(): Promise<DB> {
  const q = new URLSearchParams(location.search);
  if (q.has('relay')) return RelayDB.open(q.get('relay')!, Number(q.get('shift') || 0));   // tests: several browsers through a relay
  if (!FIREBASE.apiKey || q.has('local')) return new LocalDB(Number(q.get('shift') || 0));
  return FirebaseDB.open();
}

/* ---------------- Firebase ---------------- */
class FirebaseDB implements DB {
  readonly kind = 'firebase' as const;
  private offset = 0;
  private constructor(
    readonly uid: string,
    private fb: typeof import('firebase/database'),
    private db: import('firebase/database').Database,
    readonly stamp: unknown,
  ) {}
  static async open(): Promise<DB> {
    const [{ initializeApp }, auth, fb] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/database')]);
    const app = initializeApp(FIREBASE);
    const a = auth.getAuth(app);
    await auth.setPersistence(a, auth.browserLocalPersistence);
    const cred = a.currentUser ? { user: a.currentUser } : await auth.signInAnonymously(a);
    const db = fb.getDatabase(app);
    const me = new FirebaseDB(cred.user.uid, fb, db, fb.serverTimestamp());
    fb.onValue(fb.ref(db, '.info/serverTimeOffset'), (s) => { me.offset = Number(s.val()) || 0; });
    return me;
  }
  private r(p: string) { return this.fb.ref(this.db, p); }
  now() { return Date.now() + this.offset; }
  async get<T>(p: string) { return (await this.fb.get(this.r(p))).val() as T | null; }
  set(p: string, v: unknown) { return this.fb.set(this.r(p), v); }
  update(patch: Record<string, unknown>) { return this.fb.update(this.fb.ref(this.db), patch); }
  remove(p: string) { return this.fb.remove(this.r(p)); }
  async push(p: string, v: unknown) { const k = this.fb.push(this.r(p)); await this.fb.set(k, v); return k.key as string; }
  async tx<T>(p: string, fn: (cur: T | null) => T | null | undefined) {
    const res = await this.fb.runTransaction(this.r(p), (cur) => fn(cur as T | null), { applyLocally: false });
    return { committed: res.committed, value: res.snapshot.val() as T | null };
  }
  on<T>(p: string, cb: (v: T | null) => void): Unsub { return this.fb.onValue(this.r(p), (s) => cb(s.val() as T | null)); }
  onDisconnectRemove(p: string) { return this.fb.onDisconnect(this.r(p)).remove(); }
  onDisconnectCancel(p: string) { return this.fb.onDisconnect(this.r(p)).cancel(); }
}

/* ---------------- Local (test) ---------------- */
type Tree = Record<string, unknown>;
const KEY = 'dr87-evdb';
const split = (p: string) => p.split('/').filter(Boolean);
function getAt(t: unknown, p: string): unknown {
  let cur: unknown = t;
  for (const k of split(p)) { if (!cur || typeof cur !== 'object') return null; cur = (cur as Tree)[k]; }
  return cur === undefined ? null : cur;
}
function setAt(t: Tree, p: string, v: unknown): void {
  const ks = split(p); let cur = t;
  for (let i = 0; i < ks.length - 1; i++) { const n = cur[ks[i]]; if (!n || typeof n !== 'object') cur[ks[i]] = {}; cur = cur[ks[i]] as Tree; }
  if (v === null || v === undefined) delete cur[ks[ks.length - 1]]; else cur[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
}
const STAMP = { '.sv': 'timestamp' };
function resolveStamps(v: unknown, now: number): unknown {
  if (v && typeof v === 'object') {
    if ((v as Tree)['.sv'] === 'timestamp') return now;
    const o: Tree = Array.isArray(v) ? ([] as unknown as Tree) : {};
    for (const [k, x] of Object.entries(v)) o[k] = resolveStamps(x, now);
    return o;
  }
  return v;
}

class LocalDB implements DB {
  readonly kind = 'local' as const;
  readonly stamp = STAMP;
  readonly uid: string;
  private bc = new BroadcastChannel(KEY);
  private subs = new Set<() => void>();
  private gone = new Set<string>();
  constructor(private shift: number) {
    let id = sessionStorage.getItem(KEY + '-uid');
    if (!id) { id = 'u' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem(KEY + '-uid', id); }
    this.uid = id;
    this.bc.onmessage = () => this.fire();
    addEventListener('pagehide', () => { if (!this.gone.size) return; const t = this.read(); for (const p of this.gone) setAt(t, p, null); this.write(t); });
  }
  now() { return Date.now() + this.shift; }
  private read(): Tree { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
  private write(t: Tree) { localStorage.setItem(KEY, JSON.stringify(t)); this.bc.postMessage(1); queueMicrotask(() => this.fire()); }
  private fire() { for (const s of this.subs) s(); }
  private async locked<T>(fn: () => T): Promise<T> { return navigator.locks.request(KEY, async () => fn()); }
  async get<T>(p: string) { return getAt(this.read(), p) as T | null; }
  set(p: string, v: unknown) { return this.locked(() => { const t = this.read(); setAt(t, p, resolveStamps(v, this.now())); this.write(t); }); }
  update(patch: Record<string, unknown>) {
    return this.locked(() => { const t = this.read(); for (const [p, v] of Object.entries(patch)) setAt(t, p, resolveStamps(v, this.now())); this.write(t); });
  }
  remove(p: string) { return this.set(p, null); }
  async push(p: string, v: unknown) { const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await this.set(p + '/' + k, v); return k; }
  tx<T>(p: string, fn: (cur: T | null) => T | null | undefined) {
    return this.locked(() => {
      const t = this.read(), cur = getAt(t, p) as T | null, next = fn(cur === null ? null : JSON.parse(JSON.stringify(cur)));
      if (next === undefined) return { committed: false, value: cur };
      setAt(t, p, resolveStamps(next, this.now())); this.write(t);
      return { committed: true, value: getAt(t, p) as T | null };
    });
  }
  on<T>(p: string, cb: (v: T | null) => void): Unsub {
    let last = '\u0000';
    const s = () => { const v = getAt(this.read(), p), j = JSON.stringify(v); if (j !== last) { last = j; cb(v as T | null); } };
    this.subs.add(s); s();
    return () => { this.subs.delete(s); };
  }
  async onDisconnectRemove(p: string) { this.gone.add(p); }
  async onDisconnectCancel(p: string) { this.gone.delete(p); }
}

/* ---------------- Relay (tests: separate browsers share one tree over a WebSocket; see the event test folder) ---------------- */
class RelayDB implements DB {
  readonly kind = 'relay' as const;
  readonly stamp = STAMP;
  readonly uid: string;
  private n = 0;
  private wait = new Map<number, (r: unknown) => void>();
  private subs = new Map<number, (v: unknown) => void>();
  private constructor(private ws: WebSocket, private shift: number) {
    let id = sessionStorage.getItem(KEY + '-uid');
    if (!id) { id = 'u' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem(KEY + '-uid', id); }
    this.uid = id;
    ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.sid !== undefined) this.subs.get(m.sid)?.(m.v); else { this.wait.get(m.id)?.(m.r); this.wait.delete(m.id); } };
  }
  static open(url: string, shift: number): Promise<DB> {
    return new Promise((res, rej) => { const ws = new WebSocket(url); ws.onopen = () => res(new RelayDB(ws, shift)); ws.onerror = () => rej(new Error('relay')); });
  }
  private rpc<T>(m: Record<string, unknown>): Promise<T> { const id = this.n++; return new Promise((res) => { this.wait.set(id, res as (r: unknown) => void); this.ws.send(JSON.stringify({ ...m, id })); }); }
  now() { return Date.now() + this.shift; }
  get<T>(path: string) { return this.rpc<T | null>({ op: 'get', path }); }
  async set(path: string, v: unknown) { await this.rpc({ op: 'set', path, v }); }
  async update(patch: Record<string, unknown>) { await this.rpc({ op: 'update', v: patch }); }
  remove(path: string) { return this.set(path, null); }
  async push(path: string, v: unknown) { const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await this.set(path + '/' + k, v); return k; }
  async tx<T>(path: string, fn: (cur: T | null) => T | null | undefined) {
    let cur = (await this.get<T>(path)) as T | null;
    for (let i = 0; i < 20; i++) {
      const next = fn(cur === null ? null : JSON.parse(JSON.stringify(cur)));
      if (next === undefined) return { committed: false, value: cur };
      const r = await this.rpc<{ ok: boolean; v: T | null }>({ op: 'cas', path, expect: JSON.stringify(cur), v: next });
      if (r.ok) return { committed: true, value: r.v };
      cur = r.v;
    }
    return { committed: false, value: cur };
  }
  on<T>(path: string, cb: (v: T | null) => void): Unsub {
    const sid = this.n++; this.subs.set(sid, cb as (v: unknown) => void); this.ws.send(JSON.stringify({ op: 'on', path, sid }));
    return () => { this.subs.delete(sid); this.ws.send(JSON.stringify({ op: 'off', sid })); };
  }
  async onDisconnectRemove(path: string) { this.ws.send(JSON.stringify({ op: 'odr', path })); }
  async onDisconnectCancel(path: string) { this.ws.send(JSON.stringify({ op: 'odc', path })); }
}
