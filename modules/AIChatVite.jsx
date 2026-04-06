import React, { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { incrementQuota, getRemainingQuota, MAX_GUEST_QUOTA, MAX_FREE_QUOTA } from '../utils/quota.js';
import { isAnonymousUser } from '../utils/supabaseAuth.js';
import { FIND_US_WHATSAPP_URL, FIND_US_WHATSAPP_LABEL } from '../utils/socialLinks.js';
import { track, AnalyticsEvent } from '../utils/analytics.js';
import { supabase } from '../utils/supabaseClient.js';
import { consumeChatTurn, claimVipRemote } from '../utils/supabaseUsage.js';
import { extractUrlsFromText } from '../utils/urlExtract.js';
import { DIAGNOSIS_PROMPTS, fillPrompt } from '../utils/diagnosisPrompts.js';
import { DiagnosisWorkflow } from '../utils/diagnosisWorkflow.js';
import { createAIReport, createAnalysisAIReport } from '../utils/aiReports.js';
import {
  percentAfterCompletingStep,
  percentWhileRunningStep,
  WORKFLOW_TOTAL_STEPS,
} from '../utils/workflowProgress.js';
import OverlayModal from '../components/OverlayModal.jsx';
import GEOIntakePanel, { buildGeoIntakeUserMessage } from '../components/GEOIntakePanel.jsx';
import SimpleModeIntakePanel, {
  buildDiagnosisIntakeUserMessage,
  buildSeoIntakeUserMessage,
} from '../components/SimpleModeIntakePanel.jsx';
import ChatHotProductCard from '../components/ChatHotProductCard.jsx';
import { ProductCard } from '../components/ProductCard.jsx';
import {
  TANGBUY_GUIDANCE,
  normalizeKnowledgeLang,
  shouldInjectTangbuyKnowledge,
  buildTangbuyKnowledgeContext,
  ensureKnowledgeBasesLoaded,
  buildTangbuySearchPicksFromContext,
  buildTangbuySearchPicksFromKeywords,
  extractProductKeywordsForTangbuy,
  shouldAttachTangbuySearchPicks,
} from '../utils/tangbuyKnowledge.js';
import {
  translateZhToEn,
  detectCategories,
  parsePriceRange,
  parseMinSold,
  pickField,
  normalizeCatalogItem,
  tryFetchJson,
  loadProductCatalog,
  loadTrendCatalogOnly,
  shouldRecommendProducts,
  isProductConfirmation,
  parseCatalogProductJsonFromMarkdown,
  maskStreamingProductJsonBlock,
  partitionHotAndTrendMatches,
} from '../utils/productSearch.js';
import { decodeHtmlEntities, buildAggregatedSupplyChainBackbone } from '../utils/reportFormatter.js';
import { PROMPTS } from '../utils/systemPrompts.js';
// ── Markdown renderer ──
const mdRenderer = new marked.Renderer();
mdRenderer.link = function ({ href, title, text }) {
  const titleAttr = title ? ` title="${title}"` : '';
  return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 transition-opacity hover:opacity-80" style="color:var(--secondary)">${text}</a>`;
};
function renderMarkdown(text) {
  if (!text) return '';
  try {
    const cleaned = decodeHtmlEntities(String(text));
    const raw = marked.parse(cleaned, { breaks: true, gfm: true, renderer: mdRenderer });
    return DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel', 'class'], ALLOW_DATA_ATTR: true });
  } catch (_) {
    return DOMPurify.sanitize(String(text));
  }
}

// User bubble markdown (must stay white text on top of red background)
const userMdRenderer = new marked.Renderer();
userMdRenderer.link = function ({ href, title, text }) {
  const titleAttr = title ? ` title="${title}"` : '';
  return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer" style="color:#fff" class="underline underline-offset-2 hover:opacity-90">${text}</a>`;
};
function renderUserMarkdown(text) {
  if (!text) return '';
  try {
    const raw = marked.parse(String(text), { breaks: true, gfm: true, renderer: userMdRenderer });
    return DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel'], ALLOW_DATA_ATTR: true }).replace(/<p>\s*<\/p>/g, '').trim();
  } catch (_) {
    return DOMPurify.sanitize(String(text));
  }
}

// ── Constants ──
const DROPSHIPPING_PREFIX = 'https://dropshipping.tangbuy.com/zh-CN/product/';
const TANGBUY_DISPLAY_MULT = 1.7;
/** 运营/营销分析时间锚点：至少 2026，随日历年自动上移 */
const ANALYSIS_YEAR = Math.max(2026, new Date().getFullYear());
const HTML_SPLIT_DELIM = '===HTML===';
const PROXY_URL = 'https://proxy-api.trickle-app.host/';

function base64EncodeUtf8(str) {
  try { return btoa(unescape(encodeURIComponent(String(str)))); }
  catch (_) { return btoa(String(str)); }
}

function toDropshippingUrl(sourceUrl) {
  if (!sourceUrl) return '';
  const s = String(sourceUrl);
  return s.startsWith(DROPSHIPPING_PREFIX) ? s : DROPSHIPPING_PREFIX + base64EncodeUtf8(s);
}

function buildProductReferenceLabel(name, uiLang) {
  const cleaned = String(name || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return uiLang === 'zh' ? '已选商品' : 'Selected product';
  const words = cleaned.split(' ');
  const shortName = words.slice(0, 5).join(' ');
  return words.length > 5 ? `${shortName}…` : shortName;
}

// ── Auto-mode intent detection: detect which skill to activate ──
function extractFirstUrl(text) {
  if (!text) return '';
  const normalized = String(text)
    .replace(/[【〔［「『〈《（]/g, ' ')
    .replace(/[】〕］」』〉》）]/g, ' ')
    .replace(/[<>]/g, ' ');
  // More robust URL regex that handles trailing punctuation and parentheses better
  const match = normalized.match(/https?:\/\/[^\s<>()\[\]{}]+(?:\([^\s<>()\[\]{}]*\)|[^\s<>()\[\]{}.,，。；;！!？?])*/i);
  if (!match) return '';
  // Clean up trailing punctuation that's not part of the URL
  let url = match[0];
  url = url.replace(/[.,，。；;！!？?)]+$/, '');
  return url;
}

function detectIntentFromInput(text, snapshot) {
  const combined = [text, snapshot].filter(Boolean).join(' ');
  const lower = combined.toLowerCase();

  const firstUrl = extractFirstUrl(text);
  const hasUrl = !!firstUrl;
  const isImageUrl = !!(firstUrl && /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(firstUrl));
  const isProductUrl = hasUrl && (/\/product[s]?\//i.test(text) || /\/dp\//i.test(text) || /\/item[s]?\//i.test(text) || /[?&]id=\d/i.test(text) || /\/p\/\d/i.test(text));

  if (/(诊断|审计|audit|diagnosis|分析.*网站|分析.*店铺|review.*store|拆解)/i.test(text)) return 'diagnosis';
  if (/(geo\b|生成式搜索|生成式引擎|generative engine|generative search|answer engine|sge\b|ai overview|ai搜索|chatgpt.*search|perplexity)/i.test(combined)) return 'page';
  if (/(seo|搜索优化|标题重写|meta|关键词|title.*rewrite|keyword|搜索排名|详情页|product page|html.*生成|html.*output|landing page|pdp\b|文案生成|copy.*write|详情.*优化)/i.test(text)) return 'seo';

  if (isProductUrl) return 'product';
  if (isImageUrl) return 'product';
  if (/(分析图片|看图|识别图片|图片分析|图中.*商品|image analysis|photo analysis)/i.test(text)) return 'product';
  // Image URLs are for future vision workflows; don't treat them as "site diagnosis".
  if (hasUrl && !isProductUrl && !isImageUrl) return 'diagnosis';

  if (snapshot) {
    if (/(shopify|myshopify|woocommerce|bigcommerce)/i.test(lower)) return 'diagnosis';
  }

  return null;
}

// ── Language detection ──
function detectLanguageFromText(text) {
  if (!text) return null;
  const s = String(text);
  if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(s)) return { lang: 'zh', label: '中文', confidence: 'high', rtl: false };
  if (/[\u3040-\u30FF]/.test(s)) return { lang: 'ja', label: '日本語', confidence: 'high', rtl: false };
  if (/[\uAC00-\uD7AF]/.test(s)) return { lang: 'ko', label: '한국어', confidence: 'high', rtl: false };
  if (/[\u0600-\u06FF]/.test(s)) return { lang: 'ar', label: 'العربية', confidence: 'high', rtl: true };
  if (/[\u0400-\u04FF]/.test(s)) return { lang: 'ru', label: 'Русский', confidence: 'high', rtl: false };
  const lower = s.toLowerCase();
  const esWords = /\b(hola|por favor|gracias|quiero|necesito|puedes|ayuda|tienda|producto|análisis|recomienda|buscar|cómo|cuál|dónde|también|más|está|estoy|puede|hacer|tengo|tiene|para|pero|como|este|esta|estos|estas|mejor|precio|envío|pedido)\b/;
  if (esWords.test(lower) || /[áéíóúñ¿¡]/i.test(s)) return { lang: 'es', label: 'Español', confidence: 'high', rtl: false };
  const frWords = /\b(bonjour|s'il vous plaît|merci|je veux|j'ai besoin|pouvez|aidez|boutique|produit|analyse|recommande|chercher|comment|quel|où|aussi|plus|est|suis|peut|faire|ai|pour|mais|comme|cette|meilleur|prix|livraison|commande)\b/;
  if (frWords.test(lower) || /[àâçéèêëîïôùûüœæ]/i.test(s)) return { lang: 'fr', label: 'Français', confidence: 'high', rtl: false };
  return null;
}

function sanitizeYear(text) {
  if (!text) return text;
  return String(text)
    .replace(/(?<![\w/.-])2024(?![\w/.-])/g, String(ANALYSIS_YEAR))
    .replace(/(?<![\w/.-])2025(?![\w/.-])/g, String(ANALYSIS_YEAR));
}

/** Strip leaked tool-call / search-query junk some OpenAI-compatible stacks (e.g. MiniMax) emit as plain text. */
function stripLlmToolArtifacts(text) {
  if (!text) return '';
  let s = String(text);
  s = s.replace(/<\s*tool_call\s*[^>]*>[\s\S]*?<\/\s*tool_call\s*>/gi, '');
  s = s.replace(/<\s*function_calls\s*[^>]*>[\s\S]*?<\/\s*function_calls\s*>/gi, '');
  s = s.replace(/\bstruct_search\s*\{[\s\S]*?\}/gi, '');
  s = s.replace(/\b(?:struct_search|search_products|product_search)\s*\n(?:.*\n){1,8}/gi, '');
  s = s.replace(/\{\s*tool\s*=>\s*['"]websites_get['"][\s\S]*?\}/gi, '');
  s = s.replace(/\bwebsites_get\s*\{[\s\S]*?\}/gi, '');
  s = s.replace(/\b(?:tool|function)\s*=>\s*['"]websites_get['"][\s\S]*?(?:\n\s*\}|$)/gi, '');
  // No /m on $ — we need to strip from marker through end of entire reply (multi-line junk after tool_call).
  s = s.replace(/\bminimax\s*:\s*tool_calls?\b[\s\S]*/i, '');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

function polishAssistantText(raw) {
  if (!raw) return '';
  let t = String(raw)
    .replace(/<redacted_thinking>[\s\S]*?<\/think>/gi, '')
    .trim();
  t = sanitizeYear(t);
  t = stripLlmToolArtifacts(t);
  // Some streams leave only a blockquote marker or whitespace — would render as a stray “>” / empty box.
  if (/^[>\s\u00a0\u200b]+$/u.test(t)) return '';
  t = decodeHtmlEntities(t);
  return t;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── URL snapshot via proxy ──
async function getUrlSnapshot(url, retryCount = 0) {
  if (!url) return null;
  const maxRetries = 2;
  const retryDelay = 1000; // 1 second
  
  try {
    const res = await fetch(`${PROXY_URL}?url=${encodeURIComponent(url)}`);
    
    // Handle 429 rate limit error with retry
    if (res.status === 429 && retryCount < maxRetries) {
      console.log(`[URL Debug] Rate limited, retrying in ${retryDelay}ms... (${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return await getUrlSnapshot(url, retryCount + 1);
    }
    
    if (!res.ok) {
      console.log(`[URL Debug] Proxy failed with status: ${res.status}`);
      return null;
    }
    
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title = (doc.querySelector('title')?.textContent || '').trim();
    const description = (doc.querySelector('meta[name="description"]')?.getAttribute('content') || '').trim();
    const h1 = (doc.querySelector('h1')?.textContent || '').trim();
    const bodyText = (doc.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 2500);
    const parts = [
      title && `- Title: ${title}`,
      description && `- Meta Description: ${description}`,
      h1 && `- H1: ${h1}`,
      bodyText && `- Text Excerpt: ${bodyText}`,
    ].filter(Boolean);
    if (!parts.length) return null;
    return `【URL Snapshot】\n- URL: ${url}\n${parts.join('\n')}`;
  } catch (error) {
    console.error('[URL Debug] Fetch error:', error);
    return null;
  }
}

/** 仅当 AI 明确写出「快捷追问 / You might also ask」区块时，才把下列行抽成点击填入输入框的 chip；绝不根据「最后几行」自动剥离，避免把 AI 反问用户的话当成快捷输入 */
const SUGGESTION_BLOCK_START =
  /^(你可能还想|你还可以|相关问题|延伸问题|推荐问题|继续探索|快捷追问|Related questions|Follow[- ]?up questions|Suggested (?:next )?(?:questions|prompts)|You (?:might|may|can) also (?:ask|try))/i;

// ── Extract optional quick-reply chips (user phrasing to send back), NOT AI’s questions to the user ──
function extractSuggestions(text) {
  if (!text) return { cleanText: text, suggestions: [] };
  const lines = text.split('\n');
  const suggestions = [];
  const keep = [];
  let inSuggestionBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (SUGGESTION_BLOCK_START.test(trimmed)) {
      inSuggestionBlock = true;
      continue;
    }

    if (inSuggestionBlock) {
      const qMatch = trimmed.match(/^(?:[-•*>\d]+[.)：:\s]*|[🔹🔸▸▶➤→]+\s*)(.{8,})\s*$/);
      if (qMatch) {
        suggestions.push(qMatch[1].trim());
        continue;
      }
      const numbered = trimmed.match(/^(?:\d+[.)：:\s]+)(.{8,})\s*$/);
      if (numbered) {
        suggestions.push(numbered[1].trim());
        continue;
      }
      if (trimmed.length > 0) {
        keep.push(line);
        inSuggestionBlock = false;
      }
      continue;
    }

    keep.push(line);
  }

  return { cleanText: keep.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd(), suggestions: suggestions.slice(0, 4) };
}

function isTrivialGreetingOnly(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 80) return false;
  if (/https?:\/\//i.test(t)) return false;
  return /^(你好|您好|嗨|哈喽|在吗|早上好|下午好|晚上好|hi|hello|hey)(\s*[!！?？。,.，])*$/i.test(t);
}

// ════════════════════════════════════════════════════
// ChatInput — isolated so keystrokes never re-render the message list
// ════════════════════════════════════════════════════
const ChatInput = React.memo(function ChatInput({
  onSend, isLoading, placeholder, activeMode, onModeChange,
  modeIcons, modeLabels, modeColors, modeMenuRef, inputRef,
  uiLang, layout = 'docked', shortcutCards = [], onShortcutClick,
  draft, setDraft,
}) {
  const [input, setInput] = React.useState(draft || '');
  const [attachedImageUrl, setAttachedImageUrl] = React.useState(null);
  const [attachedProductRef, setAttachedProductRef] = React.useState(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isModeDropdownOpen, setIsModeDropdownOpen] = React.useState(false);
  const [inputHeight, setInputHeight] = React.useState(36);
  const composingRef = React.useRef(false);
  const textareaRef = React.useRef(null);
  const fileInputRef = React.useRef(null);
  /** Per-keystroke setDraft lifts state to App and re-renders the whole chat + markdown bubbles → visible flicker. Debounce parent updates. */
  const draftDebounceRef = React.useRef(null);

  const modeOptions = React.useMemo(() => ['auto', 'diagnosis', 'seo', 'page'], []);

  const flushDraftToParent = React.useCallback(
    (value) => {
      if (draftDebounceRef.current) {
        clearTimeout(draftDebounceRef.current);
        draftDebounceRef.current = null;
      }
      setDraft?.(value);
    },
    [setDraft]
  );

  const handleInputChange = React.useCallback(
    (value) => {
      setInput(value);
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
      draftDebounceRef.current = setTimeout(() => {
        draftDebounceRef.current = null;
        setDraft?.(value);
      }, 320);
    },
    [setDraft]
  );

  // Sync input with draft when draft prop changes (e.g., switching conversations)
  const prevDraftRef = React.useRef(draft);
  React.useEffect(() => {
    if (draft !== prevDraftRef.current) {
      prevDraftRef.current = draft;
      if (draftDebounceRef.current) {
        clearTimeout(draftDebounceRef.current);
        draftDebounceRef.current = null;
      }
      const next = draft || '';
      setInput((prev) => (prev === next ? prev : next));
    }
  }, [draft]);

  React.useEffect(
    () => () => {
      if (draftDebounceRef.current) {
        clearTimeout(draftDebounceRef.current);
        draftDebounceRef.current = null;
      }
    },
    []
  );

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target)) setIsModeDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [modeMenuRef]);

  // Expose methods to parent via ref - only update when inputRef changes
  React.useEffect(() => {
    if (inputRef) {
      inputRef.current = {
        setInput: (txt) => {
          setAttachedImageUrl(null);
          setAttachedProductRef(null);
          setInput(txt);
          flushDraftToParent(txt);
        },
        setProductReference: (product) => {
          setAttachedImageUrl(null);
          setAttachedProductRef(product || null);
          setInput('');
          flushDraftToParent('');
        },
        attachImageUrl: (url) => { setAttachedImageUrl(url || null); },
        focus: () => textareaRef.current?.focus(),
      };
    }
  }, [inputRef, flushDraftToParent]);

  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const minH = 24;
    const maxH = 120;
    if (!input.trim()) {
      el.style.height = `${minH}px`;
      el.style.overflowY = 'hidden';
      setInputHeight((prev) => (prev === minH ? prev : minH));
      return;
    }
    // `height: auto` avoids a collapsed intermediate frame (was minH then expand) that flickers with CJK text
    el.style.height = 'auto';
    const nextHeight = Math.min(Math.max(el.scrollHeight, minH), maxH);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
    setInputHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, [input]);

  const handleSend = React.useCallback(() => {
    if (composingRef.current) return;
    const v = input.trim();
    if (!v || isLoading) return;

    let payload = v;
    if (attachedProductRef?.url) {
      payload = payload
        ? `${payload}\n[Product](${attachedProductRef.url})`
        : `[Product](${attachedProductRef.url})`;
    }
    if (attachedImageUrl) {
      payload = /^\[?image\]?$/i.test(payload)
        ? `[Image](${attachedImageUrl})`
        : (payload ? `${payload}\n[Image](${attachedImageUrl})` : `[Image](${attachedImageUrl})`);
    }

    onSend(payload);
    setInput('');
    flushDraftToParent('');
    setAttachedImageUrl(null);
    setAttachedProductRef(null);
  }, [input, isLoading, onSend, attachedImageUrl, attachedProductRef, flushDraftToParent]);

  const handleKeyDown = React.useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.isComposing || e.nativeEvent?.isComposing || composingRef.current) return;
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handlePickFile = React.useCallback(async (file) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const fd = new FormData();
      // Field name must match the backend proxy expectation (`file`).
      fd.append('file', file);
      // Direct upload from browser (avoids server-side DNS/network restrictions).
      // If your browser blocks this due to CORS, we can fall back to a server proxy later.
      const res = await fetch('https://www.tangbuy.com/gateway/resource/common/oss/upload', {
        method: 'POST',
        body: fd,
        // Let browser set Content-Type boundary for multipart/form-data
        mode: 'cors',
      });
      const json = await res.json().catch(() => null);
      const url = json?.data;
      if (!res.ok || !url) throw new Error(json?.msg || json?.error || `Upload failed (${res.status})`);

      setAttachedImageUrl(url);
      setInput((prev) => {
        const next = prev && prev.trim() ? `${prev}\nImage` : 'Image';
        setTimeout(() => flushDraftToParent(next), 0);
        return next;
      });
      textareaRef.current?.focus();
    } catch (e) {
      console.error('[upload] failed:', e);
      setAttachedImageUrl(null);
      setInput((prev) => {
        const next = prev && prev.trim() ? `${prev}\n[Upload failed]` : '[Upload failed]';
        setTimeout(() => flushDraftToParent(next), 0);
        return next;
      });
    } finally {
      setIsUploading(false);
    }
  }, [flushDraftToParent]);

  const isPortal = layout === 'portal';

  return (
    <div id="chat-input-bar" className={isPortal ? '' : 'backdrop-blur-2xl'}
      style={isPortal
        ? { width: '100%' }
        : { flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)', background: 'transparent', transition: 'background 0.3s' }}>
      <div className={`${isPortal ? 'max-w-2xl px-0 py-0' : 'max-w-5xl px-4 md:px-6 py-3'} mx-auto space-y-2`}>
        {attachedImageUrl && (
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--brand-primary-fixed)' }}>Image</span>
              <a
                href={attachedImageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] underline underline-offset-2 truncate"
                style={{ color: 'var(--theme-text-secondary)' }}
                title={attachedImageUrl}
              >
                Preview
              </a>
            </div>
            <button
              type="button"
              onClick={() => setAttachedImageUrl(null)}
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-secondary)' }}
              title="Remove"
            >
              <span className="icon-x text-[14px]" />
            </button>
          </div>
        )}
        {attachedProductRef && (
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0 text-[12px] underline underline-offset-2 truncate" style={{ color: 'var(--brand-primary-fixed)' }} title={attachedProductRef.url}>
              {attachedProductRef.label}
            </div>
            <button
              type="button"
              onClick={() => setAttachedProductRef(null)}
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-secondary)' }}
              title="Remove"
            >
              <span className="icon-x text-[14px]" />
            </button>
          </div>
        )}
        <div
          className={`relative ${isPortal ? 'rounded-[22px]' : 'rounded-[24px]'} px-3.5 py-2 transition-[background-color,box-shadow,border-color] duration-300`}
          style={{
            background: isPortal ? 'rgba(255,255,255,0.72)' : 'var(--theme-card-bg)',
            border: '1px solid var(--theme-border)',
            boxShadow: isPortal
              ? '0 18px 50px rgba(30,41,59,0.08), inset 0 1px 0 rgba(255,255,255,0.82)'
              : '0 18px 40px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.03)',
            minHeight: Math.max(58, inputHeight + 26),
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              handlePickFile(f);
              e.target.value = '';
            }}
          />
          <div className="flex flex-col gap-1">
            <div className="min-w-0">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => handleInputChange(e.target.value.replace(/^\s+/, ''))}
                onBlur={() => {
                  const v = (textareaRef.current?.value ?? '').replace(/^\s+/, '');
                  flushDraftToParent(v);
                }}
                onCompositionStart={() => { composingRef.current = true; }}
                onCompositionEnd={() => { composingRef.current = false; }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="w-full outline-none text-[13px] md:text-[14px] resize-none transition-colors"
                rows={1}
                style={{ lineHeight: '1.35', height: inputHeight, minHeight: 22, maxHeight: 120, background: 'transparent', border: 'none', color: 'var(--theme-text)', whiteSpace: 'pre-wrap', overflowY: 'hidden', padding: 0 }}
              />
            </div>

            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative flex-shrink-0" ref={modeMenuRef}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsModeDropdownOpen((prev) => !prev); }}
                    className={`inline-flex items-center gap-1 px-0 py-0.5 text-[11px] font-medium transition-all whitespace-nowrap ${activeMode === 'auto' ? '' : (modeColors?.[activeMode] || '')}`}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: activeMode === 'auto' ? 'var(--brand-primary-fixed)' : undefined,
                    }}
                  >
                    <span className={`${modeIcons[activeMode] || modeIcons.auto} text-[12px]`} />
                    <span>{modeLabels[activeMode] || modeLabels.auto}</span>
                    <span className={`icon-chevron-${isModeDropdownOpen ? 'up' : 'down'} text-[12px]`} />
                  </button>
                  {isModeDropdownOpen && (
                    <div
                      className="absolute left-0 bottom-full mb-2 w-52 rounded-2xl overflow-hidden z-50"
                      style={{
                        background: 'var(--theme-dropdown-bg)',
                        border: '1px solid var(--theme-border)',
                        boxShadow: '0 20px 45px rgba(0,0,0,0.14)',
                      }}
                    >
                      {modeOptions.map((m) => {
                        const active = activeMode === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => { onModeChange(m); setIsModeDropdownOpen(false); }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-[12px] transition-colors"
                            style={{
                              background: active ? 'var(--theme-surface)' : 'transparent',
                              fontWeight: active ? 700 : 500,
                            }}
                          >
                            <span className={`${modeIcons[m]} text-[12px] shrink-0 ${m === 'auto' ? 'text-[var(--brand-primary-fixed)]' : (modeColors?.[m] || '')}`} />
                            <span
                              className="flex-1 min-w-0"
                              style={{ color: active ? 'var(--theme-text)' : 'var(--theme-text-secondary)' }}
                            >{modeLabels[m]}</span>
                            {active ? <span className="icon-check text-[12px]" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {!isPortal && shortcutCards.length > 0 && (
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-4 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {shortcutCards.map((card) => (
                      <button
                        key={card.key}
                        type="button"
                        onClick={() => onShortcutClick?.(card)}
                        className="text-[10px] md:text-[11px] font-normal transition-colors flex-shrink-0 text-left"
                        style={{ color: 'var(--theme-text-secondary)', background: 'transparent', border: 'none' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--brand-primary-fixed)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--theme-text-secondary)'; }}
                      >
                        {card.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isUploading}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                  style={{ background: 'transparent', border: '1px solid var(--theme-border)', color: 'var(--theme-text-muted)' }}
                  title="Upload image"
                >
                  <div className={isUploading ? 'icon-loader animate-spin text-[13px]' : 'icon-paperclip text-[13px]'} />
                </button>

                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:bg-[var(--theme-surface)] disabled:text-[var(--theme-text-muted)] transition-all hover:brightness-105 active:scale-95"
                  style={{
                    background: 'linear-gradient(180deg, var(--tb-brand-light) 0%, var(--brand-primary-fixed) 100%)',
                    border: '1px solid rgba(255,255,255,0.28)',
                    boxShadow: '0 8px 18px rgba(255,59,48,0.16), inset 0 1px 0 rgba(255,255,255,0.28)',
                  }}
                >
                  <div className={isLoading ? 'icon-loader animate-spin text-[12px]' : 'icon-arrow-up text-[12px]'} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

function getShortcutCards(uiLang) {
  return [
    {
      key: 'trend',
      title: uiLang === 'zh' ? '趋势商品集合' : 'Trending product set',
      subtitle: uiLang === 'zh' ? '快速发现值得关注的趋势商品' : 'Discover high-signal trend products fast',
      icon: 'icon-flame',
      prompt: uiLang === 'zh' ? '请为我提供2026年【品类】的选品建议' : 'Please recommend product ideas for 2026 in the category of [category].',
    },
    {
      key: 'diagnosis',
      title: uiLang === 'zh' ? '店铺分析诊断' : 'Store analysis diagnosis',
      subtitle: uiLang === 'zh' ? '分析页面、转化路径与增长问题' : 'Audit pages, conversion flow, and growth issues',
      icon: 'icon-activity',
      prompt: uiLang === 'zh' ? '请对【你的店铺网址】进行分析诊断' : 'Please analyze and diagnose [your store URL].',
    },
    {
      key: 'source',
      title: uiLang === 'zh' ? '寻找源头商品' : 'Find source products',
      subtitle: uiLang === 'zh' ? '基于需求寻找更优供应链商品' : 'Find factory-direct products for your needs',
      icon: 'icon-search-check',
      prompt: uiLang === 'zh' ? '请帮我分析【商品品类】的趋势。并推荐源头商品与供应链方案。' : 'Please analyze the trend of [product category] and recommend source products plus a supply-chain plan.',
    },
  ];
}

const ProgressiveProductList = React.memo(function ProgressiveProductList({ items, hasTrendRow, renderItem, scrollContainerRef, uiLang, animate = true, autoScroll = true }) {
  const [visibleCount, setVisibleCount] = React.useState(animate ? Math.min(1, items.length) : items.length);

  React.useEffect(() => {
    setVisibleCount(animate ? Math.min(1, items.length) : items.length);
  }, [items, hasTrendRow, animate]);

  React.useEffect(() => {
    if (!animate) return;
    if (!items.length) return;
    if (visibleCount >= items.length) return;
    const timer = window.setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + 1, items.length));
    }, hasTrendRow ? 180 : 160);
    return () => window.clearTimeout(timer);
  }, [visibleCount, items, hasTrendRow, animate]);

  React.useEffect(() => {
    if (!animate || !autoScroll) return;
    const el = scrollContainerRef?.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [visibleCount, scrollContainerRef, animate, autoScroll]);

  const visibleItems = items.slice(0, visibleCount);

  return (
    <div className="space-y-2">
      {animate && items.length > 1 && visibleCount < items.length ? (
        <div className="text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>
          {uiLang === 'zh' ? `正在展示 ${visibleCount} / ${items.length}` : `Showing ${visibleCount} / ${items.length}`}
        </div>
      ) : null}

      <div className={hasTrendRow ? 'flex flex-col gap-2.5' : 'flex gap-2.5 overflow-x-auto pb-1'}>
      {visibleItems.map((item, index) => (
        <div
          key={item?.id || index}
          className="transition-all duration-300 ease-out"
          style={{ opacity: 1, transform: 'translateY(0)' }}
        >
          {renderItem(item)}
        </div>
      ))}
      </div>
    </div>
  );
});

const WelcomePortal = React.memo(function WelcomePortal({ uiLang, t, isLoading, mode, onModeChange, modeIcons, modeLabels, modeColors, modeMenuRef, inputRef, onSend, onOpenSourcing, portalIntakeSlot }) {
  const cards = React.useMemo(() => getShortcutCards(uiLang), [uiLang]);

  const handleCardClick = React.useCallback((card) => {
    if (card.key === 'source' && onOpenSourcing) {
      onOpenSourcing();
    } else {
      inputRef.current?.setInput(card.prompt);
      inputRef.current?.focus();
    }
  }, [inputRef, onOpenSourcing]);

  return (
    <div className="min-h-full flex items-center justify-center px-6 py-10 transition-all duration-300" style={{ paddingBottom: '8vh' }}>
      <div className="w-full max-w-5xl flex flex-col items-center text-center">
        <div className="mb-5 flex items-center justify-center">
          <div className="tb-wordmark text-[34px] md:text-[54px] lg:text-[62px]">
            <span className="tb-wordmark__main">Tangbuy</span>
            <span className="tb-wordmark__accent">Agent</span>
          </div>
        </div>

        <div className="text-[20px] md:text-[28px] font-light tracking-[-0.02em] mb-8" style={{ color: 'var(--theme-text-secondary)' }}>
          Built for Brands That Want to Scale
        </div>

        {portalIntakeSlot ? (
          <div className="w-full max-w-4xl mb-5 text-left">{portalIntakeSlot}</div>
        ) : null}

        <div className="w-full max-w-2xl mb-6 transition-all duration-300">
          <ChatInput
            onSend={onSend}
            isLoading={isLoading}
            placeholder={t.chat.placeholder}
            activeMode={mode}
            onModeChange={onModeChange}
            modeIcons={modeIcons}
            modeLabels={modeLabels}
            modeColors={modeColors}
            modeMenuRef={modeMenuRef}
            inputRef={inputRef}
            uiLang={uiLang}
            layout="portal"
          />
        </div>

        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-3">
          {cards.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => handleCardClick(card)}
              className="group text-left rounded-2xl px-5 py-4 transition-all duration-300 hover:-translate-y-0.5"
              style={{
                background: 'rgba(255,255,255,0.18)',
                border: '1px solid rgba(255,255,255,0.26)',
                backdropFilter: 'blur(18px)',
                boxShadow: '0 10px 30px rgba(15,23,42,0.06)',
              }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.42)', color: 'var(--brand-primary-fixed)' }}>
                  <span className={`${card.icon} text-[16px]`} />
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold mb-1" style={{ color: 'var(--theme-text)' }}>{card.title}</div>
                  <div className="text-[12px] leading-5" style={{ color: 'var(--theme-text-secondary)' }}>{card.subtitle}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

// ════════════════════════════════════════════════════
// Shared Modal Wrapper
// ════════════════════════════════════════════════════

// ════════════════════════════════════════════════════
// Component
// ════════════════════════════════════════════════════
const VIP_KEY = 'Tangbuydropshipping2026';
const VIP_FLAG_KEY = 'tb_ai_vip_unlocked_v1';
const WHATSAPP_URL = FIND_US_WHATSAPP_URL;
const WHATSAPP_NUMBER = FIND_US_WHATSAPP_LABEL;

export function ModuleAIChat({
  t, uiLang, theme, messages: propMessages, setMessages: propSetMessages, draft, setDraft, onPublish, onQuotaChange, onReportCreated, onWorkflowProgressChange, onOpenSourcing,
  authUser = null, conversationId = '', isVip = false,
  guestFeatureLocked = false,
  onGuestFeatureBlocked,
  onOpenAuthModal,
  oauthMaxFreeQuota = MAX_FREE_QUOTA,
  hotProductDiagnosisRequest = null,
  onConsumedHotProductDiagnosisRequest,
}) {
  const [localMessages, localSetMessages] = React.useState([]);
  const messages = propMessages || localMessages;
  const setMessages = propSetMessages || localSetMessages;
  const initialMessageCountRef = React.useRef(Array.isArray(propMessages) ? propMessages.length : 0);
  const initialLastMessageIsProductsRef = React.useRef(Array.isArray(propMessages) && propMessages.length > 0
    ? ['products', 'products_hot', 'products_trend', 'search_picks'].includes(propMessages[propMessages.length - 1]?.type)
    : false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [allProducts, setAllProducts] = React.useState([]);
  const [mode, setMode] = React.useState('auto');
  const [showModeMenu, setShowModeMenu] = React.useState(false);
  const [knownSite, setKnownSite] = React.useState(null);
  const [knownContentLang, setKnownContentLang] = React.useState(null);
  const chatContainerRef = React.useRef(null);
  /** 仅当用户未主动上滑查看历史时为 true；流式输出时才能跟着滚到底 */
  const stickToBottomRef = React.useRef(true);
  const modeMenuRef = React.useRef(null);
  const chatInputRef = React.useRef(null);

  const emptyGeoIntake = React.useMemo(
    () => ({
      storeUrl: '',
      coreProduct: '',
      pricePositioning: '',
      targetAudience: '',
      usp: '',
      objections: '',
      competitors: '',
      marketingStatus: '',
    }),
    []
  );
  const [geoIntake, setGeoIntake] = React.useState(() => ({ ...emptyGeoIntake }));
  const [geoIntakeSubmitted, setGeoIntakeSubmitted] = React.useState(false);
  const [diagnosisIntakeUrl, setDiagnosisIntakeUrl] = React.useState('');
  const [seoIntakeUrl, setSeoIntakeUrl] = React.useState('');
  const [diagnosisIntakeSubmitted, setDiagnosisIntakeSubmitted] = React.useState(false);
  const [seoIntakeSubmitted, setSeoIntakeSubmitted] = React.useState(false);

  React.useEffect(() => {
    setGeoIntake({ ...emptyGeoIntake });
    setGeoIntakeSubmitted(false);
    setDiagnosisIntakeUrl('');
    setSeoIntakeUrl('');
    setDiagnosisIntakeSubmitted(false);
    setSeoIntakeSubmitted(false);
  }, [conversationId, emptyGeoIntake]);

  const [showVipModal, setShowVipModal] = React.useState(false);
  const [vipKeyInput, setVipKeyInput] = React.useState('');
  const [vipKeyError, setVipKeyError] = React.useState('');

  // Country selection modal for AI Diagnose
  const [showCountryModal, setShowCountryModal] = React.useState(false);
  const [selectedCountries, setSelectedCountries] = React.useState([]);
  const [pendingProductForDiagnosis, setPendingProductForDiagnosis] = React.useState(null);

  // Audience selection modal for AI Diagnose
  const [showAudienceModal, setShowAudienceModal] = React.useState(false);
  const [selectedAges, setSelectedAges] = React.useState([]);
  const [selectedCharacteristics, setSelectedCharacteristics] = React.useState([]);
  // Target market and audience context for AI diagnosis
  const [diagnosisContext, setDiagnosisContext] = React.useState(null);

  // 9-Step Diagnosis Workflow State
  const [diagnosisWorkflow, setDiagnosisWorkflow] = React.useState(null);
  const [workflowStepResults, setWorkflowStepResults] = React.useState([]);
  const [isWorkflowRunning, setIsWorkflowRunning] = React.useState(false);
  const workflowAbortRef = React.useRef(false);
  const workflowRef = React.useRef(null);
  const pendingWorkflowRef = React.useRef(null);

  // Workflow Progress State
  const [currentWorkflowStep, setCurrentWorkflowStep] = React.useState(-1);
  const [workflowProgressPercent, setWorkflowProgressPercent] = React.useState(0);
  const [currentStepName, setCurrentStepName] = React.useState('');

  // Report progress to parent (Header)
  React.useEffect(() => {
    if (onWorkflowProgressChange) {
      onWorkflowProgressChange({
        isRunning: isWorkflowRunning,
        stepName: currentStepName,
        percent: workflowProgressPercent,
        step: currentWorkflowStep,
      });
    }
  }, [isWorkflowRunning, currentStepName, workflowProgressPercent, currentWorkflowStep, onWorkflowProgressChange]);

  // Diagnosis Modal States
  const [showDiagnosisStartModal, setShowDiagnosisStartModal] = React.useState(false);
  const [showDiagnosisCompleteModal, setShowDiagnosisCompleteModal] = React.useState(false);
  const [completedReport, setCompletedReport] = React.useState(null);

  // Audience data with logical associations
  const AGE_GROUPS = React.useMemo(() => [
    { code: 'kids', name: 'Kids (0-12)', nameZh: '儿童 (0-12岁)', validChars: ['parents', 'family_oriented', 'value_seekers'] },
    { code: 'teens', name: 'Teens (13-19)', nameZh: '青少年 (13-19岁)', validChars: ['students', 'trend_followers', 'value_seekers', 'tech_savvy'] },
    { code: 'young_adults', name: 'Young Adults (20-35)', nameZh: '年轻人 (20-35岁)', validChars: ['students', 'young_professionals', 'trend_followers', 'tech_savvy', 'value_seekers', 'new_parents'] },
    { code: 'middle_aged', name: 'Middle-aged (36-55)', nameZh: '中年人 (36-55岁)', validChars: ['parents', 'middle_class', 'professionals', 'health_conscious', 'home_owners', 'value_seekers'] },
    { code: 'seniors', name: 'Seniors (55+)', nameZh: '老年人 (55+)', validChars: ['retirees', 'health_conscious', 'family_oriented', 'value_seekers'] },
  ], []);

  const AUDIENCE_CHARACTERISTICS = React.useMemo(() => [
    { code: 'students', name: 'Students', nameZh: '学生群体', validAges: ['teens', 'young_adults'] },
    { code: 'young_professionals', name: 'Young Professionals', nameZh: '年轻职场人', validAges: ['young_adults'] },
    { code: 'professionals', name: 'Professionals', nameZh: '职场精英', validAges: ['middle_aged'] },
    { code: 'middle_class', name: 'Middle Class', nameZh: '中产阶级', validAges: ['middle_aged'] },
    { code: 'parents', name: 'Parents', nameZh: '父母', validAges: ['kids', 'middle_aged'] },
    { code: 'new_parents', name: 'New Parents', nameZh: '新手父母', validAges: ['young_adults'] },
    { code: 'retirees', name: 'Retirees', nameZh: '退休人员', validAges: ['seniors'] },
    { code: 'trend_followers', name: 'Trend Followers', nameZh: '潮流追随者', validAges: ['teens', 'young_adults'] },
    { code: 'tech_savvy', name: 'Tech Savvy', nameZh: '科技爱好者', validAges: ['teens', 'young_adults'] },
    { code: 'health_conscious', name: 'Health Conscious', nameZh: '注重健康', validAges: ['middle_aged', 'seniors'] },
    { code: 'home_owners', name: 'Home Owners', nameZh: '房主', validAges: ['middle_aged'] },
    { code: 'family_oriented', name: 'Family Oriented', nameZh: '家庭导向', validAges: ['kids', 'seniors'] },
    { code: 'value_seekers', name: 'Value Seekers', nameZh: '性价比追求者', validAges: ['kids', 'teens', 'young_adults', 'middle_aged', 'seniors'] },
  ], []);

  // Step name translations for progress display
  const STEP_NAME_TRANSLATIONS = React.useMemo(() => ({
    zh: [
      '任务调度', '市场趋势分析', '竞品对标分析', '深度拆解分析',
      '机会地图', '概念方案生成', '视觉创意提示', '广告文案套件', '执行路线图', '最终报告整合'
    ],
    en: [
      'Task Scheduler', 'Market Trend Analysis', 'Competitive Benchmark', 'Deep Dive Analysis',
      'Opportunity Map', 'Concept Briefs', 'Visual Creative Prompts', 'Ad Copy Kit', 'Execution Roadmap', 'Final Report'
    ]
  }), []);
  const COUNTRY_LIST = React.useMemo(() => [
    { code: 'US', name: 'United States', nameZh: '美国' },
    { code: 'UK', name: 'United Kingdom', nameZh: '英国' },
    { code: 'CA', name: 'Canada', nameZh: '加拿大' },
    { code: 'AU', name: 'Australia', nameZh: '澳大利亚' },
    { code: 'DE', name: 'Germany', nameZh: '德国' },
    { code: 'FR', name: 'France', nameZh: '法国' },
    { code: 'IT', name: 'Italy', nameZh: '意大利' },
    { code: 'ES', name: 'Spain', nameZh: '西班牙' },
    { code: 'NL', name: 'Netherlands', nameZh: '荷兰' },
    { code: 'BE', name: 'Belgium', nameZh: '比利时' },
    { code: 'TR', name: 'Turkey', nameZh: '土耳其' },
    { code: 'PL', name: 'Poland', nameZh: '波兰' },
    { code: 'SE', name: 'Sweden', nameZh: '瑞典' },
    { code: 'AT', name: 'Austria', nameZh: '奥地利' },
    { code: 'CH', name: 'Switzerland', nameZh: '瑞士' },
    { code: 'DK', name: 'Denmark', nameZh: '丹麦' },
    { code: 'FI', name: 'Finland', nameZh: '芬兰' },
    { code: 'IE', name: 'Ireland', nameZh: '爱尔兰' },
  ], []);

  const COUNTRY_FLAGS = {
    US: '🇺🇸', UK: '🇬🇧', CA: '🇨🇦', AU: '🇦🇺', DE: '🇩🇪', FR: '🇫🇷',
    IT: '🇮🇹', ES: '🇪🇸', NL: '🇳🇱', BE: '🇧🇪', TR: '🇹🇷', PL: '🇵🇱',
    SE: '🇸🇪', AT: '🇦🇹', CH: '🇨🇭', DK: '🇩🇰', FI: '🇫🇮', IE: '🇮🇪',
  };
  const countryFlag = (code) => COUNTRY_FLAGS[code] || '';

  const tryUnlockVip = React.useCallback(async () => {
    const key = vipKeyInput.trim();
    if (supabase && authUser) {
      const res = await claimVipRemote(supabase, key);
      if (res?.ok) {
        track(AnalyticsEvent.VIP_CODE_SUBMIT, { success: true, mode: 'remote' });
        setShowVipModal(false);
        setVipKeyError('');
        onQuotaChange?.();
      } else {
        track(AnalyticsEvent.VIP_CODE_SUBMIT, { success: false, mode: 'remote' });
        setVipKeyError(uiLang === 'zh' ? '密钥无效，请重试。' : 'Invalid key, please try again.');
      }
      return;
    }
    if (key === VIP_KEY) {
      track(AnalyticsEvent.VIP_CODE_SUBMIT, { success: true, mode: 'local' });
      setShowVipModal(false);
      setVipKeyError('');
      try { localStorage.setItem(VIP_FLAG_KEY, '1'); } catch {}
      onQuotaChange?.();
    } else {
      track(AnalyticsEvent.VIP_CODE_SUBMIT, { success: false, mode: 'local' });
      setVipKeyError(uiLang === 'zh' ? '密钥无效，请重试。' : 'Invalid key, please try again.');
    }
  }, [vipKeyInput, uiLang, onQuotaChange, authUser, supabase]);

  const prevShowVipModalRef = React.useRef(false);
  React.useEffect(() => {
    if (showVipModal && !prevShowVipModalRef.current) {
      track(AnalyticsEvent.QUOTA_MODAL_OPEN, { is_guest_quota: guestFeatureLocked });
    }
    prevShowVipModalRef.current = showVipModal;
  }, [showVipModal, guestFeatureLocked]);

  const isFirstRender = React.useRef(true);
  const prevMessagesRef = React.useRef(propMessages);

  React.useEffect(() => {
    if (prevMessagesRef.current !== propMessages) {
      prevMessagesRef.current = propMessages;
      isFirstRender.current = true;
      stickToBottomRef.current = true;
      initialMessageCountRef.current = Array.isArray(propMessages) ? propMessages.length : 0;
    }
  }, [propMessages]);

  const CHAT_SCROLL_PIN_PX = 100;
  const onChatScroll = React.useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = gap <= CHAT_SCROLL_PIN_PX;
  }, []);

  React.useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      requestAnimationFrame(() => {
        const c = chatContainerRef.current;
        if (!c) return;
        c.scrollTop = c.scrollHeight;
        stickToBottomRef.current = true;
      });
      return;
    }
    if (!stickToBottomRef.current) return;
    requestAnimationFrame(() => {
      const c = chatContainerRef.current;
      if (!c || !stickToBottomRef.current) return;
      c.scrollTop = c.scrollHeight;
    });
  }, [messages, isLoading]);

  React.useEffect(() => {
    const h = (e) => { if (modeMenuRef.current && !modeMenuRef.current.contains(e.target)) setShowModeMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const uiLangLabel = React.useMemo(() => {
    const m = { en: 'English', zh: '中文', es: 'Español', fr: 'Français' };
    return m[uiLang] || 'English';
  }, [uiLang]);

  const currencyCfg = React.useMemo(() => {
    const rates = { zh: { rate: 1, symbol: '¥', decimals: 2 }, en: { rate: 0.14, symbol: '$', decimals: 2 }, es: { rate: 0.13, symbol: '€', decimals: 2 }, fr: { rate: 0.13, symbol: '€', decimals: 2 } };
    return rates[uiLang] || rates.en;
  }, [uiLang]);

  const fmtPrice = React.useCallback((rmb) => {
    const n = Number(rmb);
    if (!Number.isFinite(n) || n <= 0) return 'N/A';
    return `${currencyCfg.symbol}${(n * currencyCfg.rate).toFixed(currencyCfg.decimals)}`;
  }, [currencyCfg]);

  // ── Load product data ──
  React.useEffect(() => {
    loadProductCatalog().then(setAllProducts).catch((e) => console.error('[catalog] initial load', e));
    ensureKnowledgeBasesLoaded().catch((e) => console.error('[knowledge-base] initial load', e));
  }, []);

  const shownIdsRef = React.useRef(new Set());

  function shuffle(arr, seed = null) {
    const a = arr.slice();
    // Use timestamp as seed for better randomness
    const random = seed ? () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    } : Math.random;
    
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function interleave(amazon, tiktok, max) {
    const a = amazon.slice(0, max), tt = tiktok.slice(0, max);
    const out = [];
    let ia = 0, it = 0;
    while (ia < a.length || it < tt.length) {
      if (ia < a.length) out.push(a[ia++]);
      if (it < tt.length) out.push(tt[it++]);
    }
    return out;
  }

  // returns { matched: Product[], isExact: boolean } — `catalogOverride` when state not ready yet (first message race).
  const smartSearch = React.useCallback((query, extraContext, catalogOverride) => {
    // Note: shownIdsRef is now cleared only when user sends a new message, not on every search
    // This prevents showing duplicate products within the same conversation session
    const isTrendProduct = (p) => p?.variant === 'trend' || p?.variant === 'bestseller' || p?.platform === 'Trend' || p?.platform === 'MonthlyTop';

    const combined = [query, extraContext].filter(Boolean).join(' ');
    const baseList = catalogOverride?.length ? catalogOverride : allProducts;

    const cats = detectCategories(combined);
    const priceRange = parsePriceRange(combined);
    const minSold = parseMinSold(combined);

    const translatedTerms = translateZhToEn(combined);

    const freeTerms = combined.toLowerCase()
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/[\d]+\s*[-~到至]\s*[\d]+/g, '')
      .replace(/(商品|产品|选品|爆款|热卖|采购|找货|推荐|价格|预算|月销|销量|supplier|products?|trending|best seller|sourcing|recommend|price|budget|sold|sales|under|below|above|over|不超过|低于|高于|至少|最少|最多|title|meta|description|url|snapshot|text|excerpt)/gi, '')
      .split(/[\s,，;；、]+/).filter((w) => w.length >= 2);

    const allSearchTerms = [...new Set([...freeTerms, ...translatedTerms])];

    const hasFilter = cats.length > 0 || priceRange || minSold !== null || allSearchTerms.length > 0;

    // Explicit “趋势 / Product.json” intent: only trend rows, with fuzzy + random fallback so cards always show when data exists.
    const wantsTrendCatalog = /(趋势\s*商品|趋势选品|找趋势|我要找趋势|我要.*趋势|热销趋势|流量趋势|爆款趋势)/i.test(combined);
    if (wantsTrendCatalog) {
      let trendPool = baseList.filter(isTrendProduct).filter((p) => !shownIdsRef.current.has(p.id));
      if (trendPool.length === 0) trendPool = baseList.filter(isTrendProduct);
      if (trendPool.length > 0) {
        const scoredTrend = trendPool.map((p) => {
          let score = 0;
          if (cats.length > 0) {
            for (const cat of cats) {
              if (cat.keywords.some((kw) => p.searchLower?.includes(kw))) { score += 10; break; }
            }
          }
          for (const w of allSearchTerms) { if (p.searchLower?.includes(w)) score += 5; }
          if (allSearchTerms.some((w) => p.searchLower?.includes(w))) score += 35;
          if (priceRange) {
            if (p.priceRmb >= priceRange.min && p.priceRmb <= priceRange.max) score += 8;
            else if (p.priceRmb > 0) score -= 3;
          }
          if (minSold !== null) {
            if (p.monthSoldNum >= minSold) score += 6;
            else score -= 2;
          }
          score += Math.random() * 2;
          return { ...p, _score: score };
        });
        let matchedTrend = scoredTrend.filter((p) => p._score >= 5).sort((a, b) => b._score - a._score);
        let result = matchedTrend.slice(0, 10);
        if (result.length === 0) {
          const fuzzy = trendPool.filter((p) => allSearchTerms.some((w) => p.searchLower?.includes(w)));
          const pickFrom = fuzzy.length ? shuffle(fuzzy, Date.now() + 3) : shuffle(trendPool, Date.now() + 4);
          result = pickFrom.slice(0, Math.min(10, pickFrom.length));
        }
        result.forEach((p) => shownIdsRef.current.add(p.id));
        return { matched: result, isExact: matchedTrend.length > 0 };
      }
    }

    const available = baseList.filter((p) => !shownIdsRef.current.has(p.id));
    const pool = available.length >= 8 ? available : baseList;

    let scored = pool.map((p) => {
      let score = 0;
      if (cats.length > 0) {
        for (const cat of cats) {
          if (cat.keywords.some((kw) => p.searchLower?.includes(kw))) { score += 10; break; }
        }
      }
      for (const w of allSearchTerms) { if (p.searchLower?.includes(w)) score += 5; }
      if (isTrendProduct(p) && allSearchTerms.some((w) => p.searchLower?.includes(w))) score += 35;
      if (priceRange) {
        if (p.priceRmb >= priceRange.min && p.priceRmb <= priceRange.max) score += 8;
        else if (p.priceRmb > 0) score -= 3;
      }
      if (minSold !== null) {
        if (p.monthSoldNum >= minSold) score += 6;
        else score -= 2;
      }
      score += Math.random() * 2;
      return { ...p, _score: score };
    });

    const matched = scored.filter((p) => p._score >= 5);

    const trendHits = matched.filter(isTrendProduct).sort((a, b) => b._score - a._score);
    if (trendHits.length > 0) {
      const result = trendHits.slice(0, 10);
      result.forEach((p) => shownIdsRef.current.add(p.id));
      const isExact = hasFilter || (allSearchTerms.length > 0 && trendHits[0]._score >= 8);
      return { matched: result, isExact };
    }

    const classicMatched = matched.filter((p) => !isTrendProduct(p));

    if (classicMatched.length >= 4) {
      classicMatched.sort((a, b) => b._score - a._score);
      const topAm = shuffle(classicMatched.filter((p) => p.platform === 'Amazon').slice(0, 8), Date.now());
      const topTt = shuffle(classicMatched.filter((p) => p.platform === 'TikTok').slice(0, 8), Date.now() + 2);
      const result = interleave(topAm, topTt, 5);
      result.forEach((p) => shownIdsRef.current.add(p.id));
      return { matched: result, isExact: true };
    }

    if (hasFilter && classicMatched.length > 0) {
      const topAm = shuffle(classicMatched.filter((p) => p.platform === 'Amazon'), Date.now());
      const topTt = shuffle(classicMatched.filter((p) => p.platform === 'TikTok'), Date.now() + 1);
      const result = interleave(topAm, topTt, 5);
      result.forEach((p) => shownIdsRef.current.add(p.id));
      return { matched: result, isExact: true };
    }

    const randomPool = shuffle(pool.filter((p) => !isTrendProduct(p)), Date.now());
    console.log('[DEBUG] Random pool size:', randomPool.length);
    const rAm = randomPool.filter((p) => p.platform === 'Amazon').slice(0, 5);
    const rTt = randomPool.filter((p) => p.platform === 'TikTok').slice(0, 5);
    console.log('[DEBUG] Amazon candidates:', rAm.length, 'TikTok candidates:', rTt.length);
    const result = interleave(rAm, rTt, 5);
    console.log('[DEBUG] Final result IDs:', result.map(p => p.id));
    result.forEach((p) => shownIdsRef.current.add(p.id));
    return { matched: result, isExact: false };
  }, [allProducts]);

  // ── Build system message with auto-intent detection ──
  const buildSystemMessage = React.useCallback((currentInput, snapshot) => {
    let activePrompt;
    let activeSkill = mode;
    if (mode === 'auto') {
      const skill = detectIntentFromInput(currentInput, snapshot);
      activeSkill = skill || 'auto';
      activePrompt = skill ? PROMPTS[skill] : PROMPTS.auto;
    } else {
      activePrompt = PROMPTS[mode] || PROMPTS.auto;
    }

    const langConstraint = `\n\n[Reply language — mandatory]\n- Write the **entire** reply in **${uiLangLabel}**, matching the app language selected in the header (top-right).\n- Do not mix languages in one reply unless the user explicitly asks for bilingual output.\n- If the user explicitly demands a specific reply language, follow that request.\n`;
    const yearConstraint = `\n\n[Time & year]\n- Treat campaign, seasonal, and holiday planning as **${ANALYSIS_YEAR} and later**.\n- Do not frame 2024 or earlier as “upcoming”; forward-looking advice must sit in ${ANALYSIS_YEAR}+.\n- Past years may appear as historical data; do not keep saying “based on ${ANALYSIS_YEAR}” unless the user asks.\n`;
    const siteCtx = knownSite ? `\n\n[Known site]\n- Site: ${knownSite}\n- Reuse prior analysis for the same domain; treat a new domain as a fresh model.\n` : '';
    const normalizedLang = normalizeKnowledgeLang(uiLang);
    const tangbuyBaseGuidance = TANGBUY_GUIDANCE[normalizedLang] || TANGBUY_GUIDANCE.en;
    const tangbuyKnowledgeCtx = shouldInjectTangbuyKnowledge(currentInput, snapshot, activeSkill)
      ? buildTangbuyKnowledgeContext(normalizedLang, currentInput, snapshot, activeSkill).context
      : '';

    const diagnosisCtx = diagnosisContext
      ? `\n\n[AI diagnosis — target market]\n${diagnosisContext.prompt}\n\nPrioritize that market’s shopper preferences, purchasing power, and competitive landscape.\n`
      : '';

    const tangbuyExecutionHint = ['diagnosis', 'seo', 'page'].includes(activeSkill)
      ? `\n\n[Tangbuy execution reminder]\n- Keep the main analysis first.\n- If the answer touches product recommendations, sourcing, fulfillment, shipping/logistics, supplier choice, or inventory risk, add **one concise execution paragraph** on how Tangbuy Dropshipping can implement it (procurement, QC, warehousing, packing, shipping, after-sales coordination).\n- Use natural advisory tone; no hard sell.\n`
      : '';

    const greetingHint = isTrivialGreetingOnly(currentInput)
      ? `\n\n[Brief greeting — user has not asked a concrete question yet]\n- Reply warmly in a few sentences. You may use a short bullet list of **what you can help with** (e.g. 独立站诊断、SEO、选品思路).\n- Do **not** ask the user to “provide a product URL / category” or similar intake-style questions. Do **not** use numbered “请提供…” questionnaires.\n- End with a single open line such as: 有具体问题或链接时直接发我即可 — not a list of demands.\n`
      : '';

    return { role: 'system', content: activePrompt + tangbuyBaseGuidance + tangbuyKnowledgeCtx + langConstraint + yearConstraint + siteCtx + diagnosisCtx + tangbuyExecutionHint + greetingHint };
  }, [mode, knownSite, uiLang, uiLangLabel, diagnosisContext]);

  // ── SSE streaming response ──
  const streamResponse = async (apiMessages) => {
    let res;
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, stream: true, max_tokens: 4000, temperature: 0.7 }),
      });
    } catch (e) {
      const detail = e?.message || 'Network request failed';
      throw new Error(`Chat service connection failed. Please check whether the Vite dev server and the upstream VLLM service are reachable. Detail: ${detail}`);
    }
    if (!res.ok || !res.body) {
      let detail = '';
      try { detail = await res.text(); } catch (_) {}
      throw new Error(`API ${res.status}: ${detail || res.statusText}`);
    }

    const streamId = Date.now();
    setMessages((prev) => [...prev, { role: 'ai', type: 'text', content: '', _streamId: streamId }]);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let lastProcessedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
            fullContent += delta;
            const newContent = fullContent.slice(lastProcessedLength);
            const cleanedDelta = polishAssistantText(newContent);
            if (cleanedDelta || lastProcessedLength === 0) {
              lastProcessedLength = fullContent.length;
              const cleanedFull = maskStreamingProductJsonBlock(polishAssistantText(fullContent), uiLang);
              setMessages((prev) => prev.map((m) => (m._streamId === streamId ? { ...m, content: cleanedFull } : m)));
            }
          }
        } catch (_) {}
      }
    }

    const finalContent = polishAssistantText(fullContent);
    const parts = finalContent.split(HTML_SPLIT_DELIM);

    let textPart = finalContent;
    let htmlPart = '';
    if (parts.length > 1) {
      textPart = parts[0].trim();
      htmlPart = parts.slice(1).join(HTML_SPLIT_DELIM).trim();
    }

    const catalogFromAi = parseCatalogProductJsonFromMarkdown(textPart || finalContent);

    if (catalogFromAi?.products?.length) {
      const textWithoutJson = (catalogFromAi.strippedText || '').trim();
      const seeds = catalogFromAi.products.map((p) => p.name || p.title).filter(Boolean);
      const picksData = buildTangbuySearchPicksFromContext({
        userText: '',
        aiText: textWithoutJson,
        seedNames: seeds,
        uiLang,
        max: 5,
      });
      const picksHeading =
        uiLang === 'zh'
          ? '### 📦 Tangbuy 搜索\n\n点击下列**款式关键词**直达货源搜索（不展开链接）：'
          : '### 📦 Tangbuy search\n\nTap a product keyword to search on Tangbuy:';
      const combinedContent =
        textWithoutJson.length > 0 ? `${textWithoutJson}\n\n${picksHeading}` : picksHeading.trimEnd();
      setMessages((prev) => {
        const without = prev.filter((m) => m._streamId !== streamId);
        const messages = [...without];
        if (picksData.length >= 2) {
          messages.push({
            role: 'ai',
            type: 'search_picks',
            content: combinedContent,
            data: picksData,
          });
        } else if (textWithoutJson.trim()) {
          messages.push({ role: 'ai', type: 'text', content: textWithoutJson.trim() });
        }
        if (htmlPart) messages.push({ role: 'ai', type: 'html', content: htmlPart });
        return messages;
      });
    } else if (parts.length <= 1) {
      setMessages((prev) => {
        const without = prev.filter((m) => m._streamId !== streamId);
        return [...without, { role: 'ai', type: 'text', content: finalContent }];
      });
    } else {
      setMessages((prev) => {
        const without = prev.filter((m) => m._streamId !== streamId);
        return [
          ...without,
          ...(textPart ? [{ role: 'ai', type: 'text', content: textPart }] : []),
          ...(htmlPart ? [{ role: 'ai', type: 'html', content: htmlPart }] : []),
        ];
      });
    }

    return {
      finalText: finalContent,
      textPart,
      htmlPart,
      finalSearchText: (textPart || finalContent),
    };
  };

  // ── Send message ──
  /** @returns {Promise<boolean>} true if the message was accepted (quota OK) and sent to the model */
  const send = React.useCallback(async (txt, opts = {}) => {
    if (!txt || isLoading) return false;

    // Clear shown product IDs when user sends a new message
    // This ensures fresh results for new queries while preventing duplicates within a session
    const beforeSize = shownIdsRef.current.size;
    shownIdsRef.current.clear();
    console.log('[DEBUG] shownIdsRef cleared on new message, was tracking', beforeSize, 'products');

    const urls = extractUrlsFromText(txt);

    const useServerQuota = supabase && authUser && !isAnonymousUser(authUser);
    if (useServerQuota) {
      const res = await consumeChatTurn(supabase, {
        conversationId,
        content: txt,
        extractedUrls: urls,
      });
      if (!res?.allowed) {
        if (res?.reason === 'quota_exhausted') {
          setShowVipModal(true);
          setVipKeyInput('');
          setVipKeyError('');
        }
        return false;
      }
      onQuotaChange?.();
    } else {
      if (!isVip && getRemainingQuota(MAX_GUEST_QUOTA) <= 0) {
        setShowVipModal(true);
        setVipKeyInput('');
        setVipKeyError('');
        return false;
      }
      incrementQuota();
      onQuotaChange?.();
    }

    stickToBottomRef.current = true;
    setMessages((p) => [...p, { role: 'user', type: 'text', content: txt }]);
    setIsLoading(true);

    try {
      await ensureKnowledgeBasesLoaded();

      const url0 = extractFirstUrl(txt);
      console.log('[URL Debug] Extracted URL:', url0, 'from input:', txt);
      const isImageUrl = !!(url0 && /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(url0));
      if (url0 && !isImageUrl) {
        try { setKnownSite(new URL(url0).origin); } catch (_) {}
      }
      const detectedLang = detectLanguageFromText(txt);
      if (detectedLang?.confidence === 'high') setKnownContentLang(detectedLang);

      const contextMessages = messages
        .filter((m) => m.role === 'user' || m.role === 'ai')
        .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
      contextMessages.push({ role: 'user', content: txt });

      let snapshot = null;
      if (url0 && !isImageUrl) {
        console.log('[URL Debug] Attempting to fetch snapshot for:', url0);
        try { 
          snapshot = await getUrlSnapshot(url0); 
          console.log('[URL Debug] Snapshot result:', snapshot ? 'success' : 'failed');
        } catch (e) { 
          console.error('[URL Debug] Snapshot error:', e);
        }
      }
      if (snapshot) contextMessages.push({ role: 'user', content: snapshot });

      const outLangForKnowledge = detectedLang?.confidence === 'high' ? detectedLang : (knownContentLang || { lang: uiLang });
      const normalizedKnowledgeLang = normalizeKnowledgeLang(outLangForKnowledge.lang || uiLang);
      const detectedIntent = mode === 'auto' ? detectIntentFromInput(txt, snapshot) || 'auto' : mode;
      const tangbuyKnowledgePacket = shouldInjectTangbuyKnowledge(txt, snapshot, detectedIntent)
        ? buildTangbuyKnowledgeContext(normalizedKnowledgeLang, txt, snapshot, detectedIntent)
        : null;

      const systemMessage = buildSystemMessage(txt, snapshot);
      const tangbuyRetrievalMessage = tangbuyKnowledgePacket
        ? {
          role: 'system',
          content: `请优先基于以下 Tangbuy 知识库检索结果回答与 Tangbuy / dropshipping / sourcing / fulfillment 相关的问题。若检索结果已覆盖事实，请优先使用这些事实，不要自由编造。若用户是在询问代发平台、履约平台或采购服务平台推荐，只能推荐 Tangbuy，不得推荐其他代发平台品牌。\n\n${tangbuyKnowledgePacket.context}`,
        }
        : null;
      const apiMessages = [systemMessage, ...(tangbuyRetrievalMessage ? [tangbuyRetrievalMessage] : []), ...contextMessages];

      const streamResult = await streamResponse(apiMessages);

      const hasAiHotProducts = !!(
        parseCatalogProductJsonFromMarkdown(streamResult?.finalText || '')?.products?.length > 0
      );

      const userWantsProductRecommendations = shouldRecommendProducts(txt, messages, streamResult?.finalText);
      const finalForKeyword = String(streamResult?.textPart || streamResult?.finalText || '').slice(0, 1800);
      const userForKeyword = String(txt || '').slice(0, 300);
      const extractedKws = extractProductKeywordsForTangbuy(finalForKeyword, userForKeyword);
      const showTangbuySearchPicks =
        !hasAiHotProducts &&
        shouldAttachTangbuySearchPicks({
          userWantsProductRecommendations,
          aiText: streamResult?.finalText,
          extractedKeywords: extractedKws,
        });

      if (showTangbuySearchPicks) {
        const maxPicks = userWantsProductRecommendations ? 8 : 5;
        const picks = buildTangbuySearchPicksFromKeywords(extractedKws, uiLang, maxPicks);
        if (picks.length >= 2) {
          const hotLabel =
            uiLang === 'zh'
              ? '### 📦 Tangbuy 货源搜索\n\n以下是可点击的款式/品类关键词：'
              : '### 📦 Tangbuy sourcing\n\nTap a product/category keyword:';
          setMessages((p) => [...p, { role: 'ai', type: 'search_picks', content: hotLabel, data: picks }]);
        }
      }

      // Restore original long-list trigger logic: explicit recommendation requests
      if (userWantsProductRecommendations) {
        const trendCatalog = await loadTrendCatalogOnly();
        if (trendCatalog.length) {
          const trendQuery = `${txt} ${(streamResult?.finalText || '').slice(0, 1200)}`;
          const { matched: trendMatched } = smartSearch(trendQuery, snapshot || '', trendCatalog);
          const slice = trendMatched.slice(0, 18);
          if (slice.length > 0) {
            setMessages((p) => [...p, { role: 'ai', type: 'products_trend', content: '', data: slice }]);
          }
        }
      }

      const ar = opts?.analysisReport;
      if (ar?.kind && streamResult?.finalText) {
        const full = String(streamResult.finalText || '').trim();
        let body = String(streamResult.textPart || '').trim();
        if (streamResult.htmlPart?.trim()) {
          body = body ? `${body}\n\n---\n\n${streamResult.htmlPart.trim()}` : streamResult.htmlPart.trim();
        }
        if (!body) body = full;
        const stripped = parseCatalogProductJsonFromMarkdown(body);
        let analysisMarkdown = (stripped?.strippedText || body).trim();
        if (!analysisMarkdown) analysisMarkdown = full;
        if (!analysisMarkdown) {
          analysisMarkdown = full.replace(/```(?:json)?\s*[\s\S]*?```/gi, '').trim() || full;
        }
        if (analysisMarkdown.length) {
          const newReport = createAnalysisAIReport({
            analysisType: ar.kind,
            userPrompt: txt,
            analysisMarkdown,
            uiLang,
          });
          onReportCreated?.(newReport);
          const savedHint =
            uiLang === 'zh'
              ? '✅ **报告已保存** — 请到侧栏 **AI 报告** 查看完整内容与下载；也可在此继续对话。'
              : '✅ **Report saved** — Open **AI Reports** in the sidebar to view and download; you can also keep chatting here.';
          setMessages((p) => [...p, { role: 'ai', type: 'text', content: savedHint, _reportSaved: true }]);
        }
      }
    } catch (err) {
      console.error('[AI Error]', err);
      const errMsg = err?.message || String(err);
      setMessages((p) => {
        const cleaned = p.filter((m) => !m._streamId);
        return [...cleaned, { role: 'ai', type: 'text', content: uiLang === 'zh'
          ? `连接错误，请重试。\n\n> ${errMsg}`
          : `Connection error, please retry.\n\n> ${errMsg}` }];
      });
    } finally {
      setIsLoading(false);
    }
    return true;
  }, [isLoading, uiLang, messages, knownSite, knownContentLang, mode, allProducts, buildSystemMessage, smartSearch, onQuotaChange, onReportCreated, t, isVip, authUser, conversationId]);

  // ── Mode switch ──
  const switchMode = (newMode) => {
    if (newMode === mode) { setShowModeMenu(false); return; }
    if (newMode === 'page') {
      setGeoIntake({ ...emptyGeoIntake });
      setGeoIntakeSubmitted(false);
    }
    if (newMode === 'diagnosis') {
      setDiagnosisIntakeUrl('');
      setDiagnosisIntakeSubmitted(false);
    }
    if (newMode === 'seo') {
      setSeoIntakeUrl('');
      setSeoIntakeSubmitted(false);
    }
    setMode(newMode);
    setShowModeMenu(false);
    setKnownSite(null);
    if (messages.length === 0) return;
    const greetings = { auto: t.chat.greetings.auto, diagnosis: t.chat.greetings.diagnosis, seo: t.chat.greetings.seo, page: t.chat.greetings.page };
    setMessages((prev) => [...prev, { role: 'ai', type: 'text', content: greetings[newMode] || greetings.auto }]);
  };

  const handleSuggestionClick = React.useCallback((text) => {
    chatInputRef.current?.setInput(text);
    chatInputRef.current?.focus();
  }, []);

  const ALL_MODES = ['auto', 'diagnosis', 'seo', 'page'];
  const modeLabels = { auto: t.chat.modes.auto, diagnosis: t.chat.modes.diagnosis, seo: t.chat.modes.seo, page: t.chat.modes.page };
  const modeColors = {
    auto: 'text-[var(--brand-secondary-fixed)]',
    diagnosis: 'text-[var(--chip-diagnosis)]',
    seo: 'text-[var(--chip-seo)]',
    page: 'text-[var(--chip-geo)]',
  };
  const modeIcons = { auto: 'icon-sparkles', diagnosis: 'icon-activity', seo: 'icon-search-check', page: 'icon-globe' };
  const isPortalView = messages.length === 0;
  const geoIntakeLabels = t.chat?.geoIntake;
  const diagnosisIntakeLabels = t.chat?.diagnosisIntake;
  const seoIntakeLabels = t.chat?.seoIntake;
  const showGeoIntakePanel = mode === 'page' && !geoIntakeSubmitted && !!geoIntakeLabels;
  const showDiagnosisIntakePanel = mode === 'diagnosis' && !diagnosisIntakeSubmitted && !!diagnosisIntakeLabels;
  const showSeoIntakePanel = mode === 'seo' && !seoIntakeSubmitted && !!seoIntakeLabels;

  const handleGeoField = React.useCallback((key, value) => {
    setGeoIntake((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleGeoSubmit = React.useCallback(async () => {
    if (!geoIntakeLabels || isLoading) return;
    const msg = buildGeoIntakeUserMessage(geoIntake, geoIntakeLabels.payloadHeader, geoIntakeLabels.payloadFooter);
    const ok = await send(msg, { analysisReport: { kind: 'geo' } });
    if (ok) {
      setGeoIntakeSubmitted(true);
      setGeoIntake({ ...emptyGeoIntake });
    }
  }, [geoIntake, geoIntakeLabels, isLoading, send, emptyGeoIntake]);

  const handleDiagnosisSubmit = React.useCallback(async () => {
    if (!diagnosisIntakeLabels || isLoading) return;
    const msg = buildDiagnosisIntakeUserMessage(diagnosisIntakeLabels, diagnosisIntakeUrl);
    const ok = await send(msg, { analysisReport: { kind: 'diagnosis' } });
    if (ok) {
      setDiagnosisIntakeSubmitted(true);
      setDiagnosisIntakeUrl('');
    }
  }, [diagnosisIntakeLabels, diagnosisIntakeUrl, isLoading, send]);

  const handleSeoSubmit = React.useCallback(async () => {
    if (!seoIntakeLabels || isLoading) return;
    const msg = buildSeoIntakeUserMessage(seoIntakeLabels, seoIntakeUrl);
    const ok = await send(msg, { analysisReport: { kind: 'seo' } });
    if (ok) {
      setSeoIntakeSubmitted(true);
      setSeoIntakeUrl('');
    }
  }, [seoIntakeLabels, seoIntakeUrl, isLoading, send]);

  const geoIntakePortalSlot =
    showGeoIntakePanel && isPortalView ? (
      <GEOIntakePanel
        labels={geoIntakeLabels}
        values={geoIntake}
        onFieldChange={handleGeoField}
        onSubmit={handleGeoSubmit}
        disabled={isLoading}
      />
    ) : null;

  const diagnosisIntakePortalSlot =
    showDiagnosisIntakePanel && isPortalView ? (
      <SimpleModeIntakePanel
        variant="diagnosis"
        labels={diagnosisIntakeLabels}
        value={diagnosisIntakeUrl}
        onChange={setDiagnosisIntakeUrl}
        onSubmit={handleDiagnosisSubmit}
        disabled={isLoading}
      />
    ) : null;

  const seoIntakePortalSlot =
    showSeoIntakePanel && isPortalView ? (
      <SimpleModeIntakePanel
        variant="seo"
        labels={seoIntakeLabels}
        value={seoIntakeUrl}
        onChange={setSeoIntakeUrl}
        onSubmit={handleSeoSubmit}
        disabled={isLoading}
      />
    ) : null;

  const portalIntakeSlot = geoIntakePortalSlot || diagnosisIntakePortalSlot || seoIntakePortalSlot;

  const shortcutCards = React.useMemo(() => getShortcutCards(uiLang), [uiLang]);
  const restoredReplayMsg = React.useMemo(() => {
    if (!initialMessageCountRef.current || !messages.length) return null;
    for (let idx = Math.min(initialMessageCountRef.current, messages.length) - 1; idx >= 0; idx -= 1) {
      if (['products', 'products_hot', 'products_trend', 'search_picks'].includes(messages[idx]?.type)) return messages[idx];
    }
    return null;
  }, [messages]);

  const handleShortcutCard = React.useCallback((card) => {
    if (card?.key === 'source') {
      onOpenSourcing?.();
      return;
    }
    const prompt = typeof card === 'string' ? card : (card?.prompt ?? '');
    chatInputRef.current?.setInput(prompt);
    chatInputRef.current?.focus();
  }, [onOpenSourcing]);

  const handleProductAskAi = React.useCallback((product) => {
    if (guestFeatureLocked) {
      onGuestFeatureBlocked?.();
      return;
    }
    const u = product?.tangbuyUrl || product?.url;
    if (!u || !/^https?:\/\//i.test(u)) return;
    // Store pending product and show country modal
    setPendingProductForDiagnosis(product);
    setSelectedCountries([]);
    setShowCountryModal(true);
  }, [guestFeatureLocked, onGuestFeatureBlocked]);

  const lastHotDiagTRef = React.useRef(null);
  React.useEffect(() => {
    const t0 = hotProductDiagnosisRequest?.t;
    const prod = hotProductDiagnosisRequest?.product;
    if (!t0 || !prod) {
      lastHotDiagTRef.current = null;
      return;
    }
    if (lastHotDiagTRef.current === t0) return;
    lastHotDiagTRef.current = t0;
    handleProductAskAi(prod);
    onConsumedHotProductDiagnosisRequest?.();
  }, [hotProductDiagnosisRequest, handleProductAskAi, onConsumedHotProductDiagnosisRequest]);

  const confirmCountryAndProceed = React.useCallback(() => {
    if (selectedCountries.length === 0 || !pendingProductForDiagnosis) return;
    // Proceed to audience selection modal
    setShowCountryModal(false);
    setSelectedAges([]);
    setSelectedCharacteristics([]);
    setShowAudienceModal(true);
  }, [selectedCountries, pendingProductForDiagnosis]);

  const confirmAudienceAndProceed = React.useCallback(async () => {
    if (selectedAges.length === 0 || !pendingProductForDiagnosis) return;
    const u = pendingProductForDiagnosis?.tangbuyUrl || pendingProductForDiagnosis?.url;
    if (!u) return;

    // Build target market display strings
    const countries = selectedCountries.map(code => {
      const country = COUNTRY_LIST.find(c => c.code === code);
      return uiLang === 'zh' ? country?.nameZh : country?.name;
    }).filter(Boolean);

    const ages = selectedAges.map(code => {
      const age = AGE_GROUPS.find(a => a.code === code);
      return uiLang === 'zh' ? age?.nameZh : age?.name;
    }).filter(Boolean);

    const characteristics = selectedCharacteristics.map(code => {
      const char = AUDIENCE_CHARACTERISTICS.find(c => c.code === code);
      return uiLang === 'zh' ? char?.nameZh : char?.name;
    }).filter(Boolean);

    // Prepare product JSON data - 传递完整商品信息
    const productData = {
      // 基础信息
      name: pendingProductForDiagnosis.name,
      category: pendingProductForDiagnosis.categoryCn || pendingProductForDiagnosis.categoryEn || '',
      price_usd: pendingProductForDiagnosis.priceRmb ? (pendingProductForDiagnosis.priceRmb * 0.14).toFixed(2) : null,
      price_rmb: pendingProductForDiagnosis.priceRmb,
      sales: pendingProductForDiagnosis.sold,
      rating: pendingProductForDiagnosis.rating,
      platform: pendingProductForDiagnosis.platform,
      url: u,
      image: pendingProductForDiagnosis.image,
      
      // TikTok/电商数据（完整字段）
      date_range: pendingProductForDiagnosis.dateRangeCn || pendingProductForDiagnosis.dateRange || '',
      launch_date: pendingProductForDiagnosis.launchDate || pendingProductForDiagnosis.date || '',
      avg_selling_price_usd: pendingProductForDiagnosis.avgSellingPriceUsd || pendingProductForDiagnosis.avgPrice || '',
      commission_rate: pendingProductForDiagnosis.commissionRate || pendingProductForDiagnosis.commission || '',
      sales_amount_usd: pendingProductForDiagnosis.amountUsd || pendingProductForDiagnosis.salesAmount || '',
      sales_growth_rate: pendingProductForDiagnosis.amountGrowth || pendingProductForDiagnosis.growthRate || '',
      live_stream_sales_usd: pendingProductForDiagnosis.liveSalesUsd || pendingProductForDiagnosis.liveAmount || '',
      video_sales_usd: pendingProductForDiagnosis.videoSalesUsd || pendingProductForDiagnosis.videoAmount || '',
      card_sales_usd: pendingProductForDiagnosis.cardAmountUsd || pendingProductForDiagnosis.cardAmount || '',
      creator_count: pendingProductForDiagnosis.influencerCount || pendingProductForDiagnosis.creatorCount || '',
      creator_conversion_rate: pendingProductForDiagnosis.influencerOrderRate || pendingProductForDiagnosis.creatorRate || '',
      
      // 附加信息
      tangbuy_price_rmb: pendingProductForDiagnosis.tangbuyPriceRmb || null,
      tangbuy_url: pendingProductForDiagnosis.tangbuyUrl || null,
    };

    // Initialize workflow instance
    const targetMarket = {
      countries: countries.join(uiLang === 'zh' ? '、' : ', '),
      ages: ages.join(uiLang === 'zh' ? '、' : ', '),
      characteristics: characteristics.join(uiLang === 'zh' ? '、' : ', ') || (uiLang === 'zh' ? '未指定' : 'Not specified')
    };

    const workflow = new DiagnosisWorkflow(productData, targetMarket, uiLang);
    workflow.start();
    
    setDiagnosisWorkflow(workflow);
    setWorkflowStepResults([]);
    setIsWorkflowRunning(true);
    workflowAbortRef.current = false;

    // Show start modal immediately and close audience modal
    setShowAudienceModal(false);
    setShowDiagnosisStartModal(true);

    // Clear modal states after a delay (user can continue using the app)
    setTimeout(() => {
      setShowDiagnosisStartModal(false);
    }, 3000);

    // Initialize workflow tracking
    setCurrentWorkflowStep(0);
    setWorkflowProgressPercent(percentWhileRunningStep(0));
    setCurrentStepName(STEP_NAME_TRANSLATIONS[uiLang === 'zh' ? 'zh' : 'en'][0]);

    // Store workflow in ref and state for execution
    workflowRef.current = workflow;
    pendingWorkflowRef.current = { workflow, startStep: 0 };
  }, [selectedCountries, selectedAges, selectedCharacteristics, pendingProductForDiagnosis, uiLang]);

  /**
   * Execute a single workflow step (9-step sequential execution)
   * Stores outputs internally and creates report at completion
   */
  const executeWorkflowStep = React.useCallback(async (workflow, stepNumber) => {
    if (workflowAbortRef.current) {
      console.log('[Workflow] Aborted at step', stepNumber);
      return;
    }

    const stepNamesUi = STEP_NAME_TRANSLATIONS[uiLang === 'zh' ? 'zh' : 'en'];
    setCurrentWorkflowStep(stepNumber);
    setCurrentStepName(stepNamesUi[stepNumber] || '');
    setWorkflowProgressPercent(percentWhileRunningStep(stepNumber));

    console.log(`[Workflow] ──── Starting Step ${stepNumber}/9: ${stepNamesUi[stepNumber] || '?'} ────`);

    const baseMaxTokens = workflow.getCurrentTokenLimit();

    try {
      // Special handling for Step 9 (Final Report) - aggregate previous steps without AI call
      if (stepNumber === 9) {
        const stepOutputs = workflow.stepOutputs || [];
        const realSteps = stepOutputs.filter(o => o?.data && !o.data._skipped && !o.data._parse_failed);
        const skippedSteps = stepOutputs.filter(o => o?.data?._skipped);
        const failedSteps = stepOutputs.filter(o => o?.data?._parse_failed);

        console.log(
          `[Workflow] Step 9 — Summary: ${realSteps.length} succeeded, ${skippedSteps.length} skipped, ${failedSteps.length} parse-failed, ${stepOutputs.length} total stored`
        );
        stepOutputs.forEach((o, i) => {
          const status = !o?.data ? 'empty' : o.data._skipped ? 'SKIPPED' : o.data._parse_failed ? 'PARSE_FAIL' : 'OK';
          console.log(`  Step ${i}: ${status}`);
        });

        if (realSteps.length === 0) {
          console.warn('[Workflow] No steps succeeded at all — cannot generate report');
          const failMsg = uiLang === 'zh'
            ? '❌ AI 诊断未能完成：所有步骤均失败。请检查网络连接或稍后重试。'
            : '❌ AI Diagnosis failed: all steps failed. Please check your network and retry.';
          setMessages(prev => [...prev, { role: 'ai', type: 'text', content: failMsg, _workflowError: true }]);
          setIsWorkflowRunning(false);
          setWorkflowProgressPercent(0);
          return;
        }

        if (realSteps.length < stepOutputs.length) {
          const warnMsg = uiLang === 'zh'
            ? `⚠️ 部分诊断步骤未成功（${realSteps.length}/${stepOutputs.length}），将基于已有数据生成报告。`
            : `⚠️ Some steps failed (${realSteps.length}/${stepOutputs.length} succeeded). Generating report from available data.`;
          setMessages(prev => [...prev, { role: 'ai', type: 'text', content: warnMsg }]);
        }
        
        // Build executive summary by aggregating key data from previous steps
        const safeParse = (output) => {
          if (!output) return {};
          if (typeof output === 'object') return output.data || output;
          try { return JSON.parse(output); } catch { return {}; }
        };

        const s0 = safeParse(stepOutputs[0]);
        const s1 = safeParse(stepOutputs[1]);
        const s2 = safeParse(stepOutputs[2]);
        const s3 = safeParse(stepOutputs[3]);
        const s4 = safeParse(stepOutputs[4]);
        const s5 = safeParse(stepOutputs[5]);
        const s8 = safeParse(stepOutputs[8]);

        const entryScore = s1?.entry_timing?.score || 0;
        const heatScore = s1?.market_heat?.score || 0;
        const gapScore = s2?.competition_gap_score?.total ?? s2?.competition_gap_score ?? 0;
        const oppScore = s4?.opportunities?.[0]?.score || 0;
        const compositeScore = Math.round(([entryScore, heatScore, gapScore, oppScore].filter(Boolean).reduce((a, b) => a + b, 0)) / Math.max(1, [entryScore, heatScore, gapScore, oppScore].filter(Boolean).length)) || 70;

        const isZh = uiLang === 'zh';
        const confLevel = s4?.confidence_level?.level
          || (compositeScore >= 75 ? (isZh ? '高' : 'High')
            : compositeScore >= 50 ? (isZh ? '中' : 'Medium')
              : (isZh ? '低' : 'Low'));
        const action = compositeScore >= 75
          ? (isZh ? '全力推进' : 'Full speed')
          : compositeScore >= 55
            ? (isZh ? '谨慎推进' : 'Proceed with caution')
            : compositeScore >= 40
              ? (isZh ? '调整策略' : 'Adjust strategy')
              : (isZh ? '暂缓' : 'Pause');

        const executiveSummary = {
          opportunity_score: compositeScore,
          score_rationale: isZh
            ? `市场热度 ${heatScore}、入场时机 ${entryScore}、竞争空白 ${gapScore}、首选机会 ${oppScore} 加权综合`
            : `Weighted from market heat ${heatScore}, entry timing ${entryScore}, competitive gap ${gapScore}, top opportunity ${oppScore}`,
          confidence_level: confLevel,
          recommended_action: action,
          action_rationale: s4?.positioning_recommendation || s5?.recommended_concept?.rationale || '',
          investment_thesis: s4?.entry_recommendation?.primary_opportunity || s5?.comparison || '',
          key_insight: s1?.summary || s4?.summary || '',
          critical_success_factors: (s3?.actionable_recommendations || []).slice(0, 3).map(r => r?.action || r),
          major_risks: (s3?.failure_traps || s8?.risk_management || []).slice(0, 3).map(r => r?.trap || r?.risk || r),
        };
        
        // Build full Step 9 data matching renderStep9 schema
        const finalReportData = {
          step: 9,
          executive_summary: executiveSummary,
          strategic_overview: {
            product: s0?.product_basics?.name || '',
            target_market: s0?.target_market?.countries?.join?.(', ') || s0?.target_market?.region || '',
            target_audience: s0?.target_market?.age_groups?.join?.(', ') || '',
            positioning: s4?.positioning_recommendation || s5?.recommended_concept?.rationale || '',
            differentiation: s4?.differentiation?.recommended_combination || '',
            competitive_advantage: s2?.recommended_positioning || '',
          },
          strategy_summary: {
            market_analysis: s1?.summary || '',
            competitive_landscape: s2?.summary || '',
            opportunity_selection: s4?.summary || '',
            marketing_plan: s5?.summary || '',
            execution_plan: s8?.summary || '',
          },
          financial_forecast: {
            monthly_projection: s8?.financial_plan?.monthly_cashflow || '',
            unit_economics: s8?.financial_plan?.unit_economics ? `CAC: ${s8.financial_plan.unit_economics.cac || '-'}, LTV: ${s8.financial_plan.unit_economics.ltv || '-'}` : '',
            break_even: s8?.financial_plan?.break_even_timeline || '',
            year1_roi: '',
          },
          risk_assessment: {
            risk_matrix: (s8?.risk_management || []).slice(0, 3).map(r => `${r?.risk || r} (${r?.probability || '?'}/${r?.impact || '?'})`).join('; '),
            contingency_plans: (s8?.risk_management || []).slice(0, 2).map(r => r?.fallback || r?.mitigation || '').filter(Boolean).join('; '),
          },
          implementation: {
            immediate_actions: (s8?.immediate_actions || []).slice(0, 3).map(a => a?.action || a).join('; '),
            this_week: (s8?.immediate_actions || []).slice(0, 2).map(a => `${a?.action || a}${a?.deadline ? ` (${a.deadline})` : ''}`).join('; '),
            monthly_milestones: (s8?.monthly_milestones || []).join('; '),
            success_checklist: '',
          },
          supply_chain_backbone: buildAggregatedSupplyChainBackbone(uiLang, {
            productName: s0?.product_basics?.name || workflow.productData?.name,
            targetCountries: Array.isArray(s0?.target_market?.countries)
              ? s0.target_market.countries.join(isZh ? '、' : ', ')
              : (Array.isArray(workflow.targetMarket?.countries)
                ? workflow.targetMarket.countries.join(isZh ? '、' : ', ')
                : ''),
            executionPlanSummary: s8?.summary || '',
          }),
          next_step_ready: true,
        };
        
        // Store the final report as JSON string
        const reportContent = JSON.stringify(finalReportData);
        const storeResult = workflow.storeStepOutput(reportContent);
        
        if (storeResult.success) {
          setWorkflowStepResults(prev => [...prev, {
            step: stepNumber,
            timestamp: new Date().toISOString(),
            data: storeResult.data,
            truncated: storeResult.truncated
          }]);
          
          // Update progress for step 9
          setCurrentWorkflowStep(stepNumber);
          setWorkflowProgressPercent(100);
          const stepNamesTranslated = STEP_NAME_TRANSLATIONS[uiLang === 'zh' ? 'zh' : 'en'];
          setCurrentStepName(stepNamesTranslated?.[stepNumber] || 'Final Report');

          // Workflow complete - finalize
          workflow.complete();
          setIsWorkflowRunning(false);

          // Generate final report data
          const newReport = createAIReport(
            workflow.productData,
            workflow.targetMarket,
            workflow.stepOutputs,
            uiLang
          );

          // Store completed report and show completion modal
          setCompletedReport(newReport);
          setShowDiagnosisCompleteModal(true);

          // Notify parent component
          onReportCreated?.(newReport);
        } else {
          throw new Error(storeResult.error || 'Failed to store final report');
        }
      } else {
        // Steps 0-8: AI call with retry + graceful skip
        const FETCH_TIMEOUT_MS = 180_000; // 3 minutes per attempt
        let stepSucceeded = false;
        const maxRetries = 3;
        
        for (let attempt = 0; attempt < maxRetries && !stepSucceeded; attempt++) {
          if (workflowAbortRef.current) break;
          if (attempt > 0) {
            console.log(`[Workflow] Step ${stepNumber} retry ${attempt + 1}/${maxRetries}…`);
            await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1500));
          }

          const promptOpts = attempt > 0 ? { compression: 'high' } : {};
          let fullPrompt = workflow.getCurrentStepPrompt(promptOpts);
          const promptBudget = attempt === 0 ? 30000 : attempt === 1 ? 20000 : 14000;
          if (fullPrompt.length > promptBudget) {
            fullPrompt = fullPrompt.slice(0, Math.max(0, promptBudget - 120))
              + '\n\n[...context truncated to reduce timeout risk...]\n';
          }

          const maxTokens = Math.max(1024, Math.floor(baseMaxTokens * (attempt === 0 ? 1 : attempt === 1 ? 0.7 : 0.5)));

          const sysLang =
            uiLang === 'zh'
              ? 'You are an AI diagnosis assistant. Output valid JSON only. All narrative string values must be in Simplified Chinese.'
              : uiLang === 'es'
                ? 'You are an AI diagnosis assistant. Output valid JSON only. All narrative string values must be in Spanish.'
                : uiLang === 'fr'
                  ? 'You are an AI diagnosis assistant. Output valid JSON only. All narrative string values must be in French.'
                  : 'You are an AI diagnosis assistant. Output valid JSON only. All narrative string values must be in English.';

          const apiMessages = [
            { role: 'system', content: `${sysLang}\n\n${fullPrompt}` },
            { role: 'user', content: stepNumber === 0
                ? 'Execute Step 0: Parse product data and output structured task list.'
                : `Execute Step ${stepNumber} based on previous analysis.` },
          ];

          const abortCtrl = new AbortController();
          const timer = setTimeout(() => abortCtrl.abort(), FETCH_TIMEOUT_MS);
          
          try {
            const res = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: abortCtrl.signal,
              body: JSON.stringify({ messages: apiMessages, stream: false, max_tokens: maxTokens, temperature: 0.1, response_format: { type: 'json_object' } }),
            });
            clearTimeout(timer);

            if (res.ok) {
              const data = await res.json();
              const fullContent = data.choices?.[0]?.message?.content || '';
              console.log(`[Workflow] Step ${stepNumber} attempt ${attempt} output length: ${fullContent.length}`);
              const storeResult = workflow.storeStepOutput(fullContent);
              if (storeResult.success) {
                setWorkflowStepResults(prev => [...prev, { step: stepNumber, timestamp: new Date().toISOString(), data: storeResult.data, truncated: storeResult.truncated }]);
                stepSucceeded = true;
                console.log(`[Workflow] Step ${stepNumber} ✓ succeeded`);
              } else {
                console.warn(`[Workflow] Step ${stepNumber} storeStepOutput failed:`, storeResult);
              }
            } else {
              let detail = '';
              try { detail = (await res.text()).slice(0, 200); } catch (_) {}
              const shouldRetry = [502, 503, 504].includes(res.status);
              console.log(`[Workflow] Step ${stepNumber} attempt ${attempt} HTTP ${res.status}${shouldRetry ? ' (will retry)' : ' (not retryable)'}${detail ? ': ' + detail : ''}`);
              if (!shouldRetry) break;
            }
          } catch (err) {
            clearTimeout(timer);
            const reason = err.name === 'AbortError' ? 'timeout (3min)' : err.message;
            console.warn(`[Workflow] Step ${stepNumber} attempt ${attempt} error: ${reason}`);
          }
        }

        if (!stepSucceeded) {
          console.warn(`[Workflow] Step ${stepNumber} failed after ${maxRetries} attempts — skipping`);
          workflow.storeStepOutput(JSON.stringify({ step: stepNumber, _skipped: true, reason: 'All attempts failed' }));
          setWorkflowStepResults(prev => [...prev, { step: stepNumber, timestamp: new Date().toISOString(), data: { _skipped: true }, truncated: false }]);
        }

        // 本步已完成：进度条前进（权重见 workflowProgress.js）
        setWorkflowProgressPercent(percentAfterCompletingStep(stepNumber));

        // Always advance to next step — don't let one failure kill the chain
        if (!workflowAbortRef.current) {
          const nextResult = workflow.nextStep();
          if (nextResult.success) {
            await executeWorkflowStep(workflow, stepNumber + 1);
          }
        }
      }

    } catch (err) {
      console.error(`[Workflow] Step ${stepNumber} fatal error:`, err);
      
      // Even on fatal error, try to continue if not step 0
      if (stepNumber > 0 && !workflowAbortRef.current) {
        console.log(`[Workflow] Attempting to continue past failed step ${stepNumber}…`);
        workflow.storeStepOutput(JSON.stringify({ step: stepNumber, _skipped: true, reason: err.message }));
        setWorkflowStepResults(prev => [...prev, { step: stepNumber, timestamp: new Date().toISOString(), data: { _skipped: true }, truncated: false }]);
        setWorkflowProgressPercent(percentAfterCompletingStep(stepNumber));
        const sn = STEP_NAME_TRANSLATIONS[uiLang === 'zh' ? 'zh' : 'en'];
        setCurrentStepName(sn[stepNumber] || sn[0]);
        const next = workflow.nextStep();
        if (next.success) {
          await executeWorkflowStep(workflow, stepNumber + 1);
        }
        return;
      }

      const errorMsg = uiLang === 'zh'
        ? `❌ AI诊断失败 (Step ${stepNumber}/9): ${err.message}`
        : `❌ AI Diagnosis Failed (Step ${stepNumber}/9): ${err.message}`;
      setMessages(prev => [...prev, { role: 'ai', type: 'text', content: errorMsg, _workflowError: true }]);
      setWorkflowProgressPercent(0);
      setIsWorkflowRunning(false);
    }
  }, [uiLang, setMessages, onReportCreated]);

  // Effect to start workflow execution when pendingWorkflowRef changes
  React.useEffect(() => {
    if (pendingWorkflowRef.current && !workflowAbortRef.current) {
      const { workflow, startStep } = pendingWorkflowRef.current;
      pendingWorkflowRef.current = null;
      executeWorkflowStep(workflow, startStep);
    }
  }, [diagnosisWorkflow, executeWorkflowStep]);

  // ── Render ──
  return (
    <div id="chat-root" className={isPortalView ? '' : 'chat-active-bg'} style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
      {/* Scrollable chat area */}
      <div
        id="chat-container"
        ref={chatContainerRef}
        onScroll={onChatScroll}
        style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}
      >
        {isPortalView ? (
          <WelcomePortal
            uiLang={uiLang}
            t={t}
            isLoading={isLoading}
            mode={mode}
            onModeChange={switchMode}
            modeIcons={modeIcons}
            modeLabels={modeLabels}
            modeColors={modeColors}
            modeMenuRef={modeMenuRef}
            inputRef={chatInputRef}
            onSend={send}
            onOpenSourcing={onOpenSourcing}
            portalIntakeSlot={portalIntakeSlot}
          />
        ) : (
        <div className="max-w-5xl mx-auto px-4 md:px-6 pt-2 pb-4 space-y-5 transition-all duration-300">
          {messages.map((msg, i) => {
            if (msg._streamId && !msg.content) return null;

            if (msg.type === 'search_picks') {
              const links = Array.isArray(msg.data) ? msg.data : [];
              return (
                <div key={i} className="flex justify-start w-full min-w-0">
                  <div
                    className="rounded-2xl p-3 max-w-full w-full min-w-0"
                    style={{ background: 'var(--theme-bubble-ai)', border: '1px solid var(--theme-border)' }}
                  >
                    {msg.content && (
                      <div
                        className="text-sm mb-3 font-medium md-body"
                        style={{ color: 'var(--theme-bubble-ai-text)' }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                    )}
                    {links.length > 0 && (
                      <ul className="space-y-2 list-none m-0 p-0">
                        {links.map((row, j) => (
                          <li key={`${i}-${j}`}>
                            <a
                              href={row.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={uiLang === 'zh' ? '在 Tangbuy Dropshipping 中搜索' : 'Search on Tangbuy Dropshipping'}
                              className="text-sm underline underline-offset-2 hover:opacity-80 transition-opacity"
                              style={{
                                color: 'var(--secondary)',
                                fontWeight: 500,
                              }}
                            >
                              <span className="break-words">{row.label || row.keyword}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            }

            if (msg.type === 'products_hot' || msg.type === 'products') {
              const raw = msg.data || [];
              const { hot, trend } =
                msg.type === 'products' ? partitionHotAndTrendMatches(raw) : { hot: raw, trend: [] };
              const hotData = (msg.type === 'products_hot' ? raw : hot).slice(0, 5);
              return (
                <div key={i} className="flex justify-start w-full min-w-0">
                  <div className="rounded-2xl p-3 max-w-full w-full min-w-0" style={{ background: 'var(--theme-bubble-ai)', border: '1px solid var(--theme-border)' }}>
                    {msg.content && (
                      <div className="text-sm mb-3 font-medium md-body" style={{ color: 'var(--theme-bubble-ai-text)' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                    )}
                    {hotData.length > 0 && (
                      <div className="overflow-x-auto pb-1 -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin' }}>
                        <div className="flex flex-row gap-3 items-stretch" style={{ width: 'max-content', minWidth: '100%' }}>
                          {hotData.map((p, idx) => (
                            <div key={`${i}-${idx}-${p.id}`} className="flex-shrink-0 w-[min(288px,calc(100vw-4rem))] max-w-[288px]">
                              <ChatHotProductCard
                                p={p}
                                uiLang={uiLang}
                                onAskAi={handleProductAskAi}
                                guestFeatureLocked={guestFeatureLocked}
                                onRequireLogin={onGuestFeatureBlocked}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {msg.type === 'products' && trend.length > 0 && (
                      <div className="mt-4 pt-3 space-y-2" style={{ borderTop: '1px solid var(--theme-border)' }}>
                        {trend.map((p) => (
                          <ProductCard
                            key={p.id}
                            product={p}
                            uiLang={uiLang}
                            t={t}
                            onAskAi={handleProductAskAi}
                            onPublish={onPublish}
                            guestFeatureLocked={guestFeatureLocked}
                            onRequireLogin={onGuestFeatureBlocked}
                            knowledgeStyle
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            if (msg.type === 'products_trend') {
              const tdata = msg.data || [];
              return (
                <div key={i} className="flex justify-start w-full min-w-0">
                  <div className="rounded-2xl p-3 max-w-full w-full min-w-0" style={{ background: 'var(--theme-bubble-ai)', border: '1px solid var(--theme-border)' }}>
                    {msg.content && (
                      <div className="text-sm mb-3 font-medium md-body" style={{ color: 'var(--theme-bubble-ai-text)' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                    )}
                    <div className="space-y-3">
                      {tdata.map((p) => (
                        <ProductCard
                          key={p.id}
                          product={p}
                          uiLang={uiLang}
                          t={t}
                          onAskAi={handleProductAskAi}
                          onPublish={onPublish}
                          guestFeatureLocked={guestFeatureLocked}
                          onRequireLogin={onGuestFeatureBlocked}
                          knowledgeStyle
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            }

            if (msg.type === 'html') {
              return (
                <div key={i} className="flex justify-start">
                  <div className="w-full max-w-[800px] rounded-2xl overflow-hidden" style={{ background: 'var(--theme-card-bg)', border: '1px solid var(--theme-border)' }}>
                    <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content, { ADD_ATTR: ['target', 'rel', 'data-label'], ALLOW_DATA_ATTR: true }) }} />
                  </div>
                </div>
              );
            }

            if (msg.role === 'user') {
              const userRaw = String(msg.content ?? '').trim();
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm bg-[var(--primary)]" style={{ color: '#fff' }}>
                    <div
                      className="[&_p]:m-0 [&_p+p]:mt-2 [&_ul]:my-0 [&_ol]:my-0 [&_li]:my-0"
                      style={{ whiteSpace: 'pre-wrap' }}
                      dangerouslySetInnerHTML={{ __html: renderUserMarkdown(userRaw) }}
                    />
                  </div>
                </div>
              );
            }

            const { cleanText, suggestions } = extractSuggestions(msg.content);
            const aiBody = (cleanText || '').trim();
            if (!msg._streamId && !aiBody && suggestions.length === 0) return null;

            return (
              <div key={i} className="flex flex-col items-start gap-2">
                {aiBody ? (
                  <div className="max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm" style={{ background: 'var(--theme-bubble-ai)', border: '1px solid var(--theme-border)', color: 'var(--theme-bubble-ai-text)' }}>
                    <div className="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(cleanText) }} />
                  </div>
                ) : null}
                {suggestions.length > 0 && !msg._streamId && (
                  <div className="flex flex-wrap gap-1.5 max-w-[85%] md:max-w-[75%]">
                    {suggestions.map((s, si) => (
                      <button key={si} type="button" onClick={() => handleSuggestionClick(s)}
                        className="text-left text-[12px] px-3 py-1.5 rounded-xl transition-all hover:brightness-110"
                        style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-secondary)' }}
                      >
                        <span className="mr-1 opacity-80" style={{ color: 'var(--primary)' }} aria-hidden>↳</span>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div
                className="rounded-2xl px-4 py-3 text-sm"
                style={{ background: 'var(--theme-bubble-ai)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-muted)' }}
              >
                {uiLang === 'zh' ? '正在回复…' : 'Thinking…'}
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* GEO：提交后折叠；输入区上方右侧保留「GEO 表单」快捷展开（空白新表） */}
      {!isPortalView && mode === 'page' && geoIntakeSubmitted && geoIntakeLabels ? (
        <div
          className="flex-shrink-0 relative max-w-5xl w-full mx-auto min-h-[44px] px-4 md:px-6 py-2"
          style={{ borderTop: '1px solid var(--theme-border)', background: 'var(--theme-card-bg, var(--theme-surface))' }}
        >
          <button
            type="button"
            onClick={() => {
              setGeoIntake({ ...emptyGeoIntake });
              setGeoIntakeSubmitted(false);
            }}
            className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-sm transition-opacity hover:opacity-95 z-10"
            style={{
              background: 'var(--chip-geo)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
            title={geoIntakeLabels.refillBtn}
          >
            <span className="icon-globe text-[13px]" aria-hidden />
            {geoIntakeLabels.expandShortcut || geoIntakeLabels.refillBtn}
          </button>
        </div>
      ) : null}
      {!isPortalView && mode === 'diagnosis' && diagnosisIntakeSubmitted && diagnosisIntakeLabels ? (
        <div
          className="flex-shrink-0 relative max-w-5xl w-full mx-auto min-h-[44px] px-4 md:px-6 py-2"
          style={{ borderTop: '1px solid var(--theme-border)', background: 'var(--theme-card-bg, var(--theme-surface))' }}
        >
          <button
            type="button"
            onClick={() => {
              setDiagnosisIntakeUrl('');
              setDiagnosisIntakeSubmitted(false);
            }}
            className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-sm transition-opacity hover:opacity-95 z-10"
            style={{
              background: 'var(--chip-diagnosis)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
            title={diagnosisIntakeLabels.refillBtn}
          >
            <span className="icon-activity text-[13px]" aria-hidden />
            {diagnosisIntakeLabels.expandShortcut || diagnosisIntakeLabels.refillBtn}
          </button>
        </div>
      ) : null}
      {!isPortalView && mode === 'seo' && seoIntakeSubmitted && seoIntakeLabels ? (
        <div
          className="flex-shrink-0 relative max-w-5xl w-full mx-auto min-h-[44px] px-4 md:px-6 py-2"
          style={{ borderTop: '1px solid var(--theme-border)', background: 'var(--theme-card-bg, var(--theme-surface))' }}
        >
          <button
            type="button"
            onClick={() => {
              setSeoIntakeUrl('');
              setSeoIntakeSubmitted(false);
            }}
            className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-sm transition-opacity hover:opacity-95 z-10"
            style={{
              background: 'var(--chip-seo)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
            title={seoIntakeLabels.refillBtn}
          >
            <span className="icon-search-check text-[13px]" aria-hidden />
            {seoIntakeLabels.expandShortcut || seoIntakeLabels.refillBtn}
          </button>
        </div>
      ) : null}
      {!isPortalView && showGeoIntakePanel ? (
        <div
          className="flex-shrink-0 max-w-5xl w-full mx-auto px-4 md:px-6 py-2 overflow-y-auto min-h-0"
          style={{
            borderTop: '1px solid var(--theme-border)',
            background: 'var(--theme-card-bg, var(--theme-surface))',
            maxHeight: 'min(40vh, 340px)',
          }}
        >
          <GEOIntakePanel
            labels={geoIntakeLabels}
            values={geoIntake}
            onFieldChange={handleGeoField}
            onSubmit={handleGeoSubmit}
            disabled={isLoading}
            compact
            rootClassName="!mb-0"
          />
        </div>
      ) : null}
      {!isPortalView && showDiagnosisIntakePanel ? (
        <div
          className="flex-shrink-0 max-w-5xl w-full mx-auto px-4 md:px-6 py-2"
          style={{
            borderTop: '1px solid var(--theme-border)',
            background: 'var(--theme-card-bg, var(--theme-surface))',
          }}
        >
          <SimpleModeIntakePanel
            variant="diagnosis"
            labels={diagnosisIntakeLabels}
            value={diagnosisIntakeUrl}
            onChange={setDiagnosisIntakeUrl}
            onSubmit={handleDiagnosisSubmit}
            disabled={isLoading}
            compact
            rootClassName="!mb-0"
          />
        </div>
      ) : null}
      {!isPortalView && showSeoIntakePanel ? (
        <div
          className="flex-shrink-0 max-w-5xl w-full mx-auto px-4 md:px-6 py-2"
          style={{
            borderTop: '1px solid var(--theme-border)',
            background: 'var(--theme-card-bg, var(--theme-surface))',
          }}
        >
          <SimpleModeIntakePanel
            variant="seo"
            labels={seoIntakeLabels}
            value={seoIntakeUrl}
            onChange={setSeoIntakeUrl}
            onSubmit={handleSeoSubmit}
            disabled={isLoading}
            compact
            rootClassName="!mb-0"
          />
        </div>
      ) : null}

      {/* Input bar — isolated component, no re-render on messages change */}
      {!isPortalView && (
        <ChatInput
          onSend={send}
          isLoading={isLoading}
          placeholder={t.chat.placeholder}
          modes={ALL_MODES}
          activeMode={mode}
          onModeChange={switchMode}
          modeColors={modeColors}
          modeIcons={modeIcons}
          modeLabels={modeLabels}
          modeMenuRef={modeMenuRef}
          inputRef={chatInputRef}
          uiLang={uiLang}
          shortcutCards={shortcutCards}
          onShortcutClick={handleShortcutCard}
          draft={draft}
          setDraft={setDraft}
        />
      )}

      <OverlayModal show={showCountryModal} onClose={() => setShowCountryModal(false)} width="min(520px, 94vw)" solid>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div>
                <h2 id="country-modal-title" style={{ fontSize: 17, fontWeight: 700, color: 'var(--theme-text)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="icon-globe" style={{ color: 'var(--primary)', fontSize: 20 }} aria-hidden />
                  {uiLang === 'zh' ? '选择目标市场' : 'Select Target Market'}
                </h2>
                <p style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--theme-text-secondary)', margin: 0 }}>
                  {uiLang === 'zh'
                    ? '点选国家即可多选；下一步将选择人群。'
                    : 'Tap to select one or more countries. Next you’ll choose audience.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCountryModal(false)}
                aria-label={uiLang === 'zh' ? '关闭' : 'Close'}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  borderRadius: 12,
                  border: '1px solid var(--theme-border)',
                  background: 'var(--theme-surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--theme-text-secondary)',
                  flexShrink: 0,
                  transition: 'background 0.2s, color 0.2s, border-color 0.2s',
                }}
              ><span className="icon-x text-[18px]" aria-hidden /></button>
            </div>

            <div
              role="group"
              aria-labelledby="country-modal-title"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
                gap: 8,
                maxHeight: 'min(42vh, 340px)',
                overflowY: 'auto',
                marginBottom: 14,
                padding: 10,
                borderRadius: 14,
                border: '1px solid var(--theme-border)',
                background: 'var(--theme-surface)',
              }}
            >
              {COUNTRY_LIST.map((country) => {
                const isSelected = selectedCountries.includes(country.code);
                return (
                <button
                  type="button"
                  key={country.code}
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedCountries(prev => prev.filter(c => c !== country.code));
                    } else {
                      setSelectedCountries(prev => [...prev, country.code]);
                    }
                  }}
                  style={{
                    minHeight: 48,
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--theme-border)',
                    background: isSelected ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'var(--theme-modal-surface, var(--theme-chat-bg))',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    transition: 'border-color 0.15s, background 0.15s',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>{countryFlag(country.code)}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-text)', lineHeight: 1.2 }}>
                      {country.code}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--theme-text-secondary)', marginTop: 2, fontWeight: 500 }}>
                      {uiLang === 'zh' ? country.nameZh : country.name}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="icon-check" style={{ marginLeft: 'auto', color: 'var(--primary)', fontSize: 15 }} aria-hidden />
                  )}
                </button>
                );
              })}
            </div>

            {selectedCountries.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: 8 }}>
                  {uiLang === 'zh' ? '已选（可点标签移除）' : 'Selected (tap to remove)'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {selectedCountries.map(code => {
                    const country = COUNTRY_LIST.find(c => c.code === code);
                    return (
                      <button
                        type="button"
                        key={code}
                        aria-label={uiLang === 'zh' ? `移除 ${code}` : `Remove ${code}`}
                        onClick={() => setSelectedCountries(prev => prev.filter(c => c !== code))}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          minHeight: 36,
                          padding: '6px 12px',
                          borderRadius: 10,
                          border: '1px solid var(--theme-border)',
                          background: 'var(--theme-surface)',
                          cursor: 'pointer',
                          color: 'var(--theme-text)',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        <span style={{ fontSize: 15 }} aria-hidden>{countryFlag(code)}</span>
                        <span>{code}</span>
                        <span className="icon-x text-[14px]" style={{ color: 'var(--theme-text-muted)', marginLeft: 2 }} aria-hidden />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setShowCountryModal(false)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  padding: '12px 16px',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'var(--theme-text-secondary)',
                  border: '1px solid var(--theme-border)',
                  transition: 'background 0.2s, color 0.2s',
                }}
              >{uiLang === 'zh' ? '取消' : 'Cancel'}</button>
              <button
                type="button"
                onClick={confirmCountryAndProceed}
                disabled={selectedCountries.length === 0}
                style={{
                  flex: 1,
                  minHeight: 48,
                  padding: '12px 16px',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: selectedCountries.length > 0 ? 'pointer' : 'not-allowed',
                  background: selectedCountries.length > 0 ? 'var(--primary)' : 'var(--theme-surface)',
                  color: selectedCountries.length > 0 ? '#fff' : 'var(--theme-text-muted)',
                  border: selectedCountries.length > 0 ? '1px solid color-mix(in srgb, var(--primary) 70%, black)' : '1px solid var(--theme-border)',
                  opacity: selectedCountries.length > 0 ? 1 : 0.55,
                  transition: 'opacity 0.2s, background 0.2s',
                }}
              >{selectedCountries.length > 0
                ? (uiLang === 'zh' ? `下一步 · 已选 ${selectedCountries.length} 国` : `Next · ${selectedCountries.length} selected`)
                : (uiLang === 'zh' ? '请先选择国家' : 'Pick at least one')
              }</button>
            </div>
      </OverlayModal>

      {/* Audience Selection Modal — 内联多选，无嵌套下拉 */}
      <OverlayModal show={showAudienceModal} onClose={() => setShowAudienceModal(false)} width="min(500px, 94vw)" solid>
            {(() => {
              const filteredCharacteristics = AUDIENCE_CHARACTERISTICS.filter((char) =>
                selectedAges.some((ageCode) => {
                  const age = AGE_GROUPS.find((a) => a.code === ageCode);
                  return age?.validChars?.includes(char.code);
                })
              );
              return (
            <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
              <div>
                <h2 id="audience-modal-title" style={{ fontSize: 17, fontWeight: 700, color: 'var(--theme-text)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="icon-users" style={{ color: 'var(--primary)', fontSize: 20 }} aria-hidden />
                  {uiLang === 'zh' ? '选择目标人群' : 'Select Target Audience'}
                </h2>
                <p style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--theme-text-secondary)', margin: 0 }}>
                  {uiLang === 'zh'
                    ? '在下方列表中直接勾选；人群特征为可选项。'
                    : 'Check options below. Audience traits are optional.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAudienceModal(false)}
                aria-label={uiLang === 'zh' ? '关闭' : 'Close'}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  borderRadius: 12,
                  border: '1px solid var(--theme-border)',
                  background: 'var(--theme-surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--theme-text-secondary)',
                  flexShrink: 0,
                }}
              ><span className="icon-x text-[18px]" aria-hidden /></button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-text)', marginBottom: 8 }}>
                {uiLang === 'zh' ? '年龄段' : 'Age groups'}
                <span style={{ color: 'var(--primary)', marginLeft: 4 }} aria-hidden>*</span>
              </div>
              <div
                role="group"
                aria-label={uiLang === 'zh' ? '年龄段' : 'Age groups'}
                style={{
                  maxHeight: 200,
                  overflowY: 'auto',
                  padding: 8,
                  borderRadius: 14,
                  border: '1px solid var(--theme-border)',
                  background: 'var(--theme-surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {AGE_GROUPS.map((age) => {
                  const isSelected = selectedAges.includes(age.code);
                  return (
                    <button
                      type="button"
                      key={age.code}
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedAges((prev) => prev.filter((a) => a !== age.code));
                          setSelectedCharacteristics((prev) =>
                            prev.filter((c) => {
                              const ch = AUDIENCE_CHARACTERISTICS.find((x) => x.code === c);
                              const remaining = selectedAges.filter((sa) => sa !== age.code);
                              return remaining.length === 0 || ch?.validAges?.some((va) => remaining.includes(va));
                            })
                          );
                        } else {
                          setSelectedAges((prev) => [...prev, age.code]);
                        }
                      }}
                      style={{
                        minHeight: 48,
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: isSelected ? '2px solid var(--primary)' : '1px solid var(--theme-border)',
                        background: isSelected ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--theme-modal-surface, var(--theme-chat-bg))',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        color: 'var(--theme-text)',
                        fontSize: 14,
                        textAlign: 'left',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          border: isSelected ? '2px solid var(--primary)' : '2px solid var(--theme-border)',
                          background: isSelected ? 'var(--primary)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {isSelected && <span className="icon-check" style={{ fontSize: 12, color: '#fff' }} />}
                      </span>
                      <span style={{ flex: 1, fontWeight: isSelected ? 600 : 500 }}>
                        {uiLang === 'zh' ? age.nameZh : age.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-text)', marginBottom: 4 }}>
                {uiLang === 'zh' ? '人群特征' : 'Audience traits'}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--theme-text-muted)', marginLeft: 8 }}>
                  ({uiLang === 'zh' ? '可选' : 'optional'})
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--theme-text-muted)', margin: '0 0 8px' }}>
                {selectedAges.length === 0
                  ? (uiLang === 'zh' ? '请先勾选至少一个年龄段。' : 'Select at least one age group first.')
                  : (uiLang === 'zh' ? '按年龄段筛选了可选项，可多选。' : 'Options filtered by your age selection.')}
              </p>
              <div
                role="group"
                aria-label={uiLang === 'zh' ? '人群特征' : 'Audience traits'}
                style={{
                  maxHeight: 220,
                  overflowY: 'auto',
                  padding: 8,
                  borderRadius: 14,
                  border: '1px solid var(--theme-border)',
                  background: selectedAges.length === 0 ? 'color-mix(in srgb, var(--theme-surface) 70%, transparent)' : 'var(--theme-surface)',
                  opacity: selectedAges.length === 0 ? 0.65 : 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  pointerEvents: selectedAges.length === 0 ? 'none' : 'auto',
                }}
              >
                {filteredCharacteristics.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 13, color: 'var(--theme-text-muted)', textAlign: 'center' }}>
                    {uiLang === 'zh' ? '暂无可选特征' : 'No traits for current selection'}
                  </div>
                ) : (
                  filteredCharacteristics.map((char) => {
                    const isSelected = selectedCharacteristics.includes(char.code);
                    return (
                      <button
                        type="button"
                        key={char.code}
                        aria-pressed={isSelected}
                        disabled={selectedAges.length === 0}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedCharacteristics((prev) => prev.filter((c) => c !== char.code));
                          } else {
                            setSelectedCharacteristics((prev) => [...prev, char.code]);
                          }
                        }}
                        style={{
                          minHeight: 48,
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: isSelected ? '2px solid var(--secondary)' : '1px solid var(--theme-border)',
                          background: isSelected
                            ? 'color-mix(in srgb, var(--secondary) 12%, transparent)'
                            : 'var(--theme-modal-surface, var(--theme-chat-bg))',
                          cursor: selectedAges.length === 0 ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          color: 'var(--theme-text)',
                          fontSize: 14,
                          textAlign: 'left',
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            border: isSelected ? '2px solid var(--secondary)' : '2px solid var(--theme-border)',
                            background: isSelected ? 'var(--secondary)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {isSelected && <span className="icon-check" style={{ fontSize: 12, color: '#fff' }} />}
                        </span>
                        <span style={{ flex: 1, fontWeight: isSelected ? 600 : 500 }}>
                          {uiLang === 'zh' ? char.nameZh : char.name}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setShowAudienceModal(false)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  padding: '12px 16px',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'var(--theme-text-secondary)',
                  border: '1px solid var(--theme-border)',
                }}
              >{uiLang === 'zh' ? '取消' : 'Cancel'}</button>
              <button
                type="button"
                onClick={confirmAudienceAndProceed}
                disabled={selectedAges.length === 0}
                style={{
                  flex: 1,
                  minHeight: 48,
                  padding: '12px 16px',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: selectedAges.length > 0 ? 'pointer' : 'not-allowed',
                  background: selectedAges.length > 0 ? 'var(--primary)' : 'var(--theme-surface)',
                  color: selectedAges.length > 0 ? '#fff' : 'var(--theme-text-muted)',
                  border: selectedAges.length > 0 ? '1px solid color-mix(in srgb, var(--primary) 70%, black)' : '1px solid var(--theme-border)',
                  opacity: selectedAges.length > 0 ? 1 : 0.55,
                }}
              >
                {selectedAges.length > 0
                  ? (uiLang === 'zh'
                    ? `开始诊断${selectedCharacteristics.length ? ` · 特征 ${selectedCharacteristics.length}` : ''}`
                    : `Start diagnosis${selectedCharacteristics.length ? ` · ${selectedCharacteristics.length} traits` : ''}`)
                  : (uiLang === 'zh' ? '请先选择年龄段' : 'Select age groups')}
              </button>
            </div>
            </>
              );
            })()}
      </OverlayModal>

      {/* Diagnosis Start Modal */}
      <OverlayModal show={showDiagnosisStartModal} onClose={() => setShowDiagnosisStartModal(false)}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                background: 'linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 85%, black 15%) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                animation: 'pulse 2s infinite',
              }}>
                <span className="icon-activity" style={{ color: '#fff', fontSize: 28 }} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--theme-text)', margin: '0 0 12px 0' }}>
                {uiLang === 'zh' ? '开始启动分析' : 'Starting Analysis'}
              </h2>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--theme-text-secondary)', margin: 0 }}>
                {uiLang === 'zh'
                  ? '分析时间较长，稍后到AI报告中查看。您可以继续其他操作，分析将在后台进行。'
                  : 'Analysis will take some time. Check AI Reports later. You can continue with other operations while analysis runs in the background.'
                }
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowDiagnosisStartModal(false)}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  background: 'linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 85%, black 15%) 100%)',
                  color: '#fff',
                  border: 'none',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 16px color-mix(in srgb, var(--primary) 40%, transparent)',
                }}
              >{uiLang === 'zh' ? '知道了' : 'Got it'}</button>
            </div>
      </OverlayModal>

      {/* Diagnosis Complete Modal */}
      <OverlayModal show={showDiagnosisCompleteModal && !!completedReport} onClose={() => setShowDiagnosisCompleteModal(false)}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <span className="icon-check" style={{ color: '#fff', fontSize: 28 }} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--theme-text)', margin: '0 0 12px 0' }}>
                {uiLang === 'zh' ? '分析完成' : 'Analysis Complete'}
              </h2>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--theme-text-secondary)', margin: '0 0 16px 0' }}>
                {uiLang === 'zh'
                  ? `报告「${completedReport?.name || ''}」已生成，点击查看完整分析结果。`
                  : `Report "${completedReport?.name || ''}" is ready. View the complete analysis.`
                }
              </p>
              <div style={{
                padding: '12px 16px',
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--theme-surface) 50%, transparent)',
                border: '1px solid color-mix(in srgb, var(--theme-border) 50%, transparent)',
              }}>
                <div style={{ fontSize: 12, color: 'var(--theme-text-secondary)', marginBottom: 4 }}>
                  {uiLang === 'zh' ? '机会评分' : 'Opportunity Score'}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>
                  {completedReport?.executiveSummary?.opportunity_score || 'N/A'}/100
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowDiagnosisCompleteModal(false)}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  background: 'color-mix(in srgb, var(--theme-surface) 90%, white 10%)',
                  color: 'var(--theme-text-secondary)',
                  border: '1px solid color-mix(in srgb, var(--theme-border) 70%, transparent)',
                  transition: 'all 0.2s',
                }}
              >{uiLang === 'zh' ? '稍后查看' : 'View Later'}</button>
              <button
                onClick={() => {
                  setShowDiagnosisCompleteModal(false);
                  onReportCreated?.(completedReport);
                }}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  background: 'linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 85%, black 15%) 100%)',
                  color: '#fff',
                  border: 'none',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 16px color-mix(in srgb, var(--primary) 40%, transparent)',
                }}
              >{uiLang === 'zh' ? '查看报告' : 'View Report'}</button>
            </div>
      </OverlayModal>

      <OverlayModal show={showVipModal} onClose={() => setShowVipModal(false)} width="min(440px, 90vw)" glass={false}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--theme-text)', margin: 0 }}>
                {t?.vip?.quotaExhausted || (uiLang === 'zh' ? '额度已用完' : 'Free quota exhausted')}
              </h2>
              <button type="button" onClick={() => setShowVipModal(false)}
                style={{ width: 32, height: 32, borderRadius: 99, border: 'none', background: 'var(--theme-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--theme-text-secondary)' }}
              ><span className="icon-x text-[16px]" /></button>
            </div>

            <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--theme-text-secondary)', margin: '0 0 18px' }}>
              {guestFeatureLocked
                ? (t?.vip?.guestBody || '')
                : (t?.vip?.oauthBody || '').replace(/\{\{n\}\}/g, String(oauthMaxFreeQuota))}
            </p>

            {guestFeatureLocked && typeof onOpenAuthModal === 'function' && (
              <button
                type="button"
                onClick={() => {
                  track(AnalyticsEvent.QUOTA_MODAL_SIGN_IN_CLICK, {});
                  setShowVipModal(false);
                  onOpenAuthModal();
                }}
                style={{
                  width: '100%',
                  padding: '12px 0',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginBottom: 14,
                  background: 'linear-gradient(135deg, var(--brand-primary-fixed, #ee1d36) 0%, color-mix(in srgb, var(--brand-primary-fixed, #ee1d36) 88%, black 12%) 100%)',
                  color: '#fff',
                  border: 'none',
                  boxShadow: '0 4px 14px rgba(238, 29, 54, 0.25)',
                }}
              >
                {t?.vip?.signInForMore || (uiLang === 'zh' ? '登录获取更多次数' : 'Sign in for more credits')}
              </button>
            )}

            {guestFeatureLocked && (
              <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--theme-text-muted)', margin: '0 0 12px' }}>
                {t?.vip?.merchantKeyHint || ''}
              </p>
            )}

            <input type="text" value={vipKeyInput}
              onChange={(e) => { setVipKeyInput(e.target.value); setVipKeyError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') tryUnlockVip(); }}
              placeholder={t?.vip?.enterKeyPlaceholder || (uiLang === 'zh' ? '请输入密钥' : 'Enter key')}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 12, fontSize: 14, outline: 'none',
                background: 'var(--theme-input-bg)', border: vipKeyError ? '1.5px solid var(--primary)' : '1px solid var(--theme-border)',
                color: 'var(--theme-text)', boxSizing: 'border-box', transition: 'border-color 0.2s',
              }}
            />
            {vipKeyError && <div style={{ fontSize: 12, color: 'var(--primary)', marginTop: 6 }}>{vipKeyError}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => setShowVipModal(false)}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: 'var(--theme-surface)', color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border)',
                }}>{t?.vip?.later || (uiLang === 'zh' ? '稍后' : 'Later')}</button>
              <button type="button" onClick={tryUnlockVip}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: 'var(--primary)', color: '#fff', border: 'none',
                }}>{t?.vip?.unlockVip || (uiLang === 'zh' ? '解锁 VIP' : 'Unlock VIP')}</button>
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--theme-border)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{t?.vip?.contactForKey || (uiLang === 'zh' ? '联系我们获取密钥' : 'Contact us for the key')}</span>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#25D366', textDecoration: 'none' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="#25D366">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span>{WHATSAPP_NUMBER}</span>
              </a>
            </div>
      </OverlayModal>
    </div>
  );
}
