import { z } from "zod";
import { effortLevels, modelAliases } from "../models.ts";

export const engine = z.enum(["cli", "api"]);
export const model = z.enum(modelAliases);
export const effort = z.enum(effortLevels);
