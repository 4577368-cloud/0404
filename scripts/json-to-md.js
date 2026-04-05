#!/usr/bin/env node
/**
 * Convert knowledgeBase JSON to Markdown (Questions & Answers only)
 */

const fs = require('fs');
const path = require('path');

function jsonToMarkdown(jsonPath, outputPath) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  
  let md = `# ${data.meta?.description || 'Knowledge Base'}\n\n`;
  md += `> Version: ${data.meta?.version || 'N/A'}  \n`;
  md += `> Last Updated: ${data.meta?.last_updated || 'N/A'}\n\n`;
  md += `---\n\n`;

  // Extract all QA pairs from categories
  const categories = data.categories || [];
  
  categories.forEach((category, catIndex) => {
    md += `## ${catIndex + 1}. ${category.name}\n\n`;
    
    const scenes = category.scenes || [];
    scenes.forEach((scene, sceneIndex) => {
      md += `### ${scene.name}\n\n`;
      
      const qaPairs = scene.qa_pairs || [];
      qaPairs.forEach((qa, qaIndex) => {
        // Use the first question as the main question
        const mainQuestion = qa.questions?.[0] || 'Question';
        const allQuestions = qa.questions || [];
        const answer = qa.answer_template || '';
        
        md += `**Q${qaIndex + 1}: ${mainQuestion}**\n\n`;
        
        // If there are alternative ways to ask, list them
        if (allQuestions.length > 1) {
          md += `*其他问法：*\n`;
          allQuestions.slice(1).forEach((q, i) => {
            md += `- ${q}\n`;
          });
          md += `\n`;
        }
        
        md += `**A:** ${answer.replace(/\n/g, '\n')}\n\n`;
        md += `---\n\n`;
      });
    });
  });

  // Add global fallbacks at the end
  md += `## 其他回复\n\n`;
  
  if (data.global_fallbacks) {
    if (data.global_fallbacks.unknown_question) {
      md += `### 未知问题回复\n\n`;
      md += `${data.global_fallbacks.unknown_question}\n\n`;
    }
    if (data.global_fallbacks.escalate_to_human) {
      md += `### 转人工回复\n\n`;
      md += `${data.global_fallbacks.escalate_to_human}\n\n`;
    }
  }

  fs.writeFileSync(outputPath, md, 'utf8');
  console.log(`✅ Converted to: ${outputPath}`);
  console.log(`📊 Categories: ${categories.length}`);
  
  // Count total QA pairs
  let totalQA = 0;
  categories.forEach(cat => {
    (cat.scenes || []).forEach(scene => {
      totalQA += (scene.qa_pairs || []).length;
    });
  });
  console.log(`❓ Total Q&A pairs: ${totalQA}`);
}

// Main
const inputFile = process.argv[2] || './public/data/knowledgeBase_CN.json';
const outputFile = process.argv[3] || './public/data/knowledgeBase_CN.md';

try {
  jsonToMarkdown(inputFile, outputFile);
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
