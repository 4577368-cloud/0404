When using Tailwind CSS
- Do not use opacity modifiers (e.g., `/20`) with CSS variables in arbitrary values (e.g., `bg-[var(--color)]/20`). Tailwind cannot parse the variable as a color to apply opacity.
- Instead, use explicit `rgba()` or `hsla()` values, or `color-mix()` if browser support allows, or define the color with opacity in the variable itself if needed.
- For this project, use `rgba(22,93,255,0.2)` for the primary color ring with 20% opacity.