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

function getUpstreamTimeoutMs() {
  const raw = String(process.env.VLLM_UPSTREAM_TIMEOUT_MS || '').trim();
  if (raw === '0') return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return 1_200_000;
}

function buildModelConfig(route) {
  if (route === 'secondary') {
    const baseUrlRaw = process.env.VLLM_SECONDARY_BASE_URL;
    const apiKey = process.env.VLLM_SECONDARY_API_KEY;
    const modelId = process.env.VLLM_SECONDARY_MODEL_ID;
    if (!baseUrlRaw || !apiKey || !modelId) return null;
    return { route, baseUrlRaw, apiKey, modelId };
  }
  const baseUrlRaw = process.env.VLLM_BASE_URL;
  const apiKey = process.env.VLLM_API_KEY;
  const modelId = process.env.VLLM_MODEL_ID;
  if (!baseUrlRaw || !apiKey || !modelId) return null;
  return { route, baseUrlRaw, apiKey, modelId };
}

function validateConfig(cfg) {
  const baseUrl = normalizeBaseUrl(cfg.baseUrlRaw);
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, error: `${cfg.route}: VLLM URL must start with https:// or http://` };
    }
    if (isNonPublicHost(parsed.hostname)) {
      return {
        ok: false,
        error: `${cfg.route}: VLLM URL points to localhost/private network; use public endpoint or tunnel.`,
      };
    }
    return { ok: true, baseUrl };
  } catch {
    return { ok: false, error: `${cfg.route}: VLLM URL is invalid` };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = await readJsonBody(req);
  const hasImageInRequest = requestHasImage(body);
  // New priority: prefer current secondary model; MiniMax(primary) is timeout fallback only.
  const preferredCfg = buildModelConfig('secondary') || buildModelConfig('primary');
  const fallbackCfg = buildModelConfig('secondary') && buildModelConfig('primary') ? buildModelConfig('primary') : null;

  if (!preferredCfg) {
    res.status(500).json({
      error: 'Missing VLLM configuration on server',
      hint: 'Set VLLM_SECONDARY_* (preferred) and VLLM_* (fallback MiniMax) in Vercel env, then redeploy.',
    });
    return;
  }
  const preferredValid = validateConfig(preferredCfg);
  if (!preferredValid.ok) {
    res.status(500).json({ error: preferredValid.error });
    return;
  }
  const fallbackValid = fallbackCfg ? validateConfig(fallbackCfg) : null;

  try {
    const timeoutMs = getUpstreamTimeoutMs();
    const callUpstream = async (cfg, baseUrl) => {
      const upstreamPayload = {
        stream: true,
        max_tokens: 4000,
        temperature: 0.7,
        ...body,
        model: cfg.modelId,
      };
      const target = `${baseUrl}/chat/completions`;
      const abortCtrl = new AbortController();
      let timer = null;
      if (timeoutMs > 0) {
        timer = setTimeout(() => abortCtrl.abort(new Error('upstream_timeout')), timeoutMs);
      }
      try {
        const upstream = await fetch(target, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify(upstreamPayload),
          signal: abortCtrl.signal,
        });
        if (timer) clearTimeout(timer);
        return { ok: true, upstream, cfg, modelRoute: cfg.route };
      } catch (e) {
        if (timer) clearTimeout(timer);
        const isTimeout = String(e?.name || '').toLowerCase() === 'aborterror' || String(e?.message || '').includes('upstream_timeout');
        return { ok: false, error: e, isTimeout, cfg };
      }
    };

    let result = await callUpstream(preferredCfg, preferredValid.baseUrl);
    if (!result.ok && result.isTimeout && fallbackCfg && fallbackValid?.ok) {
      result = await callUpstream(fallbackCfg, fallbackValid.baseUrl);
      if (result.ok) result.modelRoute = 'secondary_timeout_fallback_primary';
    }

    if (!result.ok) {
      const msg = result?.error?.message || String(result?.error || 'Upstream request failed');
      console.error('[api/chat] fetch failed:', msg);
      res.status(result.isTimeout ? 504 : 500).json({
        error: result.isTimeout ? `Upstream timeout after ${timeoutMs}ms` : `Upstream fetch failed: ${msg}`,
        hint: 'Secondary is preferred. MiniMax(primary) is used only when secondary times out.',
      });
      return;
    }

    const { upstream, cfg, modelRoute } = result;
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
    res.setHeader('x-ai-model-used', String(cfg.modelId || ''));
    res.setHeader('x-ai-model-route', modelRoute);
    res.setHeader('x-ai-has-image', hasImageInRequest ? '1' : '0');

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
