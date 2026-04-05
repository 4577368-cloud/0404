import React from 'react';

/** English labels in user message so the LLM keys align with the GEO system prompt. */
export const GEO_MD_LABELS = {
  storeUrl: 'Store/Brand URL',
  coreProduct: 'Core product',
  pricePositioning: 'Price positioning',
  targetAudience: 'Granular target audience',
  usp: 'Core USP (unique selling proposition)',
  objections: 'Known customer objections / pain points',
  competitors: 'Primary competitors',
  marketingStatus: 'Current traffic / marketing status',
};

const FIELD_KEYS = [
  'storeUrl',
  'coreProduct',
  'pricePositioning',
  'targetAudience',
  'usp',
  'objections',
  'competitors',
  'marketingStatus',
];

function countFilled(values) {
  return FIELD_KEYS.filter((k) => String(values[k] || '').trim().length > 0).length;
}

export function buildGeoIntakeUserMessage(values, payloadHeader, payloadFooter) {
  const lines = [];
  const add = (key) => {
    const v = String(values[key] || '').trim();
    if (v) lines.push(`- **${GEO_MD_LABELS[key]}:** ${v}`);
  };
  FIELD_KEYS.forEach((k) => add(k));
  const body = lines.length ? `${lines.join('\n')}\n\n` : '';
  return `${payloadHeader}\n\n${body}${payloadFooter}`;
}

export default function GEOIntakePanel({
  labels,
  values,
  onFieldChange,
  onSubmit,
  minFilled = 3,
  disabled,
  onRefill,
  showRefillLink,
  compact = false,
  rootClassName = '',
}) {
  const n = countFilled(values);
  const canSubmit = n >= minFilled && !disabled;

  const fieldRow = (key) => (
    <label key={key} className="block min-w-0">
      <span className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--theme-text-secondary)' }}>
        {labels.fields[key]}
      </span>
      <input
        type="text"
        value={values[key] || ''}
        onChange={(e) => onFieldChange(key, e.target.value)}
        className="w-full min-w-0 rounded-xl px-3 h-9 text-[12px] outline-none transition-colors"
        style={{
          background: 'var(--theme-input-bg)',
          border: '1px solid var(--theme-border)',
          color: 'var(--theme-text)',
        }}
        placeholder={labels.placeholders[key]}
        disabled={disabled}
        autoComplete="off"
      />
    </label>
  );

  return (
    <div
      className={`rounded-2xl border space-y-3 ${compact ? 'p-3 mb-4' : 'p-4 mb-6'} ${rootClassName}`.trim()}
      style={{
        borderColor: 'var(--theme-border)',
        background: 'var(--theme-card-bg)',
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--theme-text)' }}>
            <span className="icon-globe text-[15px]" style={{ color: 'var(--theme-text-secondary)' }} aria-hidden />
            {labels.title}
          </h3>
          <p className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--theme-text-secondary)' }}>
            {labels.subtitle}
          </p>
        </div>
        <div
          className="text-[11px] font-medium px-2 py-0.5 rounded-lg shrink-0"
          style={{
            background: 'var(--theme-surface)',
            color: n >= minFilled ? 'var(--theme-text)' : 'var(--theme-text-muted)',
          }}
        >
          {labels.progress.replace('{{n}}', String(n)).replace('{{min}}', String(minFilled))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FIELD_KEYS.map((k) => fieldRow(k))}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: 'var(--chip-geo)',
            color: '#0f172a',
            border: 'none',
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

export { FIELD_KEYS, countFilled };
