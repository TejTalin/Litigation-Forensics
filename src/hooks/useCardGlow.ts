import { useCallback } from 'react';

/**
 * Returns a mousemove handler that sets CSS custom properties --gx / --gy
 * on the hovered element, so the .card-glow::before radial gradient
 * follows the cursor. Call in onMouseMove on any .card-glow element.
 */
export function useCardGlow() {
  return useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--gx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--gy', `${e.clientY - rect.top}px`);
  }, []);
}
