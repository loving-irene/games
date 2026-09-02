/*
 * 实体与逻辑：敌机 / BOSS / 子弹 / 道具 / 波次导演 / 碰撞
 * （共享全局作用域，加载顺序：entities.js -> render.js -> game.js）
 */

var TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function rand(a, b) { return a + Math.random() * (b - a); }

// ---------------- 星空 / 星云 ----------------
var stars = [];
var nebulas = [];
(function initBg() {
  for (var i = 0; i < 110; i++) {
    var z = Math.random();
    stars.push({ x: Math.random() * 540, y: Math.random() * 960, z: z, r: 0.6 + z * 1.6 });
  }
  var hues = ['70,90,220', '160,60,200', '40,150,190'];
  for (var n = 0; n < 3; n++) {
    nebulas.push({
      x: Math.random() * 540, y: Math.random() * 960,
      r: rand(140, 260), vy: rand(6, 14), c: hues[n]
    });
  }
})();

function updateBg(dt) {
  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    s.y += (40 + s.z * 170) * dt;
    if (s.y > 964) { s.y = -4; s.x = Math.random() * 540; }
  }
  for (var k = 0; k < nebulas.length; k++) {
    var nb = nebulas[k];
    nb.y += nb.vy * dt;
    if (nb.y - nb.r > 960) { nb.y = -nb.r; nb.x = Math.random() * 540; }
  }
}

// ---------------- 粒子 / 浮字 / 横幅 ----------------
var particles = [];
var floaters = [];
var banner = { text: '', color: '#eaf6ff', t: 0, max: 1 };

function sparks(x, y, n, color) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU, sp = rand(40, 160);
    particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.15, 0.3), max: 0.3, r: rand(1, 2.5), color: color });
  }
}

function explosion(x, y, size, count) {
  var colors = ['#ffd25d', '#ff8a5c', '#ff5d6c', '#ffffff'];
  for (var i = 0; i < count; i++) {
    var a = Math.random() * TAU, sp = rand(30, 40 + size * 5);
    particles.push({
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(0.3, 0.7), max: 0.7, r: rand(1.5, size / 6 + 2),
      color: colors[(Math.random() * colors.length) | 0]
    });
  }
  particles.push({ ring: true, x: x, y: y, r: 4, vr: size * 9, life: 0.32, max: 0.32, color: '#ffe9b0' });
}

function updateParticles(dt) {
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    if (p.ring) { p.r += p.vr * dt; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.96; p.vy *= 0.96;
  }
}

function addFloat(text, x, y, color) {
  floaters.push({ text: text, x: x, y: y, t: 0.9, color: color || '#eaf6ff' });
}

function updateFloaters(dt) {
  for (var i = floaters.length - 1; i >= 0; i--) {
    var f = floaters[i];
    f.t -= dt; f.y -= 42 * dt;
    if (f.t <= 0) floaters.splice(i, 1);
  }
}

function showBanner(text, color, dur) {
  banner.text = text; banner.color = color || '#eaf6ff';
  banner.t = dur || 2; banner.max = banner.t;
}

// ---------------- 武器 ----------------
// 10 种可合成武器 × 每种 5 级；吃 P 提升当前武器等级，武器类型由模块配方决定
// pattern 项：dx 水平偏移 / ang 角度(度) / dmg 伤害 / spd 弹速 /
//             pierce 贯穿 / homing 追踪转向速度 / amp 横向摆动幅度 / chain 链电溅射 / big 大弹
var WEAPON_STAGES = [
  { name: '脉冲机炮',   color: '#6cf2ff', cool: [0.16, 0.15, 0.15, 0.14, 0.13] },
  { name: '广域散弹',   color: '#9dff8a', cool: [0.26, 0.25, 0.24, 0.23, 0.22] },
  { name: '追踪飞弹',   color: '#ffd25d', cool: [0.36, 0.34, 0.32, 0.3, 0.28] },
  { name: '光子长矛',   color: '#7ddfff', cool: [0.3, 0.29, 0.28, 0.27, 0.25] },
  { name: '回旋刃',     color: '#ff9de2', cool: [0.27, 0.26, 0.25, 0.24, 0.22] },
  { name: '离子贯穿炮', color: '#c9a0ff', cool: [0.3, 0.29, 0.28, 0.27, 0.25] },
  { name: '电弧链射',   color: '#a7f4ff', cool: [0.28, 0.27, 0.26, 0.25, 0.23] },
  { name: '棱镜弹幕',   color: '#ffe27a', cool: [0.26, 0.25, 0.24, 0.23, 0.21] },
  { name: '等离子重炮', color: '#ff8a5c', cool: [0.44, 0.42, 0.4, 0.38, 0.35] },
  { name: '星辰风暴',   color: '#ffffff', cool: [0.32, 0.3, 0.29, 0.28, 0.26] }
];

