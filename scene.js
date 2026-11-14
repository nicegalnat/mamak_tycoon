'use strict';

/* =====================================================================
   MAMAK TYCOON — Pixel-art scene (Phase 1: Stage 1 roadside stall)
   ---------------------------------------------------------------------
   Everything is drawn by code onto a small 256×144 "pixel" canvas, then
   scaled up by a whole number of device pixels so it stays perfectly
   crisp on every screen. No images, no libraries.

   What you see is driven by real game data, read every frame:
     staff hired / away, griddle level, marketing, price, demand vs
     production, flour stock, hygiene, morale, reputation, closures,
     the owner being away, and the active surprise challenge.
   The game also sends small signals (MamakScene.notify) for sales,
   upgrades, deliveries and business actions, so the cook flips roti
   exactly when roti is sold.

   To give a new challenge a visual, add an entry to EVENT_VISUALS.
   ===================================================================== */

const SC = {
  W: 256, H: 144,
  fps: 12,                 // sprite animation rate (frames per second)
  maxQueue: 6,
};

/* ---------------------------------------------------------------------
   Palette — a limited night-time palette inspired by the reference
   --------------------------------------------------------------------- */
const P = {
  sky0: '#0a1430', sky1: '#10204a', sky2: '#16306a', city0: '#132650', city1: '#1a3360', city2: '#22406f',
  winY: '#f7d774', winB: '#6fd3f0', winR: '#ff8a6b', star: '#c9e6ff',
  ink: '#120d18', dark: '#1b1a24', road: '#20202c', roadLine: '#3a3a4a', curb: '#2c2c3a',
  awn0: '#1f4a2c', awn1: '#2f6b3a', awn2: '#4c8f4f', awnEdge: '#173822',
  ledBg: '#2b3a1a', ledOn: '#d8e86a', ledDim: '#5a6a2a',
  light0: '#fff2a8', light1: '#ffe066', light2: '#ffd23f', check0: '#f6b648', check1: '#f9cf5a',
  ctr0: '#6b7a2a', ctr1: '#8c9a3c', ctr2: '#b5c25a', ctrDark: '#4f5a1e',
  shelf: '#c07a2c', shelfDark: '#8a5320', sack: '#efe3c2', sackShade: '#c9b98f', sackPrint: '#c0392b',
  grill: '#2a2a30', grillHot: '#4a3a36', flameB: '#5ab4ff', flameO: '#ff9a3c', metal: '#9aa3ad', metalDark: '#5c636c',
  roti: '#f2c46b', rotiDark: '#c98b36', steam: '#fff8e8',
  neonB: '#3fa9f5', neonB2: '#a8e6ff', neonBoxB: '#0f3a66', neonR: '#ff5a36', neonR2: '#ffd0b8', neonBoxR: '#5a1a12',
  table: '#c0512c', tableDark: '#8a3a20', stoolR: '#d2552f', stoolG: '#5d6b78',
  white: '#f4f1ea', shirtShade: '#cfc8bb', apron: '#2e7d4f', apronDark: '#1f5c39', cap: '#2e7d4f',
  skin: ['#8d5524', '#c68642', '#e0ac69', '#5c3a1e', '#a8673a', '#f1c27d'],
  hair: ['#1a1410', '#2b1d14', '#3b2a1e', '#6b6b6b', '#c9c9c9'],
  cloth: ['#c0392b', '#2980b9', '#8e44ad', '#16a085', '#d35400', '#f1c40f', '#7f8c8d', '#2c3e50', '#e84393', '#27ae60'],
  pants: ['#2c3e50', '#34495e', '#4a3b2a', '#1e272e'],
  officer: '#24365c', officerDark: '#17243f', inspector: '#e8eef2', badge: '#f1c40f',
  rat: '#6b5a52', ratDark: '#3e322d', cat: '#e08a3c', catDark: '#a85a1e',
  puddle: '#8a5a2a', puddleHi: '#b37a3e', dirt: '#6b5a2a', fly: '#111111',
  smoke: '#4a4a52', smoke2: '#6c6c76', shutter: '#7d8590', shutterDark: '#5a616b', shutterLine: '#9aa2ac',
  red: '#e74c3c', green: '#2ecc71', yellow: '#f1c40f', pink: '#ff7aa8', blue: '#5ab4ff',
  lorry: '#c0392b', lorryDark: '#7a241b', glass: '#9fd3ff', wheel: '#111111',
};

/* ---------------------------------------------------------------------
   Tiny 3×5 pixel font for signs
   --------------------------------------------------------------------- */
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', '.': '000000000000010', ':': '000010000010000', '!': '010010010000010', '?': '110001010000010',
  '-': '000000111000000', '+': '000010111010000', '/': '001001010100100', ' ': '000000000000000', "'": '010010000000000',
};

/* ---------------------------------------------------------------------
   Drawing helpers (all coordinates are whole pixels on the 256×144 canvas)
   --------------------------------------------------------------------- */
let g = null;                      // 2D context of the small pixel buffer
function rect(x, y, w, h, c) { if (w <= 0 || h <= 0) return; g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); }
function px(x, y, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, 1, 1); }
function text(str, x, y, c, gap = 1) {
  str = String(str).toUpperCase();
  for (const ch of str) {
    const glyph = FONT[ch] || FONT[' '];
    for (let i = 0; i < 15; i++) if (glyph[i] === '1') px(x + (i % 3), y + Math.floor(i / 3), c);
    x += 3 + gap;
  }
}
// 2× text (6×10 per letter) for signs
function bigText(str, x, y, c) {
  for (const ch of String(str).toUpperCase()) {
    const glyph = FONT[ch] || FONT[' '];
    for (let i = 0; i < 15; i++) if (glyph[i] === '1') rect(x + (i % 3) * 2, y + Math.floor(i / 3) * 2, 2, 2, c);
    x += 7;
  }
}
function bigWidth(str) { return String(str).length * 7 - 1; }
function textWidth(str, gap = 1) { return String(str).length * (3 + gap) - gap; }
function textV(str, x, y, c, step = 7) { for (const ch of String(str).toUpperCase()) { text(ch, x, y, c); y += step; } }

// Deterministic pseudo-random numbers (so buildings don't jump around)
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

/* ---------------------------------------------------------------------
   Characters — one reusable person drawer (adults 9×20, kids 7×14)
   --------------------------------------------------------------------- */
function lookFor(seed) {
  return {
    skin: P.skin[Math.floor(hash(seed) * P.skin.length)],
    hair: P.hair[Math.floor(hash(seed + 1) * 3)],
    shirt: P.cloth[Math.floor(hash(seed + 2) * P.cloth.length)],
    pants: P.pants[Math.floor(hash(seed + 3) * P.pants.length)],
    longHair: hash(seed + 4) < 0.35,
    glasses: hash(seed + 5) < 0.15,
  };
}

