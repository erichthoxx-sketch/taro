// Хранение, которое не помещается в общие коллекции: переписка с ChatGPT по колоде
// (users/{uid}/t_chat/{колода}/msgs — грузится только открытая колода и только последние сообщения)
// и фотографии карт (users/{uid}/t_photos — по одной на документ, грузятся по требованию).
const st = () => window.__app.store;
const fb = () => st().mode === 'firebase';

// ---------- чат ----------
const localChat = new Map(); // колода → подписчики (пробный режим)
const lkey = (deckId) => 'taro.chat.' + deckId;
const lread = (deckId) => { try { return JSON.parse(localStorage.getItem(lkey(deckId)) || '[]'); } catch { return []; } };
const lwrite = (deckId, arr) => {
  try { localStorage.setItem(lkey(deckId), JSON.stringify(arr)); } catch { /* память браузера переполнена */ }
  (localChat.get(deckId) || []).forEach((f) => f());
};
const msgsRef = (deckId) => st().F.collection(st().db, 'users', st().user.uid, 't_chat', deckId, 'msgs');

// Последние n сообщений колоды, по возрастанию времени; cb вызывается при каждом изменении
export function listenChat(deckId, n, cb) {
  if (!fb()) {
    const fire = () => cb(lread(deckId).sort((a, b) => a.ts - b.ts).slice(-n));
    const subs = localChat.get(deckId) || [];
    subs.push(fire); localChat.set(deckId, subs);
    fire();
    return () => localChat.set(deckId, (localChat.get(deckId) || []).filter((f) => f !== fire));
  }
  const { query, orderBy, limit, onSnapshot } = st().F;
  return onSnapshot(query(msgsRef(deckId), orderBy('ts', 'desc'), limit(n)), (snap) => {
    cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => a.ts - b.ts));
  }, (e) => { console.error(e); cb(null, e); });
}

export async function putMsg(deckId, msg) {
  const clean = JSON.parse(JSON.stringify(msg));
  if (!fb()) { const arr = lread(deckId).filter((m) => m.id !== msg.id); arr.push(clean); lwrite(deckId, arr); return; }
  const { setDoc, doc } = st().F;
  const p = setDoc(doc(msgsRef(deckId), msg.id), clean);
  if (navigator.onLine) await p;
}

export async function deleteMsgs(deckId, ids) {
  if (!fb()) { const s = new Set(ids); lwrite(deckId, lread(deckId).filter((m) => !s.has(m.id))); return; }
  const { writeBatch, doc } = st().F;
  for (let i = 0; i < ids.length; i += 400) {
    const b = writeBatch(st().db);
    ids.slice(i, i + 400).forEach((id) => b.delete(doc(msgsRef(deckId), id)));
    await b.commit();
  }
}

// Вся переписка колоды (для резервной копии и удаления колоды)
export async function allMsgs(deckId) {
  if (!fb()) return lread(deckId).sort((a, b) => a.ts - b.ts);
  const { getDocs, query, orderBy } = st().F;
  const snap = await getDocs(query(msgsRef(deckId), orderBy('ts')));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

export const newMsgId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- фото ----------
const photoCache = new Map();
const pkey = (id) => 'taro.photo.' + id;

export async function getPhoto(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  let data = null;
  if (!fb()) { try { data = localStorage.getItem(pkey(id)); } catch { data = null; } }
  else {
    const { getDoc, doc } = st().F;
    try { const d = await getDoc(doc(st().db, 'users', st().user.uid, 't_photos', id)); data = d.exists() ? d.data().data : null; } catch { data = null; }
  }
  if (data) photoCache.set(id, data); // «нет фото» не запоминаем: фото могли добавить с другого устройства
  return data;
}

export async function setPhoto(id, data) {
  photoCache.set(id, data || null);
  if (!fb()) {
    try { if (data) localStorage.setItem(pkey(id), data); else localStorage.removeItem(pkey(id)); } catch { throw new Error('В пробном режиме память браузера переполнена — фото не сохранилось'); }
    return;
  }
  const { setDoc, deleteDoc, doc } = st().F;
  const ref = doc(st().db, 'users', st().user.uid, 't_photos', id);
  const p = data ? setDoc(ref, { data }) : deleteDoc(ref);
  if (navigator.onLine) await p;
}

// Подставить фото в <img data-photo="id"> на странице (после отрисовки)
export function fillPhotos(root = document) {
  root.querySelectorAll('img[data-photo]').forEach(async (img) => {
    const id = img.dataset.photo;
    const data = await getPhoto(id);
    if (data && img.isConnected && img.dataset.photo === id) { img.src = data; img.closest('.has-photo')?.classList.add('ph-on'); }
  });
}
