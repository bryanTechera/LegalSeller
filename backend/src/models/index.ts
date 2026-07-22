/**
 * State synchronized from the frontend on every request (FE-sync state).
 * It travels in `requestContext` and is read with the typed helpers in
 * `mastra/common/middleware`. It never lives in working memory.
 */
export interface ReadOnlyState {
  /** Anonymous session id in v1 (also the Mastra resourceId). */
  userId: string;
  /** Display name used to address the user in responses. */
  userName?: string;
  /** Case brief produced by the receptor's classification (never re-ask its contents). */
  casoBrief?: string;
}

export type AgentId = "recepcion" | "laboral" | "familia";
