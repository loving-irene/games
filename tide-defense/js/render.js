/*
 * 渲染：天空 / 海面 / 斜拉桥（透视桥面：远端 80% 宽）/ 小队 / 敌人 / 道具 / 覆盖层 / HUD
 * （共享全局作用域，加载顺序：entities.js -> render.js -> game.js）
 */

var seaTime = 0;

// 士兵贴图：原图为多小人素材表，只取最下一行第 1 个（含 1px 边距）
var soldierImg = new Image();
soldierImg.src = encodeURI('iaqgv_爱给网_aigei_com.png');
var SOLDIER_SRC = { x: 11, y: 170, w: 31, h: 50 };

// 怪兽 / 特效贴图：素材表 1536×1024（怪兽切块见 entities.js 的 MONSTER_SPRITES）
var monsterImg = new Image();
monsterImg.src = encodeURI('asset_94Qyad3lbmqi1tOF.png');

// 特效帧（素材表最下一行）：枪口闪光 / 命中火花 / 击杀爆炸
var FX_SRC = {
  muzzle: { x: 1034, y: 931, w: 54, h: 53 },
  hit:    { x: 342,  y: 926, w: 91, h: 69 },
  boom:   { x: 1358, y: 901, w: 141, h: 98 }
};

// 预生成：星星（天空）与海面泡沫
var stars = [];
var foam = [];
(function initScene() {
  for (var i = 0; i < 46; i++) {
    stars.push({ x: Math.random() * 960, y: Math.random() * (HORIZON_Y - 10), r: rand(0.5, 1.4), tw: rand(0, TAU) });
  }
  for (var j = 0; j < 56; j++) {
    // 两侧海面区域：归一化位置
    var side = Math.random() < 0.5 ? -1 : 1;
    foam.push({
      side: side,
      u: Math.random(),                      // 沿深度 0(远)..1(近)
      off: rand(0.06, 1),                    // 离桥边距离系数
      spd: rand(0.018, 0.05),
      r: rand(0.8, 2.2)
    });
  }
})();

function updateBg(dt) {
  seaTime += dt;
  for (var i = 0; i < foam.length; i++) {
    var f = foam[i];
    f.u += f.spd * dt;
    if (f.u > 1) { f.u = 0; f.off = rand(0.06, 1); f.side = Math.random() < 0.5 ? -1 : 1; }
  }
}

// ---------------- 天空与海面 ----------------
function drawSkySea() {
  // 天空
  var sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 30);
  sky.addColorStop(0, '#0a1220');
  sky.addColorStop(1, '#1b2c42');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, LW, HORIZON_Y + 30);

  // 星星
  ctx.fillStyle = '#cfe0f0';
  for (var i = 0; i < stars.length; i++) {
    var st = stars[i];
    ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(seaTime * 0.7 + st.tw));
    ctx.fillRect(st.x, st.y, st.r, st.r);
  }
  ctx.globalAlpha = 1;

  // 海面
  var sea = ctx.createLinearGradient(0, HORIZON_Y, 0, LH);
  sea.addColorStop(0, '#0d3038');
  sea.addColorStop(1, '#05161c');
  ctx.fillStyle = sea;
  ctx.fillRect(0, HORIZON_Y, LW, LH - HORIZON_Y);

  // 波浪线：近疏远密
  var y = HORIZON_Y + 6;
  while (y < LH) {
    var depth = (y - HORIZON_Y) / (LH - HORIZON_Y);
    ctx.strokeStyle = 'rgba(140,220,215,' + (0.05 + depth * 0.12).toFixed(3) + ')';
    ctx.lineWidth = 1 + depth;
    ctx.beginPath();
    for (var x = 0; x <= LW; x += 26) {
      var wy = y + Math.sin(seaTime * 1.6 + x * 0.02 + y * 0.13) * (1 + depth * 3);
      if (x === 0) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
    }
    ctx.stroke();
    y += 6 + depth * 16;
  }

  // 泡沫点（两侧海面）
  ctx.fillStyle = 'rgba(200,240,235,0.28)';
  for (var k = 0; k < foam.length; k++) {
    var f2 = foam[k];
    var wy2 = HORIZON_Y + 8 + f2.u * (LH - HORIZON_Y - 12);
    var edge = deckHalfW(wy2) + 14;
    var fx = LW / 2 + f2.side * (edge + f2.off * (LW / 2 - edge - 8));
    ctx.fillRect(fx, wy2, f2.r * (0.5 + f2.u), f2.r * (0.5 + f2.u) * 0.7);
  }
}

