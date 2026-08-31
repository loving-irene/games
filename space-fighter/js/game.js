/*
 * 主控：状态机 / HUD / 输入分发 / 主循环
 * （共享全局作用域，加载顺序：entities.js -> render.js -> game.js）
 */

var LW = 540, LH = 960;   // 逻辑分辨率

function $(id) { return document.getElementById(id); }

var canvas = $('game');
var ctx = canvas.getContext('2d');
var input = new Input(canvas);

var ui = {
  hud: $('hud'),
  score: $('score'), wave: $('wave'), hiscore: $('hiscore'),
  lives: $('lives'), bombs: $('bombs'), weapon: $('weapon'), weaponName: $('weapon-name'),
  bossBar: $('boss-bar'), bossName: $('boss-name'), bossHp: $('boss-hp'),
  start: $('screen-start'), pause: $('screen-pause'), over: $('screen-over'),
  finalScore: $('final-score'), padStatus: $('pad-status'),
  btnStart: $('btn-start'), btnResume: $('btn-resume'),
  btnRestart: $('btn-restart'), btnBomb: $('btn-bomb'),
  btnPause: $('btn-pause'), pauseInfo: $('pause-info'),
  btnPauseRestart: $('btn-pause-restart'),
  btnModeEasy: $('btn-mode-easy'), btnModeNormal: $('btn-mode-normal'),
  btnInfinite: $('btn-infinite')
};

var isTouch = ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches);

// ---------------- 视口 ----------------
var view = { scale: 1, offX: 0, offY: 0 };

function resize() {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';   // CSS 尺寸必须显式设置，否则高分屏下 canvas 会按位图尺寸溢出
  canvas.style.height = h + 'px';
  var s = Math.min(w / LW, h / LH) * dpr;
  view.scale = s;
  view.offX = (canvas.width - LW * s) / 2;
  view.offY = (canvas.height - LH * s) / 2;
}
window.addEventListener('resize', resize);
resize();

// ---------------- 全局状态 ----------------
var G = {
  mode: 'start',          // start | playing | paused | over
  score: 0,
  hiscore: parseInt(localStorage.getItem('sf_highscore') || '0', 10) || 0,
  wave: 0,
  time: 0,
  shake: 0,
  flash: 0,
  overDelay: 0,
  newRecord: false,
  // 难度模式：easy 幼儿 | normal 正常（记忆上次选择）
  diffMode: localStorage.getItem('sf_mode') === 'easy' ? 'easy' : 'normal',
  // 无限生命开关：开启后无论哪种模式受击都不掉血
  infiniteLives: localStorage.getItem('sf_inf') === '1'
};
var overLockT = 0;

function applyModeSelection() {
  ui.btnModeEasy.classList.toggle('selected', G.diffMode === 'easy');
  ui.btnModeNormal.classList.toggle('selected', G.diffMode === 'normal');
  ui.btnInfinite.classList.toggle('selected', G.infiniteLives);
  ui.btnInfinite.textContent = G.infiniteLives ? '♾️ 无限生命：开' : '♾️ 无限生命：关';
}

function setDiffMode(mode) {
  G.diffMode = mode;
  localStorage.setItem('sf_mode', mode);
  DIFF = DIFF_PRESETS[mode];
  applyModeSelection();
  sfx.select();
}

function toggleInfiniteLives() {
  G.infiniteLives = !G.infiniteLives;
  localStorage.setItem('sf_inf', G.infiniteLives ? '1' : '0');
  applyModeSelection();
  sfx.select();
}

// ---------------- HUD ----------------
var _hudCache = {};

function setText(el, v) {
  if (_hudCache[el.id] !== v) { _hudCache[el.id] = v; el.textContent = v; }
}

function refreshHud() {
  setText(ui.score, String(G.score));
  setText(ui.wave, String(G.wave));
  setText(ui.hiscore, String(Math.max(G.hiscore, G.score)));
  if (G.infiniteLives) setText(ui.lives, '♥∞');
  else if (player.maxHp > 5) setText(ui.lives, '♥' + player.hp + '/' + player.maxHp);
  else setText(ui.lives, player.hp > 0 ? '♥'.repeat(player.hp) : '—');
  setText(ui.bombs, player.bombs > 0 ? '◉'.repeat(player.bombs) : '—');
  setText(ui.weapon, '★'.repeat(player.wlevel) + '☆'.repeat(5 - player.wlevel));
  setText(ui.weaponName, player.wstage + '阶 · ' + weaponName(player.wstage));
  ui.weaponName.style.color = WEAPON_STAGES[player.wstage - 1].color;
  if (boss) ui.bossHp.style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
}

// ---------------- 状态切换 ----------------
function startGame() {
  sfx.select();
  sfx.startMusic('normal');
  G.mode = 'playing';
  DIFF = DIFF_PRESETS[G.diffMode]; // 应用当前所选难度
  player.maxHp = DIFF.maxHp;       // 幼儿模式 20 生命，正常模式 3 生命
  G.score = 0; G.wave = 0; G.shake = 0; G.flash = 0; G.newRecord = false; G.overDelay = 0;
  bullets.length = 0; ebullets.length = 0; enemies.length = 0;
  powerups.length = 0; particles.length = 0; floaters.length = 0;
  boss = null;
  ui.bossBar.classList.add('hidden');
  banner.t = 0;
  player.x = LW / 2; player.y = LH - 140;
  player.hp = player.maxHp; player.shield = false; player.wstage = 1; player.wlevel = 1;
  player.bombs = 2; player.cool = 0; player.inv = 2; player.alive = true;
  resetDirector();
  startWave(1);
  ui.start.classList.add('hidden');
  ui.over.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  if (isTouch) ui.btnBomb.classList.remove('hidden');
  ui.btnPause.classList.remove('hidden');
  refreshHud();
}

