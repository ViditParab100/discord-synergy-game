// client/net.js
//
// Thin wrapper over socket.io-client for Phase 4 snapshot-relay multiplayer.
// Exposes window.Net with:
//   Net.connected   boolean — true once the server has slotted us into a room
//   Net.slot        'p1' | 'p2' | null
//   Net.opponent    'p1' | 'p2' | null
//   Net.matched     boolean — true once a second player joins our room
//   Net.send(event, payload)
//   Net.on(event, fn)        — subscribe to a server event
//
// Single-player remains the fallback: if the socket fails to connect (no
// server running) the game just plays against random enemies as before.
// Code in game.js can branch on `Net.connected && Net.matched`.

(function (global) {
  'use strict';

  const listeners = new Map(); // event → Set<fn>
  let socket = null;
  let connected = false;
  let matched   = false;
  let mySlot    = null;
  let opponentId = null;

  function emit(event, payload) {
    const fns = listeners.get(event);
    if (fns) fns.forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } });
  }

  function tryConnect() {
    if (typeof io !== 'function') {
      console.warn('[net] socket.io client not loaded — staying single-player');
      return;
    }
    socket = io({ reconnection: true, reconnectionAttempts: 3 });

    socket.on('connect', () => {
      connected = true;
      console.log('[net] connected', socket.id);
      emit('status', { connected, matched, slot: mySlot });
    });
    socket.on('connect_error', (err) => {
      console.warn('[net] connect_error', err && err.message);
      connected = false;
      emit('status', { connected, matched, slot: mySlot });
    });

    socket.on('joined', ({ roomId, slot }) => {
      mySlot = slot;
      console.log(`[net] joined ${roomId} as ${slot}`);
      emit('joined', { roomId, slot });
      emit('status', { connected, matched, slot: mySlot });
    });

    socket.on('matched', (data) => {
      matched = true;
      const opp = data.players.find(p => p.slot !== mySlot);
      opponentId = opp ? opp.id : null;
      console.log('[net] matched, opponent =', opponentId);
      emit('matched', data);
      emit('status', { connected, matched, slot: mySlot });
    });

    socket.on('opponent_snapshot', (payload) => emit('opponent_snapshot', payload));
    socket.on('opponent_combat_result', (payload) => emit('opponent_combat_result', payload));
    socket.on('opponent_left', () => {
      matched = false; opponentId = null;
      console.log('[net] opponent left');
      emit('opponent_left');
      emit('status', { connected, matched, slot: mySlot });
    });

    socket.on('disconnect', () => {
      connected = false; matched = false;
      console.log('[net] disconnected');
      emit('status', { connected, matched, slot: mySlot });
    });
  }

  const Net = {
    init: tryConnect,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event).delete(fn);
    },
    send(event, payload) {
      if (!socket || !connected) return false;
      socket.emit(event, payload);
      return true;
    },
    get connected()  { return connected; },
    get matched()    { return matched; },
    get slot()       { return mySlot; },
    get opponentId() { return opponentId; }
  };

  global.Net = Net;
})(typeof window !== 'undefined' ? window : globalThis);
