window.MOCK_DATA = {
  demoUsers: [
    {
      id: 'user_9811122334',
      name: 'Aarav Sharma',
      username: '@aarav',
      phone: '+91 98111 22334',
      email: 'aarav@gitpit.io',
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aarav',
      bio: 'Product Architect & Lead 💻 • GitPit Team',
      online: true,
      phoneVerified: true
    },
    {
      id: 'user_9822233445',
      name: 'Priya Patel',
      username: '@priya',
      phone: '+91 98222 33445',
      email: 'priya@gitpit.io',
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Priya',
      bio: 'UI/UX Designer ✨ • Coffee & Code',
      online: true,
      phoneVerified: true
    },
    {
      id: 'user_9833344556',
      name: 'Rohan Verma',
      username: '@rohan',
      phone: '+91 98333 44556',
      email: 'rohan@gitpit.io',
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Rohan',
      bio: 'Mobile & Realtime Engineer 📱 • Ready for calls',
      online: true,
      phoneVerified: true
    },
    {
      id: 'user_9844455667',
      name: 'Ananya Gupta',
      username: '@ananya',
      phone: '+91 98444 55667',
      email: 'ananya@gitpit.io',
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Ananya',
      bio: 'Cloud Architect & WebRTC ☁️ • Active on GitPit',
      online: true,
      phoneVerified: true
    }
  ],

  initialChats: [
    {
      id: 'chat_ai',
      name: 'GitPit AI 🤖',
      username: '@ai_assistant',
      phone: '+91 80000 00000',
      email: 'ai@chatterpatter.app',
      isGroup: false,
      isAi: true,
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=GitPitAI',
      unreadCount: 1,
      pinned: true,
      online: true,
      messages: [
        {
          id: 'm_welcome',
          senderId: 'ai_assistant',
          senderName: 'GitPit AI Assistant 🤖',
          senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=GitPitAI',
          text: 'Hello! 👋 I am your GitPit AI Assistant.\n\nFeel free to ask me anything, draft emails, get coding assistance, video conference tips, or everyday guidance! ✨',
          timestamp: '10:00 AM',
          createdAt: Date.now() - 3600000,
          status: 'read'
        }
      ]
    },
    {
      id: 'user_9811122334',
      name: 'Aarav Sharma',
      username: '@aarav',
      phone: '+91 98111 22334',
      email: 'aarav@gitpit.io',
      isGroup: false,
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aarav',
      unreadCount: 1,
      pinned: false,
      online: true,
      bio: 'Product Architect & Lead 💻',
      messages: [
        {
          id: 'm_aarav_1',
          senderId: 'user_9811122334',
          senderName: 'Aarav Sharma',
          senderAvatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aarav',
          text: 'Hey! The new GitPit WebRTC calling and WebSocket messaging are working great! 🚀 Ready for a test call?',
          timestamp: '10:15 AM',
          createdAt: Date.now() - 1800000,
          status: 'delivered'
        }
      ]
    },
    {
      id: 'user_9822233445',
      name: 'Priya Patel',
      username: '@priya',
      phone: '+91 98222 33445',
      email: 'priya@gitpit.io',
      isGroup: false,
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Priya',
      unreadCount: 0,
      pinned: false,
      online: true,
      bio: 'UI/UX Designer ✨',
      messages: [
        {
          id: 'm_priya_1',
          senderId: 'user_9822233445',
          senderName: 'Priya Patel',
          senderAvatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Priya',
          text: 'Hi! Just reviewed the new dark mode theme & call animations. Looks super clean! ✨',
          timestamp: '09:45 AM',
          createdAt: Date.now() - 3600000,
          status: 'read'
        }
      ]
    },
    {
      id: 'user_9833344556',
      name: 'Rohan Verma',
      username: '@rohan',
      phone: '+91 98333 44556',
      email: 'rohan@gitpit.io',
      isGroup: false,
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Rohan',
      unreadCount: 0,
      pinned: false,
      online: true,
      bio: 'Mobile Engineer 📱',
      messages: [
        {
          id: 'm_rohan_1',
          senderId: 'user_9833344556',
          senderName: 'Rohan Verma',
          senderAvatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Rohan',
          text: 'Camera flip and screen sharing are tested on mobile! Tap the video call icon whenever you want to test. 📹',
          timestamp: 'Yesterday',
          createdAt: Date.now() - 86400000,
          status: 'read'
        }
      ]
    },
    {
      id: 'user_9844455667',
      name: 'Ananya Gupta',
      username: '@ananya',
      phone: '+91 98444 55667',
      email: 'ananya@gitpit.io',
      isGroup: false,
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Ananya',
      unreadCount: 0,
      pinned: false,
      online: true,
      bio: 'Cloud Architect ☁️',
      messages: [
        {
          id: 'm_ananya_1',
          senderId: 'user_9844455667',
          senderName: 'Ananya Gupta',
          senderAvatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Ananya',
          text: 'All PostgreSQL tables, message persistence, and Render servers are 100% operational! 🟢',
          timestamp: 'Yesterday',
          createdAt: Date.now() - 90000000,
          status: 'read'
        }
      ]
    }
  ],

  initialStories: [],
  initialCalls: [],

  initialMeetings: [
    {
      id: 'meet_welcome',
      title: 'Welcome to GitPit Live 🚀',
      date: 'Today',
      time: '04:00 PM',
      duration: '30 mins',
      host: 'GitPit Team',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Team',
      status: 'Ready'
    }
  ],

  initialEmailMemos: [
    {
      id: 'memo_welcome',
      subject: 'Welcome to GitPit 🚀',
      sender: 'GitPit Support',
      senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Support',
      time: 'Just now',
      priority: 'normal',
      body: 'Welcome to GitPit! You can chat in real time, conduct HD video calls with screen sharing, ask our AI assistant anything, jump to chat dates with our calendar tool, and link all your mobile and web devices.'
    }
  ],

  initialNewsArticles: [
    {
      id: 'news-1',
      category: 'Tech',
      title: '🚀 Next-Gen Satellite Internet Constellation Successfully Deployed',
      summary: 'Advanced broadband satellites reach low Earth orbit to deliver gigabit connectivity and high-speed data transmission across rural and urban territories.',
      source: 'Space & Tech Chronicle',
      time: '10 mins ago',
      badge: '🚀 BREAKING',
      image: 'https://images.unsplash.com/photo-1517976487502-570a2d98a002?auto=format&fit=crop&w=600&q=80',
      likes: 540,
      comments: 62
    },
    {
      id: 'news-2',
      category: 'India',
      title: '🇮🇳 UPI Crosses 500 Million Daily Transactions Milestone Globally',
      summary: 'India\'s digital public infrastructure sets a new world record as real-time QR payments expand across Europe, Middle East, and Southeast Asia.',
      source: 'National Financial Pulse',
      time: '25 mins ago',
      badge: '🇮🇳 INDIA GROWTH',
      image: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=600&q=80',
      likes: 1250,
      comments: 230
    },
    {
      id: 'news-3',
      category: 'Tech',
      title: '⚡ On-Device AI Neural Engines Bring Instant Voice & Translation',
      summary: 'New mobile chips process conversational intelligence and natural language translation locally on device with zero latency and complete privacy.',
      source: 'FutureTech Daily',
      time: '40 mins ago',
      badge: '⚡ TECH AI',
      image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
      likes: 890,
      comments: 115
    },
    {
      id: 'news-4',
      category: 'Sports',
      title: '🏏 Spectacular T20 Championship Thriller Decided in Super-Over',
      summary: 'Sensational final-ball heroics secure dramatic victory in front of 90,000 electric fans in a historic stadium atmosphere.',
      source: 'Sporting World',
      time: '1 hour ago',
      badge: '🏏 SPORTS UPDATE',
      image: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=600&q=80',
      likes: 2190,
      comments: 480
    },
    {
      id: 'news-5',
      category: 'Business',
      title: '📈 Clean Energy Investments Surge by 35% in Landmark Quarter',
      summary: 'Massive solar and green hydrogen installations accelerate as battery storage costs drop significantly across major emerging markets.',
      source: 'Global Energy Pulse',
      time: '2 hours ago',
      badge: '📈 BUSINESS',
      image: 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?auto=format&fit=crop&w=600&q=80',
      likes: 420,
      comments: 55
    }
  ]
};
