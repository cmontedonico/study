import { z } from "zod";
import { modelAliases } from "../models.ts";

export const engine = z.enum(["cli", "api"]);
export const model = z.enum(modelAliases);
