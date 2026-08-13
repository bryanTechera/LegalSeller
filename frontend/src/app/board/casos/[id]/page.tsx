import { DetalleCaso } from "@/components/board/Casos/DetalleCaso";

/**
 * `vista` se lee acá y baja como prop en vez de resolverse con
 * `useSearchParams` en el cliente: así la ficha no necesita una Suspense
 * boundary propia para que `next build` la acepte.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { vista } = await searchParams;
  return <DetalleCaso id={id} vista={vista === "chat" ? "chat" : "resumen"} />;
}
