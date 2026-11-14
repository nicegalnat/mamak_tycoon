# Mamak Tycoon — Game Design

## Vision

A minimalist, text-first incremental game in the style of Universal
Paperclips. It starts with a single button and keeps revealing new systems
as the business grows. The setting is Malaysian mamak culture: roti canai,
teh tarik, uncles at plastic tables, late-night football suppers.

**Tagline:** From one roti to world domination.

## The three stages

| Stage | Name | Core idea | Status |
|---|---|---|---|
| 1 | The Roadside Stall | Make roti by hand, hire staff, balance production against demand | **Built (v0.1)** |
| 2 | The Restaurant | Open a proper kedai: menu items, 24h operation, reputation | Planned |
| 3 | The Empire | Franchises, central kitchen, supply chains, then a defined ending | Planned |

## Stage 1 — The Roadside Stall

### Starting state
| Stat | Value |
|---|---|
| Cash | RM0 |
| Roti sold | 0 |
| Profit per roti | RM1.00 |
| Employees | 0 |
| Production rate | 0 roti/sec |

### Economics
- **Selling price** = profit per roti + ingredient cost (RM0.50).
  It starts at RM1.50 per roti.
- **Cash** goes up by the *profit* on each roti.
- **Lifetime revenue** (gross) goes up by the *selling price* on each roti.
  It is tracked separately from cash and from net profit.
- **Net profit** is all profit earned. Spending on upgrades doesn't reduce it.

### Upgrades
| Upgrade | First cost | Cost growth | Effect | Unlocks when |
|---|---|---|---|---|
| Hire Roti Man | RM50 | ×1.5, rounded up | +1 roti every 3 sec (0.333/s) each | Cash ≥ RM25 or 30 roti sold |
| Increase Roti Price | RM75 | ×1.8, rounded up | +RM0.25 profit per roti (manual and auto) | 60 roti sold |
| Upgrade Griddle | RM100 | ×2 | Production capacity ×1.5 (stacks) | First hire |
| Marketing | RM100 | ×1.7, rounded up | Customer demand ×1.5 (stacks) | First hire |

Cost sequences:
- Roti Man: 50, 75, 113, 170, 255…
- Griddle: 100, 200, 400, 800…
- Price: 75, 135, 243, 438…
- Marketing: 100, 170, 289, 492…

### Formulas
```
productionCapacity = employees × (1/3) × 1.5^griddleLevel      roti/sec
customerDemand     = 1 × 1.5^marketingLevel  (0 before first hire)   roti/sec
automaticSales     = min(productionCapacity, customerDemand)
```
Automatic sales build up fractionally (`rotiProgress`), so a rate of 0.33/s
sells exactly one roti every 3 seconds. Manual taps are never limited by demand.

The production panel tells the player which of the two is the bottleneck.

### Gradual reveal
1. Start: only the stats, the big button and the event log.
2. 10 roti: Milestones panel.
3. RM25 or 30 roti: Upgrades panel with Hire Roti Man.
4. 60 roti: Increase Roti Price.
5. First hire: Griddle, Marketing, and the Production vs Demand readout.

Flavour messages appear in the log at 1, 25, 100, 200, 300 and 400 roti.

### Win condition
All three must be true at the same time:
- 500 roti sold
- 3 employees hired
- RM1,000 lifetime gross revenue

Then the game shows **CONGRATULATIONS, BOSS!**, the restaurant message,
**STAGE 1 COMPLETE — RESTAURANT UNLOCKED**, final statistics, and a note
that Stage 2 is coming. Play stops (no more sales) until Stage 2 exists.

### Pacing (simulated)
| Player style | Time to finish Stage 1 | Taps |
|---|---|---|
| Active (3 taps/sec the whole time) | ~2.5 min | ~480 |
| Casual (2 taps/sec) | ~3.5 min | ~435 |
| Lazy (stops tapping once 3 staff are hired) | ~7 min | ~210 |

The revenue goal is usually the last one met (around 590 roti).
To make Stage 1 longer, raise the numbers in `stage1Goals` or the upgrade `baseCost`s in `CONFIG`.

## Saving
- `localStorage` key `mamakTycoon_save_v1`
- Autosave every 10 s, after every purchase, and when the tab is hidden or closed
- Active play time only counts while the page is visible
- No offline earnings: the game pauses while the tab is hidden
- Reset Game asks for confirmation first