function weaponName(stage) {
  return WEAPON_STAGES[stage - 1].name;
}

function stagePattern(stage, lv) {
  var shots = [], n, i, a0, step, dmg, cnt;
  switch (stage) {
    case 1: // 脉冲机炮：直射多联装
      if (lv === 1) shots = [{ dx: 0, ang: 0 }];
      else if (lv === 2) shots = [{ dx: -9, ang: 0 }, { dx: 9, ang: 0 }];
      else if (lv === 3) shots = [{ dx: -10, ang: 0 }, { dx: 10, ang: 0 }, { dx: 0, ang: -10 }, { dx: 0, ang: 10 }];
      else if (lv === 4) shots = [{ dx: -12, ang: 0 }, { dx: 12, ang: 0 }, { dx: -6, ang: -12 }, { dx: 6, ang: 12 }, { dx: 0, ang: -22 }, { dx: 0, ang: 22 }];
      else shots = [{ dx: -14, ang: 0 }, { dx: 14, ang: 0 }, { dx: 0, ang: -8 }, { dx: 0, ang: 8 }, { dx: -7, ang: -16 }, { dx: 7, ang: 16 }, { dx: 0, ang: -26 }, { dx: 0, ang: 26 }];
      for (i = 0; i < shots.length; i++) shots[i].dmg = 1;
      return shots;
    case 2: // 广域散弹：宽扇形覆盖
      n = 4 + lv; dmg = 1;
      a0 = -38; step = 76 / (n - 1);
      for (i = 0; i < n; i++) shots.push({ dx: 0, ang: a0 + step * i, dmg: dmg, spd: 600 });
      return shots;
    case 3: // 追踪飞弹：自动锁定最近敌人
      n = lv <= 2 ? 1 : lv <= 4 ? 2 : 3;
      for (i = 0; i < n; i++) shots.push({ dx: (i - (n - 1) / 2) * 16, ang: (i - (n - 1) / 2) * 8, dmg: 3, spd: 470, homing: 4.5 });
      return shots;
    case 4: // 光子长矛：细长贯穿直束
      n = lv <= 1 ? 1 : lv <= 3 ? 2 : 3; dmg = lv <= 2 ? 2 : 3;
      for (i = 0; i < n; i++) shots.push({ dx: (i - (n - 1) / 2) * 14, ang: 0, dmg: dmg, spd: 780, pierce: true });
      return shots;
    case 5: // 回旋刃：左右摆动的飞刃
      n = lv <= 2 ? 1 : lv <= 4 ? 2 : 3; dmg = 2;
      for (i = 0; i < n; i++) shots.push({ dx: (i - (n - 1) / 2) * 18, ang: 0, dmg: dmg, spd: 520, amp: 190 });
      return shots;
    case 6: // 离子贯穿炮：粗贯穿光束
      if (lv === 1) shots = [{ dx: 0, ang: 0, dmg: 2 }];
      else if (lv === 2) shots = [{ dx: -12, ang: 0, dmg: 2 }, { dx: 12, ang: 0, dmg: 2 }];
      else if (lv === 3) shots = [{ dx: -12, ang: 0, dmg: 3 }, { dx: 12, ang: 0, dmg: 3 }];
      else if (lv === 4) shots = [{ dx: -13, ang: 0, dmg: 3 }, { dx: 13, ang: 0, dmg: 3 }, { dx: 0, ang: -14, dmg: 2 }, { dx: 0, ang: 14, dmg: 2 }];
      else shots = [{ dx: -14, ang: 0, dmg: 3 }, { dx: 14, ang: 0, dmg: 3 }, { dx: 0, ang: -12, dmg: 2 }, { dx: 0, ang: 12, dmg: 2 }, { dx: -6, ang: -26, dmg: 2 }, { dx: 6, ang: 26, dmg: 2 }];
      for (i = 0; i < shots.length; i++) { shots[i].pierce = true; shots[i].spd = 720; }
      return shots;
    case 7: // 电弧链射：命中后向附近敌人放电
      n = lv <= 2 ? 1 : lv <= 4 ? 2 : 3; dmg = 2;
      for (i = 0; i < n; i++) shots.push({ dx: (i - (n - 1) / 2) * 14, ang: 0, dmg: dmg, spd: 700, chain: 1 });
      return shots;
    case 8: // 棱镜弹幕：中列直射 + 两侧斜向棱镜光
      cnt = 1 + Math.ceil(lv / 2); // 侧翼对数
      shots.push({ dx: 0, ang: 0, dmg: 2, spd: 660 });
      for (i = 1; i <= cnt; i++) {
        shots.push({ dx: -10, ang: -10 * i, dmg: 2, spd: 660 });
        shots.push({ dx: 10, ang: 10 * i, dmg: 2, spd: 660 });
      }
      return shots;
    case 9: // 等离子重炮：巨大慢速高伤弹
      n = lv <= 2 ? 1 : 2; dmg = 4 + lv;
      for (i = 0; i < n; i++) shots.push({ dx: (i - (n - 1) / 2) * 22, ang: 0, dmg: dmg, spd: 400, big: true, pierce: true });
      return shots;
    default: // 星辰风暴：贯穿 + 追踪的终极形态
      n = lv <= 2 ? 3 : lv <= 4 ? 4 : 5; dmg = lv <= 2 ? 4 : 5;
      for (i = 0; i < n; i++) shots.push({ dx: (i - (n - 1) / 2) * 15, ang: (i - (n - 1) / 2) * 6, dmg: dmg, spd: 700, homing: 3, pierce: true });
      return shots;
  }
}

