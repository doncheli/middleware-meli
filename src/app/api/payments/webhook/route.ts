import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPaymentStatus, verifyMercadoPagoWebhook } from "@/lib/mercadopago";
import { resolvePaymentSession } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook de notificación de MercadoPago.
 *
 * Recibe la notificación de estado de pago,
 * actualiza la transacción y resuelve la sesión en Shopify.
 */
export async function POST(request: NextRequest) {
  let body: MercadoPagoWebhookPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // Validar firma de MercadoPago
  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");

  if (xSignature && xRequestId && body.data?.id) {
    const valid = verifyMercadoPagoWebhook(
      xSignature,
      xRequestId,
      body.data.id
    );
    if (!valid) {
      return NextResponse.json(
        { error: "Firma inválida" },
        { status: 401 }
      );
    }
  }

  // Solo procesar notificaciones de pago
  if (body.type !== "payment") {
    return NextResponse.json({ received: true });
  }

  const paymentId = body.data?.id;
  if (!paymentId) {
    return NextResponse.json({ error: "ID de pago faltante" }, { status: 400 });
  }

  try {
    // 1. Consultar estado del pago en MercadoPago
    const paymentInfo = await getPaymentStatus(paymentId);

    // 2. Buscar transacción asociada
    const transaction = await prisma.transaction.findFirst({
      where: {
        OR: [
          { mpPaymentId: paymentId },
          { shopifyOrderId: paymentInfo.externalReference || "" },
          { id: paymentInfo.metadata?.transaction_id || "" },
        ],
      },
    });

    if (!transaction) {
      console.warn(`Transacción no encontrada para pago MP: ${paymentId}`);
      return NextResponse.json({ received: true, matched: false });
    }

    // 3. Mapear estado de MP a nuestro estado
    const statusMap: Record<string, "approved" | "rejected" | "pending" | "processing"> = {
      approved: "approved",
      authorized: "processing",
      in_process: "processing",
      in_mediation: "processing",
      rejected: "rejected",
      cancelled: "rejected",
      refunded: "rejected",
      charged_back: "rejected",
    };

    const newStatus = statusMap[paymentInfo.status] || "pending";

    // 4. Actualizar transacción en BD
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: newStatus,
        mpPaymentId: paymentId,
        errorDetail:
          newStatus === "rejected"
            ? `${paymentInfo.status}: ${paymentInfo.statusDetail}`
            : null,
      },
    });

    // 5. Resolver sesión de pago en Shopify
    if (newStatus === "approved" || newStatus === "rejected") {
      try {
        await resolvePaymentSession({
          paymentSessionId: transaction.shopifyOrderId,
          gid: `gid://shopify/PaymentSession/${transaction.shopifyOrderId}`,
          action: newStatus === "approved" ? "resolve" : "reject",
          reason:
            newStatus === "rejected"
              ? `MercadoPago: ${paymentInfo.statusDetail}`
              : undefined,
        });
      } catch (shopifyError) {
        console.error("Error resolviendo sesión en Shopify:", shopifyError);
        // No fallar el webhook por error de Shopify, ya actualizamos BD
      }
    }

    return NextResponse.json({
      received: true,
      transactionId: transaction.id,
      status: newStatus,
    });
  } catch (error) {
    console.error("Error procesando webhook de MercadoPago:", error);

    return NextResponse.json(
      { error: "Error procesando webhook" },
      { status: 500 }
    );
  }
}

interface MercadoPagoWebhookPayload {
  id: number;
  live_mode: boolean;
  type: string;
  date_created: string;
  user_id: number;
  api_version: string;
  action: string;
  data: {
    id: string;
  };
}
