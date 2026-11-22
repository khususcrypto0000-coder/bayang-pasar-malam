// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play, paused,
// game over and win.
//
// ?seed=N fixes the night's randomness. ?shot=start|play|near|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CAUGHT, EVENT_PICKUP, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Pixels walked between the player's footstep sounds. */
const STEP_SOUND_EVERY = 30;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, 0);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let caughtFlash = 0;
  let lastAlert = 'calm';
  let walkedSinceStep = 0;
  let guardStepTimer = 0;

  // Screen readers (and anyone watching the page's text) hear screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    const fresh = createWorld(createRandom(seed));
    world.state = fresh.state;
    world.step = fresh.step;
    world.throwCoin = fresh.throwCoin;
    world.resetAfterCaught = fresh.resetAfterCaught;
    accumulator = 0;
    caughtFlash = 0;
    screen = SCREEN_PLAY;
    announce('Bermain. Ambil Lampion Pusaka, lalu keluar tanpa ketahuan.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won ? `Lolos! Skor ${world.state.score}.` : `Ketahuan. Skor ${world.state.score}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      audio.unlock();
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Jeda.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Bermain.');
    }
    const click = input.takeClick();
    if (click && screen === SCREEN_TITLE) {
      audio.unlock();
      startGame();
    } else if (click && screen === SCREEN_PLAY) {
      // A click throws a coin toward that spot on the market floor.
      const rect = canvas.getBoundingClientRect();
      const s = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
      const ox = (rect.width - FIELD.width * s) / 2;
      const oy = (rect.height - FIELD.height * s) / 2;
      const lx = (click.x - ox) / s;
      const ly = (click.y - oy) / s;
      if (world.throwCoin(lx, ly)) {
        audio.coinThrow();
        announce('Koin dilempar — satpam mendengar bunyinya.');
      }
    } else if (click && (screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
    }
  }

  function handleEvents(events) {
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_WIN) {
      audio.win();
      endGame(true);
    } else if (events & EVENT_CAUGHT) {
      audio.caught();
      caughtFlash = 1.2;
      if (world.state.lives <= 0) endGame(false);
      else announce(`Ketahuan! Sisa nyawa ${world.state.lives}.`);
    }
  }

  function step(dt) {
    if (screen === SCREEN_TITLE) {
      // The market idles behind the menu: guards walk their rounds.
      world.step(dt, { x: 0, y: 0, sneak: false });
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const before = world.state.player;
    const px = before.x;
    const py = before.y;
    const events = world.step(dt, input.direction());
    const moved = Math.hypot(before.x - px, before.y - py);
    if (before.moving && moved > 0) {
      walkedSinceStep += moved;
      if (walkedSinceStep >= STEP_SOUND_EVERY) {
        walkedSinceStep = 0;
        audio.footstep(before.sneaking);
      }
    }
    // The nearest guard's steps, when close enough to hear.
    guardStepTimer -= dt;
    if (guardStepTimer <= 0) {
      let nearest = Infinity;
      for (const guard of world.state.guards) {
        nearest = Math.min(nearest, Math.hypot(guard.x - before.x, guard.y - before.y));
      }
      if (nearest < 320) {
        audio.guardStep(nearest);
        guardStepTimer = 0.55;
      } else {
        guardStepTimer = 0.2;
      }
    }
    if (world.state.alert === 'alerted' && lastAlert !== 'alerted') audio.alarm();
    lastAlert = world.state.alert;
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += dt;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    if (caughtFlash > 0) caughtFlash -= dt;
    renderer.draw(world.state, screen, best, Math.max(0, caughtFlash));
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Jeda.');
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'm') {
      const muted = audio.toggleMute();
      announce(muted ? 'Suara mati.' : 'Suara hidup.');
    }
  });

  // The playtest hook: the page's state, for automated checks.
  window.__game = {
    get screen() {
      return screen;
    },
    get state() {
      return world.state;
    },
    world,
  };

  announce('Bayang Pasar Malam. Tekan Spasi atau klik untuk mulai.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
