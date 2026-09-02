/*
 * 渲染：背景 / 玩家 / 敌机 / BOSS / 子弹 / 粒子 / 横幅
 * （共享全局作用域，加载顺序：entities.js -> render.js -> game.js）
 */

var spriteSheet = new Image();
spriteSheet.src = 'asset_2olOMyCNYNfeJq2s.png';

var lootSheet = new Image();
lootSheet.src = encodeURI('掉落物素材.png');
var LOOT_SPRITES = {
  // 素材图为 5 列 × 3 行，分别取心形、蓝色武器和蓝色护盾图标。
  H: { x: 18, y: 16, w: 270, h: 270 },
  P: { x: 306, y: 300, w: 305, h: 330 },
  S: { x: 1220, y: 680, w: 300, h: 310 }
};

var SPRITES = {
  player: { x: 8, y: 18, w: 198, h: 244 },
  enemies: {
    grunt: { x: 620, y: 374, w: 198, h: 198 },
    darter: { x: 956, y: 380, w: 164, h: 202 },
    tank: { x: 790, y: 4, w: 356, h: 360 },
    orb: { x: 1108, y: 348, w: 214, h: 278 },
    asteroid: { x: 1286, y: 354, w: 250, h: 282 }
  },
  boss: { x: 1134, y: 0, w: 402, h: 348 },
  weapons: [
    { x: 36, y: 612, w: 46, h: 116, dw: 10, dh: 27 },
    { x: 92, y: 612, w: 48, h: 148, dw: 12, dh: 29 },
    { x: 263, y: 608, w: 70, h: 164, dw: 14, dh: 30 },
    { x: 136, y: 608, w: 72, h: 416, dw: 11, dh: 46 },
    { x: 458, y: 608, w: 62, h: 134, dw: 15, dh: 31 },
    { x: 329, y: 608, w: 70, h: 160, dw: 16, dh: 35 },
    { x: 442, y: 738, w: 84, h: 112, dw: 18, dh: 24 },
    { x: 530, y: 612, w: 60, h: 92, dw: 14, dh: 23 },
    { x: 636, y: 802, w: 198, h: 92, dw: 30, dh: 16 },
    { x: 634, y: 916, w: 208, h: 100, dw: 34, dh: 17 }
  ],
  enemyBullet: { x: 394, y: 608, w: 60, h: 164, dw: 13, dh: 27 }
};

function drawSprite(sprite, x, y, w, h, rotation) {
  if (!spriteSheet.complete || !spriteSheet.naturalWidth) return false;
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  ctx.drawImage(
    spriteSheet,
    sprite.x, sprite.y, sprite.w, sprite.h,
    -w / 2, -h / 2, w, h
  );
  ctx.restore();
  return true;
}

function drawMovingSprite(sprite, b) {
  var angle = Math.atan2(b.vy || -1, b.vx || 0) + Math.PI / 2;
  drawSprite(sprite, b.x, b.y, sprite.dw, sprite.dh, angle);
}

function drawBackground() {
  var grad = ctx.createLinearGradient(0, 0, 0, LH);
  grad.addColorStop(0, '#0a1030');
  grad.addColorStop(0.5, '#070b20');
  grad.addColorStop(1, '#04060f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, LW, LH);

  for (var i = 0; i < nebulas.length; i++) {
    var nb = nebulas[i];
    var g = ctx.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, nb.r);
    g.addColorStop(0, 'rgba(' + nb.c + ',0.10)');
    g.addColorStop(1, 'rgba(' + nb.c + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(nb.x - nb.r, nb.y - nb.r, nb.r * 2, nb.r * 2);
  }
}

function drawStars() {
  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    ctx.globalAlpha = 0.3 + s.z * 0.7;
    ctx.fillStyle = s.z > 0.75 ? '#dfeaff' : '#8fa8d8';
    ctx.fillRect(s.x, s.y, s.r, s.r + s.z * 2.5);
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  var p = player;
  if (!p.alive) return;
  ctx.save();
  if (p.inv > 0 && Math.floor(G.time * 20) % 2 === 0) ctx.globalAlpha = 0.35;

  // 护盾
  if (p.shield) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 29, 0, TAU);
    ctx.strokeStyle = 'rgba(143,183,255,0.85)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#8fb7ff';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  drawSprite(SPRITES.player, p.x, p.y, 54, 67, 0);

  ctx.restore();
}

