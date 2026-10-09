"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";
import "katex/dist/katex.min.css";

// Heavy markdown stack (shiki, katex, mermaid, cjk): kept in its own lazily loaded chunk, see message.tsx.
// Single-dollar inline math ($x^2$) is off by default in streamdown; the math tutor relies on it.
const math = createMathPlugin({ singleDollarTextMath: true });
const plugins = { cjk, code, math, mermaid };

export default function StreamdownRenderer(props: ComponentProps<typeof Streamdown>) {
  return <Streamdown plugins={plugins} {...props} />;
}
