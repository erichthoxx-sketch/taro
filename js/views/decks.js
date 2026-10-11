import { ic } from '../ticons.js';
import { esc, acts, forms, changes, openSheet, opt, toast, uid, ask } from '../core/ui.js';
import { resizeImage } from '../core/img.js';
import { KINDS, CARD_FIELDS, DECK_ABOUT, templateCards, groupsOf } from '../decks.js';
import { cardCounts } from '../tcalc.js';
import { fillCards } from '../brain.js';
import { aiErrorText } from '../ai.js';
import { setPhoto, fillPhotos, allMsgs, deleteMsgs } from '../extra.js';
import { tile, cover, hasNotes, nowISO, todayISO, dayName, FEEDBACK } from '../util.js';

const app = () => window.__app;
const MAT_TAGS = ['Конспект', 'Сочетания карт', 'Приёмы и правила', 'Расклады', 'Из чата', 'Другое'];

// ---------- список колод ----------
export function decksView(a) {
  const c = a.ctx();
  const html = `<div class="row between head-row"><h2>Колоды</h2><button class="primary" data-act="deck.new">${ic('plus')} Колода</button></div>
  ${c.decks.length ? `<div class="covers">${c.decks.map((d) => {
    const cards = c.cardsByDeck[d.id] || [];
    const noted = cards.filter(hasNotes).length;
    return `<a class="cover-tile" href="#" data-act="go" data-to="/deck/${d.id}">${cover(d)}
      <span class="ct-title">${esc(d.name)}</span><span class="ct-num">${esc(c.kindName(d))} · ${cards.length} карт${noted ? ` · наработки: ${noted}` : ''}${c.defaultDeck?.id === d.id ? ' · основная' : ''}</span></a>`;
  }).join('')}</div>`
    : `<div class="card"><p>Здесь будут ваши колоды. Для каждой — типовые значения всех карт, ваши наработки, материалы и отдельный чат с Gemini, который всё это помнит.</p>
      <p class="muted small">Выберите основу — карты и типовые значения подставятся сами, дальше всё можно править:</p>
      <div class="row">${Object.entries(KINDS).map(([k, v]) => `<button data-act="deck.new" data-kind="${k}">${esc(v.short)}</button>`).join('')}</div></div>`}`;
  return { html, after: () => fillPhotos() };
}

