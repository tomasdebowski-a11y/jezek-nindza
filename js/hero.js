// Bodlík – the ninja hedgehog – and Havran, the crow ninja boss. Drawn procedurally.
import { TAU, ellipse } from './util.js';
import { drawItem } from './worlds.js';

export const HERO = { x: 480, y: 412, scale: 1.25, basketX: 340, basketY: [205, 305] };

const C = {
  spikeA: '#8d5a2b', spikeB: '#4a2c14', spikeLine: '#2e1a0b',
  face: '#f2d29f', outline: '#2b1a0c',
  suit: '#2b3d6b', suitDark: '#1a2647', belt: '#e7a92a',
  scarf: '#d8283a', scarfDark: '#a31b2b', scarfHi: '#f2606c',
  wrap: '#ece6d6', sandal: '#3b2a1f',
};

function stroke(ctx, w, col) { ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); }

function scarfTails(ctx, t, speed) {
  const tails = [[0.9, 0.8, C.scarfDark, 11], [0, 1, C.scarf, 14]];
  for (const [ph, len, col, w] of tails) {
    const N = 12, pts = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const x = 28 + s * 105 * len;
      const y = -96 + s * 22 + Math.sin(t * (6 + speed * 6) + ph * 3 - s * 5) * (8 + speed * 6) * s;
      pts.push([x, y, (w * (1 - s * 0.45)) / 2]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1] - pts[0][2]);
    for (const p of pts) ctx.lineTo(p[0], p[1] - p[2]);
    const e = pts[N];
    ctx.lineTo(e[0] - 6, e[1]);
    for (let i = N; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1] + pts[i][2]);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  }
}

function spikes(ctx) {
  const cx = 14, cy = -112, n = 9, a0 = -2.55, a1 = 0.9, bend = 0.34, r0 = 40;
  const g = ctx.createLinearGradient(-40, -210, 120, -40);
  g.addColorStop(0, C.spikeA); g.addColorStop(1, C.spikeB);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (i / (n - 1));
    const half = ((a1 - a0) / (n - 1)) * 0.62;
    const L = 96 + (i % 2 ? -12 : 6) - (i === 0 ? 22 : 0) - (i === n - 1 ? 18 : 0);
    const p1 = [cx + Math.cos(a - half) * r0, cy + Math.sin(a - half) * r0];
    const tip = [cx + Math.cos(a + bend) * L, cy + Math.sin(a + bend) * L];
    const p2 = [cx + Math.cos(a + half) * r0, cy + Math.sin(a + half) * r0];
    ctx.lineTo(p1[0], p1[1]);
    ctx.quadraticCurveTo(cx + Math.cos(a - half * 0.2) * L * 0.62, cy + Math.sin(a - half * 0.2) * L * 0.62, tip[0], tip[1]);
    ctx.quadraticCurveTo(cx + Math.cos(a + half + bend * 0.5) * L * 0.55, cy + Math.sin(a + half + bend * 0.5) * L * 0.55, p2[0], p2[1]);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  stroke(ctx, 5, C.spikeLine);
  ctx.fillStyle = g;
  ctx.fill();
  // highlight streaks
  ctx.strokeStyle = 'rgba(214,160,100,.55)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (let i = 1; i < n - 1; i += 2) {
    const a = a0 + (a1 - a0) * (i / (n - 1));
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 46, cy + Math.sin(a) * 46);
    ctx.quadraticCurveTo(cx + Math.cos(a + 0.1) * 62, cy + Math.sin(a + 0.1) * 62, cx + Math.cos(a + bend * 0.7) * 76, cy + Math.sin(a + bend * 0.7) * 76);
    ctx.stroke();
  }
}

