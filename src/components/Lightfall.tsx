import { useEffect, useRef } from 'react';

/**
 * Lightfall — a lightweight canvas-based flowing light background.
 * Dependency-free (no WebGL/ogl), respects prefers-reduced-motion.
 */
export function Lightfall() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const colors = [
      'rgba(194, 154, 79, 0.10)',  // brass
      'rgba(139, 26, 47, 0.12)',   // oxblood
      'rgba(160, 128, 64, 0.08)',  // node-line brass
    ];

    let width = 0;
    let height = 0;
    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const blobs = colors.map((color, i) => ({
      color,
      x: Math.random(),
      y: Math.random(),
      r: 0.35 + i * 0.1,
      speedX: (Math.random() - 0.5) * 0.00012,
      speedY: (Math.random() - 0.5) * 0.00012,
    }));

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const b of blobs) {
        if (!reduceMotion) {
          b.x += b.speedX;
          b.y += b.speedY;
          if (b.x < -0.2 || b.x > 1.2) b.speedX *= -1;
          if (b.y < -0.2 || b.y > 1.2) b.speedY *= -1;
        }
        const cx = b.x * width;
        const cy = b.y * height;
        const r = b.r * Math.max(width, height);
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        gradient.addColorStop(0, b.color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }
      raf = reduceMotion ? 0 : requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: -1, opacity: 0.82 }}
      aria-hidden="true"
    />
  );
}
