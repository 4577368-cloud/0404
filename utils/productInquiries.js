import { supabase } from './supabaseClient.js';

/** PostgREST：表未创建或未 reload schema 时常见 404 / PGRST205 */
export function isProductInquiriesTableMissingError(error) {
  if (!error) return false;
  const msg = String(error.message || error.details || '');
  const code = String(error.code || '');
  if (code === 'PGRST205' || code === '42P01') return true;
  if (/could not find the table/i.test(msg) && /product_inquiries/i.test(msg)) return true;
  if (/schema cache/i.test(msg) && /product_inquiries/i.test(msg)) return true;
  return false;
}

export function productToInquirySnapshot(p) {
  const x = p || {};
  return {
    id: x.id,
    name: x.name,
    image: x.image,
    imageFallback: x.imageFallback,
    url: x.url,
    tangbuyUrl: x.tangbuyUrl,
    platform: x.platform,
    priceRmb: x.priceRmb,
    tangbuyPriceRmb: x.tangbuyPriceRmb,
    sold: x.sold,
    rating: x.rating,
    categoryCn: x.categoryCn,
    categoryEn: x.categoryEn,
  };
}

export function resolveInquiryPrimaryLink(productSnapshot) {
  const snap = productSnapshot || {};
  const candidates = [snap.tangbuyUrl, snap.url, snap.image, snap.imageFallback];
  for (const c of candidates) {
    const x = String(c || '').trim();
    if (/^https?:\/\//i.test(x)) return x;
  }
  return '';
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ product: object, whatsapp: string, demand: string, userEmail: string | null, userId: string }} row
 */
export async function submitProductInquiry(client, { product, whatsapp, demand, userEmail, userId }) {
  if (!client || !userId) return { ok: false, error: 'not_authenticated' };
  const snap = productToInquirySnapshot(product);
  const { data, error } = await client
    .from('product_inquiries')
    .insert({
      user_id: userId,
      user_email: userEmail || null,
      product_snapshot: snap,
      whatsapp: String(whatsapp || '').trim(),
      demand: String(demand || '').trim(),
      status: 'submitted',
    })
    .select('id')
    .maybeSingle();
  if (error) {
    if (isProductInquiriesTableMissingError(error)) {
      return { ok: false, error: 'TABLE_MISSING', missingTable: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 */
export async function fetchMyProductInquiries(client) {
  if (!client) return { rows: [], error: 'no_client' };
  let { data, error } = await client
    .from('product_inquiries')
    .select('id, product_snapshot, whatsapp, demand, status, reply_content, reply_at, replied_by, reply_messages, reply_count, user_seen_reply_count, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error && /reply_messages|reply_count|user_seen_reply_count/i.test(String(error.message || ''))) {
    const fallback = await client
      .from('product_inquiries')
      .select('id, product_snapshot, whatsapp, demand, status, reply_content, reply_at, replied_by, created_at, updated_at')
      .order('created_at', { ascending: false });
    data = (fallback.data || []).map((r) => ({
      ...r,
      reply_messages: r.reply_content ? [{ content: r.reply_content, at: r.reply_at, by: r.replied_by }] : [],
      reply_count: r.reply_content ? 1 : 0,
      user_seen_reply_count: 0,
    }));
    error = fallback.error;
  }
  if (error) {
    const missingTable = isProductInquiriesTableMissingError(error);
    return {
      rows: [],
      error: missingTable ? 'TABLE_MISSING' : error.message,
      missingTable,
    };
  }
  return { rows: data || [], error: null, missingTable: false };
}

/**
 * Count unread inquiry replies for current user.
 * Unread = max(reply_count, reply_messages length) - user_seen_reply_count.
 */
export async function fetchMyInquiryUnreadCount(client) {
  if (!client) return { count: 0, error: 'no_client' };
  let { data, error } = await client
    .from('product_inquiries')
    .select('status, reply_count, user_seen_reply_count, reply_messages')
    .eq('status', 'replied');
  if (error && /reply_messages|reply_count|user_seen_reply_count/i.test(String(error.message || ''))) {
    const fallback = await client
      .from('product_inquiries')
      .select('status, reply_content')
      .eq('status', 'replied');
    data = (fallback.data || []).map((r) => ({
      status: r.status,
      reply_count: r.reply_content ? 1 : 0,
      user_seen_reply_count: 0,
      reply_messages: r.reply_content ? [{}] : [],
    }));
    error = fallback.error;
  }
  if (error) {
    const missingTable = isProductInquiriesTableMissingError(error);
    return { count: 0, error: missingTable ? 'TABLE_MISSING' : error.message, missingTable };
  }
  const rows = Array.isArray(data) ? data : [];
  const count = rows.reduce((sum, r) => {
    const replyCount = Number(r?.reply_count) || (Array.isArray(r?.reply_messages) ? r.reply_messages.length : 0);
    const seen = Math.max(0, Number(r?.user_seen_reply_count) || 0);
    return sum + Math.max(0, replyCount - seen);
  }, 0);
  return { count, error: null, missingTable: false };
}

export async function markMyInquiryRepliesSeen(client) {
  if (!client) return { ok: false, error: 'no_client' };
  const { data, error } = await client.rpc('mark_my_inquiry_replies_seen');
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, affected: Number(data) || 0 };
}
