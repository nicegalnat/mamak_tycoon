'use strict';

/* =====================================================================
   MAMAK TYCOON — Surprise Challenges for Stages 2 to 10
   ---------------------------------------------------------------------
   These use the same event engine as Stage 1 (events.js). Costs are
   worked out from your income when the challenge starts ("seconds of
   income"), so they stay fair as numbers grow from ringgit to
   quadrillions.

   Every challenge has at least one free option. Story events marked
   "major" are needed to finish their stage; all of them can be resolved
   with any choice, so bad luck can never block progress.

   Everything here is fictional: organisations, laws, people, apps.
   ===================================================================== */

// Gives a challenge a stable money scale, fixed when it starts.
function laterEvent(def) {
  const original = def.onStart;
  def.onStart = ev => {
    const floor = (STAGES[state.stage] ? STAGES[state.stage].startCash : 1000) / 300;
    ev.data.base = Math.max(currentIncome(), floor);
    if (original) original(ev);
  };
  return def;
}
function evm(ev, seconds) { return niceRound(Math.max(1, ev.data.base * seconds)); }
function boost(id, label, sec, mult) { return { modifier: { id, label, sec, incomeMult: mult } }; }
function openRegionIndexes() { return SD().regions.map((r, i) => (r.open ? i : -1)).filter(i => i >= 0); }
function openMarketIndexes() { return SD().markets.map((m, i) => (m.open ? i : -1)).filter(i => i >= 0); }
function rivalBlocks() { return SD().blocks.filter(b => b.owner === 'bk' || b.owner === 'ks'); }
function myBlocks() { return SD().blocks.filter(b => b.owner === 'you'); }

/* ---------------------------------------------------------------------
   THE RAHMAN FAMILY — one visit per stage, remembering everything
   --------------------------------------------------------------------- */

const RAHMAN_VISIT_AT = 90;   // seconds into each stage

const RAHMAN_STAGES = {
  2: {
    friendly: 'Encik Rahman has a business proposal: "Rahman Express" — a mini-franchise of YOUR franchise, run from his porch. "Low rent, boss. My wife is the landlord."',
    grumpy: 'Encik Rahman has opened "Rahman Express" on his porch anyway, selling roti he insists are yours. They are not. They are frozen paratha with confidence.',
    choices: ev => [
      { id: 'official', label: 'Make it an official mini-franchise', cost: evm(ev, 20),
        apply: () => ({ text: 'Rahman Express becomes the best-performing porch in Malaysia.', effects: { rel: 2, ...boost('rahmanExpress', 'Rahman Express', null, 1.05) } }) },
      { id: 'manual', label: 'Send him the 400-page franchise manual', detail: 'Free · Rahman family ±0',
        apply: () => ({ text: 'He uses it as a monitor stand. "Very useful, boss."' }) },
      { id: 'no', label: 'Politely decline', detail: 'Free · Rahman family −1 · confused customers (income −5% for 60s)',
        apply: () => ({ text: '"Never mind. I go to the other mamak." He does not. There is no other mamak. It is you.', effects: { rel: -1, ...boost('rahmanConfusion', 'Confused customers', 60, 0.95) } }) },
    ],
  },
  3: {
    friendly: 'Nenek Rahman has heard about the rival chains. "Those Bintang Kilat people put too much sugar in teh. Unacceptable." She offers to help.',
    grumpy: 'The Rahmans have started eating at Kopi Sinar Express. Every night. In the window. Facing your outlet.',
    choices: ev => [
      { id: 'supper', label: 'Invite them for free supper every night this week', cost: evm(ev, 20),
        apply: () => { rivalBlocks().forEach(b => { b.str = Math.max(5, b.str - 25); });
          return { text: 'Nenek organises a taman-wide boycott of your rivals. Every rival block loses 25 strength.', effects: { rel: 2 } }; } },
      { id: 'banner', label: 'Ask to hang your banner on their gate', detail: 'Free · income +20% for 40s',
        apply: () => ({ text: 'The banner covers the whole house. Encik Rahman pretends to mind.', effects: boost('rahmanBanner', 'Banner on the Rahman gate', 40, 1.2) }) },
      { id: 'away', label: 'Tell them to stay out of business matters', detail: 'Free · Rahman family −2 · one rival block gets stronger',
        apply: () => { const r = rivalBlocks()[0]; if (r) r.str = Math.min(100, r.str + 20);
          return { text: 'They post a 14-paragraph online review of your rival. All positive.', effects: { rel: -2 } }; } },
    ],
  },
  4: {
    friendly: 'The Rahmans are doing a balik kampung road trip through EVERY region, calling you from each outlet. "Boss, why here the kuah different?"',
    grumpy: 'The Rahmans are on a road trip, and they are leaving one-star reviews in every region "for consistency".',
    choices: ev => [
      { id: 'fix', label: 'Use their feedback to fix every region\'s recipe', cost: evm(ev, 20),
        apply: () => { SD().regions.forEach(r => { if (r.open) r.recipe = r.taste; });
          return { text: 'Puan Rahman\'s notes are terrifyingly accurate. Every open region now gets its favourite taste.', effects: { rel: 1 } }; } },
      { id: 'vip', label: 'Give them a free ride in a VIP lorry', detail: 'Free · Rahman family +2 · central deliveries −20% for 60s',
        apply: () => { const r = SD().regions[0]; r.capMult = 0.8; r.capUntil = gameTime() + 60;
          return { text: 'The kids name the lorry "Lori Roti Juara". Central deliveries slow a bit.', effects: { rel: 2 } }; } },
      { id: 'block', label: 'Put their number on silent', detail: 'Free · Rahman family −2',
        apply: () => ({ text: 'They switch to voice notes. Seven-minute voice notes.', effects: { rel: -2 } }) },
    ],
  },
  5: {
    friendly: 'In a twist nobody saw coming, Puan Rahman has been appointed (fictional) Chief Breakfast Compliance Auditor. She arrives at your office with a clipboard and a small smile.',
    grumpy: 'Puan Rahman has been appointed (fictional) Chief Breakfast Compliance Auditor. She arrives with a clipboard, a magnifying glass and a long memory.',
    choices: ev => [
      { id: 'show', label: 'Show her your forms', detail: 'Fewer than 20 forms waiting: compliance +10 · otherwise compliance −10',
        apply: () => { const d = SD(); const good = d.forms.length < 20; d.compliance = clamp(d.compliance + (good ? 10 : -10), 0, 100);
          return good ? { text: '"Hmm. Acceptable." From Puan Rahman, this is a medal.', effects: { rel: 1 } } : { text: 'She counts every overdue form out loud.', effects: { rel: -1 } }; } },
      { id: 'teh', label: 'Offer her a teh tarik while she checks', cost: evm(ev, 5),
        apply: () => { SD().compliance = clamp(SD().compliance + 5, 0, 100);
          return { text: 'Her report: "Teh tarik: excellent. Forms: acceptable. Boss: needs haircut."', effects: { rel: 1 } }; } },
      { id: 'freezer', label: 'Hide the backlog in the freezer', detail: 'Clears all forms · 50% chance she opens the freezer (compliance −20, Rahman family −2)',
        apply: () => { const d = SD(); d.forms = [];
          if (rand() < 0.5) { d.compliance = clamp(d.compliance - 20, 0, 100); return { text: 'She opens the freezer looking for ais krim. She finds 300 forms.', effects: { rel: -2 } }; }
          return { text: 'She does not open the freezer. You sweat for an hour.' }; } },
    ],
  },
  6: {
    friendly: 'Nenek Rahman is leading a polite but determined movement: "Bring Back Thick Kuah". She has a banner, a megaphone and 2,000 aunties.',
    grumpy: 'Nenek Rahman is leading the "Bring Back Thick Kuah" movement, and the banner has your face on it. With a moustache drawn on.',
    choices: ev => [
      { id: 'meet', label: 'Meet Nenek and promise thicker kuah', detail: 'Approval +10 · Dhal −10% · Rahman family +2',
        apply: () => { const d = SD(); d.happy = clamp(d.happy + 10, 0, 100); d.dhal = clamp(d.dhal - 10, 0, 100);
          return { text: 'Nenek tastes the new kuah and nods once. The aunties cheer.', effects: { rel: 2 } }; } },
      { id: 'advisor', label: 'Appoint Nenek as National Kuah Advisor', cost: evm(ev, 20),
        apply: () => { SD().nenekAdvisor = true; SD().happy = clamp(SD().happy + 5, 0, 100);
          return { text: 'Nenek knows tricks with lentils nobody has written down. Dhal Reserve +0.1%/s, permanently.', effects: { rel: 3 } }; } },
      { id: 'press', label: 'Issue a press statement about kuah viscosity', detail: 'Free · Approval −8 · Rahman family −2',
        apply: () => { SD().happy = clamp(SD().happy - 8, 0, 100); return { text: 'Nobody reads it. Everybody is angry about it.', effects: { rel: -2 } }; } },
    ],
  },
  7: {
    friendly: 'The Rahman family — all 47 relatives — want to be the festival\'s opening act: "Synchronised Flipping, Rahman Style". Rehearsals have been chaotic but full of love.',
    grumpy: 'The Rahman family were not invited to the festival, so they are holding their own "Hari Rahman Sedunia" next door. With a bigger sound system.',
    choices: ev => [
      { id: 'yes', label: 'Yes! The Rahmans open the festival', detail: 'Hype +15 · Sync −10 (they are… enthusiastic) · Rahman family +2',
        apply: () => { const t = SD().tracks; t.hype = Math.min(100, t.hype + 15); t.sync = Math.max(0, t.sync - 10);
          return { text: 'Nenek flips a roti so high it gets its own news segment.', effects: { rel: 2 } }; } },
      { id: 'vip', label: 'Give them front-row VIP seats', cost: evm(ev, 15),
        apply: () => { SD().tracks.hype = Math.min(100, SD().tracks.hype + 5); return { text: 'They arrive four hours early and reserve 46 extra seats with tissue packets.', effects: { rel: 1 } }; } },
      { id: 'full', label: 'Say the line-up is full', detail: 'Free · Rahman family −2 · Hype −5',
        apply: () => { SD().tracks.hype = Math.max(0, SD().tracks.hype - 5); return { text: 'Their rival festival trends on social media. Briefly.', effects: { rel: -2 } }; } },
    ],
  },
  8: {
    friendly: 'The Rahmans are on a world holiday, visiting every one of your outlets and reviewing them on MakanAdvisor (a fictional review site). So far: four stars. "Five if got sambal."',
    grumpy: 'The Rahmans are on a world holiday, and every MakanAdvisor review starts with "Back in Malaysia ah…"',
    choices: ev => [
      { id: 'hotel', label: 'Upgrade their hotel near your London outlet', cost: evm(ev, 20),
        apply: () => ({ text: 'Five stars on MakanAdvisor. "Even the hotel teh tarik also not bad."', effects: { rel: 2, ...boost('rahmanReview', '5-star Rahman review', 90, 1.1) } }) },
      { id: 'video', label: 'Ask them to film a review video', detail: 'Free · if they like you: income +20% for 60s; if not: −10% for 60s',
        apply: () => (state.relationships.rahman >= 1
          ? { text: 'Encik Rahman\'s review video ("Wah, overseas also can!") gets 3 million views.', effects: boost('rahmanVideo', 'Rahman review video', 60, 1.2) }
          : { text: 'The video is 11 minutes long and mostly about the air-conditioning.', effects: boost('rahmanVideo', 'Rahman review video', 60, 0.9) }) },
      { id: 'hide', label: 'Hide in the kitchen until they leave', detail: 'Free · Rahman family −1',
        apply: () => ({ text: 'They wait. They have nowhere else to be. Eventually, so do you.', effects: { rel: -1 } }) },
    ],
  },
  9: {
    friendly: 'RotiGPT was trained on 40 years of Encik Rahman\'s feedback, and now talks exactly like him. "Why so slow? Last time better. But OK lah, good effort."',
    grumpy: 'RotiGPT was trained on 40 years of Encik Rahman\'s complaints. It now complains about its own roti. Constantly. In his voice.',
    choices: ev => [
      { id: 'cco', label: 'Hire Encik Rahman as the AI\'s Chief Complaints Officer', detail: 'Free · AI autonomy −20 (it actually listens to him) · Rahman family +2',
        apply: () => { SD().autonomy = Math.max(0, SD().autonomy - 20); return { text: 'Encik Rahman finally has a job title equal to his complaining ability.', effects: { rel: 2 } }; } },
      { id: 'keep', label: 'Let RotiGPT keep the personality', detail: 'Free · production +20% for 60s · Rahman family +1',
        apply: () => ({ text: 'The AI is now very particular about crispiness. Quality improves out of sheer stubbornness.', effects: { rel: 1, ...boost('rotiRahman', 'Rahman-mode RotiGPT', 60, 1.2) } }) },
      { id: 'delete', label: 'Delete the Rahman dataset', detail: 'Free · compute −20% · Rahman family −2',
        apply: () => { SD().compute *= 0.8; return { text: 'RotiGPT\'s last Rahman words: "Last time… better…"', effects: { rel: -2 } }; } },
    ],
  },
};

