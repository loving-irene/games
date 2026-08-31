/*
 * 实体与逻辑：小队 / 敌人 / 子弹 / 道具 / 粒子 / 浮字 / 刷怪导演 / 碰撞
 * （共享全局作用域，加载顺序：input.js -> audio.js -> entities.js -> render.js -> game.js）
 *
 * 核心机制（与参考素材一致）：
 *   - 桥面前后等宽，不透视收缩
 *   - 玩家带领一队士兵，只能左右移动，士兵人数 = 生命
 *   - 站在桥的左半边，子弹即可打到桥左面上的所有敌人；右半边同理
 *   - 攻击全自动，只能向前；敌人从桥对面沿桥走来
 *   - 桥面上随机漂来道具：武器升级 / +N 士兵 / x2 翻倍
 */

var TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function rand(a, b) { return a + Math.random() * (b - a); }

// ---------------- 场景常量（桥面等宽） ----------------
var LW = 960, LH = 540;          // 逻辑分辨率
var HORIZON_Y = 150;             // 海平线 / 桥远端
var PLAYER_Y = 448;              // 防线所在横线（屏幕坐标）
var SPAWN_Y = 208;               // 敌人出生线（桥对面）
var DECK_HALF = 290;             // 桥面逻辑半宽（渲染时远端透视收缩为 80%）
var MAX_SQUAD = 16;              // 士兵人数上限
var MAX_LEVEL = 5;               // 武器等级上限

// 深度缩放：仅用于视觉尺寸（近大远小），不影响桥面宽度与敌人列位
function depthScale(y) {
  return clamp((y - HORIZON_Y) / (PLAYER_Y - HORIZON_Y), 0.45, 1.2);
}

// ---------------- 小队（玩家 + 士兵） ----------------
var squad = { count: 3, level: 1 };

var player = {
  x: 480,
  speed: 430,
  cool: 0,     // 射击冷却
  flash: 0,    // 枪口闪光
  hurtT: 0,    // 受击闪红
  alive: true
};

// 各士兵的横向站位：以玩家为中心等距排布，逐个夹在桥面内
function soldierXs() {
  var xs = [], n = squad.count;
  if (n <= 0) return xs;
  var spacing = Math.min(34, (DECK_HALF * 2 - 60) / Math.max(1, n - 1));
  var x0 = player.x - (n - 1) * spacing / 2;
  for (var i = 0; i < n; i++) {
    xs.push(clamp(x0 + i * spacing, LW / 2 - DECK_HALF + 22, LW / 2 + DECK_HALF - 22));
  }
  return xs;
}

// 武器等级：射速更快、伤害更高
function weaponCool() { return 0.16 * Math.pow(0.88, squad.level - 1); }
function weaponDmg()  { return 1 + Math.floor((squad.level - 1) / 2); }

// ---------------- 实体容器 ----------------
var bullets = [];
var enemies = [];
var powerups = [];
var particles = [];
var floaters = [];

function addFloat(text, x, y, color) {
  floaters.push({ text: text, x: x, y: y, t: 1, color: color || '#ffffff' });
}

// ---------------- 敌人类型（贴图渲染，r 仅作碰撞半径） ----------------
var ENEMY_TYPES = {
  grunt:  { hp: 3,  spd: 62,  r: 15, dispH: 62 },   // 普通
  runner: { hp: 2,  spd: 100, r: 12, dispH: 54 },   // 快速
  brute:  { hp: 12, spd: 40,  r: 22, dispH: 96 }    // 重型
};

// 怪兽素材表切块（asset_94Qyad3lbmqi1tOF.png，1536×1024）
// 每类各配一组不同怪兽，刷怪时同类随机取一只
var MONSTER_SPRITES = {
  grunt: [                                     // 第 1 行：小体型
    { x: 22,   y: 45,  w: 116, h: 181 },
    { x: 164,  y: 13,  w: 116, h: 210 },
    { x: 290,  y: 22,  w: 124, h: 202 },
    { x: 439,  y: 13,  w: 140, h: 211 },
    { x: 593,  y: 34,  w: 137, h: 195 }
  ],
  runner: [                                    // 第 2 行：偏瘦长
    { x: 136,  y: 231, w: 128, h: 209 },
    { x: 298,  y: 259, w: 135, h: 184 },
    { x: 434,  y: 241, w: 141, h: 201 },
    { x: 596,  y: 252, w: 156, h: 188 },
    { x: 779,  y: 280, w: 134, h: 161 }
  ],
  brute: [                                     // 第 3/4 行：大体型
    { x: 194,  y: 447, w: 220, h: 215 },
    { x: 961,  y: 442, w: 218, h: 231 },
    { x: 1211, y: 445, w: 283, h: 220 },
    { x: 780,  y: 645, w: 223, h: 252 },
    { x: 1020, y: 674, w: 272, h: 225 },
    { x: 1316, y: 666, w: 193, h: 228 }
  ]
};

