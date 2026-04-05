import { prisma } from "./prisma";
import { getCurrentRate } from "./exchange-rate";
import { convertUsdToCop } from "./currency";
import { getShopifyProducts } from "./shopify";

export interface ProductWithCop {
  shopifyProductId: string;
  shopifyVariantId: string;
  title: string;
  description: string;
  priceUsd: number;
  priceCop: number;
  imageUrl: string;
  availability: string;
  sku: string;
  productType: string;
  inventoryQuantity: number;
}

/**
 * Obtiene todos los productos con precio convertido a COP.
 * Usa cache en BD; si está vencido, re-sincroniza desde Shopify.
 */
export async function getProductsWithCopPrices(): Promise<ProductWithCop[]> {
  // Verificar cache (válido por 1 hora)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const cached = await prisma.productCache.findMany({
    where: { lastSynced: { gt: oneHourAgo } },
  });

  if (cached.length > 0) {
    return cached.map((p) => ({
      shopifyProductId: p.shopifyProductId,
      shopifyVariantId: p.shopifyVariantId || "",
      title: p.title,
      description: p.description || "",
      priceUsd: Number(p.priceUsd),
      priceCop: Number(p.priceCop),
      imageUrl: p.imageUrl || "",
      availability: p.availability,
      sku: "",
      productType: "",
      inventoryQuantity: 0,
    }));
  }

  return syncProductsFromShopify();
}

/**
 * Re-sincroniza productos desde Shopify, convierte precios y actualiza cache.
 */
export async function syncProductsFromShopify(): Promise<ProductWithCop[]> {
  const shopifyProducts = await getShopifyProducts();
  const rate = await getCurrentRate();
  const now = new Date();

  const products: ProductWithCop[] = [];

  for (const product of shopifyProducts) {
    for (const variant of product.variants) {
      const priceUsd = parseFloat(variant.price);
      const priceCop = convertUsdToCop(priceUsd, rate);
      const imageUrl = product.images[0]?.src || "";

      const entry: ProductWithCop = {
        shopifyProductId: String(product.id),
        shopifyVariantId: String(variant.id),
        title:
          product.variants.length > 1
            ? `${product.title} - ${variant.title}`
            : product.title,
        description: stripHtml(product.body_html || ""),
        priceUsd,
        priceCop,
        imageUrl,
        availability:
          variant.inventory_quantity > 0 ? "in stock" : "out of stock",
        sku: variant.sku || "",
        productType: product.product_type || "",
        inventoryQuantity: variant.inventory_quantity,
      };

      products.push(entry);

      // Upsert en cache
      await prisma.productCache.upsert({
        where: { shopifyProductId: `${product.id}-${variant.id}` },
        create: {
          shopifyProductId: `${product.id}-${variant.id}`,
          shopifyVariantId: String(variant.id),
          title: entry.title,
          description: entry.description,
          priceUsd,
          priceCop,
          imageUrl,
          availability: entry.availability,
          lastSynced: now,
        },
        update: {
          title: entry.title,
          description: entry.description,
          priceUsd,
          priceCop,
          imageUrl,
          availability: entry.availability,
          lastSynced: now,
        },
      });
    }
  }

  return products;
}

/**
 * Elimina tags HTML de una cadena.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
