"use client";

import { useEffect } from "react";

/**
 * Registra la visita a la home. Va del lado del navegador y no en el render
 * del servidor por dos razones: los crawlers de previsualización de Meta no
 * ejecutan JS, y los UTM y el referrer solo los conoce el navegador. Las
 * recargas se deduplican del lado del servidor.
 */
export function RegistroVisita() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cuerpo = {
      utmSource: params.get("utm_source") ?? undefined,
      utmMedium: params.get("utm_medium") ?? undefined,
      utmCampaign: params.get("utm_campaign") ?? undefined,
      referrer: document.referrer || undefined,
    };
    // keepalive: el navegador de Instagram cierra rápido, y el beacon tiene
    // que salir aunque el visitante se vaya en el primer segundo.
    fetch("/api/visita", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  return null;
}
