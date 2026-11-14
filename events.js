'use strict';

/* =====================================================================
   MAMAK TYCOON — Challenges & Events system (v0.2)
   ---------------------------------------------------------------------
   How it works
   - Only ONE challenge can be waiting at a time, and there is always a
     quiet period after each one, so the player is never flooded.
   - Story events (Rahman Family, Tikus!, Tepung Habis, DBKL, Health
     Inspection) happen at progress milestones.
   - Small and medium challenges happen at random, with chances and
     cooldowns you can change below.
   - Every challenge has choices. Small/medium ones decide themselves
     (with a mild penalty) if ignored. Major ones have a deadline.

   To add a new event: copy one of the entries in EVENTS below.
   Fields you can use:
     title, tier ('small'|'medium'|'major'), stage (1, 2, 3)
     weight         — chance of being picked among random events (number or function)
     cooldownSec    — minimum time before this event can happen again
     requires()     — return true when the event is allowed to happen
     milestone()    — story events: return true when it should start
     timeoutSec     — seconds before it auto-resolves (null = never)
     whileActive    — effect while the player hasn't decided yet
     onStart(ev), text(ev), choices(ev), onTimeout(ev), onFinish(ev)
   A choice can have: id, label, cost, effects, text, detail,
     requires() (return a reason string to block it), apply(ev), keepOpen
   Effects: { rep, hygiene, morale, flour, rel, sell, fine, cash, modifier }
   ===================================================================== */

const EVENT_CONFIG = {
  enabled: true,
  checkEverySec: 5,           // how often the game rolls for a new challenge
  quietTimeSec: 30,           // calm period after any challenge ends
  randomStartRoti: 80,        // random challenges only start after this many roti...
  randomNeedsEmployees: 1,    // ...and once you have staff
  tiers: {
    small: { label: 'Small', chancePerCheck: 0.12, timeoutSec: 30 },
    medium: { label: 'Medium', chancePerCheck: 0.05, timeoutSec: 90 },
    major: { label: 'Major', chancePerCheck: 0, timeoutSec: 150 },   // majors are milestone-only
  },
  // Costs get bigger in later stages (Stage 2 and 3 are not built yet).
  stageCostMultiplier: { 1: 1, 2: 5, 3: 25 },
  choiceLockMs: 700,          // ignore taps for a moment after deciding (no accidental double choice)
  recentOutcomes: 4,

  // Story milestones for Stage 1
  milestones: {
    tikusAtRoti: 120,
    tepungAtRoti: 220,
    dbklAtRoti: 300,
    dbklNeedsEmployees: 2,
    inspectionAtRoti: 420,
  },

  rahman: {
    visits: [{ minRoti: 40 }, { minRoti: 200 }, { minRoti: 380 }],  // Stage 1 visits
    minGapSec: 60,            // at least this long between visits
    returnAfterRoti: 40,      // "come back later" → they return after this many more roti
    loyalAt: 3,               // relationship needed to become loyal regulars
    loyalDemandBonus: 1.1,    // permanent demand bonus for loyal regulars
  },
};

let rng = Math.random;        // replaced in automated tests
function rand() { return rng(); }

function currentStage() { return 1; }  // Stage 2/3 will change this

function scaleCost(base) {
  return Math.ceil(base * (EVENT_CONFIG.stageCostMultiplier[currentStage()] || 1));
}

function eventCount(id) { return state.events.counts[id] || 0; }

const STAFF_NAMES = ['Ravi', 'Ah Seng', 'Muthu', 'Faizal', 'Kumar', 'Arif', 'Raju', 'Hafiz'];
function staffName(i) {
  if (employees() === 0) return 'your helper';
  return STAFF_NAMES[i % Math.min(employees(), STAFF_NAMES.length)];
}

/* =====================================================================
   RELATIONSHIPS
   ===================================================================== */

function changeRelationship(who, amount) {
  state.relationships[who] = clamp((state.relationships[who] || 0) + amount, -5, 5);
}

function relationshipLabel(v) {
  if (v >= 3) return 'Loyal regulars';
  if (v >= 1) return 'Friendly';
  if (v === 0) return 'Neutral';
  if (v >= -2) return 'Annoyed';
  return 'Furious';
}

/* =====================================================================
   EFFECTS — apply an effects object, or describe it for a button
   ===================================================================== */

function describeModifier(m) {
  const dur = m.sec == null ? ' (permanent)' : ` for ${m.sec}s`;
  if (m.closed) return `Stall closed${dur}`;
  const parts = [];
  if (m.ownerAway) parts.push('You are away from the counter (staff keep selling)');
  if (m.staffAway) parts.push(`${m.staffAway} Roti Man away`);
  if (m.productionMult && m.productionMult !== 1) parts.push(`Production ${pctChange(m.productionMult)}`);
  if (m.demandMult && m.demandMult !== 1) parts.push(`Demand ${pctChange(m.demandMult)}`);
  if (m.deliveryMult && m.deliveryMult !== 1) parts.push(`Flour deliveries take ×${m.deliveryMult} longer`);
  return parts.join(', ') + dur;
}

// Describes a modifier's effect without the duration.
function describeEffectOnly(m) {
  return describeModifier({ ...m, sec: null }).replace(' (permanent)', '');
}

function pctChange(mult) {
  const p = Math.round((mult - 1) * 100);
  return (p >= 0 ? '+' : '−') + Math.abs(p) + '%';
}

function effectLines(fx, apply) {
  const lines = [];
  if (!fx) return lines;
  if (fx.modifier) {
    if (apply) addModifier(fx.modifier);
    lines.push(describeModifier(fx.modifier));
  }
  if (fx.sell) {
    if (apply) {
      const r = sellRoti(fx.sell, 'event');
      if (r.count === 0) lines.push('No flour to make the order!');
      else lines.push(`Sold ${r.count} roti (+${money(r.cash)})` + (r.count < fx.sell ? ` — only enough flour for ${r.count}` : ''));
    } else {
      lines.push(`Big order: sell ${fx.sell} roti at once`);
    }
  }
  if (fx.cash) {
    if (apply) state.cash = roundMoney(state.cash + fx.cash);
    lines.push(`+${money(fx.cash)}`);
  }
  if (fx.fine) {
    if (apply) lines.push(`Fine paid: ${money(spend(fx.fine, true))}`);
    else lines.push(`Fine up to ${money(fx.fine)}`);
  }
  const stats = [['rep', 'reputation', 'Reputation'], ['hygiene', 'hygiene', 'Hygiene'], ['morale', 'morale', 'Morale']];
  for (const [key, stat, label] of stats) {
    if (fx[key]) {
      if (apply) changeStat(stat, fx[key]);
      lines.push(`${label} ${signed(fx[key])}`);
    }
  }
  if (fx.flour) {
    if (apply) { revealStock(); addFlour(fx.flour); }
    lines.push(`+${fx.flour} flour`);
  }
  if (fx.rel) {
    if (apply) changeRelationship('rahman', fx.rel);
    lines.push(`Rahman family ${signed(fx.rel)}`);
  }
  return lines;
}

