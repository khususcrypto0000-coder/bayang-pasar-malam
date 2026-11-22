// Bayang Pasar Malam — every tuning number, colour and level shape in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size. All art is procedural.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 168,
  sneakSpeed: 92,
  /** Noise radius while walking; sneaking is silent. */
  noiseRadius: 110,
};

export const GUARD = {
  radius: 14,
  patrolSpeed: 68,
  investigateSpeed: 96,
  chaseSpeed: 152,
  /** Vision cone: how far the flashlight reaches, in pixels. */
  sightRange: 245,
  /** Half-angle of the cone, in radians. */
  sightHalfAngle: 0.68,
  /** Seconds of full exposure to fill the detection meter at point blank. */
  detectSeconds: 1.15,
  /** Seconds a guard keeps chasing after losing sight. */
  chaseMemory: 3.0,
  /** Seconds a guard looks around at an investigation point. */
  lookAround: 2.2,
  /** Touch distance that counts as caught. */
  catchRadius: 27,
};

export const LIVES = 3;

/** A thrown coin: how many, how far it flies, how far its clink is heard. */
export const THROW = { count: 3, range: 320, hearRadius: 300 };

/** Score values. */
export const SCORE = { win: 1000, coin: 300, life: 200, timeBonusMax: 300 };

export const PALETTE = {
  night: '#0b0e1a',
  floor: '#171c2e',
  floorAlt: '#1b2136',
  wall: '#2c3350',
  wallTop: '#454f78',
  stallWood: '#6b4a2f',
  stallAwning: '#a33327',
  stallAwningAlt: '#d9a441',
  tarp: '#14524a',
  tarpStripe: '#1d6f61',
  lanternGlow: '#ffb347',
  cone: '#ffe9a3',
  player: '#3ddc97',
  playerSneak: '#2a9d6e',
  guard: '#e8b23a',
  guardUniform: '#33415e',
  exit: '#39d353',
  exitLocked: '#5a6478',
  text: '#f2ede3',
  muted: '#9aa3b8',
  danger: '#ff5d5d',
  warn: '#ffb020',
  panel: 'rgba(10, 13, 26, 0.82)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'bayang-pasar-malam.best';
