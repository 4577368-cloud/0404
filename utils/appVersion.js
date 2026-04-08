/**
 * 应用展示版本：发版或有功能更新时将数字 +0.01（如 1.02 → 1.03），界面显示为 V1.02。
 * 与 package.json 的 semver 无关，仅此一处维护即可。
 */
export const APP_VERSION_SEMVER = '1.02';

export function getAppVersionLabel() {
  const n = String(APP_VERSION_SEMVER || '1.01').trim().replace(/^v/i, '');
  return `V${n}`;
}
