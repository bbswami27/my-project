const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 5e7 // 50MB for HD video, high-res photos, voice notes & files
});

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Health Check Routes for Cloud Deployment
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/ping', (req, res) => res.json({ status: 'live', app: 'ChatterPatter', time: new Date().toISOString() }));

// In-Memory Storage
const activeUsers = new Map(); // socketId -> user profile
const otpStore = new Map();    // phone -> { otp, expiresAt }

// Pre-seeded News Data (Breaking, Tech, India, World, Sports, Business)
const newsArticles = [
  {
    id: 'news-1',
    category: 'Breaking',
    title: 'ISRO Announces Next-Gen Satellite Launch for High-Speed Rural Connectivity',
    summary: 'Indian Space Research Organisation successfully schedules the next heavy-lift rocket mission deploying advanced broadband transponders across nationwide corridors.',
    source: 'Tech & Science Bureau',
    time: '5 mins ago',
    badge: '🚨 BREAKING',
    image: 'https://images.unsplash.com/photo-1517976487588-66d48270570b?auto=format&fit=crop&w=600&q=80',
    likes: 428,
    comments: 63
  },
  {
    id: 'news-2',
    category: 'Tech',
    title: 'Next-Generation AI Chat Engines Integrate On-Device Privacy & Realtime Audio',
    summary: 'New quantum neural architectures enable instant voice transcription and localized encryption right on smartphones without cloud latency.',
    source: 'FutureTech Daily',
    time: '22 mins ago',
    badge: '⚡ TECH INNOVATION',
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
    likes: 892,
    comments: 114
  },
  {
    id: 'news-3',
    category: 'India',
    title: 'UPI Daily Transactions Cross New Global Record of 500 Million Payments',
    summary: 'Digital payment infrastructure continues astronomical surge as cross-border UPI integration expands to multiple European and Southeast Asian nations.',
    source: 'National Economic Desk',
    time: '45 mins ago',
    badge: '🇮🇳 INDIA GROWTH',
    image: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=600&q=80',
    likes: 1250,
    comments: 230
  },
  {
    id: 'news-4',
    category: 'Business',
    title: 'Global Renewable Energy Investments Surge 35% in Q3 Milestone',
    summary: 'Solar and wind farm deployments accelerate as battery storage costs drop significantly, powering clean energy transitions worldwide.',
    source: 'Global Energy Pulse',
    time: '1 hour ago',
    badge: '📈 MARKET TREND',
    image: 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?auto=format&fit=crop&w=600&q=80',
    likes: 310,
    comments: 42
  },
  {
    id: 'news-5',
    category: 'Sports',
    title: 'Thrilling T20 Championship Finale: Dramatic Super-Over Decider',
    summary: 'Spectacular last-ball six seals an unforgettable victory in front of a roaring crowd of 90,000 spectators.',
    source: 'Sporting World',
    time: '2 hours ago',
    badge: '🏏 SPORTS UPDATE',
    image: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=600&q=80',
    likes: 2190,
    comments: 480
  },
  {
    id: 'news-6',
    category: 'Entertainment',
    title: 'Groundbreaking Sci-Fi Visual Effects Masterpiece Premieres Globally',
    summary: 'Critics praise revolutionary holographic cinematic storytelling as early box office estimates shatter opening weekend records.',
    source: 'CineWorld Insider',
    time: '3 hours ago',
    badge: '🎬 ENTERTAINMENT',
    image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80',
    likes: 670,
    comments: 95
  }
];

// Breaking Flash News Ticker headlines
const flashNewsList = [
  '🚨 BREAKING: ISRO gears up for high-speed satellite connectivity launch nationwide',
  '⚡ TECH: New on-device AI voice features arrive with ultra-fast latency',
  '📈 ECONOMY: UPI digital transactions achieve historic milestone worldwide',
  '🏏 SPORTS: Incredible Super-Over victory clinches International T20 Championship trophy',
  '☀️ CLIMATE: Solar energy grid efficiency surpasses expectations with new storage battery tech'
];

// Database Engine
const db = require('./database');

// API Routes
app.get('/api/news', (req, res) => {
  const category = req.query.category;
  if (category && category !== 'All') {
    return res.json(newsArticles.filter(a => a.category.toLowerCase() === category.toLowerCase()));
  }
  res.json(newsArticles);
});

