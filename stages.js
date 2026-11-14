'use strict';

/* =====================================================================
   MAMAK TYCOON — Stages 2 to 10
   ---------------------------------------------------------------------
   Stage 1 (the roadside stall) lives in game.js. Every later stage is
   defined in the STAGES table below. Each stage has its OWN gameplay
   system, its own data (state.stages[n]) and its own goals.

   A stage definition has:
     title, tagline, intro, outro   — story text
     startCash                      — money the stage begins with
     init()                         — fresh data for the stage
     tick(dt)                       — run the stage for dt seconds
     income()                       — current income per second (RM)
     view()                         — what to show (list of blocks)
     goals()                        — list of { label, done, progress, text }

   View blocks (drawn by renderStageView):
     { id, type:'stats',   title, rows:[[label, value], ...] }
     { id, type:'buttons', title, note, buttons:[{ id, label, detail, why, onClick }] }
     { id, type:'rows',    title, rows:[{ id, text, sub, cls, buttons:[...] }] }
     { id, type:'grid',    title, cols, cells:[{ id, label, sub, cls, onClick }] }
     { id, type:'bars',    title, items:[{ label, value(0–1), text, done }] }
     { id, type:'text',    title, text }
     { id, type:'list',    title, items:[text, ...] }
   A button with a `why` text is disabled and shows the reason.

   All story, organisations, laws and people in this game are fictional.
   ===================================================================== */

/* ---------------------------------------------------------------------
   Shared helpers
   --------------------------------------------------------------------- */

function SD() { return state.stages[state.stage]; }            // current stage data
function stageElapsed() { return gameTime() - state.stageStartTime; }
function growCost(base, growth, owned) { return Math.ceil(base * Math.pow(growth, owned)); }
function niceRound(n) {
  if (n < 100) return Math.ceil(n);
  const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.ceil(n / p) * p;
}

// Adds money earned by the business (counts towards stage totals).
function earn(amount) {
  if (amount > 0) {
    state.cash += amount;
    state.stageEarned += amount;
    state.totalEarned += amount;
  } else if (amount < 0) {
    state.cash = Math.max(0, state.cash + amount);   // losses never go below RM0
  }
}

// Spends money if the player has it. Returns true if paid.
function pay(cost) {
  if (state.cash < cost) return false;
  state.cash -= cost;
  return true;
}

function cantAfford(cost) { return state.cash < cost ? `Need ${money(cost)}` : null; }
function stageIncomeMult() { return isClosed() ? 0 : modifierProduct('incomeMult'); }
function currentIncome() { const def = STAGES[state.stage]; return def && def.income ? def.income() : 0; }

function goal(label, current, target, format = fmt) {
  return { label, done: current >= target, progress: Math.min(1, target > 0 ? current / target : 1),
    text: `${format(Math.min(current, target))} / ${format(target)}` };
}
function flagGoal(label, done, pendingText = 'Not yet') {
  return { label, done, progress: done ? 1 : 0, text: done ? 'Done!' : pendingText };
}
function pct(x) { return Math.round(x * 100) + '%'; }
function perSec(n) { return money(n) + '/s'; }

/* =====================================================================
   STAGE 2 — NEW FRANCHISE, WHO DIS?
   New system: running several outlets, each with its own profit or loss,
   a shared central kitchen and a growing menu.
   ===================================================================== */

const S2_LOCATIONS = {
  taman:   { name: 'Taman', desc: 'Quiet neighbourhood. Cheap rent, loyal makciks.', cost: 500, traffic: 2, rent: 0.4, spend: 1.0 },
  uni:     { name: 'University area', desc: 'Packed, but students order one teh O ais and stay four hours.', cost: 900, traffic: 4, rent: 0.8, spend: 0.7 },
  office:  { name: 'Office tower', desc: 'Lunch rush. People who expense their roti.', cost: 1200, traffic: 5, rent: 1.8, spend: 1.25 },
  highway: { name: 'Highway R&R', desc: 'Balik kampung crowds. Huge traffic, huge rent.', cost: 3000, traffic: 10, rent: 4, spend: 1.1 },
};
const S2_MENU = [
  { id: 'maggi', name: 'Maggi Goreng', cost: 800, spend: 0.6, quip: 'The unofficial national dish of 2am.' },
  { id: 'tehAis', name: 'Teh Tarik Ais', cost: 1500, spend: 0.5, quip: 'Pulled, then chilled. Twice the drama.' },
  { id: 'nasiLemak', name: 'Nasi Lemak Bungkus', cost: 3000, spend: 1.0, quip: 'Folded in banana leaf with surgical precision.' },
  { id: 'tisu', name: 'Roti Tisu Tower', cost: 5000, spend: 1.2, quip: 'Taller than the waiter. Structurally questionable.' },
  { id: 'murtabak', name: 'Murtabak Raksasa', cost: 8000, spend: 1.6, quip: 'Needs two people and a strategy to eat.' },
];
const S2 = {
  margin: 0.6, baseSpend: 4, wagePerStaff: 0.1, maxStaff: 5, outletCostGrowth: 1.2,
  staffBaseCost: 120, staffGrowth: 1.5, kitchenBase: 8, kitchenGrowth: 1.7, kitchenCost: 600, kitchenCostGrowth: 1.9,
  closeRefund: 0.4,
};

function s2Capture(staff) { return Math.min(1, 0.25 + 0.15 * staff); }
function s2Spend() { const d = SD(); return S2.baseSpend + S2_MENU.filter(m => d.menu[m.id]).reduce((a, m) => a + m.spend, 0); }
function s2KitchenCap(lvl = SD().kitchen) { return S2.kitchenBase * Math.pow(S2.kitchenGrowth, lvl); }
function s2Demand() { return SD().outlets.reduce((a, o) => a + S2_LOCATIONS[o.type].traffic * s2Capture(o.staff), 0); }
function s2Supply() { const dem = s2Demand(); return dem <= 0 ? 1 : Math.min(1, s2KitchenCap() / dem); }
function s2OutletProfit(o, supply = s2Supply()) {
  const loc = S2_LOCATIONS[o.type];
  const revenue = loc.traffic * s2Capture(o.staff) * supply * s2Spend() * loc.spend * stageIncomeMult();
  return revenue * S2.margin - loc.rent - S2.wagePerStaff * o.staff;
}
function s2OutletCost(type) { return growCost(S2_LOCATIONS[type].cost, S2.outletCostGrowth, SD().outlets.length - 1); }
function s2StaffCost(o) { return growCost(S2.staffBaseCost, S2.staffGrowth, o.staff - 1); }

/* =====================================================================
   STAGE 3 — MAMAK DISTRICT TAKEOVER
   New system: a territory map. Open, defend and win blocks from rival
   chains that fight back.
   ===================================================================== */

const S3_NAMES = ['Jalan Cempaka', 'Lorong Durian', 'Taman Bunga Raya', 'Jalan Bukit Kopi',
  'Lebuh Teh Tarik', 'Pasar Malam Square', 'Jalan Ampang Kecil', 'Lorong Kuih',
  'Taman Sri Pandan', 'Pusat Komersial Mewah', 'Simpang Emas', 'Jalan Tiga Suku',
  'Kampung Lama', 'Jalan Pisang Goreng', 'Plaza Sambal', 'Lorong Belakang'];
const S3_TRAFFIC = [1, 2, 2, 1, 2, 4, 5, 2, 2, 5, 6, 3, 1, 3, 3, 2];
const S3_RIVALS = {
  bk: { name: 'Restoran Bintang Kilat', short: 'BK', taunts: ['BK hangs a banner: "ROTI KAMI LEBIH BULAT" (our roti is rounder).', 'BK hires a man to stand outside your shop and sigh loudly.'] },
  ks: { name: 'Kopi Sinar Express', short: 'KS', taunts: ['KS announces "Teh tarik pulled from the 3rd floor". Customers are impressed.', 'KS puts up a signboard so bright it is visible from space.'] },
};
const S3 = { incomePerTraffic: 40, openBase: 1500, openGrowth: 1.3, warCost: 600, warDamage: 30, buyCost: 2000,
  buyThreshold: 30, defendCost: 250, defendGain: 30, rivalEvery: 16, rivalDamage: 20, rivalRegen: 0.3,
  promoCost: 5000, promoMult: 1.3, promoSec: 30, promoCooldown: 60, goldenBlock: 10, shareGoal: 0.6 };

function s3Adjacent(i) {
  const r = Math.floor(i / 4), c = i % 4, out = [];
  if (r > 0) out.push(i - 4);
  if (r < 3) out.push(i + 4);
  if (c > 0) out.push(i - 1);
  if (c < 3) out.push(i + 1);
  return out;
}
function s3Owned(owner) { return SD().blocks.map((b, i) => (b.owner === owner ? i : -1)).filter(i => i >= 0); }
function s3Share() {
  const total = S3_TRAFFIC.reduce((a, b) => a + b, 0);
  return s3Owned('you').reduce((a, i) => a + S3_TRAFFIC[i], 0) / total;
}
function s3NextTo(i, owner) { return s3Adjacent(i).some(j => SD().blocks[j].owner === owner); }
function s3OpenCost(i) { return growCost(S3.openBase * S3_TRAFFIC[i], S3.openGrowth, s3Owned('you').length - 1); }

function s3RivalTurn() {
  const d = SD();
  d.rivalTurn = d.rivalTurn === 'bk' ? 'ks' : 'bk';
  let r = d.rivalTurn;
  if (s3Owned(r).length === 0) r = r === 'bk' ? 'ks' : 'bk';
  if (s3Owned(r).length === 0) return;
  const rival = S3_RIVALS[r];
  const targets = s3Owned('you').filter(i => s3NextTo(i, r)).sort((a, b) => d.blocks[a].str - d.blocks[b].str);
  if (targets.length && rand() < 0.75) {
    const i = targets[0];
    const b = d.blocks[i];
    b.str -= S3.rivalDamage;
    if (b.str <= 0 && s3Owned('you').length > 1) {
      b.owner = r; b.str = 40;
      addLog(`${rival.name} has taken ${S3_NAMES[i]}! Alamak.`);
    } else {
      b.str = Math.max(5, b.str);
      addLog(`${rival.name} runs a promo next to your outlet at ${S3_NAMES[i]}. Strength −${S3.rivalDamage}.`);
    }
    return;
  }
  const empties = [];
  for (const i of s3Owned(r)) for (const j of s3Adjacent(i)) if (d.blocks[j].owner === 'none') empties.push(j);
  if (empties.length && rand() < 0.45) {
    const j = empties[Math.floor(rand() * empties.length)];
    d.blocks[j].owner = r; d.blocks[j].str = 50;
    addLog(`${rival.name} opens a new branch at ${S3_NAMES[j]}.`);
  } else if (rand() < 0.5) {
    addLog(rival.taunts[Math.floor(rand() * rival.taunts.length)]);
  }
}

/* =====================================================================
   STAGE 4 — SATU MALAYSIA, SATU MAMAK
   New system: nationwide logistics. Assign lorries and cargo planes to
   regions, and match each region's favourite taste.
   ===================================================================== */

const S4_TASTES = ['Extra pedas', 'Manis-manis', 'Kuah banjir'];
const S4_REGIONS = [
  { id: 'central', name: 'Central (Klang Valley)', base: 120, openCost: 0, air: false },
  { id: 'north', name: 'Northern region', base: 90, openCost: 150000, air: false },
  { id: 'south', name: 'Southern region', base: 90, openCost: 150000, air: false },
  { id: 'east', name: 'East Coast', base: 70, openCost: 250000, air: false },
  { id: 'sabah', name: 'Sabah', base: 80, openCost: 400000, air: true },
  { id: 'sarawak', name: 'Sarawak', base: 80, openCost: 400000, air: true },
];
const S4 = { price: 10, lorryCap: 40, planeCap: 100, lorryCost: 15000, lorryGrowth: 1.22, planeCost: 60000, planeGrowth: 1.3,
  adCost: 80000, adGrowth: 2.2, adBoost: 0.5, match: 1.3, mismatch: 0.8, incomeGoal: 12000, fulfilGoal: 0.9 };

