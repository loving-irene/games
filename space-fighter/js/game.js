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
  modules: $('modules'),
  bossBar: $('boss-bar'), bossName: $('boss-name'), bossHp: $('boss-hp'),
  eventPanel: $('event-panel'), eventTitle: $('event-title'), eventProgress: $('event-progress'),
  start: $('screen-start'), pause: $('screen-pause'), over: $('screen-over'),
  choice: $('screen-choice'), choiceTitle: $('choice-title'), choiceSubtitle: $('choice-subtitle'), choiceList: $('choice-list'),
  finalScore: $('final-score'), padStatus: $('pad-status'),
  btnStart: $('btn-start'), btnResume: $('btn-resume'),
  btnRestart: $('btn-restart'), btnBomb: $('btn-bomb'),
  btnHome: $('btn-home'),
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

// ---------------- 菜单焦点导航（手柄 / 键盘） ----------------
var menus = {
  start: { items: [ui.btnModeEasy, ui.btnModeNormal, ui.btnInfinite, ui.btnStart], defIdx: 3, idx: 3 },
  over: { items: [ui.btnRestart, ui.btnHome], defIdx: 0, idx: 0 }
};
var activeMenu = null;

function setMenuFocus(menu, idx) {
  menu.idx = (idx + menu.items.length) % menu.items.length;
  menu.items.forEach(function (el, i) {
    el.classList.toggle('focused', i === menu.idx);
  });
}

function showMenu(name) {
  activeMenu = menus[name];
  setMenuFocus(activeMenu, activeMenu.defIdx);
}

function hideMenu() {
  if (!activeMenu) return;
  activeMenu.items.forEach(function (el) { el.classList.remove('focused'); });
  activeMenu = null;
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
  setText(ui.weaponName, weaponName(player.wstage) + ' · Lv' + player.wlevel);
  setText(ui.modules, moduleInventoryText());
  ui.weaponName.style.color = WEAPON_STAGES[player.wstage - 1].color;
  if (boss) ui.bossHp.style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
  var eventHud = runHudData();
  ui.eventPanel.classList.toggle('hidden', !eventHud);
  if (eventHud) {
    setText(ui.eventTitle, eventHud.title);
    setText(ui.eventProgress, eventHud.progress);
  }
}

// ---------------- 局内奖励选择 ----------------
var rewardCallback = null;

function showRewardChoice(title, subtitle, choices, onPick) {
  rewardCallback = onPick;
  ui.choiceTitle.textContent = title;
  ui.choiceSubtitle.textContent = subtitle;
  ui.choiceList.innerHTML = '';
  var buttons = [];
  choices.forEach(function (choice) {
    var btn = document.createElement('button');
    var isUpgrade = !!choice.desc;
    var detail = isUpgrade
      ? choice.desc + ' · 当前 Lv' + (runProgress.upgrades[choice.id] || 0)
      : moduleFusionHint(choice.id);
    btn.className = 'choice-item';
    btn.innerHTML = '<span class="choice-icon">' + choice.icon + '</span>'
      + '<span class="choice-name">' + choice.name + '</span>'
      + '<span class="choice-detail">' + detail + '</span>';
    btn.addEventListener('click', function () {
      if (!rewardCallback) return;
      var callback = rewardCallback;
      rewardCallback = null;
      hideRewardChoice();
      callback(choice.id);
    });
    btn.addEventListener('pointerenter', function () {
      if (!activeMenu) return;
      var idx = activeMenu.items.indexOf(btn);
      if (idx >= 0) setMenuFocus(activeMenu, idx);
    });
    ui.choiceList.appendChild(btn);
    buttons.push(btn);
  });
  hideMenu();
  activeMenu = { items: buttons, defIdx: 0, idx: 0 };
  setMenuFocus(activeMenu, 0);
  ui.choice.classList.remove('hidden');
  ui.btnBomb.classList.add('hidden');
  ui.btnPause.classList.add('hidden');
}

function hideRewardChoice() {
  ui.choice.classList.add('hidden');
  if (activeMenu && activeMenu.items.length && activeMenu.items[0].classList.contains('choice-item')) hideMenu();
  if (G.mode === 'playing') {
    if (isTouch) ui.btnBomb.classList.remove('hidden');
    ui.btnPause.classList.remove('hidden');
  }
}

// ---------------- 全屏 ----------------
function enterFullscreen() {
  var el = document.documentElement;
  var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (!fn) return;
  try {
    var p = fn.call(el);
    if (p && p.catch) p.catch(function () { /* 浏览器拒绝（如无用户激活）时忽略 */ });
  } catch (e) { /* 忽略 */ }
}

function exitFullscreen() {
  var fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
  if (!fn || !document.fullscreenElement && !document.webkitFullscreenElement) return;
  try {
    var p = fn.call(document);
    if (p && p.catch) p.catch(function () { /* 忽略 */ });
  } catch (e) { /* 忽略 */ }
}

