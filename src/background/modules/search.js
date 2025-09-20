import { ensureDB, getDB } from './database.js';
import { ensureAI } from './ai.js';
import { extractTextFromHTML } from './memory.js';
import { parseSearchQuery } from './queryParser.js';

async function searchMemoriesWithContent(query, memories, locationHint = null, pageContext = null, isExactMatch = false) {
  const enhancedMemories = [];
  
  console.log('[SEARCH] Deep search with:', {
    query,
    locationHint,
    pageContext,
    isExactMatch,
    memoriesCount: memories.length,
    usingHtml: !!locationHint
  });
  
  for (const memory of memories) {
    if (locationHint && memory.html) {
      // Use full HTML when searching for specific locations
      enhancedMemories.push({ 
        ...memory, 
        content: memory.html
      });
    } else if (memory.textContent) {
      enhancedMemories.push({ ...memory, content: memory.textContent });
    } else if (memory.html) {
      const textContent = extractTextFromHTML(memory.html);
      enhancedMemories.push({ ...memory, content: textContent });
    } else {
      enhancedMemories.push(memory);
    }
  }
  
  // Try exact match first if requested
  if (isExactMatch) {
    console.log('[SEARCH] Attempting exact match search for:', query);
    const exactMatches = [];
    
    for (const memory of enhancedMemories) {
      if (memory.content && memory.content.toLowerCase().includes(query.toLowerCase())) {
        exactMatches.push({
          ...memory,
          confidence: 100,
          aiReason: `Exact match found: "${query}"`,
          searchMethod: '🎯 Exact match'
        });
      }
    }
    
    if (exactMatches.length > 0) {
      console.log('[SEARCH] Found', exactMatches.length, 'exact matches');
      return exactMatches;
    }
    
    console.log('[SEARCH] No exact matches found, falling back to AI search');
  }
  
  const searchPrompt = locationHint ? `
    User is looking for: "${query}"
    Target location: ${locationHint}
    ${pageContext ? `Page should be about: ${pageContext}` : ''}
    
    Find pages that match the context, then look for the target content in the specified location.
    Focus on ${locationHint} sections that contain "${query}".
    
    Pages:
    ${JSON.stringify(enhancedMemories.map(m => ({
      id: m.id,
      title: m.title,
      content: m.content ? m.content.substring(0, 3000) : 'No content'
    })))}
    
    Return: [{"id": 1, "confidence": 95, "reason": "Found '${query}' in ${locationHint}"}]
  ` : `
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
    console.log('[SEARCH] Sending to AI for content analysis');
    
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
    
    console.log('[SEARCH] AI results:', relevantResults);
    
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
  
  const queryInfo = await parseSearchQuery(query);
  
  return new Promise(async (resolve) => {
    const transaction = db.transaction(['memories'], 'readonly');
    const store = transaction.objectStore('memories');
    const request = store.getAll();
    
    request.onsuccess = async () => {
      let memories = request.result;
      const aiSession = await ensureAI();
      
      if (!aiSession) {
        const filtered = memories.filter(m => 
          m.title?.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10);
        resolve(filtered);
        return;
      }
      
      if (queryInfo.domainHint) {
        console.log('[SEARCH] Filtering by domain:', queryInfo.domainHint);
        const beforeCount = memories.length;
        
        const domainFilterPrompt = `
          Filter these memories to only sites matching: "${queryInfo.domainHint}"
          
          Memories: ${JSON.stringify(memories.map(m => ({
            id: m.id,
            domain: m.domain,
            url: m.url,
            title: m.title
          })))}
          
          Return array of matching memory IDs: [1, 2, 3]
        `;
        
        try {
          const result = await aiSession.prompt(domainFilterPrompt, {
            responseConstraint: {
              type: "array",
              items: { type: "number" }
            }
          });
          
          const matchingIds = JSON.parse(result);
          memories = memories.filter(m => matchingIds.includes(m.id));
          
          console.log('[SEARCH] Domain filter results:', {
            before: beforeCount,
            after: memories.length,
            matchingIds
          });
        } catch (e) {
          console.error('[SEARCH] Domain filter failed:', e);
        }
      }

      try {
        const searchQuery = queryInfo.pageContext || queryInfo.contentQuery;
        
        const memoryDescriptions = memories.slice(-100).map(m => ({
          id: m.id,
          title: m.title,
          url: m.url,
          domain: m.domain,
          visitCount: m.visitCount || 1
        }));

        const searchPrompt = `
          User query: "${searchQuery}"
          
          Find relevant pages from these memories:
          ${JSON.stringify(memoryDescriptions)}
          
          Return JSON array of relevant IDs: [1, 2, 3]
        `;

        console.log('[SEARCH] Initial relevance check with', memoryDescriptions.length, 'memories');
        
        const result = await aiSession.prompt(searchPrompt, {
          responseConstraint: {
            type: "array",
            items: { type: "number" }
          }
        });
        
        const relevantIds = JSON.parse(result);
        console.log('[SEARCH] Found relevant IDs:', relevantIds);
        
        let rankedMemories = relevantIds
          .map(id => memories.find(m => m.id === id))
          .filter(Boolean);
        
        if (rankedMemories.length > 0) {
          console.log('[SEARCH] Starting deep content search');
          rankedMemories = await searchMemoriesWithContent(queryInfo.contentQuery, rankedMemories, queryInfo.locationHint, queryInfo.pageContext, queryInfo.isExactMatch);
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