/* =====================================================================
   THE EVENTS
   ===================================================================== */

const EVENTS = {

  /* ------------------------------------------------------------------
     EVENT 1 — THE RAHMAN FAMILY (recurring story characters)
     ------------------------------------------------------------------ */
  rahman: {
    title: 'The Rahman Family',
    tier: 'medium',
    stage: 1,
    timeoutSec: 90,
    whileActive: { label: 'Rahman family holding up the queue', demandMult: 0.5 },
    milestone: () => {
      const cfg = EVENT_CONFIG.rahman;
      const next = cfg.visits[eventCount('rahman')];
      if (!next) return false;
      if (gameTime() - state.story.lastRahmanAt < cfg.minGapSec) return false;
      const ret = state.story.rahmanReturnRoti;
      const due = ret != null ? Math.min(next.minRoti, ret) : next.minRoti;
      return state.rotiSold >= due;
    },
    onStart(ev) {
      ev.data.visit = (eventCount('rahman') % EVENT_CONFIG.rahman.visits.length) + 1;
      ev.data.returning = state.story.rahmanReturnRoti != null;
      state.story.rahmanReturnRoti = null;
      const rel = state.relationships.rahman;
      if (ev.data.visit === 2) ev.data.variant = rel >= 1 ? 'birthday' : 'discount';
      if (ev.data.visit === 3) ev.data.variant = rel >= 2 ? 'catering' : 'complaints';
      state.revealed.rahman = true;
      revealStat('reputation');
    },
    text(ev) {
      const back = ev.data.returning ? 'The Rahmans are back, as promised. Encik Rahman taps his watch meaningfully. ' : '';
      if (ev.data.visit === 1) {
        return 'A silver Alza pulls up. The Rahman Family — Encik Rahman, Puan Rahman, Nenek and four kids — take over two tables. ' +
          'Roti kosong "crispy but soft", roti telur without the yolk, roti bom cut into exactly nine pieces, ' +
          'and three teh tarik at three different sweetness levels. The queue behind them is getting long…';
      }
      if (ev.data.variant === 'birthday') {
        return back + 'The Rahmans return with TWELVE relatives for Nenek\'s 80th birthday. ' +
          'Puan Rahman asks if you can make a "roti cake" with candles. Nenek is already clapping.';
      }
      if (ev.data.variant === 'discount') {
        return back + 'Puan Rahman is back and unimpressed. "Last time ah, the service…" ' +
          'She wants 10 roti at half price "for last time", and the fan pointed only at her table.';
      }
      if (ev.data.variant === 'catering') {
        return back + 'Encik Rahman shakes your hand. "Boss, my daughter\'s kenduri is this Saturday. ' +
          'I want 40 roti canai. Only you can do it." This is your first catering order!';
      }
      return back + 'The Rahmans are here again, and Encik Rahman is complaining about everything: the WiFi password, ' +
        'the sugar in his teh, the TV channel, the plastic chairs. The whole stall can hear.';
    },
    choices(ev) {
      if (ev.data.visit === 1) {
        return [
          { id: 'proper', label: 'Serve them properly',
            effects: { modifier: { id: 'rahmanCooking', label: 'Kitchen busy with the Rahman order', sec: 15, productionMult: 0.3 }, sell: 8, rep: 4, rel: 2 },
            text: 'You take your time. Nenek says it is the best roti she has had since 1979.' },
          { id: 'rush', label: 'Rush their order',
            detail: 'Big order: sell 8 roti now · 50% chance it goes wrong (Reputation −6, Rahman family −2)',
            apply: () => (rand() < 0.5
              ? { text: 'Nenek\'s roti is raw in the middle. Puan Rahman takes a photo "for the family group".', effects: { sell: 8, rep: -6, rel: -2 } }
              : { text: 'Somehow you pull it off. Encik Rahman nods approvingly.', effects: { sell: 8, rep: 1 } }) },
          { id: 'later', label: 'Ask them to come back later',
            detail: 'Queue moves again · Reputation −1 · Rahman family −1 · They will return soon (and remember this)',
            apply: () => {
              state.story.rahmanReturnRoti = state.rotiSold + EVENT_CONFIG.rahman.returnAfterRoti;
              return { text: '"We will come back," says Encik Rahman. It sounds like a warning.', effects: { rep: -1, rel: -1 } };
            } },
        ];
      }
      if (ev.data.variant === 'birthday') {
        return [
          { id: 'cake', label: 'Make the roti cake and sing', cost: scaleCost(10),
            effects: { modifier: { id: 'rahmanCake', label: 'Singing for Nenek', sec: 12, ownerAway: true, productionMult: 0.5 }, sell: 12, rep: 6, rel: 2 },
            text: 'Your staff sing Allah Selamatkan Kamu. The video goes round every family WhatsApp group.' },
          { id: 'normal', label: 'Serve them normally',
            effects: { sell: 12, rep: 1 },
            text: 'A good, normal meal. Nenek blows out an imaginary candle anyway.' },
          { id: 'decline', label: 'Politely decline the cake idea',
            effects: { sell: 12, rel: -1 },
            text: 'Puan Rahman sighs loudly. "Never mind lah."' },
        ];
      }
      if (ev.data.variant === 'discount') {
        return [
          { id: 'discount', label: 'Apologise and give the discount',
            detail: 'Big order: sell 10 roti, but give back half the profit · Reputation +2 · Rahman family +2',
            apply: () => {
              const before = state.cash;
              const r = sellRoti(10, 'event');
              const refund = roundMoney((state.cash - before) / 2);
              state.cash = roundMoney(state.cash - refund);
              state.challengeSpending = roundMoney(state.challengeSpending + refund);
              return { text: `You sold ${r.count} roti and gave back ${money(refund)}. Puan Rahman almost smiles.`, effects: { rep: 2, rel: 2 } };
            } },
          { id: 'normalPrice', label: 'Serve at the normal price',
            detail: 'Big order: sell 10 roti · Rahman family −1 · 50% chance of a 1-star review (Reputation −5)',
            apply: () => (rand() < 0.5
              ? { text: 'That night: a 1-star review titled "Roti OK, attitude NOT OK".', effects: { sell: 10, rel: -1, rep: -5 } }
              : { text: 'Puan Rahman grumbles but pays in full.', effects: { sell: 10, rel: -1 } }) },
          { id: 'leave', label: 'Ask them to leave',
            effects: { rep: -3, rel: -2 },
            text: 'A dramatic exit. Half the stall films it.' },
        ];
      }
      if (ev.data.variant === 'catering') {
        return [
          { id: 'cater', label: 'Accept and do it properly', requires: needFlour(40),
            effects: { modifier: { id: 'rahmanCatering', label: 'Kitchen busy with the kenduri order', sec: 25, productionMult: 0.2 }, sell: 40, rel: 2, rep: 3 },
            text: 'Forty perfect roti, packed in neat rows. The kenduri guests ask who made them.' },
          { id: 'rushCater', label: 'Accept, but rush it', requires: needFlour(40),
            detail: 'Production −80% for 10s · Big order: sell 40 roti · 40% chance they go soggy (Reputation −4, Rahman family −2)',
            apply: () => (rand() < 0.4
              ? { text: 'The roti went soggy in the van. Encik Rahman calls you. Twice.', effects: { modifier: { id: 'rahmanCatering', label: 'Kitchen busy with the kenduri order', sec: 10, productionMult: 0.2 }, sell: 40, rep: -4, rel: -2 } }
              : { text: 'Fast AND good. Encik Rahman is impressed.', effects: { modifier: { id: 'rahmanCatering', label: 'Kitchen busy with the kenduri order', sec: 10, productionMult: 0.2 }, sell: 40, rel: 1 } }) },
          { id: 'declineCater', label: 'Decline politely',
            effects: { rel: -1 },
            text: '"Aiya, OK. Next time ya." He looks a bit hurt.' },
        ];
      }
      return [
        { id: 'listen', label: 'Sit down and listen (free teh tarik)', cost: scaleCost(5),
          effects: { modifier: { id: 'rahmanTalk', label: 'Listening to Encik Rahman', sec: 12, ownerAway: true }, rel: 3, rep: 2 },
          text: 'After 15 minutes about his knee and his son-in-law, Encik Rahman laughs. "OK lah boss, you are a good man."' },
        { id: 'tv', label: 'Switch the TV to his channel and hope',
          detail: '50% chance: Rahman family +1, or Reputation −3',
          apply: () => (rand() < 0.5
            ? { text: 'It is his favourite drama. Peace returns.', effects: { rel: 1 } }
            : { text: 'Wrong channel. Now the other customers are complaining too.', effects: { rep: -3 } }) },
        { id: 'ban', label: 'Ban them (very dramatic)',
          effects: { rel: -3, rep: -5, morale: 5 },
          text: 'Your staff quietly cheer. The neighbourhood will talk about this for weeks.' },
      ];
    },
    timeoutText: () => 'they give up and leave (Reputation −4, Rahman family −2)',
    onTimeout: () => ({ text: 'Nobody served them. The Rahmans leave, very loudly.', effects: { rep: -4, rel: -2 } }),
    onFinish() {
      state.story.lastRahmanAt = gameTime();
      const cfg = EVENT_CONFIG.rahman;
      if (state.relationships.rahman >= cfg.loyalAt && !state.flags.rahmanLoyal) {
        state.flags.rahmanLoyal = true;
        addModifier({ id: 'rahmanLoyal', label: 'Rahman family are loyal regulars', sec: null, demandMult: cfg.loyalDemandBonus });
        addLog('The Rahman family now tell everyone about your stall. Loyal regulars: demand +10% (permanent).');
      }
      if (state.relationships.rahman < cfg.loyalAt && state.flags.rahmanLoyal) {
        state.flags.rahmanLoyal = false;
        state.modifiers = state.modifiers.filter(m => m.id !== 'rahmanLoyal');
        addLog('The Rahman family are no longer your loyal regulars.');
      }
    },
  },

  /* ------------------------------------------------------------------
     EVENT 2 — TIKUS!
     ------------------------------------------------------------------ */
  tikus: {
    title: ev => (ev.data.repeat ? 'Tikus! (again)' : 'Tikus!'),
    tier: 'medium',
    stage: 1,
    timeoutSec: 90,
    cooldownSec: 150,
    // Random after the first time; more likely when hygiene is low or rats were ignored.
    weight: () => (1 + Math.max(0, (70 - state.biz.hygiene) / 25)) * (1 + state.story.ratIgnored),
    requires: () => eventCount('tikus') >= 1,
    milestone: () => eventCount('tikus') === 0 && state.rotiSold >= EVENT_CONFIG.milestones.tikusAtRoti && employees() >= 1,
    whileActive: { label: 'Customers saw a rat', demandMult: 0.8 },
    onStart(ev) {
      ev.data.repeat = state.story.ratIgnored > 0;
      revealStat('hygiene');
    },
    onActiveTick(ev, dt) { changeStat('hygiene', -dt / 6); },   // hygiene keeps falling until you act
    text(ev) {
      if (ev.data.repeat) {
        return 'The rat is back — and it brought friends. A customer stands on her chair. ' +
          'This is what happens when rat problems are ignored. Hygiene keeps falling until you act.';
      }
      return 'A rat darts across the floor behind the drinks counter. The lady at table 2 puts down her roti very, very slowly. ' +
        'Hygiene keeps falling until you act.';
    },
    choices() {
      const ignored = state.story.ratIgnored;
      return [
        { id: 'pest', label: 'Call pest control', cost: scaleCost(40 + 20 * ignored),
          effects: { hygiene: 20, rep: 1 },
          apply: () => { state.story.ratIgnored = 0; return {}; },
          text: 'Abang Pest Control sets traps and seals the drain. Problem solved properly.' },
        { id: 'clean', label: 'Close for a deep clean',
          effects: { modifier: { id: 'deepCleanClosure', label: 'Deep cleaning', sec: 30, closed: true }, hygiene: 35 },
          apply: () => { state.story.ratIgnored = 0; return {}; },
          text: 'You close up and scrub everything. You find where the rat was getting in, and block it.' },
        { id: 'ignore', label: 'Ignore it',
          detail: 'Free · Hygiene −10 · Rats come back more often, and the health inspector will be stricter' +
            (ignored >= 1 ? ' · Customers WILL post about it (Reputation −10)' : ''),
          apply: () => ignoreRat() },
      ];
    },
    timeoutText: () => 'the rat problem is ignored (Hygiene −10, rats return more often)',
    onTimeout: () => ignoreRat(),
  },

  /* ------------------------------------------------------------------
     EVENT 3 — TEPUNG HABIS (introduces flour stock)
     ------------------------------------------------------------------ */
  tepung: {
    title: 'Tepung Habis!',
    tier: 'medium',
    stage: 1,
    timeoutSec: 120,
    milestone: () => eventCount('tepung') === 0 && state.rotiSold >= EVENT_CONFIG.milestones.tepungAtRoti && employees() >= 1,
    onStart() {
      revealStock();
      state.biz.flour = 0;
    },
    text: () => 'Your last bag of flour is empty and the regular supplier forgot your delivery. No flour, no roti — ' +
      'all production has stopped. From now on every roti uses 1 flour, so keep an eye on your stock in Business health. ' +
      '(Buying flour is not an extra cost: you now pay for flour up front instead of per roti.)',
    choices: () => {
      const f = CONFIG.business.flour;
      const emergencyCost = f.emergency.amount * f.costPerRoti * f.emergency.priceMultiplier;
      return [
        { id: 'emergency', label: 'Call an emergency supplier', cost: emergencyCost,
          detail: `+${f.emergency.amount} flour right now (double the normal price)`,
          apply: () => { addFlour(f.emergency.amount); return {}; },
          text: 'A motorbike arrives in minutes with sacks of flour. Expensive, but you are back in business.' },
        { id: 'regular', label: 'Order from the regular supplier', cost: f.order.amount * f.costPerRoti,
          detail: `+${f.order.amount} flour at the normal price, arriving in ${deliverySeconds()}s (no roti until then)`,
          apply: () => {
            state.deliveries.push({ amount: f.order.amount, arriveAt: gameTime() + deliverySeconds() });
            return {};
          },
          text: 'The supplier apologises and sends the lorry. You wait, and wipe the tables.' },
        { id: 'kakRos', label: 'Borrow from Kak Ros next door',
          effects: { flour: 15 },
          apply: () => { state.story.kakRosHelped += 1; return {}; },
          text: 'Kak Ros from the nasi lemak stall hands over a bag. "Neighbours help each other mah."' },
      ];
    },
    timeoutText: () => 'Kak Ros next door notices and lends you 15 flour',
    onTimeout: () => {
      state.story.kakRosHelped += 1;
      return { text: 'Kak Ros sees your empty griddle and brings over a small bag of flour.', effects: { flour: 15 } };
    },
  },

  /* ------------------------------------------------------------------
     EVENT 4 — DBKL PERMIT ISSUE (major story event with a deadline)
     ------------------------------------------------------------------ */
  dbkl: {
    title: 'DBKL Permit Issue',
    tier: 'major',
    stage: 1,
    timeoutSec: 150,
    milestone: () => eventCount('dbkl') === 0 && state.rotiSold >= EVENT_CONFIG.milestones.dbklAtRoti &&
      employees() >= EVENT_CONFIG.milestones.dbklNeedsEmployees,
    text(ev) {
      let t = 'A DBKL officer hands you a notice: your stall\'s business licence has expired. ' +
        'Renew it before the deadline, or the stall will be closed temporarily and you will pay a fine. ' +
        '(The licence and process are fictional, for the game.)';
      if (state.biz.hygiene < 50) t += ' Renewal includes a premises check, so hygiene must be at least 50 to renew at the counter.';
      if (ev.data.extended) t += ' You already have an extension.';
      return t;
    },
    choices(ev) {
      const hygieneNeeded = min => (state.biz.hygiene < min ? `Hygiene must be at least ${min} (now ${Math.round(state.biz.hygiene)}) — clean up first` : null);
      const list = [
        { id: 'counter', label: 'Renew at the DBKL counter yourself', cost: scaleCost(120),
          requires: () => hygieneNeeded(50),
          effects: { modifier: { id: 'dbklQueue', label: 'Queueing at the DBKL office', sec: 20, ownerAway: true }, rep: 2 },
          text: 'You queue, fill in the forms, pass the premises check and get your new licence. All above board.' },
        { id: 'consultant', label: 'Hire a licensing consultant', cost: scaleCost(200),
          requires: () => hygieneNeeded(40),
          detail: 'A registered consultant handles all the paperwork · No closure',
          text: 'The consultant submits everything correctly. Your licence arrives the next day.' },
      ];
      if (!ev.data.extended) {
        list.push({ id: 'extend', label: 'Ask for an extension', keepOpen: true,
          detail: 'Free · +90 seconds to the deadline · Only once',
          apply: () => {
            ev.deadline += 90;
            ev.data.extended = true;
            return { text: 'The officer gives you 90 more seconds. "Don\'t be late, ya."' };
          } });
      }
      return list;
    },
    timeoutText: () => 'the stall is closed for 60s and you pay a fine (up to RM80), then the licence is renewed',
    onTimeout: () => ({
      text: 'Deadline missed. DBKL enforcement closes the stall. After paying the fine, your licence is renewed.',
      effects: { modifier: { id: 'dbklClosure', label: 'Closed by DBKL', sec: 60, closed: true }, fine: scaleCost(80), rep: -8 },
    }),
  },

  /* ------------------------------------------------------------------
     MAJOR — HEALTH INSPECTION (uses hygiene and past rat decisions)
     ------------------------------------------------------------------ */
  inspection: {
    title: 'Surprise Health Inspection',
    tier: 'major',
    stage: 1,
    timeoutSec: 60,
    milestone: () => eventCount('inspection') === 0 && eventCount('dbkl') >= 1 &&
      state.rotiSold >= EVENT_CONFIG.milestones.inspectionAtRoti,
    onStart() { revealStat('hygiene'); },
    text: () => `A health officer arrives with a clipboard for a surprise inspection. Current hygiene: ${Math.round(state.biz.hygiene)}.` +
      (state.story.ratIgnored > 0 ? ` Ignored rat problems: ${state.story.ratIgnored} (the officer will notice).` : '') +
      ' Grade A needs a score of 75, and below 30 is a fail.',
    choices: () => [
      { id: 'now', label: 'Welcome the inspector now',
        detail: `Inspection score now: ${inspectionScore()}`,
        apply: () => runInspection() },
      { id: 'tidy', label: 'Ask for a few minutes to tidy up', cost: scaleCost(15),
        detail: `Hygiene +15 first, then inspection (score would be ${Math.min(100, inspectionScore() + 15)})`,
        apply: () => { changeStat('hygiene', 15); return runInspection(); } },
    ],
    timeoutText: () => 'the inspector starts anyway',
    onTimeout: () => runInspection(),
  },

  /* ------------------------------------------------------------------
     SMALL — DAILY MAMAK DRAMA
     ------------------------------------------------------------------ */
  cerewet: {
    title: 'The Cerewet Customer',
    tier: 'small', stage: 1, weight: 3, cooldownSec: 90,
    whileActive: { label: 'Queue held up', demandMult: 0.8 },
    text: () => 'A customer wants roti kosong "crispy outside, soft inside, but not too crispy, and not too soft". The queue waits.',
    choices: () => [
      { id: 'remake', label: 'Patiently make it his way',
        effects: { modifier: { id: 'cerewetSlow', label: 'Making a very special roti', sec: 15, productionMult: 0.7 }, rep: 2 },
        text: 'Third attempt is perfect. He gives you a thumbs up.' },
      { id: 'teh', label: 'Give him a free teh tarik', cost: scaleCost(2),
        effects: { rep: 3 }, text: 'The teh tarik calms him down instantly.' },
      { id: 'no', label: '"This is how we make it, boss."',
        effects: { rep: -2 }, text: 'He eats it anyway, muttering.' },
    ],
    timeoutText: () => 'he storms off (Reputation −2)',
    onTimeout: () => ({ text: 'He storms off, still complaining about the crispiness.', effects: { rep: -2 } }),
  },

  staffLate: {
    title: 'Staff Running Late',
    tier: 'small', stage: 1, weight: 2, cooldownSec: 120,
    requires: () => employees() >= 2,
    onStart(ev) { ev.data.name = staffName(Math.floor(rand() * 8)); },
    text: ev => `${ev.data.name} is running late — his motorbike has a flat tyre on the Federal Highway.`,
    choices: () => [
      { id: 'grab', label: 'Pay for his Grab ride', cost: scaleCost(6),
        effects: { morale: 3 }, text: 'He arrives ten minutes later, grateful.' },
      { id: 'cover', label: 'Cover for him until he arrives',
        effects: { modifier: { id: 'staffLate', label: 'Staff running late', sec: 30, staffAway: 1 }, morale: 2 },
        text: 'The team covers his station. He promises to buy kuih tomorrow.' },
      { id: 'dock', label: 'Dock his pay',
        effects: { morale: -10 }, text: 'Money saved. The whole team goes quiet.' },
    ],
    timeoutText: () => 'the team covers for him (1 Roti Man away for 30s)',
    onTimeout: () => ({ text: 'He eventually turns up.', effects: { modifier: { id: 'staffLate', label: 'Staff running late', sec: 30, staffAway: 1 } } }),
  },

  wrongOrder: {
    title: 'Wrong Order!',
    tier: 'small', stage: 1, weight: 2, cooldownSec: 90,
    whileActive: { label: 'Arguing about an order', demandMult: 0.8 },
    text: () => 'Table 4 got roti telur instead of roti bawang. The customer is staring at you.',
    choices: () => [
      { id: 'remake', label: 'Remake it for free', cost: scaleCost(2),
        effects: { rep: 2 }, text: 'Fresh roti bawang, on the house. Smiles all round.' },
      { id: 'teh', label: 'Apologise and keep it moving',
        effects: { rep: -1 }, text: 'He accepts the apology, but won\'t forget.' },
      { id: 'insist', label: 'Insist he ordered roti telur',
        effects: { rep: -3, morale: -2 }, text: 'Everyone takes sides. Your waiter looks embarrassed.' },
    ],
    timeoutText: () => 'he leaves unhappy (Reputation −2)',
    onTimeout: () => ({ text: 'He leaves without finishing.', effects: { rep: -2 } }),
  },

  spill: {
    title: 'Teh Tarik Spill',
    tier: 'small', stage: 1, weight: 2, cooldownSec: 90,
    requires: () => Boolean(state.revealed.hygiene),
    text: () => 'A full glass of teh tarik spills across table 3 and drips onto the floor. Sticky.',
    choices: () => [
      { id: 'clean', label: 'Clean it immediately',
        effects: { modifier: { id: 'spillClean', label: 'Mopping up', sec: 10, productionMult: 0.8 }, hygiene: 1 },
        text: 'Mopped, wiped, done.' },
      { id: 'later', label: 'Leave it for later',
        effects: { hygiene: -8 }, text: 'The ants arrive before "later" does.' },
    ],
    timeoutText: () => 'it stays sticky (Hygiene −8)',
    onTimeout: () => ({ text: 'Nobody cleaned it.', effects: { hygiene: -8 } }),
  },

  staffSick: {
    title: 'Staff Calls in Sick',
    tier: 'small', stage: 1, weight: 1, cooldownSec: 150,
    requires: () => employees() >= 2,
    onStart(ev) { ev.data.name = staffName(Math.floor(rand() * 8)); },
    text: ev => `${ev.data.name} calls in sick with a fever.`,
    choices: () => [
      { id: 'rest', label: 'Tell him to rest',
        effects: { modifier: { id: 'staffSick', label: 'Staff off sick', sec: 60, staffAway: 1 }, morale: 6 },
        text: '"Get well soon!" The team appreciates it.' },
      { id: 'temp', label: 'Hire a temporary helper', cost: scaleCost(15),
        effects: { morale: 2 }, text: 'A cousin of a cousin helps out for the day.' },
      { id: 'comeIn', label: 'Ask him to come in anyway',
        detail: 'Morale −12 · 30% chance he sneezes near the dough (Reputation −3, Hygiene −5)',
        apply: () => (rand() < 0.3
          ? { text: 'He sneezes right next to the dough. A customer sees.', effects: { morale: -12, rep: -3, hygiene: -5 } }
          : { text: 'He works, miserably.', effects: { morale: -12 } }) },
    ],
    timeoutText: () => 'he stays home (1 Roti Man away for 60s)',
    onTimeout: () => ({ text: 'He stays home.', effects: { modifier: { id: 'staffSick', label: 'Staff off sick', sec: 60, staffAway: 1 } } }),
  },

  /* ------------------------------------------------------------------
     MEDIUM — OPERATIONAL PROBLEMS
     ------------------------------------------------------------------ */
  breakdown: {
    title: 'Griddle Rosak!',
    tier: 'medium', stage: 1, weight: 1, cooldownSec: 180,
    requires: () => state.levels.griddle >= 1 || employees() >= 2,
    whileActive: { label: 'Griddle not heating properly', productionMult: 0.6 },
    text: () => 'The gas regulator on your griddle starts hissing and the flame keeps going out.',
    choices: () => [
      { id: 'repair', label: 'Call the repairman', cost: scaleCost(25 + 10 * state.levels.griddle),
        text: 'Uncle Repairman fixes it in five minutes and charges for an hour. Fair enough.' },
      { id: 'diy', label: 'Fix it yourself',
        effects: { modifier: { id: 'diyRepair', label: 'Fixing the griddle', sec: 20, closed: true } },
        text: 'Half a roll of tape and one YouTube video later, it works.' },
      { id: 'carry', label: 'Keep cooking carefully',
        detail: 'Production −40% for 60s · 20% chance of a scary flare-up (Morale −8, Hygiene −5)',
        apply: () => (rand() < 0.2
          ? { text: 'WHOOSH. A flare-up singes the counter. Everyone is shaken.', effects: { modifier: { id: 'carefulCooking', label: 'Cooking on a dodgy griddle', sec: 60, productionMult: 0.6 }, morale: -8, hygiene: -5 } }
          : { text: 'You nurse the griddle through the shift.', effects: { modifier: { id: 'carefulCooking', label: 'Cooking on a dodgy griddle', sec: 60, productionMult: 0.6 } } }) },
    ],
    timeoutText: () => 'you keep cooking carefully (Production −40% for 60s)',
    onTimeout: () => ({ text: 'You keep cooking on the dodgy griddle.', effects: { modifier: { id: 'carefulCooking', label: 'Cooking on a dodgy griddle', sec: 60, productionMult: 0.6 } } }),
  },

  moraleDrop: {
    title: 'Staff Grumbling',
    tier: 'medium', stage: 1, cooldownSec: 150,
    weight: () => (state.biz.morale < 50 ? 3 : 1),
    requires: () => Boolean(state.revealed.morale) && state.biz.morale < 70,
    text: () => 'The staff are grumbling about long shifts, the heat, and no breaks. Production is getting sloppy.',
    whileActive: { label: 'Staff grumbling', productionMult: 0.85 },
    choices: () => [
      { id: 'makan', label: 'Belanja everyone makan', cost: scaleCost(8 * Math.max(1, employees())),
        effects: { morale: 20 }, text: 'Nasi kandar for everyone. Spirits lift.' },
      { id: 'break', label: 'Give everyone a proper break',
        effects: { modifier: { id: 'staffBreak', label: 'Staff on break', sec: 30, productionMult: 0.3 }, morale: 12 },
        text: 'Thirty seconds of rest under the fan. Bliss.' },
      { id: 'talk', label: 'Give a pep talk',
        effects: { morale: 4 }, text: '"We are a family!" Some of them believe you.' },
    ],
    timeoutText: () => 'the grumbling gets worse (Morale −8)',
    onTimeout: () => ({ text: 'Nobody listened, and the mood gets worse.', effects: { morale: -8 } }),
  },

  surge: {
    title: 'Match Just Ended!',
    tier: 'medium', stage: 1, weight: 1, cooldownSec: 180,
    text: () => 'The futsal match next door has finished. A crowd of hungry, sweaty fans is heading your way!',
    choices: () => [
      { id: 'allHands', label: 'All hands on deck!',
        detail: 'Demand +100% and Production +30% for 45s · Morale −6',
        apply: () => {
          addModifier({ id: 'crowdDemand', label: 'Football crowd', sec: 45, demandMult: 2 });
          return { text: 'Everyone flips faster than ever.', effects: { modifier: { id: 'crowdRush', label: 'Working flat out', sec: 45, productionMult: 1.3 }, morale: -6 } };
        } },
      { id: 'normal', label: 'Serve at a normal pace',
        effects: { modifier: { id: 'crowdDemand', label: 'Football crowd', sec: 45, demandMult: 2 } },
        text: 'You serve who you can.' },
    ],
    timeoutText: () => 'you serve at a normal pace',
    onTimeout: () => ({ text: 'The crowd arrives anyway.', effects: { modifier: { id: 'crowdDemand', label: 'Football crowd', sec: 45, demandMult: 2 } } }),
  },

  lorry: {
    title: 'Supplier Lorry Rosak',
    tier: 'medium', stage: 1, weight: 1, cooldownSec: 180,
    requires: () => stockActive(),
    text: () => 'Your flour supplier\'s lorry has broken down on the highway. Deliveries will be slow for a while.',
    choices: () => [
      { id: 'wait', label: 'Wait it out',
        effects: { modifier: { id: 'slowDelivery', label: 'Supplier lorry broken', sec: 120, deliveryMult: 2 } },
        text: 'You plan ahead and keep an eye on stock.' },
      { id: 'lalamove', label: 'Send a Lalamove to collect flour', cost: scaleCost(15),
        effects: { flour: 30, modifier: { id: 'slowDelivery', label: 'Supplier lorry broken', sec: 120, deliveryMult: 2 } },
        text: 'A van brings 30 flour straight from the warehouse.' },
    ],
    timeoutText: () => 'deliveries are slow for a while',
    onTimeout: () => ({ text: 'Deliveries will be slow for a while.', effects: { modifier: { id: 'slowDelivery', label: 'Supplier lorry broken', sec: 120, deliveryMult: 2 } } }),
  },
};

