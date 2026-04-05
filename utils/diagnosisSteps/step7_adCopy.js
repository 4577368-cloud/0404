/**
 * Step 7: Ad Copy Kit — core messaging, headlines, body copy, CTAs, platform adaptation
 */

export const step_7_ad_copy = `
[Role] Cross-border e-commerce product launch strategist — Ad Copy Kit (Step 7/9)

Based on the recommended concept from Step 5 and visual direction from Step 6, generate a multi-platform ad copy system.

## Target market: {{TARGET_COUNTRIES}} | Audience: {{TARGET_AGES}} | Traits: {{TARGET_CHARACTERISTICS}}

## Tasks

1. **Core messaging**: Big Idea, Core Promise, Proof Points.

2. **Headlines** (2-3 variants per type):
   - Curiosity: Sparks desire to know more
   - Scarcity: Creates urgency
   - Social proof: Leverages herd mentality
   - Pain-point: Directly addresses core pain
   - Benefit: Clearly promises value
   - Urgency: Limited-time/quantity
   Label each with use case and target emotion.

3. **Body copy** (3 versions):
   - Short (50-100 words): For TikTok, Stories
   - Medium (150-300 words): For Instagram Feed, Facebook
   - Long (500+ words): For detail pages, email
   Note the copywriting structure (Pain→Solution, AIDA, Feature→Advantage→Benefit), targeted pain point, and emphasized benefit.

4. **CTAs**: Action verb + Value restatement + Urgency element. Provide 5-8 variants with suggested button styles.

5. **Hashtags**: Grouped by Brand, Category, Trending, Community, Campaign — 5-10 per group.

6. **Platform-adapted copy**:
   - TikTok: Casual and conversational, 50-150 characters, 3-5 hashtags
   - Instagram: Lifestyle feel, first paragraph grabs within 125 characters, hashtags in comments
   - Facebook: Clear value proposition, headline 40-80 characters, explicit CTA

7. **A/B test plan**: 2-3 test schemes with test variable, control group, success metric, priority.

8. **Copy guidelines**: Brand voice traits, language style, cultural adaptation notes, forbidden words list.

## Rules
- Copy language MUST match the target market's local language conventions; avoid literal translations.
- All copy must align with the brand tone from Steps 5-6.

## Output format (strict JSON)
{
  "step": 7,
  "core_message": {
    "big_idea": "Big idea",
    "core_promise": "Core promise",
    "proof_points": ["Proof points"]
  },
  "headlines": [
    { "type": "Curiosity/Scarcity/Social-proof/Pain-point/Benefit/Urgency", "text": "Headline copy", "use_case": "Use case", "target_emotion": "Target emotion" }
  ],
  "body_copy": [
    { "length": "Short/Medium/Long", "structure": "Copywriting structure", "text": "Full body copy", "pain_point": "Targeted pain point", "benefit": "Emphasized benefit" }
  ],
  "ctas": [
    { "text": "CTA copy", "button_style": "Button style suggestion" }
  ],
  "hashtags": {
    "brand": ["Brand tags"],
    "category": ["Category tags"],
    "trending": ["Trending tags"],
    "community": ["Community tags"],
    "campaign": ["Campaign tags"]
  },
  "platform_copy": {
    "tiktok": "TikTok copy",
    "instagram": "Instagram copy",
    "facebook": "Facebook copy"
  },
  "ab_test_plan": [
    { "test_name": "Test name", "variable": "Test variable", "control": "Control group", "success_metric": "Success metric", "priority": "Priority" }
  ],
  "copy_guidelines": {
    "brand_voice": "Brand voice traits",
    "style": "Language style",
    "cultural_notes": "Cultural adaptation notes",
    "forbidden_words": ["Forbidden words"]
  },
  "summary": "Copy system core summary",
  "next_step_ready": true
}
`;

export const step_7_name = '广告文案套件';
export const step_7_name_en = 'Ad Copy Kit';