## Safeguards
- Buy buttons are disabled when you can't afford the upgrade.
- Each upgrade has a 300 ms cooldown, so one tap can't buy it twice.
- `touch-action: manipulation` stops iPad double-tap zoom on buttons.
- Saved data is checked when it loads. Broken or missing values fall back to defaults.

## Ideas for later stages
- **Stage 2:** teh tarik pull mini-game, menu (Maggi goreng, nasi lemak, roti
  telur), open 24 hours, day/night supper rush, health inspector, viral review,
  rival mamak across the road, reputation.
- **Stage 3:** franchising, central kitchen, owning the flour mill and dairy,
  national expansion, then ASEAN, then a teh tarik pipeline to the moon. Defined
  ending, possibly a "return to one stall" epilogue.
- **Prestige idea:** pass the stall to the next generation and keep a
  secret-recipe bonus.

---

# v0.2 — Challenges & Events

## Goal
Make running the stall feel like running a real mamak, not just watching
numbers go up. The player deals with customers, incidents, stock and
regulations. It should be slightly more demanding than Universal
Paperclips, in the spirit of mobile restaurant and village games, without
flooding the player with pop-ups.

## Business health stats
Each stat appears only when it becomes relevant, and only affects the game once it has appeared.

| Stat | Unlocks | Effect | Changes by |
|---|---|---|---|
| Reputation (0–100, starts 50) | First Rahman visit (~40 roti) | Demand ×0.6 at 0 → ×1.0 at 50 → ×1.4 at 100 | Challenge choices. Drifts back to 50 at 0.03/s. Below 30 hygiene, it falls slowly |
| Hygiene (0–100, starts 75) | First Tikus! (~120 roti) | Inspection score, rat chance, and a reputation drain below 30 | −1 per 25 roti sold. Quick wipe +4 (free, 15 s cooldown). Deep clean +25 (RM20) |
| Staff morale (0–100, starts 75) | 2nd employee | Production ×0.5 at 0 → ×1.0 at 70 → ×1.1 max | Challenge choices. Drifts back to 70. Staff makan +20 (RM8 per staff) |
| Flour stock (0–400) | Tepung Habis (~220 roti) | Every roti uses 1 flour. At 0, all production stops | Order 100 (RM30, 20 s delivery). Emergency 50 (RM30, instant). Kak Ros 20 (free, 45 s cooldown, only when below 10) |

### Ingredient costs are never counted twice
The selling price is RM1.50 = profit RM1.00 + ingredients RM0.50, and RM0.30
of the ingredients is flour. Before flour stock exists, the player receives
RM1.00 cash per roti, as in v0.1. Once flour is bought in advance at RM0.30
per unit, each sale pays **RM1.30**: the flour was already paid for, so it
isn't deducted again. Buying 100 flour for RM30 and selling 100 roti gives
exactly +RM100, the same as v0.1. Only the emergency supplier's extra price
is a true additional cost. Net profit still counts RM1.00 per roti.

## Effects (modifiers)
Events apply effects with a duration, or permanent ones:
- **Stall closed:** no sales at all (deep cleaning, DBKL enforcement, failed inspection, griddle repair)
- **You're away:** no manual sales, but staff keep selling (DBKL counter queue, singing for Nenek, listening to Encik Rahman)
- **Production ±%:** for example, the kitchen busy with a big order
- **Demand ±%:** for example, a queue held up or a football crowd
- **Staff away:** one Roti Man missing
- **Slow deliveries:** flour takes longer to arrive
- **Permanent:** Grade A sticker (+5% demand), Rahman loyal regulars (+10% demand)

## Event engine (`events.js`)
- Only one challenge waits at a time. After each one, there's a **30-second calm period**.
- Every 5 s, the game checks:
  1. **Story events** whose milestone is reached, in a fixed order
  2. Otherwise a **random** medium (5%) or small (12%) challenge, picked by weight among the eligible ones not on cooldown
- Random challenges begin after 80 roti and the first hire, so the opening minute stays calm.
- If ignored: small challenges settle after 30 s and medium ones after 90 s, with a mild default outcome. Major events have a deadline.
- While unresolved, some challenges have an ongoing effect (the Rahmans halve demand, a rat lowers demand by 20% and keeps eating hygiene).
- Choice costs scale by stage (`stageCostMultiplier`: ×1, ×5, ×25), so the same event can return in Stages 2–3 at a bigger scale.
- Taps are ignored for 0.7 s after a decision, and stale buttons are rejected, so a double tap can't pick two options.

