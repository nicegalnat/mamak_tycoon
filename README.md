# Mamak Tycoon

*From one roti to world domination.*

A browser-based incremental game, inspired by the slow-reveal style of
Universal Paperclips. You start with a tiny roadside mamak stall in Malaysia,
flipping roti canai by hand, and grow it into an empire.

**Current version: v0.1, Stage 1 (The Roadside Stall)**

## How to play

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

## Files

| File | What it is |
|---|---|
| `index.html` | The page layout (what you see) |
| `style.css` | Colours, sizes and layout |
| `game.js` | All the game rules. **Every price and number is in the `CONFIG` block at the top.** |
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

## Previewing the game

The game is three plain files with no build step, so any static web host works.

**Easiest free option: GitHub Pages**
1. In the GitHub repository, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Choose the branch (`main`, once the work has been merged) and the folder `/ (root)`, then **Save**.
4. After a minute or two the page shows a link like
   `https://<your-username>.github.io/mamak_tycoon/`. Open it on any device.

Note: GitHub Pages on a free account requires the repository to be **public**.

## Developer panel

At the bottom of the page there is a collapsible **Developer panel** with
testing shortcuts: add cash, add roti sold, skip 60 seconds, reset. Cash
added this way does not count as revenue. The panel will be removed or hidden
in a later version.

## Roadmap

- **Stage 1: The Roadside Stall** (done)
- **Stage 2: The Restaurant**: 24-hour operation, menu, reputation
- **Stage 3: The Empire**: franchises, supply chains, and a defined ending