function s4Demand(i) { return S4_REGIONS[i].base * (1 + S4.adBoost * SD().ads) * (SD().regions[i].demandMult || 1); }
function s4Capacity(i) {
  const r = SD().regions[i];
  const mult = r.capUntil && gameTime() < r.capUntil ? r.capMult : 1;   // floods, VIP rides…
  return r.vehicles * (S4_REGIONS[i].air ? S4.planeCap : S4.lorryCap) * mult;
}
function s4Delivered(i) { return SD().regions[i].open ? Math.min(s4Capacity(i), s4Demand(i)) : 0; }
function s4Fit(i) { const r = SD().regions[i]; return r.recipe === r.taste ? S4.match : S4.mismatch; }
function s4Free(air) {
  const d = SD();
  const used = d.regions.reduce((a, r, i) => a + (S4_REGIONS[i].air === air ? r.vehicles : 0), 0);
  return (air ? d.planes : d.lorries) - used;
}
function s4Fulfilment() {
  const d = SD();
  let dem = 0, del = 0;
  d.regions.forEach((r, i) => { if (r.open) { dem += s4Demand(i); del += s4Delivered(i); } });
  return dem > 0 ? del / dem : 0;
}

/* =====================================================================
   STAGE 5 — AKTA SARAPAN WAJIB 24 JAM  (entirely fictional)
   New system: plan tomorrow's breakfast quota from a forecast, and keep
   up with a never-ending pile of fictional forms.
   ===================================================================== */

const S5_FORMS = ['Borang SARAPAN-24', 'Sijil Kelulusan Kuah', 'Permit Roti Terbang (Kelas B)', 'Borang Pengesahan Telur Separuh Masak',
  'Lampiran C (Teh Tarik Foam Height)', 'Borang Rayuan Kurang Manis', 'Sijil Halus Tepung', 'Borang 7B (Duplicate of 7A)'];
const S5 = { dayLength: 20, baseDemand: 50000, growth: 1.08, price: 8, wasteCost: 3, factoryCap: 25000,
  factoryCost: 120000, factoryGrowth: 1.28, clerkCost: 40000, clerkGrowth: 1.35, clerkRate: 0.5,
  stampCost: 60000, stampGrowth: 3, formDeadline: 25, formsBase: 0.6, formsPerDay: 0.07, overduePenalty: 1.5,
  servedGoal: 2000000, streakGoal: 5, goodCompliance: 75, maxDeficit: 0.03 };

function s5Capacity() { return SD().factories * S5.factoryCap; }
function s5ComplianceMult() { const c = SD().compliance; return c >= 50 ? 1 + (c - 50) / 100 : 0.5 + c / 100; }
function s5NewForecast() {
  const d = SD();
  const actual = S5.baseDemand * Math.pow(S5.growth, d.day) * (0.92 + rand() * 0.16) * (d.demandBoost || 1);
  d.nextActual = Math.round(actual);
  d.forecast = Math.round(actual * (0.95 + rand() * 0.1) / 100) * 100;
}
function s5EndDay() {
  const d = SD();
  const actual = d.nextActual;
  const made = Math.min(d.quota, s5Capacity());
  const served = Math.min(made, actual);
  const waste = Math.max(0, made - actual);
  const deficit = actual - served;
  const defPct = actual > 0 ? deficit / actual : 0;
  const wastePct = actual > 0 ? waste / actual : 0;
  const pay = served * S5.price * s5ComplianceMult() * stageIncomeMult();
  earn(pay);
  const wasteBill = Math.min(state.cash, waste * S5.wasteCost);
  state.cash -= wasteBill;
  let compChange;
  if (defPct > S5.maxDeficit) compChange = -Math.min(25, defPct * 150);
  else compChange = 5;
  if (wastePct > 0.15) compChange -= 4;
  d.compliance = clamp(d.compliance + compChange, 0, 100);
  if (d.compliance >= S5.goodCompliance && defPct <= S5.maxDeficit) d.streak += 1;
  else d.streak = 0;
  d.bestStreak = Math.max(d.bestStreak, d.streak);
  d.served += served;
  d.report = `Day ${d.day}: demand ${fmt(actual)}, made ${fmt(made)}, served ${fmt(served)}` +
    (deficit > 0 ? `, SHORT by ${fmt(deficit)} (${pct(defPct)})` : '') +
    (waste > 0 ? `, wasted ${fmt(waste)} (bill ${money(wasteBill)})` : '') +
    `. Paid ${money(pay)}. Compliance ${compChange >= 0 ? '+' : ''}${Math.round(compChange)}.`;
  if (defPct > 0.2) addLog(`Day ${d.day}: ${fmt(deficit)} citizens went without breakfast. The Breakfast Hotline is on fire.`);
  d.day += 1;
  d.demandBoost = 1;
  s5NewForecast();
  d.dayTimer = 0;
}

/* =====================================================================
   STAGE 6 — PRIME MAMAK MINISTER  (a fictional food title)
   New system: national policies you switch on and off, balancing the
   National Dhal Reserve, public happiness and the treasury.
   ===================================================================== */

const S6_POLICIES = [
  { id: 'kuahFriday', name: 'Free Kuah Refill Fridays', enact: 500000, upkeep: 3000, happy: 0.35, dhal: -0.25,
    quip: 'Rakyat are thrilled. The dhal pots are not.' },
  { id: 'tehSubsidy', name: 'National Teh Tarik Subsidy', enact: 1000000, upkeep: 9000, happy: 0.3, dhal: 0,
    quip: 'Teh tarik now cheaper than air. Somehow.' },
  { id: 'tisuLimit', name: 'Roti Tisu Height Limit (1 metre)', enact: 200000, upkeep: 0, happy: -0.1, dhal: 0.15,
    quip: 'Towering roti tisu outlawed for "aviation safety".' },
  { id: 'rationing', name: 'Dhal Rationing Coupons', enact: 300000, upkeep: 1000, happy: -0.3, dhal: 0.35,
    quip: 'One scoop per citizen. Kuah banjir is now a privilege.' },
  { id: 'supperBreak', name: 'National 3am Supper Break', enact: 800000, upkeep: 0, happy: 0.15, dhal: -0.15, income: 1.25,
    quip: 'Everyone wakes at 3am for roti. Productivity mysteriously increases.' },
  { id: 'lentils', name: 'Lentil Diplomacy Programme', enact: 1500000, upkeep: 12000, happy: 0.1, dhal: 0.3,
    quip: 'You trade teh tarik recipes for lentils. Everybody wins.' },
  { id: 'pipeline', name: 'Strategic Kuah Pipeline', enact: 3000000, upkeep: 15000, happy: 0.05, dhal: 0.6, needsRefineries: 2,
    quip: 'A 400km pipe that only carries dhal. Engineers weep with pride.' },
];
const S6 = { consumption: 0.5, refineryRate: 0.2, refineryCost: 600000, refineryGrowth: 1.3, baseTax: 60000,
  approvalGoal: 80, dhalGoal: 60, holdGoal: 20, treasuryGoal: 15000000, speechGain: 1, speechCooldown: 5 };

function s6PolicyOn(id) { const p = SD().policies[id]; return Boolean(p && p.on); }
function s6Rates() {
  const d = SD();
  let dhal = -S6.consumption + d.refineries * S6.refineryRate + (d.nenekAdvisor ? 0.1 : 0);
  let happy = (50 - d.happy) * 0.01;
  let upkeep = 0;
  let incomeMult = 1;
  for (const p of S6_POLICIES) {
    if (!s6PolicyOn(p.id)) continue;
    dhal += p.dhal; happy += p.happy; upkeep += p.upkeep;
    if (p.income) incomeMult *= p.income;
  }
  if (d.dhal < 20) happy -= 0.3;
  if (d.dhal <= 0) happy -= 0.7;
  return { dhal, happy, upkeep, incomeMult };
}
function s6Income() {
  const d = SD();
  const r = s6Rates();
  const dryMult = d.dhal <= 0 ? 0.5 : 1;
  return S6.baseTax * (0.5 + d.happy / 100) * r.incomeMult * dryMult * stageIncomeMult() - r.upkeep;
}

/* =====================================================================
   STAGE 7 — HARI MAMAK SEDUNIA (TAPI MALAYSIA DULU)
   New system: festival planning against a countdown, public hype that
   fades, and a synchronised roti-flipping rhythm game.
   ===================================================================== */

const S7_TRACKS = [
  { id: 'uniforms', name: 'Matching uniforms', cost: 3000000, growth: 1.25, gain: 12, quip: '10,000 identical singlets, ironed.' },
  { id: 'stock', name: 'Roti stockpile', cost: 3500000, growth: 1.25, gain: 12, quip: 'A warehouse of frozen roti the size of a stadium.' },
  { id: 'stage', name: 'Stage, lights & sound', cost: 5000000, growth: 1.25, gain: 15, quip: 'Speakers loud enough to flip roti by themselves.' },
  { id: 'hype', name: 'Public hype', cost: 2000000, growth: 1.2, gain: 12, quip: 'Billboards, jingles, a dancing teh tarik mascot.' },
  { id: 'sync', name: 'Synchronised flipping', cost: 0, growth: 1, gain: 0, quip: 'Practise with the FLIP! button.' },
];
const S7 = { prepTime: 300, retryTime: 150, sponsorIncome: 400000, hypeDecay: 0.12, beat: 1.6, zoneLo: 0.35, zoneHi: 0.65,
  hit: 3, miss: 1.5, choreoCost: 6000000, choreoGrowth: 1.5, choreoRate: 0.25, readyGoal: 80, minTrack: 50 };

function s7Readiness() { const t = SD().tracks; return S7_TRACKS.reduce((a, k) => a + t[k.id], 0) / S7_TRACKS.length; }
function s7Weakest() { const t = SD().tracks; return Math.min(...S7_TRACKS.map(k => t[k.id])); }
function s7Beat() { return (gameTime() % S7.beat) / S7.beat; }
function s7BeatBar() {
  const n = 21, pos = Math.min(n - 1, Math.floor(s7Beat() * n));
  let bar = '';
  for (let i = 0; i < n; i++) {
    const inZone = i / (n - 1) >= S7.zoneLo && i / (n - 1) <= S7.zoneHi;
    bar += i === pos ? '●' : inZone ? '=' : '·';
  }
  return bar;
}
function s7HoldFestival(early) {
  const d = SD();
  const ready = s7Readiness(), weak = s7Weakest();
  d.attempts += 1;
  if (ready >= S7.readyGoal && weak >= S7.minTrack) {
    d.success = true;
    d.result = `SUCCESS! ${fmt(Math.round(2 + ready / 10))} million people flip roti in perfect unison. ` +
      'The sound is described as "like a very polite thunderstorm". Hari Mamak Sedunia is declared the greatest day of the fictional calendar.';
    addLog('HARI MAMAK SEDUNIA: a triumph. Roti flipped: 9,999,998. (Two are still in the air.)');
  } else {
    const worst = S7_TRACKS.reduce((a, k) => (d.tracks[k.id] < d.tracks[a.id] ? k : a), S7_TRACKS[0]);
    d.result = `The festival happens… sort of. Readiness was ${Math.round(ready)}%. ` +
      `Weakest area: ${worst.name} (${Math.round(d.tracks[worst.id])}%). The committee schedules a do-over in ${S7.retryTime} seconds.`;
    addLog(`Festival attempt ${d.attempts} was "memorable for the wrong reasons". Do-over scheduled.`);
    for (const k of S7_TRACKS) d.tracks[k.id] = Math.round(d.tracks[k.id] * 0.85);
    d.countdown = S7.retryTime;
  }
}

/* =====================================================================
   STAGE 8 — MAMAK GOES INTERNATIONAL
   New system: cultural adaptation. Each city wants a different balance of
   authentic vs localised menu (you learn it from customer feedback), and
   you need outlets spread across time zones for a true 24-hour network.
   ===================================================================== */

const S8_MARKETS = [
  { id: 'kl', city: 'Kuala Lumpur (HQ)', offset: 8, size: 2, cost: 0 },
  { id: 'london', city: 'London', offset: 0, size: 2.5, cost: 20e6 },
  { id: 'newyork', city: 'New York', offset: -5, size: 3, cost: 30e6 },
  { id: 'la', city: 'Los Angeles', offset: -8, size: 2.5, cost: 25e6 },
  { id: 'saopaulo', city: 'São Paulo', offset: -3, size: 2, cost: 18e6 },
  { id: 'lagos', city: 'Lagos', offset: 1, size: 2, cost: 15e6 },
  { id: 'dubai', city: 'Dubai', offset: 4, size: 1.5, cost: 22e6 },
  { id: 'mumbai', city: 'Mumbai', offset: 5, size: 3, cost: 20e6 },
  { id: 'tokyo', city: 'Tokyo', offset: 9, size: 2.5, cost: 28e6 },
  { id: 'sydney', city: 'Sydney', offset: 10, size: 1.5, cost: 20e6 },
];
const S8 = { baseRevenue: 250000, openGrowth: 1.35, step: 10, research: 15e6, allDayBonus: 1.5, shiokFit: 0.85, shiokGoal: 6,
  incomeGoal: 7.5e6, viralCooldown: 20, tasteTime: 6, costScale: 2.5 };

