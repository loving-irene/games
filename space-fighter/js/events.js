/*
 * 星际远征流程：成长奖励 / 星门 / 拾荒 / 救援 / 机关躲避
 * （共享全局作用域，加载顺序：progression.js -> events.js -> render.js）
 */

var EVENT_DEFS = {
  salvage: { name: '太空拾荒', color: '#6cf2ff', reward: '武器模块' },
  rescue: { name: '救援任务', color: '#7dffb0', reward: '防御补给' },
  dodge: { name: '机关躲避', color: '#ff9e5c', reward: '稀有模块' }
};

var runState = {};
var routeGates = [];
var eventItems = [];
var eventHazards = [];
var eventWalls = [];

function resetRunFlow() {
  runState = {
    phase: 'combat',
    gateTime: 0,
    event: null,
    pendingWave: 1,
    rewardType: ''
  };
  routeGates.length = 0;
  eventItems.length = 0;
  eventHazards.length = 0;
  eventWalls.length = 0;
}

function setRunPhase(phase) {
  runState.phase = phase;
}

function isCombatRunPhase() {
  return runState.phase === 'combat' || runState.phase === 'boss';
}

function isAutoFireEnabled() {
  return isCombatRunPhase();
}

function clearCombatObjects() {
  bullets.length = 0;
  ebullets.length = 0;
  enemies.length = 0;
  powerups.length = 0;
}

function finishWaveFlow(wave) {
  runState.pendingWave = wave + 1;
  clearCombatObjects();
  if (wave % 5 === 0) {
    startModuleReward(true, 3);
  } else if (wave % 2 === 0) {
    startGateSelection();
  } else {
    startUpgradeReward();
  }
}

function startUpgradeReward() {
  setRunPhase('reward');
  runState.rewardType = 'upgrade';
  showRewardChoice('选择强化', '强化仅在本局远征中生效', getUpgradeChoices(3), function (id) {
    applyUpgrade(id);
    advanceRunWave();
  });
}

function startModuleReward(rare, count) {
  setRunPhase('reward');
  runState.rewardType = 'module';
  showRewardChoice(rare ? '稀有模块' : '回收模块', '模块会自动寻找可用合成配方', getModuleChoices(count, rare), function (id) {
    addWeaponModule(id);
    advanceRunWave();
  });
}

function startGateSelection() {
  setRunPhase('gate');
  runState.gateTime = 12;
  player.x = LW / 2;
  player.y = LH - 150;
  player.inv = Math.max(player.inv, 1);
  routeGates = [
    { kind: 'salvage', x: 100, y: 330, r: 58, t: 0 },
    { kind: 'rescue', x: 270, y: 330, r: 58, t: 1.5 },
    { kind: 'dodge', x: 440, y: 330, r: 58, t: 3 }
  ];
  showBanner('选择星门', '#eaf6ff', 1.6);
}

function chooseGate(kind) {
  routeGates.length = 0;
  startRunEvent(kind);
}

function startRunEvent(kind) {
  var duration = kind === 'dodge' ? 18 : (kind === 'salvage' ? 22 : 24);
  setRunPhase('event');
  clearCombatObjects();
  eventItems.length = 0;
  eventHazards.length = 0;
  eventWalls.length = 0;
  player.x = LW / 2;
  player.y = LH - 150;
  player.inv = 1;
  runState.event = {
    kind: kind,
    time: duration,
    maxTime: duration,
    spawnT: 0.2,
    collected: 0,
    rescued: 0,
    lost: 0,
    penalties: 0,
    target: kind === 'salvage' ? (G.diffMode === 'easy' ? 12 : 18) : (G.diffMode === 'easy' ? 4 : 6)
  };
  showBanner(EVENT_DEFS[kind].name, EVENT_DEFS[kind].color, 1.8);
}

function updateRunFlow(dt) {
  if (runState.phase === 'gate') updateGateSelection(dt);
  else if (runState.phase === 'event') updateRunEvent(dt);
}

function updateGateSelection(dt) {
  runState.gateTime -= dt;
  var nearest = routeGates[0];
  for (var i = 0; i < routeGates.length; i++) {
    var gate = routeGates[i];
    gate.t += dt;
    if (Math.abs(player.x - gate.x) < Math.abs(player.x - nearest.x)) nearest = gate;
    if (circleHit(player.x, player.y, player.r + 4, gate.x, gate.y, gate.r)) {
      chooseGate(gate.kind);
      return;
    }
  }
  if (runState.gateTime <= 0 && nearest) chooseGate(nearest.kind);
}

function spawnSalvageObject() {
  if (Math.random() < 0.24) {
    eventHazards.push({ kind: 'mine', x: rand(35, LW - 35), y: -30, r: 16, vy: rand(135, 190), t: 0 });
  } else {
    eventItems.push({ kind: 'part', x: rand(28, LW - 28), y: -20, r: 10, vy: rand(115, 180), t: Math.random() * TAU });
  }
}

function spawnRescueObject() {
  eventItems.push({ kind: 'pod', x: rand(38, LW - 38), y: -30, r: 15, vy: rand(85, 125), t: Math.random() * TAU });
  if (Math.random() < 0.45) {
    eventHazards.push({ kind: 'hunter', x: rand(35, LW - 35), y: -40, r: 16, vy: rand(150, 210), t: 0 });
  }
}