app.get('/api/news/flash', (req, res) => {
  res.json({
    ticker: flashNewsList,
    updatedAt: new Date().toISOString()
  });
});

// Users Sync API
app.get('/api/users', (req, res) => {
  const requestingUserId = req.query.userId || null;
  res.json(db.getAllUsers(requestingUserId));
});

// User Privacy Settings API
app.post('/api/user/privacy', (req, res) => {
  const { userId, privacy } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });
  const updated = db.updatePrivacy(userId, privacy);
  io.emit('user_privacy_updated', { userId, privacy: updated });
  res.json({ success: true, privacy: updated });
});

// Phonebook Contacts Sync API
app.post('/api/contacts/sync', (req, res) => {
  const { phoneNumbers = [] } = req.body;
  const cleanNumbers = phoneNumbers.map(p => p.replace(/\D/g, '').slice(-10));
  const allUsers = db.getAllUsers();
  const matchedUsers = allUsers.filter(u => {
    const userClean = (u.phone || '').replace(/\D/g, '').slice(-10);
    return userClean && cleanNumbers.includes(userClean);
  });
  res.json({ success: true, matchedUsers });
});

// Linked Devices API (Multi-Device QR & Web Connect)
app.get('/api/devices/:userId', (req, res) => {
  const devices = db.getLinkedDevices(req.params.userId);
  res.json({ success: true, devices });
});

app.post('/api/devices/link', (req, res) => {
  const { userId, device } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });
  const newDev = db.addLinkedDevice(userId, device || {});
  io.emit(`device_linked_${userId}`, newDev);
  res.json({ success: true, device: newDev });
});

app.delete('/api/devices/:userId/:deviceId', (req, res) => {
  const { userId, deviceId } = req.params;
  const removed = db.removeLinkedDevice(userId, deviceId);
  res.json({ success: removed });
});

// Messages History API
app.get('/api/messages/:chatId', (req, res) => {
  const messages = db.getChatMessages(req.params.chatId);
  res.json(messages);
});

// Save Message API
app.post('/api/messages', (req, res) => {
  const savedMsg = db.saveMessage(req.body);
  if (req.body.chatId) {
    io.emit(`receive_message_${req.body.chatId}`, savedMsg);
  }
  io.emit('receive_message', savedMsg);
  res.json({ success: true, message: savedMsg });
});

// Edit Message API
app.put('/api/messages/:id', (req, res) => {
  const { text } = req.body;
  const updated = db.editMessage(req.params.id, text);
  if (updated) {
    io.emit('message_edited', updated);
    return res.json({ success: true, message: updated });
  }
  res.status(404).json({ error: 'Message not found' });
});

// Delete Message API
app.delete('/api/messages/:id', (req, res) => {
  const isForEveryone = req.query.everyone !== 'false';
  const deleted = db.deleteMessage(req.params.id, isForEveryone);
  if (deleted) {
    io.emit('message_deleted', { id: req.params.id, isForEveryone });
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Message not found' });
});

// Delete Entire Chat API
app.delete('/api/chats/:chatId', (req, res) => {
  const deleted = db.deleteChat(req.params.chatId);
  io.emit('chat_deleted', { chatId: req.params.chatId });
  res.json({ success: true });
});

// Groups List & Create API
app.get('/api/groups', (req, res) => {
  res.json(db.getAllGroups());
});

app.post('/api/groups', (req, res) => {
  const group = db.createGroup(req.body);
  io.emit('new_group_created', group);
  res.json({ success: true, group });
});

// Status Updates API
app.get('/api/status', (req, res) => {
  res.json(db.getActiveStatusUpdates());
});

app.post('/api/status', (req, res) => {
  const status = db.saveStatusUpdate(req.body);
  io.emit('new_status_update', status);
  res.json({ success: true, status });
});

// WebRTC ICE Servers (STUN + Open TURN servers for reliable mobile video calls)
app.get('/api/webrtc/ice-servers', (req, res) => {
  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.relay.metered.ca:80' },
      {
        urls: 'turn:standard.relay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:standard.relay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  });
});

// Mobile OTP generation
app.post('/api/auth/send-otp', (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 mins
  });

  console.log(`[AUTH] Generated OTP for ${phone}: ${otp}`);

  // Return OTP in dev mode for easy test login!
  res.json({
    success: true,
    message: `OTP sent to ${phone}`,
    devOtp: otp, // Passed for instant auto-fill & testing
    expiresIn: 300
  });
});

