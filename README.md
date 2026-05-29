# Synergy Auto-Battler (Discord Activity)

A custom, web-based auto-battler designed to live inside Discord via the Embedded App SDK. Players buy units from a tiered shop, plan a standing-card board on a tilted 2.5D battlefield, build style + work synergies, and click FIGHT to auto-resolve combat against another player's board.

**Author:** Star_Vader

## 🌟 Features

* **2.5D battlefield.** 5×7 grid per side rendered as projected trapeziums; cards stand upright as billboards with depth-based scaling. Bench is a flat 7-slot strip on the left, plus a red **SELL** drop zone beneath it.
* **Standing portrait cards.** 50×80 cards where the character portrait fills the entire card. HP + mana bars **float above** the card so the face is never covered. Stars row, work icons, style icon, and active-synergy badge overlay along the bottom edge of the portrait. Cost-tier neon border draws on top so it can't be obscured.
* **Live synergy tracking with hover-reveal.** Every style and work tag has activation thresholds, per-tier buff multipliers, and human-readable ability descriptions. The side panel shows compact rows at idle (icon + name + tier + count); the ability description is hidden behind a `:hover` reveal to keep the panel scannable.
* **Colored synergy chips.** Each synergy renders in a chip tinted by its `STYLE_CSS` / `WORK_CSS` color (`<img>` PNG → emoji fallback on 404). Drop PNGs into `client/assets/synergies/{styles|works}/` to replace emoji at will.
* **3-star merge + shop pool.** Owning 3 of the same character at the same star tier auto-merges into one unit a star higher (cascades — 9× 1★ → 1× 3★ from a single buy). Once a unit hits 3★, it drops out of the shop pool entirely and gets evicted from any currently-displayed shop slots showing duplicates. Stats scale 1.8× per star.
* **Sell zone.** Drag any unit onto the red SELL panel for a 1×/3×/9× cost refund by star tier.
* **Per-unit mana + abilities + attack speed.** Every character has an ability. A cyan mana bar (floating above the card with HP) fills +1 per basic attack. Each unit has its **own attack cooldown** driven by its style's `attackSpeed` — Hard Hitters swing ~1.5× as fast as Survivalists. Combat ticks every **250ms** and each unit attacks only when its cooldown elapses. At full mana the matching handler fires (chain lightning, cleave, AOE blast, heal aura, team rally, shield, slow). All damage/healing scales by the caster's scaled `abilityPower`, so 1g abilities chip while 5g abilities swing rounds.
* **Gold economy.** Round income + interest + win/loss streak bonuses + **+2g flat win bonus** + paid rerolls + XP purchasing + Trader synergy income bonus + Recruiter free rerolls + Researcher XP discount.
* **Resurrection.** Dead player units come back to full HP at round end. Round loss damage scales with surviving enemies' stars, cost, and HP percentage.
* **Hover info zone.** Hover any of your cards (board or bench) and the footer info zone shows name, cost, star tier, full scaled stats, and ability cadence.
* **Snapshot-relay multiplayer.** Node + Socket.io server matches two players into a room and shuttles board snapshots when both click FIGHT. Opponent's HP, synergies, and roster mirror on the right side panel in real time. Falls back to single-player random enemies when no server is available.

## 🛠️ Tech Stack

* **Frontend:** HTML5 + CSS Grid/Flexbox, Phaser 3 (canvas), vanilla JS.
* **State:** pub/sub `GameState` class (`shared/gameState.js`).
* **Networking:** Node.js + Express + Socket.io (`server/`).

## 📂 Project Structure