function shoot() {
  var st = player.wstage;
  var shots = stagePattern(st, player.wlevel);
  for (var i = 0; i < shots.length; i++) {
    var s = shots[i], a = s.ang * Math.PI / 180;
    var spd = s.spd || 640;
    bullets.push({
      x: player.x + s.dx, y: player.y - 18,
      vx: Math.sin(a) * spd, vy: -Math.cos(a) * spd,
      dmg: s.dmg, pierce: !!s.pierce, homing: s.homing || 0,
      amp: s.amp || 0, phase: 0, chain: s.chain || 0,
      big: !!s.big, kind: st
    });
  }
  sfx.shoot();
}

// ---------------- 难度 ----------------
// 幼儿模式的倍数可在此调整（normal 全部为 1）
//   countMul       敌兵数量倍数（同波次总数量）
//   speedMul       敌机移动速度倍数
//   bulletSpeedMul 敌弹飞行速度倍数
var DIFF_PRESETS = {
  normal: { countMul: 1.0, speedMul: 1.0, bulletSpeedMul: 1.0, maxHp: 3 },
  easy:   { countMul: 0.55, speedMul: 0.6, bulletSpeedMul: 0.7, maxHp: 20 }
};
var DIFF = DIFF_PRESETS.normal; // 开始游戏时由 game.js 按所选模式设置

// ---------------- 敌机 ----------------
var enemies = [];

function spawnGrunt(x, yOff) {
  enemies.push({
    type: 'grunt', x: x, baseX: x, y: -30 + (yOff || 0), r: 14,
    hp: 2, score: 100, t: Math.random() * TAU, fireT: rand(1.2, 2.8)
  });
}
function spawnDarter(x) {
  enemies.push({ type: 'darter', x: x, y: -30, r: 11, hp: 1, score: 150, vx: 0 });
}
function spawnTank(x) {
  enemies.push({ type: 'tank', x: x, y: -40, r: 22, hp: 10, score: 400, fireT: 1.4 });
}
function spawnOrb(x) {
  enemies.push({
    type: 'orb', x: x, y: -30, r: 16, hp: 5, score: 300,
    ty: rand(110, 200), fireT: 1.8, vx: Math.random() < 0.5 ? -65 : 65
  });
}
function spawnAsteroid() {
  var r = rand(13, 28);
  var verts = [];
  for (var i = 0; i < 8; i++) verts.push(rand(0.75, 1.15));
  enemies.push({
    type: 'asteroid', x: rand(30, 510), y: -40, r: r, hp: Math.round(r / 9),
    score: 50, vx: rand(-40, 40), vy: rand(70, 150), rot: 0, rs: rand(-2, 2), verts: verts
  });
}

function spawnGroup() {
  var w = G.wave, roll = Math.random();
  if (roll < 0.14) { spawnAsteroid(); return 1; }
  if (w >= 3 && roll < 0.24) { spawnTank(rand(80, 460)); return 1; }
  if (w >= 4 && roll < 0.32) { spawnOrb(rand(80, 460)); return 1; }
  if (w >= 2 && roll < 0.52) {
    var n = 3 + (Math.random() * 2 | 0);
    for (var i = 0; i < n; i++) spawnDarter(rand(40, 500));
    return n;
  }
  var form = Math.random();
  if (form < 0.4) {            // 横排
    var c = 4 + (Math.random() * 2 | 0);
    for (var a = 0; a < c; a++) spawnGrunt(270 + (a - (c - 1) / 2) * 56);
    return c;
  } else if (form < 0.7) {     // V 字
    for (var b = 0; b < 5; b++) spawnGrunt(270 + (b - 2) * 52, Math.abs(b - 2) * -34);
    return 5;
  } else {                     // 纵列
    var col = rand(80, 460);
    for (var d = 0; d < 3; d++) spawnGrunt(col, -d * 62);
    return 3;
  }
}