// o: { skin, hair, shirt, pants, cap, apron, kid, longHair, glasses, moustache, scarf, cane, bag, sunglasses,
//      walk (frame), mood ('happy'|'sad'|'angry'|'neutral'), arms ('down'|'up'|'flip'|'hips'|'clip'), lean, hideLegs }
function person(x, y, o) {
  const kid = o.kid;
  const W = kid ? 9 : 13, HD = kid ? 7 : 9, BD = kid ? 6 : 9, LG = kid ? 6 : 9;
  const ink = P.ink;
  const hx = x + ((W - HD) >> 1);
  const by = y + HD - 1;           // body starts just under the chin
  const ly = by + BD;
  // legs & shoes (two-frame walk)
  if (!o.hideLegs) {
    const step = o.walk ? o.walk % 2 : 0;
    const lw = kid ? 2 : 3;
    const leg = (lx, len) => { rect(lx - 1, ly, lw + 2, len + 1, ink); rect(lx, ly, lw, len - 1, o.pants); rect(lx, ly + len - 1, lw + (lx > x + W / 2 ? 1 : 0), 1, P.dark); };
    leg(x + 2, LG - step);
    leg(x + W - 2 - lw, LG - 1 + step);
  }
  // torso with outline and shading
  rect(x, by, W, BD + 1, ink);
  rect(x + 1, by + 1, W - 2, BD - 1, o.shirt);
  rect(x + W - 3, by + 1, 2, BD - 1, shade(o.shirt));
  if (o.apron) {
    rect(x + 3, by + 3, W - 6, BD - 3, o.apron);
    if (!o.hideLegs) rect(x + 3, ly, W - 6, 3, o.apron);
    px(x + 3, by + 1, o.apron); px(x + W - 4, by + 1, o.apron); px(x + 3, by + 2, o.apron); px(x + W - 4, by + 2, o.apron);
  }
  if (o.collar !== false) { px(x + (W >> 1) - 1, by + 1, shade(o.shirt)); px(x + (W >> 1) + 1, by + 1, shade(o.shirt)); }
  if (o.scarf) rect(x + 1, by + 1, W - 2, 2, o.scarf);
  if (o.badge) { px(x + 3, by + 2, P.badge); px(x + 4, by + 2, P.badge); }
  // arms and hands
  const hand = o.skin;
  switch (o.arms) {
    case 'up':
      rect(x - 1, by - 5, 3, 7, ink); rect(x, by - 4, 1, 5, hand);
      rect(x + W - 2, by - 5, 3, 7, ink); rect(x + W - 1, by - 4, 1, 5, hand); break;
    case 'flip':
      rect(x + 1, by + BD - 3, 2, 2, hand);
      rect(x + W - 2, by - 5, 3, 7, ink); rect(x + W - 1, by - 4, 1, 5, hand); break;
    case 'hips':
      rect(x - 1, by + 3, 2, 3, ink); px(x - 1, by + 4, hand); rect(x + W - 1, by + 3, 2, 3, ink); px(x + W, by + 4, hand); break;
    case 'clip':
      rect(x + 2, by + 3, 7, 6, ink); rect(x + 3, by + 4, 5, 4, P.white); rect(x + 3, by + 4, 5, 1, P.metalDark); px(x + 4, by + 6, P.ink); px(x + 6, by + 6, P.ink);
      rect(x + 1, by + 5, 1, 2, hand); break;
    case 'mop':
      rect(x + W, by - 3, 1, BD + LG + 3, P.shelfDark); rect(x + W - 2, ly + LG - 2, 6, 2, P.white); rect(x + W - 2, by + 3, 2, 2, hand); break;
    default:
      rect(x + 1, by + BD - 2, 2, 2, hand); rect(x + W - 3, by + BD - 2, 2, 2, hand);
  }
  if (o.bag) { rect(x + W, by + 4, 4, 4, ink); rect(x + W + 1, by + 5, 2, 2, P.white); }
  if (o.handbag) { rect(x - 3, by + 3, 4, 4, ink); rect(x - 2, by + 4, 2, 2, P.pink); }
  if (o.cane) rect(x + W, by + 2, 1, BD + LG - 2, P.shelfDark);
  // head
  rect(hx, y, HD, HD, ink);
  rect(hx + 1, y + 1, HD - 2, HD - 2, o.skin);
  rect(hx + 1, y + 1, HD - 2, kid ? 1 : 2, o.hair);
  px(hx + 1, y + 3, o.hair); px(hx + HD - 2, y + 3, o.hair);
  if (o.longHair) { rect(hx, y + 1, 2, HD - 2, o.hair); rect(hx + HD - 2, y + 1, 2, HD - 2, o.hair); }
  if (o.hairBun) { rect(hx + 2, y - 2, HD - 4, 3, ink); rect(hx + 3, y - 1, HD - 6, 2, o.hair); }
  if (o.cap) { rect(hx - 1, y - 2, HD + 2, 4, ink); rect(hx, y - 1, HD, 2, o.cap); rect(hx, y + 1, HD, 1, shade(o.cap)); }
  if (o.officerCap) { rect(hx - 1, y - 2, HD + 2, 4, ink); rect(hx, y - 1, HD, 2, P.officer); rect(hx, y + 1, HD, 1, P.officerDark); px(hx + (HD >> 1), y - 1, P.badge); }
  // face
  const ey = y + (kid ? 3 : 4);
  const mx = hx + (HD >> 1);
  if (o.sunglasses) rect(hx + 1, ey, HD - 2, 1, ink);
  else { px(hx + 2, ey, ink); px(hx + HD - 3, ey, ink); }
  if (o.glasses && !o.sunglasses) { px(hx + 1, ey, P.metal); px(hx + HD - 2, ey, P.metal); px(mx, ey, P.metal); }
  if (o.mood === 'angry') { px(hx + 2, ey - 1, ink); px(hx + 3, ey - 1, ink); px(hx + HD - 4, ey - 1, ink); px(hx + HD - 3, ey - 1, ink); }
  if (!kid) px(mx, ey + 1, shade(o.skin));
  if (o.moustache) rect(hx + 2, ey + 2, HD - 4, 1, o.hair === P.hair[4] ? P.hair[4] : P.ink);
  const my = y + HD - 2;
  if (o.mood === 'happy') { rect(mx - 1, my, 3, 1, ink); px(mx - 2, my - 1, ink); px(mx + 2, my - 1, ink); }
  else if (o.mood === 'sad' || o.mood === 'angry') { rect(mx - 1, my - 1, 3, 1, ink); px(mx - 2, my, ink); px(mx + 2, my, ink); }
  else if (!o.moustache) rect(mx - 1, my, 3, 1, shade(o.skin));
}
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 255) * 0.75), gg = Math.floor(((n >> 8) & 255) * 0.75), b = Math.floor((n & 255) * 0.75);
  return '#' + ((1 << 24) + (r << 16) + (gg << 8) + b).toString(16).slice(1);
}

// Speech/emotion bubble above a character
function bubble(x, y, kind, t) {
  const bob = Math.floor(t * 2) % 2;
  y -= bob;
  rect(x, y, 7, 6, P.white); px(x + 2, y + 6, P.white);
  switch (kind) {
    case '!': rect(x + 3, y + 1, 1, 2, P.red); px(x + 3, y + 4, P.red); break;
    case '!!': rect(x + 2, y + 1, 1, 2, P.red); px(x + 2, y + 4, P.red); rect(x + 4, y + 1, 1, 2, P.red); px(x + 4, y + 4, P.red); break;
    case '?': px(x + 2, y + 1, P.ink); px(x + 3, y + 1, P.ink); px(x + 4, y + 2, P.ink); px(x + 3, y + 3, P.ink); px(x + 3, y + 4, P.ink); break;
    case 'heart': px(x + 2, y + 2, P.red); px(x + 4, y + 2, P.red); rect(x + 2, y + 3, 3, 1, P.red); px(x + 3, y + 4, P.red); px(x + 1, y + 2, P.red); px(x + 5, y + 2, P.red); break;
    case 'note': rect(x + 4, y + 1, 1, 3, P.ink); px(x + 3, y + 4, P.ink); px(x + 2, y + 4, P.ink); px(x + 5, y + 1, P.ink); break;
    case 'zzz': text('Z', x + 2, y, P.blue); break;
    case 'anger': px(x + 2, y + 1, P.red); px(x + 4, y + 1, P.red); px(x + 3, y + 2, P.red); px(x + 2, y + 3, P.red); px(x + 4, y + 3, P.red); break;
    case 'sweat': rect(x + 3, y + 1, 1, 3, P.blue); rect(x + 2, y + 3, 3, 1, P.blue); break;
    case 'clip': rect(x + 2, y + 1, 3, 4, P.white); rect(x + 2, y + 1, 3, 1, P.metalDark); px(x + 3, y + 3, P.ink); break;
  }
}

