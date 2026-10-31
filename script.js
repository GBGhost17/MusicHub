/**
 * Music Hub - Core Engine Architecture (Production Ready)
 * Architecture Pattern: Modular MVC / Pub-Sub Hybrid
 */

const CONFIG = {
  STORAGE_KEY: 'musichub_app_state_v3',
  DEFAULT_VIDEO_ID: 'E3wNiBJjyRg',
  MAX_HISTORY_ITEMS: 15,
  FEEDBACK_TIMEOUT: 4000
};

const defaultTracks = [
  {
    id: 'E3wNiBJjyRg',
    title: '𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 "manifest gặp đúng người, yêu đúng người"☔️🍂 Playlist Nhạc Chill Khi Bạn Chưa Có Ai Vỗ Về',
    artist: 'Nóc Nhà Chill',
    duration: 0,
    thumbnail: 'https://i.ytimg.com/vi/E3wNiBJjyRg/hqdefault.jpg'
  }
];

class Store {
  constructor() {
    this.state = {
      queue: [...defaultTracks],
      currentId: CONFIG.DEFAULT_VIDEO_ID,
      currentTime: 0,
      isPlaying: false,
      shuffle: false,
      loop: false,
      volume: 70,
      playbackRate: 1.0,
      favorites: [],
      history: [],
      currentPlaylist: 'Mặc định',
      playlists: {
        'Mặc định': [...defaultTracks],
        'Chill': [],
        'Lo-Fi': [],
        'EDM': []
      },
      settings: {
        skip: true,
        remove: false,
        restore: true
      },
      filterMode: 'all'
    };
  }

  init() {
    this.loadFromStorage();
    this.validateState();
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.settings && !parsed.settings.restore) return;
      this.state = { ...this.state, ...parsed };
    } catch (e) {
      console.error('[Store] Failed to parse localStorage data:', e);
    }
  }

  validateState() {
    if (!this.state.playlists || typeof this.state.playlists !== 'object') {
      this.state.playlists = { 'Mặc định': [...defaultTracks] };
    }
    if (!this.state.playlists['Mặc định'] || this.state.playlists['Mặc định'].length === 0) {
      this.state.playlists['Mặc định'] = [...defaultTracks];
    }
    if (!this.state.currentPlaylist || !this.state.playlists[this.state.currentPlaylist]) {
      this.state.currentPlaylist = 'Mặc định';
    }
    this.state.queue = [...this.state.playlists[this.state.currentPlaylist]];
    if (!this.state.currentId && this.state.queue.length > 0) {
      this.state.currentId = this.state.queue[0].id;
    }
  }

  save() {
    if (!this.state.settings.restore) return;
    try {
      if (this.state.currentPlaylist && this.state.playlists[this.state.currentPlaylist]) {
        this.state.playlists[this.state.currentPlaylist] = [...this.state.queue];
      }
      const payload = {
        queue: this.state.queue,
        currentId: this.state.currentId,
        currentTime: playerService.getCurrentTime(),
        volume: this.state.volume,
        playbackRate: this.state.playbackRate,
        shuffle: this.state.shuffle,
        loop: this.state.loop,
        favorites: this.state.favorites,
        history: this.state.history,
        playlists: this.state.playlists,
        settings: this.state.settings,
        currentPlaylist: this.state.currentPlaylist
      };
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error('[Store] Save failed:', e);
    }
  }

  getCurrentTrack() {
    let track = this.state.queue.find(t => t.id === this.state.currentId);
    if (!track) {
      for (const plName in this.state.playlists) {
        track = this.state.playlists[plName].find(t => t.id === this.state.currentId);
        if (track) break;
      }
    }
    return track || null;
  }
}

const appStore = new Store();

class PlayerService {
  constructor() {
    this.player = null;
    this.isReady = false;
    this.progressInterval = null;
  }

  init() {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScript = document.getElementsByTagName('script')[0];
    firstScript.parentNode.insertBefore(tag, firstScript);
    window.onYouTubeIframeAPIReady = () => this.onAPIReady();
  }

  onAPIReady() {
    this.player = new YT.Player('yt-player-display', {
      height: '100%',
      width: '100%',
      videoId: appStore.state.currentId || CONFIG.DEFAULT_VIDEO_ID,
      playerVars: {
        'playsinline': 1,
        'controls': 1,
        'disablekb': 1,
        'autoplay': 0,
        'modestbranding': 1,
        'rel': 0
      },
      events: {
        'onReady': () => this.onReady(),
        'onStateChange': (e) => this.onStateChange(e),
        'onError': (e) => this.onError(e)
      }
    });
  }

