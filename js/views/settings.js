import { ic } from '../ticons.js';
import { esc, acts, forms, changes, opt, toast, download, ask } from '../core/ui.js';
import { listModels, aiErrorText, testConnection } from '../ai.js';
import { allMsgs, putMsg, getPhoto, setPhoto } from '../extra.js';
import { savePrefs } from './decks.js';
import { TCOLLS } from '../app.js';
import { todayISO } from '../util.js';

const app = () => window.__app;

export function settingsView(a) {
  const c = a.ctx(), p = c.prefs, st = a.store;
  const models = p.models || [];
  const html = `<p><a class="btn back" href="#" data-act="go" data-to="/">← Назад</a></p>
  <div class="card"><h2>${ic('sparkle')} Нейросеть Gemini</h2>
    ${p.aiKey ? `<p><span class="badge good">● подключена</span> <span class="small muted">ключ …${esc(p.aiKey.slice(-4))}</span></p>` : '<p>Толкования и чат работают на нейросети Gemini от Google. Это бесплатно: нужен только ключ, оплачивать ничего не нужно.</p>'}
    <form data-form="set.key"><label for="ok">${p.aiKey ? 'Заменить ключ' : 'Ключ Gemini'}</label><input id="ok" name="key" type="password" autocomplete="off" placeholder="AIza…" required>
      <div class="row" style="margin-top:8px"><button class="primary" type="submit">Проверить и сохранить</button>${p.aiKey ? '<button type="button" class="link danger" data-act="set.unkey">Удалить ключ</button>' : ''}</div></form>
    ${p.aiKey ? `<label for="om">Модель</label><select id="om" data-chg="set.model">${(models.length ? models : [p.model || '']).map((m) => opt(m, m + (m === p.best ? ' — рекомендуемая' : m === p.cheap ? ' — больше запросов в день' : ''), p.model)).join('')}</select>
      <div class="row"><button class="link" data-act="set.models">${ic('refresh')} Обновить список моделей</button></div>
      <div class="row" style="margin-top:8px"><button data-act="set.test">${ic('sparkle')} Проверить связь с Gemini</button></div><p id="aiTest" class="small pre"></p>
      <p class="hint">Рекомендуемая — самая новая Flash. Если часто упираетесь в дневной лимит, выберите Flash-Lite: у неё бесплатных запросов больше, но трактует она проще. Модели Pro бесплатно не работают.</p>` : ''}
    <details${p.aiKey ? '' : ' open'}><summary>Как получить бесплатный ключ</summary><ol class="steps small">
      <li>В России включите VPN — без него Google не пускает.</li>
      <li>Откройте <b>aistudio.google.com/apikey</b> и войдите своим Google-аккаунтом (почта Gmail).</li>
      <li>Нажмите <b>Create API key</b> (создать ключ), скопируйте его — он начинается с AIza — и вставьте сюда. Карту привязывать не нужно.</li></ol>
      <p class="hint">VPN нужен и потом: когда вы просите Gemini истолковать расклад или пишете в чат. Колоды, расклады, наработки и клиенты работают и без VPN. Бесплатный Gemini отвечает ограниченное число раз в минуту и в день (обычно сотни запросов в день), этого хватает для обычной работы. На бесплатном тарифе Google может использовать переписку для улучшения своих моделей — не пишите в чат полные имена и личные данные клиентов. Ключ хранится в вашей личной базе (её видите только вы) и работает на телефоне и компьютере.</p></details></div>

  <div class="card"><h2>Кабинет</h2>
    <label for="pn">Как к вам обращаться (для Gemini)</label><input id="pn" value="${esc(p.name || '')}" data-chg="set.name" placeholder="Имя">
    ${c.decks.length ? `<label for="pd">Основная колода — для карты дня и новых раскладов</label><select id="pd" data-chg="set.deck">${c.decks.map((d) => opt(d.id, d.name, c.defaultDeck?.id)).join('')}</select>` : ''}</div>

  <div class="card"><h2>Резервная копия</h2><p class="small muted">Колоды, карты, наработки, материалы, расклады, клиенты и вся переписка с Gemini — одним файлом. Ключ Gemini в копию не попадает.</p>
    <label class="check"><input type="checkbox" id="bkPhotos">С фотографиями карт (файл будет большим)</label>
    <div class="row"><button class="primary" data-act="set.backup">Скачать копию</button><label class="btn">Восстановить из файла<input type="file" accept=".json" data-chg="set.restore" hidden></label></div>
    <p id="bkMsg" class="small"></p></div>

  <div class="card"><h2>Оформление и аккаунт</h2>
    <label for="th" style="margin-top:0">Тема</label><select id="th" data-chg="set.theme">${opt('auto', 'как в телефоне', a.theme)}${opt('light', 'светлая', a.theme)}${opt('dark', 'тёмная', a.theme)}</select>
    <p class="small muted" style="margin-top:12px">${st.mode === 'firebase' ? `Вы вошли как <b>${esc(st.user.email)}</b>. Всё синхронизируется между телефоном и компьютером.` : 'Пробный режим: данные только в этом браузере.'}</p>
    <p class="small muted">Чтобы приложение было как обычное на телефоне: откройте сайт в Safari или Chrome → «Поделиться» / меню → «На экран Домой».</p>
    ${st.mode === 'firebase' ? '<button data-act="auth.out">Выйти</button>' : ''}</div>`;
  return { html };
}

