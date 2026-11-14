'use strict';

/* =====================================================================
   MAMAK TYCOON — core game
   ---------------------------------------------------------------------
   Files:
     game.js   — core rules: money, roti, upgrades, business stats,
                 saving, and drawing the screen   (this file)
     events.js — the Challenges & Events system and all event stories

   ALL CORE GAME NUMBERS LIVE IN THE CONFIG BLOCK BELOW.
   Event numbers (chances, cooldowns, costs) live at the top of events.js.
   ===================================================================== */

const CONFIG = {
  // --- Roti economics -------------------------------------------------
  roti: {
    startingProfit: 1.00,   // RM net profit per roti at the start
    ingredientCost: 0.50,   // RM total ingredient cost per roti (includes flour)
                            // selling price = profit + ingredient cost
  },

  // --- Upgrades ---------------------------------------------------------
  // baseCost        = price of the first purchase (RM)
  // costMultiplier  = each purchase costs this many times the previous one
  // roundUp         = round each new price up to a whole ringgit
  upgrades: {
    rotiMan: {
      name: 'Hire Roti Man',
      baseCost: 50,
      costMultiplier: 1.5,
      roundUp: true,
      rotiPerSecond: 1 / 3,   // each Roti Man makes 1 roti every 3 seconds
    },
    griddle: {
      name: 'Upgrade Griddle',
      baseCost: 100,
      costMultiplier: 2,
      roundUp: true,
      capacityBonus: 0.5,     // +50% production capacity per upgrade (stacks)
    },
    price: {
      name: 'Increase Roti Price',
      baseCost: 75,
      costMultiplier: 1.8,
      roundUp: true,
      profitIncrease: 0.25,   // +RM0.25 profit per roti per upgrade
    },
    marketing: {
      name: 'Marketing',
      baseCost: 100,
      costMultiplier: 1.7,
      roundUp: true,
      demandBonus: 0.5,       // +50% customer demand per upgrade (stacks)
    },
  },

  // --- Customer demand --------------------------------------------------
  demand: {
    startingRotiPerSecond: 1, // automatic sales limit after first hire
  },

  // --- Business health stats (v0.2) -------------------------------------
  // Each stat only affects the game once it has been unlocked.
  business: {
    reputation: {
      start: 50,
      driftTo: 50,            // slowly returns towards this value...
      driftPerSec: 0.03,      // ...at this many points per second
      demandAt0: 0.6,         // customer demand multiplier at 0 reputation
      demandAt100: 1.4,       // customer demand multiplier at 100 reputation
    },
    hygiene: {
      start: 75,
      dropPerRoti: 1 / 25,    // every 25 roti sold lowers hygiene by 1
      lowThreshold: 30,       // below this, customers notice...
      lowRepLossPerSec: 0.08, // ...and reputation slowly falls
      quickWipe: { gain: 4, cooldownSec: 15 },
      deepClean: { cost: 20, gain: 25, cooldownSec: 30 },
    },
    morale: {
      start: 75,
      driftTo: 70,
      driftPerSec: 0.1,
      neutral: 70,            // at this morale staff work at 100% speed
      minEfficiency: 0.5,     // at 0 morale staff work at 50% speed
      maxEfficiency: 1.1,     // happy staff work up to 110% speed
      treat: { costPerStaff: 8, gain: 20, cooldownSec: 60 },
    },
    flour: {
      costPerRoti: 0.30,      // the flour part of ingredientCost (RM per roti)
      storageMax: 400,
      lowWarning: 25,
      order: { amount: 100, deliverySec: 20 },          // regular supplier
      emergency: { amount: 50, priceMultiplier: 2 },    // instant, double price
      kakRos: { amount: 20, cooldownSec: 45, showBelow: 10 },  // free neighbour help (always a way back)
    },
  },

  // --- Stage 1 goals ------------------------------------------------------
  stage1Goals: {
    rotiSold: 500,
    employees: 3,
    grossRevenue: 1000,       // RM lifetime gross revenue
  },

  // --- When things appear --------------------------------------------------
  reveal: {
    milestonesAtRoti: 10,
    hireAtCash: 25,           // Roti Man appears at this much cash...
    hireAtRoti: 30,           // ...or after this many roti sold
    priceAtRoti: 60,
    moraleAtEmployees: 2,
  },

  // --- Technical ----------------------------------------------------------
  saveKey: 'mamakTycoon_save_v1',
  saveVersion: 2,
  autosaveSeconds: 10,
  tickMs: 100,                // how often the game updates (milliseconds)
  maxTickSeconds: 1,          // never simulate more than this per update
  purchaseCooldownMs: 300,    // blocks accidental double-buys from one tap
  maxLogEntries: 50,
};

/* =====================================================================
   GAME STATE
   ===================================================================== */

function newState() {
  const b = CONFIG.business;
  return {
    version: CONFIG.saveVersion,
    cash: 0,
    rotiSold: 0,
    manualSold: 0,
    autoSold: 0,
    eventSold: 0,             // big orders from events (e.g. the Rahman family)
    grossRevenue: 0,
    netProfit: 0,
    challengeSpending: 0,     // money spent dealing with challenges
    rotiProgress: 0,          // fraction of the next automatic roti
    levels: { rotiMan: 0, griddle: 0, price: 0, marketing: 0 },
    biz: {
      reputation: b.reputation.start,
      hygiene: b.hygiene.start,
      morale: b.morale.start,
      flour: 0,
    },
    deliveries: [],           // flour on its way: { amount, arriveAt }
    modifiers: [],            // temporary/permanent effects (see addModifier)
    cooldowns: {},            // business action cooldowns (game time)
    events: newEventState(),
    relationships: { rahman: 0 },
    story: { ratIgnored: 0, rahmanReturnRoti: null, lastRahmanAt: -9999, kakRosHelped: 0 },
    revealed: {},             // which panels/upgrades/stats have been unlocked
    flags: {},                // one-time messages already shown
    log: [],
    playTimeMs: 0,
    stage1Complete: false,
    // --- Stages 2–10 (stages.js) ---
    stage: 1,                 // current stage number (1–10)
    stages: {},               // each later stage's own data, keyed by stage number
    stageStartTime: 0,        // game time when the current stage began
    stageEarned: 0,           // money earned in the current stage
    totalEarned: 0,           // money earned since Stage 2 began
    stageComplete: false,     // showing the "stage complete" screen for stages 2–10
    gameComplete: false,      // the game has been finished
    stageHistory: [],         // { stage, seconds, earned } for each finished stage
  };
}

function newEventState() {
  return {
    active: null,             // the challenge currently waiting for a decision
    uid: 0,
    lastEndedAt: -9999,
    sinceCheck: 0,
    cooldownUntil: {},
    counts: {},
    recent: [],
    paused: false,            // developer setting: stop random challenges
  };
}

