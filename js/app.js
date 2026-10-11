// Таро-кабинет: колоды с типовыми значениями и наработками, расклады, клиенты и чат с Gemini по каждой колоде.
// Данные хранятся в Firebase под вашим аккаунтом, поэтому всё синхронизируется между телефоном и компьютером.
import { createStore, authErrorText } from './core/store.js';
import { installHandlers, esc, toast, acts, forms, watchForUpdates } from './core/ui.js';
import { ic } from './ticons.js';
import { KINDS } from './decks.js';
import { todayISO } from './util.js';
import { BUILTIN_SPREADS } from './spreads.js';
import { homeView } from './views/home.js';
import { decksView, deckPage, cardPage } from './views/decks.js';
import { readingsView, readingPage, spreadsView } from './views/readings.js';
import { clientsView, clientPage } from './views/clients.js';
import { chatView, chatAfter } from './views/chat.js';
import { settingsView } from './views/settings.js';

export const TCOLLS = ['t_decks', 't_cards', 't_mats', 't_readings', 't_clients', 't_spreads', 't_daily', 't_prefs'];
const store = createStore({ colls: TCOLLS, localKey: 'taroCabinet.v1' });
const ui = { route: '/', deckTab: 'cards', deckGroup: '', deckQ: '', readQ: '', readDeck: '', readClient: '', clientQ: '', chatDeck: '', chatLimit: 120, chatDraft: {} };
let theme = 'auto';
try { theme = localStorage.getItem('theme') || 'auto'; } catch { /* ок */ }

const app = {
  store, ui,
  get theme() { return theme; },
  setTheme(t) { theme = t; try { localStorage.setItem('theme', t); } catch { /* ок */ } applyTheme(); render(); },
  rerender: () => render(),
  go(path) { ui.route = path; render(); window.scrollTo(0, 0); },
  ctx: () => getCtx(),
};
window.__app = app;
function applyTheme() { const r = document.documentElement; if (theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme); }

