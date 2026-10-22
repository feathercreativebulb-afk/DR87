/**
 * Event logic: arcade tags, matchmaking, live poses, results and the leaderboard.
 * Every rule that matters for fairness is also in database.rules.json; this is the friendly side of it.
 */
import { EVENT, seasonAt } from './config';
import type { DB, Unsub } from './store';

export interface Human { tag: string; kind: string; slot: number; at: number }
export interface Race { status: 'open' | 'starting' | 'racing' | 'done'; created: number; startAt: number | null; humans?: Record<string, Human> }
export interface Result { tag: string; time: number; kind: string; at: number }
export interface BoardRow { best: number; sum: number; n: number; kind: string; at: number }
export type Season = 'warmup' | 'event';

export const humansOf = (r: Race | null) => Object.entries(r?.humans ?? {}).map(([id, h]) => ({ id, ...h })).sort((a, b) => a.slot - b.slot);

// a few three-letter words nobody wants on a kids' leaderboard
const BLOCK = new Set(['ASS', 'FUK', 'FUC', 'FCK', 'SEX', 'XXX', 'KKK', 'NIG', 'FAG', 'CUM', 'TIT', 'DIK', 'DIC', 'COK', 'GAY', 'PEE', 'POO', 'WTF', 'STF', 'KYS', 'NAZ', 'SS0', 'HIV', 'GOD', 'PIS', 'VAG', 'JEW', 'NUT', 'SUK', 'SUC', 'PUS', 'PMS', 'FKU', 'FKN', 'DIE', 'KIL', 'PUT', 'PIZ', 'CUR', 'MUI', 'PLM', 'PZD', 'FUT']);
export function tagProblem(tag: string): string | null {
  if (!/^[A-Z0-9]{3}$/.test(tag)) return 'Three letters or numbers';
  if (BLOCK.has(tag)) return 'Pick another tag';
  return null;
}
async function pinHash(tag: string, pin: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('dr87-halloween:' + tag + ':' + pin));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export class Event {
  myTag: string | null = null;
  constructor(readonly db: DB) {}
  get uid() { return this.db.uid; }
  now() { return this.db.now(); }
  season(): Season | null { return seasonAt(this.now()); }

  // ---------------- tags ----------------
  async loadMe(): Promise<string | null> {
    const u = await this.db.get<{ tag: string }>('users/' + this.uid);
    if (u?.tag) { const t = await this.db.get<{ uid: string }>('tags/' + u.tag); if (t?.uid === this.uid) this.myTag = u.tag; }
    return this.myTag;
  }
  /** 'ok' | 'taken' (someone else's, wrong PIN) | an error message */
  async claim(tag: string, pin: string): Promise<'ok' | 'taken' | string> {
    const bad = tagProblem(tag); if (bad) return bad;
    if (!/^\d{4}$/.test(pin)) return 'PIN is 4 digits';
    const h = await pinHash(tag, pin), uid = this.uid;
    const cur = await this.db.get<{ uid: string }>('tags/' + tag);
    if (cur?.uid === uid) { this.myTag = tag; return 'ok'; }
    if (!cur) { try { await this.db.set('secrets/' + tag, h); } catch { /* someone set it a moment ago: fall through to the PIN check */ } }
    if (this.db.kind !== 'firebase') { const s = await this.db.get<string>('secrets/' + tag); if (s !== h) return 'taken'; }   // the rules do this on Firebase
    try {
      await this.db.set('claims/' + tag + '/' + uid, h);
      await this.db.update({ ['tags/' + tag]: { uid, at: this.db.stamp }, ['users/' + uid]: { tag } });
    } catch { return 'taken'; }
    this.myTag = tag; return 'ok';
  }
  watchTagCount(cb: (n: number) => void): Unsub { return this.db.on<Record<string, unknown>>('tags', (v) => cb(v ? Object.keys(v).length : 0)); }

  // ---------------- presence ----------------
  async present(where: 'lobby' | 'practice' | 'race') {
    if (!this.myTag) return;
    const p = 'presence/' + this.uid; await this.db.set(p, { tag: this.myTag, where, at: this.db.stamp }); await this.db.onDisconnectRemove(p);
  }
  watchPresence(cb: (v: Record<string, { tag: string; where: string }>) => void): Unsub { return this.db.on('presence', (v) => cb((v as never) ?? {})); }

  // ---------------- races ----------------
  private racesPath(s: Season) { return s + '/races'; }
  watchRaces(s: Season, cb: (v: Record<string, Race>) => void): Unsub { return this.db.on(this.racesPath(s), (v) => cb((v as never) ?? {})); }
  watchRace(s: Season, id: string, cb: (r: Race | null) => void): Unsub { return this.db.on(this.racesPath(s) + '/' + id, (v) => cb(v as Race | null)); }

  /** a race this tag can still join right now */
  joinable(r: Race, now = this.now()): boolean {
    const n = humansOf(r).length;
    if (r.status === 'open') return n > 0 && n < EVENT.seats && now - r.created < 45 * 60_000;
    if (r.status === 'starting') return n < EVENT.seats && (r.startAt ?? 0) - now > EVENT.joinCutoffMs;
    return false;
  }
  private seatIn(r: Race, kind: string): Race | undefined {
    const now = this.now(), hs = humansOf(r);
    if (r.humans?.[this.uid]) return r;
    if (!this.joinable(r, now)) return undefined;
    const used = new Set(hs.map((h) => h.slot)); let slot = 0; while (used.has(slot)) slot++;
    r.humans = { ...(r.humans ?? {}), [this.uid]: { tag: this.myTag!, kind, slot, at: now } };
    const n = hs.length + 1;
    if (n >= EVENT.minHumans && r.status === 'open') { r.status = 'starting'; r.startAt = now + EVENT.countdownMs; }
    if (n >= EVENT.seats && r.startAt) r.startAt = Math.min(r.startAt, now + EVENT.fullCountdownMs);
    return r;
  }
  /** join the fullest race with a free seat, or open a new one; returns its id */
  async joinOrCreate(s: Season, kind: string, prefer?: string): Promise<string> {
    const all = (await this.db.get<Record<string, Race>>(this.racesPath(s))) ?? {};
    const mine = Object.entries(all).find(([, r]) => r.humans?.[this.uid] && (r.status === 'open' || r.status === 'starting'));
    if (mine) return mine[0];
    const ids = Object.entries(all).filter(([id, r]) => this.joinable(r) || id === prefer)
      .sort(([ia, a], [ib, b]) => (ia === prefer ? -1 : ib === prefer ? 1 : 0) || humansOf(b).length - humansOf(a).length || a.created - b.created).map(([id]) => id);
    for (const id of ids) {
      const res = await this.db.tx<Race>(this.racesPath(s) + '/' + id, (r) => (r ? this.seatIn(r, kind) : null));
      if (res.committed && res.value?.humans?.[this.uid]) { await this.seated(s, id); return id; }
    }
    const id = await this.db.push(this.racesPath(s), { status: 'open', created: this.now(), startAt: null, humans: { [this.uid]: { tag: this.myTag, kind, slot: 0, at: this.now() } } });
    await this.seated(s, id); return id;
  }
  private async seated(s: Season, id: string) { await this.db.onDisconnectRemove(this.racesPath(s) + '/' + id + '/humans/' + this.uid); }
  async setKind(s: Season, id: string, kind: string) {
    await this.db.tx<Race>(this.racesPath(s) + '/' + id, (r) => { if (!r) return null; if (!r.humans?.[this.uid] || r.status === 'racing') return undefined; r.humans[this.uid].kind = kind; return r; });
  }
  async leave(s: Season, id: string) {
    await this.db.onDisconnectCancel(this.racesPath(s) + '/' + id + '/humans/' + this.uid);
    await this.db.tx<Race>(this.racesPath(s) + '/' + id, (r) => {
      if (!r) return null;            // nothing cached yet: Firebase runs this again with the real value
      if (!r.humans?.[this.uid]) return undefined;
      if (r.status === 'racing') return undefined;            // mid-race you just drop out; the seat stays taken
      delete r.humans[this.uid];
      const n = humansOf(r).length; if (!n) return null;
      if (n < EVENT.minHumans && r.status === 'starting') { r.status = 'open'; r.startAt = null; }
      return r;
    });
  }
  /** keep a race honest when people come and go: back to waiting if it lost its second racer, racing once the clock hits zero */
  async tend(s: Season, id: string, r: Race) {
    const n = humansOf(r).length, now = this.now();
    if (r.status === 'starting' && n < EVENT.minHumans) {
      await this.db.tx<Race>(this.racesPath(s) + '/' + id, (x) => (!x ? null : x.status === 'starting' && humansOf(x).length < EVENT.minHumans ? { ...x, status: 'open', startAt: null } : undefined));
    } else if (r.status === 'starting' && r.startAt && now >= r.startAt) {
      await this.db.tx<Race>(this.racesPath(s) + '/' + id, (x) => (!x ? null : x.status === 'starting' && humansOf(x).length >= EVENT.minHumans ? { ...x, status: 'racing' } : undefined));
    }
  }
  async markDone(s: Season, id: string) {
    await this.db.tx<Race>(this.racesPath(s) + '/' + id, (x) => (!x ? null : x.status === 'racing' ? { ...x, status: 'done' } : undefined));
  }

  // ---------------- the race itself ----------------
  livePath(s: Season, id: string) { return s + '/live/' + id; }
  async sendPose(s: Season, id: string, pose: unknown) { await this.db.set(this.livePath(s, id) + '/' + this.uid, pose); }
  async liveOnDisconnect(s: Season, id: string) { await this.db.onDisconnectRemove(this.livePath(s, id) + '/' + this.uid); }
  watchLive(s: Season, id: string, cb: (v: Record<string, unknown>) => void): Unsub { return this.db.on(this.livePath(s, id), (v) => cb((v as never) ?? {})); }
  watchResults(s: Season, id: string, cb: (v: Record<string, Result>) => void): Unsub { return this.db.on(s + '/results/' + id, (v) => cb((v as never) ?? {})); }

  /** your official time is the server clock from GO to the line; it can't be faster than the clock and it can't be paused */
  async finish(s: Season, id: string, race: Race, kind: string): Promise<{ time: number; best: boolean; row: BoardRow | null }> {
    const time = Math.round((this.now() - (race.startAt ?? this.now())) / 10) / 100;
    if (!this.myTag || time < EVENT.minRaceSecs) return { time, best: false, row: null };
    await this.db.set(s + '/results/' + id + '/' + this.uid, { tag: this.myTag, time, kind, at: this.db.stamp });
    let best = false;
    const res = await this.db.tx<BoardRow>(s + '/board/' + this.myTag, (b) => {
      best = !b || time < b.best;
      return { best: b ? Math.min(b.best, time) : time, sum: Math.round(((b?.sum ?? 0) + time) * 100) / 100, n: (b?.n ?? 0) + 1, kind: best ? kind : b!.kind, at: this.now() };
    });
    return { time, best, row: res.value };
  }
  watchBoard(s: Season, cb: (rows: { tag: string; best: number; avg: number; n: number; kind: string }[]) => void): Unsub {
    return this.db.on<Record<string, BoardRow>>(s + '/board', (v) => {
      const rows = Object.entries(v ?? {}).map(([tag, b]) => ({ tag, best: b.best, avg: b.sum / b.n, n: b.n, kind: b.kind }));
      rows.sort((a, b) => a.best - b.best || a.avg - b.avg);
      cb(rows.slice(0, EVENT.boardSize));
    });
  }
}
