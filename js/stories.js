// GitPit - Advanced Status & Multi-Story Controller

class StoriesManager {
  constructor() {
    this.stories = [];
    this.currentStory = null;
    this.currentItemIndex = 0;
    this.storyTimer = null;
    this.storyDuration = 4500; // 4.5s per item
    this.selectedMediaQueue = []; // Array of { id, type, dataUrl, fileName, caption, text, bgColor }
    this.activeQueueIndex = 0;
    this.init();
  }

  init() {
    const saved = localStorage.getItem('chatterpatter_stories') || localStorage.getItem('gitpit_stories');
    if (saved) {
      try {
        this.stories = JSON.parse(saved);
      } catch (e) {
        this.stories = (window.MOCK_DATA && window.MOCK_DATA.initialStories) ? [...window.MOCK_DATA.initialStories] : [];
      }
    } else {
      this.stories = (window.MOCK_DATA && window.MOCK_DATA.initialStories) ? [...window.MOCK_DATA.initialStories] : [];
    }

    this.bindEvents();
    this.renderStatusTab();
  }

  bindEvents() {
    // Tap left / right navigation in story viewer
    const tapLeft = document.getElementById('story-tap-left');
    const tapRight = document.getElementById('story-tap-right');
    const closeBtn = document.getElementById('btn-close-story-viewer');

    if (tapLeft) tapLeft.addEventListener('click', () => this.prevStoryItem());
    if (tapRight) tapRight.addEventListener('click', () => this.nextStoryItem());
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeStoryViewer());

