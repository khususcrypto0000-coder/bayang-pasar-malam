# Bayang Pasar Malam

A complete, original top-down stealth game that plays offline in a desktop
browser from static files. Entry for the make.fun bounty
**"Make the best stealth game"** (`best-stealth-game-20261121-1759`).

## The game

The night market has closed. You are Kiki, a courier's kid, sneaking back into
the market after dark to fetch your grandmother's heirloom lantern from the
shed — then slipping out through the exit gate, unseen.

- **One level, top-down**: the closed night market — stalls, crates and tarp
  tents, seen from above.
- **Guards with vision cones**: three night guards (Pak Darso, Bu Sari,
  Mas Agus) walk patrol routes with flashlight cones, clipped by walls and
  stalls. A guard who spots you fills a detection meter; a full meter raises
  the alarm and the guard chases you.
- **Cover to hide behind**: duck under a striped tarp tent and no cone can see
  you; stalls and crates block sight and movement.
- **An exit to reach unseen**: grab the Lampion Pusaka in the top-right shed,
  then reach the KELUAR gate at the bottom-right. Getting caught costs a life;
  three lives, then the night is over.
- **Depth**: sneak (Shift) to move slowly and quietly, walk loudly and guards
  hear your footsteps, throw a coin (mouse click) to lure a guard away to
  investigate, and collect heirloom coins for score. Guards investigate sounds
  and glimpses, look around, then return to patrol — patrols can be learned,
  routes reward patience, and a near miss gives you a chance to recover.
- **Feel**: cones that react as you expect, a "?" then "!" over a guard's head,
  an alarm bar that fills as you are spotted, footsteps that tell you where a
  guard is, and fully synthesised WebAudio sound (footsteps, coin clinks, the
  alarm sting, crickets at night). M mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrow keys | Move |
| Shift (hold) | Sneak — slower, quieter, harder to spot |
| Mouse click | Throw a coin toward that spot (3 coins, lures guards) |
| Space / Enter | Start / restart |
| P / Esc | Pause |
| M | Mute |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network request: `game/index.html` and everything it loads
live under `game/`, all art and sound are procedural.

## Screenshots

`?shot=start|play|near|end&seed=1` stages a deterministic scene (title,
mid-game behind cover, a near miss inside a vision cone, the escape) for
screenshots; `shots.json` lists the four shipped shots.

## Files

- `game/index.html` — the page
- `game/src/config.js` — tuning numbers, palette, level shapes
- `game/src/level.js` — the market layout, line of sight, hiding spots
- `game/src/world.js` — the simulation: movement, guard AI, detection, scoring
- `game/src/render.js` — all procedural drawing: floor, stalls, cones, HUD
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — synthesised WebAudio sound
- `game/src/shots.js` — the staged screenshot scenes
- `game/src/main.js` — boot and the game loop
- `game/src/random.js` — seeded random
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json`
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged

## License

MIT — see `LICENSE`.
