import { DetalleCaso } from "@/components/board/Casos/DetalleCaso";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalleCaso id={id} />;
}
