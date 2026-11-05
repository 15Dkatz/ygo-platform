import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface Props {
  count: number;
  heightOf: (index: number) => number;
  render: (index: number) => ReactNode;
  /** Extra pixels rendered above and below the viewport. */
  overscan?: number;
  className?: string;
}

/**
 * Window-scrolled virtual list: only rows near the viewport are in the DOM, so 9k cards stay
 * fast. Rows have known heights (`heightOf`), positioned absolutely inside a full-height box.
 */
export function VirtualRows({ count, heightOf, render, overscan = 800, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const offsets = useMemo(() => {
    const o = new Float64Array(count + 1);
    for (let i = 0; i < count; i++) o[i + 1] = o[i] + heightOf(i);
    return o;
  }, [count, heightOf]);
  const total = offsets[count];
  const [range, setRange] = useState<[number, number]>([0, Math.min(count, 40)]);

  const find = (y: number) => {
    let lo = 0, hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid + 1] <= y) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const update = () => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const start = find(Math.max(0, -top - overscan));
    const end = Math.min(count, find(Math.max(0, -top + window.innerHeight + overscan)) + 1);
    setRange((r) => (r[0] === start && r[1] === end ? r : [start, end]));
  };

  useLayoutEffect(update);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  });

  const rows: ReactNode[] = [];
  for (let i = range[0]; i < Math.min(range[1], count); i++) {
    rows.push(
      <div key={i} className="vrow" style={{ position: "absolute", left: 0, right: 0, top: offsets[i], height: heightOf(i) }}>
        {render(i)}
      </div>,
    );
  }
  return (
    <div ref={ref} className={className} style={{ position: "relative", height: total }}>
      {rows}
    </div>
  );
}
