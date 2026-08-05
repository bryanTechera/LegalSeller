import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./TextoMarkdown.module.css";

interface TextoMarkdownProps {
  texto: string;
  /** Contenido extra dentro del mismo bloque (p. ej. el indicador de streaming). */
  children?: ReactNode;
}

/**
 * Único lugar donde se rinde el markdown que escribe el agente. Lo usan el
 * chat (MessageBubble, y por él la pantalla de revisión) y el transcript del
 * board: si solo una pantalla lo rinde, la otra le muestra al lector los
 * asteriscos crudos de una negrita.
 *
 * `react-markdown` no inyecta HTML (no hay `dangerouslySetInnerHTML` ni
 * `rehype-raw`), así que el HTML que venga en el texto se escapa en vez de
 * ejecutarse — por eso acá no hace falta sanitizar.
 */
export function TextoMarkdown({ texto, children }: TextoMarkdownProps) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{texto}</ReactMarkdown>
      {children}
    </div>
  );
}
