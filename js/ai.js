// ChatGPT (OpenAI API) прямо из браузера: ключ таролога, потоковые ответы, инструменты для записи наработок.
import { parseSSE, pickModel } from './tcalc.js';

const API = 'https://api.openai.com/v1';

export class AIError extends Error {
  constructor(code, message, text = '') { super(message || code); this.code = code; this.text = text; }
}

export function aiErrorText(e) {
  const code = e?.code;
  return ({
    no_key: 'Добавьте ключ ChatGPT (OpenAI API) в настройках — значок шестерёнки вверху.',
    bad_key: 'Ключ ChatGPT не подошёл. Проверьте его в настройках.',
    no_money: 'На балансе OpenAI API закончились деньги. Пополните баланс на platform.openai.com → Billing.',
    rate: 'ChatGPT просит подождать: слишком много запросов. Попробуйте через минуту.',
    bad_model: 'Выбранная модель недоступна. Обновите список моделей в настройках.',
    too_long: 'Запрос получился слишком большим для модели. Сократите материалы или выберите модель с большим контекстом.',
    network: 'Нет связи с ChatGPT. Проверьте интернет.',
  })[code] || 'ChatGPT не ответил: ' + (e?.message || 'неизвестная ошибка');
}

async function fail(r) {
  let j = null;
  try { j = await r.json(); } catch { /* не JSON */ }
  const err = j?.error || {};
  const m = err.message || r.statusText;
  if (r.status === 401) throw new AIError('bad_key', m);
  if (err.code === 'insufficient_quota') throw new AIError('no_money', m);
  if (r.status === 429) throw new AIError('rate', m);
  if (err.code === 'model_not_found' || r.status === 404) throw new AIError('bad_model', m);
  if (err.code === 'context_length_exceeded' || /context length|maximum context/i.test(m)) throw new AIError('too_long', m);
  throw new AIError('api', m);
}

const headers = (key) => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + key });

// Модели, доступные по ключу (только подходящие для чата), и рекомендуемая
export async function listModels(key) {
  if (!key) throw new AIError('no_key');
  let r;
  try { r = await fetch(API + '/models', { headers: headers(key) }); } catch { throw new AIError('network'); }
  if (!r.ok) await fail(r);
  const ids = ((await r.json()).data || []).map((m) => m.id);
  const chat = ids.filter((id) => /^(gpt-\d|o\d|chatgpt-)/.test(id) && !/(audio|realtime|transcribe|tts|image|search|embedding|moderation)/.test(id)).sort();
  return { ids: chat, best: pickModel(chat), cheap: pickModel(chat, { cheap: true }) };
}

// Один запрос к чату с потоковым ответом. messages — в формате OpenAI.
// Возвращает { text, toolCalls } — toolCalls непустой, если модель решила вызвать инструменты.
export async function chatStream({ key, model, messages, tools, onText, signal }) {
  if (!key) throw new AIError('no_key');
  const body = { model, messages, stream: true };
  if (tools?.length) body.tools = tools;
  let text = '';
  const calls = [];
  let r;
  try {
    r = await fetch(API + '/chat/completions', { method: 'POST', headers: headers(key), body: JSON.stringify(body), signal });
  } catch (e) {
    if (e?.name === 'AbortError') throw new AIError('cancelled', '', text);
    throw new AIError('network');
  }
  if (!r.ok) await fail(r);
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const { events, rest } = parseSSE(buf + dec.decode(value, { stream: true }));
      buf = rest;
      for (const ev of events) {
        if (ev.error) throw new AIError('api', ev.error.message, text);
        const d = ev.choices?.[0]?.delta;
        if (!d) continue;
        if (d.content) { text += d.content; onText?.(text); }
        for (const tc of d.tool_calls || []) {
          const c = (calls[tc.index] ||= { id: '', name: '', args: '' });
          if (tc.id) c.id = tc.id;
          if (tc.function?.name) c.name += tc.function.name;
          if (tc.function?.arguments) c.args += tc.function.arguments;
        }
      }
    }
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e?.name === 'AbortError') throw new AIError('cancelled', '', text);
    throw new AIError('network', '', text);
  }
  return { text, toolCalls: calls.filter(Boolean) };
}

// Ответ без потока, строго JSON (для заполнения карточек и сводок)
export async function chatJSON({ key, model, messages, signal }) {
  if (!key) throw new AIError('no_key');
  let r;
  try {
    r = await fetch(API + '/chat/completions', { method: 'POST', headers: headers(key), signal, body: JSON.stringify({ model, messages, response_format: { type: 'json_object' } }) });
  } catch (e) {
    if (e?.name === 'AbortError') throw new AIError('cancelled');
    throw new AIError('network');
  }
  if (!r.ok) await fail(r);
  const txt = (await r.json()).choices?.[0]?.message?.content || '';
  try { return JSON.parse(txt); } catch { throw new AIError('api', 'ChatGPT вернул ответ не в том формате'); }
}

// Обычный ответ без потока (для сводки памяти)
export async function chatText({ key, model, messages, signal }) {
  if (!key) throw new AIError('no_key');
  let r;
  try { r = await fetch(API + '/chat/completions', { method: 'POST', headers: headers(key), signal, body: JSON.stringify({ model, messages }) }); } catch { throw new AIError('network'); }
  if (!r.ok) await fail(r);
  return (await r.json()).choices?.[0]?.message?.content || '';
}

// Инструменты: ИИ сам записывает наработки таролога в колоду
export const TOOLS = [
  { type: 'function', function: {
    name: 'save_card_note',
    description: 'Записать наработку, наблюдение или трактовку таролога к конкретной карте этой колоды. Вызывай, когда таролог делится своим пониманием карты, опытом из практики или просит запомнить что-то о карте.',
    parameters: { type: 'object', properties: { card: { type: 'string', description: 'Название карты так, как оно записано в базе колоды' }, text: { type: 'string', description: 'Что записать — кратко, своими словами таролога, без воды' } }, required: ['card', 'text'] },
  } },
  { type: 'function', function: {
    name: 'save_deck_note',
    description: 'Записать в материалы колоды общую наработку: сочетание карт, приём работы, правило трактовки, вывод из практики — то, что не относится к одной карте.',
    parameters: { type: 'object', properties: { title: { type: 'string', description: 'Короткий заголовок' }, text: { type: 'string', description: 'Текст заметки' } }, required: ['title', 'text'] },
  } },
];
