// Minimal IndexedDB wrapper.
// stores: songs (metadata), files (audio blobs), lyrics (cached LRCLIB results)
let dbp;
function open() {
  return (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('lyricplayer', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('songs', { keyPath: 'id' });
      d.createObjectStore('files');
      d.createObjectStore('lyrics');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((res, rej) => {
        const t = db.transaction(store, mode);
        let out;
        const req = fn(t.objectStore(store));
        if (req) req.onsuccess = () => (out = req.result);
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      })
  );
}
export const get = (s, k) => tx(s, 'readonly', (o) => o.get(k));
export const all = (s) => tx(s, 'readonly', (o) => o.getAll());
export const put = (s, v, k) => tx(s, 'readwrite', (o) => (k === undefined ? o.put(v) : o.put(v, k)));
export const del = (s, k) => tx(s, 'readwrite', (o) => o.delete(k));
