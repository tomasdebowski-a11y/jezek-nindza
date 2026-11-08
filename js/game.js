import { TAU, clamp, lerp, easeOut, easeInOut, ellipse } from './util.js';
import { Sound, Music } from './audio.js';
import { load, save } from './storage.js';
import { WORLDS, itemPos, ITEM_R, ITEM_COLORS, GROUND, drawItem, drawScenery, drawRampFx, drawFog, sparkle } from './worlds.js';
import { HERO, drawHero, drawAura, drawSpot, drawBoss } from './hero.js';

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);

const data = load();
const sound = new Sound();
sound.musicOn = data.music;
sound.sfxOn = data.sound;
const music = new Music(sound);

const POWER_AT = 15;      // combo needed for "Síla bodlin"
const POWER_TIME = 10;    // seconds
const MISS_PAUSE = 1.5;
const ENDLESS_CYCLE = 40;
const BOSS_HP = 60;

const G = {
  state: 'title',        // title | select | intro | play | miss | paused | clear | over | win
  world: 1, endless: false, theme: WORLDS[0],
  mode: data.mode,
  score: 0, lives: 3, caught: 0, combo: 0, bestCombo: 0, powerUntil: 0,
  items: [], falling: [], pairQueue: null,
  pos: 0, prevPos: 0, moveAt: -9,
  catchAt: -9, catchKind: null,
  missAt: -9, miss: null,
  boss: null,
  fx: [], texts: [], ripples: [], shake: 0, flash: 0,
  introBeats: 0, introAt: 0, beatAt: 0, beatIndex: 0,
  clock: false, nextBeat: 0, pending: [], audioNext: null,
  blinkAt: 2, pausedFrom: null, newBest: false,
};
let uid = 0;

// ---------------- layout ----------------
let L = { s: 1, ox: 0, oy: 0, vw: 1, vh: 1, dpr: 1, vb: { x0: 0, y0: 0, x1: 960, y1: 440 }, sb: { x0: 0, y0: 0, x1: 960, y1: 440 } };
let bg = null;

function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = Math.round(vw * dpr);
  cv.height = Math.round(vh * dpr);
  cv.style.width = vw + 'px';
  cv.style.height = vh + 'px';
  const cs = getComputedStyle($('safe'));
  const st = parseFloat(cs.paddingTop) || 0, sr = parseFloat(cs.paddingRight) || 0;
  const sbm = parseFloat(cs.paddingBottom) || 0, sl = parseFloat(cs.paddingLeft) || 0;
  const aw = Math.max(100, vw - sl - sr), ah = Math.max(100, vh - st - sbm);
  const s = Math.min(aw / 960, ah / 440);
  const ox = sl + (aw - 960 * s) / 2, oy = st + (ah - 440 * s) / 2;
  L = {
    s, ox, oy, vw, vh, dpr,
    vb: { x0: -ox / s, y0: -oy / s, x1: (vw - ox) / s, y1: (vh - oy) / s },
    sb: { x0: (sl - ox) / s, y0: (st - oy) / s, x1: (vw - sr - ox) / s, y1: (vh - sbm - oy) / s },
  };
  bg = null;
  const portrait = vh > vw && vw < 900;
  $('rotate').hidden = !portrait;
  if (portrait && (G.state === 'play' || G.state === 'intro' || G.state === 'miss')) pauseGame();
}

function buildBg(theme) {
  const c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  const x = c.getContext('2d');
  x.setTransform(L.dpr * L.s, 0, 0, L.dpr * L.s, L.dpr * L.ox, L.dpr * L.oy);
  drawScenery(x, theme, L.vb);
  bg = { canvas: c, theme };
}

// ---------------- difficulty ----------------
function progress() {
  if (G.boss) return 1 - G.boss.hp / G.boss.max;
  if (G.endless) return Math.min(1, G.caught / 300);
  return Math.min(1, G.caught / G.theme.target);
}
function tickMs() {
  const w = G.theme;
  let base = w.base, min = w.min;
  if (G.endless) { base = 520; min = 230; }
  let t = base - (base - min) * easeInOut(progress());
  if (G.mode === 'B') t *= 0.86;
  return t;
}
function beatDur() {
  if (G.state === 'play' || G.state === 'intro') return tickMs() / 1000;
  return 0.5;
}
const powered = now => now < G.powerUntil;

// ---------------- beat clock (audio-synchronised) ----------------
function startClock(now, delay = 0.05) {
  G.clock = true;
  G.nextBeat = now + delay;
  G.pending = [];
  G.audioNext = null;
}
function stopClock() { G.clock = false; G.pending = []; }

function audioTimeFor(t, now, dur) {
  const ac = sound.ctx;
  const at = ac.currentTime + (t - now);
  let r = G.audioNext != null && Math.abs(G.audioNext - at) < 0.03 ? G.audioNext : at;
  r = Math.max(r, ac.currentTime + 0.005);
  G.audioNext = r + dur;
  return r;
}