acts['deck.new'] = (d) => {
  const kind = d.kind || 'rws';
  openSheet('Новая колода', `<label for="dn">Название колоды</label><input id="dn" name="name" required placeholder="Например: Таро Уэйта, Золотое таро, Ленорман Блю Оул">
    <label for="dk">Основа</label><select id="dk" name="kind">${Object.entries(KINDS).map(([k, v]) => opt(k, v.name, kind)).join('')}</select>
    <p class="hint">Для Уэйта, Тота, Марселя и Ленорман карты и типовые значения подставятся сами. Для оракула или своей колоды укажите число карт или их названия.</p>
    <div class="f2"><div><label for="da">Автор</label><input id="da" name="author"></div><div><label for="dr">Художник</label><input id="dr" name="artist"></div></div>
    <details><summary>Для оракула / своей колоды</summary>
      <label for="dc">Сколько карт</label><input id="dc" name="count" type="number" min="1" max="200" inputmode="numeric">
      <label for="dl">Или названия карт — по одному в строке</label><textarea id="dl" name="names" rows="5"></textarea></details>`, async (fd) => {
    const k = fd.get('kind');
    const names = String(fd.get('names') || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const count = Math.min(200, Number(fd.get('count')) || 0);
    if (k === 'oracle' && !names.length && !count) { toast('Укажите число карт или их названия'); return false; }
    const id = uid();
    const deck = { id, name: fd.get('name').trim(), kind: k, author: fd.get('author').trim(), artist: fd.get('artist').trim(), about: DECK_ABOUT[k]?.about || '', howto: '', myNotes: '', useRev: KINDS[k].reversals, createdAt: nowISO() };
    const cards = templateCards(k, { names, count }).map((x) => ({ ...x, id: `${id}_${x.key}`, deckId: id }));
    const st = app().store;
    await st.put('t_decks', deck);
    await st.putMany('t_cards', cards);
    if (!app().ctx().prefs.defaultDeck) await savePrefs({ defaultDeck: id });
    toast(`Колода «${deck.name}» создана: ${cards.length} карт`);
    app().go('/deck/' + id);
  }, { submitText: 'Создать' });
};

export async function savePrefs(patch) {
  const c = app().ctx();
  await app().store.put('t_prefs', { ...c.prefs, id: 'main', ...patch });
}

// ---------- страница колоды ----------
export function deckPage(a, id) {
  const c = a.ctx(), ui = a.ui, d = c.decksById[id];
  if (!d) return { html: '<p><a class="btn back" href="#" data-act="go" data-to="/decks">← Колоды</a></p><div class="card"><p>Колода не найдена.</p></div>' };
  const cards = c.cardsByDeck[id] || [];
  const mats = c.matsOf(id);
  const readings = c.readings.filter((r) => r.deckId === id);
  const tab = ui.deckTab || 'cards';
  const TABS = [['cards', `Карты · ${cards.length}`], ['about', 'О колоде'], ['mats', `Материалы · ${mats.length}`], ['stats', 'Статистика']];
  let body = '';
  if (tab === 'cards') body = cardsTab(c, d, cards, ui);
  else if (tab === 'about') body = aboutTab(c, d);
  else if (tab === 'mats') body = matsTab(d, mats);
  else body = statsTab(c, d, cards, readings);
  const html = `<p><a class="btn back" href="#" data-act="go" data-to="/decks">← Колоды</a></p>
  <div class="book-head deck-head"><div class="cover big">${cover(d)}<label class="btn small-btn">${ic('camera')} Обложка<input type="file" accept="image/*" data-chg="deck.cover" data-id="${id}" hidden></label></div>
    <div class="book-info"><h2 class="deck-title">${esc(d.name)}</h2><div class="muted small">${esc(KINDS[d.kind]?.name || '')}${d.author ? ' · ' + esc(d.author) : ''}${c.defaultDeck?.id === id ? ' · <span class="tag on">основная</span>' : ''}</div>
      <div class="tiles"><div><div class="k">С наработками</div><div class="v">${cards.filter(hasNotes).length} из ${cards.length}</div></div><div><div class="k">Раскладов</div><div class="v">${readings.length}</div></div></div>
      <div class="row"><button class="primary" data-act="go" data-to="/chat/${id}">${ic('chat')} Чат с Gemini</button><button data-act="reading.new" data-deck="${id}">${ic('spread')} Расклад</button></div></div></div>
  <div class="chips seg">${TABS.map(([k, t]) => `<button class="chip ${tab === k ? 'on' : ''}" data-act="deck.tab" data-tab="${k}">${t}</button>`).join('')}</div>
  ${body}`;
  return { html, after: () => fillPhotos() };
}
acts['deck.tab'] = (d) => { app().ui.deckTab = d.tab; };

function cardsTab(c, d, cards, ui) {
  const groups = groupsOf(d.kind);
  const g = ui.deckGroup && groups.some(([k]) => k === ui.deckGroup) ? ui.deckGroup : '';
  const q = (ui.deckQ || '').toLowerCase().trim();
  const list = cards.filter((x) => (!g || x.group === g) && (!q || [x.name, x.up, x.rev, x.general, x.notes, ...(x.obs || []).map((o) => o.text)].join(' ').toLowerCase().includes(q)));
  return `<div class="card">
    <input type="search" value="${esc(ui.deckQ || '')}" placeholder="Найти карту или слово в значениях и наработках" data-chg="deck.q" aria-label="Поиск по картам">
    ${groups.length ? `<div class="chips" style="margin-top:10px"><button class="chip ${!g ? 'on' : ''}" data-act="deck.group" data-g="">Все</button>${groups.map(([k, t]) => `<button class="chip ${g === k ? 'on' : ''}" data-act="deck.group" data-g="${k}">${t}</button>`).join('')}</div>` : ''}
    ${q || g ? `<p class="small muted">Найдено: ${list.length}</p>` : ''}
    <div class="cardgrid">${list.map((x) => `<a class="ctile" href="#" data-act="go" data-to="/card/${d.id}/${x.key}">${tile(x)}<span class="ctile-name">${esc(x.name)}${hasNotes(x) ? ' <i class="dot" title="Есть наработки"></i>' : ''}</span></a>`).join('') || '<p class="muted">Ничего не нашлось.</p>'}</div></div>
  <div class="card"><h2>Заполнение колоды</h2>
    <p class="small muted">Сфотографируйте карты по порядку (как в колоде: старшие арканы, потом масти) и загрузите пачкой — фото встанут на карты по порядку имён файлов.</p>
    <div class="row"><label class="btn">${ic('camera')} Фото карт пачкой<input type="file" accept="image/*" multiple data-chg="deck.photos" data-id="${d.id}" hidden></label>
    <button data-act="deck.fill" data-id="${d.id}">${ic('sparkle')} Дописать пустые значения с Gemini</button></div>
    <p class="hint">Gemini заполнит только пустые поля (любовь, работа, совет, да/нет…) — то, что вы написали сами, не трогает.</p>
    <div id="fillProgress"></div></div>`;
}
acts['deck.group'] = (d) => { app().ui.deckGroup = d.g; };
changes['deck.q'] = (v) => { app().ui.deckQ = v; app().rerender(); };

function aboutTab(c, d) {
  const f = (k, label, type = 'input', hint = '') => `<label for="df_${k}">${label}</label>${type === 'input'
    ? `<input id="df_${k}" value="${esc(d[k] || '')}" data-chg="deck.f" data-id="${d.id}" data-f="${k}">`
    : `<textarea id="df_${k}" rows="${type === 'big' ? 10 : 5}" data-chg="deck.f" data-id="${d.id}" data-f="${k}">${esc(d[k] || '')}</textarea>`}${hint ? `<p class="hint">${hint}</p>` : ''}`;
  return `<div class="card mine"><h2>${ic('note')} Мои наработки по колоде</h2>${f('myNotes', 'Всё своё: как вы чувствуете колоду, приёмы, личные правила, с какими вопросами она лучше работает', 'big', 'Сохраняется, когда вы выходите из поля. Gemini в чате этой колоды видит этот текст.')}</div>
  <div class="card"><h2>О колоде</h2>
    ${f('name', 'Название')}
    <div class="f2"><div>${f('author', 'Автор')}</div><div>${f('artist', 'Художник')}</div></div>
    <div class="f2"><div>${f('publisher', 'Издатель')}</div><div>${f('year', 'Год')}</div></div>
    ${f('about', 'Описание, система, символика', 'text')}
    ${f('howto', 'Как с ней работать (из книги-инструкции, от автора, с курсов)', 'text')}
    <label class="check"><input type="checkbox" ${c.reversals(d) ? 'checked' : ''} data-chg="deck.rev" data-id="${d.id}">Использую перевёрнутые карты</label></div>
  <div class="card"><div class="row">${c.defaultDeck?.id === d.id ? '<span class="badge good">Основная колода: карта дня и новые расклады — ей</span>' : `<button data-act="deck.default" data-id="${d.id}">Сделать основной</button>`}
    <button class="danger" data-act="deck.del" data-id="${d.id}">${ic('trash')} Удалить колоду</button></div></div>`;
}
changes['deck.f'] = async (v, el) => {
  const d = app().ctx().decksById[el.dataset.id];
  if (!d) return;
  const val = el.dataset.f === 'name' && !v.trim() ? d.name : v;
  await app().store.put('t_decks', { ...d, [el.dataset.f]: val });
};
changes['deck.rev'] = async (v, el, checked) => { const d = app().ctx().decksById[el.dataset.id]; await app().store.put('t_decks', { ...d, useRev: !!checked }); };
acts['deck.default'] = async (d) => { await savePrefs({ defaultDeck: d.id }); toast('Колода стала основной'); };
acts['deck.del'] = async (d) => {
  const c = app().ctx(), deck = c.decksById[d.id];
  const nR = c.readings.filter((r) => r.deckId === d.id).length;
  if (!(await ask(`Удалить колоду «${deck.name}» со всеми картами, наработками, материалами и перепиской с Gemini?${nR ? ` Расклады (${nR}) останутся, но без значений карт.` : ''} Это не отменить.`))) return;
  const st = app().store;
  const cards = c.cardsByDeck[d.id] || [];
  for (const x of cards) if (x.photo) await setPhoto(x.id, null).catch(() => {});
  if (deck.cover) await setPhoto('deck_' + d.id, null).catch(() => {});
  await st.removeMany('t_cards', cards.map((x) => x.id));
  await st.removeMany('t_mats', c.matsOf(d.id).map((m) => m.id));
  try { await deleteMsgs(d.id, (await allMsgs(d.id)).map((m) => m.id)); } catch { /* переписку удалим в другой раз */ }
  await st.remove('t_decks', d.id);
  if (c.prefs.defaultDeck === d.id) await savePrefs({ defaultDeck: c.decks.find((x) => x.id !== d.id)?.id || '' });
  app().go('/decks');
  toast('Колода удалена');
};

changes['deck.cover'] = async (v, el) => {
  const file = el.files?.[0]; if (!file) return;
  const d = app().ctx().decksById[el.dataset.id];
  const data = await resizeImage(file, 500, 0.82);
  await setPhoto('deck_' + d.id, data);
  await app().store.put('t_decks', { ...d, cover: true });
  app().rerender();
};

changes['deck.photos'] = async (v, el) => {
  const files = [...(el.files || [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!files.length) return;
  const c = app().ctx(), cards = c.cardsByDeck[el.dataset.id] || [];
  const n = Math.min(files.length, cards.length);
  const box = document.getElementById('fillProgress');
  for (let i = 0; i < n; i++) {
    if (box) box.innerHTML = `<p class="small">Загружаю фото: ${i + 1} из ${n}…</p>`;
    const data = await resizeImage(files[i], 600, 0.8);
    await setPhoto(cards[i].id, data);
    await app().store.put('t_cards', { ...cards[i], photo: true });
  }
  toast(`Фото добавлены: ${n}${files.length > cards.length ? ` (лишних файлов: ${files.length - cards.length})` : ''}`);
  app().rerender();
};

let fillCtl = null;
acts['deck.fill'] = async (d) => {
  const c = app().ctx(), deck = c.decksById[d.id];
  if (fillCtl) { fillCtl.abort(); return; }
  if (!c.prefs.aiKey) { toast('Сначала добавьте ключ Gemini в настройках'); app().go('/settings'); return; }
  const cards = (c.cardsByDeck[d.id] || []).filter((x) => CARD_FIELDS.some(([k]) => !(x[k] || '').trim() && !(k === 'rev' && !c.reversals(deck))));
  if (!cards.length) { toast('Все поля уже заполнены'); return; }
  if (!(await ask(`Gemini допишет пустые поля у ${cards.length} карт. Это бесплатно и займёт несколько минут (бесплатный Gemini отвечает не чаще нескольких раз в минуту). Начать?`, 'Начать'))) return;
  fillCtl = new AbortController();
  const show = (t) => { const box = document.getElementById('fillProgress'); if (box) box.innerHTML = t; };
  show(`<p class="small">Gemini заполняет карты: 0 из ${cards.length}… <button class="link" data-act="deck.fill" data-id="${d.id}">Остановить</button></p>`);
  try {
    await fillCards(c, deck, cards, { signal: fillCtl.signal, onProgress: (k, n, wait) => show(`<p class="small">Gemini заполняет карты: ${k} из ${n}${wait ? ` — бесплатный лимит, жду ${wait} с` : ''}… <button class="link" data-act="deck.fill" data-id="${d.id}">Остановить</button></p>`) });
    toast('Готово: пустые поля заполнены');
  } catch (e) {
    if (e.code !== 'cancelled') toast(aiErrorText(e)); else toast('Остановлено — уже заполненное сохранилось');
  } finally { fillCtl = null; show(''); }
};

// ---------- материалы ----------
function matsTab(d, mats) {
  const list = [...mats].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return `<div class="card"><div class="row between"><h2>Материалы и конспекты</h2><div class="row"><label class="btn small-btn">Из файла .txt<input type="file" accept=".txt,.md,text/plain" multiple data-chg="mat.import" data-deck="${d.id}" hidden></label><button class="primary" data-act="mat.edit" data-deck="${d.id}">${ic('plus')} Материал</button></div></div>
    <p class="small muted">Конспекты книг и курсов, сочетания карт, ваши правила — всё, что Gemini должен знать про эту колоду.</p>
    ${list.length ? `<div class="list">${list.map((m) => `<div class="item"><div class="row between"><b>${esc(m.title || 'Без названия')}</b><span class="small muted">${m.tag ? `<span class="tag">${esc(m.tag)}</span> ` : ''}${esc(dayName((m.createdAt || '').slice(0, 10)))}</span></div>
      <details class="mat"><summary class="small">${esc((m.text || '').slice(0, 140))}${(m.text || '').length > 140 ? '…' : ''}</summary><div class="mat-text">${esc(m.text || '')}</div></details>
      <div class="row"><button class="link" data-act="mat.edit" data-deck="${d.id}" data-id="${m.id}">Изменить</button><button class="link danger" data-act="mat.del" data-id="${m.id}">Удалить</button></div></div>`).join('')}</div>`
    : '<p class="muted">Пока пусто. Добавьте первый материал — например, конспект из книги к колоде.</p>'}</div>`;
}
acts['mat.edit'] = (d) => {
  const m = d.id ? app().store.data.t_mats.find((x) => x.id === d.id) : null;
  openSheet(m ? 'Материал' : 'Новый материал', `<label for="mt">Заголовок</label><input id="mt" name="title" value="${esc(m?.title || '')}" required>
    <label for="mg">Раздел</label><select id="mg" name="tag">${MAT_TAGS.map((t) => opt(t, t, m?.tag || 'Конспект')).join('')}</select>
    <label for="mx">Текст</label><textarea id="mx" name="text" rows="14" required>${esc(m?.text || '')}</textarea>`, async (fd) => {
    await app().store.put('t_mats', { ...(m || { id: uid(), deckId: d.deck, createdAt: nowISO() }), title: fd.get('title').trim(), tag: fd.get('tag'), text: fd.get('text') });
    toast('Сохранено');
  });
};
acts['mat.del'] = async (d) => {
  const m = app().store.data.t_mats.find((x) => x.id === d.id);
  if (!(await ask(`Удалить материал «${m?.title || ''}»?`))) return;
  await app().store.remove('t_mats', d.id);
  toast('Удалено', { undo: () => app().store.put('t_mats', m) });
};
changes['mat.import'] = async (v, el) => {
  const files = [...(el.files || [])];
  for (const f of files) {
    const text = await f.text();
    await app().store.put('t_mats', { id: uid(), deckId: el.dataset.deck, title: f.name.replace(/\.(txt|md)$/i, ''), tag: 'Конспект', text, createdAt: nowISO() });
  }
  toast(`Добавлено материалов: ${files.length}`);
};

// ---------- статистика ----------
function statsTab(c, d, cards, readings) {
  const counts = cardCounts(readings, d.id);
  const byKey = Object.fromEntries(cards.map((x) => [x.key, x]));
  const top = Object.entries(counts).filter(([k]) => byKey[k]).sort((x, y) => y[1] - x[1]).slice(0, 15);
  const max = top[0]?.[1] || 1;
  const fb = readings.filter((r) => r.feedback);
  const yes = fb.filter((r) => r.feedback === 'yes').length, part = fb.filter((r) => r.feedback === 'part').length;
  return `<div class="card"><h2>Как работает колода</h2>
    <div class="tiles"><div><div class="k">Раскладов</div><div class="v">${readings.length}</div></div>
    <div><div class="k">Сбылось</div><div class="v">${fb.length ? Math.round(((yes + part / 2) / fb.length) * 100) + ' %' : '—'}</div><div class="s">${fb.length ? `по ${fb.length} раскладам с обратной связью` : 'отмечайте в раскладах, сбылось ли'}</div></div></div></div>
  <div class="card"><h2>Чаще всего выпадают</h2>${top.length ? `<div class="list">${top.map(([k, n]) => `<a class="item" href="#" data-act="go" data-to="/card/${d.id}/${k}"><div class="row between"><span>${esc(byKey[k].name)}</span><span class="small muted">${n}</span></div><div class="bar-share"><i style="width:${Math.round((n / max) * 100)}%"></i></div></a>`).join('')}</div>` : '<p class="muted">Пока нет раскладов этой колодой.</p>'}</div>`;
}

// ---------- страница карты ----------
export function cardPage(a, deckId, key) {
  const c = a.ctx(), d = c.decksById[deckId];
  const cards = c.cardsByDeck[deckId] || [];
  const i = cards.findIndex((x) => x.key === key), x = cards[i];
  if (!d || !x) return { html: `<p><a class="btn back" href="#" data-act="go" data-to="/deck/${esc(deckId)}">← Колода</a></p><div class="card"><p>Карта не найдена.</p></div>` };
  const prev = cards[i - 1], next = cards[i + 1];
  const rev = c.reversals(d);
  const inReadings = c.readings.filter((r) => r.deckId === deckId && (r.cards || []).some((p) => p?.key === key));
  const field = ([k, label]) => (k === 'rev' && !rev ? '' : `<label for="cf_${k}">${label}</label><textarea id="cf_${k}" rows="${Math.min(8, Math.max(2, Math.ceil((x[k] || '').length / 60)))}" data-chg="card.f" data-id="${x.id}" data-f="${k}">${esc(x[k] || '')}</textarea>`);
  const html = `<div class="row between"><a class="btn back" href="#" data-act="go" data-to="/deck/${deckId}">← ${esc(d.name)}</a>
    <div class="row">${prev ? `<button data-act="go" data-to="/card/${deckId}/${prev.key}" aria-label="Предыдущая карта" title="${esc(prev.name)}">←</button>` : ''}${next ? `<button data-act="go" data-to="/card/${deckId}/${next.key}" aria-label="Следующая карта" title="${esc(next.name)}">→</button>` : ''}</div></div>
  <div class="card-head"><div class="ch-pic">${tile(x)}<div class="row"><label class="btn small-btn">${ic('camera')} ${x.photo ? 'Заменить фото' : 'Фото карты'}<input type="file" accept="image/*" data-chg="card.photo" data-id="${x.id}" hidden></label>${x.photo ? `<button class="link danger" data-act="card.unphoto" data-id="${x.id}">убрать</button>` : ''}</div></div>
    <div class="ch-info"><p class="eyebrow">${esc(groupsOf(d.kind).find(([g]) => g === x.group)?.[1] || c.kindName(d))}${x.numeral ? ' · ' + esc(x.numeral) : ''}</p>
      <h2 class="card-title">${esc(x.name)}</h2>
      ${x.up ? `<p><b>Прямое:</b> ${esc(x.up)}</p>` : ''}${rev && x.rev ? `<p><b>Перевёрнутое:</b> ${esc(x.rev)}</p>` : ''}
      <p class="small muted">${inReadings.length ? `Выпадала в раскладах: ${inReadings.length}` : 'В раскладах пока не выпадала'}</p>
      <div class="row"><button data-act="card.ask" data-deck="${deckId}" data-name="${esc(x.name)}">${ic('chat')} Спросить Gemini</button><button class="link" data-act="card.rename" data-id="${x.id}">Переименовать</button></div></div></div>
  <div class="card mine"><h2>${ic('note')} Мои наработки</h2>
    <textarea id="cf_notes" rows="${Math.min(14, Math.max(4, Math.ceil((x.notes || '').length / 60)))}" data-chg="card.f" data-id="${x.id}" data-f="notes" placeholder="Как вы понимаете эту карту в этой колоде: детали рисунка, личные ассоциации, как она проявлялась у клиентов…">${esc(x.notes || '')}</textarea>
    <h3>Наблюдения из практики</h3>
    ${(x.obs || []).length ? `<div class="obs">${[...x.obs].reverse().map((o) => `<div class="comment"><div class="small muted">${esc(dayName(o.date))}${o.src ? ' · ' + esc(o.src) : ''}</div><div class="pre">${esc(o.text)}</div><button class="link danger" data-act="card.delObs" data-id="${x.id}" data-o="${esc(o.id || '')}">убрать</button></div>`).join('')}</div>` : '<p class="small muted">Сюда попадают короткие записи: ваши и те, что Gemini сохранил из чата.</p>'}
    <form data-form="card.obs" data-id="${x.id}" class="obs-add"><textarea name="text" rows="2" placeholder="Новое наблюдение: например, «у клиентки выпала на вопрос о переезде — переезд случился через месяц»" aria-label="Новое наблюдение"></textarea><button type="submit">Добавить</button></form></div>
  <div class="card"><div class="row between"><h2>Типовые значения</h2><button data-act="card.fill" data-id="${x.id}">${ic('sparkle')} Дописать пустые</button></div>
    ${CARD_FIELDS.map(field).join('')}<p class="hint">Изменения сохраняются, когда вы выходите из поля.</p></div>
  ${inReadings.length ? `<div class="card"><h2>В раскладах</h2><div class="list">${inReadings.slice(0, 20).map((r) => `<a class="item" href="#" data-act="go" data-to="/reading/${r.id}"><div class="row between"><b>${esc(r.question || 'Без вопроса')}</b><span class="small muted">${esc(dayName(r.date))}</span></div><div class="small muted">${esc(r.clientId ? c.clientsById[r.clientId]?.name || '' : 'для себя')}${r.feedback ? ' · ' + FEEDBACK[r.feedback] : ''}</div></a>`).join('')}</div></div>` : ''}`;
  return { html, after: () => fillPhotos() };
}

const cardById = (id) => app().store.data.t_cards.find((x) => x.id === id);
changes['card.f'] = async (v, el) => { const x = cardById(el.dataset.id); if (x) await app().store.put('t_cards', { ...x, [el.dataset.f]: v }); };
forms['card.obs'] = async (fd, f) => {
  const text = String(fd.get('text') || '').trim(); if (!text) return;
  const x = cardById(f.dataset.id);
  await app().store.put('t_cards', { ...x, obs: [...(x.obs || []), { id: uid(), date: todayISO(), text }] });
  f.reset();
};
acts['card.delObs'] = async (d) => {
  const x = cardById(d.id);
  const obs = x.obs || [];
  const idx = d.o ? obs.findIndex((o) => o.id === d.o) : -1;
  if (idx < 0) return;
  await app().store.put('t_cards', { ...x, obs: obs.filter((_, i) => i !== idx) });
  toast('Наблюдение убрано', { undo: () => app().store.put('t_cards', { ...cardById(d.id), obs }) });
};
changes['card.photo'] = async (v, el) => {
  const file = el.files?.[0]; if (!file) return;
  const x = cardById(el.dataset.id);
  await setPhoto(x.id, await resizeImage(file, 600, 0.82));
  await app().store.put('t_cards', { ...x, photo: true });
  app().rerender();
};
acts['card.unphoto'] = async (d) => { const x = cardById(d.id); await setPhoto(x.id, null); await app().store.put('t_cards', { ...x, photo: false }); };
acts['card.rename'] = (d) => {
  const x = cardById(d.id);
  openSheet('Название карты', `<label for="cn">Название</label><input id="cn" name="name" value="${esc(x.name)}" required><label for="cnum">Номер или подпись</label><input id="cnum" name="numeral" value="${esc(x.numeral || '')}">`, async (fd) => {
    await app().store.put('t_cards', { ...cardById(d.id), name: fd.get('name').trim(), numeral: fd.get('numeral').trim() });
  });
};
acts['card.ask'] = (d) => {
  const ui = app().ui;
  ui.chatFocus = true;
  ui.chatDraft[d.deck] = `Расскажи о карте «${d.name}» в этой колоде: что ты знаешь из моих наработок, как она читается в любви, работе и как совет?`;
  app().go('/chat/' + d.deck);
};
acts['card.fill'] = async (d) => {
  const c = app().ctx(), x = cardById(d.id), deck = c.decksById[x.deckId];
  if (!c.prefs.aiKey) { toast('Сначала добавьте ключ Gemini в настройках'); app().go('/settings'); return; }
  toast('Gemini дописывает значения…');
  try { await fillCards(c, deck, [x]); toast('Готово'); } catch (e) { toast(aiErrorText(e)); }
};