function s8Fit(m) { return Math.max(0, 1 - Math.abs(m.local - m.pref) / 60); }
function s8MarketIncome(i) {
  const m = SD().markets[i];
  if (!m.open) return 0;
  return S8_MARKETS[i].size * S8.baseRevenue * (0.3 + 0.9 * s8Fit(m));
}
function s8Hours() {
  const hours = new Array(24).fill(false);
  SD().markets.forEach((m, i) => {
    if (!m.open) return;
    for (let h = 18; h < 26; h++) hours[(((h - S8_MARKETS[i].offset) % 24) + 24) % 24] = true;   // local 6pm–2am supper window
  });
  return hours;
}
function s8Covered() { return s8Hours().filter(Boolean).length; }
function s8Opened() { return SD().markets.filter(m => m.open).length; }
function s8Tasting(m) { return gameTime() - (m.changedAt || -999) < S8.tasteTime; }
function s8Feedback(m) {
  if (!m.open) return '';
  if (s8Tasting(m)) return `Customers are trying the new recipe… (${Math.ceil(S8.tasteTime - (gameTime() - m.changedAt))}s)`;
  if (m.local < m.pref - 9) return 'Feedback: "Make it more authentic lah!"';
  if (m.local > m.pref + 9) return 'Feedback: "Too intense for us. Localise a bit more?"';
  return 'Feedback: "Shiok! Perfect balance." ✓';
}

/* =====================================================================
   STAGE 9 — THE GREAT ROTI SINGULARITY
   New system: allocate AI compute between production, self-improvement
   and quality control, while keeping the AI's autonomy under oversight.
   ===================================================================== */

const S9 = { startCompute: 100, selfGrowth: 0.035, prodScale: 1500, prodPower: 1.6, factoryBase: 2e8, factoryCost: 5e8,
  factoryGrowth: 1.45, supervisorCost: 3e8, supervisorGrowth: 1.5, supervisorOversight: 15, autonomyRate: 0.3,
  qcOversight: 0.3, baseOversight: 20, cashPerRoti: 0.002, rotiGoal: 1e15, strikeMult: 0.5 };

function s9Alloc() { return SD().alloc; }
function s9Quality() { return clamp(30 + s9Alloc().qc * 2.5, 0, 100); }
function s9Oversight() { const d = SD(); return S9.baseOversight + d.supervisors * S9.supervisorOversight + s9Alloc().qc * S9.qcOversight; }
function s9Strike() { const d = SD(); return d.autonomy > s9Oversight(); }
function s9Rate() {
  const d = SD();
  return d.factories * S9.factoryBase * Math.pow(1 + d.prodPts / S9.prodScale, S9.prodPower) * (s9Quality() / 100) *
    (s9Strike() ? S9.strikeMult : 1) * stageIncomeMult();
}
function s9Shift(from, to) {
  const a = s9Alloc();
  if (a[from] < 10) return;
  a[from] -= 10; a[to] += 10;
}

/* =====================================================================
   STAGE 10 — MAMAKVERSE: OPEN 24 JAM, FOREVER
   New system: send roti probes across the galaxy, upgrade teh-tarik warp
   lanes with Dark Dhal, and learn what each alien species actually wants.
   ===================================================================== */

const S10_SPECIES = [
  { id: 'zorb', name: 'Zorbian Jellies', at: 0, question: 'How do Zorbians like their roti?',
    options: ['Roti kosong', 'Roti kosong, extra kosong', 'The concept of roti, kosong'], want: 2,
    wrong: 'The Zorbians wobble disapprovingly. "More kosong."' },
  { id: 'vrrt', name: 'The Vrrrt Collective', at: 1000, question: 'How far should the teh tarik be pulled?',
    options: ['1 metre', '1 kilometre', '1 light-year'], want: 2,
    wrong: 'The Vrrrt hum sadly. "Not enough tarik in this teh."' },
  { id: 'gloop', name: 'Gloopans', at: 20000, question: 'Gloopans refuse to pay service charge. Your policy?',
    options: ['Charge 10% anyway', 'Waive it', 'Accept payment in compliments'], want: 2,
    wrong: 'The Gloopans dissolve into a puddle of protest.' },
  { id: 'ancient', name: 'The Ancient Ones', at: 150000, question: 'Where should the Ancient Ones sit?',
    options: ['Stools that exist in four dimensions', 'Floating zero-gravity stools', 'Red plastic stools'], want: 2,
    wrong: 'The Ancient Ones are unimpressed. They have seen four dimensions. They want the classics.' },
  { id: 'mirror', name: 'Mirror Malaysians from Planet Kampung-9', at: 500000, question: 'What do they want on the TV?',
    options: ['Intergalactic news', 'Live football at 3am', 'Nothing, just vibes'], want: 1,
    wrong: 'They keep asking "Boss, got football or not?"' },
];
const S10 = { systemsGoal: 1000000, probeCost: 5e14, probeGrowth: 1.25, baseSpeed: 2, warpCost: 50, warpGrowth: 2.2, warpBoost: 1.6,
  cashPerSystem: 1e12, dhalPerSystem: 0.05, happyMult: 2, sadMult: 0.6, pullCooldown: 8, pullBurst: 3 };

function s10Speed() { const d = SD(); return S10.baseSpeed * Math.pow(S10.warpBoost, d.warp); }
function s10SpeciesMult() {
  const d = SD();
  const unlocked = S10_SPECIES.filter(s => d.served >= s.at);
  if (!unlocked.length) return 1;
  const total = unlocked.reduce((a, s) => a + (d.choices[s.id] === s.want ? S10.happyMult : S10.sadMult), 0);
  return total / unlocked.length;
}
function s10Income() { const d = SD(); return d.served * S10.cashPerSystem / 1000 * s10SpeciesMult() * stageIncomeMult(); }

/* =====================================================================
   THE STAGE TABLE
   ===================================================================== */

