import { redis } from "./redis";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Rate limiter basado en ventana fija usando Redis.
 * @param key Identificador único (IP, API key, etc.)
 * @param maxRequests Máximo de requests por ventana
 * @param windowSeconds Tamaño de la ventana en segundos
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redisKey = `rate_limit:${key}`;

  try {
    const current = await redis.incr(redisKey);

    // Si es la primera request, establecer TTL
    if (current === 1) {
      await redis.expire(redisKey, windowSeconds);
    }

    const ttl = await redis.ttl(redisKey);
    const resetAt = new Date(Date.now() + ttl * 1000);

    return {
      allowed: current <= maxRequests,
      remaining: Math.max(0, maxRequests - current),
      resetAt,
    };
  } catch {
    // Si Redis falla, permitir la request (fail-open)
    return { allowed: true, remaining: maxRequests, resetAt: new Date() };
  }
}

/**
 * Extrae IP del request para rate limiting.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}