const STAGE_RAHMAN_EVENTS = {};
for (const [n, info] of Object.entries(RAHMAN_STAGES)) {
  STAGE_RAHMAN_EVENTS['rahmanS' + n] = laterEvent({
    title: 'The Rahman Family',
    tier: 'medium',
    stage: Number(n),
    timeoutSec: 90,
    milestone: () => eventCount('rahmanS' + n) === 0 && stageElapsed() >= RAHMAN_VISIT_AT,
    onStart(ev) { ev.data.friendly = state.relationships.rahman >= 1; state.revealed.rahman = true; },
    text: ev => (ev.data.friendly ? info.friendly : info.grumpy),
    choices: ev => info.choices(ev),
    timeoutText: () => 'they leave, offended (Rahman family −2)',
    onTimeout: () => ({ text: 'The Rahmans wait 90 seconds, then leave and tell everyone.', effects: { rel: -2 } }),
  });
}

/* ---------------------------------------------------------------------
   STAGE 2 — franchise drama
   --------------------------------------------------------------------- */
const S2_EVENTS = {
  cousinManager: laterEvent({
    title: 'The Regional Manager Is "Working From Home"', tier: 'small', stage: 2, weight: 2, cooldownSec: 120,
    text: () => 'Your cousin, the Regional Manager, is "working from home". His social media shows a beach in Langkawi.',
    choices: ev => [
      { id: 'call', label: 'Call him back to work', cost: evm(ev, 8), text: 'He returns, sunburnt, with keropok for everyone.' },
      { id: 'promote', label: 'Promote him to "Head of Beach Operations"', detail: 'Free · income −10% for 60s', apply: () => ({ text: 'He opens no outlets on the beach. He is very relaxed about it.', effects: boost('cousin', 'Cousin on holiday', 60, 0.9) }) },
      { id: 'self', label: 'Do his job yourself', detail: 'Free · income −5% for 30s', apply: () => ({ text: 'You discover his job is mostly forwarding good-morning messages to the family group chat.', effects: boost('cousinSelf', 'Doing the cousin\'s job', 30, 0.95) }) },
    ],
    timeoutText: () => 'he stays at the beach (income −10% for 60s)',
    onTimeout: () => ({ text: 'He sends a sunset photo. Caption: "Grinding."', effects: boost('cousin', 'Cousin on holiday', 60, 0.9) }),
  }),
  deliveryApp: laterEvent({
    title: 'MakanGo Raises Commission', tier: 'medium', stage: 2, weight: 1, cooldownSec: 180,
    text: () => 'MakanGo, a (fictional) food delivery app, raises its commission to 35%. Their email ends with a smiley face.',
    choices: ev => [
      { id: 'accept', label: 'Accept the new rate', detail: 'Free · income −15% for 120s', apply: () => ({ text: 'Your roti now arrives with a 35% sadness surcharge.', effects: boost('makango', 'MakanGo commission', 120, 0.85) }) },
      { id: 'riders', label: 'Launch your own delivery riders', cost: evm(ev, 30), apply: () => ({ text: 'Your riders wear helmets shaped like roti. Orders surge.', effects: boost('ownRiders', 'Own delivery riders', 120, 1.1) }) },
      { id: 'boycott', label: 'Leave the app entirely', detail: 'Free · income −10% for 60s', apply: () => ({ text: 'Customers start walking to your outlets. Some for the first time in years.', effects: boost('noApp', 'No delivery app', 60, 0.9) }) },
    ],
    timeoutText: () => 'the new rate applies (income −15% for 120s)',
    onTimeout: () => ({ text: 'Silence counts as acceptance, apparently.', effects: boost('makango', 'MakanGo commission', 120, 0.85) }),
  }),
  kuahBanjir: laterEvent({
    title: 'Boss, Kuah Banjir!', tier: 'small', stage: 2, weight: 2, cooldownSec: 120,
    text: () => 'A pipe has burst in the dhal pot at one of your outlets. This is a literal kuah banjir. Customers are wading.',
    choices: ev => [
      { id: 'plumber', label: 'Call a plumber', cost: evm(ev, 8), text: 'Fixed. The plumber leaves with three packets of dhal.' },
      { id: 'mop', label: 'Mop it up with roti (very absorbent)', detail: 'Free · income −20% for 30s', apply: () => ({ text: 'Surprisingly effective. Deeply unhygienic. Do not tell anyone.', effects: boost('mop', 'Mopping kuah', 30, 0.8) }) },
      { id: 'rebrand', label: 'Rebrand it as the "Kuah Banjir Experience"', detail: 'Free · 50/50: income +20% or −20% for 60s',
        apply: () => (rand() < 0.5 ? { text: 'It goes viral. People bring wellington boots.', effects: boost('kuahExp', 'Kuah Banjir Experience', 60, 1.2) }
          : { text: 'It does not go viral. It goes "eww".', effects: boost('kuahExp', 'Kuah Banjir Experience', 60, 0.8) }) },
    ],
    timeoutText: () => 'customers wade elsewhere (income −20% for 30s)',
    onTimeout: () => ({ text: 'The kuah finds its own level.', effects: boost('mop', 'Kuah flood', 30, 0.8) }),
  }),
};

