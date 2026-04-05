import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentRate } from "@/lib/exchange-rate";
import { convertUsdToCop } from "@/lib/currency";
import { verifyShopifyWebhook, addOrderNote } from "@/lib/shopify";
import { createPaymentPreference } from "@/lib/mercadopago";
import type { ShopifyOrder } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook: orders/create
 *
 * Shopify envía este webhook cuando se crea una nueva orden.
 * El middleware convierte el monto USD → COP y crea una preferencia
 * de pago en MercadoPago, luego guarda el link de pago.
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

  let order: ShopifyOrder;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Ignorar órdenes ya pagadas
  if (order.financial_status === "paid") {
    return NextResponse.json({ received: true, skipped: "already_paid" });
  }

  const amountUsd = parseFloat(order.total_price);
  if (isNaN(amountUsd) || amountUsd <= 0) {
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
  }

  try {
    // 1. Obtener tasa vigente
    const rate = await getCurrentRate();

    // 2. Convertir USD → COP
    const amountCop = convertUsdToCop(amountUsd, rate);

    // 3. Registrar transacción en BD
    const transaction = await prisma.transaction.create({
      data: {
        shopifyOrderId: String(order.id),
        amountUsd,
        exchangeRate: rate,
        amountCop,
        status: "pending",
      },
    });

    // 4. Crear preferencia en MercadoPago con monto en COP
    const preference = await createPaymentPreference({
      transactionId: transaction.id,
      title: `Orden ${order.name}`,
      amountCop,
      shopifyOrderId: String(order.id),
      buyerEmail: order.customer?.email || order.email,
    });

    // 5. Actualizar transacción con ID de preferencia
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        mpPaymentId: preference.preferenceId,
        status: "processing",
      },
    });

    // 6. Agregar nota a la orden con detalles de conversión
    await addOrderNote({
      orderId: String(order.id),
      note: `💱 Conversión: USD ${amountUsd} × ${rate} = COP ${amountCop.toLocaleString()}\n🔗 Pago MercadoPago: ${preference.initPoint}`,
    });

    return NextResponse.json({
      received: true,
      transactionId: transaction.id,
      amountUsd,
      amountCop,
      rate,
      paymentUrl: preference.initPoint,
    });
  } catch (error) {
    console.error("Error procesando orden:", error);

    return NextResponse.json(
      {
        error: "Error procesando orden",
        detail: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
