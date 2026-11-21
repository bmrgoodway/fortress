// ===========================================================================
// 포트리스 · 게임 규칙 값 (탱크 · 아이템 · 전장)
// 수치는 여기 한 곳에서만 고칩니다.
// ===========================================================================

export const WORLD = { w: 1600, h: 720 };
export const GRAVITY = 0.32;          // px / frame² (60fps 기준)
export const WIND_ACC = 0.018;        // 바람 1m/s 가 포탄에 주는 가속
export const TANK = { w: 56, h: 30, turretY: 22, barrel: 34 };
export const HP_MAX = { min: 80, max: 160 };
export const FUEL_MAX = 100;
export const TURN_TIME = 30;          // 초

// ── 탱크 4종 ───────────────────────────────────────────────────────────────
export const TANKS = [
  {
    id: 'cannon', name: '캐논', en: 'CANNON', mark: 'C',
    color: '#ff614a', dark: '#a52d1c', light: '#ffd9d2',
    hp: 132, fuel: 72, move: 1.35,
    shots: 1, damage: 42, radius: 66, vMax: 21, wind: 1, grav: 1, spread: 0,
    tagline: '한 방이 무겁다',
    desc: '묵직한 단발 고폭탄. 착탄하면 지형을 크게 파냅니다.',
    stat: { 화력: 5, 지형: 5, 기동: 2, 사거리: 4 },
  },
  {
    id: 'missile', name: '미사일', en: 'MISSILE', mark: 'M',
    color: '#0abbee', dark: '#066a8c', light: '#d3f2ff',
    hp: 112, fuel: 94, move: 1.7,
    shots: 2, damage: 21, radius: 36, vMax: 23, wind: 0.42, grav: 1, spread: 2.4,
    tagline: '바람을 덜 탄다',
    desc: '쌍발 정밀탄. 바람의 영향을 적게 받아 조준이 안정적입니다.',
    stat: { 화력: 3, 지형: 3, 기동: 4, 사거리: 4 },
  },
  {
    id: 'carrot', name: '캐롯', en: 'CARROT', mark: 'K',
    color: '#ff8a3d', dark: '#a34a12', light: '#ffe3c9',
    hp: 120, fuel: 86, move: 1.6,
    shots: 3, damage: 14, radius: 44, vMax: 20, wind: 1.15, grav: 1, spread: 9,
    tagline: '세 갈래로 흩뿌린다',
    desc: '3발 분산 포물선탄. 넓은 범위를 한꺼번에 두드립니다.',
    stat: { 화력: 2, 지형: 4, 기동: 3, 사거리: 3 },
  },
  {
    id: 'ion', name: '레이저', en: 'ION', mark: 'I',
    color: '#7e65c1', dark: '#4a3585', light: '#e2dcff',
    hp: 100, fuel: 104, move: 1.9,
    shots: 1, damage: 34, radius: 30, vMax: 31, wind: 0.12, grav: 0.35, spread: 0,
    tagline: '곧게 꽂히는 광선',
    desc: '빠른 직선형 에너지탄. 탄도가 낮아 절벽 너머는 어렵습니다.',
    stat: { 화력: 4, 지형: 2, 기동: 5, 사거리: 2 },
  },
];

export const tankById = (id) => TANKS.find((t) => t.id === id) || TANKS[0];

// ── 전술 아이템 4종 ────────────────────────────────────────────────────────
export const ITEMS = [
  { id: 'double', name: '더블샷', icon: '✌', desc: '이번 턴에 한 발 더 쏩니다.' },
  { id: 'power', name: '파워업', icon: '⚡', desc: '다음 포탄의 피해·파괴력이 커집니다.' },
  { id: 'teleport', name: '순간이동탄', icon: '✳', desc: '착탄 지점으로 탱크가 이동합니다.' },
  { id: 'repair', name: '수리키트', icon: '✚', desc: '체력을 30 회복합니다. (턴 소모 없음)' },
];