  onReady() {
    this.isReady = true;
    this.setVolume(appStore.state.volume);
    this.setPlaybackRate(appStore.state.playbackRate);
    if (appStore.state.currentTime > 0) {
      this.seekTo(appStore.state.currentTime);
    }
    uiController.render();
  }

  onStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
      appStore.state.isPlaying = true;
      const currentTrack = appStore.getCurrentTrack();
      if (currentTrack && this.player.getDuration) {
        currentTrack.duration = this.player.getDuration();
        uiController.addToHistory(currentTrack);
      }
      this.startProgressTracker();
    } else if (event.data === YT.PlayerState.PAUSED) {
      appStore.state.isPlaying = false;
      this.stopProgressTracker();
    } else if (event.data === YT.PlayerState.ENDED) {
      appStore.state.isPlaying = false;
      this.stopProgressTracker();
      this.handleTrackEnded();
    }
    uiController.renderUIState();
    appStore.save();
  }

  onError(event) {
    console.warn('[PlayerService] YouTube Error:', event.data);
    const currentTrack = appStore.getCurrentTrack();
    const title = currentTrack ? currentTrack.title : 'Bài hát';
    uiController.showFeedback(`Bỏ qua video lỗi [Code ${event.data}]: ${title}`);
    if (appStore.state.settings.remove && currentTrack) {
      uiController.removeTrackFromQueue(currentTrack.id);
    }
    if (appStore.state.settings.skip) {
      setTimeout(() => uiController.skipTrack(1), 1200);
    }
  }

  loadTrack(id, autoPlay = true) {
    appStore.state.currentId = id;
    appStore.state.currentTime = 0;
    uiController.render();
    if (this.isReady && this.player) {
      this.player.loadVideoById(id, 0);
      if (!autoPlay) this.player.pauseVideo();
    }
    appStore.save();
  }

  togglePlay() {
    if (!this.isReady || !appStore.getCurrentTrack()) return;
    if (appStore.state.isPlaying) {
      this.player.pauseVideo();
    } else {
      this.player.playVideo();
    }
  }

  seekTo(seconds) {
    if (this.isReady && this.player) {
      this.player.seekTo(seconds, true);
    }
  }

  setVolume(volume) {
    if (this.isReady && this.player) {
      this.player.setVolume(volume);
    }
  }

  setPlaybackRate(rate) {
    if (this.isReady && this.player) {
      this.player.setPlaybackRate(rate);
    }
  }

  getCurrentTime() {
    return (this.isReady && this.player && this.player.getCurrentTime) ? this.player.getCurrentTime() : appStore.state.currentTime;
  }

  handleTrackEnded() {
    if (appStore.state.loop) {
      this.loadTrack(appStore.state.currentId, true);
    } else {
      uiController.skipTrack(1);
    }
  }

  startProgressTracker() {
    this.stopProgressTracker();
    this.progressInterval = setInterval(() => {
      if (this.isReady && this.player && appStore.state.isPlaying) {
        const currentTime = this.player.getCurrentTime() || 0;
        const duration = this.player.getDuration() || 0;
        uiController.updateTimeline(currentTime, duration);
      }
    }, 500);
  }

  stopProgressTracker() {
    if (this.progressInterval) clearInterval(this.progressInterval);
  }
}

const playerService = new PlayerService();

class UIController {
  constructor() {
    this.$ = id => document.getElementById(id);
  }

