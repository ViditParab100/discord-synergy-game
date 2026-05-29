// client/game.js
//
// Phase 0 refactor: everything goes through GameState (shared/gameState.js)
// and the coord helpers (shared/coords.js). Combat and Phaser rendering
// stay here. Perspective is OFF in this phase — flip it on in Phase 1 by
// uncommenting the two lines in create() and adding the CSS transform.
//
// File map of dependencies (loaded by index.html in this order):
//   1. phaser 3.60 CDN
//   2. shared/dictionary.js   -> window.CHARACTERS, window.SYMBOLS
//   3. shared/gameState.js    -> window.GameState
//   4. shared/coords.js       -> window.BOARD, gridToWorld, worldToGrid, ...
//   5. this file

// ===========================================================================
// CONSTANTS
// ===========================================================================
const STYLE_COLORS = {
    "Strategist":     0xfcc419,
    "Solidarity":     0x4dabf7,
    "Disciplinarian": 0xff6b6b,
    "Friendly":       0x51cf66,
    "Survivalist":    0xcc5de8,
    "Hard Hitter":    0xff922b,
    "Researcher":     0x20c997
};

// Cost-tier border colors (TFT convention — instantly readable).
const COST_COLORS = {
    1: 0x9aa0a6, // grey
    2: 0x51cf66, // green
    3: 0x4dabf7, // blue
    4: 0xb197fc, // purple
    5: 0xffd43b  // gold
};
const COST_CSS = { 1:'#9aa0a6', 2:'#51cf66', 3:'#4dabf7', 4:'#b197fc', 5:'#ffd43b' };

// CSS color per synergy — used to tint the icon chip in the side panel, the
// opponent panel, and the unit info zone so each synergy is visually distinct
// even before art lands.
const STYLE_CSS = {
    "Strategist":     "#fcc419",
    "Solidarity":     "#4dabf7",
    "Disciplinarian": "#ff6b6b",
    "Friendly":       "#51cf66",
    "Survivalist":    "#cc5de8",
    "Hard Hitter":    "#ff922b",
    "Researcher":     "#20c997"
};
const WORK_CSS = {
    "Trader":        "#fcd34d",
    "Killer":        "#ef4444",
    "Mentor":        "#06b6d4",
    "Leader":        "#fbbf24",
    "Avenger":       "#a855f7",
    "Coder":         "#10b981",
    "Recruiter":     "#ec4899",
    "OutdoorPerson": "#84cc16"
};

// Build an icon chip for a synergy. Tries to load
//   client/assets/synergies/{styles|works}/<safeName>.png
// and falls back to the SYMBOLS emoji if the PNG 404s (onerror swap). The
// chip background uses the synergy's color at low alpha so the synergy is
// identifiable at a glance even when no art is present.
function synergyIconHtml(name, isStyle) {
    const emoji   = isStyle ? (SYMBOLS.styles[name] || '?')
                            : (SYMBOLS.work[name] || '?');
    const color   = (isStyle ? STYLE_CSS[name] : WORK_CSS[name]) || '#666';
    const folder  = isStyle ? 'styles' : 'works';
    const safe    = name.replace(/\s+/g, '_');
    const src     = `assets/synergies/${folder}/${safe}.png`;
    // 33 = ~20% alpha appended to the 6-digit hex (CSS hex8 notation).
    const bg = color + '33';
    return `<span class="syn-icon" style="background:${bg}; box-shadow:inset 0 0 0 1px ${color}55;">`
         + `<img src="${src}" alt="" onerror="this.outerHTML=&quot;${emoji}&quot;;" />`
         + `</span>`;
}

// ===========================================================================
// STATE (single source of truth)
// ===========================================================================
const state = new GameState();

let nextUid = 1;
const containers = new Map();   // uid -> Phaser Container (player units only here)
let phaserScene = null;
let combatTimer = null;
let enemies = [];               // Phaser containers for the enemy team

function makeUnit(charId, isEnemy = false) {
    const u = {
        uid: nextUid++,
        charId,
        stars: 1,
        currentHp: 0,
        maxHp: 0,
        abilityCharge: 0,
        attackCooldown: 0,
        isEnemy
    };
    const stats = getScaledStats(u);   // single source of truth (HP_BOOST included)
    u.maxHp = stats.hp;
    u.currentHp = stats.hp;
    return u;
}

// Stats scale geometrically with star tier: 1★=1×, 2★=1.8×, 3★=3.24×.
// Combat reads these instead of CHARACTERS[charId].baseStats so star upgrades
// actually mean something. maxHp/currentHp are stored on the unit and updated
// on merge so HP bars stay consistent.
//
// HP_BOOST is a global HP multiplier — applied here so it covers makeUnit,
// merges, resurrections, and enemy spawns automatically. Tune for fight pace.
const STAR_STAT_MULT = 1.8;
const HP_BOOST       = 1.5;
function starMultiplier(stars) {
    return Math.pow(STAR_STAT_MULT, (stars | 0) - 1);
}
function getScaledStats(unit) {
    const base = CHARACTERS[unit.charId].baseStats;
    const m = starMultiplier(unit.stars);
    return {
        hp:           Math.floor(base.hp * m * HP_BOOST),
        attack:       Math.floor(base.attack * m),
        armor:        Math.floor(base.armor * m),
        abilityPower: Math.floor(base.abilityPower * m)
    };
}

// =============================================================================
// SYNERGIES — tier evaluation + combat buff application
// =============================================================================
// activeSynergies() scans the player's board, counts each style + work, applies
// the Leader master-synergy bonus (when Leader is itself active ≥2, every other
// synergy gains +tier contributors for tier calculation only — not for display),
// and returns { styles, works } maps with { count, effective, tier }.
//
// computeCombatStats() applies the matching tier buff to a unit's star-scaled
// stats. The buff multiplier set (hp/atk/armor/ap) lives in SYNERGIES per tier.

function tierFor(count, thresholds) {
    for (let i = thresholds.length - 1; i >= 0; i--) {
        if (count >= thresholds[i]) return i;
    }
    return -1; // not active
}

// Aggregate a board array into per-synergy {count, tier} info. Works against
// our state.board (activeSynergies) and against an opponent's snapshot.board
// (updateOpponentPanel) since the synergy math doesn't care whose board it is.
function computeBoardSynergies(board) {
    const styleCounts = {};
    const workCounts  = {};
    const seen = new Set();
    (board || []).forEach(row => (row || []).forEach(u => {
        if (!u || seen.has(u.charId)) return;
        seen.add(u.charId);
        const d = CHARACTERS[u.charId];
        if (!d) return;
        styleCounts[d.style] = (styleCounts[d.style] || 0) + 1;
        d.work.forEach(w => workCounts[w] = (workCounts[w] || 0) + 1);
    }));

    const styles = {};
    Object.keys(SYNERGIES.styles).forEach(s => {
        const count = styleCounts[s] || 0;
        if (count === 0) return;
        styles[s] = { count, tier: tierFor(count, SYNERGIES.styles[s].thresholds) };
    });

    const works = {};
    Object.keys(SYNERGIES.works).forEach(w => {
        const count = workCounts[w] || 0;
        if (count === 0) return;
        works[w] = {
            count,
            tier: tierFor(count, SYNERGIES.works[w].thresholds),
            global: !!SYNERGIES.works[w].global
        };
    });

    return { styles, works };
}

function activeSynergies() { return computeBoardSynergies(state.board); }

// Run at the start of every planning phase. Trader buys you extra income;
// Recruiter banks free shop rerolls you can spend instead of gold. Both are
// driven by the current board's active synergy tiers.
function applyRoundStartSynergyEconomy() {
    const syn = activeSynergies();

    const tr = syn.works.Trader;
    if (tr && tr.tier >= 0) {
        const econ = (SYNERGIES.works.Trader.economy || [])[tr.tier];
        if (econ && econ.goldPerRound) {
            state.addGold(econ.goldPerRound, 'trader-synergy');
            flashMessage(`Trader +${econ.goldPerRound}g`);
        }
    }

    const rc = syn.works.Recruiter;
    state.freeRerolls = 0;
    if (rc && rc.tier >= 0) {
        const econ = (SYNERGIES.works.Recruiter.economy || [])[rc.tier];
        if (econ && econ.extraReroll) state.freeRerolls = econ.extraReroll;
    }
    updateRefreshButton();
}

function updateRefreshButton() {
    const btn = document.querySelector('.refresh-btn');
    if (!btn) return;
    btn.textContent = state.freeRerolls > 0
        ? `🔄 Refresh (free ${state.freeRerolls})`
        : `🔄 Refresh (2g)`;
}

// Researcher synergy discounts every XP purchase by 1g (tier 1) or 2g (tier 2).
// Min price is clamped to 1g so XP can never be free.
function computeXpCost() {
    const syn = activeSynergies();
    const r = syn.styles && syn.styles.Researcher;
    let discount = 0;
    if (r && r.tier >= 0) {
        const econ = (SYNERGIES.styles.Researcher.economy || [])[r.tier];
        if (econ && econ.xpDiscount) discount = econ.xpDiscount;
    }
    return Math.max(1, ECONOMY.XP_PURCHASE_COST - discount);
}

// Total gold needed to finish the player's current XP bar and hit the next
// level — accounting for whatever Researcher discount is active right now.
function computeNextLevelGold() {
    if (state.level >= 10) return 0;
    const xpForNext = (XP_TO_LEVEL[state.level + 1] || 0) - state.xp;
    if (xpForNext <= 0) return 0;
    const purchasesNeeded = Math.ceil(xpForNext / ECONOMY.XP_PER_PURCHASE);
    return purchasesNeeded * computeXpCost();
}

