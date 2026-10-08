// Как ChatGPT работает с колодой: что он знает (база знаний + память прошлых разговоров),
// как записывает наработки таролога и как обновляет память, чтобы чат был «бесконечным».
import { buildKnowledge, findCard } from './tcalc.js';
import { CARD_FIELDS, KINDS } from './decks.js';
import { chatStream, chatText, chatJSON, TOOLS, AIError } from './ai.js';
import { putMsg, newMsgId } from './extra.js';
import { todayISO, nowISO, dayName } from './util.js';
import { uid } from './core/ui.js';

const app = () => window.__app;

export const KEEP_RECENT = 30;      // сколько последних сообщений идут в запрос дословно
export const SUMMARY_AFTER = 60;    // когда несжатых сообщений больше — старые уходят в память

export function aiConf(c) {
  const p = c.prefs;
  return { key: p.openaiKey || '', model: p.model || 'gpt-4o' };
}

function persona(c, deck) {
  const name = c.prefs.name ? `Таролога зовут ${c.prefs.name}. ` : '';
  return `Ты — ИИ-помощник таролога в её рабочем кабинете. ${name}Разговор посвящён колоде «${deck.name}» (${KINDS[deck.kind]?.name || 'колода'}).
Ниже — база знаний по этой колоде: типовые значения и личные наработки таролога. Личные наработки и наблюдения таролога важнее общих трактовок: опирайся на них в первую очередь и ссылайся на них. Если чего-то в базе нет — отвечай из традиции этой колоды и прямо говори, что это общая трактовка.
Помогай трактовать расклады (в связке карт, с учётом позиций, перевёрнутых положений, мастей и стихий), предлагай формулировки для клиентов, задавай уточняющие вопросы, когда это действительно нужно. Отвечай по-русски, тепло и по делу, без запугивания; не ставь медицинских и юридических диагнозов. Оформление: короткие абзацы, **жирным** — названия карт, списки строками с «- ». Сегодня ${dayName(todayISO())} ${new Date().getFullYear()} г.`;
}

export function systemPrompt(c, deck, { focus = '', tools = true } = {}) {
  const kb = buildKnowledge(deck, c.cardsByDeck[deck.id] || [], c.matsOf(deck.id), { focus, kindName: KINDS[deck.kind]?.name });
  const rules = tools ? `\nКогда таролог делится своим пониманием карты, наблюдением из практики, удачной формулировкой или просит что-то запомнить — сразу сохрани это: save_card_note (к карте) или save_deck_note (общее: сочетания, приёмы, правила). В ответе коротко скажи, что записал. Не записывай то, что уже есть в базе.` : '';
  const mem = (deck.memory || '').trim();
  return `${persona(c, deck)}${rules}\n\n# Память прошлых разговоров по этой колоде\n${mem || '(пока пусто)'}\n\n# База знаний таролога\n${kb}`;
}

// Выполнить инструмент, который вызвал ChatGPT. Возвращает { result (для модели), label (для показа) }
export async function runTool(c, deck, call) {
  let args = {};
  try { args = JSON.parse(call.args || '{}'); } catch { return { result: 'Ошибка: не разобрала аргументы' }; }
  const st = app().store;
  if (call.name === 'save_card_note') {
    const cards = c.cardsByDeck[deck.id] || [];
    const card = findCard(cards, args.card);
    if (!card) return { result: `Карта «${args.card}» не найдена. Названия в базе: ${cards.slice(0, 80).map((x) => x.name).join(', ')}` };
    const text = String(args.text || '').trim();
    if (!text) return { result: 'Пустая заметка — ничего не записано' };
    await st.put('t_cards', { ...card, obs: [...(card.obs || []), { id: uid(), date: todayISO(), text, src: 'чат' }] });
    return { result: `Записано к карте «${card.name}»`, label: `Записала к карте «${card.name}»`, link: `/card/${deck.id}/${card.key}` };
  }
  if (call.name === 'save_deck_note') {
    const title = String(args.title || 'Заметка из чата').trim(), text = String(args.text || '').trim();
    if (!text) return { result: 'Пустая заметка — ничего не записано' };
    await st.put('t_mats', { id: uid(), deckId: deck.id, title, tag: 'Из чата', text, createdAt: nowISO() });
    return { result: `Записано в материалы колоды: «${title}»`, label: `Записала в материалы: «${title}»`, link: `/deck/${deck.id}` };
  }
  return { result: 'Неизвестный инструмент' };
}

