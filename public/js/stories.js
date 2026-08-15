// ChatterPatter - Status & Stories Controller

class StoriesManager {
  constructor() {
    this.stories = [];
    this.currentStory = null;
    this.currentItemIndex = 0;
    this.storyTimer = null;
    this.storyDuration = 4500; // 4.5s per item
    this.init();
  }

  init() {
    const saved = localStorage.getItem('chatterpatter_stories');
    if (saved) {
      try {
        this.stories = JSON.parse(saved);
      } catch (e) {
        this.stories = [...window.MOCK_DATA.initialStories];
      }
    } else {
      this.stories = [...window.MOCK_DATA.initialStories];
    }

    this.bindEvents();
    this.renderStatusTab();
  }

  bindEvents() {
    // Tap left / right navigation in story viewer
    const tapLeft = document.getElementById('story-tap-left');
    const tapRight = document.getElementById('story-tap-right');
    const closeBtn = document.getElementById('btn-close-story-viewer');

    if (tapLeft) {
      tapLeft.addEventListener('click', () => this.prevStoryItem());
    }
    if (tapRight) {
      tapRight.addEventListener('click', () => this.nextStoryItem());
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeStoryViewer());
    }

    // Story Create Modal Trigger
    const addStatusCard = document.getElementById('my-status-add-card');
    const createModal = document.getElementById('create-status-modal');
    const closeCreateModal = document.getElementById('btn-close-create-status');

    if (addStatusCard && createModal) {
      addStatusCard.addEventListener('click', () => {
        createModal.classList.add('active');
      });
    }
    if (closeCreateModal && createModal) {
      closeCreateModal.addEventListener('click', () => {
        createModal.classList.remove('active');
      });
    }

    // Status Color Picker
    const colorDots = document.querySelectorAll('.color-dot');
    colorDots.forEach(dot => {
      dot.addEventListener('click', () => {
        colorDots.forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        const color = dot.getAttribute('data-color');
        const preview = document.getElementById('status-preview-box');
        if (preview) preview.style.backgroundColor = color;
      });
    });

