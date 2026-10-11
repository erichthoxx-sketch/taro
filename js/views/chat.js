// Чат с Gemini по одной колоде. Переписка хранится вся; в запрос идут последние сообщения дословно,
// более старые — сжатой «памятью», плюс вся база знаний колоды (значения, наработки, материалы).
import { ic } from '../ticons.js';
import { esc, acts, changes, openSheet, toast, uid, ask } from '../core/ui.js';
import { md } from '../tcalc.js';
import { sendChat, maybeRemember, aiConf, KEEP_RECENT } from '../brain.js';
import { aiErrorText } from '../ai.js';
import { listenChat, deleteMsgs } from '../extra.js';
import { hasNotes, nowISO, dayName } from '../util.js';

const app = () => window.__app;
const chat = { deckId: '', limit: 0, msgs: null, unsub: null, err: '', seen: 0 };
let busy = null;

function deckFor(c, id) { return c.decksById[id] || c.decksById[app().ui.chatDeck] || c.defaultDeck; }

export function chatView(a, id) {
  const c = a.ctx(), ui = a.ui;
  const deck = deckFor(c, id);
  if (!deck) return { html: '<div class="card"><p>Чат ведётся по колоде: Gemini опирается на её значения и ваши наработки. Сначала добавьте колоду.</p><button class="primary" data-act="go" data-to="/decks">К колодам</button></div>' };
  ui.chatDeck = deck.id;
  const cards = c.cardsByDeck[deck.id] || [];
  const mats = c.matsOf(deck.id);
  const msgs = chat.deckId === deck.id ? chat.msgs : null;
  const { key, model } = aiConf(c);
  const memWords = (deck.memory || '').split(/\s+/).filter(Boolean).length;
  const bubble = (m) => m.role === 'user'
    ? `<div class="msg user"><div class="pre">${esc(m.text)}</div><div class="msg-meta">${esc(timeOf(m.ts))}<button class="link" data-act="chat.del" data-id="${m.id}" aria-label="Удалить сообщение">убрать</button></div></div>`
    : `<div class="msg ai"><div class="ai-out">${md(m.text)}</div>${notesHtml(m.notes)}${m.cut ? '<div class="small muted">ответ оборвался</div>' : ''}
      <div class="msg-meta">${esc(timeOf(m.ts))}<button class="link" data-act="chat.copy" data-id="${m.id}">${ic('copy')} копировать</button><button class="link" data-act="chat.toMat" data-id="${m.id}">${ic('note')} в материалы</button><button class="link" data-act="chat.del" data-id="${m.id}">убрать</button></div></div>`;
  let list = '';
  if (!msgs) list = '<p class="muted small">Загружаю переписку…</p>';
  else if (!msgs.length && !busy) list = `<div class="chat-empty"><p>Это ваш постоянный чат по колоде «${esc(deck.name)}». Gemini видит все карты с типовыми значениями, ваши наработки, наблюдения и материалы — и помнит прошлые разговоры.</p>
    <p class="small muted">Расскажите ему о своём понимании карт — он сам запишет это в наработки. Или попросите:</p>
    <div class="chips">${['Какие карты в моей базе ещё без наработок?', 'Как в этой колоде читать сочетание Башни и Звезды?', 'Помоги сформулировать для клиента расклад на отношения'].map((t) => `<button class="chip" data-act="chat.suggest" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`;
  else {
    let day = '';
    list = (msgs.length >= chat.limit ? `<p class="center"><button class="link" data-act="chat.more">Показать более ранние</button></p>` : '')
      + msgs.map((m) => { const d = dayKey(m.ts); const sep = d !== day ? `<div class="day-sep">${esc(dayName(d))}</div>` : ''; day = d; return sep + bubble(m); }).join('');
  }
  if (busy && busy.deckId === deck.id) list += `<div class="msg ai" id="liveBubble">${liveHtml()}</div>`;
  const html = `<div class="chat-head">
    ${c.decks.length > 1 ? `<select data-chg="chat.deck" aria-label="Колода">${c.decks.map((d) => `<option value="${d.id}"${d.id === deck.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select>` : `<h2>${esc(deck.name)}</h2>`}
    <div class="small muted">Gemini знает: ${cards.length} карт (с наработками — ${cards.filter(hasNotes).length}), материалов — ${mats.length}, память — ${memWords ? memWords + ' слов' : 'пока пусто'} · <button class="link" data-act="chat.memory" data-id="${deck.id}">память</button>${key ? ` · ${esc(model)}` : ''}</div></div>
  ${!key ? '<div class="alert">Чтобы чат заработал, добавьте бесплатный ключ Gemini в <a href="#" data-act="go" data-to="/settings">настройках</a>.</div>' : ''}
  <div class="chat" id="chatList">${list}</div>
  ${chat.err ? `<div class="alert bad">${esc(chat.err)}</div>` : ''}
  <div class="composer"><textarea id="chatIn" rows="2" placeholder="Напишите Gemini…" aria-label="Сообщение">${esc(ui.chatDraft[deck.id] || '')}</textarea>
    ${busy ? `<button data-act="chat.stop">${ic('stop')} Стоп</button>` : `<button class="primary" data-act="chat.send" data-id="${deck.id}" aria-label="Отправить">${ic('send')}</button>`}</div>`;
  return { html };
}

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeOf = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const notesHtml = (notes) => (notes || []).length ? `<div class="tags saved">${notes.map((n) => `<a class="tag on" href="#" data-act="go" data-to="${esc(n.link || '')}">${ic('note')} ${esc(n.label)}</a>`).join('')}</div>` : '';
const liveHtml = () => (busy.text ? `<div class="ai-out">${md(busy.text)}</div>` : '<p class="thinking">Gemini думает…</p>') + notesHtml(busy.notes);

// после отрисовки: подписка на переписку открытой колоды, черновик, Enter, прокрутка вниз
export function chatAfter(a, id) {
  const c = a.ctx(), deck = deckFor(c, id);
  if (!deck) return;
  const limit = a.ui.chatLimit;
  if (chat.deckId !== deck.id || chat.limit !== limit) {
    chat.unsub?.();
    const first = chat.deckId !== deck.id;
    chat.deckId = deck.id; chat.limit = limit; chat.err = '';
    if (first) { chat.msgs = null; chat.seen = 0; }
    chat.unsub = listenChat(deck.id, limit, (msgs, e) => {
      if (e) { chat.err = 'Не получилось загрузить переписку: ' + (e.message || e); a.safeRender(); return; }
      chat.msgs = msgs; a.safeRender();
    });
  }
  const ta = document.getElementById('chatIn');
  if (ta) {
    ta.addEventListener('input', () => { a.ui.chatDraft[deck.id] = ta.value; });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover: hover) and (pointer: fine)').matches) { e.preventDefault(); send(deck.id); }
    });
    if (a.ui.chatFocus) { a.ui.chatFocus = false; // черновик из «Обсудить в чате» / «Спросить Gemini»
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
  const n = (chat.msgs || []).length + (busy ? 1 : 0);
  if (chat.msgs && n !== chat.seen) { chat.seen = n; requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight)); }
}

