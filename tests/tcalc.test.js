import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateCards, KINDS, groupsOf } from '../js/decks.js';
import { BUILTIN_SPREADS, fitsDeck } from '../js/spreads.js';
import { birthCards, findCard, cardCounts, buildKnowledge, md, parseSSE, pickModel } from '../js/tcalc.js';

test('шаблоны колод: число карт и уникальные ключи', () => {
  for (const k of ['rws', 'thoth', 'marseille', 'lenormand']) {
    const cards = templateCards(k);
    assert.equal(cards.length, KINDS[k].count, k);
    assert.equal(new Set(cards.map((c) => c.key)).size, cards.length, k + ': ключи');
    assert.ok(cards.every((c) => c.name && c.up), k + ': у каждой карты есть название и значение');
  }
  assert.equal(templateCards('oracle', { count: 44 }).length, 44);
  assert.deepEqual(templateCards('oracle', { names: ['Луна', 'Река'] }).map((c) => c.name), ['Луна', 'Река']);
});

test('Тот и Марсель: VIII и XI на своих местах', () => {
  const th = templateCards('thoth');
  assert.equal(th[8].name, 'Регулирование');
  assert.match(th[8].up, /справедливость/);
  assert.equal(th[11].name, 'Вожделение');
  assert.match(th[11].up, /мужество/);
  assert.equal(th[8].rev, '', 'в Тоте перевёрнутые не используются');
  assert.ok(th.some((c) => c.name === 'Принцесса Дисков'));
  assert.ok(th.some((c) => c.name.includes('«Владычество»')));
  const ms = templateCards('marseille');
  assert.equal(ms[8].name, 'Справедливость');
  assert.equal(ms[11].name, 'Сила');
  assert.ok(ms.some((c) => c.name === 'Валет Денариев'));
  const rws = templateCards('rws');
  assert.equal(rws[8].name, 'Сила');
  assert.equal(rws[22].name, 'Туз Жезлов');
  assert.equal(rws[77].name, 'Король Пентаклей');
  assert.equal(groupsOf('rws').length, 5);
  assert.equal(groupsOf('lenormand').length, 0);
});

test('расклады подходят своим колодам', () => {
  const l9 = BUILTIN_SPREADS.find((s) => s.id === 'l9'), celtic = BUILTIN_SPREADS.find((s) => s.id === 'celtic'), ppf = BUILTIN_SPREADS.find((s) => s.id === 'ppf');
  assert.equal(celtic.positions.length, 10);
  assert.equal(BUILTIN_SPREADS.find((s) => s.id === 'grand').positions.length, 36);
  assert.ok(fitsDeck(l9, 'lenormand') && !fitsDeck(l9, 'rws'));
  assert.ok(fitsDeck(celtic, 'thoth') && !fitsDeck(celtic, 'lenormand'));
  assert.ok(fitsDeck(ppf, 'lenormand') && fitsDeck(ppf, 'oracle'));
});

test('карты рождения', () => {
  // 17.05.1990: 17 + 5 + 1990 = 2012 → 5 (Иерофант), душа 5; день 17 — Звезда
  assert.deepEqual(birthCards('1990-05-17'), { personality: 5, soul: 5, day: 17 });
  // 29.12.1985: 29 + 12 + 1985 = 2026 → 10 → душа 1; день 29 → 7
  assert.deepEqual(birthCards('1985-12-29'), { personality: 10, soul: 1, day: 7 });
  // 22.09.1999: 22 + 9 + 1999 = 2030 → 5; день 22 → Шут (0)
  assert.deepEqual(birthCards('1999-09-22'), { personality: 5, soul: 5, day: 0 });
  // 28.09.1974: 28 + 9 + 1974 = 2011 → 2 + 0 + 1 + 1 = 4
  assert.equal(birthCards('1974-09-28').personality, 4);
  assert.equal(birthCards(''), null);
});

