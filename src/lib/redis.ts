import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const RATE_KEY = "exchange_rate:usd_cop";
const RATE_TTL_SECONDS = 12 * 60 * 60; // 12 horas

export interface CachedRate {
  rate: number;
  fetchedAt: string;
  validUntil: string;
}

export async function getCachedRate(): Promise<CachedRate | null> {
  return redis.get<CachedRate>(RATE_KEY);
}

export async function setCachedRate(data: CachedRate): Promise<void> {
  await redis.set(RATE_KEY, data, { ex: RATE_TTL_SECONDS });
}
