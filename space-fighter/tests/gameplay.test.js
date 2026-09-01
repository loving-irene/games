'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.resolve(__dirname, '..');
var context = {
  console: console,
  Math: Math,
  player: { x: 270, y: 820, hp: 3, maxHp: 3, speed: 350, shield: false, wstage: 1, wlevel: 3 },
  G: { score: 0, wave: 1, flash: 0, shake: 0, diffMode: 'normal' },
  WEAPON_STAGES: Array.from({ length: 10 }, function (_, i) { return { color: '#fff', name: 'weapon-' + (i + 1) }; }),
  weaponName: function (id) { return 'weapon-' + id; },
  sfx: { levelup: function () {}, powerup: function () {}, evolve: function () {} },
  showBanner: function () {},
  explosion: function () {},
  bullets: [], ebullets: [], enemies: [], powerups: [],
  routeCalls: []
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'progression.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'events.js'), 'utf8'), context);

context.resetProgression();
var choices = context.getUpgradeChoices(3);
assert.strictEqual(choices.length, 3, '成长选择数量应为 3');
assert.strictEqual(new Set(choices.map(function (item) { return item.id; })).size, 3, '成长选择不应重复');

context.applyUpgrade('overclock');
assert.strictEqual(context.weaponCooldown(1), 0.92, '一级超频应减少 8% 冷却');

context.applyUpgrade('engine');
assert.ok(Math.abs(context.player.speed - 385) < 1e-9, '一级推进增幅应增加 10% 速度');

context.addWeaponModule('pulse');
var fusionResult = context.addWeaponModule('lens');
assert.strictEqual(fusionResult.fusion.weapon, 2, '脉冲核心和扩散镜片应合成二号武器');
assert.strictEqual(context.player.wstage, 2, '合成后应切换武器类型');
assert.strictEqual(context.player.wlevel, 3, '合成后应保留武器等级');

context.clearCombatObjects = function () {};
context.startUpgradeReward = function () { context.routeCalls.push('upgrade'); };
context.startGateSelection = function () { context.routeCalls.push('gate'); };
context.startModuleReward = function (rare, count) { context.routeCalls.push(rare + ':' + count); };
context.finishWaveFlow(1);
context.finishWaveFlow(2);
context.finishWaveFlow(5);
assert.deepStrictEqual(Array.from(context.routeCalls), ['upgrade', 'gate', 'true:3'], '五波循环路由不正确');

console.log('gameplay tests passed');
