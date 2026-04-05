import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Callback OAuth de Shopify.
 * Recibe el código de autorización y lo intercambia por un Access Token.
 * MUESTRA el token en pantalla para que lo copies a Vercel.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const shop = request.nextUrl.searchParams.get("shop");

  if (!code || !shop) {
    return NextResponse.json(
      { error: "Parámetros code y shop requeridos" },
      { status: 400 }
    );
  }

  const clientId = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "SHOPIFY_API_KEY y SHOPIFY_API_SECRET deben estar configuradas en Vercel" },
      { status: 500 }
    );
  }

  // Intercambiar código por Access Token
  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    return NextResponse.json(
      { error: "Error obteniendo token", detail: errorText },
      { status: 500 }
    );
  }

  const tokenData = await tokenResponse.json();

  // Mostrar el token para que el usuario lo copie
  const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Middleware MeLi - Access Token</title></head>
    <body style="font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px;">
      <h1 style="color: #16a34a;">✅ App instalada correctamente</h1>
      <p>Copia este Access Token y agrégalo como variable de entorno <code>SHOPIFY_ACCESS_TOKEN</code> en Vercel:</p>
      <div style="background: #1e1e1e; color: #4ade80; padding: 16px; border-radius: 8px; font-family: monospace; word-break: break-all; font-size: 14px;">
        ${tokenData.access_token}
      </div>
      <p style="margin-top: 16px;"><strong>Shop:</strong> ${shop}</p>
      <p><strong>Scopes:</strong> ${tokenData.scope}</p>
      <p style="color: #dc2626; margin-top: 24px;">⚠️ Este token solo se muestra una vez. Cópialo ahora.</p>
      <p style="margin-top: 24px;">Después de guardarlo en Vercel, este endpoint dejará de ser necesario.</p>
    </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
