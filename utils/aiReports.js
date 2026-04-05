/**
 * AI Report Storage and Naming Utilities
 * Handles intelligent report naming with dates and persistent storage
 */

const AI_REPORTS_STORAGE_KEY = 'tb_ai_reports';

const CATEGORY_ZH_TO_EN = {
  '美妆个护': 'Beauty & Personal Care', '美妆': 'Beauty', '个护': 'Personal Care',
  '护肤': 'Skincare', '彩妆': 'Makeup', '口红': 'Lipstick', '粉底': 'Foundation',
  '洗浴与身体护理': 'Bath & Body', '身体霜': 'Body Cream', '乳': 'Lotion',
  '服饰': 'Apparel', '服装': 'Clothing', '女装': "Women's Fashion", '男装': "Men's Fashion",
  '鞋类': 'Footwear', '鞋': 'Shoes', '运动鞋': 'Sneakers',
  '箱包': 'Bags', '包': 'Bags', '手提包': 'Handbag', '背包': 'Backpack',
  '电子': 'Electronics', '手机': 'Phone', '耳机': 'Headphones', '数码': 'Digital',
  '家居': 'Home', '家具': 'Furniture', '装饰': 'Decor', '收纳': 'Storage',
  '玩具': 'Toys', '母婴': 'Baby', '宠物': 'Pet', '运动': 'Sports',
  '食品': 'Food', '零食': 'Snacks', '文具': 'Stationery', '汽车': 'Auto',
  '工具': 'Tools', '珠宝': 'Jewelry', '首饰': 'Jewelry', '饰品': 'Accessories',
  '户外': 'Outdoor', '健身': 'Fitness', '厨房': 'Kitchen', '办公': 'Office',
};
const CATEGORY_ZH_TO_FR = {
  '美妆个护': 'Beauté & Soins', '美妆': 'Beauté', '个护': 'Soins',
  '护肤': 'Soins de la peau', '服饰': 'Vêtements', '电子': 'Électronique',
  '家居': 'Maison', '玩具': 'Jouets', '运动': 'Sports', '食品': 'Alimentation',
  '洗浴与身体护理': 'Bain & Corps', '身体霜': 'Crème corporelle', '乳': 'Lotion',
};
const CATEGORY_ZH_TO_ES = {
  '美妆个护': 'Belleza y Cuidado', '美妆': 'Belleza', '个护': 'Cuidado personal',
  '护肤': 'Cuidado de la piel', '服饰': 'Ropa', '电子': 'Electrónica',
  '家居': 'Hogar', '玩具': 'Juguetes', '运动': 'Deportes', '食品': 'Alimentos',
  '洗浴与身体护理': 'Baño y Cuerpo', '身体霜': 'Crema corporal', '乳': 'Loción',
};

function translateCategory(zhCategory, lang) {
  if (!zhCategory || lang === 'zh') return zhCategory;
  const map = lang === 'fr' ? CATEGORY_ZH_TO_FR : lang === 'es' ? CATEGORY_ZH_TO_ES : CATEGORY_ZH_TO_EN;
  if (map[zhCategory]) return map[zhCategory];
  const parts = zhCategory.split(/[_／/、,，]+/).map(p => p.trim()).filter(Boolean);
  const translated = parts.map(p => map[p] || p);
  const hasTranslation = translated.some((t, i) => t !== parts[i]);
  return hasTranslation ? translated.join(' / ') : zhCategory;
}

/**
 * Generate report name using product name (abbreviated) + translated category + date
 */
export function generateReportName(productData, uiLang = 'zh') {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

  let productName = (productData?.name || '').trim();
  if (productName.length > 30) {
    productName = productName.slice(0, 28) + '…';
  }

  const rawCategory = (productData?.category || '').replace(/类目|分类|category/gi, '').trim();
  const category = translateCategory(rawCategory, uiLang);

  const label = productName || category || (uiLang === 'zh' ? '商品' : 'Product');

  if (uiLang === 'zh') {
    return `${label} Report ${dateStr}`;
  }
  return `${label} Report ${dateStr}`;
}

/**
 * Load AI reports from localStorage
 */
export function loadAIReports() {
  try {
    const raw = localStorage.getItem(AI_REPORTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Sort by createdAt descending (newest first)
        return parsed.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
    }
  } catch (_) {}
  return [];
}

/**
 * Save AI reports to localStorage
 */
export function saveAIReports(reports) {
  try {
    localStorage.setItem(AI_REPORTS_STORAGE_KEY, JSON.stringify(reports));
  } catch (_) {}
}

/**
 * Create a new AI report
 */
export function createAIReport(productData, targetMarket, stepOutputs, uiLang = 'zh') {
  const report = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: generateReportName(productData, uiLang),
    createdAt: new Date().toISOString(),
    productData,
    targetMarket,
    stepOutputs,
    status: 'completed',
    version: '2.0',
  };
  
  // Save to storage
  const existing = loadAIReports();
  saveAIReports([report, ...existing]);
  
  return report;
}

/**
 * Delete an AI report
 */
export function deleteAIReport(reportId) {
  const existing = loadAIReports();
  const filtered = existing.filter(r => r.id !== reportId);
  saveAIReports(filtered);
}

/**
 * Get a single report by ID
 */
export function getAIReportById(reportId) {
  const reports = loadAIReports();
  return reports.find(r => r.id === reportId);
}

/**
 * Update an existing report
 */
export function updateAIReport(reportId, updates) {
  const existing = loadAIReports();
  const updated = existing.map(r => 
    r.id === reportId ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r
  );
  saveAIReports(updated);
}

/**
 * Format date for display
 */
export function formatReportDate(dateString, uiLang = 'zh') {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  if (uiLang === 'zh') {
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  } else {
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
}

/**
 * Extract executive summary from report data
 */
export function getExecutiveSummary(report) {
  const finalStep = report?.stepOutputs?.find(s => s.step === 9);
  return finalStep?.data?.executive_summary || {};
}

export { translateCategory };

export default {
  generateReportName,
  translateCategory,
  loadAIReports,
  saveAIReports,
  createAIReport,
  deleteAIReport,
  getAIReportById,
  updateAIReport,
  formatReportDate,
  getExecutiveSummary,
  AI_REPORTS_STORAGE_KEY,
};
