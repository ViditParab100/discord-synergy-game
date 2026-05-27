# Synergy Auto-Battler (Discord Activity)

A custom, web-based auto-battler game designed specifically to be played inside Discord using the Embedded App SDK. Players buy units from a shared shop, place them on a tactical grid, build class-based synergies, and watch them automatically battle the opponent.

**Author:** Star_Vader

## 🌟 Features

* **Interactive Grid System:** Built with Phaser 3, featuring fluid drag-and-drop mechanics, inventory bin management, and grid-snapping.
* **Live Synergy Tracking:** Dynamically calculates and displays active `Style` and `Work` synergies (e.g., Coder, Strategist, Mentor) based purely on the units currently deployed on the active board.
* **Dynamic Shop:** A vanilla JS/HTML bridge that seamlessly communicates with the Phaser canvas, allowing players to purchase units that instantly spawn into their interactive inventory.
* **Auto-Combat Engine:** A fully functional action phase where units lock into place, calculate distance, target the nearest enemy, and fire animated lasers until one team is eliminated.
* **Gold Economy:** Round-based income with interest, win/loss streak bonuses, paid rerolls, and XP purchasing.
* **Tiered Shop:** 5 cost tiers (1g–5g) with level-gated drop rates — saving up gold and leveling up unlocks stronger units.
* **Deploy Cap by Level:** Field size scales with player level (Lvl 2 = 2 units on the board, Lvl 10 = 10).

## 🛠️ Tech Stack

* **Frontend Framework:** Standard HTML5 / CSS3 (CSS Grid & Flexbox)
* **Game Engine:** Phaser 3 (HTML5 Canvas)
* **State Layer:** Vanilla JS pub/sub `GameState` class (single source of truth)
* **Data Structure:** Vanilla JavaScript (`dictionary.js`)
* **Backend (Planned):** Node.js with Express and Socket.io for multiplayer state management.

## 📂 Project Structure

```text
discord-synergy-game/
├── client/
│   ├── index.html        # Main UI layout and shop structure
│   ├── style.css         # Styling for the HUD and panels
│   └── game.js           # Phaser 3 rendering + drag/drop + combat
├── shared/
│   ├── dictionary.js     # Global character database and synergy symbols
│   ├── gameState.js      # GameState class — gold, round, hp, bench, board, shop
│   └── coords.js         # Grid <-> canvas helpers + perspective projection
└── server/
    └── index.js          # (WIP) Multiplayer WebSockets server
```

## 🚀 How to Run Locally (Client-Side)

Since the project currently relies on importing shared JavaScript files, running it directly by double-clicking `index.html` might trigger a CORS (Cross-Origin Resource Sharing) error in your browser.

To run it properly:
1. Open the project folder in **Visual Studio Code**.
2. Install the **Live Server** extension by Ritwick Dey.
3. Right-click `index.html` and select **"Open with Live Server"**.
4. The game will launch in your browser at `http://127.0.0.1:5500`.

## 🎮 How to Play

1. **Deployment Phase:** You start at Level 2 with 5g. The shop auto-rolls 5 random units each round.
2. **Buy & Place:** Click a shop card to buy (cost shown bottom of card, color-coded by tier). Drag the unit from your bench onto the Blue Grid.
3. **Deploy Cap:** You can only field units up to your current level. Buy XP (4g) to raise your level and unlock both more board slots and higher-tier units in the shop.
4. **Synergies:** Watch the Left Panel update with active `Style` and `Work` synergies based on your deployed units.
5. **Action Phase:** Click the red **FIGHT!** button. Enemies spawn on the Red Grid and combat runs automatically.
6. **Round End:** Survivors heal. You collect income (5g base + interest + streak bonus) and the shop refreshes.

### Economy Reference

| Action | Cost / Reward |
|---|---|
| Round income | +5g base |
| Interest | +1g per 10g banked (cap +5g) |
| Win/loss streak | +1/+2/+3g at streak length 2/3/4+ |
| Reroll shop | 2g |
| Buy XP | 4g for 4 XP |
| Lose a round | −2g HP (approximate, scales with board size) |

### Shop Drop Rates by Level

| Level | 1g | 2g | 3g | 4g | 5g |
|---|---|---|---|---|---|
| 2 | 100% | — | — | — | — |
| 4 | 55% | 30% | 15% | — | — |
| 6 | 25% | 40% | 30% | 5% | — |
| 8 | 16% | 20% | 35% | 25% | 4% |
| 10 | 5% | 10% | 20% | 40% | 25% |

## 🏗️ Architecture (Phase 0 — Complete)

The codebase was refactored to separate state from rendering so future features (multiplayer, 2.5D view, art swap) slot in without rewriting the world.