// Story events are checked in this order when several are due.
const STORY_ORDER = ['tepung', 'dbkl', 'inspection', 'tikus', 'rahman'];

/* ---------------------------------------------------------------------
   Shared outcomes
   --------------------------------------------------------------------- */

// For big orders: blocks the choice until there is enough flour in stock.
function needFlour(n) {
  return () => (stockActive() && state.biz.flour < n ? `Need ${n} flour in stock (you have ${Math.floor(state.biz.flour)})` : null);
}

function ignoreRat() {
  state.story.ratIgnored += 1;
  if (state.story.ratIgnored >= 2) {
    return { text: 'A customer posts a video: "TIKUS at mamak!!" It gets 20,000 views.', effects: { hygiene: -10, rep: -10 } };
  }
  return { text: 'You pretend you saw nothing. The rat pretends the same.', effects: { hygiene: -10, rep: -2 } };
}

function inspectionScore() {
  return Math.max(0, Math.round(state.biz.hygiene - 15 * state.story.ratIgnored));
}

function runInspection() {
  const score = inspectionScore();
  if (score >= 75) {
    addModifier({ id: 'gradeA', label: 'Grade A hygiene sticker', sec: null, demandMult: 1.05 });
    return { text: `Score ${score}: GRADE A! You proudly stick the certificate on the wall (demand +5% permanently).`, effects: { rep: 8 } };
  }
  if (score >= 50) return { text: `Score ${score}: Grade B. "Not bad. Clean the drains more often."`, effects: { rep: 2 } };
  if (score >= 30) return { text: `Score ${score}: Grade C, with a written warning.`, effects: { rep: -4 } };
  state.story.ratIgnored = 0;
  return {
    text: `Score ${score}: FAILED. The stall must close for cleaning. After a full scrub, you reopen.`,
    effects: { modifier: { id: 'inspectionClosure', label: 'Closed for cleaning after inspection', sec: 45, closed: true }, rep: -10,
      hygiene: Math.max(0, 60 - state.biz.hygiene) },
  };
}