```text
discord-synergy-game/
├── client/
│   ├── index.html              # UI shell: top bar, side panels, board container, shop footer + info zone
│   ├── style.css               # HUD/panel/shop/info-zone styling
│   ├── game.js                 # Phaser scene, drag pipeline, combat, abilities, synergy app, net wire-up
│   ├── net.js                  # socket.io-client wrapper (Net.init/send/on/connected/matched/slot)
│   └── assets/
│       ├── manifest.json       # charId → portrait path registry
│       ├── portraits/          # Drop 200×320 PNGs (5:8) here, named after the charId from dictionary.js
│       └── synergies/
│           ├── styles/         # Drop synergy icon PNGs here, named after style (e.g. Hard_Hitter.png)
│           └── works/          # Drop synergy icon PNGs here, named after work (e.g. OutdoorPerson.png)
├── shared/
│   ├── dictionary.js           # CHARACTERS + SYMBOLS + SYNERGIES (thresholds, buffs, tierDesc, economy)
│   ├── gameState.js            # GameState + ECONOMY + DROP_RATES + XP_TO_LEVEL
│   └── coords.js               # BOARD layout, gridToWorld/worldToGrid, project/unproject, cellQuad/screenToCell
├── server/
│   ├── index.js                # Express + socket.io entrypoint, matchmaking + relay
│   ├── gameRoom.js             # GameRoom class — 2 slots, snapshot staging
│   └── gameLogic.js            # Standalone synergy calculator (test helper)
├── raw_character_designs/      # Drop full-resolution source art here (any JPG/JFIF/PNG/WebP). pwsh tools/convert_portraits.ps1 converts the lot.
├── tools/
│   └── convert_portraits.ps1   # Top-aligned 5:8 crop + 200×320 high-quality bicubic resize → client/assets/portraits/
├── Game.png                    # Visual reference mockup
├── Synergy.png                 # Style × Work character roster chart
└── README.md
```

## 🚀 How to Run

### Single-player (Live Server)
1. Install the **Live Server** extension by Ritwick Dey in VS Code.
2. Right-click `client/index.html` → **Open with Live Server**.
3. Game opens at `http://127.0.0.1:5500/client/index.html`. The networking layer falls back to random opponents because no Node server is reachable.

### Multiplayer (Node server)
1. `npm install`
2. `npm start` (boots `node server/index.js` on port 3000)
3. Open **two** browser tabs/windows at `http://localhost:3000`.
4. Tab 1 lands first and sees *"Joined as p1. Waiting for opponent…"* in the toast.
5. Tab 2 connects and both tabs get *"Matched! Plan your board."*
6. Plan your boards independently. When **both** tabs click **FIGHT**, the server relays each player's snapshot to the other and combat runs locally on each side against the opponent's board.
7. After combat each client reports `combat_result` back so the opponent's HP can be mirrored later.
8. If a player disconnects mid-round, the other gets *"Opponent disconnected — back to single-player."* and continues solo.

> **Note.** Live Server (5500) and the Node server (3000) are separate. Multiplayer only works on `:3000` because the `/socket.io/socket.io.js` client script is served by the Node process.

## 🎮 How to Play

