// Хранилище данных. Два режима с одинаковым интерфейсом:
//  • firebase — вход по почте, данные в Firestore, синхронизация между телефоном и компьютером;
//  • local — пробный режим: данные в этом браузере (при проверке на своём компьютере).
import { firebaseConfig } from './firebase-config.js';

const clean = (o) => JSON.parse(JSON.stringify(o));
const emptyData = (colls) => Object.fromEntries(colls.map((c) => [c, []]));

// На localhost (проверка при разработке) всегда пробный режим
const isLocalDev = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const firebaseConfigured = !isLocalDev && !Object.values(firebaseConfig).some((v) => String(v).includes('ВСТАВЬТЕ'));

class Base {
  constructor(colls) { this.colls = colls; this.data = emptyData(colls); this.listeners = new Set(); this.user = null; this.mode = 'local'; this.sync = 'ok'; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.version = (this.version || 0) + 1; this.listeners.forEach((f) => f(this.data)); }
  async putMany(coll, items) { for (let i = 0; i < items.length; i += 400) await this._write(coll, items.slice(i, i + 400), []); }
  async removeMany(coll, ids) { for (let i = 0; i < ids.length; i += 400) await this._write(coll, [], ids.slice(i, i + 400)); }
  put(coll, item) { return this.putMany(coll, [item]); }
  remove(coll, id) { return this.removeMany(coll, [id]); }
}

// ---------- пробный режим ----------
class LocalStore extends Base {
  constructor(colls, key) { super(colls); this.mode = 'local'; this.key = key; }
  async init() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (raw) this.data = { ...emptyData(this.colls), ...raw };
    } catch { /* пустое хранилище */ }
    this.user = { email: 'пробный режим' };
    this.emit();
  }
  _save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { this.sync = 'error'; } this.emit(); }
  async _write(coll, items, delIds) {
    const arr = this.data[coll];
    const idx = new Map(arr.map((x, i) => [String(x.id), i]));
    for (const it of items) {
      const c = clean(it);
      if (idx.has(String(c.id))) arr[idx.get(String(c.id))] = c; else { idx.set(String(c.id), arr.length); arr.push(c); }
    }
    if (delIds.length) { const d = new Set(delIds.map(String)); this.data[coll] = arr.filter((x) => !d.has(String(x.id))); }
    this._save();
  }
  async signOut() { /* в пробном режиме выходить некуда */ }
}

// ---------- Firebase ----------
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
class FirebaseStore extends Base {
  constructor(colls) { super(colls); this.mode = 'firebase'; this.unsubs = []; }
  async init() {
    const [{ initializeApp }, A, F] = await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
    ]);
    this.A = A; this.F = F;
    const app = initializeApp(firebaseConfig, 'taro');
    this.auth = A.getAuth(app);
    this.db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
    await new Promise((resolve) => {
      A.onAuthStateChanged(this.auth, (u) => {
        this.user = u ? { email: u.email, uid: u.uid } : null;
        this.unsubs.forEach((f) => f()); this.unsubs = [];
        this.data = emptyData(this.colls);
        if (u) this._listen(u.uid);
        this.emit(); resolve();
      });
    });
  }
  _listen(uid) {
    const { collection, onSnapshot } = this.F;
    for (const c of this.colls) {
      this.unsubs.push(onSnapshot(collection(this.db, 'users', uid, c), { includeMetadataChanges: true }, (snap) => {
        this.data[c] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        // «сохраняется…», пока хотя бы в одной коллекции есть неподтверждённые записи
        (this.pending ||= {})[c] = snap.metadata.hasPendingWrites;
        if (this.sync !== 'error') this.sync = Object.values(this.pending).some(Boolean) ? 'pending' : 'ok';
        this.emit();
      }, (e) => { this.sync = 'error'; this.error = e; this.emit(); }));
    }
  }
  async _write(coll, items, delIds) {
    const { writeBatch, doc } = this.F;
    const b = writeBatch(this.db);
    for (const it of items) { const c = clean(it); b.set(doc(this.db, 'users', this.user.uid, coll, String(c.id)), c); }
    for (const id of delIds) b.delete(doc(this.db, 'users', this.user.uid, coll, String(id)));
    // Без сети запись ставится в очередь и уйдёт при появлении связи, поэтому не ждём подтверждения сервера
    const p = b.commit();
    p.catch((e) => { this.sync = 'error'; this.error = e; this.emit(); });
    if (navigator.onLine) await p;
  }
  signIn(email, pw) { return this.A.signInWithEmailAndPassword(this.auth, email, pw); }
  signUp(email, pw) { return this.A.createUserWithEmailAndPassword(this.auth, email, pw); }
  reset(email) { return this.A.sendPasswordResetEmail(this.auth, email); }
  signOut() { return this.A.signOut(this.auth); }
}

export function createStore({ colls, localKey }) { return firebaseConfigured ? new FirebaseStore(colls) : new LocalStore(colls, localKey); }

export function authErrorText(e) {
  const c = e?.code || '';
  if (/invalid-credential|wrong-password|user-not-found/.test(c)) return 'Неверная почта или пароль.';
  if (/email-already-in-use/.test(c)) return 'Этот адрес уже зарегистрирован — нажмите «Войти».';
  if (/weak-password/.test(c)) return 'Пароль слишком простой: нужно минимум 6 символов.';
  if (/invalid-email/.test(c)) return 'Проверьте адрес почты.';
  if (/network/.test(c)) return 'Нет связи с интернетом.';
  if (/too-many/.test(c)) return 'Слишком много попыток. Подождите несколько минут.';
  return 'Не получилось: ' + (e?.message || c);
}
