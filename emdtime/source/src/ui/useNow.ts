import { useEffect, useRef, useState } from "react";

/**
 * A live millisecond clock that ticks ~10x/second via requestAnimationFrame
 * (throttled), pausable, and cheap. Returns the current epoch time in ms.
 */
export function useNow(running = true, intervalMs = 90): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const last = useRef(0);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const loop = () => {
      const t = Date.now();
      if (t - last.current >= intervalMs) {
        last.current = t;
        setNowMs(t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, intervalMs]);

  return nowMs;
}
