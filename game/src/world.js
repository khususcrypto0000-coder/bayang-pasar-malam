// Bayang Pasar Malam — the simulation. Pure logic, no DOM: a Node test harness can
// drive it headlessly. The world advances in fixed 1/60 s steps.
//
// Guards have three minds: patrol (walk the waypoints), investigate (walk to a
// sound or a glimpse, look around), chase (run at the player). The detection
// meter fills while the player stands inside a guard's lit cone with a clear line
// of sight, faster up close and while running, slower while sneaking, and never
// while the player hides under a tarp. A full meter raises the alarm; a touch
// while chased means caught.

import { FIELD, GUARD, LIVES, PLAYER, SCORE, STEP, THROW } from './config.js';
import {
  LEVEL,
  circleHitsWalls,
  hasLineOfSight,
  pointInHideZone,
  pointInWalls,
} from './level.js';

export const EVENT_CAUGHT = 1;
export const EVENT_WIN = 2;
export const EVENT_PICKUP = 4;
export const EVENT_ALARM = 8;
export const EVENT_THROW = 16;

export const GUARD_PATROL = 'patrol';
export const GUARD_INVESTIGATE = 'investigate';
export const GUARD_CHASE = 'chase';

function angleTo(x0, y0, x1, y1) {
  return Math.atan2(y1 - y0, x1 - x0);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** A fresh guard, standing at its first waypoint, facing along the patrol. */
function createGuard(def) {
  const first = def.waypoints[0];
  const second = def.waypoints[1] ?? first;
  return {
    name: def.name,
    waypoints: def.waypoints,
    speed: def.speed,
    x: first.x,
    y: first.y,
    angle: angleTo(first.x, first.y, second.x, second.y),
    waypointIndex: 1 % def.waypoints.length,
    state: GUARD_PATROL,
    target: null,
    lookTimer: 0,
    chaseTimer: 0,
    pauseTimer: 0,
    /** The last place this guard saw or heard the player. */
    lastSeen: null,
    /** How far this guard's meter has filled, 0..1. Shared alarm is the max. */
    detection: 0,
  };
}

export function createWorld(random) {
  const state = {
    random,
    time: 0,
    lives: LIVES,
    coinsTaken: 0,
    coinsLeft: THROW.count,
    lanternTaken: false,
    won: false,
    caught: false,
    /** The alarm meter, 0..1: the highest of the guards' meters. */
    alarm: 0,
    /** 'calm' | 'suspicious' | 'alerted' — the loudest guard's mind. */
    alert: 'calm',
    player: {
      x: LEVEL.playerStart.x,
      y: LEVEL.playerStart.y,
      angle: -Math.PI / 2,
      sneaking: false,
      hidden: false,
      moving: false,
      stepPhase: 0,
    },
    guards: LEVEL.guards.map(createGuard),
    coins: LEVEL.coins.map((c) => ({ ...c })),
    lantern: { ...LEVEL.lantern, taken: false },
    /** Thrown coins still clinking on the floor (visual + one investigation). */
    thrown: [],
    /** The last noise event guards heard: {x, y, radius, at}. */
    noise: null,
    score: 0,
  };

  /** Move a circle with axis separation, so it slides along walls instead of sticking. */
  function moveCircle(body, dx, dy, radius) {
    const nx = body.x + dx;
    if (!circleHitsWalls(nx, body.y, radius, LEVEL.walls)) body.x = nx;
    const ny = body.y + dy;
    if (!circleHitsWalls(body.x, ny, radius, LEVEL.walls)) body.y = ny;
    body.x = clamp(body.x, WALL_MARGIN, FIELD.width - WALL_MARGIN);
    body.y = clamp(body.y, WALL_MARGIN, FIELD.height - WALL_MARGIN);
  }

  /** Can this guard see the player right now? Returns 0 when it cannot. */
  function sightStrength(guard) {
    const p = state.player;
    const dx = p.x - guard.x;
    const dy = p.y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > GUARD.sightRange) return 0;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), guard.angle)) > GUARD.sightHalfAngle) return 0;
    if (!hasLineOfSight(guard.x, guard.y, p.x, p.y, LEVEL.walls)) return 0;
    if (p.hidden) return 0;
    // Closer and faster-moving players are spotted sooner.
    const closeness = 1 - (dist / GUARD.sightRange) * 0.55;
    return closeness * (p.sneaking ? 0.5 : 1);
  }

  function guardSeesPlayer(guard) {
    return sightStrength(guard) > 0;
  }

  function setGuardTarget(guard, x, y, stateName) {
    guard.target = { x, y };
    guard.state = stateName;
    guard.lookTimer = 0;
  }

  function stepGuard(guard, dt) {
    const p = state.player;
    const strength = sightStrength(guard);

    // The meter fills on sight, drains in the dark. A full meter raises the alarm.
    if (strength > 0) {
      guard.detection = Math.min(1, guard.detection + (strength / GUARD.detectSeconds) * dt);
    } else {
      guard.detection = Math.max(0, guard.detection - 0.7 * dt);
    }
    if (guard.detection >= 1 && guard.state !== GUARD_CHASE) {
      guard.state = GUARD_CHASE;
      guard.chaseTimer = GUARD.chaseMemory;
      guard.lastSeen = { x: p.x, y: p.y };
    }

    // A walking player is heard nearby; a sneaking one is not.
    if (state.noise && guard.state === GUARD_PATROL) {
      const d = Math.hypot(state.noise.x - guard.x, state.noise.y - guard.y);
      if (d < state.noise.radius) setGuardTarget(guard, state.noise.x, state.noise.y, GUARD_INVESTIGATE);
    }

    if (guard.state === GUARD_CHASE) {
      if (guardSeesPlayer(guard)) {
        guard.lastSeen = { x: p.x, y: p.y };
        guard.chaseTimer = GUARD.chaseMemory;
      } else {
        guard.chaseTimer -= dt;
      }
      const dest = guard.lastSeen ?? { x: p.x, y: p.y };
      const dist = Math.hypot(dest.x - guard.x, dest.y - guard.y);
      if (dist < 8 || guard.chaseTimer <= 0) {
        setGuardTarget(guard, dest.x, dest.y, GUARD_INVESTIGATE);
        guard.lookTimer = GUARD.lookAround;
      } else {
        const a = angleTo(guard.x, guard.y, dest.x, dest.y);
        guard.angle = a;
        moveCircle(guard, Math.cos(a) * GUARD.chaseSpeed * dt, Math.sin(a) * GUARD.chaseSpeed * dt, GUARD.radius);
      }
      return;
    }

    if (guard.state === GUARD_INVESTIGATE) {
      if (guard.target) {
        const dist = Math.hypot(guard.target.x - guard.x, guard.target.y - guard.y);
        if (dist > 10) {
          const a = angleTo(guard.x, guard.y, guard.target.x, guard.target.y);
          guard.angle = a;
          moveCircle(guard, Math.cos(a) * GUARD.investigateSpeed * dt, Math.sin(a) * GUARD.investigateSpeed * dt, GUARD.radius);
          return;
        }
      }
      // Arrived: look around, then go back to the patrol.
      guard.lookTimer -= dt;
      guard.angle += dt * 1.4;
      if (guard.lookTimer <= 0) {
        guard.state = GUARD_PATROL;
        guard.target = null;
      }
      return;
    }

    // Patrol: walk the waypoints, pausing a beat at each one to look around.
    if (guard.pauseTimer > 0) {
      guard.pauseTimer -= dt;
      guard.angle += dt * 0.9;
      return;
    }
    const wp = guard.waypoints[guard.waypointIndex];
    const dist = Math.hypot(wp.x - guard.x, wp.y - guard.y);
    if (dist < 8) {
      guard.waypointIndex = (guard.waypointIndex + 1) % guard.waypoints.length;
      guard.pauseTimer = 0.7;
      return;
    }
    const a = angleTo(guard.x, guard.y, wp.x, wp.y);
    guard.angle = a;
    moveCircle(guard, Math.cos(a) * guard.speed * dt, Math.sin(a) * guard.speed * dt, GUARD.radius);
  }

  function stepPlayer(input, dt) {
    const p = state.player;
    const dx = input.x;
    const dy = input.y;
    p.moving = dx !== 0 || dy !== 0;
    p.sneaking = input.sneak;
    if (p.moving) {
      p.angle = Math.atan2(dy, dx);
      const speed = p.sneaking ? PLAYER.sneakSpeed : PLAYER.walkSpeed;
      const len = Math.hypot(dx, dy);
      moveCircle(p, (dx / len) * speed * dt, (dy / len) * speed * dt, PLAYER.radius);
      p.stepPhase += dt * (p.sneaking ? 5 : 9);
      if (!p.sneaking) {
        state.noise = { x: p.x, y: p.y, radius: PLAYER.noiseRadius, at: state.time };
      }
    }
    p.hidden = pointInHideZone(p.x, p.y, LEVEL.hideZones);
  }

  function checkPickups() {
    const p = state.player;
    let events = 0;
    for (const coin of state.coins) {
      if (!coin.taken && Math.hypot(coin.x - p.x, coin.y - p.y) < PLAYER.radius + 16) {
        coin.taken = true;
        state.coinsTaken += 1;
        state.score += SCORE.coin;
        events |= EVENT_PICKUP;
      }
    }
    if (!state.lantern.taken && Math.hypot(state.lantern.x - p.x, state.lantern.y - p.y) < PLAYER.radius + 18) {
      state.lantern.taken = true;
      state.lanternTaken = true;
      state.score += SCORE.coin;
      events |= EVENT_PICKUP;
    }
    return events;
  }

  function checkWin() {
    const p = state.player;
    const e = LEVEL.exit;
    return (
      state.lanternTaken &&
      p.x >= e.x && p.x < e.x + e.w && p.y >= e.y && p.y < e.y + e.h
    );
  }

  function resetAfterCaught() {
    state.player.x = LEVEL.playerStart.x;
    state.player.y = LEVEL.playerStart.y;
    state.player.angle = -Math.PI / 2;
    state.alarm = 0;
    for (const guard of state.guards) {
      const fresh = createGuard(LEVEL.guards[state.guards.indexOf(guard)]);
      Object.assign(guard, fresh);
    }
    state.thrown = [];
    state.noise = null;
  }

  /** Throw a coin toward a point: guards nearby go look at where it lands. */
  function throwCoin(targetX, targetY) {
    if (state.coinsLeft <= 0 || state.won || state.caught) return false;
    const p = state.player;
    const dist = Math.hypot(targetX - p.x, targetY - p.y);
    const range = Math.min(dist, THROW.range);
    const angle = Math.atan2(targetY - p.y, targetX - p.x);
    let lx = p.x + Math.cos(angle) * range;
    let ly = p.y + Math.sin(angle) * range;
    if (pointInWalls(lx, ly, LEVEL.walls)) {
      lx = p.x + Math.cos(angle) * (range * 0.5);
      ly = p.y + Math.sin(angle) * (range * 0.5);
    }
    state.coinsLeft -= 1;
    state.thrown.push({ x: lx, y: ly, age: 0 });
    for (const guard of state.guards) {
      if (guard.state !== GUARD_CHASE && Math.hypot(lx - guard.x, ly - guard.y) < THROW.hearRadius) {
        setGuardTarget(guard, lx, ly, GUARD_INVESTIGATE);
        guard.lookTimer = GUARD.lookAround;
      }
    }
    return true;
  }

  /** Advance the world one fixed step. `input` is {x, y, sneak}. Returns event flags. */
  function step(dt, input) {
    if (state.won) return 0;
    state.time += dt;
    state.noise = null;
    stepPlayer(input, dt);
    for (const guard of state.guards) stepGuard(guard, dt);
    state.alarm = Math.max(...state.guards.map((g) => g.detection));
    state.alert =
      state.guards.some((g) => g.state === GUARD_CHASE)
        ? 'alerted'
        : state.guards.some((g) => g.state === GUARD_INVESTIGATE) || state.alarm > 0.25
          ? 'suspicious'
          : 'calm';
    for (const t of state.thrown) t.age += dt;
    state.thrown = state.thrown.filter((t) => t.age < 1.2);

    let events = checkPickups();
    if (checkWin()) {
      state.won = true;
      state.score += SCORE.win + SCORE.life * state.lives + Math.max(0, SCORE.timeBonusMax - Math.floor(state.time) * 2);
      return events | EVENT_WIN;
    }
    for (const guard of state.guards) {
      if (
        guard.state === GUARD_CHASE &&
        Math.hypot(guard.x - state.player.x, guard.y - state.player.y) < GUARD.catchRadius
      ) {
        state.lives -= 1;
        state.caught = true;
        events |= EVENT_CAUGHT;
        if (state.lives > 0) {
          state.caught = false;
          resetAfterCaught();
        }
        return events;
      }
    }
    return events;
  }

  return { state, step, throwCoin, resetAfterCaught };
}

// The wall margin keeps bodies inside the playfield (walls are 24 px thick).
const WALL_MARGIN = 24 + 13;
