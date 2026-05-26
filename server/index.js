const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" } // Allows connections from Discord's iframe
});
const path = require('path');

const PORT = process.env.PORT || 3000;

// Serve the static frontend files from the client folder
app.use(express.static(path.join(__dirname, '../client')));

// Handle real-time player connections
io.on('connection', (socket) => {
    console.log(`A player connected: ${socket.id}`);

    // Listen for a player moving a piece
    socket.on('movePiece', (data) => {
        // data would contain: { characterId, oldX, oldY, newX, newY }
        console.log(`Player moved ${data.characterId} to ${data.newX}, ${data.newY}`);
        
        // Broadcast the move to the other player in the match
        socket.broadcast.emit('pieceMoved', data);
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
    });
});

http.listen(PORT, () => {
    console.log(`Game server running on port ${PORT}`);
});