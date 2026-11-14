'use strict';

/* =====================================================================
   MAMAK TYCOON — Menu-book interface (v1.3)
   ---------------------------------------------------------------------
   Display only. This file never changes game rules or saved progress.
     • Tabs: Home · Menu & Upgrades · Staff & Operations · Franchise & Locations
     • The stat strip under the tabs (always real game numbers)
     • The stage box in the masthead
     • Small menu lists (kitchen figures, ingredient stock, franchise teaser)
   ===================================================================== */

const TABS = ['home', 'menu', 'ops', 'franchise'];
const TAB_KEY = 'mamakTycoon_tab';   // remembers the last tab on this device (convenience only)

// Which tab each Stages 2–10 section appears on. Anything not listed shows on Home.
const STAGE_TABS = {
  2: { overview: 'ops', kitchen: 'menu', open: 'franchise' },
  3: { overview: 'ops', promo: 'menu' },
  4: { overview: 'ops', fleet: 'menu' },
  5: { overview: 'ops', forms: 'ops', factories: 'menu' },
  6: { overview: 'ops', policies: 'menu' },
  7: { overview: 'ops', buy: 'menu' },
  8: { overview: 'ops', viral: 'menu' },
  9: { overview: 'ops', build: 'menu' },
  10: { overview: 'ops' },
};
function blockTab(stage, blockId) { return (STAGE_TABS[stage] && STAGE_TABS[stage][blockId]) || 'home'; }

let activeTab = 'home';
try { const t = localStorage.getItem(TAB_KEY); if (TABS.includes(t)) activeTab = t; } catch (e) { /* storage blocked: use Home */ }

function setTab(tab, scroll = true) {
  if (!TABS.includes(tab)) tab = 'home';
  activeTab = tab;
  try { localStorage.setItem(TAB_KEY, tab); } catch (e) { /* ignore */ }
  renderUI();
  if (scroll) { const nav = document.querySelector('.tabs'); if (nav && nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: 'start' }); }
}

// Tabs that have something to show in the current stage
function availableTabs() {
  if (state.gameComplete || state.stageComplete) return ['home'];
  if (state.stage === 1) return state.stage1Complete ? ['home', 'ops'] : ['home', 'menu', 'ops', 'franchise'];
  const def = STAGES[state.stage];
  const set = new Set(['home', 'ops']);
  if (def && SD()) for (const b of def.view()) if (b) set.add(blockTab(state.stage, b.id));
  return TABS.filter(t => set.has(t));
}

function stars(rep) {
  const n = Math.round(rep / 20);
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// The four key figures under the tabs
function stripValues() {
  const s = state;
  if (s.stage === 1) {
    const hired = employees() > 0;
    return [
      ['Cash', money(s.cash)],
      ['Production', hired ? rate(productionCapacity()) : 'By hand'],
      ['Customer Demand', hired ? rate(customerDemand()) : 'As fast as you tap'],
      ['Reputation', s.revealed.reputation ? stars(s.biz.reputation) : 'Not rated yet'],
    ];
  }
  const def = STAGES[s.stage];
  const ov = def && SD() ? def.view().find(b => b && b.id === 'overview') : null;
  const rows = ov ? ov.rows.slice(0, 4) : [];
  while (rows.length < 4) rows.push(['', '']);
  return rows;
}

function renderUI() {
  if (typeof state === 'undefined') return;
  const s = state;
  const tabs = availableTabs();
  if (!tabs.includes(activeTab)) activeTab = 'home';
  document.body.dataset.activeTab = activeTab;

  // tab buttons
  for (const t of TABS) {
    const b = document.getElementById('tab-' + t);
    if (!b) continue;
    const show = tabs.includes(t);
    if (b.hidden === show) b.hidden = !show;
    const on = t === activeTab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  }
  setHidden('statStrip', s.gameComplete || s.stageComplete);

  // stage box
  if (s.gameComplete) { setText('stageBoxNum', 'THE END'); setText('stageBoxName', 'Open 24 Jam, Forever'); }
  else {
    setText('stageBoxNum', `STAGE ${s.stage} / 10`);
    setText('stageBoxName', s.stage === 1 ? 'I Am the Mamak Owner' : STAGES[s.stage].title);
  }

  // stat strip
  stripValues().forEach(([label, value], i) => { setText('strip' + i + 'l', label); setText('strip' + i + 'v', value); });

  // Stage 1 menu lists (real figures only)
  if (s.stage === 1) {
    setText('pSell', money(sellingPrice()));
    setText('pProfit', money(profitPerRoti()));
    setText('pSold', formatNumber(s.rotiSold));
    setText('pRevenue', money(s.grossRevenue));
    if (stockActive()) {
      setText('stockFlour', `${formatNumber(s.biz.flour)} / ${CONFIG.business.flour.storageMax}`);
      const d = s.deliveries[0];
      setText('stockNote', s.biz.flour < 1 ? 'OUT OF FLOUR! No flour, no roti. Order more now.'
        : (s.biz.flour < CONFIG.business.flour.lowWarning ? 'Running low! ' : `Enough for ${formatNumber(s.biz.flour)} roti. `) + (d ? `Delivery of ${d.amount} on the way.` : ''));
    } else {
      setText('stockFlour', 'Not tracked yet');
      setText('stockNote', "Flour isn't tracked yet. Everything is fresh from the supplier for now.");
    }
    setHidden('stockLink', !stockActive());
    document.getElementById('stockPanel').classList.toggle('alert', stockActive() && s.biz.flour < CONFIG.business.flour.lowWarning);
  }

  // receipt order number
  const ev = s.events.active;
  document.body.classList.toggle('has-challenge', Boolean(ev) && !isPaused());
  setText('chOrder', ev ? `ORDER NO. ${String(ev.uid).padStart(3, '0')}` : '');

  // franchise teaser list (Stage 1)
  const list = document.getElementById('franchiseList');
  if (list && !list.dataset.done && typeof STAGES !== 'undefined') {
    list.dataset.done = '1';
    for (let n = 2; n <= 10; n++) {
      const li = document.createElement('li');
      li.innerHTML = '';
      const name = document.createElement('span'); name.textContent = `Stage ${n}: ${STAGES[n].title}`;
      const lock = document.createElement('span'); lock.className = 'lock'; lock.textContent = 'Locked';
      li.append(name, lock);
      list.appendChild(li);
    }
  }
}

function setupUI() {
  for (const t of TABS) {
    const b = document.getElementById('tab-' + t);
    if (b) b.addEventListener('click', () => setTab(t));
  }
  document.querySelectorAll('[data-goto-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.gotoTab)));
  // tapping a challenge alert always goes to the receipt
  ['challengeAlert', 'stageAlert'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', () => { const r = document.getElementById('challengesPanel'); if (r) r.scrollIntoView({ block: 'start' }); });
  });
  renderUI();
}

document.addEventListener('DOMContentLoaded', setupUI);
Object.assign(window, { MamakUI: { setTab, availableTabs, get tab() { return activeTab; }, blockTab } });
