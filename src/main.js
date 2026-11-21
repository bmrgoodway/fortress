// ===========================================================================
// 포트리스 — 화면 · 조작 · 진행
// ===========================================================================
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './style.css';
import { TANKS, ITEMS, LEVELS, tankById } from './game/rules.js';
import { Game } from './game/engine.js';
import { View } from './game/view.js';
import { Sfx } from './game/audio.js';
import { local } from './store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const sfx = new Sfx();
const state = {
  mode: 'ai',
  difficulty: 'normal',
  levelId: 'random',
  tanks: ['cannon', 'missile'],
  pick: 0,
  theme: local.get('theme', 'day'),
  muted: local.get('muted', false),
  timerOn: local.get('timer', false),
  game: null,
  view: null,
  raf: 0,
  last: 0,
  overShown: false,
  overTimer: 0,
  bannerTimer: 0,
  toastTimer: 0,
};
const held = new Set();
const keys = new Set();

// ── 공통 UI ────────────────────────────────────────────────────────────────
const SCREENS = { menu: $('#scrMenu'), select: $('#scrSelect'), game: $('#scrGame'), over: $('#scrOver') };

function showScreen(name) {
  for (const [k, el] of Object.entries(SCREENS)) el.hidden = k !== name;
  document.body.classList.toggle('playing', name === 'game');
  if (name !== 'game') $('#topStats').hidden = true;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function toast(msg, ms = 1500) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  el.classList.add('on');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    el.classList.remove('on');
    setTimeout(() => { el.hidden = true; }, 200);
  }, ms);
}

function banner(main, sub = '') {
  const el = $('#turnBanner');
  el.querySelector('b').textContent = main;
  el.querySelector('small').textContent = sub;
  el.hidden = false;
  el.classList.add('on');
  clearTimeout(state.bannerTimer);
  state.bannerTimer = setTimeout(() => {
    el.classList.remove('on');
    setTimeout(() => { el.hidden = true; }, 250);
  }, 1150);
}

// ── 테마 · 소리 ────────────────────────────────────────────────────────────
function applyTheme(t) {
  state.theme = t;
  document.documentElement.dataset.theme = t;
  local.set('theme', t);
  const btn = $('#btnTheme');
  btn.setAttribute('aria-pressed', String(t === 'day'));
  btn.setAttribute('aria-label', t === 'day' ? '밤 화면으로' : '낮 화면으로');
  $('#themeIcon').textContent = t === 'day' ? '☾' : '☀';
  if (state.game) {
    state.game.theme = t;
    state.game.terrain.theme = t;
    state.game.terrain.repaint();
  }
}

function applySound(m) {
  state.muted = m;
  sfx.setMuted(m);
  local.set('muted', m);
  const btn = $('#btnSound');
  btn.setAttribute('aria-pressed', String(!m));
  btn.setAttribute('aria-label', m ? '효과음 꺼짐' : '효과음 켜짐');
  $('#soundIcon').textContent = m ? '×' : '♪';
}

$('#btnTheme').addEventListener('click', () => { sfx.play('click'); applyTheme(state.theme === 'day' ? 'night' : 'day'); });
$('#btnSound').addEventListener('click', () => {
  const next = !state.muted;
  if (!next) sfx.ensure();
  applySound(next);
  if (!next) sfx.play('click');
});

// ── 플레이 방법 ───────────────────────────────────────────────────────────
$('#btnHelp').addEventListener('click', () => {
  sfx.play('click');
  $('#helpDlg').showModal();
});
$('#helpClose').addEventListener('click', () => $('#helpDlg').close());
$('#helpDlg').addEventListener('click', (e) => { if (e.target === $('#helpDlg')) $('#helpDlg').close(); });

