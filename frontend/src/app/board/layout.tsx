import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import { Sidebar } from "@/components/board/BoardShell/Sidebar";
import styles from "@/components/board/BoardShell/board.module.css";

export default async function BoardLayout({ children }: { children: ReactNode }) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  return (
    <div className={styles.shell}>
      <Sidebar usuario={sesion.user.name ?? sesion.user.email ?? ""} />
      <main className={styles.contenido}>{children}</main>
    </div>
  );
}
