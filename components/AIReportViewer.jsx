import React from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getAIReportById, formatReportDate } from '../utils/aiReports.js';
import { generateMarkdownReport, decodeHtmlEntities, deepDecodeEntities } from '../utils/reportFormatter.js';

// Step names in Chinese and English (index 0 = Step 9 放在最前)
const STEP_NAMES = {
  zh: [
    '执行摘要',
    '任务调度',
    '市场趋势分析',
    '竞品对标分析',
    '深度拆解分析',
    '机会地图',
    '概念方案生成',
    '视觉创意提示',
    '广告文案套件',
    '执行路线图',
  ],
  en: [
    'Executive Summary',
    'Task Scheduler',
    'Market Trend Analysis',
    'Competitive Benchmark',
    'Deep Dive Analysis',
    'Opportunity Map',
    'Concept Briefs',
    'Visual Creative Prompts',
    'Ad Copy Kit',
    'Execution Roadmap',
  ],
};

// 步骤映射：显示顺序 vs 实际步骤号
const STEP_MAPPING = [9, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/* 步骤标题：DESIGN.md Webflow Blue #146ef5 + 浅冷灰底，不用浅红 */
const REPORT_STYLES = `
.report-body { font-size: 14px; line-height: 1.7; color: #1a1a1a; }
.report-body h1 { font-size: 22px; font-weight: 700; margin: 0 0 16px; color: #080808; border-bottom: 2px solid #d8d8d8; padding-bottom: 8px; }
.report-body h2 { font-size: 17px; font-weight: 700; margin: 28px 0 14px; color: #080808; border-bottom: 1px solid #d8d8d8; padding-bottom: 6px; }
.report-body h2.report-step-heading {
  margin: 36px 0 18px;
  padding: 14px 18px;
  border-radius: 6px;
  border: 1px solid #d8d8d8;
  border-left: 4px solid #146ef5;
  background: linear-gradient(180deg, #f4f7fd 0%, #eef2fa 100%);
  border-bottom: none;
  box-shadow: 0 1px 2px rgba(8,8,8,0.04);
}
.report-body h2.report-step-heading:first-child { margin-top: 0; }
.report-body h3 { font-size: 15px; font-weight: 600; margin: 20px 0 10px; color: #222; }
.report-body h4 { font-size: 14px; font-weight: 600; margin: 18px 0 8px; color: #363636; }
.report-body h5 { font-size: 13px; font-weight: 600; margin: 14px 0 6px; color: #5a5a5a; }
.report-body p { margin: 0 0 10px; }
.report-body strong { font-weight: 600; }
.report-body em { font-style: italic; opacity: 0.88; }
.report-body ul, .report-body ol { margin: 6px 0 12px; padding-left: 22px; }
.report-body li { margin: 4px 0; }
.report-body li p { margin: 0; display: inline; }
.report-body blockquote { margin: 8px 0 12px; padding: 10px 16px; border-left: 3px solid #146ef5; background: rgba(20,110,245,0.06); border-radius: 0 6px 6px 0; font-size: 13px; color: #363636; }
.report-body table { width: 100%; border-collapse: collapse; margin: 10px 0 14px; font-size: 13px; }
.report-body th, .report-body td { padding: 7px 12px; border: 1px solid #d8d8d8; text-align: left; }
.report-body th { background: #f0f4fd; font-weight: 600; font-size: 12px; color: #222; }
.report-body hr { border: none; border-top: 1px solid #d8d8d8; margin: 18px 0; }
.report-body code { background: #f4f4f5; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
.report-body a { color: #146ef5; text-decoration: none; }
.report-body a:hover { text-decoration: underline; color: #0055d4; }
.report-body .report-num-em { font-weight: 700; color: #0d5cb6; font-variant-numeric: tabular-nums; }
`;

function highlightNumericInReportHtml(html) {
  if (!html) return html;
  return html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith('<')) return part;
    return part.replace(/(\d+(?:\.\d+)?)(%|‰)?/g, '<span class="report-num-em">$1$2</span>');
  }).join('');
}

