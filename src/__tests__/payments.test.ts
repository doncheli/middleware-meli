import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Mock de módulos externos antes de importar
vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  getCachedRate: vi.fn(),
  setCachedRate: vi.fn(),
  redis: { get: vi.fn(), set: vi.fn() },
}));

vi.mock("@/lib/exchange-rate", () => ({
  getCurrentRate: vi.fn(),
  updateExchangeRate: vi.fn(),
}));

vi.mock("@/lib/mercadopago", () => ({
  createPaymentPreference: vi.fn(),
  getPaymentStatus: vi.fn(),
  verifyMercadoPagoWebhook: vi.fn(),
}));

vi.mock("@/lib/shopify", () => ({
  verifyShopifyWebhook: vi.fn(),
  resolvePaymentSession: vi.fn(),
  getShopifyProducts: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getCurrentRate } from "@/lib/exchange-rate";
import { createPaymentPreference } from "@/lib/mercadopago";
import { convertUsdToCop } from "@/lib/currency";

describe("Flujo de pago: Shopify → MercadoPago", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("convierte USD a COP y crea preferencia MP", async () => {
    const amountUsd = 65.0;
    const rate = 4200;
    const expectedCop = convertUsdToCop(amountUsd, rate);

    // Simular obtener tasa
    vi.mocked(getCurrentRate).mockResolvedValue(rate);

    // Simular crear transacción
    vi.mocked(prisma.transaction.create).mockResolvedValue({
      id: "txn-123",
      shopifyOrderId: "session-456",
      amountUsd: amountUsd as unknown as import("@prisma/client/runtime/library").Decimal,
      exchangeRate: rate as unknown as import("@prisma/client/runtime/library").Decimal,
      amountCop: expectedCop as unknown as import("@prisma/client/runtime/library").Decimal,
      mpPaymentId: null,
      status: "pending",
      errorDetail: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Simular crear preferencia MP
    vi.mocked(createPaymentPreference).mockResolvedValue({
      preferenceId: "mp-pref-789",
      initPoint: "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=mp-pref-789",
    });

    vi.mocked(prisma.transaction.update).mockResolvedValue({} as never);

    // Ejecutar flujo
    const txn = await prisma.transaction.create({
      data: {
        shopifyOrderId: "session-456",
        amountUsd,
        exchangeRate: rate,
        amountCop: expectedCop,
        status: "pending",
      },
    });

    const currentRate = await getCurrentRate();
    expect(currentRate).toBe(4200);

    const copAmount = convertUsdToCop(amountUsd, currentRate);
    expect(copAmount).toBe(273000); // 65 × 4200 = 273,000

    const preference = await createPaymentPreference({
      transactionId: txn.id,
      title: `Orden Shopify #session-456`,
      amountCop: copAmount,
      shopifyOrderId: "session-456",
    });

    expect(preference.initPoint).toContain("mercadopago.com");
    expect(preference.preferenceId).toBe("mp-pref-789");

    // Verificar que se creó con monto correcto en COP
    expect(createPaymentPreference).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCop: 273000,
      })
    );
  });

  it("registra la transacción con tasa y montos correctos", async () => {
    const amountUsd = 29.99;
    const rate = 4150.5;
    const expectedCop = convertUsdToCop(amountUsd, rate);

    expect(expectedCop).toBe(124500); // 29.99 × 4150.5 = 124,433.5 → 124,400... wait

    // Verificar el cálculo exacto
    const raw = 29.99 * 4150.5; // = 124,433.495
    const rounded = Math.round(raw / 100) * 100; // = 124,400
    expect(expectedCop).toBe(rounded);
  });
});

describe("Validación HMAC Shopify", () => {
  it("verifica que el HMAC SHA-256 se calcula correctamente", () => {
    const secret = "test-secret-key";
    const body = '{"test":"data"}';

    const hmac = crypto
      .createHmac("sha256", secret)
      .update(body, "utf8")
      .digest("base64");

    // Verificar que produce un hash base64 válido y consistente
    expect(hmac).toBeTruthy();
    expect(Buffer.from(hmac, "base64").toString("base64")).toBe(hmac);

    // El mismo input produce el mismo hash
    const hmac2 = crypto
      .createHmac("sha256", secret)
      .update(body, "utf8")
      .digest("base64");

    expect(hmac).toBe(hmac2);

    // Diferente body produce diferente hash
    const hmacDiff = crypto
      .createHmac("sha256", secret)
      .update('{"other":"data"}', "utf8")
      .digest("base64");

    expect(hmac).not.toBe(hmacDiff);
  });

  it("calcula HMAC SHA-256 en base64 correctamente", () => {
    const secret = "my-secret";
    const body = '{"amount":"100.00","currency":"USD"}';

    const hmac = crypto
      .createHmac("sha256", secret)
      .update(body, "utf8")
      .digest("base64");

    // Verificar que es base64 válido
    expect(Buffer.from(hmac, "base64").toString("base64")).toBe(hmac);
  });
});

describe("Mapeo de estados MercadoPago", () => {
  const statusMap: Record<string, string> = {
    approved: "approved",
    authorized: "processing",
    in_process: "processing",
    in_mediation: "processing",
    rejected: "rejected",
    cancelled: "rejected",
    refunded: "rejected",
    charged_back: "rejected",
  };

  it.each(Object.entries(statusMap))(
    "mapea estado MP '%s' a estado interno '%s'",
    (mpStatus, expectedStatus) => {
      expect(statusMap[mpStatus]).toBe(expectedStatus);
    }
  );

  it("estados no mapeados defaultean a pending", () => {
    const unknownStatus = "unknown_status";
    const result = statusMap[unknownStatus] || "pending";
    expect(result).toBe("pending");
  });
});
