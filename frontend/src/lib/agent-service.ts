import "server-only";

/**
 * Single point of access to the Mastra agents backend. Nothing else reads
 * MASTRA_BASE_URL.
 */

const DEFAULT_BASE_URL = "http://localhost:4112";

export function getMastraBaseUrl(): string {
  return process.env.MASTRA_BASE_URL ?? DEFAULT_BASE_URL;
}

export interface StreamAgentParams {
  /** Interim: receptor global fijo hasta el orquestador con ruteo (plan Tasks 12-13). */
  agentId: "recepcion";
  threadId: string;
  /** Business user id — used as Mastra resourceId. */
  userId: string;
  userName?: string;
  message: string;
  signal?: AbortSignal;
}

/**
 * Proxies a message to the agent's stream endpoint. Returns the SSE Response
 * so the route handler can pipe it to the client.
 */
export async function streamAgentMessage(params: StreamAgentParams): Promise<Response> {
  const url = `${getMastraBaseUrl()}/api/agents/${params.agentId}/stream`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: params.signal,
    body: JSON.stringify({
      messages: [{ role: "user", content: params.message }],
      threadId: params.threadId,
      resourceId: params.userId,
      requestContext: {
        threadId: params.threadId,
        resourceId: params.userId,
        readOnly: {
          userId: params.userId,
          userName: params.userName,
        },
      },
    }),
  });
}