// Verify OTP & Register
app.post('/api/auth/verify-otp', (req, res) => {
  const { phone, otp, displayName, username, avatar, bio } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone and OTP are required' });
  }

  const record = otpStore.get(phone);
  // Allow test OTP '123456' or generated OTP
  if (otp === '123456' || (record && record.otp === otp)) {
    otpStore.delete(phone);
    const user = {
      id: 'user_' + phone.replace(/[^0-9]/g, ''),
      name: displayName || `User ${phone.slice(-4)}`,
      username: username || ('@' + (displayName ? displayName.toLowerCase().replace(/\s+/g, '_') : 'user_' + phone.slice(-4))),
      phone: phone,
      avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${phone}`,
      bio: bio || 'Hey there! I am using ChatterPatter 🚀',
      status: 'Hey there! I am using ChatterPatter 🚀',
      presence: 'online',
      createdAt: new Date().toISOString()
    };
    const saved = db.saveUser(user);
    io.emit('user_registered', saved);
    return res.json({ success: true, user: saved });
  }

  return res.status(400).json({ error: 'Invalid or expired OTP. Please try 123456 for testing.' });
});

// Intelligent Multi-Lingual AI Engine
function generateSmartAiResponse(prompt = '', userName = 'Friend') {
  const query = prompt.trim().toLowerCase();
  
  // Math calculations
  const mathMatch = prompt.match(/^[\d\s\+\-\*\/\(\)\.\^\%]+$/);
  if (mathMatch && prompt.match(/[\+\-\*\/]/)) {
    try {
      const sanitized = prompt.replace(/[^-()\d/*+.]/g, '');
      const result = Function(`'use strict'; return (${sanitized})`)();
      return `🧮 **Calculation Result:**\n\`${prompt.trim()}\` = **${result}**`;
    } catch(e) {}
  }

  // Greetings
  if (/^(hi|hello|hey|namaste|kem cho|pranam|salam|hola|good morning|good evening|good afternoon|kaise ho)/i.test(query)) {
    return `Namaste ${userName}! 🙏✨\n\nMain aapka **Smart AI Assistant** hoon. Main aapke kisi bhi sawaal ka jawaab de sakta hoon, jaise:\n\n• 💡 **Sawaal-Jawaab & General Knowledge**\n• ✍️ **Emails, Applications & Letters likhna**\n• 💻 **Programming & Coding Help** (JS, Python, HTML, etc.)\n• 🌐 **Language Translation (Hindi/English)**\n• 📞 **Audio/Video Calling & Screen Sharing Help**\n• 🎭 **Jokes, Shayari & Stories**\n\nAap mujhse abhi kya poochna chahte hain?`;
  }

  // Who are you / Features
  if (/who are you|koun ho|kaun ho|apna intro|about you|kya kar sakte ho|features|help/i.test(query)) {
    return `🤖 **Main ChatterPatter / GitPit Smart AI Assistant hoon!**\n\nMujhe aapki har tarah ki help ke liye banaya gaya hai:\n\n1. **Smart Q&A:** Science, Tech, Cricket, Geography, GK ke sawaal.\n2. **Productivity:** Leave application, formal email, speech, notes likhna.\n3. **Programming:** Code likhna, debugging aur explanation.\n4. **App Features:** Video calling, screen sharing, voice notes, news ticker.\n\nAap Hindi, English ya Hinglish me mujhse kuch bhi pooch sakte hain! 🚀`;
  }

  // Leave application / Email writing
  if (/leave application|chhutti|resignation|formal email|write an email|letter to/i.test(query)) {
    return `📝 **Professional Draft (Aapke liye):**\n\n**Subject:** Application for Leave / Urgent Work\n\nRespected Sir/Madam,\n\nI am writing to formally request leave of absence from [Start Date] to [End Date] due to [urgent personal work / health reason]. I will ensure that all my pending tasks are coordinated and I remain reachable via email for urgent matters.\n\nKindly grant me leave for the specified duration.\n\nThanking you,\nYours sincerely,\n**${userName}**`;
  }

  // Jokes / Shayari / Fun
  if (/joke|chutkula|hasao|shayari|funny|comedy|kavita/i.test(query)) {
    const jokes = [
      `😂 **Chutkula:**\n\nTeacher: "Batao, sabse zyada bijli kahan banti hai?"\nStudent: "Sir, hamare padosi ke ghar me!"\nTeacher: "Kaise?"\nStudent: "Kyunki wahan din-raat 'shanti' naam ki ladki chalti hai aur sab kehte hain 'Shanti me bahut power hai!' 🤣⚡`,
      `✨ **Shayari:**\n\n*Manzil unhi ko milti hai, jinke sapno me jaan hoti hai...*\n*Pankho se kuch nahi hota, hauslo se udaan hoti hai!* 🦅🔥`,
      `😄 **Tech Joke:**\n\nWhy do programmers prefer dark mode?\nBecause light attracts bugs! 🐛💻`
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  // Video calling & screen sharing help
  if (/video call|screen share|screen sharing|audio call|calling|share screen/i.test(query)) {
    return `📹 **Video Calling & Screen Sharing Guide:**\n\n• **Video Call:** Chat header me bane **📹 Video Icon** par tap karein.\n• **Screen Share:** Call ke dauran neeche control bar me **🖥️ Screen Share** button dabayein aur window choose karein!\n• **Mic/Camera:** Call ke waqt aap **🎤 Mic** aur **📹 Camera** aasani se toggle kar sakte hain.`;
  }

  // News query
  if (/news|breaking news|samachar|aaj ki khabar/i.test(query)) {
    return `📰 **Breaking News Highlights:**\n\n1. 🚀 **Tech & Space:** Next-gen satellites launched for high-speed connectivity.\n2. ⚡ **AI Innovation:** On-device neural engines empower instant voice & chat intelligence.\n3. 🏏 **Sports:** High-voltage final match decided in nail-biting finish.\n\n*(Aap top ticker bar ya News tab me poori khabar padh sakte hain!)*`;
  }

  // Coding / Programming
  if (/code|javascript|python|html|css|react|function|api|sql|database/i.test(query)) {
    return `💻 **Coding Assistant:**\n\nYeh raha ek clean example:\n\`\`\`javascript\n// Real-time Chat & AI Assistant Helper\nasync function askAiAssistant(question) {\n  const response = await fetch('/api/ai/chat', {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify({ prompt: question })\n  });\n  const data = await response.json();\n  return data.reply;\n}\n\`\`\`\nAap kisi bhi specific language (Python, Java, C++, JS, SQL) me sawal pooch sakte hain!`;
  }

  // Recipe / Food
  if (/chai|tea|recipe|khana|maggi|cooking|coffee/i.test(query)) {
    return `☕ **Special Masala Chai Recipe:**\n\n1. **Ingredients:** 1 cup paani, 1 cup doodh, 2 tsp chai patti, 1.5 tsp cheeni, adrak (ginger), aur 1 elaichi (cardamom).\n2. **Process:** Paani me crushed adrak aur elaichi daal kar 2 minute ubalein. Phir chai patti aur doodh mila kar ache se boil karein.\n3. **Serve:** Chaani se chaan kar garma-garam biscuit ke sath enjoy karein! 🫖✨`;
  }

  // Default intelligent contextual reply
  return `🤖 **Smart AI Response:**\n\nAapke sawaal *"**${prompt}**"* ke sandarbh me:\n\n• Yeh ek bahut mahatvapoorna topic hai. Main ispar aapko poori jankari provide kar sakta hoon.\n• Agar aapko ispar koi specific example, step-by-step guide, translation ya code chahiye, toh kripya batayein!\n\n💡 *Tip: Aap mujhse math calculation, email drafts, coding, ya jokes bhi pooch sakte hain!*`;
}

// REST API for AI Assistant
app.post('/api/ai/chat', (req, res) => {
  const { prompt, userName } = req.body || {};
  const reply = generateSmartAiResponse(prompt, userName);
  res.json({ success: true, reply, timestamp: new Date().toISOString() });
});

// Socket.io Real-time Event Handlers
io.on('connection', (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id}`);

  // User Join / Register
  socket.on('user_join', (userData) => {
    const saved = db.saveUser(userData);
    activeUsers.set(socket.id, {
      ...saved,
      socketId: socket.id,
      online: true,
      lastSeen: new Date().toISOString()
    });

    // Broadcast updated online list
    io.emit('online_users', Array.from(activeUsers.values()));
    console.log(`[USER ONLINE] ${userData.name} (${socket.id})`);
  });

  // Direct / Group Message
  socket.on('send_message', (msgData) => {
    // Persist to database
    const enrichedMsg = db.saveMessage(msgData);

    // Broadcast to room or everyone
    if (msgData.chatId) {
      io.emit(`receive_message_${msgData.chatId}`, enrichedMsg);
    }
    io.emit('receive_message', enrichedMsg);

    // AI / Smart Assistant Auto-reply
    if (msgData.recipientId === 'ai_assistant' || msgData.isAiChat || msgData.chatId === 'chat_ai') {
      io.emit(`typing_${msgData.chatId}`, { userId: 'ai_assistant', isTyping: true });

      setTimeout(() => {
        io.emit(`typing_${msgData.chatId}`, { userId: 'ai_assistant', isTyping: false });
        
        const aiAnswer = generateSmartAiResponse(msgData.text, msgData.senderName);
        const replyMsg = {
          id: 'msg_ai_' + Date.now(),
          chatId: msgData.chatId,
          senderId: 'ai_assistant',
          senderName: 'ChatterPatter AI 🤖',
          senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ChatterAI',
          text: aiAnswer,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: new Date().toISOString(),
          status: 'read'
        };
        io.emit(`receive_message_${msgData.chatId}`, replyMsg);
        io.emit('receive_message', replyMsg);
      }, 700);
    }
  });

  // Typing status
  socket.on('typing', (data) => {
    socket.broadcast.emit(`typing_${data.chatId}`, data);
  });

  // Message Reaction
  socket.on('message_reaction', (data) => {
    io.emit('reaction_update', data);
  });

  // Message Read Receipts
  socket.on('message_read', (data) => {
    io.emit('read_receipt', data);
  });

  // Edit Message
  socket.on('edit_message', (data) => {
    const updated = db.editMessage(data.id, data.text);
    if (updated) {
      io.emit('message_edited', updated);
    }
  });

  // Delete Message
  socket.on('delete_message', (data) => {
    const deleted = db.deleteMessage(data.id, data.isForEveryone);
    if (deleted) {
      io.emit('message_deleted', { id: data.id, chatId: data.chatId, isForEveryone: data.isForEveryone });
    }
  });

  // Delete Chat
  socket.on('delete_chat', (data) => {
    db.deleteChat(data.chatId);
    io.emit('chat_deleted', { chatId: data.chatId });
  });

  // WebRTC / Call Signaling
  socket.on('call_user', (callData) => {
    console.log(`[CALL] ${callData.callerName} is calling ${callData.recipientId} (${callData.callType})`);
    socket.broadcast.emit('incoming_call', callData);
  });

  socket.on('webrtc_signal', (data) => {
    socket.broadcast.emit('webrtc_signal', data);
  });

  socket.on('accept_call', (data) => {
    io.emit('call_accepted', data);
  });

  socket.on('reject_call', (data) => {
    io.emit('call_rejected', data);
  });

  socket.on('end_call', (data) => {
    io.emit('call_ended', data);
  });

  // Disconnect
  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    io.emit('online_users', Array.from(activeUsers.values()));
    console.log(`[SOCKET] Disconnected: ${socket.id}`);
  });
});

// Periodic Flash News Broadcaster (simulating live breaking news pulse)
let newsIndex = 0;
setInterval(() => {
  const dynamicNews = {
    title: flashNewsList[newsIndex % flashNewsList.length],
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    id: 'flash_' + Date.now()
  };
  newsIndex++;
  io.emit('flash_news_update', dynamicNews);
}, 25000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 ChatterPatter Server is running on port ${PORT}`);
  console.log(`📱 Real-time Chat • Voice Notes • Video Calls • Flash News`);
  console.log(`=======================================================`);
});
