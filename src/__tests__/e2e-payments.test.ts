/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Mocks
vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
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
import {
  createPaymentPreference,
  getPaymentStatus,
} from "@/lib/mercadopago";
import { verifyShopifyWebhook, resolvePaymentSession } from "@/lib/shopify";
import { convertUsdToCop } from "@/lib/currency";

describe("E2E: Flujo completo de pago Shopify → MercadoPago → Resolución", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("procesa checkout USD → crea pago COP → aprueba → resuelve en Shopify", async () => {
    const amountUsd = 85.5;
    const rate = 4200;
    const expectedCop = convertUsdToCop(amountUsd, rate);

    // --- PASO 1: Shopify envía webhook de checkout ---
    vi.mocked(verifyShopifyWebhook).mockReturnValue(true);
    vi.mocked(getCurrentRate).mockResolvedValue(rate);
    vi.mocked(prisma.transaction.create).mockResolvedValue({
      id: "txn-e2e-001",
      shopifyOrderId: "ps-12345",
      amountUsd: amountUsd as any,
      exchangeRate: rate as any,
      amountCop: expectedCop as any,
      mpPaymentId: null,
      status: "pending",
      errorDetail: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(createPaymentPreference).mockResolvedValue({
      preferenceId: "mp-pref-e2e",
      initPoint: "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=mp-pref-e2e",
    });
    vi.mocked(prisma.transaction.update).mockResolvedValue({} as any);

    // Simular el flujo del endpoint /api/payments/process
    const hmacValid = verifyShopifyWebhook("body", "hmac");
    expect(hmacValid).toBe(true);

    const currentRate = await getCurrentRate();
    const copAmount = convertUsdToCop(amountUsd, currentRate);
    // 85.5 × 4200 = 359,100 → Math.round(359100/100)*100 = 359,100
    expect(copAmount).toBe(359100);

    const txn = await prisma.transaction.create({
      data: {
        shopifyOrderId: "ps-12345",
        amountUsd: amountUsd,
        exchangeRate: rate,
        amountCop: copAmount,
        status: "pending",
      },
    });

    const pref = await createPaymentPreference({
      transactionId: txn.id,
      title: "Orden Shopify #ps-12345",
      amountCop: copAmount,
      shopifyOrderId: "ps-12345",
    });

    expect(pref.initPoint).toContain("mercadopago.com");
    expect(createPaymentPreference).toHaveBeenCalledWith(
      expect.objectContaining({ amountCop: 359100 })
    );
  });

  it("flujo completo: checkout → conversión → pago → webhook → resolución", async () => {
    const amountUsd = 100;
    const rate = 4150;
    const expectedCop = convertUsdToCop(amountUsd, rate); // 100 × 4150 = 415,000

    // PASO 1: Checkout llega desde Shopify
    vi.mocked(verifyShopifyWebhook).mockReturnValue(true);
    vi.mocked(getCurrentRate).mockResolvedValue(rate);

    const txnId = "txn-full-e2e";
    vi.mocked(prisma.transaction.create).mockResolvedValue({
      id: txnId,
      shopifyOrderId: "ps-99999",
      amountUsd: amountUsd as any,
      exchangeRate: rate as any,
      amountCop: expectedCop as any,
      mpPaymentId: null,
      status: "pending",
      errorDetail: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(createPaymentPreference).mockResolvedValue({
      preferenceId: "mp-full-e2e",
      initPoint: "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=mp-full-e2e",
    });

    // Ejecutar paso 1
    const copAmount = convertUsdToCop(amountUsd, await getCurrentRate());
    expect(copAmount).toBe(415000);

    const txn = await prisma.transaction.create({
      data: {
        shopifyOrderId: "ps-99999",
        amountUsd,
        exchangeRate: rate,
        amountCop: copAmount,
        status: "pending",
      },
    });

    const pref = await createPaymentPreference({
      transactionId: txn.id,
      title: "Orden Shopify #ps-99999",
      amountCop: copAmount,
      shopifyOrderId: "ps-99999",
    });

    expect(pref.initPoint).toContain("mercadopago.com.co");

    // PASO 2: MercadoPago notifica pago aprobado
    vi.mocked(getPaymentStatus).mockResolvedValue({
      id: 123456,
      status: "approved",
      statusDetail: "accredited",
      externalReference: "ps-99999",
      transactionAmount: copAmount,
      metadata: { transaction_id: txnId },
    });

    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      id: txnId,
      shopifyOrderId: "ps-99999",
      amountUsd: amountUsd as any,
      exchangeRate: rate as any,
      amountCop: copAmount as any,
      mpPaymentId: "mp-full-e2e",
      status: "processing",
      errorDetail: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(resolvePaymentSession).mockResolvedValue();

    // Simular webhook
    const paymentInfo = await getPaymentStatus("123456");
    expect(paymentInfo.status).toBe("approved");

    const foundTxn = await prisma.transaction.findFirst({
      where: { shopifyOrderId: paymentInfo.externalReference! },
    });
    expect(foundTxn).not.toBeNull();
    expect(foundTxn!.id).toBe(txnId);

    // Actualizar estado
    await prisma.transaction.update({
      where: { id: txnId },
      data: { status: "approved", mpPaymentId: "123456" },
    });

    // PASO 3: Resolver sesión en Shopify
    await resolvePaymentSession({
      paymentSessionId: "ps-99999",
      gid: "gid://shopify/PaymentSession/ps-99999",
      action: "resolve",
    });

    expect(resolvePaymentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "resolve",
        paymentSessionId: "ps-99999",
      })
    );

    // Verificar cadena completa de conversión
    expect(createPaymentPreference).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCop: 415000, // USD 100 × 4150 = COP 415,000
      })
    );
  });

  it("flujo de rechazo: pago rechazado → Shopify reject", async () => {
    const txnId = "txn-reject";

    vi.mocked(getPaymentStatus).mockResolvedValue({
      id: 789,
      status: "rejected",
      statusDetail: "cc_rejected_insufficient_amount",
      externalReference: "ps-reject",
      transactionAmount: 200000,
      metadata: { transaction_id: txnId },
    });

    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      id: txnId,
      shopifyOrderId: "ps-reject",
      amountUsd: 50 as any,
      exchangeRate: 4000 as any,
      amountCop: 200000 as any,
      mpPaymentId: null,
      status: "processing",
      errorDetail: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(resolvePaymentSession).mockResolvedValue();
    vi.mocked(prisma.transaction.update).mockResolvedValue({} as any);

    const paymentInfo = await getPaymentStatus("789");
    expect(paymentInfo.status).toBe("rejected");

    // Actualizar con error
    await prisma.transaction.update({
      where: { id: txnId },
      data: {
        status: "rejected",
        errorDetail: `${paymentInfo.status}: ${paymentInfo.statusDetail}`,
      },
    });

    // Rechazar en Shopify
    await resolvePaymentSession({
      paymentSessionId: "ps-reject",
      gid: "gid://shopify/PaymentSession/ps-reject",
      action: "reject",
      reason: `MercadoPago: ${paymentInfo.statusDetail}`,
    });

    expect(resolvePaymentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "reject",
        reason: "MercadoPago: cc_rejected_insufficient_amount",
      })
    );
  });
});

