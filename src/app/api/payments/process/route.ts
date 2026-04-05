import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentRate } from "@/lib/exchange-rate";
import { convertUsdToCop } from "@/lib/currency";
import { verifyShopifyWebhook } from "@/lib/shopify";
import { createPaymentPreference } from "@/lib/mercadopago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shopify Payment App — payment_sessions/create
 *
 * Recibe la solicitud de pago desde Shopify (monto en USD),
 * convierte a COP y crea una preferencia en MercadoPago.
 */
export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // Validar HMAC de Shopify
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (hmac) {
    try {
      const valid = verifyShopifyWebhook(rawBody, hmac);
      if (!valid) {
        return NextResponse.json(
          { error: "Firma HMAC inválida" },
          { status: 401 }
        );
      }
    } catch (error) {
      console.error("Error validando HMAC:", error);
      return NextResponse.json(
        { error: "Error de autenticación" },
        { status: 401 }
      );
    }
  }

  let payload: ShopifyPaymentSessionPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { id: paymentSessionId, amount, currency, customer } = payload;

  // Validar que el monto viene en USD
  if (currency !== "USD") {
    console.warn(`Moneda inesperada: ${currency}, se esperaba USD`);
  }

  const amountUsd = parseFloat(amount);
  if (isNaN(amountUsd) || amountUsd <= 0) {
    return NextResponse.json(
      { error: "Monto inválido" },
      { status: 400 }
    );
  }

  try {
    // 1. Obtener tasa vigente
    const rate = await getCurrentRate();

    // 2. Convertir USD → COP
    const amountCop = convertUsdToCop(amountUsd, rate);

    // 3. Registrar transacción en BD
    const transaction = await prisma.transaction.create({
      data: {
        shopifyOrderId: paymentSessionId,
        amountUsd,
        exchangeRate: rate,
        amountCop,
        status: "pending",
      },
    });

    // 4. Crear preferencia en MercadoPago
    const preference = await createPaymentPreference({
      transactionId: transaction.id,
      title: `Orden Shopify #${paymentSessionId}`,
      amountCop,
      shopifyOrderId: paymentSessionId,
      buyerEmail: customer?.email,
    });

    // 5. Actualizar transacción con ID de MercadoPago
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        mpPaymentId: preference.preferenceId,
        status: "processing",
      },
    });

    // 6. Retornar redirect a MercadoPago
    return NextResponse.json({
      redirect_url: preference.initPoint,
    });
  } catch (error) {
    console.error("Error procesando pago:", error);

    return NextResponse.json(
      {
        error: "Error procesando pago",
        detail: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

interface ShopifyPaymentSessionPayload {
  id: string;
  gid: string;
  group: string;
  amount: string;
  currency: string;
  test: boolean;
  merchant_locale: string;
  payment_method: {
    type: string;
    data: Record<string, unknown>;
  };
  customer?: {
    email?: string;
    phone_number?: string;
    locale: string;
    billing_address: {
      given_name: string;
      family_name: string;
      line1: string;
      line2?: string;
      city: string;
      postal_code: string;
      province?: string;
      country_code: string;
      company?: string;
    };
  };
  kind: string;
}
