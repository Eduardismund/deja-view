import { ensureAI } from './ai.js';

function filterColorRules(cssText) {
  const lines = cssText.split('\n');
  const colorRules = [];
  const colorPattern = /(#[0-9a-f]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\)|var\(--[^)]+\))/i;
  
  lines.forEach(line => {
    if (colorPattern.test(line) && 
        (line.includes('color') || 
         line.includes('background') || 
         line.includes('border') ||
         line.includes('shadow') ||
         line.includes('gradient'))) {
      colorRules.push(line);
    }
  });
  
  return colorRules.join('\n');
}

export async function extractVisualTheme(cssText) {
  if (!cssText) return '';
  
  const filteredCSS = filterColorRules(cssText);
  
  if (!filteredCSS) {
    return JSON.stringify([]);
  }
  
  const aiSession = await ensureAI();
  if (!aiSession) return JSON.stringify([]);
  
  const promptMessage = {
    role: 'user',
    content: `Extract colors from this CSS ordered by visual importance for page recognition and make sure they are correctly represented with no errors.

CSS: ${filteredCSS}

Prioritize:
- Unique brand colors over generic ones unless the main page is white/black, then place them higher
- Large area colors (body, header) over small elements

Return JSON array of 5-10 colors ordered by importance:
["#mostImportantColor", "#secondColor", "rgb(..)", ...]`
  };
  
  try {
    console.log('[CSS_ANALYZER] Analyzing', filteredCSS.length, 'chars of CSS');
    
    const result = await aiSession.prompt([promptMessage], {
      responseConstraint: {
        type: "array",
        items: { type: "string" }
      }
    });
    
    const colors = JSON.parse(result);
    console.log('[CSS_ANALYZER] Extracted colors:', colors);
    
    return JSON.stringify(colors);
  } catch (error) {
    console.error('[CSS_ANALYZER] Failed to extract theme:', error);
    return JSON.stringify([]);
  }
}