// ── 시작 화면 ─────────────────────────────────────────────────────────────
function renderFields() {
  const grid = $('#fieldGrid');
  grid.innerHTML = '';
  const all = [{ id: 'random', name: '랜덤', en: 'RANDOM', icon: '🎲', hint: '매번 다른 전장에서 시작합니다.' }, ...LEVELS];
  for (const lv of all) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'field' + (state.levelId === lv.id ? ' is-on' : '');
    b.dataset.level = lv.id;
    b.innerHTML = `<span class="field-icon" aria-hidden="true">${lv.icon}</span>
      <span class="field-name">${lv.name}</span>
      <span class="field-en">${lv.en}</span>`;
    b.title = lv.hint || '';
    b.addEventListener('click', () => {
      state.levelId = lv.id;
      sfx.play('click');
      renderFields();
    });
    grid.appendChild(b);
  }
}

$$('#diffRow .diff').forEach((b) => {
  b.addEventListener('click', () => {
    state.difficulty = b.dataset.diff;
    $$('#diffRow .diff').forEach((x) => x.classList.toggle('is-on', x === b));
    sfx.play('click');
  });
});

$('#btnAi').addEventListener('click', () => {
  state.mode = 'ai';
  startSelect();
});
$('#btnLocal').addEventListener('click', () => {
  state.mode = 'local';
  startSelect();
});

$('#optTimer').checked = state.timerOn;
$('#optTimer').addEventListener('change', (e) => {
  state.timerOn = e.target.checked;
  local.set('timer', state.timerOn);
  sfx.play('click');
});

// ── 탱크 선택 ─────────────────────────────────────────────────────────────
const tankArt = (t) => `
  <svg viewBox="0 0 120 80" class="tank-art" aria-hidden="true" focusable="false">
    <rect x="10" y="56" width="92" height="14" fill="#12161f" stroke="#0a0d14" stroke-width="3"/>
    <rect x="20" y="58" width="9" height="8" fill="#3b4354"/><rect x="42" y="58" width="9" height="8" fill="#3b4354"/>
    <rect x="64" y="58" width="9" height="8" fill="#3b4354"/><rect x="86" y="58" width="9" height="8" fill="#3b4354"/>
    <rect x="18" y="34" width="60" height="22" fill="${t.color}" stroke="#0a0d14" stroke-width="3"/>
    <rect x="26" y="40" width="18" height="6" fill="${t.light}"/>
    <circle cx="48" cy="34" r="15" fill="${t.light}" stroke="#0a0d14" stroke-width="3"/>
    <path d="M52 26 L108 10 L111 21 L56 36 Z" fill="#0a0d14"/>
    <rect x="60" y="12" width="10" height="6" fill="${t.color}" stroke="#0a0d14" stroke-width="2"/>
  </svg>`;

function renderTankGrid() {
  const grid = $('#tankGrid');
  grid.innerHTML = '';
  const cur = state.tanks[state.pick];
  for (const t of TANKS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tank-card' + (cur === t.id ? ' is-on' : '');
    b.dataset.tank = t.id;
    const stats = Object.entries(t.stat).map(([k, v]) => `
      <div class="stat-row"><span>${k}</span><span class="pips">${
        Array.from({ length: 5 }, (_, i) => `<i class="${i < v ? 'on' : ''}"></i>`).join('')
      }</span></div>`).join('');
    b.innerHTML = `
      <div class="tank-art-wrap">${tankArt(t)}</div>
      <div class="tank-head">
        <b>${t.name}</b><small>${t.en}</small>
      </div>
      <p class="tank-desc">${t.desc}</p>
      <div class="tank-stats">${stats}</div>
      <div class="tank-meta"><span>체력 ${t.hp}</span><span>연료 ${t.fuel}</span></div>
      <span class="pick-mark" aria-hidden="true">✓</span>`;
    b.addEventListener('click', () => {
      state.tanks[state.pick] = t.id;
      sfx.play('click');
      renderTankGrid();
      updatePickLine();
    });
    grid.appendChild(b);
  }
  updatePickLine();
}

function updatePickLine() {
  const t = tankById(state.tanks[state.pick]);
  $('#pickedLine').textContent = `${state.pick === 0 ? '1P' : (state.mode === 'ai' ? 'AI' : '2P')} 선택: ${t.name}`;
}

