import { NextRequest, NextResponse } from "next/server";
import { getProductsWithCopPrices } from "@/lib/products";
import { generateTikTokFeed } from "@/lib/feeds";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 3600;

/**
 * Feed CSV para TikTok Shop.
 * URL para configurar en TikTok Seller Center.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed, resetAt } = await checkRateLimit(
      `feed:tiktok:${ip}`, 60, 3600
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
    const csv = generateTikTokFeed(products);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="tiktok-products-cop.csv"',
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    console.error("Error generando feed TikTok:", error);
    return NextResponse.json(
      { error: "Error generando feed" },
      { status: 500 }
    );
  }
}
