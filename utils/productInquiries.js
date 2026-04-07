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
  const { data, error } = await client
    .from('product_inquiries')
    .select('id, product_snapshot, whatsapp, demand, status, created_at, updated_at')
    .order('created_at', { ascending: false });
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