    // Status Color Picker for Text Status
    const colorDots = document.querySelectorAll('.color-dot');
    colorDots.forEach(dot => {
      dot.addEventListener('click', () => {
        colorDots.forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        const color = dot.getAttribute('data-color');
        const preview = document.getElementById('status-preview-box');
        if (preview && this.selectedMediaQueue.length === 0) {
          preview.style.backgroundColor = color;
        }
      });
    });
  }

  handleMyStatusClick() {
    const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;
    const currentUserId = currentUser ? currentUser.id : 'me';
    const myStories = this.stories.filter(s => s.authorId === currentUserId || s.id.startsWith('story_my_'));

    if (myStories.length > 0 && myStories[0].items && myStories[0].items.length > 0) {
      this.openStory(myStories[0].id);
    } else {
      this.openCreateStatusModal();
    }
  }

  openCreateStatusModal() {
    const createModal = document.getElementById('create-status-modal');
    if (createModal) createModal.classList.add('active');
  }

  renderStatusTab() {
    const recentList = document.getElementById('status-recent-list');
    const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;
    const currentUserId = currentUser ? currentUser.id : 'me';

    // Separate My Status from Contact Stories
    const myStories = this.stories.filter(s => s.authorId === currentUserId || s.id.startsWith('story_my_'));
    const contactStories = this.stories.filter(s => s.authorId !== currentUserId && !s.id.startsWith('story_my_'));

    // Update My Status Header Card
    const myStatusSubtitle = document.getElementById('my-status-subtitle');
    const myStatusAvatar = document.getElementById('my-status-avatar-img');
    if (currentUser && myStatusAvatar) {
      myStatusAvatar.src = currentUser.avatar || 'assets/logo-icon.svg';
    }
    if (myStatusSubtitle) {
      if (myStories.length > 0 && myStories[0].items && myStories[0].items.length > 0) {
        const count = myStories[0].items.length;
        myStatusSubtitle.textContent = `${count} active update${count > 1 ? 's' : ''} • Tap to view`;
        if (myStatusAvatar) {
          myStatusAvatar.classList.add('status-ring-unread');
        }
      } else {
        myStatusSubtitle.textContent = 'Tap to add status update';
        if (myStatusAvatar) {
          myStatusAvatar.classList.remove('status-ring-unread');
        }
      }
    }

    if (!recentList) return;

    if (contactStories.length === 0) {
      recentList.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 30px 14px; font-size: 13px;">
          <div style="font-size: 28px; margin-bottom: 6px;">✨</div>
          No recent updates from your contacts.
        </div>
      `;
      return;
    }

    const unreadStories = contactStories.filter(s => !s.viewed);
    const viewedStories = contactStories.filter(s => s.viewed);

    let html = '';

    if (unreadStories.length > 0) {
      html += `
        <div style="padding: 8px 12px 4px 12px; font-size: 11px; font-weight: 700; color: var(--brand-green); text-transform: uppercase; letter-spacing: 0.5px;">
          Recent Updates (${unreadStories.length})
        </div>
      `;
      html += unreadStories.map(story => `
        <div class="my-status-card" onclick="window.StoriesManager.openStory('${story.id}')" style="cursor: pointer;">
          <div class="status-avatar-wrapper">
            <img class="status-avatar-img status-ring-unread" src="${story.authorAvatar || 'assets/logo-icon.svg'}" alt="${story.authorName}">
          </div>
          <div class="status-card-info">
            <h4>${story.authorName}</h4>
            <p>${story.time} • ${story.items ? story.items.length : 1} update${(story.items && story.items.length > 1) ? 's' : ''}</p>
          </div>
        </div>
      `).join('');
    }

    if (viewedStories.length > 0) {
      html += `
        <div style="padding: 12px 12px 4px 12px; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
          Viewed Updates (${viewedStories.length})
        </div>
      `;
      html += viewedStories.map(story => `
        <div class="my-status-card" onclick="window.StoriesManager.openStory('${story.id}')" style="cursor: pointer; opacity: 0.8;">
          <div class="status-avatar-wrapper">
            <img class="status-avatar-img status-ring-viewed" src="${story.authorAvatar || 'assets/logo-icon.svg'}" alt="${story.authorName}">
          </div>
          <div class="status-card-info">
            <h4>${story.authorName}</h4>
            <p>${story.time} • ${story.items ? story.items.length : 1} update${(story.items && story.items.length > 1) ? 's' : ''}</p>
          </div>
        </div>
      `).join('');
    }

    recentList.innerHTML = html;
  }

  openStory(storyId) {
    const story = this.stories.find(s => s.id === storyId);
    if (!story || !story.items || story.items.length === 0) return;

    this.currentStory = story;
    this.currentItemIndex = 0;
    story.viewed = true;
    this.saveStories();
    this.renderStatusTab();

    const viewer = document.getElementById('story-viewer-modal');
    if (viewer) viewer.classList.add('active');

    this.renderStoryItem();
  }

  // ================= MULTI-MEDIA FILE HANDLER =================
  async handleMediaSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const MAX_SIZE_MB = 15;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        alert(`⚠️ "${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max limit is 15 MB.`);
        continue;
      }

      const isVideo = file.type.startsWith('video');
      const dataUrl = await this.readFileAsDataURL(file);

      this.selectedMediaQueue.push({
        id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        type: isVideo ? 'video' : 'image',
        dataUrl: dataUrl,
        fileName: file.name,
        caption: '',
        text: ''
      });
    }

    if (this.selectedMediaQueue.length > 0) {
      this.activeQueueIndex = this.selectedMediaQueue.length - 1;
      this.renderMediaQueueUI();
    }

    event.target.value = '';
  }

  readFileAsDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  renderMediaQueueUI() {
    const queueStrip = document.getElementById('status-media-queue-strip');
    const mediaContainer = document.getElementById('status-preview-media-container');
    const clearBtn = document.getElementById('btn-status-clear-media');
    const colorWrapper = document.getElementById('status-color-palette-wrapper');
    const previewText = document.getElementById('status-preview-text-display');
    const captionInput = document.getElementById('new-status-text');
    const captionLabel = document.getElementById('status-caption-label');
    const publishBtn = document.getElementById('btn-publish-status');
    const attachText = document.getElementById('btn-status-attach-text');

    if (this.selectedMediaQueue.length === 0) {
      if (queueStrip) {
        queueStrip.innerHTML = '';
        queueStrip.style.display = 'none';
      }
      if (mediaContainer) {
        mediaContainer.innerHTML = '';
        mediaContainer.style.display = 'none';
      }
      if (clearBtn) clearBtn.style.display = 'none';
      if (colorWrapper) colorWrapper.style.display = 'block';
      if (captionLabel) captionLabel.textContent = 'Status Caption / Message';
      if (publishBtn) publishBtn.textContent = 'Post Status ✨';
      if (attachText) attachText.textContent = 'Attach Photos or Videos (Multiple)';
      if (previewText) {
        previewText.textContent = captionInput ? (captionInput.value.trim() || 'Type your status below...') : 'Type your status below...';
        previewText.style.background = 'transparent';
        previewText.style.position = 'relative';
        previewText.style.bottom = 'auto';
        previewText.style.left = 'auto';
        previewText.style.right = 'auto';
      }
      return;
    }

    if (this.activeQueueIndex >= this.selectedMediaQueue.length) {
      this.activeQueueIndex = Math.max(0, this.selectedMediaQueue.length - 1);
    }

    const currentItem = this.selectedMediaQueue[this.activeQueueIndex];

    // 1. Render Horizontal Queue Thumbnails Strip
    if (queueStrip) {
      queueStrip.style.display = 'flex';
      queueStrip.innerHTML = `
        ${this.selectedMediaQueue.map((item, idx) => {
          const isActive = (idx === this.activeQueueIndex);
          return `
            <div style="position: relative; flex-shrink: 0; width: 64px; height: 64px; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2.5px solid ${isActive ? 'var(--brand-green)' : 'var(--border-subtle)'}; box-shadow: ${isActive ? '0 0 6px rgba(0, 168, 132, 0.6)' : 'none'};" onclick="window.StoriesManager.selectQueueItem(${idx})">
              ${item.type === 'video'
                ? `<video src="${item.dataUrl}" style="width: 100%; height: 100%; object-fit: cover;"></video>`
                : `<img src="${item.dataUrl}" alt="Thumb" style="width: 100%; height: 100%; object-fit: cover;">`
              }
              <span style="position: absolute; bottom: 2px; left: 3px; background: rgba(0,0,0,0.7); color: #fff; font-size: 10px; font-weight: 700; padding: 1px 4px; border-radius: 4px;">#${idx + 1}</span>
              <button type="button" style="position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; background: rgba(239, 68, 68, 0.85); color: #fff; border: none; border-radius: 50%; font-size: 11px; display: flex; align-items: center; justify-content: center; cursor: pointer;" onclick="event.stopPropagation(); window.StoriesManager.removeQueueItem(${idx})">✕</button>
            </div>
          `;
        }).join('')}
        <div style="flex-shrink: 0; width: 64px; height: 64px; border-radius: 8px; border: 2px dashed var(--brand-green); display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; background: var(--bg-card); color: var(--brand-green); font-size: 11px; font-weight: 700;" onclick="document.getElementById('status-media-file-input').click()">
          <span style="font-size: 18px;">➕</span>
          <span>Add</span>
        </div>
      `;
    }

    // 2. Render Main Wide Preview Box
    if (mediaContainer) {
      mediaContainer.style.display = 'block';
      if (currentItem.type === 'video') {
        mediaContainer.innerHTML = `<video src="${currentItem.dataUrl}" autoplay muted loop playsinline style="width: 100%; height: 100%; object-fit: contain; background: #0b141a; border-radius: 12px;"></video>`;
      } else {
        mediaContainer.innerHTML = `<img src="${currentItem.dataUrl}" alt="Preview" style="width: 100%; height: 100%; object-fit: contain; background: #0b141a; border-radius: 12px;">`;
      }
    }

    // 3. Update Text & Caption
    if (captionInput) {
      captionInput.value = currentItem.caption || '';
    }
    if (captionLabel) {
      captionLabel.textContent = `Caption / Matter on Item #${this.activeQueueIndex + 1} of ${this.selectedMediaQueue.length}`;
    }
    if (previewText) {
      previewText.textContent = currentItem.caption || `Write matter on item #${this.activeQueueIndex + 1}...`;
      previewText.style.background = 'rgba(0, 0, 0, 0.7)';
      previewText.style.borderRadius = '8px';
      previewText.style.position = 'absolute';
      previewText.style.bottom = '12px';
      previewText.style.left = '12px';
      previewText.style.right = '12px';
    }

    if (clearBtn) clearBtn.style.display = 'inline-block';
    if (colorWrapper) colorWrapper.style.display = 'none';
    if (publishBtn) publishBtn.textContent = `Post Status ✨ (${this.selectedMediaQueue.length} ${this.selectedMediaQueue.length > 1 ? 'items' : 'item'})`;
    if (attachText) attachText.textContent = `➕ Add More Photos / Videos (${this.selectedMediaQueue.length} selected)`;
  }

  selectQueueItem(index) {
    if (index >= 0 && index < this.selectedMediaQueue.length) {
      this.activeQueueIndex = index;
      this.renderMediaQueueUI();
    }
  }

  removeQueueItem(index) {
    if (index >= 0 && index < this.selectedMediaQueue.length) {
      this.selectedMediaQueue.splice(index, 1);
      if (this.activeQueueIndex >= this.selectedMediaQueue.length) {
        this.activeQueueIndex = Math.max(0, this.selectedMediaQueue.length - 1);
      }
      this.renderMediaQueueUI();
    }
  }

  handleCaptionInput(value) {
    if (this.selectedMediaQueue.length > 0 && this.selectedMediaQueue[this.activeQueueIndex]) {
      this.selectedMediaQueue[this.activeQueueIndex].caption = value.trim();
      this.selectedMediaQueue[this.activeQueueIndex].text = value.trim();
      const previewText = document.getElementById('status-preview-text-display');
      if (previewText) {
        previewText.textContent = value.trim() || `Write matter on item #${this.activeQueueIndex + 1}...`;
      }
    } else {
      const previewText = document.getElementById('status-preview-text-display');
      if (previewText) {
        previewText.textContent = value.trim() || 'Type your status below...';
      }
    }
  }

  clearSelectedMedia() {
    this.selectedMediaQueue = [];
    this.activeQueueIndex = 0;
    const input = document.getElementById('new-status-text');
    if (input) input.value = '';
    this.renderMediaQueueUI();
  }

  async publishNewStatus() {
    const textInput = document.getElementById('new-status-text');
    const directText = textInput ? textInput.value.trim() : '';

    if (this.selectedMediaQueue.length === 0 && !directText) {
      alert('Please enter a caption or attach at least 1 photo/video for your status!');
      return;
    }

    const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;
    const now = new Date();
    const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let newItems = [];

    if (this.selectedMediaQueue.length > 0) {
      newItems = this.selectedMediaQueue.map(m => ({
        type: m.type,
        mediaUrl: m.dataUrl,
        caption: m.caption || m.text || '',
        text: m.caption || m.text || ''
      }));
    } else {
      const activeDot = document.querySelector('.color-dot.active');
      const bgColor = activeDot ? activeDot.getAttribute('data-color') : '#0284c7';
      newItems = [{
        type: 'text',
        bgColor: bgColor,
        text: directText,
        caption: directText
      }];
    }

    const currentUserId = currentUser ? currentUser.id : 'me';
    let myStory = this.stories.find(s => s.authorId === currentUserId || s.id.startsWith('story_my_'));

    if (myStory) {
      // Append to existing story queue
      myStory.items = (myStory.items || []).concat(newItems);
      myStory.time = `Today, ${timeFormatted}`;
      myStory.timestamp = Date.now();
      myStory.viewed = false;
    } else {
      myStory = {
        id: 'story_my_' + Date.now(),
        authorId: currentUserId,
        authorName: currentUser ? (currentUser.name || 'My Status') : 'My Status',
        authorAvatar: currentUser ? (currentUser.avatar || 'assets/logo-icon.svg') : 'assets/logo-icon.svg',
        time: `Today, ${timeFormatted}`,
        timestamp: Date.now(),
        viewed: false,
        items: newItems
      };
      this.stories.unshift(myStory);
    }

    this.saveStories();
    this.renderStatusTab();
    this.clearSelectedMedia();

    const createModal = document.getElementById('create-status-modal');
    if (createModal) createModal.classList.remove('active');

    alert(`🎉 Status with ${newItems.length} update(s) posted successfully! Tap "My Status" to view. ✨`);
  }

  renderStoryItem() {
    if (!this.currentStory || !this.currentStory.items || this.currentStory.items.length === 0) return;
    const item = this.currentStory.items[this.currentItemIndex];
    if (!item) {
      this.closeStoryViewer();
      return;
    }

    // Set Header
    const avatarElem = document.getElementById('story-viewer-avatar');
    const nameElem = document.getElementById('story-viewer-name');
    const timeElem = document.getElementById('story-viewer-time');

    if (avatarElem) avatarElem.src = this.currentStory.authorAvatar || 'assets/logo-icon.svg';
    if (nameElem) nameElem.textContent = this.currentStory.authorName || 'Status';
    if (timeElem) timeElem.textContent = `${this.currentStory.time} (${this.currentItemIndex + 1}/${this.currentStory.items.length})`;

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
      const displayMatter = item.caption || item.text || '';
      const matterHtml = displayMatter
        ? `<div class="story-caption-bar" style="position: absolute; bottom: 75px; left: 16px; right: 16px; text-align: center; color: #ffffff; background: rgba(0, 0, 0, 0.75); padding: 12px 18px; border-radius: 14px; font-weight: 600; font-size: 15.5px; backdrop-filter: blur(8px); word-break: break-word; z-index: 10; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">${displayMatter}</div>`
        : '';

      const mediaUrl = item.mediaUrl || item.dataUrl || item.url || item.image || '';

      if (item.type === 'image') {
        contentBody.innerHTML = `
          <img class="story-img-display" src="${mediaUrl}" alt="Status Photo" style="max-height: 85vh; max-width: 100vw; object-fit: contain; border-radius: 8px;">
          ${matterHtml}
        `;
      } else if (item.type === 'video') {
        contentBody.innerHTML = `
          <video class="story-img-display" src="${mediaUrl}" autoplay playsinline controls style="max-height: 85vh; max-width: 100vw; border-radius: 8px;"></video>
          ${matterHtml}
        `;
      } else {
        contentBody.innerHTML = `
          <div class="story-text-display" style="background-color: ${item.bgColor || '#0284c7'}; color: #ffffff; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 24px; font-weight: 700; padding: 30px; text-align: center;">
            ${item.text || item.caption || ''}
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
      // Find next story in the list
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

  saveStories() {
    localStorage.setItem('chatterpatter_stories', JSON.stringify(this.stories));
    localStorage.setItem('gitpit_stories', JSON.stringify(this.stories));
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.StoriesManager = new StoriesManager();
});
