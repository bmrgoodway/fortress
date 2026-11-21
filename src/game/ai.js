// ===========================================================================
// 조준 계산 — 탄도를 여러 번 미리 날려 보고 목표에 가장 가까운 각도·파워를 찾습니다.
// ===========================================================================
import { WORLD, GRAVITY, WIND_ACC, muzzle } from './rules.js';

/** 한 발을 지형과 부딪힐 때까지 계산 (탱크는 무시) */
export function simulate(terrain, start, vel, spec, windV, maxFrames = 1400) {
  let x = start.x;
  let y = start.y;
  let vx = vel.vx;
  let vy = vel.vy;
  const pts = [{ x, y }];
  for (let i = 0; i < maxFrames; i++) {
    vy += GRAVITY * spec.grav;
    vx += windV * WIND_ACC * spec.wind;
    const sp = Math.hypot(vx, vy);
    const n = Math.max(1, Math.ceil(sp / 5));
    for (let s = 0; s < n; s++) {
      x += vx / n;
      y += vy / n;
      if (x < -40 || x > WORLD.w + 40 || y < -400) return { pts, impact: null };
      if (terrain.isSolid(x, y)) return { pts, impact: { x, y } };
      if (y > terrain.level.lava?.y && terrain.inLava(x, y)) return { pts, impact: { x, y } };
      if (y > WORLD.h + 120) return { pts, impact: null };
    }
    if (i % 5 === 0) pts.push({ x, y });
    if (pts.length > 600) break;
  }
  return { pts, impact: null };
}

export const DIFFICULTY = {
  easy: { label: '쉬움', errAngle: 11, errPower: 16, angleStep: 6, powerStep: 11, windKnow: 0.35, think: 0.9 },
  normal: { label: '보통', errAngle: 4.5, errPower: 7.5, angleStep: 3, powerStep: 6, windKnow: 0.8, think: 0.9 },
  hard: { label: '어려움', errAngle: 1.5, errPower: 2.6, angleStep: 1.5, powerStep: 3, windKnow: 1, think: 0.7 },
};

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

/**
 * AI 조준. angle: 지면 기준 각도(양수), power: 0~100
 */
export function chooseAim({ terrain, me, foe, type, wind, difficulty, seedJitter = 0 }) {
  const cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  const start = muzzle(me, type);
  const tx = foe.x;
  const ty = foe.y - 13;
  const knownWind = wind * cfg.windKnow;
  let best = null;

  for (let angle = 14; angle <= 86; angle += cfg.angleStep) {
    for (let power = 20; power <= 100; power += cfg.powerStep) {
      const v = 6.5 + (power / 100) * (type.vMax - 6.5);
      const a = (angle * Math.PI) / 180;
      const vel = { vx: Math.cos(a) * v * me.facing, vy: -Math.sin(a) * v };
      const r = simulate(terrain, start, vel, type, knownWind);
      if (!r.impact) continue;
      let dist = Math.hypot(r.impact.x - tx, r.impact.y - ty);
      // 자기 발밑을 때리는 후보는 크게 감점
      const self = Math.hypot(r.impact.x - me.x, r.impact.y - me.y);
      if (self < type.radius + 34) dist += 700;
      // 지형에 묻히지 않고 탱크에 직접 닿는 후보를 살짝 우대
      if (dist < 26) dist -= 22;
      if (!best || dist < best.dist) best = { dist, angle, power, impact: r.impact };
    }
  }
  if (!best) return { angle: 45 + seedJitter, power: 60 };

  // 난이도별 오차
  const noise = (gauss() * cfg.errAngle);
  const pNoise = gauss() * cfg.errPower;
  const angle = Math.max(8, Math.min(88, Math.round(best.angle + noise)));
  const power = Math.max(18, Math.min(100, Math.round(best.power + pNoise)));
  return { angle, power, dist: best.dist };
}