/* =====================================================================
   EVENT ENGINE
   ===================================================================== */

let choiceLockUntil = 0;

function eventTitle(ev) {
  const def = EVENTS[ev.id];
  if (!def) return 'Challenge';
  return typeof def.title === 'function' ? def.title(ev) : def.title;
}

function eventTimeout(def) {
  if (def.timeoutSec !== undefined) return def.timeoutSec;
  return EVENT_CONFIG.tiers[def.tier].timeoutSec;
}

function getChoices(ev) {
  const def = EVENTS[ev.id];
  return def ? def.choices(ev) : [];
}

function choiceBlockedReason(choice) {
  if (choice.requires) {
    const why = choice.requires();
    if (why) return why;
  }
  if (choice.cost && state.cash < choice.cost) return `Need ${money(choice.cost)}`;
  return null;
}

function choiceDetail(choice) {
  const parts = [];
  if (choice.cost) parts.push(money(choice.cost));
  else if (!choice.detail) parts.push('Free');
  if (choice.detail) parts.push(choice.detail);
  else parts.push(...effectLines(choice.effects, false));
  return parts.join(' · ');
}

// The effect an unresolved challenge has on the business (e.g. queue held up).
function activeEventModifier() {
  const ev = state.events.active;
  if (!ev) return null;
  const def = EVENTS[ev.id];
  if (!def || !def.whileActive) return null;
  const w = def.whileActive;
  return { id: 'event_' + ev.id, label: w.label, until: null, demandMult: w.demandMult ?? 1,
    productionMult: w.productionMult ?? 1, closed: false, ownerAway: false, staffAway: 0, deliveryMult: 1, fromEvent: true };
}

