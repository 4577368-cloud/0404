import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { FACEBOOK_SHARE_OG_IMAGES } from './utils/shareOgImages.js';

/** 每次生成/请求 index.html 时随机选一张 OG 图（生产构建时固定为该次构建的随机结果） */
function randomShareOgImage() {
  return {
    name: 'random-share-og-image',
    transformIndexHtml(html: string) {
      if (!html.includes('__TB_OG_SHARE_IMAGE__')) return html;
      const list = FACEBOOK_SHARE_OG_IMAGES;
      const url = list[Math.floor(Math.random() * list.length)];
      return html.replaceAll('__TB_OG_SHARE_IMAGE__', url);
    },
  };
}

function viteDevHtml() {
  return {
    name: 'vite-dev-html',
    transformIndexHtml(html: string) {
      let result = html;
      result = result.replace(/<script\s+type=["']text\/babel["'][^>]*><\/script>/gi, '');
      result = result.replace(/<script\s+type=["']text\/babel["'][^>]*>[\s\S]*?<\/script>/gi, '');
      result = result.replace(/<script\s+src="[^"]*react\.production\.min\.js[^"]*"[^>]*><\/script>/gi, '');
      result = result.replace(/<script\s+src="[^"]*react-dom\.production\.min\.js[^"]*"[^>]*><\/script>/gi, '');
      result = result.replace(/<script\s+src="[^"]*babel\.min\.js[^"]*"[^>]*><\/script>/gi, '');
      // 入口已在 index.html 中声明；仅当缺失时再注入（避免旧 HTML）
      if (!/src\/main\.jsx/.test(result)) {
        result = result.replace('</body>', '  <script type="module" src="/src/main.jsx"></script>\n</body>');
      }
      return result;
    },
  };
}

function apiChatMiddleware() {
  return {
    name: 'api-chat-middleware',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const baseUrl = process.env.VLLM_BASE_URL;
        const apiKey = process.env.VLLM_API_KEY;
        const modelId = process.env.VLLM_MODEL_ID;

        if (!baseUrl || !apiKey || !modelId) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing VLLM env vars. Create a .env file with VLLM_BASE_URL, VLLM_API_KEY, VLLM_MODEL_ID.' }));
          return;
        }

        // Collect request body
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const rawBody = Buffer.concat(chunks).toString('utf8');

        try {
          const body = rawBody ? JSON.parse(rawBody) : {};
          const payload = { stream: true, max_tokens: 4000, temperature: 0.7, ...body, model: modelId };
          const bodyStr = JSON.stringify(payload);

          const target = new URL(`${baseUrl}/chat/completions`);
          const transport = target.protocol === 'https:' ? https : http;

          // 工作流常用 stream:false + 大 JSON，上游可能超过 2 分钟才返回首字节；默认 20 分钟，可用 VLLM_UPSTREAM_TIMEOUT_MS 覆盖；0=不限制
          const rawTimeout = process.env.VLLM_UPSTREAM_TIMEOUT_MS;
          const upstreamTimeoutMs =
            rawTimeout === '0' || rawTimeout === ''
              ? 0
              : Math.max(0, Number(rawTimeout) || 1_200_000);

          const upstreamReq = transport.request(
            {
              hostname: target.hostname,
              port: target.port || (target.protocol === 'https:' ? 443 : 80),
              path: target.pathname + target.search,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(bodyStr),
              },
              ...(upstreamTimeoutMs > 0 ? { timeout: upstreamTimeoutMs } : {}),
            },
            (upstreamRes) => {
              // 避免读完整响应体时因 socket 空闲被切断（尤其非流式大包）
              try {
                upstreamRes.setTimeout(0);
              } catch (_) {}
              console.log(`[api/chat] upstream ${upstreamRes.statusCode}`);
              res.writeHead(upstreamRes.statusCode ?? 500, {
                'Content-Type': upstreamRes.headers['content-type'] ?? 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
              });
              upstreamRes.pipe(res);
            }
          );

          if (upstreamTimeoutMs > 0) {
            upstreamReq.setTimeout(upstreamTimeoutMs);
          } else {
            upstreamReq.setTimeout(0);
          }

          upstreamReq.on('timeout', () => {
            console.error(`[api/chat] upstream timed out after ${upstreamTimeoutMs || '∞'}ms`);
            upstreamReq.destroy();
            if (!res.headersSent) {
              res.writeHead(504, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  error:
                    'Upstream LLM request timed out. Increase VLLM_UPSTREAM_TIMEOUT_MS in .env or shorten prompts.',
                })
              );
            } else {
              res.end();
            }
          });

          upstreamReq.on('error', (e) => {
            console.error('[api/chat] request error:', e.message);
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: e.message }));
            } else {
              res.end();
            }
          });

          upstreamReq.write(bodyStr);
          upstreamReq.end();
        } catch (e: any) {
          console.error('[api/chat] parse error:', e);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e?.message ?? 'Proxy error' }));
          } else {
            res.end();
          }
        }
      });
    },
  };
}

