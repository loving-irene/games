'use strict';

// 执行真实实体与状态机，DOM/音频替身只隔离浏览器环境。
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var root = path.resolve(__dirname, '..');
var testMath = Object.create(Math);
var seed = 2909;
testMath.random = function () {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
var elements = {};
function element(id) {
  if (elements[id]) return elements[id];
  var classes = new Set();
  var handlers = {};
  return elements[id] = {
    id: id, style: {}, textContent: '', innerHTML: '', children: [],
    classList: {
      add: function (v) { classes.add(v); }, remove: function (v) { classes.delete(v); },
      contains: function (v) { return classes.has(v); },
      toggle: function (v, yes) { if (yes) classes.add(v); else classes.delete(v); }
    },
    addEventListener: function (name, fn) { handlers[name] = fn; },
    click: function () { if (handlers.click) handlers.click(); },
    appendChild: function (v) { this.children.push(v); },
    getContext: function () { return {}; }
  };
}
var c = {
  console: console, Math: testMath, Set: Set,
  localStorage: { getItem: function () { return null; }, setItem: function () {} },
  document: { getElementById: element, createElement: function () { return element('choice-' + Math.random()); }, documentElement: {}, addEventListener: function () {} },
  window: { innerWidth: 1280, innerHeight: 800, addEventListener: function () {} },
  performance: { now: function () { return 0; } }, requestAnimationFrame: function () {},
  render: function () {},
  sfx: new Proxy({}, { get: function () { return function () {}; } }),
  Input: function () {
    this.moveX = this.moveY = this.fireStrength = 0;
    this.vibrate = function () {};
    this.poll = function () {};
    this.consumeConfirm = this.consumePause = this.consumeBomb = this.consumeUp = this.consumeDown = function () { return false; };
  }
};
vm.createContext(c);
['entities', 'arcade', 'progression', 'events', 'game'].forEach(function (name) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8'), c, { filename: name + '.js' });
});
function start() { c.startGame(); c.player.inv = 0; }

start();
for (var i = 0; i < 15; i++) {
  c.enemies.push({ type: 'grunt', x: 100, y: 100, hp: 1, score: 100 });
  c.killEnemy(0);
}
assert.equal(c.G.score, 3300, '第 5/10/15 次击破应依次进入 2/3/4 倍得分');
assert.equal(c.arcade.bestCombo, 15);
assert.equal(c.arcade.energy, 100, '充能必须封顶');
c.ebullets.push({ x: 10, y: 10 });
c.updateArcade(0.016);
assert.equal(c.arcade.burst, 6);
assert.equal(c.ebullets.length, 0, '超载启动应清弹');
assert.equal(c.arcade.energy, 0);
c.bullets.length = 0;
c.shoot();
assert.equal(c.bullets[0].dmg, c.stagePattern(1, 1)[0].dmg * 1.5);
c.player.cool = 0;
c.updatePlayer(0.016);
assert.equal(c.player.cool, c.WEAPON_STAGES[0].cool[0] * 0.5);
c.chargeArcade(100);
assert.equal(c.arcade.energy, 0, '超载中不可积攒下一轮能量');
var beforePause = c.arcade.burst;
c.pauseGame(); c.frame(16);
assert.equal(c.arcade.burst, beforePause, '暂停主循环不得消耗超载时间');
c.resumeGame();
c.setRunPhase('minigame'); c.updateArcade(10);
assert.equal(c.arcade.burst, beforePause, '小游戏不得消耗超载时间');
c.setRunPhase('combat'); c.updateArcade(6);
assert.equal(c.arcade.burst, 0);
assert.equal(c.arcade.combo, 0, '超时清除连击');
assert.equal(c.arcade.bestCombo, 15, '保留本局最高连击');

start();
c.player.inv = 1;
c.enemies.push({ type: 'tank', x: 100, y: 100, r: 22, hp: 10, score: 400 });
c.bullets.push({ x: 100, y: 100, dmg: 3 });
c.ebullets.push({ x: c.player.x, y: c.player.y - 4, r: 5 });
c.handleCollisions();
assert.equal(c.enemies[0].hp, 7, '无敌期间己方子弹仍应造成伤害');
assert.equal(c.player.hp, 3, '无敌期间敌弹不得扣血');
assert.equal(c.arcade.grazes, 0, '无敌期间不得刷擦弹');

start();
var near = { x: c.player.x + 28, y: c.player.y - 4, r: 5 };
c.ebullets.push(near);
c.handleCollisions(); c.handleCollisions();
assert.equal(c.G.score, 25, '同一颗敌弹最多奖励一次擦弹');
assert.equal(c.arcade.energy, 5);
assert.equal(c.player.hp, 3);
c.awardArcadeKill(100);
near.x = c.player.x;
c.handleCollisions();
assert.equal(c.player.hp, 2, '擦弹后的敌弹仍可造成伤害');
assert.equal(c.arcade.combo, 0, '受击中断连击');
c.player.inv = 0; c.player.shield = true; c.awardArcadeKill(100); c.playerHit();
assert.equal(c.arcade.combo, 0, '护盾受击也中断连击');
assert.equal(c.player.hp, 2);

