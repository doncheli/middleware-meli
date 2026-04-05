# Propuesta: Middleware Shopify → MercadoPago + Feeds COP

## Intención
Resolver la limitación de la integración nativa Shopify-MercadoPago que envía montos en USD sin convertir a COP, y unificar precios en COP para todos los canales de venta social.

## Problema
- Shopify envía el checkout en USD a MercadoPago → los cobros fallan o son incorrectos
- Los catálogos de redes sociales (FB, IG, TikTok) necesitan precios en COP
- MercadoLibre requiere precios en COP sincronizados

## Alcance

### Módulo 1: Payment Middleware (Shopify → MercadoPago)
- **Shopify Payment App** privada que intercepta el checkout
- Consulta tasa de cambio USD→COP en tiempo real (Open Exchange Rates o similar)
- Convierte el monto y envía payload correcto a la API REST de MercadoPago
- Manejo de webhooks de confirmación/rechazo de pago
- Reconciliación de órdenes entre Shopify y MercadoPago

### Módulo 2: Price Feed Multi-Canal (COP)
- Generación de feeds de productos con precios convertidos a COP
- **Facebook Catalog** (FB Marketplace + Instagram Shop)
- **TikTok Shop** feed
- **MercadoLibre** sincronización de precios
- Actualización automática cuando cambia la tasa de cambio
- Formato compatible con cada plataforma (CSV/XML/JSON según requiera)

## Componentes Técnicos

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Shopify    │────▶│   Middleware      │────▶│  MercadoPago │
│  Checkout    │     │  (Payment App)    │     │  API REST    │
└─────────────┘     └────────┬─────────┘     └──────────────┘
                             │
                    ┌────────▼─────────┐
                    │  Exchange Rate    │
                    │  Service (cache)  │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
      ┌──────────┐   ┌──────────┐   ┌──────────┐
      │ FB/IG    │   │ TikTok   │   │ MeLi     │
      │ Feed COP │   │ Feed COP │   │ Sync COP │
      └──────────┘   └──────────┘   └──────────┘
```

## Decisiones Pendientes
1. **Stack técnico** — Node.js + Shopify CLI? Python + Flask? Otro?
2. **Hosting** — Heroku, Railway, Fly.io, VPS propio?
3. **API de tasa de cambio** — Open Exchange Rates, exchangerate-api, Banco de la República?
4. **Frecuencia de actualización** de tasa — Cada hora? Cada 15 min? Por transacción?
5. **MercadoLibre** — ¿Solo precios o también sincronización de inventario/órdenes?
6. **TikTok Shop** — ¿Ya tienen cuenta de TikTok Shop habilitada para Colombia?

## Riesgos
- Las Payment Apps de Shopify requieren aprobación y certificación
- Volatilidad de tasa de cambio puede generar discrepancias
- Rate limits de las APIs de cada plataforma
- Cada red social tiene su propio formato de feed y proceso de aprobación

## Enfoque Propuesto
1. Empezar por el **Exchange Rate Service** (componente compartido)
2. Luego el **Payment Middleware** (módulo crítico de negocio)
3. Después los **feeds de precio** (FB → TikTok → MeLi)
4. Cada módulo con tests y validación antes de avanzar al siguiente