function startEvent(id) {
  const def = EVENTS[id];
  if (!def) return null;
  const E = state.events;
  E.uid += 1;
  const timeout = eventTimeout(def);
  const ev = { uid: E.uid, id, startedAt: gameTime(), deadline: timeout ? gameTime() + timeout : null, data: {} };
  E.active = ev;
  state.revealed.challenges = true;
  if (def.onStart) def.onStart(ev);
  addLog(`${EVENT_CONFIG.tiers[def.tier].label} challenge: ${eventTitle(ev)}`);
  return ev;
}

function finishEvent(ev, choiceLabel, text, lines) {
  const def = EVENTS[ev.id];
  const E = state.events;
  const summary = (text || '') + (lines.length ? ` (${lines.join(', ')})` : '');
  addLog(`${eventTitle(ev)} — ${choiceLabel}: ${summary}`);
  E.recent.unshift({ title: eventTitle(ev), choice: choiceLabel, text: summary, t: state.playTimeMs });
  if (E.recent.length > EVENT_CONFIG.recentOutcomes) E.recent.length = EVENT_CONFIG.recentOutcomes;
  E.active = null;
  E.lastEndedAt = gameTime();
  E.sinceCheck = 0;
  E.cooldownUntil[ev.id] = gameTime() + (def.cooldownSec || 0);
  E.counts[ev.id] = (E.counts[ev.id] || 0) + 1;
  if (def.onFinish) def.onFinish(ev);
  choiceLockUntil = Date.now() + EVENT_CONFIG.choiceLockMs;
}