let cache = null, cacheKey = '';
function getCtx() {
  const d = store.data, today = todayISO();
  const key = [store.version || 0, today].join('|');
  if (cache && key === cacheKey) return cache;
  const prefs = d.t_prefs.find((p) => p.id === 'main') || { id: 'main' };
  const decks = [...d.t_decks].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const cardsByDeck = {};
  for (const c of d.t_cards) (cardsByDeck[c.deckId] ||= []).push(c);
  for (const k in cardsByDeck) cardsByDeck[k].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const decksById = Object.fromEntries(decks.map((x) => [x.id, x]));
  const clients = [...d.t_clients].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
  cache = {
    data: d, today, prefs, decks, decksById, cardsByDeck,
    defaultDeck: decksById[prefs.defaultDeck] || decks[0] || null,
    readings: [...d.t_readings].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')),
    clients, clientsById: Object.fromEntries(clients.map((x) => [x.id, x])),
    spreads: [...BUILTIN_SPREADS, ...[...d.t_spreads].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'))],
    matsOf: (deckId) => d.t_mats.filter((m) => m.deckId === deckId),
    kindName: (deck) => KINDS[deck?.kind]?.short || '',
    reversals: (deck) => (deck?.useRev ?? KINDS[deck?.kind]?.reversals) !== false && !!deck,
  };
  cacheKey = key;
  return cache;
}

const TABS = [['/', 'house', 'Главная'], ['/decks', 'deck', 'Колоды'], ['/readings', 'spread', 'Расклады'], ['/clients', 'people', 'Клиенты'], ['/chat', 'chat', 'Gemini']];
function route() {
  const parts = (ui.route || '/').split('/').map(decodeURIComponent);
  const [, a, b, cc] = parts;
  if (a === 'deck' && b) return { tab: '/decks', view: (x) => deckPage(x, b) };
  if (a === 'card' && b && cc) return { tab: '/decks', view: (x) => cardPage(x, b, cc) };
  if (a === 'reading' && b) return { tab: '/readings', view: (x) => readingPage(x, b) };
  if (a === 'client' && b) return { tab: '/clients', view: (x) => clientPage(x, b) };
  if (a === 'chat') return { tab: '/chat', view: (x) => chatView(x, b), after: () => chatAfter(app, b) };
  const map = { '': homeView, decks: decksView, readings: readingsView, spreads: spreadsView, clients: clientsView, settings: settingsView };
  return { tab: a === 'spreads' ? '/readings' : a === 'settings' ? '' : '/' + (a || ''), view: map[a || ''] || homeView };
}

function authScreen() {
  document.getElementById('app').innerHTML = `<div class="auth"><h1>Таро-кабинет</h1><p class="muted">Войдите по почте и паролю. В первый раз впишите почту, придумайте пароль (от 6 символов) и нажмите «Создать аккаунт».</p>
  <form data-form="auth"><label for="em">Электронная почта</label><input id="em" name="email" type="email" autocomplete="email" required>
  <label for="pw">Пароль</label><input id="pw" name="pw" type="password" autocomplete="current-password" required minlength="6">
  <p id="authErr" class="down small" role="alert"></p>
  <div class="row"><button class="primary" type="submit" name="mode" value="in">Войти</button><button type="submit" name="mode" value="up">Создать аккаунт</button></div>
  <p><button type="button" class="link" data-act="auth.reset">Забыли пароль?</button></p></form></div>`;
}
forms.auth = async (fd, f, e) => {
  const err = document.getElementById('authErr'); err.textContent = '';
  const up = e.submitter?.value === 'up';
  try { await (up ? store.signUp : store.signIn).call(store, fd.get('email').trim(), fd.get('pw')); } catch (x) { err.textContent = authErrorText(x); }
};
acts['auth.reset'] = async () => {
  const email = (document.getElementById('em').value || '').trim();
  if (!email) { toast('Впишите адрес почты и нажмите ещё раз'); return; }
  try { await store.reset(email); toast('Письмо для смены пароля отправлено'); } catch (x) { toast(authErrorText(x)); }
};
acts['auth.out'] = async () => { await store.signOut(); ui.route = '/'; };

let afterFn = null;
function render() {
  if (!store.user) { authScreen(); return; }
  const { tab, view, after } = route();
  const c = getCtx();
  let r;
  try { r = view(app) || { html: '' }; } catch (e) { console.error(e); r = { html: `<div class="card"><p>Ошибка экрана: ${esc(e.message)}</p></div>` }; }
  const sync = store.mode === 'local' ? '' : store.sync === 'pending' ? 'сохраняется…' : store.sync === 'error' ? 'ошибка синхронизации' : navigator.onLine ? 'синхронизировано' : 'нет сети — сохранится позже';
  document.getElementById('app').innerHTML = `${store.mode === 'local' ? '<div class="demo">Пробный режим: данные только в этом браузере.</div>' : ''}
  <div class="top"><div><h1>${ic('moonstar')} Таро-кабинет</h1><small>${esc(c.prefs.name || '')}${c.prefs.name && sync ? ' · ' : ''}${sync}</small></div>
  <div class="row"><button data-act="go" data-to="/settings" aria-label="Настройки" title="Настройки">${ic('settings')}</button><button data-act="theme.toggle" aria-label="Тема" title="Тема">${ic(theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'auto')}</button></div></div>
  <main class="taro">${r.html}</main>
  <nav class="tabs">${TABS.map(([h, i, t]) => `<a href="#" data-act="go" data-to="${h}" class="${tab === h ? 'on' : ''}"><b>${ic(i)}</b>${t}</a>`).join('')}</nav>`;
  afterFn = () => { r.after?.(); after?.(); };
  afterFn();
}
acts.go = (d) => { ui.route = d.to; window.scrollTo(0, 0); };
acts['theme.toggle'] = () => app.setTheme({ auto: 'light', light: 'dark', dark: 'auto' }[theme]);

// Пока человек печатает — не перерисовываем (иначе пропадёт фокус), перерисуем, когда уйдёт из поля
let pending = false;
const typing = (a) => a && a.closest?.('main') && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
function safeRender() { if (typing(document.activeElement)) { pending = true; return; } render(); }
app.safeRender = safeRender;
document.addEventListener('focusout', () => { if (pending) setTimeout(() => { if (!typing(document.activeElement)) { pending = false; render(); } }, 150); });
window.addEventListener('online', safeRender); window.addEventListener('offline', safeRender);

installHandlers(() => safeRender());
watchForUpdates();
try { sessionStorage.removeItem('staleReload'); } catch { /* нет доступа к памяти браузера */ }
applyTheme();
store.subscribe(() => safeRender());
store.init().then(() => render()).catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = `<div class="auth"><h1>Не удалось запустить</h1><p>${esc(e.message || e)}</p></div>`;
});
