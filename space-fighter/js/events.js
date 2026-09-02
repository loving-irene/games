/*
 * 星际远征流程：小游戏选择 / 迷宫 / 跳一跳 / BOSS 后模块奖励
 * （共享全局作用域，加载顺序：progression.js -> events.js -> render.js）
 */

var MINI_GAME_DEFS = {
  maze: { name: '星际迷宫', icon: '⌘', color: '#6cf2ff', desc: '穿过迷宫抵达能量核心' },
  jump: { name: '星际跳一跳', icon: '◆', color: '#ffd25d', desc: '连续跳上平台，抵达终点' }
};

var runState = {};

function resetRunFlow() {
  runState = { phase: 'combat', choiceTime: 0, pendingWave: 1, rewardType: '', miniGame: null };
}

function setRunPhase(phase) { runState.phase = phase; }
function isCombatRunPhase() { return runState.phase === 'combat' || runState.phase === 'boss'; }
function isAutoFireEnabled() { return isCombatRunPhase(); }

function clearCombatObjects() {
  bullets.length = 0;
  ebullets.length = 0;
  enemies.length = 0;
  powerups.length = 0;
}

function finishWaveFlow(wave) {
  runState.pendingWave = wave + 1;
  clearCombatObjects();
  if (wave % 30 === 0) startModuleReward(true, 3);
  else startMiniGameChoice();
}

function startModuleReward(rare, count) {
  setRunPhase('reward');
  runState.rewardType = 'module';
  showRewardChoice(rare ? '稀有模块' : '回收模块', '模块会自动寻找可用合成配方', getModuleChoices(count, rare), function (id) {
    addWeaponModule(id);
    advanceRunWave();
  });
}

function startMiniGameChoice() {
  setRunPhase('mini-choice');
  runState.choiceTime = 5;
  var choices = shuffledCopy(Object.keys(MINI_GAME_DEFS).map(function (id) {
    var def = MINI_GAME_DEFS[id];
    return { id: id, icon: def.icon, name: def.name, desc: def.desc };
  }));
  runState.miniChoices = choices;
  showMiniGameChoice(choices, startMiniGame);
}

function skipMiniGameChoice() {
  if (runState.phase !== 'mini-choice') return;
  rewardCallback = null;
  hideRewardChoice();
  showBanner('跳过小游戏', '#9fc4ef', 1.1);
  advanceRunWave();
}

function startMiniGame(kind) {
  var def = MINI_GAME_DEFS[kind];
  if (!def) return;
  setRunPhase('minigame');
  clearCombatObjects();
  player.inv = 1;
  player.x = LW / 2;
  player.y = LH - 140;
  runState.miniGame = { kind: kind, time: kind === 'maze' ? 20 : 24, maxTime: kind === 'maze' ? 20 : 24, score: 0 };
  if (kind === 'maze') setupMazeGame(runState.miniGame);
  else setupJumpGame(runState.miniGame);
  hideRewardChoice();
  showBanner(def.name, def.color, 1.6);
}

function setupMazeGame(game) {
  var cols = 13, rows = 17;
  var grid = [];
  for (var y = 0; y < rows; y++) grid.push(new Array(cols).fill(1));
  var stack = [{ x: 1, y: 1 }];
  grid[1][1] = 0;
  while (stack.length) {
    var cell = stack[stack.length - 1];
    var dirs = shuffledCopy([{ x: 2, y: 0 }, { x: -2, y: 0 }, { x: 0, y: 2 }, { x: 0, y: -2 }]);
    var carved = false;
    for (var i = 0; i < dirs.length; i++) {
      var nx = cell.x + dirs[i].x, ny = cell.y + dirs[i].y;
      if (nx <= 0 || nx >= cols - 1 || ny <= 0 || ny >= rows - 1 || grid[ny][nx] === 0) continue;
      grid[cell.y + dirs[i].y / 2][cell.x + dirs[i].x / 2] = 0;
      grid[ny][nx] = 0;
      stack.push({ x: nx, y: ny });
      carved = true;
      break;
    }
    if (!carved) stack.pop();
  }
  game.maze = { grid: grid, cols: cols, rows: rows, cell: 34, ox: (LW - cols * 34) / 2, oy: 150 };
  game.maze.start = { x: 1, y: 1 };
  game.maze.goal = { x: cols - 2, y: rows - 2 };
  player.x = game.maze.ox + 1.5 * game.maze.cell;
  player.y = game.maze.oy + 1.5 * game.maze.cell;
}

function setupJumpGame(game) {
  var meteors = [{ x: 270, y: 850, r: 72 }];
  for (var i = 1; i < 8; i++) {
    var previous = meteors[i - 1];
    meteors.push({ x: clamp(previous.x + rand(-145, 145), 72, LW - 72), y: 850 - i * 104, r: 48 - Math.min(8, i) });
  }
  game.jump = {
    gravity: 1150,
    vy: 0,
    vx: 0,
    meteorIndex: 0,
    meteors: meteors,
    landed: true,
    charging: false,
    charge: 0,
    maxCharge: 1.1,
    jumpDir: 0
  };
  player.x = meteors[0].x;
  player.y = meteors[0].y - player.r;
}

function mazeOpen(game, x, y) {
  var m = game.maze;
  var gx = Math.floor((x - m.ox) / m.cell), gy = Math.floor((y - m.oy) / m.cell);
  return gx >= 0 && gx < m.cols && gy >= 0 && gy < m.rows && m.grid[gy][gx] === 0;
}