function paint() {
  const el = document.getElementById('liveBubble');
  if (el) { el.innerHTML = liveHtml(); window.scrollTo(0, document.body.scrollHeight); }
}

async function send(deckId) {
  const a = app(), c = a.ctx(), deck = c.decksById[deckId];
  const ta = document.getElementById('chatIn');
  const text = (ta?.value || '').trim();
  if (!text || busy || !deck) return;
  if (!c.prefs.aiKey) { toast('Сначала добавьте ключ Gemini в настройках'); a.go('/settings'); return; }
  a.ui.chatDraft[deckId] = '';
  if (ta) { ta.value = ''; ta.blur(); }
  chat.err = '';
  busy = { deckId, text: '', notes: [], ctl: new AbortController() };
  a.rerender();
  try {
    await sendChat(c, deck, chat.msgs || [], text, { signal: busy.ctl.signal, onText: (t, notes) => { if (!busy) return; busy.text = t; busy.notes = [...notes]; paint(); } });
  } catch (e) {
    if (e.code !== 'cancelled') chat.err = aiErrorText(e);
    if (e.code === 'no_key' || e.code === 'bad_key') a.ui.chatDraft[deckId] = text;
  } finally { busy = null; a.safeRender(); }
  // память: когда переписка разрослась, старое сжимается — в фоне, не мешая писать дальше
  setTimeout(async () => {
    try {
      const cc = a.ctx(), d = cc.decksById[deckId];
      if (d && chat.deckId === deckId && await maybeRemember(cc, d, chat.msgs || [])) toast('Gemini обновил память по колоде');
    } catch (e) { console.warn('память не обновилась', e); }
  }, 800);
}
acts['chat.send'] = (d) => send(d.id);
acts['chat.stop'] = () => busy?.ctl.abort();
acts['chat.suggest'] = (d) => { const ta = document.getElementById('chatIn'); if (ta) { ta.value = d.t; app().ui.chatDraft[app().ui.chatDeck] = d.t; ta.focus(); } };
acts['chat.more'] = () => { app().ui.chatLimit += 150; };
acts['chat.del'] = async (d) => {
  if (!(await ask('Убрать это сообщение из переписки? Gemini перестанет его учитывать (если оно ещё не ушло в память).', 'Убрать'))) return;
  await deleteMsgs(chat.deckId, [d.id]);
};
acts['chat.copy'] = async (d) => {
  const m = (chat.msgs || []).find((x) => x.id === d.id);
  try { await navigator.clipboard.writeText(m.text); toast('Скопировано'); } catch { toast('Не получилось скопировать — выделите текст вручную'); }
};
acts['chat.toMat'] = (d) => {
  const m = (chat.msgs || []).find((x) => x.id === d.id);
  const first = (m.text.split('\n').find((l) => l.trim()) || '').replace(/[#*]/g, '').trim();
  openSheet('Сохранить в материалы колоды', `<label for="cmt">Заголовок</label><input id="cmt" name="title" value="${esc(first.slice(0, 70))}" required>
    <label for="cmx">Текст</label><textarea id="cmx" name="text" rows="10">${esc(m.text)}</textarea>`, async (fd) => {
    await app().store.put('t_mats', { id: uid(), deckId: chat.deckId, title: fd.get('title').trim(), tag: 'Из чата', text: fd.get('text'), createdAt: nowISO() });
    toast('Сохранено в материалы');
  });
};
acts['chat.memory'] = (d) => {
  const deck = app().ctx().decksById[d.id];
  openSheet('Память Gemini по колоде', `<p class="small muted">Когда переписка становится длинной, Gemini сжимает старые сообщения в эту память (последние ${KEEP_RECENT} сообщений он и так видит целиком). Можно поправить или дописать вручную.${deck.memAt ? ` Обновлена ${esc(dayName(deck.memAt.slice(0, 10)))}.` : ''}</p>
    <textarea name="memory" rows="16" aria-label="Память">${esc(deck.memory || '')}</textarea>`, async (fd) => {
    await app().store.put('t_decks', { ...app().ctx().decksById[d.id], memory: fd.get('memory') });
    toast('Память сохранена');
  });
};

changes['chat.deck'] = (v) => { app().go('/chat/' + v); };
