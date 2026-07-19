import type { RequestContext } from "@mastra/core/request-context";

import type { ReadOnlyState } from "../../../models/index.js";

/**
 * Typed read helpers over RequestContext. Mastra auto-merges the
 * `requestContext` sent by the frontend into the runtime context, so no
 * custom middleware is needed — only disciplined, typed reads.
 */

export function getReadOnlyFromContext(requestContext: RequestContext | undefined): ReadOnlyState | null {
  if (!requestContext) return null;
  const value = requestContext.get("readOnly");
  if (value === undefined || value === null) return null;
  return value as ReadOnlyState;
}

export function getThreadIdFromContext(requestContext: RequestContext | undefined): string | null {
  if (!requestContext) return null;
  const value = requestContext.get("threadId");
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getResourceIdFromContext(requestContext: RequestContext | undefined): string | null {
  if (!requestContext) return null;
  const value = requestContext.get("resourceId");
  return typeof value === "string" && value.length > 0 ? value : null;
}
