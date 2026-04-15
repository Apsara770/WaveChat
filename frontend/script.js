const socket = io();

// UI Elements
const joinOverlay = document.getElementById('join-overlay');
const joinForm = document.getElementById('join-form');
const usernameInput = document.getElementById('usernameInput');
const appLayout = document.getElementById('app-layout');

const emptyChatState = document.getElementById('empty-chat-state');
const activeChatContainer = document.getElementById('active-chat-container');

const chatForm = document.getElementById('chat-form');
const msgInput = document.getElementById('msgInput');
const messageArea = document.getElementById('messages');
const roomListEl = document.getElementById('room-list');
const userListEl = document.getElementById('user-list');

const activeChatAvatar = document.getElementById('active-chat-avatar');
const activeChatName = document.getElementById('active-chat-name');
const activeChatStatus = document.getElementById('active-chat-status');

// Discovery & Search
const searchInput = document.getElementById('sidebar-search');
const searchResultsBox = document.getElementById('search-results-box');
const searchResultsList = document.getElementById('search-results-list');

// Archive
const archivedCountEl = document.getElementById('archived-count');
const archivedListEl = document.getElementById('archived-list');
const archivedTrigger = document.getElementById('archived-trigger');

// Menus
const addMenuBtn = document.getElementById('add-menu-btn');
const sidebarDropdown = document.getElementById('sidebar-dropdown');
const chatOptionsBtn = document.getElementById('chat-options-btn');
const chatDropdown = document.getElementById('chat-dropdown');

// Modals
const roomModal = document.getElementById('room-modal');
const infoModal = document.getElementById('info-modal');
const infoContent = document.getElementById('info-content');
const closeModalBtn = document.getElementById('close-modal');
const closeInfoBtn = document.getElementById('close-info');

// App State
let myUsername = '';
let myId = '';
let activeChatId = null; 
let joinedChats = []; // Array of { id, type, name }
let archivedChatIds = []; // Array of IDs
let mutedChatIds = []; // Array of IDs
let messagesByChat = {}; // chatId -> Array of messages
let onlineUsers = [];
let availableRooms = [];
let typingTimeout = null;

// 1. Join Chat (Initial)
joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    myUsername = usernameInput.value.trim();
    if (myUsername) {
        socket.emit('join', myUsername);
        joinOverlay.classList.add('hidden');
        appLayout.classList.remove('wrapper-hidden');
        msgInput.focus();
    }
});

socket.on('connect', () => { myId = socket.id; });

// 2. Discovery & Search Logic
searchInput.oninput = (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
        searchResultsBox.classList.add('hidden');
        return;
    }

    searchResultsBox.classList.remove('hidden');
    searchResultsList.innerHTML = '';

    // Filter Rooms
    const matchedRooms = availableRooms.filter(r => r.toLowerCase().includes(query));
    matchedRooms.forEach(room => {
        const isJoined = joinedChats.find(c => c.id === room);
        renderSearchResult(room, 'room', room, isJoined);
    });

    // Filter Users
    const matchedUsers = onlineUsers.filter(u => u.username.toLowerCase().includes(query));
    matchedUsers.forEach(user => {
        const isJoined = joinedChats.find(c => c.id === user.id);
        renderSearchResult(user.id, 'private', user.username, isJoined);
    });

    if (matchedRooms.length === 0 && matchedUsers.length === 0) {
        searchResultsList.innerHTML = '<div class="text-muted" style="padding:10px">No matches found...</div>';
    }
};

