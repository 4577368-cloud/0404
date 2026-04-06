import React from 'react';
import { CompactRetailProductCard } from './CompactRetailProductCard.jsx';

/** 聊天横排 Picks：仅 View（有 tangbuy 链接则直达，否则按标题/类目搜索） */
export default function ChatHotProductCard({ p, uiLang, onAskAi, guestFeatureLocked, onRequireLogin }) {
  return (
    <CompactRetailProductCard
      product={p}
      uiLang={uiLang}
      retailVariant="hot"
      trendFooter="view_only"
      onAskAi={onAskAi}
      guestFeatureLocked={guestFeatureLocked}
      onRequireLogin={onRequireLogin}
    />
  );
}
