"use client";

import { Button } from "@/components/ui/button";
import { moveLabel, parseChessBlock, sanToSpanish, type ChessDiagram } from "@/lib/chess-block";
import { cn } from "@/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";

// Same palette as chessboard.js, so the diagrams keep its familiar look.
const LIGHT = "#f0d9b5";
const DARK = "#b58863";
const LAST_MOVE = { backgroundColor: "rgba(255, 213, 0, 0.45)" };

function Board({ diagram, step }: { diagram: ChessDiagram; step: number }) {
  const current = diagram.steps[step];
  // Arrows annotate the position they were written for: the last one of the block.
  const arrows = step === diagram.steps.length - 1 ? diagram.arrows : [];
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (current.from && current.to) {
    squareStyles[current.from] = LAST_MOVE;
    squareStyles[current.to] = LAST_MOVE;
  }
  return (
    <Chessboard
      options={{
        position: current.fen,
        boardOrientation: diagram.orientation,
        allowDragging: false,
        allowDrawingArrows: false,
        animationDurationInMs: 150,
        lightSquareStyle: { backgroundColor: LIGHT },
        darkSquareStyle: { backgroundColor: DARK },
        boardStyle: { borderRadius: 4, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.3)" },
        squareStyles,
        arrows: arrows.map((a) => ({ startSquare: a.from, endSquare: a.to, color: "rgba(34, 139, 34, 0.8)" })),
      }}
    />
  );
}

function PgnControls({ diagram, step, setStep }: { diagram: ChessDiagram; step: number; setStep: (n: number) => void }) {
  const last = diagram.steps.length - 1;
  const startFen = diagram.steps[0].fen;
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep the current move visible in the scrollable list.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [step]);

  const nav = [
    { label: "Inicio", icon: ChevronsLeftIcon, to: 0, off: step === 0 },
    { label: "Jugada anterior", icon: ChevronLeftIcon, to: step - 1, off: step === 0 },
    { label: "Jugada siguiente", icon: ChevronRightIcon, to: step + 1, off: step === last },
    { label: "Final", icon: ChevronsRightIcon, to: last, off: step === last },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {nav.map(({ label, icon: Icon, to, off }) => (
            <Button
              key={label}
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={label}
              title={label}
              disabled={off}
              onClick={() => setStep(to)}
            >
              <Icon />
            </Button>
          ))}
        </div>
        <span className="font-mono text-sm font-medium tabular-nums">
          {step === 0 ? "Posición inicial" : moveLabel(step, startFen, diagram.steps[step].san ?? "")}
        </span>
      </div>
      <div className="flex max-h-24 flex-wrap gap-x-1 gap-y-0.5 overflow-y-auto font-mono text-xs">
        {diagram.steps.slice(1).map((s, i) => {
          const index = i + 1;
          const ply = i + (startFen.split(" ")[1] === "b" ? 1 : 0);
          return (
            <span key={index} className="inline-flex items-center gap-0.5">
              {ply % 2 === 0 && <span className="text-muted-foreground">{Math.floor(ply / 2) + 1}.</span>}
              {i === 0 && ply % 2 === 1 && <span className="text-muted-foreground">{Math.floor(ply / 2) + 1}...</span>}
              <button
                ref={index === step ? activeRef : undefined}
                type="button"
                onClick={() => setStep(index)}
                className={cn(
                  "rounded px-1 py-0.5 hover:bg-accent",
                  index === step && "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                {sanToSpanish(s.san ?? "")}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Diagram({ diagram }: { diagram: ChessDiagram }) {
  const isPgn = diagram.kind === "pgn";
  const [step, setStep] = useState(isPgn ? diagram.steps.length - 1 : 0);
  const [prevLength, setPrevLength] = useState(diagram.steps.length);
  // A streamed PGN may gain moves after the first render: follow the end unless the user navigated away.
  if (prevLength !== diagram.steps.length) {
    setPrevLength(diagram.steps.length);
    if (step === prevLength - 1) setStep(diagram.steps.length - 1);
  }

  return (
    <figure className="my-3 flex w-full max-w-[420px] flex-col gap-2 rounded-lg border bg-card p-2 text-card-foreground">
      <div className="dark:brightness-90">
        <Board diagram={diagram} step={step} />
      </div>
      {isPgn && <PgnControls diagram={diagram} step={step} setStep={setStep} />}
      {diagram.caption && <figcaption className="text-center text-xs text-muted-foreground">{diagram.caption}</figcaption>}
    </figure>
  );
}

export default function ChessDiagramBlock({
  kind,
  code,
  isIncomplete,
}: {
  kind: "fen" | "pgn";
  code: string;
  isIncomplete: boolean;
}) {
  // While streaming, or when the block does not parse, show it as plain code instead of breaking the message.
  const diagram = isIncomplete ? null : parseChessBlock(kind, code);
  if (!diagram) {
    return (
      <pre className="my-3 overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
        <code>{code}</code>
      </pre>
    );
  }
  return <Diagram diagram={diagram} />;
}
