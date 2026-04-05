import React from 'react';
import { loadAIReports, deleteAIReport, formatReportDate, getExecutiveSummary } from '../utils/aiReports.js';

export default function AIReportList({ 
  activeReportId, 
  onSelectReport, 
  uiLang,
  onDeleteReport,
  reports: externalReports,
}) {
  const [reports, setReports] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (externalReports) {
      setReports(externalReports);
      setIsLoading(false);
    } else {
      const loaded = loadAIReports();
      setReports(loaded);
      setIsLoading(false);
    }
  }, [externalReports]);

  const handleDelete = (e, reportId) => {
    e.stopPropagation();
    if (confirm(uiLang === 'zh' ? '确定要删除此报告吗？' : 'Are you sure you want to delete this report?')) {
      deleteAIReport(reportId);
      setReports(prev => prev.filter(r => r.id !== reportId));
      if (activeReportId === reportId) {
        onSelectReport(null);
      }
      onDeleteReport?.(reportId);
    }
  };

  const getOpportunityScore = (report) => {
    const summary = getExecutiveSummary(report);
    return summary?.opportunity_score || 0;
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#f59e0b';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  if (isLoading) {
    return (
      <div style={{ 
        width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--theme-chat-bg, #ffffff)', borderRight: '1px solid var(--theme-border)',
      }}>
        <div style={{ padding: 20, borderBottom: '1px solid var(--theme-border)' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--theme-text)' }}>
            {uiLang === 'zh' ? 'AI 诊断报告' : 'AI Reports'}
          </h3>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="animate-pulse" style={{ color: 'var(--theme-text-muted)' }}>
            {uiLang === 'zh' ? '加载中...' : 'Loading...'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: 'var(--theme-chat-bg, #ffffff)', borderRight: '1px solid var(--theme-border)',
    }}>
      <div style={{ 
        padding: '16px 16px 12px', borderBottom: '1px solid var(--theme-border)',
        flexShrink: 0, background: 'var(--theme-chat-bg, #ffffff)',
      }}>
        <h3 style={{ 
          margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--theme-text)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span className="icon-file-text" style={{ color: 'var(--brand-primary-fixed)' }} />
          {uiLang === 'zh' ? 'AI 诊断报告' : 'AI Reports'}
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--theme-text-muted)' }}>
          {reports.length > 0 
            ? (uiLang === 'zh' ? `${reports.length} 份报告` : `${reports.length} reports`)
            : (uiLang === 'zh' ? '暂无报告' : 'No reports yet')
          }
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {reports.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--theme-text-muted)' }}>
            <span className="icon-inbox" style={{ fontSize: 32, opacity: 0.5 }} />
            <p style={{ marginTop: 12, fontSize: 13 }}>
              {uiLang === 'zh' 
                ? '点击"爆款商品"中的 AI 诊断按钮生成报告' 
                : 'Click AI Diagnose on Hot Products to generate reports'}
            </p>
          </div>
        ) : (
          reports.map((report) => {
            const isActive = activeReportId === report.id;
            const score = getOpportunityScore(report);
            const scoreColor = getScoreColor(score);

            return (
              <div
                key={report.id}
                onClick={() => onSelectReport(report.id)}
                style={{
                  padding: '12px 14px', borderRadius: 10, marginBottom: 8, cursor: 'pointer',
                  background: isActive ? 'color-mix(in srgb, var(--brand-primary-fixed) 10%, transparent)' : 'transparent',
                  border: isActive ? '1px solid color-mix(in srgb, var(--brand-primary-fixed) 20%, transparent)' : '1px solid transparent',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'color-mix(in srgb, var(--brand-primary-fixed) 5%, transparent)'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      fontSize: 13, fontWeight: isActive ? 600 : 500, color: 'var(--theme-text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={report.name}>
                      {report.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginTop: 4 }}>
                      {formatReportDate(report.createdAt, uiLang)}
                    </div>
                  </div>
                  {score > 0 && (
                    <div style={{
                      padding: '2px 8px', borderRadius: 12,
                      background: `${scoreColor}20`, color: scoreColor,
                      fontSize: 11, fontWeight: 600, flexShrink: 0,
                    }}>
                      {score}
                    </div>
                  )}
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'flex-end', marginTop: 8,
                  opacity: isActive ? 1 : 0, transition: 'opacity 0.15s',
                }}>
                  <button
                    onClick={(e) => handleDelete(e, report.id)}
                    style={{
                      padding: '4px 8px', borderRadius: 4, border: 'none',
                      background: 'transparent', color: 'var(--theme-text-muted)',
                      fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--theme-text-muted)'; }}
                  >
                    <span className="icon-trash-2" style={{ fontSize: 12 }} />
                    {uiLang === 'zh' ? '删除' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
