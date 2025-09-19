import { 
  initDB, 
  getAllMemories, 
  getMemoryCount, 
  getUnlockedCount, 
  clearAllMemories, 
  trackMemoryUnlocked,
  debugDatabase 
} from './modules/database.js';

import { 
  initAI, 
  getAIStatus 
} from './modules/ai.js';

import { 
  storePageMemory 
} from './modules/memory.js';

import { 
  searchMemories 
} from './modules/search.js';

initDB();

chrome.runtime.onInstalled.addListener(async () => {
  await initDB();
  await initAI();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.type === 'PING') {
    sendResponse({ success: true, message: 'pong' });
    return true;
  }
  
  if (request.type === 'SEARCH_MEMORIES') {
    searchMemories(request.query).then(results => sendResponse(results));
    return true;
  }
  
  if (request.type === 'MEMORY_UNLOCKED') {
    trackMemoryUnlocked(request.url, request.query).then(() => sendResponse({ success: true }));
    return true;
  }
  
  if (request.type === 'GET_AI_STATUS') {
    getAIStatus().then(status => sendResponse(status));
    return true;
  }
  
  if (request.type === 'CAPTURE_MEMORY') {
    storePageMemory(request.data).then(() => sendResponse({ success: true }));
    return true;
  }
  
  if (request.type === 'GET_ALL_MEMORIES') {
    getAllMemories().then(memories => sendResponse(memories));
    return true;
  }
  
  if (request.type === 'CLEAR_ALL_MEMORIES') {
    clearAllMemories().then(() => sendResponse({ success: true }));
    return true;
  }
  
  if (request.type === 'GET_MEMORY_COUNT') {
    getMemoryCount().then(count => sendResponse(count));
    return true;
  }
  
  if (request.type === 'DEBUG_DB') {
    debugDatabase().then(info => {
      sendResponse(info);
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true;
  }
  
  if (request.type === 'GET_UNLOCKED_COUNT') {
    getUnlockedCount().then(count => sendResponse(count));
    return true;
  }
});

if (typeof window !== 'undefined') {
  window.dejaView = {
    getAllMemories,
    getMemoryCount,
    clearAllMemories,
    searchMemories,
    debugDatabase,
    getAIStatus
  };
}