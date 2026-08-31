/*
 * 主控：状态机 / 输入分发 / 主循环
 * （共享全局作用域，加载顺序：input.js -> audio.js -> entities.js -> render.js -> game.js）
 * 状态：start | playing | paused | dying | over
 */

function $(id) { return document.getElementById(id); }

var canvas = $('game');
var ctx = canvas.getContext('2d');
var input = new Input(canvas);

var ui = {
  start: $('screen-start'), pause: $('screen-pause'), over: $('screen-over'),
  finalStats: $('final-stats'), padStatus: $('pad-status'),
  btnStart: $('btn-start'), btnResume: $('btn-resume'),
  btnRestart: $('btn-restart'), btnPause: $('btn-pause'),
  pauseInfo: $('pause-info'), btnPauseRestart: $('btn-pause-restart')
};

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
  mode: 'start',           // start | playing | paused | dying | over
  kills: 0,
  time: 0,
  shake: 0,
  pulseT: 0,               // 低血量红脉冲计时
  darken: 0,               // 死亡变暗 0..1
  best: parseInt(localStorage.getItem('td_best') || '0', 10) || 0
};
var overLockT = 0;

// ---------------- 状态切换 ----------------
function startGame() {
  sfx.select();
  sfx.startAmbient();
  G.mode = 'playing';
  G.kills = 0; G.time = 0; G.shake = 0; G.pulseT = 0; G.darken = 0;
  bullets.length = 0; enemies.length = 0; particles.length = 0;
  powerups.length = 0; floaters.length = 0; hitFxs.length = 0;
  squad.count = 3; squad.level = 1;
  player.x = LW / 2;
  player.cool = 0.4; player.flash = 0; player.hurtT = 0; player.alive = true;
  spawnT = 1.2; powerT = 6;
  ui.start.classList.add('hidden');
  ui.over.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.btnPause.classList.remove('hidden');
}

function pauseGame() {
  if (G.mode !== 'playing') return;
  G.mode = 'paused';
  ui.pause.classList.remove('hidden');
  ui.btnPause.classList.add('hidden');
  ui.pauseInfo.innerHTML = '士兵 x' + squad.count + ' · 武器 Lv' + squad.level
    + '<br>击杀 ' + G.kills + ' · 存活 ' + Math.floor(G.time) + ' 秒';
  sfx.select();
  sfx.stopAmbient();
}

function resumeGame() {
  if (G.mode !== 'paused') return;
  G.mode = 'playing';
  ui.pause.classList.add('hidden');
  ui.btnPause.classList.remove('hidden');
  sfx.select();
  sfx.startAmbient();
}

// 血尽：进入变暗过程（对应视频结尾画面渐暗）
function beginDying() {
  G.mode = 'dying';
  sfx.stopAmbient();
  sfx.gameover();
  input.vibrate(400, 1, 0.8);
  ui.btnPause.classList.add('hidden');
}

function gameOver() {
  G.mode = 'over';
  overLockT = 0.6;
  var newRecord = G.kills > G.best;
  if (newRecord) {
    G.best = G.kills;
    try { localStorage.setItem('td_best', String(G.best)); } catch (e) { /* 隐私模式忽略 */ }
  }
  ui.finalStats.innerHTML = '击杀 ' + G.kills + ' · 存活 ' + Math.floor(G.time) + ' 秒'
    + (newRecord ? '<br>🏆 新纪录！' : '<br>最佳 ' + G.best);
  ui.over.classList.remove('hidden');
}

// ---------------- 输入分发 ----------------
function handleGlobalInput() {
  var confirm = input.consumeConfirm();
  var pause = input.consumePause();

  switch (G.mode) {
    case 'start':
      if (confirm) startGame();
      break;
    case 'playing':
      if (pause) pauseGame();
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
  updateBg(dt);
  updatePlayer(dt);
  updateDirector(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updatePowerups(dt);
  updateParticles(dt);
  updateFloaters(dt);
  updateHitFx(dt);
  handleCollisions();

  // 低兵量：红色脉冲（周期 0.67s）
  if (player.alive && squad.count > 0 && squad.count <= 2) {
    G.pulseT += dt;
    if (G.pulseT >= 0.667) {
      G.pulseT -= 0.667;
      sfx.alarmBlip();
    }
  } else {
    G.pulseT = 0;
  }

  if (G.shake > 0) G.shake = Math.max(0, G.shake - 60 * dt);

  // 血尽 → 变暗 → 结算
  if (!player.alive) beginDying();
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
  } else if (G.mode === 'dying') {
    // 变暗期间：粒子与命中特效继续飘散，约 1.4s 后弹出结算
    updateBg(dt);
    updateParticles(dt);
    updateFloaters(dt);
    updateHitFx(dt);
    G.darken = Math.min(1, G.darken + dt / 1.4);
    if (G.darken >= 1) gameOver();
  } else {
    // 菜单 / 暂停 / 结束界面下保持海面动效
    updateBg(dt);
    updateParticles(dt);
    updateFloaters(dt);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - 60 * dt);
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
ui.btnPauseRestart.addEventListener('click', startGame);
ui.btnPause.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  pauseGame();
});

canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

document.addEventListener('visibilitychange', function () {
  if (document.hidden && G.mode === 'playing') pauseGame();
});

requestAnimationFrame(frame);