function runClock(now) {
  if (!G.clock) return;
  if (G.nextBeat < now - 0.5) { G.nextBeat = now + 0.02; G.pending = []; G.audioNext = null; }
  while (G.nextBeat < now + 0.12) {
    const dur = beatDur();
    if (sound.ok && sound.musicOn) music.scheduleBeat(G.beatIndex, audioTimeFor(G.nextBeat, now, dur), dur);
    G.pending.push({ t: G.nextBeat, i: G.beatIndex });
    G.beatIndex++;
    G.nextBeat += dur;
  }
  while (G.pending.length && G.pending[0].t <= now) {
    G.pending.shift();
    onBeat(now);
    if (!G.clock) break;
  }
}

function onBeat(now) {
  G.beatAt = now;
  if (G.state === 'intro') {
    G.introBeats++;
    if (G.introBeats >= 4) { G.state = 'play'; step(now); }
  } else if (G.state === 'play') {
    step(now);
  }
}

function updateMusicLayers(now) {
  if (G.state === 'title' || G.state === 'select') { music.layers = 2; music.danger = false; return; }
  music.layers = powered(now) ? 3 : G.combo >= 6 ? 2 : 1;
  music.danger = G.lives === 1;
}

// ---------------- gameplay ----------------
function step(now) {
  for (const it of G.items) { it.prev = it.step; it.step++; it.moveAt = now; }
  const landed = G.items.filter(it => it.step >= 5);
  G.items = G.items.filter(it => it.step < 5);
  for (const it of landed) {
    resolve(it, now);
    if (G.state !== 'play') return;
  }
  if (G.boss) bossSpawn(now); else spawn(now);
}

function canArrive(arrive, ramp) {
  return G.items.every(it => it.ramp === ramp || Math.abs((5 - it.step) - arrive) > 1);
}
function pickKind(allowBomb) {
  const w = G.theme;
  const r = Math.random();
  const bombs = G.endless ? 0.13 : w.bombs;
  const gold = G.endless ? 0.07 : w.gold;
  if (allowBomb && G.items.length && r < bombs) return 'bomb';
  if (r > 1 - gold) return 'gold';
  return w.items[Math.floor(Math.random() * w.items.length)];
}
function addItem(ramp, kind, now) {
  G.items.push({ id: ++uid, ramp, kind, step: 0, prev: -1, moveAt: now, spin: Math.random() * TAU });
}

function spawn(now) {
  const w = G.theme;
  const p = progress();
  if (G.pairQueue != null) {
    const r = G.pairQueue;
    G.pairQueue = null;
    if (canArrive(5, r)) addItem(r, pickKind(false), now);
  }
  const count = G.endless ? [2, 5] : w.count;
  const max = Math.round(lerp(count[0], count[1], p)) + (G.mode === 'B' ? 1 : 0);
  if (G.items.length >= max) return;
  const chance = G.items.length === 0 ? 1 : 0.5 + 0.25 * p;
  if (Math.random() > chance) return;
  const free = [0, 1, 2, 3].filter(r => !G.items.some(it => it.ramp === r && it.step <= 1));
  free.sort(() => Math.random() - 0.5);
  for (const r of free) {
    if (!canArrive(5, r)) continue;
    const kind = pickKind(true);
    addItem(r, kind, now);
    const pairs = G.endless ? 0.15 : w.pairs;
    if (pairs && kind !== 'bomb' && Math.random() < pairs) G.pairQueue = r;
    break;
  }
}

const BOSS_PATTERNS = [[0, 2, 1, 3], [0, 1, 0, 1], [2, 3, 2, 3], [0, 3, 1, 2], [1, 1, 2, 2], [3, 1, 2, 0], [0, 2, 0, 2], [3, 3, 0, 0]];
function bossSpawn(now) {
  const b = G.boss;
  b.cd--;
  if (b.cd > 0) return;
  if (!b.queue.length) {
    const pat = BOSS_PATTERNS[Math.floor(Math.random() * BOSS_PATTERNS.length)];
    const hard = b.hp < b.max / 2;
    b.queue = pat.map(r => ({ ramp: r, kind: Math.random() < (hard ? 0.2 : 0.12) ? 'bomb' : pickKind(false) }));
  }
  const e = b.queue[0];
  if (!canArrive(5, e.ramp) || G.items.some(it => it.ramp === e.ramp && it.step === 0)) { b.cd = 1; return; }
  b.queue.shift();
  addItem(e.ramp, e.kind, now);
  b.throwAt = now;
  b.cd = b.queue.length && b.queue[0].ramp === e.ramp && e.kind !== 'bomb' ? 1 : 2;
}

