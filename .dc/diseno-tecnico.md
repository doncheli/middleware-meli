# Diseño Técnico — Middleware-Meli

## Stack

| Componente | Tecnología | Justificación |
|-----------|-----------|---------------|
| Framework | Next.js 14 (App Router) | Nativo en Vercel, SSR + API routes, excelente DX |
| Lenguaje | TypeScript | Type safety para manejo de montos/pagos |
| BD | Vercel Postgres (Neon) | Serverless, sin gestión de infra |
| Cache | Vercel KV (Redis) | Cache de tasa de cambio, rate limiting |
| ORM | Prisma | Type-safe queries, migraciones |
| Cron | Vercel Cron Jobs | Actualización de tasa 2x/día |
| Exchange API | exchangerate-api.com | Fiable, actualización diaria, plan free 1500 req/mes |

## Arquitectura

```
                         ┌─────────────────────────────────┐
                         │           VERCEL                 │
                         │                                  │
┌──────────┐  webhook    │  ┌────────────────────────┐      │
│ Shopify  │────────────▶│  │  /api/payments/process │      │
│ Checkout │             │  │  (Payment Middleware)   │      │
└──────────┘             │  └───────────┬────────────┘      │
                         │              │                    │
                         │              ▼                    │
                         │  ┌────────────────────────┐      │     ┌──────────────┐
                         │  │  Exchange Rate Service  │◀────▶│────▶│ exchangerate  │
                         │  │  (Vercel KV cache)      │      │     │ -api.com     │
                         │  └───────────┬────────────┘      │     └──────────────┘
                         │              │                    │
                         │              ▼                    │
                         │  ┌────────────────────────┐      │     ┌──────────────┐
                         │  │  /api/payments/create   │─────▶│────▶│ MercadoPago  │
                         │  │  (MP Payment Creator)   │      │     │ API REST     │
                         │  └────────────────────────┘      │     └──────────────┘
                         │                                  │
                         │  ┌────────────────────────┐      │
                         │  │  /api/cron/update-rate  │      │  Cron: 07:00, 18:00 COT
                         │  │  (Scheduled Job)        │      │
                         │  └────────────────────────┘      │
                         │                                  │
                         │  ┌────────────────────────┐      │
                         │  │  /api/feeds/facebook    │      │  Catálogo FB + IG
                         │  │  /api/feeds/tiktok      │      │  Feed TikTok Shop
                         │  │  /api/feeds/mercadolibre│      │  Feed compatible MeLi
                         │  └────────────────────────┘      │
                         │                                  │
                         │  ┌────────────────────────┐      │
                         │  │  Vercel Postgres        │      │
                         │  │  - exchange_rates       │      │
                         │  │  - transactions         │      │
                         │  │  - products_cache       │      │
                         │  └────────────────────────┘      │
                         └─────────────────────────────────┘
```

## Modelo de Datos (Prisma)

### exchange_rates
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | PK |
| from_currency | String | "USD" |
| to_currency | String | "COP" |
| rate | Decimal(12,4) | Tasa de conversión |
| source | String | "exchangerate-api.com" |
| fetched_at | DateTime | Momento de la consulta |
| valid_until | DateTime | Hasta cuándo es válida |

### transactions
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | PK |
| shopify_order_id | String | ID de orden Shopify |
| amount_usd | Decimal(10,2) | Monto original USD |
| exchange_rate | Decimal(12,4) | Tasa usada |
| amount_cop | Decimal(12,0) | Monto convertido COP |
| mp_payment_id | String? | ID de pago en MercadoPago |
| status | Enum | pending/approved/rejected/refunded |
| created_at | DateTime | Timestamp |
| updated_at | DateTime | Timestamp |

### products_cache
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | PK |
| shopify_product_id | String | ID producto Shopify |
| title | String | Nombre del producto |
| price_usd | Decimal(10,2) | Precio en USD |
| price_cop | Decimal(12,0) | Precio convertido a COP |
| last_synced | DateTime | Última sincronización |

## Flujos Principales

### Flujo 1: Pago vía Checkout
1. Cliente completa checkout en Shopify (precio en USD)
2. Shopify envía webhook `payment_sessions/create` al middleware
3. Middleware obtiene tasa actual de Vercel KV (cache)
4. Convierte `amount_usd × rate = amount_cop` (redondeo a entero)
5. Crea preferencia de pago en MercadoPago API con `amount_cop`
6. Retorna URL de pago o redirect
7. MercadoPago notifica resultado → webhook `/api/payments/webhook`
8. Middleware actualiza estado en Shopify vía `payment_sessions/resolve`

### Flujo 2: Actualización de Tasa
1. Vercel Cron dispara `/api/cron/update-rate` a las 07:00 y 18:00 COT
2. Consulta exchangerate-api.com: USD→COP
3. Guarda en `exchange_rates` (Postgres) como registro histórico
4. Actualiza Vercel KV con tasa vigente + TTL 12h
5. Regenera precios COP en `products_cache`

### Flujo 3: Feeds de Precio
1. Request GET a `/api/feeds/{canal}` (FB, TikTok, MeLi)
2. Lee productos de Shopify (cache o API)
3. Aplica tasa vigente → precio en COP
4. Retorna feed en formato específico del canal:
   - **Facebook/Instagram**: XML (Atom) con `g:price` en COP
   - **TikTok Shop**: CSV con columnas requeridas
   - **MercadoLibre**: JSON con precio entero sin decimales

## Formatos de Precio por Canal

| Canal | Formato | Decimales | Ejemplo |
|-------|---------|-----------|---------|
| MercadoPago | Número | 0 | `259900` (COP) |
| Facebook/IG | String | 2 | `"259900.00 COP"` |
| TikTok Shop | Número | 0 | `259900` |
| MercadoLibre | Entero | 0 | `259900` |

## Regla de Redondeo COP
- COP no usa decimales en comercio
- Redondeo: `Math.round(usd * rate / 100) * 100` → redondeo a centena más cercana
- Ejemplo: USD 65.00 × 4150.25 = COP 269,766.25 → **COP 269,800**

## Variables de Entorno

```env
# Shopify
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_STORE_DOMAIN=
SHOPIFY_ACCESS_TOKEN=

# MercadoPago
MP_ACCESS_TOKEN=
MP_PUBLIC_KEY=

# Exchange Rate
EXCHANGE_RATE_API_KEY=

# Database (auto-provisto por Vercel)
POSTGRES_URL=
KV_REST_API_URL=
KV_REST_API_TOKEN=

# App
CRON_SECRET=
NEXT_PUBLIC_APP_URL=
```

## Seguridad
- Validar HMAC en webhooks de Shopify
- Validar firma en webhooks de MercadoPago
- `CRON_SECRET` para proteger endpoints de cron
- Rate limiting en endpoints públicos (feeds)
- Nunca exponer claves API en cliente
