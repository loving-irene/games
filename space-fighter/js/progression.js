/*
 * 局内成长数据：武器模块 / 自动合成（强化定义保留用于兼容存档与测试）
 * （共享全局作用域，加载顺序：entities.js -> progression.js -> events.js）
 */

var UPGRADE_DEFS = [
  { id: 'overclock', icon: '⚡', name: '超频扳机', desc: '射击冷却缩短 8%', max: 5 },
  { id: 'engine', icon: '◆', name: '推进增幅', desc: '移动速度提升 10%', max: 5 },
  { id: 'magnet', icon: '◎', name: '引力收集', desc: '扩大物资吸取范围', max: 4 },
  { id: 'armor', icon: '＋', name: '纳米装甲', desc: '生命上限与当前生命 +1', max: 5 },
  { id: 'shield', icon: '◉', name: '备用护盾', desc: '立即获得一次能量护盾', max: 3 },
  { id: 'bomb', icon: '✦', name: '爆破增幅', desc: '炸弹伤害提升 35%', max: 4 }
];

var MODULE_DEFS = [
  { id: 'pulse', icon: '▮', name: '脉冲核心' },
  { id: 'lens', icon: '◇', name: '扩散镜片' },
  { id: 'missile', icon: '▲', name: '飞弹核心' },
  { id: 'guide', icon: '⌖', name: '制导芯片' },
  { id: 'laser', icon: '┃', name: '激光核心' },
  { id: 'pierce', icon: '◆', name: '穿透晶体' },
  { id: 'blade', icon: '◈', name: '回旋刃片' },
  { id: 'orbit', icon: '◌', name: '环绕线圈' },
  { id: 'ion', icon: '▰', name: '离子核心' },
  { id: 'arc', icon: 'ϟ', name: '电弧核心' },
  { id: 'coil', icon: '∿', name: '导电线圈' },
  { id: 'prism', icon: '◬', name: '棱镜核心' },
  { id: 'plasma', icon: '●', name: '等离子核心' },
  { id: 'heavy', icon: '⬢', name: '重炮组件' },
  { id: 'star', icon: '✧', name: '星辰核心', rare: true }
];

var FUSION_RECIPES = [
  { a: 'pulse', b: 'lens', weapon: 2 },
  { a: 'missile', b: 'guide', weapon: 3 },
  { a: 'laser', b: 'pierce', weapon: 4 },
  { a: 'blade', b: 'orbit', weapon: 5 },
  { a: 'ion', b: 'pierce', weapon: 6 },
  { a: 'arc', b: 'coil', weapon: 7 },
  { a: 'prism', b: 'lens', weapon: 8 },
  { a: 'plasma', b: 'heavy', weapon: 9 },
  { a: 'star', b: 'star', weapon: 10 }
];

var runProgress = {};

function resetProgression() {
  runProgress = {
    upgrades: { overclock: 0, engine: 0, magnet: 0, armor: 0, shield: 0, bomb: 0 },
    modules: {},
    fusionCount: 0,
    lastFusion: 0
  };
}

