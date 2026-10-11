import { ic } from '../ticons.js';
import { esc, acts, forms, changes, openSheet, opt, toast, uid, ask, closeSheet } from '../core/ui.js';
import { groupsOf } from '../decks.js';
import { fitsDeck } from '../spreads.js';
import { interpret, readingText } from '../brain.js';
import { aiErrorText } from '../ai.js';
import { md } from '../tcalc.js';
import { fillPhotos } from '../extra.js';
import { tile, todayISO, nowISO, dayName, monthName, rand, FEEDBACK } from '../util.js';
import { num } from '../core/format.js';

const app = () => window.__app;
const byId = (id) => app().store.data.t_readings.find((r) => r.id === id);
const save = (r) => app().store.put('t_readings', r);

// ---------- список ----------
export function readingsView(a) {
  const c = a.ctx(), ui = a.ui;
  const q = (ui.readQ || '').toLowerCase().trim();
  const list = c.readings.filter((r) => (!ui.readDeck || r.deckId === ui.readDeck) && (!ui.readClient || (ui.readClient === '-' ? !r.clientId : r.clientId === ui.readClient))
    && (!q || [r.question, r.myText, r.aiText, r.spreadName, c.clientsById[r.clientId]?.name, ...(r.cards || []).map((p) => cardOf(c, r, p)?.name)].join(' ').toLowerCase().includes(q)));
  const months = new Map();
  for (const r of list) { const m = (r.date || '').slice(0, 7); if (!months.has(m)) months.set(m, []); months.get(m).push(r); }
  const html = `<div class="row between head-row"><h2>Расклады</h2><div class="row"><button data-act="go" data-to="/spreads">Схемы раскладов</button><button class="primary" data-act="reading.new">${ic('plus')} Расклад</button></div></div>
  ${c.readings.length ? `<div class="card"><input type="search" value="${esc(ui.readQ || '')}" placeholder="Поиск: вопрос, карта, клиент, слово из трактовки" data-chg="read.q" aria-label="Поиск по раскладам">
    <div class="f2" style="margin-top:8px"><select data-chg="read.deck" aria-label="Колода"><option value="">Все колоды</option>${c.decks.map((d) => opt(d.id, d.name, ui.readDeck)).join('')}</select>
    <select data-chg="read.client" aria-label="Клиент"><option value="">Все клиенты</option>${opt('-', 'Для себя', ui.readClient)}${c.clients.map((x) => opt(x.id, x.name, ui.readClient)).join('')}</select></div></div>` : ''}
  ${list.length ? [...months].map(([m, rs]) => `<h3 class="month">${m ? monthName(m) : 'Без даты'} <span class="muted small">${rs.length}</span></h3><div class="card list-card"><div class="list">${rs.map((r) => row(c, r)).join('')}</div></div>`).join('')
    : `<div class="card"><p class="muted" style="margin:0">${c.readings.length ? 'Ничего не нашлось.' : c.decks.length ? 'Раскладов пока нет. Нажмите «+ Расклад»: выберите колоду, схему и карты — свои выпавшие или случайные.' : 'Сначала добавьте колоду на вкладке «Колоды».'}</p></div>`}`;
  return { html };
}
changes['read.q'] = (v) => { app().ui.readQ = v; app().rerender(); };
changes['read.deck'] = (v) => { app().ui.readDeck = v; app().rerender(); };
changes['read.client'] = (v) => { app().ui.readClient = v; app().rerender(); };

function cardOf(c, r, p) { return p?.key ? (c.cardsByDeck[r.deckId] || []).find((x) => x.key === p.key) : null; }

