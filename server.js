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
  }
});

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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
  res.json(db.getAllUsers());
});

// Messages History API
app.get('/api/messages/:chatId', (req, res) => {
  const messages = db.getChatMessages(req.params.chatId);
  res.json(messages);
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

// Verify OTP
app.post('/api/auth/verify-otp', (req, res) => {
  const { phone, otp, displayName } = req.body;
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
      phone: phone,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${phone}`,
      status: 'Hey there! I am using GitPit 🚀',
      presence: 'online',
      createdAt: new Date().toISOString()
    };
    db.saveUser(user);
    return res.json({ success: true, user });
  }

  return res.status(400).json({ error: 'Invalid or expired OTP. Please try 123456 for testing.' });
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

    // AI / Simulated Contact Auto-reply if chatting with AI or automated contact
    if (msgData.recipientId === 'ai_assistant' || msgData.isAiChat) {
      setTimeout(() => {
        const aiReplies = [
          `Hi! I received: "${msgData.text}". How can I help you further on ChatterPatter? 🌟`,
          `That's great! ChatterPatter lets you share photos, voice notes, make video calls, and catch live news! 🚀`,
          `Got your message! Let me know if you need any assistance with ChatterPatter features. 👍`,
          `Interesting thought! Did you check out today's breaking news flash on the top ticker? 📰`,
          `Awesome! You can also try sending voice notes or testing a video call right here! 🎙️📞`
        ];
        const randomReply = aiReplies[Math.floor(Math.random() * aiReplies.length)];

        io.emit(`typing_${msgData.chatId}`, { userId: 'ai_assistant', isTyping: true });

        setTimeout(() => {
          io.emit(`typing_${msgData.chatId}`, { userId: 'ai_assistant', isTyping: false });
          const replyMsg = {
            id: 'msg_ai_' + Date.now(),
            chatId: msgData.chatId,
            senderId: 'ai_assistant',
            senderName: 'ChatterPatter AI',
            senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ChatterAI',
            text: randomReply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            date: new Date().toISOString(),
            status: 'read'
          };
          io.emit(`receive_message_${msgData.chatId}`, replyMsg);
          io.emit('receive_message', replyMsg);
        }, 1200);
      }, 600);
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

  // WebRTC / Call Signaling
  socket.on('call_user', (callData) => {
    console.log(`[CALL] ${callData.callerName} is calling ${callData.recipientId} (${callData.callType})`);
    socket.broadcast.emit('incoming_call', callData);
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

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 ChatterPatter Server is running on http://localhost:${PORT}`);
  console.log(`📱 Real-time Chat • Voice Notes • Video Calls • Flash News`);
  console.log(`=======================================================`);
});
