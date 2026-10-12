import { useEffect, useState } from "react";

// Shown from the moment a message is sent until the first visible assistant text arrives.
// Mounted once for the whole wait so there is no flicker between `submitted` and `streaming`.
export function ThinkingIndicator() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 py-1 text-sm">
      <span className="thinking-shimmer">Pensando</span>
      <span aria-hidden className="flex gap-0.5 text-muted-foreground">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="thinking-dot size-1 rounded-full bg-current"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </span>
      {seconds >= 10 && <span className="text-xs tabular-nums text-muted-foreground">{seconds} s</span>}
    </div>
  );
}