  formatTime(n) {
    if (!n || isNaN(n)) return '00:00';
    const m = Math.floor(n / 60);
    const s = Math.floor(n % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  escapeHtml(str) {
    return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  showFeedback(msg) {
    this.$('feedback').textContent = msg;
    this.$('drawer-feedback').textContent = msg;
    setTimeout(() => {
      if (this.$('feedback').textContent === msg) this.$('feedback').textContent = '';
      if (this.$('drawer-feedback').textContent === msg) this.$('drawer-feedback').textContent = '';
    }, CONFIG.FEEDBACK_TIMEOUT);
  }

  updateTimeline(currentTime, duration) {
    this.$('progress').max = duration;
    this.$('progress').value = currentTime;
    this.$('progress').style.setProperty('--progress', duration ? (currentTime / duration * 100) + '%' : '0%');
    this.$('elapsed').textContent = this.formatTime(currentTime);
    this.$('duration').textContent = this.formatTime(duration);
  }

  skipTrack(direction) {
    const queue = appStore.state.queue;
    if (!queue.length) return;
    let index = queue.findIndex(t => t.id === appStore.state.currentId);
    if (index === -1) index = 0;

    if (appStore.state.shuffle && queue.length > 1) {
      let nextIndex;
      do {
        nextIndex = Math.floor(Math.random() * queue.length);
      } while (nextIndex === index);
      index = nextIndex;
    } else {
      index = (index + direction + queue.length) % queue.length;
    }
    playerService.loadTrack(queue[index].id, true);
  }

  removeTrackFromQueue(id) {
    const queue = appStore.state.queue;
    const index = queue.findIndex(t => t.id === id);
    if (index === -1) return;

    queue.splice(index, 1);
    if (appStore.state.currentId === id) {
      if (queue.length > 0) {
        const nextTrack = queue[Math.min(index, queue.length - 1)];
        playerService.loadTrack(nextTrack.id, appStore.state.isPlaying);
      } else {
        appStore.state.currentId = null;
        if (playerService.player) playerService.player.stopVideo();
        this.render();
      }
    } else {
      this.renderQueue();
    }
    appStore.save();
  }

  moveTrackDown(id) {
    const queue = appStore.state.queue;
    const index = queue.findIndex(t => t.id === id);
    if (index === -1 || index === queue.length - 1) return;

    const temp = queue[index];
    queue[index] = queue[index + 1];
    queue[index + 1] = temp;
    this.renderQueue();
    appStore.save();
  }

  async fetchYouTubeMetadata(videoId) {
    try {
      const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
      const data = await res.json();
      if (data && data.title) {
        return {
          title: data.title,
          artist: data.author_name || 'YouTube Artist',
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        };
      }
    } catch (e) {
      console.warn('[Metadata] Fallback used:', e);
    }
    return {
      title: `YouTube Video (${videoId})`,
      artist: 'YouTube Channel',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    };
  }

  parseYouTubeId(input) {
    const match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : (input.length === 11 ? input : null);
  }

  async addTrackByUrlOrId(input) {
    const videoId = this.parseYouTubeId(input.trim());
    if (!videoId) {
      this.showFeedback('URL hoặc Video ID không hợp lệ.');
      return;
    }
    if (appStore.state.queue.some(t => t.id === videoId)) {
      this.showFeedback('Bài hát đã có trong hàng đợi.');
      return;
    }

    this.showFeedback('Đang lấy thông tin bài hát...');
    const meta = await this.fetchYouTubeMetadata(videoId);
    const newTrack = {
      id: videoId,
      title: meta.title,
      artist: meta.artist,
      duration: 0,
      thumbnail: meta.thumbnail
    };

    appStore.state.queue.push(newTrack);
    if (!appStore.state.currentId) {
      playerService.loadTrack(videoId, false);
    } else {
      this.renderQueue();
    }
    this.showFeedback('Đã thêm bài hát vào hàng đợi.');
    appStore.save();
  }

  addToHistory(track) {
    appStore.state.history = appStore.state.history.filter(h => h.id !== track.id);
    appStore.state.history.unshift({
      id: track.id,
      title: track.title,
      artist: track.artist,
      playedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    });
    if (appStore.state.history.length > CONFIG.MAX_HISTORY_ITEMS) appStore.state.history.pop();
    this.renderHistory();
  }

  switchPlaylist(name) {
    if (!appStore.state.playlists[name]) return;
    appStore.save();
    appStore.state.currentPlaylist = name;
    appStore.state.queue = [...appStore.state.playlists[name]];
    appStore.state.filterMode = 'all';
    this.render();
    this.toggleMobileSidebar(false);
    this.showFeedback(`Đã chuyển sang Playlist: ${name}`);
    appStore.save();
  }

  createPlaylist() {
    const name = prompt('Nhập tên Playlist mới:');
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    if (appStore.state.playlists[cleanName]) {
      this.showFeedback('Playlist này đã tồn tại!');
      return;
    }
    appStore.state.playlists[cleanName] = [];
    this.switchPlaylist(cleanName);
  }

  deletePlaylist(name) {
    if (name === 'Mặc định') {
      this.showFeedback('Không thể xóa Playlist Mặc định!');
      return;
    }
    if (confirm(`Bạn có chắc muốn xóa Playlist "${name}"?`)) {
      delete appStore.state.playlists[name];
      if (appStore.state.currentPlaylist === name) {
        this.switchPlaylist('Mặc định');
      } else {
        this.renderPlaylistsNav();
        appStore.save();
      }
    }
  }

  sharePlaylistToYouTube() {
    const videoIds = appStore.state.queue.map(t => t.id).filter(Boolean);
    if (!videoIds.length) {
      this.showFeedback('Playlist hiện tại đang trống, không thể chia sẻ!');
      return;
    }
    const ytShareUrl = `https://www.youtube.com/watch_videos?video_ids=${videoIds.join(',')}`;
    window.open(ytShareUrl, '_blank');
    this.showFeedback('Đã mở Playlist trên YouTube!');
  }

  toggleDrawer(open) {
    const drawer = this.$('drawer');
    const backdrop = this.$('backdrop');
    if (open) {
      drawer.classList.remove('hidden');
      backdrop.classList.remove('hidden');
      drawer.setAttribute('aria-hidden', 'false');
    } else {
      drawer.classList.add('hidden');
      if (this.$('sidebar').classList.contains('open')) return;
      backdrop.classList.add('hidden');
      drawer.setAttribute('aria-hidden', 'true');
    }
  }

  toggleMobileSidebar(open) {
    const sidebar = this.$('sidebar');
    const backdrop = this.$('backdrop');
    if (open) {
      sidebar.classList.add('open');
      backdrop.classList.remove('hidden');
    } else {
      sidebar.classList.remove('open');
      if (!this.$('drawer').classList.contains('hidden')) return;
      backdrop.classList.add('hidden');
    }
  }

  renderUIState() {
    const active = appStore.getCurrentTrack();
    this.$('play-status').textContent = active ? (appStore.state.isPlaying ? 'Đang phát' : 'Đã tạm dừng') : 'Hàng đợi trống';
    this.$('art').classList.toggle('is-playing', appStore.state.isPlaying && !!active);

    this.$('play').setAttribute('aria-pressed', String(appStore.state.isPlaying));
    this.$('play').innerHTML = `<i data-lucide="${appStore.state.isPlaying ? 'pause' : 'play'}"></i>`;

    this.$('favorite').setAttribute('aria-pressed', String(active && appStore.state.favorites.includes(active.id)));
    this.$('shuffle').setAttribute('aria-pressed', String(appStore.state.shuffle));
    this.$('loop').setAttribute('aria-pressed', String(appStore.state.loop));

    document.querySelectorAll('.queue-item').forEach(row => {
      row.classList.toggle('active', row.dataset.id === appStore.state.currentId);
    });
    if (window.lucide) lucide.createIcons();
  }

  renderPlaylistsNav() {
    const container = this.$('playlist-nav');
    container.innerHTML = '';
    Object.keys(appStore.state.playlists).forEach(name => {
      const btnWrapper = document.createElement('div');
      btnWrapper.className = 'pl-nav-item';
      const isSelected = appStore.state.currentPlaylist === name && appStore.state.filterMode === 'all';
      btnWrapper.innerHTML = `
        <button type="button" class="${isSelected ? 'selected' : ''}" data-pl="${this.escapeHtml(name)}">
          <i data-lucide="music"></i> <span>${this.escapeHtml(name)}</span>
        </button>
        ${name !== 'Mặc định' ? `<button type="button" class="pl-del-btn" data-del-pl="${this.escapeHtml(name)}" title="Xóa playlist"><i data-lucide="trash-2"></i></button>` : ''}
      `;
      container.appendChild(btnWrapper);
    });
    if (window.lucide) lucide.createIcons();
  }

  renderQueue() {
    const filterText = (this.$('queue-filter').value || this.$('desktop-search').value).trim().toLowerCase();
    const container = this.$('queue-list');
    container.innerHTML = '';

    let count = 0;
    appStore.state.queue.forEach(track => {
      if (appStore.state.filterMode === 'favorites' && !appStore.state.favorites.includes(track.id)) {
        return;
      }
      const matches = (track.title + ' ' + track.artist).toLowerCase().includes(filterText);
      if (!matches) return;

      count++;
      const item = document.createElement('article');
      item.className = `queue-item ${track.id === appStore.state.currentId ? 'active' : ''}`;
      item.dataset.id = track.id;
      item.innerHTML = `
        <span class="cover" style="background-image: url('${track.thumbnail || ''}')" aria-hidden="true"></span>
        <button class="queue-select" type="button">
          <strong>${this.escapeHtml(track.title)}</strong>
          <small>${this.escapeHtml(track.artist)}</small>
          <span class="playing-dot">● Đang phát</span>
        </button>
        <span class="queue-meta">${this.formatTime(track.duration)}</span>
        <button class="queue-action move" type="button" aria-label="Chuyển xuống"><i data-lucide="grip-vertical"></i></button>
        <button class="queue-action remove" type="button" aria-label="Xoá"><i data-lucide="x"></i></button>
      `;
      container.appendChild(item);
    });

    this.$('queue-count').textContent = `${count} bài`;
    this.$('queue-empty').classList.toggle('hidden', count !== 0);
    if (window.lucide) lucide.createIcons();
  }

  renderHistory() {
    const container = this.$('recent-list');
    if (!appStore.state.history.length) {
      container.innerHTML = '<p class="empty-history">Chưa có lịch sử phát</p>';
      return;
    }
    container.innerHTML = appStore.state.history.map(h => `
      <p style="color: rgb(168, 169, 196); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 6px 0;">
        ${h.playedAt} · ${this.escapeHtml(h.title)}
      </p>
    `).join('');
  }

  render() {
    const active = appStore.getCurrentTrack();
    this.$('song-title').textContent = active ? active.title : 'Chưa chọn bài hát';
    this.$('song-artist').textContent = active ? active.artist : 'Danh sách trống';
    this.$('active-playlist-label').textContent = `Playlist: ${appStore.state.currentPlaylist}${appStore.state.filterMode === 'favorites' ? ' (Yêu thích)' : ''}`;

    this.renderPlaylistsNav();
    this.renderQueue();
    this.renderHistory();
    this.renderUIState();
  }

  bindEvents() {
    const $ = this.$;

    $('play').addEventListener('click', () => playerService.togglePlay());
    $('previous').addEventListener('click', () => {
      if (playerService.isReady && playerService.getCurrentTime() > 3) {
        playerService.seekTo(0);
      } else {
        this.skipTrack(-1);
      }
    });
    $('next').addEventListener('click', () => this.skipTrack(1));

    $('progress').addEventListener('input', e => {
      const time = Number(e.target.value);
      $('elapsed').textContent = this.formatTime(time);
      playerService.seekTo(time);
    });

    $('shuffle').addEventListener('click', () => {
      appStore.state.shuffle = !appStore.state.shuffle;
      this.renderUIState();
      appStore.save();
    });

    $('loop').addEventListener('click', () => {
      appStore.state.loop = !appStore.state.loop;
      this.renderUIState();
      appStore.save();
    });

    $('favorite').addEventListener('click', () => {
      const active = appStore.getCurrentTrack();
      if (!active) return;
      const idx = appStore.state.favorites.indexOf(active.id);
      if (idx > -1) {
        appStore.state.favorites.splice(idx, 1);
        this.showFeedback('Đã xoá khỏi Yêu thích');
      } else {
        appStore.state.favorites.push(active.id);
        this.showFeedback('Đã thêm vào Yêu thích');
      }
      this.renderUIState();
      appStore.save();
    });

    document.querySelectorAll('.volume-control').forEach(input => {
      input.addEventListener('input', e => {
        appStore.state.volume = Number(e.target.value);
        document.querySelectorAll('.volume-control').forEach(el => {
          el.value = appStore.state.volume;
          el.style.setProperty('--progress', appStore.state.volume + '%');
          el.parentElement.querySelector('.volume-value').textContent = appStore.state.volume + '%';
        });
        playerService.setVolume(appStore.state.volume);
        appStore.save();
      });
    });

    const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
    $('speed').addEventListener('click', () => {
      const currIdx = speeds.indexOf(appStore.state.playbackRate);
      const nextIdx = (currIdx + 1) % speeds.length;
      appStore.state.playbackRate = speeds[nextIdx];
      $('speed').textContent = appStore.state.playbackRate + 'x';
      playerService.setPlaybackRate(appStore.state.playbackRate);
      appStore.save();
    });

    $('add-form').addEventListener('submit', e => {
      e.preventDefault();
      const val = $('add-input').value;
      if (val) {
        this.addTrackByUrlOrId(val);
        $('add-input').value = '';
      }
    });

    $('desktop-add').addEventListener('click', () => {
      const val = prompt('Nhập URL hoặc Video ID YouTube:');
      if (val) this.addTrackByUrlOrId(val);
    });

    $('paste-button').addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          $('add-input').value = text;
          this.showFeedback('Đã dán từ Clipboard.');
        }
      } catch (err) {
        this.showFeedback('Không thể truy cập Clipboard.');
      }
    });

