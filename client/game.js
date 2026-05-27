// game.js

const STYLE_COLORS = {
    "Strategist": 0xfcc419, // Yellow
    "Solidarity": 0x4dabf7, // Blue
    "Disciplinarian": 0xff6b6b, // Red
    "Friendly": 0x51cf66, // Green
    "Survivalist": 0xcc5de8, // Purple
    "Hard Hitter": 0xff922b, // Orange
    "Researcher": 0x20c997 // Teal
};

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

const CELL_SIZE = 60;
const COLS = 3, ROWS = 7;
const BIN_X = 30, BIN_Y = 50, BIN_WIDTH = 80, BIN_HEIGHT = CELL_SIZE * 7;
const P1_START_X = 150, P1_START_Y = 50;
const P2_START_X = 400, P2_START_Y = 50;

function create() {
    let scene = this; 
    scene.characters = []; 

    drawGrid(this, P1_START_X, P1_START_Y, COLS, ROWS, 0x4dabf7);
    drawGrid(this, P2_START_X, P2_START_Y, COLS, ROWS, 0xff6b6b);

    // Draw Vertical Bin
    let binZone = this.add.graphics();
    binZone.lineStyle(2, 0xaaaaaa, 0.5); 
    binZone.fillStyle(0x222222, 0.5); 
    binZone.fillRect(BIN_X, BIN_Y, BIN_WIDTH, BIN_HEIGHT);
    binZone.strokeRect(BIN_X, BIN_Y, BIN_WIDTH, BIN_HEIGHT);
    for(let i = 1; i < 7; i++) {
        binZone.beginPath();
        binZone.moveTo(BIN_X, BIN_Y + (i * CELL_SIZE));
        binZone.lineTo(BIN_X + BIN_WIDTH, BIN_Y + (i * CELL_SIZE));
        binZone.strokePath();
    }

    // ==========================================
    // HELPER: FIND NEXT EMPTY BIN SLOT
    // ==========================================
    function getFirstEmptyBinSlot() {
        for (let slot = 0; slot < 7; slot++) {
            let targetX = BIN_X + (BIN_WIDTH / 2);
            let targetY = BIN_Y + (slot * CELL_SIZE) + (CELL_SIZE / 2);
            
            // Check if any existing character is already sitting at these coordinates
            let isOccupied = scene.characters.some(c => Math.abs(c.x - targetX) < 5 && Math.abs(c.y - targetY) < 5);
            if (!isOccupied) {
                return { x: targetX, y: targetY };
            }
        }
        return null; // Inventory full
    }

    // ==========================================
    // SPAWNING LABELED CONTAINERS WITH HEALTH BARS
    // ==========================================
    window.buyUnit = function(characterId, forceX = null, forceY = null, isEnemy = false) {
        let charData = CHARACTERS[characterId];
        let color = isEnemy ? 0x882222 : (STYLE_COLORS[charData.style] || 0xffffff); // Enemies are dark red

        // Find an open spot (unless we force coordinates, like for spawning enemies)
        let dropX = forceX;
        let dropY = forceY;

        if (dropX === null || dropY === null) {
            let emptySlot = getFirstEmptyBinSlot();
            if (!emptySlot) {
                alert("Inventory space full!");
                return false;
            }
            dropX = emptySlot.x;
            dropY = emptySlot.y;
        }

        // 1. Background & Text
        let bg = scene.add.rectangle(0, 0, 50, 50, color);
        let styleIcon = SYMBOLS.styles[charData.style] || '';
        let workIcons = charData.work.map(w => SYMBOLS.work[w] || '').join('');
        let shortName = charData.displayName.substring(0, 3).toUpperCase();
        
        let nameText = scene.add.text(0, 0, `${styleIcon}${workIcons}\n${shortName}`, { 
            fontSize: '11px', fontFamily: 'Arial', color: '#000000', fontStyle: 'bold', align: 'center', lineSpacing: 2
        }).setOrigin(0.5);

        // 2. Add a tiny Health Bar background (Red) and foreground (Green)
        let hpBg = scene.add.rectangle(0, -20, 40, 6, 0xff0000);
        let hpFill = scene.add.rectangle(0, -20, 40, 6, 0x00ff00);

        // 3. Group into Container
        let container = scene.add.container(dropX, dropY, [bg, nameText, hpBg, hpFill]);
        container.setSize(50, 50); 
        
        // Only allow P1 to drag their own units
        if (!isEnemy) {
            container.setInteractive({ draggable: true });
            attachDragLogic(scene, container);
        }
        
        // Setup Combat Stats!
        // We clone the base stats so we can modify current HP without ruining the database
        let combatStats = JSON.parse(JSON.stringify(charData));
        combatStats.currentHp = combatStats.baseStats.hp;
        combatStats.maxHp = combatStats.baseStats.hp;
        combatStats.isEnemy = isEnemy;
        
        container.setData('stats', combatStats);
        scene.characters.push(container);

        return true; 
    }
}