/** 为各 Step 的 h2 增加卡片样式（执行摘要等普通 h2 不变）；兼容 marked 生成的 id */
function markStepHeadings(html) {
  if (!html) return html;
  return html.replace(/<h2([^>]*)>(\s*Step\s+\d+\s*:[^<]*)<\/h2>/gi, (full, attrs, inner) => {
    if (/report-step-heading/.test(attrs)) return full;
    const a = (attrs || '').trim();
    return a ? `<h2 ${a} class="report-step-heading">${inner}</h2>` : `<h2 class="report-step-heading">${inner}</h2>`;
  });
}

/** Remove unresolved Shopify Liquid refs so browser won't request `{{ ... }}` URLs. */
function stripLiquidTemplateRefs(html) {
  if (!html) return html;
  return String(html)
    .replace(/<img\b[^>]*\bsrc\s*=\s*["'][^"']*(?:\{\{|\{%)[^"']*["'][^>]*>/gi, '')
    .replace(/<a\b([^>]*\bhref\s*=\s*["'][^"']*(?:\{\{|\{%)[^"']*["'])([^>]*)>/gi, '<a$1$2 data-invalid-liquid-ref="1">')
    .replace(/\b(?:href|src)\s*=\s*["'][^"']*(?:\{\{|\{%)[^"']*["']/gi, '');
}

export default function AIReportViewer({ reportId, uiLang, onNewDiagnosis }) {
  const [report, setReport] = React.useState(null);
  const [activeStep, setActiveStep] = React.useState(0); // 默认显示执行摘要(Step 9)
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (reportId) {
      const loaded = getAIReportById(reportId);
      setReport(loaded);
      setIsLoading(false);
      setActiveStep(0); // 重置到执行摘要
    } else {
      setReport(null);
      setIsLoading(false);
    }
  }, [reportId]);

  if (isLoading) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--theme-chat-bg, #ffffff)',
      }}>
        <div className="animate-pulse" style={{ color: 'var(--theme-text-muted)' }}>
          {uiLang === 'zh' ? '加载中...' : 'Loading...'}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--theme-chat-bg, #ffffff)',
        padding: 40,
      }}>
        <div style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'color-mix(in srgb, var(--brand-primary-fixed) 10%, transparent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        }}>
          <span className="icon-file-text" style={{ fontSize: 48, color: 'var(--brand-primary-fixed)', opacity: 0.6 }} />
        </div>
        <h3 style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 600,
          color: 'var(--theme-text)',
        }}>
          {uiLang === 'zh' ? '选择一份报告查看详情' : 'Select a report to view details'}
        </h3>
        <p style={{
          margin: '12px 0 24px',
          fontSize: 14,
          color: 'var(--theme-text-muted)',
          textAlign: 'center',
          maxWidth: 400,
        }}>
          {uiLang === 'zh' 
            ? '从左侧列表选择一份报告：商品 9 步诊断，或品牌 / SEO / GEO 分析输出' 
            : 'Pick a report: 9-step product diagnosis, or brand / SEO / GEO analysis'}
        </p>
        
        <button
          onClick={onNewDiagnosis}
          style={{
            padding: '12px 24px',
            borderRadius: 10,
            border: 'none',
            background: 'var(--brand-primary-fixed)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 14px rgba(255,59,48,0.3)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(255,59,48,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(255,59,48,0.3)';
          }}
        >
          <span className="icon-plus" />
          {uiLang === 'zh' ? '新建诊断' : 'New Diagnosis'}
        </button>
      </div>
    );
  }

  const stepNames = STEP_NAMES[uiLang] || STEP_NAMES.en;
  const isAnalysisReport = report?.kind === 'analysis' && typeof report?.analysisMarkdown === 'string';

  // 获取当前显示的实际步骤号
  const getActualStep = (displayIndex) => STEP_MAPPING[displayIndex];

  function buildReportHtml() {
    if (!report) return { bodyHtml: '', safeBase: 'report' };
    const cleanReport = deepDecodeEntities(report);
    const md = decodeHtmlEntities(generateMarkdownReport(cleanReport, uiLang, null) || '');
    const rawHtml = marked.parse(md);
    let bodyHtml = DOMPurify.sanitize(
      highlightNumericInReportHtml(markStepHeadings(typeof rawHtml === 'string' ? rawHtml : '')) || '',
      { ADD_ATTR: ['target', 'rel', 'class'] },
    );
    bodyHtml = stripLiquidTemplateRefs(bodyHtml);
    bodyHtml = bodyHtml
      .replace(/&#39;/g, "'").replace(/&amp;#39;/g, "'")
      .replace(/&#34;/g, '"').replace(/&amp;#34;/g, '"');
    const safeBase = decodeHtmlEntities(
      report.name || (uiLang === 'zh' ? '诊断报告' : 'Diagnosis report'),
    ).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'report';
    return { bodyHtml, safeBase };
  }

  function buildFullHtmlPage(bodyHtml, title) {
    const lang = uiLang === 'zh' ? 'zh-CN' : 'en';
    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8"><title>${title}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;background:#fff;color:#1a1a1a;
font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei","WenQuanYi Micro Hei",
-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
font-size:14px;line-height:1.7}
body{padding:28px 36px}
${REPORT_STYLES}
</style>
</head>
<body><div class="report-body">${bodyHtml}</div></body>
</html>`;
  }

  function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const handleExportHtml = () => {
    const { bodyHtml, safeBase } = buildReportHtml();
    if (!bodyHtml.trim()) return;
    const fullHtml = buildFullHtmlPage(bodyHtml, safeBase);
    downloadFile(new Blob([fullHtml], { type: 'text/html;charset=utf-8' }), `${safeBase}.html`);
  };

  const renderStepContent = () => {
    if (!report) return null;

    if (isAnalysisReport) {
      const cleanReport = deepDecodeEntities(report);
      const markdownContent = decodeHtmlEntities(generateMarkdownReport(cleanReport, uiLang, null) || '');
      const rawHtml = marked.parse(markdownContent);
      let html = DOMPurify.sanitize(highlightNumericInReportHtml(markStepHeadings(rawHtml)), {
        ADD_ATTR: ['target', 'rel', 'class'],
      });
      html = stripLiquidTemplateRefs(html);
      html = html.replace(/&#39;/g, "'").replace(/&amp;#39;/g, "'").replace(/&#34;/g, '"').replace(/&amp;#34;/g, '"');
      return (
        <div style={{ padding: '20px 24px', background: '#ffffff' }}>
          <div style={{
            padding: '28px 32px',
            borderRadius: 12,
            background: '#ffffff',
            border: '1px solid #e5e5e5',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div className="report-body" dangerouslySetInnerHTML={{ __html: html }} />
            <style>{REPORT_STYLES}</style>
          </div>
        </div>
      );
    }

    const actualStep = getActualStep(activeStep);
    const stepOutput = report.stepOutputs?.find(s => s.step === actualStep);
    const isSkipped = !stepOutput || stepOutput.data?._skipped || stepOutput.data?._parse_failed;

    if (isSkipped) {
      return (
        <div style={{ padding: '20px 24px', background: '#ffffff' }}>
          <div style={{
            padding: '48px 32px',
            borderRadius: 12,
            background: '#fafafa',
            border: '1px dashed #d8d8d8',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>⚠️</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#666' }}>
              {uiLang === 'zh' ? '此步骤未能成功生成' : 'This step did not complete successfully'}
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: '#999', maxWidth: 420, marginInline: 'auto', lineHeight: 1.6 }}>
              {uiLang === 'zh'
                ? '可能由于 API 超时或网络波动，该分析模块未能输出有效结果。其他已完成的步骤不受影响，你可以查看其他板块的分析内容。'
                : 'This analysis module failed to produce results, possibly due to API timeout or network issues. Other completed steps are unaffected — you can view their analysis above.'}
            </p>
          </div>
        </div>
      );
    }

    const cleanReport = deepDecodeEntities(report);
    const markdownContent = decodeHtmlEntities(generateMarkdownReport(cleanReport, uiLang, actualStep) || '');
    const rawHtml = marked.parse(markdownContent);
    let html = DOMPurify.sanitize(highlightNumericInReportHtml(markStepHeadings(rawHtml)), {
      ADD_ATTR: ['target', 'rel', 'class'],
    });
    html = stripLiquidTemplateRefs(html);
    html = html.replace(/&#39;/g, "'").replace(/&amp;#39;/g, "'").replace(/&#34;/g, '"').replace(/&amp;#34;/g, '"');

    if (!html.trim()) {
      return (
        <div style={{ padding: '20px 24px', background: '#ffffff' }}>
          <div style={{
            padding: '48px 32px',
            borderRadius: 12,
            background: '#fafafa',
            border: '1px dashed #d8d8d8',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>📄</div>
            <p style={{ margin: 0, fontSize: 13, color: '#999' }}>
              {uiLang === 'zh' ? '该步骤数据为空' : 'No data for this step'}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div style={{ padding: '20px 24px', background: '#ffffff' }}>
        <div style={{
          padding: '28px 32px',
          borderRadius: 12,
          background: '#ffffff',
          border: '1px solid #e5e5e5',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <div
            className="report-body"
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <style>{REPORT_STYLES}</style>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: '#ffffff',
      overflow: 'hidden',
    }}>
      {/* Report Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid #e5e5e5',
        background: '#ffffff',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--theme-text)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span className="icon-file-text" style={{ color: 'var(--brand-primary-fixed)' }} />
              {report.name}
            </h1>
            <div style={{
              marginTop: 8,
              fontSize: 13,
              color: 'var(--theme-text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <span>
                <span className="icon-calendar" style={{ marginRight: 4 }} />
                {formatReportDate(report.createdAt, uiLang)}
              </span>
              {!isAnalysisReport && report.targetMarket?.countries && (
                <span>
                  <span className="icon-globe" style={{ marginRight: 4 }} />
                  {report.targetMarket.countries}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportHtml}
            title={uiLang === 'zh' ? '下载 HTML 报告（浏览器打开后可打印为 PDF）' : 'Download HTML report (open in browser, print to PDF)'}
            style={{
              flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 8,
              border: '1px solid #e5e5e5', background: '#fafafa',
              color: 'var(--theme-text)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f4fd'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#fafafa'; }}
          >
            <span className="icon-file-text" style={{ fontSize: 13, color: 'var(--brand-primary-fixed)' }} />
            {uiLang === 'zh' ? '下载 HTML' : 'Download HTML'}
          </button>
        </div>

        {/* Step Navigation */}
        {!isAnalysisReport && (
        <div style={{
          display: 'flex',
          gap: 8,
          marginTop: 20,
          overflowX: 'auto',
          paddingBottom: 4,
        }}>
          {stepNames.map((name, displayIndex) => {
            const actualStep = getActualStep(displayIndex);
            const stepOutput = report.stepOutputs?.find(s => s.step === actualStep);
            const hasData = !!stepOutput && !stepOutput.data?._skipped && !stepOutput.data?._parse_failed;
            const isActive = activeStep === displayIndex;

            return (
              <button
                key={displayIndex}
                onClick={() => setActiveStep(displayIndex)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: isActive 
                    ? 'var(--brand-primary-fixed)' 
                    : hasData 
                      ? 'color-mix(in srgb, var(--brand-primary-fixed) 10%, transparent)' 
                      : 'var(--theme-surface)',
                  color: isActive ? '#fff' : hasData ? 'var(--brand-primary-fixed)' : 'var(--theme-text-muted)',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  opacity: hasData ? 1 : 0.55,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = hasData
                      ? 'color-mix(in srgb, var(--brand-primary-fixed) 20%, transparent)'
                      : 'color-mix(in srgb, var(--theme-text-muted) 8%, transparent)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = hasData
                      ? 'color-mix(in srgb, var(--brand-primary-fixed) 10%, transparent)'
                      : 'var(--theme-surface)';
                  }
                }}
              >
                {displayIndex === 0 ? name : `Step ${actualStep}: ${name}`}
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* Report Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        background: '#ffffff',
      }}>
        {renderStepContent()}
      </div>
    </div>
  );
}