test('поиск карты по названию', () => {
  const cards = templateCards('rws');
  assert.equal(findCard(cards, 'башня').key, 'm16');
  assert.equal(findCard(cards, '«Королева Кубков»').key, 'cups12');
  assert.equal(findCard(cards, 'Колесо фортуны').key, 'm10');
  assert.equal(findCard(cards, 'Несуществующая'), null);
  const th = templateCards('thoth');
  assert.equal(findCard(th, 'Двойка Жезлов').key, 'wands1', 'карта Тота находится без титула');
});

test('статистика карт по раскладам', () => {
  const rs = [{ deckId: 'a', cards: [{ key: 'm1' }, { key: 'm2' }] }, { deckId: 'a', cards: [{ key: 'm1' }, null] }, { deckId: 'b', cards: [{ key: 'm1' }] }];
  assert.deepEqual(cardCounts(rs, 'a'), { m1: 2, m2: 1 });
});

test('база знаний: всё целиком, а при нехватке места — подробно только о чём речь', () => {
  const cards = templateCards('rws').map((c) => ({ ...c, notes: c.key === 'm16' ? 'Моя Башня — это освобождение' : '', obs: c.key === 'm17' ? [{ date: '2026-10-01', text: 'выпала перед новой работой' }] : [] }));
  const deck = { name: 'Моя колода', myNotes: 'Колода любит вопросы о работе', about: 'Классика' };
  const mats = [{ title: 'Сочетания', tag: 'Сочетания карт', text: 'Башня + Звезда = обновление после кризиса', createdAt: '1' }];
  const full = buildKnowledge(deck, cards, mats);
  assert.match(full, /Мои наработки по колоде:\nКолода любит вопросы о работе/);
  assert.match(full, /### Башня[\s\S]*Мои наработки: Моя Башня — это освобождение/);
  assert.match(full, /2026-10-01: выпала перед новой работой/);
  assert.match(full, /Башня \+ Звезда/);
  assert.match(full, /Общее значение/);
  const small = buildKnowledge(deck, cards, mats, { budget: 20000, focus: 'Что значит Башня в раскладе?' });
  assert.ok(small.length <= 20000 + 40, 'укладывается в бюджет');
  assert.match(small, /### Башня\n[^#]*Общее значение/, 'о Башне — подробно');
  assert.doesNotMatch(small, /### Шут\n[^#]*Общее значение/, 'об остальных — кратко');
  assert.match(small, /Мои наработки: Моя Башня/, 'наработки никогда не теряются');
});

test('разметка ответа ИИ безопасна', () => {
  assert.equal(md('**Башня** <script>'), '<p><b>Башня</b> &lt;script&gt;</p>');
  assert.equal(md('### Итог\n- раз\n- два'), '<h4>Итог</h4><ul><li>раз</li><li>два</li></ul>');
});

test('разбор потока ответа OpenAI', () => {
  const chunk = 'data: {"choices":[{"delta":{"content":"При"}}]}\n\ndata: {"choices":[{"delta":{"content":"вет"}}]}\n\ndata: [DO';
  const a = parseSSE(chunk);
  assert.equal(a.events.length, 2);
  assert.equal(a.events.map((e) => e.choices[0].delta.content).join(''), 'Привет');
  const b = parseSSE(a.rest + 'NE]\n\n');
  assert.deepEqual(b.events, [{ done: true }]);
});

test('выбор модели ChatGPT', () => {
  const ids = ['gpt-4o', 'gpt-4o-mini', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.5', 'gpt-5.5-mini', 'gpt-5.5-2026-04-01', 'gpt-realtime', 'o3', 'gpt-4o-audio-preview'];
  assert.equal(pickModel(ids), 'gpt-5.5');
  assert.equal(pickModel(ids, { cheap: true }), 'gpt-5.5-mini');
  assert.equal(pickModel(['gpt-4o-mini']), 'gpt-4o-mini');
  assert.equal(pickModel([]), '');
});