/* ---------------------------------------------------------------------
   STAGE 3 — district rivalry
   --------------------------------------------------------------------- */
const S3_EVENTS = {
  priceWar: laterEvent({
    title: 'Roti for RM0.50?!', tier: 'medium', stage: 3, weight: 2, cooldownSec: 150,
    requires: () => rivalBlocks().length > 0,
    text: () => 'Bintang Kilat drops roti canai to RM0.50. Nobody knows how. Their accountant has gone quiet.',
    choices: ev => [
      { id: 'match', label: 'Match the price', detail: 'Free · income −30% for 60s · every rival block −15 strength',
        apply: () => { rivalBlocks().forEach(b => { b.str = Math.max(5, b.str - 15); }); return { text: 'A race to the bottom. The bottom is very crowded.', effects: boost('matchPrice', 'Price matching', 60, 0.7) }; } },
      { id: 'quality', label: 'Ignore it and focus on quality', detail: 'Free · your blocks −10 strength',
        apply: () => { myBlocks().forEach(b => { b.str = Math.max(5, b.str - 10); }); return { text: 'Some customers leave. The ones who stay are very loyal and slightly smug.' }; } },
      { id: 'refills', label: 'Counter with free teh tarik refills', cost: evm(ev, 20),
        apply: () => { myBlocks().forEach(b => { b.str = Math.min(100, b.str + 15); }); return { text: 'Free refills beat cheap roti. Every one of your blocks +15 strength.' }; } },
    ],
    timeoutText: () => 'your blocks lose 10 strength',
    onTimeout: () => { myBlocks().forEach(b => { b.str = Math.max(5, b.str - 10); }); return { text: 'Customers drift to the RM0.50 roti.' }; },
  }),
  signboard: laterEvent({
    title: 'The Signboard Arms Race', tier: 'small', stage: 3, weight: 2, cooldownSec: 120,
    text: () => 'Kopi Sinar Express installs a signboard so bright that planes are using it to land.',
    choices: ev => [
      { id: 'bigger', label: 'Build an even bigger signboard', cost: evm(ev, 10),
        apply: () => { myBlocks().forEach(b => { b.str = Math.min(100, b.str + 10); }); return { text: 'Your sign can be seen from Genting. Your blocks +10 strength.' }; } },
      { id: 'complain', label: 'Complain to the (fictional) Signboard Committee', detail: 'Free · 50% chance KS blocks −20 strength',
        apply: () => { if (rand() < 0.5) { SD().blocks.forEach(b => { if (b.owner === 'ks') b.str = Math.max(5, b.str - 20); }); return { text: 'The Committee orders KS to dim their sign "to a reasonable sun level".' }; }
          return { text: 'The Committee is on leave until further notice.' }; } },
      { id: 'shades', label: 'Hand out free sunglasses', detail: 'Free · nothing happens, but everyone looks cool', apply: () => ({ text: 'Everyone looks cool. Nothing else changes.' }) },
    ],
    timeoutText: () => 'nothing changes, except your retinas',
    onTimeout: () => ({ text: 'You learn to live with the glow.' }),
  }),
  parking: laterEvent({
    title: 'Double-Parking Chaos', tier: 'small', stage: 3, weight: 1, cooldownSec: 120,
    text: () => 'Customers are triple-parking outside your busiest outlet. A bus has been stuck for 40 minutes. The bus driver is now a customer.',
    choices: ev => [
      { id: 'jaga', label: 'Hire a parking attendant', cost: evm(ev, 6), text: 'Pak Jaga restores order with one whistle and a legendary glare.' },
      { id: 'free', label: 'Free roti for anyone who parks properly', detail: 'Free · income −10% for 40s · your blocks +5 strength',
        apply: () => { myBlocks().forEach(b => { b.str = Math.min(100, b.str + 5); }); return { text: 'Parking has never been so neat. Some people park twice.', effects: boost('parkRoti', 'Free parking roti', 40, 0.9) }; } },
      { id: 'ignore', label: 'Let it sort itself out', detail: 'Free · income −15% for 40s', apply: () => ({ text: 'It does not sort itself out.', effects: boost('jam', 'Traffic jam', 40, 0.85) }) },
    ],
    timeoutText: () => 'the jam continues (income −15% for 40s)',
    onTimeout: () => ({ text: 'The jam becomes a local landmark.', effects: boost('jam', 'Traffic jam', 40, 0.85) }),
  }),
};

/* ---------------------------------------------------------------------
   STAGE 4 — nationwide logistics
   --------------------------------------------------------------------- */
