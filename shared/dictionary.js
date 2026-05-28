// shared/dictionary.js
//
// Stat baselines per cost tier (before style modifier):
//   1g → 450 hp / 40 atk / 15 armor / 50 AP
//   2g → 600 hp / 55 atk / 25 armor / 70 AP
//   3g → 750 hp / 70 atk / 35 armor / 90 AP
//   4g → 900 hp / 85 atk / 45 armor / 115 AP
//   5g → 1100 hp / 105 atk / 55 armor / 145 AP
//
// Style modifier (applied to the baseline, multiplicative):
//   Strategist     hp×1.00  atk×1.05  armor×1.00  ap×1.10   (balanced+)
//   Researcher     hp×0.95  atk×0.95  armor×0.95  ap×1.25   (AP)
//   Disciplinarian hp×1.05  atk×0.95  armor×1.25  ap×1.00   (tank)
//   Friendly       hp×1.00  atk×0.90  armor×1.00  ap×1.15   (support)
//   Survivalist    hp×1.20  atk×0.90  armor×1.05  ap×1.00   (HP wall)
//   Solidarity     hp×1.10  atk×1.00  armor×1.15  ap×1.00   (team tank)
//   Hard Hitter    hp×0.95  atk×1.25  armor×0.90  ap×0.95   (glass cannon)
//
// Faction (work) cost layout: each faction has a 1g/2g/3g/4g champion.
// Multi-work champions (CG, Xtatik) appear in two faction rows at one cost.

