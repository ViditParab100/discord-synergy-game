// server/gameLogic.js

// Assuming we import our dictionary
// const { CHARACTERS, SYMBOLS } = require('../shared/dictionary.js');

/**
 * Calculates the active synergies based on the units currently on the board.
 * @param {Array} deployedUnits - Array of character objects currently on the player's grid
 * @returns {Object} - The counted styles and works
 */
function calculateSynergies(deployedUnits) {
    // 1. Keep track of unique units to prevent stacking the same character
    let uniqueUnits = new Set();
    
    // 2. Objects to hold our final counts
    let activeSynergies = {
        style: {},
        work: {}
    };

    deployedUnits.forEach(unit => {
        // If we haven't counted this specific character ID yet
        if (!uniqueUnits.has(unit.id)) {
            uniqueUnits.add(unit.id);

            // --- Count the Style ---
            let unitStyle = unit.style;
            if (!activeSynergies.style[unitStyle]) {
                activeSynergies.style[unitStyle] = 0;
            }
            activeSynergies.style[unitStyle] += 1;

            // --- Count the Work(s) ---
            // We loop here because 'work' is an array (handling dual-traits like CG)
            unit.work.forEach(workTrait => {
                if (!activeSynergies.work[workTrait]) {
                    activeSynergies.work[workTrait] = 0;
                }
                activeSynergies.work[workTrait] += 1;
            });
        }
    });

    return activeSynergies;
}

// --- Let's test it! ---
// Imagine a player placed these three units on their grid:
const testBoard = [
    { id: "bob", style: "Solidarity", work: ["Coder"] },
    { id: "star_vader", style: "Strategist", work: ["Coder"] },
    { id: "cg", style: "Strategist", work: ["Mentor", "Leader"] }, // Dual trait!
    { id: "bob", style: "Solidarity", work: ["Coder"] }            // Duplicate Bob!
];

console.log(calculateSynergies(testBoard));