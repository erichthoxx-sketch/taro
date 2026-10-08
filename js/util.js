// Мелочи, общие для экранов таро-кабинета: даты, плитка карты, обложка колоды, случайные карты.
import { esc } from './core/ui.js';

export const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const nowISO = () => new Date().toISOString();

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_N = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
// '2026-10-08' → «8 октября» (год — если не текущий)
export function dayName(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`;
}
export const monthName = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS_N[m - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`; };
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// Плитка карты: фото, если есть, иначе аккуратная розовая карточка с номером и названием
export function tile(card, { rev = false, cls = '' } = {}) {
  if (!card) return `<div class="tcard empty ${cls}"><div class="tc-ph"><span class="tc-name">?</span></div></div>`;
  return `<div class="tcard has-photo ${rev ? 'rev' : ''} ${cls}">${card.photo ? `<img data-photo="${esc(card.id)}" alt="">` : ''}<div class="tc-ph"><span class="tc-num">${esc(card.numeral || '')}</span><span class="tc-name">${esc(sub(card))}</span></div></div>`;
}

// подпись на рисунке: у младших арканов номер уже сверху, поэтому только масть (и титул у Тота)
const SUIT_GROUPS = new Set(['wands', 'cups', 'swords', 'pentacles']);
function sub(card) {
  if (!SUIT_GROUPS.has(card.group)) return card.name;
  const rest = card.name.split(' ').slice(1).join(' ');
  return rest || card.name;
}

export function cover(deck) {
  return `<div class="cover has-photo">${deck.cover ? `<img data-photo="deck_${esc(deck.id)}" alt="">` : ''}<div class="cover-ph"><span>${esc(deck.name)}</span></div></div>`;
}

export function rand(n) {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; } catch { return Math.floor(Math.random() * n); }
}

// Есть ли у карты личные записи
export const hasNotes = (c) => !!((c.notes || '').trim() || (c.obs || []).length);

export const FEEDBACK = { yes: 'Сбылось', part: 'Частично', no: 'Не сбылось' };
