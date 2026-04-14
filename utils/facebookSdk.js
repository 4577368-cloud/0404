/**
 * Facebook JS SDK：用于 FB.ui({ method: 'share', href, quote }) 在分享弹窗中预填引用文案（需配置 VITE_FACEBOOK_APP_ID）。
 * @see https://developers.facebook.com/docs/sharing/reference/share-dialog
 */

let sdkLoadPromise = null;
const FB_SDK_TIMEOUT = 10000; // 10秒超时

/**
 * @param {string} appId Meta 开发者控制台「应用编号」
 * @returns {Promise<typeof window.FB>}
 */
export function ensureFacebookSdk(appId) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('no_window'));
  }
  const id = String(appId || '').trim();
  if (!id) {
    return Promise.reject(new Error('missing_app_id'));
  }
  if (window.FB) {
    return Promise.resolve(window.FB);
  }
  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }
  sdkLoadPromise = new Promise((resolve, reject) => {
    let timeoutId = null;
    let scriptEl = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    // 超时保护
    timeoutId = setTimeout(() => {
      cleanup();
      if (scriptEl?.parentNode) {
        scriptEl.parentNode.removeChild(scriptEl);
      }
      reject(new Error('fb_sdk_load_timeout'));
    }, FB_SDK_TIMEOUT);

    window.fbAsyncInit = function onFbAsyncInit() {
      try {
        window.FB.init({
          appId: id,
          cookie: true,
          xfbml: true,
          version: 'v21.0',
        });
        cleanup();
        resolve(window.FB);
      } catch (e) {
        cleanup();
        reject(e);
      }
    };

    // 安全注入脚本
    try {
      scriptEl = document.createElement('script');
      scriptEl.src = 'https://connect.facebook.net/en_US/sdk.js';
      scriptEl.async = true;
      scriptEl.defer = true;
      scriptEl.crossOrigin = 'anonymous';
      scriptEl.onerror = () => {
        cleanup();
        reject(new Error('fb_sdk_script_failed'));
      };

      const target = document.body || document.head || document.documentElement;
      if (!target) {
        cleanup();
        reject(new Error('no_dom_target'));
        return;
      }
      target.appendChild(scriptEl);
    } catch (err) {
      cleanup();
      reject(new Error(`fb_sdk_inject_failed: ${err?.message || 'unknown'}`));
    }
  });
  return sdkLoadPromise;
}

/**
 * 打开 Facebook 分享对话框（可预填 quote；href 为实际落地链接）
 * @param {{ appId: string, href: string, quote: string, hashtag?: string }} opts
 */
export function openFacebookShareDialog(opts) {
  const { appId, href, quote, hashtag } = opts;
  return ensureFacebookSdk(appId).then(
    (FB) =>
      new Promise((resolve) => {
        const q = String(quote || '').trim();
        /** Share Dialog 的 quote 过长会被客户端忽略；保留充足长度以免长文案被截断 */
        const quoteTrimmed = q.length > 6000 ? `${q.slice(0, 5997)}…` : q;
        const payload = {
          method: 'share',
          href: String(href || '').trim(),
        };
        if (quoteTrimmed) payload.quote = quoteTrimmed;
        if (hashtag && String(hashtag).trim()) {
          const h = String(hashtag).trim();
          payload.hashtag = h.startsWith('#') ? h : `#${h}`;
        }
        FB.ui(payload, (response) => {
          resolve(response ?? {});
        });
      })
  );
}