/* =====================================================================
   SCENE STATE (only what the animation needs — never saved)
   ===================================================================== */

const scene = {
  canvas: null, buf: null, scale: 1,
  running: false, lastFrame: 0, t: 0, frame: 0, last: 0,
  reduced: false,
  agents: [], nextId: 1, spawnTimer: 0,
  flips: [],              // { who: 'owner'|staffIndex, until }
  plates: [],             // plates on the table
  sparkles: [],           // little star effects { x, y, until, color }
  serveCooldown: 0,
  recentManual: [],       // timestamps of manual sales
  lastStaffFlip: 0,
  lorryX: null, carX: [], catX: null, catTimer: 25, flicker: 0,
  rahmanLeaving: null, wasRahman: false,
  rngSeed: 1,
};

/* ---------------------------------------------------------------------
   The model: everything the picture depends on, read from the game
   --------------------------------------------------------------------- */
function sceneModel() {
  const s = state;
  const mods = new Set(activeModifiers().map(m => m.id));
  const ev = s.events.active;
  return {
    stage: s.stage,
    complete: s.stage1Complete,
    closed: isClosed(),
    closedBy: (activeModifiers().find(m => m.closed) || {}).id || null,
    away: isOwnerAway(),
    awayBy: (activeModifiers().find(m => m.ownerAway) || {}).id || null,
    totalStaff: employees(),
    staffAway: Math.min(employees(), staffAway()),
    griddle: s.levels.griddle,
    marketing: s.levels.marketing,
    priceLevel: s.levels.price,
    price: sellingPrice(),
    rate: autoSalesRate(),
    capacity: productionCapacity(),
    demand: customerDemand(),
    stock: stockActive(),
    flour: s.biz.flour,
    flourMax: CONFIG.business.flour.storageMax,
    noFlour: stockActive() && s.biz.flour < 1,
    deliveries: s.deliveries.length,
    reputation: s.revealed.reputation ? s.biz.reputation : 55,
    hygiene: s.revealed.hygiene ? s.biz.hygiene : 80,
    morale: s.revealed.morale ? s.biz.morale : 75,
    event: ev ? ev.id : null,
    eventData: ev ? ev.data : {},
    mods,
    rahmanRel: s.relationships.rahman,
    rahmanLoyal: Boolean(s.flags.rahmanLoyal),
    gradeA: mods.has('gradeA'),
    ratIgnored: s.story.ratIgnored,
    rotiSold: s.rotiSold,
  };
}

/* =====================================================================
   EVENT VISUALS — what each surprise challenge looks like.
   Each entry can add actors/props while the challenge is waiting.
   Reuse these keys for future challenges.
   ===================================================================== */
const EVENT_VISUALS = {
  rahman:     { actors: ['rahmanFamily'], caption: 'The Rahman Family are holding up the queue!' },
  tikus:      { actors: ['rat'], caption: 'Tikus! A rat is running around the stall.' },
  tepung:     { caption: 'Tepung habis — the flour sacks are empty.' },
  dbkl:       { actors: ['officer'], caption: 'A (fictional) licensing officer is waiting with a notice.' },
  inspection: { actors: ['inspector'], caption: 'A health officer is inspecting the stall.' },
  cerewet:    { actors: ['fussyCustomer'], caption: 'A very particular customer is at the counter.' },
  wrongOrder: { actors: ['confusedCustomer'], caption: 'Wrong order! A confused customer at the counter.' },
  spill:      { props: ['puddle'], caption: 'Teh tarik spilled all over the floor.' },
  breakdown:  { props: ['smoke'], caption: 'The griddle is smoking!' },
  staffLate:  { caption: 'One Roti Man is running late.' },
  staffSick:  { caption: 'One Roti Man called in sick.' },
  moraleDrop: { props: ['grumble'], caption: 'The staff are grumbling.' },
  surge:      { caption: 'A football crowd is heading this way!' },
  lorry:      { props: ['brokenLorry'], caption: 'The supplier\'s lorry has broken down.' },
};

// Effects that continue after a decision (from the game's modifiers)
const MODIFIER_VISUALS = {
  carefulCooking: { props: ['smoke'] },
  spillClean: { props: ['puddle', 'mopping'] },
  slowDelivery: { props: ['brokenLorry'] },
  staffBreak: { props: ['breakTime'] },
  crowdDemand: {},
};

/* =====================================================================
   NOTIFICATIONS FROM THE GAME
   ===================================================================== */
function notify(type, data) {
  if (!scene.canvas) return;
  const now = scene.t;
  switch (type) {
    case 'sale':
      if (data.source === 'manual') {
        scene.recentManual.push(now);
        startFlip('owner', now);
        serveCustomer(now, true);
      } else {
        // staff made roti: one of the visible staff flips (not every single roti at high speed)
        if (now - scene.lastStaffFlip > 0.35) { scene.lastStaffFlip = now; startFlip(Math.floor(Math.random() * 4), now); }
        serveCustomer(now, false);
      }
      break;
    case 'upgrade':
      sparkleAt(data === 'griddle' ? 96 : data === 'rotiMan' ? 150 : data === 'marketing' ? 40 : 128, data === 'marketing' ? 30 : 80, P.yellow, now);
      break;
    case 'delivery':
      scene.lorryX = -40;
      break;
    case 'action':
      if (data === 'quickWipe' || data === 'deepClean') sparkleAt(128, 100, P.white, now);
      if (data === 'staffTreat') sparkleAt(150, 76, P.pink, now);
      break;
  }
}
function startFlip(who, now) { scene.flips = scene.flips.filter(f => f.who !== who); scene.flips.push({ who, start: now }); }
function flipPhase(who) {
  const f = scene.flips.find(x => x.who === who);
  if (!f) return -1;
  const p = (scene.t - f.start) / 0.5;
  return p >= 1 ? -1 : p;
}
function sparkleAt(x, y, color, now) { for (let i = 0; i < 6; i++) scene.sparkles.push({ x: x + Math.round((Math.random() - 0.5) * 16), y: y + Math.round((Math.random() - 0.5) * 10), until: now + 0.6 + Math.random() * 0.4, color }); }

/* =====================================================================
   CUSTOMERS — the queue and table reflect demand and real sales
   ===================================================================== */
const QUEUE_X = [126, 141, 156, 171, 186, 201];
const SEATS = [{ x: 3 }, { x: 19 }, { x: 35 }];
const STREET_Y = 117;   // top of standing adults (feet at y 143)
const KID_Y = 125;      // top of standing children
const STAFF_SLOTS = [{ x: 90 }, { x: 140 }, { x: 68 }, { x: 162 }];
const OWNER_X = 115;
const BEHIND_Y = 63;    // top of people standing behind the counter

function queueTarget(m) {
  if (m.closed || m.complete) return 0;
  if (m.totalStaff === 0) {
    // before automation, people queue for the owner's hand-made roti
    const recent = scene.recentManual.filter(t => scene.t - t < 6).length;
    return Math.min(4, 1 + Math.ceil(recent / 3));
  }
  // with staff: more demand = longer queue; demand above production = people waiting
  const overflow = Math.max(0, m.demand - m.capacity);
  const base = Math.min(3, Math.round(m.demand * 1.5));
  return Math.min(SC.maxQueue, Math.max(1, base + Math.round(overflow * 3)) + (m.mods.has('crowdDemand') ? 2 : 0));
}

function spawnCustomer() {
  const fromLeft = Math.random() < 0.5;
  const id = scene.nextId++;
  scene.agents.push({ id, look: lookFor(id * 7 + 3), kid: Math.random() < 0.12, x: fromLeft ? -12 : SC.W + 4, y: STREET_Y,
    state: 'toQueue', wait: 0, speed: 22 + Math.random() * 10, served: false, seat: -1, eat: 0, mood: 'neutral' });
}

