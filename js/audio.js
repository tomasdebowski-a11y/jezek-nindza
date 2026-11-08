// Web Audio synthesizer: sound effects + a beat-synchronised music sequencer.
import { rng, clamp } from './util.js';

export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // Let iPhone play sound even with the ring/silent switch on (Safari 16.4+)
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) {
      try { this.ctx = new AC(); } catch (e2) { return; }
    }
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 4;
    this.comp.connect(c.destination);
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.comp);

    this.musicLP = c.createBiquadFilter();
    this.musicLP.type = 'lowpass';
    this.musicLP.frequency.value = 18000;
    this.musicGain = c.createGain();
    this.musicGain.gain.value = this.musicOn ? 0.5 : 0;
    this.musicGain.connect(this.musicLP);
    this.musicLP.connect(this.master);

    this.sfxGain = c.createGain();
    this.sfxGain.gain.value = this.sfxOn ? 0.75 : 0;
    this.sfxGain.connect(this.master);

    this.verb = c.createConvolver();
    this.verb.buffer = this.impulse(2.4);
    this.verbGain = c.createGain();
    this.verbGain.gain.value = 0.3;
    this.verb.connect(this.verbGain);
    this.verbGain.connect(this.master);

    const nb = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // iOS unlock: play a silent buffer inside the gesture
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, 22050);
    s.connect(c.destination);
    s.start(0);
    if (c.state !== 'running') c.resume().catch(() => {});
  }

  impulse(sec) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return b;
  }

  get ok() { return !!this.ctx && this.ctx.state === 'running'; }

  setMusic(on) {
    this.musicOn = on;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.05);
  }
  setSfx(on) {
    this.sfxOn = on;
    if (this.ctx) this.sfxGain.gain.setTargetAtTime(on ? 0.75 : 0, this.ctx.currentTime, 0.05);
  }
  muffle(on) {
    if (!this.ctx) return;
    this.musicLP.frequency.setTargetAtTime(on ? 700 : 18000, this.ctx.currentTime, 0.08);
  }

  // ---------- primitive voices ----------
  voice({ t, f, dur, type = 'square', vol = 0.1, a = 0.006, bus, detune = 0, lp = null, slide = null, vib = 0, verb = 0 }) {
    const c = this.ctx;
    dur = Math.max(dur, a + 0.02);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    o.detune.value = detune;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = 5.5;
      lg.gain.value = vib;
      l.connect(lg); lg.connect(o.frequency);
      l.start(t); l.stop(t + dur + 0.05);
    }
    if (lp) {
      const fl = c.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(lp[0], t);
      if (lp[1]) fl.frequency.exponentialRampToValueAtTime(lp[1], t + dur);
      fl.Q.value = lp[2] || 1;
      node.connect(fl); node = fl;
    }
    node.connect(g);
    g.connect(bus);
    if (verb) {
      const sg = c.createGain();
      sg.gain.value = verb;
      g.connect(sg); sg.connect(this.verb);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ t, dur, vol, hp = 0, lp = 0, lpEnd = 0, bp = 0, bus }) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    let n = s;
    if (hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; n.connect(f); n = f; }
    if (bp) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = 1.5; n.connect(f); n = f; }
    if (lp) {
      const f = c.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(lp, t);
      if (lpEnd) f.frequency.exponentialRampToValueAtTime(lpEnd, t + dur);
      n.connect(f); n = f;
    }
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(g); g.connect(bus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  kick(t, vol, bus) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + 0.32);
  }
  snare(t, vol, bus) {
    this.noise({ t, dur: 0.16, vol, hp: 1300, bus });
    this.voice({ t, f: 190, dur: 0.08, type: 'triangle', vol: vol * 0.6, bus });
  }
  hat(t, vol, open, bus) { this.noise({ t, dur: open ? 0.16 : 0.035, vol, hp: 7000, bus }); }

  // ---------- sound effects ----------
  sfx(fn) {
    if (!this.ok || !this.sfxOn) return;
    try { fn(this.ctx.currentTime + 0.004, this.sfxGain); } catch (e) { /* ignore */ }
  }
  catch(combo) {
    this.sfx((t, b) => {
      const pent = [0, 2, 4, 7, 9];
      const i = clamp(combo - 1, 0, 14);
      const n = 72 + pent[i % 5] + 12 * Math.floor(i / 5);
      this.voice({ t, f: mtof(n), dur: 0.12, type: 'square', vol: 0.06, bus: b, lp: [5000, 1500] });
      this.voice({ t: t + 0.04, f: mtof(n + 7), dur: 0.14, type: 'triangle', vol: 0.06, bus: b });
    });
  }
  gold() {
    this.sfx((t, b) => [0, 4, 7, 12, 16, 19].forEach((s, i) =>
      this.voice({ t: t + i * 0.045, f: mtof(79 + s), dur: 0.18, type: 'triangle', vol: 0.07, bus: b, verb: 0.5 })));
  }
  miss() {
    this.sfx((t, b) => {
      this.voice({ t, f: 330, slide: 70, dur: 0.45, type: 'triangle', vol: 0.22, bus: b });
      this.noise({ t: t + 0.05, dur: 0.25, vol: 0.3, lp: 500, bus: b });
    });
  }
  bomb() {
    this.sfx((t, b) => {
      this.kick(t, 1, b);
      this.noise({ t, dur: 0.7, vol: 0.55, lp: 2500, lpEnd: 150, bus: b });
    });
  }
  fizzle() { this.sfx((t, b) => this.noise({ t, dur: 0.3, vol: 0.07, hp: 2500, bus: b })); }
  dash() { this.sfx((t, b) => this.noise({ t, dur: 0.07, vol: 0.05, bp: 2600, bus: b })); }
  click() { this.sfx((t, b) => this.voice({ t, f: 880, dur: 0.05, type: 'square', vol: 0.04, bus: b })); }
  power() {
    this.sfx((t, b) => {
      this.voice({ t, f: 180, slide: 1400, dur: 0.55, type: 'sawtooth', vol: 0.06, bus: b, lp: [1500, 6000] });
      [0, 7, 12, 19, 24].forEach((s, i) => this.voice({ t: t + 0.1 + i * 0.06, f: mtof(76 + s), dur: 0.2, type: 'square', vol: 0.04, bus: b, verb: 0.4 }));
    });
  }
  bossHit() {
    this.sfx((t, b) => {
      this.voice({ t, f: 240, slide: 110, dur: 0.16, type: 'square', vol: 0.07, bus: b });
      this.noise({ t, dur: 0.06, vol: 0.1, hp: 4000, bus: b });
    });
  }
  fanfare() {
    this.sfx((t, b) => {
      const mel = [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [79, 0.6], [84, 0.72]];
      mel.forEach(([n, d]) => this.voice({ t: t + d, f: mtof(n), dur: 0.22, type: 'square', vol: 0.06, bus: b, verb: 0.4 }));
      [72, 76, 79, 84].forEach(n => this.voice({ t: t + 0.84, f: mtof(n), dur: 1.1, type: 'triangle', vol: 0.06, bus: b, verb: 0.6 }));
    });
  }
  gameOver() {
    this.sfx((t, b) => [67, 63, 60, 55].forEach((n, i) =>
      this.voice({ t: t + i * 0.22, f: mtof(n), dur: 0.3, type: 'triangle', vol: 0.09, bus: b, verb: 0.4 })));
  }
}