export function row(c, r) {
  const names = (r.cards || []).map((p) => cardOf(c, r, p)).filter(Boolean).map((x) => x.name);
  const fb = r.feedback ? `<span class="badge ${r.feedback === 'yes' ? 'good' : r.feedback === 'no' ? 'bad' : 'warn'}">${FEEDBACK[r.feedback]}</span>` : '';
  return `<a class="item" href="#" data-act="go" data-to="/reading/${r.id}"><div class="row between"><b>${esc(r.question || r.spreadName || 'Расклад')}</b><span class="small muted">${esc(dayName(r.date))}</span></div>
    <div class="small muted">${esc(c.clientsById[r.clientId]?.name || 'для себя')} · ${esc(c.decksById[r.deckId]?.name || '')}${r.price ? ' · ' + num(r.price) + ' ₽' : ''} ${fb}</div>
    ${names.length ? `<div class="small">${esc(names.join(' · '))}</div>` : '<div class="small muted">карты не выбраны</div>'}</a>`;
}

acts['reading.new'] = async (d) => {
  const c = app().ctx();
  const deck = c.decksById[d.deck] || c.defaultDeck;
  if (!deck) { toast('Сначала добавьте колоду'); app().go('/decks'); return; }
  const sp = c.spreads.find((s) => s.id === (deck.kind === 'lenormand' ? 'l3' : 'ppf'));
  const r = { id: uid(), date: todayISO(), createdAt: nowISO(), deckId: deck.id, clientId: d.client || '', spreadId: sp.id, spreadName: sp.name, positions: [...sp.positions], cards: sp.positions.map(() => null), question: '', myText: '', aiText: '', feedback: '', feedbackNote: '', price: null };
  await save(r);
  app().go('/reading/' + r.id);
};

