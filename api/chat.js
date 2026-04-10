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

function hasImageTextRef(text) {
  const s = String(text || '');
  if (!s) return false;
  if (/\[image\]\(https?:\/\/[^\s)]+\)/i.test(s)) return true;
  if (/\[[^\]]+\]\((https?:\/\/[^\s)]+\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\?[^)\s]*)?)\)/i.test(s)) return true;
  if (/https?:\/\/[^\s)]+\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\?[^)\s]*)?/i.test(s)) return true;
  if (/https?:\/\/[^\s)]*tangbuy[^\s)]*(?:\/|%2F).*(?:png|jpe?g|webp|gif|bmp|svg)/i.test(s)) return true;
  return false;
}

function messageHasImage(msg) {
  const c = msg?.content;
  if (typeof c === 'string') {
    return hasImageTextRef(c);
  }
  if (Array.isArray(c)) {
    return c.some((part) => {
      if (!part) return false;
      if (part.type === 'image_url') return true;
      if (typeof part.text === 'string' && hasImageTextRef(part.text)) return true;
      if (typeof part.image_url?.url === 'string' && hasImageTextRef(part.image_url.url)) return true;
      return false;
    });
  }
  return false;
}

function requestHasImage(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.some(messageHasImage);
}

function shouldUseSecondaryModel(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) return { useSecondary: false, hasImageInRequest: false };
  const hasImageInRequest = requestHasImage(body);
  if (hasImageInRequest) return { useSecondary: true, hasImageInRequest: true };

  // Rule: after a user image message, allow at most 2 Qwen replies total.
  // Since current request has no image, this follow-up can use Qwen only when
  // assistant replies after last image-user-message are < 2.
  let lastImageUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (String(m?.role || '') !== 'user') continue;
    if (messageHasImage(m)) {
      lastImageUserIdx = i;
      break;
    }
  }
  if (lastImageUserIdx < 0) return { useSecondary: false, hasImageInRequest: false };

  let assistantRepliesAfterImage = 0;
  for (let i = lastImageUserIdx + 1; i < messages.length; i += 1) {
    if (String(messages[i]?.role || '') === 'assistant') {
      assistantRepliesAfterImage += 1;
    }
  }
  return { useSecondary: assistantRepliesAfterImage < 2, hasImageInRequest: false };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = await readJsonBody(req);
  const route = shouldUseSecondaryModel(body);
  const useSecondary = route.useSecondary;
  const modelRoute = useSecondary ? 'secondary' : 'primary';
  const baseUrlRaw = useSecondary ? process.env.VLLM_SECONDARY_BASE_URL : process.env.VLLM_BASE_URL;
  const apiKey = useSecondary ? process.env.VLLM_SECONDARY_API_KEY : process.env.VLLM_API_KEY;
  const modelId = useSecondary ? process.env.VLLM_SECONDARY_MODEL_ID : process.env.VLLM_MODEL_ID;

  if (!baseUrlRaw || !apiKey || !modelId) {
    res.status(500).json({
      error: 'Missing VLLM configuration on server',
      hint: useSecondary
        ? 'Image request detected. Set VLLM_SECONDARY_BASE_URL, VLLM_SECONDARY_API_KEY, VLLM_SECONDARY_MODEL_ID in Vercel Environment Variables, then redeploy.'
        : 'Set VLLM_BASE_URL, VLLM_API_KEY, VLLM_MODEL_ID in Vercel → Environment Variables (Production + Preview), then redeploy.',
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
    res.setHeader('x-ai-model-used', String(modelId || ''));
    res.setHeader('x-ai-model-route', modelRoute);
    res.setHeader('x-ai-has-image', route.hasImageInRequest ? '1' : '0');

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
