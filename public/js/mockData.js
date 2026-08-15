// ChatterPatter - Initial App Config (Zero Fake Mock Users - Only Official ChatterPatter AI)

window.MOCK_DATA = {
  demoUsers: [],

  initialChats: [
    {
      id: 'chat_ai',
      name: 'ChatterPatter AI 🤖',
      username: '@ai_assistant',
      phone: '+91 80000 00000',
      email: 'ai@chatterpatter.app',
      isGroup: false,
      isAi: true,
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ChatterAI',
      unreadCount: 1,
      pinned: true,
      online: true,
      messages: [
        {
          id: 'm_welcome',
          senderId: 'ai_assistant',
          senderName: 'ChatterPatter AI 🤖',
          senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ChatterAI',
          text: 'Namaste! 🙏 Main aapka Smart AI Assistant hoon.\n\nMujhse koi bhi sawaal poochein, emails ya leave application likhwayein, coding help lein ya chutkula sunein! ✨',
          timestamp: '10:00 AM',
          createdAt: Date.now(),
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
      title: 'Welcome to ChatterPatter Live 🚀',
      date: 'Today',
      time: '04:00 PM',
      duration: '30 mins',
      host: 'ChatterPatter Team',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Team',
      status: 'Ready'
    }
  ],

  initialEmailMemos: [
    {
      id: 'memo_welcome',
      subject: 'Welcome to ChatterPatter 🚀',
      sender: 'ChatterPatter Support',
      senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Support',
      time: 'Just now',
      priority: 'normal',
      body: 'Welcome to ChatterPatter! You can chat in real time, conduct HD video calls with screen sharing, ask our AI assistant anything, jump to chat dates with our calendar tool, and link all your mobile and web devices.'
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