function updateBuyXpButton() {
    const btn = document.getElementById('buy-xp-btn');
    if (!btn) return;
    if (state.level >= 10) {
        btn.textContent = 'MAX LEVEL';
        btn.disabled = true;
        return;
    }
    btn.disabled = false;
    const cost = computeXpCost();
    const nextLvl = computeNextLevelGold();
    btn.textContent = `Buy XP (${cost}g) · Next Lvl: ${nextLvl}g`;
}

function computeCombatStats(unit, syn) {
    const data = CHARACTERS[unit.charId];
    const s = getScaledStats(unit);
    let hp = s.hp, atk = s.attack, armor = s.armor, ap = s.abilityPower;

    const applyBuff = (buff) => {
        if (!buff) return;
        if (buff.hp)    hp    = Math.floor(hp    * buff.hp);
        if (buff.atk)   atk   = Math.floor(atk   * buff.atk);
        if (buff.armor) armor = Math.floor(armor * buff.armor);
        if (buff.ap)    ap    = Math.floor(ap    * buff.ap);
    };

    // Style synergy — applies only to units of that style.
    const styleSyn = syn.styles[data.style];
    if (styleSyn && styleSyn.tier >= 0) {
        applyBuff(SYNERGIES.styles[data.style].buffs[styleSyn.tier]);
    }

    // Work synergies — apply if the unit carries the tag,
    // OR if the synergy is global (Leader = command aura: buffs everyone).
    Object.keys(syn.works).forEach(w => {
        const workSyn = syn.works[w];
        if (workSyn.tier < 0) return;
        const def = SYNERGIES.works[w];
        const carriesTag = data.work.includes(w);
        if (carriesTag || def.global) {
            applyBuff(def.buffs[workSyn.tier]);
        }
    });

    return { hp, attack: atk, armor, abilityPower: ap };
}

// =============================================================================
// 3-STAR MERGE
// =============================================================================
// When the player owns 3 copies of the same charId at the same star tier
// (across bench + their board), the trio fuses into a single unit one star
// higher. Stats jump via getScaledStats; the star row redraws automatically.
// Triggered after every buyUnit. Loops so 9× 1★ → 3★ in one cascade.

function checkAndMerge() {
    let cascaded = false;
    let mergedThisPass;
    do {
        mergedThisPass = false;

        // Index every player-owned unit by (charId, stars).
        const groups = new Map();
        const push = (u, loc) => {
            if (!u || u.isEnemy || u.stars >= 3) return;
            const k = u.charId + '@' + u.stars;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push({ unit: u, loc });
        };
        state.bench.forEach((u, slot) => push(u, { kind: 'bench', slot }));
        for (let r = 0; r < BOARD.ROWS; r++) {
            for (let c = 0; c < BOARD.COLS; c++) {
                push(state.board[r][c], { kind: 'board', col: c, row: r, side: 'p1' });
            }
        }
        for (const list of groups.values()) {
            if (list.length >= 3) {
                doMerge(list.slice(0, 3));
                mergedThisPass = true;
                cascaded = true;
                break;  // restart scan with the new state
            }
        }
    } while (mergedThisPass);
    return cascaded;
}

function doMerge(triplet) {
    // Survivor preference: pick a deployed unit so we don't accidentally pull
    // a unit off the active board to merge into a bench slot.
    triplet.sort((a, b) =>
        (a.loc.kind === 'board' ? 0 : 1) - (b.loc.kind === 'board' ? 0 : 1)
    );
    const survivor = triplet[0];
    const others   = triplet.slice(1);

    survivor.unit.stars += 1;
    const scaled = getScaledStats(survivor.unit);
    survivor.unit.maxHp     = scaled.hp;
    survivor.unit.currentHp = scaled.hp;

    others.forEach(o => {
        if (o.loc.kind === 'bench') state.benchTake(o.loc.slot);
        else                         state.boardPlace(o.loc.col, o.loc.row, null);
        const c = containers.get(o.unit.uid);
        if (c) c.destroy();
        containers.delete(o.unit.uid);
    });

    const survContainer = containers.get(survivor.unit.uid);
    if (survContainer) {
        updateStarRow(survContainer);
        updateHpBar(survContainer);
        // Brief pop so the upgrade is felt.
        const baseScale = survContainer.scaleX;
        phaserScene.tweens.add({
            targets: survContainer,
            scaleX: { from: baseScale * 1.45, to: baseScale },
            scaleY: { from: baseScale * 1.45, to: baseScale },
            duration: 380,
            ease: 'Back.easeOut'
        });
    }

    const stars = '★'.repeat(survivor.unit.stars);
    flashMessage(`${CHARACTERS[survivor.unit.charId].displayName} → ${stars}`);

    // If we just hit 3★, evict any currently-displayed shop card of that
    // charId so the player can't accidentally buy a now-useless duplicate.
    // The next rollShop will also exclude them from the pool entirely.
    if (survivor.unit.stars >= 3) {
        let dirty = false;
        state.shop.forEach((id, i) => {
            if (id === survivor.unit.charId) { state.shop[i] = null; dirty = true; }
        });
        if (dirty) {
            state._emit({ type: 'shop' });
            renderShop();
        }
    }
}

// Where is this uid currently? Returns {kind:'bench', slot} or {kind:'board', col, row} or null.
function findUnitLocation(uid) {
    for (let i = 0; i < state.bench.length; i++) {
        if (state.bench[i] && state.bench[i].uid === uid) return { kind: 'bench', slot: i };
    }
    for (let r = 0; r < BOARD.ROWS; r++) {
        for (let c = 0; c < BOARD.COLS; c++) {
            if (state.board[r][c] && state.board[r][c].uid === uid) {
                return { kind: 'board', col: c, row: r };
            }
        }
    }
    return null;
}

// ===========================================================================
// PHASER SCENE
// ===========================================================================
const config = {
    type: Phaser.AUTO,
    parent: 'phaser-game-canvas',
    width: 1000,
    height: 600,
    backgroundColor: '#000000',
    transparent: true,
    scene: { preload: preload, create: create }
};

const game = new Phaser.Game(config);

// ===========================================================================
// PRELOAD — asset manifest + portraits with graceful fallback
// ===========================================================================
// Two-stage load:
//   1. Load assets/manifest.json
//   2. On manifest-complete, queue an image load for each listed portrait.
// Missing PNGs are caught by `loaderror` and fall back to rectangle units
// at render time. This means art can drop in later without any code change.
function preload() {
    this.load.json('manifest', 'assets/manifest.json');

    this.load.once('filecomplete-json-manifest', () => {
        const manifest = this.cache.json.get('manifest');
        if (!manifest || !manifest.portraits) return;
        Object.entries(manifest.portraits).forEach(([charId, entry]) => {
            if (entry && entry.portrait) {
                this.load.image('portrait_' + charId, 'assets/' + entry.portrait);
            }
        });
    });

    this.load.on('loaderror', (file) => {
        console.warn('[GAME] asset missing, using fallback:', file.key);
    });
}

function create() {
    phaserScene = this;

    // ---- Phase 2: 2.5D tilted grid, upright cards ----
    // Perspective is ON: tiles project as trapeziums via cellQuad(), card
    // containers are placed at projected screen centers via cellRenderInfo
    // and scaled by depth (back rows smaller). Cards themselves DO NOT tilt
    // — they stay axis-aligned billboards, which is what gives the
    // "characters standing on a tilted board" look from the mockup.
    Perspective.enabled = true;

    drawGrid(this, 'p1', 0x4dabf7);
    drawGrid(this, 'p2', 0xff6b6b);
    drawBench(this);
    drawSellZone(this);

    installDragPipeline(this);
}