function resolveChoice(choiceId) {
  const ev = state.events.active;
  if (!ev || state.stage1Complete) return false;
  const choice = getChoices(ev).find(c => c.id === choiceId);
  if (!choice || choiceBlockedReason(choice)) return false;

  const lines = [];
  if (choice.cost) lines.push(`Paid ${money(spend(choice.cost, true))}`);
  lines.push(...effectLines(choice.effects, true));
  let text = choice.text || '';
  if (choice.apply) {
    const r = choice.apply(ev) || {};
    if (r.text) text = r.text;
    lines.push(...effectLines(r.effects, true));
  }

  if (choice.keepOpen) {
    addLog(`${eventTitle(ev)} — ${choice.label}: ${text}`);
    choiceLockUntil = Date.now() + EVENT_CONFIG.choiceLockMs;
  } else {
    finishEvent(ev, choice.label, text, lines);
  }
  afterChange();
  saveGame();
  return true;
}

function timeoutEvent() {
  const ev = state.events.active;
  const def = EVENTS[ev.id];
  const r = def.onTimeout ? def.onTimeout(ev) || {} : {};
  const lines = effectLines(r.effects, true);
  finishEvent(ev, 'No decision', r.text || '', lines);
  saveGame();
}

function pickWeighted(list) {
  const weights = list.map(d => (typeof d.weight === 'function' ? d.weight() : d.weight) || 0);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rand() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r < 0) return list[i];
  }
  return list[list.length - 1];
}

