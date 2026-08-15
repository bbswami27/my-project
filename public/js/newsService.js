// ChatterPatter - News Ticker & Channels Service

class NewsService {
  constructor() {
    this.newsArticles = [];
    this.tickerItems = [];
    this.activeCategory = 'All';
    this.currentTickerIndex = 0;
    this.tickerTimer = null;
    this.selectedArticleForShare = null;
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.fetchFlashNews();
    await this.fetchArticles();
    this.startTickerRotation();
  }

  bindEvents() {
    // Category Chips Click
    const chips = document.querySelectorAll('.category-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeCategory = chip.getAttribute('data-category');
        this.fetchArticles(this.activeCategory);
      });
    });

    // Close Flash Ticker Button
    const closeTickerBtn = document.getElementById('btn-close-ticker');
    if (closeTickerBtn) {
      closeTickerBtn.addEventListener('click', () => {
        const ticker = document.getElementById('news-flash-ticker-bar');
        if (ticker) ticker.style.display = 'none';
      });
    }

    // Article Modal Close
    const closeArticleModal = document.getElementById('btn-close-article-modal');
    if (closeArticleModal) {
      closeArticleModal.addEventListener('click', () => {
        const modal = document.getElementById('article-detail-modal');
        if (modal) modal.classList.remove('active');
      });
    }

    // Share Modal Close
    const closeShareModal = document.getElementById('btn-close-share-modal');
    if (closeShareModal) {
      closeShareModal.addEventListener('click', () => {
        const modal = document.getElementById('share-news-modal');
        if (modal) modal.classList.remove('active');
      });
    }
  }

  async fetchFlashNews() {
    try {
      const resp = await fetch('/api/news/flash');
      const data = await resp.json();
      if (data.ticker && data.ticker.length > 0) {
        this.tickerItems = data.ticker;
        this.renderTickerHeadline();
      }
    } catch (e) {
      console.warn('News Flash API offline, using defaults:', e);
      this.tickerItems = [
        '🚨 BREAKING: ISRO gears up for high-speed satellite connectivity launch nationwide',
        '⚡ TECH: New on-device AI voice features arrive with ultra-fast latency',
        '📈 ECONOMY: UPI digital transactions achieve historic milestone worldwide'
      ];
      this.renderTickerHeadline();
    }
  }

  async fetchArticles(category = 'All') {
    try {
      const url = category === 'All' ? '/api/news' : `/api/news?category=${category}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) {
        this.newsArticles = data;
      } else if (window.MOCK_DATA && window.MOCK_DATA.initialNewsArticles) {
        this.newsArticles = category === 'All' 
          ? window.MOCK_DATA.initialNewsArticles 
          : window.MOCK_DATA.initialNewsArticles.filter(a => a.category.toLowerCase() === category.toLowerCase());
      }
    } catch (e) {
      console.warn('Error fetching news from API, loading local feeds:', e);
      if (window.MOCK_DATA && window.MOCK_DATA.initialNewsArticles) {
        this.newsArticles = category === 'All' 
          ? window.MOCK_DATA.initialNewsArticles 
          : window.MOCK_DATA.initialNewsArticles.filter(a => a.category.toLowerCase() === category.toLowerCase());
      }
    }
    this.renderNewsFeed();
  }

  renderNewsFeed() {
    const listElem = document.getElementById('news-cards-container');
    if (!listElem) return;

    if (this.newsArticles.length === 0) {
      listElem.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">No articles found in this category.</div>`;
      return;
    }

    listElem.innerHTML = this.newsArticles.map(article => `
      <div class="news-card">
        <img class="news-card-img" src="${article.image}" alt="${article.title}">
        <div class="news-card-body">
          <div class="news-card-meta">
            <span class="news-card-badge">${article.badge || article.category}</span>
            <span class="news-card-time">${article.time}</span>
          </div>
          <h4 class="news-card-title" onclick="window.NewsService.openArticleModal('${article.id}')">${article.title}</h4>
          <p class="news-card-summary">${article.summary}</p>
          <div class="news-card-footer">
            <span class="news-card-source">${article.source}</span>
            <button class="news-share-btn" onclick="window.NewsService.openShareModal('${article.id}')">
              📤 Share to Chat
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  renderTickerHeadline() {
    const tickerTextElem = document.getElementById('ticker-headline-text');
    if (!tickerTextElem || this.tickerItems.length === 0) return;

    const headline = this.tickerItems[this.currentTickerIndex % this.tickerItems.length];
    tickerTextElem.innerHTML = headline;
  }

  startTickerRotation() {
    clearInterval(this.tickerTimer);
    this.tickerTimer = setInterval(() => {
      this.currentTickerIndex++;
      this.renderTickerHeadline();
    }, 6000);
  }

  openArticleModal(articleId) {
    const article = this.newsArticles.find(a => a.id === articleId);
    if (!article) return;

    const modal = document.getElementById('article-detail-modal');
    if (!modal) return;

    document.getElementById('modal-article-img').src = article.image;
    document.getElementById('modal-article-badge').textContent = article.badge || article.category;
    document.getElementById('modal-article-time').textContent = `${article.source} • ${article.time}`;
    document.getElementById('modal-article-title').textContent = article.title;
    document.getElementById('modal-article-summary').textContent = article.summary;

    const shareBtn = document.getElementById('modal-article-share-btn');
    if (shareBtn) {
      shareBtn.onclick = () => {
        modal.classList.remove('active');
        this.openShareModal(article.id);
      };
    }

    modal.classList.add('active');
  }

  openShareModal(articleId) {
    const article = this.newsArticles.find(a => a.id === articleId);
    if (!article) return;

    this.selectedArticleForShare = article;
    const modal = document.getElementById('share-news-modal');
    const contactList = document.getElementById('share-contact-list-items');
    if (!modal || !contactList) return;

    const chats = window.ChatEngine ? window.ChatEngine.chats : [];
    contactList.innerHTML = chats.map(chat => `
      <div class="share-contact-item" onclick="window.NewsService.confirmShareToChat('${chat.id}')">
        <img class="avatar-img" style="width: 38px; height: 38px;" src="${chat.avatar}" alt="${chat.name}">
        <span style="font-weight: 600; color: var(--text-primary); font-size: 14px;">${chat.name}</span>
      </div>
    `).join('');

    modal.classList.add('active');
  }

  confirmShareToChat(chatId) {
    if (!this.selectedArticleForShare) return;

    if (window.ChatEngine) {
      window.ChatEngine.shareNewsToChat(this.selectedArticleForShare, chatId);
    }

    const modal = document.getElementById('share-news-modal');
    if (modal) modal.classList.remove('active');

    // Switch to Chats tab
    if (window.ChatterApp) {
      window.ChatterApp.switchTab('chats');
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.NewsService = new NewsService();
});