## Stage 1 events

### Story events (milestones)
| Event | When | Choices | Notes |
|---|---|---|---|
| **The Rahman Family**, visit 1 | 40 roti | Serve properly (kitchen −70% for 15 s, +8 sales, Rep +4, Rel +2) / Rush (+8 sales, 50% chance Rep −6, Rel −2) / Come back later (Rep −1, Rel −1, they return 40 roti later) | Holds the queue (demand ×0.5) until resolved |
| Rahman visit 2 | 200 roti | Relationship ≥ 1 → **Nenek's birthday** (roti cake RM10 / serve normally / decline). Otherwise → **discount demand** (give discount / normal price with 50% chance of a 1-star review / ask them to leave) | Being sent away on visit 1 brings them back early and grumpy |
| Rahman visit 3 | 380 roti | Relationship ≥ 2 → **40-roti kenduri catering** (needs 40 flour). Otherwise → **complaints** (listen RM5, Rel +3 / switch TV, 50/50 / ban them) | Relationship ≥ 3 at any time → **loyal regulars**, +10% demand permanently |
| **Tikus!** | 120 roti (first), then random | Pest control RM40 (+RM20 per ignored rat) / Close 30 s for a deep clean / Ignore | Ignoring: hygiene −10, rats return more often, the second time goes viral (Rep −10), each ignored rat costs −15 on the inspection |
| **Tepung Habis** | 220 roti | Emergency supplier (50 now, RM30) / Regular supplier (100 for RM30, 20 s wait) / Borrow 15 from Kak Ros (free) | Unlocks flour stock. If ignored, Kak Ros helps after 120 s |
| **DBKL Permit Issue** (major) | 300 roti and 2 staff | Renew at the counter RM120 (needs hygiene 50, you're away 20 s) / Licensing consultant RM200 (needs hygiene 40) / One 90 s extension | Missing the 150 s deadline: closed 60 s, fine up to RM80 (never below RM0), Rep −8. All options are legitimate compliance (the licence is fictional) |
| **Health Inspection** (major) | 420 roti, after DBKL | Welcome now / Tidy up first (RM15, +15 hygiene) | Score = hygiene − 15 × ignored rats. ≥75 A (+5% demand permanently), ≥50 B, ≥30 C, <30 fail (closed 45 s) |

### Random challenges
| Tier | Event | Needs |
|---|---|---|
| Small | The Cerewet Customer, Wrong Order! | Any time |
| Small | Staff Running Late, Staff Calls in Sick | 2+ staff |
| Small | Teh Tarik Spill | Hygiene unlocked |
| Medium | Griddle Rosak!, Match Just Ended! (crowd surge) | Griddle or 2+ staff / any time |
| Medium | Staff Grumbling | Morale below 70 (more likely below 50) |
| Medium | Supplier Lorry Rosak | Flour stock unlocked |
| Medium | Tikus! (repeat) | After the first rat. More likely with low hygiene or ignored rats |

## Never impossible
- Stats drift back to normal. Quick wipe is free. Kak Ros gives free flour when stock is under 10.
- Fines take only the cash you have, and cash never goes below RM0.
- Every event has a non-cash option or a timeout path.
- Catering needs 40 flour, so a big order never closes the stall for nothing.
- Simulations show every play style finishes Stage 1.

## Pacing with challenges (simulated, 20 runs each)
| Player style | Median time to finish Stage 1 | Challenges faced |
|---|---|---|
| Careful (does the "proper" thing) | ~4.6 min | ~7 |
| Reckless (cheapest or ignore option) | ~4.0 min, but ends with lower reputation (~47 vs ~63) and furious Rahmans | ~7 |
| Lazy (never decides, stops tapping) | ~9.3 min | ~4 |
| v0.1 for comparison | ~2.5 min | 0 |

Careful play costs a little time now but builds reputation, relationships
and permanent bonuses that will carry into Stage 2.

## Expanding to Stages 2 and 3
- `currentStage()` and `stage` on each event control which events can happen.
- Costs scale automatically with `stageCostMultiplier`.
- Planned escalations: one rat → hygiene inspections at several outlets →
  a nationwide food safety crisis. Rahman visits continue at the restaurant
  (a bigger family and bigger expectations), and rival restaurants open nearby.
