/**
 * Product search utilities
 * Handles product catalog loading, normalization, and search logic
 */

const TANGBUY_DISPLAY_MULT = 1.7;
const DROPSHIPPING_PREFIX = 'https://dropshipping.tangbuy.com/zh-CN/product/';

function base64EncodeUtf8(str) {
  try { return btoa(unescape(encodeURIComponent(String(str)))); }
  catch (_) { return btoa(String(str)); }
}

function toDropshippingUrl(sourceUrl) {
  if (!sourceUrl) return '';
  const s = String(sourceUrl).trim();
  if (!s) return '';
  if (/^https?:\/\/dropshipping\.tangbuy\.com\//i.test(s)) return s;
  return s.startsWith(DROPSHIPPING_PREFIX) ? s : DROPSHIPPING_PREFIX + base64EncodeUtf8(s);
}

/** 默认与 `4577368-cloud/agent` 仓库 `main` 根目录 JSON 对齐；可用 `VITE_DATA_REMOTE_BASE` 覆盖，设为空字符串可关闭远程回退 */
const DEFAULT_DATA_REMOTE_BASE = 'https://raw.githubusercontent.com/4577368-cloud/agent/main';

function getDataRemoteBase() {
  const env = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DATA_REMOTE_BASE;
  if (env === '') return '';
  const s = env != null ? String(env).trim() : '';
  if (s !== '') return s.replace(/\/?$/, '');
  return DEFAULT_DATA_REMOTE_BASE;
}

/** `data/foo.json` / `./data/foo.json` / `/data/foo.json` → `foo.json`（与 GitHub 仓库根目录文件名一致） */
function pathToDataFilename(p) {
  return String(p || '')
    .trim()
    .replace(/^\.\//, '')
    .replace(/^\/?data\//i, '');
}

/** 本地优先顺序：带 Vite BASE_URL、相对路径（供 tryFetchJson / 远程回退文件名解析） */
export function getDataJsonFetchPaths(filename) {
  const safe = String(filename || '').replace(/^\/+/, '');
  const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL != null ? String(import.meta.env.BASE_URL) : '/';
  const prefix = base.endsWith('/') ? `${base}data/` : `${base}/data/`;
  return [`${prefix}${safe}`, `data/${safe}`, `./data/${safe}`, `/data/${safe}`];
}

function buildTryFetchUrlOrder(paths) {
  const list = Array.isArray(paths) ? paths : [];
  const localOrdered = [];
  const seenLocal = new Set();
  for (const p of list) {
    const u = String(p || '').trim();
    if (!u || seenLocal.has(u)) continue;
    seenLocal.add(u);
    localOrdered.push(u);
  }
  const base = getDataRemoteBase();
  if (!base) return localOrdered;
  const seenRemote = new Set();
  const out = [...localOrdered];
  for (const p of localOrdered) {
    const name = pathToDataFilename(p);
    if (!name || seenRemote.has(name)) continue;
    seenRemote.add(name);
    // 与常见 GitHub 布局一致：仓库根目录 或 仓库下 data/ 子目录
    out.push(`${base}/${name}`);
    out.push(`${base}/data/${name}`);
  }
  return out;
}

function fetchUrlWithBust(u) {
  const sep = u.includes('?') ? '&' : '?';
  return `${u}${sep}cb=${Date.now()}`;
}

// ── Chinese → English translation dictionary for product search ──
export const ZH_EN_DICT = [
  // Gender / audience
  ['女士', 'women'], ['女性', 'women'], ['女装', 'women'], ['女款', 'women'], ['女式', 'women'], ['女孩', 'girl'],
  ['男士', 'men'], ['男性', 'men'], ['男装', 'men'], ['男款', 'men'], ['男式', 'men'], ['男孩', 'boy'],
  // Outerwear
  ['外套', 'coat jacket'], ['夹克', 'jacket'], ['羽绒服', 'puffer down jacket'], ['羽绒', 'puffer down'],
  ['卫衣', 'hoodie sweatshirt'], ['毛衣', 'sweater knit'], ['开衫', 'cardigan'], ['西装', 'blazer suit'],
  ['马甲', 'vest'], ['大衣', 'overcoat coat'], ['风衣', 'trench coat'], ['棉服', 'padded jacket'],
  // Tops
  ['衬衫', 'shirt blouse'], ['上衣', 'top blouse'], ['T恤', 't-shirt tee'], ['背心', 'tank top vest'],
  ['polo衫', 'polo shirt'], ['衬衣', 'shirt'], ['短袖', 'short sleeve'],
  // Bottoms
  ['裤子', 'pants trousers'], ['长裤', 'pants trousers'], ['短裤', 'shorts'], ['牛仔裤', 'jeans denim'],
  ['休闲裤', 'casual pants'], ['运动裤', 'jogger sweatpants'], ['打底裤', 'leggings'], ['阔腿裤', 'wide leg pants'],
  ['西裤', 'dress pants slacks'], ['工装裤', 'cargo pants'], ['半身裙', 'skirt'],
  // Dresses
  ['连衣裙', 'dress'], ['裙子', 'dress skirt'], ['裙', 'dress skirt'], ['长裙', 'maxi dress long skirt'],
  ['短裙', 'mini skirt'], ['吊带裙', 'slip dress'],
  // Shoes
  ['鞋子', 'shoe'], ['鞋', 'shoe'], ['运动鞋', 'sneaker athletic shoe'], ['靴子', 'boot'], ['靴', 'boot'],
  ['凉鞋', 'sandal'], ['拖鞋', 'slipper'], ['高跟鞋', 'high heel'], ['平底鞋', 'flat shoe loafer'],
  ['帆布鞋', 'canvas shoe'], ['皮鞋', 'leather shoe'], ['板鞋', 'sneaker'],
  // Bags
  ['包包', 'bag handbag'], ['包', 'bag'], ['手提包', 'handbag tote'], ['双肩包', 'backpack'],
  ['背包', 'backpack'], ['钱包', 'wallet'], ['斜挎包', 'crossbody bag'], ['单肩包', 'shoulder bag'],
  ['手拿包', 'clutch'], ['行李箱', 'luggage suitcase'],
  // Accessories
  ['手表', 'watch'], ['项链', 'necklace'], ['耳环', 'earring'], ['戒指', 'ring'], ['手链', 'bracelet'],
  ['饰品', 'jewelry accessory'], ['帽子', 'hat cap'], ['围巾', 'scarf'], ['太阳镜', 'sunglasses'],
  ['墨镜', 'sunglasses'], ['腰带', 'belt'], ['领带', 'tie'], ['发饰', 'hair accessory'],
  ['头饰', 'hair accessory headband'], ['头发配饰', 'hair accessory clip headband'], ['发卡', 'hair clip barrette'],
  ['发夹', 'hair clip'], ['抓夹', 'claw clip'], ['发箍', 'headband'], ['发圈', 'scrunchie hair tie'],
  ['发绳', 'hair tie'], ['发带', 'hair band ribbon'], ['头花', 'hair accessory'], ['鲨鱼夹', 'claw clip'],
  // Electronics
  ['手机壳', 'phone case'], ['手机', 'phone'], ['耳机', 'headphone earphone earbud'], ['充电器', 'charger'],
  ['数据线', 'cable cord'], ['音箱', 'speaker'], ['数码', 'electronic digital'], ['平板', 'tablet'],
  ['键盘', 'keyboard'], ['鼠标', 'mouse'], ['电脑', 'computer laptop'],
  // Home
  ['家居', 'home decor'], ['厨房', 'kitchen'], ['灯', 'lamp light'], ['枕头', 'pillow'], ['毯子', 'blanket'],
  ['毛巾', 'towel'], ['收纳', 'storage organizer'], ['装饰', 'decor decoration'], ['窗帘', 'curtain'],
  ['地毯', 'rug carpet'], ['花瓶', 'vase'], ['杯子', 'cup mug'], ['餐具', 'tableware cutlery'],
  // Beauty
  ['美妆', 'beauty makeup'], ['护肤', 'skincare'], ['口红', 'lipstick'], ['化妆', 'makeup cosmetic'],
  ['面膜', 'face mask'], ['粉底', 'foundation'], ['眼影', 'eyeshadow'], ['香水', 'perfume'],
  ['假睫毛', 'false eyelash eyelashes'], ['睫毛', 'eyelash lash lashes'],
  ['防晒', 'sunscreen'], ['洗面奶', 'cleanser'], ['精华', 'serum essence'],
  // Health Food
  ['保健食品', 'health food supplement'], ['保健', 'health wellness'], ['营养', 'nutrition nutrient'],
  ['维生素', 'vitamin'], ['补充剂', 'supplement additive'], ['蛋白', 'protein'], ['有机', 'organic'],
  ['天然', 'natural'], ['膳食', 'dietary meal'], ['健康食品', 'health food'], ['养生', 'wellness health'],
  ['滋补', 'nutritional tonic'], ['食品', 'food'], ['食品类', 'food category'],
  // Toys
  ['玩具', 'toy'], ['游戏', 'game'], ['公仔', 'figure doll'], ['积木', 'building block lego'],
  ['模型', 'model figure'], ['毛绒', 'plush stuffed'],
  // Pet
  ['宠物', 'pet'], ['猫', 'cat'], ['狗', 'dog'], ['宠物用品', 'pet supplies'],
  // Sports
  ['运动', 'sport athletic fitness'], ['健身', 'fitness gym workout'], ['瑜伽', 'yoga'],
  ['户外', 'outdoor camping hiking'], ['自行车', 'bicycle bike'], ['跑步', 'running'],
  // Kids / Baby
  ['婴儿', 'baby infant'], ['儿童', 'kid children'], ['宝宝', 'baby toddler'], ['童装', 'kids clothing'],
  // Maternity / postpartum — 用货源检索常用英文，避免「产褥→lochia」等医学词进搜索框
  ['一次性产褥垫', 'disposable underpad'],
  ['产后护理套装', 'postpartum care kit'],
  ['产妇卫生巾', 'maternity sanitary pad'],
  ['私处冲洗器', 'peri bottle'],
  ['会阴冲洗器', 'peri bottle'],
  ['暖宫贴', 'uterus warming patch'],
  ['产褥垫', 'disposable underpad'],
  ['防溢乳垫', 'nursing breast pads'],
  ['一次性内裤', 'disposable postpartum underwear'],
  ['骨盆带', 'postpartum pelvic support belt'],
  ['月子服', 'maternity pajamas'],
  ['产后', 'postpartum'], ['产妇', 'postpartum'], ['产后护理', 'postpartum care'], ['月子', 'postpartum recovery'],
  ['哺乳', 'breastfeeding nursing'], ['吸奶器', 'breast pump'], ['收腹带', 'postpartum belly band'], ['妊娠纹', 'stretch mark cream'],
  ['护理垫', 'disposable underpad'], ['母婴', 'mother baby maternity'],
  // Swimwear / Underwear
  ['泳衣', 'swimsuit swimwear'], ['泳装', 'swimwear'], ['比基尼', 'bikini'],
  ['内衣', 'lingerie underwear'], ['内裤', 'panties underwear briefs'], ['文胸', 'bra'],
  // Material / style modifiers
  ['真皮', 'leather genuine'], ['棉', 'cotton'], ['丝绸', 'silk'], ['羊毛', 'wool'],
  ['复古', 'vintage retro'], ['简约', 'minimalist simple'], ['时尚', 'fashion trendy'],
  ['新款', 'new arrival'], ['爆款', 'best seller hot trending'], ['潮流', 'trendy streetwear'],
];

export function translateZhToEn(text) {
  if (!text || !/[\u4e00-\u9fff]/.test(text)) return [];
  const result = [];
  for (const [zh, en] of ZH_EN_DICT) {
    if (text.includes(zh)) {
      result.push(...en.split(/\s+/));
    }
  }
  return [...new Set(result)];
}

// ── Specific product → category mapping for intelligent matching ──
// Maps specific product names/styles to their parent category labels
export const PRODUCT_TO_CATEGORY_MAP = [
  // 太阳镜细分
  { patterns: ['y2k', 'narrow', 'rectangular', 'slim', 'tiny', 'small frame', '窄框', '窄边', '小框', 'Y2K', '复古小框', '窄矩形'], category: 'accessories', subCategory: 'sunglasses' },
  { patterns: ['cat.?eye', '猫眼', '复古猫眼', 'cat-eye', 'cateye'], category: 'accessories', subCategory: 'sunglasses' },
  { patterns: ['aviator', '飞行员', '蛤蟆镜', '蛤蟆'], category: 'accessories', subCategory: 'sunglasses' },
  { patterns: ['oversized', '大框', '超大', '复古大框'], category: 'accessories', subCategory: 'sunglasses' },
  { patterns: ['polarized', '偏光', '偏振'], category: 'accessories', subCategory: 'sunglasses' },
  { patterns: ['sport.*sunglass', '运动.*太阳镜', '运动.*墨镜', 'wraparound'], category: 'accessories', subCategory: 'sunglasses' },
  { patterns: ['metal.*sunglass', '金属.*太阳镜', '金属.*墨镜', 'rimless', '无框'], category: 'accessories', subCategory: 'sunglasses' },
  // 发饰细分
  { patterns: ['scrunchie', '大肠发圈', '发圈', '头绳'], category: 'accessories', subCategory: 'hair' },
  { patterns: ['claw.?clip', '抓夹', '鲨鱼夹', '发抓', '大发夹'], category: 'accessories', subCategory: 'hair' },
  { patterns: ['headband', '发箍', '头箍', '发带'], category: 'accessories', subCategory: 'hair' },
  { patterns: ['hair.?clip', '发夹', '发卡', '边夹', '刘海夹', '一字夹'], category: 'accessories', subCategory: 'hair' },
  // 帽子细分
  { patterns: ['baseball.?cap', '棒球帽', '鸭舌帽'], category: 'accessories', subCategory: 'hat' },
  { patterns: ['bucket.?hat', '渔夫帽', '盆帽'], category: 'accessories', subCategory: 'hat' },
  { patterns: ['straw.?hat', '草帽', '草编帽', '沙滩帽'], category: 'accessories', subCategory: 'hat' },
  { patterns: ['sun.?hat', '遮阳帽', '太阳帽', '防晒帽', '空顶帽'], category: 'accessories', subCategory: 'hat' },
  { patterns: ['beanie', '针织帽', '毛线帽', '冷帽'], category: 'accessories', subCategory: 'hat' },
  // 首饰细分
  { patterns: ['hoop.?earring', '圈形耳环', '大圈耳环', 'hoop'], category: 'accessories', subCategory: 'jewelry' },
  { patterns: ['pendant', '吊坠', '项链坠'], category: 'accessories', subCategory: 'jewelry' },
  { patterns: ['chain', '链条', '链', '项链'], category: 'accessories', subCategory: 'jewelry' },
  { patterns: ['ring', '戒指', '指环'], category: 'accessories', subCategory: 'jewelry' },
  { patterns: ['bracelet', '手链', '手镯', '手环'], category: 'accessories', subCategory: 'jewelry' },
  // 包包细分
  { patterns: ['tote', '托特包', '手提袋', '购物袋'], category: 'bags', subCategory: 'tote' },
  { patterns: ['crossbody', '斜挎包', '单肩包'], category: 'bags', subCategory: 'crossbody' },
  { patterns: ['backpack', '双肩包', '背包'], category: 'bags', subCategory: 'backpack' },
  { patterns: ['clutch', '手拿包', '手包'], category: 'bags', subCategory: 'clutch' },
  { patterns: ['fanny.?pack', '腰包', '胸包'], category: 'bags', subCategory: 'fanny_pack' },
  // 鞋类细分
  { patterns: ['sneaker', '运动鞋', '球鞋', '跑鞋', '老爹鞋'], category: 'shoes', subCategory: 'sneakers' },
  { patterns: ['sandal', '凉鞋', '拖鞋', '凉拖', '人字拖'], category: 'shoes', subCategory: 'sandals' },
  { patterns: ['boot', '靴', '短靴', '长靴', '马丁靴', '切尔西靴'], category: 'shoes', subCategory: 'boots' },
  { patterns: ['heel', '高跟鞋', '细高跟', '粗跟'], category: 'shoes', subCategory: 'heels' },
  { patterns: ['flat', '平底鞋', '芭蕾舞鞋', '乐福鞋', '豆豆鞋'], category: 'shoes', subCategory: 'flats' },
  // 服装细分
  { patterns: ['crop.?top', 'crop', '露脐', '短上衣', '抹胸', '背心'], category: 'tops', subCategory: 'crop_top' },
  { patterns: ['blazer', '西装外套', '小西装', '西服'], category: 'outerwear', subCategory: 'blazer' },
  { patterns: ['cardigan', '开衫', '针织开衫', '毛衣外套'], category: 'outerwear', subCategory: 'cardigan' },
  { patterns: ['wide.?leg', '阔腿裤', '喇叭裤', '直筒裤'], category: 'bottoms', subCategory: 'wide_leg' },
  { patterns: ['mini.?skirt', '短裙', '迷你裙', '超短裙'], category: 'dress', subCategory: 'mini_skirt' },
  // 美妆细分
  { patterns: ['lipstick', '口红', '唇釉', '唇彩', '唇膏'], category: 'beauty', subCategory: 'lipstick' },
  { patterns: ['foundation', '粉底液', '粉底', '气垫'], category: 'beauty', subCategory: 'foundation' },
  { patterns: ['eyeshadow', '眼影', '眼影盘'], category: 'beauty', subCategory: 'eyeshadow' },
  { patterns: ['mascara', '睫毛膏', '睫毛增长液'], category: 'beauty', subCategory: 'mascara' },
  { patterns: ['skincare', '护肤品', '精华', '乳液', '面霜'], category: 'beauty', subCategory: 'skincare' },
  // 户外细分
  { patterns: ['tent', '帐篷', '露营帐篷', '天幕'], category: 'sports', subCategory: 'camping' },
  { patterns: ['sleeping.?bag', '睡袋', '露营睡袋'], category: 'sports', subCategory: 'camping' },
  { patterns: ['yoga.?mat', '瑜伽垫', '健身垫'], category: 'sports', subCategory: 'yoga' },
  { patterns: ['resistance.?band', '弹力带', '拉力带', '阻力带'], category: 'sports', subCategory: 'fitness' },
  // 家居细分
  { patterns: ['air.?fryer', '空气炸锅'], category: 'home', subCategory: 'kitchen' },
  { patterns: ['pillow', '枕头', '抱枕', '靠枕'], category: 'home', subCategory: 'bedding' },
  { patterns: ['blanket', '毯子', '毛毯', '盖毯'], category: 'home', subCategory: 'bedding' },
  { patterns: ['storage', '收纳', '收纳盒', '收纳箱'], category: 'home', subCategory: 'storage' },
];

// ── Category keywords for product intent ──
export const CATEGORY_MAP = [
  { keywords: ['coat', 'jacket', 'puffer', 'hoodie', 'sweater', 'cardigan', 'blazer', 'vest', 'overcoat', 'trench', 'padded', '外套', '夹克', '羽绒', '卫衣', '毛衣', '风衣', '棉服', '马甲', '开衫', '大衣'], label: 'outerwear' },
  { keywords: ['dress', 'skirt', 'gown', '裙', '连衣裙', '半身裙', '长裙', '短裙'], label: 'dress' },
  { keywords: ['shirt', 'blouse', 'top', 'tee', 't-shirt', 'tank', 'camisole', 'polo', '衬衫', '上衣', 'T恤', '背心', '短袖', '衬衣'], label: 'tops' },
  { keywords: ['pants', 'trousers', 'jeans', 'leggings', 'shorts', 'jogger', 'sweatpants', 'cargo', 'slacks', 'denim', '裤子', '裤', '牛仔', '长裤', '短裤', '打底裤', '阔腿裤', '运动裤', '西裤', '工装裤', '休闲裤'], label: 'bottoms' },
  { keywords: ['shoe', 'sneaker', 'boot', 'sandal', 'slipper', 'heel', 'loafer', 'flat', 'canvas', '鞋', '靴', '凉鞋', '拖鞋', '凉拖', '高跟鞋', '运动鞋', '帆布鞋', '皮鞋', '平底鞋', '板鞋', '人字拖', '夹脚拖', '洞洞鞋', '勃肯鞋', '沙滩鞋', '罗马凉鞋', '运动凉鞋', '厚底凉鞋', '一字拖'], label: 'shoes' },
  { keywords: ['bag', 'handbag', 'backpack', 'purse', 'wallet', 'clutch', 'tote', 'crossbody', 'shoulder bag', 'luggage', '包', '钱包', '背包', '手提包', '斜挎包', '单肩包', '行李箱'], label: 'bags' },
  {
    keywords: [
      'watch',
      'bracelet',
      'necklace',
      'earring',
      'ring',
      'jewelry',
      'accessori',
      'hat',
      'cap',
      'scarf',
      'sunglasses',
      'belt',
      'hair clip',
      'headband',
      'scrunchie',
      'barrette',
      'hair pin',
      'hairpin',
      'claw clip',
      'hair accessory',
      'hair band',
      '手表',
      '项链',
      '耳环',
      '戒指',
      '饰品',
      '手链',
      '帽子',
      '围巾',
      '太阳镜',
      '墨镜',
      '太阳镜',
      '遮阳帽',
      '太阳帽',
      '渔夫帽',
      '草帽',
      '沙滩帽',
      '棒球帽',
      '鸭舌帽',
      '空顶帽',
      '防晒帽',
      '偏光镜',
      '蛤蟆镜',
      '腰带',
      '发饰',
      '头饰',
      '头发配饰',
      '发卡',
      '发夹',
      '抓夹',
      '发箍',
      '发圈',
      '发绳',
      '发带',
      '头花',
      '发簪',
      '鲨鱼夹',
      '刘海夹',
    ],
    label: 'accessories',
  },
  { keywords: ['phone', 'case', 'charger', 'cable', 'headphone', 'earphone', 'earbud', 'speaker', 'electronic', 'keyboard', 'mouse', 'tablet', 'laptop', '手机', '耳机', '充电', '数码', '键盘', '鼠标', '电脑', '平板', '音箱'], label: 'electronics' },
  { keywords: ['home', 'kitchen', 'lamp', 'pillow', 'blanket', 'towel', 'storage', 'organiz', 'decor', 'curtain', 'rug', 'carpet', 'vase', 'cup', 'mug', '家居', '厨房', '灯', '收纳', '装饰', '窗帘', '地毯', '杯子', '餐具', '枕头', '毯子', '毛巾', '花瓶'], label: 'home' },
  { keywords: ['beauty', 'makeup', 'skincare', 'cream', 'serum', 'lipstick', 'mascara', 'brush', 'perfume', 'foundation', 'eyeshadow', 'cleanser', 'sunscreen', '美妆', '护肤', '口红', '化妆', '面膜', '粉底', '眼影', '香水', '防晒', '洗面奶', '精华', '假睫毛', '睫毛', 'eyelash', 'eyelashes', 'lash', 'lashes', '防晒霜', '防晒喷雾', '防晒乳', '防晒衣', '冰袖', '防紫外线'], label: 'beauty' },
  { keywords: ['health', 'food', 'supplement', 'vitamin', 'nutrition', 'protein', 'organic', 'natural', 'dietary', '保健', '保健食品', '营养', '维生素', '补充剂', '蛋白', '有机', '天然', '膳食', '健康食品', '养生', '滋补'], label: 'health_food' },
  { keywords: ['toy', 'game', 'puzzle', 'doll', 'figure', 'plush', 'lego', 'block', 'model', '玩具', '游戏', '公仔', '积木', '模型', '毛绒'], label: 'toys' },
  { keywords: ['pet', 'dog', 'cat', 'collar', 'leash', '宠物', '猫', '狗'], label: 'pet' },
  { keywords: ['sport', 'fitness', 'yoga', 'gym', 'bicycle', 'outdoor', 'camping', 'hiking', 'running', 'workout', 'athletic', '运动', '健身', '瑜伽', '户外', '自行车', '跑步'], label: 'sports' },
  { keywords: ['baby', 'kid', 'children', 'infant', 'toddler', '婴儿', '儿童', '宝宝', '童装'], label: 'kids' },
  { keywords: ['swimsuit', 'bikini', 'swim', 'swimwear', '泳衣', '泳装', '比基尼', '连体泳衣', '分体泳衣', '泳裤', '泳帽', '泳镜', '游泳衣', '沙滩装', '沙滩裙', '罩衫'], label: 'swimwear' },
  { keywords: ['summer', 'cooling', 'fan', '凉席', '冰垫', '空调被', '夏凉被', '降温', '消暑', '清凉', '小风扇', '手持风扇', '挂脖风扇', '竹席', '藤席', '冰丝席', '冰丝', '凉感', '便携风扇'], label: 'summer_essentials' },
  { keywords: ['umbrella', 'rain', '雨衣', '雨披', '雨鞋', '雨靴', '雨伞', '晴雨伞', '折叠伞', '自动伞', '防水包', '防水袋', '梅雨', '雨季'], label: 'rain_gear' },
  { keywords: ['mosquito', 'repellent', '驱蚊', '防蚊', '灭蚊', '驱蚊液', '驱蚊水', '驱蚊贴', '驱蚊手环', '驱蚊器', '电蚊拍', '蚊香', '灭蚊灯'], label: 'mosquito_repellent' },
  { keywords: ['travel', 'luggage', 'suitcase', '行李箱', '拉杆箱', '登机箱', '收纳包', '洗漱包', '化妆包', '护照夹', '证件包', 'u型枕', '颈枕', '眼罩', '耳塞', '旅行用品', '出行'], label: 'travel_gear' },
  { keywords: ['lingerie', 'underwear', 'bra', 'panties', 'boxers', 'briefs', '内衣', '内裤', '文胸'], label: 'underwear' },
  {
    keywords: [
      'postpartum',
      'postnatal',
      'maternity',
      'breast pump',
      'breastfeeding',
      'nursing pad',
      'belly band',
      'peri bottle',
      'underpad',
      'uterus warming',
      '产后',
      '产妇',
      '月子',
      '哺乳',
      '吸奶器',
      '收腹',
      '妊娠纹',
      '护理垫',
      '产褥垫',
      '暖宫贴',
      '卫生巾',
      '母婴',
      '孕妇',
    ],
    label: 'maternity_postpartum',
  },
];

export function detectCategories(text) {
  const lower = text.toLowerCase();
  return CATEGORY_MAP.filter((cat) => cat.keywords.some((kw) => lower.includes(kw)));
}

/**
 * 智能识别具体商品名称并映射到所属品类
 * 例如："Y2K窄框太阳镜" → accessories (太阳镜)
 *       "老爹鞋" → shoes (sneakers)
 *       "鲨鱼夹" → accessories (hair)
 */
export function detectProductCategories(text) {
  const s = String(text || '').trim();
  if (!s) return [];
  
  const lower = s.toLowerCase();
  const matched = [];
  
  for (const mapping of PRODUCT_TO_CATEGORY_MAP) {
    for (const pattern of mapping.patterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(lower)) {
        matched.push({
          category: mapping.category,
          subCategory: mapping.subCategory,
          matchedPattern: pattern,
        });
        break; // Found a match for this mapping, move to next
      }
    }
  }
  
  // Remove duplicates based on category+subCategory
  const unique = [];
  const seen = new Set();
  for (const m of matched) {
    const key = `${m.category}:${m.subCategory}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(m);
    }
  }
  
  return unique;
}

/**
 * 综合品类检测：结合通用品类和具体商品映射
 * 优先返回具体商品映射的品类，如果没有则返回通用品类
 */
export function detectAllCategories(text) {
  // First try specific product mapping
  const productCats = detectProductCategories(text);
  if (productCats.length > 0) {
    return productCats.map((p) => ({ label: p.category, subCategory: p.subCategory, source: 'product' }));
  }
  
  // Fall back to general category detection
  const generalCats = detectCategories(text);
  return generalCats.map((c) => ({ label: c.label, source: 'general' }));
}

/** 与 smartSearch 一致的轻量分词（用于判断“是否只有人口统计学词命中”） */
function extractFreeSearchTermsForIntent(combined) {
  return String(combined || '')
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/[\d]+\s*[-~到至]\s*[\d]+/g, '')
    .replace(
      /(商品|产品|选品|爆款|热卖|采购|找货|推荐|价格|预算|月销|销量|supplier|products?|trending|best seller|sourcing|recommend|price|budget|sold|sales|under|below|above|over|不超过|低于|高于|至少|最少|最多|title|meta|description|url|snapshot|text|excerpt)/gi,
      ''
    )
    .split(/[\s,，;；、]+/)
    .filter((w) => w.length >= 2);
}

const DEMO_AUDIENCE_EN = new Set([
  'women',
  'woman',
  'female',
  'male',
  'man',
  'men',
  'girl',
  'girls',
  'boy',
  'boys',
  'lady',
  'ladies',
  'guy',
  'guys',
]);

const DEMO_AUDIENCE_ZH = new Set(['女性', '女士', '女装', '女款', '女式', '男士', '男性', '男装', '男款', '男式']);

/**
 * 去掉“只有女性/男性”这类泛词后的检索词；用于抑制英文只命中 women、中文只命中 女性 的误召回。
 */
export function getNonDemographicSearchTerms(combined) {
  const translated = translateZhToEn(String(combined || '')).map((x) => String(x || '').toLowerCase());
  const free = extractFreeSearchTermsForIntent(combined);
  const merged = [...new Set([...free, ...translated])];
  return merged.filter((t) => {
    const x = String(t).toLowerCase();
    if (x.length < 2) return false;
    if (DEMO_AUDIENCE_EN.has(x)) return false;
    const withoutPoss = x.replace(/['']s$/i, '');
    if (withoutPoss !== x && DEMO_AUDIENCE_EN.has(withoutPoss)) return false;
    if (DEMO_AUDIENCE_ZH.has(t) || DEMO_AUDIENCE_ZH.has(x)) return false;
    return true;
  });
}

const NICHE_INTENT_RE =
  /(产后|产妇|月子|哺乳|母乳|妊娠纹|收腹带|收腹|盆底|开奶|催奶|吸奶器|护理垫|产褥|会阴|孕妇|孕期|母婴|一次性内裤|产褥垫|卫生裤|postpartum|postnatal|maternity|breast pump|breastfeeding|nipple|perineal|belly band|lochia|nursing pads?)/i;

/** 头/发部饰品（与「洗发护发」等区分；用于意图与类目命中） */
const HEAD_ACCESSORY_INTENT_RE =
  /(头饰|头发配饰|头部配饰|发卡|发夹|抓夹|发箍|发圈|发绳|皮筋|发带|头花|发簪|刘海夹|鲨鱼夹|bb夹|鸭嘴夹|一字夹|边夹|盘发|编发用|碎发夹|hair\s*clip|headband|scrunchie|barrette|hair\s*pin|hairpin|claw\s*clip|hair\s*accessories?)/i;

// ════════════════════════════════════════════════════
// 夏季高频类目意图识别（12个核心品类）
// ════════════════════════════════════════════════════

/** 1. 防晒用品（防晒霜、防晒喷雾、防晒衣、冰袖、遮阳伞） */
const SUNSCREEN_INTENT_RE =
  /(防晒|防晒霜|防晒喷雾|防晒乳|防晒衣|防晒衫|冰袖|防晒袖|遮阳伞|太阳伞|防紫外线|UV防护|spf|pa\+|sunscreen|sun\s*protection|sun\s*block|uv\s*protection)/i;

/** 2. 泳装/泳衣（比基尼、连体泳装、泳裤、沙滩装） */
const SWIMWEAR_INTENT_RE =
  /(泳衣|泳装|比基尼|连体泳衣|分体泳衣|泳裤|泳帽|泳镜|游泳衣|沙滩装|沙滩裙|罩衫|swimsuit|swimwear|bikini|one-piece|tankini|swim\s*trunks)/i;

/** 3. 凉鞋/拖鞋（人字拖、洞洞鞋、勃肯鞋、沙滩鞋） */
const SANDALS_INTENT_RE =
  /(凉鞋|拖鞋|凉拖|人字拖|夹脚拖|洞洞鞋|勃肯鞋|沙滩鞋|罗马凉鞋|运动凉鞋|厚底凉鞋|一字拖|sandal|slipper|flip\s*flop|crocs|birkenstock|slide)/i;

/** 4. 夏季服装（短裤、短裙、吊带、背心、露肩装、透视装） */
const SUMMER_CLOTHING_INTENT_RE =
  /(夏装|夏季服装|短裤|热裤|牛仔短裤|运动短裤|短裙|迷你裙|吊带|吊带裙|背心|无袖|露肩|一字肩|露背装|透视装|雪纺|亚麻|棉麻|透气|清凉|summer\s*clothes|shorts|mini\s*skirt|tank\s*top|camisole|off\s*shoulder|backless)/i;

/** 5. 遮阳帽/墨镜（渔夫帽、草帽、棒球帽、偏光镜） */
const SUN_HAT_GLASSES_INTENT_RE =
  /(遮阳帽|太阳帽|渔夫帽|草帽|沙滩帽|棒球帽|鸭舌帽|空顶帽|防晒帽|草帽|墨镜|太阳镜|偏光镜|蛤蟆镜|sun\s*hat|straw\s*hat|bucket\s*hat|baseball\s*cap|visor|sunglasses|polarized)/i;

/** 6. 降温/空调周边（小风扇、冰垫、凉席、空调被） */
const COOLING_INTENT_RE =
  /(降温|消暑|清凉|小风扇|手持风扇|挂脖风扇|冰垫|凉席|竹席|藤席|冰丝席|空调被|夏凉被|冰丝|凉感|cooling|mini\s*fan|portable\s*fan|neck\s*fan|cooling\s*pillow|cooling\s*mat)/i;

/** 7. 户外露营用品（天幕、帐篷、野餐垫、露营椅） */
const CAMPING_INTENT_RE =
  /(露营|野营|户外|天幕|帐篷|野餐垫|野餐布|露营椅|折叠椅|月亮椅|蛋卷桌|卡式炉|户外用品|camping|outdoor|tent|canopy|picnic\s*mat|camping\s*chair|folding\s*chair|moon\s*chair)/i;

/** 8. 冰饮杯/保温杯（随行杯、吸管杯、保冷杯、冰霸杯） */
const DRINKWARE_INTENT_RE =
  /(冰饮杯|吸管杯|随行杯|保温杯|保冷杯|冰霸杯|吨吨桶|大容量水杯|运动水壶|摇摇杯|咖啡杯|马克杯|tumbler|travel\s*mug|insulated\s*cup|water\s*bottle|shaker|stanley|yeti)/i;

/** 9. 雨具（晴雨伞、雨衣、雨鞋、防水包） */
const RAIN_GEAR_INTENT_RE =
  /(雨伞|晴雨伞|折叠伞|自动伞|雨衣|雨披|雨鞋|雨靴|防水包|防水袋|梅雨|雨季|rains?|umbrella|folding\s*umbrella|rain\s*coat|poncho|rain\s*boot|waterproof\s*bag)/i;

/** 10. 驱蚊用品（驱蚊液、驱蚊贴、驱蚊手环、电蚊拍） */
const MOSQUITO_INTENT_RE =
  /(驱蚊|防蚊|灭蚊|驱蚊液|驱蚊水|驱蚊贴|驱蚊手环|驱蚊器|电蚊拍|蚊香|灭蚊灯| mosquito|repellent|insect\s*repellent|bug\s*repellent|mosquito\s*coil)/i;

/** 11. 夏季运动健身（瑜伽、跑步、速干衣、暴汗服） */
const SUMMER_SPORT_INTENT_RE =
  /(夏季运动|夏日健身|瑜伽|瑜伽服|跑步|跑步装备|速干|速干衣|暴汗服|运动套装|健身服|运动内衣|骑行|游泳健身|yoga|running|quick\s*dry|sweat\s*suit|gym\s*wear|activewear|cycling)/i;

/** 12. 旅行用品（行李箱、收纳包、护照夹、 neck pillow） */
const TRAVEL_GEAR_INTENT_RE =
  /(旅行|旅游|出行|行李箱|拉杆箱|登机箱|收纳包|洗漱包|化妆包|护照夹|证件包|u型枕|颈枕|眼罩|耳塞|旅行用品|luggage|suitcase|carry-on|toiletry\s*bag|travel\s*kit|passport\s*holder|neck\s*pillow|sleep\s*mask)/i;

/**
 * 用户是否表达了**可落地的品类/场景**（而非仅“女性/男性"等宽泛人群词）。
 * 现在也能识别具体商品名称（如"Y2K窄框太阳镜"）并映射到所属品类。
 */
export function queryHasConcreteProductIntent(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  // Check general categories
  if (detectCategories(s).length > 0) return true;
  // Check specific product-to-category mappings
  if (detectProductCategories(s).length > 0) return true;
  if (HEAD_ACCESSORY_INTENT_RE.test(s)) return true;
  if (NICHE_INTENT_RE.test(s)) return true;
  // 夏季高频类目意图检测
  if (SUNSCREEN_INTENT_RE.test(s)) return true;
  if (SWIMWEAR_INTENT_RE.test(s)) return true;
  if (SANDALS_INTENT_RE.test(s)) return true;
  if (SUMMER_CLOTHING_INTENT_RE.test(s)) return true;
  if (SUN_HAT_GLASSES_INTENT_RE.test(s)) return true;
  if (COOLING_INTENT_RE.test(s)) return true;
  if (CAMPING_INTENT_RE.test(s)) return true;
  if (DRINKWARE_INTENT_RE.test(s)) return true;
  if (RAIN_GEAR_INTENT_RE.test(s)) return true;
  if (MOSQUITO_INTENT_RE.test(s)) return true;
  if (SUMMER_SPORT_INTENT_RE.test(s)) return true;
  if (TRAVEL_GEAR_INTENT_RE.test(s)) return true;
  const lower = s.toLowerCase();
  if (
    /\b(skincare|skin care|hair care|body care|oral care|moisturizer|cleanser|serum|shampoo|toothbrush|massager)\b/i.test(
      lower
    )
  ) {
    return true;
  }
  if (/(护理用品|个人护理|湿巾|营养品|维生素|补充剂)/.test(s)) return true;
  if (/\b(supplements?|vitamins?|omega)\b/i.test(lower)) return true;
  const nd = getNonDemographicSearchTerms(s);
  const generic = new Set([
    'show',
    'tell',
    'give',
    'send',
    'find',
    'list',
    'need',
    'want',
    'some',
    'any',
    'more',
    'best',
    'hot',
    'new',
    'help',
    'please',
    'about',
    'looking',
    'recommend',
    'suggest',
    'idea',
    'ideas',
    'me',
    'you',
    'product',
    'products',
    'item',
    'items',
    'thing',
    'things',
    'stuff',
    'something',
    'everything',
    'anything',
    'good',
    'great',
    'nice',
    'cool',
  ]);
  const substantive = nd.filter((t) => !generic.has(String(t).toLowerCase()));
  return substantive.some((t) => t.length >= 4 || /[\u4e00-\u9fff]/.test(t));
}

/**
 * 无榜单/无搜索词时的兜底话术分支：宽泛人群词 vs 具体需求 vs 长句无锚点。
 */
export function recommendationFallbackKind(userText) {
  const t = String(userText || '').trim();
  if (queryHasConcreteProductIntent(t)) return 'concrete';
  const compactLen = t.replace(/\s+/g, '').length;
  if (compactLen <= 14) return 'broad_audience';
  return 'long_vague';
}

/**
 * 趋势/榜单长列表：仅保留「类目或非标人群词」与商品标题/类目文本同时对齐的条目，避免只命中 women/女性。
 * @param {object} [opts]
 * @param {boolean} [opts.userAnchorOnly] 为 true 时只用 `userText` 做锚点（不把模型长文里的 yoga、sport、women's 等混进匹配），避免竖列卡串类。
 * @param {string} [opts.userText] 用户原话；与 userAnchorOnly 联用。
 */
export function filterTrendMatchesForPreciseDisplay(query, matched, opts = {}) {
  const arr = Array.isArray(matched) ? matched : [];
  const q = opts.userAnchorOnly ? String(opts.userText ?? '').trim() : String(query || '');
  if (!queryHasConcreteProductIntent(q)) return [];
  // Detect both general categories and product-specific mappings
  const cats = detectCategories(q);
  const productCats = detectProductCategories(q);
  const nonDemo = getNonDemographicSearchTerms(q);
  const nicheInQuery = NICHE_INTENT_RE.test(q);
  const headAccessoryQuery = HEAD_ACCESSORY_INTENT_RE.test(q);
  // 夏季高频类目意图检测
  const summerQuery = SUNSCREEN_INTENT_RE.test(q) || SWIMWEAR_INTENT_RE.test(q) || SANDALS_INTENT_RE.test(q) ||
                      SUMMER_CLOTHING_INTENT_RE.test(q) || SUN_HAT_GLASSES_INTENT_RE.test(q) || COOLING_INTENT_RE.test(q) ||
                      CAMPING_INTENT_RE.test(q) || DRINKWARE_INTENT_RE.test(q) || RAIN_GEAR_INTENT_RE.test(q) ||
                      MOSQUITO_INTENT_RE.test(q) || SUMMER_SPORT_INTENT_RE.test(q) || TRAVEL_GEAR_INTENT_RE.test(q);

  return arr.filter((p) => {
    const low = String(p.searchLower || p.nameLower || '').toLowerCase();
    if (!low) return false;
    const catHit = cats.some((c) => c.keywords.some((kw) => low.includes(String(kw).toLowerCase())));
    // Product-specific category matching: if user searches for "Y2K sunglasses",
    // match any product in the "accessories" category (parent of sunglasses)
    const productCatHit = productCats.length > 0 && productCats.some((pc) => {
      // Match by parent category in product data
      const categoryMatch = p.category && String(p.category).toLowerCase().includes(pc.category);
      // Or match by sub-category keywords
      const subMatch = pc.subCategory && low.includes(pc.subCategory.toLowerCase());
      return categoryMatch || subMatch;
    });
    const termHit = nonDemo.some((t) => low.includes(String(t).toLowerCase()));
    const headHit = headAccessoryQuery && HEAD_ACCESSORY_INTENT_RE.test(low);
    const nicheHit = !nicheInQuery || NICHE_INTENT_RE.test(low);
    // 夏季类目匹配
    const summerHit = summerQuery && (SUNSCREEN_INTENT_RE.test(low) || SWIMWEAR_INTENT_RE.test(low) ||
                      SANDALS_INTENT_RE.test(low) || SUMMER_CLOTHING_INTENT_RE.test(low) ||
                      SUN_HAT_GLASSES_INTENT_RE.test(low) || COOLING_INTENT_RE.test(low) ||
                      CAMPING_INTENT_RE.test(low) || DRINKWARE_INTENT_RE.test(low) ||
                      RAIN_GEAR_INTENT_RE.test(low) || MOSQUITO_INTENT_RE.test(low) ||
                      SUMMER_SPORT_INTENT_RE.test(low) || TRAVEL_GEAR_INTENT_RE.test(low));
    return nicheHit && (catHit || productCatHit || termHit || headHit || summerHit);
  });
}

export function parsePriceRange(text) {
  let min = 0, max = Infinity;
  const rmb = /(?:价格|price|预算|budget)[^\d]{0,10}?(\d+)\s*[-~到至]\s*(\d+)/i.exec(text);
  if (rmb) return { min: Number(rmb[1]), max: Number(rmb[2]) };
  const under = /(?:低于|under|below|不超过|最多|max)[^\d]{0,6}?(\d+)/i.exec(text);
  if (under) return { min, max: Number(under[1]) };
  const above = /(?:高于|above|over|至少|最少|min)[^\d]{0,6}?(\d+)/i.exec(text);
  if (above) return { min: Number(above[1]), max };
  const range = /(\d+)\s*[-~到至]\s*(\d+)\s*(?:元|¥|rmb|yuan|块|刀|\$|usd)?/i.exec(text);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  return null;
}

export function parseMinSold(text) {
  const m = /(?:月销|销量|sold|sales)[^\d]{0,8}?(\d+)/i.exec(text);
  return m ? Number(m[1]) : null;
}

export function pickField(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

/** JSON 根节点可能是数组或 { items|products|data: [] } */
export function ensureJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.products)) return raw.products;
  if (Array.isArray(raw.data)) return raw.data;
  return [];
}

/**
 * 合并手工拼接的多个顶层 JSON 数组：`[...]\n[...]`（整文件否则无法 JSON.parse）
 */
export function parseConcatenatedTopLevelJsonArrays(text) {
  const trimmed = String(text || '').replace(/^\uFEFF/, '').trim().replace(/\bNaN\b/g, 'null');
  if (!trimmed || !/\]\s*\[/.test(trimmed)) return null;
  const parts = trimmed.split(/\]\s*\[/);
  if (parts.length < 2) return null;
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    let s = parts[i].trim();
    if (!s.startsWith('[')) s = `[${s}`;
    if (!s.endsWith(']')) s = `${s}]`;
    try {
      const v = JSON.parse(s);
      if (Array.isArray(v)) out.push(...v);
    } catch {
      return null;
    }
  }
  return out;
}

/** Single row → unified product shape (Amazon / TikTok / Trend `Product.json`). */
export function normalizeCatalogItem(item, i, platform) {
  /** tangbuy-product.json：含 1688/Tangbuy 链接 + 外链，必须与趋势行区分，避免误进 isTrend（趋势分支不读 product_title） */
  const looksLikeTangbuyProductJsonRow =
    item &&
    pickField(item, ['product_url', 'url', 'link']) != null &&
    (pickField(item, ['1688_price', 'tangbuy_price']) != null ||
      pickField(item, ['tangbuy_product_url', 'tangbuy_url']) != null);

  const isTrend =
    item &&
    !looksLikeTangbuyProductJsonRow &&
    (item['日期范围'] !== undefined ||
      item['商品名称'] !== undefined ||
      item['图片链接'] !== undefined ||
      item['类目'] !== undefined);

  if (isTrend) {
    const titleCn = String(
      pickField(item, ['商品名称', 'product_title', 'product_name', 'title', 'title_cn']) || 'Unknown Product'
    );
    const categoryCn = String(pickField(item, ['类目', 'category']) || '');
    const dateRangeCn = String(pickField(item, ['日期范围', 'dateRange']) || '');
    const image = String(
      pickField(item, ['图片链接', 'product_image_url', '图像链接', 'image', 'img']) ||
      'https://via.placeholder.com/300?text=No+Image'
    );
    /** Trend / 榜单：Product.json 多为 $；Best-selling.json 等为 ¥ 口径字段，统一折成美元口径供 fmtUsd */
    const RMB_PER_USD = 7.2;
    const trendPricesAreRmb =
      item['价格(¥)'] !== undefined ||
      item['成交金额(¥)'] !== undefined ||
      item['平均销售价(¥)'] !== undefined;
    const trendMoneyUsd = (yuanKeys, usdKeys) => {
      if (trendPricesAreRmb) {
        const yv = pickField(item, yuanKeys);
        if (yv !== undefined && yv !== null && String(yv).trim() !== '') {
          const n = Number(yv);
          return Number.isFinite(n) ? n / RMB_PER_USD : 0;
        }
      }
      return Number(pickField(item, usdKeys) || 0);
    };
    const priceUsd = trendMoneyUsd(['价格(¥)'], ['价格($)', '价格', 'price']);
    const rating = Number(pickField(item, ['商品评分', '评分', 'rating']) || 0);
    const sold = Number(pickField(item, ['销量', 'sold', 'month_sold']) || 0);
    const avgSellingPriceUsd = trendMoneyUsd(['平均销售价(¥)'], ['平均销售价($)', '平均售价($)', '平均销售价', 'avg_price']);
    const amountUsd = trendMoneyUsd(['成交金额(¥)'], ['成交金额($)', '成交金额', 'amount']);
    const amountGrowth = String(pickField(item, ['成交金额增长率', '金额增长率', 'growth']) || '');
    const videoSalesUsd = trendMoneyUsd(['视频成交金额(¥)'], ['视频成交金额($)', '视频成交金额', 'video_sales']);
    const cardAmountUsd = trendMoneyUsd(['商品卡成交金额'], ['商品卡成交金额', '商品卡成交', 'card_amount']);
    const influencerCount = Number(pickField(item, ['达人数量', '带货达人数', 'influencer_count']) || 0);
    const influencerOrderRate = String(pickField(item, ['达人出单率', '出单率', 'influencer_rate']) || '');
    const tiktokUrl = String(pickField(item, ['TikTok链接', 'tiktok_url', 'product_url']) || '');
    const tangbuySourceUrl = pickField(item, ['tangbuy_product_url', 'tangbuyUrl', 'tangbuy_url', 'Tangbuy链接', 'Tangbuy URL']);
    const categoryEnTokens = translateZhToEn(categoryCn).join(' ').trim();
    const categorySearchEn = String(
      pickField(item, ['category_en', 'category_l3_en', '三级类目_en', 'l3_category_en', 'category_l3']) || ''
    ).trim();
    const searchLower = `${titleCn} ${categoryCn} ${categoryEnTokens}`.toLowerCase();
    return {
      id: `trend_${i}_${titleCn}`,
      platform: 'Trend',
      variant: 'trend',
      name: titleCn,
      nameLower: titleCn.toLowerCase(),
      categoryCn,
      categoryEn: categoryEnTokens,
      categorySearchEn,
      searchLower,
      image,
      url: tiktokUrl,
      priceRmb: priceUsd,
      tangbuyPriceRmb: NaN,
      tangbuyUrl: tangbuySourceUrl ? toDropshippingUrl(tangbuySourceUrl) : '',
      monthSoldNum: Number.isFinite(sold) ? sold : 0,
      sold: Number.isFinite(sold) ? String(sold) : 'N/A',
      dateRangeCn,
      rating,
      avgSellingPriceUsd,
      amountUsd,
      amountGrowth,
      videoSalesUsd,
      cardAmountUsd,
      influencerCount,
      influencerOrderRate,
    };
  }

  const name = String(pickField(item, ['product_title', 'product_name', 'name', 'title', 'productTitle']) || 'Unknown Product');
  const imgPrimary = pickField(item, ['product_image_url', 'image', 'img']);
  const imgAlt = pickField(item, ['tangbuy_product_image_url']);
  const image = String(imgPrimary || imgAlt || '').trim() || 'https://via.placeholder.com/300?text=No+Image';
  const imageFallback =
    imgPrimary && imgAlt && String(imgPrimary).trim() !== String(imgAlt).trim()
      ? String(imgAlt).trim()
      : '';
  const url = String(pickField(item, ['product_url', 'url', 'link']) || '#');
  const monthSold = pickField(item, ['month_sold', 'monthSold', 'sold']);
  const priceRmb = Number(pickField(item, ['price_rmb', 'price']) || 0);
  const raw1688 = Number(pickField(item, ['1688_price', 'tangbuy_price']) || 0);
  const tangbuySourceUrl = pickField(item, ['tangbuy_product_url', 'tangbuyUrl', 'tangbuy_url']);
  const tangbuyDisplayRmb = Number.isFinite(raw1688) && raw1688 > 0 ? raw1688 * TANGBUY_DISPLAY_MULT : NaN;
  const monthSoldNum = Number(monthSold);
  return {
    id: `${platform === 'Amazon' ? 'amz' : 'tt'}_${i}`,
    platform,
    name,
    nameLower: name.toLowerCase(),
    image,
    ...(imageFallback ? { imageFallback } : {}),
    url,
    priceRmb,
    monthSoldNum: Number.isFinite(monthSoldNum) ? monthSoldNum : 0,
    sold: monthSold != null && String(monthSold).trim() !== '' ? String(monthSold) : 'N/A',
    tangbuyPriceRmb: tangbuyDisplayRmb,
    tangbuyUrl: tangbuySourceUrl ? toDropshippingUrl(tangbuySourceUrl) : '',
    searchLower: name.toLowerCase(),
  };
}

/** Amazon / TikTok 热销行合并进 `data/tangbuy-product.json` 后，按 `product_url` 推断平台（供 normalizeCatalogItem 第三参）。 */
export function inferHotCatalogPlatform(productUrl) {
  const u = String(productUrl || '').toLowerCase();
  if (u.includes('tiktok.com')) return 'TikTok';
  return 'Amazon';
}

/** 依次尝试：本地路径（如 `data/*.json`）→ GitHub Raw（`VITE_DATA_REMOTE_BASE` 或默认 agent/main） */
export async function tryFetchJson(paths) {
  const urls = buildTryFetchUrlOrder(paths);
  for (const p of urls) {
    try {
      const res = await fetch(fetchUrlWithBust(p), { cache: 'no-store' });
      if (!res.ok) continue;
      const text = await res.text();
      const trimmed = String(text).replace(/^\uFEFF/, '').trim();
      if (!trimmed) {
        console.warn(
          '[catalog] empty response body:',
          p,
          '— if Product.json shows data only in the editor, save the file to disk (Cmd/Ctrl+S). Vite serves the file on disk, not an unsaved buffer.'
        );
        continue;
      }
      const sanitized = trimmed.replace(/\bNaN\b/g, 'null');
      try {
        return JSON.parse(sanitized);
      } catch {
        const mergedArrays = parseConcatenatedTopLevelJsonArrays(sanitized);
        if (mergedArrays && mergedArrays.length) return mergedArrays;
        throw new Error('invalid JSON');
      }
    } catch (e) {
      console.warn('[catalog] fetch/parse failed', p, e?.message || e);
    }
  }
  return [];
}

/** Load `data/tangbuy-product.json` (Amazon + TikTok 合并热销) + `data/Product.json` (trend). Safe to call multiple times. */
export async function loadProductCatalog() {
  const [mergedRaw, trendRaw] = await Promise.all([
    tryFetchJson(getDataJsonFetchPaths('tangbuy-product.json')),
    tryFetchJson(getDataJsonFetchPaths('Product.json')),
  ]);
  const merged = ensureJsonArray(mergedRaw);
  const trend = ensureJsonArray(trendRaw);
  const nHot = merged.length;
  if (nHot) console.log('[catalog] tangbuy-product.json rows:', nHot);
  else {
    console.warn(
      '[catalog] tangbuy-product.json: no rows loaded. Ensure public/data/tangbuy-product.json exists and is valid JSON, or set VITE_DATA_REMOTE_BASE for Raw fallback.'
    );
  }
  const nTrend = trend.length;
  if (nTrend) console.log('[catalog] Product.json (trend) rows:', nTrend);
  else {
    console.warn(
      '[catalog] Product.json: no rows loaded. Common causes: (1) file on disk is 0 bytes — save Product.json in the editor; (2) invalid/truncated JSON; (3) JSON should live in public/data/ (deployed as /data/*) or on GitHub Raw per VITE_DATA_REMOTE_BASE.'
    );
  }
  return [
    ...merged.map((x, i) =>
      normalizeCatalogItem(x, i, inferHotCatalogPlatform(pickField(x, ['product_url', 'url', 'link'])))
    ),
    ...trend.map((x, i) => normalizeCatalogItem(x, i, 'Trend')),
  ];
}

/** Product.json + Best-selling（月销千榜）合并后的竖向宽卡在对话里的展示上限（非全库、非「两个 JSON 全部行」）。 */
export const TREND_WIDE_CARD_REPLY_CAP = 24;

/** Product.json + Best-selling.json 合并趋势/Top1000 库 */
export async function loadTrendCatalogOnly() {
  const [trendRaw, bestRaw] = await Promise.all([
    tryFetchJson(getDataJsonFetchPaths('Product.json')),
    tryFetchJson(getDataJsonFetchPaths('Best-selling.json')),
  ]);
  const trend = ensureJsonArray(trendRaw);
  const best = ensureJsonArray(bestRaw);
  const trendItems = trend.map((x, i) => normalizeCatalogItem(x, i, 'Trend'));
  const bestItems = best.map((x, i) => {
    const row = normalizeCatalogItem(x, i, 'Trend');
    const safeId = `best_${i}_${String(row.name || '').slice(0, 40)}`.replace(/\s+/g, '_');
    return { ...row, id: safeId, variant: 'bestseller', platform: 'MonthlyTop' };
  });
  return [...trendItems, ...bestItems];
}

export function hasDirectTangbuyUrl(product) {
  return String(product?.tangbuyUrl || '').trim().length > 0;
}

export function prioritizeDirectTangbuyUrl(items) {
  const arr = Array.isArray(items) ? items.slice() : [];
  return arr.sort((a, b) => {
    const ah = hasDirectTangbuyUrl(a) ? 1 : 0;
    const bh = hasDirectTangbuyUrl(b) ? 1 : 0;
    if (ah !== bh) return bh - ah;
    return 0;
  });
}

export function partitionHotAndTrendMatches(matched) {
  const arr = Array.isArray(matched) ? matched : [];
  const isTrendLike = (p) =>
    p.platform === 'Trend' || p.platform === 'MonthlyTop' || p.variant === 'trend' || p.variant === 'bestseller';
  const hot = arr.filter((p) => p && !isTrendLike(p));
  const trend = arr.filter((p) => p && isTrendLike(p));
  return { hot, trend };
}

/** 用于把 AI 卡片与本地 tangbuy-product（Amazon/TikTok）目录对齐（忽略 query、www、尾斜杠；Amazon 按 ASIN） */
function catalogUrlKey(u) {
  const s = String(u || '').trim();
  if (!s || s === '#') return '';
  try {
    const x = new URL(s, 'https://example.com');
    const host = x.hostname.replace(/^www\./i, '').toLowerCase();
    let path = x.pathname.replace(/\/+$/, '') || '/';
    path = path.toLowerCase();
    const asinM = path.match(/(?:^|\/)(?:dp|gp\/product)\/([a-z0-9]{10})(?:\/|$)/i);
    if ((host.includes('amazon.') || host === 'amazon.com' || host.endsWith('.amazon.com')) && asinM) {
      return `asin:${asinM[1].toUpperCase()}`;
    }
    return `${host}${path}`;
  } catch {
    return s.toLowerCase().replace(/\/+$/, '');
  }
}

function isPlaceholderImageUrl(img) {
  const s = String(img || '').trim();
  if (!s.startsWith('http')) return true;
  return /placeholder\.com|via\.placeholder/i.test(s);
}

/**
 * 用本地热销目录补全 AI 解析出的商品图（模型常省略 product_image_url）。
 * 先按 URL/ASIN 匹配，再按标题小写精确匹配（仅 Amazon/TikTok 行）。
 */
export function enrichHotProductsWithCatalog(products, catalog) {
  if (!Array.isArray(products) || !products.length) return products;
  if (!Array.isArray(catalog) || !catalog.length) return products;
  const byKey = new Map();
  const byName = new Map();
  for (const c of catalog) {
    if (!c || c.platform === 'Trend' || c.variant === 'trend') continue;
    const k = catalogUrlKey(c.url);
    if (k && !byKey.has(k)) byKey.set(k, c);
    const n = String(c.nameLower || c.name || '')
      .toLowerCase()
      .trim();
    if (n && !byName.has(n)) byName.set(n, c);
  }
  return products.map((p) => {
    if (!p || !isPlaceholderImageUrl(p.image)) return p;
    let hit = null;
    const uk = catalogUrlKey(p.url);
    if (uk) hit = byKey.get(uk);
    if (!hit && p.name) {
      const nl = String(p.name).toLowerCase().trim();
      hit = byName.get(nl);
    }
    if (!hit) return p;
    const next = { ...p };
    if (hit.image && !isPlaceholderImageUrl(hit.image)) next.image = hit.image;
    if (hit.imageFallback) next.imageFallback = hit.imageFallback;
    if ((!next.url || next.url === '#') && hit.url) next.url = hit.url;
    if (!next.tangbuyUrl && hit.tangbuyUrl) next.tangbuyUrl = hit.tangbuyUrl;
    return next;
  });
}

export function extractBalancedJsonArray(inner) {
  const s = String(inner || '').trim();
  const i = s.indexOf('[');
  if (i === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === '\\' && inStr) {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return s.slice(i, j + 1);
    }
  }
  return null;
}

/** AI 输出的 JSON 行：仅识别 Amazon/TikTok 热销结构（非 Trend） */
export function isCatalogProductRowForAi(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (o.variant === 'trend' || o.platform === 'Trend') return false;
  const name = o.name || o.title || o.product_name || o.productTitle || o.product_title;
  if (!name) return false;
  const plat = String(o.platform || '');
  const hasHotPlat = plat === 'Amazon' || plat === 'TikTok';
  const priceKeys = ['priceRmb', 'price_rmb', 'price', 'product_price', 'tangbuyPriceRmb', '1688_price'];
  const hasPrice = priceKeys.some((k) => {
    const v = o[k];
    return v !== undefined && v !== null && v !== '';
  });
  const hasImg = !!(o.image || o.img || o.product_image_url);
  return hasHotPlat || hasPrice || !!(o.tangbuyUrl || o.tangbuy_url || o.tangbuy_product_url) || hasImg;
}

export function normalizeCatalogProductFromAi(raw, idx) {
  const name = raw.name || raw.title || raw.product_name || raw.productTitle || raw.product_title || 'Product';
  const plat = raw.platform === 'TikTok' ? 'TikTok' : 'Amazon';
  const pr = Number(raw.priceRmb ?? raw.price_rmb ?? raw.price ?? 0);
  const raw1688 = Number(raw['1688_price'] ?? raw.tangbuy_price ?? NaN);
  const tangbuySourceUrl = raw.tangbuyUrl || raw.tangbuy_url || raw.tangbuy_product_url;
  let tangbuyDisplayRmb = Number(raw.tangbuyPriceRmb);
  if (!Number.isFinite(tangbuyDisplayRmb) && Number.isFinite(raw1688) && raw1688 > 0) {
    tangbuyDisplayRmb = raw1688 * TANGBUY_DISPLAY_MULT;
  }
  const imgPrimary = pickField(raw, [
    'product_image_url',
    'image',
    'img',
    'productImageUrl',
    'image_url',
    'imageUrl',
    'thumbnail',
    'cover',
  ]);
  const imgAlt = pickField(raw, ['tangbuy_product_image_url']);
  const image =
    String(imgPrimary || imgAlt || '').trim() ||
    'https://via.placeholder.com/300?text=No+Image';
  const imageFallback =
    imgPrimary && imgAlt && String(imgPrimary).trim() !== String(imgAlt).trim()
      ? String(imgAlt).trim()
      : '';
  return {
    id: raw.id || `ai_hot_${idx}_${String(name).slice(0, 20).replace(/\s+/g, '_')}`,
    platform: plat,
    name,
    nameLower: String(name).toLowerCase(),
    image,
    ...(imageFallback ? { imageFallback } : {}),
    url: raw.url || raw.product_url || '#',
    priceRmb: Number.isFinite(pr) ? pr : 0,
    monthSoldNum: 0,
    sold: raw.sold != null && String(raw.sold).trim() !== '' ? String(raw.sold) : 'N/A',
    tangbuyPriceRmb: Number.isFinite(tangbuyDisplayRmb) ? tangbuyDisplayRmb : NaN,
    tangbuyUrl: tangbuySourceUrl ? toDropshippingUrl(tangbuySourceUrl) : '',
    searchLower: String(name).toLowerCase(),
  };
}

/** 粗判：是否像热销目录 JSON 数组（无 markdown 围栏时） */
const CATALOG_JSON_ARRAY_SNIFF =
  /(?:product_title|product_image_url|product_url|"platform"|price_rmb|month_sold|"name"\s*:|"title"\s*:|1688_price|tangbuy_product_url)/i;

/**
 * 流式阶段：从首个疑似商品 JSON 数组的 `[` 起整段截掉（不展示原始 JSON）。
 */
export function stripStreamingLooseCatalogJsonTail(t) {
  const s = String(t || '');
  const idx = s.search(/\[\s*\{/);
  if (idx === -1) return s;
  const sniff = s.slice(idx, idx + 1400);
  if (!CATALOG_JSON_ARRAY_SNIFF.test(sniff)) return s;
  return s.slice(0, idx).replace(/\s+$/, '');
}

function tryParseLooseCatalogProductArray(text) {
  const t = String(text || '');
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '[') continue;
    const rest = t.slice(i);
    if (!/^\[\s*\{/.test(rest)) continue;
    const sniff = rest.slice(0, Math.min(1400, rest.length));
    if (!CATALOG_JSON_ARRAY_SNIFF.test(sniff)) continue;
    const arrStr = extractBalancedJsonArray(rest);
    if (!arrStr) continue;
    let parsed;
    try {
      parsed = JSON.parse(arrStr);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed) || !parsed.length) continue;
    const rows = parsed.filter(isCatalogProductRowForAi).map((r, j) => normalizeCatalogProductFromAi(r, j));
    if (!rows.length) continue;
    const strippedText = (t.slice(0, i) + t.slice(i + arrStr.length)).replace(/\n{3,}/g, '\n\n').trim();
    return { products: rows, strippedText };
  }
  return null;
}

/**
 * 从 AI 回复中解析：优先 ```json [...] ```，否则正文内任意位置的 `[{...}]` 热销数组（不含 Trend）。
 * 返回 { products, strippedText } 或 null。
 */
export function parseCatalogProductJsonFromMarkdown(fullText) {
  const text = String(fullText || '');
  if (text.includes('```')) {
    const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
    let m;
    while ((m = fenceRe.exec(text)) !== null) {
      const arrStr = extractBalancedJsonArray(m[1]);
      if (!arrStr) continue;
      let parsed;
      try {
        parsed = JSON.parse(arrStr);
      } catch {
        continue;
      }
      if (!Array.isArray(parsed) || !parsed.length) continue;
      const rows = parsed.filter(isCatalogProductRowForAi).map((r, i) => normalizeCatalogProductFromAi(r, i));
      if (!rows.length) continue;
      const strippedText = text.replace(m[0], '').replace(/\n{3,}/g, '\n\n').trim();
      return { products: rows, strippedText };
    }
  }
  return tryParseLooseCatalogProductArray(text);
}

/**
 * 流式：未闭合 ``` 时截断；无围栏但出现疑似商品 JSON 数组时从 `[` 起隐藏。
 */
export function maskStreamingProductJsonBlock(text, _uiLang) {
  let t = String(text || '');
  const parts = t.split('```');
  if (parts.length >= 2 && parts.length % 2 === 0) {
    t = parts.slice(0, -1).join('```');
  }
  return stripStreamingLooseCatalogJsonTail(t);
}

/**
 * 宏观/政策类「趋势」——不应触发货源搜索（与具体卖什么无关）。
 */
const USER_MACRO_TREND_BLACKLIST_ZH =
  /(经济|股市|金融|宏观|政策|房价|油价|汇率|人口|技术革命|行业周期|消费降级|GDP|通胀|利率|货币政策|地缘政治)/;

/**
 * 用户是否在问 **某一品类/场景下的市场、趋势、选品方向**（不限定露营/美妆等具体行业）。
 * 用于：无「推荐商品」话术时，是否仍可在长文分析后附带 Tangbuy 搜索词。
 */
export function userAsksTrendOrCategoryMarketOutlook(userText) {
  const u = String(userText || '').trim();
  if (u.length < 4) return false;

  /** 短句含「趋势」：任意 2～20 个汉字主题 + 趋势，或 趋势 + 2～20 个汉字主题 */
  const shortTailCategoryTrend =
    (/[\u4e00-\u9fff]{2,20}趋势$/.test(u) || /趋势[\u4e00-\u9fff]{2,20}/.test(u)) && !USER_MACRO_TREND_BLACKLIST_ZH.test(u);

  /** 显式市场/选品/品类分析用语（中英） */
  const explicitOutlook =
    /(趋势分析|市场分析|行业分析|品类分析|市场概况|市场洞察|热门品类|品类方向|赛道|选品|爆款|热销|竞品|细分|前景|机会|消费人群|目标人群|带货|利润空间|客单价|流行趋势|消费趋势|行业趋势|品类趋势|热销趋势|流量趋势)/.test(
      u,
    ) ||
    /\b(trend analysis|market analysis|category analysis|market outlook|industry outlook|product trend|market trend|category trend|niche analysis|winning products?|best sellers?|what'?s trending|sourcing ideas|analyze (the )?(market|category|niche|trends?))\b/i.test(
      u,
    );

  /** 英文里「某主题 + trend(s)」类短问，如 outdoor camping trends */
  const englishTopicTrends =
    /\b[\w\s]{3,48}trends?\b/i.test(u) && /\b(market|product|category|consumer|industry|outdoor|ecommerce|e-commerce|retail)\b/i.test(u);

  return shortTailCategoryTrend || explicitOutlook || englishTopicTrends;
}

/**
 * 助手回复是否像 **可落地的商品/类目/平台趋势或选品分析**（与具体垂直无关）。
 * 返回 0～3，用于与长度、用户意图组合决策。
 */
export function scoreAssistantProductTrendAnalysis(aiText) {
  const a = String(aiText || '');
  if (!a.trim()) return 0;
  let s = 0;
  if (
    /趋势|爆款|选品|热销|同款|竞品|类目|品类|细分市场|赛道|蓝海|红海|品牌|对标|listing|利润|客单价|SKU|sku|亚马逊|tiktok|抖音|独立站|跨境|销量|转化|流量|人群|场景|刚需|标品|差异化/.test(
      a,
    )
  ) {
    s += 1;
  }
  const al = a.toLowerCase();
  if (
    /trend|bestseller|category|categories|niche|sourcing|competitor|market|product|brand|amazon|tiktok|shopify|seller|listing|winning|margin|audience|consumer|glamping|sku/.test(
      al,
    )
  ) {
    s += 1;
  }
  if (/tiktok|亚马逊|amazon|独立站|shopify|平台|跨境|dropship|1688|货源|Dropshipping/i.test(a)) s += 1;
  return s;
}

/**
 * 用户是否带一点 **电商/货源/卖什么** 语境（用于防止纯 SEO/闲聊长文误触 Tangbuy）。
 */
function userHasLightCommerceAnchor(userText) {
  const u = String(userText || '');
  return (
    userAsksTrendOrCategoryMarketOutlook(u) ||
    /(选品|货源|热销|爆款|趋势|品类|产品|商品|进货|跨境|独立站|亚马逊|tiktok|shopify|dropship|sourcing|niche|卖什么|好卖|爆款方向|货源池)/i.test(u)
  );
}

/**
 * **输出策略（此类情况的统一逻辑）**
 *
 * 在「用户问的是趋势/市场/品类方向」且「模型写出了足够像选品/趋势分析的正文」时，允许在消息后附带 Tangbuy 搜索（与露营/厨房等具体行业无关）。
 *
 * - 路径 A：用户意图 = 趋势/品类市场展望 ∧ 助手维度分 ≥ 1 ∧ 正文够长
 * - 路径 B：用户至少带轻度电商语境 ∧ 助手维度分 ≥ 2 ∧ 正文更长（避免仅凭模型长篇而用户完全无关）
 *
 * 不替代 `shouldRecommendProducts`；仅用于比「显式要推荐」更宽一层。
 */
export function shouldAttachTangbuyHotFromModelTrendAnalysis(userText, aiText) {
  const u = String(userText || '').trim();
  const a = String(aiText || '').trim();
  if (a.length < 90) return false;

  const userOutlook = userAsksTrendOrCategoryMarketOutlook(u);
  const dim = scoreAssistantProductTrendAnalysis(a);

  if (userOutlook && dim >= 1 && a.length >= 100) return true;
  if (userHasLightCommerceAnchor(u) && dim >= 2 && a.length >= 140) return true;
  return false;
}

/**
 * 用户是否带有「要看列表 / 货源 / 推荐具体货」类语境（非单纯行业闲聊）。
 * 须与 `queryHasConcreteProductIntent` 联用：仅有这些词而无具体类目时不会出竖列卡。
 */
function userWantsProductListOrSourcingCue(text) {
  const t = String(text || '');
  if (
    /有什么[^。！？\n]{0,40}(?:商品|产品|货|选品|款式|推荐|好卖|牌子|类型|类目|链接|现货)|有哪些[^。！？\n]{0,28}(?:款|个|牌|产品|商品|货|类目)|有没有[^。！？\n]{0,28}(?:现货|货源|款|链接|好卖)/i.test(
      t
    )
  ) {
    return true;
  }
  return /(推荐|选品|找货|帮我找|给我找|想看看|给我看|买点|卖点|爆款|热销|好卖|采购|进货|货源|拿货|链接|多少钱|价格|\bsku\b|亚马逊|跨境|独立站|shopify|dropship|tiktok|sourcing|\brecommend\b|show me|\bfind\b.*product|\blist\b.*product|product ideas|give me products|\bideas?\b|winning|best seller|hot product|trending|点货|些货|几个货|几款货)/i.test(
    t
  );
}

/**
 * 是否在本次用户话术后附加 **竖向趋势宽卡**（products_trend）。
 * 命中后从 `Product.json` + `Best-selling.json` 合并库检索，见 `loadTrendCatalogOnly`。
 *
 * 策略：**识别到具体商品或类目**（`queryHasConcreteProductIntent`）且用户话里带有列表/货源/推荐语境；
 * **仅凭「推荐」等泛词、没有可检索的品类/商品锚点** → 不触发。例外：显式趋势话术、对上轮 AI 的短确认。
 */
export function shouldRecommendProducts(text, prevMessages, _aiResponse = '') {
  const t = String(text || '').trim();

  if (isProductConfirmation(t, prevMessages)) return true;

  if (/(趋势商品|趋势选品|找趋势|热销商品|爆款推荐|热卖推荐|trending products|best sellers|hot products)/i.test(t)) {
    return true;
  }

  if (!queryHasConcreteProductIntent(t)) return false;
  return userWantsProductListOrSourcingCue(t);
}

export function isProductConfirmation(text, prevMessages) {
  const t = String(text || '').trim();
  const isShortConfirm = /^(是的?|好的?|可以|需要|要的?|对|嗯|ok|yes|yeah|yep|sure|please|好呀|要呀|来吧|给我看|show me|go ahead|是啊|当然|没问题)[\s!！.。,，?？]*$/i.test(t);
  if (!isShortConfirm) return false;

  // Check if the last AI message was asking about product recommendations
  if (!prevMessages || !prevMessages.length) return false;
  const lastAiMsg = [...prevMessages].reverse().find((m) => m.role === 'ai' && m.type === 'text' && m.content);
  if (!lastAiMsg) return false;
  const aiText = String(lastAiMsg.content).toLowerCase();
  const askPatterns = [
    '是否需要.*(?:商品|产品|单品|趋势)',
    '是否.*推荐.*(?:商品|产品|单品|趋势)',
    '要不要.*推荐',
    '需要.*推荐.*(?:商品|产品|单品|趋势)',
    '需要.*(?:商品|产品|单品|趋势)',
    '展示.{0,18}(?:\\d+\\s*[-–—~到至]\\s*\\d+|几).{0,18}(?:款|个).{0,24}(?:商品|产品|单品|爆款)',
    'would you like.*(?:product|products|item|items|trending)',
    'want.*(?:recommend|show).*(?:product|products|item|items|trending)',
    'shall i.*(?:show|recommend).*(?:product|products|trending)',
    'want me to show',
    'provide.*(?:trending|product).*(?:list|items)?',
  ];
  const askRe = new RegExp(`(?:${askPatterns.join('|')})`, 'i');
  return askRe.test(aiText);
}

/**
 * 检测用户是否想要"继续推荐更多商品"（追问场景）。
 * 例如："再给我推荐10个", "再来5个", "还有吗", "再推荐一些"
 * 
 * 返回对象包含：
 * - isContinueRequest: 是否是继续推荐请求
 * - requestedCount: 用户要求的数量（默认10，解析不到数字时）
 * - originalCategory: 从对话历史中推断的原始类目（如果有）
 */
export function detectContinueRecommendationIntent(text, prevMessages) {
  const t = String(text || '').trim();
  
  // 继续推荐的模式："再...", "再来", "再推荐", "再给我", "还要", "还有吗", "多来", "more"
  const continuePatterns = [
    /再[来推荐给拿]?\s*(\d+)?\s*[个款个件只种]*(?:商品|产品|货|东西|推荐)?/i,
    /再[来推荐给拿]?\s*(\d+)?\s*(?:个|款|件|只|种|piece|items?)?/i,
    /[还再][要来给拿]?\s*(\d+)?\s*[个款个件只种]*(?:商品|产品|货|东西|推荐)?/i,
    /多[来推荐给拿]?\s*(\d+)?\s*[个款个件只种]*(?:商品|产品|货|东西|推荐)?/i,
    /(?:more|additional|another)\s+(\d+)?\s*(?:product|item|recommendation)?/i,
    /还有[吗嘛]*\s*(\d+)?/i,
    /再[多来]?\s*一些/i,
    /再[来]?\s*几个/i,
    /(?:给|再).*(?:几个|一些|更多)/i,
  ];
  
  let isContinueRequest = false;
  let requestedCount = 10; // 默认数量
  
  for (const pattern of continuePatterns) {
    const match = t.match(pattern);
    if (match) {
      isContinueRequest = true;
      // 尝试提取数字
      if (match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > 0 && num <= 50) {
          requestedCount = num;
        }
      }
      break;
    }
  }
  
  // 如果不是继续推荐模式，检查是否是简短追问但上一轮有产品推荐
  if (!isContinueRequest && prevMessages && prevMessages.length > 0) {
    // 检查上一轮AI是否展示了产品
    const lastAiProductMsg = [...prevMessages].reverse().find(
      (m) => m.role === 'ai' && (m.type === 'products_trend' || m.type === 'products') && m.data?.length > 0
    );
    
    // 如果是简短追问如"还有吗","再来点","多几个"
    if (lastAiProductMsg && /^(还有[吗嘛]?|再来[点些]?|多[一些点]|再来|继续|more|and\?|others\?)$/i.test(t)) {
      isContinueRequest = true;
      requestedCount = 10;
    }
  }
  
  // 从历史消息中提取原始类目
  let originalCategory = null;
  if (isContinueRequest && prevMessages && prevMessages.length > 0) {
    // 查找最近的用户查询中提到的具体类目
    const recentUserQueries = [...prevMessages]
      .reverse()
      .filter((m) => m.role === 'user' && m.type === 'text')
      .slice(0, 5)
      .map((m) => String(m.content || ''));
    
    for (const query of recentUserQueries) {
      const cats = detectCategories(query);
      if (cats.length > 0) {
        originalCategory = cats[0].label;
        break;
      }
      // 如果没有匹配到类目，尝试提取关键词
      if (queryHasConcreteProductIntent(query)) {
        originalCategory = query;
        break;
      }
    }
  }
  
  return {
    isContinueRequest,
    requestedCount,
    originalCategory,
  };
}

/**
 * 构建"无更多商品"时的引导消息
 */
export function buildNoMoreProductsMessage(uiLang, searchKeywords) {
  if (uiLang === 'zh') {
    const keywordPart = searchKeywords ? `「${searchKeywords}」` : '这类商品';
    return `我已展示了所有符合条件的${keywordPart}。如需查看更多货源，可以在 Tangbuy 搜索平台尝试查找**同款或相似款**：`;
  }
  const keywordPart = searchKeywords || 'products';
  return `I've shown all available ${keywordPart} that match your criteria. You can search for more **similar items** on Tangbuy:`;
}
