import { NextRequest, NextResponse } from "next/server";
import { getProductsWithCopPrices } from "@/lib/products";
import { generateMercadoLibreFeed } from "@/lib/feeds";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 3600;

/**
 * Feed JSON compatible con formato MercadoLibre.
 * Precios en COP, enteros sin decimales, títulos ≤60 chars.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed, resetAt } = await checkRateLimit(
      `feed:meli:${ip}`, 60, 3600
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit excedido" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const products = await getProductsWithCopPrices();
    const feed = generateMercadoLibreFeed(products);

    return NextResponse.json(
      { products: feed, total: feed.length, currency: "COP" },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
        },
      }
    );
  } catch (error) {
    console.error("Error generando feed MercadoLibre:", error);
    return NextResponse.json(
      { error: "Error generando feed" },
      { status: 500 }
    );
  }
}
