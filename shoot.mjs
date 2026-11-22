// Screenshot + playtest driver for Bayang Pasar Malam (not part of the game).
// Starts serve.ts, opens the game in headless Chrome for Testing, takes the
// shots from shots.json, then plays the game for real through the page: starts
// from the title, walks, sneaks, throws a coin, pauses. It fails loudly on any
// page error, any request outside localhost, or any screenshot over the gate's
// 256 KiB cap. Chrome's temp profile lives under .shot-tools/tmp, never /tmp.
//
//   node shoot.mjs            (takes the 4 shots + runs the playtest)
//   node shoot.mjs --shots-only
import { createRequire } from 'node:module';
const require = createRequire('/home/hatch/workspace/.shot-tools/package.json');
const { chromium } = require('playwright-core');
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const ROOT = '/home/hatch/workspace/makefun/stealth-game';
const CHROME = '/home/hatch/workspace/.shot-tools/chromium/chrome-linux64/chrome';
const PORT = 8902;
const SHOTS_ONLY = process.argv.includes('--shots-only');
process.env.TMPDIR = '/home/hatch/workspace/.shot-tools/tmp';
mkdirSync(process.env.TMPDIR, { recursive: true });

const shots = JSON.parse(readFileSync(`${ROOT}/shots.json`, 'utf8'));

function imageSize(path) {
  const b = readFileSync(path);
  if (b[0] === 0x89 && b[1] === 0x50) {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; // PNG IHDR
  }
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    const len = b.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return { w: 0, h: 0 };
}
function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let serverOut = '';
server.stdout.on('data', (d) => { serverOut += d; });
server.stderr.on('data', (d) => { serverOut += d; });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('server did not start: ' + serverOut)), 10000);
  const check = () => {
    if (serverOut.includes(`http://localhost:${PORT}`)) { clearTimeout(timer); resolve(); }
    else setTimeout(check, 100);
  };
  check();
});

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const requests = [];
const errors = [];
page.on('request', (r) => requests.push(r.url()));
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures += 1;
}

try {
  // --- the four staged screenshots ---------------------------------------
  for (const shot of shots) {
    const url = `http://localhost:${PORT}/${shot.query}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 10000 });
    await page.waitForTimeout(300);
    const path = `${ROOT}/screenshots/${shot.name}`;
    await page.screenshot({ path, type: 'jpeg', quality: 82 });
    const size = statSync(path).size;
    const dim = imageSize(path);
    check(`shot ${shot.name} renders`, dim.w === 1280 && dim.h === 720, `${dim.w}x${dim.h}`);
    check(`shot ${shot.name} <= 256 KiB`, size <= 262144, `${(size / 1024).toFixed(1)} KiB`);
  }
  // Determinism: the play shot twice must be the same pixels.
  const playPath = `${ROOT}/screenshots/2-play.jpg`;
  const first = sha(playPath);
  await page.goto(`http://localhost:${PORT}/?shot=play&seed=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  const repeatPath = '/home/hatch/workspace/.shot-tools/tmp/2-play-repeat.jpg';
  await page.screenshot({ path: repeatPath, type: 'jpeg', quality: 82 });
  check('play shot is deterministic', sha(repeatPath) === first);

  if (!SHOTS_ONLY) {
    // --- the real playtest ------------------------------------------------
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    check('title screen shows', await page.evaluate(() => window.__game.screen) === 'title');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__game.screen === 'play', null, { timeout: 5000 });
    check('game starts on Space', await page.evaluate(() => window.__game.screen) === 'play');

    const start = await page.evaluate(() => ({ x: window.__game.state.player.x, y: window.__game.state.player.y }));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(900);
    await page.keyboard.up('KeyW');
    const moved = await page.evaluate(() => ({ x: window.__game.state.player.x, y: window.__game.state.player.y }));
    check('WASD moves the player up', moved.y < start.y - 50, `y ${start.y.toFixed(0)} -> ${moved.y.toFixed(0)}`);

    // Sneak: Shift halves the speed.
    const s0 = await page.evaluate(() => ({ x: window.__game.state.player.x, y: window.__game.state.player.y }));
    await page.keyboard.down('Shift');
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(900);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('Shift');
    const s1 = await page.evaluate(() => ({ x: window.__game.state.player.x, y: window.__game.state.player.y }));
    const sneakDist = s1.x - s0.x;
    check('sneak moves slower than a walk', sneakDist > 20 && sneakDist < 110, `sneak dx=${sneakDist.toFixed(0)}`);

    // A mouse click throws a coin.
    const coinsBefore = await page.evaluate(() => window.__game.state.coinsLeft);
    await page.mouse.click(700, 400);
    await page.waitForTimeout(300);
    const coinsAfter = await page.evaluate(() => window.__game.state.coinsLeft);
    check('click throws a coin', coinsAfter === coinsBefore - 1, `${coinsBefore} -> ${coinsAfter}`);

    // Pause freezes the clock.
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(300);
    check('P pauses', await page.evaluate(() => window.__game.screen) === 'paused');
    const t1 = await page.evaluate(() => window.__game.state.time);
    await page.waitForTimeout(700);
    const t2 = await page.evaluate(() => window.__game.state.time);
    check('pause freezes the clock', Math.abs(t1 - t2) < 0.05, `${t1.toFixed(2)} vs ${t2.toFixed(2)}`);
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => window.__game.screen === 'play', null, { timeout: 5000 });
    check('P resumes', await page.evaluate(() => window.__game.screen) === 'play');

    // A guard is visible and patrolling.
    const guard = await page.evaluate(() => {
      const g = window.__game.state.guards[0];
      return { x: g.x, y: g.y, state: g.state };
    });
    await page.waitForTimeout(1200);
    const guard2 = await page.evaluate(() => {
      const g = window.__game.state.guards[0];
      return { x: g.x, y: g.y, state: g.state };
    });
    check('a guard patrols (moves)', Math.hypot(guard2.x - guard.x, guard2.y - guard.y) > 20, `(${guard.x.toFixed(0)},${guard.y.toFixed(0)}) -> (${guard2.x.toFixed(0)},${guard2.y.toFixed(0)})`);

    // Best score persists in localStorage after a win is impossible here; check
    // the key namespace at least does not throw.
    check('no page errors during play', errors.length === 0, errors.join(' | '));
  }
} finally {
  await browser.close();
  server.kill();
}

const external = requests.filter((u) => !u.startsWith(`http://localhost:${PORT}`) && !u.startsWith('data:'));
check('no network requests outside localhost', external.length === 0, external.join(', ') || `${requests.length} requests, all local`);
check('no page errors', errors.length === 0, errors.join(' | '));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
