import { ensureDB, getDB } from './database.js';
import { ensureAI } from './ai.js';
import { extractTextFromHTML } from './memory.js';

async function searchMemoriesWithContent(query, memories) {
  const enhancedMemories = [];
  
  for (const memory of memories) {
    if (memory.textContent) {
      enhancedMemories.push({ ...memory, content: memory.textContent });
    } else if (memory.html) {
      const textContent = extractTextFromHTML(memory.html);
      enhancedMemories.push({ ...memory, content: textContent });
    } else {
      enhancedMemories.push(memory);
    }
  }
  
  const searchPrompt = `
    User query: "${query}"
    
    Analyze each page content and rate 0-100 how well it matches the query.
    
    Pages:
    ${JSON.stringify(enhancedMemories.map(m => ({
      id: m.id,
      title: m.title,
      content: m.content ? m.content.substring(0, 800) : 'No content'
    })))}
    
    Return: [{"id": 1, "confidence": 95, "reason": "Contains exact match"}]
  `;
  
  const aiSession = await ensureAI();
  if (!aiSession) return enhancedMemories;
  
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), 60000)
  );
  
  try {
    const result = await Promise.race([
      aiSession.prompt(searchPrompt, {
        responseConstraint: {
          type: "array",
          items: { 
            type: "object",
            properties: {
              id: { type: "number" },
              confidence: { type: "number" },
              reason: { type: "string" }
            }
          }
        }
      }),
      timeoutPromise
    ]);
    
    let relevantResults;
    try {
      relevantResults = JSON.parse(result);
    } catch (parseError) {
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      relevantResults = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    }
    
    const filteredResults = relevantResults.filter(r => r.confidence >= 50);
    
    
    const results = filteredResults
      .map(({id, confidence, reason}) => {
        const memory = enhancedMemories.find(m => m.id === id);
        return memory ? { ...memory, confidence, aiReason: reason } : null;
      })
      .filter(Boolean);
    
    results.forEach(r => {
      r.searchMethod = r.content ? '💾 From cache' : '🔍 Deep searched';
    });
    
    return results;
  } catch (error) {
    return enhancedMemories.map(memory => ({
      ...memory,
      confidence: 50,
      aiReason: 'AI failed',
      searchMethod: '⚠️ No analysis'
    }));
  }
}

export async function searchMemories(query) {
  await ensureDB();
  const db = getDB();
  
  return new Promise(async (resolve) => {
    const transaction = db.transaction(['memories'], 'readonly');
    const store = transaction.objectStore('memories');
    const request = store.getAll();
    
    request.onsuccess = async () => {
      const memories = request.result;
      const aiSession = await ensureAI();
      
      if (!aiSession) {
        const filtered = memories.filter(m => 
          m.title?.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10);
        resolve(filtered);
        return;
      }

      try {
        const memoryDescriptions = memories.slice(-100).map(m => ({
          id: m.id,
          title: m.title,
          url: m.url,
          domain: m.domain,
          visitCount: m.visitCount || 1
        }));

        const searchPrompt = `
          User query: "${query}"
          
          Find relevant pages from these memories:
          ${JSON.stringify(memoryDescriptions)}
          
          Return JSON array of relevant IDs: [1, 2, 3]
        `;

        const result = await aiSession.prompt(searchPrompt, {
          responseConstraint: {
            type: "array",
            items: { type: "number" }
          }
        });
        
        const relevantIds = JSON.parse(result);
        let rankedMemories = relevantIds
          .map(id => memories.find(m => m.id === id))
          .filter(Boolean);
        
        if (rankedMemories.length > 0) {
          rankedMemories = await searchMemoriesWithContent(query, rankedMemories);
        }
        
        rankedMemories = rankedMemories.map(m => ({ ...m, searchQuery: query }));
        
        if (rankedMemories.length === 0) {
          const fallback = memories.filter(m => 
            m.title?.toLowerCase().includes(query.toLowerCase())
          ).slice(0, 5);
          resolve(fallback);
        } else {
          resolve(rankedMemories);
        }
      } catch (error) {
        const filtered = memories.filter(m => 
          m.title?.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10);
        resolve(filtered);
      }
    };
  });
}