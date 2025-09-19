let captureTimeout;

function debounce(func, wait) {
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(captureTimeout);
      func(...args);
    };
    clearTimeout(captureTimeout);
    captureTimeout = setTimeout(later, wait);
  };
}

function extractTextContent() {
  try {
    const textParts = [];
    const seenTexts = new Set();
    
    const selector = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, pre, code, article, figcaption';
    const elements = document.querySelectorAll(selector);
    
    
    elements.forEach(el => {
      const text = (el.innerText || el.textContent || '').trim();
      
      if (text.length > 10 && !seenTexts.has(text)) {
        seenTexts.add(text);
        textParts.push(text);
      }
    });
    
    if (textParts.length === 0) {
      const bodyText = document.body?.innerText || document.body?.textContent || '';
      return bodyText.slice(0, 10000);
    }
    
    const finalText = textParts.join(' ').replace(/\s+/g, ' ').trim();
    
    return finalText.slice(0, 10000);
  } catch (error) {
    return document.body?.innerText || document.body?.textContent || '';
  }
}

function capturePageSnapshot() {
  const snapshot = {
    url: window.location.href,
    title: document.title,
    timestamp: Date.now(),
    domain: window.location.hostname,
    html: document.documentElement.outerHTML,
    textContent: extractTextContent(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollY: window.scrollY
    },
    timeSpent: Date.now() - startTime
  };
  
  return snapshot;
}

const sendMemoryCapture = debounce(() => {
  if (document.hidden) return;
  
  if (!checkAndReconnect()) {
    setTimeout(() => {
      if (!document.hidden && checkAndReconnect()) {
        sendMemoryCapture();
      }
    }, 10000);
    return;
  }
  
  try {
    const snapshot = capturePageSnapshot();
    
    if (!snapshot.html || snapshot.html.length < 100) {
      setTimeout(sendMemoryCapture, 5000);
      return;
    }
    
    chrome.runtime.sendMessage({
      type: 'CAPTURE_MEMORY',
      data: snapshot
    }, (response) => {
      if (chrome.runtime.lastError && chrome.runtime.lastError.message.includes('context')) {
      }
    });
  } catch (error) {
  }
}, 5000);

let startTime = Date.now();


if (!chrome || !chrome.runtime) {
} else {
}

function checkAndReconnect() {
  try {
    if (!chrome || !chrome.runtime || !chrome.runtime.id) {
      if (chrome && chrome.runtime) {
        chrome.runtime.sendMessage({type: 'PING'}, response => {
          if (chrome.runtime.lastError) {
            return false;
          }
          return true;
        });
      }
      return false;
    }
    return true;
  } catch (error) {
    return false;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    const timeSpent = Date.now() - startTime;
    if (timeSpent > 3000) {
      sendMemoryCapture();
    }
  } else {
    startTime = Date.now();
  }
});

window.addEventListener('beforeunload', sendMemoryCapture);

document.addEventListener('scroll', debounce(() => {
  const scrollDepth = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
  if (scrollDepth > 0.5) {
    sendMemoryCapture();
  }
}, 2000));

if (document.readyState === 'complete') {
  setTimeout(sendMemoryCapture, 2000);
} else {
  window.addEventListener('load', () => {
    setTimeout(sendMemoryCapture, 2000);
  });
}