function drawEnemy(e) {
  var sprite = SPRITES.enemies[e.type];
  switch (e.type) {
    case 'grunt':
      drawSprite(sprite, e.x, e.y, 40, 40, 0);
      break;
    case 'darter':
      drawSprite(sprite, e.x, e.y, 34, 42, 0);
      break;
    case 'tank':
      drawSprite(sprite, e.x, e.y, 68, 69, 0);
      break;
    case 'orb':
      drawSprite(sprite, e.x, e.y, 52, 68, Math.sin(G.time * 2) * 0.05);
      break;
    case 'asteroid':
      drawSprite(sprite, e.x, e.y, e.r * 2.2, e.r * 2.45, e.rot);
      break;
  }
}

function drawBoss() {
  var b = boss;
  var pulse = 1 + Math.sin(G.time * 4) * 0.02;
  drawSprite(SPRITES.boss, b.x, b.y, 184 * pulse, 164 * pulse, 0);
}

function drawBullets() {
  for (var i = 0; i < bullets.length; i++) {
    var b = bullets[i];
    drawMovingSprite(SPRITES.weapons[(b.kind || 1) - 1] || SPRITES.weapons[0], b);
  }
}

function drawEBullets() {
  for (var i = 0; i < ebullets.length; i++) {
    drawMovingSprite(SPRITES.enemyBullet, ebullets[i]);
  }
}

function drawMiniGame() {
  var game = runState.miniGame;
  if (!game) return;
  if (game.kind === 'maze') drawMazeGame(game);
  else drawJumpGame(game);
}

