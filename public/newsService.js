// GitPit - News Ticker & Channels Service (Powered by VartaPrimeNews)

const VARTAPRIME_API_URL = 'https://vartaprimenews.onrender.com/api/news';

class NewsService {
  constructor() {
    this.newsArticles = [];
    this.rawNewsData = [];
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
    await this.fetchArticles('All');
    this.startTickerRotation();

    // Ensure ticker is visible by default
    const tickerBar = document.getElementById('news-flash-ticker-bar');
    const isTickerOff = localStorage.getItem('chatterpatter_news_flash') === 'false';
    if (tickerBar) {
      tickerBar.style.display = isTickerOff ? 'none' : 'flex';
    }
  }

  bindEvents() {
    // Category Chips Click
    const chips = document.querySelectorAll('.category-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeCategory = chip.getAttribute('data-category') || 'All';
        this.filterArticlesByCategory(this.activeCategory);
      });
    });

    // Close Flash Ticker Button
    const closeTickerBtn = document.getElementById('btn-close-ticker');
    if (closeTickerBtn) {
      closeTickerBtn.addEventListener('click', () => {
        const ticker = document.getElementById('news-flash-ticker-bar');
        if (ticker) ticker.style.display = 'none';
        localStorage.setItem('chatterpatter_news_flash', 'false');
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

  formatRelativeTime(dateStr) {
    if (!dateStr) return 'Just now';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString('hi-IN', { month: 'short', day: 'numeric' });
    } catch (e) {
      return 'Today';
    }
  }

  async fetchFlashNews() {
    try {
      const resp = await fetch(VARTAPRIME_API_URL);
      const result = await resp.json();
      
      if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
        this.rawNewsData = result.data;
        // Extract top 15 headlines for the ticker
        this.tickerItems = result.data.slice(0, 15).map(item => {
          const badge = item.category ? `[${item.category}]` : '🚨';
          return `<b>${badge}</b> ${item.title} • <span style="opacity: 0.8; font-size: 11px;">${item.source || 'VartaPrimeNews'}</span>`;
        });
        this.renderTickerHeadline();
        return;
      }
    } catch (e) {
      console.warn('VartaPrimeNews Flash API fetch error, checking backend or defaults:', e);
    }

    // Fallback if network is slow
    this.tickerItems = [
      '🚨 <b>[देश]</b> VartaPrimeNews लाइव बुलेटिन: ताज़ा राष्ट्रीय और प्रादेशिक ख़बरें',
      '⚡ <b>[हरियाणा]</b> हरियाणा और दिल्ली एनसीआर की ताज़ा हलचल और ब्रेकिंग न्यूज़',
      '📈 <b>[बिजनेस]</b> शेयर बाजार, यूपीआई और अर्थव्यवस्था की मुख्य ख़बरें'
    ];
    this.renderTickerHeadline();
  }

  async fetchArticles(category = 'All') {
    try {
      if (this.rawNewsData.length === 0) {
        const resp = await fetch(VARTAPRIME_API_URL);
        const result = await resp.json();
        if (result && result.success && Array.isArray(result.data)) {
          this.rawNewsData = result.data;
        }
      }

      if (this.rawNewsData.length > 0) {
        this.filterArticlesByCategory(category);
        return;
      }
    } catch (e) {
      console.warn('Error fetching articles from VartaPrimeNews:', e);
    }

    // Fallback Mock Data
    if (window.MOCK_DATA && window.MOCK_DATA.initialNewsArticles) {
      this.newsArticles = category === 'All'
        ? window.MOCK_DATA.initialNewsArticles
        : window.MOCK_DATA.initialNewsArticles.filter(a => (a.category || '').toLowerCase() === category.toLowerCase());
    }
    this.renderNewsFeed();
  }

  filterArticlesByCategory(category = 'All') {
    if (this.rawNewsData.length === 0) return;

    let filtered = this.rawNewsData;
    const cleanCat = (category || 'All').trim().toLowerCase();

    if (cleanCat !== 'all' && cleanCat !== 'all news') {
      filtered = this.rawNewsData.filter(item => {
        const itemCat = (item.category || '').toLowerCase();
        const itemState = (item.state || '').toLowerCase();
        const itemDistrict = (item.district || '').toLowerCase();
        const itemTitle = (item.title || '').toLowerCase();

        return itemCat.includes(cleanCat) || 
               itemState.includes(cleanCat) || 
               itemDistrict.includes(cleanCat) || 
               itemTitle.includes(cleanCat);
      });
    }

    this.newsArticles = filtered.map(item => {
      const summaryText = (item.description && item.description !== '-') 
        ? item.description 
        : (item.content ? item.content.replace(/\n/g, ' ').replace(/\(स्रोत:.*\)/g, '').slice(0, 160) + '...' : 'विस्तार से पढ़ने के लिए क्लिक करें...');

      return {
        id: item.id || `news_${Math.random()}`,
        title: item.title,
        summary: summaryText,
        fullContent: item.content || item.description || item.title,
        image: item.imageurl || 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=600&auto=format&fit=crop',
        category: item.category || item.state || 'ताज़ा ख़बर',
        badge: item.category || item.state || 'VartaPrime',
        time: this.formatRelativeTime(item.publishedAt || item.fetchedAt),
        source: item.source || 'VartaPrimeNews',
        link: item.link || 'https://vartaprimenews.onrender.com'
      };
    });

    this.renderNewsFeed();
  }

  renderNewsFeed() {
    const listElem = document.getElementById('news-cards-container');
    if (!listElem) return;

    if (this.newsArticles.length === 0) {
      listElem.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 40px 20px;">
          <div style="font-size: 32px; margin-bottom: 8px;">📰</div>
          <p style="font-weight: 600;">इस केटेगरी में कोई खबर नहीं मिली।</p>
          <button class="btn-action-primary" style="margin-top: 10px; font-size: 13px;" onclick="window.NewsService.fetchArticles('All')">सभी खबरें देखें</button>
        </div>
      `;
      return;
    }

    listElem.innerHTML = this.newsArticles.map(article => `
      <div class="news-card">
        <img class="news-card-img" src="${article.image}" alt="${article.title}" onerror="this.src='https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=600&auto=format&fit=crop'">
        <div class="news-card-body">
          <div class="news-card-meta">
            <span class="news-card-badge">${article.badge || article.category}</span>
            <span class="news-card-time">${article.time}</span>
          </div>
          <h4 class="news-card-title" onclick="window.NewsService.openArticleModal('${article.id}')">${article.title}</h4>
          <p class="news-card-summary">${article.summary}</p>
          <div class="news-card-footer">
            <span class="news-card-source">📰 ${article.source}</span>
            <div style="display: flex; gap: 6px;">
              <a href="${article.link}" target="_blank" class="news-share-btn" style="text-decoration: none; padding: 5px 8px; font-size: 11.5px; background: rgba(255,255,255,0.06); border: 1px solid var(--border-subtle); color: var(--text-secondary); border-radius: 6px;" title="VartaPrimeNews पर पढ़ें">
                🌐 पढ़ें
              </a>
              <button class="news-share-btn" onclick="window.NewsService.openShareModal('${article.id}')">
                📤 Share
              </button>
            </div>
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
    }, 5000);
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
    document.getElementById('modal-article-summary').textContent = article.fullContent || article.summary;

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
