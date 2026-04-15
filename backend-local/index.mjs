/**
 * Vercel 官方 Express 模式：根目录默认导出 `app`。
 *
 * 重要：CLI 用正则匹配「入口文件里是否出现 import express」。
 * 若只从 admin-server 间接引用、本文件不出现 express，框架可能检测失败，
 * 构建会走错管线并出现 Cannot read properties of undefined (reading 'fsPath')。
 */

// Vercel Serverless Function entry
import { createServer } from 'http';

// Import the Express app
const { default: app } = await import('./admin-server.mjs');

// Vercel Serverless Function handler
export default function handler(req, res) {
  return app(req, res);
}
