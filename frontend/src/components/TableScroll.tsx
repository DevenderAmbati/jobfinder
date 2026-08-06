import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Table scroller with sticky header support and a hint only when
 * horizontal overflow actually exists.
 */
export function TableScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollX, setCanScrollX] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    const update = () => {
      setCanScrollX(el.scrollWidth > el.clientWidth + 2);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [children]);

  return (
    <div
      ref={ref}
      className={['table-wrap', canScrollX ? 'is-scrollable-x' : ''].join(' ')}
    >
      {children}
    </div>
  );
}
