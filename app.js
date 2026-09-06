/*
  YouTube Blog & Playlist Viewer
  - Resizable player and post panels
  - Playlists with editable HTML posts
  - Special elements: <yt-link> and <post-link> with hover preview and jump
  - Local persistence via localStorage
*/

// ----------------------------- Utilities -----------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function humanTruncate(html, limit = 140) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = tmp.textContent || '';
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
}

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function ytIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.slice(1);
    }
    return u.searchParams.get('v');
  } catch (e) { return null; }
}

function ytThumb(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function promptConfirm(message) {
  return window.confirm(message);
}

// ----------------------------- Data Layer -----------------------------
const STORAGE_KEY = 'ytbpv_state_v1';

/**
 * State shape:
 * {
 *   playlists: [{ id, title, videos: [{ id, title, videoId, postHtml }] }],
 *   currentPlaylistId,
 *   currentVideoId
 * }
 */
const DefaultSeed = (() => {
  // Videos list from instructions
  const vids = [
    { title: 'Cal Chuchesta - The New CALassic MIXTAPE REVIEW', url: 'https://www.youtube.com/watch?v=QBm3upSqKvw', duration: '18:00' },
    { title: 'Ghost in the Shell - Ghost City', url: 'https://www.youtube.com/watch?v=WB-ik-Bpl0c&list=RDWB-ik-Bpl0c&start_radio=1', duration: '3:22' },
    { title: 'Living AI: Lab Grown Brains...', url: 'https://www.youtube.com/watch?v=6-tafvbkLvQ', duration: '3:31' },
    { title: 'Terence McKenna - The Age of Confusion', url: 'https://www.youtube.com/watch?v=jz98R5tOqb0', duration: '24:58' },
    { title: 'Artificial Intelligence (Chat-GPT) and Buddhist Non-Self', url: 'https://www.youtube.com/watch?v=hp0zpOYkqMI&t=804s', duration: '21:13' }
  ].map(v => ({ ...v, videoId: ytIdFromUrl(v.url) }));

  const [cal, ghost, living, mckenna, buddhist] = vids;

  const playlistA = {
    id: 'pl-a',
    title: 'Review & Cyber City Notes',
    videos: [
      {
        id: 'v-cal', title: cal.title, videoId: cal.videoId, url: cal.url,
        postHtml: `
          <h2>Mixtape meta: The New CALassic</h2>
          <p>Quick notes on humor-as-critique and the mixtape's self-awareness. This pairs unexpectedly well with <yt-link data-video-id="${ghost.videoId}" data-t="15">Ghost City</yt-link> — the neon melancholy amplifies the satire.</p>
          <p>For cross-genre reflection, see our <post-link data-video-id="${mckenna.videoId}" data-playlist-id="pl-b" data-fragment-id="confusion">section on confusion</post-link> connecting media overload to cultural noise.</p>
          <h3 id="cal-hooks">Hooks</h3>
          <ul>
            <li>Deadpan delivery as framing device</li>
            <li>Meta-commentary on internet taste cycles</li>
          </ul>
        `
      },
      {
        id: 'v-ghost', title: ghost.title, videoId: ghost.videoId, url: ghost.url,
        postHtml: `
          <h2>Ghost City: chrome rain and empty streets</h2>
          <p>Echoes of urban solitude. If you're arriving from the review, jump to <yt-link data-video-id="${cal.videoId}" data-t="120">Cal at 2:00</yt-link> for a tonal contrast.</p>
          <p>Also see <yt-link data-video-id="${buddhist.videoId}" data-playlist-id="pl-b" data-t="804">Non-self @ 13:24</yt-link> for a perspective on identity drift in networks.</p>
        `
      }
    ]
  };

  const playlistB = {
    id: 'pl-b',
    title: 'Brains, Self, and Confusion',
    videos: [
      {
        id: 'v-living', title: living.title, videoId: living.videoId, url: living.url,
        postHtml: `
          <h2>Living AI: organoids in silico</h2>
          <p>Notes on embodied learning and emergent control. For an ambient palate cleanser, drift to <yt-link data-video-id="${ghost.videoId}" data-playlist-id="pl-a">Ghost City</yt-link>.</p>
        `
      },
      {
        id: 'v-mckenna', title: mckenna.title, videoId: mckenna.videoId, url: mckenna.url,
        postHtml: `
          <h2 id="confusion">The Age of Confusion</h2>
          <p>Signals, noise, and novelty. As a foil, revisit <post-link data-video-id="${cal.videoId}" data-playlist-id="pl-a" data-fragment-id="cal-hooks">Cal's hooks</post-link> — humor as a cognitive filter.</p>
        `
      },
      {
        id: 'v-buddhist', title: buddhist.title, videoId: buddhist.videoId, url: buddhist.url,
        postHtml: `
          <h2>Non-self and machine patterning</h2>
          <p>Interrogating agency. Crossfade with <yt-link data-video-id="${ghost.videoId}" data-playlist-id="pl-a">Ghost City</yt-link> to feel the ego-thin streets.</p>
        `
      }
    ]
  };

  return {
    playlists: [playlistA, playlistB],
    currentPlaylistId: 'pl-a',
    currentVideoId: 'v-cal',
    confirmLinks: true
  };
})();

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DefaultSeed);
    const parsed = JSON.parse(raw);
    if (!parsed.playlists?.length) return structuredClone(DefaultSeed);
    if (typeof parsed.confirmLinks !== 'boolean') parsed.confirmLinks = true;
    return parsed;
  } catch (e) {
    return structuredClone(DefaultSeed);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function findPlaylistById(id) { return state.playlists.find(p => p.id === id); }
function findVideoById(playlistId, videoId) {
  const p = findPlaylistById(playlistId);
  return p?.videos.find(v => v.id === videoId);
}
function findVideoGlobally(videoId) {
  for (const p of state.playlists) {
    const v = p.videos.find(x => x.videoId === videoId || x.id === videoId);
    if (v) return { playlist: p, video: v };
  }
  return null;
}

// ----------------------------- UI Rendering -----------------------------
const playlistSelect = $('#playlistSelect');
const videoList = $('#videoList');
const postContent = $('#postContent');
const noPostMsg = $('#noPostMsg');
const editorPanel = $('#editorPanel');
const postEditor = $('#postEditor');
const playerContainer = $('#playerContainer');
const postContainer = $('#postContainer');
const playerSizeReadout = $('#playerSizeReadout');
const postSizeReadout = $('#postSizeReadout');
const hoverPreview = $('#hoverPreview');
const previewThumb = $('#previewThumb');
const previewTitle = $('#previewTitle');
const previewMeta = $('#previewMeta');
const previewSnippet = $('#previewSnippet');
const previewGoBtn = $('#previewGoBtn');
const confirmToggle = $('#confirmToggle');

function renderPlaylists() {
  playlistSelect.innerHTML = '';
  for (const p of state.playlists) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.title;
    if (p.id === state.currentPlaylistId) opt.selected = true;
    playlistSelect.appendChild(opt);
  }
}