let state = newState();

/* =====================================================================
   SMALL HELPERS
   ===================================================================== */

function roundMoney(n) { return Math.round(n * 100) / 100; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function gameTime() { return state.playTimeMs / 1000; }   // seconds of active play
function employees() { return state.levels.rotiMan; }

/* =====================================================================
   BUSINESS STATS
   ===================================================================== */

const STAT_INFO = {
  reputation: { label: 'Reputation', reveal: 'reputation',
    message: 'People are talking about your stall. (Reputation unlocked — it affects customer demand.)' },
  hygiene: { label: 'Hygiene', reveal: 'hygiene',
    message: 'Cleanliness now matters. (Hygiene unlocked — low hygiene invites rats and failed inspections.)' },
  morale: { label: 'Staff morale', reveal: 'morale',
    message: 'With a team to manage, keeping staff happy matters. (Staff morale unlocked — it affects production speed.)' },
};

function revealStat(id) {
  if (state.revealed[id]) return;
  state.revealed[id] = true;
  state.revealed.business = true;
  if (STAT_INFO[id]) addLog(STAT_INFO[id].message);
}

function revealStock() {
  if (state.revealed.stock) return;
  state.revealed.stock = true;
  state.revealed.business = true;
  addLog('Every roti now uses 1 flour. (Flour stock unlocked — no flour, no roti!)');
}

// Change reputation / hygiene / morale. Unlocks the stat if needed.
function changeStat(stat, amount) {
  revealStat(stat);
  state.biz[stat] = clamp(state.biz[stat] + amount, 0, 100);
}

function stockActive() { return Boolean(state.revealed.stock); }

function reputationMultiplier() {
  if (!state.revealed.reputation) return 1;
  const r = CONFIG.business.reputation;
  return r.demandAt0 + (r.demandAt100 - r.demandAt0) * state.biz.reputation / 100;
}

function moraleEfficiency() {
  if (!state.revealed.morale) return 1;
  const m = CONFIG.business.morale;
  const eff = m.minEfficiency + (1 - m.minEfficiency) * state.biz.morale / m.neutral;
  return clamp(eff, m.minEfficiency, m.maxEfficiency);
}

function hygieneRiskLabel() {
  const h = state.biz.hygiene;
  if (h >= 75) return 'Low inspection risk';
  if (h >= 50) return 'Some inspection risk';
  if (h >= 30) return 'High inspection risk, rats more likely';
  return 'Very high risk! Customers are noticing';
}

function addFlour(amount) {
  const max = CONFIG.business.flour.storageMax;
  const before = state.biz.flour;
  state.biz.flour = clamp(Math.floor(state.biz.flour + amount), 0, max);
  return state.biz.flour - before;
}

function flourOnTheWay() {
  return state.deliveries.reduce((sum, d) => sum + d.amount, 0);
}

/* =====================================================================
   MODIFIERS — temporary (or permanent) effects from events
   ---------------------------------------------------------------------
   { id, label, until (game seconds, or null = permanent),
     demandMult, productionMult, closed, ownerAway, staffAway, deliveryMult, incomeMult }
   closed    = the whole stall is shut (no sales at all)
   ownerAway = you are busy elsewhere: staff keep selling, but no manual sales
   ===================================================================== */

function addModifier(mod) {
  state.modifiers = state.modifiers.filter(m => m.id !== mod.id);
  state.modifiers.push({
    id: mod.id,
    label: mod.label,
    until: mod.sec == null ? null : gameTime() + mod.sec,
    demandMult: mod.demandMult ?? 1,
    productionMult: mod.productionMult ?? 1,
    closed: Boolean(mod.closed),
    ownerAway: Boolean(mod.ownerAway),
    staffAway: mod.staffAway || 0,
    deliveryMult: mod.deliveryMult ?? 1,
    incomeMult: mod.incomeMult ?? 1,   // used by Stages 2–10
  });
}

function hasModifier(id) {
  return activeModifiers().some(m => m.id === id);
}

function activeModifiers() {
  const t = gameTime();
  const list = state.modifiers.filter(m => m.until === null || m.until > t);
  // An unresolved challenge can also have an effect (e.g. queue held up).
  if (typeof activeEventModifier === 'function') {
    const m = activeEventModifier();
    if (m) list.push(m);
  }
  return list;
}

function modifierProduct(key) {
  return activeModifiers().reduce((p, m) => p * (m[key] ?? 1), 1);
}

function staffAway() {
  return activeModifiers().reduce((n, m) => n + (m.staffAway || 0), 0);
}

function isClosed() {
  return activeModifiers().some(m => m.closed);
}

function isOwnerAway() {
  return activeModifiers().some(m => m.ownerAway);
}

// Seconds until the longest-running modifier of a kind ('closed' or 'ownerAway') ends.
function secondsLeft(kind = 'closed') {
  const t = gameTime();
  let left = 0;
  for (const m of activeModifiers()) {
    if (m[kind] && m.until !== null) left = Math.max(left, m.until - t);
  }
  return Math.ceil(left);
}

function awayLabel() {
  const m = activeModifiers().find(x => x.ownerAway);
  return m ? m.label : '';
}

function cleanupModifiers() {
  const t = gameTime();
  const before = state.modifiers.length;
  state.modifiers = state.modifiers.filter(m => {
    const keep = m.until === null || m.until > t;
    if (!keep && m.closed) addLog(`The stall is open again. (${m.label} finished.)`);
    return keep;
  });
  return before !== state.modifiers.length;
}

/* =====================================================================
   CALCULATIONS
   ===================================================================== */

function profitPerRoti() {
  return CONFIG.roti.startingProfit +
    state.levels.price * CONFIG.upgrades.price.profitIncrease;
}

function sellingPrice() {
  return profitPerRoti() + CONFIG.roti.ingredientCost;
}

// Cash received per roti. Once flour is bought in advance, the flour part
// of the ingredient cost has already been paid, so it is not charged again.
function cashPerRoti() {
  return profitPerRoti() + (stockActive() ? CONFIG.business.flour.costPerRoti : 0);
}

function griddleMultiplier(level = state.levels.griddle) {
  return Math.pow(1 + CONFIG.upgrades.griddle.capacityBonus, level);
}

function productionCapacity(staff = employees(), griddleLevel = state.levels.griddle) {
  const working = Math.max(0, staff - staffAway());
  return working * CONFIG.upgrades.rotiMan.rotiPerSecond * griddleMultiplier(griddleLevel) *
    moraleEfficiency() * modifierProduct('productionMult');
}

function customerDemand(marketingLevel = state.levels.marketing) {
  if (employees() < 1) return 0;
  return CONFIG.demand.startingRotiPerSecond *
    Math.pow(1 + CONFIG.upgrades.marketing.demandBonus, marketingLevel) *
    reputationMultiplier() * modifierProduct('demandMult');
}

function autoSalesRate() {
  if (isClosed()) return 0;
  if (stockActive() && state.biz.flour < 1) return 0;
  return Math.min(productionCapacity(), customerDemand());
}

// Why can't the player sell by hand right now? null = they can.
function blockReason() {
  if (isClosed()) return 'closed';
  if (stockActive() && state.biz.flour < 1) return 'flour';
  if (isOwnerAway()) return 'away';
  return null;
}

// Price of the NEXT purchase of an upgrade.
function upgradeCost(id) {
  const u = CONFIG.upgrades[id];
  let cost = u.baseCost;
  for (let i = 0; i < state.levels[id]; i++) {
    cost = cost * u.costMultiplier;
    cost = Math.round(cost * 1e6) / 1e6;  // remove tiny floating-point errors
    if (u.roundUp) cost = Math.ceil(cost);
  }
  return cost;
}

/* =====================================================================
   ACTIONS
   ===================================================================== */

// Sells up to `count` roti. Returns { count, cash } actually sold/earned.
function sellRoti(count, source) {
  if (count <= 0) return { count: 0, cash: 0 };
  if (stockActive()) {
    count = Math.min(count, Math.floor(state.biz.flour));
    if (count <= 0) return { count: 0, cash: 0 };
    state.biz.flour -= count;
  }
  const cash = cashPerRoti() * count;
  state.cash = roundMoney(state.cash + cash);
  state.netProfit = roundMoney(state.netProfit + profitPerRoti() * count);
  state.grossRevenue = roundMoney(state.grossRevenue + sellingPrice() * count);
  state.rotiSold += count;
  if (source === 'manual') state.manualSold += count;
  else if (source === 'event') state.eventSold += count;
  else state.autoSold += count;
  if (state.revealed.hygiene) {
    state.biz.hygiene = clamp(state.biz.hygiene - CONFIG.business.hygiene.dropPerRoti * count, 0, 100);
  }
  sceneNotify('sale', { source, count });
  return { count, cash: roundMoney(cash) };
}

// Pays money. Never lets cash go below zero.
function spend(amount, forChallenge) {
  const paid = Math.min(state.cash, Math.max(0, amount));
  state.cash = roundMoney(state.cash - paid);
  if (forChallenge) state.challengeSpending = roundMoney(state.challengeSpending + paid);
  return paid;
}

function makeRoti() {
  if (state.stage1Complete || blockReason()) return 0;
  const sold = sellRoti(1, 'manual');
  afterChange();
  return sold.cash;
}

const lastPurchaseAt = {};

function buy(id) {
  if (state.stage1Complete) return false;
  if (!CONFIG.upgrades[id] || !state.revealed[id]) return false;

  // Ignore extra taps that arrive within the cooldown window.
  const now = Date.now();
  if (lastPurchaseAt[id] && now - lastPurchaseAt[id] < CONFIG.purchaseCooldownMs) return false;

  const cost = upgradeCost(id);
  if (state.cash < cost) return false;

  lastPurchaseAt[id] = now;
  state.cash = roundMoney(state.cash - cost);
  state.levels[id] += 1;
  sceneNotify('upgrade', id);
  addLog(purchaseMessage(id, state.levels[id]));
  afterChange();
  saveGame();
  return true;
}

function purchaseMessage(id, level) {
  switch (id) {
    case 'rotiMan': {
      const names = ['Ravi', 'Ah Seng', 'Muthu', 'Faizal', 'Kumar', 'Arif', 'Raju', 'Hafiz'];
      const name = names[(level - 1) % names.length];
      return `Hired Roti Man #${level}: ${name}. He flips like a pro.`;
    }
    case 'griddle': {
      const items = ['a thicker iron griddle', 'a wider griddle', 'a second gas burner', 'a commercial flat-top', 'a double griddle station'];
      return `Griddle level ${level}: installed ${items[(level - 1) % items.length]}.`;
    }
    case 'price':
      return `Price raised. Profit per roti is now ${money(profitPerRoti())}. Nobody complained… yet.`;
    case 'marketing': {
      const ideas = ['printed flyers for the taman', 'posted in the taman residents\' group chat', 'painted a bright new signboard',
        'got a food blogger to visit', 'went viral online', 'sponsored the futsal team'];
      return `Marketing level ${level}: ${ideas[(level - 1) % ideas.length]}. More customers coming!`;
    }
    default:
      return 'Upgrade purchased.';
  }
}

/* ---------------------------------------------------------------------
   Business actions: cleaning, staff treats, buying flour
   --------------------------------------------------------------------- */

const BUSINESS_ACTIONS = {
  quickWipe: {
    visible: () => state.revealed.hygiene,
    cost: () => 0,
    cooldownSec: () => CONFIG.business.hygiene.quickWipe.cooldownSec,
    label: () => `Quick wipe-down (free, +${CONFIG.business.hygiene.quickWipe.gain} hygiene)`,
    run: () => { changeStat('hygiene', CONFIG.business.hygiene.quickWipe.gain); return null; },
  },
  deepClean: {
    visible: () => state.revealed.hygiene,
    cost: () => CONFIG.business.hygiene.deepClean.cost,
    cooldownSec: () => CONFIG.business.hygiene.deepClean.cooldownSec,
    label: () => `Deep clean (+${CONFIG.business.hygiene.deepClean.gain} hygiene)`,
    run: () => { changeStat('hygiene', CONFIG.business.hygiene.deepClean.gain); return 'Deep clean done. The floor is so clean you could eat roti off it (please don\'t).'; },
  },
  staffTreat: {
    visible: () => state.revealed.morale,
    cost: () => CONFIG.business.morale.treat.costPerStaff * Math.max(1, employees()),
    cooldownSec: () => CONFIG.business.morale.treat.cooldownSec,
    label: () => `Belanja staff makan (+${CONFIG.business.morale.treat.gain} morale)`,
    run: () => { changeStat('morale', CONFIG.business.morale.treat.gain); return 'You treat the staff to nasi kandar. Morale goes up!'; },
  },
  orderFlour: {
    visible: () => stockActive(),
    cost: () => CONFIG.business.flour.order.amount * CONFIG.business.flour.costPerRoti,
    cooldownSec: () => 0,
    label: () => `Order ${CONFIG.business.flour.order.amount} flour (arrives in ${deliverySeconds()}s)`,
    blocked: () => {
      if (state.deliveries.length > 0) return 'A delivery is already on its way';
      if (state.biz.flour + CONFIG.business.flour.order.amount > CONFIG.business.flour.storageMax) return 'Storage is full';
      return null;
    },
    run: () => {
      state.deliveries.push({ amount: CONFIG.business.flour.order.amount, arriveAt: gameTime() + deliverySeconds() });
      return `Flour ordered from the regular supplier. Arriving in ${deliverySeconds()} seconds.`;
    },
  },
  emergencyFlour: {
    visible: () => stockActive(),
    cost: () => CONFIG.business.flour.emergency.amount * CONFIG.business.flour.costPerRoti * CONFIG.business.flour.emergency.priceMultiplier,
    cooldownSec: () => 0,
    label: () => `Emergency supplier: ${CONFIG.business.flour.emergency.amount} flour now (double price)`,
    blocked: () => (state.biz.flour + CONFIG.business.flour.emergency.amount > CONFIG.business.flour.storageMax ? 'Storage is full' : null),
    run: () => {
      addFlour(CONFIG.business.flour.emergency.amount);
      // The premium above the normal flour price is an extra cost of the emergency.
      const premium = CONFIG.business.flour.emergency.amount * CONFIG.business.flour.costPerRoti *
        (CONFIG.business.flour.emergency.priceMultiplier - 1);
      state.challengeSpending = roundMoney(state.challengeSpending + premium);
      return `Emergency flour delivered by motorbike: +${CONFIG.business.flour.emergency.amount} flour.`;
    },
  },
  kakRos: {
    visible: () => stockActive() && state.biz.flour < CONFIG.business.flour.kakRos.showBelow,
    cost: () => 0,
    cooldownSec: () => CONFIG.business.flour.kakRos.cooldownSec,
    label: () => `Ask Kak Ros next door for ${CONFIG.business.flour.kakRos.amount} flour (free)`,
    run: () => {
      addFlour(CONFIG.business.flour.kakRos.amount);
      state.story.kakRosHelped += 1;
      return `Kak Ros from the nasi lemak stall lends you ${CONFIG.business.flour.kakRos.amount} flour. "Pay me back with roti, ya!"`;
    },
  },
};

function deliverySeconds() {
  return Math.ceil(CONFIG.business.flour.order.deliverySec * modifierProduct('deliveryMult'));
}

function actionCooldownLeft(id) {
  const until = state.cooldowns[id] || 0;
  return Math.max(0, Math.ceil(until - gameTime()));
}

function actionBlockedReason(id) {
  const a = BUSINESS_ACTIONS[id];
  if (!a || !a.visible()) return 'Not available';
  if (state.stage1Complete) return 'Stage complete';
  const cd = actionCooldownLeft(id);
  if (cd > 0) return `Ready in ${cd}s`;
  if (a.blocked) {
    const why = a.blocked();
    if (why) return why;
  }
  if (state.cash < a.cost()) return 'Not enough cash';
  return null;
}

function doAction(id) {
  const now = Date.now();
  if (lastPurchaseAt['action_' + id] && now - lastPurchaseAt['action_' + id] < CONFIG.purchaseCooldownMs) return false;
  if (actionBlockedReason(id)) return false;
  const a = BUSINESS_ACTIONS[id];
  lastPurchaseAt['action_' + id] = now;
  const cost = a.cost();
  if (cost > 0) state.cash = roundMoney(state.cash - cost);
  const msg = a.run();
  if (a.cooldownSec() > 0) state.cooldowns[id] = gameTime() + a.cooldownSec();
  if (msg) addLog(msg);
  sceneNotify('action', id);
  afterChange();
  saveGame();
  return true;
}

// Tells the pixel-art scene (scene.js) that something happened. Safe if the scene isn't loaded.
function sceneNotify(type, data) {
  if (window.MamakScene) window.MamakScene.notify(type, data);
}

function processDeliveries() {
  const t = gameTime();
  const arrived = state.deliveries.filter(d => d.arriveAt <= t);
  if (arrived.length === 0) return;
  state.deliveries = state.deliveries.filter(d => d.arriveAt > t);
  for (const d of arrived) {
    const added = addFlour(d.amount);
    sceneNotify('delivery', d.amount);
    addLog(`Flour delivery has arrived: +${added} flour.`);
  }
}

// Stats slowly return to normal so mistakes are never permanent.
function driftStats(seconds) {
  const b = CONFIG.business;
  const drift = (stat, target, perSec) => {
    const v = state.biz[stat];
    const step = perSec * seconds;
    state.biz[stat] = v < target ? Math.min(target, v + step) : Math.max(target, v - step);
  };
  if (state.revealed.reputation) drift('reputation', b.reputation.driftTo, b.reputation.driftPerSec);
  if (state.revealed.morale) drift('morale', b.morale.driftTo, b.morale.driftPerSec);
  if (state.revealed.hygiene && state.revealed.reputation && state.biz.hygiene < b.hygiene.lowThreshold) {
    state.biz.reputation = clamp(state.biz.reputation - b.hygiene.lowRepLossPerSec * seconds, 0, 100);
  }
}

/* =====================================================================
   UNLOCKS, FLAVOUR MESSAGES AND STAGE 1 GOALS
   ===================================================================== */

const REVEALS = [
  {
    id: 'milestones',
    when: () => state.rotiSold >= CONFIG.reveal.milestonesAtRoti,
    message: 'A makcik passing by says: "Sedap! One day you should open a proper kedai." (Milestones unlocked)',
  },
  {
    id: 'rotiMan',
    when: () => state.cash >= CONFIG.reveal.hireAtCash || state.rotiSold >= CONFIG.reveal.hireAtRoti,
    message: 'Your arms are getting tired. Maybe it is time to hire a Roti Man? (Upgrades unlocked)',
  },
  {
    id: 'price',
    when: () => state.rotiSold >= CONFIG.reveal.priceAtRoti,
    message: 'A regular whispers: "Boss, your roti too cheap lah." (Price upgrade unlocked)',
  },
  {
    id: 'griddle',
    when: () => employees() >= 1,
    message: 'Your Roti Man wants a better griddle. (Griddle upgrade unlocked)',
  },
  {
    id: 'demand',
    when: () => employees() >= 1,
    message: 'Customers only come so fast. Watch Customer demand vs Production capacity.',
  },
  {
    id: 'marketing',
    when: () => employees() >= 1,
    message: 'To attract more customers, try Marketing. (Marketing unlocked)',
  },
];

const FLAVOUR = [
  { roti: 1, text: 'Your first roti canai! Crispy outside, fluffy inside.' },
  { roti: 25, text: 'Uncle Lim orders his usual: roti kosong and teh tarik kurang manis.' },
  { roti: 100, text: '100 roti sold. The office crowd has started to notice you.' },
  { roti: 200, text: 'A delivery rider picks up ten roti telur, bungkus.' },
  { roti: 300, text: 'Football fans gather for supper. Roti everywhere!' },
  { roti: 400, text: 'There is a queue at your stall. The neighbours are jealous.' },
];

function checkReveals() {
  for (const r of REVEALS) {
    if (!state.revealed[r.id] && r.when()) {
      state.revealed[r.id] = true;
      addLog(r.message);
    }
  }
  if (!state.revealed.morale && employees() >= CONFIG.reveal.moraleAtEmployees) revealStat('morale');
  for (const f of FLAVOUR) {
    const key = 'roti' + f.roti;
    if (!state.flags[key] && state.rotiSold >= f.roti) {
      state.flags[key] = true;
      addLog(f.text);
    }
  }
}

function goalStatus() {
  const g = CONFIG.stage1Goals;
  return {
    roti: state.rotiSold >= g.rotiSold,
    staff: employees() >= g.employees,
    revenue: state.grossRevenue >= g.grossRevenue,
  };
}

function checkStage1() {
  if (state.stage1Complete) return;
  const s = goalStatus();
  const g = CONFIG.stage1Goals;
  const goalMessages = {
    roti: `Goal reached: ${formatNumber(g.rotiSold)} roti sold!`,
    staff: `Goal reached: ${g.employees} employees hired!`,
    revenue: `Goal reached: ${money(g.grossRevenue)} lifetime revenue!`,
  };
  for (const key of Object.keys(s)) {
    if (s[key] && !state.flags['goal_' + key]) {
      state.flags['goal_' + key] = true;
      addLog(goalMessages[key]);
    }
  }
  if (s.roti && s.staff && s.revenue) {
    state.stage1Complete = true;
    if (state.events.active) state.events.active = null;  // no loose ends on the victory screen
    addLog('STAGE 1 COMPLETE — Restaurant unlocked! Time to buka kedai!');
    saveGame();
  }
}

// True while a "stage complete" screen or the ending is showing.
function isPaused() {
  return state.gameComplete || state.stageComplete || (state.stage === 1 && state.stage1Complete);
}

function afterChange() {
  if (state.stage === 1) {
    checkReveals();
    checkStage1();
  } else if (typeof checkStageGoals === 'function') {
    checkStageGoals();
  }
  render();
}

/* =====================================================================
   GAME LOOP
   ===================================================================== */

// Advance the game by `seconds` of time. (The caller advances playTimeMs.)
function tick(seconds) {
  if (seconds <= 0 || isPaused()) return;
  cleanupModifiers();
  if (state.stage >= 2) {
    // Stages 2–10 have their own rules (stages.js)
    if (typeof laterStageTick === 'function') laterStageTick(seconds);
    if (typeof eventsTick === 'function') eventsTick(seconds);
    if (typeof checkStageGoals === 'function') checkStageGoals();
    return;
  }
  processDeliveries();
  driftStats(seconds);
  if (typeof eventsTick === 'function') eventsTick(seconds);

  const rate = autoSalesRate();
  if (rate > 0) {
    state.rotiProgress += rate * seconds;
    const whole = Math.floor(state.rotiProgress);
    if (whole > 0) {
      state.rotiProgress -= whole;
      sellRoti(whole, 'auto');
    }
  }
  checkReveals();
  checkStage1();
}

// Advance play time and the game together (used by the loop and dev tools).
function advance(seconds) {
  if (!isPaused()) state.playTimeMs += seconds * 1000;
  tick(seconds);
}

/* =====================================================================
   SAVING AND LOADING
   ===================================================================== */

let lastSavedAt = null;

function saveGame() {
  try {
    localStorage.setItem(CONFIG.saveKey, JSON.stringify(state));
    lastSavedAt = Date.now();
    return true;
  } catch (e) {
    return false;
  }
}

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function signedNum(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function loadGame() {
  let data;
  try {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (!raw) return false;
    data = JSON.parse(raw);
  } catch (e) {
    return false;
  }
  if (!plainObject(data)) return false;

  const fresh = newState();
  fresh.cash = num(data.cash, 0);
  fresh.rotiSold = Math.floor(num(data.rotiSold, 0));
  fresh.manualSold = Math.floor(num(data.manualSold, 0));
  fresh.autoSold = Math.floor(num(data.autoSold, 0));
  fresh.eventSold = Math.floor(num(data.eventSold, 0));
  fresh.grossRevenue = num(data.grossRevenue, 0);
  fresh.netProfit = num(data.netProfit, 0);
  fresh.challengeSpending = num(data.challengeSpending, 0);
  fresh.rotiProgress = Math.min(num(data.rotiProgress, 0), 0.999999);
  fresh.playTimeMs = num(data.playTimeMs, 0);
  fresh.stage1Complete = data.stage1Complete === true;
  if (typeof loadStageState === 'function') loadStageState(data, fresh);
  if (plainObject(data.levels)) {
    for (const id of Object.keys(fresh.levels)) fresh.levels[id] = Math.floor(num(data.levels[id], 0));
  }
  if (plainObject(data.biz)) {
    for (const k of ['reputation', 'hygiene', 'morale']) fresh.biz[k] = clamp(num(data.biz[k], fresh.biz[k]), 0, 100);
    fresh.biz.flour = Math.floor(clamp(num(data.biz.flour, 0), 0, CONFIG.business.flour.storageMax));
  }
  if (Array.isArray(data.deliveries)) {
    fresh.deliveries = data.deliveries
      .filter(d => plainObject(d) && num(d.amount, -1) > 0)
      .map(d => ({ amount: Math.floor(d.amount), arriveAt: signedNum(d.arriveAt, 0) }));
  }
  if (Array.isArray(data.modifiers)) {
    fresh.modifiers = data.modifiers
      .filter(m => plainObject(m) && typeof m.id === 'string')
      .map(m => ({
        id: m.id,
        label: typeof m.label === 'string' ? m.label : m.id,
        until: m.until === null ? null : signedNum(m.until, 0),
        demandMult: num(m.demandMult, 1),
        productionMult: num(m.productionMult, 1),
        closed: m.closed === true,
        ownerAway: m.ownerAway === true,
        staffAway: Math.floor(num(m.staffAway, 0)),
        deliveryMult: num(m.deliveryMult, 1),
        incomeMult: num(m.incomeMult, 1),
      }));
  }
  if (plainObject(data.cooldowns)) {
    for (const [k, v] of Object.entries(data.cooldowns)) fresh.cooldowns[k] = signedNum(v, 0);
  }
  if (plainObject(data.relationships)) {
    fresh.relationships.rahman = clamp(signedNum(data.relationships.rahman, 0), -5, 5);
  }
  if (plainObject(data.story)) {
    fresh.story.ratIgnored = Math.floor(num(data.story.ratIgnored, 0));
    fresh.story.kakRosHelped = Math.floor(num(data.story.kakRosHelped, 0));
    fresh.story.lastRahmanAt = signedNum(data.story.lastRahmanAt, -9999);
    fresh.story.rahmanReturnRoti = typeof data.story.rahmanReturnRoti === 'number' ? data.story.rahmanReturnRoti : null;
  }
  if (plainObject(data.events) && typeof loadEventState === 'function') {
    fresh.events = loadEventState(data.events, fresh.events);
  }
  if (plainObject(data.revealed)) fresh.revealed = { ...data.revealed };
  if (plainObject(data.flags)) fresh.flags = { ...data.flags };
  if (Array.isArray(data.log)) {
    fresh.log = data.log
      .filter(e => e && typeof e.text === 'string')
      .slice(0, CONFIG.maxLogEntries)
      .map(e => ({ t: num(e.t, 0), text: e.text }));
  }
  state = fresh;
  return true;
}

// Shows the in-page "Are you sure?" box. (Pop-up confirm() dialogs are
// blocked in some previews, so the confirmation is built into the page.)
function requestReset() {
  el('resetConfirm').hidden = false;
  el('resetConfirm').scrollIntoView({ block: 'center' });
}

function cancelReset() {
  el('resetConfirm').hidden = true;
}

function resetGame() {
  cancelReset();
  try { localStorage.removeItem(CONFIG.saveKey); } catch (e) { /* ignore */ }
  state = newState();
  lastSavedAt = null;
  addLog('You set up a folding table by the roadside. Time to flip some roti!');
  saveGame();
  render();
  return true;
}

/* =====================================================================
   EVENT LOG
   ===================================================================== */

function addLog(text) {
  state.log.unshift({ t: state.playTimeMs, text });
  if (state.log.length > CONFIG.maxLogEntries) state.log.length = CONFIG.maxLogEntries;
  logDirty = true;
}

/* =====================================================================
   DISPLAY
   ===================================================================== */

const BIG_NAMES = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion',
  'sextillion', 'septillion', 'octillion', 'nonillion', 'decillion', 'undecillion', 'duodecillion'];

// Formats any number: 12.5, 4,200, 3.14 million, 9.99 quadrillion…
function fmt(n) {
  if (!Number.isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (a < 100) return String(Math.round(n * 100) / 100);
  if (a < 1e6) return Math.round(n).toLocaleString('en-US');
  const tier = Math.floor(Math.log10(a) / 3);
  if (tier >= BIG_NAMES.length) return n.toExponential(2);
  return (n / Math.pow(1000, tier)).toFixed(2) + ' ' + BIG_NAMES[tier];
}

function money(n) {
  if (Math.abs(n) >= 1e6) return 'RM' + fmt(n);
  return 'RM' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moneyShort(n) {
  return 'RM' + Math.floor(n).toLocaleString('en-US');
}

function formatNumber(n) {
  return Math.floor(n).toLocaleString('en-US');
}

function rate(n) {
  const digits = n > 0 && n < 10 ? 2 : 1;
  return (n === 0 ? '0' : n.toFixed(digits)) + ' roti/sec';
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = x => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function signed(n) {
  return (n >= 0 ? '+' : '−') + Math.abs(n);
}

const el = id => document.getElementById(id);

function setText(id, text) {
  const node = el(id);
  if (node && node.textContent !== text) node.textContent = text;
}

function setHidden(id, hidden) {
  const node = el(id);
  if (node && node.hidden !== hidden) node.hidden = hidden;
}

let logDirty = true;

function upgradeEffectText(id) {
  const lv = state.levels[id];
  switch (id) {
    case 'rotiMan': {
      const now = productionCapacity();
      const next = productionCapacity(employees() + 1);
      return `Makes 1 roti every 3 sec. Capacity: ${rate(now)} → ${rate(next)}`;
    }
    case 'griddle':
      return `+50% production capacity. Multiplier: ×${griddleMultiplier(lv).toFixed(2)} → ×${griddleMultiplier(lv + 1).toFixed(2)}`;
    case 'price': {
      const inc = CONFIG.upgrades.price.profitIncrease;
      return `+${money(inc)} profit per roti. Profit: ${money(profitPerRoti())} → ${money(profitPerRoti() + inc)}`;
    }
    case 'marketing':
      return `+50% customer demand. Demand: ${rate(customerDemand(lv))} → ${rate(customerDemand(lv + 1))}`;
    default:
      return '';
  }
}

function render() {
  const s = state;
  const done = s.stage1Complete;
  const later = s.stage >= 2;
  document.body.classList.toggle('later-stage', later);
  if (later) {
    document.body.classList.remove('stage-complete');   // the Stage 1 victory screen is behind us
    if (typeof renderLaterStage === 'function') renderLaterStage();
    if (typeof renderChallenges === 'function') renderChallenges();
    renderLogAndSave();
    return;
  }

  document.body.classList.toggle('stage-complete', done);
  setHidden('stageArea', true);
  setText('stageLabel', typeof stageLabelText === 'function' ? stageLabelText() : 'Stage 1');

  // Statistics
  setText('statCash', money(s.cash));
  setText('statRoti', formatNumber(s.rotiSold));
  setText('statProfit', money(profitPerRoti()));
  setText('statEmployees', String(employees()));
  setText('statRate', rate(done ? 0 : autoSalesRate()));
  setText('statRevenue', money(s.grossRevenue));
  setText('statNet', money(s.netProfit));
  setText('statTime', formatTime(s.playTimeMs));

  // Production
  renderProduction();

  // Business health
  renderBusiness();

  // Challenges (events.js)
  if (typeof renderChallenges === 'function') renderChallenges();

  // Upgrades
  const anyUpgrade = Object.keys(CONFIG.upgrades).some(id => s.revealed[id]);
  setHidden('upgradesPanel', !anyUpgrade);
  const now = Date.now();
  for (const id of Object.keys(CONFIG.upgrades)) {
    setHidden('upg-' + id, !s.revealed[id]);
    if (!s.revealed[id]) continue;
    const cost = upgradeCost(id);
    const lv = s.levels[id];
    setText('lvl-' + id, id === 'rotiMan' ? `(hired: ${lv})` : `(level ${lv})`);
    setText('eff-' + id, upgradeEffectText(id));
    setText('buy-' + id, `Buy — ${money(cost)}`);
    const coolingDown = lastPurchaseAt[id] && now - lastPurchaseAt[id] < CONFIG.purchaseCooldownMs;
    const btn = el('buy-' + id);
    const disabled = done || s.cash < cost || Boolean(coolingDown);
    if (btn.disabled !== disabled) btn.disabled = disabled;
  }

  // Milestones
  setHidden('milestonesPanel', !s.revealed.milestones);
  const g = CONFIG.stage1Goals;
  const goals = goalStatus();
  el('msRoti').value = Math.min(1, s.rotiSold / g.rotiSold);
  el('msStaff').value = Math.min(1, employees() / g.employees);
  el('msRevenue').value = Math.min(1, s.grossRevenue / g.grossRevenue);
  setText('msRotiText', `${formatNumber(Math.min(s.rotiSold, g.rotiSold))} / ${formatNumber(g.rotiSold)}`);
  setText('msStaffText', `${Math.min(employees(), g.employees)} / ${g.employees}`);
  setText('msRevenueText', `${moneyShort(Math.min(s.grossRevenue, g.grossRevenue))} / ${moneyShort(g.grossRevenue)}`);
  el('msRoti').parentElement.classList.toggle('done', goals.roti);
  el('msStaff').parentElement.classList.toggle('done', goals.staff);
  el('msRevenue').parentElement.classList.toggle('done', goals.revenue);

  // Victory screen
  setHidden('victoryPanel', !done);
  setHidden('devCompleteNote', !done);
  if (done) renderVictory();

  renderLogAndSave();
}

function renderLogAndSave() {
  const s = state;
  // Event log
  if (logDirty) {
    const list = el('eventLog');
    list.innerHTML = '';
    for (const entry of s.log) {
      const li = document.createElement('li');
      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = formatTime(entry.t);
      li.appendChild(time);
      li.appendChild(document.createTextNode(entry.text));
      list.appendChild(li);
    }
    logDirty = false;
  }

  // Save status
  if (lastSavedAt) {
    const secs = Math.floor((Date.now() - lastSavedAt) / 1000);
    setText('saveStatus', secs < 2 ? 'Game saved just now' : `Game saved ${secs}s ago (autosaves every ${CONFIG.autosaveSeconds}s)`);
  }
}

function renderProduction() {
  const s = state;
  const block = blockReason();
  const btn = el('makeButton');
  let label = 'Make & Sell Roti Canai';
  if (block === 'closed') label = `Stall closed — opens in ${secondsLeft('closed')}s`;
  else if (block === 'flour') label = 'Out of flour! Restock in Business health';
  else if (block === 'away') label = `You're busy: ${awayLabel()} (${secondsLeft('ownerAway')}s)`;
  setText('makeButton', label);
  const disabled = Boolean(block) || s.stage1Complete;
  if (btn.disabled !== disabled) btn.disabled = disabled;

  if (stockActive()) {
    setText('priceInfo',
      `Selling price ${money(sellingPrice())}: profit ${money(profitPerRoti())} + flour ${money(CONFIG.business.flour.costPerRoti)} (already paid from stock) + other ingredients ${money(CONFIG.roti.ingredientCost - CONFIG.business.flour.costPerRoti)}. You receive ${money(cashPerRoti())} cash per roti.`);
  } else {
    setText('priceInfo',
      `Selling price ${money(sellingPrice())} (ingredients ${money(CONFIG.roti.ingredientCost)}, profit ${money(profitPerRoti())})`);
  }

  setHidden('autoPanel', !s.revealed.demand);
  if (s.revealed.demand) {
    const cap = productionCapacity();
    const dem = customerDemand();
    const act = autoSalesRate();
    setText('autoCapacity', rate(cap));
    setText('autoDemand', rate(dem));
    setText('autoActual', rate(act));
    setText('autoIncome', money(act * cashPerRoti()) + '/sec');
    let hint;
    if (block === 'closed') hint = 'The stall is CLOSED. Sales will restart when it reopens.';
    else if (block === 'away' && act > 0) hint = 'You are away from the counter, but your staff keep selling.';
    else if (block === 'flour') hint = 'OUT OF FLOUR — nothing can be made. Order flour in Business health.';
    else if (Math.abs(cap - dem) < 1e-9) hint = 'Production and demand are perfectly balanced. Shiok!';
    else if (cap < dem) hint = 'Limited by PRODUCTION — customers are waiting. Hire Roti Men or upgrade the griddle.';
    else hint = 'Limited by CUSTOMER DEMAND — your staff are idle. Try Marketing.';
    setText('limitHint', hint);

    // What is currently affecting production and demand
    const parts = [];
    if (s.revealed.reputation) parts.push(`reputation ×${reputationMultiplier().toFixed(2)} demand`);
    if (s.revealed.morale) parts.push(`morale ×${moraleEfficiency().toFixed(2)} production`);
    const away = staffAway();
    if (away > 0) parts.push(`${away} Roti Man away`);
    for (const m of activeModifiers()) {
      if (m.closed || m.ownerAway) continue;
      if (m.demandMult !== 1) parts.push(`${m.label}: demand ×${m.demandMult.toFixed(2)}`);
      if (m.productionMult !== 1) parts.push(`${m.label}: production ×${m.productionMult.toFixed(2)}`);
    }
    setText('modifierInfo', parts.length ? 'Effects: ' + parts.join(' · ') : '');
  }

  // Challenge alert near the main button
  const ev = s.events.active;
  setHidden('challengeAlert', !ev || s.stage1Complete);
  if (ev && typeof eventTitle === 'function') setText('challengeAlert', `⚠ Challenge: ${eventTitle(ev)} — tap to see your options`);
}

function renderBusiness() {
  const s = state;
  const b = CONFIG.business;
  setHidden('businessPanel', !s.revealed.business || s.stage1Complete);
  if (!s.revealed.business) return;

  setHidden('bizRep', !s.revealed.reputation);
  setText('bizRepValue', `${Math.round(s.biz.reputation)} / 100`);
  el('bizRepBar').value = s.biz.reputation / 100;
  setText('bizRepEffect', `Customer demand ×${reputationMultiplier().toFixed(2)}. Slowly returns to ${b.reputation.driftTo}.`);

  setHidden('bizHyg', !s.revealed.hygiene);
  setText('bizHygValue', `${Math.round(s.biz.hygiene)} / 100`);
  el('bizHygBar').value = s.biz.hygiene / 100;
  setText('bizHygEffect', `${hygieneRiskLabel()}. Drops as you sell roti.`);

  setHidden('bizMor', !s.revealed.morale);
  setText('bizMorValue', `${Math.round(s.biz.morale)} / 100`);
  el('bizMorBar').value = s.biz.morale / 100;
  setText('bizMorEffect', `Production speed ×${moraleEfficiency().toFixed(2)}. Settles at ${b.morale.driftTo}.`);

  setHidden('bizFlour', !stockActive());
  setText('bizFlourValue', `${formatNumber(s.biz.flour)} / ${b.flour.storageMax}`);
  el('bizFlourBar').value = s.biz.flour / b.flour.storageMax;
  let flourText = `Enough for ${formatNumber(s.biz.flour)} roti.`;
  if (s.biz.flour < 1) flourText = 'EMPTY — no roti can be made!';
  else if (s.biz.flour < b.flour.lowWarning) flourText += ' Running low!';
  const d = s.deliveries[0];
  if (d) flourText += ` Delivery of ${d.amount} arriving in ${Math.max(0, Math.ceil(d.arriveAt - gameTime()))}s.`;
  setText('bizFlourEffect', flourText);

  // Action buttons
  for (const id of Object.keys(BUSINESS_ACTIONS)) {
    const a = BUSINESS_ACTIONS[id];
    const btn = el('act-' + id);
    if (!btn) continue;
    const visible = Boolean(a.visible());
    if (btn.hidden === visible) btn.hidden = !visible;
    if (!visible) continue;
    const why = actionBlockedReason(id);
    const cost = a.cost();
    const text = a.label() + (cost > 0 ? ` — ${money(cost)}` : '') + (why && why !== 'Not enough cash' ? ` (${why})` : '');
    if (btn.textContent !== text) btn.textContent = text;
    const disabled = Boolean(why);
    if (btn.disabled !== disabled) btn.disabled = disabled;
  }
}

function renderVictory() {
  const rows = [
    ['Roti sold', formatNumber(state.rotiSold)],
    ['…by hand', formatNumber(state.manualSold)],
    ['…by your staff', formatNumber(state.autoSold)],
    ['…in big orders', formatNumber(state.eventSold)],
    ['Employees', String(employees())],
    ['Lifetime revenue', money(state.grossRevenue)],
    ['Net profit', money(state.netProfit)],
    ['Cash in hand', money(state.cash)],
    ['Spent on challenges', money(state.challengeSpending)],
    ['Profit per roti', money(profitPerRoti())],
    ['Griddle level', String(state.levels.griddle)],
    ['Marketing level', String(state.levels.marketing)],
  ];
  if (state.revealed.reputation) rows.push(['Reputation', `${Math.round(state.biz.reputation)} / 100`]);
  if (state.revealed.hygiene) rows.push(['Hygiene', `${Math.round(state.biz.hygiene)} / 100`]);
  if (state.revealed.morale) rows.push(['Staff morale', `${Math.round(state.biz.morale)} / 100`]);
  if (typeof challengeSummaryRows === 'function') rows.push(...challengeSummaryRows());
  rows.push(['Play time', formatTime(state.playTimeMs)]);
  const box = el('victoryStats');
  box.innerHTML = '';
  for (const [k, v] of rows) {
    const div = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = k;
    dd.textContent = v;
    div.append(dt, dd);
    box.appendChild(div);
  }
}

/* =====================================================================
   START-UP AND BUTTONS
   ===================================================================== */

let feedbackTimer = null;

function showFeedback(text) {
  setText('clickFeedback', text);
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => setText('clickFeedback', ' '), 600);
}

function skipSeconds(total) {
  const steps = Math.round(total * 10);
  for (let i = 0; i < steps; i++) advance(0.1);
}

function devAction(action) {
  switch (action) {
    case 'cash100': state.cash = roundMoney(state.cash + 100); addLog('[Dev] Added RM100.'); break;
    case 'cash1000': state.cash = roundMoney(state.cash + 1000); addLog('[Dev] Added RM1,000.'); break;
    case 'roti100': state.rotiSold += 100; addLog('[Dev] Added 100 roti sold.'); break;
    case 'skip60': skipSeconds(60); addLog('[Dev] Skipped 60 seconds.'); break;
    case 'flour100':
      revealStock();
      addFlour(100);
      addLog('[Dev] Added 100 flour.');
      break;
    case 'statsDown':
      for (const k of ['reputation', 'hygiene', 'morale']) changeStat(k, -30);
      addLog('[Dev] Lowered reputation, hygiene and morale by 30.');
      break;
    case 'reset': requestReset(); return;
    default:
      if (typeof devEventAction === 'function' && devEventAction(action)) break;
      if (typeof devStageAction === 'function' && devStageAction(action)) break;
      return;
  }
  afterChange();
  saveGame();
}

function start() {
  const loaded = loadGame();
  if (!loaded) {
    addLog('You set up a folding table by the roadside. Time to flip some roti!');
  } else {
    addLog('Welcome back, boss. The stall is open again.');
  }
  logDirty = true;
  checkReveals();
  checkStage1();
  if (typeof setupEventsUI === 'function') setupEventsUI();
  if (typeof setupStagesUI === 'function') setupStagesUI();
  saveGame();
  render();

  el('makeButton').addEventListener('click', () => {
    const cash = makeRoti();
    if (cash > 0) showFeedback('+' + money(cash));
  });

  document.querySelectorAll('[data-buy]').forEach(btn => {
    btn.addEventListener('click', () => {
      buy(btn.dataset.buy);
      render();
    });
  });

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => doAction(btn.dataset.action));
  });

  document.querySelectorAll('[data-dev]').forEach(btn => {
    btn.addEventListener('click', () => devAction(btn.dataset.dev));
  });

  el('challengeAlert').addEventListener('click', () => {
    el('challengesPanel').scrollIntoView({ block: 'start' });
  });

  el('resetButton').addEventListener('click', requestReset);
  el('newStallButton').addEventListener('click', requestReset);
  el('resetYes').addEventListener('click', () => resetGame());
  el('resetNo').addEventListener('click', cancelReset);

  // Main loop. Pauses while the tab is hidden (no offline earnings).
  let last = performance.now();
  let sinceSave = 0;
  setInterval(() => {
    const now = performance.now();
    const seconds = Math.min((now - last) / 1000, CONFIG.maxTickSeconds);
    last = now;
    if (document.hidden) return;
    advance(seconds);
    sinceSave += seconds;
    if (sinceSave >= CONFIG.autosaveSeconds) {
      sinceSave = 0;
      saveGame();
    }
    render();
  }, CONFIG.tickMs);

  // Save when the player leaves or switches apps (important on iPad).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveGame();
    else last = performance.now();
  });
  window.addEventListener('pagehide', saveGame);
}

// Handy for testing in the browser console: MamakGame.state, MamakGame.tick(10) ...
window.MamakGame = {
  fmt,
  get state() { return state; },
  CONFIG, tick, advance, skipSeconds, buy, makeRoti, upgradeCost, saveGame, loadGame, resetGame, requestReset,
  productionCapacity, customerDemand, autoSalesRate, profitPerRoti, sellingPrice, cashPerRoti,
  reputationMultiplier, moraleEfficiency, doAction, actionBlockedReason, changeStat, addFlour, isClosed,
  blockReason, render,
  clearTapGuards: () => { for (const k of Object.keys(lastPurchaseAt)) delete lastPurchaseAt[k]; },  // for automated tests
};

// Starts once every script on the page (game.js, events.js) has loaded.
document.addEventListener('DOMContentLoaded', start);
