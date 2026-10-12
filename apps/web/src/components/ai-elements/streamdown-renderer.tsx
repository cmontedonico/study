"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { Suspense, lazy, type ComponentProps } from "react";
import { Streamdown } from "streamdown";
import "katex/dist/katex.min.css";

// Heavy markdown stack (shiki, katex, mermaid, cjk): kept in its own lazily loaded chunk, see message.tsx.
// The chessboard (react-chessboard + chess.js) is a further lazy chunk, only fetched when a message has a diagram.
const ChessDiagramBlock = lazy(() => import("./chess-diagram"));
// Guitar tutor: ```chord (svguitar) and ```abc (abcjs, staff + optional tab) are their own lazy chunk too.
const MusicDiagramBlock = lazy(() => import("./music-diagram"));

function CodeFallback({ code }: { code: string }) {
  return (
    <pre className="my-3 overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
      <code>{code}</code>
    </pre>
  );
}

function chessRenderer(kind: "fen" | "pgn") {
  return function ChessRenderer({ code, isIncomplete }: { code: string; isIncomplete: boolean }) {
    return (
      <Suspense fallback={<CodeFallback code={code} />}>
        <ChessDiagramBlock kind={kind} code={code} isIncomplete={isIncomplete} />
      </Suspense>
    );
  };
}

function musicRenderer(kind: "chord" | "abc") {
  return function MusicRenderer({ code, isIncomplete }: { code: string; isIncomplete: boolean }) {
    return (
      <Suspense fallback={<CodeFallback code={code} />}>
        <MusicDiagramBlock kind={kind} code={code} isIncomplete={isIncomplete} />
      </Suspense>
    );
  };
}

// Registry of custom fenced blocks: language -> component.
const renderers = [
  { language: "fen", component: chessRenderer("fen") },
  { language: "pgn", component: chessRenderer("pgn") },
  { language: "chord", component: musicRenderer("chord") },
  { language: ["abc", "abcjs"], component: musicRenderer("abc") },
];
const plugins = { cjk, code, math, mermaid, renderers };

export default function StreamdownRenderer(props: ComponentProps<typeof Streamdown>) {
  return <Streamdown plugins={plugins} {...props} />;
}
