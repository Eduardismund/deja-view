import { ensureAI } from './ai.js';

export async function parseSearchQuery(query) {
  const aiSession = await ensureAI();
  
  if (!aiSession) {
    return { 
      originalQuery: query,
      pageIdentification: {
        domain: null,
        pageContext: null,
        visual: null
      },
      contentLocation: {
        targetLocation: null,
        searchContent: query,
        isExactMatch: false
      },
      domainHint: null,
      locationHint: null,
      contentQuery: query,
      visual: null
    };
  }
  
  const parsePrompt = `
    Analyze this search query: "${query}"
    
    Separate the query into TWO distinct categories:
    1. PAGE IDENTIFICATION - Characteristics that help identify which page the user is looking for
    2. CONTENT LOCATION - Specific text the user remembers seeing within that page
    
    Critical distinction:
    - pageContext = The page's TOPIC/SUBJECT (what the page is about)
    - searchContent = SPECIFIC TEXT the user remembers reading IN the page
    
    Key rules:
    - ALL topics, subjects, entities that describe what the page is about go in pageContext
    - searchContent is ONLY for specific text the user remembers reading within the page
    - Multiple domains connected by "or" must include ALL mentioned platforms
    - searchContent should be empty ("") unless user explicitly mentions remembering specific text phrases
    
    Extract:
    
    PAGE IDENTIFICATION (helps find the right page):
    - domain: ALL mentioned sites/platforms, comma-separated (include every platform mentioned with "or", "and", etc.) - null if none
    - pageContext: What the page is ABOUT (topics, subjects, entities) - null if none
    - visual: Color or layout descriptions - null if none
    
    CONTENT LOCATION (text within the page):
    - targetLocation: Specific section mentioned (sidebar, comments, etc.) - null if none
    - searchContent: ONLY text the user remembers seeing IN the page
       - Use "" (empty) if searching by topic only
       - Only fill if user mentions specific remembered text
    - isExactMatch: true if quotes used or "exactly" mentioned
    
    Return JSON: {
      "pageIdentification": {
        "domain": null,
        "pageContext": null,
        "visual": null
      },
      "contentLocation": {
        "targetLocation": null,
        "searchContent": "",
        "isExactMatch": false
      }
    }
  `;
  
  try {
    console.log('[QUERY_PARSER] Parsing query:', query);
    
    const result = await aiSession.prompt(parsePrompt, {
      responseConstraint: {
        type: "object",
        properties: {
          pageIdentification: {
            type: "object",
            properties: {
              domain: { type: "string", nullable: true },
              pageContext: { type: "string", nullable: true },
              visual: { type: "string", nullable: true }
            }
          },
          contentLocation: {
            type: "object",
            properties: {
              targetLocation: { type: "string", nullable: true },
              searchContent: { type: "string", minLength: 0 },
              isExactMatch: { type: "boolean" }
            }
          }
        }
      }
    });
    
    const parsed = JSON.parse(result);
    
    console.log('[QUERY_PARSER] Extracted:', {
      pageIdentification: parsed.pageIdentification,
      contentLocation: parsed.contentLocation
    });
    
    return {
      originalQuery: query,
      pageIdentification: parsed.pageIdentification,
      contentLocation: parsed.contentLocation,
      domainHint: parsed.pageIdentification?.domain,
      locationHint: parsed.contentLocation?.targetLocation,
      pageContext: parsed.pageIdentification?.pageContext,
      contentQuery: parsed.contentLocation?.searchContent || query,
      isExactMatch: parsed.contentLocation?.isExactMatch || false,
      visual: parsed.pageIdentification?.visual
    };
  } catch (error) {
    return {
      originalQuery: query,
      pageIdentification: {
        domain: null,
        pageContext: null,
        visual: null
      },
      contentLocation: {
        targetLocation: null,
        searchContent: query,
        isExactMatch: false
      },
      domainHint: null,
      locationHint: null,
      contentQuery: query,
      visual: null
    };
  }
}