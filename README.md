# Lyric Player (PWA)

Local music player for Android with synced lyrics from LRCLIB.

## Run locally (VS Code)
Needs a server (service workers and ES modules don't work from file://).
- VS Code "Live Server" extension -> Go Live, or
- `python -m http.server 8000` in this folder, then open http://localhost:8000

## Deploy to GitHub Pages
1. Put these files in the root of a repo, push.
2. Repo Settings -> Pages -> Deploy from branch -> main / (root).
3. Open https://<user>.github.io/<repo>/ in Chrome on the phone -> menu -> Install app.

After updating files, bump VERSION in sw.js so phones drop the old cache.

## How it works
- Songs: picked with the file picker, stored in IndexedDB (a copy; Android can't give web apps folder access).
- Tags: built-in reader for mp3 (ID3), m4a, flac, ogg/opus; falls back to "Artist - Title" filenames.
- Lyrics: LRCLIB /api/get (exact title+artist+album+duration), then /api/search fallbacks. Looked up at import, cached, retried when back online.
- Sync: LRC line times; words/letters are interpolated across each line. Enhanced LRC (<mm:ss.xx> word tags) uses the real word times.