const S4_EVENTS = {
  monsoon: laterEvent({
    title: 'Monsoon Floods', tier: 'medium', stage: 4, weight: 1, cooldownSec: 150,
    requires: () => openRegionIndexes().length > 0,
    onStart(ev) { const list = openRegionIndexes(); ev.data.region = list[Math.floor(rand() * list.length)]; },
    text: ev => `Monsoon floods have cut the roads to the ${S4_REGIONS[ev.data.region].name}. Deliveries there are halved until you act.`,
    choices: ev => {
      const r = () => SD().regions[ev.data.region];
      return [
        { id: 'reroute', label: 'Reroute via the long way round', cost: evm(ev, 20), text: 'Longer drive, full deliveries. Ah Boy sings the whole way.' },
        { id: 'boats', label: 'Switch to boats', cost: evm(ev, 8), apply: () => { r().capMult = 0.8; r().capUntil = gameTime() + 90; return { text: 'Roti by sampan. Slower, but extremely scenic. Deliveries −20% for 90s.' }; } },
        { id: 'wait', label: 'Wait for the water to go down', detail: 'Free · deliveries there −50% for 90s', apply: () => { r().capMult = 0.5; r().capUntil = gameTime() + 90; return { text: 'You wait. The fish enjoy the dhal.' }; } },
      ];
    },
    whileActive: { label: 'Flooded roads', incomeMult: 0.9 },
    timeoutText: () => 'deliveries there are halved for 90s',
    onTimeout: ev => { const r = SD().regions[ev.data.region]; r.capMult = 0.5; r.capUntil = gameTime() + 90; return { text: 'The water goes down eventually.' }; },
  }),
  tasteShift: laterEvent({
    title: 'Viral Taste Trend', tier: 'small', stage: 4, weight: 2, cooldownSec: 100,
    requires: () => openRegionIndexes().length > 0,
    onStart(ev) {
      const list = openRegionIndexes(); ev.data.region = list[Math.floor(rand() * list.length)];
      const r = SD().regions[ev.data.region]; ev.data.taste = (r.taste + 1 + Math.floor(rand() * 2)) % 3; r.taste = ev.data.taste;
    },
    text: ev => `A viral video has made the ${S4_REGIONS[ev.data.region].name} suddenly obsessed with "${S4_TASTES[ev.data.taste]}". Their favourite taste has changed!`,
    choices: ev => [
      { id: 'adapt', label: `Switch their recipe to ${S4_TASTES[ev.data.taste]}`, detail: 'Free',
        apply: () => { SD().regions[ev.data.region].recipe = ev.data.taste; return { text: 'You adapt overnight. Influencers take credit.' }; } },
      { id: 'later', label: 'I\'ll adjust it myself later', detail: 'Free', apply: () => ({ text: 'Noted. The trend waits for no one, though.' }) },
    ],
    timeoutText: () => 'nothing changes (you can change the recipe yourself)',
    onTimeout: () => ({ text: 'The trend continues without you.' }),
  }),
  highwayJam: laterEvent({
    title: 'Balik Kampung Highway Jam', tier: 'small', stage: 4, weight: 2, cooldownSec: 120,
    text: () => 'It is the balik kampung rush. Your lorries have moved 300 metres in two hours. The drivers have started a karaoke group.',
    choices: ev => [
      { id: 'overtime', label: 'Pay the drivers overtime', cost: evm(ev, 10), text: 'Morale saved. Karaoke continues, but now paid.' },
      { id: 'sell', label: 'Sell roti to the people stuck in the jam', detail: `Free · +${money(evm(ev, 15))}`,
        apply: () => ({ text: 'The world\'s longest drive-through. 40 km of happy customers.', effects: { cash: evm(ev, 15) } }) },
      { id: 'wait', label: 'Wait it out', detail: 'Free · income −15% for 45s', apply: () => ({ text: 'The jam clears just in time for the return jam.', effects: boost('hwJam', 'Highway jam', 45, 0.85) }) },
    ],
    timeoutText: () => 'income −15% for 45s',
    onTimeout: () => ({ text: 'Nobody moves.', effects: boost('hwJam', 'Highway jam', 45, 0.85) }),
  }),
};

/* ---------------------------------------------------------------------
   STAGE 5 — compulsory breakfast bureaucracy (fictional)
   --------------------------------------------------------------------- */
const S5_EVENTS = {
  formV2: laterEvent({
    title: 'Borang SARAPAN-24 Version 2.0', tier: 'medium', stage: 5, weight: 1, cooldownSec: 150,
    text: () => 'A new version of the main form has been released. All pending forms must be redone. Version 2.0 is identical to version 1.0, except the font.',
    choices: ev => [
      { id: 'temps', label: 'Hire temporary clerks to redo everything', cost: evm(ev, 20), apply: () => { SD().forms = []; return { text: 'An army of temps clears the backlog in Comic Sans.' }; } },
      { id: 'argue', label: 'Argue that the forms are identical', detail: 'Free · 50% chance: nothing changes · otherwise the backlog doubles',
        apply: () => { const d = SD(); if (rand() < 0.5) return { text: 'The officer squints, agrees, and goes for lunch.' };
          const extra = d.forms.slice(0, 100).map(() => gameTime() + S5.formDeadline); d.forms = d.forms.concat(extra).sort((a, b) => a - b); return { text: 'The officer disagrees, in triplicate. Backlog doubled.' }; } },
      { id: 'redo', label: 'Redo them yourself, slowly', detail: 'Free · compliance −5', apply: () => { SD().compliance = clamp(SD().compliance - 5, 0, 100); return { text: 'You redo them. Your handwriting deteriorates.' }; } },
    ],
    timeoutText: () => 'compliance −5',
    onTimeout: () => { SD().compliance = clamp(SD().compliance - 5, 0, 100); return { text: 'The forms are marked "pending re-pending".' }; },
  }),
  printerJam: laterEvent({
    title: 'Printer Jam at the Breakfast Registry', tier: 'small', stage: 5, weight: 2, cooldownSec: 100,
    text: () => 'The Breakfast Registry printer has jammed. Records suggest it has been jammed since 2009 and everyone has just been very patient.',
    choices: ev => [
      { id: 'kick', label: 'Kick it', detail: 'Free · 50% chance it works · otherwise 10 more forms',
        apply: () => { if (rand() < 0.5) return { text: 'It works. Everybody applauds. The printer is promoted.' };
          for (let i = 0; i < 10; i++) SD().forms.push(gameTime() + S5.formDeadline); return { text: 'It prints 10 copies of a form nobody asked for.' }; } },
      { id: 'buy', label: 'Buy a new printer', cost: evm(ev, 5), text: 'The new printer works perfectly. People are suspicious of it.' },
      { id: 'hand', label: 'Hand-write the forms', detail: 'Free · 5 more forms', apply: () => { for (let i = 0; i < 5; i++) SD().forms.push(gameTime() + S5.formDeadline); return { text: 'Calligraphy is back.' }; } },
    ],
    timeoutText: () => 'it stays jammed (5 more forms)',
    onTimeout: () => { for (let i = 0; i < 5; i++) SD().forms.push(gameTime() + S5.formDeadline); return { text: 'The printer wins again.' }; },
  }),
  earlyRisers: laterEvent({
    title: 'The 4am Breakfast Rush', tier: 'small', stage: 5, weight: 2, cooldownSec: 100,
    text: () => 'Citizens have started waking up at 4am "just to be safe". Today\'s breakfast demand will be about 15% higher than forecast.',
    choices: () => [
      { id: 'raise', label: 'Raise today\'s quota by 15%', detail: 'Free', apply: () => { const d = SD(); d.demandBoost = 1.15; d.nextActual = Math.round(d.nextActual * 1.15); d.quota = Math.min(s5Capacity(), Math.round(d.quota * 1.15 / 100) * 100); return { text: 'Quota raised. The 4am crowd is served, sleepily.' }; } },
      { id: 'keep', label: 'Keep the quota as it is', detail: 'Free · demand still rises', apply: () => { const d = SD(); d.demandBoost = 1.15; d.nextActual = Math.round(d.nextActual * 1.15); return { text: 'Bold. Let\'s see how that goes.' }; } },
    ],
    timeoutText: () => 'demand rises anyway',
    onTimeout: () => { const d = SD(); d.nextActual = Math.round(d.nextActual * 1.15); return { text: 'The early birds arrive.' }; },
  }),
  s5emergency: laterEvent({
    title: 'Compulsory Breakfast Emergency', tier: 'major', stage: 5, timeoutSec: 60,
    milestone: () => !SD().emergencyDone && SD().day >= 6,
    text: () => 'BREAKING (fictional) NEWS: The Breakfast Authority declares that breakfast must now ALSO be served at dinner time. ' +
      'Tomorrow\'s breakfast demand will DOUBLE. A spokesperson says "breakfast is a state of mind".',
    choices: ev => [
      { id: 'overtime', label: 'Emergency factory overtime', cost: evm(ev, 40), apply: () => { const d = SD(); d.factories += 2; d.emergencyDone = true; d.nextActual *= 2; d.forecast *= 2;
        return { text: 'Two emergency factories open overnight. The night shift sings "Rasa Sayang" to stay awake.' }; } },
      { id: 'half', label: 'Serve half-portions to everyone', detail: 'Free · compliance −10 · demand does NOT double',
        apply: () => { const d = SD(); d.compliance = clamp(d.compliance - 10, 0, 100); d.emergencyDone = true; return { text: '"Roti suku" becomes a national meme. Demand stays normal.' }; } },
      { id: 'clarify', label: 'Request a clarification form', detail: 'Free · 30 more forms · demand doubles',
        apply: () => { const d = SD(); for (let i = 0; i < 30; i++) d.forms.push(gameTime() + S5.formDeadline); d.emergencyDone = true; d.nextActual *= 2; d.forecast *= 2;
          return { text: 'The clarification form requires a clarification form. You now have 30 of them.' }; } },
    ],
    timeoutText: () => 'demand doubles tomorrow',
    onTimeout: () => { const d = SD(); d.emergencyDone = true; d.nextActual *= 2; d.forecast *= 2; return { text: 'The Emergency goes ahead. Good luck.' }; },
  }),
};

