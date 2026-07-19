/**
 * State synchronized from the frontend on every request (FE-sync state).
 * It travels in `requestContext` and is read with the typed helpers in
 * `mastra/common/middleware`. It never lives in working memory.
 */
export interface ReadOnlyState {
  /** Authenticated user id (also used as Mastra resourceId). */
  userId: string;
  /** Display name used to address the user in responses. */
  userName?: string;
}

export type AgentId = "consultas";
