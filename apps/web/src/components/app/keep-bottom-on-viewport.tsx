import { useEffect, useRef } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";

/**
 * When the visual viewport resizes (iOS keyboard, rotation) the scroller shrinks without any content change, which
 * use-stick-to-bottom does not treat as a reason to re-stick. Keep the end of the chat in view, unless the user
 * had scrolled up. "Was at the bottom" is tracked from scroll events because by the time `resize` fires the
 * new layout would already make the gap look bigger.
 */
export function KeepBottomOnViewportResize() {
  const { scrollRef, scrollToBottom } = useStickToBottomContext();
  const atBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;
    const measure = () => {
      atBottom.current = el.scrollHeight - el.clientHeight - el.scrollTop <= 8;
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    let frame = 0;
    const onResize = () => {
      if (!atBottom.current) return;
      cancelAnimationFrame(frame);
      // After layout, so the new clientHeight is in place.
      frame = requestAnimationFrame(() => void scrollToBottom({ animation: "instant" }));
    };
    vv.addEventListener("resize", onResize);
    return () => {
      el.removeEventListener("scroll", measure);
      vv.removeEventListener("resize", onResize);
      cancelAnimationFrame(frame);
    };
  }, [scrollRef, scrollToBottom]);

  return null;
}