// ==========================================
// HELPER: COUNT UNITS ON BOARD
// ==========================================
function getUnitsOnBoardCount(scene, excludeChar = null) {
    let count = 0;
    scene.characters.forEach(c => {
        // Skip the character we are currently dragging!
        if (c === excludeChar) return; 

        let insideP1Grid = (c.x >= P1_START_X && c.x < P1_START_X + (COLS * CELL_SIZE) &&
                             c.y >= P1_START_Y && c.y < P1_START_Y + (ROWS * CELL_SIZE));
        if (insideP1Grid) count++;
    });
    return count;
}

// ==========================================
// DRAG, DROP, SWAP, AND CAPACITY LOGIC
// ==========================================
function attachDragLogic(scene, gameObject) {
    scene.input.setDraggable(gameObject);

    gameObject.on('dragstart', function (pointer) {
        this.list[0].setFillStyle(0xaaaaaa); 
        this.setData('dragStartX', this.x);
        this.setData('dragStartY', this.y);
        this.setDepth(1);
    });

    gameObject.on('drag', function (pointer, dragX, dragY) {
        this.x = dragX; this.y = dragY;
    });

    gameObject.on('dragend', function (pointer) {
        let charData = this.getData('stats');
        this.list[0].setFillStyle(STYLE_COLORS[charData.style]);
        this.setDepth(0);

        let targetX = null, targetY = null, validDrop = false;

        // Calculate intended drop coordinates for P1 Grid
        let col = Math.floor((pointer.x - P1_START_X) / CELL_SIZE);
        let row = Math.floor((pointer.y - P1_START_Y) / CELL_SIZE);
        
        // 1. Check P1 Grid Bounds & Capacity
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
            let potentialX = P1_START_X + (col * CELL_SIZE) + (CELL_SIZE / 2);
            let potentialY = P1_START_Y + (row * CELL_SIZE) + (CELL_SIZE / 2);
            
            // Check if the piece we are dragging was ALREADY on the board
            let wasAlreadyOnBoard = (this.getData('dragStartX') >= P1_START_X && 
                                     this.getData('dragStartX') < P1_START_X + (COLS * CELL_SIZE) &&
                                     this.getData('dragStartY') >= P1_START_Y && 
                                     this.getData('dragStartY') < P1_START_Y + (ROWS * CELL_SIZE));
            
            // Check if the specific square we are dropping onto is currently occupied
            let isOccupied = scene.characters.some(c => c !== this && c.x === potentialX && c.y === potentialY);

            // THE RULE: If it's a new piece from the bin, targeting an empty square, and we are at capacity (7) -> BLOCK IT.
            if (!wasAlreadyOnBoard && !isOccupied && getUnitsOnBoardCount(scene, this) >= 7) {
                // (Optional: You can replace this alert with a nicer HTML popup later)
                console.log("Board limit reached! Maximum 7 units allowed."); 
                validDrop = false; 
            } else {
                targetX = potentialX;
                targetY = potentialY;
                validDrop = true;
            }
        }

        // 2. Check Bin Zone Bounds
        if (!validDrop && pointer.x >= BIN_X && pointer.x <= BIN_X + BIN_WIDTH && 
            pointer.y >= BIN_Y && pointer.y <= BIN_Y + BIN_HEIGHT) {
            let binRow = Math.floor((pointer.y - BIN_Y) / CELL_SIZE);
            if (binRow >= 0 && binRow < 7) {
                targetX = BIN_X + (BIN_WIDTH / 2);
                targetY = BIN_Y + (binRow * CELL_SIZE) + (CELL_SIZE / 2);
                validDrop = true;
            }
        }

        // 3. Execution (Swap or Bounce)
        if (validDrop) {
            let occupant = null;
            scene.characters.forEach(c => {
                if (c !== this && c.x === targetX && c.y === targetY) occupant = c;
            });
            if (occupant) {
                occupant.x = this.getData('dragStartX');
                occupant.y = this.getData('dragStartY');
            }
            this.x = targetX; this.y = targetY;
        } else {
            // Invalid Drop! Spring back to start
            this.x = this.getData('dragStartX');
            this.y = this.getData('dragStartY');
        }

        // Trigger dynamic recalculation of stats/synergies
        updateLiveSynergyUI(scene);
    });
}

