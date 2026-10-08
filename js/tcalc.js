// Чистые расчёты таро-кабинета (без браузера — проверяются тестами): карты рождения,
// база знаний колоды для ИИ, статистика карт, поиск карты по названию, простая разметка ответов.
import { CARD_FIELDS } from './decks.js';

export const MAJOR_NAMES = ['Шут', 'Маг', 'Верховная Жрица', 'Императрица', 'Император', 'Иерофант', 'Влюблённые', 'Колесница', 'Сила', 'Отшельник', 'Колесо Фортуны', 'Справедливость', 'Повешенный', 'Смерть', 'Умеренность', 'Дьявол', 'Башня', 'Звезда', 'Луна', 'Солнце', 'Суд', 'Мир'];

const digitSum = (n) => String(Math.abs(n)).split('').reduce((a, d) => a + Number(d), 0);

// Карты рождения по методу М. Грир: день + месяц + год, сумма цифр.
// Личность — число до 22 (22 → Шут), душа — то же число, сведённое к одной цифре.
// Аркан дня рождения — популярный в России счёт: день, а если больше 22 — день − 22.
export function birthCards(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!y || !mo || !d) return null;
  let s = digitSum(y + mo + d);
  while (s > 22) s = digitSum(s);
  const personality = s === 22 ? 0 : s;
  let soul = s === 22 ? 4 : s;
  while (soul > 9) soul = digitSum(soul);
  const day = d > 22 ? d - 22 : d;
  return { personality, soul, day: day === 22 ? 0 : day };
}

// Подбор карты колоды по названию из речи ИИ или поиска: точное совпадение, потом по началу слов
export function findCard(cards, name) {
  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'()]/g, '').replace(/\s+/g, ' ').trim();
  const q = norm(name);
  if (!q) return null;
  return cards.find((c) => norm(c.name) === q)
    || cards.find((c) => norm(c.name).startsWith(q) || q.startsWith(norm(c.name)))
    || cards.find((c) => norm(c.name).split(' «')[0] === q.split(' «')[0])
    || null;
}

// Сколько раз карты выпадали в раскладах (по ключу карты), по одной колоде
export function cardCounts(readings, deckId) {
  const n = {};
  for (const r of readings) {
    if (deckId && r.deckId !== deckId) continue;
    for (const c of r.cards || []) if (c?.key) n[c.key] = (n[c.key] || 0) + 1;
  }
  return n;
}

const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

function cardBlock(c, full) {
  const lines = [`### ${c.name}`];
  for (const [k, label] of CARD_FIELDS) {
    const v = (c[k] || '').trim();
    if (!v) continue;
    if (!full && !['up', 'rev'].includes(k)) continue;
    lines.push(`${label}: ${v}`);
  }
  const notes = (c.notes || '').trim();
  if (notes) lines.push(`Мои наработки: ${full ? notes : clip(notes, 400)}`);
  const obs = (c.obs || []).filter((o) => o?.text);
  if (obs.length) {
    const list = full ? obs : obs.slice(-3);
    lines.push('Наблюдения из практики:\n' + list.map((o) => `- ${o.date ? o.date + ': ' : ''}${full ? o.text : clip(o.text, 200)}`).join('\n'));
  }
  return lines.join('\n');
}

