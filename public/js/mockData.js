// GitPit - Pre-seeded Contacts, Chats, Stories, Calls, Meetings, Email Memos & UPI Txns

window.MOCK_DATA = {
  demoUsers: [
    {
      id: 'user_alex',
      name: 'Alex Johnson',
      username: '@alex_j',
      phone: '+91 98765 43210',
      email: 'alex@gitpit.app',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      status: 'Building the future on GitPit 🚀',
      bio: 'Tech enthusiast, coffee lover & full-stack architect 💻☕',
      dob: '1996-08-15',
      anniversary: '2023-11-20',
      customDate: '2021-04-10'
    },
    {
      id: 'user_priya',
      name: 'Priya Patel',
      username: '@priya_patel',
      phone: '+91 98123 45678',
      email: 'priya@gitpit.app',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
      status: 'Living in the moment ✨',
      bio: 'UI/UX Designer | Nature Lover | Music 🎵',
      dob: '1998-05-12',
      anniversary: '2024-02-14',
      customDate: '2022-09-01'
    },
    {
      id: 'user_rahul',
      name: 'Rahul Sharma',
      username: '@rahul_dev',
      phone: '+91 98234 56789',
      email: 'rahul@gitpit.app',
      avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80',
      status: 'Available for chats & coffee ☕',
      bio: 'Mobile App Developer | Cricket Fan 🏏',
      dob: '1995-10-24',
      anniversary: '2022-12-08',
      customDate: '2020-01-15'
    },
    {
      id: 'user_sarah',
      name: 'Sarah Miller',
      username: '@sarah_m',
      phone: '+1 415 555 0199',
      email: 'sarah@gitpit.app',
      avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=150&q=80',
      status: 'Design • Tech • Innovation 🎨',
      bio: 'Product Designer at Silicon Valley 🚀',
      dob: '1997-03-18',
      anniversary: '2023-06-25',
      customDate: '2021-11-11'
    }
  ],

  initialChats: [
    {
      id: 'chat_ai',
      name: 'GitPit AI Assistant 🤖',
      username: '@gitpit_ai',
      phone: '+91 80000 00000',
      email: 'ai@gitpit.app',
      isGroup: false,
      isAi: true,
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=GitPitAI',
      unreadCount: 1,
      pinned: true,
      online: true,
      messages: [
        {
          id: 'm1',
          senderId: 'ai_assistant',
          senderName: 'GitPit AI',
          text: 'Namaste & Welcome to GitPit! 🚀\n\nAap yahan multi-language search (Phone/Email/Username), account profile details (DOB, Anniversary, Bio), meetings, memos aur UPI payments enjoy kar sakte hain. Mujhse kuch bhi poochiye!',
          timestamp: '10:00 AM',
          status: 'read'
        }
      ]
    },
    {
      id: 'chat_priya',
      name: 'Priya Patel',
      username: '@priya_patel',
      phone: '+91 98123 45678',
      email: 'priya@gitpit.app',
      isGroup: false,
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
      unreadCount: 2,
      pinned: true,
      online: true,
      messages: [
        {
          id: 'm2',
          senderId: 'user_priya',
          senderName: 'Priya Patel',
          text: 'Hey! Did you check out the new GitPit Indian languages setting and profile details? It is so easy to use! 😍',
          timestamp: '10:30 AM',
          status: 'read'
        },
        {
          id: 'm3',
          senderId: 'user_priya',
          senderName: 'Priya Patel',
          text: 'Also scheduled our design sprint meeting for tomorrow. See you there! 📅',
          timestamp: '10:32 AM',
          status: 'delivered'
        }
      ]
    },
    {
      id: 'chat_rahul',
      name: 'Rahul Sharma',
      username: '@rahul_dev',
      phone: '+91 98234 56789',
      email: 'rahul@gitpit.app',
      isGroup: false,
      avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80',
      unreadCount: 0,
      pinned: false,
      online: false,
      lastSeen: 'Today at 09:45 AM',
      messages: [
        {
          id: 'm4',
          senderId: 'me',
          text: 'Hey Rahul, I have sent the project advance via GitPit UPI.',
          timestamp: '09:20 AM',
          status: 'read'
        },
        {
          id: 'm5',
          senderId: 'user_rahul',
          senderName: 'Rahul',
          text: 'Received ₹1,500 successfully! Thank you. 👍',
          timestamp: '09:42 AM',
          status: 'read'
        }
      ]
    },
    {
      id: 'chat_group_tech',
      name: 'Tech Innovators India 💡',
      username: '@tech_india_group',
      phone: '+91 90000 11111',
      email: 'techgroup@gitpit.app',
      isGroup: true,
      avatar: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=150&q=80',
      unreadCount: 3,
      pinned: false,
      members: ['You', 'Priya', 'Rahul', 'Sarah', 'Amit', 'Neha'],
      messages: [
        {
          id: 'm6',
          senderId: 'user_sarah',
          senderName: 'Sarah Miller',
          text: 'Breaking news: ISRO and UPI updates are trending on all channels today!',
          timestamp: '08:15 AM',
          status: 'read'
        }
      ]
    }
  ],

  initialStories: [
    {
      id: 'story_priya',
      authorId: 'user_priya',
      authorName: 'Priya Patel',
      authorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
      time: '35 mins ago',
      viewed: false,
      items: [
        {
          type: 'image',
          mediaUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80',
          caption: 'Hackathon vibes! Building the future with GitPit team 💻✨'
        }
      ]
    }
  ],

  initialCalls: [
    {
      id: 'call_1',
      name: 'Priya Patel',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
      type: 'video',
      direction: 'incoming',
      time: 'Today, 11:15 AM',
      duration: '4m 12s'
    }
  ],

  initialMeetings: [
    {
      id: 'meet_1',
      title: 'Product Strategy & Roadmap Sync 🚀',
      date: 'Today, 15 Aug',
      time: '04:30 PM',
      duration: '45 mins',
      host: 'Priya Patel',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
      status: 'Upcoming'
    }
  ],

  initialEmailMemos: [
    {
      id: 'memo_1',
      subject: 'Urgent: Release Deployment Checkpoint 🚨',
      sender: 'Alex Johnson (Lead)',
      senderAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      time: '10 mins ago',
      priority: 'urgent',
      body: 'All team members please review the latest Play Store build release notes and verify video calling & UPI transaction flows before final rollout.'
    }
  ],

  initialUpiTransactions: [
    {
      id: 'txn_1',
      type: 'sent',
      amount: 1500,
      title: 'Sent to Rahul Sharma',
      vpa: 'rahul@gitpitupi',
      time: 'Today, 09:20 AM',
      txnId: 'UPI984729104',
      status: 'SUCCESS'
    },
    {
      id: 'txn_2',
      type: 'received',
      amount: 4250,
      title: 'Received from Priya Patel',
      vpa: 'priya@gitpitupi',
      time: 'Yesterday, 04:15 PM',
      txnId: 'UPI883719402',
      status: 'SUCCESS'
    }
  ]
};