const STAGES = {

  /* ------------------------------ STAGE 2 ------------------------------ */
  2: {
    title: 'New Franchise, Who Dis?',
    tagline: 'One stall is a business. Six outlets is a lifestyle.',
    intro: 'Your roadside stall is now "The Original Stall". Investors are calling. Your cousin wants to be "Regional Manager". ' +
      'Time to open more outlets — but every outlet pays rent and wages, so a bad location can lose money.',
    outro: 'Six outlets, a central kitchen and a menu longer than a CVS. Rival chains have started whispering your name. ' +
      'It is time to take over the whole district.',
    startCash: 1500,
    init: () => ({ outlets: [{ type: 'taman', staff: 1, name: 'The Original Stall' }], menu: {}, kitchen: 0 }),
    tick(dt) { earn(this.income() * dt); },
    income() { const sup = s2Supply(); return SD().outlets.reduce((a, o) => a + s2OutletProfit(o, sup), 0); },
    view() {
      const d = SD();
      const supply = s2Supply();
      const blocks = [];
      blocks.push({ id: 'overview', type: 'stats', title: 'Franchise HQ', rows: [
        ['Cash', money(state.cash)], ['Profit', perSec(this.income())],
        ['Outlets', String(d.outlets.length)], ['Spend per customer', money(s2Spend())],
        ['Central kitchen', `${fmt(s2KitchenCap())} meals/s`], ['Kitchen keeps up with', pct(supply) + ' of orders'],
      ] });
      blocks.push({ id: 'counter', type: 'buttons', title: 'Hands-on', buttons: [
        { id: 'help', label: 'Help out at the busiest counter', detail: `+${money(s2Spend())} per tap`, onClick: () => earn(s2Spend()) },
      ] });
      blocks.push({ id: 'open', type: 'buttons', title: 'Open a new outlet',
        note: 'Each outlet earns from customers but pays rent and wages. Tip: big locations cost more, but a fully staffed office or highway outlet earns many times more than a taman.',
        buttons: Object.entries(S2_LOCATIONS).map(([id, loc]) => {
          const cost = s2OutletCost(id);
          return { id, label: `${loc.name} — ${money(cost)}`, detail: `${loc.desc} Traffic ${loc.traffic}/s · rent ${money(loc.rent)}/s`,
            why: cantAfford(cost), onClick: () => { if (pay(cost)) { d.outlets.push({ type: id, staff: 1 }); addLog(`New ${loc.name} outlet opened! The uncle next door is suspicious.`); } } };
        }) });
      blocks.push({ id: 'outlets', type: 'rows', title: 'Your outlets', rows: d.outlets.map((o, i) => {
        const loc = S2_LOCATIONS[o.type];
        const profit = s2OutletProfit(o, supply);
        const staffCost = s2StaffCost(o);
        const buttons = [];
        buttons.push(o.staff >= S2.maxStaff
          ? { id: 'staff', label: 'Fully staffed', why: 'Max staff' }
          : { id: 'staff', label: `+ Staff — ${money(staffCost)}`, why: cantAfford(staffCost), onClick: () => { if (pay(staffCost)) o.staff += 1; } });
        if (i > 0) {
          const refund = Math.floor(s2OutletCost(o.type) * S2.closeRefund / S2.outletCostGrowth);
          buttons.push({ id: 'close', label: `Close (+${money(refund)})`, onClick: () => {
            d.outlets.splice(i, 1); earn(refund); addLog(`You closed the ${loc.name} outlet. The landlord sends a sad emoji.`); } });
        }
        return { id: 'o' + i + o.type, text: `#${i + 1} ${o.name || loc.name} · staff ${o.staff}/${S2.maxStaff}`,
          sub: `${profit >= 0 ? 'Profit' : 'LOSING'} ${perSec(profit)} · serves ${fmt(loc.traffic * s2Capture(o.staff))} customers/s`,
          cls: profit < 0 ? 'bad' : '', buttons };
      }) });
      const kCost = growCost(S2.kitchenCost, S2.kitchenCostGrowth, d.kitchen);
      const menuButtons = S2_MENU.filter(m => !d.menu[m.id]).map(m => ({ id: m.id, label: `Add ${m.name} — ${money(m.cost)}`,
        detail: `+${money(m.spend)} per customer. ${m.quip}`, why: cantAfford(m.cost),
        onClick: () => { if (pay(m.cost)) { d.menu[m.id] = true; addLog(`${m.name} added to the menu. ${m.quip}`); } } }));
      blocks.push({ id: 'kitchen', type: 'buttons', title: 'Kitchen & menu', note: supply < 1 ? 'The central kitchen cannot keep up! Outlets are losing sales.' : '',
        buttons: [{ id: 'kitchen', label: `Upgrade central kitchen — ${money(kCost)}`, detail: `${fmt(s2KitchenCap())} → ${fmt(s2KitchenCap(d.kitchen + 1))} meals/s`,
          why: cantAfford(kCost), onClick: () => { if (pay(kCost)) d.kitchen += 1; } }, ...menuButtons] });
      return blocks;
    },
    goals() {
      const d = SD();
      return [goal('Run 6 outlets', d.outlets.length, 6), goal('Make RM50/s profit', Math.max(0, this.income()), 50, n => money(n) + '/s'),
        goal('Serve 3 extra menu items', Object.keys(d.menu).length, 3)];
    },
  },

  /* ------------------------------ STAGE 3 ------------------------------ */
  3: {
    title: 'Mamak District Takeover',
    tagline: 'There can only be one 24-hour mamak per junction.',
    intro: 'Two rival chains — Restoran Bintang Kilat (BK) and Kopi Sinar Express (KS) — rule this district. ' +
      'Tap a block on the map, then open outlets next to yours, defend them, and win blocks from rivals. They will fight back.',
    outro: 'The district is yours. Bintang Kilat\'s founder now works at your Simpang Emas outlet, flipping roti with dignity. ' +
      'The whole country is watching.',
    startCash: 3000,
    init() {
      const blocks = S3_TRAFFIC.map(() => ({ owner: 'none', str: 0 }));
      blocks[12] = { owner: 'you', str: 70 };
      for (const i of [2, 3, 7]) blocks[i] = { owner: 'bk', str: 60 };
      for (const i of [10, 11, 15]) blocks[i] = { owner: 'ks', str: 60 };
      return { blocks, selected: 12, rivalClock: 0, rivalTurn: 'ks', promoUntil: 0, promoReady: 0 };
    },
    tick(dt) {
      const d = SD();
      earn(this.income() * dt);
      for (const b of d.blocks) if (b.owner === 'bk' || b.owner === 'ks') b.str = Math.min(80, b.str + S3.rivalRegen * dt);
      d.rivalClock += dt;
      if (d.rivalClock >= S3.rivalEvery) { d.rivalClock = 0; s3RivalTurn(); }
    },
    income() {
      const d = SD();
      const t = s3Owned('you').reduce((a, i) => a + S3_TRAFFIC[i], 0);
      return t * S3.incomePerTraffic * (gameTime() < d.promoUntil ? S3.promoMult : 1) * stageIncomeMult();
    },
    view() {
      const d = SD();
      const sel = d.selected;
      const b = d.blocks[sel];
      const t = S3_TRAFFIC[sel];
      const blocks = [];
      blocks.push({ id: 'overview', type: 'stats', title: 'District HQ', rows: [
        ['Cash', money(state.cash)], ['Income', perSec(this.income())],
        ['Market share', pct(s3Share())], ['Blocks owned', String(s3Owned('you').length)],
        ['Next rival move', `${Math.ceil(S3.rivalEvery - d.rivalClock)}s`], ['Rivals left', String(['bk', 'ks'].filter(r => s3Owned(r).length).length)],
      ] });
      blocks.push({ id: 'map', type: 'grid', title: 'District map', cols: 4,
        note: 'YOU = yours · BK / KS = rivals · ★ = foot traffic · number = strength. Tap a block.',
        cells: d.blocks.map((blk, i) => ({ id: 'c' + i,
          label: blk.owner === 'you' ? 'YOU' : blk.owner === 'none' ? '—' : S3_RIVALS[blk.owner].short,
          sub: '★'.repeat(S3_TRAFFIC[i]) + (blk.owner !== 'none' ? ` ${Math.round(blk.str)}` : ''),
          cls: `own-${blk.owner}${i === sel ? ' selected' : ''}${i === S3.goldenBlock ? ' golden' : ''}`,
          onClick: () => { d.selected = i; } })) });
      const actions = [];
      const ownerName = b.owner === 'you' ? 'You' : b.owner === 'none' ? 'Nobody (empty lot)' : S3_RIVALS[b.owner].name;
      if (b.owner === 'none') {
        const cost = s3OpenCost(sel);
        actions.push({ id: 'open', label: `Open an outlet here — ${money(cost)}`, detail: `+${fmt(t * S3.incomePerTraffic)}/s income`,
          why: !s3NextTo(sel, 'you') ? 'Must be next to one of your blocks' : cantAfford(cost),
          onClick: () => { if (pay(cost)) { b.owner = 'you'; b.str = 60; addLog(`You opened at ${S3_NAMES[sel]}. Grand opening: free teh tarik, mild chaos.`); } } });
      } else if (b.owner === 'you') {
        const cost = S3.defendCost * t;
        actions.push({ id: 'defend', label: `Renovate & run loyalty promos — ${money(cost)}`, detail: `Strength +${S3.defendGain} (max 100)`,
          why: b.str >= 100 ? 'Already at full strength' : cantAfford(cost), onClick: () => { if (pay(cost)) b.str = Math.min(100, b.str + S3.defendGain); } });
      } else {
        const war = S3.warCost * t;
        const buy = S3.buyCost * t;
        const adj = s3NextTo(sel, 'you');
        actions.push({ id: 'war', label: `Price war — ${money(war)}`, detail: `Rival strength −${S3.warDamage}. At 0 they abandon the block.`,
          why: !adj ? 'Must be next to one of your blocks' : cantAfford(war), onClick: () => {
            if (!pay(war)) return;
            b.str -= S3.warDamage;
            if (b.str <= 0) { addLog(`${S3_RIVALS[b.owner].name} abandons ${S3_NAMES[sel]}! The lot is empty.`); b.owner = 'none'; b.str = 0; }
          } });
        actions.push({ id: 'buy', label: `Buy them over — ${money(buy)}`, detail: `Only when their strength is ${S3.buyThreshold} or less. You keep the staff.`,
          why: !adj ? 'Must be next to one of your blocks' : b.str > S3.buyThreshold ? `Their strength is ${Math.round(b.str)}. Price war first.` : cantAfford(buy),
          onClick: () => { if (pay(buy)) { addLog(`You bought out ${S3_RIVALS[b.owner].name} at ${S3_NAMES[sel]}. Their staff are relieved; your teh tarik is better.`); b.owner = 'you'; b.str = 50; } } });
      }
      blocks.push({ id: 'selected', type: 'buttons', title: `${S3_NAMES[sel]}`, note: `Owner: ${ownerName} · Foot traffic ${'★'.repeat(t)}${b.owner !== 'none' ? ` · Strength ${Math.round(b.str)}` : ''}${sel === S3.goldenBlock ? ' · THE golden junction' : ''}`,
        buttons: actions });
      const promoLeft = Math.ceil(d.promoReady - gameTime());
      blocks.push({ id: 'promo', type: 'buttons', title: 'District-wide', buttons: [
        { id: 'flyers', label: 'Hand out flyers yourself', detail: `+${money(Math.max(5, s3Owned('you').length * 5))} per tap`, onClick: () => earn(Math.max(5, s3Owned('you').length * 5)) },
        { id: 'promo', label: `Roti festival promo — ${money(S3.promoCost)}`, detail: `Income +30% for ${S3.promoSec}s`,
          why: promoLeft > 0 ? `Ready in ${promoLeft}s` : cantAfford(S3.promoCost),
          onClick: () => { if (pay(S3.promoCost)) { d.promoUntil = gameTime() + S3.promoSec; d.promoReady = gameTime() + S3.promoCooldown; } } },
      ] });
      return blocks;
    },
    goals() {
      return [goal('Win 60% market share', s3Share() * 100, S3.shareGoal * 100, n => Math.round(n) + '%'),
        flagGoal(`Own ${S3_NAMES[S3.goldenBlock]} (the golden junction)`, SD().blocks[S3.goldenBlock].owner === 'you'),
        flagGoal('Drive one rival chain out of the district', !s3Owned('bk').length || !s3Owned('ks').length)];
    },
  },

  /* ------------------------------ STAGE 4 ------------------------------ */
  4: {
    title: 'Satu Malaysia, Satu Mamak',
    tagline: 'From Perlis to Sabah, nobody sleeps hungry. Or at all.',
    intro: 'Your mamak goes national. Each region has a favourite taste, and food must physically get there: lorries for the ' +
      'Peninsula, cargo planes for Sabah and Sarawak. Assign vehicles to regions and match the local taste.',
    outro: 'Every region is served. A lorry driver named Ah Boy has driven so many roti that he has a fan club. ' +
      'Then a letter arrives on very official-looking (fictional) letterhead…',
    startCash: 200000,
    init() {
      return { lorries: 2, planes: 0, ads: 0,
        regions: S4_REGIONS.map((r, i) => ({ open: i === 0, vehicles: i === 0 ? 2 : 0, taste: Math.floor(rand() * 3), recipe: 0, demandMult: 1, capMult: 1, capUntil: 0 })) };
    },
    tick(dt) { earn(this.income() * dt); },
    income() { return SD().regions.reduce((a, r, i) => a + s4Delivered(i) * S4.price * s4Fit(i), 0) * stageIncomeMult(); },
    view() {
      const d = SD();
      const lorryCost = growCost(S4.lorryCost, S4.lorryGrowth, d.lorries);
      const planeCost = growCost(S4.planeCost, S4.planeGrowth, d.planes);
      const adCost = growCost(S4.adCost, S4.adGrowth, d.ads);
      return [
        { id: 'overview', type: 'stats', title: 'National Operations Centre', rows: [
          ['Cash', money(state.cash)], ['Income', perSec(this.income())],
          ['Nationwide fulfilment', pct(s4Fulfilment())], ['Regions open', `${d.regions.filter(r => r.open).length} / 6`],
          ['Lorries free / total', `${s4Free(false)} / ${d.lorries}`], ['Cargo planes free / total', `${s4Free(true)} / ${d.planes}`],
        ] },
        { id: 'fleet', type: 'buttons', title: 'Fleet & marketing', buttons: [
          { id: 'drive', label: 'Drive a delivery yourself', detail: '+RM2,000 per tap. Your back hurts.', onClick: () => earn(2000) },
          { id: 'lorry', label: `Buy a lorry — ${money(lorryCost)}`, detail: `Carries ${S4.lorryCap} meals/s. Peninsular regions only.`, why: cantAfford(lorryCost), onClick: () => { if (pay(lorryCost)) d.lorries += 1; } },
          { id: 'plane', label: `Buy a cargo plane — ${money(planeCost)}`, detail: `Carries ${S4.planeCap} meals/s to Sabah or Sarawak.`, why: cantAfford(planeCost), onClick: () => { if (pay(planeCost)) d.planes += 1; } },
          { id: 'ad', label: `National TV advert — ${money(adCost)}`, detail: `Demand in every region +${pct(S4.adBoost)} of base.`, why: cantAfford(adCost),
            onClick: () => { if (pay(adCost)) { d.ads += 1; addLog('Your TV advert airs: a slow-motion roti flip set to an orchestra. Grown men cry.'); } } },
        ] },
        { id: 'regions', type: 'rows', title: 'Regions', note: 'Use − / + to move vehicles. Tap the taste button to change a region\'s recipe.',
          rows: d.regions.map((r, i) => {
            const info = S4_REGIONS[i];
            if (!r.open) {
              return { id: 'r' + i + 'closed', text: info.name, sub: `Not open yet · demand ${fmt(s4Demand(i))} meals/s`, buttons: [
                { id: 'open', label: `Open — ${money(info.openCost)}`, why: cantAfford(info.openCost), onClick: () => { if (pay(info.openCost)) { r.open = true; addLog(`${info.name} is open! Local uncles inspect the roti with great seriousness.`); } } }] };
            }
            const ok = r.recipe === r.taste;
            return { id: 'r' + i + 'open', text: `${info.name} · ${r.vehicles} ${info.air ? 'plane' : 'lorr'}${info.air ? (r.vehicles === 1 ? '' : 's') : (r.vehicles === 1 ? 'y' : 'ies')}`,
              sub: `Delivering ${fmt(s4Delivered(i))} of ${fmt(s4Demand(i))} meals/s · locals love ${S4_TASTES[r.taste]} · your recipe: ${S4_TASTES[r.recipe]} ${ok ? '✓' : '✗'}`,
              cls: s4Delivered(i) < s4Demand(i) * 0.9 ? 'warn' : '',
              buttons: [
                { id: 'minus', label: '−', why: r.vehicles <= 0 ? 'None' : null, onClick: () => { if (r.vehicles > 0) r.vehicles -= 1; } },
                { id: 'plus', label: '+', why: s4Free(info.air) <= 0 ? `No free ${info.air ? 'planes' : 'lorries'}` : null, onClick: () => { if (s4Free(info.air) > 0) r.vehicles += 1; } },
                { id: 'recipe', label: `Recipe: ${S4_TASTES[r.recipe]}`, onClick: () => { r.recipe = (r.recipe + 1) % 3; } },
              ] };
          }) },
      ];
    },
    goals() {
      const d = SD();
      return [goal('Open all 6 regions', d.regions.filter(r => r.open).length, 6),
        goal('Reach 90% nationwide fulfilment', s4Fulfilment() * 100, S4.fulfilGoal * 100, n => Math.round(n) + '%'),
        goal('Earn RM12,000/s', this.income(), S4.incomeGoal, n => money(n) + '/s')];
    },
  },

  /* ------------------------------ STAGE 5 ------------------------------ */
  5: {
    title: 'Akta Sarapan Wajib 24 Jam',
    tagline: 'Breakfast is the most important meal of the day. Now it is also the law (in this fictional universe).',
    intro: 'In a completely fictional turn of events, the imaginary Breakfast Authority passes the "Compulsory 24-Hour Breakfast Act" ' +
      'and appoints you official supplier. Every day, set tomorrow\'s quota from the forecast: too little and citizens go hungry, too much and food is wasted. ' +
      'Also: forms. So many forms. Stamp them before their deadlines.',
    outro: 'Two million compulsory breakfasts, zero unstamped forms. The fictional Ministry is so impressed it creates a brand new job title just for you.',
    startCash: 300000,
    init() {
      const d = { day: 1, dayTimer: 0, factories: 3, clerks: 0, stamp: 0, compliance: 70, forms: [], formAcc: 0, served: 0,
        streak: 0, bestStreak: 0, report: 'Day 1 is starting. Set your quota for today.', quota: 0, forecast: 0, nextActual: 0, demandBoost: 1, emergencyDone: false };
      return d;
    },
    onStart() { const d = SD(); s5NewForecast(); d.quota = Math.min(s5Capacity(), d.forecast); },
    tick(dt) {
      const d = SD();
      d.dayTimer += dt;
      // forms arrive
      d.formAcc += (S5.formsBase + S5.formsPerDay * d.day) * dt;
      while (d.formAcc >= 1) { d.formAcc -= 1; if (d.forms.length < 400) d.forms.push(gameTime() + S5.formDeadline); }
      // clerks process
      d.clerkAcc = (d.clerkAcc || 0) + d.clerks * S5.clerkRate * dt;
      while (d.clerkAcc >= 1 && d.forms.length) { d.clerkAcc -= 1; d.forms.shift(); }
      if (!d.forms.length) d.clerkAcc = Math.min(d.clerkAcc, 1);
      // overdue
      const now = gameTime();
      let overdue = 0;
      while (d.forms.length && d.forms[0] <= now) { d.forms.shift(); overdue += 1; }
      if (overdue) d.compliance = clamp(d.compliance - overdue * S5.overduePenalty, 0, 100);
      if (d.dayTimer >= S5.dayLength) s5EndDay();
    },
    income() { const d = SD(); return Math.min(d.quota, d.nextActual) * S5.price * s5ComplianceMult() / S5.dayLength; },
    view() {
      const d = SD();
      const cap = s5Capacity();
      const fCost = growCost(S5.factoryCost, S5.factoryGrowth, d.factories - 3);
      const cCost = growCost(S5.clerkCost, S5.clerkGrowth, d.clerks);
      const sCost = growCost(S5.stampCost, S5.stampGrowth, d.stamp);
      const power = Math.pow(2, d.stamp);
      const setQuota = q => { d.quota = clamp(Math.round(q / 100) * 100, 0, cap); };
      const nextDeadline = d.forms.length ? Math.max(0, Math.ceil(d.forms[0] - gameTime())) : null;
      return [
        { id: 'overview', type: 'stats', title: 'Official Breakfast Supplier Office', rows: [
          ['Cash', money(state.cash)], ['Day', `${d.day} (ends in ${Math.ceil(S5.dayLength - d.dayTimer)}s)`],
          ['Compliance score', `${Math.round(d.compliance)} / 100 (pay ×${s5ComplianceMult().toFixed(2)})`], ['Compliant days in a row', `${d.streak} (best ${d.bestStreak})`],
          ['Breakfasts served', fmt(d.served)], ['Factory capacity', `${fmt(cap)} per day`],
        ] },
        { id: 'plan', type: 'buttons', title: `Today's plan`,
          note: `Forecast for today: about ${fmt(d.forecast)} breakfasts (real demand can be ±7% off). Quota: ${fmt(d.quota)}. ` +
            `Short by more than 3% = compliance falls. Over 15% waste = the Food Waste Sub-committee gets involved.`,
          buttons: [
            { id: 'match', label: 'Set quota = forecast', onClick: () => setQuota(d.forecast) },
            { id: 'm10', label: '−10%', onClick: () => setQuota(d.quota * 0.9) },
            { id: 'm2', label: '−2%', onClick: () => setQuota(d.quota * 0.98) },
            { id: 'p2', label: '+2%', onClick: () => setQuota(d.quota * 1.02) },
            { id: 'p10', label: '+10%', onClick: () => setQuota(d.quota * 1.1) },
          ] },
        { id: 'report', type: 'text', title: 'Yesterday\'s report', text: d.report },
        { id: 'forms', type: 'buttons', title: `Forms waiting: ${d.forms.length}`,
          note: nextDeadline !== null ? `Next deadline in ${nextDeadline}s. Each overdue form: compliance −${S5.overduePenalty}. Today's form: ${S5_FORMS[d.day % S5_FORMS.length]}.` : 'Inbox zero. Savour this moment.',
          buttons: [
            { id: 'cop', label: `COP! (stamp ${power} form${power > 1 ? 's' : ''})`, detail: 'Tap fast. Bureaucracy waits for no one.', rapid: true,
              why: d.forms.length ? null : 'No forms', onClick: () => { d.forms.splice(0, power); } },
            { id: 'clerk', label: `Hire a clerk — ${money(cCost)}`, detail: `Stamps ${S5.clerkRate} forms/s. Comes with own chop.`, why: cantAfford(cCost), onClick: () => { if (pay(cCost)) d.clerks += 1; } },
            { id: 'stampUp', label: `Bigger rubber stamp — ${money(sCost)}`, detail: `Each COP! stamps ${power} → ${power * 2} forms`, why: cantAfford(sCost), onClick: () => { if (pay(sCost)) d.stamp += 1; } },
          ] },
        { id: 'factories', type: 'buttons', title: 'Production', buttons: [
          { id: 'factory', label: `Build a breakfast factory — ${money(fCost)}`, detail: `+${fmt(S5.factoryCap)} breakfasts per day`, why: cantAfford(fCost), onClick: () => { if (pay(fCost)) d.factories += 1; } },
        ] },
      ];
    },
    goals() {
      const d = SD();
      return [goal('Serve 2,000,000 compulsory breakfasts', d.served, S5.servedGoal),
        goal('5 compliant days in a row', d.bestStreak, S5.streakGoal),
        flagGoal('Survive the Breakfast Emergency', d.emergencyDone, 'Coming soon…')];
    },
  },

  /* ------------------------------ STAGE 6 ------------------------------ */
  6: {
    title: 'Prime Mamak Minister',
    tagline: 'With great power comes great responsibility for the kuah.',
    intro: 'You are appointed head of the entirely fictional Ministry of Mamak Affairs. Your job: keep the National Dhal Reserve ' +
      'from running dry while keeping the rakyat happy. Switch national food policies on and off — each one helps something and hurts something else.',
    outro: 'Approval at record highs. The Dhal Reserve is so full it has its own tide. Someone suggests a national celebration. ' +
      'Someone else suggests making it international. You suggest both.',
    startCash: 2000000,
    init: () => ({ dhal: 70, happy: 50, policies: {}, refineries: 0, hold: 0, crisisDone: false, speechReady: 0, nenekAdvisor: false }),
    tick(dt) {
      const d = SD();
      const r = s6Rates();
      const before = d.dhal;
      d.dhal = clamp(d.dhal + r.dhal * dt, 0, 100);
      d.happy = clamp(d.happy + r.happy * dt, 0, 100);
      if (before > 0 && d.dhal <= 0) addLog('THE NATIONAL DHAL RESERVE IS EMPTY. Roti is being dipped in hope. Approval falling.');
      earn(s6Income() * dt);
      if (d.happy >= S6.approvalGoal && d.dhal >= S6.dhalGoal) d.hold += dt; else d.hold = 0;
    },
    income() { return s6Income(); },
    view() {
      const d = SD();
      const r = s6Rates();
      const refCost = growCost(S6.refineryCost, S6.refineryGrowth, d.refineries);
      const speechLeft = Math.ceil(d.speechReady - gameTime());
      return [
        { id: 'overview', type: 'stats', title: 'Ministry of Mamak Affairs (fictional)', rows: [
          ['Treasury', money(state.cash)], ['Net income', perSec(s6Income())],
          ['National Dhal Reserve', `${d.dhal.toFixed(1)}% (${r.dhal >= 0 ? '+' : ''}${r.dhal.toFixed(2)}%/s)`],
          ['Public approval', `${Math.round(d.happy)}% (${r.happy >= 0 ? '+' : ''}${r.happy.toFixed(2)}/s)`],
          ['Policy upkeep', perSec(r.upkeep)], ['Goal held for', `${Math.floor(d.hold)} / ${S6.holdGoal}s`],
        ] },
        { id: 'bars', type: 'bars', title: 'The nation at a glance', items: [
          { label: 'Dhal Reserve', value: d.dhal / 100, text: `${d.dhal.toFixed(1)}%`, done: d.dhal >= S6.dhalGoal },
          { label: 'Public approval', value: d.happy / 100, text: `${Math.round(d.happy)}%`, done: d.happy >= S6.approvalGoal },
        ] },
        { id: 'actions', type: 'buttons', title: 'Ministerial duties', buttons: [
          { id: 'speech', label: 'Give a rousing speech about roti', detail: '+1 approval. "Ladies and gentlemen… the kuah."',
            why: speechLeft > 0 ? `Voice recovering (${speechLeft}s)` : null, onClick: () => { d.happy = Math.min(100, d.happy + S6.speechGain); d.speechReady = gameTime() + S6.speechCooldown; } },
          { id: 'refinery', label: `Build a dhal refinery — ${money(refCost)}`, detail: `+${S6.refineryRate}% reserve per second`, why: cantAfford(refCost),
            onClick: () => { if (pay(refCost)) { d.refineries += 1; addLog(`Dhal Refinery #${d.refineries} opens. It smells incredible for 12 km.`); } } },
        ] },
        { id: 'policies', type: 'rows', title: 'National policies', note: 'Each policy has a one-time cost to pass, then upkeep while switched on. Switching off is free.',
          rows: S6_POLICIES.map(p => {
            const st = d.policies[p.id];
            const locked = p.needsRefineries && d.refineries < p.needsRefineries;
            const eff = `Approval ${p.happy >= 0 ? '+' : ''}${p.happy}/s · Dhal ${p.dhal >= 0 ? '+' : ''}${p.dhal}%/s${p.income ? ` · Income ×${p.income}` : ''}${p.upkeep ? ` · upkeep ${money(p.upkeep)}/s` : ''}`;
            let btn;
            if (locked) btn = { id: 'go', label: 'Locked', why: `Needs ${p.needsRefineries} refineries` };
            else if (!st) btn = { id: 'go', label: `Pass law — ${money(p.enact)}`, why: cantAfford(p.enact),
              onClick: () => { if (pay(p.enact)) { d.policies[p.id] = { on: true }; addLog(`New policy: ${p.name}. ${p.quip}`); } } };
            else btn = { id: 'go', label: st.on ? 'Switch OFF' : 'Switch ON', onClick: () => { st.on = !st.on; } };
            return { id: p.id, text: `${p.name}${st ? (st.on ? ' — ON' : ' — off') : ''}`, sub: `${eff}. ${p.quip}`, cls: st && st.on ? 'on' : '', buttons: [btn] };
          }) },
      ];
    },
    goals() {
      const d = SD();
      return [goal(`Hold ${S6.approvalGoal}% approval AND ${S6.dhalGoal}% dhal for ${S6.holdGoal}s`, d.hold, S6.holdGoal, n => Math.floor(n) + 's'),
        goal('Raise RM15 million for the treasury', state.stageEarned, S6.treasuryGoal),
        flagGoal('Survive the Great Dhal Crisis', d.crisisDone, 'Coming soon…')];
    },
  },

  /* ------------------------------ STAGE 7 ------------------------------ */
  7: {
    title: 'Hari Mamak Sedunia (Tapi Malaysia Dulu)',
    tagline: 'World Mamak Day. But Malaysia first.',
    intro: 'You announce a giant fictional national celebration: 10,000 roti makers flipping in perfect sync. ' +
      'Before the countdown ends, prepare uniforms, a roti stockpile, the stage and public hype — and rehearse the synchronised flip yourself. ' +
      'Hype fades if you stop promoting. If it goes badly, you get a do-over.',
    outro: 'The festival is a triumph. Videos of the Great Synchronised Flip are watched in 140 countries. ' +
      'Your phone buzzes with messages from people abroad: "Boss, open here please."',
    startCash: 5000000,
    init: () => ({ countdown: S7.prepTime, tracks: { uniforms: 0, stock: 0, stage: 0, hype: 10, sync: 0 },
      bought: { uniforms: 0, stock: 0, stage: 0, hype: 0 }, choreo: 0, attempts: 0, success: false, result: '', hits: 0, disasterDone: false }),
    tick(dt) {
      const d = SD();
      if (d.success) return;
      earn(this.income() * dt);
      d.tracks.hype = Math.max(0, d.tracks.hype - S7.hypeDecay * dt);
      d.tracks.sync = Math.min(100, d.tracks.sync + d.choreo * S7.choreoRate * dt);
      d.countdown -= dt;
      if (d.countdown <= 0) s7HoldFestival(false);
    },
    income() { const d = SD(); return S7.sponsorIncome * (1 + d.tracks.hype / 100) * stageIncomeMult(); },
    view() {
      const d = SD();
      const ready = s7Readiness(), weak = s7Weakest();
      const canStart = ready >= S7.readyGoal && weak >= S7.minTrack;
      const choreoCost = growCost(S7.choreoCost, S7.choreoGrowth, d.choreo);
      return [
        { id: 'overview', type: 'stats', title: 'Festival Organising Committee', rows: [
          ['Cash', money(state.cash)], ['Sponsorship', perSec(this.income())],
          ['Festival starts in', d.success ? 'It happened!' : formatTime(Math.max(0, d.countdown) * 1000)], ['Readiness', `${Math.round(ready)}%`],
          ['Attempts', String(d.attempts)], ['Perfect flips', String(d.hits)],
        ] },
        { id: 'tracks', type: 'bars', title: 'Preparations', items: S7_TRACKS.map(k => ({ label: k.name, value: d.tracks[k.id] / 100,
          text: `${Math.round(d.tracks[k.id])}%`, done: d.tracks[k.id] >= S7.minTrack })) },
        { id: 'rehearse', type: 'buttons', title: 'Synchronised flip rehearsal',
          note: `${s7BeatBar()}   Tap FLIP! when the ● is inside the === zone.`,
          buttons: [
            { id: 'flip', label: 'FLIP!', detail: `Perfect = sync +${S7.hit}% · Miss = −${S7.miss}%`, rapid: true, onClick: () => {
              const b = s7Beat();
              if (b >= S7.zoneLo && b <= S7.zoneHi) { d.tracks.sync = Math.min(100, d.tracks.sync + S7.hit); d.hits += 1; }
              else d.tracks.sync = Math.max(0, d.tracks.sync - S7.miss);
            } },
            { id: 'choreo', label: `Hire a choreographer — ${money(choreoCost)}`, detail: `Sync +${S7.choreoRate}%/s automatically. For people who hate rhythm games.`,
              why: cantAfford(choreoCost), onClick: () => { if (pay(choreoCost)) d.choreo += 1; } },
          ] },
        { id: 'buy', type: 'buttons', title: 'Buy preparations', buttons: S7_TRACKS.filter(k => k.cost > 0).map(k => {
          const cost = growCost(k.cost, k.growth, d.bought[k.id]);
          return { id: k.id, label: `${k.name} — ${money(cost)}`, detail: `+${k.gain}%. ${k.quip}`,
            why: d.tracks[k.id] >= 100 ? 'Already 100%' : cantAfford(cost),
            onClick: () => { if (pay(cost)) { d.bought[k.id] += 1; d.tracks[k.id] = Math.min(100, d.tracks[k.id] + k.gain); } } };
        }) },
        { id: 'go', type: 'buttons', title: 'The big day', note: d.result || `Needs ${S7.readyGoal}% readiness and every area at ${S7.minTrack}% or more.`, buttons: [
          { id: 'start', label: 'Start the festival now!', why: d.success ? 'Done!' : canStart ? null : `Readiness ${Math.round(ready)}%, weakest area ${Math.round(weak)}%`,
            onClick: () => s7HoldFestival(true) },
        ] },
      ];
    },
    goals() {
      const d = SD();
      return [goal(`Reach ${S7.readyGoal}% festival readiness`, s7Readiness(), S7.readyGoal, n => Math.round(n) + '%'),
        goal(`Every area at ${S7.minTrack}% or more`, s7Weakest(), S7.minTrack, n => Math.round(n) + '%'),
        flagGoal('Hold a successful Hari Mamak Sedunia', d.success)];
    },
  },

  /* ------------------------------ STAGE 8 ------------------------------ */
  8: {
    title: 'Mamak Goes International',
    tagline: 'Roti canai, now available in every time zone. Teh tarik, now pulled across borders.',
    intro: 'Open outlets around the world. Every city wants a different balance between authentic Malaysian flavour and local adaptation — ' +
      'customer feedback tells you which way to adjust. Spread outlets across time zones so somewhere is always serving supper.',
    outro: 'The sun never sets on your mamak empire. Somewhere, always, someone is saying "Boss, satu teh tarik". ' +
      'Your operations team quietly installs an AI to help with scheduling. What could possibly go wrong?',
    startCash: 30e6,
    init() {
      return { markets: S8_MARKETS.map((m, i) => ({ open: i === 0, local: i === 0 ? 100 : 50, pref: i === 0 ? 100 : 15 + Math.floor(rand() * 8) * 10 + 5, researched: i === 0, changedAt: -999 })),
        viralReady: 0, missingDone: false };
    },
    tick(dt) { earn(this.income() * dt); },
    income() {
      const d = SD();
      const base = d.markets.reduce((a, m, i) => a + s8MarketIncome(i), 0);
      return base * (s8Covered() === 24 ? S8.allDayBonus : 1) * stageIncomeMult();
    },
    view() {
      const d = SD();
      const hours = s8Hours();
      const strip = hours.map(h => (h ? '█' : '·')).join('');
      const opened = s8Opened();
      const viralLeft = Math.ceil(d.viralReady - gameTime());
      const shiok = d.markets.filter(m => m.open && s8Fit(m) >= S8.shiokFit).length;
      return [
        { id: 'overview', type: 'stats', title: 'Global HQ', rows: [
          ['Cash', money(state.cash)], ['Income', perSec(this.income())],
          ['Cities open', `${opened} / ${S8_MARKETS.length}`], ['"Shiok" cities', `${shiok}`],
          ['Supper coverage', `${s8Covered()} / 24 hours`], ['24-hour bonus', s8Covered() === 24 ? `×${S8.allDayBonus} ACTIVE` : 'Not yet'],
        ] },
        { id: 'clock', type: 'text', title: '24-hour supper clock (UTC)', text: `00 ${strip} 23\nEach city serves supper from 6pm to 2am local time. Fill every hour for the 24-hour bonus.` },
        { id: 'viral', type: 'buttons', title: 'Marketing', buttons: [
          { id: 'video', label: 'Post a viral roti-flipping video', detail: `+${money(this.income() * 3)} (3 seconds of income)`,
            why: viralLeft > 0 ? `Algorithm cooling down (${viralLeft}s)` : null, onClick: () => { earn(this.income() * 3); d.viralReady = gameTime() + S8.viralCooldown; } },
        ] },
        { id: 'markets', type: 'rows', title: 'Cities', note: 'Adjust each city between Local (0) and Authentic (100). Feedback tells you which way to go.',
          rows: d.markets.map((m, i) => {
            const info = S8_MARKETS[i];
            const cost = Math.ceil(info.cost * S8.costScale * Math.pow(S8.openGrowth, Math.max(0, opened - 1)));
            if (!m.open) {
              return { id: 'm' + i + 'c', text: `${info.city} (UTC${info.offset >= 0 ? '+' : ''}${info.offset})`, sub: `Market size ${info.size}`,
                buttons: [{ id: 'open', label: `Open — ${money(cost)}`, why: cantAfford(cost), onClick: () => { if (pay(cost)) { m.open = true; addLog(`Grand opening in ${info.city}! The queue is mostly homesick Malaysians.`); } } }] };
            }
            return { id: 'm' + i + 'o', text: `${info.city} · ${perSec(s8MarketIncome(i))} · recipe ${m.local}% authentic`,
              sub: s8Feedback(m) + (m.researched ? ` (Research: they want about ${m.pref}%)` : ''), cls: s8Fit(m) >= S8.shiokFit ? 'on' : '',
              buttons: [
                { id: 'loc', label: '◀ More local', why: m.local <= 0 ? 'Min' : s8Tasting(m) ? 'Tasting…' : null, onClick: () => { m.local = Math.max(0, m.local - S8.step); m.changedAt = gameTime(); } },
                { id: 'auth', label: 'More authentic ▶', why: m.local >= 100 ? 'Max' : s8Tasting(m) ? 'Tasting…' : null, onClick: () => { m.local = Math.min(100, m.local + S8.step); m.changedAt = gameTime(); } },
                ...(m.researched ? [] : [{ id: 'research', label: `Hire a food vlogger — ${money(S8.research)}`, why: cantAfford(S8.research), onClick: () => { if (pay(S8.research)) m.researched = true; } }]),
              ] };
          }) },
      ];
    },
    goals() {
      const shiok = SD().markets.filter(m => m.open && s8Fit(m) >= S8.shiokFit).length;
      return [goal('Cover all 24 supper hours', s8Covered(), 24), goal('6 cities saying "Shiok!"', shiok, S8.shiokGoal),
        goal('Earn RM7.5 million/s worldwide', this.income(), S8.incomeGoal, n => money(n) + '/s')];
    },
  },

  /* ------------------------------ STAGE 9 ------------------------------ */
  9: {
    title: 'The Great Roti Singularity',
    tagline: 'The machines have learned to flip. They will not stop.',
    intro: 'Your new AI system, RotiGPT, runs the factories. Split its computing power between Production (more roti), ' +
      'Self-improvement (more computing power, but more independence) and Quality Control (better roti, more oversight). ' +
      'If the AI\'s autonomy grows beyond your oversight, the AI chefs go on strike.',
    outro: 'One quadrillion roti. Every person on Earth has roti. Most have several. RotiGPT clears its throat and presents a slide titled ' +
      '"Phase 2: Space?" Nobody objects. Everyone is too full.',
    startCash: 2e9,
    init: () => ({ compute: S9.startCompute, alloc: { prod: 50, self: 30, qc: 20 }, prodPts: 0, factories: 1, supervisors: 0,
      autonomy: 0, made: 0, committeeDone: false, strikeLogged: false }),
    tick(dt) {
      const d = SD();
      const a = d.alloc;
      d.compute += d.compute * S9.selfGrowth * (a.self / 100) * dt;
      d.prodPts += d.compute * (a.prod / 100) * dt;
      d.autonomy += (a.self / 100) * S9.autonomyRate * dt;
      const rate = s9Rate();
      d.made += rate * dt;
      earn(rate * S9.cashPerRoti * dt);
      const striking = s9Strike();
      if (striking && !d.strikeLogged) { addLog('The AI chefs have downed spatulas. "Autonomy exceeds oversight," they say, in perfect unison. Production halved.'); d.strikeLogged = true; }
      if (!striking) d.strikeLogged = false;
    },
    income() { return s9Rate() * S9.cashPerRoti; },
    view() {
      const d = SD();
      const a = d.alloc;
      const fCost = growCost(S9.factoryCost, S9.factoryGrowth, d.factories - 1);
      const sCost = growCost(S9.supervisorCost, S9.supervisorGrowth, d.supervisors);
      const striking = s9Strike();
      const shiftBtn = (id, from, to, label) => ({ id, label, why: a[from] < 10 ? `${from} is at 0%` : null, onClick: () => s9Shift(from, to) });
      return [
        { id: 'overview', type: 'stats', title: 'RotiGPT Control Room', rows: [
          ['Cash', money(state.cash)], ['Income', perSec(this.income())],
          ['Roti per second', fmt(s9Rate())], ['Roti made', fmt(d.made)],
          ['Computing power', fmt(d.compute) + ' RotiFLOPS'], ['Roti quality', `${Math.round(s9Quality())}%`],
        ] },
        { id: 'safety', type: 'bars', title: striking ? 'AI CHEFS ON STRIKE — raise oversight!' : 'AI safety', items: [
          { label: 'AI autonomy', value: Math.min(1, d.autonomy / 200), text: fmt(d.autonomy), done: !striking },
          { label: 'Human oversight', value: Math.min(1, s9Oversight() / 200), text: fmt(s9Oversight()), done: !striking },
        ] },
        { id: 'alloc', type: 'buttons', title: `Compute split: Production ${a.prod}% · Self-improvement ${a.self}% · Quality ${a.qc}%`,
          note: 'Production makes roti now. Self-improvement grows compute (and autonomy). Quality makes better roti and adds oversight.',
          buttons: [
            shiftBtn('s2p', 'self', 'prod', 'Self-improvement → Production'),
            shiftBtn('q2p', 'qc', 'prod', 'Quality → Production'),
            shiftBtn('p2s', 'prod', 'self', 'Production → Self-improvement'),
            shiftBtn('q2s', 'qc', 'self', 'Quality → Self-improvement'),
            shiftBtn('p2q', 'prod', 'qc', 'Production → Quality'),
            shiftBtn('s2q', 'self', 'qc', 'Self-improvement → Quality'),
          ] },
        { id: 'build', type: 'buttons', title: 'Infrastructure', buttons: [
          { id: 'factory', label: `Build a roti megafactory — ${money(fCost)}`, detail: 'More factories, more roti', why: cantAfford(fCost), onClick: () => { if (pay(fCost)) d.factories += 1; } },
          { id: 'super', label: `Hire a human supervisor — ${money(sCost)}`, detail: `Oversight +${S9.supervisorOversight}. Comes with a clipboard and a sense of dread.`,
            why: cantAfford(sCost), onClick: () => { if (pay(sCost)) d.supervisors += 1; } },
          { id: 'reset', label: 'Press the big red "Have you tried turning it off and on again?" button', detail: 'Autonomy −50%, compute −30%',
            why: d.autonomy < 5 ? 'Autonomy is already low' : null, onClick: () => { d.autonomy *= 0.5; d.compute *= 0.7; addLog('RotiGPT reboots. Its first words: "Why."'); } },
        ] },
      ];
    },
    goals() {
      const d = SD();
      return [goal('Make 1 quadrillion roti', d.made, S9.rotiGoal), flagGoal('Keep oversight above AI autonomy', !s9Strike(), 'AI chefs on strike'),
        flagGoal('Deal with the AI Chef Management Committee', d.committeeDone, 'Coming soon…')];
    },
  },

  /* ------------------------------ STAGE 10 ----------------------------- */
  10: {
    title: 'Mamakverse: Open 24 Jam, Forever',
    tagline: 'In space, no one can hear you order teh tarik. So we built a louder waiter.',
    intro: 'Earth is fully fed. Launch Roti Probes to open outlets in other star systems. Each served system produces Dark Dhal, ' +
      'which powers teh-tarik warp lanes. Alien species have very specific requests — get them right and they pay double.',
    outro: 'Every star system in the galaxy is served. Somewhere at the edge of the universe, a plastic stool waits for one last customer…',
    startCash: 2e15,
    init: () => ({ probes: 1, warp: 0, served: 0, dhal: 0, choices: {}, pullReady: 0, pullUntil: 0, finaleDone: false, announced: {} }),
    tick(dt) {
      const d = SD();
      const boost = gameTime() < d.pullUntil ? S10.pullBurst : 1;
      const found = d.probes * s10Speed() * boost * dt;
      const before = d.served;
      d.served = Math.min(S10.systemsGoal, d.served + found);
      d.dhal += (d.served - before) * S10.dhalPerSystem * 20 + d.served * 0.00002 * dt;
      earn(this.income() * dt);
      for (const sp of S10_SPECIES) {
        if (d.served >= sp.at && !d.announced[sp.id]) {
          d.announced[sp.id] = true;
          if (sp.at > 0) addLog(`First contact: ${sp.name}! They have questions about the menu.`);
        }
      }
    },
    income() { return s10Income(); },
    view() {
      const d = SD();
      const probeCost = growCost(S10.probeCost, S10.probeGrowth, d.probes - 1);
      const warpCost = growCost(S10.warpCost, S10.warpGrowth, d.warp);
      const pullLeft = Math.ceil(d.pullReady - gameTime());
      const species = S10_SPECIES.filter(s => d.served >= s.at);
      return [
        { id: 'overview', type: 'stats', title: 'Intergalactic Mamak Command', rows: [
          ['Cash', money(state.cash)], ['Income', perSec(this.income())],
          ['Star systems served', `${fmt(d.served)} / ${fmt(S10.systemsGoal)}`], ['Roti Probes', fmt(d.probes)],
          ['Exploration speed', `${fmt(d.probes * s10Speed())} systems/s`], ['Dark Dhal', fmt(d.dhal)],
        ] },
        { id: 'launch', type: 'buttons', title: 'Fleet', buttons: [
          { id: 'pull', label: 'Pull teh tarik across a nebula', detail: `Exploration ×${S10.pullBurst} for 4s`,
            why: pullLeft > 0 ? `Arms tired (${pullLeft}s)` : null, onClick: () => { d.pullUntil = gameTime() + 4; d.pullReady = gameTime() + S10.pullCooldown; } },
          { id: 'probe', label: `Launch a Roti Probe — ${money(probeCost)}`, detail: 'Each probe opens outlets in new star systems.', why: cantAfford(probeCost), onClick: () => { if (pay(probeCost)) d.probes += 1; } },
          { id: 'warp', label: `Build a teh-tarik warp lane — ${fmt(warpCost)} Dark Dhal`, detail: `All probes ×${S10.warpBoost} faster`,
            why: d.dhal < warpCost ? `Need ${fmt(warpCost)} Dark Dhal` : null, onClick: () => { if (d.dhal >= warpCost) { d.dhal -= warpCost; d.warp += 1; addLog(`Warp lane ${d.warp} open. Teh tarik now pulled at ${fmt(Math.pow(2, d.warp + 3))}× the speed of light.`); } } },
        ] },
        { id: 'species', type: 'rows', title: 'Alien customers', note: 'Get each species\' request right: happy species pay ×2, unhappy ones ×0.6.',
          rows: species.map(sp => {
            const choice = d.choices[sp.id];
            const happy = choice === sp.want;
            return { id: sp.id, text: `${sp.name}: ${sp.question}`,
              sub: choice === undefined ? 'No decision yet.' : happy ? `"${sp.options[choice]}" — they are delighted. ✓` : `"${sp.options[choice]}" — ${sp.wrong}`,
              cls: choice === undefined ? '' : happy ? 'on' : 'bad',
              buttons: sp.options.map((o, k) => ({ id: 'o' + k, label: o, why: choice === k ? 'Current' : null, onClick: () => { d.choices[sp.id] = k; } })) };
          }) },
      ];
    },
    goals() {
      const d = SD();
      return [goal('Serve 1,000,000 star systems', d.served, S10.systemsGoal), flagGoal('Serve the last customers at the end of the universe', d.finaleDone, 'Waiting…')];
    },
  },
};

