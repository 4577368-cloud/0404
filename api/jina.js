/**
 * Vercel Serverless：Jina AI Reader 代理
 * 前端 POST { url: "https://..." } → 本函数用 JINA_API_KEY 请求 Jina → 返回 Markdown
 *
 * 部署后在 Vercel → Settings → Environment Variables 配置：
 *   JINA_API_KEY
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const targetUrl = body.url;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    const jinaKey = process.env.JINA_API_KEY;
    if (!jinaKey) {
      return res.status(500).json({ error: 'JINA_API_KEY not configured' });
    }

    const cleanUrl = targetUrl.replace(/^https?:\/\//, '');
    const jinaUrl = `https://r.jina.ai/http://${cleanUrl}`;

    const jinaRes = await fetch(jinaUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jinaKey}`,
        'Accept': 'text/plain',
        'X-Engine': 'browser',
        'X-Return-Format': 'markdown',
        'X-Remove-Selector': 'header, footer, nav, .announcement-bar, .site-header, .site-footer, .footer, .header, #shopify-section-header, #shopify-section-footer, .cookie-banner, .popup-modal',
        'X-Retain-Images': 'none',
        'X-Token-Budget': '8000',
        'X-With-Images-Summary': 'true',
      },
      signal: AbortSignal.timeout(30000),
    });

    const text = await jinaRes.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(jinaRes.status).send(text);
  } catch (e) {
    console.error('[api/jina]', e);
    return res.status(500).json({ error: e?.message || 'Jina proxy error' });
  }
}