// logical position of an item at a given step on its ramp (mirrored for right side)
function worldPos(ramp, step) {
  const [x, y] = itemPos(step, ramp % 2 === 1);
  return [ramp >= 2 ? 960 - x : x, y];
}
function basketPos(ramp) {
  const x = HERO.basketX, y = HERO.basketY[ramp % 2];
  return [ramp >= 2 ? 960 - x : x, y];
}

function resolve(it, now) {
  if (it.kind === 'bomb') {
    if (G.pos === it.ramp) {
      const [x, y] = basketPos(it.ramp);
      burst(x, y - 10, ['#ffb347', '#ff6a1a', '#ffe066', '#444'], 34, 260);
      text(x, y - 40, 'BUM!', '#ff6a1a', 30);
      sound.bomb();
      G.flash = 0.5;
      loseLife(now, it.ramp, true);
    } else {
      G.falling.push({ kind: 'bomb', ramp: it.ramp, t0: now, done: false });
    }
    return;
  }
  if (G.pos === it.ramp) catchItem(it, now);
  else {
    G.falling.push({ kind: it.kind, ramp: it.ramp, t0: now, done: false });
    loseLife(now, it.ramp, false);
  }
}

function catchItem(it, now) {
  G.combo++;
  G.bestCombo = Math.max(G.bestCombo, G.combo);
  const gold = it.kind === 'gold';
  const pts = (gold ? 5 : 1) * (powered(now) ? 2 : 1);
  G.score += pts;
  G.caught++;
  G.catchAt = now;
  G.catchKind = it.kind;
  const [x, y] = basketPos(it.ramp);
  const col = ITEM_COLORS[it.kind] || ['#fff'];
  burst(x, y - 8, col, gold ? 22 : 12, gold ? 220 : 150);
  text(x, y - 34, '+' + pts, gold ? '#ffd34d' : '#ffffff', gold ? 30 : 24);
  if (gold) sound.gold(); else sound.catch(G.combo);

  if (G.combo % POWER_AT === 0) {
    G.powerUntil = now + POWER_TIME;
    sound.power();
    text(480, 180, 'SÍLA BODLIN!', '#8fe3ff', 34, 1.4);
  }
  if (G.boss) {
    G.boss.hp = Math.max(0, G.boss.hp - (gold ? 3 : 1));
    G.boss.hitAt = now;
    sound.bossHit();
    if (G.boss.hp <= 0) { bossDefeated(now); return; }
  }
  if (G.endless) {
    const idx = Math.floor(G.caught / ENDLESS_CYCLE) % WORLDS.length;
    if (WORLDS[idx] !== G.theme) {
      G.theme = WORLDS[idx];
      music.setWorld(G.theme.music);
      bg = null;
      text(480, 160, G.theme.name.toUpperCase(), '#ffffff', 30, 1.6);
    }
  } else if (!G.boss && G.caught >= G.theme.target) {
    worldClear(now);
  }
}

function loseLife(now, ramp, bomb) {
  G.lives--;
  G.combo = 0;
  G.powerUntil = 0;
  G.shake = 0.45;
  for (const it of G.items) {
    const [x, y] = worldPos(it.ramp, it.step);
    burst(x, y, ['rgba(255,255,255,.9)'], 6, 80);
  }
  G.items = [];
  G.pairQueue = null;
  if (!bomb) sound.miss();
  G.state = 'miss';
  G.missAt = now;
  G.miss = { ramp, bomb };
  stopClock();
  updateHud();
}

function worldClear(now) {
  G.state = 'clear';
  stopClock();
  sound.fanfare();
  for (const it of G.items) { const [x, y] = worldPos(it.ramp, it.step); burst(x, y, ['#ffffff', '#ffd34d'], 8, 120); }
  G.items = [];
  G.pairQueue = null;
  const bonusLife = G.lives < 3;
  G.lives = Math.min(3, G.lives + 1);
  $('clearNote').textContent = bonusLife ? 'Bonus: +1 život' : 'Všechny životy máš plné!';
  data.cleared[G.world] = true;
  data.unlocked = Math.max(data.unlocked, G.world + 1);
  saveBest();
  burst(480, 200, ['#ffd34d', '#ffffff', '#8fe3ff', '#ff7a7a'], 50, 320);
  setTimeout(() => {
    if (G.state !== 'clear') return;
    $('clearTitle').textContent = `Svět ${G.world} dokončen!`;
    $('clearStats').textContent = `Skóre ${G.score} · nejdelší kombo ${G.bestCombo}`;
    $('btnNext').textContent = G.world === 5 ? 'Souboj s Havranem' : 'Další svět';
    show('clear');
  }, 900);
}