function apiOssUploadMiddleware() {
  return {
    name: 'api-oss-upload-middleware',
    configureServer(server) {
      server.middlewares.use('/api/oss/upload', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const body = Buffer.concat(chunks);

        const contentType = String(req.headers['content-type'] || '');
        const target = new URL('https://www.tangbuy.com/gateway/resource/common/oss/upload');
        const transport = target.protocol === 'https:' ? https : http;

        const headers: Record<string, string> = {
          'Content-Type': contentType || 'multipart/form-data',
          'Referer': 'https://admin.tangbuy.com/',
          'sec-ch-ua-platform': '\"macOS\"',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        };

        const upstreamReq = transport.request(
          {
            hostname: target.hostname,
            port: target.port || (target.protocol === 'https:' ? 443 : 80),
            path: target.pathname + target.search,
            method: 'POST',
            headers,
            timeout: 120000,
          },
          (upstreamRes) => {
            const ct = upstreamRes.headers['content-type'] ?? 'application/json';
            res.writeHead(upstreamRes.statusCode ?? 500, { 'Content-Type': String(ct) });
            upstreamRes.pipe(res);
          }
        );

        upstreamReq.on('error', (e) => {
          console.error('[api/oss/upload] upstream error:', e.message);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message || 'Upload failed' }));
          } else {
            res.end();
          }
        });

        upstreamReq.write(body);
        upstreamReq.end();
      });
    },
  };
}

/** 解除 Node 对长耗时 API（如非流式 LLM）的默认限制 */
function relaxDevServerTimeouts() {
  return {
    name: 'relax-dev-server-timeouts',
    configureServer(viteServer: { httpServer?: import('http').Server | null }) {
      const apply = () => {
        const s = viteServer.httpServer;
        if (!s) return;
        // Node 18+：允许响应在数分钟后才首字节返回
        (s as import('http').Server & { requestTimeout?: number; headersTimeout?: number }).requestTimeout = 0;
        (s as import('http').Server & { requestTimeout?: number; headersTimeout?: number }).headersTimeout = 0;
      };
      apply();
      viteServer.httpServer?.once('listening', apply);
    },
  };
}

function fixReactDomTExport() {
  return {
    name: 'fix-react-dom-t-export',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        try {
          const url = req.url || '';
          // Fix Vite pre-bundling inconsistency: react-dom_client.js expects
          // `export { require_react_dom as t }` from react-dom.js.
          if (url.startsWith('/node_modules/.vite/deps/react-dom.js')) {
            const filePath = path.resolve(process.cwd(), 'node_modules/.vite/deps/react-dom.js');
            if (!fs.existsSync(filePath)) return next();
            let content = fs.readFileSync(filePath, 'utf8');
            if (!content.includes('export { require_react_dom as t }')) {
              const marker = '//# sourceMappingURL=react-dom.js.map';
              if (content.includes(marker)) {
                content = content.replace(marker, `export { require_react_dom as t };\n\n${marker}`);
              } else {
                content = content + '\nexport { require_react_dom as t };\n';
              }
            }
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.end(content);
            return;
          }
        } catch (_) {}
        next();
      });
    },
  };
}

/** 仅生产构建：去掉 body 里仍指向源码的 script（Vite 已在 head 注入 /assets/*.js）。开发环境绝不能删，否则无入口 → 白屏。 */
function stripDuplicateMainScript() {
  return {
    name: 'strip-duplicate-main-script',
    transformIndexHtml: {
      order: 'post',
      handler(html: string, ctx: { server?: unknown }) {
        if (ctx.server) return html;
        return html.replace(/<script[^>]*src=["']\/src\/main\.jsx["'][^>]*>\s*<\/script>\s*/gi, '');
      },
    },
  };
}

function normalizeViteBase(raw: string | undefined): string {
  if (raw == null || String(raw).trim() === '' || String(raw).trim() === '/') return '/';
  let s = String(raw).trim();
  if (!s.startsWith('/')) s = `/${s}`;
  if (!s.endsWith('/')) s = `${s}/`;
  return s;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);
  const base = normalizeViteBase(env.VITE_BASE_PATH);
  const commitSha = (
    process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.GIT_COMMIT
    || process.env.COMMIT_SHA
    || ''
  ).trim();
  const appCommitShort = commitSha ? commitSha.slice(0, 7) : '';

  return {
    base,
    define: {
      __APP_COMMIT_SHORT__: JSON.stringify(appCommitShort),
    },
    plugins: [
      relaxDevServerTimeouts(),
      fixReactDomTExport(),
      viteDevHtml(),
      randomShareOgImage(),
      apiChatMiddleware(),
      apiOssUploadMiddleware(),
      react({ include: ['**/*.{js,jsx,ts,tsx}'] }),
      stripDuplicateMainScript(),
    ],
    /** 固定预构建入口，减少刷新后出现「504 Outdated Optimize Dep」与黑屏 */
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'marked',
        'dompurify',
        'lucide-react',
        /** 与 auth-js/functions-js 等同链依赖 tslib；根目录需安装 tslib，否则会「Failed to resolve tslib」→ 500 */
        'tslib',
        '@supabase/supabase-js',
      ],
    },
    build: { outDir: 'dist' },
  };
});
