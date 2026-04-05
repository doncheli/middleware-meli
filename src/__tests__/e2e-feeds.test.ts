/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    productCache: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    exchangeRate: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  getCachedRate: vi.fn(),
  setCachedRate: vi.fn(),
  redis: { get: vi.fn(), set: vi.fn(), incr: vi.fn(), expire: vi.fn(), ttl: vi.fn() },
}));

vi.mock("@/lib/exchange-rate", () => ({
  getCurrentRate: vi.fn(),
}));

vi.mock("@/lib/shopify", () => ({
  getShopifyProducts: vi.fn(),
  verifyShopifyWebhook: vi.fn(),
  resolvePaymentSession: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getCurrentRate } from "@/lib/exchange-rate";
import { getShopifyProducts, type ShopifyProduct } from "@/lib/shopify";
import { getProductsWithCopPrices } from "@/lib/products";
import {
  generateFacebookFeed,
  generateTikTokFeed,
  generateMercadoLibreFeed,
} from "@/lib/feeds";

const mockShopifyProducts: ShopifyProduct[] = [
  {
    id: 5001,
    title: "Zapatos Deportivos",
    body_html: "<p>Zapatos <strong>cómodos</strong> para correr</p>",
    product_type: "Calzado",
    status: "active",
    variants: [
      {
        id: 6001,
        product_id: 5001,
        title: "Talla 42",
        price: "79.99",
        sku: "ZAP-DEP-42",
        inventory_quantity: 25,
      },
      {
        id: 6002,
        product_id: 5001,
        title: "Talla 44",
        price: "79.99",
        sku: "ZAP-DEP-44",
        inventory_quantity: 0,
      },
    ],
    images: [{ id: 1, src: "https://cdn.shopify.com/zapatos.jpg", alt: null }],
  },
  {
    id: 5002,
    title: "Reloj Clásico",
    body_html: "Reloj de acero inoxidable",
    product_type: "Accesorios",
    status: "active",
    variants: [
      {
        id: 6003,
        product_id: 5002,
        title: "Default Title",
        price: "149.00",
        sku: "REL-CLA-001",
        inventory_quantity: 10,
      },
    ],
    images: [{ id: 2, src: "https://cdn.shopify.com/reloj.jpg", alt: null }],
  },
];

describe("E2E: Flujo completo de generación de feeds", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Cache vacío → fuerza re-sync desde Shopify
    vi.mocked(prisma.productCache.findMany).mockResolvedValue([]);
    vi.mocked(prisma.productCache.upsert).mockResolvedValue({} as any);
    vi.mocked(getCurrentRate).mockResolvedValue(4200);
    vi.mocked(getShopifyProducts).mockResolvedValue(mockShopifyProducts);
  });

  it("Shopify → conversión COP → 3 feeds con precios correctos", async () => {
    const products = await getProductsWithCopPrices();

    // Debe generar 3 productos (2 variantes + 1 producto sin variantes)
    expect(products).toHaveLength(3);

    // Verificar conversión: USD 79.99 × 4200 = 335,958 → 336,000
    expect(products[0].priceCop).toBe(336000);
    expect(products[0].title).toBe("Zapatos Deportivos - Talla 42");
    expect(products[0].availability).toBe("in stock");

    // Variante sin stock
    expect(products[1].priceCop).toBe(336000);
    expect(products[1].title).toBe("Zapatos Deportivos - Talla 44");
    expect(products[1].availability).toBe("out of stock");

    // Producto con una sola variante: no agrega " - Default Title"
    expect(products[2].priceCop).toBe(625800); // 149 × 4200 = 625,800
    expect(products[2].title).toBe("Reloj Clásico");
  });

  it("Feed Facebook: XML válido con precios COP", async () => {
    const products = await getProductsWithCopPrices();
    const xml = generateFacebookFeed(products, "mitienda.myshopify.com");

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain("<g:price>336000.00 COP</g:price>");
    expect(xml).toContain("<g:price>625800.00 COP</g:price>");
    expect(xml).toContain("<g:availability>in stock</g:availability>");
    expect(xml).toContain("<g:availability>out of stock</g:availability>");

    // Verifica que HTML fue eliminado de descripción
    expect(xml).not.toContain("<strong>");
    expect(xml).toContain("Zapatos cómodos para correr");
  });

  it("Feed TikTok: CSV con columnas y precios correctos", async () => {
    const products = await getProductsWithCopPrices();
    const csv = generateTikTokFeed(products);
    const lines = csv.split("\n");

    // Header + 3 productos
    expect(lines).toHaveLength(4);

    // Verificar que el precio COP está como entero
    expect(lines[1]).toContain(",336000,COP,");
    expect(lines[3]).toContain(",625800,COP,");

    // Disponibilidad en formato TikTok
    expect(lines[1]).toContain("IN_STOCK");
    expect(lines[2]).toContain("OUT_OF_STOCK");
  });

  it("Feed MercadoLibre: JSON con precios enteros y títulos truncados", async () => {
    const products = await getProductsWithCopPrices();
    const feed = generateMercadoLibreFeed(products);

    expect(feed).toHaveLength(3);

    // Precios enteros
    const first = feed[0] as any;
    expect(first.price).toBe(336000);
    expect(Number.isInteger(first.price)).toBe(true);
    expect(first.currency_id).toBe("COP");

    // Título ≤ 60 chars
    feed.forEach((item: any) => {
      expect(item.title.length).toBeLessThanOrEqual(60);
    });

    // Imágenes como array de objetos
    expect(first.pictures).toEqual([
      { source: "https://cdn.shopify.com/zapatos.jpg" },
    ]);
  });

  it("los 3 feeds usan exactamente la misma tasa de cambio", async () => {
    const products = await getProductsWithCopPrices();

    // Todos los precios deben derivar de rate = 4200
    const expectedPrices = [
      { usd: 79.99, cop: 336000 },
      { usd: 79.99, cop: 336000 },
      { usd: 149.0, cop: 625800 },
    ];

    products.forEach((p, i) => {
      expect(p.priceUsd).toBe(expectedPrices[i].usd);
      expect(p.priceCop).toBe(expectedPrices[i].cop);
    });

    // Verificar que las 3 funciones de feed reciben el mismo input
    const fbXml = generateFacebookFeed(products, "test.com");
    const tkCsv = generateTikTokFeed(products);
    const mlJson = generateMercadoLibreFeed(products);

    // Mismo precio en los 3 formatos
    expect(fbXml).toContain("336000.00 COP");
    expect(tkCsv).toContain(",336000,");
    expect((mlJson[0] as any).price).toBe(336000);
  });

  it("sincroniza con Shopify cuando el cache está vencido", async () => {
    // Primera llamada: cache vacío
    await getProductsWithCopPrices();

    expect(getShopifyProducts).toHaveBeenCalledTimes(1);
    expect(prisma.productCache.upsert).toHaveBeenCalledTimes(3); // 3 variantes
  });

  it("usa cache cuando está fresco", async () => {
    // Simular cache con datos frescos
    vi.mocked(prisma.productCache.findMany).mockResolvedValue([
      {
        id: "cached-1",
        shopifyProductId: "5001-6001",
        shopifyVariantId: "6001",
        title: "Cached Product",
        description: "Cached",
        priceUsd: 79.99 as any,
        priceCop: 336000 as any,
        imageUrl: "https://img.jpg",
        availability: "in stock",
        lastSynced: new Date(), // Fresco
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const products = await getProductsWithCopPrices();

    expect(products).toHaveLength(1);
    expect(getShopifyProducts).not.toHaveBeenCalled(); // No llamó a Shopify
  });
});