// ---------- страница расклада ----------
export function readingPage(a, id) {
  const c = a.ctx(), r = byId(id);
  if (!r) return { html: '<p><a class="btn back" href="#" data-act="go" data-to="/readings">← Расклады</a></p><div class="card"><p>Расклад не найден.</p></div>' };
  const deck = c.decksById[r.deckId];
  const cards = c.cardsByDeck[r.deckId] || [];
  const byKey = Object.fromEntries(cards.map((x) => [x.key, x]));
  const rev = c.reversals(deck);
  const spreads = c.spreads.filter((s) => fitsDeck(s, deck?.kind));
  const picked = (r.cards || []).filter((p) => p?.key).length;
  const slots = (r.positions || []).map((p, i) => {
    const pick = (r.cards || [])[i], x = pick?.key ? byKey[pick.key] : null;
    return `<div class="slot"><div class="pos"><b>${i + 1}</b> <span>${esc(p)}</span></div>
      <button class="slot-pick" data-act="pick.open" data-r="${r.id}" data-i="${i}" aria-label="${x ? 'Заменить карту: ' + esc(x.name) : 'Выбрать карту для позиции ' + (i + 1)}">${tile(x, { rev: pick?.rev })}</button>
      <div class="slot-cap">${x ? esc(x.name) : '<span class="muted">выбрать</span>'}</div>
      ${x && rev ? `<label class="check small"><input type="checkbox" ${pick.rev ? 'checked' : ''} data-chg="pick.rev" data-r="${r.id}" data-i="${i}">перевёрнута</label>` : ''}</div>`;
  }).join('');
  const meanings = (r.positions || []).map((p, i) => {
    const pick = (r.cards || [])[i], x = pick?.key ? byKey[pick.key] : null;
    if (!x) return '';
    const kw = pick.rev && x.rev ? x.rev : x.up;
    const last = (x.obs || []).slice(-2);
    return `<div class="mean"><div class="small muted">${i + 1}. ${esc(p)}</div><a href="#" data-act="go" data-to="/card/${r.deckId}/${x.key}"><b>${esc(x.name)}</b></a>${pick.rev ? ' <span class="small muted">(перевёрнутая)</span>' : ''}
      ${kw ? `<div>${esc(kw)}</div>` : ''}${x.notes ? `<div class="mine-note">${esc(x.notes.length > 280 ? x.notes.slice(0, 280) + '…' : x.notes)}</div>` : ''}${last.map((o) => `<div class="small muted">• ${esc(o.text.length > 160 ? o.text.slice(0, 160) + '…' : o.text)}</div>`).join('')}</div>`;
  }).join('');
  const html = `<div class="row between"><a class="btn back" href="#" data-act="go" data-to="/readings">← Расклады</a><button class="link danger" data-act="reading.del" data-id="${r.id}">${ic('trash')} Удалить</button></div>
  <div class="card"><div class="f2"><div><label for="rd">Дата</label><input id="rd" type="date" value="${esc(r.date || '')}" data-chg="r.f" data-id="${r.id}" data-f="date"></div>
    <div><label for="rc">Для кого</label><select id="rc" data-chg="r.client" data-id="${r.id}"><option value="">Для себя</option>${c.clients.map((x) => opt(x.id, x.name, r.clientId)).join('')}<option value="+">+ Новый клиент…</option></select></div></div>
    <div class="f2"><div><label for="rdk">Колода</label><select id="rdk" data-chg="r.deck" data-id="${r.id}">${c.decks.map((d) => opt(d.id, d.name, r.deckId)).join('')}</select></div>
    <div><label for="rsp">Схема</label><select id="rsp" data-chg="r.spread" data-id="${r.id}">${spreads.map((s) => opt(s.id, `${s.name} (${s.positions.length})`, r.spreadId)).join('')}${r.spreadId === 'own' ? opt('own', 'Своя раскладка', 'own') : ''}</select></div></div>
    <label for="rq">Вопрос</label><textarea id="rq" rows="2" data-chg="r.f" data-id="${r.id}" data-f="question" placeholder="Например: как сложатся отношения с N в ближайшие три месяца?">${esc(r.question || '')}</textarea></div>

  <div class="card"><div class="row between"><h2>Карты</h2><span class="small muted">${picked} из ${(r.positions || []).length}</span></div>
    <div class="spread-grid ${(r.positions || []).length > 9 ? 'many' : ''}">${slots}</div>
    <div class="row" style="margin-top:12px"><button data-act="pick.random" data-r="${r.id}">${ic('shuffle')} ${picked ? 'Добрать случайно' : 'Вытянуть случайно'}</button><button data-act="pick.addPos" data-r="${r.id}">${ic('plus')} Уточняющая карта</button>${picked ? `<button class="link" data-act="pick.clear" data-r="${r.id}">Очистить карты</button>` : ''}</div>
    <p class="hint">Раскладываете живой колодой — нажмите на место и выберите выпавшую карту. Виртуально — «Вытянуть случайно».</p></div>

  ${meanings ? `<div class="card"><h2>Значения из вашей базы</h2><div class="means">${meanings}</div></div>` : ''}

  <div class="card mine"><h2>${ic('note')} Моя трактовка</h2><textarea rows="6" data-chg="r.f" data-id="${r.id}" data-f="myText" placeholder="Ваши выводы по раскладу" aria-label="Моя трактовка">${esc(r.myText || '')}</textarea></div>

  <div class="card"><div class="row between"><h2>${ic('sparkle')} Трактовка Gemini</h2><div class="row"><button class="small-btn" id="aiStop" data-act="r.aiStop" hidden>Стоп</button><button class="primary" id="aiGo" data-act="r.ai" data-id="${r.id}" ${picked ? '' : 'disabled'}>${r.aiText ? 'Заново' : 'Истолковать'}</button></div></div>
    ${aiErr[r.id] ? `<div class="alert bad pre">${esc(aiErr[r.id])}</div>` : ''}
    <div class="ai-out" id="aiOut">${r.aiText ? md(r.aiText) : `<p class="muted small">${picked ? 'Gemini посмотрит на карты в связке и опирается на ваши наработки и материалы по этой колоде.' : 'Сначала выберите карты.'}</p>`}</div>
    <div class="row" style="margin-top:8px"><button data-act="r.chat" data-id="${r.id}">${ic('chat')} Обсудить в чате колоды</button></div></div>

  <div class="card"><h2>Обратная связь</h2>
    <div class="chips">${['', 'yes', 'part', 'no'].map((k) => `<button class="chip ${(r.feedback || '') === k ? 'on' : ''}" data-act="r.fb" data-id="${r.id}" data-v="${k}">${k ? FEEDBACK[k] : 'Ещё не ясно'}</button>`).join('')}</div>
    <label for="rfn">Что произошло на самом деле</label><textarea id="rfn" rows="3" data-chg="r.f" data-id="${r.id}" data-f="feedbackNote">${esc(r.feedbackNote || '')}</textarea>
    <div class="f2"><div><label for="rp">Оплата, ₽</label><input id="rp" inputmode="decimal" value="${r.price ?? ''}" data-chg="r.price" data-id="${r.id}"></div><div></div></div></div>`;
  return { html, after: () => fillPhotos() };
}