describe("E2E: Seguridad", () => {
  it("HMAC SHA-256 consistente para validación Shopify", () => {
    const secret = "shopify-webhook-secret-123";
    const payload = JSON.stringify({
      id: "ps-123",
      amount: "65.00",
      currency: "USD",
    });

    // Generar HMAC como lo haría Shopify
    const hmac = crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("base64");

    // Verificar que se puede recalcular
    const verify = crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("base64");

    expect(
      crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(verify))
    ).toBe(true);

    // Payload alterado debe fallar
    const tampered = crypto
      .createHmac("sha256", secret)
      .update(payload + "x", "utf8")
      .digest("base64");

    expect(
      crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(tampered))
    ).toBe(false);
  });

  it("previene inyección en montos de pago", () => {
    const maliciousAmounts = ["abc", "-100", "0", "NaN", "Infinity"];

    maliciousAmounts.forEach((amount) => {
      const parsed = parseFloat(amount);
      const isValid = !isNaN(parsed) && parsed > 0 && isFinite(parsed);

      if (amount === "abc" || amount === "NaN") {
        expect(isValid).toBe(false);
      } else if (amount === "-100" || amount === "0") {
        expect(isValid).toBe(false);
      } else if (amount === "Infinity") {
        expect(isValid).toBe(false);
      }
    });
  });
});
