# Synergy Auto-Battler (Discord Activity)

A custom, web-based auto-battler game designed specifically to be played inside Discord using the Embedded App SDK. Players buy units from a shared shop, place them on a tactical grid, build class-based synergies, and watch them automatically battle the opponent.

**Author:** Star_Vader

## 🌟 Features

* **Interactive Grid System:** Built with Phaser 3, featuring fluid drag-and-drop mechanics, inventory bin management, and grid-snapping.
* **Live Synergy Tracking:** Dynamically calculates and displays active `Style` and `Work` synergies (e.g., Coder, Strategist, Mentor) based purely on the units currently deployed on the active board.
* **Dynamic Shop:** A vanilla JS/HTML bridge that seamlessly communicates with the Phaser canvas, allowing players to purchase units that instantly spawn into their interactive inventory.
* **Auto-Combat Engine:** A fully functional action phase where units lock into place, calculate distance, target the nearest enemy, and fire animated lasers until one team is eliminated.

## 🛠️ Tech Stack

* **Frontend Framework:** Standard HTML5 / CSS3 (CSS Grid & Flexbox)
* **Game Engine:** Phaser 3 (HTML5 Canvas)
* **Data Structure:** Vanilla JavaScript (`dictionary.js`)
* **Backend (Planned):** Node.js with Express and Socket.io for multiplayer state management.

## 📂 Project Structure

\`\`\`text
my-discord-activity/
├── client/
│   ├── index.html        # Main UI layout and shop structure
│   ├── style.css         # Styling for the HUD and panels
│   └── game.js           # Phaser 3 game logic (drag/drop, combat, grid)
├── shared/
│   └── dictionary.js     # Global character database and synergy symbols
└── server/               
    └── index.js          # (WIP) Multiplayer WebSockets server
\`\`\`

## 🚀 How to Run Locally (Client-Side)

Since the project currently relies on importing shared JavaScript files, running it directly by double-clicking `index.html` might trigger a CORS (Cross-Origin Resource Sharing) error in your browser. 

To run it properly:
1. Open the project folder in **Visual Studio Code**.
2. Install the **Live Server** extension by Ritwick Dey.
3. Right-click `index.html` and select **"Open with Live Server"**.
4. The game will launch in your browser at `http://127.0.0.1:5500`.

## 🎮 How to Play (Test Mode)

1. **Deployment Phase:** Click the "Refresh" button in the shop to roll 5 random units. Click a unit card to buy it.
2. **Placement:** Drag the purchased unit from your left-side inventory bin onto the Blue Grid. You can field a maximum of 7 units.
3. **Synergies:** Watch your Left Panel update with active synergies and deployed units.
4. **Action Phase:** Click the red **FIGHT!** button. Dummy enemies will spawn on the Red Grid, dragging will be disabled, and the units will battle automatically.

## 🗺️ Roadmap / Next Steps

- [ ] **Multiplayer Server:** Implement Node.js + Socket.io to sync Player 1 and Player 2 boards across different browser clients.
- [ ] **Economy System:** Add a starting gold pool, track costs upon purchase, and reward gold for winning rounds.
- [ ] **Unit Upgrades:** Implement the "3-Star" system (buying 3 identical units merges them into a stronger 2-Star unit).
- [ ] **Discord Integration:** Wrap the final web app in the Discord Embedded App SDK for native channel play.