import * as DB from './db.js';
import { readTags } from './tags.js';
import { parseLRC, prepareLines } from './lrc.js';

/* ============================================================ helpers */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

const ICON = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  next: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
  prev: 'M6 6h2v12H6zM9.5 12l8.5 6V6z',
  shuffle: 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
  more: 'M12 8a2 2 0 100-4 2 2 0 000 4zm0 2a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-4z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  note: 'M12 3v10.55A4 4 0 1014 17V7h4V3h-6z',
  trash: 'M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  refresh: 'M17.65 6.35A7.96 7.96 0 0012 4a8 8 0 108 8h-2a6 6 0 11-1.76-4.24L13 11h7V4l-2.35 2.35z',
  lyrics: 'M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  paste: 'M19 2h-4.18C14.4.84 13.3 0 12 0S9.6.84 9.18 2H5a2 2 0 00-2 2v16a2 2 0 002 2h14a2 2 0 002-2V4a2 2 0 00-2-2zm-7 0a1 1 0 110 2 1 1 0 010-2zm7 18H5V4h2v3h10V4h2v16z',
  album: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z',
  songs: 'M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z',
  folder: 'M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  gear: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  back: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z',
};
const ic = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* Back-button friendly layers (player, album page, sheets). All closes go through history.back(). */
const layers = [];
function pushLayer(close) { layers.push(close); history.pushState({ l: layers.length }, ''); }
function popLayer() { if (layers.length) history.back(); }
addEventListener('popstate', () => { const c = layers.pop(); if (c) c(); });

/* ============================================================ state */
const audio = new Audio();
audio.preload = 'auto';
const state = {
  songs: new Map(), albums: [], folders: new Map(), art: new Map(),
  tab: 'albums', current: null,
  base: [], queue: [], qi: -1, shuffle: false, repeat: 'off',
  lines: null, activeIdx: -2,
};
let audioURL = null;
const SUPPORTS_PICKER = typeof window.showDirectoryPicker === 'function';
const AUDIO_RE = /\.(mp3|m4a|aac|flac|ogg|oga|opus|wav)$/i;