function pauseGame() {
  if (G.mode !== 'playing') return;
  G.mode = 'paused';
  ui.pause.classList.remove('hidden');
  ui.btnBomb.classList.add('hidden');
  ui.btnPause.classList.add('hidden');
  ui.pauseInfo.innerHTML = '得分 ' + G.score + ' · 第 ' + G.wave + ' 波<br>火力：'
    + weaponName(player.wstage) + '（' + player.wstage + '阶 Lv' + player.wlevel + '）';
  sfx.select();
  sfx.stopMusic();
}

function resumeGame() {
  if (G.mode !== 'paused') return;
  G.mode = 'playing';
  ui.pause.classList.add('hidden');
  if (isTouch) ui.btnBomb.classList.remove('hidden');
  ui.btnPause.classList.remove('hidden');
  sfx.select();
  sfx.startMusic(boss && boss.entered ? 'boss' : 'normal');
}

function gameOver() {
  G.mode = 'over';
  overLockT = 0.7;
  sfx.gameoverJingle();
  ui.btnBomb.classList.add('hidden');
  ui.btnPause.classList.add('hidden');
  G.newRecord = G.score > G.hiscore;
  if (G.newRecord) {
    G.hiscore = G.score;
    try { localStorage.setItem('sf_highscore', String(G.hiscore)); } catch (e) { /* 隐私模式忽略 */ }
  }
  ui.finalScore.textContent = '得分 ' + G.score + (G.newRecord ? ' 🏆 新纪录！' : '');
  ui.hud.classList.add('hidden');
  ui.bossBar.classList.add('hidden');
  ui.over.classList.remove('hidden');
}

// ---------------- 输入分发 ----------------
function handleGlobalInput() {
  var confirm = input.consumeConfirm();
  var pause = input.consumePause();
  var bomb = input.consumeBomb();

  switch (G.mode) {
    case 'start':
      if (confirm) startGame();
      break;
    case 'playing':
      if (pause) { pauseGame(); break; }
      if (bomb) useBomb();
      break;
    case 'paused':
      if (pause || confirm) resumeGame();
      break;
    case 'over':
      if (confirm && overLockT <= 0) startGame();
      break;
  }
}

// ---------------- 主更新 ----------------
function update(dt) {
  G.time += dt;
  if (banner.t > 0) banner.t -= dt;
  updateBg(dt);
  updatePlayer(dt);
  updateDirector(dt);
  updateEnemies(dt);
  if (boss) updateBoss(dt);
  updateBullets(dt);
  updateEBullets(dt);
  updatePowerups(dt);
  updateParticles(dt);
  updateFloaters(dt);
  handleCollisions();
  if (G.shake > 0) G.shake = Math.max(0, G.shake - 60 * dt);
  if (G.flash > 0) G.flash = Math.max(0, G.flash - 1.4 * dt);
  if (!player.alive) {
    G.overDelay -= dt;
    if (G.overDelay <= 0) gameOver();
  }
  refreshHud();
}

// ---------------- 主循环 ----------------
var last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (overLockT > 0) overLockT -= dt;

  input.poll();
  handleGlobalInput();

  if (G.mode === 'playing') {
    update(dt);
  } else {
    // 菜单 / 暂停 / 结束界面下保持背景动效
    updateBg(dt);
    updateParticles(dt);
    updateFloaters(dt);
    if (banner.t > 0) banner.t -= dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - 60 * dt);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - 1.4 * dt);
  }
  render();
}

// ---------------- 事件绑定 ----------------
input.onPadChange = function (connected, name) {
  if (connected) {
    ui.padStatus.textContent = '🎮 已连接：' + name + ' · 按 ✕ 开始';
    ui.padStatus.classList.add('connected');
  } else {
    ui.padStatus.textContent = '🎮 未检测到手柄 · 可用键盘 / 触屏游玩';
    ui.padStatus.classList.remove('connected');
  }
};

ui.btnStart.addEventListener('click', startGame);
ui.btnResume.addEventListener('click', resumeGame);
ui.btnRestart.addEventListener('click', startGame);
ui.btnModeEasy.addEventListener('click', function () { setDiffMode('easy'); });
ui.btnModeNormal.addEventListener('click', function () { setDiffMode('normal'); });
ui.btnInfinite.addEventListener('click', toggleInfiniteLives);
DIFF = DIFF_PRESETS[G.diffMode];
applyModeSelection();
ui.btnBomb.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  useBomb();
});
ui.btnPause.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  pauseGame();
});
ui.btnPauseRestart.addEventListener('click', startGame);

canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

document.addEventListener('visibilitychange', function () {
  if (document.hidden && G.mode === 'playing') pauseGame();
});

requestAnimationFrame(frame);