changes['r.f'] = async (v, el) => { const r = byId(el.dataset.id); if (r) await save({ ...r, [el.dataset.f]: v }); };
changes['r.price'] = async (v, el) => { const r = byId(el.dataset.id); const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); await save({ ...r, price: Number.isFinite(n) ? n : null }); };
changes['r.client'] = async (v, el) => {
  const r = byId(el.dataset.id);
  if (v !== '+') { await save({ ...r, clientId: v }); return; }
  openSheet('Новый клиент', `<label for="ncn">Имя</label><input id="ncn" name="name" required><label for="ncb">Дата рождения</label><input id="ncb" name="birth" type="date"><label for="ncc">Контакт</label><input id="ncc" name="contact" placeholder="телефон, телеграм…">`, async (fd) => {
    const cl = { id: uid(), name: fd.get('name').trim(), birth: fd.get('birth'), contact: fd.get('contact').trim(), notes: '', createdAt: nowISO() };
    await app().store.put('t_clients', cl);
    await save({ ...byId(r.id), clientId: cl.id });
  });
  el.value = r.clientId || '';
};
changes['r.deck'] = async (v, el) => {
  const r = byId(el.dataset.id), c = app().ctx(), deck = c.decksById[v];
  const sp = c.spreads.find((s) => s.id === r.spreadId);
  const keep = sp && fitsDeck(sp, deck.kind);
  const nsp = keep ? sp : c.spreads.find((s) => s.id === (deck.kind === 'lenormand' ? 'l3' : 'ppf'));
  const positions = keep ? r.positions : [...nsp.positions];
  await save({ ...r, deckId: v, spreadId: nsp.id, spreadName: nsp.name, positions, cards: positions.map(() => null) });
  if ((r.cards || []).some((p) => p?.key)) toast('Колода сменилась — карты нужно выбрать заново');
};
changes['r.spread'] = async (v, el) => {
  const r = byId(el.dataset.id), sp = app().ctx().spreads.find((s) => s.id === v);
  if (!sp) return;
  const cards = sp.positions.map((_, i) => (r.cards || [])[i] || null);
  await save({ ...r, spreadId: sp.id, spreadName: sp.name, positions: [...sp.positions], cards });
};
acts['reading.del'] = async (d) => {
  const r = byId(d.id);
  if (!(await ask('Удалить этот расклад?'))) return;
  await app().store.remove('t_readings', d.id);
  app().go('/readings');
  toast('Расклад удалён', { undo: () => save(r) });
};
acts['r.fb'] = async (d) => { const r = byId(d.id); await save({ ...r, feedback: d.v, feedbackAt: d.v ? todayISO() : '' }); };

