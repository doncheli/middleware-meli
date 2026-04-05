import { prisma } from "./prisma";
import { getCachedRate, setCachedRate, type CachedRate } from "./redis";

const EXCHANGE_API_URL = "https://v6.exchangerate-api.com/v6";

interface ExchangeApiResponse {
  result: string;
  conversion_rates: Record<string, number>;
  time_last_update_utc: string;
  time_next_update_utc: string;
}

/**
 * Obtiene la tasa USD→COP desde exchangerate-api.com
 */
async function fetchRateFromApi(): Promise<{
  rate: number;
  fetchedAt: Date;
  validUntil: Date;
}> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) {
    throw new Error("EXCHANGE_RATE_API_KEY no configurada");
  }

  const response = await fetch(`${EXCHANGE_API_URL}/${apiKey}/latest/USD`);

  if (!response.ok) {
    throw new Error(
      `Error al consultar API de tasa de cambio: ${response.status}`
    );
  }

  const data: ExchangeApiResponse = await response.json();

  if (data.result !== "success") {
    throw new Error(`API de tasa de cambio retornó error: ${data.result}`);
  }

  const rate = data.conversion_rates.COP;
  if (!rate) {
    throw new Error("Tasa COP no encontrada en respuesta de API");
  }

  const fetchedAt = new Date();
  const validUntil = new Date(fetchedAt.getTime() + 12 * 60 * 60 * 1000); // 12h

  return { rate, fetchedAt, validUntil };
}

/**
 * Actualiza la tasa de cambio: consulta API, guarda en BD y cache
 */
export async function updateExchangeRate(): Promise<CachedRate> {
  const { rate, fetchedAt, validUntil } = await fetchRateFromApi();

  // Guardar en BD como registro histórico
  await prisma.exchangeRate.create({
    data: {
      fromCurrency: "USD",
      toCurrency: "COP",
      rate,
      source: "exchangerate-api.com",
      fetchedAt,
      validUntil,
    },
  });

  // Guardar en cache Redis
  const cached: CachedRate = {
    rate,
    fetchedAt: fetchedAt.toISOString(),
    validUntil: validUntil.toISOString(),
  };
  await setCachedRate(cached);

  return cached;
}

/**
 * Obtiene la tasa vigente: primero cache, luego BD, último API
 */
export async function getCurrentRate(): Promise<number> {
  // 1. Intentar cache Redis
  const cached = await getCachedRate();
  if (cached && new Date(cached.validUntil) > new Date()) {
    return cached.rate;
  }

  // 2. Intentar último registro en BD
  const dbRate = await prisma.exchangeRate.findFirst({
    where: {
      fromCurrency: "USD",
      toCurrency: "COP",
      validUntil: { gt: new Date() },
    },
    orderBy: { fetchedAt: "desc" },
  });

  if (dbRate) {
    // Re-cachear en Redis
    const cached: CachedRate = {
      rate: Number(dbRate.rate),
      fetchedAt: dbRate.fetchedAt.toISOString(),
      validUntil: dbRate.validUntil.toISOString(),
    };
    await setCachedRate(cached);
    return Number(dbRate.rate);
  }

  // 3. Fallback: consultar API directamente
  const fresh = await updateExchangeRate();
  return fresh.rate;
}