function basket(ctx, bx, by, squash) {
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(1 + squash * 0.14, 1 - squash * 0.16);
  ctx.beginPath();
  ctx.moveTo(-38, 0);
  ctx.quadraticCurveTo(-35, 34, 0, 36);
  ctx.quadraticCurveTo(35, 34, 38, 0);
  ctx.closePath();
  ctx.fillStyle = '#c98d3e';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(94,58,20,.55)';
  ctx.lineWidth = 2;
  for (let x = -42; x <= 42; x += 9) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x * 0.7, 40); ctx.stroke(); }
  for (let y = 9; y < 36; y += 9) { ctx.beginPath(); ctx.moveTo(-42, y); ctx.lineTo(42, y); ctx.stroke(); }
  ctx.restore();
  stroke(ctx, 3, '#5e3a14');
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-38, 0); ctx.lineTo(38, 0);
  stroke(ctx, 10, '#5e3a14');
  stroke(ctx, 6, '#e7b56a');
  ctx.restore();
}

function arm(ctx, sx, sy, hx, hy, low, back) {
  const ex = low ? (sx + hx) / 2 + 4 : hx + 10;
  const ey = low ? Math.max(sy, hy) + 16 : sy - 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(ex, ey, hx, hy);
  stroke(ctx, 17, C.outline);
  stroke(ctx, 12.5, back ? C.suitDark : C.suit);
  // wrist wrap
  ctx.beginPath(); ctx.arc(hx, hy, 8.5, 0, TAU);
  ctx.fillStyle = C.face; ctx.fill();
  stroke(ctx, 2.5, C.outline);
}

/**
 * o: { x, y, left (facing left), low, t, blink, squash, sad, speed (0..1 dash), item: {kind}|null, scale }
 */