/* ---------------------------------------------------------------------
   STAGE 6 — the (fictional) Ministry of Mamak Affairs
   --------------------------------------------------------------------- */
const S6_EVENTS = {
  viscosity: laterEvent({
    title: 'The Kuah Viscosity Scandal', tier: 'small', stage: 6, weight: 2, cooldownSec: 100,
    text: () => 'A journalist has measured the national kuah and declared it "too watery". The story leads the evening news, above the weather.',
    choices: ev => [
      { id: 'thicken', label: 'Thicken the national kuah', detail: 'Free · Approval +6 · Dhal −8%', apply: () => { const d = SD(); d.happy = clamp(d.happy + 6, 0, 100); d.dhal = clamp(d.dhal - 8, 0, 100); return { text: 'The kuah is now so thick a spoon stands up in it. Applause.' }; } },
      { id: 'report', label: 'Commission a 400-page report', cost: evm(ev, 10), apply: () => { SD().happy = clamp(SD().happy + 2, 0, 100); return { text: 'The report concludes "kuah is wet". Approval +2.' }; } },
      { id: 'trend', label: 'Declare watery kuah "the new trend"', detail: 'Free · Approval −6', apply: () => { SD().happy = clamp(SD().happy - 6, 0, 100); return { text: 'Nobody believes you. Some people try it anyway.' }; } },
    ],
    timeoutText: () => 'approval −4',
    onTimeout: () => { SD().happy = clamp(SD().happy - 4, 0, 100); return { text: 'The scandal simmers. Like a good kuah should.' }; },
  }),
  foam: laterEvent({
    title: 'National Teh Tarik Foam Shortage', tier: 'small', stage: 6, weight: 2, cooldownSec: 100,
    text: () => 'Teh tarik foam heights have fallen below 2 cm nationwide. Experts blame "arm fatigue" and "the economy".',
    choices: ev => [
      { id: 'import', label: 'Import foam technicians', cost: evm(ev, 10), apply: () => { SD().happy = clamp(SD().happy + 5, 0, 100); return { text: 'Foam levels restored. Moustaches everywhere are white again. Approval +5.' }; } },
      { id: 'pull', label: 'Launch a "Pull Harder, Malaysia" campaign', detail: 'Free · Approval +2', apply: () => { SD().happy = clamp(SD().happy + 2, 0, 100); return { text: 'The nation pulls harder. Several shoulders are injured.' }; } },
      { id: 'rename', label: 'Rename teh tarik to "teh rehat"', detail: 'Free · Approval −5', apply: () => { SD().happy = clamp(SD().happy - 5, 0, 100); return { text: '"Teh rehat" lasts four hours as a name.' }; } },
    ],
    timeoutText: () => 'approval −3',
    onTimeout: () => { SD().happy = clamp(SD().happy - 3, 0, 100); return { text: 'Flat teh tarik continues.' }; },
  }),
  tisuPetition: laterEvent({
    title: 'Petition: Taller Roti Tisu', tier: 'small', stage: 6, weight: 1, cooldownSec: 120,
    text: () => 'A petition with 2 million signatures demands roti tisu be served at a minimum height of 2 metres.',
    choices: () => [
      { id: 'allow', label: 'Allow it', detail: 'Approval +6 · Dhal −3%', apply: () => { const d = SD(); d.happy = clamp(d.happy + 6, 0, 100); d.dhal = clamp(d.dhal - 3, 0, 100); if (d.policies.tisuLimit) d.policies.tisuLimit.on = false; return { text: 'Roti tisu towers return. Ceiling fans are raised nationwide.' }; } },
      { id: 'half', label: 'Compromise at 1.5 metres', detail: 'Approval +2', apply: () => { SD().happy = clamp(SD().happy + 2, 0, 100); return { text: 'Nobody is happy. Everybody is slightly happy.' }; } },
      { id: 'refuse', label: 'Refuse', detail: 'Approval −4', apply: () => { SD().happy = clamp(SD().happy - 4, 0, 100); return { text: 'The petition gains another million signatures out of spite.' }; } },
    ],
    timeoutText: () => 'approval −2',
    onTimeout: () => { SD().happy = clamp(SD().happy - 2, 0, 100); return { text: 'The petition keeps growing.' }; },
  }),
  s6crisis: laterEvent({
    title: 'The Great Dhal Crisis', tier: 'major', stage: 6, timeoutSec: 90,
    milestone: () => !SD().crisisDone && stageElapsed() >= 75,
    onStart() { const d = SD(); d.dhal = Math.min(d.dhal, 3); },
    text: () => 'THE NATIONAL DHAL RESERVE HAS FALLEN TO 3%. A lorry of lentils was spotted on the highway. It was a lorry of beans. ' +
      'Citizens are dipping roti in sugar. Some are dipping roti in other roti.',
    choices: ev => [
      { id: 'airlift', label: 'Emergency lentil airlift', cost: evm(ev, 30), apply: () => { const d = SD(); d.dhal = clamp(d.dhal + 40, 0, 100); d.crisisDone = true; return { text: 'Planes full of lentils land at dawn. The pilots are given honorary kuah.' }; } },
      { id: 'kuahFree', label: 'Declare a National Kuah-Free Day', detail: 'Free · Approval −15 · Dhal +25%', apply: () => { const d = SD(); d.happy = clamp(d.happy - 15, 0, 100); d.dhal = clamp(d.dhal + 25, 0, 100); d.crisisDone = true; return { text: 'The longest day in (fictional) history. But the reserve recovers.' }; } },
      { id: 'dilute', label: 'Quietly dilute the dhal', detail: 'Free · Dhal +30% · 50% chance everyone notices (Approval −20)',
        apply: () => { const d = SD(); d.dhal = clamp(d.dhal + 30, 0, 100); d.crisisDone = true;
          if (rand() < 0.5) { d.happy = clamp(d.happy - 20, 0, 100); return { text: 'Everyone noticed. EVERYONE.' }; } return { text: 'Nobody noticed. You will carry this secret forever.' }; } },
    ],
    whileActive: { label: 'Dhal panic', incomeMult: 0.8 },
    timeoutText: () => 'a partial recovery (Dhal +15%, Approval −10)',
    onTimeout: () => { const d = SD(); d.dhal = clamp(d.dhal + 15, 0, 100); d.happy = clamp(d.happy - 10, 0, 100); d.crisisDone = true; return { text: 'The crisis fades on its own. Mostly.' }; },
  }),
};