function startSelect() {
  state.pick = 0;
  showScreen('select');
  $('#selectKicker').textContent = '1P 탱크 선택';
  $('#selectTitle').textContent = '어떤 탱크로 싸울까요?';
  $('#selectSub').textContent = '체력·이동력·포탄 특성이 다릅니다.';
  $('#btnSelectNext').textContent = '다음 →';
  renderTankGrid();
}

$('#btnSelectBack').addEventListener('click', () => {
  sfx.play('click');
  if (state.pick === 1) {
    state.pick = 0;
    $('#selectKicker').textContent = '1P 탱크 선택';
    $('#selectTitle').textContent = '어떤 탱크로 싸울까요?';
    $('#selectSub').textContent = '체력·이동력·포탄 특성이 다릅니다.';
    $('#btnSelectNext').textContent = '다음 →';
    renderTankGrid();
  } else {
    showScreen('menu');
  }
});

$('#btnSelectNext').addEventListener('click', () => {
  sfx.play('click');
  if (state.pick === 0) {
    state.pick = 1;
    const second = state.mode === 'ai' ? 'AI' : '2P';
    $('#selectKicker').textContent = `${second} 탱크 선택`;
    $('#selectTitle').textContent = `${second}는 어떤 탱크일까요?`;
    $('#selectSub').textContent = state.mode === 'ai' ? 'AI가 몰 탱크를 정합니다.' : '두 번째 플레이어의 탱크입니다.';
    $('#btnSelectNext').textContent = '전투 시작 →';
    renderTankGrid();
    return;
  }
  startGame();
});

// ── 게임 시작 ─────────────────────────────────────────────────────────────
function startGame() {
  const level = state.levelId === 'random'
    ? LEVELS[Math.floor(Math.random() * LEVELS.length)].id
    : state.levelId;
  state.game = new Game({
    mode: state.mode,
    difficulty: state.difficulty,
    level,
    tanks: [...state.tanks],
    theme: state.theme,
    timerOn: state.timerOn,
    onEvent: onGameEvent,
  });
  showScreen('game');
  state.view = new View($('#cv'), state.game);
  state.overShown = false;
  state.overTimer = 0;
  eventLog.length = 0;
  $('#topStats').hidden = false;
  $('#statTimer').hidden = !state.timerOn;
  const qb = $('#btnQuit');
  qb.textContent = '나가기';
  qb.classList.remove('armed');
  quitArmed = 0;
  buildItems();
  syncGameUI(true);
  sfx.play('click');
  banner(state.mode === 'ai' ? '내 턴' : '1P 턴', '조준하고 쏘세요');
  startLoop();
}

function startLoop() {
  cancelAnimationFrame(state.raf);
  state.last = performance.now();
  const tick = (ts) => {
    const dt = Math.min(0.05, (ts - state.last) / 1000);
    state.last = ts;
    if (state.game) {
      updateHeldInputs(dt);
      state.game.update(dt);
      syncGameUI(false);
      state.view.draw(dt);
      if (state.game.projectiles.length === 0) sfx.whistleStop();
      if (state.game.over && !state.overShown) {
        state.overTimer += dt;
        if (state.overTimer > 1.1) showOver();
      }
      state.raf = requestAnimationFrame(tick);
    }
  };
  state.raf = requestAnimationFrame(tick);
}

function updateHeldInputs(dt) {
  const g = state.game;
  if (!g) return;
  const left = held.has('left') || keys.has('ArrowLeft');
  const right = held.has('right') || keys.has('ArrowRight');
  g.setMove(left && !right ? -1 : right && !left ? 1 : 0);
  const up = held.has('up') || keys.has('ArrowUp');
  const down = held.has('down') || keys.has('ArrowDown');
  if (up) g.adjustAngle(52 * dt);
  if (down) g.adjustAngle(-52 * dt);
  const shown = g.mode === 'ai' ? g.players[0] : g.me;
  $('#angleTxt').textContent = `${Math.round(shown.angle)}°`;
  if (g.phase === 'charge' && !g.isAI()) {
    const p = g.chargeVal;
    $('#gaugeFill').classList.add('on');
    $('#gaugeFill').style.width = `${p}%`;
    $('#gaugeTxt').textContent = `파워 ${Math.round(p)}%`;
  }
  $('#gauge').classList.toggle('charging', g.phase === 'charge');
}