// ---------------- 斜拉桥（透视桥面：远端 80% 宽，近端 100%，由远到近变大） ----------------
// 透视辅助：t=0 桥远端 .. 1 桥近端（逻辑坐标仍是 ±DECK_HALF，仅渲染时收缩）
function deckT(y)     { return clamp((y - HORIZON_Y) / (LH - HORIZON_Y), 0, 1); }
function deckK(y)     { return 0.8 + 0.2 * deckT(y); }             // 该深度的宽度比例
function deckHalfW(y) { return DECK_HALF * deckK(y); }             // 该深度的桥面半宽
function deckX(y, x)  { return LW / 2 + (x - LW / 2) * deckK(y); } // 逻辑 x -> 视觉 x

function drawBridge() {
  var farHalf = deckHalfW(HORIZON_Y);   // 远端半宽（80%）
  var nearHalf = deckHalfW(LH);         // 近端半宽（100%）

  // 桥面：灰白色梯形
  var deck = ctx.createLinearGradient(0, HORIZON_Y, 0, LH);
  deck.addColorStop(0, '#6f6d62');
  deck.addColorStop(0.35, '#9a968a');
  deck.addColorStop(1, '#c2bcae');
  ctx.fillStyle = deck;
  ctx.beginPath();
  ctx.moveTo(LW / 2 - farHalf, HORIZON_Y);
  ctx.lineTo(LW / 2 + farHalf, HORIZON_Y);
  ctx.lineTo(LW / 2 + nearHalf, LH);
  ctx.lineTo(LW / 2 - nearHalf, LH);
  ctx.closePath();
  ctx.fill();

  // 横向接缝 + 中线虚线 + 护栏立柱（近疏远密，随透视收缩变大）
  var y = LH - 8;
  while (y > HORIZON_Y + 26) {
    var s = clamp((y - HORIZON_Y) / (PLAYER_Y - HORIZON_Y), 0.3, 1.2);
    var hw = deckHalfW(y);
    // 接缝
    ctx.strokeStyle = 'rgba(60,58,50,' + (0.05 + s * 0.16).toFixed(3) + ')';
    ctx.lineWidth = Math.max(0.6, 1.6 * s);
    ctx.beginPath();
    ctx.moveTo(LW / 2 - hw * 0.97, y);
    ctx.lineTo(LW / 2 + hw * 0.97, y);
    ctx.stroke();
    // 中线虚线段（中轴垂直）
    var dashLen = 8 + (y - HORIZON_Y) * 0.09;
    ctx.strokeStyle = 'rgba(230,225,205,' + (0.12 + s * 0.5).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1, 2.6 * s);
    ctx.beginPath();
    ctx.moveTo(LW / 2, y);
    ctx.lineTo(LW / 2, Math.max(HORIZON_Y + 2, y - dashLen));
    ctx.stroke();
    // 两侧护栏立柱（贴透视边缘，近大远小）
    ctx.fillStyle = 'rgba(52,50,44,' + (0.15 + s * 0.55).toFixed(3) + ')';
    var ph = (4 + 9 * s) * deckK(y);
    var pw = Math.max(1, 2.2 * s) * deckK(y);
    ctx.fillRect(LW / 2 - hw - 1, y - ph, pw, ph);
    ctx.fillRect(LW / 2 + hw - pw + 1, y - ph, pw, ph);
    y -= dashLen * 2.4;
  }

  // 桥面两条斜边缘线（由远到近张开）
  ctx.strokeStyle = 'rgba(216,210,194,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LW / 2 - farHalf, HORIZON_Y);
  ctx.lineTo(LW / 2 - nearHalf, LH);
  ctx.moveTo(LW / 2 + farHalf, HORIZON_Y);
  ctx.lineTo(LW / 2 + nearHalf, LH);
  ctx.stroke();

  // 桥塔：白色立柱 + 横梁（矗立远端，按远端 80% 比例收窄）
  var tk = deckK(HORIZON_Y);
  ctx.fillStyle = '#cfd6dd';
  ctx.fillRect(LW / 2 - 15 * tk, 26, 6 * tk, HORIZON_Y - 26);
  ctx.fillRect(LW / 2 + 9 * tk, 26, 6 * tk, HORIZON_Y - 26);
  ctx.fillStyle = '#b9c2cb';
  ctx.fillRect(LW / 2 - 17 * tk, 32, 34 * tk, 5);
  ctx.fillRect(LW / 2 - 17 * tk, 58, 34 * tk, 4);

  // 斜拉索：红棕色，塔顶呈扇形拉向透视桥缘，越近越粗
  var anchors = [HORIZON_Y + 8, 225, 290, 365, 445, LH - 6];
  for (var a = 0; a < anchors.length; a++) {
    var ay = anchors[a];
    var alpha = 0.55 - a * 0.035;
    var ax = deckHalfW(ay);
    ctx.strokeStyle = 'rgba(150,62,44,' + alpha.toFixed(3) + ')';
    ctx.lineWidth = 0.9 + 1.5 * deckT(ay);
    ctx.beginPath();
    ctx.moveTo(LW / 2 - 10, 36);
    ctx.lineTo(LW / 2 - ax, ay);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(LW / 2 + 10, 36);
    ctx.lineTo(LW / 2 + ax, ay);
    ctx.stroke();
  }
}

