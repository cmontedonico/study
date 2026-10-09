/**
 * iOS Safari/PWA does not shrink the layout viewport (nor `dvh`) when the software keyboard opens, so a
 * `h-dvh` chat leaves the input hidden behind it. The visual viewport does shrink: expose it as
 * `--app-height` (consumed in index.css) and undo the page scroll iOS applies to reveal the field.
 */
export function trackVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    document.documentElement.style.setProperty("--app-height", `${vv.height}px`);
    if (vv.height < window.innerHeight) window.scrollTo(0, 0);
  };
  update();
  vv.addEventListener("resize", update);
}
