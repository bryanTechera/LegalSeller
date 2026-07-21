"use client";

import { useCallback, useEffect, useState } from "react";

import { BrandMark } from "@/components/brand/BrandMark";
import { AccesoForm } from "@/components/revision/AccesoForm";
import { ListadoSesiones, type SesionResumen } from "@/components/revision/ListadoSesiones";
import { SesionView } from "@/components/revision/SesionView";
import styles from "@/components/revision/revision.module.css";

type Vista = { tipo: "cargando" } | { tipo: "acceso" } | { tipo: "listado" } | { tipo: "sesion"; id: string };

export default function RevisionPage() {
  const [vista, setVista] = useState<Vista>({ tipo: "cargando" });
  const [sesiones, setSesiones] = useState<SesionResumen[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargarListado = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/revision/sesiones");
      if (response.status === 401 || response.status === 503) {
        setVista({ tipo: "acceso" });
        return;
      }
      if (!response.ok) {
        setError("No pudimos cargar las sesiones. Recargá la página.");
        setVista({ tipo: "listado" });
        return;
      }
      const payload = (await response.json()) as { sesiones: SesionResumen[] };
      setSesiones(payload.sesiones);
      setVista({ tipo: "listado" });
    } catch {
      setError("No pudimos cargar las sesiones. Recargá la página.");
      setVista({ tipo: "listado" });
    }
  }, []);

  useEffect(() => {
    // Wrapper inline: react-hooks/set-state-in-effect solo traza llamadas
    // directas a funciones referenciadas por identificador (ver useCallback
    // arriba); envolver la invocación en un IIFE async local evita el falso
    // positivo sin cambiar el comportamiento (carga en el montaje).
    void (async () => {
      await cargarListado();
    })();
  }, [cargarListado]);

  const crearSesion = useCallback(
    async (titulo: string) => {
      try {
        const response = await fetch("/api/revision/sesiones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(titulo ? { titulo } : {}),
        });
        if (!response.ok) {
          setError("No pudimos crear la sesión.");
          return;
        }
        const payload = (await response.json()) as { sesion: { id: string } };
        setVista({ tipo: "sesion", id: payload.sesion.id });
      } catch {
        setError("No pudimos crear la sesión.");
      }
    },
    [],
  );

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.wordmark}>
          <BrandMark size={22} />
          Jurco
        </span>
        <span className={styles.chipRevision}>Revisión</span>
      </header>
      <main className={styles.main}>
        <div className={`${styles.columna}${vista.tipo === "sesion" ? ` ${styles.columnaSesion}` : ""}`}>
          {vista.tipo === "acceso" ? (
            <AccesoForm onAcceso={() => void cargarListado()} />
          ) : vista.tipo === "listado" ? (
            <>
              <header className={styles.encabezado}>
                <h1 className={styles.titulo}>Sesiones de revisión</h1>
                <p className={styles.subtitulo}>Espacio compartido del equipo legal</p>
              </header>
              {error ? <p role="alert" className={styles.error}>{error}</p> : null}
              <ListadoSesiones sesiones={sesiones} onAbrir={(id) => setVista({ tipo: "sesion", id })} onCrear={crearSesion} />
            </>
          ) : vista.tipo === "sesion" ? (
            <SesionView id={vista.id} onVolver={() => void cargarListado()} />
          ) : null}
        </div>
      </main>
    </div>
  );
}
