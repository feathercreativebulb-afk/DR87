/**
 * Halloween Night lobby: arcade tag sign-up, the waiting lobby with live races and the top 100, the race seat, practice, results.
 * The game (legacy script) is driven through window.__EV; this file never touches the game's internals.
 */
import './lobby.css';
import { EVENT, phaseAt } from './config';
import { openDB } from './store';
import { Event, humansOf, tagProblem, type Race, type Result, type Season } from './logic';

interface Pose { t: number; ft?: number }
interface Vehicle { kind: string; name: string; tag: string; blurb: string; ready: boolean }
interface EVGame {
  hooks: { now?: () => number; pose?: (p: Pose) => void; finish?: (f: { local: number; kind: string }) => void; results?: (rows: unknown[]) => void; lobby?: () => void };
  vehicles(): Vehicle[]; setVehicle(k: string): void; toLobby(): void; startPractice(k: string): void; swapVehicle(k: string): boolean;
  startOnline(cfg: { myKind: string; mySlot: number; rivals: { id: string; tag: string; kind: string; slot: number }[]; goIn: number }): void;
  leaveOnline(): void; netFeed(id: string, s: unknown): void; netLeft(id: string): void; say(id: string, delay?: number): boolean;
  mute(): boolean; readonly muted: boolean; readonly quality: string; qualities(): { id: string; name: string; note: string }[]; setQuality(q: string): void; readonly vehicle: string; readonly online: boolean; readonly practice: boolean;
}
declare global { interface Window { __EV?: EVGame } }

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const html = (el: HTMLElement, h: string) => { if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; } };   // only touch the DOM on change, so buttons stay clickable
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (s: number) => { const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2); };
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ICON: Record<string, string> = { truck: '🚙', tank: '🛡', walker: '🦿', jet: '✈', quad: '🏍', rally: '🏎', hover: '🦗', drone: '🛸' };
function until(ms: number) {
  if (ms <= 0) return 'now';
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}
const when = (t: number) => new Date(t).toLocaleString('en-GB', { timeZone: EVENT.timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

type View = 'boot' | 'signup' | 'lobby' | 'seat' | 'race' | 'results' | 'practice';

export async function start(): Promise<void> {
  const G = await waitFor(() => window.__EV);
  const root = document.createElement('div'); root.id = 'ev'; document.body.appendChild(root);
  root.innerHTML = SHELL; G.toLobby();
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('boot')?.remove()));   // the game is under the lobby now: drop the loading screen
  const db = await openDB().catch((e) => { console.error(e); return null; });
  if (!db) { $('#evBoot').innerHTML = '<b>Could not reach the race server.</b><br>Check your connection and reload.'; return; }
  const ev = new Event(db);
  G.hooks.now = () => db.now();
  if (db.kind !== 'firebase') { $('#evMode').hidden = false; const m = new URLSearchParams(location.search).get('minrace'); if (m) EVENT.minRaceSecs = Number(m); }   // tests only

  const S = {
    view: 'boot' as View, kind: G.vehicle, season: ev.season() as Season | null, raceId: null as string | null, race: null as Race | null,
    launched: false, results: {} as Record<string, Result>, mine: null as null | { time: number; best: boolean; rank: number }, races: {} as Record<string, Race>,
    board: [] as { tag: string; best: number; avg: number; n: number; kind: string }[], online: 0, signed: 0, aiRows: [] as { name: string; time: number | null; ai: boolean }[],
    heardJoin: new Set<string>(), greeted: false, live: new Set<string>(),
  };
  const subs: (() => void)[] = []; let raceSubs: (() => void)[] = [];

  function show(v: View) {
    S.view = v; root.dataset.view = v;
    for (const el of root.querySelectorAll<HTMLElement>('[data-v]')) el.hidden = !el.dataset.v!.split(' ').includes(v);
    if (v === 'lobby' || v === 'seat') G.toLobby();
    document.body.classList.toggle('evOverlay', v === 'signup' || v === 'lobby' || v === 'seat' || v === 'results' || v === 'boot');
    render();
  }

  // ---------- sign-up: three arcade letters and a PIN ----------
  const slots = [0, 0, 0]; let cur = 0;
  function drawTag() {
    root.querySelectorAll<HTMLElement>('.evSlot').forEach((el, i) => { el.querySelector('b')!.textContent = CHARS[slots[i]]; el.classList.toggle('on', i === cur); });
    const t = slots.map((i) => CHARS[i]).join(''), bad = tagProblem(t);
    $('#evTagMsg').textContent = bad && bad !== 'Three letters or numbers' ? bad : '';
  }
  root.querySelectorAll<HTMLElement>('.evSlot').forEach((el, i) => {
    el.querySelector('.up')!.addEventListener('click', () => { slots[i] = (slots[i] + 1) % CHARS.length; cur = i; drawTag(); });
    el.querySelector('.dn')!.addEventListener('click', () => { slots[i] = (slots[i] + CHARS.length - 1) % CHARS.length; cur = i; drawTag(); });
    el.querySelector('b')!.addEventListener('click', () => { cur = i; drawTag(); });
  });
  addEventListener('keydown', (e) => {
    if (S.view !== 'signup' || (e.target as HTMLElement).id === 'evPin') return;
    const k = e.key.toUpperCase();
    if (CHARS.includes(k) && k.length === 1) { slots[cur] = CHARS.indexOf(k); cur = Math.min(2, cur + 1); drawTag(); e.preventDefault(); }
    else if (e.key === 'Backspace') { cur = Math.max(0, cur - 1); e.preventDefault(); drawTag(); }
    else if (e.key === 'ArrowLeft') { cur = Math.max(0, cur - 1); drawTag(); }
    else if (e.key === 'ArrowRight') { cur = Math.min(2, cur + 1); drawTag(); }
    else if (e.key === 'ArrowUp') { slots[cur] = (slots[cur] + 1) % CHARS.length; drawTag(); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { slots[cur] = (slots[cur] + CHARS.length - 1) % CHARS.length; drawTag(); e.preventDefault(); }
    else if (e.key === 'Enter') $('#evPin').focus();
  });
  $('#evPin').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#evSign').click(); });
  $('#evSign').addEventListener('click', async () => {
    const t = slots.map((i) => CHARS[i]).join(''), pin = $<HTMLInputElement>('#evPin').value.trim(), btn = $<HTMLButtonElement>('#evSign');
    btn.disabled = true; $('#evTagMsg').textContent = '';
    const r = await ev.claim(t, pin).catch(() => 'Could not reach the race server');
    btn.disabled = false;
    if (r === 'ok') { G.say('welcome', 300); S.greeted = true; await ev.present('lobby'); show('lobby'); }
    else $('#evTagMsg').textContent = r === 'taken' ? `${t} is taken. If it's yours, type its PIN.` : r;
  });

  // ---------- vehicles ----------
  function drawVehicles() {
    const vs = G.vehicles();
    for (const box of root.querySelectorAll<HTMLElement>('.evVeh')) {
      box.innerHTML = vs.map((v) => `<button type="button" class="evV${v.kind === S.kind ? ' on' : ''}" data-k="${v.kind}" aria-label="${esc(v.name)}" ${v.ready ? '' : 'disabled'} aria-pressed="${v.kind === S.kind}"><i>${ICON[v.kind] ?? '•'}</i><span>${esc(v.name.split(' ')[0])}</span></button>`).join('');
    }
    const v = vs.find((x) => x.kind === S.kind);
    for (const el of root.querySelectorAll<HTMLElement>('.evVinfo')) el.innerHTML = v ? `<b>${esc(v.name)}</b> · ${esc(v.tag)}<br><span>${esc(v.blurb)}</span>` : '';
    return vs.every((x) => x.ready);
  }
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.evV'); if (!b || b.disabled) return;
    S.kind = b.dataset.k!;
    if (S.view === 'practice') { G.swapVehicle(S.kind); flashInfo(); $('.evPrac').classList.remove('open'); $('#evSwap').setAttribute('aria-expanded', 'false'); } else G.setVehicle(S.kind);
    if (S.view === 'seat' && S.raceId && S.season) void ev.setKind(S.season, S.raceId, S.kind);
    drawVehicles();
  });
  let infoT = 0;
  function flashInfo() { const el = $('#evPracInfo'); el.classList.add('on'); clearTimeout(infoT); infoT = window.setTimeout(() => el.classList.remove('on'), 4200); }
  (function poll() { if (!drawVehicles()) setTimeout(poll, 1500); })();

  // ---------- lobby ----------
  $('#evRace').addEventListener('click', () => joinRace());
  $('#evPractice').addEventListener('click', () => { G.startPractice(S.kind); void ev.present('practice'); show('practice'); flashInfo(); });
  $('#evSwap').addEventListener('click', () => { const o = $('.evPrac').classList.toggle('open'); $('#evSwap').setAttribute('aria-expanded', String(o)); });
  $('#evPracBack').addEventListener('click', () => { G.toLobby(); void ev.present('lobby'); show('lobby'); });
  function drawGfx() {
    const qs = G.qualities(), cur = G.quality;
    html($('#evGfx'), qs.map((q) => `<button type="button" role="radio" aria-checked="${q.id === cur}" data-q="${q.id}">${esc(q.name.replace('Battery saver', 'Saver'))}</button>`).join(''));
    $('#evGfxNote').textContent = qs.find((q) => q.id === cur)?.note ?? '';
  }
  $('#evGfx').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-q]'); if (!b) return; G.setQuality(b.dataset.q!); drawGfx(); });
  drawGfx();
  $('#evSound').addEventListener('click', () => { const m = G.mute(); $('#evSound').textContent = m ? '🔇' : '🔊'; });
  $('#evAnn').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-join]'); if (b) joinRace(b.dataset.join); });
  $('#evLeave').addEventListener('click', async () => { if (S.season && S.raceId) await ev.leave(S.season, S.raceId); endRace(); show('lobby'); });
  $('#evQuit').addEventListener('click', () => { if (!confirm('Leave this race? It will not count.')) return; G.leaveOnline(); endRace(); show('lobby'); });
  $('#evAgain').addEventListener('click', () => { endRace(); joinRace(); });
  $('#evBack').addEventListener('click', () => { endRace(); show('lobby'); });

  async function joinRace(prefer?: string) {
    if (!S.season || !ev.myTag) return;
    const b = $<HTMLButtonElement>('#evRace'); b.disabled = true;
    try {
      S.raceId = await ev.joinOrCreate(S.season, S.kind, prefer); S.launched = false; S.mine = null; S.results = {};
      watchRace(S.season, S.raceId); await ev.present('lobby'); show('seat');
    } catch (e) { console.error(e); toast('Could not join a race. Try again.'); }
    b.disabled = false;
  }
  function watchRace(s: Season, id: string) {
    raceSubs.forEach((u) => u()); raceSubs = [];
    raceSubs.push(ev.watchRace(s, id, (r) => {
      S.race = r;
      if (!r) { if (S.view === 'seat') { toast('The race was closed.'); show('lobby'); } return; }
      seatTick(); render();
    }));
  }
  /** while seated: keep the race honest and launch on time (runs on every race change and twice a second) */
  function seatTick() {
    const r = S.race, s = S.season, id = S.raceId; if (S.view !== 'seat' || !r || !s || !id) return;
    void ev.tend(s, id, r);
    const ready = (r.status === 'racing' || (r.status === 'starting' && r.startAt && ev.now() >= r.startAt - 3500)) && humansOf(r).length >= EVENT.minHumans;
    if (ready && r.humans?.[ev.uid] && !S.launched) launch(s, id, r);
    if (r.status === 'open' && humansOf(r).length < EVENT.minHumans && !S.heardJoin.has('wait:' + id)) { S.heardJoin.add('wait:' + id); G.say('waiting', 400); }
  }
  function launch(s: Season, id: string, r: Race) {
    S.launched = true;
    const hs = humansOf(r), me = hs.find((h) => h.id === ev.uid)!;
    G.startOnline({ myKind: me.kind, mySlot: me.slot, rivals: hs.filter((h) => h.id !== ev.uid).map((h) => ({ id: h.id, tag: h.tag, kind: h.kind, slot: h.slot })), goIn: (r.startAt ?? ev.now()) - ev.now() });
    void ev.liveOnDisconnect(s, id); void ev.keepSeat(s, id); void ev.present('race');
    G.hooks.pose = (p) => { void ev.sendPose(s, id, p).catch(() => {}); };
    raceSubs.push(ev.watchLive(s, id, (live) => {
      for (const [uid, pose] of Object.entries(live)) if (uid !== ev.uid) { G.netFeed(uid, pose); S.live.add(uid); }
      for (const uid of S.live) if (!(uid in live)) { G.netLeft(uid); S.live.delete(uid); }
    }));
    raceSubs.push(ev.watchResults(s, id, (res) => { S.results = res; render(); if (S.race && humansOf(S.race).every((h) => res[h.id])) void ev.markDone(s, id); }));
    show('race');
    const goAt = r.startAt ?? ev.now();
    const timeout = window.setTimeout(() => { if (S.view === 'race' && !S.mine) { toast('Race timed out.'); G.leaveOnline(); endRace(); show('lobby'); } }, goAt - ev.now() + EVENT.raceTimeoutMs);
    raceSubs.push(() => clearTimeout(timeout));
  }
  G.hooks.finish = async (f) => {
    if (!S.season || !S.raceId || !S.race) return;
    const r = await ev.finish(S.season, S.raceId, S.race, f.kind).catch((e) => { console.error(e); return null; });
    if (r) { const rank = r.row ? S.board.filter((b) => b.best < r.row!.best).length + 1 : 0; S.mine = { time: r.time, best: r.best, rank }; }
    render();
  };
  G.hooks.results = (rows) => { S.aiRows = (rows as { name: string; ai: boolean; time: number | null }[]).filter((x) => x.ai); show('results'); };
  G.hooks.lobby = () => { endRace(); show('lobby'); void ev.present('lobby'); };
  function endRace() {
    raceSubs.forEach((u) => u()); raceSubs = []; G.hooks.pose = undefined;
    if (S.season && S.raceId) void db!.remove(ev.livePath(S.season, S.raceId) + '/' + ev.uid).catch(() => {});
    S.raceId = null; S.race = null; S.launched = false; S.live.clear(); if (G.online) G.leaveOnline();
  }

  // ---------- live data ----------
  function subscribe() {
    subs.forEach((u) => u()); subs.length = 0;
    subs.push(ev.watchTagCount((n) => { S.signed = n; render(); }));
    subs.push(ev.watchPresence((p) => { S.online = Object.keys(p).length; render(); }));
    const boardSeason: Season = S.season ?? 'event';
    subs.push(ev.watchBoard(boardSeason, (rows) => { S.board = rows; render(); }));
    if (S.season) subs.push(ev.watchRaces(S.season, (r) => {
      S.races = r;
      if (S.view === 'lobby') for (const [id, race] of Object.entries(r)) if (ev.joinable(race) && !race.humans?.[ev.uid] && !S.heardJoin.has(id)) { S.heardJoin.add(id); G.say('join', 200); }
      render();
    }));
  }

  // ---------- drawing ----------
  function render() {
    const now = ev.now(), ph = phaseAt(now);
    html($('#evClock'), ph === 'before' ? `Opens <b>${when(EVENT.opens)}</b> · in ${until(EVENT.opens - now)}` : ph === 'live' ? `<em>LIVE</em> · ends ${when(EVENT.closes)} · ${until(EVENT.closes - now)} left` : 'The Halloween race is over');
    $('#evStats').textContent = `${S.signed} signed up · ${S.online} online`;
    if (ev.myTag) for (const el of root.querySelectorAll('.evMe')) el.textContent = ev.myTag;
    // the big button
    const rb = $<HTMLButtonElement>('#evRace');
    rb.hidden = ph === 'after'; rb.innerHTML = ph === 'before' ? 'Warm-up race<small>not counted · try it with friends</small>' : 'Race now<small>best single race wins the candy</small>';
    // announcements: races with a free seat
    const open = Object.entries(S.races).filter(([, r]) => ev.joinable(r, now) && !r.humans?.[ev.uid]).sort(([, a], [, b]) => humansOf(b).length - humansOf(a).length);
    html($('#evAnn'), open.slice(0, 2).map(([id, r]) => { const n = humansOf(r).length, left = EVENT.seats - n;
      return `<div class="evAnnRow"><span>🎃 <b>${humansOf(r).map((h) => esc(h.tag)).join(' · ')}</b> ${r.status === 'starting' ? `start in ${Math.max(0, Math.ceil(((r.startAt ?? now) - now) / 1000))}s` : 'waiting'} · ${left} seat${left > 1 ? 's' : ''} free</span><button type="button" data-join="${id}">Jump in</button></div>`; }).join('')
      || (ph === 'after' ? '' : `<div class="evAnnRow quiet"><span>No race waiting. Start one, the witch will call the others.</span></div>`));
    const racing = Object.values(S.races).filter((r) => r.status === 'racing' && now - (r.startAt ?? 0) < EVENT.raceTimeoutMs).length;
    $('#evRacing').textContent = racing ? `${racing} race${racing > 1 ? 's' : ''} on the track` : '';
    // board
    $('#evBoardTitle').textContent = ph === 'before' ? 'Warm-up board · not counted' : ph === 'live' ? 'Halloween Night · top 100' : 'Final standings';
    const top = S.board[0];
    html($('#evWinner'), top ? `${ph === 'after' ? '🍬 Winner' : '🍬 Candy leader'} <b>${esc(top.tag)}</b> ${fmt(top.best)}` : (ph === 'before' ? 'Warm-up times show here' : 'No times yet. Be the first!'));
    html($('#evBoard'), S.board.map((b, i) => `<tr class="${b.tag === ev.myTag ? 'me' : ''}"><td>${i + 1}</td><td class="t">${esc(b.tag)}</td><td>${fmt(b.best)}</td><td>${fmt(b.avg)}</td><td>${b.n}</td><td aria-label="${b.kind}">${ICON[b.kind] ?? ''}</td></tr>`).join('')
      || '<tr class="empty"><td colspan="6">—</td></tr>');
    // seat
    if (S.view === 'seat' && S.race) {
      const r = S.race, hs = humansOf(r), seats = [0, 1, 2].map((i) => hs.find((h) => h.slot === i));
      html($('#evSeats'), seats.map((h) => h ? `<li class="${h.id === ev.uid ? 'me' : ''}"><b>${esc(h.tag)}</b><span>${ICON[h.kind] ?? ''} ${esc(G.vehicles().find((v) => v.kind === h.kind)?.name.split(' ')[0] ?? h.kind)}</span></li>` : '<li class="free"><b>· · ·</b><span>free seat</span></li>').join('')
        + '<li class="ai"><b>AI</b><span>rival</span></li><li class="ai"><b>AI</b><span>rival</span></li>');
      html($('#evSeatMsg'), r.status === 'starting' && r.startAt ? `Starting in <b>${Math.max(0, Math.ceil((r.startAt - now) / 1000))}</b>s` : `Waiting for ${EVENT.minHumans - hs.length > 0 ? 'one more racer' : 'the start'}… <span>the race needs ${EVENT.minHumans} people</span>`);
    }
    // results
    if (S.view === 'results') {
      const hs = S.race ? humansOf(S.race) : [];
      const rows = [...hs.map((h) => ({ name: h.tag, time: S.results[h.id]?.time ?? null, me: h.id === ev.uid, ai: false })), ...S.aiRows.map((a) => ({ name: a.name, time: null as number | null, me: false, ai: true }))];
      rows.sort((a, b) => (a.ai ? 1 : 0) - (b.ai ? 1 : 0) || (a.time ?? 1e9) - (b.time ?? 1e9));
      html($('#evResTable'), rows.map((x, i) => `<tr class="${x.me ? 'me' : ''}${x.ai ? ' ai' : ''}"><td>${x.ai ? '' : i + 1}</td><td class="t">${esc(x.name)}</td><td>${x.ai ? 'AI' : x.time ? fmt(x.time) : 'racing…'}</td></tr>`).join(''));
      const m = S.mine, mine = S.board.find((b) => b.tag === ev.myTag);
      html($('#evResMine'), m ? `<div class="big">${fmt(m.time)}</div>${m.best ? '<em>New personal best!</em>' : ''}<p>Best <b>${mine ? fmt(mine.best) : '—'}</b> · Average <b>${mine ? fmt(mine.avg) : '—'}</b> · ${mine ? mine.n : 0} race${mine && mine.n === 1 ? '' : 's'}${m.rank ? ` · <b>#${m.rank}</b> on the board` : ''}</p>${S.season === 'warmup' ? '<p class="note">Warm-up race: not counted for the candy.</p>' : ''}` : '<div class="big">…</div>');
    }
  }
  function toast(t: string) { const el = $('#evToast'); el.textContent = t; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 2600); }

  // ---------- go ----------
  await ev.loadMe();
  subscribe();
  if (ev.myTag) { await ev.present('lobby'); show('lobby'); } else show('signup');
  drawTag();
  // the season flips at the opening time: resubscribe; tick the clocks
  setInterval(() => { const s = ev.season(); if (s !== S.season && !S.raceId) { S.season = s; subscribe(); } /* a race that started before the switch finishes in its own season */ seatTick(); if (S.view !== 'race' && S.view !== 'practice') render(); }, 500);
  // the witch greets you on your first tap (browsers need a tap before sound)
  addEventListener('pointerdown', () => { if (!S.greeted && S.view === 'lobby'){ S.greeted = true; G.say(phaseAt(ev.now()) === 'before' ? 'soon' : phaseAt(ev.now()) === 'after' ? 'over' : 'welcome', 300); } }, { once: false });
}

