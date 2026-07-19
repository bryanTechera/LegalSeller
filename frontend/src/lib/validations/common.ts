import { NextResponse } from "next/server";
import { z } from "zod";

export type ParseResult<T> = { success: true; data: T } | { success: false; response: NextResponse };

/** Maps technical field paths to user-friendly Spanish names for error messages. */
const FIELD_NAMES: Record<string, string> = {
  query: "la consulta",
  title: "el título",
  email: "el email",
  name: "el nombre",
};

export function formatValidationError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Datos inválidos";
  const path = issue.path.join(".");
  const friendly = FIELD_NAMES[path] ?? (path || "los datos");
  return `Hay un problema con ${friendly}: ${issue.message}`;
}

/**
 * Validates a request JSON body. On failure returns a ready 400 NextResponse
 * with a Spanish message — route handlers just `return validation.response`.
 */
export async function parseRequestBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<ParseResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      success: false,
      response: NextResponse.json({ error: "El cuerpo de la solicitud no es JSON válido" }, { status: 400 }),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: formatValidationError(parsed.error), code: "VALIDATION_ERROR" },
        { status: 400 },
      ),
    };
  }
  return { success: true, data: parsed.data };
}

/** Validates URLSearchParams against a schema (same contract as parseRequestBody). */
export function parseSearchParams<S extends z.ZodType>(searchParams: URLSearchParams, schema: S): ParseResult<z.infer<S>> {
  const parsed = schema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: formatValidationError(parsed.error), code: "VALIDATION_ERROR" },
        { status: 400 },
      ),
    };
  }
  return { success: true, data: parsed.data };
}
