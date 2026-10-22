import { describe, expect, it } from 'vitest';
import { EVENT } from '../../apps/web/src/event/config';
import { Event, humansOf, tagProblem, type Race } from '../../apps/web/src/event/logic';
import type { DB, Unsub } from '../../apps/web/src/event/store';

// The same tree semantics as the browser backends, in memory: several players share one tree.
class Tree { root: Record<string, unknown> = {}; clock = EVENT.opens + 60_000; }
const split = (p: string) => p.split('/').filter(Boolean);
class MemDB implements DB {
  readonly kind = 'local' as const; readonly stamp = { '.sv': 'timestamp' };
  constructor(readonly uid: string, private t: Tree) {}
  now() { return this.t.clock; }
  private at(p: string): unknown { let c: unknown = this.t.root; for (const k of split(p)) { if (!c || typeof c !== 'object') return null; c = (c as Record<string, unknown>)[k]; } return c ?? null; }
  private put(p: string, v: unknown) { const ks = split(p); let c = this.t.root as Record<string, unknown>; for (const k of ks.slice(0, -1)) { if (!c[k] || typeof c[k] !== 'object') c[k] = {}; c = c[k] as Record<string, unknown>; }
    const s = (x: unknown): unknown => (x && typeof x === 'object' ? ((x as Record<string, unknown>)['.sv'] ? this.t.clock : Object.fromEntries(Object.entries(x).map(([a, b]) => [a, s(b)]))) : x);
    if (v === null || v === undefined) delete c[ks[ks.length - 1]]; else c[ks[ks.length - 1]] = JSON.parse(JSON.stringify(s(v))); }
  async get<T>(p: string) { const v = this.at(p); return (v === null ? null : JSON.parse(JSON.stringify(v))) as T | null; }
  async set(p: string, v: unknown) { this.put(p, v); }
  async update(patch: Record<string, unknown>) { for (const [p, v] of Object.entries(patch)) this.put(p, v); }
  async remove(p: string) { this.put(p, null); }
  async push(p: string, v: unknown) { const k = 'r' + Object.keys((this.at(p) as object) ?? {}).length; this.put(p + '/' + k, v); return k; }
  async tx<T>(p: string, fn: (c: T | null) => T | null | undefined) { const cur = await this.get<T>(p), n = fn(cur); if (n === undefined) return { committed: false, value: cur }; this.put(p, n); return { committed: true, value: await this.get<T>(p) }; }
  on<T>(_p: string, _cb: (v: T | null) => void): Unsub { return () => {}; }
  async onDisconnectRemove() {} async onDisconnectCancel() {}
}
async function player(t: Tree, uid: string, tag: string) { const e = new Event(new MemDB(uid, t)); expect(await e.claim(tag, '1234')).toBe('ok'); return e; }

describe('Halloween event logic', () => {
  it('arcade tags: three characters, unique, PIN-protected, no rude words', async () => {
    expect(tagProblem('AB')).toBeTruthy(); expect(tagProblem('ab1')).toBeTruthy(); expect(tagProblem('ASS')).toBeTruthy(); expect(tagProblem('BOG')).toBeNull();
    const t = new Tree(); await player(t, 'u1', 'BOG');
    const thief = new Event(new MemDB('u2', t));
    expect(await thief.claim('BOG', '9999')).toBe('taken');
    const me2 = new Event(new MemDB('u3', t));                   // same person, another device, right PIN
    expect(await me2.claim('BOG', '1234')).toBe('ok');
  });

  it('fills races 3 people at a time and starts with 2', async () => {
    const t = new Tree();
    const ps = await Promise.all(['AAA', 'BBB', 'CCC', 'DDD'].map((g, i) => player(t, 'u' + i, g)));
    const r1 = await ps[0].joinOrCreate('event', 'truck');
    let race = (await ps[0].db.get<Race>('event/races/' + r1))!;
    expect(race.status).toBe('open');
    expect(await ps[1].joinOrCreate('event', 'tank')).toBe(r1);
    race = (await ps[0].db.get<Race>('event/races/' + r1))!;
    expect(race.status).toBe('starting'); expect(race.startAt).toBe(t.clock + EVENT.countdownMs);
    expect(await ps[2].joinOrCreate('event', 'jet')).toBe(r1);
    race = (await ps[0].db.get<Race>('event/races/' + r1))!;
    expect(humansOf(race).map((h) => h.slot)).toEqual([0, 1, 2]);
    expect(race.startAt).toBe(t.clock + EVENT.fullCountdownMs);   // full: starts sooner
    const r2 = await ps[3].joinOrCreate('event', 'quad');            // a 4th person gets a new race
    expect(r2).not.toBe(r1);
  });

  it('goes back to waiting if the second racer leaves, and closes on time', async () => {
    const t = new Tree();
    const [a, b] = await Promise.all([player(t, 'ua', 'AAA'), player(t, 'ub', 'BBB')]);
    const id = await a.joinOrCreate('event', 'truck'); await b.joinOrCreate('event', 'truck');
    await b.leave('event', id);
    let race = (await a.db.get<Race>('event/races/' + id))!;
    await a.tend('event', id, race);
    race = (await a.db.get<Race>('event/races/' + id))!;
    expect(race.status).toBe('open'); expect(race.startAt).toBeNull();
    t.clock += 60 * 60_000;                                          // nobody came for an hour: no longer joinable
    expect(a.joinable(race)).toBe(false);
  });

  it('times come from the shared clock and feed best and average', async () => {
    const t = new Tree();
    const [a, b] = await Promise.all([player(t, 'ua', 'AAA'), player(t, 'ub', 'BBB')]);
    const id = await a.joinOrCreate('event', 'truck'); await b.joinOrCreate('event', 'truck');
    let race = (await a.db.get<Race>('event/races/' + id))!;
    t.clock = race.startAt!; await a.tend('event', id, race); race = (await a.db.get<Race>('event/races/' + id))!;
    expect(race.status).toBe('racing');
    t.clock += 200_000; const r1 = await a.finish('event', id, race, 'truck');
    expect(r1.time).toBe(200); expect(r1.best).toBe(true);
    t.clock += 10_000; await b.finish('event', id, race, 'tank');
    // a second race for AAA, slower: best stays, average moves
    const id2 = await a.joinOrCreate('event', 'truck'); await b.joinOrCreate('event', 'truck');
    let r2 = (await a.db.get<Race>('event/races/' + id2))!; t.clock = r2.startAt! + 220_000;
    const res = await a.finish('event', id2, r2, 'truck');
    expect(res.best).toBe(false); expect(res.row).toMatchObject({ best: 200, n: 2, sum: 420 });
    // too fast to be real: not recorded
    r2 = (await a.db.get<Race>('event/races/' + id2))!;
    const fake = await b.finish('event', id2, { ...r2, startAt: t.clock - 60_000 }, 'jet');
    expect(fake.row).toBeNull();
  });
});
