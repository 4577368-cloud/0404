import React from 'react';
import AIReportList from './AIReportList.jsx';
import AIReportViewer from './AIReportViewer.jsx';

/**
 * 与 App 中并列 lazy(List)+lazy(Viewer) 相比：整页只触发 **一次** 动态 import，
 * 减少并行 chunk 请求导致的偶发 net::ERR_CONNECTION_CLOSED（HTTP/2/CDN 断连等）。
 */
export default function AIReportsView({
  reportListVisible,
  activeReportId,
  onSelectReport,
  uiLang,
  reports,
  onDeleteReport,
  onNewAnalysis,
  onNewDiagnosis,
}) {
  return (
    <>
      {reportListVisible && (
        <AIReportList
          activeReportId={activeReportId}
          onSelectReport={onSelectReport}
          uiLang={uiLang}
          reports={reports}
          onDeleteReport={onDeleteReport}
          onNewAnalysis={onNewAnalysis}
        />
      )}
      <AIReportViewer reportId={activeReportId} uiLang={uiLang} onNewDiagnosis={onNewDiagnosis} />
    </>
  );
}
