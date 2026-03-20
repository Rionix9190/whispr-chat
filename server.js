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

// Stats
const stats = {
  totalConnections: 0,
  totalChats: 0,
  totalMessages: 0,
  onlineNow: 0
};

// Waiting queues by preference
// preference: 'any' | 'male' | 'female' | 'other'
const waitingQueues = {
  any: [],
  male: [],
  female: [],
  other: []
};

// Active pairs
const activePairs = {};

// User data
const userMeta = {};

// Reported users (socketId -> count)
const reportedUsers = {};

io.on('connection', (socket) => {
  stats.totalConnections++;
  stats.onlineNow++;

  userMeta[socket.id] = {
    id: socket.id,
    partner: null,
    gender: 'any',
    lookingFor: 'any',
    displayName: 'Anonymous',
    googleId: null,
    avatar: null,
    messageCount: 0,
    chatCount: 0,
    joinedAt: Date.now()
  };

  // Send current stats
  socket.emit('stats', getPublicStats());
  broadcastStats();

  // User sets their profile
  socket.on('set_profile', (data) => {
    if (userMeta[socket.id]) {
      userMeta[socket.id].gender = data.gender || 'any';
      userMeta[socket.id].lookingFor = data.lookingFor || 'any';
      userMeta[socket.id].displayName = data.displayName || 'Anonymous';
      userMeta[socket.id].googleId = data.googleId || null;
      userMeta[socket.id].avatar = data.avatar || null;
    }
    socket.emit('profile_set', { ok: true });
  });

  // Find a stranger
  socket.on('find_stranger', () => {
    removeFromAllQueues(socket.id);
    socket.emit('status', { type: 'waiting', message: 'Searching...' });
    tryMatch(socket);
  });

  // Send message
  socket.on('message', (data) => {
    const partnerId = activePairs[socket.id];
    if (!partnerId) return;
    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) {
      stats.totalMessages++;
      if (userMeta[socket.id]) userMeta[socket.id].messageCount++;
      partnerSocket.emit('message', {
        text: data.text,
        from: 'stranger',
        timestamp: Date.now()
      });
      broadcastStats();
    }
  });

  // Typing
  socket.on('typing', (isTyping) => {
    const partnerId = activePairs[socket.id];
    if (!partnerId) return;
    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) partnerSocket.emit('typing', { isTyping });
  });

  // Next stranger
  socket.on('next', () => {
    disconnectFromPartner(socket);
    removeFromAllQueues(socket.id);
    socket.emit('status', { type: 'waiting', message: 'Finding someone new...' });
    tryMatch(socket);
  });

  // Report a stranger
  socket.on('report', (data) => {
    const partnerId = activePairs[socket.id];
    if (!partnerId) return;
    reportedUsers[partnerId] = (reportedUsers[partnerId] || 0) + 1;
    socket.emit('report_sent', { message: 'Stranger reported. Thank you.' });

    // Auto-disconnect if reported 3+ times
    if (reportedUsers[partnerId] >= 3) {
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit('kicked', { message: 'You have been removed due to reports.' });
        partnerSocket.disconnect();
      }
    }
  });

  // Block (just disconnect and skip)
  socket.on('block', () => {
    const partnerId = activePairs[socket.id];
    disconnectFromPartner(socket);
    removeFromAllQueues(socket.id);
    socket.emit('status', { type: 'waiting', message: 'Blocked. Finding someone new...' });
    // Put back in queue after short delay
    setTimeout(() => tryMatch(socket), 500);
  });

  socket.on('disconnect', () => {
    stats.onlineNow = Math.max(0, stats.onlineNow - 1);
    disconnectFromPartner(socket);
    removeFromAllQueues(socket.id);
    delete userMeta[socket.id];
    broadcastStats();
  });
});

function tryMatch(socket) {
  const user = userMeta[socket.id];
  if (!user) return;

  const lookingFor = user.lookingFor || 'any';

  // Try to find a compatible partner
  // Check specific gender queue first, then 'any' queue
  let partnerId = null;

  if (lookingFor === 'any') {
    // Look in all queues
    for (const queue of ['any', 'male', 'female', 'other']) {
      partnerId = findCompatibleInQueue(socket.id, queue);
      if (partnerId) break;
    }
  } else {
    // Look for specific gender in their queue (people who set gender = lookingFor)
    // AND people in 'any' queue
    partnerId = findCompatibleInQueue(socket.id, lookingFor) ||
                findCompatibleInQueue(socket.id, 'any');
  }

  if (partnerId) {
    removeFromAllQueues(partnerId);
    removeFromAllQueues(socket.id);

    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (!partnerSocket || !partnerSocket.connected) {
      return tryMatch(socket);
    }

    activePairs[socket.id] = partnerId;
    activePairs[partnerId] = socket.id;

    if (userMeta[socket.id]) userMeta[socket.id].partner = partnerId;
    if (userMeta[partnerId]) userMeta[partnerId].partner = socket.id;

    stats.totalChats++;
    if (userMeta[socket.id]) userMeta[socket.id].chatCount++;
    if (userMeta[partnerId]) userMeta[partnerId].chatCount++;

    // Send match info (gender of partner, but NOT name/identity)
    const myGender = userMeta[socket.id]?.gender || 'unknown';
    const partnerGender = userMeta[partnerId]?.gender || 'unknown';

    socket.emit('matched', {
      message: 'Connected!',
      strangerGender: partnerGender
    });
    partnerSocket.emit('matched', {
      message: 'Connected!',
      strangerGender: myGender
    });

    broadcastStats();
  } else {
    // Add to appropriate queue based on own gender
    const myGender = user.gender || 'any';
    const queue = waitingQueues[myGender] || waitingQueues['any'];
    if (!queue.includes(socket.id)) {
      queue.push(socket.id);
    }
  }
}

function findCompatibleInQueue(myId, queueName) {
  const queue = waitingQueues[queueName];
  if (!queue || queue.length === 0) return null;

  for (let i = 0; i < queue.length; i++) {
    const candidateId = queue[i];
    if (candidateId === myId) continue;
    const candidateSocket = io.sockets.sockets.get(candidateId);
    if (!candidateSocket || !candidateSocket.connected) {
      queue.splice(i, 1);
      i--;
      continue;
    }
    queue.splice(i, 1);
    return candidateId;
  }
  return null;
}

function removeFromAllQueues(socketId) {
  for (const queue of Object.values(waitingQueues)) {
    const idx = queue.indexOf(socketId);
    if (idx !== -1) queue.splice(idx, 1);
  }
}

function disconnectFromPartner(socket) {
  const partnerId = activePairs[socket.id];
  if (!partnerId) return;

  const partnerSocket = io.sockets.sockets.get(partnerId);
  if (partnerSocket) {
    partnerSocket.emit('stranger_left', { message: 'Stranger disconnected.' });
    delete activePairs[partnerId];
    if (userMeta[partnerId]) userMeta[partnerId].partner = null;
    setTimeout(() => tryMatch(partnerSocket), 1000);
  }

  delete activePairs[socket.id];
  if (userMeta[socket.id]) userMeta[socket.id].partner = null;
}

function getPublicStats() {
  return {
    onlineNow: stats.onlineNow,
    totalChats: stats.totalChats,
    totalMessages: stats.totalMessages
  };
}

function broadcastStats() {
  io.emit('stats', getPublicStats());
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🔮 Whispr server running at http://localhost:${PORT}\n`);
});