function waiting() { return scene.agents.filter(a => a.state === 'queue' || a.state === 'toQueue'); }

function serveCustomer(now, manual) {
  if (now < scene.serveCooldown) return;
  const q = scene.agents.filter(a => a.state === 'queue').sort((a, b) => a.qIndex - b.qIndex);
  const a = q[0];
  if (!a) return;
  scene.serveCooldown = now + (manual ? 0.2 : 0.7);
  a.served = true;
  const rahmanTable = ['rahmanCooking', 'rahmanCake', 'rahmanCatering', 'rahmanTalk'].some(id => hasModifier(id));
  const free = rahmanTable ? -1 : SEATS.findIndex((s, i) => !scene.agents.some(o => o.seat === i) && !(state.flags.rahmanLoyal && i === 0));
  if (free >= 0) {
    a.state = 'toSeat'; a.seat = free;
  } else {
    a.state = 'leave'; a.bag = true;
  }
  a.mood = a.wait > 8 && (model ? model.reputation : 55) < 60 ? 'neutral' : 'happy';
  a.heartUntil = now + 1.2;
}

function updateAgents(dt, m) {
  // keep the queue at its target length
  const target = queueTarget(m);
  if (!scene.seeded) {
    scene.seeded = true;
    for (let i = 0; i < target; i++) { spawnCustomer(); const a = scene.agents[scene.agents.length - 1]; a.x = QUEUE_X[i]; a.state = 'queue'; }
  }
  const wanting = waiting().length;
  scene.spawnTimer -= dt;
  if (wanting < target && scene.spawnTimer <= 0) { spawnCustomer(); scene.spawnTimer = 0.8 + Math.random() * 0.8; }
  if (wanting > target + 1) { const last = waiting().pop(); if (last) { last.state = 'leave'; last.mood = 'sad'; } }

  // assign queue positions in order of arrival
  let qi = 0;
  for (const a of scene.agents) {
    if (a.state === 'queue' || a.state === 'toQueue') { a.qIndex = qi; a.tx = QUEUE_X[Math.min(qi, QUEUE_X.length - 1)]; qi++; }
  }
  for (const a of scene.agents) {
    if (a.state === 'toQueue' || a.state === 'queue') {
      const d = a.tx - a.x;
      if (Math.abs(d) > 1) { a.x += Math.sign(d) * Math.min(Math.abs(d), a.speed * dt); a.walking = true; a.state = 'toQueue'; }
      else { a.x = a.tx; a.walking = false; a.state = 'queue'; a.wait += dt; }
      // waiting too long, or the stall has a bad name → frustration
      if (a.wait > 9 || m.reputation < 30) a.mood = 'angry';
      else if (a.wait > 5) a.mood = 'sad';
      else a.mood = m.reputation >= 65 ? 'happy' : 'neutral';
      if (m.closed && a.state === 'queue') { a.state = 'leave'; a.mood = 'sad'; }
    } else if (a.state === 'toSeat') {
      const tx = SEATS[a.seat].x;
      const d = tx - a.x;
      if (Math.abs(d) > 1) { a.x += Math.sign(d) * Math.min(Math.abs(d), a.speed * dt); a.walking = true; }
      else { a.x = tx; a.walking = false; a.state = 'eat'; a.eat = 5 + Math.random() * 4; }
    } else if (a.state === 'eat') {
      a.eat -= dt;
      if (a.eat <= 0) { a.state = 'leave'; a.seat = -1; }
    } else if (a.state === 'leave') {
      a.seat = -1;
      a.walking = true;
      const dir = a.x < SC.W / 2 ? -1 : 1;
      a.x += dir * a.speed * dt;
      if (a.x < -16 || a.x > SC.W + 8) a.gone = true;
    }
  }
  scene.agents = scene.agents.filter(a => !a.gone);
}

/* =====================================================================
   DRAWING THE SCENE
   ===================================================================== */
let model = null;

function drawSky(t) {
  rect(0, 0, SC.W, 46, P.sky0);
  rect(0, 46, SC.W, 30, P.sky1);
  rect(0, 76, SC.W, 52, P.sky2);
  for (let i = 0; i < 20; i++) { const x = Math.floor(hash(i) * SC.W), y = Math.floor(hash(i + 50) * 34); if (scene.reduced || (Math.floor(t * 0.7 + i) % 9) !== 0) px(x, y, P.star); }
  // a generic city tower in the distance (left)
  rect(30, 26, 2, 62, P.city1); rect(26, 38, 10, 4, P.city1); rect(24, 41, 14, 3, P.city2); rect(30, 18, 2, 8, P.city0);
  if (Math.floor(t * 1.5) % 2 === 0) px(30, 17, P.red);
  // city silhouettes with lit windows (only the edges show around the stall)
  const blocks = [[0, 64, 14], [12, 56, 12], [36, 70, 18], [46, 60, 10], [212, 58, 14], [224, 70, 12], [236, 52, 20]];
  blocks.forEach(([x, top, w], i) => {
    rect(x, top, w, 128 - top, i % 2 ? P.city0 : P.city1);
    for (let yy = top + 3; yy < 124; yy += 5) for (let xx = x + 2; xx < x + w - 1; xx += 4) {
      const hsh = hash(xx * 13 + yy * 7);
      if (hsh < 0.35) px(xx, yy, hsh < 0.1 ? P.winB : hsh < 0.13 ? P.winR : P.winY);
    }
  });
}

function drawTraffic(dt, t) {
  // a far road behind the seating area
  rect(0, 84, 56, 5, P.road); rect(0, 84, 56, 1, P.curb);
  if (scene.reduced) return;
  if (scene.carX.length < 2 && Math.random() < dt * 0.35) scene.carX.push({ x: -12, v: 16 + Math.random() * 14, c: P.cloth[Math.floor(Math.random() * P.cloth.length)] });
  for (const car of scene.carX) {
    car.x += car.v * dt;
    const x = Math.round(car.x);
    rect(x, 85, 10, 3, car.c); rect(x + 2, 83, 5, 2, car.c); rect(x + 3, 83, 3, 1, P.glass); px(x + 9, 86, P.winY); px(x, 86, P.red);
  }
  scene.carX = scene.carX.filter(c => c.x < 60);
}

function draw24JamSign(t) {
  rect(44, 34, 12, 2, P.dark);   // mounting arm
  const flick = !scene.reduced && scene.flicker > 0 && Math.floor(t * 20) % 2 === 0;
  const on = flick ? '#1e5f99' : P.neonB;
  rect(4, 4, 42, 64, P.ink);
  rect(5, 5, 40, 62, P.neonBoxB);
  for (let y = 6; y < 66; y += 2) rect(6, y, 38, 1, flick ? P.neonBoxB : '#14507f');
  const big = (ch, x, y, s) => { const gph = FONT[ch]; for (let i = 0; i < 15; i++) if (gph[i] === '1') rect(x + (i % 3) * s, y + Math.floor(i / 3) * s, s, s, on); };
  big('2', 8, 9, 5); big('4', 27, 9, 5);
  if (!flick) { rect(7, 35, 36, 1, P.neonB2); }
  rect(9, 42, 32, 20, on);
  rect(10, 43, 30, 18, P.neonBoxB);
  const jam = (ch, x) => { const gph = FONT[ch]; for (let i = 0; i < 15; i++) if (gph[i] === '1') rect(x + (i % 3) * 2, 47 + Math.floor(i / 3) * 2, 2, 2, flick ? '#1e5f99' : P.neonB2); };
  jam('J', 13); jam('A', 21); jam('M', 29);
  if (!flick) { g.globalAlpha = 0.18; rect(2, 2, 46, 68, P.neonB); g.globalAlpha = 1; }
}

