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
    const charData = CHARACTERS[charId];
    return {
        uid: nextUid++,
        charId,
        stars: 1,
        currentHp: charData.baseStats.hp,
        maxHp: charData.baseStats.hp,
        isEnemy
    };
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

    installDragPipeline(this);
}

function drawGrid(scene, side, color) {
    // Filled axis-aligned tiles with neon border + a pulsing inner glow.
    // Each tile is its own rectangle so it reads as a discrete slot you can
    // drop a card onto.
    const o = side === 'p2' ? BOARD.P2 : BOARD.P1;
    const inset = 3;
    const radius = 6;

    const fill = scene.add.graphics();
    fill.setDepth(-12);
    fill.fillStyle(0x0a0a14, 0.55);
    for (let r = 0; r < BOARD.ROWS; r++) {
        for (let c = 0; c < BOARD.COLS; c++) {
            const x = o.x + c * BOARD.CELL + inset;
            const y = o.y + r * BOARD.CELL + inset;
            fill.fillRoundedRect(x, y, BOARD.CELL - 2*inset, BOARD.CELL - 2*inset, radius);
        }
    }

    const border = scene.add.graphics();
    border.setDepth(-11);
    border.lineStyle(2, color, 0.85);
    for (let r = 0; r < BOARD.ROWS; r++) {
        for (let c = 0; c < BOARD.COLS; c++) {
            const x = o.x + c * BOARD.CELL + inset;
            const y = o.y + r * BOARD.CELL + inset;
            border.strokeRoundedRect(x, y, BOARD.CELL - 2*inset, BOARD.CELL - 2*inset, radius);
        }
    }

    // Pulsing inner glow ring
    const glow = scene.add.graphics();
    glow.setDepth(-10);
    glow.lineStyle(1, color, 1);
    for (let r = 0; r < BOARD.ROWS; r++) {
        for (let c = 0; c < BOARD.COLS; c++) {
            const x = o.x + c * BOARD.CELL + inset + 2;
            const y = o.y + r * BOARD.CELL + inset + 2;
            glow.strokeRoundedRect(x, y, BOARD.CELL - 2*inset - 4, BOARD.CELL - 2*inset - 4, radius - 2);
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

function buildPortraitChild(scene, unit) {
    // Returns the visual that represents the character. Uses the loaded
    // portrait texture when present, else a colored rectangle so the game
    // remains fully playable before art is delivered.
    const charData = CHARACTERS[unit.charId];
    const texKey = 'portrait_' + unit.charId;
    if (scene.textures.exists(texKey)) {
        const img = scene.add.image(0, 0, texKey);
        img.setDisplaySize(48, 48);
        if (unit.isEnemy) img.setTint(0xff8888); // red wash for enemy
        return img;
    }
    // Fallback: rectangle + style icon + 3-letter name (the Phase 0 look)
    const fill = unit.isEnemy ? 0x882222 : (STYLE_COLORS[charData.style] || 0xffffff);
    const rect = scene.add.rectangle(0, 0, 48, 48, fill);
    const styleIcon = SYMBOLS.styles[charData.style] || '';
    const workIcons = charData.work.map(w => SYMBOLS.work[w] || '').join('');
    const shortName = charData.displayName.substring(0, 3).toUpperCase();
    const text = scene.add.text(0, 0, `${styleIcon}${workIcons}\n${shortName}`, {
        fontSize: '11px', fontFamily: 'Arial', color: '#000000',
        fontStyle: 'bold', align: 'center', lineSpacing: 2
    }).setOrigin(0.5);
    // Group rect+text into a sub-container so the caller has one child to manage.
    const group = scene.add.container(0, 0, [rect, text]);
    group.setData('fallbackRect', rect);
    return group;
}

function buildCostFrame(scene, cost, isEnemy) {
    // Neon ring colored by cost tier (grey/green/blue/purple/gold).
    // Enemies get a muted red frame for visual disambiguation.
    const color = isEnemy ? 0x991e1e : (COST_COLORS[cost] || 0x666666);
    const g = scene.add.graphics();
    // outer glow
    g.lineStyle(4, color, 0.25);
    g.strokeRect(-25, -25, 50, 50);
    // sharp inner edge
    g.lineStyle(2, color, 1);
    g.strokeRect(-24, -24, 48, 48);
    return g;
}

function buildStarRow(scene, stars) {
    // Tiny yellow stars at the bottom of the unit. `stars` is 1..3.
    const g = scene.add.graphics();
    drawStars(g, stars);
    g.y = 25;
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
    // Small colored dot in the top-right corner. Hidden by default;
    // refreshSynergyBadges() turns it on for units with an active synergy.
    const g = scene.add.graphics();
    g.x = 18; g.y = -18;
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
    // Phase 2: standing-card. The container is built at (0,0); positioning,
    // depth-scaling and z-order are applied by placeUnitContainer() based on
    // whether the unit is on the bench (upright) or on the projected board.
    const charData = CHARACTERS[unit.charId];

    const portrait = buildPortraitChild(scene, unit);
    const frame    = buildCostFrame(scene, charData.cost, unit.isEnemy);
    const hpBg     = scene.add.rectangle(0, -20, 40, 6, 0xff0000);
    const hpFill   = scene.add.rectangle(0, -20, 40, 6, 0x00ff00);
    const starRow  = buildStarRow(scene, unit.stars || 1);
    const badge    = buildSynergyBadge(scene);

    const container = scene.add.container(0, 0, [
        portrait, frame, hpBg, hpFill, starRow, badge
    ]);
    container.setSize(50, 60);
    container.setData('uid', unit.uid);
    container.setData('unit', unit);
    container.setData('portrait', portrait);
    container.setData('frame', frame);
    container.setData('hpFill', hpFill);
    container.setData('starRow', starRow);
    container.setData('badge', badge);
    // No setInteractive here — drag is handled by a scene-level pointer
    // pipeline (see installDragPipeline) using screenToCell hit-testing.
    return container;
}

// Lift the card so its base sits on the cell rather than its midline crossing
// the cell center. Children are built around y=0; the visual extends ~+28
// below (star row). Shifting the container up by ~half its visual height
// makes it read as "standing" on the cell.
const CARD_BASE_LIFT = 22;

// Place a unit container at its logical location.
//   loc.kind === 'bench' → upright in the bench column, scale 1.
//   loc.kind === 'board' → projected screen center of the cell, scaled by
//                          cellRenderInfo.scale (back rows = smaller).
function placeUnitContainer(container, loc) {
    if (loc.kind === 'bench') {
        const p = benchSlotCenter(loc.slot);
        container.x = p.x;
        container.y = p.y;
        container.setScale(1);
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
    if (hpFill) hpFill.width = 40 * pct;
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
// (x, y). This handles cards that are visually lifted above their cell
// (CARD_BASE_LIFT) where a cell-quad test would miss the upper half. Works
// for both board and bench cards.
const CARD_HALF_W = 26;
const CARD_HALF_H = 32;
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
        if (!dragState) return;
        dragState.container.x = pointer.x;
        dragState.container.y = pointer.y;
    });

    scene.input.on('pointerup', (pointer) => {
        if (!dragState) return;
        const { container, unit, origin } = dragState;
        dragState = null;
        container.setAlpha(1);
        container.setDepth(0);

        // For DROP we still use cell/slot hit-test on the destination.
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
            state.bench[origin.slot] = occupant;   // direct: see note at bottom of file
            placeUnitContainer(occContainer, { kind: 'bench', slot: origin.slot });
        } else {
            state.boardPlace(origin.col, origin.row, occupant);
            placeUnitContainer(occContainer, { kind: 'board', col: origin.col, row: origin.row, side: 'p1' });
        }
    }
}

function tryPlaceOnBench(container, unit, origin, slot) {
    const occupant = state.bench[slot];

    if (origin.kind === 'bench') state.benchTake(origin.slot);
    else                          state.boardPlace(origin.col, origin.row, null);

    state.bench[slot] = unit;                       // direct: see note at bottom
    placeUnitContainer(container, { kind: 'bench', slot });

    if (occupant && occupant.uid !== unit.uid) {
        const occContainer = containers.get(occupant.uid);
        if (origin.kind === 'bench') {
            state.bench[origin.slot] = occupant;
            placeUnitContainer(occContainer, { kind: 'bench', slot: origin.slot });
        } else {
            state.boardPlace(origin.col, origin.row, occupant);
            placeUnitContainer(occContainer, { kind: 'board', col: origin.col, row: origin.row, side: 'p1' });
        }
    }
}

// ===========================================================================
// COMBAT
// ===========================================================================
function startActionPhase() {
    if (state.phase === 'combat') return;
    state.phase = 'combat';
    // Drag is gated on state.phase === 'planning' in the pointer pipeline,
    // so flipping phase is the lock — no per-unit setInteractive cleanup needed.
    spawnEnemyTeam();

    combatTimer = phaserScene.time.addEvent({
        delay: 1500, loop: true, callback: combatTick
    });
}

function spawnEnemyTeam() {
    enemies = [];
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

    [...playerUnits, ...liveEnemies].forEach(attacker => {
        if (!attacker.active) return;
        const aUnit = attacker.getData('unit');
        const pool = aUnit.isEnemy ? playerUnits.filter(c => c.active)
                                   : liveEnemies.filter(c => c.active);
        if (pool.length === 0) return;

        const target = pool.reduce((closest, curr) => {
            const dc  = Phaser.Math.Distance.Between(attacker.x, attacker.y, curr.x, curr.y);
            const dcl = Phaser.Math.Distance.Between(attacker.x, attacker.y, closest.x, closest.y);
            return dc < dcl ? curr : closest;
        });

        const aStats = CHARACTERS[aUnit.charId].baseStats;
        const tUnit  = target.getData('unit');
        const tStats = CHARACTERS[tUnit.charId].baseStats;
        const damage = Math.max(5, aStats.attack - tStats.armor / 2);
        tUnit.currentHp -= damage;

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
        if (tUnit.currentHp <= 0) target.destroy();
    });
}

function endCombat(won) {
    if (combatTimer) { combatTimer.remove(); combatTimer = null; }

    // Clean up enemies regardless of outcome
    enemies.forEach(c => { if (c.active) c.destroy(); });
    enemies = [];

    // Heal survivors and reap the dead from state + container map
    const deadUids = [];
    containers.forEach((c, uid) => {
        if (!c.active) {
            deadUids.push(uid);
            return;
        }
        const u = c.getData('unit');
        u.currentHp = u.maxHp;
        updateHpBar(c);
        // Drag re-enables automatically when state.phase flips back to 'planning'.
    });
    deadUids.forEach(uid => {
        const loc = findUnitLocation(uid);
        if (loc && loc.kind === 'board') state.boardPlace(loc.col, loc.row, null);
        else if (loc && loc.kind === 'bench') state.benchTake(loc.slot);
        containers.delete(uid);
    });

    state.recordCombatResult(won);

    if (state.phase === 'gameover') {
        flashMessage('Game over — you ran out of HP!');
        return;
    }

    // Round transition
    state.collectRoundIncome();
    state.rollShop(CHARACTERS);
    renderShop();
    flashMessage(won ? 'Round won.' : 'Round lost.');

    const fightBtn = document.getElementById('start-fight-btn');
    if (fightBtn) fightBtn.style.display = '';
}

// ===========================================================================
// SYNERGY PANEL (HTML side panels)
// ===========================================================================
function updateSynergyPanel() {
    const styleCounts = {};
    const workCounts  = {};
    const uniqueUnits = new Map();

    state.board.forEach(row => row.forEach(unit => {
        if (!unit) return;
        const data = CHARACTERS[unit.charId];
        if (uniqueUnits.has(data.id)) return;
        uniqueUnits.set(data.id, data);
        styleCounts[data.style] = (styleCounts[data.style] || 0) + 1;
        data.work.forEach(w => workCounts[w] = (workCounts[w] || 0) + 1);
    }));

    const synPanel = document.querySelector('.p1-synergies');
    if (synPanel) {
        let html = '<strong style="color:white; display:block; margin-bottom:5px;">Active Synergies</strong>';
        let any = false;
        Object.keys(styleCounts).forEach(s => {
            html += `<div>${SYMBOLS.styles[s] || ''} ${s}: <strong>${styleCounts[s]}</strong></div>`;
            any = true;
        });
        Object.keys(workCounts).forEach(w => {
            html += `<div>${SYMBOLS.work[w] || ''} ${w}: <strong>${workCounts[w]}</strong></div>`;
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
// SYNERGY BADGES (on-unit indicator)
// ===========================================================================
// A unit's badge lights up when at least one of its style or work tags has
// ≥ SYNERGY_ACTIVE_THRESHOLD distinct contributors on the player's board.
// Color is the unit's STYLE color when the style is active; otherwise white
// (work-only contributor). Cheap to compute and runs on every 'board' event.
const SYNERGY_ACTIVE_THRESHOLD = 2;

function computeActiveSynergies() {
    const styleCounts = {};
    const workCounts  = {};
    const seen = new Set();
    state.board.forEach(row => row.forEach(u => {
        if (!u || seen.has(u.charId)) return;
        seen.add(u.charId);
        const d = CHARACTERS[u.charId];
        styleCounts[d.style] = (styleCounts[d.style] || 0) + 1;
        d.work.forEach(w => workCounts[w] = (workCounts[w] || 0) + 1);
    }));
    const activeStyles = new Set(
        Object.keys(styleCounts).filter(k => styleCounts[k] >= SYNERGY_ACTIVE_THRESHOLD)
    );
    const activeWorks  = new Set(
        Object.keys(workCounts).filter(k => workCounts[k] >= SYNERGY_ACTIVE_THRESHOLD)
    );
    return { activeStyles, activeWorks };
}

function refreshSynergyBadges() {
    const { activeStyles, activeWorks } = computeActiveSynergies();
    containers.forEach(c => {
        const unit = c.getData('unit');
        if (!unit || unit.isEnemy) return;
        const badge = c.getData('badge');
        if (!badge) return;
        const data = CHARACTERS[unit.charId];
        const styleActive = activeStyles.has(data.style);
        const workActive  = data.work.some(w => activeWorks.has(w));
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
    }
    if (event.type === 'board') {
        updateSynergyPanel();
        refreshSynergyBadges();
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
        state.rollShop(CHARACTERS);
        renderShop();
        refreshHud();
        updateSynergyPanel();

        // Refresh button = paid reroll (2g)
        const refreshBtn = document.querySelector('.refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (state.rollShop(CHARACTERS, { paid: true })) renderShop();
                else flashMessage('Not enough gold to reroll');
            });
        }

        // Inject a "Buy XP" button next to refresh
        const shopHeader = document.querySelector('.shop-header');
        if (shopHeader && !document.getElementById('buy-xp-btn')) {
            const xpBtn = document.createElement('button');
            xpBtn.id = 'buy-xp-btn';
            xpBtn.className = 'refresh-btn';
            xpBtn.style.marginLeft = '10px';
            xpBtn.textContent = 'Buy XP (4g)';
            xpBtn.addEventListener('click', () => {
                if (!state.buyXp()) flashMessage('Cannot buy XP');
            });
            shopHeader.appendChild(xpBtn);
        }

        // Fight button
        const fightBtn = document.getElementById('start-fight-btn');
        if (fightBtn) {
            fightBtn.addEventListener('click', () => {
                if (state.boardCount() === 0) {
                    flashMessage('Deploy at least one unit before fighting!');
                    return;
                }
                fightBtn.style.display = 'none';
                startActionPhase();
            });
        }
    }, 120);
});

// ===========================================================================
// NOTE on `state.bench[i] = unit` direct assignment
// ===========================================================================
// In `tryPlaceOnBoard` / `tryPlaceOnBench` we directly mutate state.bench
// when swapping. This bypasses the GameState event emit. It's safe in Phase 0
// because nothing currently subscribes to bench events — the bench is rendered
// imperatively (the Phaser container is moved to benchSlotCenter immediately
// after). When you add a bench HUD that listens for events, add a `benchSet`
// method to GameState and use that instead.