/**
 * Tangbuy 货源向：中文品名/场景 → 英文搜索词（主流跨境类目）
 * 长词优先替换，避免整句泛译成行业术语或医学词。
 */

function sortPhrasesLongestZhFirst(pairs) {
  return [...pairs].sort((a, b) => b[0].length - a[0].length);
}

/** @type {readonly [string, string][]} */
const RAW_ZH_EN = [
  // ── 母婴孕产 ──
  ['一次性产褥垫', 'disposable underpad'],
  ['产后护理套装', 'postpartum care kit'],
  ['计量型卫生巾', 'maternity hospital pad'],
  ['产妇卫生巾', 'maternity sanitary pad'],
  ['计量卫生巾', 'maternity hospital pad'],
  ['私处冲洗器', 'peri bottle'],
  ['会阴冲洗器', 'peri bottle'],
  ['阴道冲洗器', 'peri bottle'],
  ['防溢乳垫', 'nursing breast pads'],
  ['一次性内裤', 'disposable postpartum underwear'],
  ['暖宫贴', 'uterus warming patch'],
  ['收腹带', 'postpartum belly band'],
  ['骨盆带', 'postpartum pelvic belt'],
  ['束腹带', 'postpartum belly band'],
  ['产褥垫', 'disposable underpad'],
  ['产坛垫', 'disposable underpad'],
  ['吸奶器', 'breast pump'],
  ['哺乳内衣', 'nursing bra'],
  ['哺乳枕', 'nursing pillow'],
  ['刀纸', 'maternity tissue paper'],
  ['月子服', 'maternity pajamas'],
  ['产后护理', 'postpartum care essentials'],
  ['护理垫', 'disposable underpad'],
  ['婴儿推车', 'baby stroller'],
  ['儿童安全座椅', 'baby car seat'],
  ['辅食碗', 'baby feeding bowl'],
  ['奶瓶消毒器', 'baby bottle sterilizer'],
  ['尿布台', 'baby changing table'],
  ['学步车', 'baby walker'],
  ['腰凳', 'baby hip seat carrier'],

  // ── 宠物 ──
  ['宠物自动喂食器', 'automatic pet feeder'],
  ['自动喂食器', 'automatic pet feeder'],
  ['宠物饮水机', 'pet water fountain'],
  ['猫爬架', 'cat tree tower'],
  ['猫抓板', 'cat scratch board'],
  ['猫砂盆', 'cat litter box'],
  ['封闭式猫砂盆', 'covered litter box'],
  ['宠物尿垫', 'puppy training pads'],
  ['狗窝', 'dog bed'],
  ['宠物背包', 'pet carrier backpack'],
  ['伊丽莎白圈', 'pet recovery cone'],
  ['宠物吹水机', 'pet dryer blower'],
  ['牵引绳', 'dog leash'],
  ['胸背带', 'dog harness'],

  // ── 运动健身 ──
  ['瑜伽垫', 'yoga mat'],
  ['瑜伽砖', 'yoga block'],
  ['瑜伽球', 'yoga ball'],
  ['弹力带', 'resistance band'],
  ['拉力绳', 'resistance tube'],
  ['哑铃', 'dumbbell'],
  ['壶铃', 'kettlebell'],
  ['跳绳', 'jump rope'],
  ['筋膜枪', 'massage gun'],
  ['泡沫轴', 'foam roller'],
  ['护膝', 'knee brace support'],
  ['护腕', 'wrist support brace'],
  ['运动水壶', 'sports water bottle'],
  ['跑步腰包', 'running belt bag'],
  ['健身手套', 'gym gloves'],
  ['动感单车垫', 'exercise bike mat'],

  // ── 家居厨房 ──
  ['空气炸锅', 'air fryer'],
  ['电压力锅', 'electric pressure cooker'],
  ['不粘锅', 'non stick frying pan'],
  ['炒锅', 'wok pan'],
  ['保温杯', 'vacuum insulated tumbler'],
  ['咖啡机', 'espresso coffee machine'],
  ['磨豆机', 'coffee grinder'],
  ['砧板', 'bamboo cutting board'],
  ['菜刀', 'kitchen chef knife'],
  ['收纳箱', 'storage bin with lid'],
  ['收纳盒', 'storage organizer box'],
  ['真空压缩袋', 'vacuum storage bags'],
  ['衣架', 'velvet clothes hangers'],
  ['晾衣架', 'drying rack laundry'],
  ['乳胶枕', 'latex pillow'],
  ['记忆枕', 'memory foam pillow'],
  ['香薰机', 'essential oil diffuser'],
  ['加湿器', 'humidifier'],
  ['除螨仪', 'bed vacuum cleaner'],
  ['扫地机器人配件', 'robot vacuum parts'],

  // ── 美妆个护 ──
  ['化妆刷套装', 'makeup brush set'],
  ['美妆蛋', 'makeup sponge beauty blender'],
  ['睫毛夹', 'eyelash curler'],
  ['假睫毛', 'false eyelashes'],
  ['美甲灯', 'uv nail lamp'],
  ['美甲套装', 'nail art kit'],
  ['洁面仪', 'facial cleansing brush'],
  ['卷发棒', 'hair curling wand'],
  ['直发梳', 'hair straightener brush'],
  ['电吹风', 'hair dryer'],
  ['剃须刀', 'electric shaver'],
  ['足浴盆', 'foot spa massager'],

  // ── 数码配件 ──
  ['手机支架', 'phone stand holder'],
  ['手机壳', 'phone case cover'],
  ['数据线', 'usb charging cable'],
  ['快充头', 'fast charging wall charger'],
  ['无线充电器', 'wireless charging pad'],
  ['充电宝', 'power bank portable charger'],
  ['蓝牙耳机', 'wireless earbuds'],
  ['头戴耳机', 'over ear headphones'],
  ['平板支架', 'tablet stand holder'],
  ['笔记本支架', 'laptop stand riser'],
  ['鼠标垫', 'mouse pad desk mat'],
  ['键盘清洁胶', 'keyboard cleaning gel'],
  ['智能手表表带', 'smartwatch band strap'],

  // ── 汽摩配 ──
  ['车载手机支架', 'car phone holder mount'],
  ['行车记录仪', 'dash cam car camera'],
  ['车载充电器', 'car charger adapter'],
  ['车载吸尘器', 'car vacuum cleaner'],
  ['后备箱收纳', 'car trunk organizer'],
  ['方向盘套', 'steering wheel cover'],
  ['座椅腰靠', 'lumbar support cushion car'],

  // ── 户外露营 ──
  ['露营睡袋', 'camping sleeping bag'],
  ['四季睡袋', 'four season sleeping bag'],
  ['露营推车', 'camping wagon cart'],
  ['折叠露营车', 'folding camping wagon'],
  ['露营灯', 'camping lantern led'],
  ['便携式露营灯', 'portable camping lantern'],
  ['防潮垫', 'camping ground mat'],
  ['户外炊具套装', 'camping cookware set'],
  ['露营炊具', 'camping cookware'],
  ['露营帐篷', 'camping tent'],
  ['天幕', 'camping tarp canopy'],
  ['睡袋', 'sleeping bag camping'],
  ['户外折叠椅', 'camping folding chair'],
  ['登山杖', 'trekking hiking poles'],
  ['野餐垫', 'picnic blanket mat'],

  // ── 玩具 hobby ──
  ['积木', 'building blocks bricks'],
  ['拼图', 'jigsaw puzzle'],
  ['遥控车', 'rc car toy'],
  ['毛绒玩具', 'plush stuffed toy'],
  ['泡泡机', 'bubble machine toy'],

  // ── 办公文具 ──
  ['笔记本', 'spiral notebook'],
  ['便利贴', 'sticky notes pad'],
  ['文件收纳架', 'desk file organizer'],
  ['显示器增高架', 'monitor stand riser'],

  // ── 园艺 ──
  ['园艺工具套装', 'garden tool set'],
  ['喷壶', 'watering can garden'],
  ['种植袋', 'grow bag planter'],

  // ── 健康食品（可搜 SKU）──
  ['蛋白粉', 'whey protein powder'],
  ['胶原蛋白', 'collagen powder supplement'],
  ['维生素软糖', 'vitamin gummies'],
  ['益生菌', 'probiotic supplement'],

  // ── 服饰鞋包（常见款）──
  ['托特包', 'tote bag canvas'],
  ['腰包', 'fanny pack waist bag'],
  ['双肩包', 'backpack laptop'],
  ['行李箱', 'carry on luggage suitcase'],
  ['防晒衣', 'upf sun protection jacket'],
];

