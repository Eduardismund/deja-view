let aiSession = null;

export async function initAI() {
  if (typeof LanguageModel === 'undefined') {
    return false;
  }
  
  try {
    const availability = await LanguageModel.availability();
    
    if (availability === 'available') {
      aiSession = await LanguageModel.create({
        initialPrompts: [
          {
            role: 'system',
            content: 'Memory search assistant. Analyze page content and return valid JSON with confidence scores.'
          }
        ]
      });
      return true;
    }
  } catch (error) {
    // AI init failed
  }
  return false;
}

export async function getAIStatus() {
  if (typeof LanguageModel === 'undefined') {
    return { available: false, status: 'API not found' };
  }
  
  try {
    const availability = await LanguageModel.availability();
    return { 
      available: availability === 'available',
      status: availability,
      sessionActive: aiSession !== null
    };
  } catch (error) {
    return { available: false, status: 'Error: ' + error.message };
  }
}

export function getAISession() {
  return aiSession;
}

export async function ensureAI() {
  if (!aiSession) {
    await initAI();
  }
  return aiSession;
}