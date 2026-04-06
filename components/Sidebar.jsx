import React from 'react';
import { isAnonymousUser } from '../utils/supabaseAuth.js';
import { createPortal } from 'react-dom';
import { GoogleGIcon, FacebookIcon, TikTokIcon, YouTubeIcon, WhatsAppIcon } from './BrandSocialIcons.jsx';
import { FIND_US_WHATSAPP_URL } from '../utils/socialLinks.js';

const FIND_US_LINKS = [
  { key: 'tiktok', ariaLabel: 'TikTok', href: 'https://www.tiktok.com/@tangbuy_com', Icon: TikTokIcon },
  { key: 'youtube', ariaLabel: 'YouTube', href: 'https://www.youtube.com/@TangbuyDropshipping', Icon: YouTubeIcon },
  { key: 'facebook', ariaLabel: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61579006720346', Icon: FacebookIcon },
  { key: 'whatsapp', ariaLabel: 'WhatsApp', href: FIND_US_WHATSAPP_URL, Icon: WhatsAppIcon },
];

const INTENT_RULES = [
  { re: /https?:\/\/[^\s]+/i, fn: (m) => { try { return '🔍 ' + new URL(m.match(/https?:\/\/[^\s]+/)[0]).hostname.replace('www.', ''); } catch { return '🔍 网站分析'; } } },
  { re: /seo|搜索引擎|关键词|meta|标题优化|title\s*tag/i, label: '🔎 SEO 优化' },
  { re: /诊断|分析.*店铺|店铺.*分析|diagnos|audit/i, label: '🏪 店铺诊断' },
  { re: /详情页|产品页|landing\s*page|detail\s*page|描述.*生成/i, label: '📄 详情页生成' },
  { re: /广告|投放|facebook.*ad|google.*ad|tiktok.*ad|campaign/i, label: '📢 广告策略' },
  { re: /选品|推荐.*商品|热门.*产品|trending|best\s*sell|爆款/i, label: '🛒 选品推荐' },
  { re: /物流|发货|运费|shipping|fulfillment|退货|退换/i, label: '📦 物流方案' },
  { re: /定价|价格.*策略|竞品|pricing|competitor/i, label: '💰 定价分析' },
  { re: /支付|payment|stripe|paypal|合规|compliance/i, label: '💳 支付合规' },
  { re: /邮件|email|edm|newsletter|生命周期/i, label: '✉️ EDM 策略' },
  { re: /红人|kol|influencer|联盟|affiliate/i, label: '🤝 红人联盟' },
  { re: /社媒|social|ins|instagram|tiktok.*运营|facebook.*运营/i, label: '📱 社媒运营' },
  { re: /转化率|cro|a\/b.*test|实验|conversion/i, label: '📊 CRO 优化' },
  { re: /多语言|本地化|翻译|locali[sz]/i, label: '🌐 本地化' },
  { re: /客服|售后|客户服务|customer\s*service/i, label: '🎧 客服方案' },
  { re: /数据|analytics|归因|attribution|报表/i, label: '📈 数据分析' },
];

// AI response title extraction rules - more specific than user intent
const AI_TITLE_RULES = [
  { re: /法国.*热卖|法国.*趋势|法国.*市场/i, label: '法国热卖趋势' },
  { re: /德国.*热卖|德国.*趋势|德国.*市场/i, label: '德国热卖趋势' },
  { re: /美国.*热卖|美国.*趋势|美国.*市场/i, label: '美国热卖趋势' },
  { re: /英国.*热卖|英国.*趋势|英国.*市场/i, label: '英国热卖趋势' },
  { re: /选品.*推荐|产品.*推荐|商品.*推荐/i, label: '选品推荐' },
  { re: /SEO.*优化|关键词.*优化|搜索.*优化/i, label: 'SEO优化' },
  { re: /店铺.*诊断|店铺.*分析|网站.*分析/i, label: '店铺诊断' },
  { re: /定价.*策略|价格.*分析|竞品.*分析/i, label: '定价分析' },
  { re: /广告.*策略|投放.*策略|推广.*方案/i, label: '广告策略' },
  { re: /详情页.*生成|产品页.*描述|Landing.*Page/i, label: '详情页生成' },
  { re: /物流.*方案|发货.*方案|运费.*分析/i, label: '物流方案' },
  { re: /红人.*合作|KOL.*营销|联盟.*营销/i, label: '红人营销' },
  { re: /社媒.*运营|社交.*媒体|TikTok.*运营/i, label: '社媒运营' },
  { re: /邮件.*营销|EDM.*策略|Newsletter/i, label: '邮件营销' },
  { re: /转化率.*优化|CRO.*优化|A\/B.*测试/i, label: '转化率优化' },
  { re: /GEO|生成式搜索|generative search|answer engine/i, label: 'GEO优化' },
  { re: /多语言|本地化|翻译.*服务/i, label: '本地化' },
  { re: /客服.*方案|售后.*服务|客户.*支持/i, label: '客服方案' },
  { re: /数据.*分析|报表.*分析|归因.*分析/i, label: '数据分析' },
  { re: /支付.*方案|合规.*方案|Stripe.*PayPal/i, label: '支付合规' },
];

/** 至少有一条有效 AI 回复后才出现在侧栏（新建未回复的对话不单独占一行） */
function conversationHasAiResponse(conv) {
  const msgs = conv?.messages || [];
  return msgs.some((m) => {
    if (m.role !== 'ai') return false;
    if (m.type === 'products_hot' || m.type === 'products_trend' || m.type === 'search_picks') {
      const hasData = m.data && (Array.isArray(m.data) ? m.data.length > 0 : Object.keys(m.data || {}).length > 0);
      const hasText = typeof m.content === 'string' && m.content.trim().length > 0;
      return hasData || hasText;
    }
    const c = m.content ?? m.text ?? '';
    return typeof c === 'string' && c.trim().length > 0;
  });
}

function getUserText(m) {
  if (!m || m.role !== 'user') return '';
  const c = m.content ?? m.text ?? '';
  return typeof c === 'string' ? c : '';
}

/** 首条仅为寒暄、无实质主题时不拿来命名 */
function isTrivialUserMessage(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (t.length > 100) return false;
  if (/https?:\/\//i.test(t)) return false;
  return (
    /^(你好|您好|嗨|哈喽|在吗|在么|早上好|下午好|晚上好|早安|午安|晚安|hi|hello|hey)(\s*[!！?？。,.，])*$/i.test(t)
    || /^(ok|okay|thanks|thank you|谢了|谢谢|好的|好滴|嗯|嗯嗯|行|可以)([.!！,，]?)$/i.test(t)
  );
}

/** 首轮 AI 客套回复，避免把「有什么可以帮您」当成标题 */
function isGenericAiGreeting(text) {
  const raw = String(text || '');
  const t = raw.replace(/```[\s\S]*?```/g, '').replace(/<[^>]*>/g, '').trim();
  if (/\bhttps?:\/\//i.test(t)) return false;
  if (/###\s|店铺|诊断|SEO|选品|爆款|趋势|报告|商品|定价|广告|物流|履约|Shopify|独立站|亚马逊|TikTok/i.test(t)) return false;
  if (t.length > 220) return false;
  return (
    /有什么(可以)?帮助[您你]?/.test(t)
    || /需要(我)?(帮您)?做什么/.test(t)
    || /how can i help/i.test(t)
    || /what can i (do|help)/i.test(t)
    || /^您好[！!，,。.…\s]*$/.test(t)
    || /^你好[！!，,。.…\s]*$/.test(t)
    || /^hello[!,.，。\s]*$/i.test(t)
    || /^hi[!,.，。\s]*$/i.test(t)
    || /^hey[!,.，。\s]*$/i.test(t)
    || /很高兴(为)?您?服务/.test(t)
    || (t.length < 90 && /^我是.{0,12}(助手|AI|助理)/.test(t))
  );
}

function titleFromAiContent(aiContent) {
  const cleanAiContent = String(aiContent || '').replace(/```[\s\S]*?```/g, '').replace(/<[^>]*>/g, '').slice(0, 800);
  for (const rule of AI_TITLE_RULES) {
    if (rule.re.test(cleanAiContent)) return rule.label;
  }
  const firstSentence = cleanAiContent.split(/[。！？.!?\n]/)[0].trim();
  if (firstSentence && firstSentence.length >= 8 && firstSentence.length <= 28) {
    const cleaned = firstSentence.replace(/^(以下是|这是|根据|关于|针对|基于|根据您|针对您|当然|好的|您好|你好)[，,：:\s]*/, '').trim();
    if (cleaned.length >= 6 && cleaned.length <= 28 && !isGenericAiGreeting(cleaned)) {
      return cleaned.length <= 20 ? cleaned : `${cleaned.slice(0, 18)}…`;
    }
  }
  return null;
}

/**
 * 从新到旧扫描整段对话：优先 URL/意图，再非寒暄的 AI 摘要，再实质用户句；无则中性默认名。
 * @param {string} uiLang 'zh' | 其他 → 默认标题语言
 */
function generateSmartName(messages, uiLang = 'zh') {
  if (!messages?.length) return null;
  const defaultLabel = uiLang === 'zh' ? '💬 新对话' : '💬 New chat';

  const users = messages.filter((m) => m.role === 'user');
  const ais = messages.filter((m) => m.role === 'ai');

  for (let i = users.length - 1; i >= 0; i--) {
    const txt = getUserText(users[i]);
    if (isTrivialUserMessage(txt)) continue;
    for (const rule of INTENT_RULES) {
      if (rule.re.test(txt)) {
        return typeof rule.fn === 'function' ? rule.fn(txt) : rule.label;
      }
    }
  }

  for (let i = ais.length - 1; i >= 0; i--) {
    const m = ais[i];
    const aiContent = m.content || m.text || '';
    if (isGenericAiGreeting(aiContent)) continue;
    if (m.type === 'products_hot' || m.type === 'products_trend' || m.type === 'search_picks') {
      return uiLang === 'zh' ? '🛒 Tangbuy 搜索推荐' : '🛒 Tangbuy search picks';
    }
    const fromAi = titleFromAiContent(aiContent);
    if (fromAi) return fromAi;
  }

  for (let i = users.length - 1; i >= 0; i--) {
    const txt = getUserText(users[i]);
    if (isTrivialUserMessage(txt)) continue;
    const cleaned = txt.replace(/https?:\/\/[^\s]+/g, '').replace(/[^\w\u4e00-\u9fff\s]/g, ' ').trim();
    if (cleaned.length >= 2 && cleaned.length <= 36) {
      return cleaned.length <= 20 ? cleaned : `${cleaned.slice(0, 18)}…`;
    }
  }

  return defaultLabel;
}

export default function Sidebar({
  conversations, activeId, onSelect, onNew, onDelete, onRename, isOpen, onClose, onHotProducts, onSourcing, onAIReports, onMyLists, activeView, uiLang, collapsed, onToggleCollapse,
  supabaseReady, authUser, onOpenAuthModal, onLinkGoogle, onLinkFacebook, onSignOut, onSwitchAccount, myListsCount,
}) {
  const [editingId, setEditingId] = React.useState(null);
  const [editValue, setEditValue] = React.useState('');
  const editRef = React.useRef(null);
  const [convPickerOpen, setConvPickerOpen] = React.useState(false);
  const [pickerPos, setPickerPos] = React.useState({ top: 0, left: 0 });
  const convPickerBtnRef = React.useRef(null);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const userChipRef = React.useRef(null);
  const asideRef = React.useRef(null);
  const [userMenuPos, setUserMenuPos] = React.useState({ bottom: 80, left: 16, width: 240 });

  const isGuest = authUser && isAnonymousUser(authUser);
  const notSignedInLabel = uiLang === 'zh' ? '未登录' : 'Not signed in';
  const userDisplayName = isGuest
    ? notSignedInLabel
    : (authUser?.user_metadata?.full_name
      || authUser?.user_metadata?.name
      || authUser?.email?.split('@')[0]
      || '');
  const avatarUrl = !isGuest && (authUser?.user_metadata?.avatar_url || authUser?.user_metadata?.picture);
  const userInitial = isGuest
    ? (uiLang === 'zh' ? '未' : 'N')
    : (userDisplayName || '?').slice(0, 1).toUpperCase();

  const updateUserMenuPos = React.useCallback(() => {
    const chip = userChipRef.current;
    const aside = asideRef.current;
    if (!chip || !aside) return;
    const ar = aside.getBoundingClientRect();
    const cr = chip.getBoundingClientRect();
    const bottom = window.innerHeight - cr.top + 8;
    const pad = 6;
    const maxInSidebar = Math.max(160, ar.width - pad * 2);
    // 收起为窄栏时：菜单贴在侧栏右侧展开，避免内容挤在 60px 内
    if (ar.width < 120) {
      const w = Math.min(260, window.innerWidth - ar.right - 16);
      setUserMenuPos({
        bottom,
        left: ar.right + 8,
        width: Math.max(200, w),
      });
      return;
    }
    setUserMenuPos({
      bottom,
      left: ar.left + pad,
      width: Math.min(248, maxInSidebar),
    });
  }, []);

  React.useEffect(() => {
    if (!userMenuOpen) return undefined;
    updateUserMenuPos();
    const onScroll = () => updateUserMenuPos();
    const onResize = () => updateUserMenuPos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    const onDoc = (e) => {
      if (userChipRef.current?.contains(e.target)) return;
      if (e.target.closest?.('[data-user-menu]')) return;
      setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [userMenuOpen, updateUserMenuPos]);

  const listedConversations = React.useMemo(
    () => conversations.filter(conversationHasAiResponse),
    [conversations]
  );

  React.useEffect(() => {
    if (!convPickerOpen) return;
    const onDoc = (e) => {
      if (convPickerBtnRef.current?.contains(e.target)) return;
      if (e.target.closest?.('[data-conv-picker-menu]')) return;
      setConvPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [convPickerOpen]);

  const toggleConvPicker = () => {
    setConvPickerOpen((prev) => {
      const next = !prev;
      if (next && convPickerBtnRef.current) {
        const r = convPickerBtnRef.current.getBoundingClientRect();
        setPickerPos({ top: Math.max(8, r.top - 4), left: r.right + 6 });
      }
      return next;
    });
  };

  const pickConversation = (id) => {
    onSelect(id);
    setConvPickerOpen(false);
    onClose?.();
  };

  React.useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  const startEditing = (conv) => {
    const currentName = conv.customName || generateSmartName(conv.messages, uiLang) || conv.defaultName || 'New Chat';
    setEditingId(conv.id);
    setEditValue(currentName);
  };

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      onRename?.(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue('');
  };

  return (
    <>
      {isOpen && (
        <div onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 80 }}
          className="md:hidden"
        />
      )}

      <aside ref={asideRef} style={{
        width: collapsed ? 60 : 260, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--theme-bg-secondary)', borderRight: '1px solid var(--theme-border)',
        transition: 'width 0.25s ease, transform 0.25s ease, background 0.3s', zIndex: 90, overflow: 'hidden',
        ...(isOpen ? { position: 'fixed', top: 0, left: 0, bottom: 0, transform: 'translateX(0)', width: 260 } : {}),
      }} className={!isOpen ? 'hidden md:flex' : ''}>

        {/* Brand */}
        <div style={{ padding: collapsed ? '16px 0 8px' : '16px 14px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <img
            src="https://app.trickle.so/storage/public/images/usr_15ab72f5c8000001/4a22292f-b213-4428-ad3e-e5ae67149629.Tangbuy logo 2"
            alt="Tangbuy"
            style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2, color: 'var(--theme-text)', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                Tangbuy <span style={{ color: 'var(--brand-primary-fixed)' }}>Dropshipping</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--theme-text-muted)', lineHeight: 1.4, marginTop: 2, whiteSpace: 'nowrap' }}>
                Built for Brands That Want to Scale
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: collapsed ? '8px 8px 12px' : '8px 14px 12px', borderBottom: '1px solid var(--theme-border)', flexShrink: 0 }}>
          <button onClick={() => { onNew(); onClose?.(); }}
            title="New Chat"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 8, padding: collapsed ? '10px 0' : '10px 12px', borderRadius: 10,
              background: 'transparent', color: 'var(--theme-text)', border: 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--brand-primary-fixed) 8%, transparent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span className="icon-plus text-[14px]" style={collapsed ? { color: 'var(--brand-primary-fixed)' } : undefined} />
            {!collapsed && <span>New Chat</span>}
          </button>
          <button onClick={() => { onHotProducts?.(); onClose?.(); }}
            title={uiLang === 'zh' ? '商品搜索' : 'Product Search'}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 8, padding: '10px 12px', borderRadius: activeView === 'hotProducts' ? 10 : 0, marginTop: 8,
              background: activeView === 'hotProducts' ? 'color-mix(in srgb, var(--brand-primary-fixed) 10%, transparent)' : 'transparent',
              color: activeView === 'hotProducts' ? 'var(--brand-primary-fixed)' : 'var(--theme-text)',
              border: activeView === 'hotProducts' ? '1px solid color-mix(in srgb, var(--brand-primary-fixed) 15%, transparent)' : 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { if (activeView !== 'hotProducts') e.currentTarget.style.background = 'color-mix(in srgb, var(--brand-primary-fixed) 5%, transparent)'; }}
            onMouseLeave={(e) => { if (activeView !== 'hotProducts') e.currentTarget.style.background = 'transparent'; }}
          >
            <span className="icon-flame text-[14px]" style={collapsed ? { color: 'var(--brand-primary-fixed)' } : undefined} />
            {!collapsed && <span>{uiLang === 'zh' ? '商品搜索' : 'Product Search'}</span>}
          </button>
          <button onClick={() => { onSourcing?.(); onClose?.(); }}
            title={uiLang === 'zh' ? '寻源采购' : 'Sourcing'}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 8, padding: collapsed ? '10px 0' : '10px 12px', borderRadius: activeView === 'sourcing' ? 10 : 0, marginTop: 8,
              background: activeView === 'sourcing' ? 'color-mix(in srgb, var(--brand-primary-fixed) 10%, transparent)' : 'transparent',
              color: activeView === 'sourcing' ? 'var(--brand-primary-fixed)' : 'var(--theme-text)',
              border: activeView === 'sourcing' ? '1px solid color-mix(in srgb, var(--brand-primary-fixed) 15%, transparent)' : 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { if (activeView !== 'sourcing') e.currentTarget.style.background = 'color-mix(in srgb, var(--brand-primary-fixed) 5%, transparent)'; }}
            onMouseLeave={(e) => { if (activeView !== 'sourcing') e.currentTarget.style.background = 'transparent'; }}
          >
            <span className="icon-package text-[14px]" style={collapsed ? { color: 'var(--brand-primary-fixed)' } : undefined} />
            {!collapsed && <span>{uiLang === 'zh' ? '寻源采购' : 'Sourcing'}</span>}
          </button>
          <button onClick={() => { onAIReports?.(); onClose?.(); }}
            title={uiLang === 'zh' ? 'AI报告' : 'AI Reports'}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 8, padding: '10px 12px', borderRadius: activeView === 'aiReports' ? 10 : 0, marginTop: 8,
              background: activeView === 'aiReports' ? 'color-mix(in srgb, var(--brand-primary-fixed) 10%, transparent)' : 'transparent',
              color: activeView === 'aiReports' ? 'var(--brand-primary-fixed)' : 'var(--theme-text)',
              border: activeView === 'aiReports' ? '1px solid color-mix(in srgb, var(--brand-primary-fixed) 15%, transparent)' : 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { if (activeView !== 'aiReports') e.currentTarget.style.background = 'color-mix(in srgb, var(--brand-primary-fixed) 5%, transparent)'; }}
            onMouseLeave={(e) => { if (activeView !== 'aiReports') e.currentTarget.style.background = 'transparent'; }}
          >
            <span className="icon-file-text text-[14px]" style={collapsed ? { color: 'var(--brand-primary-fixed)' } : undefined} />
            {!collapsed && <span>{uiLang === 'zh' ? 'AI报告' : 'AI Reports'}</span>}
          </button>
          <button onClick={() => { onMyLists?.(); onClose?.(); }}
            title={uiLang === 'zh' ? '我的列表' : 'My Lists'}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 8, padding: collapsed ? '10px 0' : '10px 12px', borderRadius: activeView === 'myLists' ? 10 : 0, marginTop: 8,
              background: activeView === 'myLists' ? 'color-mix(in srgb, var(--brand-primary-fixed) 10%, transparent)' : 'transparent',
              color: activeView === 'myLists' ? 'var(--brand-primary-fixed)' : 'var(--theme-text)',
              border: activeView === 'myLists' ? '1px solid color-mix(in srgb, var(--brand-primary-fixed) 15%, transparent)' : 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
            }}
            onMouseEnter={(e) => { if (activeView !== 'myLists') e.currentTarget.style.background = 'color-mix(in srgb, var(--brand-primary-fixed) 5%, transparent)'; }}
            onMouseLeave={(e) => { if (activeView !== 'myLists') e.currentTarget.style.background = 'transparent'; }}
          >
            <span className="icon-bookmark text-[14px]" style={collapsed ? { color: 'var(--brand-primary-fixed)' } : undefined} />
            {!collapsed && <span>{uiLang === 'zh' ? '我的列表' : 'My Lists'}</span>}
            {myListsCount > 0 && (
              <span style={{
                position: collapsed ? 'absolute' : 'static',
                top: collapsed ? 4 : undefined,
                right: collapsed ? 4 : undefined,
                fontSize: 9,
                fontWeight: 700,
                lineHeight: 1,
                padding: '2px 5px',
                borderRadius: 99,
                background: 'var(--brand-primary-fixed)',
                color: '#fff',
                marginLeft: collapsed ? 0 : 'auto',
              }}>{myListsCount}</span>
            )}
          </button>
        </div>

        <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '8px 6px' : '8px 10px' }}>
          {collapsed ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  ref={convPickerBtnRef}
                  type="button"
                  onClick={toggleConvPicker}
                  title={uiLang === 'zh' ? '对话列表' : 'Conversations'}
                  style={{
                    width: 44,
                    height: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 10,
                    border: convPickerOpen || (activeView === 'chat' && listedConversations.some((c) => c.id === activeId))
                      ? '1px solid color-mix(in srgb, var(--brand-primary-fixed) 25%, transparent)'
                      : '1px solid transparent',
                    background: convPickerOpen
                      ? 'color-mix(in srgb, var(--brand-primary-fixed) 12%, transparent)'
                      : 'transparent',
                    cursor: 'pointer',
                    color: 'var(--brand-primary-fixed)',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  <span className="icon-message-square" style={{ fontSize: 18 }} />
                </button>
              </div>
              {convPickerOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 94 }}
                    aria-hidden
                    onClick={() => setConvPickerOpen(false)}
                  />
                  <div
                    data-conv-picker-menu
                    style={{
                      position: 'fixed',
                      zIndex: 95,
                      top: pickerPos.top,
                      left: pickerPos.left,
                      width: 260,
                      maxHeight: Math.min(400, typeof window !== 'undefined' ? window.innerHeight - 24 : 400),
                      overflowY: 'auto',
                      background: 'var(--theme-bg-secondary)',
                      border: '1px solid var(--theme-border)',
                      borderRadius: 10,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      padding: '6px 4px',
                    }}
                  >
                    {listedConversations.length === 0 ? (
                      <div style={{ padding: '12px 10px', fontSize: 12, color: 'var(--theme-text-muted)', textAlign: 'center' }}>
                        {uiLang === 'zh' ? '暂无历史对话' : 'No conversations yet'}
                      </div>
                    ) : (
                      listedConversations.map((conv) => {
                        const isActive = activeView === 'chat' && conv.id === activeId;
                        const displayName = conv.customName || generateSmartName(conv.messages, uiLang) || conv.defaultName || 'New Chat';
                        return (
                          <div
                            key={conv.id}
                            onClick={() => pickConversation(conv.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '10px 10px',
                              borderRadius: 8,
                              cursor: 'pointer',
                              marginBottom: 2,
                              background: isActive ? 'color-mix(in srgb, var(--brand-primary-fixed) 10%, transparent)' : 'transparent',
                              border: isActive ? '1px solid color-mix(in srgb, var(--brand-primary-fixed) 15%, transparent)' : '1px solid transparent',
                            }}
                          >
                            <span className="icon-message-square" style={{ fontSize: 14, color: isActive ? 'var(--brand-primary-fixed)' : 'var(--theme-text-muted)', flexShrink: 0 }} />
                            <span style={{
                              flex: 1,
                              fontSize: 13,
                              fontWeight: isActive ? 600 : 400,
                              color: 'var(--theme-text)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>{displayName}</span>
                            {listedConversations.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onDelete(conv.id); setConvPickerOpen(false); }}
                                style={{ flexShrink: 0, padding: 4, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--theme-text-muted)', fontSize: 12 }}
                              >
                                <span className="icon-trash-2" />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            listedConversations.map((conv) => {
              const isActive = activeView === 'chat' && conv.id === activeId;
              const displayName = conv.customName || generateSmartName(conv.messages, uiLang) || conv.defaultName || 'New Chat';
              const isEditing = editingId === conv.id;

              return (
                <div key={conv.id}
                  onClick={() => { if (!isEditing) { onSelect(conv.id); onClose?.(); } }}
                  onDoubleClick={(e) => { e.stopPropagation(); startEditing(conv); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 12px', borderRadius: isActive ? 10 : 0, cursor: 'pointer', marginBottom: 4,
                    justifyContent: 'flex-start',
                    background: isActive ? 'color-mix(in srgb, var(--brand-primary-fixed) 8%, transparent)' : 'transparent',
                    border: isActive ? '1px solid color-mix(in srgb, var(--brand-primary-fixed) 12%, transparent)' : 'none',
                    transition: 'background 0.15s, border-color 0.15s, border-radius 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'color-mix(in srgb, var(--brand-primary-fixed) 5%, transparent)'; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span className="icon-message-square" style={{ fontSize: 14, color: isActive ? 'var(--brand-primary-fixed)' : 'var(--theme-text-muted)', flexShrink: 0 }} />

                  <>
                    {isEditing ? (
                      <input ref={editRef} value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditingId(null); setEditValue(''); } }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          flex: 1, fontSize: 13, fontWeight: 500, padding: '2px 6px', borderRadius: 6,
                          outline: 'none', minWidth: 0,
                          background: 'var(--theme-input-bg)', border: '1px solid var(--brand-primary-fixed)',
                          color: 'var(--theme-text)',
                        }}
                      />
                    ) : (
                      <span style={{
                        flex: 1, fontSize: 13, fontWeight: isActive ? 600 : 400,
                        color: isActive ? 'var(--theme-text)' : 'var(--theme-text-secondary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }} title="Double-click to rename">{displayName}</span>
                    )}

                    {listedConversations.length > 1 && !isEditing && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                        style={{ flexShrink: 0, padding: 2, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--theme-text-muted)', fontSize: 12, opacity: 0.5, transition: 'opacity 0.15s' }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
                      >
                        <span className="icon-trash-2" />
                      </button>
                    )}
                  </>
                </div>
              );
            })
          )}
        </div>

        {/* Footer: 登录 / 用户头像昵称 + 侧栏折叠（同高、无 Powered by、无边框） */}
        <div style={{
          padding: collapsed ? '10px 6px' : '10px 12px',
          borderTop: '1px solid var(--theme-border)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: collapsed ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: collapsed ? 8 : 8,
        }}>
          <div style={{
            flex: collapsed ? '0 0 auto' : '1 1 0',
            minWidth: 0,
            width: collapsed ? '100%' : undefined,
            display: 'flex',
            alignItems: 'center',
            minHeight: 36,
          }}>
            {supabaseReady && !authUser && (
              <button
                type="button"
                onClick={onOpenAuthModal}
                style={{
                  width: collapsed ? '100%' : '100%',
                  minHeight: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: 8,
                  padding: collapsed ? 0 : '0 4px 0 0',
                  border: 'none',
                  borderRadius: 0,
                  background: 'transparent',
                  color: 'var(--theme-text-secondary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
                title={uiLang === 'zh' ? '登录' : 'Sign in'}
              >
                {collapsed ? (
                  <GoogleGIcon size={22} />
                ) : (
                  <>
                    <GoogleGIcon size={18} />
                    <span>{uiLang === 'zh' ? '登录 / Sign in' : 'Sign in'}</span>
                  </>
                )}
              </button>
            )}
            {supabaseReady && authUser && (
              <button
                ref={userChipRef}
                type="button"
                onClick={() => { updateUserMenuPos(); setUserMenuOpen((v) => !v); }}
                style={{
                  width: '100%',
                  minHeight: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: 8,
                  padding: 0,
                  border: 'none',
                  borderRadius: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                title={isGuest ? notSignedInLabel : (authUser.email || '')}
              >
                {collapsed ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden style={{ flexShrink: 0, color: 'var(--theme-text-secondary)' }}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                ) : (
                  <>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: 'color-mix(in srgb, var(--brand-primary-fixed) 20%, transparent)',
                        color: 'var(--brand-primary-fixed)', fontSize: 12, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{userInitial}</span>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {userDisplayName}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>

          <button
            onClick={onToggleCollapse}
            title={collapsed ? (uiLang === 'zh' ? '展开侧边栏' : 'Expand sidebar') : (uiLang === 'zh' ? '收起侧边栏' : 'Collapse sidebar')}
            style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 0,
              border: 'none',
              flexShrink: 0,
              background: 'transparent',
              color: 'var(--theme-text-muted)',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--theme-text-secondary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--theme-text-muted)'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        </div>
      </aside>

      {userMenuOpen && authUser && createPortal(
        <div
          data-user-menu
          style={{
            position: 'fixed',
            left: userMenuPos.left,
            bottom: userMenuPos.bottom,
            width: userMenuPos.width,
            maxWidth: userMenuPos.width,
            zIndex: 150,
            borderRadius: 12,
            border: '1px solid var(--theme-border)',
            background: 'var(--theme-dropdown-bg)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
            padding: '8px 0',
            maxHeight: 'min(320px, 70vh)',
            overflow: 'hidden',
            overflowY: 'auto',
            boxSizing: 'border-box',
          }}
        >
          {!isGuest && (
            <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid var(--theme-border)', fontSize: 11, color: 'var(--theme-text-muted)', wordBreak: 'break-all', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {authUser.email}
            </div>
          )}
          {isGuest && onLinkGoogle && (
            <button
              type="button"
              onClick={() => { setUserMenuOpen(false); onLinkGoogle(); }}
              style={{
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                fontSize: 12,
                border: 'none',
                background: 'transparent',
                color: 'var(--theme-text)',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <GoogleGIcon size={18} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{uiLang === 'zh' ? '使用 Google 登录' : 'Sign in with Google'}</span>
            </button>
          )}
          {isGuest && onLinkFacebook && (
            <button
              type="button"
              onClick={() => { setUserMenuOpen(false); onLinkFacebook(); }}
              style={{
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                fontSize: 12,
                border: 'none',
                background: 'transparent',
                color: 'var(--theme-text)',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <FacebookIcon size={18} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{uiLang === 'zh' ? '使用 Facebook 登录' : 'Sign in with Facebook'}</span>
            </button>
          )}
          <div
            role="toolbar"
            aria-label={uiLang === 'zh' ? '找到我们 · 社交媒体' : 'Find us · Social links'}
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 14,
              padding: '10px 12px',
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              color: 'var(--theme-text)',
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--theme-text)',
                flexShrink: 0,
                lineHeight: 1.2,
              }}
            >
              {uiLang === 'zh' ? '找到我们' : 'Find us'}
            </span>
            {FIND_US_LINKS.map(({ key, href, Icon, ariaLabel }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={ariaLabel}
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  lineHeight: 0,
                  flexShrink: 0,
                }}
              >
                <Icon size={20} />
              </a>
            ))}
          </div>
          {!isGuest && (
            <button
              type="button"
              onClick={() => { setUserMenuOpen(false); onSwitchAccount?.(); }}
              style={{ width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, border: 'none', background: 'transparent', color: 'var(--theme-text)', cursor: 'pointer' }}
            >
              {uiLang === 'zh' ? '切换账号' : 'Switch account'}
            </button>
          )}
          {!isGuest && (
            <button
              type="button"
              onClick={() => { setUserMenuOpen(false); onSignOut?.(); }}
              style={{ width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, border: 'none', borderTop: '1px solid var(--theme-border)', background: 'transparent', color: '#b91c1c', cursor: 'pointer' }}
            >
              {uiLang === 'zh' ? '退出' : 'Log Out'}
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