start();
c.spawnOrb(270);
c.enemies[0].y = c.enemies[0].ty;
c.enemies[0].fireT = 0;
c.updateEnemies(0.016);
assert.equal(c.ebullets.length, 10);
assert.ok(c.ebullets.every(function (b) { return Number.isFinite(b.vx) && Number.isFinite(b.vy); }), '球形敌弹速度不能为 NaN');

start();
c.runState.miniGameUsed = true;
c.player.x = 140; c.player.y = 610; c.player.cool = 0.1;
c.input.moveX = 1;
var carriedShot = { x: 120, y: 300, vx: 0, vy: -640, dmg: 1 };
var carriedEnemyShot = { x: 430, y: 320, vx: 0, vy: 150, r: 5 };
c.bullets.push(carriedShot); c.ebullets.push(carriedEnemyShot);
c.spawnPowerup(350, 250, 'P');
var carriedLoot = c.powerups[0];
c.director.spawned = c.director.quota;
c.director.waveDoneT = 0;
c.update(0.016);
assert.equal(c.G.wave, 2, '通过真实更新循环进入下一波');
assert.equal(c.player.x, 140 + c.player.speed * 0.016, '切波时延续当前移动');
assert.equal(c.player.y, 610, '切波时不重置纵坐标');
assert.equal(c.player.inv, 0, '普通切波不重新触发无敌闪烁');
assert.equal(c.player.cool, 0.1 - 0.016, '射击冷却连续');
assert.ok(c.bullets.includes(carriedShot) && carriedShot.y < 300, '己方在途弹体连续飞行');
assert.ok(c.ebullets.includes(carriedEnemyShot) && carriedEnemyShot.y > 320, '敌方在途弹体连续飞行');
assert.ok(c.powerups.includes(carriedLoot) && carriedLoot.y > 250, '掉落物跨波次保留并继续移动');
c.finishWaveFlow(29);
assert.equal(c.runState.phase, 'boss');
assert.equal(c.player.y, 610, '进入 BOSS 预警不重置位置');
c.finishWaveFlow(30);
assert.equal(c.runState.phase, 'reward');
assert.equal(c.ebullets.length, 0, '奖励菜单前清理战斗对象');
c.rewardCallback('star');
assert.equal(c.G.wave, 31);
assert.equal(c.player.y, 610, '领取 BOSS 奖励后保持位置');

start();
c.input.moveX = 0;
c.player.x = 125; c.player.y = 590;
c.runState.miniGameWave = 1;
c.finishWaveFlow(1);
assert.equal(c.runState.phase, 'mini-choice');
c.updateRunFlow(5);
assert.equal(c.G.wave, 2);
assert.equal(c.player.x, 125, '小游戏选择超时后保持横坐标');
assert.equal(c.player.y, 590, '小游戏选择超时后保持纵坐标');

['maze', 'jump'].forEach(function (kind) {
  [true, false].forEach(function (success) {
    start();
    c.player.x = 175; c.player.y = 570;
    c.runState.pendingWave = 2;
    c.startMiniGame(kind);
    assert.notEqual(c.player.y, 570, '小游戏仍使用独立起点');
    c.player.y = c.LH + 90;
    c.finishMiniGame(success);
    assert.equal(c.player.x, 175, kind + '结束后恢复战斗横坐标');
    assert.equal(c.player.y, 570, kind + '结束后恢复战斗纵坐标');
    assert.equal(c.G.wave, 2);
    assert.ok(c.player.inv >= 1.2, '从小游戏返回保留过渡保护');
    if (success) assert.equal(c.powerups[0].x, 175, '成功补给出现在返回位置附近');
  });
});

start();
c.runState.miniGameUsed = true;
c.G.infiniteLives = true;
for (var tick = 0; tick < 120 * 60; tick++) {
  c.input.moveX = Math.sin(tick / 95);
  c.update(1 / 60);
}
assert.ok(c.G.wave >= 3, '两分钟自动战斗应能推进波次');
assert.ok(c.arcade.kills > 0, '真实战斗必须发生击破');
assert.ok(c.ebullets.every(function (b) { return Number.isFinite(b.x) && Number.isFinite(b.y); }));
c.gameOver();
assert.match(c.ui.runStats.textContent, /最高连击/);
assert.equal(c.activeMenu, c.menus.over, '结算界面必须恢复键盘与手柄菜单焦点');
c.overLockT = 0;
c.input.consumeConfirm = function () { return true; };
c.handleGlobalInput();
assert.equal(c.G.mode, 'playing', '结算界面的确认键应启动新一局');
c.input.consumeConfirm = function () { return false; };
start();
assert.equal(c.arcade.kills, 0); assert.equal(c.arcade.burst, 0); assert.equal(c.arcade.bestCombo, 0);
c.startStandaloneMiniGame('jump');
assert.equal(c.runState.phase, 'minigame');
assert.equal(c.arcade.energy, 0);
console.log('arcade integration tests passed (combo, graze, burst, wave transitions, minigame return, restart, 120s combat)');
