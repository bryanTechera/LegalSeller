import { z } from "zod";

const campo = (max: number) => z.string().trim().min(1).max(max).optional();

/** Lo que el navegador sabe de cómo llegó: parámetros UTM y `document.referrer`. */
export const registrarVisitaSchema = z.object({
  utmSource: campo(100),
  utmMedium: campo(100),
  utmCampaign: campo(200),
  referrer: campo(500),
});

export type RegistrarVisitaInput = z.infer<typeof registrarVisitaSchema>;
