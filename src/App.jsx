import React from 'react';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import GlassCard from '../components/GlassCard.jsx';
import { getRemainingQuota, MAX_FREE_QUOTA, MAX_GUEST_QUOTA, getUsedCount } from '../utils/quota.js';
import { fetchUserStats, remainingFromStats } from '../utils/supabaseUsage.js';
import { TRANSLATIONS } from '../utils/translations.js';
import { loadAIReports } from '../utils/aiReports.js';
import { supabase, isSupabaseConfigured } from '../utils/supabaseClient.js';
import {
  ensureAnonymousSession,
  isAnonymousUser,
  persistLastOAuthProviderIfSocial,
  saveAnonymousSessionBeforeOAuth,
  getSavedAnonymousUserId,
  clearAnonymousSessionBackup,
} from '../utils/supabaseAuth.js';
import AuthModal from '../components/AuthModal.jsx';
import { track, AnalyticsEvent } from '../utils/analytics.js';
import {
  persistRefFromUrlToSession,
  recordShareVisitIfNeeded,
  recordShareOAuthAttributionIfNeeded,
  parseRefCodeFromSearch,
  getPendingRefFromSession,
  SHARE_REF_QUERY_KEY,
} from '../utils/shareReferral.js';
import { ModuleAIChat } from '../modules/AIChatVite.jsx';
import ProductInquiryModal from '../components/ProductInquiryModal.jsx';
import InquiryMessagesPanel from '../components/InquiryMessagesPanel.jsx';

/** 是否本次文档已是刷新结果（避免 chunk 404 时无限 reload） */
function isDocumentLoadAfterReload() {
  try {
    const entries = typeof performance !== 'undefined' && performance.getEntriesByType?.('navigation');
    const nav = entries && entries[0];
    if (nav && nav.type === 'reload') return true;
    if (typeof performance !== 'undefined' && performance.navigation?.type === 1) return true;
  } catch (_) {}
  return false;
}

const DYNAMIC_IMPORT_FAIL_RE =
  /dynamically imported module|importing a module script failed|error loading dynamically imported module|failed to fetch module script/i;

/**
 * 动态 import 重试；失败且像「旧 index 引用已删 chunk」时整页刷新一次（与 AIReportsView 等路由共用）。
 */
function lazyWithRetry(importer, retries = 2, delayMs = 450) {
  return React.lazy(async () => {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, delayMs * attempt));
        }
        return await importer();
      } catch (e) {
        lastErr = e;
      }
    }
    const msg = String(lastErr?.message || lastErr || '');
    if (
      typeof window !== 'undefined' &&
      DYNAMIC_IMPORT_FAIL_RE.test(msg) &&
      !isDocumentLoadAfterReload()
    ) {
      window.location.reload();
      return new Promise(() => {});
    }
    throw lastErr;
  });
}

const HotProducts = lazyWithRetry(() => import('../components/HotProducts.jsx'));
const MyLists = lazyWithRetry(() => import('../components/MyLists.jsx'));
const SourcingLandingPage = lazyWithRetry(() => import('../components/SourcingLandingPage.jsx'));
const AIReportsView = lazyWithRetry(() => import('../components/AIReportsView.jsx'));

/** 本地 `vite` 开发服，或 `.env` 中 `VITE_ALLOW_GUEST_PRODUCT_SEARCH=true`：未 OAuth 也可从侧栏进入「商品搜索」浏览；页内 AI 诊断等仍走 guest 拦截。 */
function allowGuestProductSearchNav() {
  if (import.meta.env.DEV) return true;
  const v = import.meta.env.VITE_ALLOW_GUEST_PRODUCT_SEARCH;
  return v === 'true' || v === '1';
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#212121]">
          <div className="text-center p-8 rounded-xl bg-white/5 border border-white/10">
            <h1 className="text-2xl font-bold text-white mb-4">Something went wrong</h1>
            <p className="text-gray-400 mb-4">We&apos;re sorry, but something unexpected happened.</p>
            {this.state.error && (
              <pre className="text-left text-[11px] leading-relaxed text-red-300 bg-black/30 border border-white/10 rounded-lg p-3 mb-4 max-w-[720px] overflow-auto whitespace-pre-wrap">
                {String(this.state.error?.message || this.state.error)}
              </pre>
            )}
            <button onClick={() => window.location.reload()} className="bg-[var(--primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--primary-hover)] transition-colors">Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ViewLoadingFallback({ uiLang }) {
  const text = uiLang === 'zh' ? '加载中…' : 'Loading…';
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        flex: '1 1 0',
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--theme-text)',
        opacity: 0.55,
        fontSize: 14,
        letterSpacing: '0.02em',
      }}
    >
      {text}
    </div>
  );
}