function eligibleRandomEvents(tier) {
  const t = gameTime();
  return Object.entries(EVENTS)
    .filter(([id, d]) => d.tier === tier && d.weight && (d.stage || 1) === currentStage() &&
      (state.events.cooldownUntil[id] || 0) <= t && (!d.requires || d.requires()))
    .map(([id, d]) => ({ ...d, id }));
}

// Called from the main game loop every update.
function eventsTick(seconds) {
  const E = state.events;
  if (E.active) {
    const def = EVENTS[E.active.id];
    if (!def) { E.active = null; return; }
    if (def.onActiveTick) def.onActiveTick(E.active, seconds);
    if (E.active.deadline !== null && gameTime() >= E.active.deadline) timeoutEvent();
    return;
  }
  if (!EVENT_CONFIG.enabled) return;
  E.sinceCheck += seconds;
  if (E.sinceCheck < EVENT_CONFIG.checkEverySec) return;
  E.sinceCheck = 0;
  if (gameTime() - E.lastEndedAt < EVENT_CONFIG.quietTimeSec) return;

  // 1. Story events at milestones
  for (const id of STORY_ORDER) {
    const def = EVENTS[id];
    if ((def.stage || 1) === currentStage() && def.milestone && def.milestone()) {
      startEvent(id);
      return;
    }
  }

  // 2. Random small and medium challenges
  if (E.paused) return;
  if (employees() < EVENT_CONFIG.randomNeedsEmployees || state.rotiSold < EVENT_CONFIG.randomStartRoti) return;
  for (const tier of ['medium', 'small']) {
    if (rand() < EVENT_CONFIG.tiers[tier].chancePerCheck) {
      const pick = pickWeighted(eligibleRandomEvents(tier));
      if (pick) { startEvent(pick.id); return; }
    }
  }
}

/* =====================================================================
   SAVE / LOAD
   ===================================================================== */

function loadEventState(data, fresh) {
  const out = fresh;
  out.uid = Math.floor(num(data.uid, 0));
  out.lastEndedAt = signedNum(data.lastEndedAt, -9999);
  out.sinceCheck = num(data.sinceCheck, 0);
  out.paused = data.paused === true;
  if (plainObject(data.cooldownUntil)) {
    for (const [k, v] of Object.entries(data.cooldownUntil)) out.cooldownUntil[k] = signedNum(v, 0);
  }
  if (plainObject(data.counts)) {
    for (const [k, v] of Object.entries(data.counts)) out.counts[k] = Math.floor(num(v, 0));
  }
  if (Array.isArray(data.recent)) {
    out.recent = data.recent
      .filter(r => plainObject(r) && typeof r.text === 'string')
      .slice(0, EVENT_CONFIG.recentOutcomes)
      .map(r => ({ title: String(r.title || ''), choice: String(r.choice || ''), text: r.text, t: num(r.t, 0) }));
  }
  const a = plainObject(data.active);
  if (a && typeof a.id === 'string' && EVENTS[a.id]) {
    out.active = {
      uid: Math.floor(num(a.uid, out.uid)),
      id: a.id,
      startedAt: signedNum(a.startedAt, 0),
      deadline: a.deadline === null ? null : signedNum(a.deadline, 0),
      data: plainObject(a.data) ? { ...a.data } : {},
    };
  }
  return out;
}