// Сообщения для запроса: всё после последней сводки памяти, но не больше KEEP_RECENT + запас
export function historyFor(deck, msgs) {
  const fresh = msgs.filter((m) => m.ts > (deck.memUpTo || 0) && !m.error);
  return fresh.slice(-(SUMMARY_AFTER + 10)).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
}

// Отправить сообщение в чат колоды. live — объект для показа ответа по мере написания.
export async function sendChat(c, deck, msgs, text, live) {
  const { key, model } = aiConf(c);
  if (!key) throw new AIError('no_key');
  const userMsg = { id: newMsgId(), role: 'user', text, ts: Date.now() };
  await putMsg(deck.id, userMsg);
  const focus = [...msgs.slice(-4).map((m) => m.text), text].join('\n');
  const messages = [{ role: 'system', content: systemPrompt(c, deck, { focus }) }, ...historyFor(deck, [...msgs, userMsg])];
  let done = '';
  const notes = [];
  try {
    for (let round = 0; round < 4; round++) {
      const r = await chatStream({ key, model, messages, tools: TOOLS, signal: live.signal, onText: (t) => live.onText(done + t, notes) });
      if (!r.toolCalls.length || round === 3) { done += r.text; break; }
      messages.push({ role: 'assistant', content: r.text || null, tool_calls: r.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.args } })) });
      if (r.text) done += r.text + '\n\n';
      for (const call of r.toolCalls) {
        const out = await runTool(app().ctx(), deck, call);
        if (out.label) notes.push({ label: out.label, link: out.link });
        messages.push({ role: 'tool', tool_call_id: call.id, content: out.result });
      }
      live.onText(done, notes);
    }
  } catch (e) {
    const partial = done + (e.text || '');
    if (partial.trim()) await putMsg(deck.id, { id: newMsgId(), role: 'assistant', text: partial, ts: Date.now(), notes, cut: true });
    throw e;
  }
  await putMsg(deck.id, { id: newMsgId(), role: 'assistant', text: done.trim() || '(пустой ответ)', ts: Date.now(), notes, model });
}

// Сжатие старых сообщений в «память»: всё старше последних KEEP_RECENT, если несжатых больше SUMMARY_AFTER
export async function maybeRemember(c, deck, msgs) {
  const fresh = msgs.filter((m) => m.ts > (deck.memUpTo || 0) && !m.error);
  if (fresh.length <= SUMMARY_AFTER) return false;
  const old = fresh.slice(0, fresh.length - KEEP_RECENT);
  const { key, model } = aiConf(c);
  const convo = old.map((m) => `${m.role === 'user' ? 'Таролог' : 'ИИ'}: ${m.text}`).join('\n\n');
  const memory = await chatText({ key, model, messages: [
    { role: 'system', content: 'Ты ведёшь долговременную память ИИ-помощника таролога по одной колоде. Обнови память: объедини прежнюю память и новый фрагмент переписки. Сохрани всё важное: как таролог понимает карты и сочетания, её приёмы и правила, договорённости о стиле ответов, разобранные расклады и вопросы (кратко, с картами), факты о её практике и клиентах (без лишних личных подробностей), что сбылось. Удали повторы и пустые реплики. Пиши по-русски, сжатыми пунктами, сгруппируй по темам. Не больше 1500 слов.' },
    { role: 'user', content: `Прежняя память:\n${deck.memory || '(пусто)'}\n\nНовый фрагмент переписки:\n${convo}` },
  ] });
  if (!memory.trim()) return false;
  await app().store.put('t_decks', { ...deck, memory: memory.trim(), memUpTo: old[old.length - 1].ts, memAt: nowISO() });
  return true;
}

