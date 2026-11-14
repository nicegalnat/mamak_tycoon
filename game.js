'use strict';

/* =====================================================================
   MAMAK TYCOON — Stage 1
   ---------------------------------------------------------------------
   ALL GAME NUMBERS LIVE IN THE CONFIG BLOCK BELOW.
   To rebalance the game, change numbers here only. You do not need to
   touch anything further down the file.
   ===================================================================== */

const CONFIG = {
  // --- Roti economics -------------------------------------------------
  roti: {
    startingProfit: 1.00,   // RM net profit per roti at the start
    ingredientCost: 0.50,   // RM cost of ingredients per roti
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
  },

  // --- Technical ----------------------------------------------------------
  saveKey: 'mamakTycoon_save_v1',
  saveVersion: 1,
  autosaveSeconds: 10,
  tickMs: 100,                // how often the game updates (milliseconds)
  maxTickSeconds: 1,          // never simulate more than this per update
  purchaseCooldownMs: 300,    // blocks accidental double-buys from one tap
  maxLogEntries: 40,
};

/* =====================================================================
   GAME STATE
   ===================================================================== */

function newState() {
  return {
    version: CONFIG.saveVersion,
    cash: 0,
    rotiSold: 0,
    manualSold: 0,
    autoSold: 0,
    grossRevenue: 0,
    netProfit: 0,
    rotiProgress: 0,          // fraction of the next automatic roti
    levels: { rotiMan: 0, griddle: 0, price: 0, marketing: 0 },
    revealed: {},             // which panels/upgrades have been unlocked
    flags: {},                // one-time messages already shown
    log: [],
    playTimeMs: 0,
    stage1Complete: false,
  };
}

let state = newState();

/* =====================================================================
   CALCULATIONS
   ===================================================================== */

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function employees() {
  return state.levels.rotiMan;
}

function profitPerRoti() {
  return CONFIG.roti.startingProfit +
    state.levels.price * CONFIG.upgrades.price.profitIncrease;
}

function sellingPrice() {
  return profitPerRoti() + CONFIG.roti.ingredientCost;
}

function griddleMultiplier(level = state.levels.griddle) {
  return Math.pow(1 + CONFIG.upgrades.griddle.capacityBonus, level);
}

function productionCapacity(staff = employees(), griddleLevel = state.levels.griddle) {
  return staff * CONFIG.upgrades.rotiMan.rotiPerSecond * griddleMultiplier(griddleLevel);
}

function customerDemand(marketingLevel = state.levels.marketing) {
  if (employees() < 1) return 0;
  return CONFIG.demand.startingRotiPerSecond *
    Math.pow(1 + CONFIG.upgrades.marketing.demandBonus, marketingLevel);
}

function autoSalesRate() {
  return Math.min(productionCapacity(), customerDemand());
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

function sellRoti(count, source) {
  if (count <= 0) return 0;
  const profit = profitPerRoti() * count;
  const revenue = sellingPrice() * count;
  state.cash = roundMoney(state.cash + profit);
  state.netProfit = roundMoney(state.netProfit + profit);
  state.grossRevenue = roundMoney(state.grossRevenue + revenue);
  state.rotiSold += count;
  if (source === 'manual') state.manualSold += count;
  else state.autoSold += count;
  return profit;
}

function makeRoti() {
  if (state.stage1Complete) return 0;
  const profit = sellRoti(1, 'manual');
  afterChange();
  return profit;
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
      const ideas = ['printed flyers for the taman', 'posted in the neighbourhood Facebook group', 'painted a bright new signboard',
        'got a food blogger to visit', 'went viral on TikTok', 'sponsored the futsal team'];
      return `Marketing level ${level}: ${ideas[(level - 1) % ideas.length]}. More customers coming!`;
    }
    default:
      return 'Upgrade purchased.';
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
  { roti: 200, text: 'A Grab rider picks up ten roti telur, bungkus.' },
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
    addLog('STAGE 1 COMPLETE — Restaurant unlocked! Time to buka kedai!');
    saveGame();
  }
}

function afterChange() {
  checkReveals();
  checkStage1();
  render();
}

/* =====================================================================
   GAME LOOP
   ===================================================================== */