function renderVideoList() {
  videoList.innerHTML = '';
  const p = findPlaylistById(state.currentPlaylistId);
  const tpl = $('#videoListItemTemplate');
  if (!p) return;
  for (const v of p.videos) {
    const li = tpl.content.firstElementChild.cloneNode(true);
    const btn = li.querySelector('.video-entry');
    const img = li.querySelector('.video-thumb');
    const title = li.querySelector('.video-title');
    btn.dataset.videoId = v.id;
    img.src = ytThumb(v.videoId);
    img.alt = v.title;
    title.textContent = v.title;
    if (v.id === state.currentVideoId) {
      li.style.background = 'rgba(79,140,255,0.12)';
    }
    li.querySelector('.edit-post-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditorFor(v.id);
    });
    btn.addEventListener('click', () => {
      state.currentVideoId = v.id;
      saveState();
      renderVideoList();
      loadCurrentIntoUI();
    });
    videoList.appendChild(li);
  }
}

function renderPost() {
  const video = findVideoById(state.currentPlaylistId, state.currentVideoId);
  if (!video || !video.postHtml) {
    postContent.innerHTML = '';
    noPostMsg.hidden = false;
    return;
  }
  noPostMsg.hidden = true;
  postContent.innerHTML = video.postHtml;
  enhanceSpecialLinks(postContent);
}

// ----------------------------- YouTube Player -----------------------------
let player = null;
let pendingSeek = null;

window.onYouTubeIframeAPIReady = function() {
  createOrLoadPlayer();
};

function createOrLoadPlayer() {
  const video = findVideoById(state.currentPlaylistId, state.currentVideoId);
  if (!video) return;
  if (!player) {
    player = new YT.Player('player', {
      width: '100%',
      height: '100%',
      videoId: video.videoId,
      playerVars: { rel: 0, modestbranding: 1 },
      events: {
        onReady: () => { if (pendingSeek != null) { player.seekTo(pendingSeek, true); pendingSeek = null; } },
      }
    });
  } else {
    player.loadVideoById(video.videoId);
  }
}

function playVideoIdWithOptionalTime(videoId, tSeconds) {
  if (!player) return;
  if (tSeconds != null) {
    player.loadVideoById({ videoId, startSeconds: tSeconds });
  } else {
    player.loadVideoById(videoId);
  }
}

