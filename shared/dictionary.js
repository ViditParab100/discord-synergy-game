// shared/dictionary.js

const CHARACTERS = {
    // ==========================================
    // TRADER ROW
    // ==========================================
    RockStarDad: {
        id: "rockstardad", displayName: "RockStarDad",
        style: "Strategist", work: ["Trader"],
        cost: 1, baseStats: { hp: 420, attack: 40, armor: 15, abilityPower: 50 }
    },
    Profu: {
        id: "profu", displayName: "Profu",
        style: "Disciplinarian", work: ["Trader"],
        cost: 2, baseStats: { hp: 550, attack: 50, armor: 25, abilityPower: 60 }
    },
    irina_88: {
        id: "irina_88", displayName: "irina_88",
        style: "Survivalist", work: ["Trader"],
        cost: 3, baseStats: { hp: 700, attack: 65, armor: 35, abilityPower: 80 }
    },
    MasterBart: {
        id: "masterbart", displayName: "MasterBart",
        style: "Solidarity", work: ["Trader"],
        cost: 4, baseStats: { hp: 850, attack: 80, armor: 45, abilityPower: 100 }
    },

    // ==========================================
    // KILLER ROW
    // ==========================================
    Berlin: {
        id: "berlin", displayName: "Berlin",
        style: "Friendly", work: ["Killer"],
        cost: 1, baseStats: { hp: 380, attack: 45, armor: 10, abilityPower: 40 }
    },
    Lurio: {
        id: "lurio", displayName: "Lurio",
        style: "Solidarity", work: ["Killer"],
        cost: 2, baseStats: { hp: 500, attack: 60, armor: 20, abilityPower: 50 }
    },
    Craig_demon: {
        id: "craig_demon", displayName: "Craig_demon",
        style: "Hard Hitter", work: ["Killer"],
        cost: 3, baseStats: { hp: 650, attack: 75, armor: 30, abilityPower: 70 }
    },
    Binkly: {
        id: "binkly", displayName: "Binkly",
        style: "Disciplinarian", work: ["Killer"],
        cost: 4, baseStats: { hp: 800, attack: 90, armor: 40, abilityPower: 90 }
    },

    // ==========================================
    // MENTOR ROW
    // ==========================================
    Andrew: {
        id: "andrew", displayName: "Andrew",
        style: "Researcher", work: ["Mentor"],
        cost: 1, baseStats: { hp: 450, attack: 35, armor: 20, abilityPower: 60 }
    },
    Helen: {
        id: "helen", displayName: "Helen",
        style: "Friendly", work: ["Mentor"],
        cost: 2, baseStats: { hp: 600, attack: 45, armor: 30, abilityPower: 75 }
    },
    Drago: {
        id: "drago", displayName: "Drago",
        style: "Survivalist", work: ["Mentor"],
        cost: 4, baseStats: { hp: 900, attack: 70, armor: 50, abilityPower: 110 }
    },
    // CG spans Mentor & Leader. Cost is 3. (10% stat penalty for dual-work)
    CG: {
        id: "cg", displayName: "CG",
        style: "Strategist", work: ["Mentor", "Leader"],
        cost: 3, baseStats: { hp: 630, attack: 58, armor: 31, abilityPower: 80 }
    },

    // ==========================================
    // LEADER ROW
    // ==========================================
    Reh: {
        id: "reh", displayName: "Reh",
        style: "Hard Hitter", work: ["Leader"],
        cost: 1, baseStats: { hp: 430, attack: 42, armor: 18, abilityPower: 45 }
    },
    // Xtatik spans Leader & Avenger. Cost is 4. (10% stat penalty for dual-work)
    Xtatik: {
        id: "xtatik", displayName: "Xtatik",
        style: "Disciplinarian", work: ["Leader", "Avenger"],
        cost: 4, baseStats: { hp: 765, attack: 72, armor: 40, abilityPower: 95 }
    },
    // (Note: CG is the 3-cost unit for the Leader row)

    // ==========================================
    // AVENGER ROW
    // ==========================================
    KuroKrysel: {
        id: "kurokrysel", displayName: "KuroKrysel",
        style: "Researcher", work: ["Avenger"],
        cost: 1, baseStats: { hp: 400, attack: 44, armor: 15, abilityPower: 55 }
    },
    Epic: {
        id: "epic", displayName: "Epic",
        style: "Survivalist", work: ["Avenger"],
        cost: 2, baseStats: { hp: 530, attack: 55, armor: 25, abilityPower: 70 }
    },
    Young: {
        id: "young", displayName: "Young",
        style: "Solidarity", work: ["Avenger"],
        cost: 3, baseStats: { hp: 680, attack: 68, armor: 35, abilityPower: 85 }
    },
    // (Note: Xtatik is the 4-cost unit for the Avenger row)

    // ==========================================
    // CODER ROW
    // ==========================================
    Wkd_w0lf: {
        id: "wkd_w0lf", displayName: "Wkd-w0lf",
        style: "Hard Hitter", work: ["Coder"],
        cost: 1, baseStats: { hp: 410, attack: 48, armor: 12, abilityPower: 65 }
    },
    Bob: {
        id: "bob", displayName: "Bob",
        style: "Solidarity", work: ["Coder"],
        cost: 2, baseStats: { hp: 540, attack: 58, armor: 22, abilityPower: 80 }
    },
    Star_Vader: {
        id: "star_vader", displayName: "Star_Vader",
        style: "Strategist", work: ["Coder"],
        cost: 3, baseStats: { hp: 690, attack: 72, armor: 32, abilityPower: 95 }
    },
    Spidernnam: {
        id: "spidernnam", displayName: "Spidernnam",
        style: "Researcher", work: ["Coder"],
        cost: 4, baseStats: { hp: 840, attack: 85, armor: 42, abilityPower: 115 }
    },

    // ==========================================
    // RECRUITER ROW
    // ==========================================
    LoloCoko: {
        id: "lolocoko", displayName: "LoloCoko",
        style: "Researcher", work: ["Recruiter"],
        cost: 1, baseStats: { hp: 440, attack: 38, armor: 20, abilityPower: 50 }
    },
    Rockless: {
        id: "rockless", displayName: "Rockless",
        style: "Disciplinarian", work: ["Recruiter"],
        cost: 2, baseStats: { hp: 580, attack: 48, armor: 30, abilityPower: 65 }
    },
    Ashe_me: {
        id: "ashe_me", displayName: "Ashe_me",
        style: "Friendly", work: ["Recruiter"],
        cost: 3, baseStats: { hp: 730, attack: 60, armor: 40, abilityPower: 80 }
    },
    Kelly_maxine: {
        id: "kelly_maxine", displayName: "Kelly_maxine",
        style: "Survivalist", work: ["Recruiter"],
        cost: 4, baseStats: { hp: 880, attack: 75, armor: 50, abilityPower: 100 }
    },

    // ==========================================
    // OUTDOOR PERSON ROW
    // ==========================================
    FlipJames: {
        id: "flipjames", displayName: "FlipJames",
        style: "Strategist", work: ["OutdoorPerson"],
        cost: 1, baseStats: { hp: 460, attack: 36, armor: 22, abilityPower: 45 }
    },
    Ganji_Chudail: {
        id: "ganji_chudail", displayName: "Ganji_Chudail",
        style: "Friendly", work: ["OutdoorPerson"],
        cost: 2, baseStats: { hp: 610, attack: 46, armor: 32, abilityPower: 60 }
    },
    MarmotMenace: {
        id: "marmotmenace", displayName: "MarmotMenace",
        style: "Survivalist", work: ["OutdoorPerson"],
        cost: 3, baseStats: { hp: 760, attack: 58, armor: 42, abilityPower: 75 }
    },
    Leandra: {
        id: "leandra", displayName: "Leandra",
        style: "Hard Hitter", work: ["OutdoorPerson"],
        cost: 4, baseStats: { hp: 920, attack: 72, armor: 52, abilityPower: 90 }
    }
};

const SYMBOLS = {
    styles: {
        "Strategist": "🧠",
        "Researcher": "🔬",
        "Disciplinarian": "⚖️",
        "Friendly": "🤝",
        "Survivalist": "🏕️",
        "Solidarity": "🛡️",
        "Hard Hitter": "🥊"
    },
    work: {
        "Trader": "💰",
        "Killer": "🔪",
        "Mentor": "📚",
        "Leader": "👑",
        "Avenger": "⚔️",
        "Coder": "💻",
        "Recruiter": "📢",
        "OutdoorPerson": "🌲"
    }
};

// Update the export at the bottom of the file:
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CHARACTERS, SYMBOLS };
}