const CHARACTERS = {
    // ==========================================
    // TRADER  (Strategist=1g, Disciplinarian=2g, Survivalist=3g, Solidarity=4g)
    // ==========================================
    RockStarDad: {
        id: "rockstardad", displayName: "RockStarDad",
        style: "Strategist", work: ["Trader"],
        cost: 1, baseStats: { hp: 450, attack: 42, armor: 15, abilityPower: 55 },
        ability: { id: "single_strike", chargeMax: 5 }
    },
    Profu: {
        id: "profu", displayName: "Profu",
        style: "Disciplinarian", work: ["Trader"],
        cost: 2, baseStats: { hp: 630, attack: 52, armor: 31, abilityPower: 70 },
        ability: { id: "shield_ally", chargeMax: 4 }
    },
    irina_88: {
        id: "irina_88", displayName: "irina_88",
        style: "Survivalist", work: ["Trader"],
        cost: 3, baseStats: { hp: 900, attack: 63, armor: 37, abilityPower: 90 },
        ability: { id: "heal_aura", chargeMax: 4 }
    },
    MasterBart: {
        id: "masterbart", displayName: "MasterBart",
        style: "Solidarity", work: ["Trader"],
        cost: 4, baseStats: { hp: 990, attack: 85, armor: 52, abilityPower: 115 },
        ability: { id: "team_buff", chargeMax: 3 }
    },

    // ==========================================
    // KILLER  (Friendly=1g, Solidarity=2g, Hard Hitter=3g, Disciplinarian=4g)
    // ==========================================
    Berlin: {
        id: "berlin", displayName: "Berlin",
        style: "Friendly", work: ["Killer"],
        cost: 1, baseStats: { hp: 450, attack: 36, armor: 15, abilityPower: 57 },
        ability: { id: "single_strike", chargeMax: 5 }
    },
    Lurio: {
        id: "lurio", displayName: "Lurio",
        style: "Solidarity", work: ["Killer"],
        cost: 2, baseStats: { hp: 660, attack: 55, armor: 29, abilityPower: 70 },
        ability: { id: "cleave", chargeMax: 4 }
    },
    Craig_demon: {
        id: "craig_demon", displayName: "Craig_demon",
        style: "Hard Hitter", work: ["Killer"],
        cost: 3, baseStats: { hp: 712, attack: 87, armor: 31, abilityPower: 85 },
        ability: { id: "chain_zap", chargeMax: 4 }
    },
    Binkly: {
        id: "binkly", displayName: "Binkly",
        style: "Disciplinarian", work: ["Killer"],
        cost: 4, baseStats: { hp: 945, attack: 81, armor: 56, abilityPower: 115 },
        ability: { id: "aoe_blast", chargeMax: 3 }
    },

    // ==========================================
    // MENTOR  (Researcher=1g, Friendly=2g, Survivalist=3g, Strategist=4g)
    // ==========================================
    Andrew: {
        id: "andrew", displayName: "Andrew",
        style: "Researcher", work: ["Mentor"],
        cost: 1, baseStats: { hp: 428, attack: 38, armor: 14, abilityPower: 63 },
        ability: { id: "heal_aura", chargeMax: 5 }
    },
    Helen: {
        id: "helen", displayName: "Helen",
        style: "Friendly", work: ["Mentor"],
        cost: 2, baseStats: { hp: 600, attack: 49, armor: 25, abilityPower: 80 },
        ability: { id: "heal_aura", chargeMax: 4 }
    },
    Drago: {
        id: "drago", displayName: "Drago",
        style: "Survivalist", work: ["Mentor"],
        cost: 3, baseStats: { hp: 900, attack: 63, armor: 37, abilityPower: 90 },
        ability: { id: "heal_aura", chargeMax: 4 }
    },
    // CG: Mentor + Leader, 4g. Carries the Strategist column for both factions.
    CG: {
        id: "cg", displayName: "CG",
        style: "Strategist", work: ["Mentor", "Leader"],
        cost: 4, baseStats: { hp: 900, attack: 89, armor: 45, abilityPower: 127 },
        ability: { id: "team_buff", chargeMax: 3 }
    },

    // ==========================================
    // LEADER  (Hard Hitter=1g, Survivalist=2g, Disciplinarian=3g, Strategist=4g)
    //   "Master synergy" faction — each other active synergy counts +1 toward
    //   itself when Leader has ≥2 contributors. See SYNERGIES table.
    // ==========================================
    Reh: {
        id: "reh", displayName: "Reh",
        style: "Hard Hitter", work: ["Leader"],
        cost: 1, baseStats: { hp: 428, attack: 50, armor: 14, abilityPower: 47 },
        ability: { id: "single_strike", chargeMax: 5 }
    },
    // Xtatik: Leader + Avenger, 3g. Spans both faction rows.
    Xtatik: {
        id: "xtatik", displayName: "Xtatik",
        style: "Disciplinarian", work: ["Leader", "Avenger"],
        cost: 3, baseStats: { hp: 788, attack: 66, armor: 44, abilityPower: 90 },
        ability: { id: "shield_ally", chargeMax: 4 }
    },
    // (CG is the 4g Leader champ; defined above under MENTOR row.)

    // ==========================================
    // AVENGER  (Researcher=1g, Survivalist=2g, Disciplinarian=3g, Solidarity=4g)
    // ==========================================
    KuroKrysel: {
        id: "kurokrysel", displayName: "KuroKrysel",
        style: "Researcher", work: ["Avenger"],
        cost: 1, baseStats: { hp: 428, attack: 38, armor: 14, abilityPower: 63 },
        ability: { id: "single_strike", chargeMax: 5 }
    },
    Epic: {
        id: "epic", displayName: "Epic",
        style: "Survivalist", work: ["Avenger"],
        cost: 2, baseStats: { hp: 720, attack: 49, armor: 26, abilityPower: 70 },
        ability: { id: "cleave", chargeMax: 4 }
    },
    // (Xtatik is the 3g Avenger champ; defined above under LEADER row.)
    Young: {
        id: "young", displayName: "Young",
        style: "Solidarity", work: ["Avenger"],
        cost: 4, baseStats: { hp: 990, attack: 85, armor: 52, abilityPower: 115 },
        ability: { id: "aoe_blast", chargeMax: 3 }
    },

    // ==========================================
    // CODER  (Hard Hitter=1g, Solidarity=2g, Strategist=3g, Researcher=4g)
    // ==========================================
    Wkd_w0lf: {
        id: "wkd_w0lf", displayName: "Wkd-w0lf",
        style: "Hard Hitter", work: ["Coder"],
        cost: 1, baseStats: { hp: 428, attack: 50, armor: 14, abilityPower: 47 },
        ability: { id: "chain_zap", chargeMax: 5 }
    },
    Bob: {
        id: "bob", displayName: "Bob",
        style: "Solidarity", work: ["Coder"],
        cost: 2, baseStats: { hp: 660, attack: 55, armor: 29, abilityPower: 70 },
        ability: { id: "chain_zap", chargeMax: 4 }
    },
    Star_Vader: {
        id: "star_vader", displayName: "Star_Vader",
        style: "Strategist", work: ["Coder"],
        cost: 3, baseStats: { hp: 750, attack: 73, armor: 35, abilityPower: 99 },
        ability: { id: "chain_zap", chargeMax: 4 }
    },
    Spidernnam: {
        id: "spidernnam", displayName: "Spidernnam",
        style: "Researcher", work: ["Coder"],
        cost: 4, baseStats: { hp: 855, attack: 81, armor: 43, abilityPower: 144 },
        ability: { id: "chain_zap", chargeMax: 3 }
    },

    // ==========================================
    // RECRUITER  (Researcher=1g, Disciplinarian=2g, Friendly=3g, Survivalist=4g)
    // ==========================================
    LoloCoko: {
        id: "lolocoko", displayName: "LoloCoko",
        style: "Researcher", work: ["Recruiter"],
        cost: 1, baseStats: { hp: 428, attack: 38, armor: 14, abilityPower: 63 },
        ability: { id: "heal_aura", chargeMax: 5 }
    },
    Rockless: {
        id: "rockless", displayName: "Rockless",
        style: "Disciplinarian", work: ["Recruiter"],
        cost: 2, baseStats: { hp: 630, attack: 52, armor: 31, abilityPower: 70 },
        ability: { id: "shield_ally", chargeMax: 4 }
    },
    Ashe_me: {
        id: "ashe_me", displayName: "Ashe_me",
        style: "Friendly", work: ["Recruiter"],
        cost: 3, baseStats: { hp: 750, attack: 63, armor: 35, abilityPower: 103 },
        ability: { id: "team_buff", chargeMax: 4 }
    },
    Kelly_maxine: {
        id: "kelly_maxine", displayName: "Kelly_maxine",
        style: "Survivalist", work: ["Recruiter"],
        cost: 4, baseStats: { hp: 1080, attack: 76, armor: 47, abilityPower: 115 },
        ability: { id: "team_buff", chargeMax: 3 }
    },

    // ==========================================
    // OUTDOOR PERSON  (Strategist=1g, Friendly=2g, Survivalist=3g, Hard Hitter=4g)
    // ==========================================
    FlipJames: {
        id: "flipjames", displayName: "FlipJames",
        style: "Strategist", work: ["OutdoorPerson"],
        cost: 1, baseStats: { hp: 450, attack: 42, armor: 15, abilityPower: 55 },
        ability: { id: "single_strike", chargeMax: 5 }
    },
    Ganji_Chudail: {
        id: "ganji_chudail", displayName: "Ganji_Chudail",
        style: "Friendly", work: ["OutdoorPerson"],
        cost: 2, baseStats: { hp: 600, attack: 49, armor: 25, abilityPower: 80 },
        ability: { id: "slow_enemy", chargeMax: 4 }
    },
    MarmotMenace: {
        id: "marmotmenace", displayName: "MarmotMenace",
        style: "Survivalist", work: ["OutdoorPerson"],
        cost: 3, baseStats: { hp: 900, attack: 63, armor: 37, abilityPower: 90 },
        ability: { id: "cleave", chargeMax: 4 }
    },
    Leandra: {
        id: "leandra", displayName: "Leandra",
        style: "Hard Hitter", work: ["OutdoorPerson"],
        cost: 4, baseStats: { hp: 855, attack: 106, armor: 41, abilityPower: 109 },
        ability: { id: "aoe_blast", chargeMax: 3 }
    },

    // ==========================================
    // 5g LEGENDARY TIER  (dual-work champions, rare drops at high level)
    // ==========================================
    JNRanger: {
        id: "jnranger", displayName: "JNRanger",
        style: "Strategist", work: ["Coder", "Leader"],
        cost: 5, baseStats: { hp: 1100, attack: 110, armor: 55, abilityPower: 160 },
        ability: { id: "chain_zap", chargeMax: 2 }
    }
};

