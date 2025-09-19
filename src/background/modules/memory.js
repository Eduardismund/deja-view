import { ensureDB, getDB } from './database.js';

export async function storePageMemory(snapshot) {
  await ensureDB();
  const db = getDB();
  
  const transaction = db.transaction(['memories'], 'readwrite');
  const store = transaction.objectStore('memories');
  
  const existingRequest = store.index('url').get(snapshot.url);
  
  existingRequest.onsuccess = () => {
    const existing = existingRequest.result;
    
    if (existing) {
      const updated = {
        ...existing,
        html: snapshot.html,
        textContent: snapshot.textContent,
        title: snapshot.title,
        lastVisit: snapshot.timestamp,
        timeSpent: (existing.timeSpent || 0) + snapshot.timeSpent,
        visitCount: (existing.visitCount || 1) + 1,
        viewport: snapshot.viewport
      };
      store.put(updated);
    } else {
      const newMemory = {
        url: snapshot.url,
        title: snapshot.title,
        domain: snapshot.domain,
        timestamp: snapshot.timestamp,
        lastVisit: snapshot.timestamp,
        html: snapshot.html,
        textContent: snapshot.textContent,
        timeSpent: snapshot.timeSpent,
        visitCount: 1,
        viewport: snapshot.viewport
      };
      store.add(newMemory);
    }
  };
  
  cleanupOldMemories();
}

export async function cleanupOldMemories() {
  const db = getDB();
  if (!db) return;
  
  const transaction = db.transaction(['memories'], 'readwrite');
  const store = transaction.objectStore('memories');
  const request = store.getAll();
  
  request.onsuccess = () => {
    const memories = request.result;
    const maxEntries = 1000;
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    if (memories.length > maxEntries) {
      const sorted = memories.sort((a, b) => (b.lastVisit || b.timestamp) - (a.lastVisit || a.timestamp));
      const toDelete = sorted.slice(maxEntries);
      
      toDelete.forEach(memory => {
        store.delete(memory.id);
      });
      
    }
    
    const oldMemories = memories.filter(m => now - (m.lastVisit || m.timestamp) > maxAge);
    oldMemories.forEach(memory => {
      store.delete(memory.id);
    });
    
  };
}

export function extractTextFromHTML(html) {
  try {
    let cleanHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ');
    
    if (html.includes('reddit.com')) {
      const titleMatch = cleanHtml.match(/<h1[^>]*>([^<]+)<\/h1>/);
      const title = titleMatch ? titleMatch[1] : '';
      
      const contentPatterns = [
        /<p[^>]*>([^<]+)<\/p>/g,
        /<div[^>]*class="[^"]*comment[^"]*"[^>]*>([^<]+)</g,
        /<span[^>]*>([^<]+)<\/span>/g,
        />([^<]{20,})</g
      ];
      
      let allText = [title];
      contentPatterns.forEach(pattern => {
        const matches = cleanHtml.matchAll(pattern);
        for (const match of matches) {
          if (match[1] && match[1].trim().length > 5) {
            allText.push(match[1].trim());
          }
        }
      });
      
      const uniqueText = [...new Set(allText)].join(' ');
      const finalText = uniqueText
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      return finalText.slice(0, 10000);
    }
    
    let text = cleanHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    return text.slice(0, 10000);
  } catch (error) {
    return '';
  }
}