/* ============================================================ artwork + colors */
const albumKeyOf = (s) => `${(s.albumArtist || s.artist || '').toLowerCase()}|${(s.album || '').toLowerCase()}`;
const artKeyOf = (s) => (s.album ? 'a|' + albumKeyOf(s) : 't|' + s.id);
const artURLs = new Map();
function artURLByKey(k) {
  const b = state.art.get(k);
  if (!b) return '';
  let u = artURLs.get(k);
  if (!u) { u = URL.createObjectURL(b); artURLs.set(k, u); }
  return u;
}
const artURL = (s) => artURLByKey(s.artKey);
function hueOf(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function gradFor(str) { const h = hueOf(str); return `linear-gradient(150deg, hsl(${h} 62% 44%), hsl(${(h + 55) % 360} 60% 26%))`; }
function coverBG(s) { const u = artURL(s); return u ? `url("${u}")` : gradFor(s.album || s.title + s.artist); }
function coverHTML(s) {
  const u = artURL(s);
  return u ? `<img src="${u}" alt="" loading="lazy" decoding="async">` : `<div class="ph" style="background:${gradFor(s.album || s.title + s.artist)}">${ic('note')}</div>`;
}

const tintCache = new Map();
function artColor(key) {
  if (tintCache.has(key)) return Promise.resolve(tintCache.get(key));
  const u = artURLByKey(key);
  if (!u) return Promise.resolve(null);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 24;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, 24, 24);
      const d = x.getImageData(0, 0, 24, 24).data;
      let r = 0, g = 0, b = 0, w = 0;
      for (let i = 0; i < d.length; i += 4) {
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        const sat = mx ? (mx - mn) / mx : 0;
        const wt = 0.1 + sat * sat * (mx / 255);
        r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
      }
      const col = [r / w, g / w, b / w].map(Math.round);
      tintCache.set(key, col);
      res(col);
    };
    img.onerror = () => res(null);
    img.src = u;
  });
}
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  const f = (n) => { const k = (n + h * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
// light, saturated version of the cover's dominant color -> used for the lyric glow
function glowRGB(col, song) {
  if (!col) return hsl2rgb(hueOf(song.title + song.artist) / 360, 0.8, 0.78).join(',');
  let [h, s] = rgb2hsl(col);
  if (s > 0.15) s = clamp(s * 1.15 + 0.1, 0.5, 1);
  return hsl2rgb(h, s, 0.8).join(',');
}

/* ============================================================ library data */
async function loadLibrary() {
  const [songs, arts, folders] = await Promise.all([DB.all('songs'), DB.entries('art'), DB.all('folders')]);
  arts.forEach(([k, v]) => state.art.set(k, v));
  folders.forEach((f) => state.folders.set(f.id, f));
  for (const s of songs) {
    if (!s.source) s.source = 'copy';
    if (s.art) { // migrate v1 records (art stored on the song) to the shared art store
      const k = artKeyOf(s);
      if (!state.art.has(k)) { state.art.set(k, s.art); DB.put('art', s.art, k).catch(() => {}); }
      s.artKey = k;
      delete s.art;
      DB.put('songs', s).catch(() => {});
    }
    if (!s.artKey) s.artKey = artKeyOf(s);
    state.songs.set(s.id, s);
  }
  renderAll();
  songs.filter((s) => s.lyricsStatus === 'pending' || s.lyricsStatus === 'error').forEach((s) => queueLyrics(s.id));
}

function groupAlbums() {
  const m = new Map();
  for (const s of state.songs.values()) {
    const key = albumKeyOf(s);
    let a = m.get(key);
    if (!a) { a = { key, title: s.album || 'Singles', artist: s.albumArtist || s.artist || 'Unknown Artist', songs: [] }; m.set(key, a); }
    a.songs.push(s);
  }
  for (const a of m.values()) a.songs.sort((x, y) => (x.track || 999) - (y.track || 999) || x.title.localeCompare(y.title));
  return [...m.values()].sort((a, b) => a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' }) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}
const sortedSongs = () => [...state.songs.values()].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
const albumCover = (a) => a.songs.find((s) => state.art.has(s.artKey)) || a.songs[0];

const STATUS_LABEL = { synced: 'Synced', plain: 'Text only', none: 'No lyrics', pending: 'Searching…', error: 'Will retry', instrumental: 'Instrumental' };

function rowHTML(s, num) {
  return `<li class="row${s.id === state.current ? ' current' : ''}" data-id="${esc(s.id)}">
    ${num !== undefined ? `<span class="num">${num || ''}</span>` : `<div class="art">${coverHTML(s)}</div>`}
    <div class="info"><div class="t">${esc(s.title)}</div>
      <div class="s"><span>${esc(s.artist || 'Unknown artist')}${s.duration ? ' · ' + fmt(s.duration) : ''}</span><span class="pill ${s.lyricsStatus}">${STATUS_LABEL[s.lyricsStatus] || ''}</span></div></div>
    <button class="more" data-more="${esc(s.id)}" aria-label="More">${ic('more')}</button>
  </li>`;
}
const cardHTML = (a) => `<button class="card" data-album="${esc(a.key)}"><div class="cover">${coverHTML(albumCover(a))}</div><div class="ct">${esc(a.title)}</div><div class="ca">${esc(a.artist)}</div></button>`;

let albumOpen = null;
function renderAll() {
  state.albums = groupAlbums();
  const has = state.songs.size > 0;
  $('#albumGrid').innerHTML = state.albums.map(cardHTML).join('');
  $('#songList').innerHTML = sortedSongs().map((s) => rowHTML(s)).join('');
  $('#empty').classList.toggle('hidden', has || state.folders.size > 0);
  $('#songsPlay').parentElement.classList.toggle('hidden', !has);
  renderSearch();
  if (albumOpen) { const a = state.albums.find((x) => x.key === albumOpen); if (a) fillAlbum(a, false); }
}

function renderSearch() {
  const q = $('#search').value.trim().toLowerCase();
  const box = $('#searchResults');
  if (!q) { box.innerHTML = state.songs.size ? '<div class="nores">Search your library</div>' : ''; return; }
  const albums = state.albums.filter((a) => `${a.title} ${a.artist}`.toLowerCase().includes(q)).slice(0, 12);
  const songs = sortedSongs().filter((s) => `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(q)).slice(0, 200);
  const html = (albums.length ? `<div class="sect">Albums</div><div class="grid">${albums.map(cardHTML).join('')}</div>` : '') +
    (songs.length ? `<div class="sect">Songs</div><ul class="rows">${songs.map((s) => rowHTML(s)).join('')}</ul>` : '');
  box.innerHTML = html || '<div class="nores">No results</div>';
}

function updateRow(id) {
  const s = state.songs.get(id);
  if (!s) return;
  $$(`.row[data-id="${CSS.escape(id)}"] .pill`).forEach((p) => { p.className = `pill ${s.lyricsStatus}`; p.textContent = STATUS_LABEL[s.lyricsStatus] || ''; });
}
function highlightCurrent() {
  $$('.row.current').forEach((r) => r.classList.remove('current'));
  if (state.current) $$(`.row[data-id="${CSS.escape(state.current)}"]`).forEach((r) => r.classList.add('current'));
}

/* ---- banner (scan progress / permission / lyric progress) ---- */
const banners = { scan: '', lyrics: '', perm: [] };
function renderBanner() {
  let text = '', label = '', act = null;
  if (banners.scan) text = banners.scan;
  else if (banners.perm.length) { text = `Cadence needs access to “${state.folders.get(banners.perm[0])?.name || 'your music folder'}” again.`; label = 'Allow'; act = reconnect; }
  else if (banners.lyrics) text = banners.lyrics;
  $$('.banner').forEach((b) => {
    b.classList.toggle('hidden', !text);
    b.innerHTML = `<span>${esc(text)}</span>${label ? `<button>${label}</button>` : ''}`;
    b.querySelector('button')?.addEventListener('click', act);
  });
}

/* ============================================================ adding music */
function fromFilename(name) {
  const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\s*\d{1,3}[\s.\-)]+(?=\D)/, '').trim();
  const m = base.match(/^(.+?)\s+-\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: base };
}

function probeDuration(blob) {
  return new Promise((res) => {
    const a = new Audio();
    a.preload = 'metadata';
    const u = URL.createObjectURL(blob);
    let done = false;
    const fin = (d) => { if (done) return; done = true; URL.revokeObjectURL(u); a.removeAttribute('src'); res(d); };
    a.onloadedmetadata = () => fin(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => fin(0);
    setTimeout(() => fin(0), 7000);
    a.src = u;
  });
}

// Reads tags from one file and saves the song (+ shared cover art). Returns the song.
async function ingestFile(file, { id, source, handle, folderId, prev }) {
  const tags = await readTags(file);
  const fb = fromFilename(file.name);
  const song = {
    id, fileName: file.name, source, handle: handle || null, folderId: folderId || null,
    title: tags.title || fb.title, artist: tags.artist || fb.artist, album: tags.album, albumArtist: tags.albumArtist, track: tags.track,
    duration: prev?.duration || 0, size: file.size, mtime: file.lastModified,
    offset: prev?.offset || 0, addedAt: prev?.addedAt || Date.now(), lyricsStatus: prev?.lyricsStatus || 'pending',
  };
  song.artKey = artKeyOf(song);
  if (tags.art && !state.art.has(song.artKey)) {
    state.art.set(song.artKey, tags.art);
    await DB.put('art', tags.art, song.artKey);
  }
  if (source === 'copy') await DB.put('files', file, id);
  await DB.put('songs', song);
  state.songs.set(id, song);
  return song;
}

/* ---- a) picked music folder (File System Access API): read in place, nothing copied ---- */
async function* walk(dir, prefix = '') {
  for await (const [name, h] of dir.entries()) {
    if (name.startsWith('.')) continue;
    if (h.kind === 'directory') yield* walk(h, prefix + name + '/');
    else if (AUDIO_RE.test(name)) yield { handle: h, path: prefix + name };
  }
}

async function ensurePermission(folder, request) {
  const h = folder.handle;
  if (!h?.queryPermission) return true;
  try {
    let p = await h.queryPermission({ mode: 'read' });
    if (p !== 'granted' && request) p = await h.requestPermission({ mode: 'read' });
    return p === 'granted';
  } catch { return false; }
}

const scanning = new Set();
async function scanFolder(folder) {
  if (scanning.has(folder.id)) return;
  if (!(await ensurePermission(folder, false))) { if (!banners.perm.includes(folder.id)) banners.perm.push(folder.id); renderBanner(); return; }
  scanning.add(folder.id);
  banners.scan = `Scanning “${folder.name}”…`;
  renderBanner();
  const seen = new Set();
  let n = 0, added = 0, lastRender = 0, complete = false;
  try {
    for await (const { handle, path } of walk(folder.handle)) {
      const id = `h|${folder.id}|${path}`;
      seen.add(id);
      n++;
      const file = await handle.getFile();
      const ex = state.songs.get(id);
      if (!(ex && ex.size === file.size && ex.mtime === file.lastModified)) {
        try {
          const song = await ingestFile(file, { id, source: 'handle', handle, folderId: folder.id, prev: ex });
          if (!ex) { added++; queueLyrics(id); }
          else if (ex.title !== song.title) queueLyrics(id);
        } catch (e) { console.warn('skip', path, e); }
      }
      if (n % 15 === 0) {
        banners.scan = `Scanning “${folder.name}”… ${n} songs`;
        renderBanner();
        if (performance.now() - lastRender > 1500) { renderAll(); lastRender = performance.now(); }
        await sleep(0);
      }
    }
    complete = true;
  } catch (e) {
    console.warn('scan failed', e);
    if (e.name === 'NotAllowedError' && !banners.perm.includes(folder.id)) banners.perm.push(folder.id);
    else toast('Couldn’t finish scanning ' + folder.name);
  }
  let removed = 0;
  if (complete) { // drop songs whose files were deleted from the folder
    for (const s of [...state.songs.values()]) {
      if (s.folderId === folder.id && !seen.has(s.id)) { await removeSong(s.id, true); removed++; }
    }
  }
  scanning.delete(folder.id);
  banners.scan = '';
  renderBanner();
  renderAll();
  if (complete && (added || removed)) toast(`${added ? `Added ${added} song${added > 1 ? 's' : ''}` : ''}${added && removed ? ', ' : ''}${removed ? `removed ${removed}` : ''}`);
}

async function addFolderHandle(handle) {
  for (const f of state.folders.values()) {
    try { if (await f.handle.isSameEntry(handle)) { toast('That folder is already in Cadence'); return scanFolder(f); } } catch {}
  }
  const folder = { id: 'f' + Date.now().toString(36), name: handle.name || 'Music', handle, addedAt: Date.now() };
  await DB.put('folders', folder);
  state.folders.set(folder.id, folder);
  renderAll();
  navigator.storage?.persist?.();
  return scanFolder(folder);
}

async function addFolder() {
  if (!SUPPORTS_PICKER) { $('#dirInput').click(); return; }
  let handle;
  try {
    try { handle = await window.showDirectoryPicker({ id: 'cadence-music', mode: 'read', startIn: 'music' }); }
    catch (e) { if (e instanceof TypeError) handle = await window.showDirectoryPicker({ mode: 'read' }); else throw e; }
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.warn(e);
    toast('Android wouldn’t share that folder. Try your Music folder or a subfolder of it.');
    return;
  }
  addFolderHandle(handle);
}

async function reconnect() {
  const f = state.folders.get(banners.perm[0]);
  if (!f) { banners.perm.shift(); renderBanner(); return; }
  if (await ensurePermission(f, true)) { banners.perm.shift(); renderBanner(); scanFolder(f); }
  else toast('Permission wasn’t granted');
}

let lastCheck = 0;
async function checkFolders() {
  lastCheck = Date.now();
  for (const f of state.folders.values()) await scanFolder(f);
}

/* ---- b) fallback: individual files / folder input without persistent access (songs are copied in) ---- */
async function importFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('audio/') || AUDIO_RE.test(f.name));
  if (!files.length) return toast('No audio files found');
  let added = 0, n = 0, lastRender = 0;
  for (const f of files) {
    n++;
    banners.scan = `Importing ${n} of ${files.length}…`;
    renderBanner();
    const id = `${f.webkitRelativePath || f.name}|${f.size}|${f.lastModified}`;
    if (state.songs.has(id)) continue;
    try {
      await ingestFile(f, { id, source: 'copy' });
      added++;
      queueLyrics(id);
    } catch (e) {
      console.error(e);
      toast('Storage is full — stopped importing');
      break;
    }
    if (performance.now() - lastRender > 1200) { renderAll(); lastRender = performance.now(); await sleep(0); }
  }
  banners.scan = '';
  renderBanner();
  renderAll();
  if (added) { toast(`Added ${added} song${added > 1 ? 's' : ''}`); navigator.storage?.persist?.(); }
  else toast('Those songs are already in Cadence');
}

async function removeSong(id, silent) {
  const s = state.songs.get(id);
  if (state.current === id) {
    audio.pause(); audio.removeAttribute('src'); state.current = null;
    $('#mini').classList.add('hidden');
    if (playerOpen) popLayer();
  }
  await Promise.all([DB.del('songs', id), DB.del('files', id), DB.del('lyrics', id)]).catch(() => {});
  state.songs.delete(id);
  if (!silent) renderAll();
  return s;
}

async function getAudioBlob(song, interactive = true) {
  if (song.source === 'handle') {
    try { return await song.handle.getFile(); }
    catch (e) {
      const folder = state.folders.get(song.folderId);
      if (interactive && folder && e.name !== 'NotFoundError' && (await ensurePermission(folder, true))) return song.handle.getFile();
      throw e;
    }
  }
  return DB.get('files', song.id);
}

async function ensureDuration(song) {
  if (song.duration) return song.duration;
  try {
    const blob = await getAudioBlob(song, false);
    if (blob) { song.duration = await probeDuration(blob); DB.put('songs', song).catch(() => {}); }
  } catch {}
  return song.duration || 0;
}

/* ============================================================ LRCLIB */
const LRCLIB = 'https://lrclib.net/api';

function cleanTitle(t) {
  return t
    .replace(/\s*[(\[][^)\]]*(feat|ft\.|remaster|live|version|edit|mix|explicit|deluxe|bonus)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(.*(remaster|version|live|edit|mix).*)$/i, '')
    .replace(/\s+(feat\.?|ft\.?)\s+.*$/i, '')
    .trim();
}
const firstArtist = (a) => a.split(/\s*(?:,|&|;| feat\.?| ft\.?| x )\s*/i)[0].trim();

function pickBest(results, dur) {
  const ok = (results || []).filter((r) => r && (r.syncedLyrics || r.plainLyrics || r.instrumental));
  const score = (r) => {
    let s = r.syncedLyrics ? 100 : r.plainLyrics ? 40 : 0;
    if (dur && r.duration) { const d = Math.abs(r.duration - dur); s += d <= 2 ? 50 : d <= 5 ? 20 : -Math.min(d, 60) / 2; }
    return s;
  };
  const best = ok.sort((a, b) => score(b) - score(a))[0];
  if (best && dur && best.duration && Math.abs(best.duration - dur) > 15 && !best.instrumental) return null; // probably another version
  return best || null;
}

async function jget(url) {
  const r = await fetch(url);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// Returns a LRCLIB record, or null for "definitely nothing". Throws on network errors (so we can retry later).
async function lrclibLookup(song, q = {}) {
  const title = q.title ?? song.title, artist = q.artist ?? song.artist, album = q.album ?? song.album ?? '';
  const dur = Math.round(song.duration || 0);
  if (title && artist && dur && !q.title) { // exact signature match = best version
    const p = new URLSearchParams({ track_name: title, artist_name: artist, album_name: album, duration: dur });
    try {
      const j = await jget(`${LRCLIB}/get?${p}`);
      if (j && (j.syncedLyrics || j.plainLyrics || j.instrumental)) return j;
    } catch (e) { if (e instanceof TypeError) throw e; }
  }
  const attempts = [{ track_name: title, ...(artist && { artist_name: artist }) }];
  const ct = cleanTitle(title), ca = firstArtist(artist || '');
  if (ct !== title || ca !== artist) attempts.push({ track_name: ct, ...(ca && { artist_name: ca }) });
  attempts.push({ q: `${ca} ${ct}`.trim() });
  for (const a of attempts) {
    const best = pickBest(await jget(`${LRCLIB}/search?${new URLSearchParams(a)}`), dur);
    if (best) return best;
  }
  return null;
}

const lq = [];
let lqRunning = false;
function queueLyrics(id, front = false) {
  if (lq.includes(id)) return;
  front ? lq.unshift(id) : lq.push(id);
  runQueue();
}
async function runQueue() {
  if (lqRunning) return;
  lqRunning = true;
  while (lq.length) {
    const s = state.songs.get(lq.shift());
    if (!s) continue;
    banners.lyrics = `Finding lyrics… ${lq.length + 1} left`;
    renderBanner();
    await ensureDuration(s);
    await resolveLyrics(s);
    await sleep(200);
  }
  lqRunning = false;
  banners.lyrics = '';
  renderBanner();
}

async function setSongStatus(song, status) {
  song.lyricsStatus = status;
  updateRow(song.id);
  try { await DB.put('songs', song); } catch {}
}

async function resolveLyrics(song, q) {
  await setSongStatus(song, 'pending');
  let found = null;
  try {
    const hit = await lrclibLookup(song, q);
    if (hit) {
      const rec = { synced: hit.syncedLyrics || '', plain: hit.plainLyrics || '', instrumental: !!hit.instrumental, source: 'lrclib', lrclibId: hit.id, fetchedAt: Date.now() };
      await DB.put('lyrics', rec, song.id);
      await setSongStatus(song, rec.synced ? 'synced' : rec.plain ? 'plain' : 'instrumental');
      found = rec;
    } else {
      await DB.put('lyrics', { synced: '', plain: '', none: true, fetchedAt: Date.now() }, song.id);
      await setSongStatus(song, 'none');
    }
  } catch (e) {
    console.warn('lyrics lookup failed', e);
    await setSongStatus(song, 'error');
  }
  if (state.current === song.id) loadLyrics();
  return found;
}

addEventListener('online', () => {
  for (const s of state.songs.values()) if (s.lyricsStatus === 'error' || s.lyricsStatus === 'pending') queueLyrics(s.id);
});

/* ============================================================ playback */
function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function buildQueue(startId) {
  if (state.shuffle) {
    state.queue = [startId, ...shuffleArr(state.base.filter((x) => x !== startId))];
    state.qi = 0;
  } else {
    state.queue = state.base.slice();
    state.qi = Math.max(0, state.queue.indexOf(startId));
  }
}
function syncModes() {
  $('#btnShuffle').classList.toggle('on', state.shuffle);
  const b = $('#btnRepeat');
  b.classList.toggle('on', state.repeat !== 'off');
  b.innerHTML = ic('repeat') + (state.repeat === 'one' ? '<b class="badge">1</b>' : '');
}

function playIds(ids, startId, opts = {}) {
  if (!ids.length) return;
  if (opts.shuffle !== undefined) { state.shuffle = opts.shuffle; syncModes(); }
  if (state.shuffle && opts.shuffle && !startId) startId = ids[Math.floor(Math.random() * ids.length)];
  startId = startId || ids[0];
  state.base = ids.slice();
  buildQueue(startId);
  loadSong(startId);
}

async function loadSong(id, autoplay = true) {
  const song = state.songs.get(id);
  if (!song) return;
  state.current = id;
  updateNowPlaying(song);
  setMediaSession(song);
  highlightCurrent();
  loadLyrics();
  let blob;
  try { blob = await getAudioBlob(song); }
  catch (e) {
    console.warn(e);
    toast(e.name === 'NotFoundError' ? 'That file moved. Rescan your folder from Settings.' : 'Couldn’t open this song');
    return;
  }
  if (!blob) return toast('Audio file is missing');
  if (state.current !== id) return; // skipped while loading
  if (audioURL) URL.revokeObjectURL(audioURL);
  audioURL = URL.createObjectURL(blob);
  audio.src = audioURL;
  if (autoplay) { try { await audio.play(); } catch (e) { console.warn(e); } }
}

function next(auto) {
  if (!state.queue.length) return;
  if (auto && state.repeat === 'one') { audio.currentTime = 0; audio.play(); return; }
  let i = state.qi + 1;
  if (i >= state.queue.length) {
    if (auto && state.repeat !== 'all') { audio.pause(); audio.currentTime = 0; return; }
    i = 0;
  }
  state.qi = i;
  loadSong(state.queue[i]);
}
function prev() {
  if (!state.queue.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  state.qi = state.qi - 1 < 0 ? state.queue.length - 1 : state.qi - 1;
  loadSong(state.queue[state.qi]);
}
const togglePlay = () => { if (!state.current) return; audio.paused ? audio.play().catch(() => {}) : audio.pause(); };

audio.addEventListener('ended', () => next(true));
audio.addEventListener('play', () => { syncPlayIcons(); kick(); updatePositionState(); });
audio.addEventListener('pause', () => { syncPlayIcons(); tick(); updatePositionState(); });
audio.addEventListener('seeked', () => { tick(); updatePositionState(); });
audio.addEventListener('loadedmetadata', () => {
  const s = state.songs.get(state.current);
  if (s && isFinite(audio.duration) && Math.abs((s.duration || 0) - audio.duration) > 0.5) { s.duration = audio.duration; DB.put('songs', s).catch(() => {}); }
  tick(); updatePositionState();
});
audio.addEventListener('timeupdate', () => { if (!playerOpen) tick(); });

function syncPlayIcons() {
  const icn = ic(audio.paused ? 'play' : 'pause');
  $('#btnPlay').innerHTML = icn;
  $('#miniPlay').innerHTML = icn;
  $('#player').classList.toggle('paused', audio.paused);
}

function updateNowPlaying(song) {
  const artist = song.artist || 'Unknown artist';
  for (const [sel, v] of [['#pTitle', song.title], ['#pTitleS', song.title], ['#miniTitle', song.title], ['#pArtist', artist], ['#pArtistS', artist], ['#miniArtist', artist]]) $(sel).textContent = v;
  const bg = coverBG(song);
  $('#npArt').style.backgroundImage = bg;
  $('#miniArt').style.backgroundImage = bg;
  $('#mini').classList.remove('hidden');
  paintBackground(song);
}

async function paintBackground(song) {
  const bgEl = $('#bg');
  const u = artURL(song);
  if (u) {
    const img = new Image(); // tiny copy of the cover scaled up = free, soft color wash
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      c.getContext('2d').drawImage(img, 0, 0, 32, 32);
      if (state.current === song.id) bgEl.style.backgroundImage = `url(${c.toDataURL('image/jpeg', 0.8)})`;
    };
    img.src = u;
  } else {
    const h = hueOf(song.title + song.artist);
    bgEl.style.backgroundImage = `linear-gradient(160deg, hsl(${h} 70% 38%), hsl(${(h + 60) % 360} 65% 22%))`;
  }
  const col = u ? await artColor(song.artKey) : null;
  if (state.current === song.id) $('#player').style.setProperty('--glow', glowRGB(col, song));
}

function setMediaSession(song) {
  if (!('mediaSession' in navigator)) return;
  const a = artURL(song);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title, artist: song.artist, album: song.album || '',
    artwork: a ? [{ src: a, sizes: '512x512', type: state.art.get(song.artKey)?.type || 'image/jpeg' }] : [],
  });
  const h = (n, f) => { try { navigator.mediaSession.setActionHandler(n, f); } catch {} };
  h('play', () => audio.play());
  h('pause', () => audio.pause());
  h('previoustrack', prev);
  h('nexttrack', () => next(false));
  h('seekto', (d) => { audio.currentTime = d.seekTime; });
  h('seekbackward', (d) => { audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)); });
  h('seekforward', (d) => { audio.currentTime = Math.min(audio.duration || 1e9, audio.currentTime + (d.seekOffset || 10)); });
}
function updatePositionState() {
  if (!('mediaSession' in navigator) || !isFinite(audio.duration)) return;
  try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate || 1 }); } catch {}
}

/* ============================================================ now playing view */
let playerOpen = false;
const player = $('#player');
function openPlayer() {
  if (playerOpen || !state.current) return;
  playerOpen = true;
  player.classList.add('open');
  pushLayer(() => { playerOpen = false; player.classList.remove('open'); });
  state.activeIdx = -2;
  tick(true);
  kick();
}

// Artwork <-> lyrics: the cover glides between the big slot and the small header slot (FLIP).
let lyricsMode = store.get('cadence.lyrics', '1') !== '0';
function setLyricsMode(on, animate = true) {
  lyricsMode = on;
  store.set('cadence.lyrics', on ? '1' : '0');
  const art = $('#npArt');
  const first = art.getBoundingClientRect();
  player.classList.toggle('lyrics-mode', on);
  (on ? $('#slotSmall') : $('#slotBig')).append(art);
  $('#btnLyricsToggle').classList.toggle('on', on);
  if (animate && playerOpen && !matchMedia('(prefers-reduced-motion: reduce)').matches && art.animate) {
    const last = art.getBoundingClientRect();
    if (last.width) {
      art.animate(
        [{ transformOrigin: 'top left', transform: `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${first.width / last.width})` },
         { transformOrigin: 'top left', transform: 'none' }],
        { duration: 480, easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)' }
      );
    }
  }
  if (on) { state.activeIdx = -2; tick(true); }
}

/* ---- seek bar ---- */
let seeking = false;
const seek = $('#seek');
seek.addEventListener('input', () => {
  seeking = true;
  const t = (seek.value / 1000) * (audio.duration || 0);
  $('#tCur').textContent = fmt(t);
  seek.style.setProperty('--pct', seek.value / 10 + '%');
});
seek.addEventListener('change', () => {
  audio.currentTime = (seek.value / 1000) * (audio.duration || 0);
  seeking = false;
  state.activeIdx = -2;
});

/* ---- time + render loop ---- */
let raf = 0, lastA = -1, lastP = 0;
function nowTime() {
  const a = audio.currentTime, p = performance.now();
  if (a !== lastA) { lastA = a; lastP = p; }
  return audio.paused ? a : a + Math.min(0.2, ((p - lastP) / 1000) * audio.playbackRate);
}
const songOffset = () => state.songs.get(state.current)?.offset || 0;

function tick(force) {
  const cur = nowTime(), dur = audio.duration || state.songs.get(state.current)?.duration || 0;
  const pct = dur ? clamp(cur / dur, 0, 1) : 0;
  $('#miniProg').style.setProperty('--p', pct * 100 + '%');
  if (!playerOpen) return;
  if (!seeking) {
    seek.value = pct * 1000;
    seek.style.setProperty('--pct', pct * 100 + '%');
    $('#tCur').textContent = fmt(cur);
  }
  $('#tDur').textContent = fmt(dur);
  if (state.lines && lyricsMode) updateLyrics(cur + songOffset(), force);
}
function loop() {
  tick();
  raf = !audio.paused && playerOpen ? requestAnimationFrame(loop) : 0;
}
function kick() { if (!raf && playerOpen) raf = requestAnimationFrame(loop); }

/* ============================================================ lyrics view */
const box = $('#lyrics'), inner = $('#lyricsInner');
let els = []; // [{line, el, words:[{el,s,e,last}], dots, cls}]
let userUntil = 0, progUntil = 0, resumeTimer = 0;

function showMessage(title, body = '') {
  state.lines = null; els = [];
  inner.innerHTML = `<div class="msg"><b>${esc(title)}</b>${esc(body)}</div>`;
}

async function loadLyrics() {
  const id = state.current;
  const song = state.songs.get(id);
  if (!song) return;
  const rec = await DB.get('lyrics', id);
  if (id !== state.current) return;
  state.activeIdx = -2;
  box.scrollTop = 0;
  if (!rec) {
    if (song.lyricsStatus === 'error') showMessage('Couldn’t reach LRCLIB', 'Lyrics will be fetched automatically when you’re back online.');
    else { showMessage('Looking for lyrics…'); queueLyrics(id, true); }
    return;
  }
  if (rec.synced) {
    const parsed = parseLRC(rec.synced);
    if (parsed.length) return renderSynced(prepareLines(parsed, song.duration || audio.duration));
  }
  if (rec.plain) return renderPlain(rec.plain);
  if (rec.instrumental) return showMessage('Instrumental', 'No lyrics for this one.');
  showMessage('No lyrics found', 'Open the ⋯ menu to search with a different title or paste your own LRC.');
}

function wordSpans(words) {
  const frag = document.createDocumentFragment();
  const out = [];
  for (const w of words) {
    if (w.pre) frag.append(w.pre);
    const sp = document.createElement('span');
    sp.className = 'w';
    sp.textContent = w.text;
    frag.append(sp);
    if (w.post) frag.append(w.post);
    out.push({ el: sp, s: w.s, e: w.e, last: -1 });
  }
  return { frag, out };
}

function renderSynced(lines) {
  state.lines = lines;
  inner.textContent = '';
  els = lines.map((line, i) => {
    const el = document.createElement('div');
    el.className = 'line future';
    el.dataset.i = i;
    if (line.gap) {
      el.classList.add('gap');
      if (line.showDots) { el.classList.add('show'); el.innerHTML = '<i></i><i></i><i></i>'; }
      inner.append(el);
      return { line, el, words: [], dots: [...el.querySelectorAll('i')], cls: '' };
    }
    const { frag, out } = wordSpans(line.words);
    el.append(frag);
    inner.append(el);
    return { line, el, words: out, dots: [], cls: '' };
  });
  state.activeIdx = -2;
  tick(true);
}

function renderPlain(text) {
  state.lines = null; els = [];
  inner.textContent = '';
  const note = document.createElement('div');
  note.className = 'plain-note';
  note.textContent = 'These lyrics aren’t time-synced.';
  inner.append(note);
  for (const ln of text.replace(/\r/g, '').split('\n')) {
    const el = document.createElement('div');
    el.className = 'line plain';
    el.innerHTML = ln.trim() ? `<span class="w">${esc(ln)}</span>` : '<br>';
    inner.append(el);
  }
}

function findActive(t) {
  const L = state.lines;
  let lo = 0, hi = L.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (L[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

function updateLyrics(t, force) {
  const idx = findActive(t);
  if (idx !== state.activeIdx || force) {
    const prevIdx = state.activeIdx;
    state.activeIdx = idx;
    for (let i = 0; i < els.length; i++) {
      const e = els[i];
      const d = Math.abs(i - idx);
      const cls = i < idx ? (d > 5 ? 'past far' : 'past') : i === idx ? 'active' : d > 5 ? 'future far' : 'future';
      if (e.cls !== cls) {
        e.words.forEach((w) => { w.el.style.removeProperty('--p'); w.last = -1; }); // past/future are driven by CSS
        e.el.className = 'line ' + cls + (e.line.gap ? ' gap' + (e.line.showDots ? ' show' : '') : '');
        e.cls = cls;
      }
      e.el.style.setProperty('--d', Math.min(d, 5));
    }
    if (idx >= 0) scrollToActive(prevIdx === -2 || Math.abs(idx - prevIdx) > 6 ? 'auto' : 'smooth');
  }
  const a = els[idx];
  if (!a) return;
  if (a.line.gap) { // instrumental break: three dots fill up
    const p = clamp((t - a.line.t) / Math.max(0.5, a.line.end - a.line.t), 0, 1);
    a.dots.forEach((d, k) => {
      const v = clamp(p * 3 - k, 0, 1);
      d.style.opacity = 0.28 + 0.72 * v;
      d.style.transform = `scale(${0.8 + 0.35 * v})`;
    });
    return;
  }
  for (const w of a.words) { // word / letter sweep on the active line
    const p = clamp((t - w.s) / Math.max(0.05, w.e - w.s), 0, 1);
    if (Math.abs(p - w.last) > 0.004) { w.el.style.setProperty('--p', p.toFixed(3)); w.last = p; }
  }
}

function scrollToActive(behavior = 'smooth') {
  const e = els[state.activeIdx];
  if (!e || performance.now() < userUntil) return;
  const top = e.el.offsetTop - box.clientHeight * 0.3;
  progUntil = performance.now() + 1000;
  box.scrollTo({ top: Math.max(0, top), behavior });
}
function userScrolled() {
  userUntil = performance.now() + 4000;
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => { userUntil = 0; scrollToActive('smooth'); }, 4100);
}
box.addEventListener('touchstart', userScrolled, { passive: true });
box.addEventListener('wheel', userScrolled, { passive: true });
box.addEventListener('scroll', () => { if (performance.now() > progUntil) userScrolled(); }, { passive: true });

inner.addEventListener('click', (ev) => {
  const el = ev.target.closest('.line');
  if (!el || !state.lines || el.dataset.i === undefined) return;
  audio.currentTime = Math.max(0, state.lines[+el.dataset.i].t - songOffset() + 0.01);
  userUntil = 0;
  state.activeIdx = -2;
  tick(true);
});

/* ============================================================ album page, tabs */
function fillAlbum(a, reset = true) {
  const cover = albumCover(a);
  $('#albArt').style.backgroundImage = coverBG(cover);
  $('#albTitle').textContent = a.title;
  $('#albArtist').textContent = a.artist;
  const total = a.songs.reduce((n, s) => n + (s.duration || 0), 0);
  $('#albMeta').textContent = `${a.songs.length} song${a.songs.length > 1 ? 's' : ''}${total ? ' · ' + Math.round(total / 60) + ' min' : ''}`;
  $('#albTracks').innerHTML = a.songs.map((s, i) => rowHTML(s, s.track || i + 1)).join('');
  if (reset) $('#album .page-scroll').scrollTop = 0;
  artColor(cover.artKey).then((c) => { if (albumOpen === a.key) $('#album').style.setProperty('--tint', c ? `rgba(${c.join(',')}, 0.6)` : 'rgba(120, 80, 255, 0.35)'); });
}
function openAlbum(key) {
  const a = state.albums.find((x) => x.key === key);
  if (!a) return;
  albumOpen = key;
  fillAlbum(a);
  $('#album').classList.add('open');
  pushLayer(() => { albumOpen = null; $('#album').classList.remove('open'); });
}

const TABS = ['albums', 'songs', 'search'];
function showTab(name) {
  if (albumOpen) { popLayer(); }
  state.tab = name;
  TABS.forEach((t) => $(`#tab-${t}`).classList.toggle('hidden', t !== name));
  $$('.tabbtn').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $('#tabbar').style.setProperty('--i', TABS.indexOf(name));
}

/* ============================================================ sheets */
const sheet = $('#sheet'), panel = $('#sheetPanel');
function openSheet(html, bind) {
  panel.innerHTML = `<div class="grab"></div>${html}`;
  bind?.(panel);
  if (!sheet.classList.contains('open')) {
    sheet.classList.add('open');
    pushLayer(() => sheet.classList.remove('open'));
  }
}
$('#sheet .scrim').addEventListener('click', popLayer);

function settingsSheet() {
  const counts = new Map();
  let copies = 0;
  for (const s of state.songs.values()) { if (s.folderId) counts.set(s.folderId, (counts.get(s.folderId) || 0) + 1); else copies++; }
  const folders = [...state.folders.values()];
  openSheet(
    `<h3>Cadence</h3><div class="sub">${state.songs.size} songs · ${state.albums.length} albums</div>
     ${folders.map((f) => `<div class="opt folder">${ic('folder')}<div class="grow">${esc(f.name)}<small>${counts.get(f.id) || 0} songs · read in place</small></div><button class="pill-btn glass" data-rm="${esc(f.id)}" style="flex:none;height:36px;padding:0 14px;font-size:14px;color:#ff8a8a">Remove</button></div>`).join('')}
     ${copies ? `<div class="opt">${ic('note')}<div class="grow">Added individually<small>${copies} songs stored inside the app</small></div></div>` : ''}
     <hr class="sep">
     <button class="opt" data-a="folder">${ic('folder')}<span class="grow">Add a music folder<small>${SUPPORTS_PICKER ? 'Songs stay where they are — nothing is copied' : 'This browser can’t remember folders, so songs are copied into the app'}</small></span></button>
     <button class="opt" data-a="rescan">${ic('refresh')}<span class="grow">Rescan folders<small>Pick up new or removed songs</small></span></button>
     <button class="opt" data-a="files">${ic('plus')}<span class="grow">Add individual songs</span></button>
     <button class="opt" data-a="lyrics">${ic('lyrics')}<span class="grow">Find missing lyrics</span></button>`,
    (p) => p.addEventListener('click', async (ev) => {
      const rm = ev.target.closest('[data-rm]')?.dataset.rm;
      if (rm) {
        const f = state.folders.get(rm);
        popLayer();
        if (!f || !confirm(`Remove “${f.name}” from Cadence? Your files are not touched.`)) return;
        for (const s of [...state.songs.values()]) if (s.folderId === rm) await removeSong(s.id, true);
        await DB.del('folders', rm);
        state.folders.delete(rm);
        banners.perm = banners.perm.filter((x) => x !== rm);
        renderBanner(); renderAll();
        return;
      }
      const a = ev.target.closest('[data-a]')?.dataset.a;
      if (a === 'folder') { popLayer(); setTimeout(addFolder, 60); }
      else if (a === 'files') { popLayer(); $('#file').click(); }
      else if (a === 'rescan') { popLayer(); checkFolders(); }
      else if (a === 'lyrics') {
        popLayer();
        const missing = [...state.songs.values()].filter((s) => s.lyricsStatus !== 'synced');
        missing.forEach((s) => queueLyrics(s.id));
        toast(missing.length ? `Looking up ${missing.length} songs…` : 'Every song has synced lyrics');
      }
    })
  );
}

function songMenu(id) {
  const s = state.songs.get(id);
  if (!s) return;
  openSheet(
    `<h3>${esc(s.title)}</h3><div class="sub">${esc(s.artist || 'Unknown artist')}</div>
     <button class="opt" data-a="lyrics">${ic('refresh')}Find lyrics again</button>
     <button class="opt danger" data-a="del">${ic('trash')}Remove from Cadence</button>`,
    (p) => p.addEventListener('click', async (ev) => {
      const a = ev.target.closest('[data-a]')?.dataset.a;
      if (a === 'lyrics') { popLayer(); queueLyrics(id, true); toast('Looking for lyrics…'); }
      if (a === 'del') {
        popLayer();
        if (!confirm(`Remove “${s.title}” from Cadence?${s.source === 'handle' ? ' (The file stays in your folder and may come back on rescan.)' : ''}`)) return;
        await removeSong(id);
      }
    })
  );
}

function lyricMenu() {
  const s = state.songs.get(state.current);
  if (!s) return;
  const off = () => `${s.offset >= 0 ? '+' : '−'}${Math.abs(s.offset).toFixed(1)}s`;
  openSheet(
    `<h3>Lyrics</h3><div class="sub">${esc(STATUS_LABEL[s.lyricsStatus] || '')} · source: LRCLIB</div>
     <div class="stepper"><div class="lbl">Timing<small>Nudge if lyrics run early or late</small></div>
       <div class="ctl"><button data-a="later">Later</button><output id="offOut">${off()}</output><button data-a="earlier">Earlier</button></div></div>
     <hr class="sep">
     <button class="opt" data-a="refetch">${ic('refresh')}Re-fetch from LRCLIB</button>
     <button class="opt" data-a="search">${ic('search')}Search with a different title / artist</button>
     <button class="opt" data-a="paste">${ic('paste')}Paste lyrics or LRC</button>
     <button class="opt danger" data-a="clear">${ic('trash')}Remove lyrics</button>`,
    (p) => p.addEventListener('click', async (ev) => {
      const a = ev.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      if (a === 'earlier' || a === 'later') {
        s.offset = Math.round((s.offset + (a === 'earlier' ? 0.1 : -0.1)) * 10) / 10;
        $('#offOut').textContent = off();
        DB.put('songs', s).catch(() => {});
        tick(true);
      } else if (a === 'refetch') { popLayer(); toast('Searching LRCLIB…'); const r = await resolveLyrics(s); toast(r ? 'Lyrics updated' : 'Nothing found'); }
      else if (a === 'search') searchSheet(s);
      else if (a === 'paste') pasteSheet(s);
      else if (a === 'clear') { await DB.put('lyrics', { synced: '', plain: '', none: true, source: 'manual' }, s.id); await setSongStatus(s, 'none'); popLayer(); loadLyrics(); }
    })
  );
}

function searchSheet(s) {
  panel.innerHTML = `<div class="grab"></div><h3>Search LRCLIB</h3><div class="sub">Try the official track and artist name.</div>
    <label class="field">Title<input id="qTitle" value="${esc(s.title)}"></label>
    <label class="field">Artist<input id="qArtist" value="${esc(s.artist)}"></label>
    <button class="btn" id="qGo">Search</button>`;
  $('#qGo').onclick = async () => {
    const t = $('#qTitle').value.trim(), a = $('#qArtist').value.trim();
    if (!t) return;
    popLayer(); toast('Searching LRCLIB…');
    const r = await resolveLyrics(s, { title: t, artist: a });
    toast(r ? 'Lyrics found' : 'Nothing found');
  };
}

function pasteSheet(s) {
  panel.innerHTML = `<div class="grab"></div><h3>Paste lyrics</h3><div class="sub">LRC with [mm:ss.xx] timestamps gets synced; plain text is shown as-is.</div>
    <label class="field"><textarea id="pasteBox" placeholder="[00:12.30] First line&#10;[00:16.80] Second line"></textarea></label>
    <button class="btn" id="pasteSave">Save</button>`;
  $('#pasteSave').onclick = async () => {
    const text = $('#pasteBox').value.trim();
    if (!text) return;
    const isLrc = /\[\d{1,3}:\d{2}/.test(text);
    await DB.put('lyrics', { synced: isLrc ? text : '', plain: isLrc ? '' : text, source: 'manual', fetchedAt: Date.now() }, s.id);
    await setSongStatus(s, isLrc ? 'synced' : 'plain');
    popLayer(); loadLyrics();
  };
}

/* ============================================================ wiring */
$$('[data-ic]').forEach((e) => { e.innerHTML = ic(e.dataset.ic); });
$$('[data-settings]').forEach((b) => { b.innerHTML = ic('gear'); b.onclick = settingsSheet; });
$('#searchIc').innerHTML = ic('search');
$('.empty-ic').innerHTML = ic('note');
$('#albBack').innerHTML = ic('back');
$('#btnAddFolder').innerHTML = SUPPORTS_PICKER ? 'Choose music folder' : 'Choose a folder';
for (const id of ['#btnMenuS', '#btnMenuB']) { $(id).innerHTML = ic('more'); $(id).onclick = lyricMenu; }
$('#btnQueueMenu').innerHTML = ic('more');
$('#btnQueueMenu').onclick = lyricMenu;
$('#btnLyricsToggle').innerHTML = ic('lyrics');
$('#btnPrev').innerHTML = ic('prev');
$('#btnNext').innerHTML = ic('next');
$('#miniNext').innerHTML = ic('next');
$('#btnShuffle').innerHTML = ic('shuffle');
for (const [id, label, icn] of [['#songsPlay', 'Play', 'play'], ['#songsShuffle', 'Shuffle', 'shuffle'], ['#albPlay', 'Play', 'play'], ['#albShuffle', 'Shuffle', 'shuffle']]) $(id).innerHTML = ic(icn) + label;
syncModes();
syncPlayIcons();
setLyricsMode(lyricsMode, false);

$('#btnAddFolder').onclick = addFolder;
$('#btnAddFiles').onclick = () => $('#file').click();
$('#file').onchange = (e) => { importFiles(e.target.files); e.target.value = ''; };
$('#dirInput').onchange = (e) => { importFiles(e.target.files); e.target.value = ''; };
$('#search').addEventListener('input', renderSearch);
$$('.tabbtn').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

document.addEventListener('click', (e) => {
  const more = e.target.closest('[data-more]');
  if (more) return songMenu(more.dataset.more);
  const card = e.target.closest('[data-album]');
  if (card) return openAlbum(card.dataset.album);
  const row = e.target.closest('.row');
  if (row?.dataset.id) playIds([...row.parentElement.querySelectorAll('.row')].map((r) => r.dataset.id), row.dataset.id);
});
$('#songsPlay').onclick = () => playIds(sortedSongs().map((s) => s.id), null, { shuffle: false });
$('#songsShuffle').onclick = () => playIds(sortedSongs().map((s) => s.id), null, { shuffle: true });
const albumIds = () => state.albums.find((a) => a.key === albumOpen)?.songs.map((s) => s.id) || [];
$('#albPlay').onclick = () => playIds(albumIds(), null, { shuffle: false });
$('#albShuffle').onclick = () => playIds(albumIds(), null, { shuffle: true });
$('#albBack').onclick = popLayer;

$('#mini').addEventListener('click', (e) => { if (!e.target.closest('button')) openPlayer(); });
$('#miniPlay').onclick = togglePlay;
$('#miniNext').onclick = () => next(false);
$('#btnPlay').onclick = togglePlay;
$('#btnPrev').onclick = prev;
$('#btnNext').onclick = () => next(false);
$('#btnBack').onclick = popLayer;
$('#btnLyricsToggle').onclick = () => setLyricsMode(!lyricsMode);
$('#btnShuffle').onclick = () => { state.shuffle = !state.shuffle; syncModes(); if (state.current) buildQueue(state.current); };
$('#btnRepeat').onclick = () => { state.repeat = { off: 'all', all: 'one', one: 'off' }[state.repeat]; syncModes(); };
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  tick(true); kick();
  if (Date.now() - lastCheck > 10 * 60 * 1000) checkFolders();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e));
loadLibrary().then(checkFolders);

window.__lp = { state, audio, importFiles, addFolderHandle, scanFolder, openPlayer, setLyricsMode, showTab };
