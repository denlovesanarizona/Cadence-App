import * as DB from './db.js';
import { readTags } from './tags.js';
import { parseLRC, prepareLines } from './lrc.js';

/* ============================================================ helpers */
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const ICON = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  next: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
  prev: 'M6 6h2v12H6zM9.5 12l8.5 6V6z',
  shuffle: 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
  down: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z',
  more: 'M12 8a2 2 0 100-4 2 2 0 000 4zm0 2a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-4z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  note: 'M12 3v10.55A4 4 0 1014 17V7h4V3h-6z',
  trash: 'M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  refresh: 'M17.65 6.35A7.96 7.96 0 0012 4a8 8 0 108 8h-2a6 6 0 11-1.76-4.24L13 11h7V4l-2.35 2.35z',
  lyrics: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  paste: 'M19 2h-4.18C14.4.84 13.3 0 12 0S9.6.84 9.18 2H5a2 2 0 00-2 2v16a2 2 0 002 2h14a2 2 0 002-2V4a2 2 0 00-2-2zm-7 0a1 1 0 110 2 1 1 0 010-2zm7 18H5V4h2v3h10V4h2v16z',
};
const ic = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* Back-button friendly layers (player, sheets). All closes go through history.back(). */
const layers = [];
function pushLayer(close) { layers.push(close); history.pushState({ l: layers.length }, ''); }
function popLayer() { if (layers.length) history.back(); }
addEventListener('popstate', () => { const c = layers.pop(); if (c) c(); });

/* ============================================================ state */
const audio = new Audio();
audio.preload = 'auto';
const state = {
  songs: new Map(),
  order: [],
  filter: '',
  current: null,
  base: [], queue: [], qi: -1,
  shuffle: false,
  repeat: 'off',
  lines: null, // prepared synced lines
  activeIdx: -2,
};
let audioURL = null;
const artURLs = new Map();
const artURL = (s) => {
  if (!s.art) return '';
  if (!artURLs.has(s.id)) artURLs.set(s.id, URL.createObjectURL(s.art));
  return artURLs.get(s.id);
};

/* ============================================================ library */
const STATUS_LABEL = { synced: 'Synced', plain: 'Text only', none: 'No lyrics', pending: 'Searching…', error: 'Will retry', instrumental: 'Instrumental' };