function spawnEnemy() {
  var t = G.time, r = Math.random(), type;
  var pb = t < 25 ? 0 : Math.min(0.22, (t - 25) * 0.004); // brute 25 秒后登场
  var pr = Math.min(0.34, 0.08 + t * 0.003);
  if (r < pb) type = 'brute';
  else if (r < pb + pr) type = 'runner';
  else type = 'grunt';
  var def = ENEMY_TYPES[type];
  var sprites = MONSTER_SPRITES[type];
  enemies.push({
    type: type,
    x: LW / 2 + rand(-0.94, 0.94) * (DECK_HALF - 30), // 桥面等宽，直接存 x
    y: SPAWN_Y,
    hp: def.hp, maxHp: def.hp,
    sp: sprites[(Math.random() * sprites.length) | 0], // 同类随机外观
    bob: rand(0, TAU),
    hurt: 0,
    dead: false
  });
}

// 刷怪导演：持续生成，间隔随时间递减
var spawnT = 1.2;

function updateDirector(dt) {
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnEnemy();
    spawnT = Math.max(0.55, 2.2 - G.time * 0.022) * rand(0.75, 1.25);
  }
  // 道具生成：首个 6 秒后，之后每 8~12 秒一个
  powerT -= dt;
  if (powerT <= 0) {
    spawnPowerup();
    powerT = rand(8, 12);
  }
}

// ---------------- 道具：武器升级 / +N 士兵 / x2 翻倍 ----------------
var powerT = 6;

function spawnPowerup() {
  var r = Math.random(), kind, n = 0;
  if (r < 0.35) kind = 'weapon';
  else if (r < 0.75) { kind = 'add'; n = Math.random() < 0.5 ? 2 : 3; }
  else kind = 'double';
  powerups.push({
    kind: kind, n: n,
    x: LW / 2 + rand(-0.85, 0.85) * (DECK_HALF - 46),
    y: SPAWN_Y + 10,
    bob: rand(0, TAU)
  });
}

function applyPowerup(p) {
  if (p.kind === 'weapon') {
    if (squad.level < MAX_LEVEL) squad.level++;
    addFloat('武器 Lv ' + squad.level, p.x, PLAYER_Y - 90, '#ffd25d');
  } else if (p.kind === 'add') {
    squad.count = Math.min(MAX_SQUAD, squad.count + p.n);
    addFloat('+' + p.n + ' 士兵', p.x, PLAYER_Y - 90, '#7ce8a0');
  } else {
    squad.count = Math.min(MAX_SQUAD, squad.count * 2);
    addFloat('x2 翻倍', p.x, PLAYER_Y - 90, '#ffab5c');
  }
  sfx.powerup();
}

