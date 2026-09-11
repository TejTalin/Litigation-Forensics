import { useEffect, useRef } from 'react';

/**
 * Ambient animated background with three layers:
 * 1. Slow-drifting particle constellation (always animating, no cursor needed)
 * 2. Large brass radial glow that follows the cursor with easing
 * 3. Two large soft blob gradients that slowly drift (parallax-ish depth)
 *
 * All three layers animate continuously even with zero cursor input.
 * Respects prefers-reduced-motion.
 */
export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const blob1Ref = useRef<HTMLDivElement>(null);
  const blob2Ref = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const particlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; r: number; alpha: number; pulse: number; pulseSpeed: number }>>([]);
  const mouseRef = useRef<{ x: number; y: number; tx: number; ty: number }>({ x: 0, y: 0, tx: 0, ty: 0 });
  const reducedRef = useRef<boolean>(false);
  const timeRef = useRef<number>(0);

  useEffect(() => {
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();

    const count = reducedRef.current ? 0 : 55;
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 2.2 + 0.6,
      alpha: Math.random() * 0.25 + 0.08,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: Math.random() * 0.02 + 0.005,
    }));

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      timeRef.current += 1;

      const particles = particlesRef.current;
      // mouse easing
      mouseRef.current.x += (mouseRef.current.tx - mouseRef.current.x) * 0.06;
      mouseRef.current.y += (mouseRef.current.ty - mouseRef.current.y) * 0.06;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;

        if (p.x < -20) p.x = canvas.width + 20;
        if (p.x > canvas.width + 20) p.x = -20;
        if (p.y < -20) p.y = canvas.height + 20;
        if (p.y > canvas.height + 20) p.y = -20;

        // Mouse repulsion — particles gently push away from cursor
        const mdx = p.x - mouseRef.current.x;
        const mdy = p.y - mouseRef.current.y;
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mdist < 120 && mdist > 0) {
          const force = (120 - mdist) / 120 * 0.5;
          p.x += (mdx / mdist) * force;
          p.y += (mdy / mdist) * force;
        }

        const pulseAlpha = p.alpha * (0.6 + Math.sin(p.pulse) * 0.4);
        const pulseR = p.r * (0.8 + Math.sin(p.pulse) * 0.2);

        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(194, 154, 79, ${pulseAlpha})`;
        ctx.fill();

        // connect to nearby
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const lineAlpha = (1 - dist / 150) * 0.12;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(194, 154, 79, ${lineAlpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    }

    if (!reducedRef.current) {
      draw();
    }

    // Blob drift animation via JS for smooth continuous motion
    let blobAngle = 0;
    function animateBlobs() {
      blobAngle += 0.003;
      if (blob1Ref.current) {
        const x = Math.sin(blobAngle) * 60;
        const y = Math.cos(blobAngle * 0.7) * 40;
        blob1Ref.current.style.transform = `translate(${x}px, ${y}px)`;
      }
      if (blob2Ref.current) {
        const x = Math.cos(blobAngle * 0.8) * 80;
        const y = Math.sin(blobAngle * 0.5) * 50;
        blob2Ref.current.style.transform = `translate(${x}px, ${y}px)`;
      }
      if (!reducedRef.current) requestAnimationFrame(animateBlobs);
    }
    if (!reducedRef.current) animateBlobs();

    function handleMouse(e: MouseEvent) {
      mouseRef.current.tx = e.clientX;
      mouseRef.current.ty = e.clientY;
      if (glowRef.current && !reducedRef.current) {
        glowRef.current.style.left = e.clientX + 'px';
        glowRef.current.style.top = e.clientY + 'px';
        glowRef.current.style.opacity = '1';
      }
    }

    function handleMouseLeave() {
      if (glowRef.current) glowRef.current.style.opacity = '0';
    }

    function handleResize() {
      resize();
    }

    window.addEventListener('mousemove', handleMouse);
    window.addEventListener('resize', handleResize);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('mousemove', handleMouse);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <>
      {/* Layer 3: drifting blob gradients */}
      <div
        ref={blob1Ref}
        className="fixed pointer-events-none"
        style={{
          zIndex: 0,
          top: '10%',
          left: '20%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--accent) 0%, transparent 65%)',
          opacity: 0.04,
          filter: 'blur(40px)',
          willChange: 'transform',
        }}
        aria-hidden="true"
      />
      <div
        ref={blob2Ref}
        className="fixed pointer-events-none"
        style={{
          zIndex: 0,
          bottom: '5%',
          right: '10%',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--oxblood) 0%, transparent 65%)',
          opacity: 0.05,
          filter: 'blur(50px)',
          willChange: 'transform',
        }}
        aria-hidden="true"
      />

      {/* Layer 1: particle constellation */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      />

      {/* Layer 2: cursor-following glow */}
      <div
        ref={glowRef}
        className="fixed pointer-events-none"
        style={{
          zIndex: 0,
          width: 500,
          height: 500,
          marginLeft: -250,
          marginTop: -250,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(194,154,79,0.1) 0%, rgba(194,154,79,0.03) 30%, transparent 70%)',
          opacity: 0,
          mixBlendMode: 'screen',
          transition: 'opacity 0.4s ease',
          willChange: 'left, top',
        }}
        aria-hidden="true"
      />
    </>
  );
}
