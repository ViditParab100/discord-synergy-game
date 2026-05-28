// server/gameRoom.js
//
// A GameRoom holds two players and the in-flight snapshots they submit when
// they click FIGHT. As soon as both snapshots arrive the room emits a
// `roundReady` event so the server can broadcast each player's board to the
// other. State is intentionally thin — this is just a relay, not an authority.

class GameRoom {
  static _nextId = 1;

  constructor() {
    this.id = `room_${GameRoom._nextId++}`;
    this.players = [];           // [{ socket, slot: 'p1'|'p2' }, ...]
    this.snapshots = {};         // { p1: snapshot, p2: snapshot }
    this.combatResults = {};     // { p1: { won, lossDamage }, ... }
  }

  isFull() { return this.players.length >= 2; }
  hasSlot(slot) { return this.players.some(p => p.slot === slot); }
  slotOf(socketId) {
    const p = this.players.find(x => x.socket.id === socketId);
    return p ? p.slot : null;
  }
  opponent(slot) { return slot === 'p1' ? 'p2' : 'p1'; }
  opponentSocket(socketId) {
    const slot = this.slotOf(socketId);
    if (!slot) return null;
    const opp = this.players.find(x => x.slot === this.opponent(slot));
    return opp ? opp.socket : null;
  }

  addPlayer(socket) {
    if (this.isFull()) return null;
    const slot = this.hasSlot('p1') ? 'p2' : 'p1';
    this.players.push({ socket, slot });
    return slot;
  }

  removePlayer(socketId) {
    this.players = this.players.filter(p => p.socket.id !== socketId);
    // Stale snapshots / results from the leaver are discarded — the next
    // round starts fresh if a new player joins.
    this.snapshots = {};
    this.combatResults = {};
  }

  // Stash a player's planning-phase snapshot. Returns true when both players
  // have submitted (caller should then broadcast).
  submitSnapshot(socketId, snapshot) {
    const slot = this.slotOf(socketId);
    if (!slot) return false;
    this.snapshots[slot] = snapshot;
    return !!(this.snapshots.p1 && this.snapshots.p2);
  }

  // Same shape for end-of-combat results (who won, how much HP damage taken).
  submitCombatResult(socketId, result) {
    const slot = this.slotOf(socketId);
    if (!slot) return false;
    this.combatResults[slot] = result;
    return !!(this.combatResults.p1 && this.combatResults.p2);
  }

  // After a round resolves, clear staged data so the next round can stage.
  clearRoundStaging() {
    this.snapshots = {};
    this.combatResults = {};
  }
}

module.exports = { GameRoom };