function renderSearchResult(id, type, name, isJoined) {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.style.justifyContent = 'space-between';
    div.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px">
            <div class="avatar tiny">${type === 'room' ? '#' : name.charAt(0).toUpperCase()}</div>
            <span>${name}</span>
        </div>
        ${isJoined ? '<span class="text-muted" style="font-size:0.8rem">Joined</span>' : '<button class="btn-ghost" style="padding:5px 10px; font-size:0.8rem">Add</button>'}
    `;
    
    if (!isJoined) {
        div.querySelector('button').onclick = () => {
            joinChat(id, type, name);
            searchInput.value = '';
            searchResultsBox.classList.add('hidden');
        };
    }
    searchResultsList.appendChild(div);
}

function joinChat(id, type, name) {
    if (!joinedChats.find(c => c.id === id)) {
        joinedChats.push({ id, type, name });
    }
    // Remove from archive if joining again
    archivedChatIds = archivedChatIds.filter(cid => cid !== id);
    
    switchChat(id, type, name);
}

// 3. Chat Management Actions
chatOptionsBtn.onclick = (e) => {
    e.stopPropagation();
    chatDropdown.classList.toggle('hidden');
};

document.getElementById('opt-view-info').onclick = () => {
    const chat = joinedChats.find(c => c.id === activeChatId);
    if (!chat) return;
    infoContent.innerHTML = `
        <div style="text-align:center; padding: 10px 0">
            <div class="avatar" style="margin: 0 auto 20px; width: 80px; height: 80px; font-size: 2rem">
                ${chat.type === 'room' ? '#' : chat.name.charAt(0).toUpperCase()}
            </div>
            <h2 style="margin-bottom: 5px">${chat.name}</h2>
            <p class="text-muted">${chat.type === 'room' ? 'Public Channel' : 'Direct Message Session'}</p>
        </div>
        <div style="margin-top: 25px; border-top: 1px solid var(--glass-border); padding-top: 20px; font-size: 0.95rem">
            <div style="display:flex; justify-content:space-between; margin-bottom:12px">
                <span class="text-muted">Unique ID</span>
                <span style="font-family: monospace">${chat.id.substring(0, 12)}...</span>
            </div>
            <div style="display:flex; justify-content:space-between">
                <span class="text-muted">Notifications</span>
                <span>${mutedChatIds.includes(chat.id) ? 'Muted' : 'Enabled'}</span>
            </div>
        </div>
    `;
    infoModal.classList.remove('hidden');
    chatDropdown.classList.add('hidden');
};

document.getElementById('opt-mute-chat').onclick = () => {
    if (mutedChatIds.includes(activeChatId)) {
        mutedChatIds = mutedChatIds.filter(id => id !== activeChatId);
    } else {
        mutedChatIds.push(activeChatId);
    }
    renderSidebar();
    chatDropdown.classList.add('hidden');
};

document.getElementById('opt-archive-chat').onclick = () => {
    if (!archivedChatIds.includes(activeChatId)) {
        archivedChatIds.push(activeChatId);
    }
    activeChatId = null;
    emptyChatState.classList.remove('hidden');
    activeChatContainer.classList.add('hidden');
    renderSidebar();
    chatDropdown.classList.add('hidden');
};

closeInfoBtn.onclick = () => infoModal.classList.add('hidden');

// 4. Archive Toggle
archivedTrigger.onclick = () => {
    archivedListEl.classList.toggle('hidden');
};

// 5. Unified Sidebar Rendering
function renderSidebar() {
    roomListEl.innerHTML = '';
    userListEl.innerHTML = '';
    archivedListEl.innerHTML = '';
    
    let archivedCount = 0;

    joinedChats.forEach(chat => {
        const isArchived = archivedChatIds.includes(chat.id);
        const isMuted = mutedChatIds.includes(chat.id);
        
        const div = document.createElement('div');
        div.className = `list-item ${chat.id === activeChatId ? 'active' : ''} ${isMuted ? 'muted' : ''}`;
        div.innerHTML = `
            <div class="avatar tiny">${chat.type === 'room' ? '#' : chat.name.charAt(0).toUpperCase()}</div>
            <span>${chat.name}</span>
        `;
        div.onclick = () => switchChat(chat.id, chat.type, chat.name);

        if (isArchived) {
            archivedCount++;
            archivedListEl.appendChild(div);
        } else if (chat.type === 'room') {
            roomListEl.appendChild(div);
        } else {
            userListEl.appendChild(div);
        }
    });

    archivedCountEl.textContent = archivedCount;
}

// 6. Chat Switch & Socket
function switchChat(id, type, name) {
    activeChatId = id;
    emptyChatState.classList.add('hidden');
    activeChatContainer.classList.remove('hidden');

    if (type === 'room') {
        socket.emit('joinRoom', id);
        activeChatAvatar.textContent = '#';
    } else {
        activeChatAvatar.textContent = name.charAt(0).toUpperCase();
    }

    activeChatName.textContent = name;
    
    if (type === 'room') {
        activeChatStatus.textContent = 'Public Channel';
    } else {
        const isOnline = onlineUsers.find(u => u.id === id);
        activeChatStatus.innerHTML = isOnline 
            ? '<span class="online-dot"></span> Online' 
            : 'Offline';
    }
    
    renderSidebar();
    
    messageArea.innerHTML = '';
    if (!messagesByChat[id]) messagesByChat[id] = [];
    messagesByChat[id].forEach(msg => appendToUI(msg.data, msg.type));
}

// Socket stuff
socket.on('updateRooms', (rooms) => { 
    availableRooms = rooms; 
    // Initial rooms are available for search
});

socket.on('updateUserList', (users) => { 
    onlineUsers = users.filter(u => u.id !== socket.id); 
});

socket.on('chatMessage', (data) => {
    saveMessage(data.room, { user: data.user, text: data.text, time: data.time }, 'received');
});

socket.on('systemMessage', (text) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (activeChatId) {
        saveMessage(activeChatId, { user: 'System', text, time }, 'system');
    }
});

socket.on('typing', (data) => {
    if (activeChatId === (data.isPrivate ? data.fromId : data.room)) {
        document.getElementById('typing-text').textContent = `${data.user} is typing...`;
        document.getElementById('typing-indicator').classList.remove('hidden');
    }
});

socket.on('stopTyping', () => {
    document.getElementById('typing-indicator').classList.add('hidden');
});

socket.on('privateMessage', (data) => {
    // If not joined, auto-join on receiving PM
    let chat = joinedChats.find(c => c.id === data.fromId);
    if (!chat) {
        chat = { id: data.fromId, type: 'private', name: data.from };
        joinedChats.push(chat);
        renderSidebar();
    }
    saveMessage(data.fromId, { user: data.from, text: data.text, time: data.time }, 'received');
});

function saveMessage(chatId, data, type) {
    if (!messagesByChat[chatId]) messagesByChat[chatId] = [];
    messagesByChat[chatId].push({ data, type });
    if (activeChatId === chatId) {
        appendToUI(data, type);
    }
}

function appendToUI(data, type) {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    if (type === 'system') {
        div.innerHTML = `<span class="message-text">${data.text}</span>`;
    } else {
        div.innerHTML = `
            <span class="message-user">${data.user}</span>
            <span class="message-text">${data.text}</span>
            <span class="message-time">${data.time}</span>
        `;
    }
    messageArea.appendChild(div);
    messageArea.scrollTop = messageArea.scrollHeight;
}

// Basic Form handlers
chatForm.onsubmit = (e) => {
    e.preventDefault();
    const text = msgInput.value.trim();
    if (!text || !activeChatId) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const chat = joinedChats.find(c => c.id === activeChatId);
    
    if (chat.type === 'room') socket.emit('chatMessage', { room: chat.id, text });
    else socket.emit('privateMessage', { to: chat.id, text });

    saveMessage(activeChatId, { user: 'You', text, time }, 'sent');
    msgInput.value = '';
    socket.emit('stopTyping', { target: activeChatId });
};

msgInput.oninput = () => {
    const chat = joinedChats.find(c => c.id === activeChatId);
    if (!chat) return;

    socket.emit('typing', { 
        target: activeChatId, 
        isPrivate: chat.type === 'private' 
    });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stopTyping', { target: activeChatId });
    }, 2000);
};

// Generic click out
document.onclick = () => {
    chatDropdown.classList.add('hidden');
    sidebarDropdown.classList.add('hidden');
};

addMenuBtn.onclick = (e) => { e.stopPropagation(); sidebarDropdown.classList.toggle('hidden'); };
closeModalBtn.onclick = () => roomModal.classList.add('hidden');
document.getElementById('opt-new-channel').onclick = () => {
    roomModal.classList.remove('hidden');
    sidebarDropdown.classList.add('hidden');
};

document.getElementById('create-room-form').onsubmit = (e) => {
    e.preventDefault();
    const roomName = document.getElementById('newRoomName').value.trim();
    if (roomName) {
        socket.emit('createRoom', roomName);
        roomModal.classList.add('hidden');
        document.getElementById('newRoomName').value = '';
        // Auto join the created room
        const formattedName = roomName.startsWith('#') ? roomName : `#${roomName}`;
        joinChat(formattedName, 'room', formattedName);
    }
};