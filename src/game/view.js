// ===========================================================================
// 화면 그리기 — 캔버스 · 카메라 · 탱크 · 포탄 · 폭발 · 이전 조준 가이드
// ===========================================================================
import { WORLD, GRAVITY, TANK, WIND_ACC } from './rules.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class View {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this.w = 0;
    this.h = 0;
    this.scale = 1;
    this.camX = WORLD.w / 2;
    this.camY = 0;
    this.ghosts = [];
    this.prevProj = 0;
    this.stars = Array.from({ length: 70 }, (_, i) => ({
      x: (i * 197.3) % WORLD.w,
      y: 20 + ((i * 91.7) % 260),
      r: 0.7 + ((i * 13) % 5) / 6,
    }));
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(200, Math.round(rect.width));
    const h = Math.max(160, Math.round(rect.height));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
  }

  computeCamera(dt) {
    const { w, h } = this;
    const g = this.game;
    const mobile = w < 680;
    let scale;
    let focusX;
    if (mobile) {
      scale = Math.min(h / WORLD.h, 0.85);
      focusX = g.cameraFocus().x;
    } else {
      scale = Math.min(w / WORLD.w, h / WORLD.h);
      focusX = g.cameraFocus().x;
    }
    this.scale = scale;
    const visW = w / scale;
    const visH = h / scale;
    const targetX = visW >= WORLD.w ? WORLD.w / 2 : clamp(focusX, visW / 2, WORLD.w - visW / 2);
    const targetY = WORLD.h - visH;
    const k = Math.min(1, dt * (this.game.phase === 'flight' ? 7 : 5));
    this.camX += (targetX - this.camX) * k;
    this.camY += (targetY - this.camY) * k;
  }

  worldTransform(ctx) {
    const s = this.scale;
    const shakeX = (Math.random() - 0.5) * this.game.shake;
    const shakeY = (Math.random() - 0.5) * this.game.shake;
    ctx.setTransform(this.dpr * s, 0, 0, this.dpr * s, this.dpr * (this.w / 2 - this.camX * s + shakeX), this.dpr * (-this.camY * s + shakeY));
  }

  draw(dt) {
    const g = this.game;
    this.resize();
    this.computeCamera(dt);
    const ctx = this.ctx;
    const { w, h } = this;
    const pal = g.terrain.palette;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // 하늘
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, pal.sky1);
    sky.addColorStop(1, pal.sky2);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const night = g.theme === 'night';
    if (night) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const st of this.stars) {
        const x = ((st.x - this.camX * this.scale * 0.15) % w + w) % w;
        ctx.beginPath();
        ctx.arc(x, st.y * this.scale * 0.9, st.r, 0, 7);
        ctx.fill();
      }
    }
    // 해 / 달
    ctx.save();
    const sunX = w * 0.82;
    const sunY = h * 0.16;
    ctx.fillStyle = pal.sun;
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sunX, sunY, night ? 24 : 34, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 구름 (낮 화면)
    if (!night) {
      ctx.save();
      const cloud = (wx, wy, s) => {
        const cx = (wx - this.camX * 0.35) * this.scale + w / 2;
        const cy = (wy - this.camY) * this.scale;
        if (cx < -120 || cx > w + 120) return;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = pal.line;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 34 * s, cy);
        ctx.arc(cx - 22 * s, cy - 6 * s, 14 * s, Math.PI * 0.5, Math.PI * 1.5);
        ctx.arc(cx - 3 * s, cy - 14 * s, 18 * s, Math.PI * 1.02, Math.PI * 1.95);
        ctx.arc(cx + 17 * s, cy - 6 * s, 15 * s, Math.PI * 1.25, Math.PI * 0.4);
        ctx.lineTo(cx + 34 * s, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      };
      cloud(260, 120, 1.1);
      cloud(760, 70, 0.8);
      cloud(1180, 150, 1.3);
      cloud(1480, 90, 0.7);
      ctx.restore();
    }

    // 원경 언덕 + 아래쪽 깊이감 (세계 좌표 기준)
    const horizon = (430 - this.camY) * this.scale;
    const amp = Math.max(0.5, this.scale) * 3.4;
    ctx.save();
    ctx.fillStyle = pal.far;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= w; x += 20) {
      const wx = (x + this.camX * this.scale * 0.3) * 0.9;
      const y = horizon - (10 + 14 * Math.sin(wx * 0.004)) * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, horizon);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.far2;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= w; x += 16) {
      const wx = (x + this.camX * this.scale * 0.55) * 0.8;
      const y = horizon - (6 + 9 * Math.sin(wx * 0.006 + 2)) * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, horizon);
    ctx.closePath();
    ctx.fill();
    // 골짜기·허끝의 깊이감
    const depth = ctx.createLinearGradient(0, horizon, 0, h);
    depth.addColorStop(0, 'rgba(10,16,28,0.05)');
    depth.addColorStop(1, night ? 'rgba(2,5,12,0.72)' : 'rgba(12,24,36,0.45)');
    ctx.fillStyle = depth;
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.restore();

    // 세계 좌표
    this.worldTransform(ctx);
    ctx.drawImage(g.terrain.canvas, 0, 0);
    if (g.level.lava) this.drawLava(ctx, g);
    this.drawGuide(ctx, g);
    this.drawGhostTrails(ctx, dt);
    this.drawTanks(ctx, g);
    this.drawProjectiles(ctx, g);
    this.drawEffects(ctx, g);
    this.drawOffscreen(ctx, g);
  }

  drawOffscreen(ctx, g) {
    const { w, h } = this;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const p of g.players) {
      if (!p.alive) continue;
      const px = (p.x - this.camX) * this.scale + w / 2;
      const py = (p.y - this.camY) * this.scale - 26;
      if (px >= 10 && px <= w - 10) continue;
      const left = px < 0;
      const cx = left ? 12 : w - 12;
      const cy = Math.max(44, Math.min(h - 30, py));
      ctx.fillStyle = p.idx === g.current ? '#ffdc1a' : '#fffdf6';
      ctx.strokeStyle = '#0a0d14';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (left) {
        ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy - 9); ctx.lineTo(cx + 8, cy + 9);
      } else {
        ctx.moveTo(cx + 8, cy); ctx.lineTo(cx - 8, cy - 9); ctx.lineTo(cx - 8, cy + 9);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0a0d14';
      ctx.font = '800 10px "Pretendard Variable", Pretendard, system-ui, sans-serif';
      ctx.textAlign = left ? 'left' : 'right';
      ctx.textBaseline = 'top';
      const label = p.idx === g.current ? p.type.name : `${p.type.name} ${Math.round(Math.abs(p.x - g.me.x))}`;
      ctx.fillText(label, left ? cx + 12 : cx - 12, cy + 10);
    }
    ctx.restore();
  }

  drawLava(ctx, g) {
    const l = g.level.lava;
    const t = performance.now() / 1000;
    const pal = g.terrain.palette;
    ctx.save();
    ctx.beginPath();
    ctx.rect(l.x0, l.y, l.x1 - l.x0, WORLD.h - l.y);
    ctx.clip();
    const grd = ctx.createLinearGradient(0, l.y, 0, WORLD.h);
    grd.addColorStop(0, '#ffce54');
    grd.addColorStop(0.25, '#ff8a3d');
    grd.addColorStop(0.7, '#e0401f');
    grd.addColorStop(1, '#7a1408');
    ctx.fillStyle = grd;
    ctx.fillRect(l.x0, l.y, l.x1 - l.x0, WORLD.h - l.y);
    // 물결
    ctx.strokeStyle = 'rgba(255,244,196,0.75)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let x = l.x0; x <= l.x1; x += 8) {
        const y = l.y + 3 + k * 10 + Math.sin(x * 0.03 + t * (1.4 + k * 0.5)) * 3;
        if (x === l.x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    // 열기
    ctx.save();
    ctx.globalAlpha = 0.24 + Math.sin(t * 2.4) * 0.05;
    const glow = ctx.createLinearGradient(0, l.y - 70, 0, l.y);
    glow.addColorStop(0, 'rgba(255,120,40,0)');
    glow.addColorStop(1, 'rgba(255,150,60,0.8)');
    ctx.fillStyle = glow;
    ctx.fillRect(l.x0, l.y - 70, l.x1 - l.x0, 70);
    ctx.restore();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(l.x0, l.y);
    ctx.lineTo(l.x1, l.y);
    ctx.stroke();
  }

  drawGuide(ctx, g) {
    if (g.phase !== 'aim' && g.phase !== 'charge') return;
    const pts = g.guideArc();
    if (!pts || pts.length < 3) return;
    const p = g.me;
    const prev = g.prev[g.current];
    ctx.save();
    ctx.setLineDash([5, 9]);
    ctx.strokeStyle = 'rgba(255,220,26,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // 이전 각도 표시 (화면 기준 크기)
    const end = pts[Math.min(pts.length - 1, 8)];
    ctx.restore();
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const px = (p.x - this.camX) * this.scale + this.w / 2;
    const py = (p.y - this.camY) * this.scale;
    const label = `이전 ${Math.round(prev.angle)}° · ${Math.round(prev.power)}%`;
    ctx.font = '700 11px "Pretendard Variable", Pretendard, system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    const labelY = Math.max(16, py - 100);
    ctx.fillStyle = 'rgba(10,13,20,0.84)';
    ctx.fillRect(px - tw / 2 - 6, labelY, tw + 12, 18);
    ctx.fillStyle = '#ffdc1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px, labelY + 9);
    ctx.restore();
    if (end) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(end.x, end.y, Math.max(2, 3 / this.scale), 0, 7);
      ctx.fillStyle = 'rgba(255,220,26,0.5)';
      ctx.fill();
      ctx.restore();
    }
  }

  drawGhostTrails(ctx, dt) {
    const g = this.game;
    if (g.projectiles.length < this.prevProj) {
      for (const pr of this.lastTrails || []) this.ghosts.push({ pts: pr.slice(), t: 0 });
    }
    this.lastTrails = g.projectiles.map((p) => p.trail);
    this.prevProj = g.projectiles.length;
    this.ghosts = this.ghosts.filter((gh) => gh.t < 1.4);
    for (const gh of this.ghosts) {
      gh.t += dt;
      const a = Math.max(0, 1 - gh.t / 1.4) * 0.55;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#fff6d8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      gh.pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
      ctx.stroke();
      ctx.restore();
    }
  }

  drawTanks(ctx, g) {
    for (const p of g.players) this.drawTank(ctx, p, p.idx === g.current && !g.over);
  }

  drawTank(ctx, p, active) {
    const type = p.type;
    const pal = this.game.terrain.palette;
    const line = pal.line;
    const x = p.x;
    const y = p.y;
    ctx.save();
    ctx.translate(x, y);
    if (!p.alive) {
      ctx.globalAlpha = 0.45;
    }
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(-29, -3, 58, 5);
    // 몸체 (경사에 맞춰 살짝 기울임)
    ctx.rotate(clamp(p.slope, -0.5, 0.5) * 0.7);
    // 무한궤도
    ctx.fillStyle = '#12161f';
    ctx.fillRect(-28, -13, 56, 13);
    ctx.fillStyle = '#3b4354';
    for (let i = -22; i <= 22; i += 11) ctx.fillRect(i - 2, -11, 4, 8);
    // 차체
    ctx.fillStyle = type.color;
    ctx.fillRect(-24, -31, 48, 18);
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.strokeRect(-24, -31, 48, 18);
    // 무늬
    ctx.fillStyle = type.light;
    ctx.fillRect(-17, -27, 14, 5);
    ctx.fillRect(6, -27, 11, 5);
    ctx.restore();

    // 포신 (경사와 무관)
    const a = (p.angle * Math.PI) / 180;
    const bx = x + Math.cos(a) * TANK.barrel * p.facing;
    const by = y - TANK.turretY - Math.sin(a) * TANK.barrel;
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = line;
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(x, y - TANK.turretY); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = p.alive ? type.light : '#999';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x, y - TANK.turretY); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = type.color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - TANK.turretY); ctx.lineTo(bx, by); ctx.stroke();
    // 포탑
    ctx.fillStyle = p.alive ? type.light : '#bbb';
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - TANK.turretY, 11, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (!p.alive) {
      // 잔해
      ctx.fillStyle = '#2a2f3a';
      ctx.fillRect(x - 18, y - 10, 14, 10);
      ctx.fillRect(x + 7, y - 7, 10, 7);
      return;
    }

    // 이름·체력 바는 화면 기준 크기로 (줌과 상관없이 읽히게)
    const hp = p.hp / p.maxHp;
    const S = this.scale;
    const px = (x - this.camX) * S + this.w / 2;
    const py = (y - this.camY) * S;
    if (px < -90 || px > this.w + 90) return;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const bw = 62;
    const bh = 7;
    const barY = py - 44;
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(px - bw / 2 - 2, barY - 2, bw + 4, bh + 4);
    ctx.fillStyle = '#3a1020';
    ctx.fillRect(px - bw / 2, barY, bw, bh);
    ctx.fillStyle = hp > 0.55 ? '#02c245' : hp > 0.28 ? '#ffdc1a' : '#ff614a';
    ctx.fillRect(px - bw / 2, barY, bw * hp, bh);
    ctx.font = '800 11px "Pretendard Variable", Pretendard, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(10,13,20,0.6)';
    ctx.strokeText(type.name, px, barY - 4);
    ctx.fillStyle = active ? '#ffdc1a' : '#fff';
    ctx.fillText(type.name, px, barY - 4);
    if (active) {
      const bob = Math.sin(performance.now() / 220) * 3;
      ctx.fillStyle = '#ffdc1a';
      ctx.strokeStyle = '#0a0d14';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px - 9, barY - 22 + bob);
      ctx.lineTo(px + 9, barY - 22 + bob);
      ctx.lineTo(px, barY - 12 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawProjectiles(ctx, g) {
    const rs = Math.max(7, 4.5 / this.scale);
    for (const pr of g.projectiles) {
      const type = g.players[pr.owner].type;
      ctx.save();
      // 궤적 잔상
      if (pr.trail.length > 1) {
        for (let i = 1; i < pr.trail.length; i++) {
          const a = (i / pr.trail.length) * 0.8;
          ctx.globalAlpha = a;
          ctx.strokeStyle = pr.type === 'ion' ? '#d9d0ff' : '#fff3c4';
          ctx.lineWidth = Math.max(1.5, 2 / this.scale) * (0.4 + i / pr.trail.length);
          ctx.beginPath();
          ctx.moveTo(pr.trail[i - 1].x, pr.trail[i - 1].y);
          ctx.lineTo(pr.trail[i].x, pr.trail[i].y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      if (pr.type === 'ion') {
        const sp = Math.hypot(pr.vx, pr.vy) || 1;
        ctx.strokeStyle = type.color;
        ctx.lineWidth = Math.max(4, 3 / this.scale);
        ctx.beginPath();
        ctx.moveTo(pr.x, pr.y);
        ctx.lineTo(pr.x - (pr.vx / sp) * 34, pr.y - (pr.vy / sp) * 34);
        ctx.stroke();
      }
      ctx.fillStyle = type.color;
      ctx.strokeStyle = '#0a0d14';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.type === 'ion' ? rs * 0.72 : rs, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(pr.x - rs * 0.25, pr.y - rs * 0.25, rs * 0.28, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  }

  drawEffects(ctx, g) {
    for (const e of g.effects) {
      const k = e.t / e.dur;
      if (e.kind === 'explosion') {
        ctx.save();
        const r = e.r * (0.35 + k * 1.15);
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.fillStyle = '#fff6d8';
        ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.55, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffdc1a';
        ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.78, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff8a3d';
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, 7); ctx.fill();
        ctx.strokeStyle = '#0a0d14';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, 7); ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'spark') {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2, e.size, e.size);
        ctx.restore();
      } else if (e.kind === 'text') {
        ctx.save();
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        const px = (e.x - this.camX) * this.scale + this.w / 2;
        const py = (e.y - this.camY) * this.scale - k * 32;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.font = '900 19px "Pretendard Variable", Pretendard, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(10,13,20,0.7)';
        ctx.strokeText(e.text, px, py);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text, px, py);
        ctx.restore();
      } else if (e.kind === 'heal') {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.strokeStyle = '#02c245';
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + k * 3;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(a) * (14 + k * 26), e.y + Math.sin(a) * (14 + k * 26));
          ctx.lineTo(e.x + Math.cos(a) * (20 + k * 26), e.y + Math.sin(a) * (20 + k * 26));
          ctx.stroke();
        }
        ctx.restore();
      } else if (e.kind === 'teleport' || e.kind === 'puff') {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.strokeStyle = '#d9d0ff';
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(e.x, e.y, 10 + i * 12 + k * 40, 0, 7);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // 탄도 예측점 (아주 짧게, 조준 감각용)
    const g2 = g;
    if ((g2.phase === 'aim' || g2.phase === 'charge') && !g2.isAI()) {
      const p = g2.me;
      if (!p.alive) return;
      const a = (p.angle * Math.PI) / 180;
      const pw = g2.phase === 'charge' ? g2.chargeVal : p.power;
      const v = 6.5 + (pw / 100) * (p.type.vMax - 6.5);
      let x = p.x + Math.cos(a) * (TANK.barrel + 6) * p.facing;
      let y = p.y - TANK.turretY - Math.sin(a) * (TANK.barrel + 6);
      let vx = Math.cos(a) * v * p.facing;
      let vy = -Math.sin(a) * v;
      const dot = Math.max(2, 3 / this.scale);
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 26; i++) {
        vy += GRAVITY * p.type.grav;
        vx += g2.wind * WIND_ACC * p.type.wind;
        x += vx * 1.1;
        y += vy * 1.1;
        if (i % 3 === 0) ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
        if (g2.terrain.isSolid(x, y)) break;
      }
      ctx.restore();
    }
  }
}