// ── 조작 ──────────────────────────────────────────────────────────────────
function bindPad(btn) {
  const act = btn.dataset.act;
  const start = (e) => {
    e.preventDefault();
    sfx.ensure();
    btn.classList.add('on');
    if (act === 'fire') {
      held.add('fire');
      state.game?.startCharge();
      return;
    }
    held.add(act);
  };
  const end = (e) => {
    if (e) e.preventDefault();
    btn.classList.remove('on');
    if (act === 'fire') {
      held.delete('fire');
      state.game?.releaseCharge();
      return;
    }
    held.delete(act);
  };
  btn.addEventListener('pointerdown', (e) => { try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ } start(e); });
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
  btn.addEventListener('lostpointercapture', (e) => { if (held.has(act)) end(e); });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

$$('#controls [data-act]').forEach(bindPad);
bindPad($('#fireBtn'));

window.addEventListener('pointerup', () => {
  if (held.has('fire')) {
    held.delete('fire');
    $('#fireBtn').classList.remove('on');
    state.game?.releaseCharge();
  }
  held.delete('left'); held.delete('right'); held.delete('up'); held.delete('down');
  $$('#controls .pad').forEach((b) => b.classList.remove('on'));
});

document.addEventListener('keydown', (e) => {
  if ($('#helpDlg').open) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (!state.game || SCREENS.game.hidden) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  sfx.ensure();
  if (e.code === 'Space' && !e.repeat) state.game.startCharge();
});
document.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space' && state.game) state.game.releaseCharge();
});
window.addEventListener('blur', () => {
  keys.clear();
  held.clear();
  state.game?.cancelCharge();
});

function buildItems() {
  const wrap = $('#items');
  wrap.innerHTML = '';
  for (const it of ITEMS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'item-btn';
    b.dataset.item = it.id;
    b.innerHTML = `<span class="item-icon" aria-hidden="true">${it.icon}</span><span class="item-name">${it.name}</span>`;
    b.title = it.desc;
    b.addEventListener('click', () => {
      const g = state.game;
      if (!g) return;
      sfx.ensure();
      const r = g.useItem(it.id);
      if (!r.ok) { toast(r.reason); return; }
      sfx.play(it.id === 'repair' ? 'repair' : 'click');
      toast(r.message);
      syncGameUI(true);
    });
    wrap.appendChild(b);
  }
}

