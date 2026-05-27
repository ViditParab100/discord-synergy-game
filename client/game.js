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
    width: 650,
    height: 550,
    backgroundColor: '#000000',
    transparent: true,
    scene: { create: create }
};

const game = new Phaser.Game(config);

function create() {
    phaserScene = this;

    drawGrid(this, BOARD.P1.x, BOARD.P1.y, 0x4dabf7);
    drawGrid(this, BOARD.P2.x, BOARD.P2.y, 0xff6b6b);
    drawBench(this);

    // ---- Phase 1: turn on perspective ----
    // Add CSS to #phaser-game-canvas:
    //   transform: perspective(900px) rotateX(28deg);
    //   transform-origin: 50% 50%;
    // Then uncomment these two lines:
    Perspective.enabled = true;
    patchPhaserPointer(game);
}

function drawGrid(scene, startX, startY, color) {
    const g = scene.add.graphics();
    g.lineStyle(2, color, 0.8);
    for (let r = 0; r < BOARD.ROWS; r++) {
        for (let c = 0; c < BOARD.COLS; c++) {
            const x = startX + c * BOARD.CELL;
            const y = startY + r * BOARD.CELL;
            g.strokeRect(x + 1, y + 1, BOARD.CELL - 2, BOARD.CELL - 2);
        }
    }
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
// UNIT CONTAINERS
// ===========================================================================
function createUnitContainer(scene, unit, x, y) {
    const charData = CHARACTERS[unit.charId];
    const fill   = unit.isEnemy ? 0x882222 : (STYLE_COLORS[charData.style] || 0xffffff);
    const border = unit.isEnemy ? 0x440000 : (COST_COLORS[charData.cost] || 0x666666);

    const bg = scene.add.rectangle(0, 0, 50, 50, fill);
    bg.setStrokeStyle(3, border);

    const styleIcon = SYMBOLS.styles[charData.style] || '';
    const workIcons = charData.work.map(w => SYMBOLS.work[w] || '').join('');
    const shortName = charData.displayName.substring(0, 3).toUpperCase();

    const text = scene.add.text(0, 0, `${styleIcon}${workIcons}\n${shortName}`, {
        fontSize: '11px', fontFamily: 'Arial', color: '#000000',
        fontStyle: 'bold', align: 'center', lineSpacing: 2
    }).setOrigin(0.5);

    const hpBg   = scene.add.rectangle(0, -20, 40, 6, 0xff0000);
    const hpFill = scene.add.rectangle(0, -20, 40, 6, 0x00ff00);

    const container = scene.add.container(x, y, [bg, text, hpBg, hpFill]);
    container.setSize(50, 50);
    container.setData('uid', unit.uid);
    container.setData('unit', unit);

    if (!unit.isEnemy) {
        container.setInteractive({ draggable: true });
        attachDragLogic(scene, container);
    }
    return container;
}

function updateHpBar(container) {
    const unit = container.getData('unit');
    const pct = Math.max(0, unit.currentHp / unit.maxHp);
    container.list[3].width = 40 * pct; // hpFill is child index 3
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
    const pos  = benchSlotCenter(slot);
    const container = createUnitContainer(phaserScene, unit, pos.x, pos.y);
    containers.set(unit.uid, container);
    return true;
};

// ===========================================================================
// DRAG & DROP
// ===========================================================================
function attachDragLogic(scene, container) {
    scene.input.setDraggable(container);

    container.on('dragstart', function () {
        this.list[0].setFillStyle(0xaaaaaa);
        this.setData('dragStartX', this.x);
        this.setData('dragStartY', this.y);
        this.setDepth(1);
    });

    container.on('drag', function (pointer, dragX, dragY) {
        this.x = dragX; this.y = dragY;
    });

    container.on('dragend', function (pointer) {
        const unit = this.getData('unit');
        const charData = CHARACTERS[unit.charId];
        this.list[0].setFillStyle(STYLE_COLORS[charData.style]);
        this.setDepth(0);

        const startX = this.getData('dragStartX');
        const startY = this.getData('dragStartY');

        const origin = findUnitLocation(unit.uid);
        if (!origin) { this.x = startX; this.y = startY; return; }

        // Target candidates: P1 board cell, then bench slot, else invalid.
        const cell = worldToGrid(pointer.x, pointer.y, 'p1');
        if (cell) { tryPlaceOnBoard(this, unit, origin, cell); return; }

        const slot = benchSlotAt(pointer.x, pointer.y);
        if (slot !== -1) { tryPlaceOnBench(this, unit, origin, slot); return; }

        // Invalid: snap back
        this.x = startX; this.y = startY;
    });
}

function snapBack(container) {
    container.x = container.getData('dragStartX');
    container.y = container.getData('dragStartY');
}

function tryPlaceOnBoard(container, unit, origin, cell) {
    const occupant = state.board[cell.row][cell.col];

    // Bench -> empty cell: enforce deploy cap (= player level)
    if (!occupant && origin.kind === 'bench') {
        if (state.boardCount() >= state.capForLevel()) {
            flashMessage(`Board limit: ${state.capForLevel()} units at level ${state.level}`);
            snapBack(container);
            return;
        }
    }

    // Clear origin slot
    if (origin.kind === 'bench') state.benchTake(origin.slot);
    else                          state.boardPlace(origin.col, origin.row, null);

    // Place on target cell
    state.boardPlace(cell.col, cell.row, unit);
    const target = gridToWorld(cell.col, cell.row, 'p1');
    container.x = target.x;
    container.y = target.y;

    // Move any displaced occupant back to where the dragged unit came from
    if (occupant && occupant.uid !== unit.uid) {
        const occContainer = containers.get(occupant.uid);
        if (origin.kind === 'bench') {
            state.bench[origin.slot] = occupant;   // direct: see note at bottom of file
            const p = benchSlotCenter(origin.slot);
            occContainer.x = p.x; occContainer.y = p.y;
        } else {
            state.boardPlace(origin.col, origin.row, occupant);
            const p = gridToWorld(origin.col, origin.row, 'p1');
            occContainer.x = p.x; occContainer.y = p.y;
        }
    }
}

function tryPlaceOnBench(container, unit, origin, slot) {
    const occupant = state.bench[slot];

    if (origin.kind === 'bench') state.benchTake(origin.slot);
    else                          state.boardPlace(origin.col, origin.row, null);

    state.bench[slot] = unit;                       // direct: see note at bottom
    const p = benchSlotCenter(slot);
    container.x = p.x; container.y = p.y;

    if (occupant && occupant.uid !== unit.uid) {
        const occContainer = containers.get(occupant.uid);
        if (origin.kind === 'bench') {
            state.bench[origin.slot] = occupant;
            const op = benchSlotCenter(origin.slot);
            occContainer.x = op.x; occContainer.y = op.y;
        } else {
            state.boardPlace(origin.col, origin.row, occupant);
            const op = gridToWorld(origin.col, origin.row, 'p1');
            occContainer.x = op.x; occContainer.y = op.y;
        }
    }
}

// ===========================================================================
// COMBAT
// ===========================================================================
function startActionPhase() {
    if (state.phase === 'combat') return;
    state.phase = 'combat';

    // Lock dragging on all player units
    containers.forEach(c => { if (c.input) c.disableInteractive(); });

    spawnEnemyTeam();

    combatTimer = phaserScene.time.addEvent({
        delay: 1500, loop: true, callback: combatTick
    });
}

function spawnEnemyTeam() {
    enemies = [];
    const allIds = Object.keys(CHARACTERS);
    // Match the player's deployed count, capped at 3 for round 1.
    const enemyCount = Math.max(1, Math.min(state.boardCount() + 1, 7));
    for (let i = 0; i < enemyCount; i++) {
        const charId = allIds[Math.floor(Math.random() * allIds.length)];
        const col = i % BOARD.COLS;
        const row = Math.floor(i / BOARD.COLS);
        const unit = makeUnit(charId, true);
        const pos = gridToWorld(col, row, 'p2');
        const c = createUnitContainer(phaserScene, unit, pos.x, pos.y);
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
        c.setInteractive({ draggable: true });
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