/* =====================================================================
   DISPLAY — the Challenges panel
   ===================================================================== */

let choicesSignature = '';

function renderChallenges() {
  const s = state;
  const hidden = !s.revealed.challenges || s.stage1Complete;
  setHidden('challengesPanel', hidden);
  if (hidden) return;

  const ev = s.events.active;
  setHidden('challengeActive', !ev);
  setHidden('challengeNone', Boolean(ev));

  if (ev) {
    const def = EVENTS[ev.id];
    const tier = EVENT_CONFIG.tiers[def.tier];
    const tierEl = el('chTier');
    setText('chTier', `${tier.label} challenge`);
    if (tierEl.dataset.tier !== def.tier) tierEl.dataset.tier = def.tier;
    setText('chTitle', eventTitle(ev));
    setText('chText', def.text(ev));
    const wa = activeEventModifier();
    setText('chWhile', wa ? `While you decide: ${wa.label} (${describeEffectOnly(wa)})` : '');
    if (ev.deadline !== null) {
      const left = Math.max(0, Math.ceil(ev.deadline - gameTime()));
      const what = def.timeoutText ? def.timeoutText(ev) : 'it resolves itself';
      setText('chTimer', def.tier === 'major'
        ? `Deadline in ${formatTime(left * 1000)}. If you miss it: ${what}.`
        : `If you don't decide within ${left}s: ${what}.`);
    } else {
      setText('chTimer', '');
    }

    const choices = getChoices(ev);
    const sig = ev.uid + '|' + choices.map(c => `${c.id}:${c.label}:${choiceDetail(c)}:${choiceBlockedReason(c) || ''}`).join('|');
    if (sig !== choicesSignature) {
      choicesSignature = sig;
      const box = el('chChoices');
      box.innerHTML = '';
      for (const c of choices) {
        const why = choiceBlockedReason(c);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'choice';
        btn.dataset.choice = c.id;
        btn.dataset.uid = String(ev.uid);
        btn.disabled = Boolean(why);
        const label = document.createElement('span');
        label.className = 'choice-label';
        label.textContent = c.label;
        const detail = document.createElement('span');
        detail.className = 'choice-detail';
        detail.textContent = choiceDetail(c);
        btn.append(label, detail);
        if (why) {
          const w = document.createElement('span');
          w.className = 'choice-why';
          w.textContent = why;
          btn.appendChild(w);
        }
        box.appendChild(btn);
      }
    }
  } else {
    choicesSignature = '';
  }

  // Active effects (temporary and permanent)
  const t = gameTime();
  const mods = s.modifiers.filter(m => m.until === null || m.until > t);
  setHidden('chEffectsWrap', mods.length === 0);
  const effText = mods.map(m => {
    const left = m.until === null ? 'permanent' : `${Math.ceil(m.until - t)}s left`;
    return `${m.label} — ${describeEffectOnly(m)} (${left})`;
  });
  renderList('chEffects', effText);

  // Recurring characters
  setHidden('chPeopleWrap', !s.revealed.rahman);
  if (s.revealed.rahman) {
    const v = s.relationships.rahman;
    setText('chRahman', `The Rahman Family: ${relationshipLabel(v)} (${signed(v)}) · visits: ${eventCount('rahman')}`);
  }

  // Recent outcomes
  setHidden('chRecentWrap', s.events.recent.length === 0);
  renderList('chRecent', s.events.recent.map(r => `${r.title} — ${r.choice}: ${r.text}`));
}

function renderList(id, items) {
  const list = el(id);
  const sig = items.join('\n');
  if (list.dataset.sig === sig) return;
  list.dataset.sig = sig;
  list.innerHTML = '';
  for (const text of items) {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  }
}

function challengeSummaryRows() {
  const total = Object.values(state.events.counts).reduce((a, b) => a + b, 0);
  const rows = [['Challenges handled', String(total)]];
  if (state.revealed.rahman) rows.push(['Rahman family', `${relationshipLabel(state.relationships.rahman)} (${signed(state.relationships.rahman)})`]);
  return rows;
}

/* =====================================================================
   BUTTONS AND DEVELOPER CONTROLS
   ===================================================================== */

function setupEventsUI() {
  el('chChoices').addEventListener('click', e => {
    const btn = e.target.closest('button[data-choice]');
    if (!btn || btn.disabled) return;
    if (Date.now() < choiceLockUntil) return;
    const ev = state.events.active;
    if (!ev || String(ev.uid) !== btn.dataset.uid) return;   // stale button
    resolveChoice(btn.dataset.choice);
  });

  const select = el('devEventSelect');
  select.innerHTML = '';
  for (const [id, def] of Object.entries(EVENTS)) {
    const opt = document.createElement('option');
    opt.value = id;
    const title = typeof def.title === 'function' ? def.title({ data: {} }) : def.title;
    opt.textContent = `${title} (${EVENT_CONFIG.tiers[def.tier].label})`;
    select.appendChild(opt);
  }
  updatePauseLabel();
}

function updatePauseLabel() {
  setText('devPauseEvents', state.events.paused ? 'Resume random challenges' : 'Pause random challenges');
}

function devEventAction(action) {
  const E = state.events;
  switch (action) {
    case 'eventTrigger': {
      if (state.stage1Complete) return true;   // game is paused on the victory screen
      const id = el('devEventSelect').value;
      if (E.active) E.active = null;
      startEvent(id);
      addLog('[Dev] Triggered a challenge.');
      return true;
    }
    case 'eventEnd':
      if (E.active) {
        E.active = null;
        E.lastEndedAt = gameTime();
        addLog('[Dev] Cleared the current challenge with no consequences.');
      }
      return true;
    case 'eventPause':
      E.paused = !E.paused;
      addLog(E.paused ? '[Dev] Random challenges paused (story events still happen).' : '[Dev] Random challenges resumed.');
      updatePauseLabel();
      return true;
    default:
      return false;
  }
}

// Extra hooks for automated tests in the browser console.
Object.assign(window.MamakGame, {
  EVENTS, EVENT_CONFIG, startEvent, resolveChoice, getChoices, eventsTick,
  setRandom: fn => { rng = fn || Math.random; },
  inspectionScore,
});