// ---------------- 敌人（怪兽贴图：同类随机外观，受击整体闪烁） ----------------
function drawEnemies() {
  var useImg = monsterImg.complete && monsterImg.naturalWidth > 0;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    var def = ENEMY_TYPES[e.type];
    var s = depthScale(e.y);
    var r = def.r * s;
    var x = deckX(e.y, e.x), y = e.y;

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.35, r * 1.1, r * 0.3, 0, 0, TAU);
    ctx.fill();

    if (useImg) {
      // 贴图：脚底锚点对齐 y，远小近大，受击时整体半透明闪烁
      var sp = e.sp || MONSTER_SPRITES[e.type][0];
      var h = def.dispH * (0.6 + 0.4 * s);
      var w = h * sp.w / sp.h;
      ctx.globalAlpha = e.hurt > 0 ? 0.5 : 1;
      ctx.drawImage(monsterImg, sp.x, sp.y, sp.w, sp.h, x - w / 2, y - h, w, h);
      ctx.globalAlpha = 1;
      var headY = y - h; // 血条挂在头顶
    } else {
      // 矢量回退（贴图未加载时）
      var sw = Math.sin(e.bob) * r * 0.42;
      ctx.strokeStyle = '#3a2620';
      ctx.lineWidth = Math.max(1.2, r * 0.22);
      ctx.beginPath();
      ctx.moveTo(x, y + r * 0.2);
      ctx.lineTo(x + sw, y + r * 1.0);
      ctx.moveTo(x, y + r * 0.2);
      ctx.lineTo(x - sw, y + r * 1.0);
      ctx.stroke();
      ctx.fillStyle = '#7a4638';
      ctx.fillRect(x - r * 0.45, y - r * 0.72, r * 0.9, r * 1.0);
      ctx.fillStyle = '#c9a184';
      ctx.beginPath();
      ctx.arc(x, y - r * 0.95, r * 0.34, 0, TAU);
      ctx.fill();
      if (e.hurt > 0) {
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - r * 0.45, y - r * 0.72, r * 0.9, r * 1.0);
        ctx.globalAlpha = 1;
      }
      var headY = y - r * 1.55;
    }

    // 血条（受损后显示）
    if (e.hp < e.maxHp) {
      var bw = Math.max(8, r * 1.3);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - bw / 2, headY - 7, bw, 3);
      ctx.fillStyle = '#ff5d6c';
      ctx.fillRect(x - bw / 2, headY - 7, bw * (e.hp / e.maxHp), 3);
    }
  }
}

