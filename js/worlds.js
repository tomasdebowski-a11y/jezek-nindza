// Worlds: scenery, ramps, falling items, music and gameplay settings.
import { TAU, hash, vnoise, ellipse, rr } from './util.js';

// ---------- shared geometry (logical 960 x 440 space, left side; right side is mirrored) ----------
export const RAMP = { x0: 34, x1: 304, dy: 62, y: [118, 222] };
export const GROUND = 410;
export const rampY = (x, low) => RAMP.y[low ? 1 : 0] + ((x - RAMP.x0) / (RAMP.x1 - RAMP.x0)) * RAMP.dy;
export const ITEM_R = 17;
export function itemPos(step, low) {
  const x = 70 + step * 52;
  return [x, rampY(x, low) - ITEM_R - 6];
}

// ---------- scenery helpers ----------
function sky(ctx, b, stops) {
  const g = ctx.createLinearGradient(0, b.y0, 0, b.y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(b.x0 - 2, b.y0 - 2, b.x1 - b.x0 + 4, b.y1 - b.y0 + 4);
}
const ridgeY = (x, base, amp, scale, seed) => base - amp * (vnoise(x / scale, seed) * 0.7 + vnoise(x / (scale / 3), seed + 7) * 0.3);
function ridge(ctx, b, base, amp, scale, seed, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(b.x0 - 4, b.y1 + 4);
  for (let x = b.x0 - 4; x <= b.x1 + 10; x += 6) ctx.lineTo(x, ridgeY(x, base, amp, scale, seed));
  ctx.lineTo(b.x1 + 10, b.y1 + 4);
  ctx.closePath();
  ctx.fill();
}
function peaks(ctx, b, base, amp, step, seed, color, snow) {
  const pts = [];
  const i0 = Math.floor((b.x0 - step * 2) / step), i1 = Math.ceil((b.x1 + step * 2) / step);
  for (let i = i0; i <= i1; i++) {
    const h = hash(i, seed);
    const x = i * step + (hash(i, seed + 3) - 0.5) * step * 0.5;
    const y = i % 2 === 0 ? base - amp * (0.5 + 0.5 * h) : base - amp * (0.12 + 0.3 * h);
    pts.push([x, y, i % 2 === 0]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], b.y1 + 4);
  pts.forEach(p => ctx.lineTo(p[0], p[1]));
  ctx.lineTo(pts[pts.length - 1][0], b.y1 + 4);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (snow) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = snow;
    for (const [x, y, top] of pts) {
      if (!top) continue;
      ctx.beginPath();
      ctx.moveTo(x - 90, y - 10);
      ctx.lineTo(x + 90, y - 10);
      ctx.lineTo(x + 90, y + 36);
      for (let k = 0; k <= 8; k++) ctx.lineTo(x + 90 - k * 22.5, y + (k % 2 ? 46 : 30));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
function groundBand(ctx, b, top, edge, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(b.x0 - 2, GROUND, b.x1 - b.x0 + 4, b.y1 - GROUND + 4);
  ctx.fillStyle = edge;
  ctx.fillRect(b.x0 - 2, GROUND - 4, b.x1 - b.x0 + 4, 10);
  if (top) { ctx.fillStyle = top; ctx.fillRect(b.x0 - 2, GROUND - 6, b.x1 - b.x0 + 4, 3); }
}
function cloud(ctx, x, y, s, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, 22 * s, 0, TAU);
  ctx.arc(x + 26 * s, y - 10 * s, 26 * s, 0, TAU);
  ctx.arc(x + 54 * s, y, 20 * s, 0, TAU);
  ctx.arc(x + 26 * s, y + 6 * s, 22 * s, 0, TAU);
  ctx.fill();
}
const wrapX = (x, b, pad) => {
  const span = b.x1 - b.x0 + pad * 2;
  return b.x0 - pad + ((((x - b.x0 + pad) % span) + span) % span);
};

// falling/rising particles that loop through the view
function drift(ctx, b, t, n, seed, draw, { vy = 30, vx = 10, sway = 20 } = {}) {
  const h = b.y1 - b.y0 + 40;
  for (let i = 0; i < n; i++) {
    const r1 = hash(i, seed), r2 = hash(i, seed + 1), r3 = hash(i, seed + 2);
    const sp = 0.6 + r3 * 0.8;
    let y = b.y0 - 20 + ((((r2 * h + t * vy * sp) % h) + h) % h);
    let x = wrapX(b.x0 + r1 * (b.x1 - b.x0) + t * vx * sp + Math.sin(t * 1.3 + i) * sway, b, 20);
    draw(x, y, i, r3);
  }
}

// ---------- ramp + source styles ----------
const RAMP_STYLES = {
  branch(ctx) {
    for (const low of [0, 1]) {
      line(ctx, RAMP.x0, rampY(RAMP.x0, low), RAMP.x1, rampY(RAMP.x1, low), 15, '#6e4424');
      line(ctx, RAMP.x0, rampY(RAMP.x0, low) - 4, RAMP.x1, rampY(RAMP.x1, low) - 4, 4, '#a0703f');
      for (const lx of [110, 210]) {
        ctx.fillStyle = '#4f9a3c';
        ellipse(ctx, lx, rampY(lx, low) + 12, 10, 5, 0.6); ctx.fill();
        ellipse(ctx, lx + 14, rampY(lx, low) + 14, 9, 4.5, -0.5); ctx.fill();
      }
    }
  },
  bamboo(ctx) {
    for (const low of [0, 1]) {
      line(ctx, RAMP.x0, rampY(RAMP.x0, low), RAMP.x1, rampY(RAMP.x1, low), 13, '#6aa34c');
      line(ctx, RAMP.x0, rampY(RAMP.x0, low) - 3, RAMP.x1, rampY(RAMP.x1, low) - 3, 3, '#a8d67f');
      for (let x = 60; x < RAMP.x1; x += 54) {
        const y = rampY(x, low);
        line(ctx, x - 1, y - 8, x + 2, y + 8, 3, '#476f31');
      }
    }
  },
  stone(ctx) {
    for (const low of [0, 1]) {
      for (let x = RAMP.x0; x < RAMP.x1; x += 54) {
        const x2 = Math.min(RAMP.x1, x + 52);
        ctx.fillStyle = '#7b7193';
        ctx.beginPath();
        ctx.moveTo(x, rampY(x, low) - 8); ctx.lineTo(x2, rampY(x2, low) - 8);
        ctx.lineTo(x2, rampY(x2, low) + 9); ctx.lineTo(x, rampY(x, low) + 9); ctx.closePath(); ctx.fill();
        line(ctx, x + 2, rampY(x, low) - 7, x2 - 2, rampY(x2, low) - 7, 3, '#a79dc4');
      }
    }
  },
  roof(ctx) {
    for (const low of [0, 1]) {
      line(ctx, RAMP.x0, rampY(RAMP.x0, low) + 1, RAMP.x1, rampY(RAMP.x1, low) + 1, 14, '#2a2f5e');
      ctx.fillStyle = '#1d2149';
      for (let x = RAMP.x0 + 8; x < RAMP.x1; x += 16) { ctx.beginPath(); ctx.arc(x, rampY(x, low) + 8, 7, 0, Math.PI); ctx.fill(); }
      line(ctx, RAMP.x0, rampY(RAMP.x0, low) - 6, RAMP.x1, rampY(RAMP.x1, low) - 6, 3, '#d4a84c');
    }
  },
  basalt(ctx) {
    for (const low of [0, 1]) {
      line(ctx, RAMP.x0, rampY(RAMP.x0, low), RAMP.x1, rampY(RAMP.x1, low), 16, '#2a1717');
      line(ctx, RAMP.x0, rampY(RAMP.x0, low) - 6, RAMP.x1, rampY(RAMP.x1, low) - 6, 3, '#4a2a24');
    }
  },
  ice(ctx) {
    for (const low of [0, 1]) {
      line(ctx, RAMP.x0, rampY(RAMP.x0, low), RAMP.x1, rampY(RAMP.x1, low), 14, '#a6d3f5');
      line(ctx, RAMP.x0, rampY(RAMP.x0, low) - 4, RAMP.x1, rampY(RAMP.x1, low) - 4, 3, '#ffffff');
      ctx.fillStyle = '#d6ecff';
      for (let x = 50; x < RAMP.x1; x += 30) {
        const y = rampY(x, low) + 6, l = 8 + hash(x, 3) * 12;
        ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + l); ctx.closePath(); ctx.fill();
      }
    }
  },
};

function line(ctx, x1, y1, x2, y2, w, col) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

const SOURCES = {
  tree(ctx) {
    ctx.fillStyle = '#6b4226'; ctx.fillRect(4, 60, 30, GROUND - 56);
    ctx.strokeStyle = '#563419'; ctx.lineWidth = 2;
    for (let y = 120; y < GROUND; y += 46) { ctx.beginPath(); ctx.moveTo(10, y); ctx.quadraticCurveTo(18, y + 10, 12, y + 24); ctx.stroke(); }
    const blobs = [[16, 58, 46, '#3f8a34'], [50, 42, 32, '#4f9f3e'], [-10, 30, 34, '#4f9f3e'], [24, 22, 30, '#62b44a']];
    for (const [x, y, r, c] of blobs) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#e23a33';
    [[0, 52], [36, 30], [52, 62], [14, 18]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); });
  },
  bamboo(ctx) {
    for (const [x, w, c] of [[2, 16, '#5c9441'], [24, 14, '#6fae4f']]) {
      ctx.fillStyle = c; ctx.fillRect(x, 20, w, GROUND - 16);
      ctx.fillStyle = '#3f6c2c';
      for (let y = 40; y < GROUND; y += 48) ctx.fillRect(x - 1, y, w + 2, 4);
    }
    ctx.fillStyle = '#5fa443';
    for (let i = 0; i < 6; i++) { ellipse(ctx, 20 + i * 9, 30 + (i % 2) * 14, 24, 5, 0.4 + i * 0.15); ctx.fill(); }
  },
  lantern(ctx) {
    ctx.fillStyle = '#5f5579'; ctx.fillRect(10, 100, 22, GROUND - 96);
    ctx.fillStyle = '#4b4263'; ctx.fillRect(2, 92, 38, 10); ctx.fillRect(4, GROUND - 14, 34, 14);
    ctx.fillStyle = '#4b4263'; ctx.beginPath(); ctx.moveTo(-6, 52); ctx.lineTo(48, 52); ctx.lineTo(21, 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd287'; ctx.fillRect(8, 56, 26, 30);
    ctx.fillStyle = '#5f5579'; ctx.fillRect(19, 56, 4, 30);
  },
  chimney(ctx) {
    ctx.fillStyle = '#3a2f4f'; ctx.fillRect(4, 70, 34, GROUND - 66);
    ctx.strokeStyle = '#2b2340'; ctx.lineWidth = 2;
    for (let y = 84; y < GROUND; y += 14) {
      ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(38, y); ctx.stroke();
      const off = (y / 14) % 2 ? 12 : 24;
      ctx.beginPath(); ctx.moveTo(4 + off, y - 14); ctx.lineTo(4 + off, y); ctx.stroke();
    }
    ctx.fillStyle = '#2b2340'; ctx.fillRect(0, 62, 42, 12);
  },
  basalt(ctx) {
    ctx.fillStyle = '#2d1616';
    ctx.beginPath(); ctx.moveTo(6, GROUND); ctx.lineTo(4, 80); ctx.lineTo(20, 64); ctx.lineTo(38, 80); ctx.lineTo(36, GROUND); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ff6a1f'; ctx.lineWidth = 2; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(20, 70); ctx.lineTo(16, 160); ctx.lineTo(24, 250); ctx.lineTo(18, 360); ctx.stroke();
    ctx.globalAlpha = 1;
  },
  ice(ctx) {
    ctx.fillStyle = '#93c4ea';
    ctx.beginPath(); ctx.moveTo(4, GROUND); ctx.lineTo(8, 70); ctx.lineTo(22, 40); ctx.lineTo(36, 70); ctx.lineTo(40, GROUND); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.beginPath(); ctx.moveTo(14, GROUND); ctx.lineTo(16, 80); ctx.lineTo(22, 50); ctx.lineTo(20, GROUND); ctx.closePath(); ctx.fill();
  },
};

