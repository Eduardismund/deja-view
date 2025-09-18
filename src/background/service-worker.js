chrome.runtime.onInstalled.addListener(async () => {
  try {
    if (typeof LanguageModel !== 'undefined') {
      const availability = await LanguageModel.availability();
      console.log('Gemini Nano:', availability);
    }
  } catch (error) {
    console.error('AI error:', error);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TEST_AI') {
    testAI().then(result => sendResponse(result));
    return true;
  }
});

async function testAI() {
  try {
    if (typeof LanguageModel === 'undefined') {
      return { available: false };
    }
    const availability = await LanguageModel.availability();
    return { available: availability === 'available' };
  } catch (error) {
    return { available: false };
  }
}