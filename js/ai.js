// Нейросеть Gemini (Google) прямо из браузера: бесплатный ключ таролога, потоковые ответы,
// инструменты для записи наработок. Внутри приложения переписка хранится в привычном виде
// (system / user / assistant / tool), здесь она переводится в формат Gemini.
import { parseSSE, pickModel, toGemini } from './tcalc.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';

export class AIError extends Error {
  constructor(code, message, text = '', retryAfter = 0) { super(message || code); this.code = code; this.text = text; this.retryAfter = retryAfter; }
}

export function aiErrorText(e) {
  const code = e?.code;
  return ({
    no_key: 'Добавьте бесплатный ключ Gemini в настройках — значок шестерёнки вверху.',
    bad_key: 'Ключ Gemini не подошёл. Проверьте его в настройках.',
    region: 'Google не отвечает из вашей страны. Включите VPN и повторите.',
    rate: 'Бесплатный лимит Gemini на эту минуту исчерпан. Подождите минуту и повторите.',
    daily: 'Бесплатный лимит Gemini на сегодня исчерпан. Он обновится завтра утром (около 10–11 по Москве). Можно переключиться на модель Flash-Lite в настройках — у неё лимит больше.',
    bad_model: 'Выбранная модель недоступна. Обновите список моделей в настройках.',
    too_long: 'Запрос получился слишком большим. Сократите материалы колоды.',
    blocked: 'Gemini отказался отвечать на этот запрос (сработал его фильтр). Попробуйте сформулировать иначе.',
    network: 'Нет связи с Gemini. Проверьте интернет и VPN.',
  })[code] || 'Gemini не ответил: ' + (e?.message || 'неизвестная ошибка');
}

async function fail(r) {
  let j = null;
  try { j = await r.json(); } catch { /* не JSON */ }
  const err = j?.error || {};
  const m = err.message || r.statusText || '';
  const details = JSON.stringify(err.details || []);
  if (/location is not supported|region/i.test(m)) throw new AIError('region', m);
  if (/API_KEY_INVALID|API key not valid|API key expired/i.test(m + details) || r.status === 401) throw new AIError('bad_key', m);
  if (r.status === 429 || err.status === 'RESOURCE_EXHAUSTED') {
    const wait = Number((/"retryDelay":"(\d+)/.exec(details) || [])[1] || 0);
    throw new AIError(/PerDay|per day|daily/i.test(m + details) ? 'daily' : 'rate', m, '', wait);
  }
  if (r.status === 404) throw new AIError('bad_model', m);
  if (/token count|too large|exceeds the maximum/i.test(m)) throw new AIError('too_long', m);
  if (r.status === 403) throw new AIError('bad_key', m);
  throw new AIError('api', m);
}

const headers = (key) => ({ 'Content-Type': 'application/json', 'x-goog-api-key': key });

// Модели, доступные по ключу (только текстовые), и рекомендуемые
export async function listModels(key) {
  if (!key) throw new AIError('no_key');
  let r;
  try { r = await fetch(API + '/models?pageSize=200', { headers: { 'x-goog-api-key': key } }); } catch { throw new AIError('network'); }
  if (!r.ok) await fail(r);
  const models = (await r.json()).models || [];
  const ids = models.filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((id) => /^gemini-/.test(id) && !/(tts|image|live|audio|embedding|aqa|robotics|computer-use|native)/.test(id)).sort();
  return { ids, best: pickModel(ids), cheap: pickModel(ids, { lite: true }) };
}

// Инструменты в формате Gemini
const toolDecls = (tools) => [{ functionDeclarations: tools.map((t) => t.function) }];

// Один запрос с потоковым ответом. messages — в привычном виде.
// Возвращает { text, toolCalls, parts } — toolCalls непустой, если модель решила вызвать инструменты.
export async function chatStream({ key, model, messages, tools, onText, signal }) {
  if (!key) throw new AIError('no_key');
  const body = toGemini(messages);
  if (tools?.length) body.tools = toolDecls(tools);
  let text = '';
  const calls = [], parts = [];
  let r;
  try {
    r = await fetch(`${API}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, { method: 'POST', headers: headers(key), body: JSON.stringify(body), signal });
  } catch (e) {
    if (e?.name === 'AbortError') throw new AIError('cancelled', '', text);
    throw new AIError('network');
  }
  if (!r.ok) await fail(r);
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', blocked = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const { events, rest } = parseSSE(buf + dec.decode(value, { stream: true }));
      buf = rest;
      for (const ev of events) {
        if (ev.error) throw new AIError('api', ev.error.message, text);
        if (ev.promptFeedback?.blockReason) blocked = true;
        const cand = ev.candidates?.[0];
        if (!cand) continue;
        if (/SAFETY|PROHIBITED|BLOCKLIST|SPII/.test(cand.finishReason || '')) blocked = true;
        for (const p of cand.content?.parts || []) {
          if (p.thought) continue; // скрытые размышления модели не показываем
          parts.push(p);
          if (p.text) { text += p.text; onText?.(text); }
          if (p.functionCall) calls.push({ id: 'call_' + calls.length, name: p.functionCall.name, args: JSON.stringify(p.functionCall.args || {}) });
        }
      }
    }
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e?.name === 'AbortError') throw new AIError('cancelled', '', text);
    throw new AIError('network', '', text);
  }
  if (blocked && !text && !calls.length) throw new AIError('blocked');
  return { text, toolCalls: calls, parts };
}

async function generate({ key, model, messages, signal, json }) {
  if (!key) throw new AIError('no_key');
  const body = toGemini(messages);
  if (json) body.generationConfig = { responseMimeType: 'application/json' };
  let r;
  try {
    r = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: headers(key), signal, body: JSON.stringify(body) });
  } catch (e) {
    if (e?.name === 'AbortError') throw new AIError('cancelled');
    throw new AIError('network');
  }
  if (!r.ok) await fail(r);
  const res = await r.json();
  return (res.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
}

// Ответ строго в JSON (для заполнения карточек)
export async function chatJSON(opts) {
  const txt = await generate({ ...opts, json: true });
  try { return JSON.parse(txt); } catch { throw new AIError('api', 'Gemini вернул ответ не в том формате'); }
}

// Обычный ответ без потока (для сводки памяти)
export const chatText = (opts) => generate(opts);

// Инструменты: ИИ сам записывает наработки таролога в колоду
export const TOOLS = [
  { type: 'function', function: {
    name: 'save_card_note',
    description: 'Записать наработку, наблюдение или трактовку таролога к конкретной карте этой колоды. Вызывай, когда таролог делится своим пониманием карты, опытом из практики или просит запомнить что-то о карте.',
    parameters: { type: 'OBJECT', properties: { card: { type: 'STRING', description: 'Название карты так, как оно записано в базе колоды' }, text: { type: 'STRING', description: 'Что записать — кратко, своими словами таролога, без воды' } }, required: ['card', 'text'] },
  } },
  { type: 'function', function: {
    name: 'save_deck_note',
    description: 'Записать в материалы колоды общую наработку: сочетание карт, приём работы, правило трактовки, вывод из практики — то, что не относится к одной карте.',
    parameters: { type: 'OBJECT', properties: { title: { type: 'STRING', description: 'Короткий заголовок' }, text: { type: 'STRING', description: 'Текст заметки' } }, required: ['title', 'text'] },
  } },
];