function bossDefeated(now) {
  G.state = 'win';
  stopClock();
  G.items = [];
  data.bossBeaten = true;
  data.cleared[6] = true;
  saveBest();
  sound.fanfare();
  burst(480, 110, ['#ffd34d', '#ffffff', '#8fe3ff', '#2a2445'], 70, 360);
  setTimeout(() => {
    $('winStats').textContent = `Konečné skóre ${G.score}${G.newBest ? ' – nový rekord!' : ''}`;
    show('win');
  }, 1200);
}

function gameOver() {
  G.state = 'over';
  sound.gameOver();
  saveBest();
  $('overStats').textContent = `Skóre ${G.score} · rekord ${G.endless ? data.endlessBest[G.mode] : data.best[G.mode]}`;
  $('overTitle').textContent = G.newBest ? 'Nový rekord!' : 'Konec hry';
  show('over');
}

function saveBest() {
  G.newBest = false;
  if (G.endless) {
    if (G.score > data.endlessBest[G.mode]) { data.endlessBest[G.mode] = G.score; G.newBest = true; }
  } else if (G.score > data.best[G.mode]) { data.best[G.mode] = G.score; G.newBest = true; }
  save(data);
}

// ---------------- effects ----------------
function burst(x, y, colors, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7);
    G.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, life: 0, max: 0.5 + Math.random() * 0.5,
      col: colors[i % colors.length], r: 2 + Math.random() * 4 });
  }
}
function text(x, y, s, col, size, max = 0.9) { G.texts.push({ x, y, s, col, size, life: 0, max }); }

// ---------------- flow ----------------
function startWorld(n, keepRun, now = performance.now() / 1000) {
  G.endless = n === 'E';
  G.world = G.endless ? 0 : n;
  G.theme = G.endless ? WORLDS[0] : WORLDS[n - 1];
  G.items = []; G.falling = []; G.fx = []; G.texts = [];
  G.caught = 0; G.combo = 0; G.powerUntil = 0; G.pairQueue = null;
  G.boss = G.theme.boss && !G.endless ? { hp: BOSS_HP, max: BOSS_HP, cd: 2, queue: [], throwAt: -9, hitAt: -9 } : null;
  if (!keepRun) { G.score = 0; G.lives = 3; G.bestCombo = 0; }
  G.pos = 0; G.prevPos = 0;
  music.setWorld(G.theme.music);
  bg = null;
  G.state = 'intro';
  G.introBeats = 0;
  G.introAt = now;
  G.beatIndex = 0;
  sound.muffle(false);
  startClock(now, 0.5);
  show(null);
  keepAwake();
}

function pauseGame() {
  if (!['play', 'intro', 'miss'].includes(G.state)) return;
  G.pausedFrom = G.state;
  G.pauseNow = performance.now() / 1000;
  G.state = 'paused';
  stopClock();
  sound.muffle(true);
  show('pause');
}
function resumeGame() {
  const now = performance.now() / 1000;
  const away = now - (G.pauseNow || now);
  G.missAt += away;
  G.powerUntil += away;
  G.state = G.pausedFrom === 'miss' ? 'miss' : G.pausedFrom || 'play';
  sound.muffle(false);
  show(null);
  if (G.state !== 'miss') startClock(now, 0.35);
}
function toMenu() {
  stopClock();
  G.state = 'title';
  G.theme = WORLDS[0];
  G.items = []; G.falling = []; G.boss = null; G.powerUntil = 0;
  bg = null;
  music.setWorld(WORLDS[0].music);
  sound.muffle(false);
  startClock(performance.now() / 1000, 0.2);
  refreshTitle();
  show('title');
}

// ---------------- input ----------------
function moveTo(p, now) {
  if (p === G.pos) return;
  G.prevPos = G.pos;
  G.pos = p;
  G.moveAt = now;
  sound.dash();
}
const playable = () => G.state === 'play' || G.state === 'intro' || G.state === 'miss';

cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  sound.init();
  if (!playable()) return;
  const r = cv.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const right = x > r.width / 2, low = y > r.height / 2;
  const now = performance.now() / 1000;
  moveTo((right ? 2 : 0) + (low ? 1 : 0), now);
  G.ripples.push({ x: (x - L.ox) / L.s, y: (y - L.oy) / L.s, t: now });
});

document.addEventListener('keydown', e => {
  const now = performance.now() / 1000;
  if (e.key === 'Escape' || e.key === ' ') {
    if (G.state === 'paused') resumeGame(); else pauseGame();
    e.preventDefault();
    return;
  }
  if (!playable()) return;
  const k = e.key.toLowerCase();
  const map = { q: 0, a: 1, p: 2, l: 3 };
  const right = G.pos >= 2, low = G.pos % 2 === 1;
  let p = null;
  if (k in map) p = map[k];
  else if (e.key === 'ArrowLeft') p = low ? 1 : 0;
  else if (e.key === 'ArrowRight') p = low ? 3 : 2;
  else if (e.key === 'ArrowUp') p = right ? 2 : 0;
  else if (e.key === 'ArrowDown') p = right ? 3 : 1;
  if (p != null) { moveTo(p, now); e.preventDefault(); }
});