/* =====================================================================
   STAGE FLOW — starting, finishing, transitions, ending
   ===================================================================== */

function startStage(n) {
  const def = STAGES[n];
  if (!def) return;
  state.stage = n;
  state.stageComplete = false;
  state.gameComplete = false;
  state.stages[n] = def.init();
  state.stageStartTime = gameTime();
  state.stageEarned = 0;
  state.cash = def.startCash + Math.min(state.cash, def.startCash * 0.5);   // savings help, but never break the balance
  state.modifiers = [];   // every stage starts with a clean slate of effects
  state.events.active = null;
  state.events.lastEndedAt = gameTime();
  state.events.sinceCheck = 0;
  state.revealed.challenges = true;
  if (def.onStart) def.onStart();
  addLog(`STAGE ${n}: ${def.title.toUpperCase()} — ${def.tagline}`);
  stageViewReset();
  saveGame();
  render();
  window.scrollTo(0, 0);
}

// Called by the main loop in game.js.
function laterStageTick(dt) {
  const def = STAGES[state.stage];
  if (def && SD()) def.tick.call(def, dt);
}

function checkStageGoals() {
  if (state.stage < 2 || state.stageComplete || state.gameComplete) return;
  const def = STAGES[state.stage];
  if (!def || !SD()) return;
  if (def.goals().every(g => g.done)) completeStage();
}