// ==========================================
// LIVE SYNERGY UPDATER ENGINE
// ==========================================
function updateLiveSynergyUI(scene) {
    let uniqueUnits = new Map(); // Map allows us to store the full unit data by ID
    let styleCounts = {};
    let workCounts = {};

    scene.characters.forEach(c => {
        // Evaluate if unit is positioned explicitly within P1's active grid zone
        let insideP1Grid = (c.x >= P1_START_X && c.x < P1_START_X + (COLS * CELL_SIZE) &&
                             c.y >= P1_START_Y && c.y < P1_START_Y + (ROWS * CELL_SIZE));

        if (insideP1Grid) {
            let data = c.getData('stats');
            if (data && !uniqueUnits.has(data.id)) {
                uniqueUnits.set(data.id, data);
                
                styleCounts[data.style] = (styleCounts[data.style] || 0) + 1;
                data.work.forEach(w => {
                    workCounts[w] = (workCounts[w] || 0) + 1;
                });
            }
        }
    });

    // 1. Re-render P1 Synergies
    const p1SynergyPanel = document.querySelector('.p1-synergies');
    if (p1SynergyPanel) {
        let synHtml = '<strong style="color:white; display:block; margin-bottom:5px;">Active Synergies</strong>';
        let hasSynergies = false;

        Object.keys(styleCounts).forEach(s => {
            let icon = SYMBOLS.styles[s] || '❓';
            synHtml += `<div>${icon} ${s}: <strong>${styleCounts[s]}</strong></div>`;
            hasSynergies = true;
        });
        Object.keys(workCounts).forEach(w => {
            let icon = SYMBOLS.work[w] || '❓';
            synHtml += `<div>${icon} ${w}: <strong>${workCounts[w]}</strong></div>`;
            hasSynergies = true;
        });

        p1SynergyPanel.innerHTML = hasSynergies ? synHtml : '<p style="color:#666;">No active synergies</p>';
    }

    // 2. Re-render P1 Deployed Unit List
    const p1UnitList = document.querySelector('.p1-unit-list');
    if (p1UnitList) {
        let unitHtml = '<strong style="color:white; display:block; margin-bottom:5px;">Deployed Roster</strong>';
        
        if (uniqueUnits.size === 0) {
            unitHtml += '<p style="color:#666;">No units deployed.</p>';
        } else {
            uniqueUnits.forEach((data) => {
                let sIcon = SYMBOLS.styles[data.style] || '';
                // Map through ALL work traits to get every icon
                let wIcons = data.work.map(w => SYMBOLS.work[w] || '').join(''); 
                unitHtml += `<div>${sIcon}${wIcons} <strong>${data.displayName}</strong></div>`;
            });
        }
        p1UnitList.innerHTML = unitHtml;
    }
}

function drawGrid(scene, startX, startY, cols, rows, color) {
    const gridGraphics = scene.add.graphics();
    gridGraphics.lineStyle(2, color, 0.8);
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            let x = startX + (col * CELL_SIZE);
            let y = startY + (row * CELL_SIZE);
            gridGraphics.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        }
    }
}


// ==========================================
// THE ACTION PHASE (COMBAT LOOP)
// ==========================================
let combatTimer;

function startActionPhase(scene) {
    console.log("COMBAT STARTED!");

    // 1. Lock the board! Disable all dragging.
    scene.characters.forEach(c => {
        if (c.input) c.disableInteractive();
    });

    // 2. Spawn a random enemy team on the P2 (Red) Grid for testing
    let allIds = Object.keys(CHARACTERS);
    window.buyUnit(allIds[0], P2_START_X + 30, P2_START_Y + 90, true);
    window.buyUnit(allIds[1], P2_START_X + 90, P2_START_Y + 210, true);
    window.buyUnit(allIds[2], P2_START_X + 30, P2_START_Y + 330, true);

    // 3. Start the Combat Loop (Ticks every 1.5 seconds)
    combatTimer = scene.time.addEvent({
        delay: 1500,
        loop: true,
        callback: () => combatTick(scene)
    });
}