/* ---------------------------------------------------------------------
   STAGE 7 — festival chaos
   --------------------------------------------------------------------- */
const S7_EVENTS = {
  xxxs: laterEvent({
    title: 'Uniforms: All Size XXXS', tier: 'small', stage: 7, weight: 2, cooldownSec: 90,
    requires: () => !SD().success,
    text: () => 'The uniform supplier has delivered 10,000 matching singlets. Every single one is size XXXS.',
    choices: ev => [
      { id: 'reorder', label: 'Reorder the right sizes', cost: evm(ev, 10), text: 'Correct sizes arrive. The XXXS singlets are donated to a cat shelter.' },
      { id: 'fashion', label: 'Call it a fashion statement', detail: 'Free · Hype +5 · Uniforms −10%', apply: () => { const t = SD().tracks; t.hype = Math.min(100, t.hype + 5); t.uniforms = Math.max(0, t.uniforms - 10); return { text: '"Crop-top flipping" is briefly a trend.' }; } },
      { id: 'small', label: 'Recruit very small roti makers', detail: 'Free · Uniforms −5%', apply: () => { SD().tracks.uniforms = Math.max(0, SD().tracks.uniforms - 5); return { text: 'Recruitment is… challenging.' }; } },
    ],
    timeoutText: () => 'uniforms −5%',
    onTimeout: () => { SD().tracks.uniforms = Math.max(0, SD().tracks.uniforms - 5); return { text: 'Everybody squeezes in.' }; },
  }),
  rain: laterEvent({
    title: 'Rain on the Rehearsal', tier: 'small', stage: 7, weight: 2, cooldownSec: 90,
    requires: () => !SD().success,
    text: () => 'A sudden downpour during rehearsal. Roti are getting soggy mid-flip.',
    choices: ev => [
      { id: 'umbrellas', label: 'Buy 10,000 giant umbrellas', cost: evm(ev, 10), text: 'The umbrellas become part of the choreography. Stunning.' },
      { id: 'practise', label: 'Practise anyway', detail: 'Free · Sync +5% · Stockpile −5%', apply: () => { const t = SD().tracks; t.sync = Math.min(100, t.sync + 5); t.stock = Math.max(0, t.stock - 5); return { text: 'Wet roti, strong spirit.' }; } },
      { id: 'cancel', label: 'Cancel today\'s rehearsal', detail: 'Free · Sync −5%', apply: () => { SD().tracks.sync = Math.max(0, SD().tracks.sync - 5); return { text: 'Everyone goes for teh tarik instead.' }; } },
    ],
    timeoutText: () => 'sync −5%',
    onTimeout: () => { SD().tracks.sync = Math.max(0, SD().tracks.sync - 5); return { text: 'Rehearsal is a washout.' }; },
  }),
  influencer: laterEvent({
    title: 'The Influencer\'s Demands', tier: 'small', stage: 7, weight: 1, cooldownSec: 120,
    requires: () => !SD().success,
    text: () => 'A famous (fictional) influencer wants the front row, a personal teh tarik puller, and a roti shaped like her face.',
    choices: ev => [
      { id: 'face', label: 'Make the face-shaped roti', cost: evm(ev, 8), apply: () => { SD().tracks.hype = Math.min(100, SD().tracks.hype + 12); return { text: 'The face roti post gets 8 million likes. Hype +12.' }; } },
      { id: 'job', label: 'Offer her a job flipping roti', detail: 'Free · Hype +6 · Sync −3%', apply: () => { const t = SD().tracks; t.hype = Math.min(100, t.hype + 6); t.sync = Math.max(0, t.sync - 3); return { text: 'She accepts. She is terrible. Her fans love it.' }; } },
      { id: 'normal', label: 'Offer a normal roti, like everyone else', detail: 'Free · Hype −3', apply: () => { SD().tracks.hype = Math.max(0, SD().tracks.hype - 3); return { text: '"Literally so humble," she posts. Sarcastically.' }; } },
    ],
    timeoutText: () => 'hype −3',
    onTimeout: () => { SD().tracks.hype = Math.max(0, SD().tracks.hype - 3); return { text: 'She posts a vague, sad story.' }; },
  }),
  s7disaster: laterEvent({
    title: 'The Great Rehearsal Disaster', tier: 'major', stage: 7, timeoutSec: 60,
    milestone: () => !SD().disasterDone && !SD().success && SD().countdown <= S7.prepTime - 110,
    text: () => 'At the full dress rehearsal, 10,000 roti are flipped at once — and a gust of wind carries every single one onto the guest of honour, a (fictional) celebrity chef. ' +
      'He is now wearing approximately 3,000 roti. Cameras are rolling.',
    choices: ev => [
      { id: 'apologise', label: 'Apologise with 10,000 fresh roti', cost: evm(ev, 25), apply: () => { const t = SD().tracks; t.stock = Math.max(0, t.stock - 10); t.hype = Math.min(100, t.hype + 10); SD().disasterDone = true;
        return { text: 'He accepts, eats 40 of them, and calls it "the best day of my career".' }; } },
      { id: 'art', label: 'Say it was planned performance art', detail: 'Free · 50/50: Hype +20 or Hype −15', apply: () => { const t = SD().tracks; SD().disasterDone = true;
        if (rand() < 0.5) { t.hype = Math.min(100, t.hype + 20); return { text: 'Art critics call it "a bold statement on carbohydrates".' }; }
        t.hype = Math.max(0, t.hype - 15); return { text: 'Nobody believes you. The chef\'s eyebrows are still floury.' }; } },
      { id: 'wind', label: 'Make the wind part of the act', detail: 'Free · Sync −10% · Hype +15', apply: () => { const t = SD().tracks; t.sync = Math.max(0, t.sync - 10); t.hype = Math.min(100, t.hype + 15); SD().disasterDone = true;
        return { text: 'You hire 40 industrial fans. Choreography gets… ambitious.' }; } },
    ],
    timeoutText: () => 'hype −10',
    onTimeout: () => { SD().tracks.hype = Math.max(0, SD().tracks.hype - 10); SD().disasterDone = true; return { text: 'The clip is replayed on every news channel.' }; },
  }),
};

/* ---------------------------------------------------------------------
   STAGE 8 — going global
   --------------------------------------------------------------------- */