// Описание расклада словами — для трактовки и для чата
export function readingText(c, r) {
  const deck = c.decksById[r.deckId];
  const cards = c.cardsByDeck[r.deckId] || [];
  const byKey = Object.fromEntries(cards.map((x) => [x.key, x]));
  const client = r.clientId ? c.clientsById[r.clientId] : null;
  const lines = (r.positions || []).map((p, i) => {
    const pick = (r.cards || [])[i];
    const card = pick?.key ? byKey[pick.key] : null;
    return `${i + 1}. ${p || 'Позиция ' + (i + 1)} — ${card ? card.name + (pick.rev ? ' (перевёрнутая)' : '') : 'карта не выбрана'}`;
  });
  return `Расклад «${r.spreadName || 'свой'}» колодой «${deck?.name || ''}», ${dayName(r.date)}.
${client ? `Для клиента: ${client.name}${client.birth ? ', дата рождения ' + client.birth : ''}.` : 'Расклад для себя.'}
Вопрос: ${r.question ? '«' + r.question + '»' : 'не задан'}
${lines.join('\n')}${r.myText ? `\nМоя трактовка: ${r.myText}` : ''}`;
}

export async function interpret(c, r, { onText, signal }) {
  const deck = c.decksById[r.deckId];
  const { key, model } = aiConf(c);
  const desc = readingText(c, r);
  const res = await chatStream({ key, model, signal, onText, messages: [
    { role: 'system', content: systemPrompt(c, deck, { focus: desc, tools: false }) },
    { role: 'user', content: `${desc}\n\nСделай трактовку этого расклада, опираясь на мою базу знаний и наработки по колоде. Структура: по каждой позиции 1–3 предложения (подзаголовок — позиция и карта), затем «### Общая картина» — как карты связаны между собой и с вопросом, затем «### Совет». Если моя трактовка уже есть — дополни её, а не повторяй.` },
  ] });
  return res.text;
}

// Дописать пустые поля карт типовыми значениями (по несколько карт за запрос)
export async function fillCards(c, deck, cards, { signal, onProgress } = {}) {
  const { key, model } = aiConf(c);
  const fields = CARD_FIELDS.filter(([k]) => !(k === 'rev' && !c.reversals(deck)));
  let done = 0;
  for (let i = 0; i < cards.length; i += 6) {
    if (signal?.aborted) throw new AIError('cancelled');
    const chunk = cards.slice(i, i + 6);
    const ask = chunk.map((x) => ({ key: x.key, name: x.name, empty: fields.filter(([k]) => !(x[k] || '').trim()).map(([k]) => k), filled: Object.fromEntries(fields.filter(([k]) => (x[k] || '').trim()).map(([k]) => [k, x[k]])) }));
    const res = await chatJSON({ key, model, signal, messages: [
      { role: 'system', content: `Ты — опытный таролог, знаток колоды «${deck.name}» (${KINDS[deck.kind]?.name}). Заполняешь справочник типовых значений карт для коллеги. Пиши по-русски, кратко и ёмко: 1–2 предложения или ключевые слова через запятую на поле. Учитывай традицию именно этой колоды и уже заполненные поля карты. Поля: ${fields.map(([k, l]) => `${k} — ${l}`).join('; ')}.` },
      { role: 'user', content: `Заполни ТОЛЬКО пустые поля (список empty) для этих карт. Верни JSON вида {"cards":[{"key":"...","поле":"текст"}]}.\n${JSON.stringify(ask)}` },
    ] });
    const st = app().store, fresh = app().ctx().cardsByDeck[deck.id] || [];
    for (const item of res.cards || []) {
      const card = fresh.find((x) => x.key === item.key);
      if (!card) continue;
      const upd = { ...card };
      for (const [k] of fields) if (!(card[k] || '').trim() && typeof item[k] === 'string' && item[k].trim()) upd[k] = item[k].trim();
      await st.put('t_cards', upd);
    }
    done += chunk.length;
    onProgress?.(done, cards.length);
  }
}
