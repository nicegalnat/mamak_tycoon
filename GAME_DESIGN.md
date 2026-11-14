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
