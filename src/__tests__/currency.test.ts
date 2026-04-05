import { describe, it, expect } from "vitest";
import {
  convertUsdToCop,
  formatForMercadoPago,
  formatForFacebook,
  formatForTikTok,
  formatForMercadoLibre,
} from "@/lib/currency";

describe("convertUsdToCop", () => {
  it("convierte correctamente con tasa entera", () => {
    // USD 100 × 4000 = COP 400,000
    expect(convertUsdToCop(100, 4000)).toBe(400000);
  });

  it("redondea a la centena más cercana hacia arriba", () => {
    // USD 65 × 4150.25 = 269,766.25 → COP 269,800
    expect(convertUsdToCop(65, 4150.25)).toBe(269800);
  });

  it("redondea a la centena más cercana hacia abajo", () => {
    // USD 10 × 4120 = 41,200 → COP 41,200 (ya es centena)
    expect(convertUsdToCop(10, 4120)).toBe(41200);
  });

  it("maneja montos con centavos USD", () => {
    // USD 29.99 × 4200 = 125,958 → COP 126,000
    expect(convertUsdToCop(29.99, 4200)).toBe(126000);
  });

  it("maneja montos pequeños", () => {
    // USD 1 × 4150 = 4,150 → COP 4,200
    expect(convertUsdToCop(1, 4150)).toBe(4200);
  });

  it("maneja monto cero", () => {
    expect(convertUsdToCop(0, 4200)).toBe(0);
  });

  it("redondea 4,050 a 4,100", () => {
    // USD 1 × 4050 = 4,050 → COP 4,100 (0.5 redondea hacia arriba)
    expect(convertUsdToCop(1, 4050)).toBe(4100);
  });

  it("mantiene 4,000 como 4,000", () => {
    expect(convertUsdToCop(1, 4000)).toBe(4000);
  });
});

describe("formatForMercadoPago", () => {
  it("retorna entero sin decimales", () => {
    expect(formatForMercadoPago(259900)).toBe(259900);
  });

  it("redondea decimales residuales", () => {
    expect(formatForMercadoPago(259900.5)).toBe(259901);
  });
});

describe("formatForFacebook", () => {
  it("retorna formato 'PRECIO COP'", () => {
    expect(formatForFacebook(259900)).toBe("259900.00 COP");
  });

  it("incluye dos decimales aunque sea entero", () => {
    expect(formatForFacebook(100000)).toBe("100000.00 COP");
  });
});

describe("formatForTikTok", () => {
  it("retorna entero", () => {
    expect(formatForTikTok(259900)).toBe(259900);
  });
});

describe("formatForMercadoLibre", () => {
  it("retorna entero sin decimales", () => {
    expect(formatForMercadoLibre(259900)).toBe(259900);
  });

  it("redondea cualquier decimal", () => {
    expect(formatForMercadoLibre(259900.7)).toBe(259901);
  });
});