// ── 화면 갱신 ─────────────────────────────────────────────────────────────
function syncGameUI(full) {
  const g = state.game;
  if (!g) return;
  const me = g.me;
  const human = !g.isAI() && g.phase !== 'over';

  $('#turnName').textContent = g.turnLabel();
  $('#turnDot').classList.toggle('p1', g.current === 1);
  $('#turnChip').querySelector('b').textContent = g.turnLabel();
  $('#turnChip').classList.toggle('p1', g.current === 1);
  const w = g.wind;
  const arrow = w >= 0 ? '→' : '←';
  $('#windArrow').textContent = arrow;
  $('#windVal').textContent = Math.abs(w).toFixed(1);
  $('#windChipVal').textContent = `${arrow} ${Math.abs(w).toFixed(1)}`;
  $('#windArrow').classList.toggle('p1', w < 0);

  if (state.timerOn) {
    $('#timerVal').textContent = Math.ceil(g.turnLeft);
    $('#statTimer').classList.toggle('urgent', g.turnLeft <= 8 && !g.over);
  }

  for (const i of [0, 1]) {
    const p = g.players[i];
    $(`#p${i}name`).textContent = `${g.mode === 'local' ? `${i + 1}P · ` : i === 0 ? '' : 'AI · '}${p.type.name}`;
    $(`#p${i}hp`).textContent = `${p.hp}`;
    $(`#p${i}bar`).style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    $(`#p${i}bar`).classList.toggle('low', p.hp / p.maxHp <= 0.3);
    $(`#p${i}fuel`).style.width = `${Math.max(0, (p.fuel / p.type.fuel) * 100)}%`;
    $(`#fighter${i}`).classList.toggle('active', i === g.current && !g.over);
    $(`#fighter${i}`).classList.toggle('dead', !p.alive);
  }

  const shown = g.mode === 'ai' ? g.players[0] : me;
  $('#angleTxt').textContent = `${Math.round(shown.angle)}°`;
  $('#fuelTxt').textContent = `${Math.round(shown.fuel)}`;
  if (g.phase !== 'charge' || g.isAI()) {
    const pw = Math.round(shown.power);
    $('#gaugeFill').classList.remove('on');
    $('#gaugeFill').style.width = `${pw}%`;
    $('#gaugeTxt').textContent = `파워 ${pw}%`;
  }
  $('#gauge').classList.toggle('charging', g.phase === 'charge');
  $('#gauge').classList.toggle('ai', g.isAI());

  const fireOn = human && (g.phase === 'aim' || g.phase === 'charge');
  $('#fireBtn').disabled = !fireOn;
  $('#controls').classList.toggle('waiting', !human);
  for (const b of $$('#items .item-btn')) {
    const id = b.dataset.item;
    const used = !me.items[id];
    b.classList.toggle('used', used);
    b.disabled = used || !human || g.phase !== 'aim';
  }

  if (full) {
    $('#stageTip').hidden = false;
    $('#stageTip').textContent = g.isAI() ? 'AI가 조준하고 있습니다…' : 'FIRE를 꾹 눌러 파워를 모으세요';
    setTimeout(() => { const el = $('#stageTip'); if (el) el.hidden = true; }, 2600);
  }
}

// ── 엔진 이벤트 ───────────────────────────────────────────────────────────
const eventLog = [];
function onGameEvent(e) {
  const g = state.game;
  eventLog.push({ ...e, t: Math.round(performance.now()) });
  if (eventLog.length > 200) eventLog.shift();
  switch (e.type) {
    case 'fire':
      sfx.play('fire');
      sfx.whistleStart();
      break;
    case 'explode':
      sfx.whistleStop();
      sfx.play('explode');
      break;
    case 'hit':
      sfx.play('hit');
      break;
    case 'repair':
      sfx.play('repair');
      break;
    case 'teleport':
      sfx.play('teleport');
      break;
    case 'kill':
      sfx.whistleStop();
      sfx.play('explode');
      break;
    case 'no-fuel':
      toast('연료가 부족합니다');
      break;
    case 'turn':
      if (g) {
        const label = g.mode === 'local' ? `${g.current + 1}P 턴` : g.current === 1 ? 'AI 턴' : '내 턴';
        banner(label, g.current === 1 && g.mode === 'ai' ? 'AI가 조준합니다' : '조준하고 쏘세요');
        sfx.play('click');
        syncGameUI(true);
      }
      break;
    case 'extra-shot':
      toast('더블샷! 한 발 더 쏩니다', 1300);
      banner('한 발 더!', '다시 조준하세요');
      break;
    case 'charge-full':
      sfx.play('charge');
      break;
    case 'end':
      sfx.whistleStop();
      break;
    default:
      break;
  }
}

