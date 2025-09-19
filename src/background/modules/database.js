let db = null;

export async function initDB() {
  const request = indexedDB.open('DejaViewMemories', 2);
  
  request.onupgradeneeded = (event) => {
    const database = event.target.result;
    
    if (!database.objectStoreNames.contains('memories')) {
      const store = database.createObjectStore('memories', { keyPath: 'id', autoIncrement: true });
      store.createIndex('timestamp', 'timestamp');
      store.createIndex('domain', 'domain');
      store.createIndex('url', 'url');
      store.createIndex('lastVisit', 'lastVisit');
    }
    
    if (!database.objectStoreNames.contains('unlocked')) {
      const unlockedStore = database.createObjectStore('unlocked', { keyPath: 'id', autoIncrement: true });
      unlockedStore.createIndex('timestamp', 'timestamp');
      unlockedStore.createIndex('url', 'url');
    }
  };
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onerror = () => {
      reject(request.error);
    }
  });
}

export function getDB() {
  return db;
}

export async function ensureDB() {
  if (!db) await initDB();
  return db;
}

export async function getAllMemories() {
  await ensureDB();
  
  return new Promise((resolve) => {
    const transaction = db.transaction(['memories'], 'readonly');
    const store = transaction.objectStore('memories');
    const request = store.getAll();
    
    request.onsuccess = () => {
      const memories = request.result.sort((a, b) => (b.lastVisit || b.timestamp) - (a.lastVisit || a.timestamp));
      resolve(memories.slice(0, 50));
    };
  });
}

export async function getMemoryCount() {
  await ensureDB();
  
  return new Promise((resolve) => {
    const transaction = db.transaction(['memories'], 'readonly');
    const store = transaction.objectStore('memories');
    const request = store.count();
    
    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

export async function getUnlockedCount() {
  await ensureDB();
  
  return new Promise((resolve) => {
    const transaction = db.transaction(['unlocked'], 'readonly');
    const store = transaction.objectStore('unlocked');
    const request = store.count();
    
    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

export async function clearAllMemories() {
  await ensureDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['memories', 'unlocked'], 'readwrite');
    
    const memoriesStore = transaction.objectStore('memories');
    const unlockedStore = transaction.objectStore('unlocked');
    
    memoriesStore.clear();
    unlockedStore.clear();
    
    transaction.oncomplete = () => {
      resolve();
    };
    
    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}

export async function trackMemoryUnlocked(url, query) {
  await ensureDB();
  
  const transaction = db.transaction(['unlocked'], 'readwrite');
  const store = transaction.objectStore('unlocked');
  
  store.add({
    url: url,
    query: query,
    timestamp: Date.now(),
    success: true
  });
  
}

export async function debugDatabase() {
  await ensureDB();
  
  return new Promise((resolve) => {
    const transaction = db.transaction(['memories'], 'readonly');
    const store = transaction.objectStore('memories');
    const request = store.getAll();
    
    request.onsuccess = () => {
      const memories = request.result;
      const info = {
        dbName: db.name,
        dbVersion: db.version,
        objectStores: Array.from(db.objectStoreNames),
        memoryCount: memories.length,
        sampleMemories: memories.slice(0, 3).map(m => ({
          id: m.id,
          url: m.url,
          title: m.title,
          hasHtml: !!m.html,
          hasTextContent: !!m.textContent,
          htmlLength: m.html?.length || 0,
          textLength: m.textContent?.length || 0
        }))
      };
      resolve(info);
    };
    
    request.onerror = () => {
      resolve({ error: request.error.message });
    };
  });
}