function aimedShot(x, y, speed) {
  if (!player.alive) return;
  speed *= DIFF.bulletSpeedMul;
  var a = Math.atan2(player.y - y, player.x - x);
  ebullets.push({ x: x, y: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 5 });
}

function aimedFan(x, y, count, spreadDeg, speed) {
  if (!player.alive) return;
  speed *= DIFF.bulletSpeedMul;
  var base = Math.atan2(player.y - y, player.x - x);
  var sp = spreadDeg * Math.PI / 180;
  for (var i = 0; i < count; i++) {
    var a = base + (i - (count - 1) / 2) * (sp / Math.max(1, count - 1));
    ebullets.push({ x: x, y: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 5 });
  }
}

function radial(x, y, n, speed, offset) {
  speed *= DIFF.bulletSpeedMul;
  for (var i = 0; i < n; i++) {
    var a = offset + i * TAU / n;
    ebullets.push({ x: x, y: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 5 });
  }
}

function updateEnemies(dt) {
  var sm = DIFF.speedMul;
  for (var i = enemies.length - 1; i >= 0; i--) {
    var e = enemies[i];
    switch (e.type) {
      case 'grunt':
        e.t += dt;
        e.y += (95 + G.wave * 4) * sm * dt;
        e.x = e.baseX + Math.sin(e.t * 2.4) * 46;
        e.fireT -= dt;
        if (e.fireT <= 0 && e.y > 10 && e.y < LH * 0.7 && player.alive) {
          aimedShot(e.x, e.y + 12, Math.min(300, 185 + G.wave * 8));
          e.fireT = rand(1.6, 3);
        }
        break;
      case 'darter':
        if (player.alive) e.vx += clamp(player.x - e.x, -60, 60) * 1.6 * dt;
        e.vx = clamp(e.vx, -90, 90);
        e.x += e.vx * sm * dt;
        e.y += 330 * sm * dt;
        break;
      case 'tank':
        e.y += 44 * sm * dt;
        e.fireT -= dt;
        if (e.fireT <= 0 && e.y > 10) {
          aimedFan(e.x, e.y + 16, 3, 16, Math.min(250, 170 + G.wave * 6));
          e.fireT = 2.2;
          sfx.enemyShoot();
        }
        break;
      case 'orb':
        if (e.y < e.ty) e.y += 90 * sm * dt;
        else {
          e.x += e.vx * sm * dt;
          if (e.x < 50 || e.x > LW - 50) e.vx *= -1;
          e.fireT -= dt;
          if (e.fireT <= 0) {
            radial(e.x, e.y, 10, 150, e.t);
            e.fireT = 2.6;
            sfx.enemyShoot();
          }
        }
        break;
      case 'asteroid':
        e.x += e.vx * sm * dt; e.y += e.vy * sm * dt; e.rot += e.rs * dt;
        if (e.x < e.r || e.x > LW - e.r) e.vx *= -1;
        break;
    }
    if (e.y > LH + 70 || e.x < -90 || e.x > LW + 90) enemies.splice(i, 1);
  }
}

function killEnemy(j) {
  var e = enemies[j];
  enemies.splice(j, 1);
  var big = e.type === 'tank' || e.type === 'orb';
  explosion(e.x, e.y, big ? 38 : 20, big ? 26 : 13);
  if (big) { sfx.explodeBig(); G.shake = Math.max(G.shake, 8); input.vibrate(120, 0.6, 0.5); }
  else sfx.explodeSmall();
  G.score += e.score;
  addFloat('+' + e.score, e.x, e.y);
  dropLoot(e);
}

function dropLoot(e) {
  var table = { grunt: 0.12, darter: 0.08, asteroid: 0.06, tank: 0.65, orb: 0.35 };
  if (Math.random() < table[e.type]) spawnPowerup(e.x, e.y, rollKind());
}

function rollKind() {
  var r = Math.random();
  if (r < 0.5) return 'P';
  if (r < 0.68) return 'H';
  if (r < 0.86) return 'S';
  return 'B';
}

// ---------------- 道具 ----------------
var powerups = [];

function spawnPowerup(x, y, kind) {
  powerups.push({ x: clamp(x, 24, LW - 24), y: y, kind: kind, t: Math.random() * TAU });
}

