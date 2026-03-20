const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.static(path.join(__dirname, 'public')));

// Queue of users waiting to be matched
let waitingQueue = [];

// Active chat pairs: socketId -> partnerId
const activePairs = {};

// Track user data
const userMeta = {};

io.on('connection', (socket) => {
  console.log(`[+] User connected: ${socket.id}`);

  userMeta[socket.id] = {
    id: socket.id,
    connectedAt: Date.now(),
    partner: null,
    typing: false
  };

  socket.emit('status', { type: 'waiting', message: 'Finding someone to talk to...' });

  // Try to match with someone in the queue
  tryMatch(socket);

  // Handle sending a message
  socket.on('message', (data) => {
    const partnerId = activePairs[socket.id];
    if (!partnerId) return;

    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) {
      partnerSocket.emit('message', {
        text: data.text,
        from: 'stranger',
        timestamp: Date.now()
      });
    }
  });

  // Typing indicator
  socket.on('typing', (isTyping) => {
    const partnerId = activePairs[socket.id];
    if (!partnerId) return;
    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) {
      partnerSocket.emit('typing', { isTyping });
    }
  });

  // User wants next stranger
  socket.on('next', () => {
    disconnectFromPartner(socket);
    socket.emit('status', { type: 'waiting', message: 'Finding someone new...' });
    tryMatch(socket);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[-] User disconnected: ${socket.id}`);
    disconnectFromPartner(socket);

    // Remove from waiting queue
    waitingQueue = waitingQueue.filter(id => id !== socket.id);

    delete userMeta[socket.id];
  });
});

function tryMatch(socket) {
  // Remove self from queue if already there
  waitingQueue = waitingQueue.filter(id => id !== socket.id);

  if (waitingQueue.length > 0) {
    // Match with the first waiting user
    const partnerId = waitingQueue.shift();
    const partnerSocket = io.sockets.sockets.get(partnerId);

    if (!partnerSocket || !partnerSocket.connected) {
      // Partner disconnected before match, try again
      return tryMatch(socket);
    }

    // Create pair
    activePairs[socket.id] = partnerId;
    activePairs[partnerId] = socket.id;

    if (userMeta[socket.id]) userMeta[socket.id].partner = partnerId;
    if (userMeta[partnerId]) userMeta[partnerId].partner = socket.id;

    socket.emit('matched', { message: 'Connected to a stranger. Say hello!' });
    partnerSocket.emit('matched', { message: 'Connected to a stranger. Say hello!' });

    console.log(`[~] Matched: ${socket.id} <-> ${partnerId}`);
  } else {
    // Add to waiting queue
    waitingQueue.push(socket.id);
    socket.emit('status', { type: 'waiting', message: 'Waiting for a stranger...' });
  }
}

function disconnectFromPartner(socket) {
  const partnerId = activePairs[socket.id];
  if (!partnerId) return;

  const partnerSocket = io.sockets.sockets.get(partnerId);
  if (partnerSocket) {
    partnerSocket.emit('stranger_left', { message: 'Stranger has left the chat.' });
    delete activePairs[partnerId];
    if (userMeta[partnerId]) userMeta[partnerId].partner = null;

    // Put partner back in queue
    partnerSocket.emit('status', { type: 'waiting', message: 'Finding someone new...' });
    tryMatch(partnerSocket);
  }

  delete activePairs[socket.id];
  if (userMeta[socket.id]) userMeta[socket.id].partner = null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🔮 Whispr server running at http://localhost:${PORT}\n`);
});
