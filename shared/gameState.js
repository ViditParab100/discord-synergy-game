// shared/gameState.js
//
// Single source of truth for gold, round, HP, bench, board, shop, level.
// Everything else (Phaser scene, HTML HUD, future multiplayer sync) reads
// from this object and listens for events. Mutations go through the methods
// here so we never have two parts of the codebase disagreeing about state.
//
// Browser usage: <script src="../shared/gameState.js"></script> exposes
//   `window.GameState`, `window.ECONOMY`, `window.DROP_RATES`, `window.XP_TO_LEVEL`.
// Node usage:   const { GameState } = require('./shared/gameState');

(function (global) {
  'use strict';

  const ECONOMY = {
    STARTING_GOLD: 0,         // round 1 gets income on start, so this is pre-income
    STARTING_HP: 100,
    STARTING_LEVEL: 2,
    BENCH_SIZE: 7,
    BOARD_COLS: 5,    // keep in sync with shared/coords.js BOARD.COLS
    BOARD_ROWS: 7,    // keep in sync with shared/coords.js BOARD.ROWS

    ROUND_INCOME: 5,
    INTEREST_PER: 10,         // +1g per 10g held
    MAX_INTEREST: 5,
    STREAK_BONUS: [0, 0, 1, 2, 3], // index = streak length (capped at 4+)
    WIN_BONUS: 2,             // flat gold for winning a round
    REROLL_COST: 2,
    XP_PURCHASE_COST: 4,
    XP_PER_PURCHASE: 4,

    // multiplier of base cost when selling a unit at N stars
    SELL_REFUND: { 1: 1, 2: 3, 3: 9 }
  };

  // Shop drop-rate table by player level. Each row is [1g, 2g, 3g, 4g, 5g] %.
  // Numbers are conservative TFT-style; tune later from playtests.
  const DROP_RATES = {
    2:  [100,   0,   0,   0,   0],
    3:  [ 75,  25,   0,   0,   0],
    4:  [ 55,  30,  15,   0,   0],
    5:  [ 45,  33,  20,   2,   0],
    6:  [ 25,  40,  30,   5,   0],
    7:  [ 19,  30,  35,  15,   1],
    8:  [ 16,  20,  35,  25,   4],
    9:  [  9,  15,  30,  30,  16],
    10: [  5,  10,  20,  40,  25]
  };

  // Cumulative XP required to reach a given level (level 2 = start).
  const XP_TO_LEVEL = { 2: 0, 3: 2, 4: 6, 5: 10, 6: 20, 7: 36, 8: 56, 9: 80, 10: 100 };

  class GameState {
    constructor() {
      this.gold       = ECONOMY.STARTING_GOLD;
      this.round      = 1;
      this.phase      = 'planning';  // 'planning' | 'combat' | 'gameover'
      this.playerHp   = ECONOMY.STARTING_HP;
      this.opponentHp = ECONOMY.STARTING_HP;
      this.level      = ECONOMY.STARTING_LEVEL;
      this.xp         = 0;
      this.streak     = 0;
      this.streakKind = null;        // 'win' | 'loss' | null
      this.freeRerolls = 0;          // granted by Recruiter synergy at round start

      // bench[i] = { charId, stars } | null
      this.bench = new Array(ECONOMY.BENCH_SIZE).fill(null);

      // board[row][col] = { charId, stars } | null
      this.board = Array.from({ length: ECONOMY.BOARD_ROWS },
                              () => new Array(ECONOMY.BOARD_COLS).fill(null));

      // shop[i] = charId | null
      this.shop = [];

      this._listeners = new Set();
    }

    // ------------- pub/sub -------------
    subscribe(fn) {
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    }
    _emit(event) {
      this._listeners.forEach(fn => fn(event, this));
    }

    // ------------- gold -------------
    addGold(amount, reason = 'misc') {
      this.gold += amount;
      this._emit({ type: 'gold', delta: amount, reason });
    }
    spendGold(amount, reason = 'misc') {
      if (this.gold < amount) return false;
      this.gold -= amount;
      this._emit({ type: 'gold', delta: -amount, reason });
      return true;
    }

    collectRoundIncome() {
      const interest = Math.min(ECONOMY.MAX_INTEREST,
                                Math.floor(this.gold / ECONOMY.INTEREST_PER));
      const streakIdx = Math.min(this.streak, ECONOMY.STREAK_BONUS.length - 1);
      const streakBonus = ECONOMY.STREAK_BONUS[streakIdx];
      const total = ECONOMY.ROUND_INCOME + interest + streakBonus;
      this.addGold(total, 'income');
      return { base: ECONOMY.ROUND_INCOME, interest, streak: streakBonus, total };
    }

    // Any charId the player already owns at 3★ (board OR bench). Maxed units
    // are removed from the shop pool — there's nothing more to do with another
    // copy, so the slot would be wasted.
    getMaxedCharIds() {
      const maxed = new Set();
      this.bench.forEach(u => { if (u && (u.stars || 1) >= 3) maxed.add(u.charId); });
      this.board.forEach(row => row.forEach(u => {
        if (u && (u.stars || 1) >= 3) maxed.add(u.charId);
      }));
      return maxed;
    }

    // ------------- shop -------------
    rollShop(characters, { paid = false } = {}) {
      if (paid && !this.spendGold(ECONOMY.REROLL_COST, 'reroll')) return false;

      const rates = DROP_RATES[Math.min(this.level, 10)] || DROP_RATES[10];
      const maxed = this.getMaxedCharIds();

      // Bucket character ids by cost once per roll, skipping any 3★'d champ.
      const byCost = [[], [], [], [], []]; // index 0 = 1g
      for (const id in characters) {
        if (maxed.has(id)) continue;
        const cost = characters[id].cost;
        if (cost >= 1 && cost <= 5) byCost[cost - 1].push(id);
      }

      this.shop = [];
      for (let i = 0; i < 5; i++) {
        const r = Math.random() * 100;
        let acc = 0, tier = 0;
        for (let t = 0; t < 5; t++) {
          acc += rates[t];
          if (r < acc) { tier = t; break; }
        }
        const pool = byCost[tier];
        this.shop.push(pool.length
          ? pool[Math.floor(Math.random() * pool.length)]
          : null);
      }
      this._emit({ type: 'shop' });
      return true;
    }

    consumeShopSlot(index) {
      const id = this.shop[index];
      if (!id) return null;
      this.shop[index] = null;
      this._emit({ type: 'shop' });
      return id;
    }

    // ------------- bench -------------
    benchAdd(unit) {
      const slot = this.bench.findIndex(s => s === null);
      if (slot === -1) return -1;
      this.bench[slot] = unit;
      this._emit({ type: 'bench', slot });
      return slot;
    }
    benchTake(slot) {
      const u = this.bench[slot];
      this.bench[slot] = null;
      this._emit({ type: 'bench', slot });
      return u;
    }
    // Direct slot assignment that still fires the 'bench' event. Use this
    // for swaps where the slot is already known (e.g., dragging a unit onto
    // an occupied bench slot displaces the occupant back to the source).
    benchSet(slot, unit) {
      this.bench[slot] = unit;
      this._emit({ type: 'bench', slot });
    }

    // ------------- board -------------
    boardPlace(col, row, unit) {
      if (col < 0 || col >= ECONOMY.BOARD_COLS) return undefined;
      if (row < 0 || row >= ECONOMY.BOARD_ROWS) return undefined;
      const prev = this.board[row][col];
      this.board[row][col] = unit;
      this._emit({ type: 'board', col, row });
      return prev;       // caller decides what to do with displaced unit
    }
    boardCount() {
      let n = 0;
      for (const row of this.board) for (const u of row) if (u) n++;
      return n;
    }
    capForLevel() { return this.level; } // 1 unit deployable per level

    // ------------- xp / level -------------
    // Caller passes the actual price (may be discounted by Researcher synergy).
    // Defaults to the un-discounted ECONOMY.XP_PURCHASE_COST so legacy callers
    // and tests still work.
    buyXp(cost) {
      if (this.level >= 10) return false;
      const price = cost == null ? ECONOMY.XP_PURCHASE_COST : Math.max(1, cost);
      if (!this.spendGold(price, 'xp')) return false;
      this.xp += ECONOMY.XP_PER_PURCHASE;
      while (this.level < 10 && this.xp >= (XP_TO_LEVEL[this.level + 1] || Infinity)) {
        this.xp -= XP_TO_LEVEL[this.level + 1];
        this.level += 1;
        this._emit({ type: 'levelup', level: this.level });
      }
      return true;
    }

    // ------------- combat result -------------
    // `damage` is computed by the caller from the actual enemy survivors
    // (stars, cost, HP%). Only applied on a loss; ignored on a win.
    recordCombatResult(won, damage = 0) {
      if (won) {
        this.streak = this.streakKind === 'win' ? this.streak + 1 : 1;
        this.streakKind = 'win';
        this.addGold(ECONOMY.WIN_BONUS, 'win');
      } else {
        this.streak = this.streakKind === 'loss' ? this.streak + 1 : 1;
        this.streakKind = 'loss';
        this.playerHp = Math.max(0, this.playerHp - damage);
      }
      this.round += 1;
      this.phase = this.playerHp <= 0 ? 'gameover' : 'planning';
      this._emit({ type: 'roundEnd', won, damage });
    }

    snapshot() {
      // Useful for socket.io sync later — pure data, no listeners.
      return {
        gold: this.gold, round: this.round, phase: this.phase,
        playerHp: this.playerHp, opponentHp: this.opponentHp,
        level: this.level, xp: this.xp,
        streak: this.streak, streakKind: this.streakKind,
        bench: this.bench, board: this.board, shop: this.shop
      };
    }
  }

  const exported = { GameState, ECONOMY, DROP_RATES, XP_TO_LEVEL };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    Object.assign(global, exported);
  }
})(typeof window !== 'undefined' ? window : globalThis);