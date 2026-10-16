// Minimal IndexedDB wrapper.
// stores: songs (metadata), files (copied audio blobs), lyrics (cached LRCLIB results),
//         art (cover images shared per album), folders (picked music folder handles)
let dbp;
function open() {
  return (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('lyricplayer', 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      const stores = [['songs', { keyPath: 'id' }], ['files'], ['lyrics'], ['art'], ['folders', { keyPath: 'id' }]];
      for (const [n, o] of stores) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, o);
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
// [[key, value], ...] for out-of-line-key stores
export function entries(store) {
  return open().then(
    (db) =>
      new Promise((res, rej) => {
        const out = [];
        const t = db.transaction(store, 'readonly');
        const rq = t.objectStore(store).openCursor();
        rq.onsuccess = () => { const c = rq.result; if (c) { out.push([c.key, c.value]); c.continue(); } };
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
      })
  );
}
