import React from 'react';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import HotProducts from '../components/HotProducts.jsx';
import SourcingLandingPage from '../components/SourcingLandingPage.jsx';
import AIReportList from '../components/AIReportList.jsx';
import AIReportViewer from '../components/AIReportViewer.jsx';
import GlassCard from '../components/GlassCard.jsx';
import { getRemainingQuota, MAX_FREE_QUOTA, MAX_GUEST_QUOTA } from '../utils/quota.js';
import { fetchUserStats, remainingFromStats } from '../utils/supabaseUsage.js';
import { ModuleAIChat } from '../modules/AIChatVite.jsx';
import { TRANSLATIONS } from '../utils/translations.js';
import { createAIReport, loadAIReports } from '../utils/aiReports.js';
import { supabase, isSupabaseConfigured } from '../utils/supabaseClient.js';
import { ensureAnonymousSession, isAnonymousUser } from '../utils/supabaseAuth.js';
import AuthModal from '../components/AuthModal.jsx';

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

const CONV_STORAGE_KEY = 'tb_conversations';
const ACTIVE_CONV_KEY = 'tb_active_conv';
const VIP_FLAG_KEY = 'tb_ai_vip_unlocked_v1';

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

function loadConversations() {
  try {
    const raw = localStorage.getItem(CONV_STORAGE_KEY);
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

export default function App() {
  const [lang, setLang] = React.useState('en');
  const [theme, setTheme] = React.useState(() => localStorage.getItem('tb_theme') || 'light');
  const [remainingQuota, setRemainingQuota] = React.useState(MAX_GUEST_QUOTA);
  const [isVip, setIsVip] = React.useState(getIsVipUnlocked);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  /** 进入 AI 报告时自动收起侧栏为 true；用户主动点侧栏收起/展开后为 false */
  const sidebarAutoCollapsedRef = React.useRef(false);
  const [activeView, setActiveView] = React.useState('chat');
  const [activeReportId, setActiveReportId] = React.useState(null);
  const [reports, setReports] = React.useState(() => loadAIReports());
  const [reportListVisible, setReportListVisible] = React.useState(true);
  const [toast, setToast] = React.useState({ open: false, message: '' });
  const toastTimerRef = React.useRef(null);
  const [authUser, setAuthUser] = React.useState(null);
  const [authModalOpen, setAuthModalOpen] = React.useState(false);
  const prevOAuthSessionRef = React.useRef(false);
  const [hotProductDiagnosisRequest, setHotProductDiagnosisRequest] = React.useState(null);

  const guestFeatureLocked = !authUser || isAnonymousUser(authUser);
  const maxFreeQuotaForUser = guestFeatureLocked ? MAX_GUEST_QUOTA : MAX_FREE_QUOTA;

  /** 无 OAuth 会话时自动匿名登录，使未「登录」用户也有 auth.uid()，额度与日志进 Supabase */
  React.useEffect(() => {
    if (!supabase) return undefined;
    let cancelled = false;
    (async () => {
      const session = await ensureAnonymousSession(supabase);
      if (!cancelled) setAuthUser(session?.user ?? null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** 有 Supabase 会话（含匿名）：额度与 VIP 以 user_stats 为准；无 Supabase：本地额度上限 10 */
  React.useEffect(() => {
    if (!supabase) {
      setRemainingQuota(getRemainingQuota(MAX_GUEST_QUOTA));
      setIsVip(getIsVipUnlocked());
      return undefined;
    }
    if (!authUser) {
      return undefined;
    }
    const anon = isAnonymousUser(authUser);
    let cancelled = false;
    fetchUserStats(supabase).then((row) => {
      if (cancelled) return;
      if (!row) {
        setIsVip(false);
        setRemainingQuota(anon ? MAX_GUEST_QUOTA : MAX_FREE_QUOTA);
        return;
      }
      setIsVip(!!row.is_vip);
      setRemainingQuota(remainingFromStats(row, anon));
    });
    return () => { cancelled = true; };
  }, [authUser]);

  const oauthRedirectTo = React.useCallback(
    () => `${window.location.origin}${window.location.pathname || '/'}`,
    []
  );

  const handleSignInGoogle = React.useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: oauthRedirectTo() },
    });
    if (error) console.error('[auth] Google sign-in:', error.message);
  }, [oauthRedirectTo]);

  const handleSignInFacebook = React.useCallback(async () => {
    if (!supabase) return;
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
    setAuthModalOpen(true);
  }, []);

  /** OAuth 登录成功：关弹窗并回对话首页（匿名 session 不算） */
  React.useEffect(() => {
    const oauth = !!(authUser && !isAnonymousUser(authUser));
    if (oauth && !prevOAuthSessionRef.current) {
      setAuthModalOpen(false);
      setActiveView('chat');
    }
    prevOAuthSessionRef.current = oauth;
  }, [authUser]);

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

  React.useEffect(() => {
    try { localStorage.setItem(CONV_STORAGE_KEY, JSON.stringify(conversations)); } catch (_) {}
  }, [conversations]);
  React.useEffect(() => {
    try { localStorage.setItem(ACTIVE_CONV_KEY, activeId); } catch (_) {}
  }, [activeId]);

  const activeConv = conversations.find((c) => c.id === activeId) || conversations[0];
  const isInConversation = activeView === 'chat' && activeConv?.messages?.length > 0;
  const useSolidChatBg =
    isInConversation ||
    activeView === 'sourcing' ||
    activeView === 'hotProducts' ||
    activeView === 'aiReports';

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

  const requireOAuthToastAndModal = React.useCallback(() => {
    showToast(lang === 'zh' ? '请使用左下角 Google / Facebook 登录后使用此功能。' : 'Please sign in with Google or Facebook (bottom left) to use this feature.');
    setAuthModalOpen(true);
  }, [lang, showToast]);

  const handleViewReport = React.useCallback(() => {
    if (guestFeatureLocked) {
      requireOAuthToastAndModal();
      return;
    }
    if (reports.length > 0) {
      setActiveReportId(reports[0].id);
      setActiveView('aiReports');
    }
  }, [reports, guestFeatureLocked, requireOAuthToastAndModal]);

  const handleAIReports = React.useCallback(() => {
    if (guestFeatureLocked) {
      requireOAuthToastAndModal();
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

  const handleReportCreated = React.useCallback((newReport) => {
    if (guestFeatureLocked) {
      requireOAuthToastAndModal();
      return;
    }
    setReports(prev => [newReport, ...prev]);
    setActiveReportId(newReport.id);
    setReportListVisible(false);
    setWorkflowProgress({ isRunning: false, stepName: '', percent: 100, step: 9, justCompleted: true });
    setActiveView('aiReports');
    setSidebarCollapsed(true);
    sidebarAutoCollapsedRef.current = true;
  }, [guestFeatureLocked, requireOAuthToastAndModal]);

  const handleToggleSidebarCollapse = React.useCallback(() => {
    sidebarAutoCollapsedRef.current = false;
    setSidebarCollapsed((v) => !v);
  }, []);

  const handleHeaderMenuClick = React.useCallback(() => {
    if (activeView === 'aiReports' && sidebarCollapsed && sidebarAutoCollapsedRef.current) {
      setSidebarCollapsed(false);
      sidebarAutoCollapsedRef.current = false;
    }
    setSidebarOpen((v) => !v);
  }, [activeView, sidebarCollapsed]);

  const refreshQuota = React.useCallback(() => {
    if (supabase && authUser) {
      const anon = isAnonymousUser(authUser);
      fetchUserStats(supabase).then((row) => {
        if (!row) {
          setIsVip(false);
          setRemainingQuota(anon ? MAX_GUEST_QUOTA : MAX_FREE_QUOTA);
          return;
        }
        setIsVip(!!row.is_vip);
        setRemainingQuota(remainingFromStats(row, anon));
      });
    } else if (!supabase) {
      setRemainingQuota(getRemainingQuota(MAX_GUEST_QUOTA));
      setIsVip(getIsVipUnlocked());
    } else {
      setRemainingQuota(MAX_GUEST_QUOTA);
      setIsVip(false);
    }
  }, [authUser]);

  React.useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

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
          if (guestFeatureLocked) {
            requireOAuthToastAndModal();
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
        activeView={activeView}
        uiLang={lang}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
        supabaseReady={isSupabaseConfigured()}
        authUser={authUser}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onLinkGoogle={handleSignInGoogle}
        onLinkFacebook={handleSignInFacebook}
        onSignOut={handleSignOut}
        onSwitchAccount={handleSwitchAccount}
      />

      {/* Right: header + chat */}
      <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', zIndex: 1, background: useSolidChatBg ? 'var(--theme-chat-bg, #ffffff)' : 'transparent', transition: 'background 0.4s ease' }}>
        {/* Header */}
        <div style={{ flexShrink: 0, height: 56, zIndex: 50 }}>
          <Header
            currentLang={lang} setLang={setLang} t={t}
            remainingQuota={remainingQuota} isVip={isVip} theme={theme} onToggleTheme={toggleTheme}
            onMenuClick={handleHeaderMenuClick}
            workflowProgress={workflowProgress}
            onClearWorkflowCompleted={clearWorkflowCompleted}
            onViewReport={handleViewReport}
            maxFreeQuota={maxFreeQuotaForUser}
            showCreditsHintForAnonymous={!!authUser && isAnonymousUser(authUser)}
          />
        </div>

        {toast.open && (
          <div style={{ position: 'fixed', top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '0 16px' }}>
            <GlassCard className="px-4 py-2 rounded-xl text-sm text-white flex items-center gap-2">
              <div className="icon-check text-[var(--secondary)]" />
              <span>{toast.message}</span>
            </GlassCard>
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: activeView === 'aiReports' ? 'row' : 'column', overflow: 'hidden' }}>
          {activeView === 'hotProducts' ? (
            <HotProducts
              uiLang={lang}
              guestFeatureLocked={guestFeatureLocked}
              onRequireOAuth={requireOAuthToastAndModal}
              onProductDiagnosis={(product) => {
                setHotProductDiagnosisRequest({ product, t: Date.now() });
                setActiveView('chat');
              }}
            />
          ) : activeView === 'sourcing' ? (
            <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
              <SourcingLandingPage />
            </div>
          ) : activeView === 'aiReports' ? (
            <>
              {reportListVisible && (
                <AIReportList 
                  activeReportId={activeReportId}
                  onSelectReport={(id) => {
                    setActiveReportId(id);
                    setReportListVisible(false);
                  }}
                  uiLang={lang}
                  reports={reports}
                  onDeleteReport={(id) => setReports(prev => prev.filter(r => r.id !== id))}
                />
              )}
              <AIReportViewer 
                reportId={activeReportId} 
                uiLang={lang} 
                onNewDiagnosis={() => setActiveView('chat')}
              />
            </>
          ) : (
            <ModuleAIChat
              key={activeId}
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
              onGuestFeatureBlocked={requireOAuthToastAndModal}
              hotProductDiagnosisRequest={hotProductDiagnosisRequest}
              onConsumedHotProductDiagnosisRequest={() => setHotProductDiagnosisRequest(null)}
            />
          )}
        </div>
      </div>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        uiLang={lang}
        onGoogleSignIn={handleSignInGoogle}
        onFacebookSignIn={handleSignInFacebook}
        supabaseReady={isSupabaseConfigured()}
      />
    </div>
  );
}
