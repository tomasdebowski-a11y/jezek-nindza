const KEY = 'jezek-nindza-v1';

const DEFAULTS = {
  unlocked: 1,          // highest world the player may start
  cleared: {},          // { "1": true, ... }
  bossBeaten: false,
  best: { A: 0, B: 0 }, // best run score per difficulty
  endlessBest: { A: 0, B: 0 },
  mode: 'A',
  music: true,
  sound: true,
};

function merge(base, extra) {
  for (const k in extra) {
    if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object') {
      merge(base[k], extra[k]);
    } else if (k in base) {
      base[k] = extra[k];
    }
  }
  return base;
}

export function load() {
  const d = JSON.parse(JSON.stringify(DEFAULTS));
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) merge(d, s);
  } catch (e) { /* storage unavailable */ }
  return d;
}

export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
}
