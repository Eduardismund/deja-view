import {ensureDB, getDB} from './database.js';
import {ensureAI} from './ai.js';
import {extractTextFromHTML} from './memory.js';
import {parseSearchQuery} from './queryParser.js';

async function findRelevantPages(memories, pageIdentification) {
  const aiSession = await ensureAI();
  if (!aiSession) return memories;
  
  const pageId = pageIdentification;
  if (!pageId.domain && !pageId.pageContext && !pageId.visual) {
    return memories;
  }
  
  console.log('[SEARCH] Filtering by page identification:', pageId);
  const beforeCount = memories.length;
  
  let filterPrompt = 'Filter these memories to pages that match the following criteria:\n\n';
  const criteria = [];
  
  if (pageId.domain) {
    criteria.push(`DOMAIN/SITE: "${pageId.domain}" - EXTREMELY IMPORTANT: ONLY match the domain field (hostname), NOT URL parameters. reddit must match www.reddit.com domain, NOT google.com URLs containing "reddit".`);
  }
  if (pageId.pageContext) {
    criteria.push(`PAGE CONTENT: "${pageId.pageContext}" - Match against title and summary fields`);
  }
  if (pageId.visual) {
    criteria.push(`VISUAL APPEARANCE: "${pageId.visual}" - Match against css color array`);
  }
  
  filterPrompt += criteria.join('\n') + '\n\n';
  filterPrompt += 'Instructions:\n';
  filterPrompt += '- CRITICAL: If domain is specified, ONLY return pages whose DOMAIN FIELD contains that domain. NOT the full URL.\n';
  filterPrompt += '- Check the "domain" field specifically - ignore domain mentions in URL parameters\n';
  filterPrompt += '- Domain filtering is MANDATORY, and the main criteria - ignore summary relevance if domain does not match\n';
  filterPrompt += '- Use title/summary for content relevance ONLY after domain requirements are met\n';
  filterPrompt += '- Domain is a hard filter - summary cannot override domain mismatch\n';
  
  if (pageId.visual && !pageId.domain && !pageId.pageContext) {
    filterPrompt += '- IMPORTANT: For visual-only searches, be inclusive - return pages that match the colors AND pages that might match\n';
    filterPrompt += '- Include pages with matching colors, but also include uncertain matches\n';
    filterPrompt += '- Return more results rather than fewer for visual searches\n\n';
  } else {
    filterPrompt += '- Return pages that match the criteria based on available information\n\n';
  }
  
  
  const memoryData = memories.map(m => {
    return {
      id: m.id,
      title: m.title,
      url: m.url,
      domain: m.domain,
      summary: m.summary,
      css: m.css
    };
  });
  
  filterPrompt += `Memories: ${JSON.stringify(memoryData)}\n\nReturn array of matching memory IDs: [1, 2, 3]`;
  
  try {
    const result = await aiSession.prompt(filterPrompt, {
      responseConstraint: {
        type: "array",
        items: { type: "number" }
      }
    });
    
    const matchingIds = JSON.parse(result);
    const filteredMemories = memories.filter(m => matchingIds.includes(m.id));
    
    console.log('[SEARCH] Page identification filter results:', {
      before: beforeCount,
      after: filteredMemories.length,
      matchingIds,
      criteria: criteria
    });
    
    return filteredMemories.length === 0 ? memories : filteredMemories;
  } catch (e) {
    console.error('[SEARCH] Page identification filter failed:', e);
    return memories;
  }
}

async function findContentInPages(memories, contentLocation) {
  if (memories.length === 0) return memories;
  
  if (!contentLocation.searchContent || contentLocation.searchContent === "") {
    return memories;
  }
  
  const enhancedMemories = [];
  
  console.log('[SEARCH] Deep search with:', {
    query: contentLocation.searchContent,
    locationHint: contentLocation.targetLocation,
    isExactMatch: contentLocation.isExactMatch,
    memoriesCount: memories.length
  });
  
  for (const memory of memories) {
    if (contentLocation.targetLocation && memory.html) {
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
  
  if (contentLocation.isExactMatch) {
    console.log('[SEARCH] Attempting exact match search for:', contentLocation.searchContent);
    const exactMatches = [];
    
    for (const memory of enhancedMemories) {
      if (memory.content && memory.content.toLowerCase().includes(contentLocation.searchContent.toLowerCase())) {
        exactMatches.push({
          ...memory,
          confidence: 100,
          aiReason: `Exact match found: "${contentLocation.searchContent}"`,
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
  
  const searchPrompt = contentLocation.targetLocation ? `
    User is looking for: "${contentLocation.searchContent}"
    Target location: ${contentLocation.targetLocation}
    
    Find pages that match the context, then look for the target content in the specified location.
    Focus on ${contentLocation.targetLocation} sections that contain "${contentLocation.searchContent}".
    
    Pages:
    ${JSON.stringify(enhancedMemories.map(m => ({
      id: m.id,
      title: m.title,
      content: m.content ? m.content.substring(0, 3000) : 'No content'
    })))}
    
    Return: [{"id": 1, "confidence": 95, "reason": "Found '${contentLocation.searchContent}' in ${contentLocation.targetLocation}"}]
  ` : `
    User query: "${contentLocation.searchContent}"
    
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
        console.error('[SEARCH] AI session not available');
        resolve([]);
        return;
      }
      
      try {
        let relevantPages = await findRelevantPages(memories, queryInfo.pageIdentification);
        
        let rankedMemories = await findContentInPages(relevantPages, queryInfo.contentLocation);
        
        resolve(rankedMemories);
      } catch (error) {
        console.error('[SEARCH] Search failed:', error);
        resolve([]);
      }
    };
  });
}