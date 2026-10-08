// Иконки таро-кабинета в том же тонком стиле, что и общие (js/icons.js)
import { ICONS } from './core/icons.js';

const svg = (body) => `<svg class="ic" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const T = {
  ...ICONS,
  deck: svg('<rect x="7" y="3.5" width="11" height="16" rx="2"/><path d="M4.5 7.5v11a2 2 0 0 0 2 2H14"/><path d="M12.5 8.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z"/>'),
  spread: svg('<rect x="3" y="7" width="5.5" height="9" rx="1.2"/><rect x="9.25" y="5" width="5.5" height="9" rx="1.2"/><rect x="15.5" y="7" width="5.5" height="9" rx="1.2"/><path d="M6 19.5h12"/>'),
  people: svg('<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6"/><path d="M17.5 14.3a5.5 5.5 0 0 1 3 5.2"/>'),
  chat: svg('<path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5V16.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><path d="M8 10h8M8 13h5"/>'),
  moonstar: svg('<path d="M15.5 4.5a7.5 7.5 0 1 0 4 12.5 6 6 0 0 1-4-12.5z"/><path d="M18 4l.6 1.6 1.6.6-1.6.6L18 8.4l-.6-1.6-1.6-.6 1.6-.6z"/>'),
  camera: svg('<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  shuffle: svg('<path d="M4 7h3c4 0 6 10 10 10h3"/><path d="M4 17h3c1.6 0 2.8-1.5 3.8-3.3"/><path d="M13.2 10.3C14.2 8.5 15.4 7 17 7h3"/><path d="M18 4.5L20.5 7 18 9.5"/><path d="M18 14.5l2.5 2.5-2.5 2.5"/>'),
  send: svg('<path d="M4.5 12L19.5 5l-4 15-3.5-6.5z"/><path d="M12 13.5l7.5-8.5"/>'),
  stop: svg('<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>'),
  note: svg('<path d="M5.5 4.5h13v11l-4 4h-9z"/><path d="M14.5 19.5v-4h4"/><path d="M8.5 9h7M8.5 12.5h5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  copy: svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>'),
};
export const ic = (name) => T[name] || '';
