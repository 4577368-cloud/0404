import React from 'react';
import { CompactRetailProductCard } from './CompactRetailProductCard.jsx';

/** 与热销 JSON（tangbuy-product）字段一致的竖版卡片：View + AI Diagnose */
export default function ChatHotProductCard({ p, uiLang, onAskAi, guestFeatureLocked, onRequireLogin }) {
  return (
    <CompactRetailProductCard
      product={p}
      uiLang={uiLang}
      retailVariant="hot"
      trendFooter="view_ai"
      onAskAi={onAskAi}
      guestFeatureLocked={guestFeatureLocked}
      onRequireLogin={onRequireLogin}
    />
  );
}
