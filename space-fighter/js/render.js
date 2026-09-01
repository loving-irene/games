/*
 * 渲染：背景 / 玩家 / 敌机 / BOSS / 子弹 / 粒子 / 横幅
 * （共享全局作用域，加载顺序：entities.js -> render.js -> game.js）
 */

var spriteSheet = new Image();
spriteSheet.src = 'asset_2olOMyCNYNfeJq2s.png';

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

function drawRouteGates() {
  for (var i = 0; i < routeGates.length; i++) {
    var gate = routeGates[i];
    var def = EVENT_DEFS[gate.kind];
    var pulse = 1 + Math.sin(gate.t * 4) * 0.06;
    ctx.save();
    ctx.translate(gate.x, gate.y);
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 5;
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(0, 0, gate.r * pulse, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(0, 0, gate.r * 0.68, -gate.t, TAU - gate.t);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#eaf6ff';
    ctx.font = '700 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.name, 0, 0);
    ctx.fillStyle = def.color;
    ctx.font = '12px sans-serif';
    ctx.fillText(def.reward, 0, 21);
    ctx.restore();
  }
}

function drawEventItems() {
  for (var i = 0; i < eventItems.length; i++) {
    var item = eventItems[i];
    ctx.save();
    ctx.translate(item.x, item.y);
    if (item.kind === 'part') {
      ctx.rotate(item.t);
      ctx.fillStyle = '#6cf2ff';
      ctx.shadowColor = '#6cf2ff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(9, 0); ctx.lineTo(0, 12); ctx.lineTo(-9, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#eaffff';
      ctx.fillRect(-2, -6, 4, 12);
    } else {
      ctx.fillStyle = '#dfffee';
      ctx.strokeStyle = '#7dffb0';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#7dffb0';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(-11, -17, 22, 34, 8);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#173a4a';
      ctx.beginPath(); ctx.arc(0, -5, 4, 0, TAU); ctx.fill();
      ctx.fillRect(-5, 1, 10, 8);
    }
    ctx.restore();
  }
}

function drawEventHazards() {
  for (var i = 0; i < eventHazards.length; i++) {
    var hazard = eventHazards[i];
    if (hazard.kind === 'hunter') {
      drawSprite(SPRITES.enemies.grunt, hazard.x, hazard.y, 42, 42, 0);
      continue;
    }
    ctx.save();
    ctx.translate(hazard.x, hazard.y);
    ctx.rotate(hazard.t);
    ctx.fillStyle = '#3c1820';
    ctx.strokeStyle = '#ff5d6c';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff5d6c';
    ctx.shadowBlur = 10;
    for (var p = 0; p < 8; p++) {
      ctx.rotate(TAU / 8);
      ctx.fillRect(-2, -23, 4, 10);
    }
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd25d';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawEventWalls() {
  for (var i = 0; i < eventWalls.length; i++) {
    var wall = eventWalls[i];
    var leftEnd = wall.gapX - wall.gapW / 2;
    var rightStart = wall.gapX + wall.gapW / 2;
    ctx.save();
    ctx.fillStyle = wall.hit ? 'rgba(255,90,80,0.35)' : 'rgba(255,130,70,0.55)';
    ctx.shadowColor = '#ff8a5c';
    ctx.shadowBlur = 14;
    ctx.fillRect(0, wall.y - wall.h / 2, leftEnd, wall.h);
    ctx.fillRect(rightStart, wall.y - wall.h / 2, LW - rightStart, wall.h);
    ctx.fillStyle = '#fff1d0';
    ctx.fillRect(0, wall.y - 2, leftEnd, 4);
    ctx.fillRect(rightStart, wall.y - 2, LW - rightStart, 4);
    ctx.restore();
  }
}

function drawRunObjects() {
  if (runState.phase === 'gate') drawRouteGates();
  if (runState.phase !== 'event') return;
  drawEventWalls();
  drawEventItems();
  drawEventHazards();
}

var PU_COLORS = { P: '#6cf2ff', H: '#7dffb0', S: '#8fb7ff', B: '#ffd25d' };

function drawPowerups() {
  for (var i = 0; i < powerups.length; i++) {
    var pu = powerups[i];
    var c = PU_COLORS[pu.kind];
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
