import { DetalleChat } from "@/components/board/Chats/DetalleChat";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalleChat id={id} />;
}
