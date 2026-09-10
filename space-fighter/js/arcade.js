/* 街机战斗节奏 v2.9：连续击破 / 擦弹充能 / 自动超载。 */
var ARCADE = { comboSeconds: 4, burstSeconds: 6, killEnergy: 8, grazeEnergy: 5 };
var arcade = {};

function resetArcade() {
  arcade = { combo: 0, comboTime: 0, bestCombo: 0, kills: 0, grazes: 0, energy: 0, burst: 0, bursts: 0 };
}

function comboMultiplier() { return Math.min(4, 1 + Math.floor(arcade.combo / 5)); }

function chargeArcade(amount) {
  if (player.alive && arcade.burst <= 0) arcade.energy = Math.min(100, arcade.energy + amount);
}

function awardArcadeKill(points) {
  // 玩家阵亡后的残余爆炸不累计连击或充能。
  if (!player.alive) return points;
  arcade.combo++;
  arcade.kills++;
  arcade.comboTime = ARCADE.comboSeconds;
  arcade.bestCombo = Math.max(arcade.bestCombo, arcade.combo);
  chargeArcade(ARCADE.killEnergy);
  return points * comboMultiplier();
}

function breakArcadeCombo() {
  arcade.combo = 0;
  arcade.comboTime = 0;
}

function grazeBullet(bullet) {
  if (bullet.grazed || player.inv > 0 || !player.alive) return;
  bullet.grazed = true;
  arcade.grazes++;
  G.score += 25;
  chargeArcade(ARCADE.grazeEnergy);
  sparks(bullet.x, bullet.y, 3, '#74ffe2');
  addFloat('擦弹 +25', player.x, player.y - 42, '#74ffe2');
}

function updateArcade(dt) {
  if (!isCombatRunPhase() || !player.alive) return;
  arcade.comboTime = Math.max(0, arcade.comboTime - dt);
  if (!arcade.comboTime) arcade.combo = 0;
  arcade.burst = Math.max(0, arcade.burst - dt);
  // 在碰撞循环外触发清弹，避免修改正在遍历的敌弹列表。
  if (arcade.energy >= 100 && arcade.burst <= 0) {
    arcade.energy = 0;
    arcade.burst = ARCADE.burstSeconds;
    arcade.bursts++;
    ebullets.length = 0;
    player.inv = Math.max(player.inv, 0.8);
    player.cool = 0;
    explosion(player.x, player.y, 48, 24);
    showBanner('超载启动 · 火力全开', '#74ffe2', 1.5);
    sfx.evolve();
    input.vibrate(240, 0.7, 0.5);
  }
}

resetArcade();