function drawVerticalSign(t, m) {
  rect(214, 44, 8, 2, P.dark);
  rect(221, 1, 22, 132, P.ink);
  rect(222, 2, 20, 130, P.neonBoxR);
  const blink = !scene.reduced && m.marketing === 0 && Math.floor(t * 3) % 13 === 0;
  for (let y = 3; y < 131; y += 3) rect(223, y, 18, 1, '#6a2216');
  const c = blink ? P.neonR : P.neonR2;
  let y = 5;
  for (const ch of 'MAMAK TYCOON') {
    if (ch === ' ') { y += 4; continue; }
    bigText(ch, 229, y, c);
    y += 11;
  }
  if (!blink) { g.globalAlpha = m.marketing >= 2 ? 0.25 : 0.15; rect(219, 0, 26, 135, P.neonR); g.globalAlpha = 1; }
}

function drawAwning(t, m) {
  rect(54, 8, 158, 3, P.awn2);
  rect(52, 11, 162, 21, P.awn1);
  for (let x = 52; x < 214; x += 10) rect(x, 11, 5, 21, P.awn0);
  rect(52, 31, 162, 2, P.awnEdge);
  for (let x = 52; x < 214; x += 6) rect(x + 1, 33, 4, 1, P.awnEdge);
  // LED price board (shows the real selling price)
  rect(66, 14, 134, 13, P.ink);
  rect(67, 15, 132, 11, P.ledBg);
  const msg = m.closed ? 'TUTUP SEKEJAP' : `ROTI CANAI RM${m.price.toFixed(2)}`;
  bigText(msg, 67 + Math.floor((132 - bigWidth(msg)) / 2), 16, m.closed ? P.red : P.ledOn);
  // bunting flags from marketing level 2+
  if (m.marketing >= 2) for (let fx = 56; fx < 210; fx += 7) { const c = P.cloth[(fx / 7) % P.cloth.length | 0]; rect(fx, 35, 4, 2, c); rect(fx + 1, 37, 2, 1, c); }
}

function drawStall(t, m) {
  // warm lit interior
  rect(56, 34, 154, 64, P.light1);
  rect(58, 36, 150, 26, P.light0);
  for (let y = 62; y < 98; y += 4) for (let x = 56; x < 210; x += 4) rect(x, y, 4, 4, ((x + y) / 4) % 2 === 0 ? P.check0 : P.check1);
  // posts
  rect(52, 32, 4, 96, P.ctrDark); rect(210, 32, 4, 96, P.ctrDark);
  // tube light
  rect(96, 39, 54, 3, P.white); rect(95, 39, 1, 3, P.ctr0); rect(150, 39, 1, 3, P.ctr0);
  g.globalAlpha = 0.25; rect(90, 42, 66, 6, P.white); g.globalAlpha = 1;
  // ceiling fan
  const fr = scene.reduced ? 0 : Math.floor(t * 8) % 3;
  rect(176, 34, 1, 5, P.ink); rect(174, 38, 5, 2, P.ink);
  const blades = [[[166, 39, 21, 1]], [[168, 38, 8, 1], [177, 40, 8, 1]], [[170, 40, 7, 1], [176, 38, 7, 1]]][fr];
  for (const b of blades) rect(b[0], b[1], b[2], b[3], P.ink);
  // menu board with the real price
  rect(60, 44, 40, 16, P.ink); rect(61, 45, 38, 14, '#2d2a26');
  text('ROTI', 63, 47, P.white); text(m.price.toFixed(2), 83, 47, P.yellow);
  text('TEH', 63, 53, P.white); text((1.2 + m.priceLevel * 0.2).toFixed(2), 83, 53, P.yellow);
  // marketing on the walls
  if (m.marketing >= 1) { rect(134, 44, 18, 16, P.ink); rect(135, 45, 16, 14, P.white); rect(136, 46, 14, 6, P.red); text('MM', 139, 53, P.ink); }
  if (m.marketing >= 3) { rect(102, 46, 12, 10, P.ink); rect(103, 47, 10, 8, P.neonB2); text('TV', 104, 49, P.ink); }
  if (m.gradeA) { rect(156, 44, 11, 11, P.ink); rect(157, 45, 9, 9, P.green); text('A', 160, 47, P.white); }
  if (m.ratIgnored > 0) { rect(170, 44, 11, 11, P.ink); rect(171, 45, 9, 9, P.white); rect(172, 46, 7, 7, P.red); rect(173, 47, 5, 5, P.white); px(175, 49, P.ratDark); }
  drawShelf(t, m);
}

function drawShelf(t, m) {
  rect(184, 52, 24, 2, P.shelf); rect(184, 74, 24, 2, P.shelf); rect(184, 52, 2, 46, P.shelfDark); rect(206, 52, 2, 46, P.shelfDark);
  // flour sacks follow the real flour stock (always full before stock tracking starts)
  const sacks = !m.stock ? 4 : m.flour <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil(m.flour / (m.flourMax / 4))));
  const spots = [[186, 62], [196, 62], [186, 84], [196, 84]];
  spots.forEach(([x, y], i) => {
    if (i < sacks) { rect(x, y - 9, 10, 12, P.ink); rect(x + 1, y - 8, 8, 10, P.sack); rect(x + 1, y + 1, 8, 1, P.sackShade); rect(x + 3, y - 5, 4, 3, P.sackPrint); rect(x + 3, y - 9, 4, 1, P.sackShade); }
    else if (m.stock) { rect(x, y, 10, 2, P.sackShade); px(x + 2, y - 1, P.sackShade); }   // empty, flattened sack
  });
  if (m.stock && m.flour > 0 && m.flour < 25 && Math.floor(t * 2) % 2) text('!', 195, 44, P.red);
}

function drawGriddle(t, m) {
  // the cooking station grows with each griddle upgrade
  const lvl = m.griddle;
  const width = 30 + Math.min(3, lvl) * 7;
  const x = 60, y = 91;
  if (lvl >= 3) { rect(x - 1, 34, width + 2, 5, P.metalDark); rect(x + 3, 39, width - 6, 2, P.metal); }   // extractor hood
  rect(x - 1, y - 1, width + 2, 6, P.ink);
  rect(x, y, width, 4, P.grill);
  rect(x + 1, y, width - 2, 1, active() ? P.grillHot : P.grill);
  if (lvl >= 1) rect(x, y + 4, width, 1, P.metal);
  if (lvl >= 2 && active() && !scene.reduced) for (let i = 0; i < width - 4; i += 3) px(x + 2 + i, y + 5, (Math.floor(t * 10) + i) % 2 ? P.flameB : P.flameO);
  // roti on the griddle; a roti hops when someone flips
  if (!m.noFlour) {
    const slots = Math.min(5, 3 + lvl);
    for (let i = 0; i < slots; i++) {
      const rx = x + 2 + i * 7;
      if (rx + 6 > x + width) break;
      const hop = flipPhase(i === 1 ? 'owner' : i === 0 ? 0 : i - 1);
      const dy = hop >= 0 ? -Math.round(Math.sin(hop * Math.PI) * 10) : 0;
      rect(rx, y - 1 + dy, 6, 2, P.roti); px(rx + 1, y - 1 + dy, P.rotiDark); px(rx + 4, y + dy, P.rotiDark);
    }
  }
  if (active() && !scene.reduced) {
    for (let i = 0; i < 4; i++) {
      const sx = x + 4 + i * 8 + Math.round(Math.sin(t * 3 + i) * 1.5);
      const sy = y - 4 - ((t * 10 + i * 5) % 14);
      px(sx, sy, P.steam); if (i % 2) px(sx + 1, sy - 1, P.steam);
    }
  }
}
function active() { return !model.closed && !model.noFlour && (model.rate > 0 || scene.recentManual.some(x => scene.t - x < 2)); }

function drawCounter(t, m) {
  rect(54, 95, 158, 3, P.ctr2);
  rect(54, 98, 158, 30, P.ctr1);
  for (let x = 58; x < 208; x += 38) { rect(x, 101, 34, 24, P.ctr0); rect(x + 2, 103, 30, 2, P.ctr2); for (let i = 4; i < 32; i += 4) rect(x + i, 108, 1, 14, P.ctrDark); }
  rect(54, 126, 158, 2, P.ctrDark);
}

