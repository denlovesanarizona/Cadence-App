# Cadence

Music player with synced, glowing lyrics (PWA for Android Chrome).

## Run locally (VS Code)
Needs a server (service workers / ES modules don't work from file://).
- "cd C:\Users\Student\Desktop\PROJECT"
- VS Code "Live Server" extension -> Go Live, or `python -m http.server 8000` here, then open http://localhost:8000

## Deploy to GitHub Pages
1. Put these files in the root of a repo and push.
2. Repo Settings -> Pages -> Deploy from branch -> main / (root).
3. On the phone open https://<user>.github.io/<repo>/ in Chrome -> menu -> Install app.
4. After changing files, bump VERSION in sw.js so phones drop the old cache.

## Music
- Chrome on Android 132+ can pick a folder (File System Access API). Choose your Music folder once; Cadence reads
  it in place (no copy), scans subfolders, and rescans on launch. Chrome may ask to re-allow access now and then
  (a banner shows an "Allow" button); installing the app helps it remember.
- Older browsers: folder/individual-file import falls back to copying songs into the app's storage.
- Tags: built-in reader for mp3 (ID3), m4a, flac, ogg/opus. Covers are stored once per album.

## Lyrics
LRCLIB lookup at import (exact match by title/artist/album/duration, then search fallbacks), cached for offline,
retried when back online. Line times from LRC; words/letters are interpolated per line unless the LRC has word tags.

## Files
index.html, style.css (liquid-glass look), app.js, db.js (IndexedDB), tags.js, lrc.js, sw.js, manifest.webmanifest
