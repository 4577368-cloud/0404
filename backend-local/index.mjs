/**
 * Vercel 官方 Express 模式：根目录默认导出 `app`（见 Vercel Docs → Express）。
 * 勿再放 api/serverless-http 包装，以免 CLI 构建异常。
 */
import { app } from './admin-server.mjs';

export default app;
