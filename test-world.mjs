// Headless logic tests for Bayang Pasar Malam (Node, no browser).
// Drives game/src/world.js directly: winnability via a waypoint autopilot,
// vision-cone detection, tarp hiding, wall-blocked sight, coin throws, catches.
import { createRandom } from './game/src/random.js';
import { createWorld } from './game/src/world.js';
import { hasLineOfSight, LEVEL } from './game/src/level.js';
import { STEP } from './game/src/config.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures += 1;
}

const IDLE = { x: 0, y: 0, sneak: false };
function fresh(seed = 1) {
  return createWorld(createRandom(seed));
}
function stepFor(world, seconds, input = IDLE) {
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) world.step(STEP, input);
}

// --- line of sight -------------------------------------------------------
check('LOS open across the market', hasLineOfSight(80, 620, 100, 300, LEVEL.walls));
check('LOS blocked by a stall', !hasLineOfSight(300, 300, 300, 100, LEVEL.walls));
check('LOS blocked by the middle stall row', !hasLineOfSight(570, 300, 570, 500, LEVEL.walls));

// --- detection ------------------------------------------------------------
{
  const w = fresh();
  const g = w.state.guards[0];
  g.x = 500; g.y = 300; g.angle = 0; g.state = 'patrol'; g.waypointIndex = 1;
  w.state.player.x = 620; w.state.player.y = 300; // dead ahead, in the cone
  stepFor(w, 0.8);
  check('detection fills inside the cone', g.detection > 0.5, `detection=${g.detection.toFixed(2)}`);
}
{
  const w = fresh();
  const g = w.state.guards[0];
  g.x = 500; g.y = 300; g.angle = 0; g.state = 'patrol'; g.waypointIndex = 1;
  w.state.player.x = 620; w.state.player.y = 300;
  // A stall between guard and player blocks sight.
  w.state.player.x = 300; w.state.player.y = 160; // behind stall S1 from (500,300)? use direct wall test instead
  g.x = 300; g.y = 300; g.angle = -Math.PI / 2;
  w.state.player.x = 300; w.state.player.y = 100; // stall S1 (180..400, 120..210) sits between
  stepFor(w, 1.0);
  check('detection stays 0 behind a wall', g.detection === 0, `detection=${g.detection.toFixed(2)}`);
}
{
  const w = fresh();
  const g = w.state.guards[0];
  g.x = 480; g.y = 270; g.angle = Math.PI; g.state = 'patrol'; g.waypointIndex = 0;
  w.state.player.x = 480; w.state.player.y = 270; // inside tarp H1, in the cone
  stepFor(w, 1.0);
  check('detection stays 0 inside a tarp hide zone', g.detection === 0, `detection=${g.detection.toFixed(2)}`);
  check('player counts as hidden in the tarp', w.state.player.hidden === true);
}

// --- coin throw lures a guard ----------------------------------------------
{
  const w = fresh();
  const g = w.state.guards[0];
  g.x = 480; g.y = 320; g.state = 'patrol';
  // Clicked point (300, 500) is within throw range of the player at (80, 620).
  const ok = w.throwCoin(300, 500);
  check('throw coin succeeds', ok && w.state.coinsLeft === 2);
  check('guard investigates the clink', g.state === 'investigate' && g.target && Math.abs(g.target.x - 300) < 1 && Math.abs(g.target.y - 500) < 1);
}

// --- a chase that touches the player costs a life ---------------------------
{
  const w = fresh();
  const g = w.state.guards[0];
  g.x = 500; g.y = 300; g.state = 'chase'; g.lastSeen = { x: 510, y: 300 }; g.chaseTimer = 3;
  w.state.player.x = 512; w.state.player.y = 300;
  const livesBefore = w.state.lives;
  const events = w.step(STEP, IDLE);
  check('touch while chased costs a life', w.state.lives === livesBefore - 1, `lives=${w.state.lives}`);
  check('player respawns at the start after a catch', w.state.player.x === LEVEL.playerStart.x && w.state.player.y === LEVEL.playerStart.y);
}

// --- winnability: autopilot walks the route, sneaks near guards, waits out
//     the meter inside a tarp when spotted -----------------------------------
{
  const ROUTE = [
    [150, 620], [100, 500], [100, 300], [360, 300], [620, 250], [760, 300],
    [820, 100], [1160, 95], [1180, 300], [1100, 500], [1000, 520], [1000, 660], [1180, 645],
  ];
  const HIDES = LEVEL.hideZones.map((z) => [z.x + z.w / 2, z.y + z.h / 2]);
  const w = fresh();
  let wp = 0;
  let simSeconds = 0;
  let won = false;
  let caught = 0;
  const maxSim = 300;
  while (simSeconds < maxSim && !won) {
    const s = w.state;
    if (s.won) { won = true; break; }
    const livesBefore = s.lives;
    // If spotted, retreat to the nearest tarp and wait for the meter to drain.
    let target = ROUTE[wp];
    if (s.alarm > 0.25 && !s.player.hidden) {
      let best = HIDES[0];
      let bestD = Infinity;
      for (const h of HIDES) {
        const d = Math.hypot(h[0] - s.player.x, h[1] - s.player.y);
        if (d < bestD) { bestD = d; best = h; }
      }
      target = best;
    }
    const dx = target[0] - s.player.x;
    const dy = target[1] - s.player.y;
    const dist = Math.hypot(dx, dy);
    const nearGuard = Math.min(...s.guards.map((g) => Math.hypot(g.x - s.player.x, g.y - s.player.y)));
    const input = dist < 14
      ? IDLE
      : { x: dx / dist, y: dy / dist, sneak: nearGuard < 300 || s.alarm > 0.1 };
    const events = w.step(STEP, input);
    if (s.lives < livesBefore) caught += 1;
    if (dist < 14 && target === ROUTE[wp]) wp += 1;
    if (wp >= ROUTE.length && s.lanternTaken) {
      // Last leg is the exit itself; the win check runs inside step().
    }
    simSeconds += STEP;
  }
  check('autopilot wins the level', won, `time=${simSeconds.toFixed(1)}s lives=${w.state.lives} score=${w.state.score} caught=${caught}`);
  check('lantern was taken on the way', w.state.lanternTaken);
}

console.log(failures === 0 ? '\nALL LOGIC TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
