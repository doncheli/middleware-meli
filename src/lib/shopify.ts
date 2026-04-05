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

function getShopifyConfig() {
  const store = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!store || !token) {
    throw new Error("SHOPIFY_STORE_DOMAIN o SHOPIFY_ACCESS_TOKEN no configuradas");
  }
  return { store, token };
}

/**
 * Marca una orden como pagada en Shopify creando una transacción de pago.
 */
export async function markOrderAsPaid(params: {
  orderId: string;
  amountCop: number;
  mpPaymentId: string;
}): Promise<void> {
  const { store, token } = getShopifyConfig();
  const { orderId, mpPaymentId } = params;

  // Primero obtenemos la orden para verificar su estado
  const orderRes = await fetch(
    `https://${store}/admin/api/2024-10/orders/${orderId}.json`,
    {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    }
  );

  if (!orderRes.ok) {
    throw new Error(`Error obteniendo orden ${orderId}: ${orderRes.status}`);
  }

  const orderData = await orderRes.json();
  const order = orderData.order;

  // Si ya está pagada, no hacer nada
  if (order.financial_status === "paid") {
    console.log(`Orden ${orderId} ya está marcada como pagada`);
    return;
  }

  // Crear transacción de pago manual
  const transactionRes = await fetch(
    `https://${store}/admin/api/2024-10/orders/${orderId}/transactions.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: {
          kind: "capture",
          status: "success",
          amount: order.total_price,
          currency: order.currency,
          gateway: "MercadoPago (COP)",
          source: "external",
          authorization: mpPaymentId,
        },
      }),
    }
  );

  if (!transactionRes.ok) {
    const text = await transactionRes.text();
    throw new Error(`Error creando transacción en orden ${orderId}: ${transactionRes.status} - ${text}`);
  }
}

/**
 * Agrega una nota a la orden con detalles de la conversión.
 */
export async function addOrderNote(params: {
  orderId: string;
  note: string;
}): Promise<void> {
  const { store, token } = getShopifyConfig();

  const response = await fetch(
    `https://${store}/admin/api/2024-10/orders/${params.orderId}.json`,
    {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order: {
          id: params.orderId,
          note: params.note,
        },
      }),
    }
  );

  if (!response.ok) {
    console.error(`Error agregando nota a orden ${params.orderId}: ${response.status}`);
  }
}

/**
 * Obtiene productos de la tienda Shopify vía REST API.
 */
export async function getShopifyProducts(limit = 250): Promise<ShopifyProduct[]> {
  const { store, token } = getShopifyConfig();

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

export interface ShopifyOrder {
  id: number;
  name: string;
  email: string;
  total_price: string;
  currency: string;
  financial_status: string;
  line_items: {
    id: number;
    title: string;
    quantity: number;
    price: string;
  }[];
  customer?: {
    email: string;
    first_name: string;
    last_name: string;
  };
}
