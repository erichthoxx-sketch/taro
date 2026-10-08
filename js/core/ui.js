// Общие мелочи интерфейса: экранирование, окна, уведомления, обработчики действий и форм.
import { parseNum } from './format.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const acts = {};   // data-act="имя"  → acts.имя(dataset, element, event)
export const forms = {};  // <form data-form="имя"> → forms.имя(FormData, form, event)
export const changes = {}; // data-chg="имя" → changes.имя(value, element)

let toastTimer;
// toast(msg, { undo }) — с кнопкой «Вернуть» (держится дольше)
export function toast(msg, opts = {}) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  if (opts.undo) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-undo'; b.textContent = 'Вернуть';
    b.onclick = async () => { t.hidden = true; await opts.undo(); };
    t.append(' ', b);
  }
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, opts.undo ? 6000 : 3500);
}

// Число из поля ввода: пусто → null, «1 234,5» → 1234.5, мусор → NaN
export function N(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  return parseNum(v);
}

export function openSheet(title, bodyHtml, onSubmit, { submitText = 'Сохранить' } = {}) {
  const dlg = document.getElementById('sheet');
  const f = document.getElementById('sheetForm');
  f.innerHTML = `<h2>${esc(title)}</h2>${bodyHtml}<div class="row between sheet-actions"><button type="button" data-close>${onSubmit ? 'Отмена' : 'Закрыть'}</button>${onSubmit ? `<button class="primary" type="submit">${esc(submitText)}</button>` : ''}</div>`;
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    const keep = await onSubmit(new FormData(f), f);
    if (keep !== false) dlg.close();
  };
  f.querySelector('[data-close]').onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
  // Окно открывается с начала: фокус на заголовок, а не на первую кнопку где-то в середине (иначе верх «уезжает»)
  const h = f.querySelector('h2');
  h.tabIndex = -1;
  h.focus({ preventScroll: true });
  dlg.scrollTop = 0; f.scrollTop = 0;
  requestAnimationFrame(() => { dlg.scrollTop = 0; f.scrollTop = 0; });
  return f;
}
export const closeSheet = () => document.getElementById('sheet').close();

export function installHandlers(afterChange) {
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = acts[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    try { await fn(el.dataset, el, e); } catch (err) { console.error(err); toast('Ошибка: ' + (err.message || err)); }
    afterChange?.();
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    try { await forms[f.dataset.form]?.(new FormData(f), f, e); } catch (err) { console.error(err); toast('Ошибка: ' + (err.message || err)); }
  });
  document.addEventListener('change', async (e) => {
    const el = e.target.closest('[data-chg]');
    if (!el) return;
    try { await changes[el.dataset.chg]?.(el.value, el, el.type === 'checkbox' ? el.checked : undefined); } catch (err) { console.error(err); toast('Ошибка: ' + (err.message || err)); }
  });
}

// Скачивание: в Claude через разрешение «downloads» (обычные ссылки там заблокированы), в обычном браузере — через ссылку
export async function download(filename, text, mime = 'text/plain') {
  try {
    const d = await window.claude?.use?.('downloads');
    if (d) { await d.save({ filename, data: text }); return true; }
  } catch (e) {
    if (e?.code === 'declined') return false;
    if (e?.code && e.code !== 'unavailable') { toast('Не удалось сохранить файл: ' + (e.message || e.code)); return false; }
  }
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}
// Подтверждение внутри страницы (окна confirm() в Claude не показываются)
export function ask(text, okText = 'Удалить') {
  return new Promise((res) => {
    let done = false;
    openSheet('Подтвердите', `<p>${esc(text)}</p>`, async () => { done = true; res(true); }, { submitText: okText });
    document.getElementById('sheet').addEventListener('close', () => { if (!done) res(false); }, { once: true });
  });
}
export const readFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file); });

export const opt = (value, label, sel) => `<option value="${esc(value)}"${String(sel) === String(value) ? ' selected' : ''}>${esc(label)}</option>`;
export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

// Автообновление: если на сайте вышла новая версия, а браузер показывает старую из памяти — перезагружаем.
// Версия зашита в адрес скриптов (папка vXXXXXXXX), её сравниваем со свежей страницей.
export function watchForUpdates() {
  const mine = /\/v([0-9a-f]{8})\//.exec(import.meta.url)?.[1];
  if (!mine) return; // локальная проверка — без версий
  const check = async () => {
    try {
      const html = await (await fetch(location.pathname, { cache: 'no-store' })).text();
      const live = /["/]v([0-9a-f]{8})\//.exec(html)?.[1]; // src="vXXXX/…" или "../vXXXX/…"
      if (live && live !== mine) {
        const key = 'reloadedFor';
        if (sessionStorage.getItem(key) === live) return; // не зацикливаемся
        sessionStorage.setItem(key, live);
        location.reload();
      }
    } catch { /* нет сети — проверим в следующий раз */ }
  };
  check();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