// База знаний колоды для ИИ. Если всё не помещается в budget символов —
// подробно идут карты и материалы, о которых сейчас речь (focus), остальные — кратко.
export function buildKnowledge(deck, cards, mats, { focus = '', budget = 160000, kindName = '' } = {}) {
  const head = [`# Колода «${deck.name}»${kindName ? ` (${kindName})` : ''}`];
  const meta = [['Автор', deck.author], ['Художник', deck.artist], ['Издатель', deck.publisher], ['Год', deck.year]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  if (meta.length) head.push(meta.join(' · '));
  if (deck.about) head.push('О колоде:\n' + deck.about);
  if (deck.howto) head.push('Как с ней работать:\n' + deck.howto);
  if (deck.myNotes) head.push('Мои наработки по колоде:\n' + deck.myNotes);
  const sorted = [...cards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const matsSorted = [...mats].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const matBlock = (m, full) => `### ${m.title || 'Без названия'}${m.tag ? ` [${m.tag}]` : ''}\n${full ? (m.text || '') : clip(m.text || '', 300)}`;

  const assemble = (cardFull, matFull) => [
    head.join('\n\n'),
    matsSorted.length ? '## Материалы и конспекты\n\n' + matsSorted.map((m) => matBlock(m, matFull(m))).join('\n\n') : '',
    '## Карты колоды\n\n' + sorted.map((c) => cardBlock(c, cardFull(c))).join('\n\n'),
  ].filter(Boolean).join('\n\n');

  const all = assemble(() => true, () => true);
  if (all.length <= budget) return all;

  const f = String(focus).toLowerCase().replace(/ё/g, 'е');
  const named = (s) => {
    const base = String(s || '').toLowerCase().replace(/ё/g, 'е').split(' «')[0];
    return base.length > 2 && f.includes(base);
  };
  const words = new Set(f.split(/[^a-zа-я0-9]+/).filter((w) => w.length > 4));
  const matHit = (m) => named(m.title) || String((m.title || '') + ' ' + (m.tag || '')).toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).some((w) => w.length > 4 && words.has(w));
  let out = assemble((c) => named(c.name), (m) => matHit(m));
  if (out.length > budget) out = assemble((c) => named(c.name), () => false);
  if (out.length > budget) out = out.slice(0, budget) + '\n…(база сокращена)';
  return out;
}

// Простая разметка ответа ИИ: абзацы, списки, заголовки, **жирный**, *курсив*
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function md(src) {
  const inline = (s) => escHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>');
  const out = []; let list = null, para = [];
  const flushP = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
  const flushL = () => { if (list) { out.push('<ul>' + list.map((li) => '<li>' + inline(li) + '</li>').join('') + '</ul>'); list = null; } };
  for (const raw of String(src || '').split('\n')) {
    const line = raw.trim();
    if (!line) { flushP(); flushL(); continue; }
    let m;
    if ((m = line.match(/^#{1,4}\s+(.*)$/))) { flushP(); flushL(); out.push('<h4>' + inline(m[1].replace(/\*\*/g, '')) + '</h4>'); }
    else if ((m = line.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/))) { flushP(); (list ||= []).push(m[1]); }
    else { flushL(); para.push(line); }
  }
  flushP(); flushL();
  return out.join('');
}

// Разбор потока ответа OpenAI (server-sent events): возвращает готовые события и необработанный хвост
export function parseSSE(buffer) {
  const events = [];
  let rest = buffer, i;
  while ((i = rest.indexOf('\n')) >= 0) {
    const line = rest.slice(0, i).trim();
    rest = rest.slice(i + 1);
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') { events.push({ done: true }); continue; }
    try { events.push(JSON.parse(data)); } catch { /* обрывок строки — пропускаем */ }
  }
  return { events, rest };
}

// Выбор модели ChatGPT из списка доступных по ключу: новейшая «основная» GPT (без mini/nano и спецверсий)
export function pickModel(ids, { cheap = false } = {}) {
  const ok = ids.filter((id) => /^(gpt-\d|o\d|chatgpt-)/.test(id) && !/(audio|realtime|transcribe|tts|image|search|codex|instruct|oss|vision|preview|-\d{4}-\d{2}-\d{2}$|-\d{4}$)/.test(id));
  const ver = (id) => { const m = /^gpt-(\d+(?:\.\d+)?)/.exec(id); return m ? parseFloat(m[1]) : 0; };
  const gpt = ok.filter((id) => id.startsWith('gpt-'));
  const pool = gpt.filter((id) => (cheap ? /mini/.test(id) : !/(mini|nano)/.test(id)));
  const list = (pool.length ? pool : gpt.length ? gpt : ok).sort((a, b) => ver(b) - ver(a) || a.length - b.length || a.localeCompare(b));
  return list[0] || '';
}
