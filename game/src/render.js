// Bayang Pasar Malam — the renderer. Everything is drawn, nothing is loaded: the
// night-market floor, striped stall awnings, glowing lanterns, tarp tents, the
// guards' flashlight cones (raycast-clipped by walls), the player, the HUD and
// every screen. The canvas is 1280x720 logical and scaled to the window.

import { FIELD, GUARD, PALETTE, FONT } from './config.js';
import { LEVEL, rayHitDistance } from './level.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const CONE_RAYS = 26;

function conePolygon(guard) {
  const pts = [{ x: guard.x, y: guard.y }];
  const start = guard.angle - GUARD.sightHalfAngle;
  const end = guard.angle + GUARD.sightHalfAngle;
  for (let i = 0; i <= CONE_RAYS; i += 1) {
    const a = start + ((end - start) * i) / CONE_RAYS;
    const d = rayHitDistance(guard.x, guard.y, a, GUARD.sightRange, LEVEL.walls);
    pts.push({ x: guard.x + Math.cos(a) * d, y: guard.y + Math.sin(a) * d });
  }
  return pts;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const scale = { x: 1, y: 1, ox: 0, oy: 0 };

  // A pre-rendered floor tile: dark cobbles with speckles, tiled across the field.
  const tile = document.createElement('canvas');
  tile.width = 128;
  tile.height = 128;
  const tctx = tile.getContext('2d');
  tctx.fillStyle = PALETTE.floor;
  tctx.fillRect(0, 0, 128, 128);
  tctx.strokeStyle = 'rgba(255,255,255,0.045)';
  tctx.lineWidth = 2;
  for (let y = 0; y <= 128; y += 32) {
    tctx.beginPath();
    tctx.moveTo(0, y);
    tctx.lineTo(128, y);
    tctx.stroke();
  }
  for (let x = 0; x <= 128; x += 32) {
    tctx.beginPath();
    tctx.moveTo(x, 0);
    tctx.lineTo(x, 128);
    tctx.stroke();
  }
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 90; i += 1) {
    tctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.16)';
    tctx.fillRect(rnd() * 128, rnd() * 128, 3, 3);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const s = Math.min(w / FIELD.width, h / FIELD.height);
    scale.x = s * dpr;
    scale.y = s * dpr;
    scale.ox = ((w - FIELD.width * s) / 2) * dpr;
    scale.oy = ((h - FIELD.height * s) / 2) * dpr;
  }

  function drawFloor(time) {
    ctx.save();
    ctx.translate(scale.ox, scale.oy);
    ctx.scale(scale.x, scale.y);
    const pattern = ctx.createPattern(tile, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Warm pools of lantern light between the stalls.
    for (const stall of LEVEL.walls.slice(4, 11)) {
      const cx = stall.x + stall.w / 2;
      const cy = stall.y + stall.h + 26;
      const flicker = 0.75 + Math.sin(time * 2.1 + cx) * 0.08;
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 130);
      g.addColorStop(0, `rgba(255, 179, 71, ${0.16 * flicker})`);
      g.addColorStop(1, 'rgba(255, 179, 71, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 130, cy - 130, 260, 260);
    }
    ctx.restore();
  }

  function drawWallsAndStalls() {
    ctx.save();
    ctx.translate(scale.ox, scale.oy);
    ctx.scale(scale.x, scale.y);
    for (let i = 0; i < LEVEL.walls.length; i += 1) {
      const w = LEVEL.walls[i];
      const isStall = i >= 4 && i <= 10;
      ctx.fillStyle = isStall ? PALETTE.stallWood : PALETTE.wall;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = isStall ? 'rgba(255,255,255,0.08)' : PALETTE.wallTop;
      ctx.fillRect(w.x, w.y, w.w, 4);
      if (isStall) {
        // Striped awning over the stall's front edge.
        for (let s = 0; s < w.w; s += 24) {
          ctx.fillStyle = (s / 24) % 2 === 0 ? PALETTE.stallAwning : PALETTE.stallAwningAlt;
          ctx.fillRect(w.x + s, w.y + w.h, Math.min(24, w.w - s), 12);
        }
        // Goods on the counter: little coloured dots.
        ctx.fillStyle = '#d9a441';
        ctx.fillRect(w.x + 14, w.y + w.h / 2 - 4, 10, 8);
        ctx.fillStyle = '#7fb069';
        ctx.fillRect(w.x + w.w - 26, w.y + w.h / 2 - 4, 10, 8);
      }
    }
    // Tarp tents: striped hide zones.
    for (const z of LEVEL.hideZones) {
      ctx.fillStyle = PALETTE.tarp;
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.fillStyle = PALETTE.tarpStripe;
      for (let s = -z.h; s < z.w; s += 28) {
        ctx.beginPath();
        ctx.moveTo(z.x + s, z.y);
        ctx.lineTo(z.x + s + 14, z.y);
        ctx.lineTo(z.x + s + 14 + z.h, z.y + z.h);
        ctx.lineTo(z.x + s + z.h, z.y + z.h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(z.x + 1, z.y + 1, z.w - 2, z.h - 2);
    }
    ctx.restore();
  }

  function drawCoinsAndGoal(state) {
    ctx.save();
    ctx.translate(scale.ox, scale.oy);
    ctx.scale(scale.x, scale.y);
    for (const coin of state.coins) {
      if (coin.taken) continue;
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8a6d1f';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#8a6d1f';
      ctx.font = 'bold 11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Rp', coin.x, coin.y + 0.5);
    }
    // The heirloom lantern in the shed.
    if (!state.lantern.taken) {
      const pulse = 0.7 + Math.sin(state.time * 3) * 0.3;
      const g = ctx.createRadialGradient(state.lantern.x, state.lantern.y, 2, state.lantern.x, state.lantern.y, 46);
      g.addColorStop(0, `rgba(255, 179, 71, ${0.55 * pulse})`);
      g.addColorStop(1, 'rgba(255, 179, 71, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(state.lantern.x - 46, state.lantern.y - 46, 92, 92);
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.arc(state.lantern.x, state.lantern.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a3b00';
      ctx.fillRect(state.lantern.x - 3, state.lantern.y - 15, 6, 4);
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('Lampion Pusaka', state.lantern.x - 30, state.lantern.y - 26);
    }
    // The exit gate.
    const e = LEVEL.exit;
    ctx.fillStyle = state.lanternTaken ? PALETTE.exit : PALETTE.exitLocked;
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(e.x + 8, e.y + 8, e.w - 16, e.h - 16);
    ctx.fillStyle = state.lanternTaken ? '#062b12' : '#dfe3ea';
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.lanternTaken ? 'KELUAR' : 'TERKUNCI', e.x + e.w / 2, e.y + e.h / 2);
    ctx.restore();
  }

  function drawGuard(guard, time) {
    const alerted = guard.state === 'chase';
    const suspicious = guard.state === 'investigate';
    ctx.save();
    ctx.translate(scale.ox, scale.oy);
    ctx.scale(scale.x, scale.y);
    // Flashlight cone, clipped by walls, brighter when the guard is alarmed.
    const poly = conePolygon(guard);
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
    const alpha = alerted ? 0.5 : suspicious ? 0.38 : 0.28;
    const g = ctx.createRadialGradient(guard.x, guard.y, 8, guard.x, guard.y, GUARD.sightRange);
    g.addColorStop(0, alerted ? 'rgba(255, 93, 93, ' + alpha + ')' : 'rgba(255, 233, 163, ' + alpha + ')');
    g.addColorStop(1, 'rgba(255, 233, 163, 0)');
    ctx.fillStyle = g;
    ctx.fill();
    // Body: navy uniform, cap, facing tick.
    ctx.fillStyle = PALETTE.guardUniform;
    ctx.beginPath();
    ctx.arc(guard.x, guard.y, GUARD.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.guard;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = PALETTE.guard;
    ctx.beginPath();
    ctx.arc(guard.x + Math.cos(guard.angle) * 7, guard.y + Math.sin(guard.angle) * 7, 5, 0, Math.PI * 2);
    ctx.fill();
    // "?" while investigating, "!" while chasing, with the meter above the head.
    ctx.font = 'bold 20px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    if (alerted) {
      ctx.fillStyle = PALETTE.danger;
      ctx.fillText('!', guard.x, guard.y - GUARD.radius - 4);
    } else if (suspicious || guard.detection > 0.05) {
      ctx.fillStyle = PALETTE.warn;
      ctx.fillText('?', guard.x, guard.y - GUARD.radius - 4);
    }
    if (guard.detection > 0.02) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(guard.x - 18, guard.y - GUARD.radius - 12, 36, 6);
      ctx.fillStyle = guard.detection > 0.66 ? PALETTE.danger : PALETTE.warn;
      ctx.fillRect(guard.x - 17, guard.y - GUARD.radius - 11, 34 * guard.detection, 4);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '11px ' + FONT;
    ctx.textBaseline = 'top';
    ctx.fillText(guard.name, guard.x, guard.y + GUARD.radius + 3);
    ctx.restore();
  }

  function drawPlayer(state) {
    const p = state.player;
    ctx.save();
    ctx.translate(scale.ox, scale.oy);
    ctx.scale(scale.x, scale.y);
    ctx.globalAlpha = p.hidden ? 0.45 : 1;
    // Sneaking crouches the figure; walking bobs it.
    const bob = p.moving && !p.sneaking ? Math.sin(p.stepPhase) * 1.5 : 0;
    const r = p.sneaking ? 10 : 13;
    ctx.fillStyle = p.sneaking ? PALETTE.playerSneak : PALETTE.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0b3d2c';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Cap + facing tick.
    ctx.fillStyle = '#0b3d2c';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 6, p.y + Math.sin(p.angle) * 6 + bob, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Thrown coins clinking on the floor.
    ctx.save();
    ctx.translate(scale.ox, scale.oy);
    ctx.scale(scale.x, scale.y);
    for (const t of state.thrown) {
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHud(state, screen) {
    const w = canvas.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Top bar.
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 0, w / dpr, 46);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 15px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const objective = state.lanternTaken
      ? 'Bawa lampion ke gerbang KELUAR!'
      : 'Ambil Lampion Pusaka di gudang kanan atas';
    ctx.fillText(objective, 14, 24);
    ctx.textAlign = 'right';
    ctx.font = '14px ' + FONT;
    const minutes = Math.floor(state.time / 60);
    const seconds = Math.floor(state.time % 60);
    ctx.fillText(
      `Koin ${state.coinsTaken}/3   Lempar ${state.coinsLeft}   Nyawa ${'●'.repeat(state.lives)}${'○'.repeat(Math.max(0, 3 - state.lives))}   ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}   Skor ${state.score}`,
      w / dpr - 14,
      24,
    );
    // Alarm bar, top centre: fills while any guard is spotting the player.
    const barW = 260;
    const barX = (w / dpr - barW) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(barX, 54, barW, 12);
    ctx.fillStyle = state.alarm > 0.66 ? PALETTE.danger : state.alarm > 0.25 ? PALETTE.warn : '#3a4358';
    ctx.fillRect(barX + 1, 55, (barW - 2) * state.alarm, 10);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(state.alert === 'alerted' ? 'TERLIHAT!' : state.alert === 'suspicious' ? 'DICURIGAI' : 'TERSEMBUNYI', barX + barW / 2, 73);
    if (state.alert === 'alerted') {
      ctx.fillStyle = `rgba(255, 93, 93, ${0.12 + Math.sin(state.time * 8) * 0.06})`;
      ctx.fillRect(0, 0, w / dpr, 46);
    }
    ctx.restore();
  }

  function drawOverlay(title, lines, accent) {
    const w = canvas.width;
    const h = canvas.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(6, 8, 18, 0.72)';
    ctx.fillRect(0, 0, w / dpr, h / dpr);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent || PALETTE.text;
    ctx.font = 'bold 52px ' + FONT;
    ctx.fillText(title, (w / dpr) / 2, (h / dpr) / 2 - 60);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '17px ' + FONT;
    lines.forEach((line, i) => {
      ctx.fillText(line, (w / dpr) / 2, (h / dpr) / 2 - 8 + i * 26);
    });
    ctx.restore();
  }

  function draw(state, screen, best, caughtFlash) {
    resize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PALETTE.night;
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    drawFloor(state.time);
    drawWallsAndStalls();
    drawCoinsAndGoal(state);
    for (const guard of state.guards) drawGuard(guard, state.time);
    drawPlayer(state);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state, screen);

    if (screen === SCREEN_TITLE) {
      drawOverlay('BAYANG PASAR MALAM', [
        'Pasar sudah tutup. Satpam berpatroli dengan senter.',
        'Ambil Lampion Pusaka di gudang, lalu lolos lewat gerbang KELUAR — tanpa ketahuan.',
        '',
        'WASD / Panah — bergerak      Shift — menyelinap (pelan, sulit terlihat)',
        'Klik mouse — lempar koin untuk mengalihkan satpam      P — jeda',
        'Bersembunyi di bawah tenda: satpam tidak bisa melihatmu.',
        '',
        'Tekan Spasi atau klik untuk mulai',
        best > 0 ? `Skor terbaik: ${best}` : '',
      ]);
    } else if (screen === SCREEN_PAUSED) {
      drawOverlay('JEDA', ['Tekan P atau Spasi untuk lanjut.', '']);
    } else if (screen === SCREEN_OVER) {
      drawOverlay('KETAHUAN!', [
        'Satpam menangkapmu di pasar malam.',
        `Skor ${state.score} — Koin ${state.coinsTaken}/3`,
        '',
        'Tekan Spasi untuk mencoba lagi',
      ], PALETTE.danger);
    } else if (screen === SCREEN_WIN) {
      drawOverlay('LOLOS!', [
        'Lampion Pusaka berhasil dibawa pulang. Pasar malam kembali sunyi.',
        `Skor ${state.score} — Waktu ${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')} — Koin ${state.coinsTaken}/3 — Nyawa ${state.lives}`,
        best > 0 ? `Skor terbaik: ${best}` : '',
        '',
        'Tekan Spasi untuk main lagi',
      ], PALETTE.exit);
    }
    if (caughtFlash > 0) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = `rgba(255, 60, 60, ${Math.min(0.35, caughtFlash * 0.3)})`;
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      ctx.fillStyle = PALETTE.danger;
      ctx.font = 'bold 34px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('KETAHUAN!', canvas.width / dpr / 2, 130);
      ctx.restore();
    }
  }

  return { draw, resize };
}
