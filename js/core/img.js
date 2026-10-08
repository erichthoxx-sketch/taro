// Уменьшение картинки для быстрой галереи (оригинал хранится на Google Диске)
export function resizeImage(file, maxW = 600, quality = 0.82) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, maxW / im.width);
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', quality));
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Не получилось открыть картинку')); };
    im.src = url;
  });
}
