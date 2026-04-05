# Plan de Proyecto — Middleware-Meli

## Fase 1: Scaffolding + Exchange Rate Service
- Estado: `pendiente`
- **Tareas:**
  - [ ] Inicializar proyecto Next.js 14 + TypeScript
  - [ ] Configurar Prisma + schema de BD
  - [ ] Configurar Vercel KV
  - [ ] Implementar servicio de tasa de cambio (fetch + cache)
  - [ ] Endpoint cron `/api/cron/update-rate`
  - [ ] Tests unitarios del servicio de conversión
  - [ ] Configurar vercel.json con cron schedule

## Fase 2: Payment Middleware (Shopify → MercadoPago)
- Estado: `pendiente`
- **Tareas:**
  - [ ] Configurar Shopify Payment App (partner dashboard)
  - [ ] Endpoint `/api/payments/process` — recibir webhook de Shopify
  - [ ] Lógica de conversión USD→COP con tasa vigente
  - [ ] Integración con MercadoPago API REST — crear preferencia
  - [ ] Endpoint `/api/payments/webhook` — recibir notificación MP
  - [ ] Resolución de sesión de pago en Shopify
  - [ ] Manejo de errores y reintentos
  - [ ] Tests de integración
  - [ ] Registro de transacciones en BD

## Fase 3: Feeds de Precio Multi-Canal
- Estado: `pendiente`
- **Tareas:**
  - [ ] Servicio compartido: obtener productos Shopify + convertir precios
  - [ ] Feed Facebook Catalog (XML Atom) — `/api/feeds/facebook`
  - [ ] Feed TikTok Shop (CSV) — `/api/feeds/tiktok`
  - [ ] Feed MercadoLibre (JSON) — `/api/feeds/mercadolibre`
  - [ ] Cache de productos con invalidación
  - [ ] Tests de formato por canal
  - [ ] Documentar URLs de feeds para configurar en cada plataforma

## Fase 4: Testing, Seguridad y Deploy
- Estado: `pendiente`
- **Tareas:**
  - [ ] Validación HMAC webhooks Shopify
  - [ ] Validación firma webhooks MercadoPago
  - [ ] Rate limiting en feeds públicos
  - [ ] Test E2E flujo completo de pago
  - [ ] Test E2E generación de feeds
  - [ ] Variables de entorno en Vercel
  - [ ] Deploy a producción
  - [ ] Smoke tests post-deploy