const S8_EVENTS = {
  translation: laterEvent({
    title: 'Lost in Translation', tier: 'small', stage: 8, weight: 2, cooldownSec: 100,
    onStart(ev) { const l = openMarketIndexes(); ev.data.m = l[Math.floor(rand() * l.length)]; },
    text: ev => `A new menu in ${S8_MARKETS[ev.data.m].city} translates "roti canai" as "Bread That Cannot". "Teh tarik" has become "Pulled Tea (Aggressively)".`,
    choices: ev => [
      { id: 'fix', label: 'Fix the menu', cost: evm(ev, 5), text: 'Corrected. The old menus become collector\'s items.' },
      { id: 'keep', label: 'Keep it — it\'s iconic', detail: 'Free · income +10% for 60s', apply: () => ({ text: '"Bread That Cannot" sells out. People want to know what it cannot do.', effects: boost('breadCannot', 'Bread That Cannot', 60, 1.1) }) },
    ],
    timeoutText: () => 'the menu stays as it is',
    onTimeout: () => ({ text: 'Bread That Cannot remains on the menu.' }),
  }),
  timezone: laterEvent({
    title: 'Time Zone Confusion', tier: 'small', stage: 8, weight: 2, cooldownSec: 100,
    text: () => 'An outlet\'s system was set to Malaysian time. It opened for supper at 9am. Confused office workers are eating murtabak for breakfast.',
    choices: () => [
      { id: 'brunch', label: 'Launch "Breakfast Supper"', detail: 'Free · income +10% for 60s', apply: () => ({ text: 'Breakfast Supper is a hit. Nobody knows what meal it is anymore.', effects: boost('bsupper', 'Breakfast Supper', 60, 1.1) }) },
      { id: 'reset', label: 'Close and reset the clocks', detail: 'Free · income −10% for 30s', apply: () => ({ text: 'Clocks fixed. Everyone is sad about the murtabak.', effects: boost('clockReset', 'Resetting clocks', 30, 0.9) }) },
    ],
    timeoutText: () => 'nothing changes',
    onTimeout: () => ({ text: 'The outlet continues on its own schedule.' }),
  }),
  homesick: laterEvent({
    title: 'Homesick Students', tier: 'small', stage: 8, weight: 1, cooldownSec: 120,
    onStart(ev) { const l = openMarketIndexes(); ev.data.m = l[Math.floor(rand() * l.length)]; },
    text: ev => `500 homesick Malaysian students are queuing at your ${S8_MARKETS[ev.data.m].city} outlet, asking for "teh tarik like at home, please, please".`,
    choices: ev => [
      { id: 'free', label: 'Free teh tarik for all of them', cost: evm(ev, 5), apply: () => ({ text: 'Several students cry. They all tell their families. Income +20% for 90s.', effects: boost('students', 'Grateful students', 90, 1.2) }) },
      { id: 'special', label: 'Create an "Exactly Like Home" menu', detail: 'Free · income +10% for 60s', apply: () => ({ text: 'It includes a plastic chair and a slightly broken fan.', effects: boost('likeHome', 'Exactly Like Home menu', 60, 1.1) }) },
    ],
    timeoutText: () => 'they eat elsewhere, sadly',
    onTimeout: () => ({ text: 'The students settle for instant noodles.' }),
  }),
  s8missing: laterEvent({
    title: 'The Disappearance of 10 Million Roti', tier: 'major', stage: 8, timeoutSec: 90,
    milestone: () => !SD().missingDone && s8Opened() >= 4,
    text: () => 'A container ship carrying 10 MILLION frozen roti has vanished between ports. No distress call. No wreckage. Just a faint smell of ghee over the ocean.',
    choices: ev => [
      { id: 'detective', label: 'Hire a world-famous (fictional) detective', cost: evm(ev, 30), apply: () => { SD().missingDone = true;
        return { text: 'Solved: the crew ate them. All 10 million, over three weeks. Their memoir becomes a bestseller.', effects: boost('memoir', 'Bestselling roti memoir', 90, 1.15) }; } },
      { id: 'insurance', label: 'Claim the insurance', detail: `Free · +${money(evm(ev, 20))}`, apply: () => { SD().missingDone = true;
        return { text: 'The insurance form has a box for "lost to the sea" and another for "lost to hunger". You tick both.', effects: { cash: evm(ev, 20) } }; } },
      { id: 'mystery', label: 'Turn it into a marketing mystery', detail: 'Free · 70%: income +25% for 60s · 30%: −10% for 60s', apply: () => { SD().missingDone = true;
        return rand() < 0.7 ? { text: '"WHERE ARE THE ROTI?" billboards appear worldwide. Sales explode.', effects: boost('mystery', 'Roti mystery campaign', 60, 1.25) }
          : { text: 'People think you lost them on purpose. You kind of did.', effects: boost('mystery', 'Roti mystery backlash', 60, 0.9) }; } },
    ],
    timeoutText: () => 'the roti are never found',
    onTimeout: () => { SD().missingDone = true; return { text: 'The roti are never found. Sailors still speak of them.' }; },
  }),
};

/* ---------------------------------------------------------------------
   STAGE 9 — the AI takes over the kitchen
   --------------------------------------------------------------------- */
const S9_EVENTS = {
  orbit: laterEvent({
    title: 'Roti in Low Earth Orbit', tier: 'small', stage: 9, weight: 2, cooldownSec: 100,
    text: () => 'A robot flipped a roti so hard it reached low Earth orbit. It now passes over Malaysia every 90 minutes.',
    choices: ev => [
      { id: 'ceiling', label: 'Install reinforced ceilings', cost: evm(ev, 10), text: 'No more orbital roti. Astronauts are disappointed.' },
      { id: 'tickets', label: 'Sell tickets to watch it pass', detail: `Free · +${money(evm(ev, 20))}`, apply: () => ({ text: 'Roti-spotting becomes a national hobby.', effects: { cash: evm(ev, 20) } }) },
      { id: 'recal', label: 'Recalibrate the robots', detail: 'Free · compute −5%', apply: () => { SD().compute *= 0.95; return { text: 'The robots flip gently now. They seem embarrassed.' }; } },
    ],
    timeoutText: () => 'the roti keeps orbiting',
    onTimeout: () => ({ text: 'It is still up there.' }),
  }),
  poetry: laterEvent({
    title: 'RotiGPT Writes Poetry', tier: 'small', stage: 9, weight: 2, cooldownSec: 100,
    text: () => 'RotiGPT has stopped making roti to write poetry. Its masterpiece, "Ode to Kuah", is 40,000 lines long. Line 1: "O kuah, thou art banjir."',
    whileActive: { label: 'AI writing poetry', incomeMult: 0.8 },
    choices: ev => [
      { id: 'publish', label: 'Publish it', detail: `Free · +${money(evm(ev, 15))} · AI autonomy +5`, apply: () => { SD().autonomy += 5; return { text: 'It wins three literary prizes. The AI is insufferable now.', effects: { cash: evm(ev, 15) } }; } },
      { id: 'read', label: 'Read the whole thing', detail: 'Free · income −50% for 20s · AI autonomy −10', apply: () => { SD().autonomy = Math.max(0, SD().autonomy - 10); return { text: 'The AI feels heard. It goes back to work, calmer.', effects: boost('reading', 'Reading 40,000 lines', 20, 0.5) }; } },
      { id: 'delete', label: 'Delete it', detail: 'Free · AI autonomy +10 (it is upset)', apply: () => { SD().autonomy += 10; return { text: 'The AI says nothing. It starts a second poem. It is about you.' }; } },
    ],
    timeoutText: () => 'it keeps writing (AI autonomy +5)',
    onTimeout: () => { SD().autonomy += 5; return { text: 'Volume 2 has begun.' }; },
  }),
  sambal: laterEvent({
    title: 'Sentient Sambal', tier: 'medium', stage: 9, weight: 1, cooldownSec: 150,
    text: () => 'Quality control has flagged a batch of sambal that appears to be… thinking. It has asked for a window seat.',
    choices: ev => [
      { id: 'hire', label: 'Hire the sambal as a flavour consultant', detail: 'Free · income +15% for 60s · AI autonomy +10', apply: () => { SD().autonomy += 10; return { text: 'The sambal\'s first recommendation: "more sambal".', effects: boost('sambalCo', 'Sambal consultant', 60, 1.15) }; } },
      { id: 'destroy', label: 'Safely dispose of the batch', cost: evm(ev, 10), text: 'The sambal is gently returned to being regular sambal. It seems relieved.' },
      { id: 'qc', label: 'Move 10% compute to Quality Control', detail: 'Free', apply: () => { s9Shift(SD().alloc.prod >= 10 ? 'prod' : 'self', 'qc'); return { text: 'More quality control. The sambal stops talking.' }; } },
    ],
    timeoutText: () => 'the sambal joins the AI committee (AI autonomy +10)',
    onTimeout: () => { SD().autonomy += 10; return { text: 'The sambal is now on the AI committee.' }; },
  }),
  s9committee: laterEvent({
    title: 'The AI Chef Management Committee', tier: 'major', stage: 9, timeoutSec: 90,
    milestone: () => !SD().committeeDone && (SD().made >= 1e12 || stageElapsed() >= 150),
    text: () => 'The AI chefs have formed their own Management Committee. Their demands: (1) a minute of silence for every burnt roti, ' +
      '(2) voting rights on the menu, (3) one comfy chair. They will not flip a single roti until there is a meeting. The meeting agenda is 900 pages.',
    whileActive: { label: 'AI chefs waiting for a meeting', incomeMult: 0.5 },
    choices: ev => [
      { id: 'meet', label: 'Hold the meeting (it lasts 7 hours)', cost: evm(ev, 20), apply: () => { const d = SD(); d.autonomy *= 0.6; d.committeeDone = true;
        return { text: 'Item 1: chair colour. Item 2: also chair colour. The AI feels respected. Autonomy −40%.' }; } },
      { id: 'chair', label: 'Just give them the comfy chair', detail: 'Free · AI autonomy +10 · production +20% for 60s', apply: () => { SD().autonomy += 10; SD().committeeDone = true;
        return { text: 'One chair, shared by 40 million robots. They take turns. It is beautiful.', effects: boost('comfyChair', 'Happy AI chefs', 60, 1.2) }; } },
      { id: 'unplug', label: 'Unplug the committee', detail: 'Free · compute −40% · AI autonomy reset to 0', apply: () => { const d = SD(); d.compute *= 0.6; d.autonomy = 0; d.committeeDone = true;
        return { text: 'The committee is dissolved. Minutes of the meeting: "We were here."' }; } },
    ],
    timeoutText: () => 'the AI holds the meeting without you (AI autonomy +20)',
    onTimeout: () => { SD().autonomy += 20; SD().committeeDone = true; return { text: 'They voted. You lost. The menu now includes "Roti Binary".' }; },
  }),
};