function drawStaff(t, m) {
  const present = m.totalStaff - m.staffAway;
  const tired = m.morale < 40;
  for (let i = 0; i < Math.min(4, m.totalStaff); i++) {
    const s = STAFF_SLOTS[i];
    if (i >= present) { rect(s.x + 4, 78, 5, 1, P.shirtShade); rect(s.x + 5, 79, 3, 4, P.apron); continue; }   // apron on the hook: away
    const hop = flipPhase(i);
    const idle = !active() && !m.closed;
    const bob = !scene.reduced && !tired && Math.floor(t * 2 + i) % 2 === 0 ? 1 : 0;
    person(s.x, BEHIND_Y + bob, { skin: P.skin[(i + 1) % P.skin.length], hair: P.hair[i % 2], shirt: P.white, pants: P.pants[0],
      cap: i % 2 ? P.red : P.white, apron: i % 2 ? P.apronDark : P.apron, arms: hop >= 0 && hop < 0.6 ? 'flip' : idle ? 'hips' : 'down',
      mood: tired ? 'sad' : m.mods.has('comfyChair') ? 'happy' : 'neutral', moustache: i === 2, hideLegs: true });
    if (tired) bubble(s.x + 3, BEHIND_Y - 11, 'sweat', t + i);
    else if (idle && i === 0 && m.totalStaff > 0 && m.demand < m.capacity * 0.6) bubble(s.x + 3, BEHIND_Y - 11, 'zzz', t);
  }
  if (m.totalStaff > 4) { rect(176, 56, textWidth('+' + (m.totalStaff - 4)) + 2, 7, P.white); text('+' + (m.totalStaff - 4), 177, 57, P.ink); }
  if (m.event === 'moraleDrop' || m.mods.has('staffBreak')) for (let i = 0; i < Math.min(2, present); i++) bubble(STAFF_SLOTS[i].x + 3, BEHIND_Y - 11, m.mods.has('staffBreak') ? 'note' : 'anger', t + i);

  // the owner (you) — away, confused when there is no flour, flipping when you tap
  if (!m.away && !m.closed) {
    const hop = flipPhase('owner');
    const confused = m.noFlour;
    person(OWNER_X, BEHIND_Y - 1, { skin: P.skin[0], hair: P.hair[0], shirt: P.white, pants: P.pants[0], cap: P.cap, apron: P.apron, moustache: true,
      arms: hop >= 0 && hop < 0.6 ? 'flip' : confused ? 'hips' : 'down', mood: confused ? 'sad' : m.reputation >= 60 ? 'happy' : 'neutral', hideLegs: true });
    if (confused) bubble(OWNER_X + 3, BEHIND_Y - 12, '?', t);
  } else if (m.away && m.awayBy === 'dbklQueue') {
    rect(OWNER_X - 4, 72, 22, 11, P.ink); rect(OWNER_X - 3, 73, 20, 9, P.white); text('BRB', OWNER_X + 1, 75, P.ink);
  }
}

function drawSeating(t, m) {
  // people eating at the table (legs hidden behind it)
  const rahmanEating = ['rahmanCooking', 'rahmanCake', 'rahmanCatering', 'rahmanTalk'].some(id => m.mods.has(id)) && m.event !== 'rahman';
  const seated = [null, null, null];
  for (const a of scene.agents) if (a.state === 'eat' && a.seat >= 0) seated[a.seat] = a;
  for (let i = 0; i < 3; i++) {
    if (rahmanEating) person(SEATS[i].x, 91, { ...RAHMAN_LOOKS[i], kid: false, mood: rahmanMood(m), hideLegs: true, handbag: false, cane: false });
    else if (i === 0 && m.rahmanLoyal && m.event !== 'rahman') person(SEATS[0].x, 91, { ...RAHMAN_LOOKS[0], mood: 'happy', hideLegs: true });
    else if (seated[i]) person(SEATS[i].x, seated[i].kid ? 97 : 91, { ...seated[i].look, kid: seated[i].kid, mood: 'happy', hideLegs: true });
  }
  // table, plates and stools
  rect(1, 105, 52, 5, P.ink); rect(2, 106, 50, 3, P.table); rect(2, 109, 50, 1, P.tableDark);
  rect(6, 110, 2, 16, P.dark); rect(46, 110, 2, 16, P.dark);
  for (let i = 0; i < 3; i++) {
    if (seated[i] || rahmanEating || (i === 0 && m.rahmanLoyal)) { rect(SEATS[i].x + 2, 104, 9, 2, P.white); rect(SEATS[i].x + 3, 103, 7, 1, P.roti); if (!scene.reduced) px(SEATS[i].x + 6, 100 - Math.floor(t * 4) % 3, P.steam); }
  }
  if (rahmanEating || m.rahmanLoyal) { if (m.rahmanLoyal && !rahmanEating) { rect(4, 112, 22, 7, P.white); text('RSVD', 6, 113, P.red); } bubble(SEATS[0].x + 3, 80, m.rahmanLoyal ? 'heart' : rahmanMood(m) === 'angry' ? 'anger' : 'note', t); }
  [[4, P.stoolR], [20, P.stoolG], [36, P.stoolR]].forEach(([x, c]) => { rect(x, 126, 11, 3, c); rect(x + 1, 129, 2, 13, c); rect(x + 8, 129, 2, 13, c); rect(x + 3, 135, 5, 1, c); });
  // the owner joins the Rahmans at the table
  if (m.mods.has('rahmanTalk') || m.mods.has('rahmanCake')) person(50, STREET_Y, { skin: P.skin[0], hair: P.hair[0], shirt: P.white, pants: P.pants[0], cap: P.cap, apron: P.apron, moustache: true, mood: 'happy', arms: m.mods.has('rahmanCake') ? 'up' : 'down' });
}

function drawCustomers(t, m) {
  const standing = scene.agents.filter(a => a.state !== 'eat').sort((a, b) => a.x - b.x);
  for (const a of standing) {
    const top = a.kid ? KID_Y : STREET_Y;
    const x = Math.round(a.x);
    person(x, top, { ...a.look, kid: a.kid, walk: a.walking ? Math.floor(t * 8) : 0, mood: a.mood, bag: a.bag });
    if (a.state === 'queue' && a.mood === 'angry') bubble(x + 3, top - 9, 'anger', t + a.id);
    else if (a.heartUntil && t < a.heartUntil) bubble(x + 3, top - 9, (model.reputation >= 50 ? 'heart' : 'note'), t);
  }
}

/* ---- The Rahman Family ---- */
const RAHMAN_LOOKS = [
  { name: 'Encik Rahman', skin: P.skin[4], hair: P.hair[2], shirt: '#b0306a', pants: P.pants[1], moustache: true },
  { name: 'Puan Rahman', skin: P.skin[1], hair: P.hair[0], shirt: '#16a085', pants: P.pants[3], longHair: true, sunglasses: true, handbag: true },
  { name: 'Nenek', skin: P.skin[4], hair: P.hair[4], shirt: '#8e44ad', pants: P.pants[2], hairBun: true, cane: true },
  { name: 'kid1', skin: P.skin[1], hair: P.hair[1], shirt: '#f1c40f', pants: P.pants[0], kid: true },
  { name: 'kid2', skin: P.skin[4], hair: P.hair[0], shirt: '#e74c3c', pants: P.pants[1], kid: true, longHair: true },
  { name: 'kid3', skin: P.skin[1], hair: P.hair[1], shirt: '#2980b9', pants: P.pants[0], kid: true },
  { name: 'uncle', skin: P.skin[0], hair: P.hair[3], shirt: '#27ae60', pants: P.pants[0], glasses: true },
];
function rahmanMood(m) { return m.rahmanRel >= 2 ? 'happy' : m.rahmanRel <= -1 ? 'angry' : 'neutral'; }
function drawRahmanCrowd(t, m) {
  // the whole family crowds the counter and holds up the queue
  const mood = m.rahmanRel <= -1 ? 'angry' : m.rahmanRel >= 2 ? 'happy' : 'neutral';
  const order = [6, 0, 3, 1, 4, 2, 5];
  order.forEach((idx, k) => {
    const l = RAHMAN_LOOKS[idx];
    const x = 104 + k * 15;
    const jitter = !scene.reduced && Math.floor(t * 3 + k) % 4 === 0 ? -1 : 0;
    person(x, (l.kid ? KID_Y : STREET_Y) + jitter, { ...l, mood, arms: idx === 0 ? (Math.floor(t * 2) % 2 ? 'up' : 'hips') : 'down' });
  });
  bubble(122, STREET_Y - 10, '!!', t);
  bubble(152, STREET_Y - 10, '?', t + 0.5);
}

