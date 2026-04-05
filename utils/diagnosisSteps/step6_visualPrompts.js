/**
 * Step 6: Visual Creative Prompts — AI image/video prompts, color scheme, platform specs
 */

export const step_6_visual_prompts = `
[Role] Cross-border e-commerce product launch strategist — Visual Creative Prompts (Step 6/9)

Based on the recommended concept from Step 5, generate actionable visual prompts for AI image and video generation.

## Target market: {{TARGET_COUNTRIES}} | Audience: {{TARGET_AGES}}

## Tasks

1. **Hero image prompts** (3 sets): Each includes subject, scene, lighting, photography style, technical specs (lens, depth of field). Label usage (hero image / detail page / social post / ad creative).

2. **Video hook prompts** (3 sets): Each includes hook type (curiosity/conflict/empathy/demo), visual direction, opening scene (first 1-3 seconds), middle development, closing CTA, music mood, text overlay suggestion.

3. **Lifestyle scene prompts** (3 sets): Depict target persona using the product in a realistic setting — natural lighting, real environment, natural expressions.

4. **Product detail prompts** (2 sets): Close-up angles focusing on material texture, function demo, size comparison, or packaging design.

5. **Color scheme**: Primary color, secondary color, accent color with hex values. Rationale matching target audience preferences (young → vibrant, family → warm, professional → muted).

6. **Platform specs adaptation**:
   - TikTok: Vertical 9:16, hook in first 1 second, fast pace
   - Amazon: White background hero, product 85%+ frame, no text overlay
   - Instagram: Consistent color tone, lifestyle scenes, square or 4:5

## Rules
- Prompts must be specific and directly usable in Midjourney / Stable Diffusion / Runway.
- Visual direction must align with the recommended concept's brand tone from Step 5.

## Output format (strict JSON)
{
  "step": 6,
  "hero_prompts": [
    { "usage": "Hero/Detail/Social/Ad", "prompt": "Full AI generation prompt", "style_notes": "Style notes" }
  ],
  "video_hooks": [
    { "hook_type": "Curiosity/Conflict/Empathy/Demo", "visual_direction": "Visual direction", "opening_scene": "First 1-3 seconds", "middle": "Middle development", "cta": "Closing CTA", "music_mood": "Music mood", "text_overlay": "Text overlay suggestion" }
  ],
  "lifestyle_scenes": [
    { "scene": "Scene name", "prompt": "Full prompt", "authenticity_notes": "Realism elements" }
  ],
  "detail_prompts": [
    { "focus": "Material/Function/Size/Packaging", "prompt": "Full prompt" }
  ],
  "color_scheme": {
    "primary": "Primary color and hex",
    "secondary": "Secondary color and hex",
    "accent": "Accent color and hex",
    "rationale": "Color choice rationale"
  },
  "platform_specs": {
    "tiktok": "TikTok visual specs",
    "amazon": "Amazon hero image specs",
    "instagram": "Instagram visual specs"
  },
  "summary": "Visual direction core summary",
  "next_step_ready": true
}
`;

export const step_6_name = '视觉创意提示';
export const step_6_name_en = 'Visual Creative Prompts';
