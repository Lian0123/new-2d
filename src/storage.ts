import type { Project } from './core/model';

const DATABASE = 'mio-studio';
const STORE = 'workspace';
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本機儲存無法開啟'));
  });
}

export async function readCachedProject(): Promise<unknown> {
  const database = await open();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get('project');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

export async function writeCachedProject(project: Project): Promise<void> {
  const database = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(project, 'project');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('本機儲存失敗'));
      transaction.onabort = () => reject(transaction.error ?? new Error('本機儲存已中止'));
    });
  } finally { database.close(); }
}