export const TANGBUY_ZH_EN_PRODUCT_PHRASES = sortPhrasesLongestZhFirst(RAW_ZH_EN);

/** 英译后仍可能混入的「非货源检索」词（医学/论文用语等） */
export const ACADEMIC_JUNK_SEARCH_TOKENS = new Set([
  'lochia',
  'perineal',
  'perineum',
  'hemorrhage',
  'dyspareunia',
  'lochiaal',
  'pathophysiology',
  'etiology',
  'carcinoma',
  'benign',
  'malignant',
]);

/**
 * 抽不到具体品名时，按对话里暴露的行业给一组英文货源词（与短语表一致、可直搜）。
 * 顺序：先匹配更具体的规则。
 */
export const TANGBUY_INDUSTRY_DEFAULT_KEYWORDS = [
  {
    test: /(产后|产妇|月子|哺乳|母婴|孕产|postpartum|maternity|nursing\s*pads?|breast\s*pump)/i,
    keywords: [
      'postpartum care kit',
      'disposable underpad',
      'maternity sanitary pad',
      'peri bottle',
      'uterus warming patch',
    ],
  },
  {
    test: /(宠物|猫砂|狗粮|猫粮|狗绳|猫爬架|铲屎官|pet\s*supplies|cat\s*tree|dog\s*leash)/i,
    keywords: ['pet supplies', 'cat tree tower', 'automatic pet feeder', 'dog harness', 'puppy training pads'],
  },
  {
    test: /(瑜伽|健身|运动|跑步|哑铃|筋膜枪|yoga|gym|fitness|workout|resistance\s*band)/i,
    keywords: ['yoga mat', 'resistance band', 'massage gun', 'sports water bottle', 'jump rope'],
  },
  {
    test: /(厨房|烹饪|咖啡|空气炸锅|保温杯|收纳|家居|kitchen|cookware|air\s*fryer|storage\s*bin)/i,
    keywords: ['air fryer', 'non stick frying pan', 'vacuum storage bags', 'essential oil diffuser', 'kitchen organizer'],
  },
  {
    test: /(美妆|护肤|化妆|口红|面膜|美甲|makeup|skincare|cosmetic|beauty)/i,
    keywords: ['makeup brush set', 'false eyelashes', 'makeup sponge', 'hair curling wand', 'uv nail lamp'],
  },
  {
    test: /(手机|耳机|充电|数据线|平板|笔记本支架|phone\s*case|charger|earbuds|usb\s*cable)/i,
    keywords: ['phone stand holder', 'wireless earbuds', 'usb charging cable', 'power bank', 'tablet stand holder'],
  },
  {
    test: /(车载|汽车|行车记录|dash\s*cam|car\s*phone|trunk)/i,
    keywords: ['car phone holder mount', 'dash cam car camera', 'car vacuum cleaner', 'car trunk organizer'],
  },
  {
    test: /(露营|户外|野营|帐篷|睡袋|天幕|防潮垫|炊具|徒步|camping|hiking|tent|sleeping\s*bag|glamping)/i,
    keywords: [
      'camping tent',
      'camping sleeping bag',
      'camping lantern led',
      'camping wagon cart',
      'camping cookware set',
    ],
  },
  {
    test: /(婴儿|宝宝|儿童|奶瓶|推车|尿布|baby|toddler|stroller|diaper)/i,
    keywords: ['baby stroller', 'baby bottle', 'baby carrier', 'baby wipes', 'convertible car seat baby'],
  },
  {
    test: /(玩具|积木|拼图|毛绒|toy|plush|puzzle|lego|blocks)/i,
    keywords: ['building blocks bricks', 'plush stuffed toy', 'jigsaw puzzle', 'rc car toy'],
  },
  {
    test: /(办公|文具|笔记本|显示器支架|desk|office|notebook|monitor\s*stand)/i,
    keywords: ['desk file organizer', 'monitor stand riser', 'spiral notebook', 'mouse pad desk mat'],
  },
  {
    test: /(园艺|花园|种植|喷壶|garden|planter|watering)/i,
    keywords: ['garden tool set', 'watering can garden', 'grow bag planter'],
  },
  {
    test: /(保健|营养|蛋白|维生素|supplement|protein|vitamin|collagen|probiotic)/i,
    keywords: ['whey protein powder', 'vitamin gummies', 'collagen powder supplement', 'probiotic supplement'],
  },
  {
    test: /(服装|服饰|包包|行李箱|鞋|牛仔裤|背包|tote|backpack|luggage|sneakers|jeans)/i,
    keywords: ['canvas tote bag', 'laptop backpack', 'carry on luggage', 'sneakers women men', 'high waist jeans'],
  },
];

/**
 * @param {string} blob
 * @returns {string[] | null}
 */
export function getIndustryDefaultEnglishKeywords(blob) {
  const s = String(blob || '').slice(0, 2000);
  for (const row of TANGBUY_INDUSTRY_DEFAULT_KEYWORDS) {
    if (row.test.test(s)) return row.keywords;
  }
  return null;
}
