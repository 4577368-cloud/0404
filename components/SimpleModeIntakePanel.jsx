import React from 'react';

export function normalizeUrlInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

export function buildDiagnosisIntakeUserMessage(labels, rawUrl) {
  const u = normalizeUrlInput(rawUrl);
  return `${labels.payloadHeader}\n\n- **Website / store URL:** ${u}\n${labels.payloadFooter}`;
}

export function buildSeoIntakeUserMessage(labels, rawUrl) {
  const u = normalizeUrlInput(rawUrl);
  return `${labels.payloadHeader}\n\n- **Product page URL:** ${u}\n${labels.payloadFooter}`;
}

const ACCENT = {
  diagnosis: { chip: 'var(--chip-diagnosis)', label: 'diagnosis' },
  seo: { chip: 'var(--chip-seo)', label: 'seo' },
};

/**
 * 单字段入口（独立站诊断：域名 / SEO：商品链接），样式对齐 GEO 表单卡片
 */
export default function SimpleModeIntakePanel({
  variant,
  labels,
  value,
  onChange,
  onSubmit,
  disabled,
  compact = false,
  onRefill,
  showRefillLink,
  rootClassName = '',
}) {
  const canSubmit = String(value || '').trim().length > 0 && !disabled;
  const { chip } = ACCENT[variant] || ACCENT.diagnosis;

  return (
    <div
      className={`rounded-2xl border space-y-3 ${compact ? 'p-3 mb-0' : 'p-4 mb-6'} ${rootClassName}`.trim()}
      style={{
        borderColor: 'var(--theme-border)',
        background: 'var(--theme-card-bg)',
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--theme-text)' }}>
            <span
              className={variant === 'seo' ? 'icon-search-check text-[15px]' : 'icon-activity text-[15px]'}
              style={{ color: 'var(--theme-text-secondary)' }}
              aria-hidden
            />
            {labels.title}
          </h3>
          <p className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--theme-text-secondary)' }}>
            {labels.subtitle}
          </p>
        </div>
      </div>

      <label className="block min-w-0">
        <span className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--theme-text-secondary)' }}>
          {labels.fieldLabel}
        </span>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 rounded-xl px-3 h-9 text-[12px] outline-none transition-colors"
          style={{
            background: 'var(--theme-input-bg)',
            border: '1px solid var(--theme-border)',
            color: 'var(--theme-text)',
          }}
          placeholder={labels.placeholder}
          disabled={disabled}
          autoComplete="off"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: chip,
            color: '#fff',
            border: 'none',
            boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
            textShadow: '0 1px 2px rgba(0,0,0,0.2)',
          }}
        >
          {labels.startBtn}
        </button>
        {showRefillLink && onRefill ? (
          <button
            type="button"
            onClick={onRefill}
            className="text-[11px] underline-offset-2 hover:underline"
            style={{ color: 'var(--theme-text-secondary)', background: 'none', border: 'none' }}
          >
            {labels.refillBtn}
          </button>
        ) : null}
      </div>
    </div>
  );
}