function waitFor<T>(get: () => T | undefined): Promise<T> {
  return new Promise((res) => { const t = () => { const v = get(); if (v) res(v); else setTimeout(t, 100); }; t(); });
}

const SHELL = `
<div class="evPanel evBootP" data-v="boot" id="evBoot">Summoning the witch…</div>

<section class="evPanel evSign" data-v="signup">
  <h1>Dust Runner '87<small>Halloween Night</small></h1>
  <p class="lead">Enter your arcade tag: three letters or numbers. It shows over your car and on the board.</p>
  <div class="evTagIn" role="group" aria-label="Your tag">
    ${[0, 1, 2].map((i) => `<div class="evSlot"><button type="button" class="up" aria-label="Next character for letter ${i + 1}">▲</button><b tabindex="0">A</b><button type="button" class="dn" aria-label="Previous character for letter ${i + 1}">▼</button></div>`).join('')}
  </div>
  <label class="evPinL">4-digit PIN <span>keeps your tag yours, and lets you use it on another device</span>
    <input id="evPin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="••••"></label>
  <button type="button" class="evBig" id="evSign">Sign up</button>
  <p class="evMsg" id="evTagMsg" role="alert"></p>
  <p class="evFine">Racing ${when(EVENT.opens)} → ${when(EVENT.closes)}. The fastest single race wins a big bag of candies.</p>
</section>

<section class="evPanel evLobby" data-v="lobby seat">
  <header><h1>Dust Runner '87<small>Halloween Night</small></h1><span class="evHi">Racer <b class="evMe"></b></span></header>
  <p class="evClock" id="evClock"></p>
  <div data-v="lobby">
    <div class="evAnn" id="evAnn" aria-live="polite"></div>
    <h2>Your vehicle</h2>
    <div class="evVeh"></div><p class="evVinfo"></p>
    <div class="evBtns"><button type="button" class="evBig" id="evRace"></button><button type="button" class="evGhost" id="evPractice">Practice<small>learn the vehicles · no hazards</small></button></div>
    <p class="evStats"><span id="evStats"></span> <span id="evRacing"></span></p>
    <div class="evGfx" role="radiogroup" aria-label="Graphics"><span>Graphics</span><div id="evGfx"></div><small id="evGfxNote"></small></div>
  </div>
  <div data-v="seat" class="evSeat">
    <h2>Your race</h2>
    <ol id="evSeats"></ol>
    <p class="evSeatMsg" id="evSeatMsg"></p>
    <h2>Vehicle</h2><div class="evVeh"></div><p class="evVinfo"></p>
    <button type="button" class="evGhost" id="evLeave">Leave</button>
  </div>
</section>

<aside class="evPanel evBoardP" data-v="lobby seat">
  <h2 id="evBoardTitle"></h2>
  <p class="evWinner" id="evWinner"></p>
  <div class="evBoardWrap"><table><thead><tr><th>#</th><th>Tag</th><th>Best</th><th>Avg</th><th>Races</th><th></th></tr></thead><tbody id="evBoard"></tbody></table></div>
</aside>

<button type="button" class="evCorner" id="evQuit" data-v="race">Leave race</button>
<div class="evPrac" data-v="practice">
  <button type="button" class="evCorner" id="evPracBack">← Lobby</button>
  <button type="button" class="evCorner" id="evSwap" aria-expanded="false">Swap vehicle</button>
  <div class="evPracBar"><span>Swap vehicle</span><div class="evVeh"></div></div>
  <p class="evVinfo" id="evPracInfo"></p>
</div>

<section class="evPanel evRes" data-v="results">
  <h1>Race over</h1>
  <div id="evResMine"></div>
  <table><tbody id="evResTable"></tbody></table>
  <div class="evBtns"><button type="button" class="evBig" id="evAgain">Race again</button><button type="button" class="evGhost" id="evBack">Lobby</button></div>
</section>

<button type="button" class="evSound" id="evSound" aria-label="Sound on or off">🔊</button>
<p class="evMode" id="evMode" hidden>Local test mode · open more tabs to race yourself</p>
<div class="evToast" id="evToast" role="status"></div>
`;
