import type { ReadOnlyState } from "../../../../models/index.js";
import { searchDocumentsTool } from "../../../tools/documentos/buscar-documentos-tool.js";


type ToolsMap = Record<string, typeof searchDocumentsTool>;

/**
 * Tool set for the consultas agent. Factory so future tools can be gated by
 * FE-sync state (permissions, integrations) without touching the agent.
 */
export function buildTools(_readOnly: ReadOnlyState | null): ToolsMap {
  return {
    [searchDocumentsTool.id]: searchDocumentsTool,
  };
}