1. **Deployment phase.** You start at Level 2 with 5g income. The shop auto-rolls 5 units each round.
2. **Buy & place.** Click a shop card to buy (cost on card, tier coloured border). Drag from your bench onto the cyan grid.
3. **Deploy cap.** You can field units up to your current player level. Buy XP (4g for 4 XP) to level up — bigger board, higher-tier shop odds.
4. **Merge.** Own 3 copies of the same character at the same star → auto-merge into one star-up version with 1.8× stats. Cascades.
5. **Sell.** Drag any unit onto the red **SELL** zone for a refund (1×/3×/9× cost for 1★/2★/3★).
6. **Synergies.** Style and work synergies activate at thresholds (mostly 2 and 4; Mentor and Recruiter have an extra step at 3). The side panel shows current counts, tier stars, and ability descriptions.
7. **Action phase.** Click **⚔️ FIGHT!**. Enemies spawn on the red grid (random in single-player, your opponent's board in multiplayer). Combat ticks every **250ms** but each unit only swings when its personal `attackCooldown` (1500 / `attackSpeed`) has elapsed. Mana fills +1 per swing; at `chargeMax` the unit's ability fires. Star-scaled stats and synergy multipliers apply.
8. **Round end.** Survivors heal; dead player units come back next round. Income arrives, shop refreshes, Trader/Recruiter synergy bonuses apply, you start planning again.

### Economy

| Action | Cost / Reward |
|---|---|
| Round income | +5g base |
| Interest | +1g per 10g banked (cap +5g) |
| Win/loss streak | +1/+2/+3g at streak length 2/3/4+ |
| Win bonus | +2g flat for winning the round |
| Reroll shop | 2g (free if Recruiter synergy is active) |
| Buy XP | 4g for 4 XP (−1g with 2 Researchers, −2g with 4) — button label shows `Next Lvl: Ng` total to next level |
| Lose a round | Scales with surviving enemies: `2 + Σ max(1, ⌊(stars+cost)·hpRatio/2⌋)` |
| Trader synergy | +2g/round (≥2) or +5g/round (≥4) |
| Recruiter synergy | 1/2/3 free rerolls/round at ≥2 / ≥3 / ≥4 |
| Sell 1★/2★/3★ unit | Refund 1× / 3× / 9× base cost |

### Shop Drop Rates by Level

| Level | 1g | 2g | 3g | 4g | 5g |
|---|---|---|---|---|---|
| 2 | 100% | — | — | — | — |
| 4 | 55% | 30% | 15% | — | — |
| 6 | 25% | 40% | 30% | 5% | — |
| 8 | 16% | 20% | 35% | 25% | 4% |
| 10 | 5% | 10% | 20% | 40% | 25% |

## 👥 Roster

29 chart characters (see `Synergy.png`) plus one 5g legendary. Each faction has a 1g/2g/3g/4g champion (Leader is partial — Reh 1g, Xtatik 3g, CG 4g).

| Faction | 1g | 2g | 3g | 4g |
|---|---|---|---|---|
| Trader | RockStarDad | Profu | irina_88 | MasterBart |
| Killer | Berlin | Lurio | Craig_demon | Binkly |
| Mentor | Andrew | Helen | Drago | CG |
| Leader | Reh | — | Xtatik | CG |
| Avenger | KuroKrysel | Epic | Xtatik | Young |
| Coder | Wkd-w0lf | Bob | Star_Vader | Spidernnam |
| Recruiter | LoloCoko | Rockless | Ashe_me | Kelly_maxine |
| OutdoorPerson | FlipJames | Ganji_Chudail | MarmotMenace | Leandra |
| **5g Legendary** | — | — | — | **JNRanger** (Strategist · Coder + Leader) |

CG bridges Mentor + Leader at 4g; Xtatik bridges Leader + Avenger at 3g; JNRanger spans Coder + Leader at 5g.

### Stat baseline by cost tier

```
1g  450hp / 40atk / 15armor / 50AP
2g  600hp / 55atk / 25armor / 70AP
3g  750hp / 70atk / 35armor / 90AP
4g  900hp / 85atk / 45armor / 115AP
5g  1100hp / 105atk / 55armor / 145AP
```

A style modifier is multiplied on top: Hard Hitter +25% attack / −5% HP, Survivalist +20% HP / −10% attack, Disciplinarian +25% armor / −5% attack, Researcher +25% AP / −5% HP, Solidarity +15% armor / +10% HP, Strategist +5% attack / +10% AP, Friendly +15% AP / −10% attack. See the comment block at the top of `shared/dictionary.js`.

## 🧬 Synergies

Each synergy declares thresholds, per-tier stat buffs, and a human-readable description (`tierDesc`). Trader and Recruiter additionally declare `economy` effects applied on round transitions. Leader is `global: true` — its buff applies to **every** unit on the player's board, not just Leader-tagged units.

| Synergy | Thresholds | Effect |
|---|---|---|
| Strategist | 2 / 4 | +10% / +25% attack (Strategists) |
| Researcher | 2 / 4 | +15% / +35% AP (Researchers) · **XP cost −1g / −2g** |
| Disciplinarian | 2 / 4 | +30% / +60% armor (Disciplinarians) |
| Friendly | 2 / 4 | +10% / +25% AP (Friendly) |
| Survivalist | 2 / 4 | +20% / +45% HP (Survivalists) |
| Solidarity | 2 / 4 | +15% / +35% armor (Solidarity) |
| Hard Hitter | 2 / 4 | +20% / +45% attack (Hard Hitters) |
| Killer | 2 / 4 | +10% / +25% attack (Killers) |
| Mentor | 2 / 3 / 4 | +15% / +25% / +40% AP (Mentors) |
| **Leader (COMMAND)** | **2 / 4** | **+10% / +25% attack & armor — WHOLE TEAM** |
| Avenger | 2 / 4 | +12% / +30% attack (Avengers) |
| Coder | 2 / 4 | +20% / +40% AP (Coders) |
| OutdoorPerson | 2 / 4 | +10% / +25% attack (OutdoorPersons) |
| Trader | 2 / 4 | +2g / +5g income per round |
| Recruiter | 2 / 3 / 4 | 1 / 2 / 3 free shop rerolls per round |

## 🏗️ Architecture

```
GameState (shared/gameState.js)
   │  Owns: gold, round, hp, level, bench[], board[][], shop[], freeRerolls
   │  Emits: 'gold' / 'shop' / 'board' / 'bench' / 'levelup' / 'roundEnd'
   │
   ├──> state.subscribe() in game.js
   │       └──> refreshHud()              gold/level/round/HP in DOM
   │       └──> updateSynergyPanel()      side panel with tiers + descriptions
   │       └──> refreshSynergyBadges()    top-corner dot on contributing units
   │
   ├──> renderShop()                      reads state.shop, paints .shop-cards
   ├──> buyUnit() → checkAndMerge()       spawns Phaser unit, then auto-merges
   └──> drag pipeline (scene-level)       findPlayerCardAt → tryPlaceOnBoard / tryPlaceOnBench / sellUnit

coords.js
   gridToWorld / worldToGrid / benchSlotAt / benchSlotCenter   (canvas-local)
   project / unproject                                          (perspective math)
   cellQuad(col, row, side)                                     (4 projected screen corners)
   screenToCell(x, y, side)                                     (point-in-quad reverse lookup)
   cellRenderInfo(col, row, side)                               (projected center + depth scale)

dictionary.js
   CHARACTERS  — 30 entries, each with style, work[], cost, baseStats, optional ability
   SYMBOLS     — emoji per style and work
   SYNERGIES   — { styles, works } each with thresholds, buffs[tier], tierDesc[tier],
                 plus economy (Trader/Recruiter) and global flag (Leader)

net.js / server/
   Net.init() connects (no-op if /socket.io/socket.io.js 404s)
   Net events: joined → matched → submit_snapshot ↔ opponent_snapshot ↔ combat_result
```

### Per-unit ability hook (mana system)

Every character declares `ability: { id, chargeMax }` in `dictionary.js`. The `ABILITIES` registry in `game.js` maps id → `{ name, execute(scene, caster, allies, enemies) }`. After each basic attack the caster's `abilityCharge` grows by `STYLE_ATTACK_SPEED[style]`; at `chargeMax` the matching handler fires (then resets). Every ability uses `casterAP(caster)` to scale its damage/heal by the unit's scaled `abilityPower`, so power tracks both cost tier and star tier without per-character math.

The mana bar on each card is `abilityCharge / chargeMax` — a cyan rectangle floating above the card next to the HP bar (so they don't cover the portrait face). Resets to 0 at round end.

All ability damage routes through `applyDamage()` so player deaths hide-and-resurrect and enemy deaths destroy. To swap art for an ability, rewrite its `execute()` body — the trigger pipeline doesn't change. To rebalance pacing, tune `chargeMax` (in `dictionary.js`) and/or `STYLE_ATTACK_SPEED`.

Ability registry: `single_strike` (1g burst) · `cleave` (2-target sweep) · `chain_zap` (3-target lightning) · `aoe_blast` (radial damage) · `heal_aura` (full-team heal) · `team_buff` (yellow rally heal) · `shield_ally` (lowest-HP ally heal) · `slow_enemy` (damage + drain target mana).

## 🗺️ Roadmap

### ✅ Phase 0 — Foundations (DONE)
- [x] Centralized `GameState` with pub/sub events
- [x] Coordinate helpers (`gridToWorld` / `worldToGrid` / bench helpers)
- [x] Perspective projection math (off by default; flipped on later)
- [x] Gold economy (income, interest, streak bonuses, paid reroll)
- [x] Player level + XP system with deploy cap
- [x] Tiered shop with level-gated drop rates
- [x] Drag-drop swap (units exchange positions instead of blocking)
- [x] Round loop wired end-to-end

### ✅ Phase 1 — Go 2.5D (DONE)
- [x] Perspective projection enabled in `coords.js`
- [x] Grid cells rendered as projected trapeziums with neon glow + pulse
- [x] Pointer-projection patch — kept then retired once standing-card mode arrived (canvas is now flat so Phaser's default pointer math is correct again)

### ✅ Phase 2 — Graphics & Standing Cards (DONE, ART INFLOWING)
- [x] 5×7 grid per side, canvas 1000×600
- [x] Standing vertical 50×80 cards. Portrait fills the whole card; HP + mana bars **float above** the card top so the face stays unobstructed. Stars row + style icon + work icons + synergy active badge overlay along the bottom.
- [x] Card visual split into `buildCardBg` (halo + dark fill, behind portrait) and `buildCardBorder` (sharp cost-tier outline, on top) so the border can't be obscured by the portrait at the rounded corners.
- [x] Manifest-driven portrait loader with `loaderror` fallback to a style-colored rectangle + short-name placeholder.
- [x] Cost-tier frame colours (grey/green/blue/purple/gold for 1g–5g, dim red on enemies).
- [x] **Art pipeline.** Drop full-res source art (JFIF/JPG/PNG/WebP) at any aspect into `raw_character_designs/`, then `pwsh tools/convert_portraits.ps1`. The script top-crops to 5:8 and resamples with HighQualityBicubic to **200×320** in `client/assets/portraits/`. Dimensions chosen so Phaser only does a ~4× downsample at draw time — higher source resolutions (500+) get mushy from heavy bilinear compression at the card's tiny in-game size.
- [x] **Cyberpunk character prompt** for generative tools — bold low-detail thumbnail-readable art, varied outfits per work, cyan rim light, cost-tier back-glow. See "Adding portrait art" in Notes for Contributors below.

### ✅ Phase 3 — Power Scaling, Synergies & Abilities (DONE)
- [x] 5g Legendary tier — **JNRanger** (Strategist · Coder + Leader, fastest cast meter in the game)
- [x] 3-Star merge with cascade
- [x] **3★ shop exclusion** — `GameState.getMaxedCharIds()` returns charIds at 3★; `rollShop()` skips them from the cost buckets. Mid-planning, any matching currently-displayed shop slot is also evicted so the player can't buy a useless duplicate.
- [x] Sell zone with 1×/3×/9× refund
- [x] Per-unit ability scaffolding (chain_zap / aoe_blast / heal_aura placeholders; star-scaled)
- [x] `GameState.benchSet(slot, unit)` — direct bench mutations migrated to the event-emitting helper
- [x] Stat rebalance by cost tier × style modifier
- [x] Synergy thresholds + per-tier buffs + tierDesc descriptions
- [x] Leader as global team buff (atk + armor whole team)
- [x] Trader synergy → +2/+5 gold per round
- [x] Recruiter synergy → 1/2/3 free rerolls per round
- [x] Researcher synergy → −1g / −2g XP cost discount + "Next Lvl: Ng" projected total on the Buy XP button
- [x] Resurrection: player units come back at round end
- [x] Loss damage scales with enemy survivors' stars/cost/HP
- [x] Hover info zone in the footer

### ✅ Phase 4 — Multiplayer (DONE)
- [x] Socket.io server with `GameRoom` (2-player slots, snapshot staging)
- [x] Matchmaking: new connections slot into the first open room or create one
- [x] FIGHT snapshot relay — both players send `submit_snapshot`, server broadcasts each side's board to the other as `opponent_snapshot`
- [x] `spawnEnemyTeamFromSnapshot` mirrors the opponent's board onto the P2 grid (charId + stars preserved)
- [x] Single-player fallback when no server is reachable
- [x] `combat_result` relay (server + client mirror)
- [x] **Opponent panel mirror** on right side — HP bar, synergy tiers, deployed roster, slot label. Refreshes on every `opponent_snapshot` and `opponent_combat_result`; resets on `opponent_left`.
- [x] `computeBoardSynergies(board)` extracted so both sides reuse the same aggregation logic.

### ✅ Phase 5 — Mana Update (DONE)
- [x] **Every character has an ability** (1g → weak, 4g → strong, 5g → strongest). 8 ability ids cover the roster: `single_strike`, `cleave`, `chain_zap`, `aoe_blast`, `heal_aura`, `team_buff`, `shield_ally`, `slow_enemy`. All damage/healing scales by the caster's scaled `abilityPower`, so power tracks cost AND star tier automatically.
- [x] **Mana bar** on every card — cyan rectangle floating above the card next to the HP bar (so neither covers the portrait face). Width = `abilityCharge / ability.chargeMax`. Resets to 0 at round end.
- [x] **Per-unit attack cooldown.** Combat now ticks every **250ms** (was 1500ms). Each unit carries an `attackCooldown` that decrements every tick; it only swings when the cooldown elapses, then resets to `BASE_ATTACK_INTERVAL_MS / unitAttackSpeed(unit)`. So a Hard Hitter (1.30) swings every ~1154ms while a Survivalist (0.85) swings every ~1765ms — same loop, real speed differentiation.
- [x] **Mana fills +1 per attack** (was += attackSpeed). The speed advantage is already in attack RATE — making mana also gain by attackSpeed double-counted.
- [x] **`chargeMax` by cost tier:** 1g = 5, 2g = 4, 3g = 4, 4g = 3, 5g = 2. Combined with the cooldown system this gives a wide spread of cast cadences in seconds.
- [x] **HP boost** — `HP_BOOST = 1.5` applied in `getScaledStats` so every unit has 50% more HP. Fights now last long enough for several casts on each side rather than ending in a couple of trades.
- [x] **Win gold bonus** — `ECONOMY.WIN_BONUS = 2`. Flat +2g for winning, applied in `recordCombatResult` and shown on the win toast.
- [x] **Hover-reveal synergy descriptions** — synergy panel rows are compact at idle (icon + name + tier + count). Ability text lives in a `.syn-desc` child shown only on `:hover` so the panel stays scannable.
- [x] **Synergy icons** — `synergyIconHtml(name, isStyle)` returns a colored chip with an `<img>` tag pointing at `client/assets/synergies/{styles|works}/<Name>.png` and an `onerror` swap to the emoji. Background tint = `STYLE_CSS[name]` / `WORK_CSS[name]` at low alpha, so even with no art the synergy is identifiable by color. Drop PNGs (e.g. `Hard_Hitter.png`, `OutdoorPerson.png`) into the matching folder — no code change needed.

| Cost | Example | Ability | chargeMax | Seconds-to-cast (Hard Hitter / Survivalist) |
|---|---|---|---:|---:|
| 1g | RockStarDad | single_strike | 5 | 5.77 / 8.82 |
| 2g | Lurio | cleave | 4 | 4.62 / 7.06 |
| 3g | Star_Vader | chain_zap | 4 | 4.62 / 7.06 |
| 4g | Spidernnam | chain_zap | 3 | 3.46 / 5.29 |
| 5g | JNRanger | chain_zap | 2 | 2.31 / 3.53 |

### 💬 Phase 6 — Discord Integration
- [ ] Wrap the final web app in the Discord Embedded App SDK for native channel play

### ✨ Phase 7 — Stretch
- [ ] True isometric rendering in Phaser (diamond tiles, z-sorting) if the CSS perspective ever feels limiting
- [ ] Items / equipment system
- [ ] Carousel rounds (shared loot phase)
- [ ] Ranked ladder with seasonal resets
- [ ] Per-synergy unique ability mechanics (currently only the buff numbers fire — the `tierDesc` text hints at richer behaviours like execute / smart targeting / crit that would replace simple multipliers)
- [ ] **Spectator mode** — third+ connection joins a room as observer; server pushes both players' snapshots and HP updates to them.
- [ ] **Server-authoritative combat** — port `combatTick` into `server/gameLogic.js`, broadcast per-tick state to both clients. Required for ranked / cheat-proof play. Current model is client-authoritative — fine for friendlies.

## 📝 Notes for Future Contributors

* **Keep `coords.js BOARD` and `gameState.js ECONOMY.BOARD_COLS/ROWS` in sync.** A mismatch silently rejects board placements (`state.boardPlace` returns `undefined` for out-of-range cells) and `boardCount()` underreports. Constants are commented in both files.
* **Script load order in `index.html`** matters: `phaser → socket.io → dictionary → gameState → coords → net → game`. `game.js` reads globals from all earlier files at top level.
* **Adding a character.** Drop an entry into `CHARACTERS` in `dictionary.js` and add the matching `"<CharId>": { "portrait": "portraits/<CharId>.png" }` to `client/assets/manifest.json`. The PNG name must match the dictionary key exactly. The shop, synergy panel, hover info, drag-and-drop, merge, and ability systems pick it up with no code change.
* **Adding an ability.** Register `myAbility: { name, execute(scene, caster, allies, enemies) {…} }` in the `ABILITIES` object in `game.js`. Damage should go through `applyDamage(target, dmg)` so player deaths hide-and-resurrect and enemies destroy. Bind to a character with `ability: { id: "myAbility", chargeMax: N }` in its dictionary entry.
* **Adding a synergy.** Add to `SYNERGIES.styles` or `SYNERGIES.works` in `dictionary.js` with `thresholds: [...]`, `buffs: [...]` (one per threshold; multiplier keys `hp`/`atk`/`armor`/`ap`), and `tierDesc: [...]`. Mark `global: true` to apply the buff to every unit regardless of tag (like Leader). Mark `economy: [...]` if the effect should fire on round transition rather than in combat — and add a handler in `applyRoundStartSynergyEconomy()`.
* **Adding portrait art.**
   1. **Generate** the source image with your tool of choice. Prompt highlights: vertical 5:8 portrait, **bold low-detail cel-shaded style** designed to read at 50×80 thumbnail (no rivets / fine text / micro-patterns); cyberpunk world unifiers (one LED seam + one chrome accent + one floating holo glyph) in the unit's cost-tier color; outfit silhouette dictated by **work** (silks for Trader, robes for Mentor, hoodie for Coder, etc.) so the set stays varied — don't default to leather; preserve face / hair / signature element from reference image; transparent background; cyan rim light from upper right.
   2. **Drop the file** into `raw_character_designs/` named `<CharId>.<ext>` matching the dictionary key exactly (case + underscores: `Wkd_w0lf.jpg`, `Star_Vader.png`, `JNRanger.webp`). Any size, any common format works.
   3. **Run** `pwsh tools/convert_portraits.ps1` from the repo root. The script top-crops to 5:8 (drops feet, preserves head + chest), resamples to **200×320** with HighQualityBicubic, and writes a PNG into `client/assets/portraits/`. 200×320 is the deliberate target so Phaser only does a ~4× downsample to the 50×80 card — HD sources turn to mush at the in-game size.
   4. **Refresh** the game. The manifest already lists every charId, so the new portrait auto-loads. Fallback rectangle disappears for that character.
   - To add an entirely **new** character: extend `CHARACTERS` in `dictionary.js`, then `"<CharId>": { "portrait": "portraits/<CharId>.png" }` in `client/assets/manifest.json`, then drop art via the steps above.
* **Client-authoritative multiplayer.** Each client runs its own combat sim against the opponent's snapshot. Results can diverge if RNG seeds differ (currently no shared seed — combat is deterministic in practice because random targeting only fires on ties, but ability charge timing could drift). For ranked play, port `combatTick` into `server/gameLogic.js` and broadcast per-tick state instead.
