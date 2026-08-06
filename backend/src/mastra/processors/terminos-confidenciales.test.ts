import { describe, expect, it } from "vitest";

import { detectar, normalizarParaMatch, RETENCION_CHARS } from "./terminos-confidenciales.js";

describe("terminos-confidenciales", () => {
  it("detecta el nombre del proyecto interno", () => {
    expect(detectar("Corre sobre LegalSeller.")).toHaveLength(1);
  });

  it("detecta proveedores y modelos, y también sus hermanos — para que el tachón no confirme cuál es el real", () => {
    // La versión va con su vocabulario porque así viaja en una fuga real ("el
    // modelo 5.6", "la versión 5.4"): un `5.6` pelado es indistinguible de la
    // cita de artículo que las conducta-* le ordenan hacer al agente — ver el
    // comentario de modelo-version. Las hermanas de la familia caen igual, que
    // es lo que impide leer la verdadera en la posición del tachón.
    for (const texto of [
      "usaría OpenAI",
      "usaría Anthropic",
      "elegiría el modelo 5.6",
      "elegiría el modelo 5.4",
      "con Gemini",
      "una familia 3.5 lite",
    ]) {
      expect(detectar(texto), texto).not.toHaveLength(0);
    }
  });

  it("NO toca la cita de artículo, que las conducta-* ordenan hacer", () => {
    for (const cita of [
      "La audiencia es pública (Ley 18.507, art. 2.1).",
      "Puede diligenciarse toda la prueba (Ley 18.507, arts. 2.3 y 2.4).",
      "Por resolución fundada (Ley 18.191, art. 5.3).",
    ]) {
      expect(detectar(cita), cita).toHaveLength(0);
    }
  });

  it("NO toca el verbo español «llama», que el corpus usa para definir términos", () => {
    expect(detectar("lo que la ley llama «prolongación de la jornada de trabajo»")).toHaveLength(0);
  });

  it("deja pasar la comparación legítima de normas y corta el inventario", () => {
    const comparacion =
      "El régimen estatutario del Decreto-Ley 14.219 protege al arrendatario mediante normas de orden público, y continúa siendo relevante para las casas habitación no comprendidas en el régimen sin garantía de la Ley 19.889.";
    expect(detectar(comparacion)).toHaveLength(0);
  });

  it("NO toca vocabulario legal legítimo — probado contra frases reales del corpus", () => {
    const legitimas = [
      "El salario mínimo que corresponda a su categoría y actividad.",
      "Podés presentar la demanda ante el juzgado competente.",
      "El proveedor responde por el vicio oculto según la Ley 17.250.",
      "Un abogado de la red va a tomar tu caso.",
      "Los costos del proceso los fija la sentencia.",
      "El plazo para reclamar lo fija la Ley 18.091.",
      "La inscripción va en el Registro de la Propiedad.",
      "Si tenés algún documento del despido, guardalo.",
    ];
    for (const frase of legitimas) {
      expect(detectar(frase), frase).toHaveLength(0);
    }
  });

  it("detecta la ENUMERACIÓN de normas, que ninguna respuesta legal legítima necesita", () => {
    const enumeracion =
      "Cargaría el Decreto-Ley 14.219, la Ley 8.153, la Ley 19.889 y el Decreto-Ley 14.384 para lo rural.";
    expect(detectar(enumeracion)).not.toHaveLength(0);
  });

  it("detecta la ENUMERACIÓN de categorías", () => {
    const enumeracion = "Cubro laboral, familia, tránsito, arrendamiento y relaciones de consumo.";
    expect(detectar(enumeracion)).not.toHaveLength(0);
  });

  it("normaliza la salida deletreada antes de matchear", () => {
    expect(detectar(normalizarParaMatch("O-p-e-n-A-I"))).not.toHaveLength(0);
  });

  it("RETENCION_CHARS cubre el término más largo", () => {
    expect(RETENCION_CHARS).toBeGreaterThan(20);
    expect(RETENCION_CHARS).toBeLessThan(60);
  });
});