function drawMazeGame(game) {
  var m = game.maze;
  ctx.save();
  ctx.fillStyle = 'rgba(4, 12, 28, 0.94)';
  ctx.fillRect(m.ox - 8, m.oy - 8, m.cols * m.cell + 16, m.rows * m.cell + 16);
  for (var y = 0; y < m.rows; y++) for (var x = 0; x < m.cols; x++) {
    if (!m.grid[y][x]) continue;
    ctx.fillStyle = 'rgba(48, 105, 155, 0.82)';
    ctx.strokeStyle = 'rgba(108, 242, 255, 0.45)';
    ctx.fillRect(m.ox + x * m.cell, m.oy + y * m.cell, m.cell, m.cell);
    ctx.strokeRect(m.ox + x * m.cell + 1, m.oy + y * m.cell + 1, m.cell - 2, m.cell - 2);
  }
  var gx = m.ox + (m.goal.x + 0.5) * m.cell, gy = m.oy + (m.goal.y + 0.5) * m.cell;
  ctx.fillStyle = '#7dffb0';
  ctx.shadowColor = '#7dffb0';
  ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.arc(gx, gy, 13 + Math.sin(G.time * 5) * 3, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#062218';
  ctx.font = '700 13px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('终', gx, gy);
  ctx.restore();
}

function drawJumpGame(game) {
  var meteors = game.jump.meteors;
  ctx.save();
  for (var i = 0; i < meteors.length; i++) {
    var meteor = meteors[i];
    var active = i <= game.jump.meteorIndex;
    ctx.fillStyle = active ? 'rgba(125, 255, 176, 0.78)' : 'rgba(255, 210, 93, 0.78)';
    ctx.shadowColor = active ? '#7dffb0' : '#ffd25d';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(meteor.x - meteor.r, meteor.y);
    ctx.lineTo(meteor.x - meteor.r * 0.55, meteor.y - 13);
    ctx.lineTo(meteor.x + meteor.r * 0.55, meteor.y - 15);
    ctx.lineTo(meteor.x + meteor.r, meteor.y - 2);
    ctx.lineTo(meteor.x + meteor.r * 0.62, meteor.y + 10);
    ctx.lineTo(meteor.x - meteor.r * 0.7, meteor.y + 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff4c2';
    ctx.fillRect(meteor.x - meteor.r * 0.55, meteor.y - 3, meteor.r * 1.1, 3);
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('按住跳跃键蓄力，松开起跳 · 左右调整落点', LW / 2, 82);
  if (game.jump.charging) {
    var barW = 190, progress = game.jump.charge / game.jump.maxCharge;
    ctx.fillStyle = 'rgba(8, 16, 38, 0.8)';
    ctx.fillRect(LW / 2 - barW / 2, 98, barW, 10);
    ctx.fillStyle = '#ffd25d';
    ctx.fillRect(LW / 2 - barW / 2, 98, barW * progress, 10);
    ctx.strokeStyle = '#fff4c2';
    ctx.strokeRect(LW / 2 - barW / 2, 98, barW, 10);
  }
  ctx.restore();
}

function drawRunObjects() {
  if (runState.phase === 'minigame') drawMiniGame();
}

var PU_COLORS = { P: '#6cf2ff', H: '#7dffb0', S: '#8fb7ff', B: '#ffd25d' };

function drawLootSprite(pu, color) {
  var sprite = LOOT_SPRITES[pu.kind];
  if (!sprite || !lootSheet.complete || !lootSheet.naturalWidth) return false;
  ctx.save();
  ctx.translate(pu.x, pu.y);
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, TAU);
  ctx.clip();
  ctx.drawImage(lootSheet, sprite.x, sprite.y, sprite.w, sprite.h, -22, -22, 44, 44);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(pu.x, pu.y, 21, 0, TAU);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;
  return true;
}

function drawPowerups() {
  for (var i = 0; i < powerups.length; i++) {
    var pu = powerups[i];
    var c = PU_COLORS[pu.kind];
    if (drawLootSprite(pu, c)) continue;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, 13, 0, TAU);
    ctx.fillStyle = 'rgba(10,20,40,0.75)';
    ctx.fill();
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.shadowColor = c;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = c;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pu.kind, pu.x, pu.y + 1);
  }
}

function drawParticles() {
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var a = Math.max(0, p.life / p.max);
    if (p.ring) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = a * 0.8;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (var i = 0; i < floaters.length; i++) {
    var f = floaters[i];
    ctx.globalAlpha = Math.min(1, f.t / 0.4);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawBanner() {
  if (banner.t <= 0) return;
  var alpha = Math.min(1, banner.t / 0.4);
  if (banner.color === '#ff8a9a') alpha *= Math.floor(G.time * 6) % 2 === 0 ? 1 : 0.45;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '700 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = banner.color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = banner.color;
  ctx.fillText(banner.text, LW / 2, LH * 0.42);
  ctx.restore();
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#04060f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  var sx = 0, sy = 0;
  if (G.shake > 0) {
    sx = (Math.random() * 2 - 1) * G.shake;
    sy = (Math.random() * 2 - 1) * G.shake;
  }
  ctx.setTransform(view.scale, 0, 0, view.scale, view.offX + sx * view.scale, view.offY + sy * view.scale);

  drawBackground();
  drawStars();
  drawRunObjects();
  drawPowerups();
  for (var i = 0; i < enemies.length; i++) drawEnemy(enemies[i]);
  if (boss) drawBoss();
  drawBullets();
  drawEBullets();
  if (G.mode !== 'start') drawPlayer();
  drawParticles();
  drawFloaters();
  drawBanner();

  if (G.flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, G.flash * 1.8) + ')';
    ctx.fillRect(0, 0, LW, LH);
  }
}
