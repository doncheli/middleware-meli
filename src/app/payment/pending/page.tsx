export default function PaymentPending() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-yellow-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
        <div className="text-6xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold text-yellow-700 mb-2">
          Pago Pendiente
        </h1>
        <p className="text-gray-600 mb-6">
          Tu pago está siendo procesado por MercadoPago. Te notificaremos por
          correo electrónico cuando se confirme.
        </p>
        <a
          href={process.env.NEXT_PUBLIC_SHOP_URL || "/"}
          className="inline-block bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 transition"
        >
          Volver a la tienda
        </a>
      </div>
    </main>
  );
}