['touchstart', 'touchend', 'click', 'pointerdown'].forEach(ev => document.addEventListener(ev, () => sound.init(), { capture: true, passive: true }));
document.addEventListener('touchmove', e => {
  if (e.target.closest && e.target.closest('.world-list')) return; // let the world list scroll
  e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pauseGame();
  else if (sound.ctx && sound.ctx.state !== 'running') sound.ctx.resume().catch(() => {});
});
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 250));

let wakeLock = null;
async function keepAwake() {
  try {
    if (navigator.wakeLock && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { /* not allowed */ }
}

// ---------------- UI (HTML overlays) ----------------
const PANELS = ['title', 'select', 'pause', 'clear', 'over', 'win'];
function show(id) {
  for (const p of PANELS) $(p).hidden = p !== id;
  $('btnPause').hidden = !(id === null && G.state !== 'title');
}

function refreshTitle() {
  $('btnMode').textContent = G.mode === 'A' ? 'Obtížnost: lehká' : 'Obtížnost: těžká';
  $('btnMusic').textContent = sound.musicOn ? 'Hudba: zap' : 'Hudba: vyp';
  $('btnSound').textContent = sound.sfxOn ? 'Zvuky: zap' : 'Zvuky: vyp';
  $('bestLine').textContent = `Rekord: ${data.best[G.mode]}`;
}

function buildSelect() {
  const list = $('worldList');
  list.innerHTML = '';
  const entries = WORLDS.map((w, i) => ({ n: i + 1, w }));
  if (data.bossBeaten) entries.push({ n: 'E', w: null });
  for (const { n, w } of entries) {
    const locked = n !== 'E' && n > data.unlocked;
    const b = document.createElement('button');
    b.className = 'card' + (locked ? ' locked' : '');
    b.disabled = locked;
    const thumb = document.createElement('canvas');
    thumb.width = 240; thumb.height = 120;
    const tc = thumb.getContext('2d');
    const tw = w || WORLDS[5];
    const s = 240 / 960;
    tc.setTransform(s, 0, 0, s, 0, (120 - 440 * s) / 2);
    drawScenery(tc, tw, { x0: 0, y0: -60, x1: 960, y1: 500 });
    b.appendChild(thumb);
    const lab = document.createElement('span');
    lab.className = 'card-label';
    lab.innerHTML = n === 'E'
      ? '<b>∞</b><span>Nekonečný režim</span>'
      : `<b>${n}</b><span>${w.name}</span>`;
    b.appendChild(lab);
    if (n !== 'E' && data.cleared[n]) {
      const ok = document.createElement('span'); ok.className = 'badge'; ok.textContent = 'Hotovo'; b.appendChild(ok);
    }
    if (locked) {
      const lk = document.createElement('span'); lk.className = 'badge lock'; lk.textContent = 'Zamčeno'; b.appendChild(lk);
    }
    if (n === 6) {
      const bs = document.createElement('span'); bs.className = 'tag'; bs.textContent = 'Šéf'; b.appendChild(bs);
    }
    b.addEventListener('click', () => { sound.click(); startWorld(n, false); });
    list.appendChild(b);
  }
}

$('btnPlay').addEventListener('click', () => { sound.click(); buildSelect(); G.state = 'select'; show('select'); requestAnimationFrame(updateArrows); });
function scrollWorlds(dir) {
  const list = $('worldList');
  const card = list.querySelector('.card');
  const step = card ? card.offsetWidth + 12 : 200;
  list.scrollBy({ left: dir * step, behavior: 'smooth' });
}
function updateArrows() {
  const list = $('worldList');
  $('btnPrev').disabled = list.scrollLeft <= 2;
  $('btnNextW').disabled = list.scrollLeft + list.clientWidth >= list.scrollWidth - 2;
}
$('btnPrev').addEventListener('click', () => { sound.click(); scrollWorlds(-1); });
$('btnNextW').addEventListener('click', () => { sound.click(); scrollWorlds(1); });
$('worldList').addEventListener('scroll', updateArrows, { passive: true });
window.addEventListener('resize', () => { if (G.state === 'select') updateArrows(); });

$('btnBack').addEventListener('click', () => { sound.click(); G.state = 'title'; show('title'); });
$('btnMode').addEventListener('click', () => { G.mode = G.mode === 'A' ? 'B' : 'A'; data.mode = G.mode; save(data); sound.click(); refreshTitle(); });
$('btnMusic').addEventListener('click', () => { sound.setMusic(!sound.musicOn); data.music = sound.musicOn; save(data); sound.click(); refreshTitle(); });
$('btnSound').addEventListener('click', () => { sound.setSfx(!sound.sfxOn); data.sound = sound.sfxOn; save(data); sound.click(); refreshTitle(); });
$('btnPause').addEventListener('click', () => { sound.click(); pauseGame(); });
$('btnResume').addEventListener('click', () => { sound.click(); resumeGame(); });
$('btnRestart').addEventListener('click', () => { sound.click(); startWorld(G.endless ? 'E' : G.world, false); });
$('btnQuit').addEventListener('click', () => { sound.click(); toMenu(); });
$('btnNext').addEventListener('click', () => { sound.click(); startWorld(G.world + 1, true); });
$('btnClearMenu').addEventListener('click', () => { sound.click(); toMenu(); });
$('btnRetry').addEventListener('click', () => { sound.click(); startWorld(G.endless ? 'E' : G.world, false); });
$('btnOverMenu').addEventListener('click', () => { sound.click(); toMenu(); });
$('btnEndless').addEventListener('click', () => { sound.click(); startWorld('E', false); });
$('btnWinMenu').addEventListener('click', () => { sound.click(); toMenu(); });

function updateHud() { /* HUD is drawn on canvas; hook kept for future DOM HUD */ }

// ---------------- update ----------------
function update(now, dt) {
  runClock(now);
  updateMusicLayers(now);

  if (G.state === 'miss' && now - G.missAt > MISS_PAUSE) {
    G.falling = [];
    if (G.lives <= 0) gameOver();
    else { G.state = 'play'; startClock(now, 0.3); }
  }

  for (const p of G.fx) { p.life += dt; p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  G.fx = G.fx.filter(p => p.life < p.max);
  for (const t of G.texts) t.life += dt;
  G.texts = G.texts.filter(t => t.life < t.max);
  G.ripples = G.ripples.filter(r => now - r.t < 0.4);
  G.shake = Math.max(0, G.shake - dt);
  G.flash = Math.max(0, G.flash - dt * 1.5);

  for (const f of G.falling) {
    if (!f.done && now - f.t0 > 0.42) {
      f.done = true;
      const [x] = worldPos(f.ramp, 4);
      const gx = f.ramp >= 2 ? x - 60 : x + 60;
      if (f.kind === 'bomb') { burst(gx, GROUND - 6, ['#9aa0b5', '#ffe066'], 10, 90); sound.fizzle(); }
      else burst(gx, GROUND - 6, ITEM_COLORS[f.kind] || ['#fff'], 16, 160);
    }
  }
  if (G.state !== 'miss') G.falling = G.falling.filter(f => now - f.t0 < 0.9);

  if (now > G.blinkAt + 0.14) G.blinkAt = now + 2 + Math.random() * 3;
}

// ---------------- render ----------------
function render(now) {
  if (!bg || bg.theme !== G.theme || bg.canvas.width !== cv.width) buildBg(G.theme);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bg.canvas, 0, 0);

  const sh = G.shake > 0 ? G.shake * 18 : 0;
  const sx = sh ? (Math.random() - 0.5) * sh : 0, sy = sh ? (Math.random() - 0.5) * sh : 0;
  ctx.setTransform(L.dpr * L.s, 0, 0, L.dpr * L.s, L.dpr * (L.ox + sx * L.s), L.dpr * (L.oy + sy * L.s));

  const w = G.theme;
  w.drawDynamic(ctx, L.vb, now);
  drawRampFx(ctx, w, now);

  const inGame = !['title', 'select'].includes(G.state);
  const heroX = inGame ? HERO.x : 700;

  if (w.spot) drawSpot(ctx, heroX, HERO.y, w.spot);

  // boss
  if (G.boss && inGame) {
    const tp = clamp(1 - (now - G.boss.throwAt) / 0.35, 0, 1);
    const hp = clamp(1 - (now - G.boss.hitAt) / 0.2, 0, 1);
    drawBoss(ctx, 480, 124, now, tp, hp, G.boss.hp / G.boss.max);
    if (tp > 0.3 && G.items.length) {
      const last = G.items[G.items.length - 1];
      const [tx, ty] = worldPos(last.ramp, 0);
      ctx.strokeStyle = `rgba(255,255,255,${tp * 0.5})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 10]);
      ctx.beginPath(); ctx.moveTo(480, 122); ctx.quadraticCurveTo((480 + tx) / 2, 40, tx, ty); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // items on ramps
  if (inGame) {
    for (const it of G.items) {
      const u = easeOut(clamp((now - it.moveAt) / 0.16, 0, 1));
      let x, y, sc = 1;
      if (it.prev < 0) {
        [x, y] = worldPos(it.ramp, 0);
        sc = u;
      } else {
        const a = worldPos(it.ramp, it.prev), b = worldPos(it.ramp, it.step);
        x = lerp(a[0], b[0], u);
        y = lerp(a[1], b[1], u) - Math.sin(u * Math.PI) * 7;
      }
      const dir = it.ramp >= 2 ? -1 : 1;
      const rot = it.kind === 'bomb' || it.kind === 'gold' ? 0 : dir * (it.spin + (Math.max(0, it.prev) + u) * 1.5);
      drawItem(ctx, it.kind, x, y, ITEM_R * sc, rot, now);
    }
    // falling (missed) items
    for (const f of G.falling) {
      const p = clamp((now - f.t0) / 0.42, 0, 1);
      const [x0, y0] = worldPos(f.ramp, 4);
      const dir = f.ramp >= 2 ? -1 : 1;
      if (!f.done) {
        drawItem(ctx, f.kind, x0 + dir * 60 * p, lerp(y0, GROUND - ITEM_R, p * p), ITEM_R, dir * p * 4, now);
      } else if (f.kind !== 'bomb') {
        ctx.fillStyle = (ITEM_COLORS[f.kind] || ['#fff'])[0];
        const gx = x0 + dir * 60;
        ellipse(ctx, gx - 8, GROUND - 4, 11, 5, -0.2); ctx.fill();
        ellipse(ctx, gx + 10, GROUND - 3, 9, 4, 0.3); ctx.fill();
      }
    }
  }

  // hero
  const power = inGame && powered(now);
  if (power) drawAura(ctx, heroX, HERO.y, now, clamp(G.powerUntil - now, 0, 1));
  const left = G.pos < 2, low = G.pos % 2 === 1;
  const sinceMove = now - G.moveAt;
  if (inGame && sinceMove < 0.14 && G.prevPos !== G.pos) {
    ctx.globalAlpha = 0.28 * (1 - sinceMove / 0.14);
    drawHero(ctx, { x: heroX, y: HERO.y, left: G.prevPos < 2, low: G.prevPos % 2 === 1, t: now });
    ctx.globalAlpha = 1;
  }
  const catchP = clamp(1 - (now - G.catchAt) / 0.25, 0, 1);
  drawHero(ctx, {
    x: heroX, y: HERO.y,
    left: inGame ? left : true,
    low: inGame ? low : Math.sin(now * 1.6) > 0.6,
    t: now,
    blink: now > G.blinkAt,
    squash: Math.sin(catchP * Math.PI) * 1,
    sad: G.state === 'miss' || G.state === 'over',
    speed: sinceMove < 0.3 ? 1 - sinceMove / 0.3 : 0,
    item: inGame && catchP > 0 && G.catchKind ? { kind: G.catchKind } : null,
  });

  if (inGame && w.fog) drawFog(ctx, now);

  // particles
  for (const p of G.fx) {
    ctx.globalAlpha = 1 - p.life / p.max;
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // touch ripples
  for (const r of G.ripples) {
    const p = (now - r.t) / 0.4;
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - p)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r.x, r.y, 14 + p * 40, 0, TAU); ctx.stroke();
  }

  // floating texts
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of G.texts) {
    const p = t.life / t.max;
    ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    ctx.font = `${t.size}px Bungee, Impact, sans-serif`;
    const y = t.y - easeOut(Math.min(1, p * 1.5)) * 30;
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(20,16,30,.75)'; ctx.lineJoin = 'round';
    ctx.strokeText(t.s, t.x, y);
    ctx.fillStyle = t.col;
    ctx.fillText(t.s, t.x, y);
  }
  ctx.globalAlpha = 1;

  // flash
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (G.flash > 0) {
    ctx.fillStyle = `rgba(255,220,180,${G.flash * 0.6})`;
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
  ctx.setTransform(L.dpr * L.s, 0, 0, L.dpr * L.s, L.dpr * L.ox, L.dpr * L.oy);

  if (inGame) drawHud(now);
  if (G.state === 'intro') drawIntro(now);
  if (G.state === 'miss' && G.lives > 0 && G.miss) {
    drawBanner(G.miss.bomb ? 'Au, bomba!' : 'Spadlo!', '#ffffff', now - G.missAt, G.miss.ramp >= 2 ? 760 : 200);
  }
}

function hudText(s, x, y, size, col, align = 'left', font = 'Bungee, Impact, sans-serif') {
  ctx.font = `${font.startsWith('Nunito') ? '800 ' : ''}${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(16,14,28,.7)';
  ctx.strokeText(s, x, y);
  ctx.fillStyle = col;
  ctx.fillText(s, x, y);
}

function bar(x, y, w, h, frac, col, back = 'rgba(16,14,28,.55)') {
  ctx.fillStyle = back;
  roundRect(x, y, w, h, h / 2); ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = col;
    roundRect(x, y, Math.max(h, w * clamp(frac, 0, 1)), h, h / 2); ctx.fill();
  }
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function heart(x, y, s, full) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-14, -4, -8, -14, 0, -7);
  ctx.bezierCurveTo(8, -14, 14, -4, 0, 6);
  ctx.closePath();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(16,14,28,.75)'; ctx.stroke();
  ctx.fillStyle = full ? '#ff4d5e' : 'rgba(255,255,255,.25)';
  ctx.fill();
  if (full) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(-4, -6, 2, 0, TAU); ctx.fill(); }
  ctx.restore();
}

function drawHud(now) {
  const sb = L.sb;
  const top = Math.max(sb.y0, -20) + 22;
  const lx = sb.x0 + 18;
  // world + progress
  if (G.boss) {
    hudText('HAVRAN', lx, top, 15, '#ffb3c0');
    bar(lx, top + 14, 170, 12, G.boss.hp / G.boss.max, '#e2364c');
  } else if (G.endless) {
    hudText('NEKONEČNO · ' + G.theme.name.toUpperCase(), lx, top, 13, '#ffffff');
    bar(lx, top + 14, 170, 10, (G.caught % ENDLESS_CYCLE) / ENDLESS_CYCLE, '#8fe3ff');
  } else {
    hudText(`${G.world} · ${G.theme.name.toUpperCase()}`, lx, top, 13, '#ffffff');
    bar(lx, top + 14, 170, 10, G.caught / G.theme.target, '#7ee07e');
  }
  // score + combo
  const pop = clamp(1 - (now - G.catchAt) / 0.18, 0, 1);
  hudText(String(G.score), 480, top + 4, 34 + pop * 6, '#ffffff', 'center');
  const pw = powered(now);
  const meter = pw ? (G.powerUntil - now) / POWER_TIME : (G.combo % POWER_AT) / POWER_AT;
  bar(420, top + 28, 120, 8, meter, pw ? '#8fe3ff' : '#ffd34d');
  if (G.combo >= 2) hudText(pw ? `SÍLA BODLIN ×2` : `KOMBO ${G.combo}`, 480, top + 48, 13, pw ? '#8fe3ff' : '#ffd34d', 'center');
  // lives (left of the pause button)
  const rx = sb.x1 - 70;
  for (let i = 0; i < 3; i++) {
    const lostNow = G.state === 'miss' && i === G.lives && Math.floor(now * 8) % 2 === 0;
    heart(rx - i * 30, top + 2, 1.15, i < G.lives || lostNow);
  }
  if (G.mode === 'B') hudText('TĚŽKÁ', rx - 30, top + 26, 10, '#ffb3c0', 'center');
}

function drawIntro(now) {
  const p = now - G.introAt;
  const a = clamp(p * 3, 0, 1);
  ctx.globalAlpha = a;
  const title = G.endless ? 'NEKONEČNÝ REŽIM' : G.boss ? 'SOUBOJ S HAVRANEM' : `SVĚT ${G.world}`;
  hudText(title, 480, 150, 22, '#ffd34d', 'center');
  hudText(G.endless ? 'Jak dlouho vydržíš?' : G.theme.name, 480, 188, 36, '#ffffff', 'center');
  const left = 4 - G.introBeats;
  hint();
  hudText(left > 1 ? String(left - 1) : 'TEĎ!', 480, 236, 30, '#8fe3ff', 'center');
  ctx.globalAlpha = 1;
}
function hint() {
  const w = G.theme;
  let s = 'Ťukej do čtyř rohů obrazovky';
  if (G.endless) s = 'Všechny nástrahy najednou';
  else if (w.boss) s = 'Chytej, co Havran hází – bomby ne!';
  else if (w.bombs && w.pairs) s = 'Pozor na dvojice a bomby';
  else if (w.bombs) s = 'Bomby nechytej!';
  else if (w.fog) s = 'Mlha schovává skluzavky';
  else if (w.gold) s = 'Zlatá hvězda = 5 bodů';
  hudText(s, 480, 272, 16, '#ffffff', 'center', 'Nunito, sans-serif');
}
function drawBanner(s, col, age, x) {
  const a = clamp(age * 4, 0, 1) * clamp((MISS_PAUSE - age) * 4, 0, 1);
  ctx.globalAlpha = a;
  hudText(s, x, 360, 28, col, 'center');
  ctx.globalAlpha = 1;
}

// ---------------- loop ----------------
let last = performance.now() / 1000;
function frame(ms) {
  const now = ms / 1000;
  const dt = Math.min(0.05, Math.max(0, now - last));
  last = now;
  try {
    update(now, dt);
    render(now);
  } catch (e) {
    console.error(e);
  }
  requestAnimationFrame(frame);
}

// ---------------- boot ----------------
layout();
refreshTitle();
show('title');
music.setWorld(WORLDS[0].music);
startClock(performance.now() / 1000, 0.3);
if (document.fonts && document.fonts.load) {
  Promise.all([document.fonts.load('30px Bungee'), document.fonts.load('800 14px Nunito')]).then(() => { bg = null; }).catch(() => {});
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// expose for quick debugging in the browser console
window.__jezek = { G, startWorld, moveTo };