    $('queue-list').addEventListener('click', e => {
      const row = e.target.closest('.queue-item');
      if (!row) return;
      const id = row.dataset.id;
      if (e.target.closest('.queue-select')) {
        playerService.loadTrack(id, true);
      } else if (e.target.closest('.remove')) {
        this.removeTrackFromQueue(id);
      } else if (e.target.closest('.move')) {
        this.moveTrackDown(id);
      }
    });

    $('create-playlist-btn').addEventListener('click', () => this.createPlaylist());
    $('share-yt-btn').addEventListener('click', () => this.sharePlaylistToYouTube());

    $('playlist-nav').addEventListener('click', e => {
      const delBtn = e.target.closest('[data-del-pl]');
      if (delBtn) {
        this.deletePlaylist(delBtn.dataset.delPl);
        return;
      }
      const btn = e.target.closest('[data-pl]');
      if (btn) {
        this.switchPlaylist(btn.dataset.pl);
      }
    });

    $('queue-filter').addEventListener('input', () => this.renderQueue());
    $('desktop-search').addEventListener('input', e => {
      $('queue-filter').value = e.target.value;
      this.renderQueue();
    });

    $('menu-button').addEventListener('click', () => this.toggleMobileSidebar(true));
    $('close-sidebar').addEventListener('click', () => this.toggleMobileSidebar(false));
    $('settings-button').addEventListener('click', () => this.toggleDrawer(true));
    $('volume-button').addEventListener('click', () => this.toggleDrawer(true));
    $('close-drawer').addEventListener('click', () => this.toggleDrawer(false));

