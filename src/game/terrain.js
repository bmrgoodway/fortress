// ===========================================================================
// 지형 — 픽셀 마스크(1px) + 지형 캔버스. 포탄이 맞으면 원형으로 파입니다.
// ===========================================================================
import { WORLD } from './rules.js';

const W = WORLD.w;
const H = WORLD.h;

function hexRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Terrain {
  constructor(level, theme = 'day', seed = 1) {
    this.level = level;
    this.theme = theme;
    this.seed = seed;
    this.mask = new Uint8Array(W * H);
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.removed = 0;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.generate();
    this.repaint();
  }

  get palette() {
    return this.level.palettes[this.theme] || this.level.palettes.day;
  }

  idx(x, y) { return y * W + x; }

  isSolid(x, y) {
    const ix = x | 0;
    const iy = y | 0;
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return false;
    return this.mask[iy * W + ix] === 1;
  }

  /** 위에서 아래로 처음 만나는 단단한 지표. 없으면 -1 */
  surfaceY(x, fromY = 0) {
    const ix = Math.max(0, Math.min(W - 1, x | 0));
    for (let y = Math.max(0, fromY | 0); y < H; y++) if (this.mask[y * W + ix]) return y;
    return -1;
  }

  /** y 아래쪽에서 처음 만나는 지표 (탱크가 딛고 설 곳) */
  floorBelow(x, y) {
    const ix = Math.max(0, Math.min(W - 1, x | 0));
    const start = Math.max(0, Math.min(H - 1, Math.ceil(y)));
    for (let yy = start; yy < H; yy++) if (this.mask[yy * W + ix]) return yy;
    return -1;
  }

  fillRect(x0, x1, y0, y1) {
    const a = Math.max(0, Math.round(x0));
    const b = Math.min(W - 1, Math.round(x1));
    const c = Math.max(0, Math.round(y0));
    const d = Math.min(H - 1, Math.round(y1));
    for (let y = c; y <= d; y++) {
      const row = y * W;
      for (let x = a; x <= b; x++) this.mask[row + x] = 1;
    }
  }

  generate() {
    const { level } = this;
    const rng = mulberry32(1337 + (this.seed || 0) * 97);
    // 바닥 지형
    for (let x = 0; x < W; x++) {
      const sy = Math.round(level.shape(x));
      if (sy >= H) continue;
      for (let y = Math.max(0, sy); y < H; y++) this.mask[y * W + x] = 1;
    }
    // 떠 있는 발판
    for (const f of level.floats || []) {
      for (let x = f.x0; x <= f.x1; x++) {
        const edge = Math.min(x - f.x0, f.x1 - x);
        const wob = edge < 6 ? Math.round((6 - edge) * 0.6) : 0;
        const top = f.y0 + Math.round(Math.sin(x * 0.09) * f.jag * 0.5) + wob;
        const bot = f.y1 + Math.round(Math.cos(x * 0.07) * 3) - wob;
        for (let y = top; y <= bot && y < H; y++) this.mask[y * W + x] = 1;
      }
    }
    // 작은 바위 언덕 몇 개 (지형에 섞여 파괴 가능)
    if (level.id === 'valley' || level.id === 'cliffs') {
      for (let i = 0; i < 5; i++) {
        const cx = 120 + rng() * (W - 240);
        const sy = this.surfaceY(cx);
        if (sy < 0) continue;
        const r = 14 + rng() * 20;
        for (let x = cx - r; x <= cx + r; x++) {
          const dx = (x - cx) / r;
          const yy = sy - Math.cos(dx * 1.4) * r * 0.7;
          for (let y = Math.max(0, yy); y < H; y++) this.mask[y * W + (x | 0)] = 1;
        }
      }
    }
  }

  /** 마스크를 색으로 칠해 지형 캔버스를 다시 그립니다. */
  repaint() {
    const ctx = this.ctx;
    const p = this.palette;
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const [lr, lg, lb] = hexRgb(p.line);
    const [gr, gg, gb] = hexRgb(p.grass);
    const [g2r, g2g, g2b] = hexRgb(p.grass2);
    const [dr, dg, db] = hexRgb(p.dirt);
    const [d2r, d2g, d2b] = hexRgb(p.dirt2);
    const [rr, rg, rb] = hexRgb(p.rock);
    for (let x = 0; x < W; x++) {
      let sy = -1;
      for (let y = 0; y < H; y++) {
        if (this.mask[y * W + x]) { sy = y; break; }
      }
      if (sy < 0) continue;
      for (let y = sy; y < H; y++) {
        if (!this.mask[y * W + x]) continue;
        const depth = y - sy;
        let r, g, b;
        if (depth < 2) { r = lr; g = lg; b = lb; }
        else if (depth < 13) {
          const edge = depth < 5 || (x * 5 + y * 3) % 13 < 4;
          if (edge) { r = g2r; g = g2g; b = g2b; } else { r = gr; g = gg; b = gb; }
        } else if (depth < 28) {
          if (y % 9 === 0) { r = d2r; g = d2g; b = d2b; } else { r = dr; g = dg; b = db; }
        } else {
          const band = (y + x * 0.3) % 84;
          if (band < 5) { r = d2r; g = d2g; b = d2b; } else { r = rr; g = rg; b = rb; }
        }
        const o = (y * W + x) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // 지표 풀잎 몇 가닥
    ctx.strokeStyle = p.grass2;
    ctx.lineWidth = 2;
    for (let x = 6; x < W - 6; x += 13) {
      const sy = this.surfaceY(x);
      if (sy < 0 || sy < 4) continue;
      if ((x * 7) % 5 === 0) continue;
      ctx.beginPath();
      ctx.moveTo(x, sy);
      ctx.lineTo(x + 2, sy - 5);
      ctx.stroke();
    }
  }

  /** 원형 크레이터. 파낸 칸 수를 돌려줍니다. */
  crater(cx, cy, radius) {
    const r = Math.max(3, radius);
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(H - 1, Math.ceil(cy + r));
    const r2 = r * r;
    let removed = 0;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      const row = y * W;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2 && this.mask[row + x]) {
          this.mask[row + x] = 0;
          removed++;
        }
      }
    }
    const ctx = this.ctx;
    const surf = this.surfaceY(cx);
    const topY = Math.min(cy, surf < 0 ? cy : surf);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 지형에 닿은 쪽에만 그을음 테두리 + 파인 속(어두운 흙)
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const p = this.palette;
    const inside = ctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r * 1.05);
    inside.addColorStop(0, '#1a1109');
    inside.addColorStop(0.6, '#2c1f14');
    inside.addColorStop(1, p.rock);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, r * 0.97), 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = inside;
    ctx.fillRect(cx - r - 1, topY + 2, r * 2 + 2, r * 2 + (cy - topY) + 4);
    ctx.restore();
    const testR = r + 3;
    const ring = (rr, width, color, alpha) => {
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.beginPath();
      const step = Math.PI / 48;
      let open = false;
      for (let a = 0; a <= Math.PI * 2 + step; a += step) {
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (this.isSolid(cx + Math.cos(a) * testR, cy + Math.sin(a) * testR)) {
          if (!open) { ctx.moveTo(px, py); open = true; } else ctx.lineTo(px, py);
        } else if (open) {
          open = false;
        }
      }
      ctx.stroke();
    };
    ring(Math.max(1, r - 1), 3, p.line, 0.9);
    ring(r + 4, 9, '#241812', 0.25);
    ctx.restore();
    this.removed += removed;
    return removed;
  }

  inLava(x, y) {
    const l = this.level.lava;
    if (!l) return false;
    return y >= l.y && x >= l.x0 && x <= l.x1;
  }

  /** 탱크가 설 땅. 없으면 -1 */
  spawnGround(x) {
    const sy = this.surfaceY(x);
    return sy < 0 ? -1 : sy;
  }
}

export { W as TERRAIN_W, H as TERRAIN_H };
