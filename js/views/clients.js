import { ic } from '../ticons.js';
import { esc, acts, changes, openSheet, toast, uid, ask } from '../core/ui.js';
import { birthCards, MAJOR_NAMES } from '../tcalc.js';
import { num } from '../core/format.js';
import { nowISO, dayName } from '../util.js';
import { row } from './readings.js';

const app = () => window.__app;
const byId = (id) => app().store.data.t_clients.find((x) => x.id === id);

export function clientsView(a) {
  const c = a.ctx(), q = (a.ui.clientQ || '').toLowerCase().trim();
  const stats = {};
  for (const r of c.readings) if (r.clientId) { const s = (stats[r.clientId] ||= { n: 0, last: '', sum: 0 }); s.n++; if ((r.date || '') > s.last) s.last = r.date; s.sum += r.price || 0; }
  const list = c.clients.filter((x) => !q || [x.name, x.contact, x.notes, x.tags].join(' ').toLowerCase().includes(q));
  const html = `<div class="row between head-row"><h2>Клиенты</h2><button class="primary" data-act="client.new">${ic('plus')} Клиент</button></div>
  ${c.clients.length ? `<div class="card"><input type="search" value="${esc(a.ui.clientQ || '')}" placeholder="Поиск: имя, контакт, заметка" data-chg="client.q" aria-label="Поиск клиентов"></div>
  <div class="card list-card"><div class="list">${list.map((x) => { const s = stats[x.id]; return `<a class="item" href="#" data-act="go" data-to="/client/${x.id}"><div class="row between"><b>${esc(x.name)}</b><span class="small muted">${s ? `${s.n} расклад${s.n % 10 === 1 && s.n % 100 !== 11 ? '' : s.n % 10 >= 2 && s.n % 10 <= 4 && (s.n % 100 < 10 || s.n % 100 >= 20) ? 'а' : 'ов'}` : 'без раскладов'}</span></div>
    <div class="small muted">${x.contact ? esc(x.contact) + ' · ' : ''}${s?.last ? 'последний ' + esc(dayName(s.last)) : ''}${s?.sum ? ' · ' + num(s.sum) + ' ₽' : ''}</div></a>`; }).join('') || '<p class="muted">Ничего не нашлось.</p>'}</div></div>`
    : '<div class="card"><p class="muted" style="margin:0">Здесь будет база клиентов: контакты, дата рождения с картами личности и души, история раскладов, обратная связь и оплаты.</p></div>'}`;
  return { html };
}
changes['client.q'] = (v) => { app().ui.clientQ = v; app().rerender(); };

acts['client.new'] = () => {
  openSheet('Новый клиент', `<label for="cn">Имя</label><input id="cn" name="name" required>
    <label for="cb">Дата рождения</label><input id="cb" name="birth" type="date">
    <label for="cc">Контакт</label><input id="cc" name="contact" placeholder="телефон, телеграм, инстаграм…">`, async (fd) => {
    const x = { id: uid(), name: fd.get('name').trim(), birth: fd.get('birth'), contact: fd.get('contact').trim(), notes: '', createdAt: nowISO() };
    await app().store.put('t_clients', x);
    app().go('/client/' + x.id);
  }, { submitText: 'Добавить' });
};

export function clientPage(a, id) {
  const c = a.ctx(), x = byId(id);
  if (!x) return { html: '<p><a class="btn back" href="#" data-act="go" data-to="/clients">← Клиенты</a></p><div class="card"><p>Клиент не найден.</p></div>' };
  const rs = c.readings.filter((r) => r.clientId === id);
  const sum = rs.reduce((s, r) => s + (r.price || 0), 0);
  const bc = birthCards(x.birth);
  const f = (k, label, type = 'text') => `<label for="cl_${k}">${label}</label><input id="cl_${k}" type="${type}" value="${esc(x[k] || '')}" data-chg="client.f" data-id="${id}" data-f="${k}">`;
  const html = `<div class="row between"><a class="btn back" href="#" data-act="go" data-to="/clients">← Клиенты</a><button class="link danger" data-act="client.del" data-id="${id}">${ic('trash')} Удалить</button></div>
  <div class="card"><h2 class="deck-title">${esc(x.name)}</h2>
    <div class="f2"><div>${f('name', 'Имя')}</div><div>${f('birth', 'Дата рождения', 'date')}</div></div>
    ${f('contact', 'Контакт')}
    ${bc ? `<div class="tiles"><div><div class="k">Карта личности</div><div class="v">${bc.personality ? ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'][bc.personality] + ' ' : ''}${MAJOR_NAMES[bc.personality]}</div></div>
      <div><div class="k">Карта души</div><div class="v">${MAJOR_NAMES[bc.soul]}</div></div>
      <div><div class="k">Аркан дня рождения</div><div class="v">${MAJOR_NAMES[bc.day]}</div></div>
      <div><div class="k">Оплачено всего</div><div class="v">${sum ? num(sum) + ' ₽' : '—'}</div></div></div>
      <p class="hint">Личность и душа — по сумме цифр даты рождения (метод М. Грир, названия — по Уэйту). Аркан дня — по числу дня рождения.</p>` : ''}
    <label for="cl_notes">Заметки о клиенте</label><textarea id="cl_notes" rows="5" data-chg="client.f" data-id="${id}" data-f="notes" placeholder="Запрос, важные обстоятельства, как предпочитает получать расклад…">${esc(x.notes || '')}</textarea></div>
  <div class="card"><div class="row between"><h2>Расклады · ${rs.length}</h2><button class="primary" data-act="reading.new" data-client="${id}">${ic('plus')} Расклад</button></div>
    ${rs.length ? `<div class="list">${rs.map((r) => row(c, r)).join('')}</div>` : '<p class="muted small">Раскладов для этого клиента пока нет.</p>'}</div>`;
  return { html };
}
changes['client.f'] = async (v, el) => {
  const x = byId(el.dataset.id);
  if (el.dataset.f === 'name' && !v.trim()) return;
  await app().store.put('t_clients', { ...x, [el.dataset.f]: v });
};
acts['client.del'] = async (d) => {
  const x = byId(d.id);
  const n = app().ctx().readings.filter((r) => r.clientId === d.id).length;
  if (!(await ask(`Удалить клиента «${x.name}»?${n ? ` Его расклады (${n}) останутся, но станут «для себя».` : ''}`))) return;
  await app().store.remove('t_clients', d.id);
  app().go('/clients');
  toast('Клиент удалён', { undo: () => app().store.put('t_clients', x) });
};
