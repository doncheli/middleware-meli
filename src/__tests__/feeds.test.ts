import { describe, it, expect } from "vitest";
import {
  generateFacebookFeed,
  generateTikTokFeed,
  generateMercadoLibreFeed,
} from "@/lib/feeds";
import type { ProductWithCop } from "@/lib/products";

const mockProducts: ProductWithCop[] = [
  {
    shopifyProductId: "1001",
    shopifyVariantId: "2001",
    title: "Camiseta Negra",
    description: "Camiseta de algodón 100% negra",
    priceUsd: 29.99,
    priceCop: 126000,
    imageUrl: "https://cdn.shopify.com/image1.jpg",
    availability: "in stock",
    sku: "CAM-NEG-001",
    productType: "Camisetas",
    inventoryQuantity: 50,
  },
  {
    shopifyProductId: "1002",
    shopifyVariantId: "2002",
    title: 'Pantalón "Premium" & Elegante',
    description: "Pantalón con <b>estilo</b> premium",
    priceUsd: 65.0,
    priceCop: 273000,
    imageUrl: "https://cdn.shopify.com/image2.jpg",
    availability: "out of stock",
    sku: "PAN-PRE-002",
    productType: "Pantalones",
    inventoryQuantity: 0,
  },
  {
    shopifyProductId: "1003",
    shopifyVariantId: "2003",
    title: "Producto con título muy largo que debería ser truncado por MercadoLibre a sesenta caracteres máximo",
    description: "Desc",
    priceUsd: 10.0,
    priceCop: 42000,
    imageUrl: "",
    availability: "in stock",
    sku: "",
    productType: "",
    inventoryQuantity: 5,
  },
];

describe("generateFacebookFeed", () => {
  const xml = generateFacebookFeed(mockProducts, "mitienda.myshopify.com");

  it("genera XML válido con declaración", () => {
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<rss");
    expect(xml).toContain("</rss>");
  });

  it("incluye namespace de Google Product", () => {
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
  });

  it("genera items por cada producto", () => {
    const itemCount = (xml.match(/<item>/g) || []).length;
    expect(itemCount).toBe(3);
  });

  it("incluye precio en formato COP correcto", () => {
    expect(xml).toContain("<g:price>126000.00 COP</g:price>");
    expect(xml).toContain("<g:price>273000.00 COP</g:price>");
  });

  it("escapa caracteres especiales en XML", () => {
    expect(xml).toContain("&quot;Premium&quot;");
    expect(xml).toContain("&amp;");
    expect(xml).not.toContain('title>"');
  });

  it("incluye availability correcta", () => {
    expect(xml).toContain("<g:availability>in stock</g:availability>");
    expect(xml).toContain("<g:availability>out of stock</g:availability>");
  });

  it("incluye SKU como MPN cuando existe", () => {
    expect(xml).toContain("<g:mpn>CAM-NEG-001</g:mpn>");
    expect(xml).toContain("<g:mpn>PAN-PRE-002</g:mpn>");
  });

  it("omite MPN cuando no hay SKU", () => {
    // El tercer producto no tiene SKU
    const items = xml.split("<item>");
    const thirdItem = items[3]; // index 0 es antes del primer item
    expect(thirdItem).not.toContain("<g:mpn>");
  });
});

describe("generateTikTokFeed", () => {
  const csv = generateTikTokFeed(mockProducts);
  const lines = csv.split("\n");

  it("genera header CSV correcto", () => {
    expect(lines[0]).toBe(
      "sku_id,product_name,product_description,category,image_url,price,currency,availability,quantity"
    );
  });

  it("genera una fila por producto", () => {
    expect(lines.length).toBe(4); // header + 3 productos
  });

  it("precio en COP como entero", () => {
    expect(lines[1]).toContain(",126000,COP,");
    expect(lines[2]).toContain(",273000,COP,");
  });

  it("availability en formato TikTok", () => {
    expect(lines[1]).toContain("IN_STOCK");
    expect(lines[2]).toContain("OUT_OF_STOCK");
  });

  it("escapa campos con comas o comillas en CSV", () => {
    // "Pantalón "Premium" & Elegante" contiene comillas
    expect(lines[2]).toContain('"');
  });

  it("incluye cantidad de inventario", () => {
    expect(lines[1].endsWith(",50")).toBe(true);
    expect(lines[2].endsWith(",0")).toBe(true);
  });
});

describe("generateMercadoLibreFeed", () => {
  const feed = generateMercadoLibreFeed(mockProducts);

  it("retorna array de productos", () => {
    expect(Array.isArray(feed)).toBe(true);
    expect(feed.length).toBe(3);
  });

  it("precio como entero sin decimales", () => {
    expect(feed[0]).toHaveProperty("price", 126000);
    expect(feed[1]).toHaveProperty("price", 273000);
  });

  it("moneda siempre COP", () => {
    feed.forEach((p) => {
      expect(p).toHaveProperty("currency_id", "COP");
    });
  });

  it("trunca título a máximo 60 caracteres", () => {
    const longTitleProduct = feed[2] as { title: string };
    expect(longTitleProduct.title.length).toBeLessThanOrEqual(60);
  });

  it("incluye pictures como array de objetos con source", () => {
    const first = feed[0] as { pictures: { source: string }[] };
    expect(first.pictures).toEqual([
      { source: "https://cdn.shopify.com/image1.jpg" },
    ]);
  });

  it("pictures vacío cuando no hay imagen", () => {
    const noImage = feed[2] as { pictures: unknown[] };
    expect(noImage.pictures).toEqual([]);
  });

  it("condition siempre 'new'", () => {
    feed.forEach((p) => {
      expect(p).toHaveProperty("condition", "new");
    });
  });

  it("available_quantity refleja inventario", () => {
    expect(feed[0]).toHaveProperty("available_quantity", 50);
    expect(feed[1]).toHaveProperty("available_quantity", 0);
  });
});
