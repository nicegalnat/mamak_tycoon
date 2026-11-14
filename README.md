# Mamak Tycoon

*From one roti to world domination.*

A browser-based incremental game, inspired by the escalating, slow-reveal
style of Universal Paperclips. You start at a folding table by the roadside,
flipping roti canai by hand. Ten stages later you are serving teh tarik to
alien civilisations at the edge of the universe.

**Current version: v1.0. All 10 stages are playable from start to finish, with a definite ending.**
A full game takes roughly 60–90 minutes.

## The ten stages

| # | Stage | What's new |
|---|---|---|
| 1 | I Am the Mamak Owner | Make roti by hand, hire Roti Men, manage stock, hygiene and morale |
| 2 | New Franchise, Who Dis? | Run several outlets: locations, staffing, a central kitchen, menu items. Some outlets can lose money |
| 3 | Mamak District Takeover | A territory map. Open, defend and win blocks from two rival chains that fight back |
| 4 | Satu Malaysia, Satu Mamak | Nationwide logistics. Assign lorries and cargo planes to regions and match regional tastes |
| 5 | Akta Sarapan Wajib 24 Jam | Plan daily breakfast quotas from forecasts and stamp fictional forms before their deadlines |
| 6 | Prime Mamak Minister | Switch national food policies on and off to balance the Dhal Reserve, approval and the treasury |
| 7 | Hari Mamak Sedunia (Tapi Malaysia Dulu) | Plan a festival against a countdown, keep hype up, and play a synchronised roti-flip rhythm game |
| 8 | Mamak Goes International | Adapt recipes to each city using customer feedback, and cover all 24 supper hours worldwide |
| 9 | The Great Roti Singularity | Split AI compute between production, self-improvement and quality, and keep the AI under oversight |
| 10 | Mamakverse: Open 24 Jam, Forever | Launch roti probes, build warp lanes with Dark Dhal, and learn what each alien species wants |

Each stage ends with a summary screen and a **Continue** button to the next.
The Rahman Family turn up in every stage and remember how you treated them,
all the way to the final scene. Everything in the game is fictional.

## How to play Stage 1

1. Tap **Make & Sell Roti Canai**. Each tap sells one roti for RM1 profit.
2. Once you have some cash, new options appear. Hire a **Roti Man** to make
   roti automatically.
3. After your first hire, keep an eye on **Production capacity** and
   **Customer demand**. You only sell as fast as the lower of the two.
   - Not enough staff? Hire more, or **Upgrade the Griddle**.
   - Staff standing around? Use **Marketing** to bring in more customers.
4. **Increase Roti Price** makes every roti (manual and automatic) more profitable.
5. Finish Stage 1 by selling **500 roti**, hiring **3 employees** and earning
   **RM1,000 in lifetime revenue**.

The game saves automatically every 10 seconds and after every purchase.
Nothing is earned while the page is closed.

## Challenges & business health (v0.2)

Running a mamak isn't just about money. As the stall grows, problems appear
in the **Challenges** section. Each one gives you a few choices, and each
choice shows its cost and effects before you pick it.

- **Small challenges** (difficult customers, late staff, spills) are quick.
  If you ignore one, it settles itself after 30 seconds with a small penalty.
- **Medium challenges** (rats, flour running out, a broken griddle) need a real decision.
- **Major challenges** (DBKL licence, health inspection) are story events with a deadline.
- **The Rahman Family** visit several times. How you treat them changes their
  later visits, and loyal Rahmans bring in more customers permanently.

Four **business health** stats unlock as you grow. Each one changes gameplay:

| Stat | What it does | How to improve it |
|---|---|---|
| Reputation | Raises or lowers customer demand | Good choices in challenges (it also recovers slowly by itself) |
| Hygiene | Low hygiene brings rats, failed inspections and lost reputation | Quick wipe (free) or deep clean |
| Staff morale | Speeds up or slows down your Roti Men | Belanja staff makan (it also recovers slowly by itself) |
| Flour stock | No flour means no roti | Order flour, use the emergency supplier, or ask Kak Ros next door |

You can always recover. Stats drift back towards normal, cleaning is free,
and Kak Ros will lend you flour if you're broke. Bad luck can slow you down,
but it can't stop you finishing the stage.

## Files

| File | What it is |
|---|---|
| `index.html` | The page layout (what you see) |
| `style.css` | Colours, sizes and layout |
| `game.js` | Core game rules: money, roti, upgrades, business stats, saving. **Core numbers are in the `CONFIG` block at the top.** |
| `events.js` | The Challenges & Events engine and the Stage 1 events. **Event chances, cooldowns and costs are in `EVENT_CONFIG` at the top.** |
| `stages.js` | Stages 2–10: each stage's rules, numbers, screens and goals, plus stage transitions and the ending. **Each stage's numbers are in a block named `S2`, `S3`… near its section.** |
| `stage-events.js` | Surprise challenges, Rahman Family visits and story events for Stages 2–10 |
| `GAME_DESIGN.md` | The design plan: stages, formulas, pacing |
| `README.md` | This file |

## Changing the game's numbers

Open `game.js` and look at the `CONFIG` section at the top. For example:

```js
rotiMan: {
  baseCost: 50,         // price of the first Roti Man
  costMultiplier: 1.5,  // each new one costs 1.5x the last
  ...
},
```

Change a number, save, and reload the page. You don't need to change any other part of the file.

To make challenges rarer, lower `chancePerCheck` or raise `quietTimeSec` in
`EVENT_CONFIG` at the top of `events.js`.

## Previewing the game

The game is a few plain files with no build step, so any static web host works.
The live version is at **https://nicegalnat.github.io/mamak_tycoon/** and updates whenever `main` changes.

**Easiest free option: GitHub Pages**
1. In the GitHub repository, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Choose the branch (`main`, once the work has been merged) and the folder `/ (root)`, then **Save**.
4. After a minute or two the page shows a link like
   `https://<your-username>.github.io/mamak_tycoon/`. Open it on any device.

Note: GitHub Pages on a free account requires the repository to be **public**.

## Developer panel

At the bottom of the page there is a collapsible **Developer panel** with
testing shortcuts:
- add cash, add roti sold, add flour, skip 60 seconds
- lower all stats by 30 (to test recovery)
- **trigger any challenge** from a list (the name starts with its stage, e.g. "S6:"), clear the current challenge, or pause random challenges
- **jump to any stage**, complete the current stage instantly, or add 60 seconds of income
- reset

Cash added this way does not count as revenue. The panel will be removed or
hidden in a later version.

## Version history

- **v0.1**: Stage 1, the roadside stall
- **v0.2**: Challenges & Events. The Rahman Family, Tikus!, Tepung Habis, a licence deadline, the health inspection, and business health stats
- **v1.0**: all 10 stages, 40+ new challenges, a Rahman visit in every stage, a finale and an ending

## Ideas for later
- Pixel-art graphics
- A New Game+ mode with a prestige bonus ("pass the stall to your children")
- Sound effects (the satisfying slap of dough on a griddle)
