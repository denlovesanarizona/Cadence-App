// Tiny dependency-free tag reader: ID3v2 (mp3), ID3v1, FLAC, MP4/M4A, Ogg/Opus (text only).
// readTags(file) -> { title, artist, album, art: Blob|null }

const u8 = (buf) => new Uint8Array(buf);
const latin1 = (b) => Array.from(b, (c) => String.fromCharCode(c)).join('');
const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const syncsafe = (b, o) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];

function decode(bytes, enc) {
  try {
    if (enc === 1) {
      if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
      if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
      return new TextDecoder('utf-16le').decode(bytes);
    }
    if (enc === 2) return new TextDecoder('utf-16be').decode(bytes);
    if (enc === 3) return new TextDecoder('utf-8').decode(bytes);
    return new TextDecoder('windows-1252').decode(bytes);
  } catch { return latin1(bytes); }
}
const clean = (s) => s.replace(/\u0000+$/g, '').replace(/\u0000/g, ', ').trim();

function deunsync(b) {
  const out = [];
  for (let i = 0; i < b.length; i++) {
    out.push(b[i]);
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return Uint8Array.from(out);
}

// find terminator for encoding starting at i; returns [endIndexOfText, indexAfterTerminator]
function findTerm(b, i, enc) {
  if (enc === 1 || enc === 2) {
    for (let j = i; j + 1 < b.length; j += 2) if (b[j] === 0 && b[j + 1] === 0) return [j, j + 2];
    return [b.length, b.length];
  }
  for (let j = i; j < b.length; j++) if (b[j] === 0) return [j, j + 1];
  return [b.length, b.length];
}

async function readID3v2(file) {
  const head = u8(await file.slice(0, 10).arrayBuffer());
  const ver = head[3];
  const flags = head[5];
  const size = syncsafe(head, 6);
  let tag = u8(await file.slice(10, 10 + size).arrayBuffer());
  if (flags & 0x80 && ver < 4) tag = deunsync(tag);
  let p = 0;
  if (flags & 0x40) { // extended header
    const es = ver === 4 ? syncsafe(tag, 0) : be32(tag, 0) + 4;
    p = es;
  }
  const out = {};
  let pics = [];
  const v22 = ver === 2;
  const idLen = v22 ? 3 : 4;
  const hdrLen = v22 ? 6 : 10;
  while (p + hdrLen <= tag.length) {
    const id = latin1(tag.subarray(p, p + idLen));
    if (!id.trim() || id.charCodeAt(0) === 0) break;
    let fsz;
    if (v22) fsz = (tag[p + 3] << 16) | (tag[p + 4] << 8) | tag[p + 5];
    else fsz = ver === 4 ? syncsafe(tag, p + 4) : be32(tag, p + 4);
    const f2 = v22 ? 0 : tag[p + 9];
    let data = tag.subarray(p + hdrLen, p + hdrLen + fsz);
    p += hdrLen + fsz;
    if (!data.length) continue;
    if (ver === 4) {
      if (f2 & 0x01) data = data.subarray(4);
      if (f2 & 0x02) data = deunsync(data);
    }
    if (id === 'TIT2' || id === 'TT2') out.title = clean(decode(data.subarray(1), data[0]));
    else if (id === 'TPE1' || id === 'TP1') out.artist = clean(decode(data.subarray(1), data[0]));
    else if (id === 'TALB' || id === 'TAL') out.album = clean(decode(data.subarray(1), data[0]));
    else if (id === 'TPE2' || id === 'TP2') out.albumArtist = clean(decode(data.subarray(1), data[0]));
    else if (id === 'TRCK' || id === 'TRK') out.track = parseInt(clean(decode(data.subarray(1), data[0])), 10) || 0;
    else if (id === 'APIC' || id === 'PIC') {
      const enc = data[0];
      let i = 1, mime;
      if (v22) { mime = 'image/' + latin1(data.subarray(1, 4)).toLowerCase().replace('jpg', 'jpeg'); i = 4; }
      else { const [e, n] = findTerm(data, 1, 0); mime = latin1(data.subarray(1, e)) || 'image/jpeg'; i = n; }
      const type = data[i++];
      const [, after] = findTerm(data, i, enc);
      const img = data.subarray(after);
      if (img.length > 100) pics.push({ type, mime: mime.includes('/') ? mime : 'image/' + mime, data: img });
    }
  }
  if (pics.length) {
    const best = pics.find((x) => x.type === 3) || pics[0];
    out.art = new Blob([best.data], { type: best.mime });
  }
  return out;
}

async function readID3v1(file) {
  if (file.size < 128) return {};
  const b = u8(await file.slice(file.size - 128).arrayBuffer());
  if (latin1(b.subarray(0, 3)) !== 'TAG') return {};
  const f = (a, z) => clean(latin1(b.subarray(a, z)));
  return { title: f(3, 33), artist: f(33, 63), album: f(63, 93) };
}

function parseVorbisComments(b, off, out) {
  const vl = le32(b, off); off += 4 + vl;
  const n = le32(b, off); off += 4;
  for (let i = 0; i < n && off + 4 <= b.length; i++) {
    const l = le32(b, off); off += 4;
    const s = new TextDecoder('utf-8').decode(b.subarray(off, off + l)); off += l;
    const k = s.indexOf('=');
    if (k < 0) continue;
    const key = s.slice(0, k).toUpperCase(), val = s.slice(k + 1);
    if (key === 'TITLE') out.title = val;
    else if (key === 'ARTIST' && !out.artist) out.artist = val;
    else if (key === 'ALBUM') out.album = val;
    else if (key === 'ALBUMARTIST') out.albumArtist = val;
    else if (key === 'TRACKNUMBER') out.track = parseInt(val) || 0;
  }
}

function parseFlacPicture(b) {
  let o = 0;
  const type = be32(b, o); o += 4;
  const ml = be32(b, o); o += 4;
  const mime = latin1(b.subarray(o, o + ml)); o += ml;
  const dl = be32(b, o); o += 4 + dl + 16;
  const len = be32(b, o); o += 4;
  return { type, mime: mime || 'image/jpeg', data: b.subarray(o, o + len) };
}

async function readFlac(file) {
  const out = {};
  let off = 4, pics = [];
  for (let n = 0; n < 40 && off + 4 <= file.size; n++) {
    const h = u8(await file.slice(off, off + 4).arrayBuffer());
    const last = h[0] & 0x80, type = h[0] & 0x7f;
    const len = (h[1] << 16) | (h[2] << 8) | h[3];
    if (type === 4) parseVorbisComments(u8(await file.slice(off + 4, off + 4 + len).arrayBuffer()), 0, out);
    else if (type === 6) pics.push(parseFlacPicture(u8(await file.slice(off + 4, off + 4 + len).arrayBuffer())));
    off += 4 + len;
    if (last) break;
  }
  if (pics.length) {
    const best = pics.find((x) => x.type === 3) || pics[0];
    out.art = new Blob([best.data], { type: best.mime });
  }
  return out;
}

async function readOgg(file) {
  const b = u8(await file.slice(0, 131072).arrayBuffer());
  const out = {};
  const s = latin1(b);
  let i = s.indexOf('OpusTags');
  if (i >= 0) { try { parseVorbisComments(b, i + 8, out); } catch {} return out; }
  i = s.indexOf('\x03vorbis');
  if (i >= 0) { try { parseVorbisComments(b, i + 7, out); } catch {} }
  return out;
}

async function readMP4(file) {
  // locate moov
  let off = 0, moov = null;
  while (off + 8 <= file.size) {
    const h = u8(await file.slice(off, off + 16).arrayBuffer());
    let size = be32(h, 0), hl = 8;
    const type = latin1(h.subarray(4, 8));
    if (size === 1) { size = be32(h, 8) * 4294967296 + be32(h, 12); hl = 16; }
    else if (size === 0) size = file.size - off;
    if (size < hl) break;
    if (type === 'moov') { moov = u8(await file.slice(off + hl, off + size).arrayBuffer()); break; }
    off += size;
  }
  if (!moov) return {};
  const out = {};
  const NAM = '©nam', ART = '©ART', ALB = '©alb';
  const walk = (b, s, e, depth) => {
    while (s + 8 <= e) {
      const size = be32(b, s), type = latin1(b.subarray(s + 4, s + 8));
      if (size < 8) break;
      const end = Math.min(e, s + size);
      if (type === 'udta' || type === 'ilst') walk(b, s + 8, end, depth + 1);
      else if (type === 'meta') walk(b, s + 12, end, depth + 1);
      else if (type === NAM || type === ART || type === ALB || type === 'aART' || type === 'covr' || type === 'trkn') {
        // data atom
        let d = s + 8;
        while (d + 16 <= end) {
          const ds = be32(b, d);
          if (latin1(b.subarray(d + 4, d + 8)) === 'data') {
            const flag = (b[d + 9] << 16) | (b[d + 10] << 8) | b[d + 11];
            const payload = b.subarray(d + 16, d + ds);
            if (type === 'covr') out.art = new Blob([payload], { type: flag === 14 ? 'image/png' : 'image/jpeg' });
            else if (type === 'trkn') out.track = (payload[2] << 8) | payload[3];
            else {
              const v = new TextDecoder('utf-8').decode(payload);
              if (type === NAM) out.title = v; else if (type === ART) out.artist = v;
              else if (type === ALB) out.album = v; else out.albumArtist = v;
            }
            break;
          }
          if (ds < 8) break;
          d += ds;
        }
      } else if (type === 'moov' || depth === 0) walk(b, s + 8, end, depth + 1);
      s += size;
    }
  };
  walk(moov, 0, moov.length, 0);
  return out;
}

export async function readTags(file) {
  try {
    const h = u8(await file.slice(0, 12).arrayBuffer());
    const m4 = latin1(h.subarray(0, 3));
    let tags = {};
    if (m4 === 'ID3') tags = await readID3v2(file);
    else if (latin1(h.subarray(0, 4)) === 'fLaC') tags = await readFlac(file);
    else if (latin1(h.subarray(0, 4)) === 'OggS') tags = await readOgg(file);
    else if (latin1(h.subarray(4, 8)) === 'ftyp') tags = await readMP4(file);
    if (!tags.title && !tags.artist) tags = { ...(await readID3v1(file)), ...(tags.art ? { art: tags.art } : {}) };
    return { title: tags.title || '', artist: tags.artist || '', album: tags.album || '', albumArtist: tags.albumArtist || '', track: tags.track || 0, art: tags.art || null };
  } catch (e) {
    console.warn('tag read failed', e);
    return { title: '', artist: '', album: '', albumArtist: '', track: 0, art: null };
  }
}
