// server/index.js
//
// Phase 4 (snapshot-relay multiplayer):
//   • New connections are slotted into the first open GameRoom (or a fresh one).
//   • When both slots are filled the server emits `matched` to both players
//     with their slot id (`p1`/`p2`).
//   • Combat flow: each client sends `submit_snapshot` on FIGHT. As soon as
//     both arrive, the server broadcasts `opponent_snapshot` (containing the
//     other player's board) to each side. Each client then runs combat
//     locally against that snapshot.
//   • `combat_result` is relayed both ways so each client can show the
//     opponent's HP track for UI/score purposes.
//
// State on the server is intentionally minimal — just enough to pair people
// up and shuttle their board snapshots. Combat is still client-authoritative.

const express = require('express');
const path    = require('path');
const { GameRoom } = require('./gameRoom');

const app  = express();
const http = require('http').createServer(app);
const io   = require('socket.io')(http, {
    cors: { origin: '*' } // Allows connections from Discord's iframe and Live Server
});

const PORT  = process.env.PORT || 3000;
const rooms = []; // active GameRoom instances; oldest-first lookup

app.use(express.static(path.join(__dirname, '../client')));

function findOrCreateRoom() {
    let room = rooms.find(r => !r.isFull());
    if (!room) { room = new GameRoom(); rooms.push(room); }
    return room;
}

function purgeEmptyRoom(room) {
    if (room.players.length === 0) {
        const idx = rooms.indexOf(room);
        if (idx >= 0) rooms.splice(idx, 1);
    }
}

io.on('connection', (socket) => {
    const room = findOrCreateRoom();
    const slot = room.addPlayer(socket);
    socket.data.roomId = room.id;
    socket.join(room.id);
    socket.emit('joined', { roomId: room.id, slot });
    console.log(`[net] ${socket.id} → ${room.id} as ${slot}  (${room.players.length}/2)`);

    if (room.isFull()) {
        io.to(room.id).emit('matched', {
            roomId: room.id,
            players: room.players.map(p => ({ id: p.socket.id, slot: p.slot }))
        });
        console.log(`[net] room ${room.id} matched`);
    }

    socket.on('submit_snapshot', (snapshot) => {
        const r = rooms.find(x => x.id === socket.data.roomId);
        if (!r) return;
        const bothReady = r.submitSnapshot(socket.id, snapshot);
        if (bothReady) {
            // Send each player the OTHER player's snapshot, then clear staging.
            r.players.forEach(p => {
                const oppSlot = r.opponent(p.slot);
                p.socket.emit('opponent_snapshot', {
                    fromSlot: oppSlot,
                    snapshot: r.snapshots[oppSlot]
                });
            });
            r.snapshots = {}; // ready for next round
            console.log(`[net] room ${r.id}: both snapshots relayed`);
        }
    });

    socket.on('combat_result', (result) => {
        const r = rooms.find(x => x.id === socket.data.roomId);
        if (!r) return;
        const opp = r.opponentSocket(socket.id);
        if (opp) opp.emit('opponent_combat_result', result);
    });

    socket.on('disconnect', () => {
        const r = rooms.find(x => x.id === socket.data.roomId);
        if (!r) return;
        r.removePlayer(socket.id);
        socket.to(r.id).emit('opponent_left');
        console.log(`[net] ${socket.id} left ${r.id}`);
        purgeEmptyRoom(r);
    });
});

http.listen(PORT, () => {
    console.log(`Game server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in two tabs to test multiplayer.`);
});