// ---------- music ----------
const pat = s => [...s].map(ch => ch !== '.');

const DRUMS = {
  pop:    { k: pat('x.......x.x.....'), s: pat('....x.......x...'), h: pat('x.x.x.x.x.x.x.x.'), kv: 0.8, sv: 0.32, hv: 0.1 },
  soft:   { k: pat('x.........x.....'), s: pat('............x...'), h: pat('..x...x...x...x.'), kv: 0.55, sv: 0.15, hv: 0.07 },
  sparse: { k: pat('x...............'), s: pat('................'), h: pat('........x.......'), kv: 0.6, sv: 0, hv: 0.06 },
  four:   { k: pat('x...x...x...x...'), s: pat('....x.......x...'), h: pat('..x...x...x...x.'), kv: 0.85, sv: 0.3, hv: 0.12, open: true },
  heavy:  { k: pat('x.x.....x.xx....'), s: pat('....x.......x...'), h: pat('xxxxxxxxxxxxxxxx'), kv: 0.95, sv: 0.38, hv: 0.07 },
  epic:   { k: pat('x.....x.x.....x.'), s: pat('....x.......x..x'), h: pat('x.x.x.x.x.x.x.x.'), kv: 0.9, sv: 0.34, hv: 0.09 },
};

// bass: step -> [length in 16ths, octave, fifth]
const BASS = {
  pop:    { 0: [2, 0], 3: [1, 1], 6: [2, 0, 1], 8: [2, 0], 11: [1, 1], 14: [2, 0, 1] },
  soft:   { 0: [6, 0], 8: [4, 0, 1], 12: [4, 1] },
  sparse: { 0: [16, 0] },
  four:   { 0: [2, 0], 2: [2, 1], 4: [2, 0], 6: [2, 1], 8: [2, 0], 10: [2, 1], 12: [2, 0], 14: [2, 1] },
  heavy:  Object.fromEntries([...Array(16)].map((_, i) => [i, [1, 0, i % 4 === 3 ? 1 : 0]])),
  epic:   { 0: [3, 0], 3: [3, 0], 6: [2, 0, 1], 8: [3, 0], 11: [3, 1], 14: [2, 0, 1] },
};