function updatePowerups(dt) {
  for (var i = powerups.length - 1; i >= 0; i--) {
    var pu = powerups[i];
    pu.t += dt;
    pu.y += 85 * dt;
    pu.x += Math.sin(pu.t * 3) * 30 * dt;
    var magnet = pickupMagnetRadius();
    if (magnet > 0) {
      var dx = player.x - pu.x, dy = player.y - pu.y;
      var d = Math.hypot(dx, dy);
      if (d < magnet && d > 1) {
        pu.x += dx / d * 240 * dt;
        pu.y += dy / d * 240 * dt;
      }
    }
    if (pu.y > LH + 30) powerups.splice(i, 1);
  }
}

function applyPowerup(kind) {
  input.vibrate(90, 0.3, 0.5);
  switch (kind) {
    case 'P':
      if (player.wlevel < 5) {
        player.wlevel++;
        sfx.levelup();
        addFloat('火力 Lv' + player.wlevel + '!', player.x, player.y - 30, WEAPON_STAGES[player.wstage - 1].color);
      } else {
        G.score += 500; addFloat('+500', player.x, player.y - 30, '#6cf2ff');
      }
      break;
    case 'H':
      if (player.hp < player.maxHp) { player.hp++; sfx.heal(); addFloat('生命 +1', player.x, player.y - 30, '#7dffb0'); }
      else { G.score += 300; addFloat('+300', player.x, player.y - 30, '#7dffb0'); }
      break;
    case 'S':
      player.shield = true;
      sfx.shieldOn();
      addFloat('能量护盾!', player.x, player.y - 30, '#8fb7ff');
      break;
    case 'B':
      if (player.bombs < 5) { player.bombs++; sfx.bombPick(); addFloat('炸弹 +1', player.x, player.y - 30, '#ffd25d'); }
      else { G.score += 300; addFloat('+300', player.x, player.y - 30, '#ffd25d'); }
      break;
  }
}

// ---------------- BOSS ----------------
var boss = null;

function spawnBoss(level) {
  boss = {
    level: level, x: LW / 2, y: -170, r: 62,
    maxHp: 160 + (level - 1) * 90, hp: 0,
    t: 0, fireT: 1.2, spiral: 0, phase: 0, drift: 1, alt: false, entered: false,
    moveMode: 0, moveT: 0, dashT: 0
  };
  boss.hp = boss.maxHp;
  ui.bossBar.classList.remove('hidden');
  ui.bossName.textContent = ' 歼灭者 MK-' + level + ' ';
  sfx.setMusicMode('boss'); // 战斗音乐切换为紧张模式
}

function updateBoss(dt) {
  var b = boss;
  b.t += dt;
  if (!b.entered) {
    b.y += 70 * dt;
    if (b.y >= 150) { b.entered = true; b.y = 150; }
    return;
  }
  var frac = b.hp / b.maxHp;
  b.phase = frac > 0.66 ? 0 : (frac > 0.33 ? 1 : 2);
  b.moveT -= dt;
  if (b.moveT <= 0) {
    b.moveMode = (b.moveMode + 1) % 4;
    b.moveT = b.phase === 2 ? 2.2 : 3.4;
    if (b.moveMode === 3) { b.dashT = 0.55; b.drift = b.x < LW / 2 ? 1 : -1; }
  }
  var speed = b.phase === 2 ? 150 : 95;
  if (b.moveMode === 0) {
    b.x += b.drift * speed * dt;
    b.y = 150 + Math.sin(b.t * 1.6) * 20;
  } else if (b.moveMode === 1) {
    b.x = LW / 2 + Math.sin(b.t * 1.7) * (LW * 0.36);
    b.y = 150 + Math.sin(b.t * 3.1) * 28;
  } else if (b.moveMode === 2) {
    b.x += (player.x - b.x) * Math.min(1, dt * 0.9);
    b.y = 148 + Math.sin(b.t * 2.4) * 36;
  } else {
    b.x += b.drift * (b.dashT > 0 ? 360 : 60) * dt;
    b.dashT -= dt;
    b.y = 150 + Math.sin(b.t * 4) * 18;
  }
  if (b.x > LW - 95) { b.x = LW - 95; b.drift = -1; }
  if (b.x < 95) { b.x = 95; b.drift = 1; }

  b.fireT -= dt;
  if (b.fireT > 0) return;
  var pattern = (Math.floor(b.t * (b.phase === 2 ? 1.35 : 0.75)) + b.phase) % 5;
  if (pattern === 0) {
    aimedFan(b.x, b.y + 46, 5 + b.phase, 30 + b.phase * 8, Math.min(300, 210 + 25 * b.level));
    b.fireT = b.phase === 2 ? 1.05 : 1.4;
  } else if (pattern === 1) {
    b.spiral += 0.44;
    var bs = (175 + b.phase * 25) * DIFF.bulletSpeedMul;
    for (var k = 0; k < 3; k++) {
      var a = b.spiral + k * Math.PI * 2 / 3;
      ebullets.push({ x: b.x, y: b.y + 16, vx: Math.cos(a) * bs, vy: Math.sin(a) * bs, r: 5 });
    }
    b.fireT = 0.16;
  } else if (pattern === 2) {
    var gap = rand(70, LW - 70);
    for (var gx = 24; gx < LW; gx += 42) {
      if (Math.abs(gx - gap) < 78) continue;
      ebullets.push({ x: gx, y: b.y + 40, vx: Math.sin(gx) * 18, vy: (155 + b.phase * 35) * DIFF.bulletSpeedMul, r: 5 });
    }
    b.fireT = 1.0;
  } else if (pattern === 3) {
    aimedFan(b.x, b.y + 46, 3, 16, 285);
    aimedFan(b.x, b.y + 46, 3, 64, 185);
    b.fireT = 1.25;
  } else {
    for (var ring = 0; ring < 12; ring++) {
      var ra = ring * TAU / 12 + b.spiral;
      var rspd = (120 + (ring % 2) * 55) * DIFF.bulletSpeedMul;
      ebullets.push({ x: b.x, y: b.y, vx: Math.cos(ra) * rspd, vy: Math.sin(ra) * rspd, r: 4 });
    }
    b.spiral += 0.35;
    b.fireT = b.phase === 2 ? 1.1 : 1.8;
  }
  sfx.enemyShoot();
}