// ----------------------------- Resizing -----------------------------
function initResizable(container, sizeReadout) {
  const minW = Number(container.dataset.minWidth || 300);
  const minH = Number(container.dataset.minHeight || 200);
  const resizers = $$('.resizer', container);
  let active = null;

  function onPointerDown(e) {
    const target = e.currentTarget;
    active = { target, startX: e.clientX, startY: e.clientY, startW: container.offsetWidth, startH: container.offsetHeight };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
  }
  function onPointerMove(e) {
    if (!active) return;
    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;
    let w = active.startW;
    let h = active.startH;
    if (active.target.classList.contains('resizer-right')) w = active.startW + dx;
    if (active.target.classList.contains('resizer-left')) w = active.startW - dx;
    if (active.target.classList.contains('resizer-bottom')) h = active.startH + dy;
    if (active.target.classList.contains('resizer-top')) h = active.startH - dy;
    w = clamp(w, minW, window.innerWidth);
    h = clamp(h, minH, window.innerHeight);
    container.style.width = w + 'px';
    container.style.height = h + 'px';
    if (sizeReadout) sizeReadout.textContent = `${Math.round(w)}×${Math.round(h)}`;
  }
  function onPointerUp() {
    document.removeEventListener('pointermove', onPointerMove);
    active = null;
  }
  for (const r of resizers) r.addEventListener('pointerdown', onPointerDown);
}

