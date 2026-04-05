import { NextRequest, NextResponse } from "next/server";
import { getProductsWithCopPrices } from "@/lib/products";
import { generateFacebookFeed } from "@/lib/feeds";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 3600;

/**
 * Feed XML para Facebook Catalog e Instagram Shop.
 * URL para configurar en Facebook Commerce Manager.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed, resetAt } = await checkRateLimit(
      `feed:facebook:${ip}`, 60, 3600
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
    const shopDomain = process.env.SHOPIFY_STORE_DOMAIN || "tienda.myshopify.com";
    const xml = generateFacebookFeed(products, shopDomain);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    console.error("Error generando feed Facebook:", error);
    return NextResponse.json(
      { error: "Error generando feed" },
      { status: 500 }
    );
  }
}