function killBoss() {
  var b = boss;
  explosion(b.x, b.y, 90, 60);
  explosion(b.x - 50, b.y + 10, 40, 20);
  explosion(b.x + 50, b.y - 10, 40, 20);
  var pts = 3000 + 1000 * b.level;
  G.score += pts;
  addFloat('+' + pts, b.x, b.y, '#ffd25d');
  sfx.explodeBig();
  input.vibrate(650, 1, 0.9);
  G.shake = 22;
  G.flash = 0.4;
  spawnPowerup(b.x - 40, b.y, 'P');
  spawnPowerup(b.x + 40, b.y, rollKind());
  boss = null;
  ui.bossBar.classList.add('hidden');
  showBanner('BOSS 被击毁！', '#7dffb0', 2);
  sfx.bossDefeated();
  sfx.setMusicMode('normal');
}

// ---------------- 波次导演 ----------------
var director = {};

function resetDirector() {
  director = {
    spawnT: 0, quota: 0, spawned: 0, waveDoneT: 1.5,
    bossPending: false, bossWarnT: 0, bossLevel: 0, bossActive: false,
    flowDone: false
  };
}

function startWave(n) {
  G.wave = n;
  director.waveDoneT = 1.5;
  director.flowDone = false;
  director.bossPending = false;
  director.bossActive = false;
  if (n > 1 && player.alive) player.hp = player.maxHp; // 每过一关，生命值重置
  if (n % 30 === 0) {
    setRunPhase('boss');
    director.bossPending = true;
    director.bossWarnT = 2.2;
    director.bossLevel = n / 30;
    showBanner('⚠ 警告：BOSS 来袭 ⚠', '#ff8a9a', 2.2);
    sfx.alarm();
  } else {
    setRunPhase('combat');
    director.quota = Math.max(4, Math.round((8 + n * 2) * DIFF.countMul));
    director.spawned = 0;
    director.spawnT = 0.8;
    showBanner('第 ' + n + ' 波', '#eaf6ff', 1.6);
    sfx.waveStart();
  }
}

function updateDirector(dt) {
  if (director.bossPending) {
    director.bossWarnT -= dt;
    if (director.bossWarnT <= 0) {
      director.bossPending = false;
      director.bossActive = true;
      spawnBoss(director.bossLevel);
    }
    return;
  }
  if (director.bossActive) {
    if (!boss) {
      director.waveDoneT -= dt;
      if (director.waveDoneT <= 0 && !director.flowDone) {
        director.flowDone = true;
        finishWaveFlow(G.wave);
      }
    }
    return;
  }
  if (director.spawned < director.quota) {
    director.spawnT -= dt;
    if (director.spawnT <= 0) {
      director.spawned += spawnGroup();
      director.spawnT = Math.max(0.5, 1.5 - G.wave * 0.05) * rand(0.75, 1.25) / DIFF.countMul;
    }
  } else if (enemies.length === 0) {
    director.waveDoneT -= dt;
    if (director.waveDoneT <= 0 && !director.flowDone) {
      director.flowDone = true;
      finishWaveFlow(G.wave);
    }
  }
}