// ---------- items ----------
export const ITEM_COLORS = {
  apple: ['#e8333a', '#ff8a7a', '#5fae45'],
  onigiri: ['#ffffff', '#e9e6d8', '#1f2d24'],
  mango: ['#ffb627', '#ff7a1a', '#7bc043'],
  scroll: ['#f3e2b8', '#c0392b', '#e9c46a'],
  dragon: ['#ff3f8e', '#ffd1e6', '#5ad16b'],
  gold: ['#ffd34d', '#fff1a8', '#f0a500'],
  bomb: ['#2a2d3d', '#ff9b2f', '#ffe066'],
};

export function drawItem(ctx, kind, x, y, r, rot, t) {
  ctx.save();
  ctx.translate(x, y);
  if (kind === 'gold') {
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2.2);
    g.addColorStop(0, 'rgba(255,230,120,.75)'); g.addColorStop(1, 'rgba(255,230,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, TAU); ctx.fill();
  }
  ctx.rotate(rot);
  const s = r / 17;
  ctx.scale(s, s);
  switch (kind) {
    case 'apple': {
      const g = ctx.createRadialGradient(-6, -6, 2, 0, 0, 20);
      g.addColorStop(0, '#ff8a7a'); g.addColorStop(0.55, '#e3282f'); g.addColorStop(1, '#9c1420');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(-5, 1, 13, 0, TAU); ctx.arc(5, 1, 13, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#5b3a1e'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(1, -16, 3, -19); ctx.stroke();
      ctx.fillStyle = '#4caf50'; ellipse(ctx, 9, -16, 7, 3.5, -0.5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ellipse(ctx, -8, -4, 3.5, 5, 0.4); ctx.fill();
      break;
    }
    case 'onigiri': {
      ctx.fillStyle = '#fbfbf4'; ctx.strokeStyle = '#cfcab5'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(0, -17); ctx.quadraticCurveTo(4, -17, 17, 9); ctx.quadraticCurveTo(18, 15, 12, 15);
      ctx.lineTo(-12, 15); ctx.quadraticCurveTo(-18, 15, -17, 9); ctx.quadraticCurveTo(-4, -17, 0, -17); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1f2d24'; rr(ctx, -8, 2, 16, 13, 2); ctx.fill();
      ctx.fillStyle = '#c9c2a3'; [[-6, -4], [3, -8], [6, -1]].forEach(([a, b]) => { ellipse(ctx, a, b, 1.6, 1); ctx.fill(); });
      break;
    }
    case 'mango': {
      const g = ctx.createLinearGradient(-15, -10, 15, 12);
      g.addColorStop(0, '#ffd23f'); g.addColorStop(0.6, '#ff9a1f'); g.addColorStop(1, '#ff5e3a');
      ctx.fillStyle = g; ellipse(ctx, 0, 0, 18, 14, 0.35); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ellipse(ctx, -6, -5, 5, 3, 0.4); ctx.fill();
      ctx.fillStyle = '#6cb33f'; ellipse(ctx, 12, -12, 8, 3.5, -0.7); ctx.fill();
      break;
    }
    case 'scroll': {
      ctx.fillStyle = '#f3e2b8'; ctx.fillRect(-13, -11, 26, 22);
      ctx.strokeStyle = '#c9b07a'; ctx.lineWidth = 1.5;
      for (let i = -6; i <= 6; i += 6) { ctx.beginPath(); ctx.moveTo(-9, i); ctx.lineTo(9, i); ctx.stroke(); }
      ctx.fillStyle = '#b8322a'; rr(ctx, -18, -13, 7, 26, 3); ctx.fill(); rr(ctx, 11, -13, 7, 26, 3); ctx.fill();
      ctx.fillStyle = '#e9c46a'; ctx.fillRect(-2, -12, 4, 24);
      break;
    }
    case 'dragon': {
      ctx.fillStyle = '#5ad16b';
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(-5, -12); ctx.quadraticCurveTo(0, -24, 6, -20); ctx.lineTo(4, -11); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      const g = ctx.createRadialGradient(-4, -4, 2, 0, 0, 16);
      g.addColorStop(0, '#ff9ccc'); g.addColorStop(1, '#e0206e');
      ctx.fillStyle = g; ellipse(ctx, 0, 0, 15, 13); ctx.fill();
      ctx.fillStyle = 'rgba(255,200,80,.85)';
      ctx.beginPath(); ctx.moveTo(-4, -2); ctx.quadraticCurveTo(0, -12 - Math.sin(t * 20) * 2, 4, -2); ctx.quadraticCurveTo(0, 4, -4, -2); ctx.fill();
      break;
    }
    case 'gold': {
      star(ctx, 0, 0, 18, 8, '#ffcf3d');
      ctx.strokeStyle = '#d98e04'; ctx.lineWidth = 2; ctx.stroke();
      star(ctx, 0, 0, 10, 4.5, '#fff1a8');
      break;
    }
    case 'bomb': {
      const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, 17);
      g.addColorStop(0, '#5a5f7a'); g.addColorStop(1, '#14161f');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 2, 15, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7a7f99'; ctx.fillRect(-4, -15, 8, 6);
      ctx.strokeStyle = '#c8a165'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -15); ctx.quadraticCurveTo(4, -22, 9, -20); ctx.stroke();
      const f = 3 + Math.sin(t * 40) * 1.5;
      ctx.fillStyle = '#ff9b2f'; ctx.beginPath(); ctx.arc(10, -21, f + 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(10, -21, f, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8eaf2'; ctx.font = '700 11px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, 3);
      break;
    }
  }
  ctx.restore();
  if (kind === 'gold') {
    ctx.fillStyle = '#fffbe0';
    for (let i = 0; i < 3; i++) {
      const a = t * 3 + i * 2.1, d = r * 1.5;
      sparkle(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 3 + Math.sin(t * 9 + i) * 1.5);
    }
  }
}
function star(ctx, x, y, R, r, col) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r : R;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
}
export function sparkle(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s * 2); ctx.lineTo(x + s * 0.5, y - s * 0.5); ctx.lineTo(x + s * 2, y); ctx.lineTo(x + s * 0.5, y + s * 0.5);
  ctx.lineTo(x, y + s * 2); ctx.lineTo(x - s * 0.5, y + s * 0.5); ctx.lineTo(x - s * 2, y); ctx.lineTo(x - s * 0.5, y - s * 0.5);
  ctx.closePath(); ctx.fill();
}