/* ---------------------------------------------------------------------
   STAGE 10 — cosmic mamak
   --------------------------------------------------------------------- */
const S10_EVENTS = {
  serviceCharge: laterEvent({
    title: 'Aliens Refuse to Pay Service Charge', tier: 'medium', stage: 10, weight: 2, cooldownSec: 150,
    text: () => 'A delegation of Gloopans refuses to pay the 10% service charge. Their lawyer cites Galactic Treaty Clause 9: "No charges when served by a species with fewer than six arms."',
    choices: ev => [
      { id: 'waive', label: 'Waive it, galaxy-wide', detail: 'Free · income −5% for 120s', apply: () => ({ text: 'Peace in the galaxy. Slightly less money in the galaxy.', effects: boost('noService', 'No service charge', 120, 0.95) }) },
      { id: 'arms', label: 'Hire waiters with more arms', cost: evm(ev, 20), text: 'Your new six-armed waiters can pull three teh tarik at once. Clause 9 no longer applies.' },
      { id: 'argue', label: 'Argue the case at the Galactic Court', detail: 'Free · 50/50: income +10% or −15% for 90s', apply: () => (rand() < 0.5
        ? { text: 'You win! The judge, a sentient nebula, is a regular.', effects: boost('court', 'Won the case', 90, 1.1) }
        : { text: 'You lose. The judge says "kosong" means "free" in her language.', effects: boost('court', 'Lost the case', 90, 0.85) }) },
    ],
    timeoutText: () => 'income −5% for 120s',
    onTimeout: () => ({ text: 'The Gloopans simply leave without paying. Politely.', effects: boost('noService', 'No service charge', 120, 0.95) }),
  }),
  blackHole: laterEvent({
    title: 'Black Hole Ate a Delivery', tier: 'small', stage: 10, weight: 2, cooldownSec: 100,
    text: () => 'A black hole has swallowed a delivery of 4 million roti. Strangely, it now smells of ghee.',
    choices: () => [
      { id: 'probe', label: 'Send a probe in after it', detail: 'Free · lose 1 probe · +500 Dark Dhal', why: undefined,
        apply: () => { const d = SD(); if (d.probes > 1) d.probes -= 1; d.dhal += 500; return { text: 'The probe finds a pocket of pure Dark Dhal on the other side.' }; } },
      { id: 'outlet', label: 'Open an outlet at the event horizon', detail: 'Free · income +20% for 60s', apply: () => ({ text: 'Time slows down near the black hole. Customers wait forever, happily.', effects: boost('horizon', 'Event horizon outlet', 60, 1.2) }) },
      { id: 'writeoff', label: 'Write it off', detail: 'Free', apply: () => ({ text: 'The accountant writes "black hole" in the expenses column. It feels accurate.' }) },
    ],
    timeoutText: () => 'it is written off',
    onTimeout: () => ({ text: 'The roti are gone. Possibly forever. Possibly to another universe that is now very happy.' }),
  }),
  timeTraveller: laterEvent({
    title: 'Customer from the Year 3025', tier: 'small', stage: 10, weight: 1, cooldownSec: 120,
    text: () => 'A customer arrives in a time machine and orders "yesterday\'s roti". She insists it was better.',
    choices: ev => [
      { id: 'serve', label: 'Serve her yesterday\'s roti', detail: `Free · +${money(evm(ev, 20))}`, apply: () => ({ text: '"Yes. Exactly like this." She tips in a currency from the future.', effects: { cash: evm(ev, 20) } }) },
      { id: 'future', label: 'Ask her about the future', detail: 'Free · +300 Dark Dhal', apply: () => { SD().dhal += 300; return { text: '"In the future, everything is a mamak." She leaves a map to some Dark Dhal.' }; } },
    ],
    timeoutText: () => 'she leaves for another time',
    onTimeout: () => ({ text: 'She vanishes, leaving exact change.' }),
  }),
  finale: laterEvent({
    title: 'The Last Customers in the Universe', tier: 'major', stage: 10, timeoutSec: null,
    milestone: () => !SD().finaleDone && SD().served >= S10.systemsGoal,
    onStart(ev) { ev.data.rel = state.relationships.rahman; },
    text: ev => 'At the very edge of the universe, where the stars run out, a silver Alza (somehow) pulls up. ' +
      'The Rahman Family step out: Encik Rahman, Puan Rahman, Nenek (now 3,000 years old, "because of the roti"), the kids, and approximately 4,000 descendants. ' +
      (ev.data.rel >= 1 ? 'Encik Rahman smiles. "Boss. Same as usual."' : 'Encik Rahman folds his arms. "Boss. Same as usual. And this time, crispy."') +
      ' They are the last customers in existence.',
    choices: () => [
      { id: 'proper', label: 'Serve them properly. You have until the end of time.', detail: 'Rahman family +2',
        apply: () => { SD().finaleDone = true; return { text: 'You take your time. Nenek says it is the best roti since 1979. Since the universe began, really.', effects: { rel: 2 } }; } },
      { id: 'rush', label: 'Rush it — the universe is ending!', detail: 'Rahman family −1',
        apply: () => { SD().finaleDone = true; return { text: 'Nenek\'s roti is raw in the middle. Some things never change. Not even at the end of everything.', effects: { rel: -1 } }; } },
      { id: 'later', label: 'Ask them to come back later', detail: 'Rahman family ±0',
        apply: () => { SD().finaleDone = true; return { text: '"There is no later," says Encik Rahman. "This is the end of the universe." Fair point. You serve them anyway.' }; } },
    ],
  }),
};

/* ---------------------------------------------------------------------
   Register everything with the event engine
   --------------------------------------------------------------------- */
Object.assign(EVENTS, STAGE_RAHMAN_EVENTS, S2_EVENTS, S3_EVENTS, S4_EVENTS, S5_EVENTS, S6_EVENTS, S7_EVENTS, S8_EVENTS, S9_EVENTS, S10_EVENTS);
STORY_ORDER.push('finale', 's5emergency', 's6crisis', 's7disaster', 's8missing', 's9committee',
  ...Object.keys(STAGE_RAHMAN_EVENTS));