    // Publish New Status
    const publishBtn = document.getElementById('btn-publish-status');
    if (publishBtn) {
      publishBtn.addEventListener('click', () => this.publishNewStatus());
    }
  }

  renderStatusTab() {
    const recentList = document.getElementById('status-recent-list');
    if (!recentList) return;

    recentList.innerHTML = this.stories.map(story => {
      const ringClass = story.viewed ? 'status-ring-viewed' : 'status-ring-unread';
      return `
        <div class="my-status-card" onclick="window.StoriesManager.openStory('${story.id}')">
          <div class="status-avatar-wrapper">
            <img class="status-avatar-img ${ringClass}" src="${story.authorAvatar}" alt="${story.authorName}">
          </div>
          <div class="status-card-info">
            <h4>${story.authorName}</h4>
            <p>${story.time} • ${story.items.length} update${story.items.length > 1 ? 's' : ''}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  openStory(storyId) {
    const story = this.stories.find(s => s.id === storyId);
    if (!story) return;

    this.currentStory = story;
    this.currentItemIndex = 0;
    story.viewed = true;
    this.saveStories();
    this.renderStatusTab();

    const viewer = document.getElementById('story-viewer-modal');
    if (viewer) viewer.classList.add('active');

    this.renderStoryItem();
  }

  renderStoryItem() {
    if (!this.currentStory) return;
    const item = this.currentStory.items[this.currentItemIndex];
    if (!item) {
      this.closeStoryViewer();
      return;
    }

    // Set Header
    document.getElementById('story-viewer-avatar').src = this.currentStory.authorAvatar;
    document.getElementById('story-viewer-name').textContent = this.currentStory.authorName;
    document.getElementById('story-viewer-time').textContent = this.currentStory.time;

    // Render Progress Bars
    const progressContainer = document.getElementById('story-progress-container');
    if (progressContainer) {
      progressContainer.innerHTML = this.currentStory.items.map((it, idx) => {
        let fillClass = '';
        if (idx < this.currentItemIndex) fillClass = 'completed';
        return `
          <div class="story-progress-bar">
            <div class="story-progress-fill ${fillClass}" id="story-prog-${idx}"></div>
          </div>
        `;
      }).join('');
    }

    // Render Content Body
    const contentBody = document.getElementById('story-content-display');
    if (contentBody) {
      if (item.type === 'image') {
        contentBody.innerHTML = `
          <img class="story-img-display" src="${item.mediaUrl}" alt="Story">
          ${item.caption ? `<div style="position:absolute; bottom: 80px; left: 20px; right: 20px; text-align: center; color: white; background: rgba(0,0,0,0.6); padding: 8px 14px; border-radius: 20px; font-weight: 500;">${item.caption}</div>` : ''}
        `;
      } else {
        contentBody.innerHTML = `
          <div class="story-text-display" style="background-color: ${item.bgColor || '#0284c7'};">
            ${item.text}
          </div>
        `;
      }
    }

    // Animate current progress bar
    this.startProgressBar(this.currentItemIndex);
  }

  startProgressBar(index) {
    clearInterval(this.storyTimer);
    const fillBar = document.getElementById(`story-prog-${index}`);
    if (!fillBar) return;

    fillBar.style.width = '0%';
    let elapsed = 0;
    const interval = 50;

    this.storyTimer = setInterval(() => {
      elapsed += interval;
      const pct = Math.min((elapsed / this.storyDuration) * 100, 100);
      fillBar.style.width = `${pct}%`;

      if (elapsed >= this.storyDuration) {
        clearInterval(this.storyTimer);
        this.nextStoryItem();
      }
    }, interval);
  }

  nextStoryItem() {
    clearInterval(this.storyTimer);
    if (!this.currentStory) return;

    if (this.currentItemIndex < this.currentStory.items.length - 1) {
      this.currentItemIndex++;
      this.renderStoryItem();
    } else {
      // Find next story
      const currIdx = this.stories.findIndex(s => s.id === this.currentStory.id);
      if (currIdx >= 0 && currIdx < this.stories.length - 1) {
        this.openStory(this.stories[currIdx + 1].id);
      } else {
        this.closeStoryViewer();
      }
    }
  }

  prevStoryItem() {
    clearInterval(this.storyTimer);
    if (!this.currentStory) return;

    if (this.currentItemIndex > 0) {
      this.currentItemIndex--;
      this.renderStoryItem();
    } else {
      const currIdx = this.stories.findIndex(s => s.id === this.currentStory.id);
      if (currIdx > 0) {
        this.openStory(this.stories[currIdx - 1].id);
      }
    }
  }

  closeStoryViewer() {
    clearInterval(this.storyTimer);
    this.currentStory = null;
    const viewer = document.getElementById('story-viewer-modal');
    if (viewer) viewer.classList.remove('active');
  }

  publishNewStatus() {
    const textInput = document.getElementById('new-status-text');
    const text = textInput ? textInput.value.trim() : '';
    if (!text) {
      alert('Please type something for your status!');
      return;
    }

    const activeDot = document.querySelector('.color-dot.active');
    const bgColor = activeDot ? activeDot.getAttribute('data-color') : '#0284c7';
    const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;

    const myStory = {
      id: 'story_my_' + Date.now(),
      authorId: currentUser ? currentUser.id : 'me',
      authorName: currentUser ? currentUser.name : 'My Status',
      authorAvatar: currentUser ? currentUser.avatar : 'https://api.dicebear.com/7.x/bottts/svg?seed=MyStatus',
      time: 'Just now',
      viewed: false,
      items: [
        {
          type: 'text',
          bgColor: bgColor,
          text: text
        }
      ]
    };

    this.stories.unshift(myStory);
    this.saveStories();
    this.renderStatusTab();

    if (textInput) textInput.value = '';
    const createModal = document.getElementById('create-status-modal');
    if (createModal) createModal.classList.remove('active');

    alert('Your Status has been posted successfully! ✨');
  }

  saveStories() {
    localStorage.setItem('chatterpatter_stories', JSON.stringify(this.stories));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.StoriesManager = new StoriesManager();
});
