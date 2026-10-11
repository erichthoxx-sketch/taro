import { ic } from '../ticons.js';
import { esc, acts, changes } from '../core/ui.js';
import { num } from '../core/format.js';
import { fillPhotos } from '../extra.js';
import { tile, rand, dayName, daysBetween } from '../util.js';
import { row } from './readings.js';

const app = () => window.__app;

export function homeView(a) {
  const c = a.ctx();
  if (!c.decks.length) {
    return { html: `<div class="card hero"><h2>Добро пожаловать в таро-кабинет</h2>
      <p>Здесь собирается всё по вашим колодам: типовые значения, ваши наработки, материалы, расклады, клиенты — и нейросеть Gemini, которая всё это знает и помнит.</p>
      <ol class="steps"><li><b>Добавьте колоду.</b> Для Уэйта, Тота, Марселя и Ленорман карты и значения подставятся сами.</li>
      <li><b>Подключите Gemini</b> в настройках — это бесплатно, нужен только ключ Google.</li>
      <li><b>Записывайте наработки</b> к картам — сами или прямо в чате: Gemini сохранит их за вас.</li></ol>
      <div class="row"><button class="primary" data-act="deck.new">${ic('plus')} Добавить колоду</button><button data-act="go" data-to="/settings">Подключить Gemini</button></div></div>` };
  }
  const deck = c.defaultDeck;
  const daily = c.data.t_daily.find((x) => x.id === c.today);
  const dDeck = daily ? c.decksById[daily.deckId] : deck;
  const dCard = daily && (c.cardsByDeck[daily.deckId] || []).find((x) => x.key === daily.key);
  const month = c.today.slice(0, 7);
  const mr = c.readings.filter((r) => (r.date || '').startsWith(month));
  const income = mr.reduce((s, r) => s + (r.price || 0), 0);
  const clientsN = new Set(mr.map((r) => r.clientId).filter(Boolean)).size;
  const waiting = c.readings.filter((r) => !r.feedback && r.date && daysBetween(r.date, c.today) >= 3 && (r.cards || []).some((p) => p?.key)).slice(0, 5);
  const recent = c.readings.slice(0, 5);
  const week = c.data.t_daily.filter((x) => x.id !== c.today && daysBetween(x.id, c.today) <= 7 && daysBetween(x.id, c.today) > 0).sort((x, y) => y.id.localeCompare(x.id));
  const dailyHtml = dCard
    ? `<div class="daily"><a href="#" data-act="go" data-to="/card/${dDeck.id}/${dCard.key}" class="daily-pic">${tile(dCard, { rev: daily.rev })}</a>
      <div class="daily-info"><p class="eyebrow">Карта дня · ${esc(dayName(c.today))} · ${esc(dDeck.name)}</p><h2 class="card-title">${esc(dCard.name)}${daily.rev ? ' <span class="small muted">(перевёрнутая)</span>' : ''}</h2>
        <p>${esc((daily.rev && dCard.rev) || dCard.up || '')}</p>${dCard.notes ? `<div class="mine-note">${esc(dCard.notes.length > 240 ? dCard.notes.slice(0, 240) + '…' : dCard.notes)}</div>` : ''}
        <label for="dn">Заметка дня: как карта проявилась</label><textarea id="dn" rows="2" data-chg="daily.note">${esc(daily.note || '')}</textarea>
        <div class="row" style="margin-top:8px"><button data-act="daily.ask">${ic('chat')} Что она советует сегодня?</button></div></div></div>`
    : `<div class="row between"><div><p class="eyebrow">Карта дня · ${esc(dayName(c.today))}</p><p class="muted small" style="margin:4px 0 0">Колода: ${esc(deck.name)}. Сосредоточьтесь на дне и вытяните карту.</p></div><button class="primary" data-act="daily.draw">${ic('shuffle')} Вытянуть карту дня</button></div>`;
  const html = `<div class="card">${dailyHtml}</div>
  <div class="row quick"><button class="primary" data-act="reading.new">${ic('spread')} Новый расклад</button><button data-act="go" data-to="/chat">${ic('chat')} Чат с Gemini</button><button data-act="client.new">${ic('people')} Клиент</button></div>
  <div class="tiles tiles3"><div><div class="k">Раскладов в этом месяце</div><div class="v">${mr.length}</div></div><div><div class="k">Клиентов</div><div class="v">${clientsN}</div></div><div><div class="k">Оплаты</div><div class="v">${income ? num(income) + ' ₽' : '—'}</div></div></div>
  ${waiting.length ? `<div class="card"><h2>Узнать, сбылось ли</h2><p class="small muted">Расклады старше трёх дней без обратной связи — отметьте, как всё сложилось: так видно, как работают колоды.</p><div class="list">${waiting.map((r) => row(c, r)).join('')}</div></div>` : ''}
  <div class="card"><div class="row between"><h2>Последние расклады</h2><a href="#" data-act="go" data-to="/readings" class="small">все</a></div>${recent.length ? `<div class="list">${recent.map((r) => row(c, r)).join('')}</div>` : '<p class="muted small">Раскладов пока нет.</p>'}</div>
  ${week.length ? `<div class="card"><h2>Карты дня за неделю</h2><div class="strip">${week.map((x) => { const cd = (c.cardsByDeck[x.deckId] || []).find((k) => k.key === x.key); return cd ? `<a href="#" data-act="go" data-to="/card/${x.deckId}/${cd.key}" class="strip-item" title="${esc(cd.name)}">${tile(cd, { rev: x.rev })}<span class="small muted">${esc(dayName(x.id))}</span>${x.note ? '<i class="dot"></i>' : ''}</a>` : ''; }).join('')}</div></div>` : ''}`;
  return { html, after: () => fillPhotos() };
}

acts['daily.draw'] = async () => {
  const c = app().ctx(), deck = c.defaultDeck;
  const cards = c.cardsByDeck[deck.id] || [];
  if (!cards.length) return;
  const x = cards[rand(cards.length)];
  await app().store.put('t_daily', { id: c.today, deckId: deck.id, key: x.key, rev: c.reversals(deck) ? rand(4) === 0 : false, note: '' });
};
changes['daily.note'] = async (v) => {
  const c = app().ctx(), d = c.data.t_daily.find((x) => x.id === c.today);
  if (d) await app().store.put('t_daily', { ...d, note: v });
};
acts['daily.ask'] = () => {
  const c = app().ctx(), d = c.data.t_daily.find((x) => x.id === c.today);
  const x = (c.cardsByDeck[d.deckId] || []).find((k) => k.key === d.key);
  app().ui.chatFocus = true;
  app().ui.chatDraft[d.deckId] = `Моя карта дня сегодня — «${x.name}»${d.rev ? ' (перевёрнутая)' : ''}. Что она советует на этот день, с учётом моих наработок по ней?`;
  app().go('/chat/' + d.deckId);
};
