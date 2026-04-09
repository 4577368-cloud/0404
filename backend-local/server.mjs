import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const port = Number(process.env.LOCAL_BACKEND_PORT || 8787);
const allowOrigin = process.env.LOCAL_BACKEND_ORIGIN || 'http://localhost:5173';
const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error('[backend-local] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(cors({ origin: allowOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

function normalizeTrendsPayload(data) {
  if (Array.isArray(data)) return data;
  if (data == null) return [];
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'backend-local' });
});

app.get('/admin/api/overview', async (_req, res) => {
  try {
    const { data, error } = await supabase.rpc('admin_overview');
    if (error) {
      console.error('[admin] admin_overview:', error.message, error);
      return res.status(500).json({ ok: false, error: error.message, code: error.code });
    }
    return res.json({ ok: true, data });
  } catch (e) {
    console.error('[admin] /admin/api/overview:', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/admin/api/trends', async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    const { data, error } = await supabase.rpc('admin_trends', { p_days: days });
    if (error) {
      console.error('[admin] admin_trends:', error.message, error);
      return res.status(500).json({ ok: false, error: error.message, code: error.code });
    }
    return res.json({ ok: true, data: normalizeTrendsPayload(data) });
  } catch (e) {
    console.error('[admin] /admin/api/trends:', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/admin/api/conversation-usage', async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    const { data, error } = await supabase.rpc('admin_conversation_usage', { p_days: days });
    if (error) {
      console.error('[admin] admin_conversation_usage:', error.message, error);
      return res.status(500).json({ ok: false, error: error.message, code: error.code });
    }
    return res.json({ ok: true, data: normalizeTrendsPayload(data) });
  } catch (e) {
    console.error('[admin] /admin/api/conversation-usage:', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/admin/api/share-insights', async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    const { data, error } = await supabase.rpc('admin_share_insights', { p_days: days });
    if (error) {
      console.error('[admin] admin_share_insights:', error.message, error);
      return res.status(500).json({ ok: false, error: error.message, code: error.code });
    }
    const payload = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    return res.json({
      ok: true,
      data: {
        summary: payload.summary || {},
        funnel: Array.isArray(payload.funnel) ? payload.funnel : [],
        daily: Array.isArray(payload.daily) ? payload.daily : [],
      },
    });
  } catch (e) {
    console.error('[admin] /admin/api/share-insights:', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/admin/api/prompt-logs', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 20));
    const email = String(req.query.email || '').trim();
    const { data, error } = await supabase.rpc('admin_prompt_logs_by_email', {
      p_email: email,
      p_page: page,
      p_page_size: pageSize,
    });
    if (error) {
      console.error('[admin] admin_prompt_logs_by_email:', error.message, error);
      return res.status(500).json({ ok: false, error: error.message, code: error.code });
    }
    if (data && typeof data === 'object' && data.error) {
      return res.status(400).json({ ok: false, error: data.message || data.error, code: data.error, data });
    }
    return res.json({ ok: true, data });
  } catch (e) {
    console.error('[admin] /admin/api/prompt-logs:', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/admin/api/share-list', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.max(1, Math.min(50, Number(req.query.pageSize) || 20));
    const keyword = String(req.query.keyword || '').trim();
    const { data, error } = await supabase.rpc('admin_share_list', {
      p_page: page,
      p_page_size: pageSize,
      p_keyword: keyword,
    });
    if (error) {
      console.error('[admin] admin_share_list:', error.message, error);
      return res.status(500).json({ ok: false, error: error.message, code: error.code });
    }
    const payload = data && typeof data === 'object' ? data : {};
    let rows = payload.rows;
    if (typeof rows === 'string') {
      try {
        const parsed = JSON.parse(rows);
        rows = Array.isArray(parsed) ? parsed : [];
      } catch {
        rows = [];
      }
    } else if (!Array.isArray(rows)) {
      rows = [];
    }
    return res.json({
      ok: true,
      data: {
        page: payload.page ?? page,
        page_size: payload.page_size ?? pageSize,
        total: payload.total ?? 0,
        rows,
      },
    });
  } catch (e) {
    console.error('[admin] /admin/api/share-list:', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/admin/api/url-inputs', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 20));
    const keyword = String(req.query.keyword || '').trim();
    const { data, error } = await supabase.rpc('admin_url_inputs', {
      p_page: page,
      p_page_size: pageSize,
      p_keyword: keyword,
    });
    if (error) {
      console.error('[admin] admin_url_inputs:', error.message, error);
      return res.status(500).json({ ok: false, error: error.message, code: error.code });
    }
    const payload = data && typeof data === 'object' ? data : {};
    let rows = payload.rows;
    if (typeof rows === 'string') {
      try {
        const parsed = JSON.parse(rows);
        rows = Array.isArray(parsed) ? parsed : [];
      } catch {
        rows = [];
      }
    } else if (!Array.isArray(rows)) {
      rows = [];
    }
    return res.json({
      ok: true,
      data: {
        page: payload.page ?? page,
        page_size: payload.page_size ?? pageSize,
        total: payload.total ?? 0,
        rows,
      },
    });
  } catch (e) {
    console.error('[admin] /admin/api/url-inputs:', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/**
 * When RPC admin_users fails (SQL not applied / schema drift), use Auth Admin API + user_stats.
 */
async function listUsersFallback({ page, pageSize, keyword, vipOnly }) {
  const vipMap = new Map();
  const { data: statsRows, error: statsErr } = await supabase.from('user_stats').select('user_id, is_vip');
  if (statsErr) {
    console.warn('[admin] user_stats read (fallback):', statsErr.message);
  }
  for (const row of statsRows || []) {
    if (row?.user_id) vipMap.set(String(row.user_id), !!row.is_vip);
  }

  const allUsers = [];
  let p = 1;
  const perFetch = 200;
  while (p <= 200) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: p, perPage: perFetch });
    if (error) throw new Error(error.message);
    const batch = data?.users || [];
    if (batch.length === 0) break;
    allUsers.push(...batch);
    if (batch.length < perFetch) break;
    p += 1;
  }

  const kw = keyword.toLowerCase();
  let rows = allUsers
    .filter((u) => !u.is_anonymous)
    .map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      is_vip: vipMap.get(String(u.id)) === true,
    }))
    .filter((r) => {
      if (vipOnly && !r.is_vip) return false;
      if (!kw) return true;
      const em = String(r.email || '').toLowerCase();
      return em.includes(kw) || String(r.id).toLowerCase().includes(kw);
    })
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const total = rows.length;
  const start = (page - 1) * pageSize;
  rows = rows.slice(start, start + pageSize);

  return { page, page_size: pageSize, total, rows, _source: 'auth_admin_fallback' };
}

app.get('/admin/api/users', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 20));
    const keyword = String(req.query.keyword || '').trim();
    const vipOnly = String(req.query.vipOnly || '') === '1' || String(req.query.vipOnly || '').toLowerCase() === 'true';

    const { data, error } = await supabase.rpc('admin_users', {
      p_keyword: keyword,
      p_page: page,
      p_page_size: pageSize,
      p_vip_only: vipOnly,
    });

    if (!error) {
      return res.json({ ok: true, data });
    }

    console.warn('[admin] admin_users RPC failed, using Auth Admin fallback:', error.message);
    const fallback = await listUsersFallback({ page, pageSize, keyword, vipOnly });
    return res.json({ ok: true, data: fallback });
  } catch (e) {
    console.error('[admin] /admin/api/users:', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.use('/admin', express.static(path.join(__dirname, 'public')));

/**
 * Supabase RPC proxy (local-only)
 * body: { args?: Record<string, any> }
 */
app.post('/supabase/rpc/:fn', async (req, res) => {
  const fn = String(req.params.fn || '').trim();
  if (!fn) return res.status(400).json({ ok: false, error: 'Missing RPC function name' });
  const args = req.body?.args && typeof req.body.args === 'object' ? req.body.args : {};
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, data });
});

/**
 * Supabase query proxy (local-only)
 * body:
 * {
 *   table: string,
 *   select?: string,
 *   filters?: [{ column, op, value }],
 *   order?: { column, ascending?: boolean },
 *   limit?: number,
 *   single?: boolean
 * }
 */
app.post('/supabase/query', async (req, res) => {
  const body = req.body || {};
  const table = String(body.table || '').trim();
  if (!table) return res.status(400).json({ ok: false, error: 'table is required' });

  const select = String(body.select || '*');
  let q = supabase.from(table).select(select);

  const filters = Array.isArray(body.filters) ? body.filters : [];
  for (const f of filters) {
    const column = String(f?.column || '').trim();
    const op = String(f?.op || 'eq').trim();
    const value = f?.value;
    if (!column) continue;
    if (typeof q[op] === 'function') {
      q = q[op](column, value);
    }
  }

  if (body.order?.column) {
    q = q.order(String(body.order.column), { ascending: body.order.ascending !== false });
  }
  if (Number.isFinite(body.limit) && Number(body.limit) > 0) {
    q = q.limit(Number(body.limit));
  }
  if (body.single) {
    q = q.single();
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, data });
});

/**
 * Supabase upsert proxy (local-only)
 * body: { table: string, rows: object|object[], onConflict?: string }
 */
app.post('/supabase/upsert', async (req, res) => {
  const table = String(req.body?.table || '').trim();
  const rows = req.body?.rows;
  const onConflict = String(req.body?.onConflict || '').trim();
  if (!table) return res.status(400).json({ ok: false, error: 'table is required' });
  if (!rows || (Array.isArray(rows) && rows.length === 0)) {
    return res.status(400).json({ ok: false, error: 'rows is required' });
  }

  const { data, error } = await supabase
    .from(table)
    .upsert(rows, onConflict ? { onConflict } : undefined)
    .select('*');
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, data });
});

app.listen(port, () => {
  console.log(`[backend-local] running at http://localhost:${port}`);
});