function spawnDodgeWall() {
  var gapW = G.diffMode === 'easy' ? 190 : 132;
  eventWalls.push({
    y: -24,
    h: 26,
    gapX: rand(gapW / 2 + 24, LW - gapW / 2 - 24),
    gapW: gapW,
    vy: (G.diffMode === 'easy' ? 175 : 245) + G.wave * 2,
    hit: false
  });
}

function updateRunEvent(dt) {
  var ev = runState.event;
  if (!ev) return;
  ev.time -= dt;
  ev.spawnT -= dt;
  if (ev.spawnT <= 0) {
    if (ev.kind === 'salvage') { spawnSalvageObject(); ev.spawnT = 0.36; }
    else if (ev.kind === 'rescue') { spawnRescueObject(); ev.spawnT = 1.45; }
    else { spawnDodgeWall(); ev.spawnT = 1.25; }
  }
  updateEventItems(dt, ev);
  updateEventHazards(dt, ev);
  updateEventWalls(dt, ev);
  if (ev.time <= 0) finishRunEvent();
}

function updateEventItems(dt, ev) {
  var magnet = pickupMagnetRadius();
  for (var i = eventItems.length - 1; i >= 0; i--) {
    var item = eventItems[i];
    item.t += dt;
    item.y += item.vy * dt;
    if (item.kind === 'part' && magnet > 0) {
      var dx = player.x - item.x, dy = player.y - item.y;
      var dist = Math.hypot(dx, dy);
      if (dist < magnet && dist > 1) {
        item.x += dx / dist * 260 * dt;
        item.y += dy / dist * 260 * dt;
      }
    }
    if (circleHit(player.x, player.y, player.r + 5, item.x, item.y, item.r)) {
      eventItems.splice(i, 1);
      if (item.kind === 'part') {
        ev.collected++;
        G.score += 40;
        addFloat('+40', player.x, player.y - 30, '#6cf2ff');
      } else {
        ev.rescued++;
        G.score += 150;
        addFloat('救援 +1', player.x, player.y - 30, '#7dffb0');
      }
      sfx.powerup();
      continue;
    }
    if (item.y > LH + 35) {
      if (item.kind === 'pod') ev.lost++;
      eventItems.splice(i, 1);
    }
  }
}

function eventPenalty(x, y) {
  var ev = runState.event;
  if (player.inv > 0 || !ev) return;
  ev.penalties++;
  player.inv = 0.9;
  G.score = Math.max(0, G.score - 50);
  G.shake = Math.max(G.shake, 8);
  sparks(x, y, 12, '#ff8a5c');
  addFloat('-50', player.x, player.y - 28, '#ff8a5c');
  sfx.hit();
}

function updateEventHazards(dt) {
  for (var i = eventHazards.length - 1; i >= 0; i--) {
    var hazard = eventHazards[i];
    hazard.t += dt;
    hazard.y += hazard.vy * dt;
    if (hazard.kind === 'hunter') hazard.x += Math.sin(hazard.t * 3) * 55 * dt;
    if (circleHit(player.x, player.y, player.r - 3, hazard.x, hazard.y, hazard.r)) {
      eventPenalty(hazard.x, hazard.y);
      eventHazards.splice(i, 1);
      continue;
    }
    if (hazard.y > LH + 45) eventHazards.splice(i, 1);
  }
}

function updateEventWalls(dt) {
  for (var i = eventWalls.length - 1; i >= 0; i--) {
    var wall = eventWalls[i];
    wall.y += wall.vy * dt;
    if (!wall.hit && Math.abs(player.y - wall.y) < wall.h / 2 + player.r - 4) {
      var safeLeft = wall.gapX - wall.gapW / 2;
      var safeRight = wall.gapX + wall.gapW / 2;
      if (player.x - player.r < safeLeft || player.x + player.r > safeRight) {
        wall.hit = true;
        eventPenalty(player.x, player.y);
      }
    }
    if (wall.y > LH + 50) eventWalls.splice(i, 1);
  }
}

function finishRunEvent() {
  var ev = runState.event;
  var success;
  if (ev.kind === 'salvage') success = ev.collected >= ev.target;
  else if (ev.kind === 'rescue') success = ev.rescued >= ev.target;
  else success = ev.penalties <= (G.diffMode === 'easy' ? 6 : 3);
  eventItems.length = 0;
  eventHazards.length = 0;
  eventWalls.length = 0;
  runState.event = null;
  showBanner(success ? '事件完成' : '事件结束 · 奖励减少', success ? '#7dffb0' : '#ffd25d', 1.8);
  if (ev.kind === 'rescue' && success) {
    player.hp = Math.min(player.maxHp, player.hp + 1);
    player.shield = true;
  }
  startModuleReward(ev.kind === 'dodge' && success, success ? 3 : 2);
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
  if (runState.phase === 'gate') {
    return { title: '选择星门', progress: Math.max(0, Math.ceil(runState.gateTime)) + 's' };
  }
  if (runState.phase !== 'event' || !runState.event) return null;
  var ev = runState.event;
  var value;
  if (ev.kind === 'salvage') value = ev.collected + '/' + ev.target;
  else if (ev.kind === 'rescue') value = ev.rescued + '/' + ev.target + ' · 漏失 ' + ev.lost;
  else value = '碰撞 ' + ev.penalties;
  return { title: EVENT_DEFS[ev.kind].name, progress: value + ' · ' + Math.max(0, Math.ceil(ev.time)) + 's' };
}

resetRunFlow();