// ── 전장 4종 ───────────────────────────────────────────────────────────────
// palette: day / night 두 벌. terrain.js 가 지형 캔버스를 그릴 때 씁니다.
export const LEVELS = [
  {
    id: 'valley', name: '초원 계곡', en: 'GRASSLAND VALLEY', icon: '🌿',
    hint: '완만한 언덕과 가운데 골짜기. 첫 대전에 알맞습니다.',
    spawn: [320, 1280], lava: null, windMax: 9,
    palettes: {
      day: { sky1: '#7ed2ff', sky2: '#d8f4ff', sun: '#ffdc1a', far: '#a9dcb2', far2: '#7cc98c', grass: '#3fcf6a', grass2: '#2bb455', dirt: '#c0854b', dirt2: '#a56a35', rock: '#8a6644', line: '#0a0d14' },
      night: { sky1: '#101a34', sky2: '#1d2c4e', sun: '#fff4c4', far: '#1d3a34', far2: '#17332c', grass: '#2b9c58', grass2: '#218049', dirt: '#6b4a2c', dirt2: '#5a3c22', rock: '#4a3826', line: '#dbe8ff' },
    },
    // x 위치의 지표 높이 (숫자가 클수록 아래)
    shape(x) {
      const dip = 62 * Math.exp(-Math.pow((x - 800) / 300, 2));
      return 452 + 34 * Math.sin(x * 0.0042) + 20 * Math.sin(x * 0.011 + 1.7) + 9 * Math.sin(x * 0.031 + 0.4) + dip;
    },
  },
  {
    id: 'cliffs', name: '쌍둥이 절벽', en: 'TWIN CLIFFS', icon: '⛰',
    hint: '양쪽 높은 절벽과 깊은 골. 각도를 크게 세워야 합니다.',
    spawn: [320, 1280], lava: null, windMax: 12,
    palettes: {
      day: { sky1: '#ffd89a', sky2: '#ffeccc', sun: '#ff8a3d', far: '#c9a98e', far2: '#a8886d', grass: '#a7c46a', grass2: '#8eae54', dirt: '#c0905e', dirt2: '#a3744a', rock: '#7d5c40', line: '#0a0d14' },
      night: { sky1: '#241a3a', sky2: '#3a2b52', sun: '#ffe6a8', far: '#3a2f45', far2: '#2e2537', grass: '#6f8f52', grass2: '#5b7843', dirt: '#6d5138', dirt2: '#5b422c', rock: '#493527', line: '#f0e6ff' },
    },
    shape(x) {
      const wall = (edge, dir) => {
        const d = (x - edge) * dir;
        if (d <= 0) return 336;
        if (d > 70) return 700;
        return 336 + (d / 70) * 364; // 완만한 절벽면
      };
      if (x < 560) return wall(500, 1) + 4 * Math.sin(x * 0.06);
      if (x > 1040) return wall(1100, -1) + 4 * Math.sin(x * 0.06);
      return 690 + 10 * Math.sin(x * 0.02);
    },
  },
  {
    id: 'bridge', name: '하늘 다리', en: 'SKY BRIDGE', icon: '🌉',
    hint: '가운데 다리가 부서지면 아래는 낙사. 다리를 노려 보세요.',
    spawn: [320, 1280], lava: null, windMax: 14,
    palettes: {
      day: { sky1: '#0f7fd0', sky2: '#a9e4ff', sun: '#fff1a8', far: '#8fc7e8', far2: '#6fb3d8', grass: '#5fd0c0', grass2: '#3fb6a6', dirt: '#9aa6b8', dirt2: '#7f8b9d', rock: '#67748a', line: '#0a0d14' },
      night: { sky1: '#071229', sky2: '#12294a', sun: '#e8f4ff', far: '#16324a', far2: '#112838', grass: '#2e8f87', grass2: '#237470', dirt: '#46536a', dirt2: '#38445a', rock: '#2b3648', line: '#dff0ff' },
    },
    shape(x) {
      if (x < 520) return 330 + 5 * Math.sin(x * 0.05);
      if (x < 580) return 330 + ((x - 520) / 60) * 90;
      if (x > 1080) return 330 + 5 * Math.sin(x * 0.05);
      if (x > 1020) return 330 + ((1080 - x) / 60) * 90;
      return 760; // 골짜기 바닥은 화면 밖(없음)
    },
    // 지표 위에 떠 있는 발판 (파괴 가능)
    floats: [
      { x0: 590, x1: 1010, y0: 420, y1: 482, jag: 9 },
      { x0: 556, x1: 614, y0: 518, y1: 550, jag: 4 },
      { x0: 986, x1: 1044, y0: 518, y1: 550, jag: 4 },
    ],
  },
  {
    id: 'lava', name: '용암 협곡', en: 'LAVA CANYON', icon: '🌋',
    hint: '아래는 용암. 떨어지면 끝장이니 발밑을 조심하세요.',
    spawn: [320, 1280], lava: { y: 610, x0: 500, x1: 1100 }, windMax: 11,
    palettes: {
      day: { sky1: '#4a1526', sky2: '#a4383a', sun: '#ff9a3d', far: '#6b2a2f', far2: '#4e1d24', grass: '#84603a', grass2: '#6b4a2c', dirt: '#6a4432', dirt2: '#573526', rock: '#402a20', line: '#1a0b08' },
      night: { sky1: '#1a0710', sky2: '#3d1119', sun: '#ff6a2a', far: '#33101a', far2: '#230a11', grass: '#5a4028', grass2: '#49331f', dirt: '#4a2f22', dirt2: '#3a241a', rock: '#2a1a14', line: '#ffd9c2' },
    },
    shape(x) {
      if (x < 470) return 344 + 6 * Math.sin(x * 0.05);
      if (x < 540) return 344 + ((x - 470) / 70) * 300;
      if (x > 1130) return 344 + 6 * Math.sin(x * 0.05);
      if (x > 1060) return 344 + ((1130 - x) / 70) * 300;
      return 700 + 12 * Math.sin(x * 0.02) + 6 * Math.sin(x * 0.07);
    },
  },
];