// Attack speed multiplier per style. Mana fills by attackSpeed each attack,
// so faster styles see their abilities cast sooner. Combat tick interval is
// constant (1 attack per tick); only the mana fill rate varies.
const STYLE_ATTACK_SPEED = {
    "Hard Hitter":    1.30,
    "Strategist":     1.10,
    "Researcher":     1.00,
    "Friendly":       1.00,
    "Disciplinarian": 0.95,
    "Solidarity":     0.90,
    "Survivalist":    0.85
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

// ---------------------------------------------------------------------------
// SYNERGIES — thresholds + per-tier buff descriptors.
//
// Each synergy lists its activation thresholds (number of distinct contributing
// units required). Most are [2, 4]; Mentor and Recruiter have a third tier at 3.
// `buffs[tier]` is a stat multiplier set applied to all units carrying that tag
// in combatTick via computeCombatStats.
//
// `global: true` (Leader) means the buff applies to EVERY unit on the player's
// board regardless of work tag — a team-wide command aura, not a faction perk.
// `economy: [...]` (Trader, Recruiter) declares round-start economy effects
// applied by applyRoundStartSynergyEconomy in game.js.
// ---------------------------------------------------------------------------
// `tierDesc[i]` is the human-readable ability description shown in the side
// panel and the hover info zone. The multiplier numbers in `buffs` and the
// values in `economy` are what combat / round transitions actually read; the
// text is informational so designers can iterate copy without touching logic.
const SYNERGIES = {
    styles: {
        "Strategist":     { thresholds: [2, 4], buffs: [{ atk: 1.10 }, { atk: 1.25 }],
                            tierDesc: ["+10% attack to Strategists", "+25% attack, smart targeting"] },
        "Researcher":     { thresholds: [2, 4], buffs: [{ ap: 1.15 }, { ap: 1.35 }],
                            economy:  [{ xpDiscount: 1 }, { xpDiscount: 2 }],
                            tierDesc: ["+15% AP, XP cost −1g", "+35% AP, XP cost −2g"] },
        "Disciplinarian": { thresholds: [2, 4], buffs: [{ armor: 1.30 }, { armor: 1.60 }],
                            tierDesc: ["+30% armor to Disciplinarians", "+60% armor, debuff resistance"] },
        "Friendly":       { thresholds: [2, 4], buffs: [{ ap: 1.10 }, { ap: 1.25 }],
                            tierDesc: ["+10% AP, heal on cast", "+25% AP, bigger team heal"] },
        "Survivalist":    { thresholds: [2, 4], buffs: [{ hp: 1.20 }, { hp: 1.45 }],
                            tierDesc: ["+20% HP to Survivalists", "+45% HP, slow regen"] },
        "Solidarity":     { thresholds: [2, 4], buffs: [{ armor: 1.15 }, { armor: 1.35 }],
                            tierDesc: ["+15% armor, starting shield", "+35% armor, larger shield"] },
        "Hard Hitter":    { thresholds: [2, 4], buffs: [{ atk: 1.20 }, { atk: 1.45 }],
                            tierDesc: ["+20% attack to Hard Hitters", "+45% attack, crit chance"] }
    },
    works: {
        "Trader":        { thresholds: [2, 4],    buffs: [{ }, { }],
                           economy: [{ goldPerRound: 2 }, { goldPerRound: 5 }],
                           tierDesc: ["+2g income per round", "+5g income per round"] },
        "Killer":        { thresholds: [2, 4],    buffs: [{ atk: 1.10 }, { atk: 1.25 }],
                           tierDesc: ["+10% attack, execute low-HP enemies", "+25% attack, bigger execute window"] },
        "Mentor":        { thresholds: [2, 3, 4], buffs: [{ ap: 1.15 }, { ap: 1.25 }, { ap: 1.40 }],
                           tierDesc: ["+15% AP team-wide", "+25% AP team-wide", "+40% AP team-wide"] },
        // Leader is a global command aura — boosts every unit on the board.
        "Leader":        { thresholds: [2, 4],    buffs: [{ atk: 1.10, armor: 1.10 }, { atk: 1.25, armor: 1.25 }],
                           global: true,
                           tierDesc: ["COMMAND: +10% atk & armor whole team", "COMMAND: +25% atk & armor whole team"] },
        "Avenger":       { thresholds: [2, 4],    buffs: [{ atk: 1.12 }, { atk: 1.30 }],
                           tierDesc: ["+12% attack, vengeance on ally death", "+30% attack, fierce vengeance"] },
        "Coder":         { thresholds: [2, 4],    buffs: [{ ap: 1.20 }, { ap: 1.40 }],
                           tierDesc: ["+20% AP, attack chains to one extra enemy", "+40% AP, attacks chain twice"] },
        "Recruiter":     { thresholds: [2, 3, 4], buffs: [{ }, { }, { }],
                           economy: [{ extraReroll: 1 }, { extraReroll: 2 }, { extraReroll: 3 }],
                           tierDesc: ["1 free shop reroll per round", "2 free rerolls per round", "3 free rerolls per round"] },
        "OutdoorPerson": { thresholds: [2, 4],    buffs: [{ atk: 1.10 }, { atk: 1.25 }],
                           tierDesc: ["+10% attack, scout enemy positions", "+25% attack, ranged advantage"] }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CHARACTERS, SYMBOLS, SYNERGIES, STYLE_ATTACK_SPEED };
}