// ---------- worlds ----------
const MIXED = ['apple', 'onigiri', 'mango', 'scroll', 'dragon'];

export const WORLDS = [
  {
    id: 1, name: 'Ovocný sad', items: ['apple'], ramp: 'branch', source: 'tree', spot: null,
    target: 30, base: 640, min: 430, count: [1, 3], gold: 0, bombs: 0, pairs: 0, fog: false,
    hud: '#1d3b2a',
    music: { root: 60, scale: [0, 2, 4, 5, 7, 9, 11], prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
      lead: 'square', leadVol: 0.05, leadLP: [4000, 1800], bassType: 'triangle', bassVol: 0.24, drums: 'pop', bass: 'pop', rhythm: 'bouncy', pad: false, seed: 11 },
    drawStatic(ctx, b) {
      sky(ctx, b, [[0, '#5cb8f0'], [0.55, '#b9e4fb'], [1, '#eaf8ff']]);
      const g = ctx.createRadialGradient(760, 90, 10, 760, 90, 140);
      g.addColorStop(0, 'rgba(255,244,190,.9)'); g.addColorStop(1, 'rgba(255,244,190,0)');
      ctx.fillStyle = g; ctx.fillRect(600, -60, 320, 300);
      ctx.fillStyle = '#fff4c8'; ctx.beginPath(); ctx.arc(760, 90, 38, 0, TAU); ctx.fill();
      ridge(ctx, b, 330, 70, 260, 1, '#a9da92');
      for (let i = Math.floor(b.x0 / 64) - 1; i < b.x1 / 64 + 1; i++) {
        if (hash(i, 5) < 0.4) continue;
        const x = i * 64 + hash(i, 6) * 30, y = ridgeY(x, 330, 70, 260, 1) + 6, r = 14 + hash(i, 8) * 9;
        ctx.fillStyle = '#7a5a3a'; ctx.fillRect(x - 2, y - 4, 4, 14);
        ctx.fillStyle = '#5fa14b'; ctx.beginPath(); ctx.arc(x, y - r * 0.7, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e04a3a';
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x - r * 0.5 + k * r * 0.5, y - r * 0.6 + (k % 2) * 6 - 4, 2.4, 0, TAU); ctx.fill(); }
      }
      ridge(ctx, b, 395, 46, 210, 2, '#7cc461');
      groundBand(ctx, b, '#9bd477', '#6fb552', '#5a9e3f');
      ctx.fillStyle = '#4e8d36';
      for (let x = Math.floor(b.x0 / 22) * 22; x < b.x1; x += 22) {
        const h = 5 + hash(x, 9) * 6;
        ctx.beginPath(); ctx.moveTo(x, GROUND + 4); ctx.lineTo(x + 3, GROUND - h); ctx.lineTo(x + 6, GROUND + 4); ctx.fill();
      }
    },
    drawDynamic(ctx, b, t) {
      for (let i = 0; i < 4; i++) {
        const x = wrapX(i * 290 + t * (8 + i * 3), b, 120);
        cloud(ctx, x, 40 + i * 26, 0.8 + (i % 2) * 0.35, 'rgba(255,255,255,.88)');
      }
      ctx.fillStyle = '#6dbb4f';
      drift(ctx, b, t, 6, 31, (x, y, i) => { ellipse(ctx, x, y, 6, 3, t * 2 + i); ctx.fill(); }, { vy: 26, vx: 18, sway: 30 });
    },
  },
  {
    id: 2, name: 'Bambusový les', items: ['onigiri'], ramp: 'bamboo', source: 'bamboo', spot: null,
    target: 35, base: 600, min: 400, count: [2, 3], gold: 0.08, bombs: 0, pairs: 0, fog: false,
    hud: '#173a2a',
    music: { root: 62, scale: [0, 3, 5, 7, 10], prog: [[0, 3, 7], [-2, 2, 5], [5, 8, 12], [3, 7, 10]],
      lead: 'sine', leadVol: 0.1, vib: 5, bassType: 'triangle', bassVol: 0.22, drums: 'soft', bass: 'soft', rhythm: 'calm', pad: true, seed: 22 },
    drawStatic(ctx, b) {
      sky(ctx, b, [[0, '#dff2d2'], [0.6, '#a9d3b0'], [1, '#79b291']]);
      ctx.fillStyle = 'rgba(255,255,230,.22)';
      for (const x of [180, 470, 760]) { ctx.beginPath(); ctx.moveTo(x, b.y0); ctx.lineTo(x + 70, b.y0); ctx.lineTo(x - 90, GROUND); ctx.lineTo(x - 190, GROUND); ctx.closePath(); ctx.fill(); }
      const layer = (step, w, col, node, seed) => {
        for (let i = Math.floor(b.x0 / step) - 1; i < b.x1 / step + 1; i++) {
          if (hash(i, seed) < 0.3) continue;
          const x = i * step + hash(i, seed + 1) * step * 0.6;
          ctx.fillStyle = col; ctx.fillRect(x, b.y0, w, GROUND - b.y0);
          ctx.fillStyle = node;
          for (let y = b.y0 + hash(i, seed + 2) * 40; y < GROUND; y += 52) ctx.fillRect(x - 1, y, w + 2, 3);
        }
      };
      layer(26, 6, '#b8dcb2', '#9cc596', 41);
      layer(52, 11, '#7fba7a', '#5f9a5a', 42);
      ctx.fillStyle = '#5d9c55';
      for (let i = Math.floor(b.x0 / 52) - 1; i < b.x1 / 52 + 1; i++) {
        if (hash(i, 42) < 0.3) continue;
        const x = i * 52 + hash(i, 43) * 31 + 5;
        for (let k = 0; k < 3; k++) { ellipse(ctx, x + 14, 80 + hash(i, 44 + k) * 200, 18, 4, 0.5); ctx.fill(); }
      }
      ridge(ctx, b, 400, 30, 160, 4, '#5f9466');
      groundBand(ctx, b, '#86b86c', '#5e8f4d', '#4b7a42');
    },
    drawDynamic(ctx, b, t) {
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      for (let i = 0; i < 3; i++) { const x = wrapX(i * 400 + t * 12, b, 200); ellipse(ctx, x, 350 + i * 14, 220, 18); ctx.fill(); }
      ctx.fillStyle = '#7cc061';
      drift(ctx, b, t, 9, 51, (x, y, i) => { ellipse(ctx, x, y, 9, 2.5, 0.6 + Math.sin(t * 2 + i) * 0.6); ctx.fill(); }, { vy: 22, vx: 14, sway: 40 });
    },
  },
  {
    id: 3, name: 'Chrám v mlze', items: ['mango'], ramp: 'stone', source: 'lantern', spot: 'rgba(255,220,200,.18)',
    target: 40, base: 560, min: 360, count: [2, 4], gold: 0.08, bombs: 0, pairs: 0, fog: true,
    hud: '#2a2245',
    music: { root: 57, scale: [0, 1, 5, 7, 8], prog: [[0, 3, 7], [1, 5, 8], [-2, 1, 5], [0, 3, 7]],
      lead: 'triangle', leadVol: 0.11, bassType: 'sine', bassVol: 0.3, drums: 'sparse', bass: 'sparse', rhythm: 'sparse', pad: true, seed: 33 },
    drawStatic(ctx, b) {
      sky(ctx, b, [[0, '#2b2858'], [0.45, '#8a5b90'], [0.75, '#e2939b'], [1, '#f6c9a8']]);
      ctx.fillStyle = 'rgba(255,215,170,.85)'; ctx.beginPath(); ctx.arc(480, 300, 74, 0, TAU); ctx.fill();
      peaks(ctx, b, 340, 190, 110, 9, '#6c5089');
      // cliff with pagoda
      ctx.fillStyle = '#4d3a6c';
      ctx.beginPath(); ctx.moveTo(690, GROUND); ctx.lineTo(705, 250); ctx.lineTo(735, 222); ctx.lineTo(820, 226); ctx.lineTo(845, 260); ctx.lineTo(870, GROUND); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#35284f';
      const tiers = [[778, 222, 52], [778, 196, 42], [778, 172, 32], [778, 152, 22]];
      for (const [x, y, w] of tiers) {
        ctx.fillRect(x - w * 0.55, y - 14, w * 1.1, 14);
        ctx.beginPath(); ctx.moveTo(x - w - 10, y - 12); ctx.quadraticCurveTo(x, y - 30, x + w + 10, y - 12); ctx.lineTo(x + w * 0.6, y - 20); ctx.lineTo(x - w * 0.6, y - 20); ctx.closePath(); ctx.fill();
      }
      ctx.fillRect(776, 112, 4, 26);
      // torii
      ctx.fillStyle = '#3c2c56';
      ctx.fillRect(132, 300, 7, 80); ctx.fillRect(181, 300, 7, 80); ctx.fillRect(122, 296, 76, 8); ctx.fillRect(128, 312, 64, 5);
      peaks(ctx, b, 395, 110, 80, 12, '#4c3a6b');
      groundBand(ctx, b, '#6a5c86', '#4a3f63', '#3b3150');
      ctx.strokeStyle = '#332a47'; ctx.lineWidth = 2;
      for (let x = Math.floor(b.x0 / 60) * 60; x < b.x1; x += 60) { ctx.beginPath(); ctx.moveTo(x, GROUND + 6); ctx.lineTo(x - 10, b.y1); ctx.stroke(); }
    },
    drawDynamic(ctx, b, t) {
      ctx.fillStyle = 'rgba(255,240,245,.16)';
      for (let i = 0; i < 4; i++) { const x = wrapX(i * 330 - t * 10, b, 220); ellipse(ctx, x, 300 + i * 22, 240, 20); ctx.fill(); }
      ctx.fillStyle = '#ffc4d6';
      drift(ctx, b, t, 12, 61, (x, y, i) => { ellipse(ctx, x, y, 4, 2.5, t * 3 + i); ctx.fill(); }, { vy: 24, vx: 22, sway: 26 });
    },
  },
  {
    id: 4, name: 'Noční střechy', items: ['scroll'], ramp: 'roof', source: 'chimney', spot: 'rgba(170,190,255,.2)',
    target: 40, base: 540, min: 340, count: [2, 4], gold: 0.08, bombs: 0.14, pairs: 0, fog: false,
    hud: '#0e1433',
    music: { root: 64, scale: [0, 2, 3, 5, 7, 8, 10], prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
      lead: 'sawtooth', leadVol: 0.045, leadLP: [2600, 1200], bassType: 'sawtooth', bassVol: 0.2, drums: 'four', bass: 'four', rhythm: 'drive', pad: true, seed: 44 },
    drawStatic(ctx, b) {
      sky(ctx, b, [[0, '#060a20'], [0.65, '#1c2652'], [1, '#3a3f74']]);
      ctx.fillStyle = '#ffffff';
      for (let gx = Math.floor(b.x0 / 50); gx < b.x1 / 50; gx++) for (let gy = Math.floor(b.y0 / 50); gy < 6; gy++) {
        const h = hash(gx * 31 + gy, 71); if (h < 0.55) continue;
        ctx.globalAlpha = 0.3 + h * 0.6; ctx.fillRect(gx * 50 + hash(gx, gy) * 50, gy * 50 + hash(gy, gx) * 50, 2, 2);
      }
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(230, 95, 20, 230, 95, 130);
      g.addColorStop(0, 'rgba(245,232,180,.35)'); g.addColorStop(1, 'rgba(245,232,180,0)');
      ctx.fillStyle = g; ctx.fillRect(100, -40, 260, 270);
      ctx.fillStyle = '#f4e7b5'; ctx.beginPath(); ctx.arc(230, 95, 42, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e1d197'; [[216, 84, 8], [244, 104, 6], [234, 78, 4]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); });
      for (let i = Math.floor(b.x0 / 46) - 1; i < b.x1 / 46 + 1; i++) {
        const x = i * 46, w = 30 + hash(i, 72) * 14, h = 70 + hash(i, 73) * 120, top = GROUND - h;
        ctx.fillStyle = '#141b3e'; ctx.fillRect(x, top, w, h);
        for (let wy = top + 10; wy < GROUND - 12; wy += 16) for (let wx = x + 5; wx < x + w - 6; wx += 10) {
          if (hash(wx * 7 + wy, 74) < 0.72) continue;
          ctx.fillStyle = hash(wx + wy, 75) < 0.5 ? '#f6d36b' : '#ffb35c'; ctx.fillRect(wx, wy, 5, 7);
        }
      }
      for (let i = Math.floor(b.x0 / 190) - 1; i < b.x1 / 190 + 1; i++) {
        const x = i * 190 + 40, y = 352 + hash(i, 76) * 20;
        ctx.fillStyle = '#0c1029';
        ctx.fillRect(x + 14, y, 120, GROUND - y);
        ctx.beginPath(); ctx.moveTo(x - 6, y + 4); ctx.quadraticCurveTo(x + 74, y - 34, x + 154, y + 4); ctx.lineTo(x + 130, y - 8); ctx.lineTo(x + 18, y - 8); ctx.closePath(); ctx.fill();
      }
      groundBand(ctx, b, '#3a4278', '#252b55', '#1a1f40');
      ctx.strokeStyle = '#2a3060'; ctx.lineWidth = 2;
      for (let y = GROUND + 14; y < b.y1; y += 12) { ctx.beginPath(); ctx.moveTo(b.x0, y); ctx.lineTo(b.x1, y); ctx.stroke(); }
    },
    drawDynamic(ctx, b, t) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 14; i++) {
        const a = 0.5 + 0.5 * Math.sin(t * (1 + hash(i, 81) * 2) + i * 3);
        ctx.globalAlpha = a;
        sparkle(ctx, b.x0 + hash(i, 82) * (b.x1 - b.x0), 10 + hash(i, 83) * 220, 1.6);
      }
      ctx.globalAlpha = 1;
      const p = (t % 9) / 9;
      if (p < 0.12) {
        const q = p / 0.12, x = 900 - q * 500, y = 30 + q * 140;
        ctx.strokeStyle = `rgba(255,255,255,${1 - q})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 60, y - 17); ctx.stroke();
      }
    },
  },
  {
    id: 5, name: 'Sopka', items: ['dragon'], ramp: 'basalt', source: 'basalt', spot: 'rgba(255,170,120,.2)',
    target: 45, base: 500, min: 300, count: [3, 5], gold: 0.08, bombs: 0.16, pairs: 0.2, fog: false,
    hud: '#2a0d0a',
    music: { root: 54, scale: [0, 1, 3, 5, 7, 8, 10], prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 1, 5]],
      lead: 'square', leadVol: 0.05, leadLP: [3000, 1400], bassType: 'sawtooth', bassVol: 0.22, drums: 'heavy', bass: 'heavy', rhythm: 'drive', pad: false, seed: 55 },
    drawStatic(ctx, b) {
      sky(ctx, b, [[0, '#120607'], [0.5, '#45120e'], [1, '#a5351a']]);
      peaks(ctx, b, 380, 100, 100, 15, '#3a1612');
      ctx.fillStyle = '#2a1111';
      ctx.beginPath(); ctx.moveTo(250, GROUND); ctx.lineTo(430, 176); ctx.lineTo(530, 176); ctx.lineTo(710, GROUND); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ff6a1a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      for (const [x1, c, x2] of [[450, 380, 360], [500, 560, 600], [470, 480, 470]]) {
        ctx.beginPath(); ctx.moveTo(x1, 180); ctx.quadraticCurveTo(c, 290, x2, GROUND - 6); ctx.stroke();
      }
      groundBand(ctx, b, '#4a2018', '#2c1310', '#1f0f0f');
      ctx.strokeStyle = 'rgba(255,90,26,.7)'; ctx.lineWidth = 2;
      for (let x = Math.floor(b.x0 / 90) * 90; x < b.x1; x += 90) {
        ctx.beginPath(); ctx.moveTo(x, GROUND + 6); ctx.lineTo(x + 18, GROUND + 18); ctx.lineTo(x + 8, b.y1); ctx.stroke();
      }
    },
    drawDynamic(ctx, b, t) {
      const pulse = 0.6 + 0.4 * Math.sin(t * 2.2);
      const g = ctx.createRadialGradient(480, 178, 4, 480, 178, 90);
      g.addColorStop(0, `rgba(255,190,80,${0.9 * pulse})`); g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g; ctx.fillRect(380, 90, 200, 180);
      for (let i = 0; i < 7; i++) {
        const p = ((t * 0.12 + i / 7) % 1);
        ctx.fillStyle = `rgba(70,50,50,${0.45 * (1 - p)})`;
        ctx.beginPath(); ctx.arc(480 + Math.sin(i * 2 + t * 0.4) * 30 * p + p * 60, 170 - p * 200, 18 + p * 50, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#ffb347';
      drift(ctx, b, t, 16, 91, (x, y, i, r) => { ctx.globalAlpha = 0.5 + r * 0.5; ctx.fillRect(x, y, 3, 3); }, { vy: -40, vx: 8, sway: 18 });
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 6, name: 'Zasněžený vrchol', items: MIXED, ramp: 'ice', source: 'ice', spot: 'rgba(200,230,255,.18)',
    target: 60, base: 500, min: 300, count: [2, 4], gold: 0.06, bombs: 0.15, pairs: 0.15, fog: false, boss: true,
    hud: '#0d1b3a',
    music: { root: 59, scale: [0, 2, 3, 5, 7, 8, 10], prog: [[0, 3, 7], [-4, 0, 3], [5, 8, 12], [7, 11, 14]],
      lead: 'square', leadVol: 0.055, vib: 3, leadLP: [3500, 1600], bassType: 'triangle', bassVol: 0.26, drums: 'epic', bass: 'epic', rhythm: 'epic', pad: true, seed: 66 },
    drawStatic(ctx, b) {
      sky(ctx, b, [[0, '#0a1530'], [0.55, '#24457a'], [1, '#93bde4']]);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 40; i++) { ctx.globalAlpha = 0.3 + hash(i, 101) * 0.6; ctx.fillRect(b.x0 + hash(i, 102) * (b.x1 - b.x0), b.y0 + hash(i, 103) * 160, 2, 2); }
      ctx.globalAlpha = 1;
      peaks(ctx, b, 345, 200, 120, 21, '#3d5d8f', '#e6f0fb');
      peaks(ctx, b, 392, 110, 90, 24, '#5a7fb2', '#ffffff');
      groundBand(ctx, b, '#ffffff', '#d5e5f6', '#eaf3fc');
      ctx.fillStyle = '#c9dbef';
      for (let x = Math.floor(b.x0 / 120) * 120; x < b.x1; x += 120) { ellipse(ctx, x + 40, GROUND + 16, 50, 5); ctx.fill(); }
    },
    drawDynamic(ctx, b, t) {
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        for (let x = b.x0; x <= b.x1 + 20; x += 20) {
          const y = 70 + k * 40 + Math.sin(x / 140 + t * 0.6 + k) * 22 + Math.sin(x / 60 + t) * 6;
          if (x === b.x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = k ? 'rgba(120,255,210,.18)' : 'rgba(120,220,255,.16)';
        ctx.lineWidth = 34; ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      drift(ctx, b, t, 26, 111, (x, y, i, r) => { ctx.globalAlpha = 0.5 + r * 0.5; ctx.beginPath(); ctx.arc(x, y, 1.5 + r * 2, 0, TAU); ctx.fill(); }, { vy: 36, vx: -10, sway: 20 });
      ctx.globalAlpha = 1;
    },
  },
];

export function drawScenery(ctx, w, b) {
  w.drawStatic(ctx, b);
  SOURCES[w.source](ctx);
  RAMP_STYLES[w.ramp](ctx);
  ctx.save(); ctx.translate(960, 0); ctx.scale(-1, 1);
  SOURCES[w.source](ctx);
  RAMP_STYLES[w.ramp](ctx);
  ctx.restore();
}

// Lava glow on basalt ramps (animated, drawn every frame)
export function drawRampFx(ctx, w, t) {
  if (w.ramp !== 'basalt') return;
  const a = 0.45 + 0.35 * Math.sin(t * 3);
  for (const right of [false, true]) {
    ctx.save();
    if (right) { ctx.translate(960, 0); ctx.scale(-1, 1); }
    ctx.strokeStyle = `rgba(255,110,30,${a})`; ctx.lineWidth = 2.5;
    for (const low of [0, 1]) {
      ctx.beginPath();
      for (let x = RAMP.x0 + 10; x < RAMP.x1; x += 18) ctx.lineTo(x, rampY(x, low) + ((x / 18) % 2 ? 3 : -2));
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Fog that hides the middle of each ramp (world 3)
export function drawFog(ctx, t) {
  for (const right of [false, true]) {
    for (const low of [0, 1]) {
      const a = 0.62 + 0.2 * Math.sin(t * 1.3 + low * 2 + (right ? 1 : 0));
      const cx = right ? 960 - 175 : 175, cy = rampY(175, low) - 18;
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 95);
      g.addColorStop(0, `rgba(238,228,246,${a})`); g.addColorStop(0.65, `rgba(238,228,246,${a * 0.85})`); g.addColorStop(1, 'rgba(238,228,246,0)');
      ctx.fillStyle = g;
      ellipse(ctx, cx + Math.sin(t * 0.7 + low) * 8, cy, 100, 44); ctx.fill();
    }
  }
}