```
GameState (shared/gameState.js)
   │  Owns: gold, round, hp, level, bench[], board[][], shop[]
   │  Emits: 'gold' / 'shop' / 'board' / 'bench' / 'levelup' / 'roundEnd'
   │
   ├──> state.subscribe() in game.js
   │       └──> refreshHud()           updates gold/level/round in DOM
   │       └──> updateSynergyPanel()   updates side panel
   │
   ├──> renderShop()           reads state.shop, paints .shop-cards
   ├──> buyUnit()              spends gold, adds to bench, spawns Phaser unit
   └──> tryPlaceOnBoard/Bench  drag-drop swaps using state.bench / state.board

coords.js
   gridToWorld(col,row,side)   → canvas (x,y) at cell center
   worldToGrid(x,y,side)       → {col,row} or null
   benchSlotAt(x,y)            → 0..6 or -1
   benchSlotCenter(slot)       → {x,y}
   project / unproject         → identity until Phase 1 turns perspective on
```

Every coordinate computation in `game.js` goes through those helpers. When perspective is flipped on later, none of the callsites change.

## 🗺️ Roadmap

### ✅ Phase 0 — Foundations (DONE)
- [x] Centralized `GameState` with pub/sub events
- [x] Coordinate helpers (`gridToWorld` / `worldToGrid` / bench helpers)
- [x] Perspective projection math (disabled, ready for Phase 1)
- [x] Gold economy (income, interest, streak bonuses, paid reroll)
- [x] Player level + XP system with deploy cap
- [x] Tiered shop with level-gated drop rates
- [x] Cost-color borders on shop cards
- [x] Drag-drop swap (units exchange positions instead of blocking)
- [x] Round loop wired end-to-end (fight → result → income → next round)

### 🔜 Phase 1 — Go 2.5D
- [ ] Add CSS `perspective(900px) rotateX(28deg)` to the Phaser canvas
- [ ] Flip `Perspective.enabled = true` and call `patchPhaserPointer(game)` in `create()`
- [ ] Restyle grid cells from flat strokes to neon glow lines (match the mockup)
- [ ] Test drag/drop in back rows where projection distortion is greatest

**How to enable:**
1. In `client/style.css`, add to the `#phaser-game-canvas` (or board container) rule:
   ```css
   transform: perspective(900px) rotateX(28deg);
   transform-origin: 50% 50%;
   ```
2. In `client/game.js`, uncomment the two lines at the bottom of `create()`:
   ```js
   Perspective.enabled = true;
   patchPhaserPointer(game);
   ```

### 🎨 Phase 2 — Graphics Pipeline
- [ ] Replace rectangle placeholders with character portrait sprites (~96×96 PNG)
- [ ] Generate all ~28 portraits in a single AI batch with consistent style guide (chibi-headshot, neon rim light, transparent background, square crop)
- [ ] Frame overlay colored by cost tier (grey/green/blue/purple/gold)
- [ ] Star row below portrait (1★/2★/3★) as graphics, not text
- [ ] Synergy badges on units when their synergy is active
- [ ] `manifest.json` in `client/assets/` to keep loader and dictionary in sync

### 💰 Phase 3 — Power Scaling & Upgrades
- [ ] Add 5g "Legendary" tier units to `dictionary.js`
- [ ] 3-Star merge system (3× 1★ → 2★, 3× 2★ → 3★, stats scale ~1.8× per star)
- [ ] Sell zone (refund 1×/3×/9× cost for 1★/2★/3★)
- [ ] Per-unit ability animations (lightning-chain Coder synergy from mockup, etc.)
- [ ] Bench HUD that listens to `bench` events (then migrate direct mutations to a `benchSet` method)

### 🌐 Phase 4 — Multiplayer
- [ ] Wire up Socket.io server with `state.snapshot()` serialization
- [ ] PvP matchmaking
- [ ] Spectator mode

### 💬 Phase 5 — Discord Integration
- [ ] Wrap the final web app in the Discord Embedded App SDK for native channel play

### ✨ Phase 6 — Stretch
- [ ] True isometric rendering in Phaser (diamond tiles, z-sorting) if the CSS perspective ever feels limiting
- [ ] Items / equipment system
- [ ] Carousel rounds (shared loot phase)
- [ ] Ranked ladder with seasonal resets

## 📝 Notes for Future Contributors

* `tryPlaceOnBoard` / `tryPlaceOnBench` in `game.js` directly mutate `state.bench[i]` when swapping. This bypasses the `GameState` event emit. It is safe in Phase 0 because nothing currently subscribes to bench events. When you add a bench HUD that listens for events, add a `benchSet(slot, unit)` method to `GameState` and migrate those direct assignments to it.
* The shop's HTML structure lives in `index.html`. The `renderShop()` function in `game.js` paints into `.shop-cards`. Keep these in sync if you redesign the shop layout.
* Script load order in `index.html` matters: `dictionary.js` → `gameState.js` → `coords.js` → `game.js`. The last file uses globals from the first three on its top-level lines.