import { NextRequest, NextResponse } from "next/server";
import { updateExchangeRate } from "@/lib/exchange-rate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verificar autorización del cron job
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await updateExchangeRate();

    return NextResponse.json({
      success: true,
      rate: result.rate,
      fetchedAt: result.fetchedAt,
      validUntil: result.validUntil,
    });
  } catch (error) {
    console.error("Error actualizando tasa de cambio:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
