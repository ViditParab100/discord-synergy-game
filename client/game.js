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
    // SPAWNING LABELED CONTAINERS VIA SHOP BRIDGE
    // ==========================================
    window.buyUnit = function(characterId) {
        let charData = CHARACTERS[characterId];
        let color = STYLE_COLORS[charData.style] || 0xffffff;

        // Find an open spot in the bin
        let emptySlot = getFirstEmptyBinSlot();
        if (!emptySlot) {
            alert("Inventory space full! Place characters on the board first.");
            return false; // Tells the HTML controller the purchase failed
        }

        // 1. Create a colored background rectangle
        let bg = scene.add.rectangle(0, 0, 50, 50, color);
        
        // 2. Fetch symbols from dictionary and create label (e.g., "💻 STA")
        let styleIcon = SYMBOLS.styles[charData.style] || '';
        let shortName = charData.displayName.substring(0, 3).toUpperCase();
        let labelText = `${styleIcon}\n${shortName}`;

        let nameText = scene.add.text(0, 0, labelText, { 
            fontSize: '12px', 
            fontFamily: 'Arial',
            color: '#000000',
            fontStyle: 'bold',
            align: 'center'
        }).setOrigin(0.5);

        // 3. Group into a Container and snap to the empty bin slot coordinates
        let container = scene.add.container(emptySlot.x, emptySlot.y, [bg, nameText]);
        container.setSize(50, 50); 
        container.setInteractive({ draggable: true });
        
        container.setData('stats', charData);
        scene.characters.push(container);

        attachDragLogic(scene, container);
        return true; // Purchase successful
    }
}

// ==========================================
// DRAG, DROP, SWAP, AND SYNERGY CALCULATION
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

        // 1. Check P1 Grid Bounds
        let col = Math.floor((pointer.x - P1_START_X) / CELL_SIZE);
        let row = Math.floor((pointer.y - P1_START_Y) / CELL_SIZE);
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
            targetX = P1_START_X + (col * CELL_SIZE) + (CELL_SIZE / 2);
            targetY = P1_START_Y + (row * CELL_SIZE) + (CELL_SIZE / 2);
            validDrop = true;
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
            this.x = this.getData('dragStartX');
            this.y = this.getData('dragStartY');
        }

        // Trigger dynamic recalculation of stats/synergies across the screen layout
        updateLiveSynergyUI(scene);
    });
}

// ==========================================
// LIVE SYNERGY UPDATER ENGINE
// ==========================================
function updateLiveSynergyUI(scene) {
    let uniqueUnits = new Set();
    let styleCounts = {};
    let workCounts = {};

    scene.characters.forEach(c => {
        // Evaluate if unit is positioned explicitly within P1's active grid zone
        let insideP1Grid = (c.x >= P1_START_X && c.x < P1_START_X + (COLS * CELL_SIZE) &&
                             c.y >= P1_START_Y && c.y < P1_START_Y + (ROWS * CELL_SIZE));

        if (insideP1Grid) {
            let data = c.getData('stats');
            if (data && !uniqueUnits.has(data.id)) {
                uniqueUnits.add(data.id);
                
                // Track style counts
                styleCounts[data.style] = (styleCounts[data.style] || 0) + 1;
                
                // Track work counts (handling multi-attribute array fields seamlessly)
                data.work.forEach(w => {
                    workCounts[w] = (workCounts[w] || 0) + 1;
                });
            }
        }
    });

    // Re-render HTML sidebar element contents
    const p1SynergyPanel = document.querySelector('.top-bar .synergy-panel:not(.enemy)');
    if (p1SynergyPanel) {
        p1SynergyPanel.innerHTML = '';
        
        // Append styles tracking data layout
        Object.keys(styleCounts).forEach(s => {
            let icon = SYMBOLS.styles[s] || '❓';
            p1SynergyPanel.innerHTML += `<p>${icon} <strong>${s}: (${styleCounts[s]})</strong></p>`;
        });
        
        // Append work tracking data layout
        Object.keys(workCounts).forEach(w => {
            let icon = SYMBOLS.work[w] || '❓';
            p1SynergyPanel.innerHTML += `<p>${icon} <strong>${w}: (${workCounts[w]})</strong></p>`;
        });

        if (p1SynergyPanel.innerHTML === '') {
            p1SynergyPanel.innerHTML = '<p style="color:#666;">No active synergies</p>';
        }
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
// HTML SHOP CONTROLLER WITH ICON EXTRACTION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const shopContainer = document.querySelector('.shop-cards');
        const allCharacterIds = Object.keys(CHARACTERS);

        document.querySelector('.refresh-btn').addEventListener('click', rollShop);

        function rollShop() {
            if(!shopContainer) return; 
            shopContainer.innerHTML = ''; 
            
            for(let i = 0; i < 5; i++) {
                let randomId = allCharacterIds[Math.floor(Math.random() * allCharacterIds.length)];
                let data = CHARACTERS[randomId];
                
                // Extract trait icons directly from global shared/dictionary fields
                let styleIcon = SYMBOLS.styles[data.style] || '';
                let workIcon = SYMBOLS.work[data.work[0]] || ''; // Primary work trait icon
                
                let card = document.createElement('div');
                card.className = `card`; 
                card.innerHTML = `
                    <div style="font-size:0.8rem; margin-bottom:auto; color:#aaa;">${styleIcon} ${workIcon}</div>
                    <p style="font-weight:bold;">${data.displayName}</p>
                    <p style="color:#fcc419; font-size:0.9rem;">${data.cost}g</p>
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