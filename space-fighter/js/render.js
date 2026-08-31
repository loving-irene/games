/*
 * 渲染：背景 / 玩家 / 敌机 / BOSS / 子弹 / 粒子 / 横幅
 * （共享全局作用域，加载顺序：entities.js -> render.js -> game.js）
 */

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
  ctx.translate(p.x, p.y);
  if (p.inv > 0 && Math.floor(G.time * 20) % 2 === 0) ctx.globalAlpha = 0.35;

  // 护盾
  if (p.shield) {
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.strokeStyle = 'rgba(143,183,255,0.85)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#8fb7ff';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // 引擎火焰
  var f = 9 + Math.random() * 9;
  ctx.beginPath();
  ctx.moveTo(-4, 13);
  ctx.lineTo(0, 13 + f);
  ctx.lineTo(4, 13);
  ctx.closePath();
  ctx.fillStyle = '#6cf2ff';
  ctx.shadowColor = '#6cf2ff';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;

  // 机翼
  ctx.beginPath();
  ctx.moveTo(-4, -2);
  ctx.lineTo(-17, 12);
  ctx.lineTo(-6, 12);
  ctx.closePath();
  ctx.moveTo(4, -2);
  ctx.lineTo(17, 12);
  ctx.lineTo(6, 12);
  ctx.closePath();
  ctx.fillStyle = '#1b4d8f';
  ctx.fill();

  // 机身
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(10, 10);
  ctx.lineTo(4, 14);
  ctx.lineTo(-4, 14);
  ctx.lineTo(-10, 10);
  ctx.closePath();
  ctx.fillStyle = '#39c6ff';
  ctx.shadowColor = '#39c6ff';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;

  // 座舱
  ctx.beginPath();
  ctx.ellipse(0, -4, 3, 6, 0, 0, TAU);
  ctx.fillStyle = '#eaffff';
  ctx.fill();

  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  switch (e.type) {
    case 'grunt':
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(-12, -8);
      ctx.lineTo(-4, -10);
      ctx.lineTo(0, -6);
      ctx.lineTo(4, -10);
      ctx.lineTo(12, -8);
      ctx.closePath();
      ctx.fillStyle = '#ff5d6c';
      ctx.shadowColor = '#ff5d6c';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffe1e6';
      ctx.fillRect(-2, -2, 4, 5);
      break;
    case 'darter':
      ctx.beginPath();
      ctx.moveTo(0, 16);
      ctx.lineTo(-6, -10);
      ctx.lineTo(0, -6);
      ctx.lineTo(6, -10);
      ctx.closePath();
      ctx.fillStyle = '#ffd25d';
      ctx.shadowColor = '#ffd25d';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      break;
    case 'tank':
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = i * TAU / 6 + Math.PI / 6;
        var px = Math.cos(a) * 22, py = Math.sin(a) * 22;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#8b5cf6';
      ctx.shadowColor = '#8b5cf6';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TAU);
      ctx.fillStyle = '#2b0f33';
      ctx.fill();
      break;
    case 'orb':
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, TAU);
      ctx.strokeStyle = '#ff9e5c';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ff9e5c';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 7 + Math.sin(G.time * 5) * 1.5, 0, TAU);
      ctx.fillStyle = '#ffd9a0';
      ctx.fill();
      ctx.shadowBlur = 0;
      break;
    case 'asteroid':
      ctx.rotate(e.rot);
      ctx.beginPath();
      for (var v = 0; v < 8; v++) {
        var ang = v * TAU / 8;
        var rr = e.r * e.verts[v];
        var vx = Math.cos(ang) * rr, vy = Math.sin(ang) * rr;
        if (v === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.fillStyle = '#7a8296';
      ctx.fill();
      ctx.strokeStyle = '#4a5060';
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function drawBoss() {
  var b = boss;
  ctx.save();
  ctx.translate(b.x, b.y);

  // 侧炮
  ctx.fillStyle = '#521b3f';
  ctx.fillRect(-92, -6, 22, 28);
  ctx.fillRect(70, -6, 22, 28);

  // 主体
  ctx.beginPath();
  ctx.ellipse(0, 0, 74, 40, 0, 0, TAU);
  ctx.fillStyle = '#2b0f33';
  ctx.shadowColor = '#ff3b5c';
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.strokeStyle = '#ff3b5c';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 装甲线
  ctx.strokeStyle = 'rgba(255,90,120,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 52, 26, 0, 0, TAU);
  ctx.stroke();

  // 核心
  var pulse = 0.75 + 0.25 * Math.sin(G.time * 6);
  ctx.beginPath();
  ctx.arc(0, 4, 16 * pulse + 5, 0, TAU);
  ctx.fillStyle = b.phase === 2 ? '#ff8a5c' : '#ff3b5c';
  ctx.shadowColor = '#ff5d6c';
  ctx.shadowBlur = 26;
  ctx.fill();
  ctx.shadowBlur = 0;

  // 传感眼
  ctx.beginPath();
  ctx.ellipse(0, -18, 26, 8, 0, 0, TAU);
  ctx.fillStyle = '#ffe1e6';
  ctx.fill();

  ctx.restore();
}

function drawBullets() {
  for (var i = 0; i < bullets.length; i++) {
    var b = bullets[i];
    switch (b.kind) {
      case 1: // 脉冲机炮：青色胶囊
        ctx.fillStyle = 'rgba(108,242,255,0.35)';
        ctx.fillRect(b.x - 4, b.y - 12, 8, 20);
        ctx.fillStyle = '#d9fbff';
        ctx.fillRect(b.x - 2, b.y - 9, 4, 14);
        break;
      case 2: // 广域散弹：绿色光点
        ctx.fillStyle = 'rgba(157,255,138,0.3)';
        ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#eaffdc';
        ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, TAU); ctx.fill();
        break;
      case 3: // 追踪飞弹：黄色导弹 + 尾焰
        ctx.fillStyle = 'rgba(255,210,93,0.35)';
        ctx.fillRect(b.x - 2, b.y + 4, 4, 12);
        ctx.fillStyle = '#ffd25d';
        ctx.fillRect(b.x - 3, b.y - 8, 6, 14);
        ctx.fillStyle = '#fff3c4';
        ctx.fillRect(b.x - 1.5, b.y - 10, 3, 5);
        break;
      case 4: // 光子长矛：冰蓝细长贯穿束
        ctx.fillStyle = 'rgba(125,223,255,0.3)';
        ctx.fillRect(b.x - 3, b.y - 22, 6, 40);
        ctx.fillStyle = '#eafcff';
        ctx.fillRect(b.x - 1, b.y - 18, 2, 32);
        break;
      case 5: // 回旋刃：粉色菱形刃
        ctx.fillStyle = 'rgba(255,157,226,0.35)';
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - 12); ctx.lineTo(b.x + 7, b.y);
        ctx.lineTo(b.x, b.y + 12); ctx.lineTo(b.x - 7, b.y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffe3f6';
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - 6); ctx.lineTo(b.x + 3.5, b.y);
        ctx.lineTo(b.x, b.y + 6); ctx.lineTo(b.x - 3.5, b.y);
        ctx.closePath(); ctx.fill();
        break;
      case 6: // 离子贯穿炮：紫色粗束
        ctx.fillStyle = 'rgba(183,140,255,0.35)';
        ctx.fillRect(b.x - 5, b.y - 18, 10, 32);
        ctx.fillStyle = '#e8d6ff';
        ctx.fillRect(b.x - 2, b.y - 14, 4, 24);
        break;
      case 7: // 电弧链射：白青电球 + 电弧
        ctx.fillStyle = 'rgba(167,244,255,0.3)';
        ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, TAU); ctx.fill();
        ctx.fillStyle = '#d6fbff';
        ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(b.x - 6, b.y + Math.random() * 6 - 3);
        ctx.lineTo(b.x + 6, b.y + Math.random() * 6 - 3);
        ctx.stroke();
        break;
      case 8: // 棱镜弹幕：金色小菱形
        ctx.fillStyle = 'rgba(255,226,122,0.35)';
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - 9); ctx.lineTo(b.x + 5, b.y);
        ctx.lineTo(b.x, b.y + 9); ctx.lineTo(b.x - 5, b.y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fffbe8';
        ctx.fillRect(b.x - 1, b.y - 4, 2, 8);
        break;
      case 9: // 等离子重炮：橙红大光球
        ctx.fillStyle = 'rgba(255,138,92,0.35)';
        ctx.beginPath(); ctx.arc(b.x, b.y, 13, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffb28a';
        ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff1e8';
        ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, TAU); ctx.fill();
        break;
      case 10: // 星辰风暴：白色星芒
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.arc(b.x, b.y, 9, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(b.x - 6, b.y - 1, 12, 2);
        ctx.fillRect(b.x - 1, b.y - 6, 2, 12);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - 8); ctx.lineTo(b.x + 2.5, b.y - 2.5);
        ctx.lineTo(b.x + 8, b.y); ctx.lineTo(b.x + 2.5, b.y + 2.5);
        ctx.lineTo(b.x, b.y + 8); ctx.lineTo(b.x - 2.5, b.y + 2.5);
        ctx.lineTo(b.x - 8, b.y); ctx.lineTo(b.x - 2.5, b.y - 2.5);
        ctx.closePath(); ctx.fill();
        break;
      default: // 兜底：青色胶囊
        ctx.fillStyle = 'rgba(108,242,255,0.35)';
        ctx.fillRect(b.x - 4, b.y - 12, 8, 20);
        ctx.fillStyle = '#d9fbff';
        ctx.fillRect(b.x - 2, b.y - 9, 4, 14);
        break;
    }
  }
}

function drawEBullets() {
  for (var i = 0; i < ebullets.length; i++) {
    var b = ebullets[i];
    ctx.beginPath();
    ctx.arc(b.x, b.y, 7, 0, TAU);
    ctx.fillStyle = 'rgba(255,120,60,0.4)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, TAU);
    ctx.fillStyle = '#ffd9a0';
    ctx.fill();
  }
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
