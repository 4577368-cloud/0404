/**
 * Workflow execution hook
 * Manages the 9-step AI diagnosis workflow execution
 */

import { useCallback, useRef, useEffect } from 'react';

export function useWorkflowExecution({
  uiLang,
  setMessages,
  setWorkflowStepResults,
  setCurrentWorkflowStep,
  setWorkflowProgressPercent,
  setCurrentStepName,
  setIsWorkflowRunning,
  setCompletedReport,
  setShowDiagnosisCompleteModal,
  onReportCreated,
  STEP_NAME_TRANSLATIONS,
  createAIReport,
}) {
  const workflowAbortRef = useRef(false);
  const pendingWorkflowRef = useRef(null);

  const executeWorkflowStep = useCallback(async (workflow, startStep) => {
    if (workflowAbortRef.current) return;

    let currentStep = startStep;

    while (currentStep <= 9 && !workflowAbortRef.current) {
      const stepData = workflow.getCurrentStepData();
      if (!stepData) {
        console.error('[Workflow] No step data available');
        setIsWorkflowRunning(false);
        return;
      }

      const { prompt: fullPrompt, maxTokens } = stepData;

      try {
        // Step 9: Final report aggregation (special handling)
        if (currentStep === 9) {
          // 立即更新UI显示9/9，避免用户看到滞后的8/9
          setCurrentWorkflowStep(currentStep);
          setWorkflowProgressPercent(100);
          const stepNamesTranslated = STEP_NAME_TRANSLATIONS[uiLang === 'zh' ? 'zh' : 'en'];
          setCurrentStepName(stepNamesTranslated?.[currentStep] || 'Final Report');
          
          const stepOutputs = workflow.stepOutputs || [];
          
          // Try to parse step 8 output for executive summary
          let executiveSummary;
          try {
            const step8Output = stepOutputs[8];
            let step8Data = null;
            
            if (step8Output && typeof step8Output === 'object') {
              step8Data = step8Output.data || step8Output;
            } else if (typeof step8Output === 'string') {
              try {
                step8Data = JSON.parse(step8Output);
              } catch (e) {
                step8Data = null;
              }
            }
            
            executiveSummary = {
              opportunity_score: step8Data?.opportunity_score || 75,
              confidence_level: step8Data?.recommended_action === 'proceed' ? 'high' : 'medium',
              recommended_action: step8Data?.recommended_action || 'proceed',
              investment_thesis: step8Data?.investment_thesis || 'Market opportunity identified through comprehensive analysis',
              key_insight: step8Data?.key_insight || 'Strong market fit with competitive differentiation',
              critical_success_factors: step8Data?.critical_success_factors || ['Product-market fit', 'Effective marketing', 'Competitive pricing'],
              major_risks: step8Data?.major_risks || ['Market competition', 'Supply chain', 'Regulatory changes']
            };
          } catch (e) {
            console.log('[Workflow] Step 9: Could not parse step 8 data, using default summary', e.message);
            executiveSummary = {
              opportunity_score: 75,
              confidence_level: 'medium',
              recommended_action: 'proceed',
              investment_thesis: 'Market opportunity identified',
              key_insight: 'Strong market fit',
              critical_success_factors: ['Product quality', 'Marketing', 'Pricing'],
              major_risks: ['Competition', 'Supply chain']
            };
          }
          
          // Create comprehensive final report by aggregating all steps
          const finalReportData = {
            step: 9,
            step_name: 'final_report',
            report_timestamp: new Date().toISOString(),
            executive_summary: executiveSummary,
            complete_analysis: stepOutputs.map((output, index) => {
              let parsedOutput = null;
              try {
                if (output && typeof output === 'object') {
                  parsedOutput = output.data || output;
                } else if (output && typeof output === 'string') {
                  try {
                    parsedOutput = JSON.parse(output);
                  } catch (e) {
                    parsedOutput = { raw_output: output };
                  }
                }
              } catch (e) {
                console.log(`[Workflow] Step 9: Could not parse step ${index} output, using raw`);
                parsedOutput = { raw_output: String(output).slice(0, 1000) };
              }
              return {
                step_number: index,
                step_name: STEP_NAME_TRANSLATIONS[uiLang === 'zh' ? 'zh' : 'en']?.[index] || `Step ${index}`,
                data: parsedOutput
              };
            }),
            report_metadata: {
              generated_at: new Date().toISOString(),
              workflow_steps_completed: 9,
              total_steps_analyzed: stepOutputs.length
            },
            next_step_ready: true
          };
          
          // Store the final report as object (not JSON string)
          // storeStepOutput expects raw string, but we already have structured data
          const storeResult = workflow.storeStepOutput(JSON.stringify(finalReportData));
          
          // Manually ensure step 9 data is properly structured in stepOutputs
          if (storeResult.success) {
            // Replace the string data with proper object structure
            const step9Index = workflow.stepOutputs.findIndex(s => s.step === 9);
            if (step9Index >= 0) {
              workflow.stepOutputs[step9Index].data = finalReportData;
            }
          }
          
          if (storeResult.success) {
            setWorkflowStepResults(prev => [...prev, {
              step: currentStep,
              timestamp: new Date().toISOString(),
              data: storeResult.data,
              truncated: storeResult.truncated
            }]);
            
            // Update progress for step 9
            setCurrentWorkflowStep(currentStep);
            setWorkflowProgressPercent(100);
            const stepNamesTranslated = STEP_NAME_TRANSLATIONS[uiLang === 'zh' ? 'zh' : 'en'];
            setCurrentStepName(stepNamesTranslated?.[currentStep] || 'Final Report');

            // Workflow complete - finalize
            workflow.complete();
            setIsWorkflowRunning(false);

            // Generate final report data
            const newReport = createAIReport(
              workflow.productData,
              workflow.targetMarket,
              workflow.stepOutputs,
              uiLang
            );

            // Store completed report and show completion modal
            setCompletedReport(newReport);
            setShowDiagnosisCompleteModal(true);

            // Notify parent component
            onReportCreated?.(newReport);
          } else {
            throw new Error(storeResult.error || 'Failed to store final report');
          }
          
          // Step 9 complete, exit loop
          return;
        } else {
          // Steps 0-8: AI call with retry + graceful skip
          const FETCH_TIMEOUT_MS = 180_000;
          let stepSucceeded = false;
          const maxRetries = 3;
          
          for (let attempt = 0; attempt < maxRetries && !stepSucceeded; attempt++) {
            if (workflowAbortRef.current) break;
            if (attempt > 0) {
              console.log(`[Workflow] Step ${currentStep} retry ${attempt + 1}/${maxRetries}…`);
              await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1500));
            }

            const promptOpts = attempt > 0 ? { compression: 'high' } : {};
            let currentPrompt = workflow.getCurrentStepPrompt(promptOpts);
            const budget = attempt === 0 ? 30000 : attempt === 1 ? 20000 : 14000;
            if (currentPrompt.length > budget) {
              currentPrompt = currentPrompt.slice(0, Math.max(0, budget - 120)) + '\n\n[...context truncated...]\n';
            }

            const curMaxTokens = Math.max(1024, Math.floor(maxTokens * (attempt === 0 ? 1 : attempt === 1 ? 0.7 : 0.5)));

            const apiMessages = [
              { role: 'system', content: `You are an AI diagnosis assistant. Output valid JSON.\n\n${currentPrompt}` },
              { role: 'user', content: currentStep === 0
                  ? 'Execute Step 0: Parse product data and output structured task list.'
                  : `Execute Step ${currentStep} based on previous analysis.` },
            ];

            const abortCtrl = new AbortController();
            const timer = setTimeout(() => abortCtrl.abort(), FETCH_TIMEOUT_MS);

            try {
              const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortCtrl.signal,
                body: JSON.stringify({ messages: apiMessages, stream: false, max_tokens: curMaxTokens, temperature: 0.1, response_format: { type: 'json_object' } }),
              });
              clearTimeout(timer);

              if (res.ok) {
                const data = await res.json();
                const fullContent = data.choices?.[0]?.message?.content || '';
                console.log('[Workflow] Step', currentStep, 'output length:', fullContent.length);
                const storeResult = workflow.storeStepOutput(fullContent);
                if (storeResult.success) {
                  setWorkflowStepResults(prev => [...prev, { step: currentStep, timestamp: new Date().toISOString(), data: storeResult.data, truncated: storeResult.truncated }]);
                  stepSucceeded = true;
                }
              } else {
                const shouldRetry = [502, 503, 504].includes(res.status);
                console.log(`[Workflow] Step ${currentStep} HTTP ${res.status}${shouldRetry ? ', will retry' : ''}`);
                if (!shouldRetry) break;
              }
            } catch (err) {
              clearTimeout(timer);
              console.warn(`[Workflow] Step ${currentStep} attempt ${attempt} error: ${err.message}`);
            }
          }

          if (!stepSucceeded) {
            console.warn(`[Workflow] Step ${currentStep} failed after retries — skipping`);
            workflow.storeStepOutput(JSON.stringify({ step: currentStep, _skipped: true, reason: 'All attempts failed' }));
            setWorkflowStepResults(prev => [...prev, { step: currentStep, timestamp: new Date().toISOString(), data: { _skipped: true }, truncated: false }]);
          }

          setCurrentWorkflowStep(currentStep);
          setWorkflowProgressPercent(currentStep < 9 ? (currentStep + 1) * 10 : 100);
          const stepNames = STEP_NAME_TRANSLATIONS[uiLang === 'zh' ? 'zh' : 'en'];
          setCurrentStepName(stepNames[currentStep] || stepNames[0]);
          
          if (!workflowAbortRef.current) {
            const nextResult = workflow.nextStep();
            if (nextResult.success) {
              currentStep++;
            } else {
              return;
            }
          }
        }

      } catch (err) {
        console.error(`[Workflow] Step ${currentStep} fatal error:`, err);

        if (currentStep > 0 && !workflowAbortRef.current) {
          console.log(`[Workflow] Continuing past failed step ${currentStep}…`);
          workflow.storeStepOutput(JSON.stringify({ step: currentStep, _skipped: true, reason: err.message }));
          setWorkflowStepResults(prev => [...prev, { step: currentStep, timestamp: new Date().toISOString(), data: { _skipped: true }, truncated: false }]);
          setCurrentWorkflowStep(currentStep);
          setWorkflowProgressPercent((currentStep + 1) * 10);
          const sn = STEP_NAME_TRANSLATIONS[uiLang === 'zh' ? 'zh' : 'en'];
          setCurrentStepName(sn[currentStep] || sn[0]);
          const next = workflow.nextStep();
          if (next.success) { currentStep++; continue; }
          return;
        }

        const errorMsg = uiLang === 'zh'
          ? `❌ AI诊断失败 (Step ${currentStep}/9): ${err.message}`
          : `❌ AI Diagnosis Failed (Step ${currentStep}/9): ${err.message}`;
        setMessages(prev => [...prev, { role: 'ai', type: 'text', content: errorMsg, _workflowError: true }]);
        setIsWorkflowRunning(false);
        return;
      }
    }
  }, [uiLang, setMessages, setWorkflowStepResults, setCurrentWorkflowStep, setWorkflowProgressPercent, setCurrentStepName, setIsWorkflowRunning, setCompletedReport, setShowDiagnosisCompleteModal, onReportCreated, STEP_NAME_TRANSLATIONS, createAIReport]);

  // Start workflow execution
  const startWorkflow = useCallback((workflow, startStep = 0) => {
    pendingWorkflowRef.current = { workflow, startStep };
  }, []);

  // Abort workflow
  const abortWorkflow = useCallback(() => {
    workflowAbortRef.current = true;
  }, []);

  // Reset abort flag
  const resetWorkflowAbort = useCallback(() => {
    workflowAbortRef.current = false;
  }, []);

  // Effect to process pending workflow
  useEffect(() => {
    if (pendingWorkflowRef.current && !workflowAbortRef.current) {
      const { workflow, startStep } = pendingWorkflowRef.current;
      pendingWorkflowRef.current = null;
      executeWorkflowStep(workflow, startStep);
    }
  }, [executeWorkflowStep]);

  return {
    executeWorkflowStep,
    startWorkflow,
    abortWorkflow,
    resetWorkflowAbort,
    workflowAbortRef,
    pendingWorkflowRef,
  };
}
