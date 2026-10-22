# Halloween Night: the DR87 community race (branch `halloween-2026`)

A standalone online build of Dust Runner '87 for the local Halloween event. It is played in the browser on desktop or phone.

**Event window:** Thu 29 Oct 2026 18:00 → Sun 1 Nov 2026 02:00, Bucharest time.
**Prize:** a big bag of candies for the fastest single race time over the whole event.

## How it plays

- **Sign-up (any time):** players enter a classic arcade tag of 3 letters or numbers, plus a 4-digit PIN.
  - The tag is unique. It shows over their car and on the board.
  - The PIN lets them use the same tag on another device.
  - A short block-list keeps rude three-letter words off the board.
- **Lobby:**
  - The player's vehicle turns on Hollow Ridge, and the witch greets them on their first tap.
  - The lobby shows a countdown to the opening, the number of players signed up and online, and the board.
  - Any race with a free seat is announced at the top with a **Jump in** button, and the witch calls out "A place is free!".
- **Races:**
  - Hollow Ridge, 3 laps. Each race has 5 cars: up to **3 people** and the rest AI, so there are always at least 2 AI.
  - A race starts once **2 people** are in it: 20 seconds after the second joins, or 8 seconds once all 3 seats are taken. Nobody can join in the last 5 seconds.
  - Other racers' cars are streamed about 10 times a second and shown with their tag floating over them as you close in.
  - People never collide with each other, and no hazard costs a try, so nobody can wreck another person's race.
  - **The official time is the server clock from GO to the finish line.** It can't be paused or sped up.
  - The game can't be paused in an online race. A **Leave race** button drops you out, and the race isn't counted.
- **Board:**
  - Shows the top 100 tags, ranked by best single race, with each player's average and number of races.
  - Players can race as often as they like.
  - Before the event opens, races are **warm-ups** on a separate warm-up board, so people can try online racing with friends.
  - After the close, the board shows the final standings and the winner.
- **Practice (any time):**
  - Runs on the Practice Grid: a plain white and grey circuit on a wireframe terrain, with no hazards, loops or jumps.
  - Players drive alone with endless laps, and can **swap vehicles** at any moment to learn them.
- **The witch is the voice:**
  - She presents the game, counts down, and calls out in the lobby.
  - When she swoops in front of the leader she shouts **"Follow me!"** and leaves the sparkle trail that gives a boost.

## Setup (once)

1. **Firebase project** (free plan), named `dr87-halloween`:
   - Authentication → Sign-in method → enable **Anonymous**.
   - Realtime Database → Create (Belgium, europe-west1) → **Rules** tab → paste `database.rules.json` → Publish.
   - Project settings → Your apps → Web app → copy the config into `FIREBASE` in `apps/web/src/event/config.ts`.
2. **GitHub Pages:** Settings → Environments → `github-pages` → Deployment branches → add `halloween-2026`.
3. Push the branch. CI runs the checks and publishes **only the event**, so nobody can reach the full game by changing the URL:
   - `https://feathercreativebulb-afk.github.io/DR87/` and `…/DR87/halloween/` both serve Halloween Night.
   - Browsers that played the full game before have it cached offline. A small replacement `sw.js` clears that cache on their next visit.
   - A push to `main` during the event would publish the full game again. Don't push `main` until after 1 Nov. Then re-run the workflow on `main` to bring the regular game back.

**The event build itself** only ever starts in Hollow Ridge or the Practice Grid. The game's own menu (garage, world picker, settings), the inspector and the Model Lab's debug handle are all left out.

**One limit:** the repo is public, which GitHub Pages on a free account requires, so the full game's source code can be read on GitHub. To hide it too, make the repo private. That needs GitHub Pro for Pages, or hosting on Firebase Hosting instead.

## Running the event

- **Opening and closing:** both happen automatically at the times in `config.ts`, and the database rules enforce the same times (`1793289600000` and `1793491200000` ms; results are accepted until 15 minutes after the close). To change the window, change both files.
- **Who won:** Firebase console → Realtime Database → `event/board`. The lowest `best` wins. Every finished race is also stored under `event/results/<race>/<player>`, with tag, time, vehicle and when it was set.
- **Before giving out the candy, check the winner.** Times come from the shared clock and the rules reject anything faster than 150 s for 3 laps, but a determined player with browser dev tools could still submit a fake time. Look at the winner's race in `event/results`: the other people in that race should have similar times.
- **What the rules protect:**
  - PIN guesses are limited to one every 5 s per tag, so trying every 4-digit PIN takes about 14 hours.
  - Board rows can't be deleted, and a player's best time can only go down.
  - A race's start time is locked once the race is on.
  - A dropped connection mid-race doesn't unseat the player.
  - Rude tags are blocked by the server too, not just the game.
- - **Removing a bad tag:** delete `tags/<TAG>`, `secrets/<TAG>` and `event/board/<TAG>` in the console.

## Testing

- `npm test`: unit tests, including the event logic (tags and PINs, filling races 3 at a time, starting with 2, falling back to waiting, best and average times).
- `npm run test:e2e`: boots the build on the local backend, signs up, checks every vehicle loads, and drives the practice track (desktop and phone).
- **Local backend:** while `FIREBASE.apiKey` is empty, or with `?local=1`, the game stores everything in the browser. Several tabs of one browser race each other, one player per tab.
- **Several browsers:** run `node tools/event-relay.mjs`, then open `?relay=ws://localhost:8787` in each browser. This is how the three-player race was tested end to end: sign-up, a taken tag, the announcement, joining, the countdown, the race, the results and the board.

## Where the code is

- `apps/web/src/event/`: the lobby (`lobby.ts`, `lobby.css`), the event rules (`logic.ts`), the backends (`store.ts`: Firebase, local, relay) and the settings (`config.ts`).
- `packages/core/src/legacy/game.js`: the game. It is imported from the Model Lab build with the event module (`window.__EV`: online cars, practice track, name tags, the witch's lines), by `tools/import-artifact.py`.
- `database.rules.json`: the Firebase security rules.
- `assets/vox/`: the witch's voice clips.

## Rebuilding the game from the Model Lab

The event game is the Model Lab's Hollow Ridge build plus the event module. The sources are in `tools/halloween/`:
- `patch_event.py` turns the Lab page into the event page. It removes the Lab bench, splices in `event-game.js`, adds the frame-loop and race-flow hooks, and installs the witch's lines.
- `build.sh` runs it and then `tools/import-artifact.py`.
- `witch2.py` is the witch's voice: Kokoro TTS re-sung through the WORLD vocoder (style `toon`, with a room reverb).
- `make_vox.py` maps the witch's clips onto the game's announcer files.

The paths in `build.sh` and `make_vox.py` point at the build machine; adjust them before running elsewhere.