function drawGrid(scene, side, color) {
    // Tilted-board tiles: each cell is the projected trapezium of an axis-
    // aligned rectangle in canvas-local space. Three layers per side:
    //   1. dark fill   → makes each tile a solid slot, not just an outline
    //   2. neon border → identifies side (cyan = P1, red = P2)
    //   3. inner glow  → pulses for a subtle "live battlefield" feel
    const o = side === 'p2' ? BOARD.P2 : BOARD.P1;

    function insetQuad(c, r, pad) {
        const x0 = o.x + c * BOARD.CELL + pad;
        const y0 = o.y + r * BOARD.CELL + pad;
        const x1 = x0 + BOARD.CELL - 2 * pad;
        const y1 = y0 + BOARD.CELL - 2 * pad;
        return [project(x0,y0), project(x1,y0), project(x1,y1), project(x0,y1)];
    }
    function tracePath(g, q) {
        g.beginPath();
        g.moveTo(q[0].x, q[0].y);
        g.lineTo(q[1].x, q[1].y);
        g.lineTo(q[2].x, q[2].y);
        g.lineTo(q[3].x, q[3].y);
        g.closePath();
    }

    // Dark fill
    const fill = scene.add.graphics();
    fill.setDepth(-12);
    fill.fillStyle(0x0a0a14, 0.55);
    for (let r = 0; r < BOARD.ROWS; r++) {
        for (let c = 0; c < BOARD.COLS; c++) {
            tracePath(fill, insetQuad(c, r, 3));
            fill.fillPath();
        }
    }

    // Outer neon border
    const border = scene.add.graphics();
    border.setDepth(-11);
    border.lineStyle(2, color, 0.85);
    for (let r = 0; r < BOARD.ROWS; r++) {
        for (let c = 0; c < BOARD.COLS; c++) {
            tracePath(border, insetQuad(c, r, 3));
            border.strokePath();
        }
    }

    // Pulsing inner glow
    const glow = scene.add.graphics();
    glow.setDepth(-10);
    glow.lineStyle(1, color, 1);
    for (let r = 0; r < BOARD.ROWS; r++) {
        for (let c = 0; c < BOARD.COLS; c++) {
            tracePath(glow, insetQuad(c, r, 6));
            glow.strokePath();
        }
    }
    scene.tweens.add({
        targets: glow,
        alpha: { from: 0.25, to: 0.75 },
        duration: 1800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
}

function drawBench(scene) {
    const b = BOARD.BENCH;
    const h = b.slots * BOARD.CELL;
    const g = scene.add.graphics();
    g.lineStyle(2, 0xaaaaaa, 0.5);
    g.fillStyle(0x222222, 0.5);
    g.fillRect(b.x, b.y, b.w, h);
    g.strokeRect(b.x, b.y, b.w, h);
    for (let i = 1; i < b.slots; i++) {
        g.beginPath();
        g.moveTo(b.x, b.y + i * BOARD.CELL);
        g.lineTo(b.x + b.w, b.y + i * BOARD.CELL);
        g.strokePath();
    }
}

// Drop a unit here to sell it back for ECONOMY.SELL_REFUND[stars] × cost.
const SELL_ZONE = { x: 10, y: 520, w: 100, h: 65 };
let sellZoneArt = null;

function drawSellZone(scene) {
    const z = SELL_ZONE;
    const g = scene.add.graphics();
    g.fillStyle(0x551515, 0.45);
    g.fillRoundedRect(z.x, z.y, z.w, z.h, 8);
    g.lineStyle(2, 0xff4757, 0.85);
    g.strokeRoundedRect(z.x, z.y, z.w, z.h, 8);
    scene.add.text(z.x + z.w / 2, z.y + z.h / 2, '💰 SELL', {
        fontSize: '16px', fontFamily: 'Arial', color: '#ff6b6b', fontStyle: 'bold'
    }).setOrigin(0.5);
    sellZoneArt = g;
}

function pointInSellZone(x, y) {
    const z = SELL_ZONE;
    return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
}

// ===========================================================================
// UNIT CONTAINERS  (Phase 2: portrait sprite + cost frame + star row + badge)
// ===========================================================================
// Layout, top to bottom in container-local space:
//   y=-20  HP bar (40x6)
//   y=0    portrait/fallback (48x48), framed by cost-tier ring
//   y=+25  star row (1/2/3 stars by unit.stars)
// Top-right corner: synergy badge (toggled by refreshSynergyBadges()).
//
// Refs are stored via container.setData(name, obj) so children can be looked
// up by name regardless of insertion order. Combat/drag only ever touches
// these named refs — never `container.list[n]`.

// ----- Card layout constants (vertical 50×80 rectangle) ---------------------
//   Local-space y axis points DOWN. Origin is the card center.
//   Top edge y = -40, bottom edge y = +40.
//
//   The portrait now FILLS the whole card (50×80) and overlays/HUD elements
//   sit on top of it. Source art is 500×800 PNG (5:8 aspect, 10× the in-game
//   size) so it stays crisp at any browser zoom level.
//
//     +---------------+   <- card border (drawn on top)
//     |  === HP ====  |   y = -36   HP bar over portrait
//     |  === MN ====  |   y = -30   mana bar
//     |   [portrait]  |             portrait fills entire 50×80 underneath
//     |   ⭐ ⭐ ⭐    |   y = +20   stars
//     |  🧠  💻    ●  |   y = +30   style | work | active-badge
//     +---------------+
const CARD = {
    W: 50,
    H: 80,
    HP_Y:   -52,   // floats ABOVE the card top (-40) so the portrait face is unobstructed
    MANA_Y: -46,
    STARS_Y: +20,
    WORK_Y: +30,
    STYLE_ICON_XY: { x: -16, y: +30 },    // bottom-left, on portrait
    BADGE_XY:      { x: +18, y: +30 }     // bottom-right, on portrait (active synergy)
};

function buildPortraitChild(scene, unit) {
    // Fills the whole card. Uses the loaded portrait texture if present, else
    // a style-colored rectangle + short name so the game remains fully playable
    // before art is delivered.
    const charData = CHARACTERS[unit.charId];
    const texKey = 'portrait_' + unit.charId;
    if (scene.textures.exists(texKey)) {
        const img = scene.add.image(0, 0, texKey);
        img.setDisplaySize(CARD.W, CARD.H);
        if (unit.isEnemy) img.setTint(0xff8888);
        return img;
    }
    // Fallback covers the whole card too. Slightly inset so the border isn't
    // overlapped at the corners.
    const fill = unit.isEnemy ? 0x882222 : (STYLE_COLORS[charData.style] || 0x4dabf7);
    const rect = scene.add.rectangle(0, 0, CARD.W - 2, CARD.H - 2, fill);
    const shortName = charData.displayName.substring(0, 6).toUpperCase();
    const text = scene.add.text(0, 0, shortName, {
        fontSize: '10px', fontFamily: 'Arial', color: '#000000',
        fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5);
    const group = scene.add.container(0, 0, [rect, text]);
    group.setData('fallbackRect', rect);
    return group;
}

// Background: outer neon halo + dark inner fill. Drawn BEHIND the portrait so
// the dark fill peeks through any transparent edges of the source PNG.
function buildCardBg(scene, cost, isEnemy) {
    const color = isEnemy ? 0x991e1e : (COST_COLORS[cost] || 0x666666);
    const g = scene.add.graphics();
    g.lineStyle(4, color, 0.22);
    g.strokeRoundedRect(-CARD.W/2 - 1, -CARD.H/2 - 1, CARD.W + 2, CARD.H + 2, 6);
    g.fillStyle(0x0e0e16, 0.92);
    g.fillRoundedRect(-CARD.W/2, -CARD.H/2, CARD.W, CARD.H, 5);
    return g;
}

// Sharp cost-tier border. Drawn on top of everything else so the portrait
// can't cover it at the rounded corners.
function buildCardBorder(scene, cost, isEnemy) {
    const color = isEnemy ? 0x991e1e : (COST_COLORS[cost] || 0x666666);
    const g = scene.add.graphics();
    g.lineStyle(1.5, color, 1);
    g.strokeRoundedRect(-CARD.W/2, -CARD.H/2, CARD.W, CARD.H, 5);
    return g;
}

function buildStarRow(scene, stars) {
    // Tiny yellow stars at the bottom strip of the card.
    const g = scene.add.graphics();
    drawStars(g, stars);
    g.y = CARD.STARS_Y;
    return g;
}

function drawStars(g, stars) {
    g.clear();
    const n = Math.max(1, Math.min(3, stars | 0));
    const spacing = 8;
    const startX = -((n - 1) * spacing) / 2;
    g.fillStyle(0xffd43b, 1);
    g.lineStyle(1, 0x8a5a00, 1);
    for (let i = 0; i < n; i++) {
        drawStarShape(g, startX + i * spacing, 0, 3);
    }
}

function drawStarShape(g, cx, cy, r) {
    // 5-point star polygon
    const pts = [];
    for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + i * Math.PI / 5;
        const rr = i % 2 === 0 ? r : r * 0.5;
        pts.push(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
    }
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fillPath();
    g.strokePath();
}

function buildSynergyBadge(scene) {
    // Small colored dot in the top-LEFT corner — lights up when any of the
    // unit's style/work tags currently has an active synergy on the board.
    const g = scene.add.graphics();
    g.x = CARD.BADGE_XY.x;
    g.y = CARD.BADGE_XY.y;
    g.setVisible(false);
    return g;
}

function paintSynergyBadge(g, color) {
    g.clear();
    g.fillStyle(0x000000, 0.6);
    g.fillCircle(0, 0, 6);
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, 4.5);
}

function createUnitContainer(scene, unit) {
    // Vertical card 50×80. Stacking order (back to front):
    //   bg (halo + dark fill) → portrait (fills card) → HP/mana bars
    //   → stars → work icons → style icon → synergy badge → border (on top)
    const charData = CHARACTERS[unit.charId];

    const bg       = buildCardBg(scene, charData.cost, unit.isEnemy);
    const portrait = buildPortraitChild(scene, unit);
    const hpBg     = scene.add.rectangle(0, CARD.HP_Y, 40, 4, 0x440000);
    const hpFill   = scene.add.rectangle(0, CARD.HP_Y, 40, 4, 0x32cd32);
    // Mana bar (Phase 5): left-anchored rect that grows with abilityCharge.
    const manaBg   = scene.add.rectangle(0, CARD.MANA_Y, 40, 3, 0x14213a);
    const manaFill = scene.add.rectangle(-20, CARD.MANA_Y, 0, 3, 0x4dabf7).setOrigin(0, 0.5);
    const starRow  = buildStarRow(scene, unit.stars || 1);

    // Bottom: work icons (1–2 emoji, small text).
    const workStr  = charData.work.map(w => SYMBOLS.work[w] || '').join('');
    const workText = scene.add.text(0, CARD.WORK_Y, workStr, {
        fontSize: '10px', fontFamily: 'Arial', align: 'center'
    }).setOrigin(0.5, 0.5);

    // Top-right corner: style icon ("synergy icon" identifying the
    // character's primary trait at a glance).
    const styleIcon = scene.add.text(
        CARD.STYLE_ICON_XY.x, CARD.STYLE_ICON_XY.y,
        SYMBOLS.styles[charData.style] || '',
        { fontSize: '11px', fontFamily: 'Arial' }
    ).setOrigin(0.5, 0.5);

    // Top-left corner: synergy ACTIVE indicator (lit by refreshSynergyBadges)
    const badge = buildSynergyBadge(scene);

    // Drawn last so the border can't be obscured by the portrait's edges.
    const border = buildCardBorder(scene, charData.cost, unit.isEnemy);

    const container = scene.add.container(0, 0, [
        bg, portrait, hpBg, hpFill, manaBg, manaFill,
        starRow, workText, styleIcon, badge, border
    ]);
    container.setSize(CARD.W, CARD.H);
    container.setData('uid', unit.uid);
    container.setData('unit', unit);
    container.setData('portrait', portrait);
    container.setData('bg', bg);
    container.setData('border', border);
    container.setData('hpFill', hpFill);
    container.setData('manaFill', manaFill);
    container.setData('starRow', starRow);
    container.setData('badge', badge);
    // No setInteractive here — drag is handled by a scene-level pointer
    // pipeline (see installDragPipeline) using card-bbox hit-testing.
    return container;
}

// Lift the card so its BASE rests on the cell rather than its midline
// crossing the cell center. With CARD.H = 80, local bottom is at y = +40.
// LIFT = (CARD.H/2) - some_padding so the card's bottom edge lands near the
// cell's front edge.
const CARD_BASE_LIFT = 30;

// Bench cards shrink so 80-tall card visuals fit inside 60-tall bench slots.
const BENCH_SCALE = 0.7;

// Place a unit container at its logical location.
//   loc.kind === 'bench' → upright in the bench column, scaled to fit slot.
//   loc.kind === 'board' → projected screen center of the cell, scaled by
//                          cellRenderInfo.scale (back rows = smaller).
function placeUnitContainer(container, loc) {
    if (loc.kind === 'bench') {
        const p = benchSlotCenter(loc.slot);
        container.x = p.x;
        container.y = p.y;
        container.setScale(BENCH_SCALE);
        container.setDepth(0);
        return;
    }
    // board
    const unit = container.getData('unit');
    const side = loc.side || (unit && unit.isEnemy ? 'p2' : 'p1');
    const info = cellRenderInfo(loc.col, loc.row, side);
    container.x = info.screen.x;
    container.y = info.screen.y - CARD_BASE_LIFT * info.scale;
    container.setScale(info.scale);
    // Larger y on screen = closer to viewer = drawn on top of back rows.
    container.setDepth(info.screen.y);
}

function updateHpBar(container) {
    const unit = container.getData('unit');
    const pct = Math.max(0, unit.currentHp / unit.maxHp);
    const hpFill = container.getData('hpFill');
    // HP bar is 40 wide at full HP; scale by current/max.
    if (hpFill) hpFill.width = 40 * pct;
}

// Mana bar reads unit.abilityCharge / ability.chargeMax. Bar is left-anchored
// (origin 0, 0.5) so its width grows from the left edge.
function updateManaBar(container) {
    const fill = container.getData('manaFill');
    if (!fill) return;
    const unit = container.getData('unit');
    if (!unit) return;
    const def = CHARACTERS[unit.charId].ability;
    if (!def) { fill.width = 0; return; }
    const cur = unit.abilityCharge || 0;
    const max = def.chargeMax || 1;
    fill.width = 40 * Math.max(0, Math.min(1, cur / max));
}

function updateStarRow(container) {
    const unit = container.getData('unit');
    const starRow = container.getData('starRow');
    if (starRow && unit) drawStars(starRow, unit.stars || 1);
}

// ===========================================================================
// BUY / SHOP
// ===========================================================================
window.buyUnit = function (charId) {
    const charData = CHARACTERS[charId];
    if (!charData) return false;

    // Check bench BEFORE spending gold so we never have to refund.
    if (state.bench.every(s => s !== null)) {
        flashMessage('Bench is full!');
        return false;
    }
    if (!state.spendGold(charData.cost, 'buy')) {
        flashMessage('Not enough gold!');
        return false;
    }

    const unit = makeUnit(charId);
    const slot = state.benchAdd(unit);
    const container = createUnitContainer(phaserScene, unit);
    placeUnitContainer(container, { kind: 'bench', slot });
    containers.set(unit.uid, container);
    // After every buy, see if this completes a triple (and cascade upward).
    checkAndMerge();
    return true;
};

// ===========================================================================
// DRAG & DROP  (Phase 2: scene-level pointer pipeline, screen-space hit-test)
// ===========================================================================
// Phaser's per-object draggable + axis-aligned hit area can't represent the
// projected trapezium cells on a tilted board. Instead we listen for pointer
// events on the scene and route them ourselves:
//
//   pointerdown → screenToCell(p1) / benchSlotAt(p) → start drag if a unit
//                 occupies that location
//   pointermove → translate the dragged container to follow the pointer
//   pointerup   → screenToCell / benchSlotAt at the drop point → place or
//                 snap back via placeUnitContainer(origin)
//
// This works because the canvas no longer has a CSS transform, so
// pointer.x/y from Phaser is already in canvas-local screen pixels — the
// same space cellQuad() returns.

let dragState = null;   // { container, unit, origin }

function snapBack(container, origin) {
    placeUnitContainer(container, origin);
}

// Pickup hit-test: find the topmost player card whose screen bbox contains
// (x, y). Bbox matches the vertical card visual (50×80) + a few px of slop.
const CARD_HALF_W = CARD.W / 2 + 2;
const CARD_HALF_H = CARD.H / 2 + 2;
function findPlayerCardAt(x, y) {
    let found = null;
    let maxDepth = -Infinity;
    containers.forEach((c) => {
        if (!c.active) return;
        const u = c.getData('unit');
        if (!u || u.isEnemy) return;
        const halfW = CARD_HALF_W * c.scaleX;
        const halfH = CARD_HALF_H * c.scaleY;
        if (x >= c.x - halfW && x <= c.x + halfW &&
            y >= c.y - halfH && y <= c.y + halfH) {
            if (c.depth > maxDepth) {
                maxDepth = c.depth;
                found = c;
            }
        }
    });
    return found;
}

// Push character details into the footer info zone. Called on pointermove
// hover (idle, not dragging). Pass null to clear back to the prompt.
let _lastInfoUid = null;
function updateInfoZone(unit) {
    const body = document.getElementById('info-zone-body');
    if (!body) return;
    if (!unit) {
        if (_lastInfoUid !== null) {
            body.innerHTML = '<p style="color:#666; font-size:0.85em;">Hover a card to see details.</p>';
            _lastInfoUid = null;
        }
        return;
    }
    if (unit.uid === _lastInfoUid) return; // no change
    _lastInfoUid = unit.uid;

    const data  = CHARACTERS[unit.charId];
    const sIcon = synergyIconHtml(data.style, true);
    const wTags = data.work.map(w => `${synergyIconHtml(w, false)} ${w}`).join(' · ');
    const stars = '★'.repeat(unit.stars || 1);
    const stats = getScaledStats(unit);
    const cost  = data.cost;
    const tier  = COST_CSS[cost] || '#9aa0a6';

    let abilityHtml = '';
    if (data.ability) {
        const handler = ABILITIES[data.ability.id];
        const aName = (handler && handler.name) || data.ability.id;
        abilityHtml = `<div class="info-ability">
          <strong>${aName}</strong>
          <span style="color:#aaa">— charges every ${data.ability.chargeMax} attacks</span>
        </div>`;
    }

    body.innerHTML = `
      <div class="info-name" style="border-left: 3px solid ${tier}; padding-left: 6px;">
        ${data.displayName} <span style="color:${tier}; font-size:0.8em;">${cost}g</span>
        <span style="color:#ffd43b; font-size:0.9em;"> ${stars}</span>
      </div>
      <div class="info-tags">${sIcon} ${data.style} &nbsp; ${wTags}</div>
      <div class="info-stats">
        HP ${unit.currentHp}/${unit.maxHp} &nbsp; ATK ${stats.attack}<br>
        ARM ${stats.armor} &nbsp; AP ${stats.abilityPower}
      </div>
      ${abilityHtml}
    `;
}

function installDragPipeline(scene) {
    scene.input.on('pointerdown', (pointer) => {
        if (dragState) return;
        if (state.phase !== 'planning') return;
        const px = pointer.x, py = pointer.y;

        // Hit-test the card itself (not the cell beneath it). This lets the
        // user grab a card by clicking anywhere on its visual, including the
        // lifted upper portion that floats above the tile.
        const c = findPlayerCardAt(px, py);
        if (c) {
            const u = c.getData('unit');
            const loc = findUnitLocation(u.uid);
            if (loc) beginDrag(u, loc);
        }
    });

    scene.input.on('pointermove', (pointer) => {
        if (dragState) {
            dragState.container.x = pointer.x;
            dragState.container.y = pointer.y;
            return;
        }
        // Idle hover → show info for whichever card is under the cursor.
        const c = findPlayerCardAt(pointer.x, pointer.y);
        updateInfoZone(c ? c.getData('unit') : null);
    });

    scene.input.on('pointerup', (pointer) => {
        if (!dragState) return;
        const { container, unit, origin } = dragState;
        dragState = null;
        container.setAlpha(1);
        container.setDepth(0);

        // Drop targets, in priority order:
        //   1. Sell zone     → refund gold, destroy unit.
        //   2. P1 board cell → place / swap.
        //   3. Bench slot    → place / swap.
        //   Otherwise        → snap back to origin.
        if (pointInSellZone(pointer.x, pointer.y)) {
            sellUnit(container, unit, origin);
            return;
        }
        const cell = screenToCell(pointer.x, pointer.y, 'p1');
        if (cell) {
            tryPlaceOnBoard(container, unit, origin, cell);
            return;
        }
        const slot = benchSlotAt(pointer.x, pointer.y);
        if (slot !== -1) {
            tryPlaceOnBench(container, unit, origin, slot);
            return;
        }
        snapBack(container, origin);
    });
}

function beginDrag(unit, origin) {
    const container = containers.get(unit.uid);
    if (!container) return;
    dragState = { container, unit, origin };
    container.setAlpha(0.6);
    container.setDepth(10000);   // float above everything while dragging
    container.setScale(1);       // un-shrink so back-row pickups don't look tiny
}

function tryPlaceOnBoard(container, unit, origin, cell) {
    const occupant = state.board[cell.row][cell.col];

    // Bench -> empty cell: enforce deploy cap (= player level)
    if (!occupant && origin.kind === 'bench') {
        if (state.boardCount() >= state.capForLevel()) {
            flashMessage(`Board limit: ${state.capForLevel()} units at level ${state.level}`);
            snapBack(container, origin);
            return;
        }
    }

    // Clear origin slot
    if (origin.kind === 'bench') state.benchTake(origin.slot);
    else                          state.boardPlace(origin.col, origin.row, null);

    // Place on target cell
    state.boardPlace(cell.col, cell.row, unit);
    placeUnitContainer(container, { kind: 'board', col: cell.col, row: cell.row, side: 'p1' });

    // Move any displaced occupant back to where the dragged unit came from
    if (occupant && occupant.uid !== unit.uid) {
        const occContainer = containers.get(occupant.uid);
        if (origin.kind === 'bench') {
            state.benchSet(origin.slot, occupant);
            placeUnitContainer(occContainer, { kind: 'bench', slot: origin.slot });
        } else {
            state.boardPlace(origin.col, origin.row, occupant);
            placeUnitContainer(occContainer, { kind: 'board', col: origin.col, row: origin.row, side: 'p1' });
        }
    }
}

// Refund the unit's current value and remove it. Refund multiplier scales with
// stars: 1×/3×/9× of the base cost for 1★/2★/3★ (set in ECONOMY.SELL_REFUND).
function sellUnit(container, unit, origin) {
    const charData = CHARACTERS[unit.charId];
    const mult     = (ECONOMY.SELL_REFUND && ECONOMY.SELL_REFUND[unit.stars]) || 1;
    const refund   = charData.cost * mult;

    if (origin.kind === 'bench') state.benchTake(origin.slot);
    else                          state.boardPlace(origin.col, origin.row, null);

    container.destroy();
    containers.delete(unit.uid);

    state.addGold(refund, 'sell');
    flashMessage(`Sold ${charData.displayName} (+${refund}g)`);
}

function tryPlaceOnBench(container, unit, origin, slot) {
    const occupant = state.bench[slot];

    if (origin.kind === 'bench') state.benchTake(origin.slot);
    else                          state.boardPlace(origin.col, origin.row, null);

    state.benchSet(slot, unit);
    placeUnitContainer(container, { kind: 'bench', slot });

    if (occupant && occupant.uid !== unit.uid) {
        const occContainer = containers.get(occupant.uid);
        if (origin.kind === 'bench') {
            state.benchSet(origin.slot, occupant);
            placeUnitContainer(occContainer, { kind: 'bench', slot: origin.slot });
        } else {
            state.boardPlace(origin.col, origin.row, occupant);
            placeUnitContainer(occContainer, { kind: 'board', col: origin.col, row: origin.row, side: 'p1' });
        }
    }
}

// ===========================================================================
// ABILITIES  (scaffolded — generic visuals, ready for an art swap)
// ===========================================================================
// Contract per character (optional, in dictionary.js):
//   ability: { id: "<key in ABILITIES>", chargeMax: N }
//
// combatTick calls tryCastAbility(...) on every attacker after its normal
// attack lands. The caster's `abilityCharge` ticks up by 1 each attack and
// at chargeMax the matching handler in ABILITIES fires. To swap art for a
// specific ability later, replace its execute() — combat / charge / damage
// plumbing doesn't change.
//
// All damage from abilities goes through applyDamage() so the death path
// (enemy destroy() vs player hide+deactivate-for-resurrection) is consistent
// with the basic-attack code.

function applyDamage(target, dmg) {
    if (!target.active) return;
    const u = target.getData('unit');
    u.currentHp -= dmg;
    updateHpBar(target);
    if (u.currentHp <= 0) {
        if (u.isEnemy) target.destroy();
        else { target.setVisible(false); target.setActive(false); }
    }
}

// All ability damage/healing scales by the caster's scaled abilityPower.
// AP grows with both cost tier (baseStats) and stars (× starMultiplier), so a
// 4g 2★ unit naturally hits much harder than a 1g 1★ unit casting the same
// ability id — no per-cost code paths needed.
function casterAP(caster) {
    return getScaledStats(caster.getData('unit')).abilityPower;
}

const ABILITIES = {
    // ----- BASIC (1g flavour) -----------------------------------------------
    // Big single-target burst on a random live enemy.
    single_strike: {
        name: "Strike",
        execute(scene, caster, allies, enemies) {
            const live = enemies.filter(c => c.active && c.visible);
            if (!live.length) return;
            const target = live[Math.floor(Math.random() * live.length)];
            const slash = scene.add.graphics();
            slash.lineStyle(5, 0xfff066, 1);
            slash.beginPath();
            slash.moveTo(caster.x, caster.y);
            slash.lineTo(target.x, target.y);
            slash.strokePath();
            scene.tweens.add({ targets: slash, alpha: 0, duration: 350,
                onComplete: () => slash.destroy() });
            applyDamage(target, Math.floor(casterAP(caster) * 1.4));
        }
    },
    // Hit the 2 nearest enemies with a sweep.
    cleave: {
        name: "Cleave",
        execute(scene, caster, allies, enemies) {
            const live = enemies.filter(c => c.active && c.visible);
            if (!live.length) return;
            const targets = live
                .map(t => ({ t, d: Phaser.Math.Distance.Between(caster.x, caster.y, t.x, t.y) }))
                .sort((a, b) => a.d - b.d)
                .slice(0, 2)
                .map(x => x.t);
            const dmg = Math.floor(casterAP(caster) * 0.95);
            targets.forEach(t => {
                const sweep = scene.add.graphics();
                sweep.lineStyle(4, 0xff922b, 0.95);
                sweep.beginPath();
                sweep.moveTo(caster.x, caster.y);
                sweep.lineTo(t.x, t.y);
                sweep.strokePath();
                scene.tweens.add({ targets: sweep, alpha: 0, duration: 320,
                    onComplete: () => sweep.destroy() });
                applyDamage(t, dmg);
            });
        }
    },

    // ----- CHAIN / AOE ------------------------------------------------------
    // Cyan lightning that bounces to up to 3 nearest enemies, diminishing.
    chain_zap: {
        name: "Chain Zap",
        execute(scene, caster, allies, enemies) {
            const live = enemies.filter(c => c.active && c.visible);
            if (!live.length) return;
            const sorted = live
                .map(t => ({ t, d: Phaser.Math.Distance.Between(caster.x, caster.y, t.x, t.y) }))
                .sort((a, b) => a.d - b.d)
                .slice(0, 3)
                .map(x => x.t);
            const baseDmg = Math.floor(casterAP(caster) * 1.0);
            let prev = caster;
            sorted.forEach((t, i) => {
                const zap = scene.add.graphics();
                zap.lineStyle(3, 0x00ffff, 1);
                zap.beginPath();
                zap.moveTo(prev.x, prev.y);
                const mx = (prev.x + t.x) / 2 + (Math.random() - 0.5) * 24;
                const my = (prev.y + t.y) / 2 + (Math.random() - 0.5) * 24;
                zap.lineTo(mx, my);
                zap.lineTo(t.x, t.y);
                zap.strokePath();
                scene.tweens.add({ targets: zap, alpha: 0, duration: 420,
                    onComplete: () => zap.destroy() });
                applyDamage(t, Math.floor(baseDmg * Math.pow(0.7, i)));
                prev = t;
            });
        }
    },
    // Expanding ring centered on caster; everything in the final radius takes damage.
    aoe_blast: {
        name: "Blast",
        execute(scene, caster, allies, enemies) {
            const radius = 110;
            const ring = scene.add.graphics();
            const obj = { r: 8 };
            scene.tweens.add({
                targets: obj, r: radius, duration: 480, ease: 'Cubic.easeOut',
                onUpdate: () => {
                    ring.clear();
                    ring.lineStyle(3, 0xff922b, Math.max(0, 1 - obj.r / radius));
                    ring.strokeCircle(caster.x, caster.y, obj.r);
                },
                onComplete: () => ring.destroy()
            });
            const dmg = Math.floor(casterAP(caster) * 0.85);
            enemies.forEach(t => {
                if (!t.active || !t.visible) return;
                const d = Phaser.Math.Distance.Between(caster.x, caster.y, t.x, t.y);
                if (d <= radius) applyDamage(t, dmg);
            });
        }
    },

    // ----- SUPPORT ----------------------------------------------------------
    // Green pulse — restores HP to every living ally.
    heal_aura: {
        name: "Aura",
        execute(scene, caster, allies, enemies) {
            const heal = Math.floor(casterAP(caster) * 1.0);
            const ring = scene.add.graphics();
            ring.fillStyle(0x32cd32, 0.28);
            ring.fillCircle(caster.x, caster.y, 70);
            scene.tweens.add({ targets: ring, alpha: 0, duration: 600,
                onComplete: () => ring.destroy() });
            allies.forEach(c => {
                if (!c.active || !c.visible) return;
                const u = c.getData('unit');
                u.currentHp = Math.min(u.maxHp, u.currentHp + heal);
                updateHpBar(c);
            });
        }
    },
    // Yellow rally — heal whole team a bit (placeholder for a real attack buff).
    team_buff: {
        name: "Rally",
        execute(scene, caster, allies, enemies) {
            const heal = Math.floor(casterAP(caster) * 0.7);
            const ring = scene.add.graphics();
            ring.fillStyle(0xffd43b, 0.22);
            ring.fillCircle(caster.x, caster.y, 90);
            scene.tweens.add({ targets: ring, alpha: 0, duration: 700,
                onComplete: () => ring.destroy() });
            allies.forEach(c => {
                if (!c.active || !c.visible) return;
                const u = c.getData('unit');
                u.currentHp = Math.min(u.maxHp, u.currentHp + heal);
                updateHpBar(c);
            });
        }
    },
    // Blue ring on the lowest-HP ally (or self), restoring a chunk of HP.
    shield_ally: {
        name: "Shield",
        execute(scene, caster, allies, enemies) {
            const cu = caster.getData('unit');
            const shield = Math.floor(casterAP(caster) * 0.85);
            const live = allies.filter(c => c.active && c.visible);
            // Lowest HP-ratio ally; defaults to self if no allies tracked.
            let target = caster;
            if (live.length) {
                target = live.reduce((lo, c) => {
                    const lu = lo.getData('unit'), uu = c.getData('unit');
                    return (uu.currentHp / uu.maxHp) < (lu.currentHp / lu.maxHp) ? c : lo;
                });
            }
            const tu = target.getData('unit');
            tu.currentHp = Math.min(tu.maxHp, tu.currentHp + shield);
            updateHpBar(target);
            const ring = scene.add.graphics();
            ring.lineStyle(3, 0x4dabf7, 0.95);
            ring.strokeCircle(target.x, target.y, 35);
            scene.tweens.add({ targets: ring, alpha: 0, duration: 520,
                onComplete: () => ring.destroy() });
        }
    },
    // Slow: deal damage and bleed mana off the target so their next cast is delayed.
    slow_enemy: {
        name: "Slow",
        execute(scene, caster, allies, enemies) {
            const live = enemies.filter(c => c.active && c.visible);
            if (!live.length) return;
            const target = live
                .map(t => ({ t, d: Phaser.Math.Distance.Between(caster.x, caster.y, t.x, t.y) }))
                .sort((a, b) => a.d - b.d)[0].t;
            applyDamage(target, Math.floor(casterAP(caster) * 0.6));
            const tu = target.getData('unit');
            tu.abilityCharge = Math.max(0, (tu.abilityCharge || 0) - 2);
            updateManaBar(target);
            const spiral = scene.add.graphics();
            spiral.lineStyle(2, 0x4dabf7, 0.85);
            spiral.strokeCircle(target.x, target.y, 30);
            scene.tweens.add({ targets: spiral, alpha: 0, duration: 600,
                onComplete: () => spiral.destroy() });
        }
    }
};

// Attack speed (style-based) determines mana fill rate. Default 1.0 if the
// style isn't in the table.
function unitAttackSpeed(unit) {
    const data = CHARACTERS[unit.charId];
    if (!data) return 1.0;
    return (typeof STYLE_ATTACK_SPEED !== 'undefined' && STYLE_ATTACK_SPEED[data.style]) || 1.0;
}

// Tick a caster's mana after a basic attack. Mana fills +1 per attack now
// that attack RATE itself differs per unit — the speed advantage is already
// expressed in how often this function runs.
function tryCastAbility(scene, attacker, allies, enemies) {
    const u   = attacker.getData('unit');
    const def = CHARACTERS[u.charId].ability;
    if (!def) return;
    u.abilityCharge = (u.abilityCharge || 0) + 1;
    updateManaBar(attacker);
    if (u.abilityCharge < (def.chargeMax || 3)) return;
    u.abilityCharge = 0;
    updateManaBar(attacker);
    const handler = ABILITIES[def.id];
    if (!handler) return;
    handler.execute(scene, attacker, allies, enemies);
    flashMessage(`${CHARACTERS[u.charId].displayName}: ${handler.name}!`);
}

// ===========================================================================
// COMBAT
// ===========================================================================
// Each unit attacks at its own natural cadence: base interval = 1500ms,
// individual interval = BASE_ATTACK_INTERVAL_MS / unitAttackSpeed(unit).
// So a Hard Hitter (1.30) swings every ~1154ms and a Survivalist (0.85)
// every ~1765ms. We run a fast 250ms global tick that just decrements each
// unit's cooldown; only units whose cooldown hits zero actually attack on
// that tick. Mana fills +1 per attack — the speed differentiation is now
// expressed in attack rate, not mana gain.
const COMBAT_TICK_MS         = 250;
const BASE_ATTACK_INTERVAL_MS = 1500;

function startActionPhase() {
    if (state.phase === 'combat') return;
    state.phase = 'combat';
    // Drag is gated on state.phase === 'planning' in the pointer pipeline,
    // so flipping phase is the lock — no per-unit setInteractive cleanup needed.
    spawnEnemyTeam();

    combatTimer = phaserScene.time.addEvent({
        delay: COMBAT_TICK_MS, loop: true, callback: combatTick
    });
}

// Most recent opponent snapshot from the net layer. When set, spawnEnemyTeam
// mirrors it onto P2 instead of generating random enemies.
let pendingOpponentSnapshot = null;

function spawnEnemyTeam() {
    enemies = [];
    if (pendingOpponentSnapshot && pendingOpponentSnapshot.board) {
        spawnEnemyTeamFromSnapshot(pendingOpponentSnapshot);
        pendingOpponentSnapshot = null;
        return;
    }
    // Single-player fallback: random opponents scaled to your deployed count.
    const allIds = Object.keys(CHARACTERS);
    const enemyCount = Math.max(1, Math.min(state.boardCount() + 1, BOARD.COLS * BOARD.ROWS));
    for (let i = 0; i < enemyCount; i++) {
        const charId = allIds[Math.floor(Math.random() * allIds.length)];
        const col = i % BOARD.COLS;
        const row = Math.floor(i / BOARD.COLS);
        const unit = makeUnit(charId, true);
        const c = createUnitContainer(phaserScene, unit);
        placeUnitContainer(c, { kind: 'board', col, row, side: 'p2' });
        enemies.push(c);
    }
}

// Build enemy team from the opponent's GameState.snapshot(): board[row][col]
// entries carry charId + stars, which is everything we need to rebuild
// equivalent unit objects on our P2 grid.
function spawnEnemyTeamFromSnapshot(snap) {
    for (let r = 0; r < BOARD.ROWS; r++) {
        for (let c = 0; c < BOARD.COLS; c++) {
            const oppUnit = snap.board[r] && snap.board[r][c];
            if (!oppUnit || !CHARACTERS[oppUnit.charId]) continue;
            const unit = makeUnit(oppUnit.charId, true);
            unit.stars = oppUnit.stars || 1;
            // Resync hp to the unit's scaled max so star tier is honoured.
            const scaled = getScaledStats(unit);
            unit.maxHp = scaled.hp;
            unit.currentHp = scaled.hp;
            const container = createUnitContainer(phaserScene, unit);
            placeUnitContainer(container, { kind: 'board', col: c, row: r, side: 'p2' });
            enemies.push(container);
        }
    }
}

function combatTick() {
    // Living deployed player units (skip bench).
    const playerUnits = [];
    containers.forEach(c => {
        if (!c.active) return;
        const u = c.getData('unit');
        const loc = findUnitLocation(u.uid);
        if (loc && loc.kind === 'board') playerUnits.push(c);
    });
    const liveEnemies = enemies.filter(c => c.active);

    if (playerUnits.length === 0 || liveEnemies.length === 0) {
        endCombat(liveEnemies.length === 0);
        return;
    }

    // Cache the active synergies once per tick (only player units benefit).
    const syn = activeSynergies();

    [...playerUnits, ...liveEnemies].forEach(attacker => {
        if (!attacker.active) return;
        const aUnit = attacker.getData('unit');

        // Decrement personal cooldown; only attack when it's elapsed.
        aUnit.attackCooldown = (aUnit.attackCooldown || 0) - COMBAT_TICK_MS;
        if (aUnit.attackCooldown > 0) return;

        const pool = aUnit.isEnemy ? playerUnits.filter(c => c.active)
                                   : liveEnemies.filter(c => c.active);
        if (pool.length === 0) return;

        const target = pool.reduce((closest, curr) => {
            const dc  = Phaser.Math.Distance.Between(attacker.x, attacker.y, curr.x, curr.y);
            const dcl = Phaser.Math.Distance.Between(attacker.x, attacker.y, closest.x, closest.y);
            return dc < dcl ? curr : closest;
        });

        // Player units get synergy buffs; enemies use raw star-scaled stats.
        const aStats = aUnit.isEnemy ? getScaledStats(aUnit) : computeCombatStats(aUnit, syn);
        const tUnit  = target.getData('unit');
        const tStats = tUnit.isEnemy ? getScaledStats(tUnit) : computeCombatStats(tUnit, syn);
        const damage = Math.max(5, aStats.attack - tStats.armor / 2);
        tUnit.currentHp -= damage;

        // Reset attack cooldown — faster units (attackSpeed > 1) get shorter
        // cooldowns and thus more swings per fight.
        aUnit.attackCooldown = BASE_ATTACK_INTERVAL_MS / unitAttackSpeed(aUnit);

        // Laser beam VFX
        const laser = phaserScene.add.graphics();
        laser.lineStyle(4, aUnit.isEnemy ? 0xff0000 : 0x00ffff, 1);
        laser.beginPath();
        laser.moveTo(attacker.x, attacker.y);
        laser.lineTo(target.x,   target.y);
        laser.strokePath();
        phaserScene.tweens.add({
            targets: laser, alpha: 0, duration: 300,
            onComplete: () => laser.destroy()
        });

        updateHpBar(target);
        if (tUnit.currentHp <= 0) {
            // Player units come back next round, so we hide+deactivate
            // instead of destroying. Enemies are spawned fresh each round,
            // so we can destroy them outright.
            if (tUnit.isEnemy) {
                target.destroy();
            } else {
                target.setVisible(false);
                target.setActive(false);
            }
        }

        // Charge the attacker's ability and maybe cast it.
        const allies = aUnit.isEnemy
            ? liveEnemies.filter(c => c.active)
            : playerUnits.filter(c => c.active);
        const foes = aUnit.isEnemy
            ? playerUnits.filter(c => c.active)
            : liveEnemies.filter(c => c.active);
        tryCastAbility(phaserScene, attacker, allies, foes);
    });
}

// Damage taken on a loss = base 2 + sum over surviving enemies of
//   max(1, floor((stars + cost) * hpRatio / 2))
// So a 3★ 5g enemy at full HP hits for floor(8 * 1.0 / 2) = 4, while a 1★ 1g
// at 10% HP hits for max(1, 0) = 1.
function computeLossDamage(survivors) {
    let dmg = 2;
    survivors.forEach(c => {
        const u    = c.getData('unit');
        const cost = CHARACTERS[u.charId].cost;
        const hpR  = Math.max(0, u.currentHp / u.maxHp);
        dmg += Math.max(1, Math.floor((u.stars + cost) * hpR / 2));
    });
    return dmg;
}

function endCombat(won) {
    if (combatTimer) { combatTimer.remove(); combatTimer = null; }

    // Score enemy survivors BEFORE we destroy their containers.
    const enemySurvivors = enemies.filter(c => c.active);
    const lossDamage = won ? 0 : computeLossDamage(enemySurvivors);

    enemies.forEach(c => { if (c.active) c.destroy(); });
    enemies = [];

    // Resurrect — restore HP and visibility for every player unit, then
    // re-place it at its logical location (handles position drift if anything
    // moved during combat). state.board/bench are NOT reaped: dead units
    // come back next round.
    containers.forEach((c) => {
        const u = c.getData('unit');
        u.currentHp = u.maxHp;
        u.abilityCharge = 0;       // reset cast meter between rounds
        u.attackCooldown = 0;      // ready to swing immediately next round
        updateHpBar(c);
        updateManaBar(c);
        c.setVisible(true);
        c.setActive(true);
        const loc = findUnitLocation(u.uid);
        if (loc) {
            if (loc.kind === 'board') {
                placeUnitContainer(c, { kind: 'board', col: loc.col, row: loc.row, side: 'p1' });
            } else {
                placeUnitContainer(c, { kind: 'bench', slot: loc.slot });
            }
        }
    });

    state.recordCombatResult(won, lossDamage);

    // Let the opponent know how we did (their UI can mirror our HP track).
    if (window.Net && Net.connected && Net.matched) {
        Net.send('combat_result', { won, lossDamage, playerHp: state.playerHp });
    }

    if (state.phase === 'gameover') {
        flashMessage('Game over — you ran out of HP!');
        return;
    }

    // Round transition
    state.collectRoundIncome();
    applyRoundStartSynergyEconomy();
    state.rollShop(CHARACTERS);
    renderShop();
    if (won) flashMessage(`Round won. +${ECONOMY.WIN_BONUS}g`);
    else     flashMessage(`Round lost. -${lossDamage} HP`);

    const fightBtn = document.getElementById('start-fight-btn');
    if (fightBtn) fightBtn.style.display = '';
}

// ===========================================================================
// SYNERGY PANEL (HTML side panels)
// ===========================================================================
function updateSynergyPanel() {
    const syn = activeSynergies();

    // Build the deployed-roster unique map for the unit list (separate from
    // synergy aggregation since activeSynergies already de-dupes).
    const uniqueUnits = new Map();
    state.board.forEach(row => row.forEach(unit => {
        if (!unit) return;
        const data = CHARACTERS[unit.charId];
        if (!uniqueUnits.has(data.id)) uniqueUnits.set(data.id, data);
    }));

    const tierStars = (tier) => '★'.repeat(tier + 1); // tier 0 → ★, tier 1 → ★★, tier 2 → ★★★

    // Render a single synergy row. Inactive synergies (tier < 0) are dimmed so
    // the player can see what they're working toward. The ability description
    // is in a .syn-desc child that's hidden by default — CSS reveals on hover.
    function renderRow(name, info, def, isStyle) {
        const next  = def.thresholds.find(t => t > info.count);
        const stars = info.tier >= 0 ? tierStars(info.tier) : '';
        const color = info.tier >= 0 ? '#ffd43b' : '#888';
        const nextStr = next ? ` <span style="color:#666">→ ${next}</span>` : '';
        const globalTag = def.global && info.tier >= 0
            ? ` <span style="color:#ff922b;font-weight:bold">COMMAND</span>`
            : '';
        const descTier = info.tier >= 0 ? info.tier : 0;
        const desc = (def.tierDesc && def.tierDesc[descTier]) || '';
        const descColor = info.tier >= 0 ? '#9ae6b4' : '#aab';
        return `<div class="syn-row" style="color:${color}">
          <div class="syn-head">${synergyIconHtml(name, isStyle)} ${name} ${stars} <strong>${info.count}</strong>${nextStr}${globalTag}</div>
          <div class="syn-desc" style="color:${descColor};">${desc}</div>
        </div>`;
    }

    const synPanel = document.querySelector('.p1-synergies');
    if (synPanel) {
        let html = '<strong style="color:white; display:block; margin-bottom:5px;">Active Synergies <span style="color:#777; font-size:0.75em;">(hover row for ability)</span></strong>';
        let any = false;
        Object.keys(syn.styles).forEach(s => {
            html += renderRow(s, syn.styles[s], SYNERGIES.styles[s], true);
            any = true;
        });
        Object.keys(syn.works).forEach(w => {
            html += renderRow(w, syn.works[w], SYNERGIES.works[w], false);
            any = true;
        });
        synPanel.innerHTML = any ? html : '<p style="color:#666;">No active synergies</p>';
    }

    const unitList = document.querySelector('.p1-unit-list');
    if (unitList) {
        let html = '<strong style="color:white; display:block; margin-bottom:5px;">Deployed Roster</strong>';
        if (uniqueUnits.size === 0) {
            html += '<p style="color:#666;">No units deployed.</p>';
        } else {
            uniqueUnits.forEach(d => {
                const sIcon  = SYMBOLS.styles[d.style] || '';
                const wIcons = d.work.map(w => SYMBOLS.work[w] || '').join('');
                html += `<div>${sIcon}${wIcons} <strong>${d.displayName}</strong></div>`;
            });
        }
        unitList.innerHTML = html;
    }
}

// ===========================================================================
// OPPONENT PANEL  (right side — multiplayer mirror)
// ===========================================================================
// Paints the same kind of synergy + roster info as the left panel but using
// data we received from the server. Inputs:
//   updateOpponentPanel(snapshot)  — paint after every opponent_snapshot
//   setOpponentHp(hp)              — refresh after opponent_combat_result
//   clearOpponentPanel()           — reset to "Waiting…" on opponent_left
//   setOpponentName(label)         — header text
function updateOpponentPanel(snapshot) {
    if (!snapshot) { clearOpponentPanel(); return; }

    if (typeof snapshot.playerHp === 'number') setOpponentHp(snapshot.playerHp);

    const syn = computeBoardSynergies(snapshot.board);

    const synPanel = document.querySelector('.p2-synergies');
    if (synPanel) {
        let html = '<strong style="color:white; display:block; margin-bottom:5px;">Opponent Synergies</strong>';
        let any = false;
        const row = (name, info, isStyle) => {
            const stars = info.tier >= 0 ? '★'.repeat(info.tier + 1) : '';
            const color = info.tier >= 0 ? '#ff8a8a' : '#888';
            return `<div style="color:${color}">${synergyIconHtml(name, isStyle)} ${name} ${stars} <strong>${info.count}</strong></div>`;
        };
        Object.keys(syn.styles).forEach(s => { html += row(s, syn.styles[s], true);  any = true; });
        Object.keys(syn.works).forEach(w  => { html += row(w, syn.works[w], false); any = true; });
        synPanel.innerHTML = any ? html : '<p style="color:#666;">No active synergies</p>';
    }

    const unitList = document.querySelector('.p2-unit-list');
    if (unitList) {
        const unique = new Map();
        (snapshot.board || []).forEach(row => (row || []).forEach(u => {
            if (!u) return;
            const d = CHARACTERS[u.charId];
            if (!d || unique.has(d.id)) return;
            unique.set(d.id, { data: d, stars: u.stars || 1 });
        }));
        let html = '<strong style="color:white; display:block; margin-bottom:5px;">Opponent Roster</strong>';
        if (unique.size === 0) {
            html += '<p style="color:#666;">No units deployed.</p>';
        } else {
            unique.forEach(({ data, stars }) => {
                const sIcon  = SYMBOLS.styles[data.style] || '';
                const wIcons = data.work.map(w => SYMBOLS.work[w] || '').join('');
                const stStr  = '<span style="color:#ffd43b;">' + '★'.repeat(stars) + '</span>';
                html += `<div>${sIcon}${wIcons} <strong>${data.displayName}</strong> ${stStr}</div>`;
            });
        }
        unitList.innerHTML = html;
    }
}

function setOpponentHp(hp) {
    const hpFill = document.querySelector('.right-panel .health-fill');
    if (!hpFill) return;
    const clamped = Math.max(0, hp | 0);
    hpFill.style.width = clamped + '%';
    hpFill.textContent = clamped;
    state.opponentHp = clamped;
}

function clearOpponentPanel() {
    setOpponentHp(100);
    const synPanel = document.querySelector('.p2-synergies');
    if (synPanel) synPanel.innerHTML = '<p style="color:#666;">Waiting for opponent...</p>';
    const unitList = document.querySelector('.p2-unit-list');
    if (unitList) unitList.innerHTML = '<p style="color:#666;">No units deployed.</p>';
}

function setOpponentName(label) {
    const h = document.querySelector('.right-panel h3');
    if (h) h.textContent = label;
}

// ===========================================================================
// SYNERGY BADGES (on-unit indicator)
// ===========================================================================
// A unit's badge lights up when its style or any of its work tags has reached
// tier 0 (first threshold). Color reflects the style when the style is the
// active one; falls back to white if only a work tag is active.
function refreshSynergyBadges() {
    const syn = activeSynergies();
    containers.forEach(c => {
        const unit = c.getData('unit');
        if (!unit || unit.isEnemy) return;
        const badge = c.getData('badge');
        if (!badge) return;
        const data = CHARACTERS[unit.charId];
        const styleActive = syn.styles[data.style] && syn.styles[data.style].tier >= 0;
        const workActive  = data.work.some(w => syn.works[w] && syn.works[w].tier >= 0);
        const loc = findUnitLocation(unit.uid);
        const onBoard = loc && loc.kind === 'board';
        if (onBoard && (styleActive || workActive)) {
            const color = styleActive ? (STYLE_COLORS[data.style] || 0xffffff) : 0xffffff;
            paintSynergyBadge(badge, color);
            badge.setVisible(true);
        } else {
            badge.setVisible(false);
        }
    });
}

// ===========================================================================
// HUD: gold, level, round, HP — injected into the existing .top-bar
// ===========================================================================
function injectHud() {
    const roundInfo = document.querySelector('.top-bar .round-info');
    if (!roundInfo) return;

    if (!document.getElementById('gold-display')) {
        const goldEl = document.createElement('span');
        goldEl.id = 'gold-display';
        goldEl.style.cssText = 'color:#fcc419; font-weight:bold; margin:0 15px; font-size:1.2rem;';
        goldEl.textContent = '0g';
        roundInfo.appendChild(goldEl);
    }
    if (!document.getElementById('level-display')) {
        const lvlEl = document.createElement('span');
        lvlEl.id = 'level-display';
        lvlEl.style.cssText = 'color:#4dabf7; font-weight:bold; margin:0 10px;';
        lvlEl.textContent = 'Lvl 2';
        roundInfo.appendChild(lvlEl);
    }
}

function refreshHud() {
    const goldEl = document.getElementById('gold-display');
    if (goldEl) goldEl.textContent = state.gold + 'g';

    const lvlEl = document.getElementById('level-display');
    if (lvlEl) lvlEl.textContent = `Lvl ${state.level}`;

    const timer = document.querySelector('.timer');
    if (timer) timer.textContent = `Round ${state.round}`;

    const hpFill = document.querySelector('.left-panel .health-fill');
    if (hpFill) {
        hpFill.style.width = state.playerHp + '%';
        hpFill.textContent = state.playerHp;
    }
}

// Tiny toast that fades out — replaces the original `alert()` calls.
function flashMessage(msg) {
    console.log('[GAME]', msg);
    let toast = document.getElementById('game-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'game-toast';
        toast.style.cssText = 'position:fixed; top:90px; left:50%; transform:translateX(-50%); background:#23232c; color:#fff; padding:8px 18px; border-radius:6px; border:1px solid #444; z-index:1000; opacity:0; transition:opacity 0.25s; pointer-events:none; font-weight:bold;';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1800);
}

// ===========================================================================
// SHOP RENDERING
// ===========================================================================
function renderShop() {
    const shopContainer = document.querySelector('.shop-cards');
    if (!shopContainer) return;
    shopContainer.innerHTML = '';

    state.shop.forEach((charId, i) => {
        const card = document.createElement('div');
        if (!charId) {
            card.className = 'card empty-slot';
            shopContainer.appendChild(card);
            return;
        }

        const data = CHARACTERS[charId];
        const sIcon  = SYMBOLS.styles[data.style] || '';
        const wIcons = data.work.map(w => SYMBOLS.work[w] || '').join(' ');

        card.className = 'card';
        card.style.borderTop = `4px solid ${COST_CSS[data.cost]}`;
        card.innerHTML = `
            <div style="font-size:0.9rem; margin-bottom:auto; letter-spacing:2px;">
                ${sIcon} ${wIcons}
            </div>
            <p style="font-weight:bold; font-size:0.9rem; margin-top:5px;">${data.displayName}</p>
            <p style="color:#fcc419; font-size:0.8rem; font-weight:bold;">Cost: ${data.cost}g</p>
        `;
        card.onclick = () => {
            if (window.buyUnit(charId)) {
                state.consumeShopSlot(i);
                renderShop();
            }
        };
        shopContainer.appendChild(card);
    });
}

// ===========================================================================
// STATE EVENT SUBSCRIPTIONS
// ===========================================================================
state.subscribe((event) => {
    if (event.type === 'gold' || event.type === 'levelup' || event.type === 'roundEnd') {
        refreshHud();
        updateBuyXpButton();   // gold or level changed → next-level math shifts
    }
    if (event.type === 'board') {
        updateSynergyPanel();
        refreshSynergyBadges();
        updateBuyXpButton();   // Researcher count may have changed → price shifts
    }
});

// ===========================================================================
// BOOT
// ===========================================================================
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        injectHud();

        // Round 1 starting setup
        state.collectRoundIncome();
        applyRoundStartSynergyEconomy();   // no-op until you deploy units
        state.rollShop(CHARACTERS);
        renderShop();
        refreshHud();
        updateSynergyPanel();

        // Refresh button — free reroll (Recruiter synergy) first, else 2g.
        const refreshBtn = document.querySelector('.refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (state.freeRerolls > 0) {
                    state.freeRerolls -= 1;
                    state.rollShop(CHARACTERS);
                    renderShop();
                    updateRefreshButton();
                    flashMessage(`Free reroll (${state.freeRerolls} left)`);
                    return;
                }
                if (state.rollShop(CHARACTERS, { paid: true })) renderShop();
                else flashMessage('Not enough gold to reroll');
            });
        }
        updateRefreshButton();

        // Inject a "Buy XP" button next to refresh. Label updates reactively
        // to show the current Researcher-discounted price AND the projected
        // total gold to reach the next complete level from the current XP bar.
        const shopHeader = document.querySelector('.shop-header');
        if (shopHeader && !document.getElementById('buy-xp-btn')) {
            const xpBtn = document.createElement('button');
            xpBtn.id = 'buy-xp-btn';
            xpBtn.className = 'refresh-btn';
            xpBtn.style.marginLeft = '10px';
            xpBtn.addEventListener('click', () => {
                const cost = computeXpCost();
                if (!state.buyXp(cost)) flashMessage('Cannot buy XP');
                updateBuyXpButton();
            });
            shopHeader.appendChild(xpBtn);
        }
        updateBuyXpButton();

        // Fight button — net-aware. If a server room is matched, we hand our
        // board snapshot off and wait for the opponent's before starting
        // combat. Otherwise we fall back to single-player random enemies.
        const fightBtn = document.getElementById('start-fight-btn');
        let awaitingOpponent = false;
        if (fightBtn) {
            fightBtn.addEventListener('click', () => {
                if (state.boardCount() === 0) {
                    flashMessage('Deploy at least one unit before fighting!');
                    return;
                }
                if (window.Net && Net.connected && Net.matched) {
                    if (awaitingOpponent) return;
                    awaitingOpponent = true;
                    fightBtn.textContent = '⏳ Waiting…';
                    fightBtn.disabled = true;
                    Net.send('submit_snapshot', state.snapshot());
                    flashMessage('Waiting for opponent…');
                    return;
                }
                fightBtn.style.display = 'none';
                startActionPhase();
            });
        }

        // Connect to the server. If unreachable we stay single-player.
        if (window.Net && typeof Net.init === 'function') {
            Net.init();
            Net.on('opponent_snapshot', ({ snapshot, fromSlot }) => {
                pendingOpponentSnapshot = snapshot;
                // Paint opponent panel from this snapshot so the player sees
                // the board they're about to fight against.
                updateOpponentPanel(snapshot);
                if (awaitingOpponent && fightBtn) {
                    awaitingOpponent = false;
                    fightBtn.style.display = 'none';
                    fightBtn.disabled = false;
                    fightBtn.textContent = '⚔️ FIGHT!';
                    startActionPhase();
                }
            });
            Net.on('opponent_combat_result', (result) => {
                if (typeof result.playerHp === 'number') setOpponentHp(result.playerHp);
                if (typeof result.won === 'boolean') {
                    // Opponent's win/loss is the inverse of how the round
                    // played out for them — surface as a small toast.
                    flashMessage(result.won ? 'Opponent won their round.' : 'Opponent lost their round.');
                }
            });
            Net.on('opponent_left', () => {
                flashMessage('Opponent disconnected — back to single-player.');
                pendingOpponentSnapshot = null;
                clearOpponentPanel();
                setOpponentName('Waiting…');
                if (awaitingOpponent && fightBtn) {
                    awaitingOpponent = false;
                    fightBtn.disabled = false;
                    fightBtn.textContent = '⚔️ FIGHT!';
                }
            });
            Net.on('matched', (data) => {
                flashMessage('Matched! Plan your board.');
                const opp = data.players && data.players.find(p => p.slot !== Net.slot);
                if (opp) setOpponentName(`Opponent (${opp.slot.toUpperCase()})`);
            });
            Net.on('joined', ({ slot }) => {
                flashMessage(`Joined as ${slot}. Waiting for opponent…`);
                setOpponentName('Waiting…');
            });
        }
    }, 120);
});