function findById(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

function shuffledCopy(list) {
  var out = list.slice();
  for (var i = out.length - 1; i > 0; i--) {
    var j = (Math.random() * (i + 1)) | 0;
    var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

function getUpgradeChoices(count) {
  var available = UPGRADE_DEFS.filter(function (item) {
    return runProgress.upgrades[item.id] < item.max;
  });
  if (available.length < count) available = UPGRADE_DEFS.slice();
  return shuffledCopy(available).slice(0, count);
}

function applyUpgrade(id) {
  var def = findById(UPGRADE_DEFS, id);
  if (!def) return null;
  runProgress.upgrades[id] = Math.min(def.max, (runProgress.upgrades[id] || 0) + 1);
  if (id === 'engine') player.speed = 350 * (1 + runProgress.upgrades.engine * 0.1);
  if (id === 'armor') {
    player.maxHp++;
    player.hp = Math.min(player.maxHp, player.hp + 1);
  }
  if (id === 'shield') player.shield = true;
  sfx.levelup();
  showBanner(def.name + ' Lv' + runProgress.upgrades[id], '#7dffb0', 1.8);
  return def;
}

function weaponCooldown(base) {
  return base * Math.max(0.6, 1 - runProgress.upgrades.overclock * 0.08);
}

function pickupMagnetRadius() {
  return runProgress.upgrades.magnet * 62;
}

function bombDamageMultiplier() {
  return 1 + runProgress.upgrades.bomb * 0.35;
}

function moduleCount(id) {
  return runProgress.modules[id] || 0;
}

function modulePartner(id) {
  for (var i = 0; i < FUSION_RECIPES.length; i++) {
    var recipe = FUSION_RECIPES[i];
    if (recipe.a === id) return recipe.b;
    if (recipe.b === id) return recipe.a;
  }
  return null;
}

function moduleFusionHint(id) {
  var partner = modulePartner(id);
  var partnerDef = findById(MODULE_DEFS, partner);
  for (var i = 0; i < FUSION_RECIPES.length; i++) {
    var recipe = FUSION_RECIPES[i];
    if ((recipe.a === id && recipe.b === partner) || (recipe.b === id && recipe.a === partner)) {
      return '与' + partnerDef.name + '合成' + weaponName(recipe.weapon);
    }
  }
  return '用于武器合成';
}

function compatibleModuleChoices() {
  var partners = [];
  Object.keys(runProgress.modules).forEach(function (id) {
    if (runProgress.modules[id] <= 0) return;
    var partner = modulePartner(id);
    if (partner && partners.indexOf(partner) < 0) partners.push(partner);
  });
  return partners;
}

function getModuleChoices(count, rare) {
  var ids = [];
  var compatible = shuffledCopy(compatibleModuleChoices());
  if (compatible.length) ids.push(compatible[0]);
  var pool = MODULE_DEFS.filter(function (item) { return rare || !item.rare; });
  if (rare && ids.indexOf('star') < 0) ids.push('star');
  var shuffled = shuffledCopy(pool);
  for (var i = 0; i < shuffled.length && ids.length < count; i++) {
    if (ids.indexOf(shuffled[i].id) < 0) ids.push(shuffled[i].id);
  }
  return ids.slice(0, count).map(function (id) { return findById(MODULE_DEFS, id); });
}

function canConsumeRecipe(recipe) {
  if (recipe.a === recipe.b) return moduleCount(recipe.a) >= 2;
  return moduleCount(recipe.a) > 0 && moduleCount(recipe.b) > 0;
}

function consumeRecipe(recipe) {
  runProgress.modules[recipe.a]--;
  runProgress.modules[recipe.b]--;
}

function addWeaponModule(id) {
  var def = findById(MODULE_DEFS, id);
  if (!def) return null;
  runProgress.modules[id] = moduleCount(id) + 1;
  var fusion = null;
  for (var i = FUSION_RECIPES.length - 1; i >= 0; i--) {
    if (canConsumeRecipe(FUSION_RECIPES[i])) { fusion = FUSION_RECIPES[i]; break; }
  }
  if (!fusion) {
    sfx.powerup();
    showBanner('获得模块 · ' + def.name, '#6cf2ff', 1.8);
    return { module: def, fusion: null };
  }
  consumeRecipe(fusion);
  player.wstage = fusion.weapon;
  player.wlevel = Math.max(1, player.wlevel);
  runProgress.fusionCount++;
  runProgress.lastFusion = fusion.weapon;
  G.flash = 0.45;
  G.shake = 8;
  explosion(player.x, player.y, 34, 24);
  sfx.evolve();
  showBanner('合成成功 · ' + weaponName(fusion.weapon), WEAPON_STAGES[fusion.weapon - 1].color, 2.2);
  return { module: def, fusion: fusion };
}

function moduleInventoryText() {
  var names = [];
  Object.keys(runProgress.modules).forEach(function (id) {
    var count = runProgress.modules[id];
    if (count <= 0) return;
    var def = findById(MODULE_DEFS, id);
    names.push(def.icon + (count > 1 ? count : ''));
  });
  return names.length ? names.slice(0, 4).join(' ') : '—';
}

resetProgression();
