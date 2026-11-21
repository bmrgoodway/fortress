// ===========================================================================
// 효과음 — Web Audio API 로 그 자리에서 합성합니다. (음원 파일 없음)
// ===========================================================================
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = false;
    this.whistle = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  noise(dur) {
    const ctx = this.ctx;
    if (!this.noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 1.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(g);
    src.start(0);
    src.stop(ctx.currentTime + dur + 0.05);
    return { src, g };
  }

  tone({ f = 440, to = f, dur = 0.15, type = 'sine', gain = 0.18, delay = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  play(name) {
    if (this.muted) return;
    if (!this.ensure()) return;
    const ctx = this.ctx;
    if (!ctx) return;
    switch (name) {
      case 'click':
        this.tone({ f: 660, to: 520, dur: 0.06, type: 'square', gain: 0.07 });
        break;
      case 'charge':
        this.tone({ f: 220, to: 420, dur: 0.09, type: 'triangle', gain: 0.05 });
        break;
      case 'fire': {
        this.tone({ f: 180, to: 48, dur: 0.22, type: 'sawtooth', gain: 0.24 });
        const n = this.noise(0.18);
        const t = ctx.currentTime;
        n.g.gain.setValueAtTime(0.28, t);
        n.g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(1800, t);
        f.frequency.exponentialRampToValueAtTime(200, t + 0.18);
        n.src.disconnect();
        n.src.connect(f);
        f.connect(n.g);
        n.g.connect(this.master);
        break;
      }
      case 'explode': {
        const n = this.noise(0.7);
        const t = ctx.currentTime;
        n.g.gain.setValueAtTime(0.5, t);
        n.g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(1400, t);
        f.frequency.exponentialRampToValueAtTime(90, t + 0.6);
        n.src.disconnect();
        n.src.connect(f);
        f.connect(n.g);
        n.g.connect(this.master);
        this.tone({ f: 110, to: 34, dur: 0.5, type: 'sine', gain: 0.35 });
        break;
      }
      case 'hit':
        this.tone({ f: 320, to: 180, dur: 0.16, type: 'square', gain: 0.14 });
        break;
      case 'repair':
        this.tone({ f: 520, to: 780, dur: 0.18, type: 'triangle', gain: 0.12 });
        this.tone({ f: 780, to: 1040, dur: 0.16, type: 'triangle', gain: 0.1, delay: 0.1 });
        break;
      case 'teleport':
        this.tone({ f: 300, to: 1200, dur: 0.24, type: 'sine', gain: 0.12 });
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ f, dur: 0.26, type: 'square', gain: 0.13, delay: i * 0.14 }));
        this.tone({ f: 1568, dur: 0.5, type: 'triangle', gain: 0.1, delay: 0.62 });
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => this.tone({ f, dur: 0.3, type: 'triangle', gain: 0.12, delay: i * 0.17 }));
        break;
      default:
        break;
    }
  }

  whistleStart() {
    if (this.muted) return;
    if (!this.ensure()) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 1200;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + 0.08);
    o.connect(g);
    g.connect(this.master);
    o.start();
    this.whistle = { o, g };
  }

  whistleUpdate(speed) {
    if (!this.whistle) return;
    const f = Math.max(300, Math.min(1500, 1400 - speed * 26));
    this.whistle.o.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.03);
  }

  whistleStop() {
    if (!this.whistle) return;
    const { o, g } = this.whistle;
    try {
      g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.03);
      o.stop(this.ctx.currentTime + 0.12);
    } catch { /* already stopped */ }
    this.whistle = null;
  }
}