    $('backdrop').addEventListener('click', () => {
      this.toggleDrawer(false);
      this.toggleMobileSidebar(false);
    });

    document.querySelectorAll('.setting-toggle').forEach(btn => {
      const key = btn.dataset.setting;
      btn.setAttribute('aria-pressed', String(appStore.state.settings[key]));
      btn.addEventListener('click', () => {
        appStore.state.settings[key] = !appStore.state.settings[key];
        document.querySelectorAll(`[data-setting="${key}"]`).forEach(el => {
          el.setAttribute('aria-pressed', String(appStore.state.settings[key]));
        });
        appStore.save();
      });
    });

    $('side-nav').addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const target = btn.dataset.target;
      document.querySelectorAll('#side-nav button').forEach(b => b.classList.toggle('selected', b === btn));

      if (target === 'favorite') {
        appStore.state.filterMode = 'favorites';
        this.render();
        this.toggleMobileSidebar(false);
        this.showFeedback('Đang hiển thị danh sách Yêu thích');
      } else if (target === 'home') {
        appStore.state.filterMode = 'all';
        this.render();
        this.toggleMobileSidebar(false);
      }
    });

    $('export-button').addEventListener('click', () => {
      appStore.save();
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appStore.state, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `musichub-backup-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      this.showFeedback('Đã xuất cấu hình JSON.');
    });

    $('import-button').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (parsed.playlists && typeof parsed.playlists === 'object') {
          appStore.state = { ...appStore.state, ...parsed };
          if (appStore.state.currentPlaylist && appStore.state.playlists[appStore.state.currentPlaylist]) {
            appStore.state.queue = [...appStore.state.playlists[appStore.state.currentPlaylist]];
          }
          this.render();
          if (appStore.state.currentId) playerService.loadTrack(appStore.state.currentId, false);
          this.showFeedback('Nhập dữ liệu thành công.');
          appStore.save();
        }
      } catch (err) {
        this.showFeedback('Tệp JSON không hợp lệ.');
      }
      e.target.value = '';
    });
  }
}

const uiController = new UIController();

document.addEventListener('DOMContentLoaded', () => {
  appStore.init();
  playerService.init();
  uiController.bindEvents();
  uiController.render();
});