forms['set.key'] = async (fd, f) => {
  const key = String(fd.get('key') || '').trim();
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Проверяю…';
  try {
    const m = await listModels(key);
    if (!m.ids.length) throw new Error('По этому ключу нет доступных моделей Gemini');
    await savePrefs({ aiKey: key, models: m.ids, best: m.best, cheap: m.cheap, model: m.best || m.ids[0] });
    toast('Gemini подключена: ' + (m.best || m.ids[0]));
  } catch (e) {
    toast(e.code ? aiErrorText(e) : e.message);
    btn.disabled = false; btn.textContent = 'Проверить и сохранить';
  }
};
acts['set.unkey'] = async () => { if (await ask('Удалить ключ Gemini? Чат и толкования перестанут работать, пока не добавите новый.')) await savePrefs({ aiKey: '' }); };
acts['set.models'] = async () => {
  const p = app().ctx().prefs;
  try {
    const m = await listModels(p.aiKey);
    await savePrefs({ models: m.ids, best: m.best, cheap: m.cheap, model: m.ids.includes(p.model) ? p.model : m.best });
    toast('Список моделей обновлён');
  } catch (e) { toast(aiErrorText(e)); }
};
changes['set.model'] = (v) => savePrefs({ model: v });
acts['set.test'] = async () => {
  const p = app().ctx().prefs, out = document.getElementById('aiTest');
  if (out) { out.className = 'small pre'; out.textContent = 'Спрашиваю Gemini…'; }
  try {
    const t = await testConnection(p.aiKey, p.model || p.best);
    if (out) { out.className = 'small pre up'; out.textContent = `Связь есть, модель ${p.model} ответила: «${t.trim().slice(0, 80)}»`; }
  } catch (e) {
    if (out) { out.className = 'small pre down'; out.textContent = aiErrorText(e); }
  }
};
changes['set.name'] = (v) => savePrefs({ name: v.trim() });
changes['set.deck'] = (v) => savePrefs({ defaultDeck: v });
changes['set.theme'] = (v) => app().setTheme(v);

acts['set.backup'] = async () => {
  const st = app().store, msg = document.getElementById('bkMsg');
  const withPhotos = document.getElementById('bkPhotos')?.checked;
  if (msg) msg.textContent = 'Собираю копию…';
  const data = {};
  for (const c of TCOLLS) data[c] = st.data[c].map((x) => (c === 't_prefs' ? { ...x, aiKey: '' } : x));
  const chats = {};
  for (const d of st.data.t_decks) chats[d.id] = await allMsgs(d.id);
  const photos = {};
  if (withPhotos) {
    for (const x of st.data.t_cards) if (x.photo) { const p = await getPhoto(x.id); if (p) photos[x.id] = p; }
    for (const d of st.data.t_decks) if (d.cover) { const p = await getPhoto('deck_' + d.id); if (p) photos['deck_' + d.id] = p; }
  }
  await download(`taro-kabinet-${todayISO()}.json`, JSON.stringify({ app: 'taro', v: 1, at: new Date().toISOString(), data, chats, photos }), 'application/json');
  if (msg) msg.textContent = '';
};
changes['set.restore'] = async (v, el) => {
  const file = el.files?.[0]; if (!file) return;
  let b;
  try { b = JSON.parse(await file.text()); } catch { toast('Это не файл копии'); return; }
  if (b.app !== 'taro' || !b.data) { toast('Это не копия таро-кабинета'); return; }
  if (!(await ask('Восстановить данные из копии? Совпадающие записи заменятся версиями из файла, остальное останется.', 'Восстановить'))) return;
  const st = app().store, msg = document.getElementById('bkMsg');
  const key = app().ctx().prefs.aiKey;
  for (const c of TCOLLS) {
    if (!Array.isArray(b.data[c])) continue;
    if (msg) msg.textContent = 'Восстанавливаю: ' + c;
    const items = c === 't_prefs' ? b.data[c].map((x) => ({ ...x, aiKey: key || x.aiKey || '' })) : b.data[c];
    await st.putMany(c, items);
  }
  let n = 0;
  for (const [deckId, msgs] of Object.entries(b.chats || {})) for (const m of msgs) { await putMsg(deckId, m); if (++n % 50 === 0 && msg) msg.textContent = `Переписка: ${n} сообщений…`; }
  for (const [id, data] of Object.entries(b.photos || {})) await setPhoto(id, data);
  if (msg) msg.textContent = '';
  toast('Данные восстановлены');
};