export function drawHero(ctx, o) {
  const s = HERO.scale * (o.scale || 1);
  const t = o.t;
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(o.left ? s : -s, s);
  const bob = Math.sin(t * 5) * 1.2;

  const bx = (HERO.basketX - HERO.x) / HERO.scale;
  const by = ((o.low ? HERO.basketY[1] : HERO.basketY[0]) - HERO.y) / HERO.scale;

  scarfTails(ctx, t, o.speed || 0);

  // back arm (behind body)
  arm(ctx, 14, -74 + bob, bx + 20, by + 16, o.low, true);

  ctx.save();
  ctx.translate(0, bob);
  spikes(ctx);

  // legs + sandals
  for (const lx of [-27, 7]) {
    ctx.fillStyle = C.suit;
    ctx.beginPath(); ctx.rect(lx, -32 - bob, 20, 30); stroke(ctx, 4, C.outline); ctx.fill();
    ctx.strokeStyle = C.wrap; ctx.lineWidth = 3;
    for (let y = -24; y < -4; y += 7) { ctx.beginPath(); ctx.moveTo(lx + 1, y - bob); ctx.lineTo(lx + 19, y - 3 - bob); ctx.stroke(); }
  }
  ctx.fillStyle = C.sandal;
  ellipse(ctx, -20, -2 - bob, 16, 7); ctx.fill();
  ellipse(ctx, 18, -2 - bob, 15, 7); ctx.fill();

  // torso
  ellipse(ctx, 4, -60, 38, 42);
  stroke(ctx, 5, C.outline);
  ctx.fillStyle = C.suit; ctx.fill();
  ctx.save();
  ellipse(ctx, 4, -60, 38, 42); ctx.clip();
  ctx.fillStyle = C.belt; ctx.fillRect(-40, -44, 90, 9);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ellipse(ctx, -12, -72, 14, 20, 0.3); ctx.fill();
  ctx.restore();

  // ear (behind head)
  ctx.beginPath(); ctx.arc(10, -156, 10, 0, TAU);
  stroke(ctx, 4, C.outline); ctx.fillStyle = '#e8b98a'; ctx.fill();
  ctx.beginPath(); ctx.arc(10, -156, 5, 0, TAU); ctx.fillStyle = '#e59a8a'; ctx.fill();

  // head + snout: outline pass then fill pass so the outline only shows outside
  ellipse(ctx, -12, -124, 42, 38); stroke(ctx, 5, C.outline);
  ellipse(ctx, -42, -112, 21, 15, -0.08); stroke(ctx, 5, C.outline);
  ctx.fillStyle = C.face;
  ellipse(ctx, -12, -124, 42, 38); ctx.fill();
  ellipse(ctx, -42, -112, 21, 15, -0.08); ctx.fill();

  // front fringe spikes over forehead
  ctx.fillStyle = C.spikeA;
  ctx.beginPath();
  ctx.moveTo(-34, -152); ctx.quadraticCurveTo(-36, -170, -24, -182); ctx.quadraticCurveTo(-22, -166, -14, -158);
  ctx.quadraticCurveTo(-10, -178, 6, -188); ctx.quadraticCurveTo(0, -170, 6, -158);
  ctx.lineTo(10, -150); ctx.quadraticCurveTo(-12, -164, -34, -152);
  ctx.closePath();
  stroke(ctx, 3.5, C.outline);
  ctx.fill();

  // nose
  ctx.beginPath(); ctx.arc(-62, -115, 7, 0, TAU); ctx.fillStyle = '#1b1b1b'; ctx.fill();
  ctx.beginPath(); ctx.arc(-64, -117, 2.2, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();

  // blush
  ctx.fillStyle = 'rgba(240,120,110,.45)'; ellipse(ctx, -32, -106, 8, 4.5); ctx.fill();

  // eye
  const blink = o.blink;
  if (blink) {
    ctx.beginPath(); ctx.moveTo(-36, -129); ctx.quadraticCurveTo(-26, -123, -16, -129);
    stroke(ctx, 3.5, C.outline);
  } else if (o.sad) {
    ctx.beginPath(); ctx.moveTo(-34, -136); ctx.lineTo(-20, -128); ctx.lineTo(-34, -120);
    stroke(ctx, 4, C.outline);
  } else {
    ellipse(ctx, -25, -130, 10.5, 13.5); ctx.fillStyle = '#ffffff'; ctx.fill(); stroke(ctx, 2.5, C.outline);
    ellipse(ctx, -27.5, -129, 7.5, 10); ctx.fillStyle = '#2f86d8'; ctx.fill();
    ellipse(ctx, -28.5, -128, 4.2, 6.2); ctx.fillStyle = '#0e1a33'; ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-31, -134, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-24, -123, 1.5, 0, TAU); ctx.fill();
  }
  // eyebrow
  ctx.beginPath();
  if (o.sad) { ctx.moveTo(-38, -149); ctx.lineTo(-16, -153); }
  else { ctx.moveTo(-39, -146); ctx.lineTo(-15, -152); }
  ctx.lineCap = 'round';
  stroke(ctx, 5, '#4a2c14');

  // mouth
  ctx.beginPath();
  if (o.sad) { ellipse(ctx, -44, -100, 4, 5); ctx.fillStyle = '#5a1a1a'; ctx.fill(); }
  else {
    ctx.moveTo(-54, -103); ctx.quadraticCurveTo(-46, -95, -36, -100);
    stroke(ctx, 3, C.outline);
  }

  // scarf around neck + clan badge
  ctx.beginPath(); ctx.moveTo(-36, -99); ctx.quadraticCurveTo(-2, -84, 32, -96);
  ctx.lineCap = 'round';
  stroke(ctx, 18, C.outline);
  stroke(ctx, 14, C.scarf);
  ctx.beginPath(); ctx.moveTo(-30, -101); ctx.quadraticCurveTo(-2, -89, 26, -100);
  stroke(ctx, 3, C.scarfHi);
  ctx.beginPath(); ctx.arc(30, -96, 8.5, 0, TAU); ctx.fillStyle = C.scarfDark; ctx.fill(); stroke(ctx, 2.5, C.outline);
  ctx.beginPath(); ctx.arc(-20, -92, 7.5, 0, TAU); ctx.fillStyle = '#f5c542'; ctx.fill(); stroke(ctx, 2, '#9a6b12');
  ctx.fillStyle = C.scarfDark;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 2 : 4.6;
    ctx.lineTo(-20 + Math.cos(a) * r, -92 + Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // caught item sits in the basket
  if (o.item) {
    ctx.save();
    ctx.scale(o.left ? 1 : -1, 1);
    drawItem(ctx, o.item.kind, (o.left ? 1 : -1) * bx, by - 6, 13, 0, t);
    ctx.restore();
  }
  basket(ctx, bx, by, o.squash || 0);

  // front arm over basket rim
  arm(ctx, -6, -72 + bob, bx + 32, by + 2, o.low, false);

  ctx.restore();
}

export function drawAura(ctx, x, y, t, strength) {
  const r = 150 + Math.sin(t * 8) * 8;
  const g = ctx.createRadialGradient(x, y - 110, 20, x, y - 110, r);
  g.addColorStop(0, `rgba(110,210,255,${0.38 * strength})`);
  g.addColorStop(1, 'rgba(110,210,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y - 110, r, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(170,235,255,${0.7 * strength})`;
  for (let i = 0; i < 8; i++) {
    const p = (t * 0.9 + i / 8) % 1;
    const px = x + Math.sin(i * 2.3 + t * 2) * 70 * (1 - p * 0.4);
    const py = y - 20 - p * 230;
    ctx.globalAlpha = (1 - p) * strength;
    ellipse(ctx, px, py, 4, 10 * (1 - p) + 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawSpot(ctx, x, y, col) {
  const g = ctx.createRadialGradient(x, y - 100, 20, x, y - 100, 190);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 200, y - 300, 400, 330);
}

// ---------- Havran, the crow ninja ----------
export function drawBoss(ctx, x, y, t, throwP, hitP, hpFrac) {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 2) * 4);
  // cloud platform
  ctx.fillStyle = 'rgba(235,242,255,.85)';
  for (const [cx, r] of [[-40, 16], [-16, 22], [12, 20], [38, 15]]) { ctx.beginPath(); ctx.arc(cx, 52, r, 0, TAU); ctx.fill(); }
  // wings
  const spread = 0.3 + throwP * 0.9;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.rotate(-spread * 0.5);
    ctx.fillStyle = '#16132b';
    ctx.beginPath();
    ctx.moveTo(12, -10);
    ctx.quadraticCurveTo(60, -40, 92, -18);
    ctx.lineTo(78, -8); ctx.lineTo(90, 2); ctx.lineTo(72, 8); ctx.lineTo(80, 18); ctx.lineTo(56, 18);
    ctx.quadraticCurveTo(30, 20, 14, 18);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // cloak
  ctx.fillStyle = '#2a2445';
  ctx.beginPath(); ctx.moveTo(0, -24); ctx.quadraticCurveTo(-42, 10, -36, 46); ctx.lineTo(36, 46); ctx.quadraticCurveTo(42, 10, 0, -24); ctx.fill();
  ctx.fillStyle = '#3b3263';
  ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(-16, 16, -12, 44); ctx.lineTo(12, 44); ctx.quadraticCurveTo(16, 16, 0, -14); ctx.fill();
  // head
  ctx.fillStyle = '#1b1930';
  ctx.beginPath(); ctx.arc(0, -36, 26, 0, TAU); ctx.fill();
  // headband
  ctx.fillStyle = '#8a1f33';
  ctx.fillRect(-26, -50, 52, 9);
  ctx.beginPath(); ctx.moveTo(22, -48);
  ctx.quadraticCurveTo(40, -52 + Math.sin(t * 7) * 5, 54, -42 + Math.sin(t * 7 + 1) * 6);
  ctx.lineTo(50, -38); ctx.quadraticCurveTo(38, -44, 22, -42); ctx.fill();
  // eyes
  ctx.fillStyle = '#ff3b3b';
  ctx.beginPath(); ctx.moveTo(-17, -36); ctx.lineTo(-5, -32); ctx.lineTo(-15, -29); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(17, -36); ctx.lineTo(5, -32); ctx.lineTo(15, -29); ctx.closePath(); ctx.fill();
  // beak
  ctx.fillStyle = '#f2a52b';
  ctx.beginPath(); ctx.moveTo(-9, -26); ctx.lineTo(9, -26); ctx.lineTo(0, -4 + throwP * 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#a8650f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-7, -21); ctx.lineTo(7, -21); ctx.stroke();
  if (hitP > 0) {
    ctx.globalAlpha = hitP * 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, -10, 50, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