// Advance the game by `seconds` of time.
function tick(seconds) {
  if (state.stage1Complete || seconds <= 0) return;
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

function loadGame() {
  let data;
  try {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (!raw) return false;
    data = JSON.parse(raw);
  } catch (e) {
    return false;
  }
  if (!data || typeof data !== 'object') return false;

  const fresh = newState();
  fresh.cash = num(data.cash, 0);
  fresh.rotiSold = Math.floor(num(data.rotiSold, 0));
  fresh.manualSold = Math.floor(num(data.manualSold, 0));
  fresh.autoSold = Math.floor(num(data.autoSold, 0));
  fresh.grossRevenue = num(data.grossRevenue, 0);
  fresh.netProfit = num(data.netProfit, 0);
  fresh.rotiProgress = Math.min(num(data.rotiProgress, 0), 0.999999);
  fresh.playTimeMs = num(data.playTimeMs, 0);
  fresh.stage1Complete = data.stage1Complete === true;
  if (data.levels && typeof data.levels === 'object') {
    for (const id of Object.keys(fresh.levels)) {
      fresh.levels[id] = Math.floor(num(data.levels[id], 0));
    }
  }
  if (data.revealed && typeof data.revealed === 'object') fresh.revealed = { ...data.revealed };
  if (data.flags && typeof data.flags === 'object') fresh.flags = { ...data.flags };
  if (Array.isArray(data.log)) {
    fresh.log = data.log
      .filter(e => e && typeof e.text === 'string')
      .slice(0, CONFIG.maxLogEntries)
      .map(e => ({ t: num(e.t, 0), text: e.text }));
  }
  state = fresh;
  return true;
}

function resetGame(askFirst = true) {
  if (askFirst && !window.confirm('Reset Mamak Tycoon?\n\nAll your progress will be deleted. This cannot be undone.')) {
    return false;
  }
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

function money(n) {
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

  document.body.classList.toggle('stage-complete', done);
  setText('stageLabel', done ? 'Stage 1 complete — Restaurant unlocked' : 'Stage 1 — The Roadside Stall');

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
  setText('priceInfo',
    `Selling price ${money(sellingPrice())} (ingredients ${money(CONFIG.roti.ingredientCost)}, profit ${money(profitPerRoti())})`);

  setHidden('autoPanel', !s.revealed.demand);
  if (s.revealed.demand) {
    const cap = productionCapacity();
    const dem = customerDemand();
    const act = autoSalesRate();
    setText('autoCapacity', rate(cap));
    setText('autoDemand', rate(dem));
    setText('autoActual', rate(act));
    setText('autoIncome', money(act * profitPerRoti()) + '/sec');
    let hint;
    if (Math.abs(cap - dem) < 1e-9) {
      hint = 'Production and demand are perfectly balanced. Shiok!';
    } else if (cap < dem) {
      hint = 'Limited by PRODUCTION — customers are waiting. Hire Roti Men or upgrade the griddle.';
    } else {
      hint = 'Limited by CUSTOMER DEMAND — your staff are idle. Try Marketing.';
    }
    setText('limitHint', hint);
  }

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
  if (done) renderVictory();

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

function renderVictory() {
  const rows = [
    ['Roti sold', formatNumber(state.rotiSold)],
    ['…by hand', formatNumber(state.manualSold)],
    ['…by your staff', formatNumber(state.autoSold)],
    ['Employees', String(employees())],
    ['Lifetime revenue', money(state.grossRevenue)],
    ['Net profit', money(state.netProfit)],
    ['Cash in hand', money(state.cash)],
    ['Profit per roti', money(profitPerRoti())],
    ['Griddle level', String(state.levels.griddle)],
    ['Marketing level', String(state.levels.marketing)],
    ['Play time', formatTime(state.playTimeMs)],
  ];
  const html = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const box = el('victoryStats');
  if (box.innerHTML !== html) box.innerHTML = html;
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

function devAction(action) {
  switch (action) {
    case 'cash100': state.cash = roundMoney(state.cash + 100); addLog('[Dev] Added RM100.'); break;
    case 'cash1000': state.cash = roundMoney(state.cash + 1000); addLog('[Dev] Added RM1,000.'); break;
    case 'roti100': state.rotiSold += 100; addLog('[Dev] Added 100 roti sold.'); break;
    case 'skip60':
      for (let i = 0; i < 600; i++) tick(0.1);
      state.playTimeMs += 60000;
      addLog('[Dev] Skipped 60 seconds.');
      break;
    case 'reset': resetGame(true); return;
    default: return;
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
  saveGame();
  render();

  el('makeButton').addEventListener('click', () => {
    const profit = makeRoti();
    if (profit > 0) showFeedback('+' + money(profit));
  });

  document.querySelectorAll('[data-buy]').forEach(btn => {
    btn.addEventListener('click', () => {
      buy(btn.dataset.buy);
      render();
    });
  });

  document.querySelectorAll('[data-dev]').forEach(btn => {
    btn.addEventListener('click', () => devAction(btn.dataset.dev));
  });

  el('resetButton').addEventListener('click', () => resetGame(true));

  // Main loop. Pauses while the tab is hidden (no offline earnings).
  let last = performance.now();
  let sinceSave = 0;
  setInterval(() => {
    const now = performance.now();
    const seconds = Math.min((now - last) / 1000, CONFIG.maxTickSeconds);
    last = now;
    if (document.hidden) return;
    if (!state.stage1Complete) state.playTimeMs += seconds * 1000;
    tick(seconds);
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
  get state() { return state; },
  CONFIG, tick, buy, makeRoti, upgradeCost, saveGame, loadGame, resetGame,
  productionCapacity, customerDemand, autoSalesRate, profitPerRoti, sellingPrice,
  render,
};

start();