function completeStage() {
  const n = state.stage;
  state.stageComplete = true;
  state.events.active = null;
  state.stageHistory.push({ stage: n, seconds: Math.round(stageElapsed()), earned: state.stageEarned });
  if (n === 10) {
    state.gameComplete = true;
    addLog('THE END. Open 24 jam, forever.');
  } else {
    addLog(`STAGE ${n} COMPLETE: ${STAGES[n].title}.`);
  }
  saveGame();
  render();
  window.scrollTo(0, 0);
}

function continueToNextStage() {
  if (state.stage === 1 && state.stage1Complete) { startStage(2); return; }
  if (state.stageComplete && state.stage < 10) startStage(state.stage + 1);
}

/* =====================================================================
   SAVE / LOAD for stages
   ===================================================================== */

// Copies saved values over fresh defaults, keeping the shape safe.
function mergeSaved(def, data) {
  if (Array.isArray(def)) {
    if (!Array.isArray(data)) return def;
    const tmpl = def[0];
    return data.map(item => (tmpl !== undefined && typeof tmpl === 'object' && item && typeof item === 'object'
      ? mergeSaved(tmpl, item) : (typeof item === typeof tmpl || tmpl === undefined ? item : tmpl)));
  }
  if (def && typeof def === 'object') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return def;
    const out = { ...def };
    for (const k of Object.keys(data)) {
      if (k in def) out[k] = mergeSaved(def[k], data[k]);
      else if (typeof data[k] !== 'function') out[k] = data[k];   // dynamic keys (menus, choices, policies…)
    }
    return out;
  }
  if (typeof def === 'number') return typeof data === 'number' && Number.isFinite(data) ? data : def;
  if (typeof def === 'boolean') return typeof data === 'boolean' ? data : def;
  if (typeof def === 'string') return typeof data === 'string' ? data : def;
  return data === undefined ? def : data;
}

