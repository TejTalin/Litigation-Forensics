import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Wraps children with a key-based enter animation.
 * When `viewKey` changes, the old content fades/slides out and the new
 * content fades/slides in. Uses a simple two-phase CSS transition.
 */
interface PageTransitionProps {
  viewKey: string;
  children: ReactNode;
}

export function PageTransition({ viewKey, children }: PageTransitionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevKeyRef = useRef<string>(viewKey);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (prevKeyRef.current !== viewKey) {
      // Fade out then fade in
      el.style.transition = 'opacity 0.15s ease-out, transform 0.15s ease-out';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      const timeout = setTimeout(() => {
        el.style.transition = 'opacity 0.35s ease-out, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        prevKeyRef.current = viewKey;
      }, 150);
      return () => clearTimeout(timeout);
    } else {
      // Initial mount
      el.style.transition = 'opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
      el.style.opacity = '0';
      el.style.transform = 'translateY(12px)';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        });
      });
    }
  }, [viewKey]);

  return (
    <div ref={containerRef} style={{ opacity: 0 }}>
      {children}
    </div>
  );
}