export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];

// ── 탄도 계산 (엔진·AI 공용) ───────────────────────────────────────────────
export function muzzle(tank, type) {
  const a = (tank.angle * Math.PI) / 180;
  const px = tank.x + Math.cos(a) * TANK.barrel * tank.facing;
  const py = tank.y - TANK.turretY - Math.sin(a) * TANK.barrel;
  return { x: px, y: py };
}

export function shotVelocity(tank, type, angle, power) {
  const v = 6.5 + (Math.max(0, Math.min(100, power)) / 100) * (type.vMax - 6.5);
  const a = (angle * Math.PI) / 180;
  return { vx: Math.cos(a) * v * tank.facing, vy: -Math.sin(a) * v };
}

// 기본 파라미터를 가진 발사체 묶음 (한 번의 발사 = 한 묶음)
export function makeVolley(tank, type, angle, power, buff) {
  const base = shotVelocity(tank, type, angle, power);
  const shots = Math.max(1, type.shots || 1);
  const out = [];
  for (let i = 0; i < shots; i++) {
    const offset = shots === 1 ? 0 : (i - (shots - 1) / 2) * (type.spread * 2 / (shots - 1 || 1));
    const rad = ((angle + offset) * Math.PI) / 180;
    const v = Math.hypot(base.vx, base.vy) * (shots === 1 ? 1 : 1);
    out.push({
      x: 0, y: 0,
      vx: Math.cos(rad) * v * tank.facing,
      vy: -Math.sin(rad) * v,
      damage: type.damage * (buff && buff.power ? 1.55 : 1),
      radius: type.radius * (buff && buff.power ? 1.35 : 1),
      wind: type.wind, grav: type.grav,
      type: type.id,
    });
  }
  return out;
}