function applyFilter() {
  const q = state.filter.trim().toLowerCase();
  state.order = [...state.songs.values()]
    .filter((s) => !q || `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    .map((s) => s.id);
}

function renderList() {
  applyFilter();
  const list = $('#list');
  $('#empty').classList.toggle('hidden', state.songs.size > 0);
  list.innerHTML = state.order
    .map((id) => {
      const s = state.songs.get(id);
      const a = artURL(s);
      return `<li class="row${id === state.current ? ' current' : ''}" data-id="${esc(id)}">
        ${a ? `<img class="art" src="${a}" alt="" loading="lazy">` : `<div class="art ph">${ic('note')}</div>`}
        <div class="info"><div class="t">${esc(s.title)}</div>
          <div class="s"><span>${esc(s.artist || 'Unknown artist')}${s.duration ? ' · ' + fmt(s.duration) : ''}</span><span class="pill ${s.lyricsStatus}">${STATUS_LABEL[s.lyricsStatus] || ''}</span></div></div>
        <button class="more" data-more="${esc(id)}" aria-label="More">${ic('more')}</button>
      </li>`;
    })
    .join('');
}

function updateRow(id) {
  const li = $(`.row[data-id="${CSS.escape(id)}"] .pill`);
  const s = state.songs.get(id);
  if (li && s) { li.className = `pill ${s.lyricsStatus}`; li.textContent = STATUS_LABEL[s.lyricsStatus] || ''; }
}

async function loadLibrary() {
  const songs = await DB.all('songs');
  songs.forEach((s) => state.songs.set(s.id, s));
  renderList();
  // resume lyrics lookups that were interrupted / failed offline
  songs.filter((s) => s.lyricsStatus === 'pending' || s.lyricsStatus === 'error').forEach((s) => queueLyrics(s.id));
}

/* ============================================================ import */
function fromFilename(name) {
  let base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\s*\d{1,3}[\s.\-)]+(?=\D)/, '').trim();
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

async function importFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|flac|ogg|opus|wav|webm|mp4)$/i.test(f.name));
  if (!files.length) return toast('No audio files selected');
  let added = 0, n = 0;
  for (const f of files) {
    n++;
    setStatusLine(`Importing ${n} of ${files.length}…`);
    const id = `${f.name}|${f.size}|${f.lastModified}`;
    if (state.songs.has(id)) continue;
    const tags = await readTags(f);
    const fb = fromFilename(f.name);
    const song = {
      id, fileName: f.name,
      title: tags.title || fb.title, artist: tags.artist || fb.artist, album: tags.album,
      duration: await probeDuration(f), art: tags.art, offset: 0, addedAt: Date.now(), lyricsStatus: 'pending',
    };
    try {
      await DB.put('files', f, id);
      await DB.put('songs', song);
    } catch (e) {
      console.error(e);
      toast('Storage is full — could not save ' + song.title);
      continue;
    }
    state.songs.set(id, song);
    added++;
    renderList();
    queueLyrics(id);
  }
  setStatusLine('');
  if (added) { toast(`Added ${added} song${added > 1 ? 's' : ''}`); navigator.storage?.persist?.(); }
  else toast('Those songs are already in your library');
}

function setStatusLine(msg) {
  const el = $('#status');
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
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
  const title = q.title ?? song.title, artist = q.artist ?? song.artist, album = q.album ?? song.album;
  const dur = Math.round(song.duration || 0);
  // 1) exact signature match (fastest, best version)
  if (title && artist && dur && !q.title) {
    const p = new URLSearchParams({ track_name: title, artist_name: artist, album_name: album || '', duration: dur });
    try {
      const j = await jget(`${LRCLIB}/get?${p}`);
      if (j && (j.syncedLyrics || j.plainLyrics || j.instrumental)) return j;
    } catch (e) { if (e instanceof TypeError) throw e; }
  }
  // 2) field search with raw then cleaned names
  const attempts = [];
  attempts.push({ track_name: title, ...(artist && { artist_name: artist }) });
  const ct = cleanTitle(title), ca = firstArtist(artist || '');
  if (ct !== title || ca !== artist) attempts.push({ track_name: ct, ...(ca && { artist_name: ca }) });
  attempts.push({ q: `${ca} ${ct}`.trim() });
  for (const a of attempts) {
    const res = await jget(`${LRCLIB}/search?${new URLSearchParams(a)}`);
    const best = pickBest(res, dur);
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
    if (!$('#status').textContent.startsWith('Importing')) setStatusLine(lq.length ? `Finding lyrics… ${lq.length} left` : 'Finding lyrics…');
    await resolveLyrics(s);
    await sleep(200);
  }
  lqRunning = false;
  if (!$('#status').textContent.startsWith('Importing')) setStatusLine('');
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

async function loadSong(id, autoplay = true) {
  const song = state.songs.get(id);
  const file = await DB.get('files', id);
  if (!song || !file) return toast('Audio file is missing');
  if (audioURL) URL.revokeObjectURL(audioURL);
  audioURL = URL.createObjectURL(file);
  audio.src = audioURL;
  state.current = id;
  updateNowPlaying(song);
  setMediaSession(song);
  loadLyrics();
  document.querySelectorAll('.row.current').forEach((r) => r.classList.remove('current'));
  $(`.row[data-id="${CSS.escape(id)}"]`)?.classList.add('current');
  if (autoplay) { try { await audio.play(); } catch (e) { console.warn(e); } }
}

function playFromList(id) {
  state.base = state.order.slice();
  buildQueue(id);
  state.current = id; // set synchronously so the player view can open right away
  loadSong(id);
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
}

function updateNowPlaying(song) {
  const a = artURL(song);
  $('#pTitle').textContent = song.title;
  $('#pArtist').textContent = song.artist || 'Unknown artist';
  $('#miniTitle').textContent = song.title;
  $('#miniArtist').textContent = song.artist || 'Unknown artist';
  for (const el of [$('#pArt'), $('#miniArt')]) {
    if (a) { el.src = a; el.style.visibility = 'visible'; } else { el.removeAttribute('src'); el.style.visibility = 'hidden'; }
  }
  $('#mini').classList.remove('hidden');
  paintBackground(song, a);
}

function hueOf(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function paintBackground(song, a) {
  const bg = $('#bg');
  if (a) {
    // downscale to a tiny image: scaling it back up gives a free, soft color wash
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      c.getContext('2d').drawImage(img, 0, 0, 32, 32);
      if (state.current === song.id) bg.style.backgroundImage = `url(${c.toDataURL('image/jpeg', 0.8)})`;
    };
    img.src = a;
  } else {
    const h = hueOf(song.title + song.artist);
    bg.style.backgroundImage = `linear-gradient(160deg, hsl(${h} 70% 38%), hsl(${(h + 60) % 360} 65% 22%))`;
  }
}

function setMediaSession(song) {
  if (!('mediaSession' in navigator)) return;
  const a = artURL(song);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title, artist: song.artist, album: song.album,
    artwork: a ? [{ src: a, sizes: '512x512', type: song.art?.type || 'image/jpeg' }] : [],
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
function openPlayer() {
  if (playerOpen || !state.current) return;
  playerOpen = true;
  $('#player').classList.add('open');
  pushLayer(() => { playerOpen = false; $('#player').classList.remove('open'); });
  state.activeIdx = -2;
  tick(true);
  kick();
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
  $('#miniProg').style.width = pct * 100 + '%';
  if (!playerOpen) return;
  if (!seeking) {
    seek.value = pct * 1000;
    seek.style.setProperty('--pct', pct * 100 + '%');
    $('#tCur').textContent = fmt(cur);
  }
  $('#tDur').textContent = fmt(dur);
  if (state.lines) updateLyrics(cur + songOffset(), force);
}
function loop() {
  tick();
  raf = !audio.paused && playerOpen ? requestAnimationFrame(loop) : 0;
}
function kick() { if (!raf && playerOpen) raf = requestAnimationFrame(loop); }

/* ============================================================ lyrics view */
const box = $('#lyrics'), inner = $('#lyricsInner');
let els = []; // [{line, el, words:[{el,s,e,last}], dots}]
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
    if (parsed.length) return renderSynced(prepareLines(parsed, audio.duration || song.duration));
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
  // fine-grained word / letter fill on the active line
  const a = els[idx];
  if (!a) return;
  if (a.line.gap) {
    const p = clamp((t - a.line.t) / Math.max(0.5, a.line.end - a.line.t), 0, 1);
    a.dots.forEach((d, k) => {
      const v = clamp(p * 3 - k, 0, 1);
      d.style.opacity = 0.28 + 0.72 * v;
      d.style.transform = `scale(${0.8 + 0.35 * v})`;
    });
    return;
  }
  for (const w of a.words) {
    const p = clamp((t - w.s) / Math.max(0.05, w.e - w.s), 0, 1);
    if (Math.abs(p - w.last) > 0.004) { w.el.style.setProperty('--p', p.toFixed(3)); w.last = p; }
  }
}

function scrollToActive(behavior = 'smooth') {
  const e = els[state.activeIdx];
  if (!e || performance.now() < userUntil) return;
  const top = e.el.offsetTop - box.clientHeight * 0.34;
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
  const l = state.lines[+el.dataset.i];
  audio.currentTime = Math.max(0, l.t - songOffset() + 0.01);
  userUntil = 0;
  state.activeIdx = -2;
  tick(true);
});

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

function songMenu(id) {
  const s = state.songs.get(id);
  openSheet(
    `<h3>${esc(s.title)}</h3><div class="sub">${esc(s.artist || 'Unknown artist')}</div>
     <button class="opt" data-a="lyrics">${ic('refresh')}Find lyrics again</button>
     <button class="opt danger" data-a="del">${ic('trash')}Remove from library</button>`,
    (p) => p.addEventListener('click', async (ev) => {
      const a = ev.target.closest('[data-a]')?.dataset.a;
      if (a === 'lyrics') { popLayer(); queueLyrics(id, true); toast('Looking for lyrics…'); }
      if (a === 'del') {
        popLayer();
        if (!confirm(`Remove “${s.title}” from the library?`)) return;
        if (state.current === id) { audio.pause(); audio.removeAttribute('src'); state.current = null; $('#mini').classList.add('hidden'); if (playerOpen) popLayer(); }
        await Promise.all([DB.del('songs', id), DB.del('files', id), DB.del('lyrics', id)]);
        state.songs.delete(id);
        renderList();
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
$('#btnAdd').innerHTML = `${ic('plus')}Add songs`;
$('.empty-ic').innerHTML = ic('note');
$('#btnBack').innerHTML = ic('down');
$('#btnLyricMenu').innerHTML = ic('lyrics');
$('#btnPrev').innerHTML = ic('prev');
$('#btnNext').innerHTML = ic('next');
$('#btnShuffle').innerHTML = ic('shuffle');
$('#btnRepeat').innerHTML = ic('repeat');
syncPlayIcons();

$('#btnAdd').onclick = () => $('#file').click();
$('#file').onchange = (e) => { importFiles(e.target.files); e.target.value = ''; };
$('#search').addEventListener('input', (e) => { state.filter = e.target.value; renderList(); });
$('#list').addEventListener('click', (e) => {
  const more = e.target.closest('[data-more]');
  if (more) return songMenu(more.dataset.more);
  const row = e.target.closest('.row');
  if (row) { playFromList(row.dataset.id); openPlayer(); }
});
$('#mini').addEventListener('click', (e) => { if (e.target.closest('#miniPlay')) return; openPlayer(); });
$('#miniPlay').onclick = togglePlay;
$('#btnPlay').onclick = togglePlay;
$('#btnPrev').onclick = prev;
$('#btnNext').onclick = () => next(false);
$('#btnBack').onclick = popLayer;
$('#btnLyricMenu').onclick = lyricMenu;
$('#btnShuffle').onclick = () => {
  state.shuffle = !state.shuffle;
  $('#btnShuffle').classList.toggle('on', state.shuffle);
  if (state.current) buildQueue(state.current);
};
$('#btnRepeat').onclick = () => {
  state.repeat = { off: 'all', all: 'one', one: 'off' }[state.repeat];
  const b = $('#btnRepeat');
  b.classList.toggle('on', state.repeat !== 'off');
  b.innerHTML = ic('repeat') + (state.repeat === 'one' ? '<b class="badge">1</b>' : '');
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(true); kick(); } });

// Install prompt (Android Chrome)
let deferredInstall;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; $('#btnInstall').classList.remove('hidden'); });
$('#btnInstall').onclick = async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('#btnInstall').classList.add('hidden'); };

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e));
loadLibrary();

// tiny hook for automated tests
window.__lp = { state, audio, importFiles };
