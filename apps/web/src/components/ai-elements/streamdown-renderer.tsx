"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";

// Heavy markdown stack (shiki, katex, mermaid, cjk): kept in its own lazily loaded chunk, see message.tsx.
const plugins = { cjk, code, math, mermaid };

export default function StreamdownRenderer(props: ComponentProps<typeof Streamdown>) {
  return <Streamdown plugins={plugins} {...props} />;
}