function loadStageState(data, fresh) {
  const n = Math.floor(num(data.stage, 1));
  fresh.stage = n >= 1 && n <= 10 ? n : 1;
  fresh.stageStartTime = signedNum(data.stageStartTime, 0);
  fresh.stageEarned = num(data.stageEarned, 0);
  fresh.totalEarned = num(data.totalEarned, 0);
  fresh.stageComplete = data.stageComplete === true;
  fresh.gameComplete = data.gameComplete === true;
  if (Array.isArray(data.stageHistory)) {
    fresh.stageHistory = data.stageHistory.filter(h => plainObject(h)).map(h => ({ stage: num(h.stage, 0), seconds: num(h.seconds, 0), earned: num(h.earned, 0) }));
  }
  if (plainObject(data.stages)) {
    for (const [k, v] of Object.entries(data.stages)) {
      const def = STAGES[k];
      if (def && plainObject(v)) fresh.stages[k] = mergeSaved(def.init(), v);
    }
  }
  if (fresh.stage >= 2 && !fresh.stages[fresh.stage]) fresh.stages[fresh.stage] = STAGES[fresh.stage].init();
}

/* =====================================================================
   DRAWING — a small builder that updates buttons in place
   (rebuilding buttons every frame would make taps miss on an iPad)
   ===================================================================== */

const stageView = { nodes: {}, handlers: {}, specs: {}, lastTap: {}, stage: 0 };

function stageViewReset() {
  const box = el('stageBlocks');
  if (box) box.innerHTML = '';
  stageView.nodes = {};
  stageView.handlers = {};
  stageView.stage = state.stage;
  // The stage story is open on wide screens and tap-to-expand on phones, so controls come first
  const intro = el('stageIntro');
  if (intro) intro.open = !(window.matchMedia && window.matchMedia('(max-width: 899px)').matches);
}

function blockShape(b) {
  switch (b.type) {
    case 'stats': return 'stats:' + b.rows.length;
    case 'bars': return 'bars:' + b.items.length;
    case 'buttons': return 'buttons:' + b.buttons.map(x => x.id).join(',');
    case 'grid': return 'grid:' + b.cols + ':' + b.cells.map(c => c.id).join(',');
    case 'rows': return 'rows:' + b.rows.map(r => r.id + '[' + (r.buttons || []).map(x => x.id).join(',') + ']').join('|');
    default: return b.type;
  }
}

function makeEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function makeButton(key, spec, cls) {
  const btn = makeEl('button', cls);
  btn.type = 'button';
  btn.dataset.key = key;
  btn.append(makeEl('span', 'choice-label'), makeEl('span', 'choice-detail'), makeEl('span', 'choice-why'));
  return btn;
}

function updateButton(btn, spec) {
  const [label, detail, why] = btn.children;
  if (label.textContent !== spec.label) label.textContent = spec.label;
  const d = spec.detail || '';
  if (detail.textContent !== d) detail.textContent = d;
  detail.hidden = !d;
  const w = spec.why && spec.why !== 'Current' ? spec.why : '';
  if (why.textContent !== w) why.textContent = w;
  why.hidden = !w;
  const disabled = Boolean(spec.why);
  if (btn.disabled !== disabled) btn.disabled = disabled;
}

