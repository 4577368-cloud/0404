import React from 'react';
import { CompactRetailProductCard } from './CompactRetailProductCard.jsx';

/** 聊天横排商品卡：找同款 + AI诊断 + 询盘 */
export default function ChatHotProductCard({ p, uiLang, onAskAi, onSendInquiry, guestFeatureLocked, onRequireLogin }) {
  return (
    <CompactRetailProductCard
      product={p}
      uiLang={uiLang}
      retailVariant="hot"
      trendFooter="view_chat_tray"
      onAskAi={onAskAi}
      onSendInquiry={onSendInquiry}
      guestFeatureLocked={guestFeatureLocked}
      onRequireLogin={onRequireLogin}
    />
  );
}
