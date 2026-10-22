/**
 * Halloween Night event settings.
 *
 * The window is Bucharest time: opens Thu 29 Oct 2026 18:00 (EET, UTC+2), closes Sun 1 Nov 2026 02:00.
 * The same two numbers are in database.rules.json; change both together.
 */
export const EVENT = {
  name: 'Halloween Night',
  opens: 1793289600000, // 2026-10-29T16:00:00Z
  closes: 1793491200000, // 2026-11-01T00:00:00Z
  timeZone: 'Europe/Bucharest',
  seats: 3, // people per race; the other 2 of the 5 cars are always AI
  minHumans: 2, // a race needs at least this many people to start
  boardSize: 100,
  countdownMs: 20_000, // once a 2nd racer joins, the race starts this long after
  fullCountdownMs: 8_000, // ...or this soon once every seat is taken
  joinCutoffMs: 5_000, // nobody joins in the last few seconds
  minRaceSecs: 150, // 3 laps of Hollow Ridge can't be done faster (rules check this too)
  raceTimeoutMs: 10 * 60_000, // a race nobody finished is closed after this
};

/**
 * Firebase web config (Project settings → Your apps → Web). These values identify the project; the security rules protect it.
 * Leave apiKey empty to run on the local test backend (several tabs of one browser race each other).
 */
export const FIREBASE = {
  apiKey: 'AIzaSyDKNSOy0sy4QXxX8aQs4-loTBPuHanmNaU',
  authDomain: 'dr87-halloween.firebaseapp.com',
  // Realtime Database in Belgium (europe-west1); the console's config only lists this once the database exists
  databaseURL: 'https://dr87-halloween-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'dr87-halloween',
  storageBucket: 'dr87-halloween.firebasestorage.app',
  messagingSenderId: '69010269166',
  appId: '1:69010269166:web:8bbb9713153872d19664ff',
};

export type Phase = 'before' | 'live' | 'after';
export function phaseAt(now: number): Phase {
  return now < EVENT.opens ? 'before' : now < EVENT.closes ? 'live' : 'after';
}
/** Races before the event are warm-ups: same flow, their own board, not counted for the prize. */
export function seasonAt(now: number): 'warmup' | 'event' | null {
  const p = phaseAt(now);
  return p === 'before' ? 'warmup' : p === 'live' ? 'event' : null;
}
