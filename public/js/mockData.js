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
  ]
};