function combatTick(scene) {
    // 1. Clean up dead units from the main array
    scene.characters = scene.characters.filter(c => c.active); 

    // 2. Filter out units sitting in the vertical inventory bin (Bin is on the far left, so x < 110)
    let deployedUnits = scene.characters.filter(c => c.x > (BIN_X + BIN_WIDTH));
    
    let p1Units = deployedUnits.filter(c => !c.getData('stats').isEnemy);
    let p2Units = deployedUnits.filter(c => c.getData('stats').isEnemy);

    // Stop combat if a team is dead
    if (p1Units.length === 0 || p2Units.length === 0) {
        combatTimer.remove();
        alert(p1Units.length === 0 ? "You Lost!" : "You Won!");
        return;
    }

    // Every deployed unit attacks!
    deployedUnits.forEach(attacker => {
        // Skip if this attacker was killed earlier in this exact tick
        if (!attacker.active) return; 

        let stats = attacker.getData('stats');
        
        // Re-evaluate alive enemies so we don't shoot at ghosts
        let enemies = stats.isEnemy ? p1Units.filter(e => e.active) : p2Units.filter(e => e.active);
        if (enemies.length === 0) return;

        // Find closest enemy using basic math distance
        let target = enemies.reduce((closest, curr) => {
            let distToCurr = Phaser.Math.Distance.Between(attacker.x, attacker.y, curr.x, curr.y);
            let distToClosest = Phaser.Math.Distance.Between(attacker.x, attacker.y, closest.x, closest.y);
            return (distToCurr < distToClosest) ? curr : closest;
        });

        // Calculate damage (Basic: Attack stat minus enemy Armor)
        let targetStats = target.getData('stats');
        let damage = Math.max(5, stats.baseStats.attack - (targetStats.baseStats.armor / 2));
        targetStats.currentHp -= damage;

        // Draw a visual laser beam
        let laser = scene.add.graphics();
        laser.lineStyle(4, stats.isEnemy ? 0xff0000 : 0x00ffff, 1); // Red for enemies, Cyan for P1
        laser.beginPath();
        laser.moveTo(attacker.x, attacker.y);
        laser.lineTo(target.x, target.y);
        laser.strokePath();

        // Make laser fade out quickly
        scene.tweens.add({
            targets: laser, alpha: 0, duration: 300,
            onComplete: () => laser.destroy()
        });

        // Update Target's Health Bar (The 4th item in the container array is the green fill)
        let hpPercent = Math.max(0, targetStats.currentHp / targetStats.maxHp);
        target.list[3].width = 40 * hpPercent;

        // Check if target died
        if (targetStats.currentHp <= 0) {
            target.destroy(); // Removes it from the board immediately
        }
    });
}


// ==========================================
// HTML SHOP CONTROLLER WITH ICON EXTRACTION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const shopContainer = document.querySelector('.shop-cards');
        const allCharacterIds = Object.keys(CHARACTERS);

        document.querySelector('.refresh-btn').addEventListener('click', rollShop);

        // Add this right under your refresh-btn event listener
        document.getElementById('start-fight-btn').addEventListener('click', () => {
            // We have to grab the active Phaser scene to pass it to the function
            let activeScene = game.scene.scenes[0];
            startActionPhase(activeScene);
            // Hide the button so they can't click it twice!
            document.getElementById('start-fight-btn').style.display = 'none';
        });

        function rollShop() {
            if(!shopContainer) return; 
            shopContainer.innerHTML = ''; 
            
            for(let i = 0; i < 5; i++) {
                let randomId = allCharacterIds[Math.floor(Math.random() * allCharacterIds.length)];
                let data = CHARACTERS[randomId];
                
                // Extract trait icons directly from global shared/dictionary fields
                let styleIcon = SYMBOLS.styles[data.style] || '';
                let workIcons = data.work.map(w => SYMBOLS.work[w] || '').join(' ');
                
                let card = document.createElement('div');
                card.className = `card`; 
                card.innerHTML = `
                    <div style="font-size:0.9rem; margin-bottom:auto; letter-spacing: 2px;">
                        ${styleIcon} ${workIcons}
                    </div>
                    <p style="font-weight:bold; font-size:0.9rem; margin-top:5px;">${data.displayName}</p>
                    <p style="color:#fcc419; font-size:0.8rem; font-weight:bold;">Cost: ${data.cost}g</p>
                `;
                
                card.onclick = () => {
                    // Execute purchase attempt through canvas bridge tracker
                    let success = window.buyUnit(randomId);
                    if(success) {
                        card.innerHTML = ''; 
                        card.className = 'card empty-slot';
                        card.onclick = null; 
                    }
                };
                shopContainer.appendChild(card);
            }
        }
        rollShop();
    }, 120);
});