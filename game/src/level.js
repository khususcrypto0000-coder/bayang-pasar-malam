// Bayang Pasar Malam — the night market after closing: one level, drawn from data.
// Walls block movement and sight. Stalls are walls with awnings. Tarp tents are
// walkable hiding spots: inside one, a guard's cone cannot fill the meter.
// The route from the start (bottom-left) to the heirloom lantern (top-right shed)
// and back to the exit gate (bottom-right) is passable without ever being seen,
// if the player waits for the patrols to turn.

export const WALL_THICKNESS = 24;

function rect(x, y, w, h) {
  return { x, y, w, h };
}

export const LEVEL = {
  name: 'Pasar Malam — Selepas Tutup',
  /** Solid rectangles: the outer wall plus every stall and crate. */
  walls: [
    // Outer walls.
    rect(0, 0, 1280, WALL_THICKNESS),
    rect(0, 720 - WALL_THICKNESS, 1280, WALL_THICKNESS),
    rect(0, 0, WALL_THICKNESS, 720),
    rect(1280 - WALL_THICKNESS, 0, WALL_THICKNESS, 720),
    // Market stalls (top row).
    rect(180, 120, 220, 90),
    rect(520, 90, 200, 90),
    rect(860, 140, 220, 90),
    // Market stalls (middle row).
    rect(120, 380, 200, 90),
    rect(460, 360, 220, 100),
    rect(820, 400, 200, 90),
    // Stall guarding the exit lane.
    rect(1050, 520, 150, 100),
    // Crates.
    rect(340, 560, 60, 60),
    rect(700, 560, 60, 60),
  ],
  /** Walkable tarp tents that hide the player from every vision cone. */
  hideZones: [
    { ...rect(430, 230, 100, 80), label: 'Tenda' },
    { ...rect(760, 300, 100, 80), label: 'Tenda' },
    { ...rect(180, 560, 110, 80), label: 'Tenda' },
  ],
  /** Heirloom coins, worth score; all three are optional. */
  coins: [
    { x: 300, y: 300, taken: false },
    { x: 620, y: 250, taken: false },
    { x: 980, y: 560, taken: false },
  ],
  /** The heirloom lantern in the shed, top-right. Take it, then reach the exit. */
  lantern: { x: 1160, y: 92 },
  /** The exit gate, bottom-right. Locked until the lantern is taken. */
  exit: { ...rect(1150, 640, 80, 56), label: 'KELUAR' },
  playerStart: { x: 80, y: 620 },
  guards: [
    {
      name: 'Pak Darso',
      waypoints: [
        { x: 300, y: 300 },
        { x: 1000, y: 300 },
      ],
      speed: 70,
    },
    {
      name: 'Bu Sari',
      waypoints: [
        { x: 700, y: 180 },
        { x: 700, y: 600 },
      ],
      speed: 64,
    },
    {
      name: 'Mas Agus',
      waypoints: [
        { x: 950, y: 110 },
        { x: 1180, y: 110 },
        { x: 1180, y: 280 },
        { x: 950, y: 280 },
      ],
      speed: 82,
    },
  ],
};

/** True when the point is inside any wall rectangle. */
export function pointInWalls(x, y, walls) {
  for (let i = 0; i < walls.length; i += 1) {
    const w = walls[i];
    if (x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h) return true;
  }
  return false;
}

/** True when the point is inside any hiding tarp. */
export function pointInHideZone(x, y, zones) {
  for (let i = 0; i < zones.length; i += 1) {
    const z = zones[i];
    if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) return true;
  }
  return false;
}

/** Circle-vs-walls test used by movement: true when the circle overlaps a wall. */
export function circleHitsWalls(x, y, radius, walls) {
  for (let i = 0; i < walls.length; i += 1) {
    const w = walls[i];
    const nearestX = Math.max(w.x, Math.min(x, w.x + w.w));
    const nearestY = Math.max(w.y, Math.min(y, w.y + w.h));
    const dx = x - nearestX;
    const dy = y - nearestY;
    if (dx * dx + dy * dy < radius * radius) return true;
  }
  return false;
}

/**
 * Line of sight between two points, sampled every 4 px: a wall anywhere along the
 * segment blocks sight. Used for vision cones and for the cone's clipped shape.
 */
export function hasLineOfSight(x0, y0, x1, y1, walls) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 4));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (pointInWalls(x0 + dx * t, y0 + dy * t, walls)) return false;
  }
  return true;
}

/** Distance from a point to the nearest wall along a ray; the cone's clipped edge. */
export function rayHitDistance(x, y, angle, maxDist, walls) {
  const step = 4;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let d = step; d <= maxDist; d += step) {
    if (pointInWalls(x + cos * d, y + sin * d, walls)) return d - step;
  }
  return maxDist;
}
