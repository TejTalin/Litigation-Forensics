import { useEffect, useRef } from 'react';

/**
 * Custom cursor: a small brass dot that follows the mouse with easing,
 * and a larger ring that lags behind. Both scale up on interactive
 * elements (buttons, a, [data-cursor]). Respects prefers-reduced-motion.
 */
export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ dx: 0, dy: 0, rx: 0, ry: 0, tx: 0, ty: 0 });
  const rafRef = useRef<number>(0);
  const hoveringRef = useRef(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Only enable on devices with a fine pointer
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    dot.style.opacity = '1';
    ring.style.opacity = '1';

    function handleMove(e: MouseEvent) {
      posRef.current.tx = e.clientX;
      posRef.current.ty = e.clientY;
    }

    function handleDown() {
      if (ring) ring.style.transform = `translate(${posRef.current.rx}px, ${posRef.current.ry}px) scale(0.8)`;
    }

    function handleUp() {
      if (ring) ring.style.transform = `translate(${posRef.current.rx}px, ${posRef.current.ry}px) scale(${hoveringRef.current ? 1.6 : 1})`;
    }

    function handleOver(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('button, a, [data-cursor], input, .group')) {
        hoveringRef.current = true;
      } else {
        hoveringRef.current = false;
      }
    }

    function animate() {
      posRef.current.dx += (posRef.current.tx - posRef.current.dx) * 0.5;
      posRef.current.dy += (posRef.current.ty - posRef.current.dy) * 0.5;
      posRef.current.rx += (posRef.current.tx - posRef.current.rx) * 0.12;
      posRef.current.ry += (posRef.current.ty - posRef.current.ry) * 0.12;

      if (dot) {
        dot.style.transform = `translate(${posRef.current.dx}px, ${posRef.current.dy}px)`;
      }
      if (ring) {
        const scale = hoveringRef.current ? 1.6 : 1;
        ring.style.transform = `translate(${posRef.current.rx}px, ${posRef.current.ry}px) scale(${scale})`;
        ring.style.borderColor = hoveringRef.current ? 'var(--accent-bright)' : 'var(--accent)';
      }

      rafRef.current = requestAnimationFrame(animate);
    }

    animate();

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mousedown', handleDown);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('mouseover', handleOver);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mousedown', handleDown);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('mouseover', handleOver);
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        className="fixed top-0 left-0 pointer-events-none"
        style={{
          zIndex: 99999,
          width: 6,
          height: 6,
          marginLeft: -3,
          marginTop: -3,
          borderRadius: '50%',
          background: 'var(--accent-bright)',
          opacity: 0,
          willChange: 'transform',
        }}
        aria-hidden="true"
      />
      <div
        ref={ringRef}
        className="fixed top-0 left-0 pointer-events-none"
        style={{
          zIndex: 99998,
          width: 32,
          height: 32,
          marginLeft: -16,
          marginTop: -16,
          borderRadius: '50%',
          border: '1.5px solid var(--accent)',
          opacity: 0,
          transition: 'border-color 0.2s ease, width 0.2s ease, height 0.2s ease',
          willChange: 'transform',
        }}
        aria-hidden="true"
      />
    </>
  );
}