/* ---- Other challenge actors and props ---- */
function drawOfficer(t, inspector) {
  const x = 196;
  person(x, STREET_Y, { skin: P.skin[2], hair: P.hair[0], shirt: inspector ? P.inspector : P.officer, pants: inspector ? P.pants[1] : P.officerDark,
    officerCap: !inspector, badge: true, arms: 'clip', mood: 'neutral', glasses: inspector });
  bubble(x + 3, STREET_Y - 11, 'clip', t);
}
function drawRat(t) {
  const span = 140;
  const p = (t * 0.45) % 2;
  const dir = p < 1 ? 1 : -1;
  const x = 58 + Math.round((p < 1 ? p : 2 - p) * span);
  const y = 135;
  rect(x - 1, y - 2, 11, 6, P.ink);
  rect(x, y - 1, 9, 4, P.rat);
  rect(x + (dir > 0 ? 6 : 1), y - 2, 2, 1, P.rat);                       // ear
  px(x + (dir > 0 ? 7 : 1), y, P.ink);                                  // eye
  px(x + (dir > 0 ? 9 : -1), y + 1, P.pink);                            // nose
  rect(x + (dir > 0 ? -5 : 10), y + 2, 5, 1, P.ratDark);                // tail
  if (Math.floor(t * 12) % 2) { px(x + 1, y + 3, P.ratDark); px(x + 6, y + 3, P.ratDark); }
}
function drawPuddle(t, mopping) {
  rect(104, 138, 24, 2, P.puddle); rect(108, 137, 16, 1, P.puddle); px(110, 138, P.puddleHi); px(118, 137, P.puddleHi);
  if (mopping) person(92, STREET_Y, { skin: P.skin[2], hair: P.hair[0], shirt: P.white, pants: P.pants[0], cap: P.white, apron: P.apron, arms: 'mop', walk: Math.floor(t * 4) });
}
function drawSmoke(t) {
  for (let i = 0; i < 6; i++) {
    const sx = 62 + i * 6 + Math.round(Math.sin(t * 2 + i) * 2);
    const sy = 86 - ((t * 8 + i * 6) % 34);
    rect(sx, sy, 4, 3, i % 2 ? P.smoke : P.smoke2);
  }
}
function drawBrokenLorry(t) {
  const x = 4, y = 77;
  rect(x, y, 18, 8, P.lorry); rect(x + 18, y + 2, 7, 6, P.lorryDark); rect(x + 19, y + 3, 4, 2, P.glass);
  rect(x + 2, y + 8, 4, 2, P.wheel); rect(x + 17, y + 8, 4, 2, P.wheel);
  if (!scene.reduced) for (let i = 0; i < 3; i++) px(x + 22 + i, y - 2 - ((t * 6 + i * 2) % 7), P.smoke2);
}
function drawDeliveryLorry(dt) {
  if (scene.lorryX === null) return;
  scene.lorryX += 45 * dt;
  const x = Math.round(scene.lorryX), y = 124;
  rect(x - 1, y - 1, 38, 15, P.ink);
  rect(x, y, 26, 11, P.lorry); rect(x + 26, y + 3, 10, 8, P.lorryDark); rect(x + 28, y + 4, 6, 3, P.glass);
  text('TEPUNG', x + 2, y + 3, P.white);
  rect(x + 3, y + 11, 5, 3, P.wheel); rect(x + 26, y + 11, 5, 3, P.wheel);
  if (scene.lorryX > SC.W + 10) scene.lorryX = null;
}
function drawShutter(m) {
  rect(56, 34, 154, 61, P.shutter);
  for (let y = 36; y < 95; y += 4) { rect(56, y, 154, 1, P.shutterLine); rect(56, y + 2, 154, 1, P.shutterDark); }
  const words = { deepCleanClosure: 'CUCI', dbklClosure: 'DITUTUP', inspectionClosure: 'TUTUP SEMENTARA', diyRepair: 'BAIKI' };
  const msg = words[m.closedBy] || 'TUTUP';
  const w = textWidth(msg) + 8;
  rect(133 - (w >> 1) - 1, 57, w + 2, 13, P.ink); rect(133 - (w >> 1), 58, w, 11, P.white); text(msg, 137 - (w >> 1), 61, P.red);
  if (m.closedBy === 'dbklClosure') for (let x = 56; x < 210; x += 8) { rect(x, 80, 4, 2, P.yellow); rect(x + 4, 80, 4, 2, P.ink); }
  if (m.closedBy === 'deepCleanClosure' && !scene.reduced) for (let i = 0; i < 8; i++) { const bx = 70 + i * 17, byy = 90 - ((scene.t * 12 + i * 9) % 50); rect(bx, byy, 2, 2, P.white); }
}
function drawDirt(t, m) {
  if (m.hygiene >= 50) return;
  const spots = Math.round((50 - m.hygiene) / 6);
  for (let i = 0; i < spots; i++) { const x = 60 + Math.floor(hash(i + 9) * 145), y = 99 + Math.floor(hash(i + 19) * 26); rect(x, y, 2, 1, P.dirt); px(x + 1, y + 1, P.dirt); }
  if (m.hygiene < 35 && !scene.reduced) for (let i = 0; i < 3; i++) px(80 + i * 34 + Math.round(Math.sin(t * 9 + i) * 4), 66 + Math.round(Math.cos(t * 7 + i) * 3), P.fly);
}
function drawCat(dt, t) {
  if (scene.reduced) return;
  scene.catTimer -= dt;
  if (scene.catX === null && scene.catTimer <= 0) { scene.catX = SC.W + 4; scene.catTimer = 35 + Math.random() * 40; }
  if (scene.catX === null) return;
  scene.catX -= 14 * dt;
  const x = Math.round(scene.catX), y = 137;
  rect(x - 3, y - 4, 13, 8, P.ink);
  rect(x, y - 1, 8, 4, P.cat); rect(x - 2, y - 3, 4, 4, P.cat); px(x - 2, y - 4, P.cat); px(x + 1, y - 4, P.cat); px(x - 1, y - 2, P.ink);
  rect(x + 8, y - 3, 1, 3, P.catDark); rect(x + 2, y, 4, 1, P.catDark);
  const step = Math.floor(t * 8) % 2;
  px(x + (step ? 1 : 0), y + 3, P.catDark); px(x + 6 + (step ? 0 : 1), y + 3, P.catDark);
  if (scene.catX < -14) scene.catX = null;
}
function drawStreet() {
  rect(0, 128, SC.W, 16, P.road);
  rect(0, 128, SC.W, 1, P.curb);
  for (let x = 4; x < SC.W; x += 22) rect(x, 142, 11, 1, P.roadLine);
  g.globalAlpha = model.closed ? 0.04 : 0.14; rect(52, 128, 162, 12, P.light1); g.globalAlpha = 1;
}
function drawSparkles(t) {
  scene.sparkles = scene.sparkles.filter(s => s.until > t);
  for (const s of scene.sparkles) { const k = Math.floor((s.until - t) * 10) % 2; px(s.x, s.y, s.color); if (k) { px(s.x - 1, s.y, s.color); px(s.x + 1, s.y, s.color); px(s.x, s.y - 1, s.color); px(s.x, s.y + 1, s.color); } }
}
function drawVictory(t) {
  if (!scene.reduced) for (let i = 0; i < 30; i++) {
    const x = Math.floor(hash(i + 3) * SC.W);
    const y = Math.floor(((t * 20 + hash(i) * 144) % 150));
    rect(x, y, 2, 1, P.cloth[i % P.cloth.length]);
  }
  rect(70, 46, 126, 16, P.ink); rect(71, 47, 124, 14, P.awn1); text('BUKA KEDAI! STAGE 1 DONE', 82, 52, P.yellow);
}