const RHYTHMS = {
  bouncy: [[0, 2, 4, 6, 8, 10, 12], [0, 3, 6, 8, 12, 14], [0, 4, 6, 7, 8, 12], [0, 2, 3, 4, 8, 10, 11, 12]],
  calm:   [[0, 6, 8], [0, 4, 8, 12], [0, 8, 10], [2, 8, 14]],
  sparse: [[0, 8], [0, 6], [4, 12], [0, 10]],
  drive:  [[0, 2, 4, 6, 8, 10, 12, 14], [0, 3, 6, 8, 11, 14], [0, 2, 3, 6, 8, 10, 12]],
  epic:   [[0, 4, 6, 8, 12], [0, 3, 6, 8, 12, 14], [0, 2, 4, 8, 12, 13, 14]],
};

export class Music {
  constructor(sound) {
    this.s = sound;
    this.def = null;
    this.layers = 1;   // 1 = bass+drums, 2 = +melody, 3 = +arpeggio (power mode)
    this.danger = false;
  }

  setWorld(def) {
    if (this.def === def) return;
    this.def = def;
    this.generate();
  }

  generate() {
    const d = this.def, R = rng(d.seed);
    const scale = d.scale, ext = [];
    for (let o = -1; o < 3; o++) for (const s of scale) ext.push(s + 12 * o);
    const lo = scale.length, hi = scale.length * 3;
    const rhythms = RHYTHMS[d.rhythm];
    this.mel = [];
    let deg = lo + 2;
    for (let bar = 0; bar < 4; bar++) {
      const r = rhythms[Math.floor(R() * rhythms.length)];
      const chord = d.prog[bar];
      for (let s = 0; s < 16; s++) {
        if (!r.includes(s)) { this.mel.push(null); continue; }
        if (s % 4 === 0) {
          const cands = [];
          for (let i = lo; i <= hi; i++) if (chord.some(c => (((ext[i] - c) % 12) + 12) % 12 === 0)) cands.push(i);
          cands.sort((a, b) => Math.abs(a - deg) - Math.abs(b - deg));
          deg = cands[Math.floor(R() * Math.min(2, cands.length))];
        } else {
          deg = clamp(deg + Math.floor(R() * 5) - 2, lo, hi);
        }
        const next = r.find(x => x > s);
        this.mel.push({ n: ext[deg], len: (next === undefined ? 16 : next) - s });
      }
    }
  }

  // Schedule one beat (= one game tick = 4 sixteenth notes) starting at audio time t
  scheduleBeat(beat, t, dur) {
    const s = this.s, d = this.def;
    if (!s.ok || !d) return;
    const bus = s.musicGain, st = dur / 4;
    const bar = Math.floor(beat / 4) % 4;
    const chord = d.prog[bar];
    const root = d.root;
    const dp = DRUMS[d.drums], bp = BASS[d.bass];
    try {
      for (let i = 0; i < 4; i++) {
        const step = (beat % 4) * 4 + i;
        const tt = t + i * st;
        if (dp.k[step]) s.kick(tt, dp.kv, bus);
        if (this.layers >= 1 && dp.s[step] && dp.sv) s.snare(tt, dp.sv, bus);
        if (this.layers >= 1 && dp.h[step]) s.hat(tt, dp.hv, dp.open, bus);
        const b = bp[step];
        if (b) {
          const note = root - 24 + chord[0] + b[1] * 12 + (b[2] ? 7 : 0);
          s.voice({ t: tt, f: mtof(note), dur: st * b[0] * 0.92, type: d.bassType, vol: d.bassVol || 0.2, bus,
            lp: d.bassType === 'sawtooth' ? [1100, 220, 4] : null });
        }
        if (d.pad && step === 0) {
          chord.forEach((c, ci) => s.voice({ t: tt, f: mtof(root + c), dur: dur * 4 * 0.98, type: 'triangle',
            vol: 0.035, a: Math.min(dur * 1.2, 0.8), bus, verb: 0.6, detune: ci * 5 - 5 }));
        }
        if (this.layers >= 2) {
          const m = this.mel[bar * 16 + step];
          if (m) s.voice({ t: tt, f: mtof(root + 12 + m.n), dur: Math.min(st * m.len * 0.9, 0.9), type: d.lead,
            vol: d.leadVol, a: 0.01, vib: d.vib || 0, bus, verb: 0.3, lp: d.leadLP || null });
        }
        if (this.layers >= 3) {
          const c = chord[step % chord.length] + (step % 8 >= 4 ? 12 : 0);
          s.voice({ t: tt, f: mtof(root + 24 + c), dur: st * 0.8, type: 'square', vol: 0.03, bus, lp: [3200, 900] });
        }
        if (this.danger && (step === 0 || step === 3)) {
          s.voice({ t: tt, f: 55, dur: 0.2, type: 'sine', vol: 0.3, bus });
        }
      }
    } catch (e) { /* audio node limits — skip this beat */ }
  }
}
