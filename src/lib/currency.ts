/**
 * Convierte USD a COP y redondea a la centena más cercana.
 * COP no usa decimales en comercio.
 *
 * Ejemplo: USD 65.00 × 4150.25 = 269,766.25 → COP 269,800
 */
export function convertUsdToCop(amountUsd: number, rate: number): number {
  const raw = amountUsd * rate;
  return Math.round(raw / 100) * 100;
}

/**
 * Formatea precio COP para MercadoPago (entero sin decimales)
 */
export function formatForMercadoPago(copAmount: number): number {
  return Math.round(copAmount);
}

/**
 * Formatea precio COP para Facebook/Instagram Catalog
 * Formato: "259900.00 COP"
 */
export function formatForFacebook(copAmount: number): string {
  return `${copAmount.toFixed(2)} COP`;
}

/**
 * Formatea precio COP para TikTok Shop (entero)
 */
export function formatForTikTok(copAmount: number): number {
  return Math.round(copAmount);
}

/**
 * Formatea precio COP para MercadoLibre (entero sin decimales)
 */
export function formatForMercadoLibre(copAmount: number): number {
  return Math.round(copAmount);
}
