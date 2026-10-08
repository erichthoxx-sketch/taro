// Форматирование: рубли с пробелами, даты ДД.ММ.ГГГГ.
const NB = ' ';

export function num(n, decimals = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const neg = n < 0 && Math.round(Math.abs(n) * 10 ** decimals) > 0;
  const [int, frac] = Math.abs(n).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  return (neg ? '−' : '') + grouped + (frac ? ',' + frac : '');
}

// rub(25438.4) -> «25 438,40 ₽»; rub(1234, 0) -> «1 234 ₽»
export function rub(n, decimals = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return num(n, decimals) + NB + '₽';
}

export function pct(x, decimals = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return num(x * 100, decimals) + NB + '%';
}

// '2026-09-30' -> '30.09.2026'
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
export function fmtShort(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}
// '30.09.2026' -> '2026-09-30' (или null)
export function parseDateRu(s) {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/.exec(s || '');
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const t = new Date(iso + 'T00:00:00Z');
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? null : iso;
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
// «в октябре 2026»
export function fmtMonthIn(key) {
  const [y, m] = key.split('-');
  return `${MONTHS_PREP[+m - 1]} ${y}`;
}
export function fmtMonth(key) {
  const [y, m] = key.split('-');
  return `${MONTHS[+m - 1]} ${y}`;
}
// «Октябрь 2026» — с заглавной, для начала предложения и заголовков
export const fmtMonthCap = (key) => { const t = fmtMonth(key); return t.charAt(0).toUpperCase() + t.slice(1); };
export function fmtMonthShort(key) {
  const [y, m] = key.split('-');
  return `${MONTHS[+m - 1].slice(0, 3)} ${y.slice(2)}`;
}
// Число из строки: «1 129,50», «2 718,72 ₽», «1.49 %»
export function parseNum(s) {
  if (typeof s === 'number') return s;
  if (s === null || s === undefined) return NaN;
  const t = String(s).replace(/[\s  ]/g, '').replace(/[₽%]|RUB|руб\.?/gi, '').replace(',', '.').replace('−', '-');
  if (t === '' || !/^-?\d*\.?\d+$/.test(t)) return NaN;
  return parseFloat(t);
}

// Окончание по числу: plural(1, ['книга', 'книги', 'книг']) → «книга», 3 → «книги», 5 → «книг»
export function plural(n, [one, few, many]) {
  const a = Math.abs(Math.trunc(Number(n) || 0)), d = a % 10, h = a % 100;
  if (h >= 11 && h <= 14) return many;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return few;
  return many;
}
