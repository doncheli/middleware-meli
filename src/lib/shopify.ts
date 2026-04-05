import crypto from "crypto";

/**
 * Valida el HMAC de un webhook de Shopify.
 * Shopify envía el HMAC en el header X-Shopify-Hmac-Sha256.
 */
export function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string
): boolean {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw new Error("SHOPIFY_API_SECRET no configurada");
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(hmacHeader)
  );
}

/**
 * Resuelve una sesión de pago en Shopify (aprobar o rechazar).
 * Usa la Payment Session API de Shopify para apps de pago.
 */
export async function resolvePaymentSession(params: {
  paymentSessionId: string;
  gid: string;
  action: "resolve" | "reject";
  reason?: string;
}): Promise<void> {
  const { gid, action, reason } = params;
  const store = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!store || !token) {
    throw new Error("SHOPIFY_STORE_DOMAIN o SHOPIFY_ACCESS_TOKEN no configuradas");
  }

  const mutation =
    action === "resolve"
      ? `mutation PaymentSessionResolve($id: ID!) {
          paymentSessionResolve(id: $id) {
            paymentSession { id status }
            userErrors { field message }
          }
        }`
      : `mutation PaymentSessionReject($id: ID!, $reason: PaymentSessionRejectionReasonInput!) {
          paymentSessionReject(id: $id, reason: $reason) {
            paymentSession { id status }
            userErrors { field message }
          }
        }`;

  const variables =
    action === "resolve"
      ? { id: gid }
      : {
          id: gid,
          reason: {
            code: "PROCESSING_ERROR",
            merchantMessage: reason || "Pago rechazado por MercadoPago",
          },
        };

  const response = await fetch(
    `https://${store}/admin/api/2024-10/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: mutation, variables }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error al resolver sesión de pago en Shopify: ${response.status} - ${text}`);
  }

  const data = await response.json();
  const result = data.data?.paymentSessionResolve || data.data?.paymentSessionReject;

  if (result?.userErrors?.length > 0) {
    throw new Error(
      `Shopify userErrors: ${result.userErrors.map((e: { message: string }) => e.message).join(", ")}`
    );
  }
}

/**
 * Obtiene productos de la tienda Shopify vía REST API.
 */
export async function getShopifyProducts(limit = 250): Promise<ShopifyProduct[]> {
  const store = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!store || !token) {
    throw new Error("SHOPIFY_STORE_DOMAIN o SHOPIFY_ACCESS_TOKEN no configuradas");
  }

  const response = await fetch(
    `https://${store}/admin/api/2024-10/products.json?limit=${limit}&status=active`,
    {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Error al obtener productos de Shopify: ${response.status}`);
  }

  const data = await response.json();
  return data.products;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string | null;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  status: string;
  product_type: string;
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string;
  inventory_quantity: number;
}

export interface ShopifyImage {
  id: number;
  src: string;
  alt: string | null;
}