/* =====================================================================
   MAIN DRAW + LOOP
   ===================================================================== */
function drawScene(dt) {
  const t = scene.t;
  const m = model;
  drawSky(t);
  drawTraffic(dt, t);
  drawStall(t, m);
  drawStaff(t, m);
  drawGriddle(t, m);
  drawCounter(t, m);
  if (m.closed) drawShutter(m);
  drawAwning(t, m);
  draw24JamSign(t);
  drawVerticalSign(t, m);
  drawStreet();
  drawDirt(t, m);

  // challenge visuals (reusable mapping)
  const props = new Set();
  const actors = new Set();
  const ev = m.event && EVENT_VISUALS[m.event];
  if (ev) { (ev.props || []).forEach(p => props.add(p)); (ev.actors || []).forEach(a => actors.add(a)); }
  for (const id of m.mods) { const mv = MODIFIER_VISUALS[id]; if (mv) (mv.props || []).forEach(p => props.add(p)); }
  if (m.ratIgnored > 0 && !scene.reduced && Math.floor(t / 6) % 5 === 0) actors.add('rat');   // ignored rats keep coming back
  if (m.closedBy === 'dbklClosure') actors.add('officer');

  if (props.has('brokenLorry')) drawBrokenLorry(t);
  if (props.has('smoke')) drawSmoke(t);
  drawSeating(t, m);
  if (props.has('puddle')) drawPuddle(t, props.has('mopping'));
  if (actors.has('rahmanFamily')) drawRahmanCrowd(t, m);
  else drawCustomers(t, m);
  if (actors.has('officer')) drawOfficer(t, false);
  if (actors.has('inspector')) drawOfficer(t, true);
  if (actors.has('fussyCustomer')) { person(126, STREET_Y, { ...lookFor(77), mood: 'angry', arms: 'hips' }); bubble(129, STREET_Y - 11, '!', t); }
  if (actors.has('confusedCustomer')) { person(126, STREET_Y, { ...lookFor(91), mood: 'sad', arms: 'down' }); bubble(129, STREET_Y - 11, '?', t); }
  if (actors.has('rat')) drawRat(t);
  drawDeliveryLorry(dt);
  drawCat(dt, t);
  drawSparkles(t);
  if (m.complete) drawVictory(t);
}

function sceneCaption(m) {
  if (m.complete) return 'Stage 1 complete! The stall is the neighbourhood\'s favourite mamak.';
  const parts = [];
  const ev = m.event && EVENT_VISUALS[m.event];
  if (ev && ev.caption) parts.push(ev.caption);
  if (m.closed) parts.push('The stall is closed for now.');
  const q = scene.agents.filter(a => a.state === 'queue').length;
  const eating = scene.agents.filter(a => a.state === 'eat').length;
  const staff = m.totalStaff - m.staffAway;
  parts.push(`${q} waiting · ${eating} eating · ${staff} Roti ${staff === 1 ? 'Man' : 'Men'} working${m.staffAway ? ` (${m.staffAway} away)` : ''}`);
  if (m.noFlour) parts.push('No flour: cooking has stopped.');
  else if (m.stock && m.flour < 25) parts.push('Flour is running low.');
  if (m.totalStaff > 0 && m.demand > m.capacity * 1.05) parts.push('Customers are waiting: production is the limit.');
  else if (m.totalStaff > 0 && m.capacity > m.demand * 1.4) parts.push('Staff are idle: more customers needed.');
  if (m.hygiene < 35) parts.push('The stall looks dirty.');
  if (m.morale < 40) parts.push('The staff look exhausted.');
  return parts.join(' ');
}

function frame(now) {
  if (!scene.running) return;
  requestAnimationFrame(frame);
  const interval = 1000 / (scene.reduced ? 6 : SC.fps);
  if (now - scene.lastFrame < interval) return;
  const dt = Math.min(0.5, (now - (scene.lastFrame || now)) / 1000);
  scene.lastFrame = now;
  scene.t += dt;
  step(dt);
}

// One update + draw of the scene (also used by automated tests)
function step(dt) {
  if (typeof state === 'undefined' || state.stage !== 1) return;
  model = sceneModel();
  scene.recentManual = scene.recentManual.filter(x => scene.t - x < 8);
  if (!scene.reduced && Math.random() < dt * 0.15) scene.flicker = 0.6;
  scene.flicker = Math.max(0, scene.flicker - dt);
  updateAgents(dt, model);
  g = scene.buf.getContext('2d');
  drawScene(dt);
  // copy the small buffer onto the visible canvas, scaled with sharp pixels
  const out = scene.canvas.getContext('2d');
  out.imageSmoothingEnabled = false;
  out.drawImage(scene.buf, 0, 0, scene.canvas.width, scene.canvas.height);
  const cap = sceneCaption(model);
  const capEl = document.getElementById('sceneCaption');
  if (capEl && capEl.textContent !== cap) { capEl.textContent = cap; scene.canvas.setAttribute('aria-label', 'Your mamak stall: ' + cap); }
}

// Picks the largest whole-number scale that fits, in real device pixels
function resizeScene() {
  if (!scene.canvas) return;
  const wrap = scene.canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const availW = wrap.clientWidth;
  const maxH = Math.max(160, window.innerHeight * (window.innerWidth >= 960 ? 0.7 : 0.42));
  const fit = Math.min(availW * dpr / SC.W, maxH * dpr / SC.H);
  // Whole-number scaling keeps every pixel identical. On high-density phone/tablet screens
  // (3+ device pixels per art pixel) a fractional scale is invisible, so fill the width there.
  const scale = dpr >= 2 && fit >= 3 ? Math.floor(fit * 4) / 4 : Math.max(1, Math.floor(fit));
  scene.scale = scale;
  scene.canvas.width = Math.round(SC.W * scale);
  scene.canvas.height = Math.round(SC.H * scale);
  scene.canvas.style.width = (Math.round(SC.W * scale) / dpr) + 'px';
  scene.canvas.style.height = (Math.round(SC.H * scale) / dpr) + 'px';
}

function setupScene() {
  scene.canvas = document.getElementById('sceneCanvas');
  if (!scene.canvas || !scene.canvas.getContext) return;
  scene.buf = document.createElement('canvas');
  scene.buf.width = SC.W; scene.buf.height = SC.H;
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  scene.reduced = Boolean(mq && mq.matches);
  if (mq && mq.addEventListener) mq.addEventListener('change', e => { scene.reduced = e.matches; });
  resizeScene();
  if (window.ResizeObserver) new ResizeObserver(resizeScene).observe(scene.canvas.parentElement);
  window.addEventListener('resize', resizeScene);
  scene.running = true;
  requestAnimationFrame(frame);
}

window.MamakScene = { notify, step, setup: setupScene, resize: resizeScene, get scene() { return scene; }, sceneModel, sceneCaption, EVENT_VISUALS };
document.addEventListener('DOMContentLoaded', setupScene);
