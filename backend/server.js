const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const users = {}; // Map socket.id to { username, id }
const rooms = ['#Public'];

// Serve frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // User joins with a name
  socket.on('join', (username) => {
    users[socket.id] = { username: username || 'Guest', id: socket.id };
    
    // Notify all about updated lists
    io.emit('systemMessage', `${users[socket.id].username} joined the chat`);
    io.emit('updateUserList', Object.values(users));
    io.emit('updateRooms', rooms);
  });

  // Handle room creation
  socket.on('createRoom', (roomName) => {
    const formattedName = roomName.startsWith('#') ? roomName : `#${roomName}`;
    if (!rooms.includes(formattedName)) {
      rooms.push(formattedName);
      io.emit('updateRooms', rooms);
    }
  });

  // Handle joining a room
  socket.on('joinRoom', (roomName) => {
    socket.join(roomName);
    socket.emit('systemMessage', `You joined ${roomName}`);
  });

  // Handle group chat messages
  socket.on('chatMessage', ({ room, text }) => {
    const messageData = {
      room,
      user: users[socket.id]?.username || 'Anonymous',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    socket.to(room).emit('chatMessage', messageData);
  });

  // Handle private messages
  socket.on('privateMessage', ({ to, text }) => {
    const messageData = {
      from: users[socket.id]?.username || 'Anonymous',
      fromId: socket.id,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    socket.to(to).emit('privateMessage', messageData);
  });

  // Handle typing status
  socket.on('typing', ({ target, isPrivate }) => {
    const sender = users[socket.id]?.username || 'Someone';
    if (isPrivate) {
      socket.to(target).emit('typing', { user: sender, isPrivate: true, fromId: socket.id });
    } else {
      socket.to(target).emit('typing', { user: sender, isPrivate: false, room: target });
    }
  });

  socket.on('stopTyping', ({ target }) => {
    socket.to(target).emit('stopTyping');
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (users[socket.id]) {
      const name = users[socket.id].username;
      delete users[socket.id];
      io.emit('systemMessage', `${name} left the chat`);
      io.emit('updateUserList', Object.values(users));
    }
    console.log('User disconnected');
  });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));