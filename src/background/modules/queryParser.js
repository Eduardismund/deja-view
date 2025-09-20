import { ensureAI } from './ai.js';

export async function parseSearchQuery(query) {
  const aiSession = await ensureAI();
  
  if (!aiSession) {
    return { 
      originalQuery: query,
      domainHint: null,
      locationHint: null,
      contentQuery: query
    };
  }
  
  const parsePrompt = `
    Analyze this search query: "${query}"
    
    Identify what the user is LOOKING FOR vs what they're DESCRIBING:
    - They might describe a page/post to help locate it
    - But what they WANT is often a specific part (like a comment)
    
    Extract:
    1. domain: Site name or type (reddit.com, forum, news)
    2. targetLocation: What they want to FIND (comment, reply, sidebar)
    3. pageContext: Description of the PAGE/POST to help locate it
    4. searchContent: What content they're looking for
       - If there's text in quotes ('text' or "text"), use EXACTLY that as searchContent
       - Otherwise extract the main search terms
    5. isExactMatch: true if user has quotes or says "exactly", "said", "exact words"
    
    Return JSON: {
      "domain": "string or null",
      "targetLocation": "string or null",
      "pageContext": "string or null",
      "searchContent": "string",
      "isExactMatch": boolean
    }
  `;
  
  try {
    console.log('[QUERY_PARSER] Parsing query:', query);
    
    const result = await aiSession.prompt(parsePrompt, {
      responseConstraint: {
        type: "object",
        properties: {
          domain: { type: "string", nullable: true },
          targetLocation: { type: "string", nullable: true },
          pageContext: { type: "string", nullable: true },
          searchContent: { type: "string" },
          isExactMatch: { type: "boolean" }
        }
      }
    });
    
    const parsed = JSON.parse(result);
    
    console.log('[QUERY_PARSER] Extracted:', {
      domain: parsed.domain,
      targetLocation: parsed.targetLocation,
      pageContext: parsed.pageContext,
      searchContent: parsed.searchContent,
      isExactMatch: parsed.isExactMatch
    });
    
    return {
      originalQuery: query,
      domainHint: parsed.domain,
      locationHint: parsed.targetLocation,
      pageContext: parsed.pageContext,
      contentQuery: parsed.searchContent || query,
      isExactMatch: parsed.isExactMatch || false
    };
  } catch (error) {
    return {
      originalQuery: query,
      domainHint: null,
      locationHint: null,
      contentQuery: query
    };
  }
}