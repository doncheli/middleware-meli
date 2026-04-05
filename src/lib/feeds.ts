import type { ProductWithCop } from "./products";
import { formatForFacebook, formatForTikTok, formatForMercadoLibre } from "./currency";

/**
 * Genera feed XML para Facebook Catalog / Instagram Shop.
 * Formato: RSS 2.0 con namespace g: (Google Product Feed compatible).
 * https://developers.facebook.com/docs/commerce-platform/catalog/fields
 */
export function generateFacebookFeed(
  products: ProductWithCop[],
  shopDomain: string
): string {
  const items = products
    .map(
      (p) => `    <item>
      <g:id>${escapeXml(p.shopifyVariantId)}</g:id>
      <g:title>${escapeXml(p.title)}</g:title>
      <g:description>${escapeXml(p.description || p.title)}</g:description>
      <g:link>https://${shopDomain}/products/${encodeURIComponent(p.shopifyProductId)}</g:link>
      <g:image_link>${escapeXml(p.imageUrl)}</g:image_link>
      <g:availability>${p.availability}</g:availability>
      <g:price>${formatForFacebook(p.priceCop)}</g:price>
      <g:brand>${escapeXml(shopDomain)}</g:brand>
      <g:condition>new</g:condition>
      <g:product_type>${escapeXml(p.productType)}</g:product_type>
      ${p.sku ? `<g:mpn>${escapeXml(p.sku)}</g:mpn>` : ""}
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${escapeXml(shopDomain)} - Catálogo COP</title>
    <link>https://${shopDomain}</link>
    <description>Catálogo de productos con precios en COP</description>
${items}
  </channel>
</rss>`;
}

/**
 * Genera feed CSV para TikTok Shop.
 * https://seller.tiktokglobalshop.com/university/essay?knowledge_id=3213717
 */
export function generateTikTokFeed(products: ProductWithCop[]): string {
  const header = [
    "sku_id",
    "product_name",
    "product_description",
    "category",
    "image_url",
    "price",
    "currency",
    "availability",
    "quantity",
  ].join(",");

  const rows = products
    .map((p) =>
      [
        csvEscape(p.shopifyVariantId),
        csvEscape(p.title),
        csvEscape(p.description || p.title),
        csvEscape(p.productType || "General"),
        csvEscape(p.imageUrl),
        formatForTikTok(p.priceCop),
        "COP",
        p.availability === "in stock" ? "IN_STOCK" : "OUT_OF_STOCK",
        p.inventoryQuantity,
      ].join(",")
    )
    .join("\n");

  return `${header}\n${rows}`;
}

/**
 * Genera feed JSON compatible con MercadoLibre.
 * Formato: array de productos con precio entero en COP (sin decimales).
 */
export function generateMercadoLibreFeed(products: ProductWithCop[]): object[] {
  return products.map((p) => ({
    id: p.shopifyVariantId,
    title: p.title.substring(0, 60), // MeLi limita títulos a 60 chars
    description: p.description,
    price: formatForMercadoLibre(p.priceCop),
    currency_id: "COP",
    available_quantity: p.inventoryQuantity,
    condition: "new",
    listing_type_id: "gold_special",
    pictures: p.imageUrl ? [{ source: p.imageUrl }] : [],
    category_id: "",
    sku: p.sku,
  }));
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
