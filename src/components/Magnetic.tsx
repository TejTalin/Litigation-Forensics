import { useRef, type ReactNode } from 'react';

interface MagneticProps {
  children: ReactNode;
  className?: string;
  strength?: number;
  onClick?: () => void;
}

export function Magnetic({ children, className = '', strength = 0.3, onClick }: MagneticProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - (rect.left + rect.width / 2);
    const y = e.clientY - (rect.top + rect.height / 2);
    el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
  }

  function handleMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'translate(0, 0)';
    el.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
    setTimeout(() => {
      if (el) el.style.transition = '';
    }, 400);
  }

  function handleMouseEnter() {
    const el = ref.current;
    if (!el) return;
    el.style.transition = '';
  }

  return (
    <div
      ref={ref}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{ willChange: 'transform' }}
    >
      {children}
    </div>
  );
}