// ---------------- 状态切换 ----------------
function startGame() {
  enterFullscreen(); // 借助本次点击 / 按键的用户激活请求进入全屏
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
  player.bombs = 2; player.cool = 0; player.inv = 2; player.alive = true; player.speed = 350;
  resetProgression();
  resetRunFlow();
  resetDirector();
  startWave(1);
  ui.start.classList.add('hidden');
  ui.over.classList.add('hidden');
  ui.pause.classList.add('hidden');
  hideMenu();
  hideRewardChoice();
  ui.hud.classList.remove('hidden');
  if (isTouch) ui.btnBomb.classList.remove('hidden');
  ui.btnPause.classList.remove('hidden');
  refreshHud();
}

function pauseGame() {
  if (G.mode !== 'playing' || runState.phase === 'reward') return;
  G.mode = 'paused';
  ui.pause.classList.remove('hidden');
  ui.btnBomb.classList.add('hidden');
  ui.btnPause.classList.add('hidden');
  ui.pauseInfo.innerHTML = '得分 ' + G.score + ' · 第 ' + G.wave + ' 波<br>火力：'
    + weaponName(player.wstage) + '（Lv' + player.wlevel + '）';
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
  ui.eventPanel.classList.add('hidden');
  hideRewardChoice();
  ui.over.classList.remove('hidden');
}

// 返回入口页：可重新选择难度 / 无限生命等配置
function backToMenu() {
  sfx.select();
  sfx.stopMusic();
  G.mode = 'start';
  exitFullscreen();
  ui.over.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.eventPanel.classList.add('hidden');
  hideRewardChoice();
  ui.start.classList.remove('hidden');
  showMenu('start');
}

// ---------------- 输入分发 ----------------
function handleGlobalInput() {
  var confirm = input.consumeConfirm();
  var pause = input.consumePause();
  var bomb = input.consumeBomb();
  var up = input.consumeUp();     // 每帧消费，避免游戏中的残留边沿影响菜单
  var down = input.consumeDown();
  var moved = false;

  switch (G.mode) {
    case 'start':
      if (up) { setMenuFocus(activeMenu, activeMenu.idx - 1); moved = true; }
      else if (down) { setMenuFocus(activeMenu, activeMenu.idx + 1); moved = true; }
      if (moved) sfx.select();
      else if (confirm) activeMenu.items[activeMenu.idx].click();
      break;
    case 'playing':
      if (runState.phase === 'reward') {
        if (up && activeMenu) { setMenuFocus(activeMenu, activeMenu.idx - 1); moved = true; }
        else if (down && activeMenu) { setMenuFocus(activeMenu, activeMenu.idx + 1); moved = true; }
        if (moved) sfx.select();
        else if (confirm && activeMenu) activeMenu.items[activeMenu.idx].click();
        break;
      }
      if (pause) { pauseGame(); break; }
      if (bomb) useBomb();
      break;
    case 'paused':
      if (pause || confirm) resumeGame();
      break;
    case 'over':
      if (overLockT <= 0) {
        if (up) { setMenuFocus(activeMenu, activeMenu.idx - 1); moved = true; }
        else if (down) { setMenuFocus(activeMenu, activeMenu.idx + 1); moved = true; }
        if (moved) sfx.select();
        else if (confirm) activeMenu.items[activeMenu.idx].click();
        else if (bomb) backToMenu(); // ◯ 返回入口页
      }
      break;
  }
}

// ---------------- 主更新 ----------------
function update(dt) {
  G.time += dt;
  if (banner.t > 0) banner.t -= dt;
  updateBg(dt);
  if (runState.phase !== 'reward') updatePlayer(dt);
  if (isCombatRunPhase()) {
    updateDirector(dt);
    updateEnemies(dt);
    if (boss) updateBoss(dt);
    updateBullets(dt);
    updateEBullets(dt);
    updatePowerups(dt);
    handleCollisions();
  } else if (runState.phase === 'gate' || runState.phase === 'event') {
    updateRunFlow(dt);
  }
  updateParticles(dt);
  updateFloaters(dt);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - 60 * dt);
  if (G.flash > 0) G.flash = Math.max(0, G.flash - 1.4 * dt);
  if (isCombatRunPhase() && !player.alive) {
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
ui.btnHome.addEventListener('click', backToMenu);
ui.btnModeEasy.addEventListener('click', function () { setDiffMode('easy'); });
ui.btnModeNormal.addEventListener('click', function () { setDiffMode('normal'); });
ui.btnInfinite.addEventListener('click', toggleInfiniteLives);
DIFF = DIFF_PRESETS[G.diffMode];
applyModeSelection();
showMenu('start');
// 鼠标悬停时同步菜单焦点，避免焦点环与指针位置脱节
Object.keys(menus).forEach(function (name) {
  menus[name].items.forEach(function (el, i) {
    el.addEventListener('pointerenter', function () {
      if (activeMenu === menus[name]) setMenuFocus(menus[name], i);
    });
  });
});
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