const CONV_STORAGE_KEY = 'tb_conversations';
const ACTIVE_CONV_KEY = 'tb_active_conv';
const VIP_FLAG_KEY = 'tb_ai_vip_unlocked_v1';
const LEGACY_CONV_IMPORTED_FLAG_PREFIX = 'tb_conversations_legacy_imported__';

function getIsVipUnlocked() {
  try {
    return localStorage.getItem(VIP_FLAG_KEY) === '1';
  } catch (_) {
    return false;
  }
}

function makeConv() {
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), messages: [], defaultName: 'New Chat' };
}

function normalizeStorageSuffix(raw) {
  const v = String(raw || '').trim();
  return v ? v.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
}

function conversationStorageKeyForUser(user) {
  const suffix = normalizeStorageSuffix(user?.id);
  if (!suffix) return null;
  return {
    convKey: `${CONV_STORAGE_KEY}__${suffix}`,
    activeKey: `${ACTIVE_CONV_KEY}__${suffix}`,
  };
}

function loadConversations(convStorageKey = CONV_STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(convStorageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  return [makeConv()];
}

function loadActiveId(convs) {
  try {
    const id = localStorage.getItem(ACTIVE_CONV_KEY);
    if (id && convs.some((c) => c.id === id)) return id;
  } catch (_) {}
  return convs[0]?.id || '';
}

function loadActiveIdByKey(convs, activeStorageKey = ACTIVE_CONV_KEY) {
  try {
    const id = localStorage.getItem(activeStorageKey);
    if (id && convs.some((c) => c.id === id)) return id;
  } catch (_) {}
  return convs[0]?.id || '';
}

function getLegacyImportFlagKey(userId) {
  const suffix = normalizeStorageSuffix(userId);
  return suffix ? `${LEGACY_CONV_IMPORTED_FLAG_PREFIX}${suffix}` : '';
}

export default function App() {
  const devAuthBypass =
    !!import.meta.env.DEV &&
    (import.meta.env.VITE_LOCAL_DEV_BYPASS === '1' ||
      (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)));

  const applyLocalDevQuotaState = React.useCallback(() => {
    const vip = getIsVipUnlocked();
    setIsVip(vip);
    setRemainingQuota(vip ? MAX_FREE_QUOTA : getRemainingQuota(MAX_GUEST_QUOTA));
  }, []);

  const [lang, setLang] = React.useState('en');
  const [theme, setTheme] = React.useState(() => localStorage.getItem('tb_theme') || 'light');
  const [remainingQuota, setRemainingQuota] = React.useState(MAX_GUEST_QUOTA);
  const [isVip, setIsVip] = React.useState(getIsVipUnlocked);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  /** 进入 AI 报告时自动收起侧栏为 true；用户主动点侧栏收起/展开后为 false */
  const sidebarAutoCollapsedRef = React.useRef(false);
  const [activeView, setActiveView] = React.useState('chat');
  const [chatInitialMode, setChatInitialMode] = React.useState(null);
  const [activeReportId, setActiveReportId] = React.useState(null);
  const [reports, setReports] = React.useState(() => loadAIReports());
  const [reportListVisible, setReportListVisible] = React.useState(true);
  const [toast, setToast] = React.useState({ open: false, message: '' });
  const toastTimerRef = React.useRef(null);
  const [authUser, setAuthUser] = React.useState(null);
  const [authSessionReady, setAuthSessionReady] = React.useState(() => !isSupabaseConfigured());
  const [authModalOpen, setAuthModalOpen] = React.useState(false);
  /** `feature_gate`：因未登录使用功能而弹出，默认强调 Google 登录文案；`default`：用户主动打开 */
  const [authModalReason, setAuthModalReason] = React.useState('default');
  const prevOAuthSessionRef = React.useRef(false);
  const [hotProductDiagnosisRequest, setHotProductDiagnosisRequest] = React.useState(null);
  const [inquiryProduct, setInquiryProduct] = React.useState(null);
  const [inquiryListRefresh, setInquiryListRefresh] = React.useState(0);

  const MY_LISTS_KEY = 'tb_my_lists';
  const [myListItems, setMyListItems] = React.useState(() => {
    try { const raw = localStorage.getItem(MY_LISTS_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  React.useEffect(() => {
    try { localStorage.setItem(MY_LISTS_KEY, JSON.stringify(myListItems)); } catch {}
  }, [myListItems]);
  const handleAddToMyList = React.useCallback((product) => {
    if (!product) return;
    setMyListItems((prev) => {
      const key = `${product.id}_${Date.now()}`;
      return [{ ...product, _listKey: key }, ...prev];
    });
  }, []);
  const handleRemoveFromMyList = React.useCallback((listKey) => {
    setMyListItems((prev) => prev.filter((p) => (p._listKey || p.id) !== listKey));
  }, []);

  /** 会话未从 Supabase 恢复完成前不拦截侧栏，避免误挡已登录用户 */
  const guestFeatureLockedRaw =
    authSessionReady && (!authUser || isAnonymousUser(authUser));
  const guestFeatureLocked = devAuthBypass ? false : guestFeatureLockedRaw;
  const maxFreeQuotaForUser = guestFeatureLocked ? MAX_GUEST_QUOTA : MAX_FREE_QUOTA;

  /** 无 OAuth 会话时自动匿名登录，使未「登录」用户也有 auth.uid()，额度与日志进 Supabase */
  React.useEffect(() => {
    if (!supabase) {
      setAuthSessionReady(true);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const session = await ensureAnonymousSession(supabase);
        if (cancelled) return;
        setAuthUser(session?.user ?? null);
        if (session?.user) persistLastOAuthProviderIfSocial(session.user);
      } finally {
        if (!cancelled) setAuthSessionReady(true);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAuthUser(user);
      if (user) persistLastOAuthProviderIfSocial(user);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** OAuth：服务端额度；匿名 / 无 Supabase：仅本地 10 次（与 incrementQuota 一致） */
  React.useEffect(() => {
    if (devAuthBypass) {
      applyLocalDevQuotaState();
      return undefined;
    }
    if (!supabase) {
      setRemainingQuota(getRemainingQuota(MAX_GUEST_QUOTA));
      setIsVip(getIsVipUnlocked());
      return undefined;
    }
    if (!authUser) {
      return undefined;
    }
    const anon = isAnonymousUser(authUser);
    if (anon) {
      // 匿名用户也可用 claim_vip 在服务端解锁；必须与 user_stats 同步，否则密钥成功但界面仍非 VIP
      setRemainingQuota(getRemainingQuota(MAX_GUEST_QUOTA));
      let cancelled = false;

      // 同步 localStorage 配额到数据库（双向一致性）
      const syncLocalQuotaToDb = async () => {
        const localUsed = getUsedCount();
        try {
          const { data, error } = await supabase.rpc('sync_quota_from_local', {
            p_local_used: localUsed,
          });
          if (error) {
            console.warn('[quota] Failed to sync local quota to DB:', error.message);
          } else if (data?.ok && data?.action !== 'no_change') {
            console.log('[quota] Synced local quota to DB:', data);
          }
        } catch (e) {
          console.warn('[quota] Error syncing quota:', e);
        }
      };

      fetchUserStats(supabase).then((row) => {
        if (cancelled) return;
        setIsVip(!!row?.is_vip);
        if (row?.is_vip) {
          setRemainingQuota(remainingFromStats(row, true));
        }
        // 同步本地配额到数据库（异步，不阻塞）
        syncLocalQuotaToDb();
      });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    fetchUserStats(supabase).then((row) => {
      if (cancelled) return;
      if (!row) {
        setIsVip(false);
        setRemainingQuota(MAX_FREE_QUOTA);
        return;
      }
      setIsVip(!!row.is_vip);
      setRemainingQuota(remainingFromStats(row, false));
    });
    return () => { cancelled = true; };
  }, [authUser, devAuthBypass, applyLocalDevQuotaState]);

  const oauthRedirectTo = React.useCallback(() => {
    // Prefer a canonical production origin to avoid bouncing back to preview/alias domains after OAuth.
    const envOrigin = String(import.meta.env.VITE_PUBLIC_APP_ORIGIN || '').trim().replace(/\/+$/, '');
    const origin = envOrigin || window.location.origin;
    const path = window.location.pathname || '/';
    const ref = getPendingRefFromSession() || parseRefCodeFromSearch();
    if (ref) {
      const u = new URL(origin + path);
      u.searchParams.set(SHARE_REF_QUERY_KEY, ref);
      return u.toString();
    }
    return `${origin}${path}`;
  }, []);

  const handleSignInGoogle = React.useCallback(async () => {
    if (!supabase) return;
    await saveAnonymousSessionBeforeOAuth(supabase);
    track(AnalyticsEvent.OAUTH_PROVIDER_CLICK, { provider: 'google' });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: oauthRedirectTo() },
    });
    if (error) console.error('[auth] Google sign-in:', error.message);
  }, [oauthRedirectTo]);

  const handleSignInFacebook = React.useCallback(async () => {
    if (!supabase) return;
    await saveAnonymousSessionBeforeOAuth(supabase);
    track(AnalyticsEvent.OAUTH_PROVIDER_CLICK, { provider: 'facebook' });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo: oauthRedirectTo(),
        scopes: 'email,public_profile',
      },
    });
    if (error) console.error('[auth] Facebook sign-in:', error.message);
  }, [oauthRedirectTo]);

  const handleSignOut = React.useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    const session = await ensureAnonymousSession(supabase);
    setAuthUser(session?.user ?? null);
  }, []);

  const handleSwitchAccount = React.useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    track(AnalyticsEvent.AUTH_MODAL_OPEN, { via: 'switch_account' });
    setAuthModalReason('default');
    setAuthModalOpen(true);
  }, []);

  /** OAuth 登录成功：关弹窗并回对话首页（匿名 session 不算） */
  React.useEffect(() => {
    const oauth = !!(authUser && !isAnonymousUser(authUser));
    if (oauth && !prevOAuthSessionRef.current) {
      if (authModalOpen) track(AnalyticsEvent.AUTH_MODAL_CLOSE, { reason: 'oauth_success' });
      setAuthModalOpen(false);
      setAuthModalReason('default');
      setActiveView('chat');

      // 迁移匿名用户的配额到新 OAuth 用户（保持使用次数连续性）
      const oldAnonUserId = getSavedAnonymousUserId();
      if (oldAnonUserId && supabase) {
        (async () => {
          try {
            const { data, error } = await supabase.rpc('migrate_quota_on_oauth_upgrade', {
              p_old_anonymous_user_id: oldAnonUserId,
            });
            if (error) {
              console.warn('[quota] Failed to migrate quota on OAuth upgrade:', error.message);
            } else if (data?.ok) {
              console.log('[quota] Migrated quota from anonymous user:', data);
              // 刷新剩余额度显示
              fetchUserStats(supabase).then((row) => {
                if (row) {
                  setIsVip(!!row.is_vip);
                  setRemainingQuota(remainingFromStats(row, false));
                }
              });
            }
          } catch (e) {
            console.warn('[quota] Error migrating quota:', e);
          } finally {
            // 清理备份，防止重复迁移
            clearAnonymousSessionBackup();
          }
        })();
      }
    }
    prevOAuthSessionRef.current = oauth;
  }, [authUser, authModalOpen]);

  const [workflowProgress, setWorkflowProgress] = React.useState({
    isRunning: false,
    stepName: '',
    percent: 0,
    step: 0,
    justCompleted: false, // 标记是否刚刚完成
  });

  // 处理工作流进度变化；只有 percent 达到 100 且 isRunning 从 true → false 才算真正完成
  const handleWorkflowProgressChange = React.useCallback((progress) => {
    setWorkflowProgress((prev) => {
      const wasRunning = prev.isRunning;
      const nowStopped = progress.isRunning === false;
      const reachedEnd = (progress.percent ?? prev.percent) >= 100;
      return {
        ...prev,
        ...progress,
        justCompleted: wasRunning && nowStopped && reachedEnd ? true : prev.justCompleted,
      };
    });
  }, []);

  const clearWorkflowCompleted = React.useCallback(() => {
    setWorkflowProgress(prev => ({ ...prev, justCompleted: false }));
  }, []);

  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

  const [conversations, setConversations] = React.useState(() => loadConversations());
  const [activeId, setActiveId] = React.useState(() => loadActiveId(conversations));
  const convoStorage = React.useMemo(() => conversationStorageKeyForUser(authUser), [authUser]);

  React.useEffect(() => {
    if (!convoStorage?.convKey || !convoStorage?.activeKey) return;
    const loaded = loadConversations(convoStorage.convKey);
    const userId = authUser?.id || '';
    const importedFlagKey = getLegacyImportFlagKey(userId);
    let nextConvs = loaded;
    let nextActiveId = loadActiveIdByKey(loaded, convoStorage.activeKey);

    // 兼容旧版本（全局 key）→ 新版本（按账号 key）：每个账号仅迁移一次，避免反复覆盖。
    if (loaded.length <= 1 && (!loaded[0]?.messages || loaded[0].messages.length === 0) && importedFlagKey) {
      let alreadyImported = false;
      try { alreadyImported = localStorage.getItem(importedFlagKey) === '1'; } catch (_) {}
      if (!alreadyImported) {
        const legacyConvs = loadConversations(CONV_STORAGE_KEY);
        const hasLegacyData = legacyConvs.some((c) => Array.isArray(c?.messages) && c.messages.length > 0);
        if (hasLegacyData) {
          nextConvs = legacyConvs;
          nextActiveId = loadActiveIdByKey(legacyConvs, ACTIVE_CONV_KEY);
          try { localStorage.setItem(convoStorage.convKey, JSON.stringify(nextConvs)); } catch (_) {}
          try { localStorage.setItem(convoStorage.activeKey, nextActiveId); } catch (_) {}
        }
        try { localStorage.setItem(importedFlagKey, '1'); } catch (_) {}
      }
    }

    setConversations(nextConvs);
    setActiveId(nextActiveId);
  }, [convoStorage]);

  React.useEffect(() => {
    if (!convoStorage?.convKey) return;
    try { localStorage.setItem(convoStorage.convKey, JSON.stringify(conversations)); } catch (_) {}
  }, [conversations, convoStorage]);
  React.useEffect(() => {
    if (!convoStorage?.activeKey) return;
    try { localStorage.setItem(convoStorage.activeKey, activeId); } catch (_) {}
  }, [activeId, convoStorage]);

  const activeConv = conversations.find((c) => c.id === activeId) || conversations[0];
  /** 与聊天区 WelcomePortal 一致：当前会话 messages 为空 = 未开始对话，侧栏不占位（完全隐藏） */
  const activeChatIsEmpty = !(activeConv?.messages || []).length;
  /** 对话页且当前会话尚无消息：不渲染左侧常驻侧栏；有任意一条消息后恢复「左栏 + 右栏」 */
  const sidebarDockedHidden = activeView === 'chat' && activeChatIsEmpty;
  const isInConversation = activeView === 'chat' && activeConv?.messages?.length > 0;
  const useSolidChatBg =
    isInConversation ||
    activeView === 'sourcing' ||
    activeView === 'hotProducts' ||
    activeView === 'aiReports' ||
    activeView === 'inquiries';

  const setActiveMessages = React.useCallback((updater) => {
    setConversations((prev) => prev.map((c) =>
      c.id === activeId ? { ...c, messages: typeof updater === 'function' ? updater(c.messages) : updater } : c
    ));
  }, [activeId]);

  const setActiveDraft = React.useCallback((draft) => {
    setConversations((prev) => prev.map((c) =>
      c.id === activeId ? { ...c, draft } : c
    ));
  }, [activeId]);

  const handleNewConv = React.useCallback(() => {
    // Check if there's already an empty conversation (no messages)
    const emptyConv = conversations.find((c) => !c.messages || c.messages.length === 0);
    if (emptyConv) {
      // Switch to the existing empty conversation instead of creating a new one
      setActiveId(emptyConv.id);
    } else {
      // Create a new conversation if no empty one exists
      const conv = makeConv();
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
    }
  }, [conversations]);

  const handleDeleteConv = React.useCallback((id) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (next.length === 0) {
        const fresh = makeConv();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (activeId === id) setActiveId(next[0].id);
      return next;
    });
  }, [activeId]);

  const handleRenameConv = React.useCallback((id, newName) => {
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, customName: newName } : c));
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('tb_theme', next);
      return next;
    });
  }, []);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  React.useEffect(() => {
    persistRefFromUrlToSession();
  }, []);

  React.useEffect(() => {
    if (!authSessionReady || !authUser || !supabase) return;
    let cancelled = false;
    (async () => {
      await recordShareOAuthAttributionIfNeeded(supabase, authUser);
      if (cancelled) return;
      await recordShareVisitIfNeeded(supabase);
    })();
    return () => {
      cancelled = true;
    };
  }, [authSessionReady, authUser, supabase]);

  const showToast = React.useCallback((message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ open: true, message: message || '' });
    toastTimerRef.current = setTimeout(() => { setToast({ open: false, message: '' }); toastTimerRef.current = null; }, 1800);
  }, []);

  const handlePublishProduct = React.useCallback((product) => {
    if (!product) return;
    showToast(t.finder.addedToCart);
  }, [showToast, t.finder.addedToCart]);

  const handleSourcing = React.useCallback(() => {
    setActiveView('sourcing');
  }, []);

  const closeAuthModal = React.useCallback(() => {
    track(AnalyticsEvent.AUTH_MODAL_CLOSE, { reason: 'user_dismiss' });
    setAuthModalOpen(false);
    setAuthModalReason('default');
  }, []);

  const openAuthModal = React.useCallback((via = 'explicit') => {
    track(AnalyticsEvent.AUTH_MODAL_OPEN, { via });
    setAuthModalReason('default');
    setAuthModalOpen(true);
  }, []);

  const requireOAuthToastAndModal = React.useCallback((feature = 'unknown') => {
    track(AnalyticsEvent.FEATURE_GATE_BLOCKED, { feature });
    showToast(t.auth?.signInToUse || '');
    track(AnalyticsEvent.AUTH_MODAL_OPEN, { via: 'feature_gate', feature });
    setAuthModalReason('feature_gate');
    setAuthModalOpen(true);
  }, [showToast, t]);

  const handleViewReport = React.useCallback(() => {
    if (guestFeatureLocked) {
      requireOAuthToastAndModal('workflow_view_report');
      return;
    }
    if (reports.length > 0) {
      setActiveReportId(reports[0].id);
      setActiveView('aiReports');
    }
  }, [reports, guestFeatureLocked, requireOAuthToastAndModal]);

  const handleAIReports = React.useCallback(() => {
    if (guestFeatureLocked) {
      requireOAuthToastAndModal('nav_ai_reports');
      return;
    }
    if (activeView === 'aiReports') {
      setReportListVisible(true);
      return;
    }
    setActiveView('aiReports');
    setReportListVisible(true);
    setSidebarCollapsed(true);
    sidebarAutoCollapsedRef.current = true;
    if (!activeReportId && reports.length > 0) {
      setActiveReportId(reports[0].id);
    }
  }, [activeView, activeReportId, reports, guestFeatureLocked, requireOAuthToastAndModal]);

  const handleInquiryMessages = React.useCallback(() => {
    if (guestFeatureLocked) {
      requireOAuthToastAndModal('nav_inquiries');
      return;
    }
    setActiveView('inquiries');
    if (sidebarCollapsed && sidebarAutoCollapsedRef.current) {
      setSidebarCollapsed(false);
      sidebarAutoCollapsedRef.current = false;
    }
  }, [guestFeatureLocked, requireOAuthToastAndModal]);

  const handleReportCreated = React.useCallback((newReport) => {
    setReports((prev) => [newReport, ...prev.filter((r) => r.id !== newReport.id)]);
    setActiveReportId(newReport.id);
    setReportListVisible(false);
    setWorkflowProgress({ isRunning: false, stepName: '', percent: 100, step: 9, justCompleted: true });
    const isChatAnalysisReport = newReport?.kind === 'analysis';
    if (!isChatAnalysisReport) {
      setActiveView('aiReports');
      setSidebarCollapsed(true);
      sidebarAutoCollapsedRef.current = true;
    }
  }, []);

  const handleToggleSidebarCollapse = React.useCallback(() => {
    sidebarAutoCollapsedRef.current = false;
    setSidebarCollapsed((v) => !v);
  }, []);

  const handleHeaderMenuClick = React.useCallback(() => {
    if ((activeView === 'aiReports' || activeView === 'inquiries') && sidebarCollapsed && sidebarAutoCollapsedRef.current) {
      setSidebarCollapsed(false);
      sidebarAutoCollapsedRef.current = false;
    }
    setSidebarOpen((v) => !v);
  }, [activeView, sidebarCollapsed]);

  const refreshQuota = React.useCallback(() => {
    if (devAuthBypass) {
      applyLocalDevQuotaState();
      return;
    }
    if (!supabase) {
      setRemainingQuota(getRemainingQuota(MAX_GUEST_QUOTA));
      setIsVip(getIsVipUnlocked());
      return;
    }
    if (!authUser) {
      setRemainingQuota(MAX_GUEST_QUOTA);
      setIsVip(false);
      return;
    }
    if (isAnonymousUser(authUser)) {
      setRemainingQuota(getRemainingQuota(MAX_GUEST_QUOTA));
      fetchUserStats(supabase).then((row) => {
        setIsVip(!!row?.is_vip);
        if (row?.is_vip) {
          setRemainingQuota(remainingFromStats(row, true));
        }
      });
      return;
    }
    fetchUserStats(supabase).then((row) => {
      if (!row) {
        setIsVip(false);
        setRemainingQuota(MAX_FREE_QUOTA);
        return;
      }
      setIsVip(!!row.is_vip);
      setRemainingQuota(remainingFromStats(row, false));
    });
  }, [authUser, devAuthBypass, applyLocalDevQuotaState]);

  React.useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  React.useEffect(() => {
    if (!activeChatIsEmpty) setSidebarOpen(false);
  }, [activeChatIsEmpty]);

  const prevSidebarDockedHiddenRef = React.useRef(undefined);
  React.useEffect(() => {
    const prev = prevSidebarDockedHiddenRef.current;
    prevSidebarDockedHiddenRef.current = sidebarDockedHidden;
    if (prev === undefined) return;
    if (prev && !sidebarDockedHidden && activeView === 'chat') {
      setSidebarCollapsed(false);
      sidebarAutoCollapsedRef.current = false;
    }
  }, [sidebarDockedHidden, activeView]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex', overflow: 'hidden',
      backgroundColor: 'var(--theme-bg)', color: 'var(--theme-text)',
      transition: 'background-color 0.3s, color 0.3s',
    }}>
      {/* Ambient glows */}
      <div style={{ position: 'absolute', bottom: '-30%', left: '-15%', width: 900, height: 900, borderRadius: '50%', background: 'var(--theme-glow-1)', filter: 'blur(180px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-25%', right: '-10%', width: 800, height: 800, borderRadius: '50%', background: 'var(--theme-glow-2)', filter: 'blur(160px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '-20%', left: '30%', width: 600, height: 600, borderRadius: '50%', background: 'var(--theme-glow-2)', filter: 'blur(200px)', pointerEvents: 'none', opacity: 0.5 }} />

      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          setActiveView('chat');
          if (sidebarCollapsed && sidebarAutoCollapsedRef.current) {
            setSidebarCollapsed(false);
            sidebarAutoCollapsedRef.current = false;
          }
        }}
        onNew={() => {
          handleNewConv();
          setActiveView('chat');
          if (sidebarCollapsed && sidebarAutoCollapsedRef.current) {
            setSidebarCollapsed(false);
            sidebarAutoCollapsedRef.current = false;
          }
        }}
        onDelete={handleDeleteConv}
        onRename={handleRenameConv}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onHotProducts={() => {
          if (guestFeatureLocked && !allowGuestProductSearchNav()) {
            requireOAuthToastAndModal('nav_hot_products');
            return;
          }
          setActiveView('hotProducts');
          if (sidebarCollapsed && sidebarAutoCollapsedRef.current) {
            setSidebarCollapsed(false);
            sidebarAutoCollapsedRef.current = false;
          }
        }}
        onSourcing={() => {
          handleSourcing();
          if (sidebarCollapsed && sidebarAutoCollapsedRef.current) {
            setSidebarCollapsed(false);
            sidebarAutoCollapsedRef.current = false;
          }
        }}
        onAIReports={handleAIReports}
        onInquiryMessages={handleInquiryMessages}
        onMyLists={() => {
          setActiveView('myLists');
          if (sidebarCollapsed && sidebarAutoCollapsedRef.current) {
            setSidebarCollapsed(false);
            sidebarAutoCollapsedRef.current = false;
          }
        }}
        myListsCount={myListItems.length}
        activeView={activeView}
        uiLang={lang}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
        supabaseReady={isSupabaseConfigured()}
        authUser={authUser}
        onOpenAuthModal={() => openAuthModal('sidebar_sign_in')}
        onLinkGoogle={handleSignInGoogle}
        onLinkFacebook={handleSignInFacebook}
        onSignOut={handleSignOut}
        onSwitchAccount={handleSwitchAccount}
        dockedHidden={sidebarDockedHidden}
      />

      {/* Right: header + chat */}
      <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', zIndex: 1, background: useSolidChatBg ? 'var(--theme-chat-bg, #ffffff)' : 'transparent', transition: 'background 0.4s ease' }}>
        {/* Header */}
        <div style={{ flexShrink: 0, zIndex: 50 }}>
          <Header
            currentLang={lang} setLang={setLang} t={t}
            remainingQuota={remainingQuota} isVip={isVip} theme={theme} onToggleTheme={toggleTheme}
            onMenuClick={handleHeaderMenuClick}
            workflowProgress={workflowProgress}
            onClearWorkflowCompleted={clearWorkflowCompleted}
            onViewReport={handleViewReport}
            maxFreeQuota={maxFreeQuotaForUser}
            showCreditsHintForAnonymous={!!authUser && isAnonymousUser(authUser)}
            showSidebarMenuOnDesktop={sidebarDockedHidden}
            authUser={authUser}
          />
        </div>

        {toast.open && (
          <div style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '0 16px' }}>
            <GlassCard className="px-4 py-2 rounded-xl text-sm text-white flex items-center gap-2">
              <div className="icon-check text-[var(--secondary)]" />
              <span>{toast.message}</span>
            </GlassCard>
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: activeView === 'aiReports' ? 'row' : 'column', overflow: 'hidden' }}>
          <React.Suspense fallback={<ViewLoadingFallback uiLang={lang} />}>
          {activeView === 'hotProducts' ? (
            <HotProducts
              t={t}
              uiLang={lang}
              guestFeatureLocked={guestFeatureLocked}
              onRequireOAuth={() => requireOAuthToastAndModal('hot_page_ai_diagnose')}
              onPublish={handlePublishProduct}
              onProductDiagnosis={(product) => {
                setHotProductDiagnosisRequest({ product, t: Date.now() });
                setActiveView('chat');
              }}
              onAddToMyList={handleAddToMyList}
            />
          ) : activeView === 'myLists' ? (
            <MyLists
              uiLang={lang}
              items={myListItems}
              onRemove={handleRemoveFromMyList}
              onProductDiagnosis={(product) => {
                setHotProductDiagnosisRequest({ product, t: Date.now() });
                setActiveView('chat');
              }}
              guestFeatureLocked={guestFeatureLocked}
              onRequireLogin={() => requireOAuthToastAndModal('mylist_ai_diagnose')}
            />
          ) : activeView === 'sourcing' ? (
            <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
              <SourcingLandingPage />
            </div>
          ) : activeView === 'inquiries' ? (
            <InquiryMessagesPanel uiLang={lang} authUser={authUser} refreshKey={inquiryListRefresh} />
          ) : activeView === 'aiReports' ? (
            <AIReportsView
              reportListVisible={reportListVisible}
              activeReportId={activeReportId}
              onSelectReport={(id) => {
                setActiveReportId(id);
                setReportListVisible(false);
              }}
              uiLang={lang}
              reports={reports}
              onDeleteReport={(id) => setReports((prev) => prev.filter((r) => r.id !== id))}
              onNewAnalysis={() => {
                setActiveReportId(null);
                setReportListVisible(false);
              }}
              onNewDiagnosis={(mode) => {
                setChatInitialMode(mode || null);
                handleNewConv();
                setActiveView('chat');
                if (sidebarCollapsed && sidebarAutoCollapsedRef.current) {
                  setSidebarCollapsed(false);
                  sidebarAutoCollapsedRef.current = false;
                }
              }}
            />
          ) : (
            <ModuleAIChat
              t={t} uiLang={lang} theme={theme}
              messages={activeConv?.messages}
              setMessages={setActiveMessages}
              draft={activeConv?.draft || ''}
              setDraft={setActiveDraft}
              onPublish={handlePublishProduct}
              onQuotaChange={refreshQuota}
              onReportCreated={handleReportCreated}
              onWorkflowProgressChange={handleWorkflowProgressChange}
              onOpenSourcing={handleSourcing}
              authUser={authUser}
              conversationId={activeId}
              isVip={isVip}
              guestFeatureLocked={guestFeatureLocked}
              allowLocalVipUnlock={devAuthBypass}
              onGuestFeatureBlocked={() => requireOAuthToastAndModal('chat_ai_diagnose')}
              onOpenAuthModal={() => openAuthModal('quota_modal')}
              oauthMaxFreeQuota={MAX_FREE_QUOTA}
              hotProductDiagnosisRequest={hotProductDiagnosisRequest}
              onConsumedHotProductDiagnosisRequest={() => setHotProductDiagnosisRequest(null)}
              initialMode={chatInitialMode}
              onConsumedInitialMode={() => setChatInitialMode(null)}
              onOpenProductInquiry={setInquiryProduct}
            />
          )}
          </React.Suspense>
        </div>
      </div>

      <ProductInquiryModal
        show={!!inquiryProduct}
        product={inquiryProduct}
        onClose={() => setInquiryProduct(null)}
        uiLang={lang}
        authUser={authUser}
        guestFeatureLocked={guestFeatureLocked}
        onRequireLogin={() => openAuthModal('inquiry')}
        onSubmitted={(payload) => {
          setInquiryListRefresh((k) => k + 1);
          const productName = String(payload?.product?.name || '').trim();
          const demand = String(payload?.demand || '').trim();
          const inquiryId = String(payload?.inquiryId || '').trim();
          const note = lang === 'zh'
            ? [
                '已记录询盘请求。',
                productName ? `商品：${productName}` : '',
                demand ? `需求：${demand}` : '',
                inquiryId ? `编号：${inquiryId}` : '',
              ].filter(Boolean).join('\n')
            : [
                'Inquiry saved successfully.',
                productName ? `Product: ${productName}` : '',
                demand ? `Request: ${demand}` : '',
                inquiryId ? `ID: ${inquiryId}` : '',
              ].filter(Boolean).join('\n');
          setActiveMessages((prev) => [
            ...(Array.isArray(prev) ? prev : []),
            { role: 'ai', type: 'text', content: note, _inquirySaved: true },
          ]);
          showToast(lang === 'zh' ? '询盘已提交' : 'Inquiry submitted');
        }}
      />

      <AuthModal
        open={authModalOpen}
        onClose={closeAuthModal}
        uiLang={lang}
        t={t}
        openReason={authModalReason}
        onGoogleSignIn={handleSignInGoogle}
        onFacebookSignIn={handleSignInFacebook}
        supabaseReady={isSupabaseConfigured()}
      />
    </div>
  );
}
