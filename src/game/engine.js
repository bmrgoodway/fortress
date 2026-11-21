// ===========================================================================
// 게임 엔진 — 턴 진행 · 포탄 물리 · 지형 파괴 · 피해 · AI
// ===========================================================================
import {
  WORLD, GRAVITY, WIND_ACC, TURN_TIME,
  tankById, levelById, makeVolley, muzzle,
} from './rules.js';
import { Terrain } from './terrain.js';
import { chooseAim, simulate, DIFFICULTY } from './ai.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Game {
  constructor(opts) {
    this.mode = opts.mode === 'local' ? 'local' : 'ai';
    this.difficulty = opts.difficulty || 'normal';
    this.level = levelById(opts.level);
    this.theme = opts.theme === 'night' ? 'night' : 'day';
    this.timerOn = !!opts.timerOn;
    this.players = [
      this.makePlayer(0, opts.tanks?.[0] || 'cannon'),
      this.makePlayer(1, opts.tanks?.[1] || 'missile'),
    ];
    this.terrain = new Terrain(this.level, this.theme, Math.floor(rnd(1, 9999)));
    this.placeTanks();
    this.current = 0;
    this.turn = 1;
    this.wind = 0;
    this.phase = 'aim';
    this.over = false;
    this.winner = -1;
    this.turnLeft = TURN_TIME;
    this.chargeVal = 0;
    this.projectiles = [];
    this.effects = [];
    this.shake = 0;
    this.shotsLeft = 1;
    this.buff = { power: false, teleport: false };
    this.prev = [null, null];
    this.stats = [
      { shots: 0, hits: 0, dealt: 0 },
      { shots: 0, hits: 0, dealt: 0 },
    ];
    this.move = 0;
    this.moveTick = 0;
    this.resolveTimer = 0;
    this.flightTimer = 0;
    this.aiState = { stage: 'idle', t: 0, plan: null };
    this.eventSink = opts.onEvent || (() => {});
    this.guideCache = { key: '', pts: null };
    this.lastImpact = null;
    this.banner = '';
    this.newTurn(true);
  }

  makePlayer(idx, tankId) {
    const type = tankById(tankId);
    return {
      idx, type,
      hp: type.hp, maxHp: type.hp,
      x: 0, y: 0, vy: 0,
      angle: 45, facing: idx === 0 ? 1 : -1,
      power: 55, fuel: 100, alive: true,
      items: { double: true, power: true, teleport: true, repair: true },
      cause: '',
      slope: 0,
    };
  }

  placeTanks() {
    const [xa, xb] = this.level.spawn;
    const put = (p, x0, dir) => {
      let x = x0;
      for (let i = 0; i < 40; i++) {
        const gy = this.terrain.spawnGround(x);
        if (gy > 0) {
          p.x = x;
          p.y = gy;
          return;
        }
        x += dir * 20;
      }
      p.x = x0;
      p.y = 300;
    };
    put(this.players[0], xa, 1);
    put(this.players[1], xb, -1);
    this.players[0].angle = 45;
    this.players[1].angle = 45;
  }

  get me() { return this.players[this.current]; }
  get foe() { return this.players[1 - this.current]; }
  get cfg() { return DIFFICULTY[this.difficulty] || DIFFICULTY.normal; }

  emit(type, data = {}) { this.eventSink({ type, ...data }); }

  newTurn(first = false) {
    const p = this.me;
    p.fuel = p.type.fuel;
    p.power = first ? 55 : p.power;
    this.shotsLeft = 1;
    this.buff = { power: false, teleport: false };
    this.chargeVal = 0;
    this.turnLeft = TURN_TIME;
    this.phase = 'aim';
    this.move = 0;
    this.wind = Math.round(rnd(-1, 1) * this.level.windMax * 10) / 10;
    if (Math.abs(this.wind) < 1.2) this.wind = this.wind >= 0 ? 1.2 : -1.2;
    this.aiState = { stage: 'idle', t: 0, plan: null };
    this.guideCache = { key: '', pts: null };
    if (!first) this.emit('turn', { player: this.current });
  }

  turnLabel(i = this.current) {
    if (this.mode === 'local') return `${i + 1}P · ${this.players[i].type.name}`;
    return i === 0 ? `나 · ${this.players[i].type.name}` : `AI · ${this.players[i].type.name}`;
  }

  isAI(i = this.current) { return this.mode === 'ai' && i === 1; }

  // ── 조작 ──────────────────────────────────────────────────────────────────
  adjustAngle(d) {
    if (this.phase !== 'aim' || this.over) return;
    if (this.isAI()) return;
    this.me.angle = clamp(this.me.angle + d, 5, 89);
  }

  setMove(dir) {
    if (this.phase !== 'aim' || this.over || this.isAI()) { this.move = 0; return; }
    this.move = dir;
  }

  startCharge() {
    if (this.phase !== 'aim' || this.over || this.isAI()) return;
    this.phase = 'charge';
    this.chargeVal = 0;
    this.fullCharge = false;
    this.emit('charge');
  }

  releaseCharge() {
    if (this.phase !== 'charge' || this.over) return;
    const power = clamp(this.chargeVal, 8, 100);
    this.me.power = power;
    this.fire();
  }

  cancelCharge() {
    if (this.phase === 'charge' && this.chargeVal < 4) {
      this.phase = 'aim';
      this.chargeVal = 0;
    }
  }

  useItem(id) {
    const p = this.me;
    if (this.over || this.phase !== 'aim' || this.isAI()) return { ok: false, reason: '지금은 쓸 수 없습니다.' };
    if (!p.items[id]) return { ok: false, reason: '이미 사용했습니다.' };
    if (id === 'repair') {
      if (p.hp >= p.maxHp) return { ok: false, reason: '체력이 가득합니다.' };
      p.hp = Math.min(p.maxHp, p.hp + 30);
      p.items.repair = false;
      this.addEffect({ kind: 'heal', x: p.x, y: p.y - 24, t: 0, dur: 0.9 });
      this.floatText(p.x, p.y - 46, '+30', '#02c245');
      this.emit('repair', { player: this.current });
      return { ok: true, message: `수리키트 사용 · 체력 ${p.hp}` };
    }
    if (id === 'double') {
      p.items.double = false;
      this.shotsLeft = Math.max(this.shotsLeft, 2);
      return { ok: true, message: '더블샷 장전 · 이번 턴에 두 번 쏩니다.' };
    }
    if (id === 'power') {
      p.items.power = false;
      this.buff.power = true;
      return { ok: true, message: '파워업 장전 · 다음 포탄이 강해집니다.' };
    }
    if (id === 'teleport') {
      p.items.teleport = false;
      this.buff.teleport = true;
      return { ok: true, message: '순간이동탄 장전 · 착탄 지점으로 이동합니다.' };
    }
    return { ok: false, reason: '알 수 없는 아이템' };
  }

  // ── 발사 ──────────────────────────────────────────────────────────────────
  fire() {
    if (this.phase === 'over' || this.over) return;
    const p = this.me;
    const type = p.type;
    const start = muzzle(p, type);
    const volley = makeVolley(p, type, p.angle, p.power, this.buff);
    this.projectiles = volley.map((s, i) => ({
      ...s,
      owner: this.current,
      x: start.x + (i - (volley.length - 1) / 2) * 6,
      y: start.y,
      trail: [{ x: start.x, y: start.y }],
      life: 0,
      dead: false,
      spin: 0,
    }));
    this.prev[this.current] = { angle: p.angle, power: p.power };
    this.stats[this.current].shots++;
    this.phase = 'flight';
    this.flightTimer = 0;
    this.chargeVal = 0;
    this.lastImpact = null;
    this.emit('fire', { player: this.current, power: p.power, angle: p.angle });
  }

  // ── 매 프레임 ─────────────────────────────────────────────────────────────
  update(dt) {
    const d = Math.min(0.05, dt);
    this.updateEffects(d);
    this.shake = Math.max(0, this.shake - this.shake * d * 6 - d * 0.4);

    if (this.over) {
      this.settleTanks(d);
      return;
    }

    // 탱크 떨어짐 (지형이 사라졌을 때 · 허공)
    this.settleTanks(d);
    if (this.phase !== 'flight' && this.phase !== 'resolve') this.checkFalls();

    if (this.phase === 'aim' || this.phase === 'charge') {
      // 이동
      if (this.move) {
        this.moveTick += d;
        const step = this.me.type.move * 1.5;
        while (this.moveTick >= 1 / 60) {
          this.moveTick -= 1 / 60;
          this.moveStep(this.move, step);
        }
      } else {
        this.moveTick = 0;
      }
      // 차징
      if (this.phase === 'charge') {
        this.chargeVal = Math.min(100, this.chargeVal + d * 105);
        if (this.chargeVal >= 100 && !this.fullCharge) {
          this.fullCharge = true;
          this.emit('charge-full');
        }
      }
      // 턴 제한 시간
      if (this.timerOn) {
        this.turnLeft = Math.max(0, this.turnLeft - d);
        if (this.turnLeft <= 0) {
          if (this.phase === 'charge') this.releaseCharge();
          else { this.me.power = Math.max(45, this.me.power); this.fire(); }
        }
      }
      // AI
      if (this.isAI()) this.updateAI(d);
    } else if (this.phase === 'flight') {
      this.updateProjectiles(d);
      this.flightTimer += d;
      if (this.projectiles.length === 0) {
        this.phase = 'resolve';
        this.resolveTimer = 0.55;
        this.banner = '';
      }
      if (this.flightTimer > 12) {
        this.projectiles = [];
      }
    } else if (this.phase === 'resolve') {
      this.resolveTimer -= d;
      if (this.resolveTimer <= 0) this.afterVolley();
    }
  }

  updateEffects(d) {
    for (const e of this.effects) e.t += d;
    this.effects = this.effects.filter((e) => e.t < e.dur);
  }

  settleTanks(d) {
    for (const p of this.players) {
      if (!p.alive) continue;
      const gy = this.terrain.surfaceY(p.x);
      if (gy < 0) {
        p.vy += 0.62 * (d * 60);
        p.y += p.vy * (d * 60);
        if (p.y > WORLD.h + 90) this.kill(p, 'fall');
      } else if (p.y < gy - 1) {
        p.vy += 0.62 * (d * 60);
        p.y += p.vy * (d * 60);
        if (p.y >= gy) { p.y = gy; p.vy = 0; }
      } else if (p.y > gy) {
        p.y = gy;
        p.vy = 0;
      }
      if (this.terrain.inLava(p.x, p.y - 2)) this.kill(p, 'lava');
      // 경사
      const l = this.terrain.surfaceY(p.x - 10);
      const r = this.terrain.surfaceY(p.x + 10);
      p.slope = (l > 0 && r > 0) ? Math.atan2((r - l), 20) : 0;
    }
  }

  checkFalls() {
    const p = this.me;
    if (!p.alive) return;
    if (this.terrain.surfaceY(p.x) < 0 && p.y > WORLD.h + 60) this.kill(p, 'fall');
    if (this.terrain.inLava(p.x, p.y)) this.kill(p, 'lava');
  }

  moveStep(dir, step) {
    const p = this.me;
    if (p.fuel <= 0.5) { this.emit('no-fuel'); return; }
    const nx = clamp(p.x + dir * step, 28, WORLD.w - 28);
    const gy = this.terrain.spawnGround(nx);
    if (gy < 0) return;
    const rise = p.y - gy; // 오르막이면 +
    if (gy - p.y > 24) return;      // 발밑이 24px 넘게 꺼지면 못 감 (절벽·구덩이)
    if (rise > 20) return;          // 너무 가파른 벽
    const cost = step * (0.5 + Math.max(0, rise) * 0.075);
    if (p.fuel < cost) { p.fuel = 0; this.emit('no-fuel'); return; }
    p.fuel -= cost;
    p.x = nx;
    p.y = gy;
    p.facing = dir >= 0 ? 1 : -1;
  }

  updateProjectiles(d) {
    const alive = [];
    for (const pr of this.projectiles) {
      pr.life += d;
      let hit = false;
      const steps = 1;
      for (let s = 0; s < steps && !hit; s++) {
        pr.vy += GRAVITY * pr.grav * d * 60;
        pr.vx += this.wind * WIND_ACC * pr.wind * d * 60;
        const sp = Math.hypot(pr.vx, pr.vy);
        const n = Math.max(1, Math.ceil((sp * d * 60) / 5));
        for (let k = 0; k < n && !hit; k++) {
          pr.x += (pr.vx * d * 60) / n;
          pr.y += (pr.vy * d * 60) / n;
          if (pr.x < -60 || pr.x > WORLD.w + 60 || pr.y < -600) { hit = true; pr.dead = true; break; }
          // 용암
          if (this.terrain.inLava(pr.x, pr.y)) {
            this.explode(pr.x, Math.min(pr.y, this.level.lava.y), pr, true);
            hit = true; pr.dead = true; break;
          }
          // 지형
          if (this.terrain.isSolid(pr.x, pr.y)) {
            this.explode(pr.x, pr.y, pr, false);
            hit = true; pr.dead = true; break;
          }
          // 탱크
          for (const p of this.players) {
            if (!p.alive) continue;
            if (p.idx === pr.owner && pr.life < 0.18) continue;
            const bx = Math.abs(pr.x - p.x) < 27;
            const by = pr.y > p.y - 32 && pr.y < p.y + 5;
            if (bx && by) {
              this.explode(pr.x, pr.y, pr, false, p.idx);
              hit = true; pr.dead = true; break;
            }
          }
          if (hit) break;
          if (k % 2 === 0) {
            pr.trail.push({ x: pr.x, y: pr.y });
            if (pr.trail.length > 90) pr.trail.shift();
          }
        }
      }
      if (pr.y > WORLD.h + 160) pr.dead = true;
      if (!pr.dead) alive.push(pr);
    }
    this.projectiles = alive;
  }

  explode(x, y, pr, inLava, directHit = -1) {
    const owner = this.players[pr.owner];
    this.lastImpact = { x, y };
    // 순간이동탄: 파괴 없이 탱크가 그 자리로
    if (this.buff.teleport && pr.owner === this.current) {
      this.buff.teleport = false;
      const gy = this.terrain.spawnGround(x);
      if (gy > 0 && !this.terrain.inLava(x, gy) && gy - y < 200) {
        owner.x = clamp(x, 28, WORLD.w - 28);
        owner.y = gy;
        owner.vy = 0;
        this.addEffect({ kind: 'teleport', x, y, t: 0, dur: 0.8 });
        this.floatText(x, y - 40, '이동!', '#7e65c1');
        this.emit('teleport');
      } else {
        this.floatText(x, y - 40, '이동 불가', '#ff614a');
      }
      this.addEffect({ kind: 'puff', x, y, t: 0, dur: 0.5 });
      return;
    }

    const radius = pr.radius;
    if (!inLava) this.terrain.crater(x, y, radius);
    this.addEffect({ kind: 'explosion', x, y, r: radius, t: 0, dur: 0.6 });
    this.shake = Math.max(this.shake, Math.min(26, radius * 0.34));
    this.emit('explode', { big: radius > 50, lava: inLava, x, y, owner: pr.owner });

    for (let i = 0; i < (radius > 50 ? 20 : 12); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(40, radius * 4);
      this.addEffect({
        kind: 'spark', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(20, 120),
        t: 0, dur: rnd(0.35, 0.8), size: rnd(1.5, 4),
        color: inLava ? '#ffb347' : (Math.random() < 0.5 ? '#ffdc1a' : '#ff614a'),
      });
    }

    for (const p of this.players) {
      if (!p.alive) continue;
      const cx = p.x;
      const cy = p.y - 15;
      const dist = Math.hypot(cx - x, cy - y);
      if (dist > radius + 16) continue;
      let dmg = pr.damage * (1 - 0.5 * clamp(dist / (radius + 16), 0, 1));
      if (directHit === p.idx || dist < 20) dmg = pr.damage;
      dmg = Math.round(dmg);
      p.hp = Math.max(0, p.hp - dmg);
      this.stats[pr.owner].hits++;
      this.stats[pr.owner].dealt += dmg;
      this.floatText(cx, p.y - 44, `-${dmg}`, p.idx === 0 ? '#ff614a' : '#ffdc1a');
      this.emit('hit', { player: p.idx, dmg });
      if (p.hp <= 0) this.kill(p, 'hit');
    }
  }

  kill(p, cause) {
    if (!p.alive) return;
    p.alive = false;
    p.cause = cause;
    p.hp = 0;
    this.addEffect({ kind: 'explosion', x: p.x, y: p.y - 12, r: 70, t: 0, dur: 0.8 });
    this.shake = Math.max(this.shake, 18);
    this.emit('kill', { player: p.idx, cause });
    this.checkOver();
  }

  checkOver() {
    const a = this.players[0].alive;
    const b = this.players[1].alive;
    if (a && b) return;
    this.over = true;
    this.phase = 'over';
    this.winner = a && !b ? 0 : b && !a ? 1 : -1;
    this.emit('end', { winner: this.winner });
  }

  afterVolley() {
    this.shotsLeft -= 1;
    this.buff.power = false;
    if (this.players.some((p) => !p.alive)) { this.checkOver(); return; }
    if (this.shotsLeft > 0) {
      this.phase = 'aim';
      this.chargeVal = 0;
      this.turnLeft = Math.max(this.turnLeft, 12);
      this.aiState = { stage: 'idle', t: 0, plan: null };
      this.emit('extra-shot', { player: this.current });
      return;
    }
    this.current = 1 - this.current;
    this.turn += 1;
    this.newTurn(false);
  }

  updateAI(d) {
    const ai = this.aiState;
    ai.t += d;
    const p = this.me;
    if (ai.stage === 'idle') {
      if (ai.t > 0.45) {
        ai.stage = 'plan';
        ai.t = 0;
        // 아이템 판단
        if (p.items.repair && p.hp <= p.maxHp * (this.difficulty === 'hard' ? 0.5 : 0.32)) {
          p.items.repair = false;
          p.hp = Math.min(p.maxHp, p.hp + 30);
          this.floatText(p.x, p.y - 44, '+30', '#02c245');
          this.emit('repair', { player: 1 });
        }
        const item = this.pickAiItem();
        if (item) this.useItemForAI(item);
        const t0 = performance.now();
        ai.plan = chooseAim({
          terrain: this.terrain, me: p, foe: this.foe, type: p.type,
          wind: this.wind, difficulty: this.difficulty,
        });
        this.aiPlanMs = Math.round(performance.now() - t0);
      }
      return;
    }
    if (ai.stage === 'plan') {
      ai.stage = 'aim';
      ai.t = 0;
      return;
    }
    if (ai.stage === 'aim') {
      const target = ai.plan.angle;
      const diff = target - p.angle;
      const step = this.cfg.angleStep * 8 * d * 6;
      p.angle = Math.abs(diff) < step ? target : p.angle + Math.sign(diff) * step;
      if (Math.abs(diff) < 0.6 || ai.t > 1.1) {
        p.angle = target;
        ai.stage = 'charge';
        ai.t = 0;
        this.phase = 'charge';
        this.chargeVal = 0;
      }
      return;
    }
    if (ai.stage === 'charge') {
      if (this.chargeVal >= ai.plan.power || ai.t > 1.8) {
        this.me.power = clamp(this.chargeVal, 8, 100);
        if (this.chargeVal < ai.plan.power - 7) this.me.power = ai.plan.power;
        ai.stage = 'done';
        this.fire();
        this.emit('ai-fired', { angle: this.me.angle, power: this.me.power });
      }
    }
  }

  pickAiItem() {
    const p = this.me;
    const r = Math.random();
    if (p.items.power && r < (this.difficulty === 'hard' ? 0.65 : 0.3)) return 'power';
    if (p.items.teleport && this.difficulty !== 'easy' && r < 0.35 && this.hpGap() < -30) return 'teleport';
    if (p.items.double && r < 0.22) return 'double';
    return null;
  }

  useItemForAI(id) {
    const p = this.me;
    if (!p.items[id]) return;
    if (id === 'power') { p.items.power = false; this.buff.power = true; }
    if (id === 'teleport') { p.items.teleport = false; this.buff.teleport = true; }
    if (id === 'double') { p.items.double = false; this.shotsLeft = 2; }
  }

  hpGap() { return this.me.hp - this.foe.hp; }

  // ── 효과 ──────────────────────────────────────────────────────────────────
  addEffect(e) { this.effects.push(e); if (this.effects.length > 380) this.effects.shift(); }

  floatText(x, y, text, color) {
    this.addEffect({ kind: 'text', x, y, text, color, t: 0, dur: 1.1 });
  }

  // 이전 턴 발사 궤적 (조준 가이드)
  guideArc() {
    const p = this.me;
    const prev = this.prev[this.current];
    if (!prev) return null;
    const key = `${this.current}:${prev.angle}:${prev.power}:${this.wind.toFixed(1)}:${p.x.toFixed(0)}:${p.y.toFixed(0)}`;
    if (this.guideCache.key === key) return this.guideCache.pts;
    const start = muzzle(p, p.type);
    const v = 6.5 + (prev.power / 100) * (p.type.vMax - 6.5);
    const a = (prev.angle * Math.PI) / 180;
    const r = simulate(this.terrain, start, { vx: Math.cos(a) * v * p.facing, vy: -Math.sin(a) * v }, p.type, this.wind);
    this.guideCache = { key, pts: r.pts };
    return r.pts;
  }

  cameraFocus() {
    if (this.phase === 'flight' && this.projectiles.length) {
      const pr = this.projectiles[0];
      return { x: pr.x, y: pr.y };
    }
    if (this.phase === 'resolve' && this.lastImpact) return { x: this.lastImpact.x, y: this.lastImpact.y };
    const p = this.me;
    return { x: p.x, y: p.y - 40 };
  }
}