// 同侧锁定：side=1 找右半边最近的敌人，side=-1 找左半边
function pickTarget(side) {
  var best = null, bestD = Infinity;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    if (side === -1 ? e.x >= LW / 2 : e.x < LW / 2) continue; // 只打同侧
    var d = Math.abs(e.y - PLAYER_Y) + Math.abs(e.x - LW / 2) * 0.4; // 优先近身
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// ---------------- 玩家更新：左右移动 + 各士兵自动向前开火 ----------------
function updatePlayer(dt) {
  if (input.touchActive) {
    // 触屏：跟随手指 x
    player.x += (input.touchX - player.x) * Math.min(1, 14 * dt);
  } else {
    player.x += input.moveX * player.speed * dt;
  }
  player.x = clamp(player.x, LW / 2 - DECK_HALF + 26, LW / 2 + DECK_HALF - 26);

  player.flash = Math.max(0, player.flash - dt);
  player.hurtT = Math.max(0, player.hurtT - dt);

  // 攻击全自动、只能向前；每个士兵一发，锁定各自一侧最近的敌人
  player.cool -= dt;
  if (player.cool <= 0 && squad.count > 0) {
    player.cool = weaponCool();
    var xs = soldierXs();
    for (var i = 0; i < xs.length; i++) {
      var side = xs[i] >= LW / 2 ? 1 : -1;
      bullets.push({
        x: xs[i] + rand(-1.5, 1.5), y: PLAYER_Y - 14,
        dmg: weaponDmg(), side: side,
        target: pickTarget(side)
      });
    }
    player.flash = 0.06;
    sfx.shoot();
  }
}

// ---------------- 子弹：向前飞行 + 微追踪锁定目标 ----------------
function updateBullets(dt) {
  for (var i = bullets.length - 1; i >= 0; i--) {
    var b = bullets[i];
    b.y -= 640 * dt;
    if (b.target && b.target.dead) b.target = null; // 目标已死，直线前进
    if (b.target) b.x += (b.target.x - b.x) * Math.min(1, 9 * dt);
    if (b.y < SPAWN_Y - 12) bullets.splice(i, 1);
  }
}

// ---------------- 敌人：从桥对面沿固定列走来 ----------------
function updateEnemies(dt) {
  for (var i = enemies.length - 1; i >= 0; i--) {
    var e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    var def = ENEMY_TYPES[e.type];
    e.bob += dt * 9 * (def.spd / 62);
    e.hurt = Math.max(0, e.hurt - dt);
    e.y += def.spd * (0.25 + depthScale(e.y)) * dt;

    // 走到防线：近战得手，损失一名士兵后消失
    if (e.y >= PLAYER_Y - 4) {
      loseSoldier(e);
      e.dead = true;
      enemies.splice(i, 1);
    }
  }
}

// ---------------- 士兵损失（敌人近战） / 小队覆灭 ----------------
function loseSoldier(e) {
  if (!player.alive || G.mode !== 'playing') return;
  sparks(e.x, PLAYER_Y - 14, 10, '#ffb066', 1);
  squad.count -= 1;
  player.hurtT = 0.35;
  G.shake = 8;
  sfx.hurt();
  input.vibrate(140, 1, 0.5);
  if (squad.count <= 0) {
    squad.count = 0;
    player.alive = false;
  }
}

// ---------------- 道具更新：向防线漂来，士兵接取 ----------------
function updatePowerups(dt) {
  for (var i = powerups.length - 1; i >= 0; i--) {
    var p = powerups[i];
    p.bob += dt * 4;
    p.y += 60 * dt;
    if (p.y >= PLAYER_Y - 6) {
      var xs = soldierXs(), got = false;
      for (var j = 0; j < xs.length; j++) {
        if (Math.abs(xs[j] - p.x) < 30) { got = true; break; }
      }
      if (got) { applyPowerup(p); powerups.splice(i, 1); }
      else if (p.y > LH + 20) powerups.splice(i, 1);
    }
  }
}

function updateFloaters(dt) {
  for (var i = floaters.length - 1; i >= 0; i--) {
    var f = floaters[i];
    f.t -= dt;
    f.y -= 34 * dt;
    if (f.t <= 0) floaters.splice(i, 1);
  }
}

// ---------------- 击中特效（素材表最下一行的爆炸帧） ----------------
// kind: 'hit' 子弹命中 | 'boom' 击杀爆炸
var hitFxs = [];

function addHitFx(x, y, kind) {
  hitFxs.push({ x: x, y: y, kind: kind, t: 0, dur: kind === 'boom' ? 0.3 : 0.16 });
}

function updateHitFx(dt) {
  for (var i = hitFxs.length - 1; i >= 0; i--) {
    var f = hitFxs[i];
    f.t += dt;
    if (f.t >= f.dur) hitFxs.splice(i, 1);
  }
}

// ---------------- 碰撞：子弹 vs 敌人 ----------------
function handleCollisions() {
  for (var i = bullets.length - 1; i >= 0; i--) {
    var b = bullets[i];
    for (var j = enemies.length - 1; j >= 0; j--) {
      var e = enemies[j];
      if (e.dead) continue;
      var def = ENEMY_TYPES[e.type];
      var s = depthScale(e.y);
      var r = def.r * s;
      if (Math.abs(b.x - e.x) < r * 0.9 + 5 && Math.abs(b.y - e.y) < r + 9) {
        e.hp -= b.dmg;
        e.hurt = 0.08;
        sparks(b.x, b.y, 3, '#ffd25d', s);
        addHitFx(b.x, b.y, 'hit');
        sfx.hit();
        bullets.splice(i, 1);
        if (e.hp <= 0) {
          e.dead = true; // 先标记，防止子弹悬挂引用
          G.kills += 1;
          addHitFx(e.x, e.y, 'boom');
          explosion(e.x, e.y, r * 2.4, 8);
          sfx.enemyDie();
          enemies.splice(j, 1);
        }
        break;
      }
    }
  }
}

// ---------------- 粒子 ----------------
function sparks(x, y, n, color, s) {
  s = s || 1;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU, sp = rand(30, 120) * (0.4 + s * 0.6);
    particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.12, 0.28), max: 0.28, r: rand(1, 2.4), color: color });
  }
}

function explosion(x, y, size, count) {
  var colors = ['#ffd25d', '#ff8a5c', '#ff5d6c', '#ffffff'];
  for (var i = 0; i < count; i++) {
    var a = Math.random() * TAU, sp = rand(20, 40 + size * 4);
    particles.push({
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
      life: rand(0.25, 0.55), max: 0.55, r: rand(1.5, size / 5 + 2),
      color: colors[(Math.random() * colors.length) | 0]
    });
  }
  particles.push({ ring: true, x: x, y: y, r: 2, vr: size * 8, life: 0.3, max: 0.3, color: '#ffe9b0' });
}

function updateParticles(dt) {
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    if (p.ring) { p.r += p.vr * dt; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.95; p.vy *= 0.95;
  }
}
