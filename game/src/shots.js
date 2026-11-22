// The screenshot scenes behind ?shot=start|play|near|end. Each one stages a real,
// reachable game state — the same world, the same rules — then lets it run
// forward a short while, so the frame is what a short game really looks like
// and the same seed always gives the same frame.
import { STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 2;
const NEAR_SECONDS = 0.25;
const IDLE = { x: 0, y: 0, sneak: false };

function simulate(world, seconds, input = IDLE) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) world.step(STEP, input);
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * best score to show. Any other name is the title scene.
 */
export function stageShot(name, world) {
  const state = world.state;
  if (name === 'play') {
    // Mid-game: the player hides under a tarp while Pak Darso's flashlight sweeps
    // across it — the cone, the cover and the hidden player in one frame.
    state.player.x = 480;
    state.player.y = 270;
    state.player.sneaking = true;
    const guard = state.guards[0];
    guard.x = 560;
    guard.y = 300;
    guard.angle = Math.PI;
    guard.waypointIndex = 0;
    guard.state = 'patrol';
    simulate(world, PLAY_SECONDS, IDLE);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'near') {
    // A near miss: the player, sneaking in the open, is caught in Bu Sari's cone
    // with the meter three-quarters full and the guard closing in.
    state.player.x = 700;
    state.player.y = 330;
    state.player.sneaking = true;
    const guard = state.guards[1];
    guard.x = 700;
    guard.y = 440;
    guard.angle = -Math.PI / 2;
    guard.waypointIndex = 0;
    guard.state = 'patrol';
    guard.detection = 0.68;
    simulate(world, NEAR_SECONDS, IDLE);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'end') {
    // The escape: lantern taken, the player steps through the exit gate.
    // Parked at the gate's top-left corner so the KELUAR sign stays readable.
    state.lantern.taken = true;
    state.lanternTaken = true;
    state.player.x = 1160;
    state.player.y = 648;
    world.step(STEP, IDLE);
    return { screen: SCREEN_WIN, best: state.score };
  }
  // Title: the market idles behind the menu while the guards walk their rounds.
  simulate(world, START_SECONDS, IDLE);
  return { screen: SCREEN_TITLE, best: 0 };
}
