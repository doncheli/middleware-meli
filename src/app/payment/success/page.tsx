export default function PaymentSuccess() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-green-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-green-700 mb-2">
          Pago Exitoso
        </h1>
        <p className="text-gray-600 mb-6">
          Tu pago ha sido procesado correctamente a través de MercadoPago.
          Recibirás un correo de confirmación con los detalles de tu orden.
        </p>
        <a
          href={process.env.NEXT_PUBLIC_SHOP_URL || "/"}
          className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition"
        >
          Volver a la tienda
        </a>
      </div>
    </main>
  );
}
