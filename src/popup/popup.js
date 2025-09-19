const searchInput = document.getElementById('searchInput');
const resultsDiv = document.getElementById('results');
const statusDiv = document.getElementById('status');
const viewAllBtn = document.getElementById('viewAll');
const clearAllBtn = document.getElementById('clearAll');

let searchTimeout;
let isSearching = false;

searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim();
  
  if (query.length < 3) {
    resultsDiv.innerHTML = '';
    statusDiv.textContent = 'Type at least 3 characters to search...';
    return;
  }
  
  if (isSearching) {
  }
  
  searchTimeout = setTimeout(() => {
    if (!isSearching && query.length >= 3) {
      searchMemories(query);
    }
  }, 1500);
});


async function searchMemories(query) {
  if (!query) {
    resultsDiv.innerHTML = '';
    statusDiv.textContent = 'Type to search your memories...';
    return;
  }
  
  if (isSearching) {
    return;
  }
  
  isSearching = true;
  const deepSearch = true;
  
  statusDiv.textContent = '🔍 Searching stored content...';
  
  const startTime = Date.now();
  
  chrome.runtime.sendMessage(
    { 
      type: 'SEARCH_MEMORIES', 
      query,
      deepSearch 
    },
    (results) => {
      isSearching = false;
      
      if (chrome.runtime.lastError) {
        statusDiv.textContent = 'Search failed. Please try again.';
        return;
      }
      
      if (!results) {
        statusDiv.textContent = 'Search failed. Please try again.';
        return;
      }
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      statusDiv.textContent = `Found ${results.length} relevant memories (${elapsed}s)`;
      displayResults(results);
    }
  );
}

function displayResults(memories) {
  
  if (memories.length === 0) {
    resultsDiv.innerHTML = '<p style="color: #999;">No memories found</p>';
    return;
  }
  
  resultsDiv.innerHTML = memories.map((memory, index) => {
    const confidence = memory.confidence || 0;
    const isHighConfidence = confidence >= 90;
    const isMediumConfidence = confidence >= 70;
    
    let confidenceBadgeClass = 'confidence-low';
    let confidenceIcon = '';
    if (isHighConfidence) {
      confidenceBadgeClass = 'confidence-high';
      confidenceIcon = '🏆 ';
    } else if (isMediumConfidence) {
      confidenceBadgeClass = 'confidence-medium';
      confidenceIcon = '✓ ';
    }
    
    return `
      <div class="memory ${isHighConfidence ? 'high-confidence' : ''}" 
           data-url="${memory.url}" 
           data-query="${memory.searchQuery || ''}"
           title="${isHighConfidence ? '🏆 High confidence match!' : ''}">
        ${confidence > 0 ? `<span class="confidence-badge ${confidenceBadgeClass}">${confidenceIcon}${confidence}%</span>` : ''}
        <div class="memory-title">${memory.title || 'Untitled'}</div>
        <div class="memory-url">${memory.url}</div>
        ${memory.visitCount ? `<div style="font-size: 11px; color: #999;">Visited ${memory.visitCount} times</div>` : ''}
        ${memory.searchMethod ? `<div style="font-size: 10px; color: #666;">${memory.searchMethod}</div>` : ''}
      </div>
    `;
  }).join('');
  
  document.querySelectorAll('.memory').forEach((el, index) => {
    el.addEventListener('click', () => {
      const url = el.dataset.url;
      const query = el.dataset.query;
      
      
      if (query) {
        chrome.runtime.sendMessage({
          type: 'MEMORY_UNLOCKED',
          url: url,
          query: query
        });
      }
      
      chrome.tabs.create({ url: url });
    });
  });
}

viewAllBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'GET_ALL_MEMORIES' }, (memories) => {
    statusDiv.textContent = `Showing all ${memories.length} memories`;
    displayResults(memories);
  });
});

clearAllBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to clear all memories? This cannot be undone.')) {
    statusDiv.textContent = 'Clearing all memories...';
    chrome.runtime.sendMessage({ type: 'CLEAR_ALL_MEMORIES' }, (response) => {
      if (response.success) {
        statusDiv.textContent = 'All memories cleared';
        resultsDiv.innerHTML = '';
        viewAllBtn.textContent = 'View All Memories (0)';
      } else {
        statusDiv.textContent = 'Error clearing memories';
      }
    });
  }
});


chrome.runtime.sendMessage({ type: 'GET_AI_STATUS' }, (status) => {
  
  if (status.available) {
    statusDiv.innerHTML = `<span style="color: green;">✓</span> Gemini Nano ready`;
    searchInput.placeholder = "Try: 'blue article about cooking' or 'tutorial I saw yesterday'";
  } else {
    statusDiv.innerHTML = `<span style="color: orange;">⚠</span> Basic search mode (AI: ${status.status})`;
  }
  
  chrome.runtime.sendMessage({ type: 'GET_MEMORY_COUNT' }, (count) => {
    viewAllBtn.textContent = `View All Memories (${count})`;
  });
});