// ---------------- 小队士兵（背面视角，贴图渲染） ----------------
function drawSquad() {
  if (!player.alive) return;
  var xs = soldierXs();

  // 影子
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  for (var i = 0; i < xs.length; i++) {
    ctx.beginPath();
    ctx.ellipse(xs[i], PLAYER_Y + 4, 14, 4.5, 0, 0, TAU);
    ctx.fill();
  }

  var useImg = soldierImg.complete && soldierImg.naturalWidth > 0;
  var h = 54, w = h * SOLDIER_SRC.w / SOLDIER_SRC.h;

  for (var j = 0; j < xs.length; j++) {
    var x = xs[j], y = PLAYER_Y;

    if (useImg) {
      // 贴图：只画素材表最下一行第 1 个小人，脚底锚点对齐 y，受击时整体闪烁
      ctx.globalAlpha = (player.hurtT > 0 && Math.floor(player.hurtT * 30) % 2 === 0) ? 0.55 : 1;
      ctx.drawImage(soldierImg, SOLDIER_SRC.x, SOLDIER_SRC.y, SOLDIER_SRC.w, SOLDIER_SRC.h,
                    x - w / 2, y + 4 - h, w, h);
      ctx.globalAlpha = 1;
    } else {
      // 矢量回退（贴图未加载时）
      ctx.fillStyle = player.hurtT > 0 && (Math.floor(player.hurtT * 30) % 2 === 0) ? '#ff6a5a' : '#3c4a52';
      ctx.fillRect(x - 11, y - 28, 22, 30);
      ctx.fillStyle = '#2c3a42';
      ctx.fillRect(x - 13, y - 28, 4.5, 11);
      ctx.fillRect(x + 8.5, y - 28, 4.5, 11);
      ctx.fillStyle = '#d9b38c';
      ctx.beginPath();
      ctx.arc(x, y - 34, 6.8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#26343c';
      ctx.beginPath();
      ctx.arc(x, y - 36, 6.8, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = '#1c2126';
      ctx.fillRect(x - 2.2, y - 56, 4.4, 22);
      ctx.fillRect(x - 4.2, y - 40, 8.4, 4.5);
    }

    // 枪口闪光（素材特效帧，齐射闪烁；未加载时回退径向渐变）
    if (player.flash > 0) {
      var mx = x, my = y - 52;
      var useFx = monsterImg.complete && monsterImg.naturalWidth > 0;
      if (useFx) {
        var ms = FX_SRC.muzzle;
        var mh = 30, mw = mh * ms.w / ms.h;
        ctx.globalAlpha = 0.6 + 0.4 * (player.flash / 0.06);
        ctx.drawImage(monsterImg, ms.x, ms.y, ms.w, ms.h, mx - mw / 2, my - mh / 2, mw, mh);
        ctx.globalAlpha = 1;
      } else {
        var g = ctx.createRadialGradient(mx, my, 0, mx, my, 14);
        g.addColorStop(0, 'rgba(255,220,120,0.95)');
        g.addColorStop(0.5, 'rgba(255,150,50,0.6)');
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(mx, my, 14, 0, TAU);
        ctx.fill();
      }
    }
  }
}

// ---------------- 道具（板条箱 + 标签） ----------------
function drawPowerups() {
  for (var i = 0; i < powerups.length; i++) {
    var p = powerups[i];
    var bobY = Math.sin(p.bob) * 4;
    var x = deckX(p.y, p.x), y = p.y + bobY;
    var half = 17 * deckK(p.y);

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, p.y + 24, 14, 4, 0, 0, TAU);
    ctx.fill();

    // 板条箱
    ctx.fillStyle = '#8a6b42';
    ctx.fillRect(x - half, y - half, half * 2, half * 2);
    ctx.strokeStyle = '#5f4a2c';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
    ctx.beginPath();
    ctx.moveTo(x - half, y - half);
    ctx.lineTo(x + half, y + half);
    ctx.moveTo(x + half, y - half);
    ctx.lineTo(x - half, y + half);
    ctx.stroke();

    // 标签
    var label, color;
    if (p.kind === 'weapon') { label = 'W'; color = '#ffd25d'; }
    else if (p.kind === 'add') { label = '+' + p.n; color = '#7ce8a0'; }
    else { label = 'x2'; color = '#ffab5c'; }
    ctx.font = 'bold ' + Math.max(10, Math.round(14 * deckK(p.y))) + 'px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - half + 3, y - 9, half * 2 - 6, 18);
    ctx.fillStyle = color;
    ctx.fillText(label, x, y + 1);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}

// ---------------- 子弹（黄色曳光） ----------------
function drawBullets() {
  for (var i = 0; i < bullets.length; i++) {
    var b = bullets[i];
    var s = depthScale(b.y);
    var bx = deckX(b.y, b.x);
    var len = 11 * s;
    ctx.strokeStyle = 'rgba(255,210,93,0.35)';
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.moveTo(bx, b.y - len);
    ctx.lineTo(bx, b.y + len);
    ctx.stroke();
    ctx.strokeStyle = '#ffd25d';
    ctx.lineWidth = Math.max(1, 2.4 * s);
    ctx.beginPath();
    ctx.moveTo(bx, b.y - len);
    ctx.lineTo(bx, b.y + len);
    ctx.stroke();
  }
}

// ---------------- 击中特效（素材表最下一行爆炸帧：命中 / 击杀） ----------------
function drawHitFxs() {
  if (!(monsterImg.complete && monsterImg.naturalWidth > 0)) return;
  for (var i = 0; i < hitFxs.length; i++) {
    var f = hitFxs[i];
    var src = FX_SRC[f.kind];
    var p = f.t / f.dur;                 // 0..1 播放进度
    var s = depthScale(f.y);
    var base = f.kind === 'boom' ? 76 : 34; // 目标显示高度
    var h = base * s * (0.55 + 0.55 * p);   // 由小撑开
    var w = h * src.w / src.h;
    ctx.globalAlpha = Math.max(0, 1 - p * 0.9);
    ctx.drawImage(monsterImg, src.x, src.y, src.w, src.h,
                  deckX(f.y, f.x) - w / 2, f.y - h / 2, w, h);
  }
  ctx.globalAlpha = 1;
}

// ---------------- 粒子 ----------------
function drawParticles() {
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = a;
    if (p.ring) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(deckX(p.y, p.x), p.y, p.r, 0, TAU);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(deckX(p.y, p.x), p.y, p.r, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------- 浮字（拾取反馈） ----------------
function drawFloaters() {
  ctx.font = 'bold 16px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (var i = 0; i < floaters.length; i++) {
    var f = floaters[i];
    var fx = deckX(f.y, f.x);
    ctx.globalAlpha = Math.max(0, Math.min(1, f.t * 1.4));
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(f.text, fx + 1, f.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, fx, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// ---------------- 覆盖层：低兵红脉冲 + 覆灭变暗 ----------------
function drawOverlays() {
  var low = player.alive && squad.count > 0 && squad.count <= 2;

  // 低兵量：边缘红晕 + 每 0.67s 全屏红脉冲
  if (low && G.mode === 'playing') {
    var phase = G.pulseT / 0.667;
    var pulseA = Math.sin(phase * Math.PI) * 0.3;
    ctx.fillStyle = 'rgba(200,20,16,' + pulseA.toFixed(3) + ')';
    ctx.fillRect(0, 0, LW, LH);
    var vg = ctx.createRadialGradient(LW / 2, LH / 2, LH * 0.3, LW / 2, LH / 2, LH * 0.75);
    vg.addColorStop(0, 'rgba(180,20,20,0)');
    vg.addColorStop(1, 'rgba(180,20,20,0.3)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, LW, LH);
  }

  // 受击闪红
  if (player.hurtT > 0 && G.mode === 'playing') {
    ctx.fillStyle = 'rgba(255,60,40,' + (player.hurtT * 0.5).toFixed(3) + ')';
    ctx.fillRect(0, 0, LW, LH);
  }

  // 覆灭：画面变暗
  if (G.mode === 'dying' || G.mode === 'over') {
    ctx.fillStyle = 'rgba(2,4,8,' + (G.darken * 0.94).toFixed(3) + ')';
    ctx.fillRect(0, 0, LW, LH);
  }
}

// ---------------- HUD：左上角两行小字 ----------------
function drawHud() {
  if (G.mode !== 'playing' && G.mode !== 'dying' && G.mode !== 'paused') return;
  ctx.font = '12px Consolas, monospace';
  ctx.textBaseline = 'top';

  var x = 14, y = 12;
  // 士兵 + 武器等级
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x - 2, y - 2, 168, 22);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('士兵', x, y + 5);
  var stars = '';
  for (var s = 0; s < squad.level; s++) stars += '★';
  ctx.fillStyle = '#ffd25d';
  ctx.fillText(stars, x + 38, y + 5);
  ctx.fillStyle = squad.count <= 2 ? '#ff5d4a' : 'rgba(255,255,255,0.85)';
  ctx.fillText('x' + squad.count, x + 40 + stars.length * 12, y + 5);

  // 击杀 / 时间 / 最佳
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x - 2, y + 22, 168, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('击杀 ' + G.kills + '  时间 ' + Math.floor(G.time) + 's  最佳 ' + G.best, x, y + 25);
}

// ---------------- 总渲染 ----------------
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY);

  ctx.save();
  if (G.shake > 0) {
    ctx.translate(rand(-1, 1) * G.shake * 0.4, rand(-1, 1) * G.shake * 0.4);
  }

  drawSkySea();
  drawBridge();
  drawPowerups();
  drawEnemies();
  drawSquad();
  drawBullets();
  drawHitFxs();
  drawParticles();
  drawFloaters();
  drawOverlays();
  drawHud();

  ctx.restore();
}