function updateRunFlow(dt) {
  if (runState.phase === 'mini-choice') {
    runState.choiceTime -= dt;
    if (ui.choiceTimer) ui.choiceTimer.textContent = Math.max(0, Math.ceil(runState.choiceTime)) + 's';
    if (runState.choiceTime <= 0) skipMiniGameChoice();
  } else if (runState.phase === 'minigame') updateMiniGame(dt);
}

function updateMiniGame(dt) {
  var game = runState.miniGame;
  if (!game) return;
  game.time -= dt;
  if (game.kind === 'maze') updateMazeGame(game, dt);
  else updateJumpGame(game, dt);
  if (runState.phase === 'minigame' && game.time <= 0) finishMiniGame(false);
}

function updateMazeGame(game, dt) {
  var speed = 240, dx = input.moveX * speed * dt, dy = input.moveY * speed * dt, r = player.r - 3;
  if (input.touchActive) {
    var targetX = input.touchX, targetY = input.touchY;
    var td = Math.hypot(targetX - player.x, targetY - player.y);
    if (td > 4) {
      dx = (targetX - player.x) / td * Math.min(speed * dt, td);
      dy = (targetY - player.y) / td * Math.min(speed * dt, td);
    }
  }
  if (mazeOpen(game, player.x + dx + (dx < 0 ? -r : r), player.y) && mazeOpen(game, player.x + dx, player.y)) player.x += dx;
  if (mazeOpen(game, player.x, player.y + dy + (dy < 0 ? -r : r)) && mazeOpen(game, player.x, player.y + dy)) player.y += dy;
  var m = game.maze, gx = m.ox + (m.goal.x + 0.5) * m.cell, gy = m.oy + (m.goal.y + 0.5) * m.cell;
  if (Math.hypot(player.x - gx, player.y - gy) < 18) finishMiniGame(true);
}

function updateJumpGame(game, dt) {
  var j = game.jump;
  var jumpMove = input.moveX;
  if (input.touchActive) jumpMove = Math.abs(input.touchX - player.x) > 12 ? (input.touchX > player.x ? 1 : -1) : 0;
  if (j.landed) {
    if (input.fireStrength > 0) {
      j.charging = true;
      j.charge = Math.min(j.maxCharge, j.charge + dt * (0.65 + input.fireStrength * 0.35));
      if (jumpMove) j.jumpDir = jumpMove > 0 ? 1 : -1;
      return;
    }
    if (j.charging) {
      var power = j.charge / j.maxCharge;
      var next = j.meteors[Math.min(j.meteorIndex + 1, j.meteors.length - 1)];
      var dir = j.jumpDir || (next.x >= player.x ? 1 : -1);
      j.vy = -(360 + power * 460);
      j.vx = dir * (120 + power * 360);
      j.landed = false;
      j.charging = false;
      j.charge = 0;
      j.jumpDir = 0;
    }
    return;
  }
  player.x = clamp(player.x + (j.vx + jumpMove * 320) * dt, 25, LW - 25);
  j.vx *= Math.pow(0.18, dt);
  var previousBottom = player.y + player.r;
  j.vy += j.gravity * dt;
  player.y += j.vy * dt;
  for (var i = j.meteorIndex; i < j.meteors.length; i++) {
    var meteor = j.meteors[i];
    if (j.vy >= 0 && previousBottom <= meteor.y && player.y + player.r >= meteor.y && Math.abs(player.x - meteor.x) < meteor.r) {
      player.y = meteor.y - player.r;
      j.vy = 0;
      j.vx = 0;
      j.landed = true;
      if (i > j.meteorIndex) {
        j.meteorIndex = i;
        G.score += 100;
        addFloat('+100', player.x, player.y - 28, '#ffd25d');
        sfx.powerup();
      }
      if (i === j.meteors.length - 1) finishMiniGame(true);
      break;
    }
  }
  if (player.y > LH + 60) finishMiniGame(false);
}

function finishMiniGame(success) {
  if (runState.phase !== 'minigame') return;
  var game = runState.miniGame;
  runState.miniGame = null;
  showBanner(success ? '小游戏完成' : '小游戏结束', success ? '#7dffb0' : '#ffd25d', 1.4);
  if (success) G.score += game.kind === 'maze' ? 500 : 300;
  advanceRunWave();
  if (success) spawnPowerup(LW / 2, LH - 190, Math.random() < 0.5 ? 'P' : 'H');
}

function advanceRunWave() {
  hideRewardChoice();
  clearCombatObjects();
  player.x = LW / 2;
  player.y = LH - 140;
  player.inv = Math.max(player.inv, 1.2);
  startWave(runState.pendingWave);
}

function runHudData() {
  if (runState.phase === 'mini-choice') return { title: '选择小游戏', progress: Math.max(0, Math.ceil(runState.choiceTime)) + 's' };
  if (runState.phase !== 'minigame' || !runState.miniGame) return null;
  var game = runState.miniGame;
  var value = game.kind === 'maze' ? '找到能量核心' : '陨石 ' + (game.jump.meteorIndex + 1) + '/' + game.jump.meteors.length
    + (game.jump.charging ? ' · 蓄力 ' + Math.round(game.jump.charge / game.jump.maxCharge * 100) + '%' : '');
  return { title: MINI_GAME_DEFS[game.kind].name, progress: value + ' · ' + Math.max(0, Math.ceil(game.time)) + 's' };
}

resetRunFlow();