// выбор карты: окно с поиском по колоде
acts['pick.open'] = (d) => {
  const c = app().ctx(), r = byId(d.r);
  const cards = c.cardsByDeck[r.deckId] || [];
  const used = new Set((r.cards || []).map((p, i) => (i !== Number(d.i) ? p?.key : null)).filter(Boolean));
  const groups = groupsOf(c.decksById[r.deckId]?.kind);
  const btn = (x) => `<button type="button" class="pick ${used.has(x.key) ? 'used' : ''}" data-act="pick.set" data-r="${r.id}" data-i="${d.i}" data-key="${x.key}" data-name="${esc(x.name.toLowerCase())}">${esc(x.name)}</button>`;
  const body = groups.length
    ? groups.map(([g, t]) => `<div class="pick-group"><div class="small muted">${t}</div><div class="picks">${cards.filter((x) => x.group === g).map(btn).join('')}</div></div>`).join('')
    : `<div class="picks">${cards.map(btn).join('')}</div>`;
  const f = openSheet(`Позиция ${Number(d.i) + 1}: ${r.positions[d.i] || ''}`, `<input type="search" id="pickQ" placeholder="Начните вводить название" aria-label="Поиск карты" autocomplete="off">${body}
    ${(r.cards || [])[d.i]?.key ? `<p><button type="button" class="link danger" data-act="pick.set" data-r="${r.id}" data-i="${d.i}" data-key="">Убрать карту с этой позиции</button></p>` : ''}`, null);
  const qi = f.querySelector('#pickQ');
  qi.addEventListener('input', () => {
    const q = qi.value.toLowerCase().trim();
    f.querySelectorAll('.pick').forEach((b) => { b.hidden = !!q && !b.dataset.name.includes(q); });
    f.querySelectorAll('.pick-group').forEach((g) => { g.hidden = ![...g.querySelectorAll('.pick')].some((b) => !b.hidden); });
  });
};
acts['pick.set'] = async (d) => {
  const r = byId(d.r);
  const cards = [...(r.cards || [])];
  while (cards.length < r.positions.length) cards.push(null);
  cards[Number(d.i)] = d.key ? { key: d.key, rev: false } : null;
  closeSheet();
  await save({ ...r, cards });
};
changes['pick.rev'] = async (v, el, checked) => {
  const r = byId(el.dataset.r), cards = [...r.cards];
  cards[Number(el.dataset.i)] = { ...cards[Number(el.dataset.i)], rev: !!checked };
  await save({ ...r, cards });
};
acts['pick.random'] = async (d) => {
  const c = app().ctx(), r = byId(d.r), deck = c.decksById[r.deckId];
  const pool = (c.cardsByDeck[r.deckId] || []).map((x) => x.key).filter((k) => !(r.cards || []).some((p) => p?.key === k));
  const rev = c.reversals(deck);
  const cards = r.positions.map((_, i) => {
    const cur = (r.cards || [])[i];
    if (cur?.key || !pool.length) return cur || null;
    const k = pool.splice(rand(pool.length), 1)[0];
    return { key: k, rev: rev ? rand(2) === 1 : false };
  });
  await save({ ...r, cards });
};
acts['pick.addPos'] = async (d) => {
  const r = byId(d.r);
  await save({ ...r, positions: [...r.positions, 'Уточнение'], cards: [...r.positions.map((_, i) => (r.cards || [])[i] || null), null] });
};
acts['pick.clear'] = async (d) => { const r = byId(d.r); await save({ ...r, cards: r.positions.map(() => null) }); };

// трактовка Gemini — текст появляется по мере написания
let aiCtl = null;
const aiErr = {}; // последняя ошибка толкования по раскладу — показываем, пока не повторят
acts['r.ai'] = async (d) => {
  const c = app().ctx(), r = byId(d.id);
  if (!c.prefs.aiKey) { toast('Сначала добавьте ключ Gemini в настройках'); app().go('/settings'); return; }
  if (aiCtl) return;
  aiCtl = new AbortController();
  delete aiErr[d.id];
  const out = document.getElementById('aiOut'), go = document.getElementById('aiGo'), stop = document.getElementById('aiStop');
  if (go) go.disabled = true; if (stop) stop.hidden = false;
  if (out) out.innerHTML = '<p class="thinking">Gemini смотрит на карты…</p>';
  let text = '';
  try {
    text = await interpret(c, r, { signal: aiCtl.signal, onText: (t) => { text = t; const o = document.getElementById('aiOut'); if (o) o.innerHTML = md(t); } });
    await save({ ...byId(d.id), aiText: text });
  } catch (e) {
    if (e.text) await save({ ...byId(d.id), aiText: e.text });
    if (e.code !== 'cancelled') aiErr[d.id] = aiErrorText(e);
  } finally { aiCtl = null; app().rerender(); }
};
acts['r.aiStop'] = () => aiCtl?.abort();
acts['r.chat'] = (d) => {
  const c = app().ctx(), r = byId(d.id);
  app().ui.chatFocus = true;
  app().ui.chatDraft[r.deckId] = `Давай разберём расклад.\n${readingText(c, r)}${r.aiText ? '\n\nТвоя трактовка была такой:\n' + r.aiText.slice(0, 3000) : ''}\n\nМой вопрос: `;
  app().go('/chat/' + r.deckId);
};