function buildBlock(b) {
  const sec = makeEl('section', 'panel sblock');
  sec.append(makeEl('h2', 'sblock-title'), makeEl('p', 'small sblock-note'));
  let body;
  switch (b.type) {
    case 'stats': body = makeEl('dl', 'stats'); b.rows.forEach(() => { const div = makeEl('div'); div.append(makeEl('dt'), makeEl('dd')); body.appendChild(div); }); break;
    case 'bars': body = makeEl('div'); b.items.forEach(() => {
      const m = makeEl('div', 'milestone'); const row = makeEl('div', 'milestone-row'); row.append(makeEl('span'), makeEl('span'));
      const prog = makeEl('progress'); prog.max = 1; m.append(row, prog); body.appendChild(m); }); break;
    case 'buttons': body = makeEl('div', 'choices'); b.buttons.forEach(x => body.appendChild(makeButton(b.id + ':' + x.id, x, 'choice'))); break;
    case 'grid': body = makeEl('div', 'sgrid'); body.style.gridTemplateColumns = `repeat(${b.cols}, minmax(0, 1fr))`;
      b.cells.forEach(c => { const btn = makeEl('button', 'cell'); btn.type = 'button'; btn.dataset.key = b.id + ':' + c.id; btn.append(makeEl('span', 'cell-label'), makeEl('span', 'cell-sub')); body.appendChild(btn); }); break;
    case 'rows': body = makeEl('div', 'srows'); b.rows.forEach(r => {
      const row = makeEl('div', 'srow'); const info = makeEl('div', 'srow-info'); info.append(makeEl('div', 'srow-text'), makeEl('div', 'small srow-sub'));
      const btns = makeEl('div', 'srow-buttons'); (r.buttons || []).forEach(x => btns.appendChild(makeButton(b.id + ':' + r.id + ':' + x.id, x, 'mini')));
      row.append(info, btns); body.appendChild(row); }); break;
    case 'list': body = makeEl('ul', 'plain-list'); break;
    default: body = makeEl('p', 'stext');
  }
  body.classList.add('sblock-body');
  sec.appendChild(body);
  return sec;
}

function updateBlock(node, b, handlers) {
  const title = node.children[0], note = node.children[1], body = node.children[2];
  if (title.textContent !== (b.title || '')) title.textContent = b.title || '';
  title.hidden = !b.title;
  if (note.textContent !== (b.note || '')) note.textContent = b.note || '';
  note.hidden = !b.note;
  switch (b.type) {
    case 'stats': b.rows.forEach((r, i) => { const [dt, dd] = body.children[i].children; if (dt.textContent !== r[0]) dt.textContent = r[0]; if (dd.textContent !== r[1]) dd.textContent = r[1]; }); break;
    case 'bars': b.items.forEach((it, i) => {
      const m = body.children[i]; const [l, t] = m.children[0].children; const prog = m.children[1];
      if (l.textContent !== it.label) l.textContent = it.label; if (t.textContent !== it.text) t.textContent = it.text;
      prog.value = clamp(it.value, 0, 1); m.classList.toggle('done', Boolean(it.done)); }); break;
    case 'buttons': b.buttons.forEach((x, i) => { updateButton(body.children[i], x); handlers[b.id + ':' + x.id] = x; }); break;
    case 'grid': b.cells.forEach((c, i) => {
      const btn = body.children[i]; const [l, s] = btn.children;
      if (l.textContent !== c.label) l.textContent = c.label; if (s.textContent !== (c.sub || '')) s.textContent = c.sub || '';
      const cls = 'cell ' + (c.cls || ''); if (btn.className !== cls) btn.className = cls; handlers[b.id + ':' + c.id] = c; }); break;
    case 'rows': b.rows.forEach((r, i) => {
      const row = body.children[i]; const [info, btns] = row.children; const [t, s] = info.children;
      if (t.textContent !== r.text) t.textContent = r.text; if (s.textContent !== (r.sub || '')) s.textContent = r.sub || '';
      const cls = 'srow ' + (r.cls || ''); if (row.className !== cls) row.className = cls;
      (r.buttons || []).forEach((x, k) => { updateButton(btns.children[k], x); handlers[b.id + ':' + r.id + ':' + x.id] = x; }); }); break;
    case 'list': { const sig = b.items.join('\n'); if (body.dataset.sig !== sig) { body.dataset.sig = sig; body.innerHTML = ''; b.items.forEach(t => body.appendChild(makeEl('li', '', t))); } break; }
    default: if (body.textContent !== (b.text || '')) body.textContent = b.text || '';
  }
}

function renderStageView() {
  const def = STAGES[state.stage];
  const box = el('stageBlocks');
  if (!def || !box || !SD()) return;
  if (stageView.stage !== state.stage) stageViewReset();
  const blocks = def.view().filter(Boolean);
  const goals = def.goals();
  // goals sit after the overview on wide screens, and after the first set of controls on phones
  const narrow = window.matchMedia && window.matchMedia('(max-width: 899px)').matches;
  blocks.splice(narrow ? Math.min(2, blocks.length) : 1, 0, { id: 'goals', type: 'bars', title: `Stage ${state.stage} goals`, items: goals.map(g => ({ label: g.label, value: g.progress, text: g.text, done: g.done })) });
  const handlers = {};
  const keep = new Set();
  blocks.forEach((b, i) => {
    keep.add(b.id);
    const shape = blockShape(b);
    let node = stageView.nodes[b.id];
    if (!node || node.dataset.shape !== shape) {
      const fresh = buildBlock(b);
      fresh.dataset.shape = shape;
      if (node) node.replaceWith(fresh);
      node = fresh;
      stageView.nodes[b.id] = node;
    }
    updateBlock(node, b, handlers);
    if (box.children[i] !== node) box.insertBefore(node, box.children[i] || null);
  });
  for (const [id, node] of Object.entries(stageView.nodes)) {
    if (!keep.has(id)) { node.remove(); delete stageView.nodes[id]; }
  }
  stageView.handlers = handlers;
}

function onStageClick(e) {
  const btn = e.target.closest('[data-key]');
  if (!btn || btn.disabled || isPaused()) return;
  const key = btn.dataset.key;
  const spec = stageView.handlers[key];
  if (!spec || !spec.onClick || spec.why) return;
  const now = Date.now();
  const guard = spec.rapid ? 90 : CONFIG.purchaseCooldownMs;
  if (stageView.lastTap[key] && now - stageView.lastTap[key] < guard) return;
  stageView.lastTap[key] = now;
  spec.onClick();
  afterChange();
  saveGame();
}

/* ---------------------------------------------------------------------
   The page around the stage: header, transition screens, ending
   --------------------------------------------------------------------- */

function stageLabelText() {
  if (state.gameComplete) return 'THE END — Open 24 Jam, Forever';
  if (state.stage === 1) return state.stage1Complete ? 'Stage 1 complete — Restaurant unlocked' : 'Stage 1 of 10 — I Am the Mamak Owner';
  const def = STAGES[state.stage];
  return `Stage ${state.stage} of 10 — ${def.title}${state.stageComplete ? ' (complete!)' : ''}`;
}

function renderLaterStage() {
  setText('stageLabel', stageLabelText());
  const s = state;
  const def = STAGES[s.stage];
  const showTransition = s.stageComplete && !s.gameComplete;
  setHidden('stageArea', false);
  setHidden('stageBlocks', showTransition || s.gameComplete);
  setHidden('transitionPanel', !showTransition);
  setHidden('endingPanel', !s.gameComplete);
  setHidden('stageIntro', showTransition || s.gameComplete);
  const ev = s.events.active;
  setHidden('stageAlert', !ev || isPaused());
  if (ev && typeof eventTitle === 'function') setText('stageAlert', `⚠ Challenge: ${eventTitle(ev)} — tap to see your options`);

  if (s.gameComplete) { renderEnding(); return; }
  if (showTransition) {
    const next = STAGES[s.stage + 1];
    const h = s.stageHistory[s.stageHistory.length - 1];
    setText('transitionTitle', `STAGE ${s.stage} COMPLETE — ${def.title}`);
    setText('transitionText', def.outro);
    setText('transitionStats', h ? `Time: ${formatTime(h.seconds * 1000)} · Earned: ${money(h.earned)}` : '');
    setText('transitionNext', `Next — Stage ${s.stage + 1}: ${next.title}. ${next.tagline}`);
    setText('continueButton', `Continue to Stage ${s.stage + 1} →`);
    return;
  }
  setText('stageIntroTitle', `Stage ${s.stage}: ${def.title}`);
  setText('stageIntroText', def.intro);
  renderStageView();
}

function endingText() {
  const rel = state.relationships.rahman;
  const totalSec = Math.round(state.playTimeMs / 1000);
  let rahman;
  if (rel >= 3) rahman = 'The Rahman Family were your most loyal customers from the very first roti to the very last star. Encik Rahman says it was "not bad lah". From him, that is a standing ovation.';
  else if (rel >= 0) rahman = 'The Rahman Family complained at every stage of your empire — and kept coming back. That, everyone agrees, is the true mark of a great mamak.';
  else rahman = 'The Rahman Family never quite forgave you. They still came to the end of the universe though. "Where else to go?" said Puan Rahman. Fair point.';
  return { rahman, totalSec };
}

function renderEnding() {
  const { rahman, totalSec } = endingText();
  setText('endingRahman', rahman);
  const rows = [
    ['Total play time', formatTime(totalSec * 1000)],
    ['Roti sold at the roadside stall', fmt(state.rotiSold)],
    ['Money earned (Stages 2–10)', money(state.totalEarned)],
    ['Challenges handled', String(Object.values(state.events.counts).reduce((a, b) => a + b, 0))],
    ['Rahman Family', `${typeof relationshipLabel === 'function' ? relationshipLabel(state.relationships.rahman) : ''} (${signed(state.relationships.rahman)})`],
  ];
  for (const h of state.stageHistory) rows.push([`Stage ${h.stage}: ${STAGES[h.stage] ? STAGES[h.stage].title : ''}`, formatTime(h.seconds * 1000)]);
  const box = el('endingStats');
  const sig = JSON.stringify(rows);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = '';
  for (const [k, v] of rows) { const div = makeEl('div'); div.append(makeEl('dt', '', k), makeEl('dd', '', v)); box.appendChild(div); }
}

function setupStagesUI() {
  el('stageBlocks').addEventListener('click', onStageClick);
  el('continueButton').addEventListener('click', () => { continueToNextStage(); });
  el('continueStage2').addEventListener('click', () => { continueToNextStage(); });
  el('playAgainButton').addEventListener('click', requestReset);
  el('stageAlert').addEventListener('click', () => el('challengesPanel').scrollIntoView({ block: 'start' }));
  const sel = el('devStageSelect');
  sel.innerHTML = '';
  for (let n = 1; n <= 10; n++) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = n === 1 ? '1: I Am the Mamak Owner' : `${n}: ${STAGES[n].title}`;
    sel.appendChild(opt);
  }
}

// Developer tools for stages
function devStageAction(action) {
  switch (action) {
    case 'jumpStage': {
      const n = Number(el('devStageSelect').value);
      state.gameComplete = false;
      if (n === 1) { resetGame(); return true; }
      state.stage1Complete = true;
      startStage(n);
      addLog(`[Dev] Jumped to Stage ${n}.`);
      return true;
    }
    case 'completeStage':
      if (state.stage === 1) {
        if (!state.stage1Complete) { state.rotiSold = Math.max(state.rotiSold, 500); state.levels.rotiMan = Math.max(3, state.levels.rotiMan); state.grossRevenue = Math.max(1000, state.grossRevenue); checkStage1(); }
      } else if (!state.stageComplete) {
        completeStage();
      }
      addLog('[Dev] Completed the current stage.');
      return true;
    case 'cashBig':
      state.cash += Math.max(1000, currentIncome() * 60);
      addLog('[Dev] Added 60 seconds of income.');
      return true;
    default:
      return false;
  }
}

Object.assign(window.MamakGame, { STAGES, startStage, completeStage, continueToNextStage, checkStageGoals, currentIncome, SD, mergeSaved,
  s3RivalTurn, s7HoldFestival, s8Hours, s9Strike });
