import crypto from "crypto";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

function getClient(): MercadoPagoConfig {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("MP_ACCESS_TOKEN no configurada");
  }
  return new MercadoPagoConfig({ accessToken });
}

export interface CreatePreferenceParams {
  transactionId: string;
  title: string;
  amountCop: number;
  shopifyOrderId: string;
  buyerEmail?: string;
}

/**
 * Crea una preferencia de pago en MercadoPago con el monto en COP.
 */
export async function createPaymentPreference(
  params: CreatePreferenceParams
): Promise<{ preferenceId: string; initPoint: string }> {
  const client = getClient();
  const preference = new Preference(client);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const result = await preference.create({
    body: {
      items: [
        {
          id: params.transactionId,
          title: params.title,
          quantity: 1,
          unit_price: params.amountCop,
          currency_id: "COP",
        },
      ],
      payer: params.buyerEmail ? { email: params.buyerEmail } : undefined,
      external_reference: params.shopifyOrderId,
      notification_url: `${appUrl}/api/payments/webhook`,
      back_urls: {
        success: `${appUrl}/payment/success`,
        failure: `${appUrl}/payment/failure`,
        pending: `${appUrl}/payment/pending`,
      },
      auto_return: "approved",
      metadata: {
        transaction_id: params.transactionId,
        shopify_order_id: params.shopifyOrderId,
      },
    },
  });

  if (!result.id || !result.init_point) {
    throw new Error("MercadoPago no retornó preferencia válida");
  }

  return {
    preferenceId: result.id,
    initPoint: result.init_point,
  };
}

/**
 * Consulta el estado de un pago en MercadoPago.
 */
export async function getPaymentStatus(paymentId: string): Promise<{
  id: number;
  status: string;
  statusDetail: string;
  externalReference: string | null;
  transactionAmount: number;
  metadata: Record<string, string>;
}> {
  const client = getClient();
  const payment = new Payment(client);

  const result = await payment.get({ id: paymentId });

  return {
    id: result.id!,
    status: result.status!,
    statusDetail: result.status_detail || "",
    externalReference: result.external_reference || null,
    transactionAmount: result.transaction_amount!,
    metadata: (result.metadata as Record<string, string>) || {},
  };
}

/**
 * Valida la firma de un webhook de MercadoPago.
 */
export function verifyMercadoPagoWebhook(
  xSignature: string,
  xRequestId: string,
  dataId: string
): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("MP_WEBHOOK_SECRET no configurada, omitiendo validación");
    return true;
  }

  // MercadoPago envía: ts=timestamp,v1=hash
  const parts = xSignature.split(",");
  const tsEntry = parts.find((p) => p.trim().startsWith("ts="));
  const v1Entry = parts.find((p) => p.trim().startsWith("v1="));

  if (!tsEntry || !v1Entry) return false;

  const ts = tsEntry.trim().replace("ts=", "");
  const v1 = v1Entry.trim().replace("v1=", "");

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  return hmac === v1;
}
