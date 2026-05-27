# 🎬 AngoMovie — Plataforma de Streaming de Angola

> Versão 100% gratuita, sem login obrigatório, focada em alta performance, segurança, acessibilidade e suporte a ligações e telemóveis de gama baixa.

---

## 🌟 Visão Geral

O **AngoMovie** foi projectado de raiz para o contexto angolano:
- **100% Gratuito:** Sem paywalls, sem planos de assinatura e sem conteúdo bloqueado.
- **Sustentabilidade:** Suportado de forma totalmente voluntária via **Multicaixa Express** e banners não intrusivos.
- **Foco em Segurança:** Arquitectura baseada no OWASP Top 10 — sem `innerHTML` directo não sanitizado, protecção rígida de iframes de reprodutores e zero dados sensíveis guardados localmente.
- **Performance de Topo:** Implementa Framer Motion com fallback para `prefers-reduced-motion`, cache avançada e modo de **Dados Reduzidos** nativo.

---

## 🏗️ Arquitectura & Estrutura

O projecto segue uma arquitectura moderna baseada no **Clean Code** e separação de responsabilidades:

```text
angomovie/
├── .github/workflows/
│   └── ci.yml                # CI de Build + Testes E2E (Playwright)
├── public/
│   ├── sitemap.xml           # Sitemap Estático Oficial
│   └── robots.txt            # Regras para Motores de Busca
├── server/
│   └── index.mjs             # Backend Proxy Seguro (Node + Express)
├── src/
│   ├── App.tsx               # Aplicação Central, Catálogos e Modais
│   ├── index.css             # Design System, Variáveis e Tailwind
│   ├── main.tsx              # Ponto de Entrada da Aplicação
│   └── observabilidade.ts    # Sentry, Web Vitals e Service Worker
├── tests/e2e/
│   └── critical-flows.spec.ts # Testes de Fluxo Crítico Pós-Deploy
├── vercel.json               # Regras de Segurança, HSTS, CSP para a Vercel
└── DEPLOY_VERCEL_CHECKLIST.md # Checklist Exaustivo de Publicação
```

---

## 🚀 Funcionalidades de Destaque

1. **Reprodutor Integrado em Popup:**
   - Iframe seguro apontado nativamente para os servidores do provider com parâmetros dinâmicos.
   - Alternância imediata entre **Servidores Recomendados** e **Servidores Alternativos** sem perder o contexto.
   - Ajuste opcional de **Qualidade de Vídeo** (Auto, 480p, 720p, 1080p).

2. **Sincronização & Persistência Local:**
   - **Continuar a Ver:** Estima com precisão a posição visualizada por filme e episódio para retoma sem necessidade de conta.
   - **Os Meus Favoritos:** Guardados localmente no dispositivo.
   - **Lista para Ver Depois:** Fila separada e intuitiva.

3. **Modos de Exibição & UX:**
   - **Tema Duplo:** Alterna instantaneamente entre o **Cinema Escuro** e a **Noite Dourada** (tema de alto contraste e brilho).
   - **Modo Dados Reduzidos (Lite 3G):** Desliga os efeitos pesados (glass/blur), desactiva animações e força a solicitação de imagens menores nativamente para telemóveis de gama baixa.
   - **Navegação por Teclado:** Controle de foco de topo via setas e teclas globais (`/`, `Esc`, `?`).

---

## ⚙️ Variáveis de Ambiente

Para o correcto funcionamento em **Produção**, deves definir as seguintes variáveis:

### No Backend (Servidor Node)
- `TMDB_API_KEY` — A tua chave privada de acesso à API TheMovieDB.
- `REQUEST_SIGNING_SECRET` — Uma string ou palavra-passe secreta usada para assinar criptograficamente os pedidos vindos do frontend (evita abusos na tua chave TMDB).
- `FRONTEND_ORIGIN` — A origem autorizada em produção (ex.: `https://angomovie.qzz.io`).
- `PORT` — A porta local do serviço (padrão: `8787`).

### No Frontend (Vercel)
- `VITE_API_BASE` — O endpoint base do teu backend (ex.: `https://api.angomovie.qzz.io/api`).
- `VITE_REQUEST_SIGNING_SECRET` — O mesmo segredo configurado no backend para a geração do cabeçalho HMAC.
- `VITE_SENTRY_DSN` — (Opcional) DSN do Sentry para recolha de erros e monitorização.

---

## 📦 Como Desenvolver Localmente

1. **Instalar as dependências:**
   ```bash
   npm install
   ```

2. **Correr o servidor de desenvolvimento Frontend:**
   ```bash
   npm run dev
   ```

3. **Correr o Backend Proxy Local (num terminal separado):**
   ```bash
   export TMDB_API_KEY="tua-chave-aqui"
   node server/index.mjs
   ```

4. **Compilar para Produção:**
   ```bash
   npm run build
   ```

5. **Executar Testes E2E (Playwright):**
   ```bash
   npx playwright test
   ```

---

## 🛡️ Aspectos de Segurança Implementados

- **Zero InnerHTML Directo:** Todos os valores provindos de respostas remotas passam exclusivamente por rotinas de texto estritas ou pela função `escaparHTML()`.
- **Validação de Origens de Iframe:** Protegido contra manipulações externas garantindo apenas a renderização de instâncias validadas.
- **CSP & HSTS Configuradas:** Definido nativamente ao nível do adaptador de publicação para a Vercel (`vercel.json`) impedindo *Clickjacking* e interceptação de tráfego.

---

## 🇦🇴 Feito com 💛 para Angola
Qualquer melhoria, sugestão ou contribuição é sempre bem-vinda para manter a plataforma estável, acessível e sustentável!