// ── 결과 ──────────────────────────────────────────────────────────────────
function showOver() {
  const g = state.game;
  if (!g || state.overShown) return;
  state.overShown = true;
  $('#topStats').hidden = true;
  showScreen('over');
  const humanWin = g.mode === 'ai' ? g.winner === 0 : true;
  let title = '무승부';
  let sub = '두 탱크가 함께 멈췄습니다.';
  if (g.winner === 0) { title = g.mode === 'ai' ? '승리!' : '1P 승리!'; sub = '마지막 한 발이 통했습니다.'; }
  else if (g.winner === 1) { title = g.mode === 'ai' ? '패배…' : '2P 승리!'; sub = '다음엔 각도를 조금 더 세워 보세요.'; }
  $('#overTitle').textContent = title;
  $('#overSub').textContent = sub;
  $('#overKicker').textContent = `${g.level.name} · ${g.mode === 'ai' ? `AI ${g.difficulty === 'easy' ? '쉬움' : g.difficulty === 'normal' ? '보통' : '어려움'}` : '로컬 2인'} · ${g.turn}턴`;
  $('#overCard').classList.toggle('win', g.winner === 0 || g.mode === 'local');
  $('#overCard').classList.toggle('lose', g.mode === 'ai' && g.winner === 1);
  const stat = (p, i) => `
    <div class="over-row">
      <b>${g.mode === 'local' ? `${i + 1}P` : i === 0 ? '나' : 'AI'} · ${p.type.name}</b>
      <span>체력 ${p.hp}/${p.maxHp}</span>
      <span>발사 ${g.stats[i].shots}회</span>
      <span>명중 ${g.stats[i].hits}</span>
      <span>피해 ${g.stats[i].dealt}</span>
    </div>`;
  $('#overStats').innerHTML = stat(g.players[0], 0) + stat(g.players[1], 1);
  if (humanWin && g.winner !== -1) sfx.play('win');
  else if (g.mode === 'ai' && g.winner === 1) sfx.play('lose');
  else sfx.play('win');
}

// ── 대전 그만두기 (두 번 눌러 확인) ───────────────────────────────────────
let quitArmed = 0;
$('#btnQuit').addEventListener('click', () => {
  const btn = $('#btnQuit');
  if (performance.now() - quitArmed > 3200) {
    quitArmed = performance.now();
    btn.textContent = '정말 나갈까요?';
    btn.classList.add('armed');
    toast('한 번 더 누르면 처음 화면으로 돌아갑니다', 2600);
    return;
  }
  cancelAnimationFrame(state.raf);
  state.game = null;
  state.view = null;
  held.clear();
  keys.clear();
  btn.textContent = '나가기';
  btn.classList.remove('armed');
  showScreen('menu');
  renderFields();
});

$('#btnRematch').addEventListener('click', () => {
  sfx.play('click');
  startGame();
});
$('#btnMenu').addEventListener('click', () => {
  sfx.play('click');
  cancelAnimationFrame(state.raf);
  state.game = null;
  state.view = null;
  showScreen('menu');
  renderFields();
});

// ── 처음 상태 ─────────────────────────────────────────────────────────────
applyTheme(state.theme);
applySound(state.muted);
sfx.setMuted(state.muted);
renderFields();
updatePickLine();

// 페이지를 떠나기 전 요청 정리
window.addEventListener('pagehide', () => cancelAnimationFrame(state.raf));

// 검증 도구용 — 게임 상태를 읽거나 결과 화면을 시험할 때만 씁니다 (화면·조작에는 영향 없음)
globalThis.__fortressGame = () => state.game;
globalThis.__fortress = () => {
  const g = state.game;
  if (!g) return null;
  return {
    phase: g.phase, turn: g.turn, current: g.current, over: g.over, winner: g.winner,
    mode: g.mode, difficulty: g.difficulty, level: g.level.id, wind: g.wind,
    hp: g.players.map((p) => p.hp), maxHp: g.players.map((p) => p.maxHp),
    alive: g.players.map((p) => p.alive), fuel: g.players.map((p) => Math.round(p.fuel)),
    angle: g.players.map((p) => Math.round(p.angle)), power: g.players.map((p) => Math.round(p.power)),
    items: g.players.map((p) => ({ ...p.items })),
    pos: g.players.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), facing: p.facing })),
    aiPlan: g.aiState && g.aiState.plan ? { ...g.aiState.plan } : null, aiPlanMs: g.aiPlanMs || 0,
    projectiles: g.projectiles.length, removed: g.terrain.removed, shotsLeft: g.shotsLeft,
    view: state.view ? { scale: +state.view.scale.toFixed(3), w: state.view.w, h: state.view.h, camX: Math.round(state.view.camX), camY: Math.round(state.view.camY) } : null,
    stats: g.stats.map((s) => ({ ...s })),
    log: eventLog.slice(-12),
  };
};