// ---------------- 玩家 ----------------
var player = {
  x: 270, y: 820, r: 16, speed: 350,
  hp: 3, maxHp: 3, shield: false, wstage: 1, wlevel: 1, bombs: 2,
  cool: 0, inv: 0, alive: true
};

function updatePlayer(dt) {
  var p = player;
  if (!p.alive) return;

  if (input.touchActive) {
    var tx = input.touchX, ty = input.touchY - 90;
    var ddx = tx - p.x, ddy = ty - p.y;
    var d = Math.hypot(ddx, ddy);
    if (d > 4) {
      var mv = Math.min(p.speed * 1.5 * dt, d);
      p.x += ddx / d * mv; p.y += ddy / d * mv;
    }
  } else {
    p.x += input.moveX * p.speed * dt;
    p.y += input.moveY * p.speed * dt;
  }
  p.x = clamp(p.x, 22, LW - 22);
  p.y = clamp(p.y, 60, LH - 30);

  if (p.inv > 0) p.inv -= dt;
  p.cool -= dt;
  // 仅战斗阶段自动发射；小游戏阶段由独立规则接管移动
  if (isAutoFireEnabled() && p.cool <= 0) {
    shoot();
    p.cool = weaponCooldown(WEAPON_STAGES[p.wstage - 1].cool[p.wlevel - 1]);
  }

  // 引擎尾焰
  particles.push({
    x: p.x + rand(-3, 3), y: p.y + 16, vx: rand(-15, 15), vy: rand(60, 120),
    life: rand(0.12, 0.25), max: 0.25, r: rand(1.5, 3),
    color: Math.random() < 0.5 ? '#6cf2ff' : '#3a7dff'
  });
}

function playerHit() {
  if (player.inv > 0 || !player.alive) return;
  if (G.infiniteLives) {
    // 无限生命：受击只有表现，不掉血
    player.inv = 1;
    sparks(player.x, player.y, 12, '#ff8a9a');
    sfx.hit();
    addFloat('∞', player.x, player.y - 30, '#ff8a9a');
    return;
  }
  if (player.shield) {
    player.shield = false;
    player.inv = 1.2;
    sfx.shieldBreak();
    input.vibrate(180, 0.7, 0.7);
    sparks(player.x, player.y, 16, '#8fb7ff');
    addFloat('护盾破碎!', player.x, player.y - 34, '#8fb7ff');
    return;
  }
  player.hp--;
  player.inv = 2;
  sfx.hit();
  G.shake = 12;
  input.vibrate(380, 1, 0.8);
  sparks(player.x, player.y, 14, '#ff8a9a');
  if (player.hp <= 0) {
    player.alive = false;
    explosion(player.x, player.y, 55, 46);
    sfx.stopMusic();
    sfx.playerDie();
    sfx.explodeBig();
    input.vibrate(700, 1, 1);
    G.shake = 20;
    G.overDelay = 1.4;
  }
}

function useBomb() {
  if (G.mode !== 'playing' || !isCombatRunPhase() || !player.alive || player.bombs <= 0) return;
  player.bombs--;
  G.flash = 0.35;
  G.shake = 18;
  sfx.bomb();
  input.vibrate(520, 1, 0.9);
  ebullets.length = 0;
  var damageMul = bombDamageMultiplier();
  for (var i = enemies.length - 1; i >= 0; i--) {
    var e = enemies[i];
    e.hp -= Math.round(25 * damageMul);
    explosion(e.x, e.y, 18, 6);
    if (e.hp <= 0) killEnemy(i);
  }
  if (boss && boss.entered) {
    boss.hp -= Math.round(45 * damageMul);
    if (boss.hp <= 0) killBoss();
  }
  addFloat('全屏炸弹!', player.x, player.y - 40, '#ffd25d');
}

// ---------------- 子弹 ----------------
var bullets = [];
var ebullets = [];

// 距离 (x,y) 最近的存活目标（敌机或 BOSS），供追踪弹使用
function nearestEnemy(x, y) {
  var best = null, bd = 1e9, d;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.y < -10) continue; // 尚未进屏的不追踪
    d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  if (boss && boss.entered && boss.hp > 0) {
    d = (boss.x - x) * (boss.x - x) + (boss.y - y) * (boss.y - y);
    if (d < bd) best = boss;
  }
  return best;
}

