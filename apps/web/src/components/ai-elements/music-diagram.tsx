"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { layoutChord, parseChordBlock } from "@/lib/chord-block";
import type { ChordSpec } from "@/lib/chord-block";

// Custom fenced-block renderers for the guitar tutor (```chord, ```abc). Registered in streamdown-renderer.tsx as
// part of `plugins.renderers`; other features add their own arrays the same way (language -> component).
// Diagrams are drawn in black on transparent and inverted in dark mode, so they follow the app theme.

function Fallback({ code, language, error }: { code: string; language: string; error?: string }) {
  return (
    <div className="my-4 overflow-hidden rounded-xl border bg-muted/30">
      {error && <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">No se pudo dibujar: {error}</p>}
      <pre className="overflow-x-auto p-3 text-xs" data-language={language}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ChordDiagram({ spec }: { spec: ChordSpec }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const host = ref.current;
    if (!host) return;
    void import("svguitar").then(({ SVGuitarChord }) => {
      if (cancelled) return;
      host.replaceChildren();
      const l = layoutChord(spec);
      new SVGuitarChord(host)
        .configure({
          strings: spec.frets.length,
          frets: l.frets,
          position: l.position,
          title: spec.name,
          noPosition: l.position === 1,
          color: "#000",
          backgroundColor: "transparent",
          fingerTextColor: "#fff",
          tuning: spec.frets.length === 6 ? ["E", "A", "D", "G", "B", "E"] : undefined,
          fontFamily: "inherit",
        })
        .chord({
          fingers: l.fingers.map(([s, f, text]) => (text ? [s, f, text] : [s, f])),
          barres: l.barres,
        })
        .draw();
      host.querySelector("svg")?.removeAttribute("height");
    });
    return () => {
      cancelled = true;
    };
  }, [spec]);
  return <div ref={ref} className="w-36 shrink-0 dark:invert sm:w-40 [&_svg]:h-auto [&_svg]:w-full" />;
}

interface BlockProps {
  code: string;
  isIncomplete: boolean;
  language: string;
}

function ChordRenderer({ code, isIncomplete, language }: BlockProps) {
  const parsed = useMemo(() => (isIncomplete ? null : parseChordBlock(code)), [code, isIncomplete]);
  if (!parsed) return <Fallback code={code} language={language} />;
  if (!parsed.ok) return <Fallback code={code} language={language} error={parsed.error} />;
  return (
    <div className="my-4 flex flex-wrap gap-4 rounded-xl border bg-background p-3" role="group" aria-label="Diagramas de acordes">
      {parsed.chords.map((spec, i) => (
        <ChordDiagram key={i} spec={spec} />
      ))}
    </div>
  );
}

// Optional first-line directive: "%%tab" adds a guitar tablature under the staff.
function splitAbc(code: string) {
  let tab = false;
  const body = code
    .split(/\r?\n/)
    .filter((line) => {
      if (/^%%tab\b/i.test(line.trim())) {
        tab = true;
        return false;
      }
      return true;
    })
    .join("\n");
  return { tab, body };
}

function AbcScore({ code, language }: { code: string; language: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    const host = ref.current;
    if (!host) return;
    void import("abcjs").then(({ renderAbc }) => {
      if (cancelled) return;
      const { tab, body } = splitAbc(code);
      host.replaceChildren();
      try {
        const tunes = renderAbc(host, body, {
          responsive: "resize",
          add_classes: false,
          ...(tab ? { tablature: [{ instrument: "guitar" }] } : {}),
        });
        const ok = tunes.some((t) => t.lines && t.lines.length > 0) && host.querySelector("svg");
        setError(ok ? undefined : "notación ABC no válida");
      } catch (e) {
        setError(e instanceof Error ? e.message : "notación ABC no válida");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code]);
  return (
    <>
      <div
        ref={ref}
        className={error ? "hidden" : "my-4 overflow-x-auto rounded-xl border bg-background p-3 dark:invert [&_svg]:h-auto [&_svg]:w-full"}
      />
      {error && <Fallback code={code} language={language} error={error} />}
    </>
  );
}

function AbcRenderer({ code, isIncomplete, language }: BlockProps) {
  if (isIncomplete) return <Fallback code={code} language={language} />;
  return <AbcScore code={code} language={language} />;
}

export default function MusicDiagram({ kind, code, isIncomplete }: { kind: "chord" | "abc"; code: string; isIncomplete: boolean }) {
  return kind === "chord" ? (
    <ChordRenderer code={code} isIncomplete={isIncomplete} language={kind} />
  ) : (
    <AbcRenderer code={code} isIncomplete={isIncomplete} language={kind} />
  );
}
