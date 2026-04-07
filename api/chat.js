import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

/**
 * Vercel Serverless：请求 `${VLLM_BASE_URL}/chat/completions`（OpenAI 兼容；BASE_URL 通常含 `/v1`）。
 * 本地开发走 vite.config.mts 里的 middleware，不经过本文件。
 *
 * 部署后必须在 Vercel → Settings → Environment Variables 配置（勿加 VITE_ 前缀）：
 *   VLLM_BASE_URL  VLLM_API_KEY  VLLM_MODEL_ID
 * VLLM_BASE_URL 必须是公网可访问（不能是 localhost / 内网 IP，否则云端无法连接）。
 */
async function readJsonBody(req) {
  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try {
      return req.body ? JSON.parse(req.body) : {};
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(req.body)) {
    try {
      const s = req.body.toString('utf8');
      return s ? JSON.parse(s) : {};
    } catch {
      return {};
    }
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizeBaseUrl(raw) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  return s;
}

function isNonPublicHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') return true;
  if (h.endsWith('.local')) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h)) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const baseUrlRaw = process.env.VLLM_BASE_URL;
  const apiKey = process.env.VLLM_API_KEY;
  const modelId = process.env.VLLM_MODEL_ID;

  if (!baseUrlRaw || !apiKey || !modelId) {
    res.status(500).json({
      error: 'Missing VLLM configuration on server',
      hint: 'Set VLLM_BASE_URL, VLLM_API_KEY, VLLM_MODEL_ID in Vercel → Environment Variables (Production + Preview), then redeploy.',
    });
    return;
  }

  const baseUrl = normalizeBaseUrl(baseUrlRaw);

  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      res.status(500).json({ error: 'VLLM_BASE_URL must start with https:// or http://' });
      return;
    }
    if (isNonPublicHost(parsed.hostname)) {
      res.status(500).json({
        error:
          'VLLM_BASE_URL points to localhost or a private network. Vercel cannot reach your laptop/LAN. Use a public API endpoint (HTTPS) or tunnel (e.g. ngrok) for development.',
      });
      return;
    }
  } catch {
    res.status(500).json({ error: 'VLLM_BASE_URL is not a valid URL' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const upstreamPayload = {
      stream: true,
      max_tokens: 4000,
      temperature: 0.7,
      ...body,
      model: modelId,
    };

    const target = `${baseUrl}/chat/completions`;
    let upstream;
    try {
      upstream = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(upstreamPayload),
      });
    } catch (fetchErr) {
      const msg = fetchErr?.message || String(fetchErr);
      console.error('[api/chat] fetch failed:', msg);
      res.status(500).json({
        error: `Upstream fetch failed: ${msg}`,
        hint: 'Check VLLM_BASE_URL, firewall, TLS, and that the API allows Vercel egress IPs.',
      });
      return;
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      console.error('[api/chat] upstream status', upstream.status, text?.slice(0, 500));
      res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json({
        error: 'Upstream returned an error',
        status: upstream.status,
        body: text?.slice(0, 2000) || '',
      });
      return;
    }

    if (!upstream.body) {
      res.status(502).json({ error: 'Upstream returned empty body' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    try {
      const nodeReadable = Readable.fromWeb(upstream.body);
      await pipeline(nodeReadable, res);
    } catch (pipeErr) {
      console.error('[api/chat] stream pipe error:', pipeErr);
      if (!res.headersSent) {
        res.status(500).json({ error: pipeErr?.message || 'Stream proxy failed' });
      } else {
        try {
          res.end();
        } catch (_) {}
      }
    }
  } catch (e) {
    console.error('[api/chat]', e);
    const msg = e?.message || String(e);
    if (!res.headersSent) {
      res.status(500).json({
        error: msg || 'Proxy error',
        hint: 'See Vercel function logs for the full stack trace.',
      });
    } else {
      try {
        res.end();
      } catch (_) {}
    }
  }
}