// ----------------------------- Special Elements -----------------------------
function enhanceSpecialLinks(root) {
  const ytLinks = $$('yt-link', root);
  const postLinks = $$('post-link', root);

  ytLinks.forEach(link => {
    // Color coding
    const videoId = link.dataset.videoId;
    const playlistId = link.dataset.playlistId;
    const target = findVideoGlobally(videoId);
    const isSame = !!target && (playlistId ? playlistId === state.currentPlaylistId : target.playlist.id === state.currentPlaylistId);
    link.classList.toggle('link-same-playlist', !!target && isSame);
    link.classList.toggle('link-cross-playlist', !!target && !isSame);

    link.addEventListener('click', (e) => {
      e.preventDefault();
      const videoId = link.dataset.videoId;
      const playlistId = link.dataset.playlistId;
      const t = link.dataset.t ? Number(link.dataset.t) : undefined;
      const target = findVideoGlobally(videoId);
      if (!target) return;
      const shouldConfirm = confirmToggle ? confirmToggle.checked : state.confirmLinks;
      if (shouldConfirm) {
        const proceed = promptConfirm('Stop current video and jump to the linked one?');
        if (!proceed) return;
      }
      state.currentPlaylistId = playlistId || target.playlist.id;
      state.currentVideoId = target.video.id;
      saveState();
      renderPlaylists();
      renderVideoList();
      renderPost();
      playVideoIdWithOptionalTime(target.video.videoId, t);
    });
    setupHoverPreview(link, () => {
      const videoId = link.dataset.videoId;
      const target = findVideoGlobally(videoId);
      if (!target) return null;
      const t = link.dataset.t ? Number(link.dataset.t) : undefined;
      return {
        title: target.video.title,
        thumb: ytThumb(target.video.videoId),
        snippet: humanTruncate(target.video.postHtml || ''),
        timeLabel: t != null && !Number.isNaN(t) ? formatTime(t) : null
      };
    });
  });

  postLinks.forEach(link => {
    // Color coding relative to playlist destination
    const videoId = link.dataset.videoId;
    const playlistId = link.dataset.playlistId;
    const target = findVideoGlobally(videoId);
    const isSame = !!target && (playlistId ? playlistId === state.currentPlaylistId : target.playlist.id === state.currentPlaylistId);
    link.classList.toggle('link-same-playlist', !!target && isSame);
    link.classList.toggle('link-cross-playlist', !!target && !isSame);

    link.addEventListener('click', (e) => {
      e.preventDefault();
      const videoId = link.dataset.videoId;
      const playlistId = link.dataset.playlistId;
      const fragmentId = link.dataset.fragmentId;
      const target = findVideoGlobally(videoId);
      if (!target) return;
      const shouldConfirm = confirmToggle ? confirmToggle.checked : state.confirmLinks;
      if (shouldConfirm) {
        const proceed = promptConfirm('Open the linked post section?');
        if (!proceed) return;
      }
      state.currentPlaylistId = playlistId || target.playlist.id;
      state.currentVideoId = target.video.id;
      saveState();
      renderPlaylists();
      renderVideoList();
      renderPost();
      if (fragmentId) {
        const el = postContent.querySelector(`#${CSS.escape(fragmentId)}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    setupHoverPreview(link, () => {
      const videoId = link.dataset.videoId;
      const target = findVideoGlobally(videoId);
      if (!target) return null;
      return {
        title: target.video.title + ' — Post',
        thumb: ytThumb(target.video.videoId),
        snippet: humanTruncate(target.video.postHtml || '')
      };
    });
  });
}

function setupHoverPreview(element, getData) {
  let open = false;
  let hideTimeout = null;
  const show = (e) => {
    const data = getData();
    if (!data) return;
    previewThumb.src = data.thumb;
    previewTitle.textContent = data.title;
    if (data.timeLabel) {
      previewMeta.textContent = `Timestamp: ${data.timeLabel}`;
      previewMeta.hidden = false;
    } else if (previewMeta) {
      previewMeta.hidden = true;
    }
    previewSnippet.textContent = data.snippet;
    hoverPreview.hidden = false;
    positionPreviewAboveElement(element);
    open = true;
  };
  const scheduleHide = () => {
    hideTimeout = setTimeout(() => { hoverPreview.hidden = true; open = false; }, 150);
  };
  const cancelHide = () => { if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; } };

  element.addEventListener('mouseenter', show);
  element.addEventListener('mouseleave', scheduleHide);
  hoverPreview.addEventListener('mouseenter', cancelHide);
  hoverPreview.addEventListener('mouseleave', scheduleHide);
  previewGoBtn.onclick = () => { element.click(); };
}

function positionPreviewAboveElement(el) {
  const rect = el.getBoundingClientRect();
  const cardWidth = 360;
  const cardHeight = 110; // approximate
  let x = rect.left + (rect.width - cardWidth) / 2;
  let y = rect.top - cardHeight - 10;
  x = clamp(x, 8, window.innerWidth - cardWidth - 8);
  if (y < 8) y = rect.bottom + 10; // fallback below if not enough space above
  hoverPreview.style.left = Math.round(x) + 'px';
  hoverPreview.style.top = Math.round(y) + 'px';
}

// ----------------------------- Editor -----------------------------
function openEditorFor(videoId) {
  const v = findVideoById(state.currentPlaylistId, videoId);
  if (!v) return;
  editorPanel.hidden = false;
  postEditor.value = v.postHtml || '';
  editorPanel.dataset.videoId = videoId;
}

function closeEditor() {
  editorPanel.hidden = true;
  delete editorPanel.dataset.videoId;
}

$('#toggleEditorBtn').addEventListener('click', () => {
  if (editorPanel.hidden) openEditorFor(state.currentVideoId); else closeEditor();
});
$('#savePostBtn').addEventListener('click', () => {
  const videoId = editorPanel.dataset.videoId;
  const v = findVideoById(state.currentPlaylistId, videoId);
  if (!v) return;
  v.postHtml = postEditor.value;
  saveState();
  renderPost();
  closeEditor();
});
$('#discardPostBtn').addEventListener('click', () => closeEditor());

// ----------------------------- Controls -----------------------------
$('#newPlaylistBtn').addEventListener('click', () => {
  const title = prompt('New playlist title?');
  if (!title) return;
  const id = 'pl-' + Math.random().toString(36).slice(2, 8);
  state.playlists.push({ id, title, videos: [] });
  state.currentPlaylistId = id;
  state.currentVideoId = undefined;
  saveState();
  renderPlaylists();
  renderVideoList();
  renderPost();
});

$('#addVideoBtn').addEventListener('click', () => {
  const url = prompt('Paste YouTube URL');
  if (!url) return;
  const id = ytIdFromUrl(url);
  if (!id) { alert('Could not parse video id'); return; }
  const title = prompt('Video title (for display)');
  const p = findPlaylistById(state.currentPlaylistId);
  if (!p) return;
  const vidId = 'v-' + Math.random().toString(36).slice(2, 8);
  p.videos.push({ id: vidId, title: title || id, videoId: id, url, postHtml: '' });
  state.currentVideoId = vidId;
  saveState();
  renderVideoList();
  renderPost();
  if (player) player.loadVideoById(id);
});

playlistSelect.addEventListener('change', () => {
  state.currentPlaylistId = playlistSelect.value;
  const p = findPlaylistById(state.currentPlaylistId);
  if (p && p.videos.length) state.currentVideoId = p.videos[0].id;
  saveState();
  renderVideoList();
  renderPost();
  createOrLoadPlayer();
});

// ----------------------------- Initialization -----------------------------
function loadCurrentIntoUI() {
  renderPost();
  createOrLoadPlayer();
}

function init() {
  renderPlaylists();
  renderVideoList();
  loadCurrentIntoUI();
  initResizable(playerContainer, playerSizeReadout);
  initResizable(postContainer, postSizeReadout);
  // confirmation toggle
  if (typeof state.confirmLinks !== 'boolean') state.confirmLinks = true;
  if (confirmToggle) {
    confirmToggle.checked = !!state.confirmLinks;
    confirmToggle.addEventListener('change', () => {
      state.confirmLinks = confirmToggle.checked;
      saveState();
    });
  }
}

document.addEventListener('DOMContentLoaded', init);


