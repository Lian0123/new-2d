// Share pending requests across player instances (including React StrictMode).
// Large PNG batches can stall on some HTTP/2 paths; keep two transfers active.
const pending = new Map<string, Promise<HTMLImageElement>>();
const queue: Array<() => void> = [];
let active = 0;

function pump() {
  while (active < 2 && queue.length) queue.shift()!();
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  const existing = pending.get(src);
  if (existing) return existing;
  const request = new Promise<HTMLImageElement>((resolve, reject) => {
    // New character requests take priority over queued artwork from a disposed player.
    queue.unshift(() => {
      active++;
      const image = new Image(); image.crossOrigin = 'anonymous'; image.decoding = 'async';
      let finished = false;
      const complete = (error?: Error) => {
        if (finished) return;
        finished = true; clearTimeout(timeout);
        image.onload = image.onerror = null;
        active--; pending.delete(src);
        if (error) reject(error); else resolve(image);
        queueMicrotask(pump);
      };
      const label = src.startsWith('data:') ? '匯入圖片' : src.slice(0, 160);
      const timeout = setTimeout(() => {
        complete(new Error(`角色圖片載入逾時，請重新載入：${label}`));
        image.removeAttribute('src');
      }, 30000);
      image.onload = () => complete(image.naturalWidth && image.naturalHeight ? undefined : new Error(`圖片沒有有效尺寸：${label}`));
      image.onerror = () => complete(new Error(`角色圖片載入失敗：${label}`));
      image.src = src;
    });
  });
  pending.set(src, request); pump();
  return request;
}