function updateBullets(dt) {
  for (var i = bullets.length - 1; i >= 0; i--) {
    var b = bullets[i];
    if (b.homing) {
      // 追踪：向最近目标转向，转速上限 b.homing 弧度/秒
      var tgt = nearestEnemy(b.x, b.y);
      if (tgt) {
        var spd = Math.hypot(b.vx, b.vy);
        var cur = Math.atan2(b.vy, b.vx);
        var want = Math.atan2(tgt.y - b.y, tgt.x - b.x);
        var diff = want - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        var turn = b.homing * dt;
        cur += clamp(diff, -turn, turn);
        b.vx = Math.cos(cur) * spd;
        b.vy = Math.sin(cur) * spd;
      }
    }
    if (b.amp) {
      // 横向正弦摆动（回旋刃）
      b.phase += dt * 6;
      b.x += Math.sin(b.phase) * b.amp * dt;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -20 || b.y > LH + 20 || b.x < -20 || b.x > LW + 20) bullets.splice(i, 1);
  }
}

function updateEBullets(dt) {
  for (var i = ebullets.length - 1; i >= 0; i--) {
    var b = ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -40 || b.y > LH + 40 || b.x < -40 || b.x > LW + 40) ebullets.splice(i, 1);
  }
}

// ---------------- 碰撞 ----------------
function circleHit(ax, ay, ar, bx, by, br) {
  var dx = ax - bx, dy = ay - by, r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

function handleCollisions() {
  var i, j, bl, e, hit;

  // 玩家拾取弹药包（放在无敌判定之前：出生/受击无敌期间同样可拾取）
  for (i = powerups.length - 1; i >= 0; i--) {
    var pu = powerups[i];
    if (circleHit(player.x, player.y, player.r + 14, pu.x, pu.y, 12)) {
      powerups.splice(i, 1);
      applyPowerup(pu.kind);
    }
  }

  if (!player.alive || player.inv > 0) return;

  for (i = bullets.length - 1; i >= 0; i--) {
    bl = bullets[i];
    var consumed = false; // 普通弹命中后销毁；贯穿弹记录已伤目标后继续飞行
    if (boss && boss.hp > 0 && circleHit(bl.x, bl.y, 4, boss.x, boss.y, boss.r * 0.92)) {
      if (bl.pierce) {
        if (!bl.hitSet) bl.hitSet = new Set();
        if (!bl.hitSet.has(boss)) {
          bl.hitSet.add(boss);
          boss.hp -= bl.dmg;
          sparks(bl.x, bl.y + 6, 3, '#c9a0ff');
          if (boss.hp <= 0) killBoss();
        }
      } else {
        boss.hp -= bl.dmg;
        sparks(bl.x, bl.y + 6, 2, '#ffd9a0');
        if (boss.hp <= 0) killBoss();
        consumed = true;
      }
    }
    if (!consumed) {
      for (j = enemies.length - 1; j >= 0; j--) {
        e = enemies[j];
        if (!circleHit(bl.x, bl.y, 4, e.x, e.y, e.r)) continue;
        if (bl.pierce) {
          if (!bl.hitSet) bl.hitSet = new Set();
          if (bl.hitSet.has(e)) continue; // 已被该光束击中过，穿过
          bl.hitSet.add(e);
        }
        e.hp -= bl.dmg;
        sparks(bl.x, bl.y + 6, 2, bl.pierce ? '#c9a0ff' : '#ffd9a0');
        var killed = e.hp <= 0;
        if (killed) killEnemy(j); // 先移除当前目标，链电清理时索引才安全
        if (bl.chain) {
          // 链电溅射：向命中点 130px 内的其他敌人放电，造成一半伤害
          var cd = Math.ceil(bl.dmg / 2);
          for (var k = enemies.length - 1; k >= 0; k--) {
            var o = enemies[k];
            if (circleHit(bl.x, bl.y, 130, o.x, o.y, o.r)) {
              o.hp -= cd;
              sparks(o.x, o.y, 4, '#a7f4ff');
              if (o.hp <= 0) killEnemy(k);
            }
          }
        }
        if (!bl.pierce) { consumed = true; break; }
      }
    }
    if (consumed) bullets.splice(i, 1);
  }

  if (!player.alive || player.inv > 0) return;

  for (i = ebullets.length - 1; i >= 0; i--) {
    var eb = ebullets[i];
    if (circleHit(player.x, player.y - 4, player.r - 5, eb.x, eb.y, eb.r)) {
      ebullets.splice(i, 1);
      playerHit();
      return;
    }
  }
  for (i = enemies.length - 1; i >= 0; i--) {
    e = enemies[i];
    if (circleHit(player.x, player.y, player.r - 2, e.x, e.y, e.r * 0.85)) {
      e.hp -= 6;
      if (e.hp <= 0) killEnemy(i);
      playerHit();
      return;
    }
  }
  if (boss && boss.entered && circleHit(player.x, player.y, player.r - 2, boss.x, boss.y, boss.r * 0.85)) {
    playerHit();
  }
}
