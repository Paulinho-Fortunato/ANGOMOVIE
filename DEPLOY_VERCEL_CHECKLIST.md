# Checklist Final Vercel (AngoMovie)

## 1. Vercel Project
- Importar repositório na Vercel.
- Confirmar Framework Preset: Vite.
- Build Command: `npm run build`.
- Output Directory: `dist`.
- Production Branch: `main`.

## 2. Domínio
- Em `Project Settings > Domains`, adicionar `angomovie.qzz.io`.
- No DNS do domínio `qzz.io`, criar `CNAME`:
- Host: `angomovie`
- Target: `cname.vercel-dns.com` (ou o valor exacto que a Vercel mostrar)
- Esperar propagação DNS e validar HTTPS activo.

## 3. Variáveis de Ambiente (Frontend)
- Em `Project Settings > Environment Variables`, configurar:
- `VITE_API_BASE=https://api.angomovie.qzz.io/api`
- `VITE_REQUEST_SIGNING_SECRET=<segredo-identico-ao-backend>`
- `VITE_SENTRY_DSN=<dsn-opcional>`
- `VITE_TMDB_FALLBACK_KEY=<opcional-para-fallback>`
- Aplicar para `Production`, `Preview` e `Development` conforme necessário.
- Fazer redeploy após alterar variáveis.

## 4. Backend Proxy (separado)
- Deploy do backend (`server/index.mjs`) num serviço próprio.
- Variáveis do backend:
- `TMDB_API_KEY=<chave-real-tmdb>`
- `REQUEST_SIGNING_SECRET=<mesmo-segredo-do-frontend>`
- `FRONTEND_ORIGIN=https://angomovie.qzz.io`
- `PORT=<porta-do-servico>`

## 5. CORS
- Backend deve aceitar apenas `https://angomovie.qzz.io` em produção.
- Não usar `*` em produção quando assinatura estiver activa.

## 6. Segurança (já coberta em `vercel.json`)
- CSP restritiva.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- `Referrer-Policy: no-referrer`.
- `Permissions-Policy` mínima.
- `HSTS` activo.

## 7. Cache e Performance
- Assets versionados com `Cache-Control: immutable`.
- Confirmar gzip/brotli activos na Vercel.
- Verificar `srcset/sizes` em mobile real.

## 8. Observabilidade
- Sentry configurado com `VITE_SENTRY_DSN` (opcional).
- Web Vitals enviados para `/api/observability/web-vitals`.
- Dashboard backend: `/api/monitor/dashboard`.

## 9. Validação Pós-Deploy
- Abrir `https://angomovie.qzz.io`.
- Testar busca, detalhes, player e downloads.
- Confirmar que não há erros críticos no console.
- Confirmar que endpoints `/api/tmdb/*` e `/api/player-url` respondem.
- Verificar métricas e falhas no dashboard de observabilidade.

## 10. CI/CD recomendado
- Executar build e E2E em PR para `main`.
- Só promover para produção com checks verdes.
