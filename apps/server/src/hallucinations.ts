/** Whisper invents stock phrases from its training subtitles when it hears silence or noise. */
const STOCK_PHRASES: RegExp[] = [
  /subt[ií]tulos?\b.*\b(realizados?|creados?|por|de|en)\b/i,
  /traducido (y )?(subtitulado )?por/i,
  /amara\.org/i,
  /gracias por (ver|mirar|vernos|su atenci[oó]n)/i,
  /(suscr[ií]bete|no olvides suscribirte|dale (a )?like)/i,
  /thanks? for (watching|listening)/i,
  /(please )?subscribe to/i,
  /subtitles? by/i,
  /^\W*(m[uú]sica|music|aplausos|applause|silencio|risas)\W*$/i,
  /^\W*(gracias|thank you|you|bye|adi[oó]s)\W*$/i,
  /sous-titr/i,
  /^[\s♪♫\-–—.…]*$/,
];

/** The same word repeated many times in a row is a decoder loop, not speech. */
function collapseLoops(text: string): string {
  return text.replace(/(?<![\p{L}'])([\p{L}']+)(?:[\s,.]+\1(?![\p{L}'])){5,}/giu, "$1");
}

/**
 * Cleans a live-dictation segment: drops sentences that match known hallucinations and collapses loops.
 * Only meant for short segments, where a lone "Gracias." is far more likely noise than something said.
 */
export function filterHallucinations(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (STOCK_PHRASES.some((re) => re.test(trimmed))) {
    // A whole-segment match (e.g. "Gracias.") is dropped; otherwise only the offending sentences are.
    const sentences = trimmed.match(/.+?(?:[.!?…]+(?=\s|$)|$)\s*/gs) ?? [trimmed];
    const kept = sentences.filter((s) => !STOCK_PHRASES.some((re) => re.test(s.trim())));
    return collapseLoops(kept.join("").trim());
  }
  return collapseLoops(trimmed);
}
