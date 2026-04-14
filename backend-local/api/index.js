/**
 * Vercel Serverless：将 Express 应用挂载为单函数（全站路由由 server.mjs 处理）。
 * 使用 .js + package.json "type":"module"，避免部分 Vercel CLI 对 api/*.mjs 解析异常。
 */
import serverless from 'serverless-http';
import { app } from '../server.mjs';

export default serverless(app);
