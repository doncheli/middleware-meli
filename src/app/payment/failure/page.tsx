export default function PaymentFailure() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-red-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
        <div className="text-6xl mb-4">❌</div>
        <h1 className="text-2xl font-bold text-red-700 mb-2">
          Pago Rechazado
        </h1>
        <p className="text-gray-600 mb-6">
          Tu pago no pudo ser procesado. Por favor verifica los datos de tu
          medio de pago e intenta nuevamente.
        </p>
        <a
          href={process.env.NEXT_PUBLIC_SHOP_URL || "/"}
          className="inline-block bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition"
        >
          Volver a la tienda
        </a>
      </div>
    </main>
  );
}
