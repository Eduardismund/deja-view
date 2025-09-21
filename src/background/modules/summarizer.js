let summarizerInstance = null;

export async function initSummarizer() {
  if (typeof Summarizer === 'undefined') {
    console.log('[SUMMARIZER] API not available');
    return false;
  }
  
  try {
    const availability = await Summarizer.availability();
    
    if (availability === 'available' || availability === 'downloadable') {
      summarizerInstance = await Summarizer.create({
        type: 'key-points',
        format: 'plain-text',
        length: 'short',
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            console.log(`[SUMMARIZER] Model download: ${e.loaded * 100}%`);
          });
        }
      });
      console.log('[SUMMARIZER] Initialized successfully');
      return true;
    }
  } catch (error) {
    console.error('[SUMMARIZER] Init failed:', error);
  }
  return false;
}

export async function summarizePage(text) {
  if (!text || text.length < 100) {
    return '';
  }
  
  try {
    // Initialize if needed
    if (!summarizerInstance) {
      await initSummarizer();
    }
    
    if (!summarizerInstance) {
      return '';
    }
    
    // Generate summary (3 key bullet points)
    const summary = await summarizerInstance.summarize(text);
    console.log('[SUMMARIZER] Generated summary:', summary.length, 'chars');
    return summary;
  } catch (error) {
    console.error('[SUMMARIZER] Failed to summarize:', error);
    return '';
  }
}

export async function getSummarizerStatus() {
  if (typeof Summarizer === 'undefined') {
    return { available: false, status: 'API not found' };
  }
  
  try {
    const availability = await Summarizer.availability();
    return {
      available: availability === 'available',
      status: availability,
      initialized: summarizerInstance !== null
    };
  } catch (error) {
    return { available: false, status: 'Error: ' + error.message };
  }
}