import { describe, expect, it } from "vitest";

import { buildLaboralInstructions } from "../mastra/dominios/laboral/instructions.js";
import { buildRecepcionInstructions } from "../mastra/dominios/recepcion/instructions.js";
import type { ReadOnlyState } from "../models/index.js";

import { frozenLaboralInstructions, frozenRecepcionInstructions } from "./fixtures/instructions-pre-migracion.js";

/**
 * Migration gate (spec §4.5): the composed prompt must be byte-identical to
 * the pre-migration builders for every readOnly shape. If this fails, the
 * migration changed the prompt — fix the migration, never the fixture.
 *
 * Lifecycle: this gate protects the STRUCTURAL migration only (rules/skills
 * registries replacing the hand-written builders), not the content going
 * forward. On the first deliberate content change (e.g. the
 * `procesar-documento-legal` workflow rewriting a rule or skill), this test
 * file AND the fixture (fixtures/instructions-pre-migracion.ts) get DELETED —
 * not "fixed" to match new content. From that point on, the behavioral gate
 * for prompt content is `pnpm evals` (golden set), not byte-equality. Never
 * update the fixture to make this test pass once content is intentionally
 * changing.
 */
const CASOS: [string, ReadOnlyState | null][] = [
  ["readOnly null", null],
  ["solo userId", { userId: "s1" }],
  ["con userName", { userId: "s1", userName: "Ana" }],
  ["con casoBrief", { userId: "s1", casoBrief: "Despido sin liquidación tras 5 años." }],
  ["completo", { userId: "s1", userName: "Ana", casoBrief: "Despido sin liquidación tras 5 años." }],
];

describe("byte-igualdad de la migración a rules/skills", () => {
  it.each(CASOS)("recepcion: %s", (_nombre, readOnly) => {
    expect(buildRecepcionInstructions(readOnly)).toBe(frozenRecepcionInstructions(readOnly));
  });

  it.each(CASOS)("laboral: %s", (_nombre, readOnly) => {
    expect(buildLaboralInstructions(readOnly)).toBe(frozenLaboralInstructions(readOnly));
  });
});