// ---------- схемы раскладов ----------
export function spreadsView(a) {
  const c = a.ctx();
  const own = c.spreads.filter((s) => !s.builtin && c.data.t_spreads.some((x) => x.id === s.id));
  const builtin = c.spreads.filter((s) => !own.includes(s));
  const card = (s, mine) => `<div class="item"><div class="row between"><b>${esc(s.name)}</b><span class="small muted">${s.positions.length} карт${mine ? '' : ' · встроенная'}</span></div>
    ${s.desc ? `<div class="small muted">${esc(s.desc)}</div>` : ''}<div class="small">${s.positions.map((p, i) => `${i + 1}. ${esc(p)}`).join(' · ')}</div>
    ${mine ? `<div class="row"><button class="link" data-act="sp.edit" data-id="${s.id}">Изменить</button><button class="link danger" data-act="sp.del" data-id="${s.id}">Удалить</button></div>` : `<div class="row"><button class="link" data-act="sp.edit" data-copy="${s.id}">Сделать свою на основе</button></div>`}</div>`;
  const html = `<p><a class="btn back" href="#" data-act="go" data-to="/readings">← Расклады</a></p>
  <div class="row between head-row"><h2>Схемы раскладов</h2><button class="primary" data-act="sp.edit">${ic('plus')} Своя схема</button></div>
  <div class="card"><h2>Мои схемы</h2>${own.length ? `<div class="list">${own.map((s) => card(s, true)).join('')}</div>` : '<p class="muted small">Добавьте авторские расклады: название, позиции по порядку и пояснение. Они появятся в выборе схемы.</p>'}</div>
  <div class="card"><h2>Встроенные</h2><div class="list">${builtin.map((s) => card(s, false)).join('')}</div></div>`;
  return { html };
}
acts['sp.edit'] = (d) => {
  const c = app().ctx();
  const s = d.id ? c.data.t_spreads.find((x) => x.id === d.id) : d.copy ? { ...c.spreads.find((x) => x.id === d.copy), id: '', name: c.spreads.find((x) => x.id === d.copy).name + ' (моя)' } : null;
  openSheet(s?.id ? 'Схема расклада' : 'Новая схема', `<label for="sn">Название</label><input id="sn" name="name" value="${esc(s?.name || '')}" required>
    <label for="sf">Для каких колод</label><select id="sf" name="for">${opt('any', 'для любых', s?.for || 'any')}${opt('tarot', 'для таро (78 карт)', s?.for)}${opt('lenormand', 'для Ленорман', s?.for)}</select>
    <label for="spp">Позиции — по одной в строке, по порядку выкладки</label><textarea id="spp" name="positions" rows="8" required>${esc((s?.positions || []).join('\n'))}</textarea>
    <label for="sd">Пояснение: как выкладывать и читать</label><textarea id="sd" name="desc" rows="3">${esc(s?.desc || '')}</textarea>`, async (fd) => {
    const positions = String(fd.get('positions')).split('\n').map((x) => x.trim()).filter(Boolean);
    if (!positions.length) { toast('Добавьте хотя бы одну позицию'); return false; }
    await app().store.put('t_spreads', { id: s?.id || uid(), name: fd.get('name').trim(), for: fd.get('for'), positions, desc: fd.get('desc').trim() });
    toast('Схема сохранена');
  });
};
acts['sp.del'] = async (d) => {
  const s = app().store.data.t_spreads.find((x) => x.id === d.id);
  if (!(await ask(`Удалить схему «${s.name}»? Уже сделанные расклады останутся.`))) return;
  await app().store.remove('t_spreads', d.id);
};
