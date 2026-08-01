import { redirect } from "next/navigation";

/** La revisión vive dentro del board desde 2026-08-01; el acceso es la sesión del board. */
export default function RevisionPage() {
  redirect("/board/revision");
}
