/**
 * Product Schema (JSON-LD) 生成器
 * 为 Google Search Rich Snippets 和 AI 引用提供结构化数据
 * https://schema.org/Product
 */
import React from 'react';

/**
 * 生成 Product Schema JSON-LD 对象
 * @param {Object} product - 商品数据
 * @param {string} productUrl - 商品落地页 URL
 * @returns {Object} Schema.org Product 对象
 */
export function generateProductSchema(product, productUrl) {
  const p = product || {};
  const url = productUrl || p.tangbuyUrl || p.url || '';

  // 价格计算
  const price = Number(p.tangbuyPriceRmb) > 0
    ? Number(p.tangbuyPriceRmb) / 7.2  // RMB to USD approx
    : Number(p.priceRmb) > 0
      ? Number(p.priceRmb) / 7.2
      : null;

  const priceValidUntil = new Date();
  priceValidUntil.setDate(priceValidUntil.getDate() + 30); // 30天有效期

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name || '',
    image: p.image || p.imageFallback || '',
    description: generateDescription(p),
    sku: p.id || '',
    brand: {
      '@type': 'Brand',
      name: extractBrand(p.name) || 'Tangbuy Dropshipping',
    },
    offers: price ? {
      '@type': 'Offer',
      url: url,
      priceCurrency: 'USD',
      price: price.toFixed(2),
      priceValidUntil: priceValidUntil.toISOString().split('T')[0],
      availability: 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: 'Tangbuy Dropshipping',
      },
    } : undefined,
    aggregateRating: Number(p.rating) > 0 ? {
      '@type': 'AggregateRating',
      ratingValue: String(p.rating),
      bestRating: '5',
      worstRating: '1',
    } : undefined,
  };

  // 清理 undefined 字段
  return Object.fromEntries(Object.entries(schema).filter(([_, v]) => v !== undefined));
}

/**
 * 从商品名提取品牌（简单启发式）
 */
function extractBrand(name) {
  if (!name) return '';
  const brandPatterns = [
    /^([A-Z][a-zA-Z0-9]+)\s/,  // 开头大写单词
    /^([A-Z][a-z]+\s+[A-Z][a-z]+)\s/,  // 两个单词品牌
  ];
  for (const pattern of brandPatterns) {
    const match = name.match(pattern);
    if (match) return match[1];
  }
  return '';
}

/**
 * 生成商品描述
 */
function generateDescription(p) {
  const parts = [];
  if (p.name) parts.push(p.name);
  if (p.category) parts.push(`Category: ${p.category}`);
  if (p.platform) parts.push(`Source: ${p.platform}`);
  if (Number(p.sold) > 0) parts.push(`${p.sold} sold monthly`);
  return parts.join('. ');
}

/**
 * React 组件：注入 JSON-LD Script Tag
 * 用法：<ProductSchema product={product} url={productUrl} />
 */
export function ProductSchema({ product, url }) {
  if (!product) return null;

  const schema = generateProductSchema(product, url);
  const scriptContent = JSON.stringify(schema);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: scriptContent }}
    />
  );
}

/**
 * 网站级 Schema (Organization + WebSite)
 * 放在首页或全局 Layout
 */
export function OrganizationSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'Tangbuy Dropshipping',
        url: 'https://tangbuy.com',
        logo: 'https://tangbuy.com/logo.png',
        sameAs: [
          'https://www.tangbuy.com',
        ],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer service',
          availableLanguage: ['English', 'Chinese'],
        },
      },
      {
        '@type': 'WebSite',
        name: 'Tangbuy Dropshipping',
        url: 'https://tangbuy.com',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://tangbuy.com/search?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default ProductSchema;
