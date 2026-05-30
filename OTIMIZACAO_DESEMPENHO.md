# 🚀 Sugestões de Melhoria e Otimização de Desempenho

## 📋 Resumo Executivo

Este documento apresenta recomendações técnicas para otimizar o desempenho, segurança e manutenibilidade da aplicação AngoMovie (React + Vite + TailwindCSS).

---

## ⚡ 1. Otimizações de Desempenho Críticas

### 1.1 Memoização de Componentes

**Problema:** O componente `SecaoCatalogo` e outros componentes funcionais são recriados a cada renderização, causando renders desnecessários.

**Solução:** Aplicar `React.memo()` e `useCallback()` estrategicamente.

```tsx
// ANTES (linha ~1747)
function SecaoCatalogo(props: PropriedadesSecao) {
  // ...
}

// DEPOIS
const SecaoCatalogo = React.memo(function SecaoCatalogo(props: PropriedadesSecao) {
  const tamanhoPoster = props.reduzMovimento ? "w185" : "w342";

  const gerirNavegacaoTeclado = useCallback((
    evento: KeyboardEvent<HTMLButtonElement>, 
    indice: number, 
    item: ItemConteudo
  ): void => {
    // ... lógica existente
  }, [props.id, props.estado.lista.length, props.onDetalhes]);

  // ... resto do código
}, (prevProps, nextProps) => {
  // Custom comparison para evitar renders desnecessários
  return (
    prevProps.id === nextProps.id &&
    prevProps.titulo === nextProps.titulo &&
    prevProps.estado.aCarregar === nextProps.estado.aCarregar &&
    prevProps.estado.lista.length === nextProps.estado.lista.length &&
    prevProps.reduzMovimento === nextProps.reduzMovimento
  );
});
```

### 1.2 Otimização de Event Handlers no App Principal

**Problema:** Funções criadas inline no componente `App` causam re-renders em cascata.

**Solução:** Usar `useCallback` para todas as funções passadas como props.

```tsx
// Adicionar no início do componente App (após os useState)
const verificarFavorito = useCallback((id: number): boolean => {
  return favoritos.some((f) => f.id === String(id));
}, [favoritos]);

const verificarVisto = useCallback((id: number): boolean => {
  return historico.some((h) => h.id === String(id));
}, [historico]);

const verificarVerDepois = useCallback((id: number): boolean => {
  return verDepois.some((v) => v.id === String(id));
}, [verDepois]);

const lidarComDetalhes = useCallback((item: ItemConteudo): void => {
  setModalDetalhes({
    aberto: true,
    tipo: item.media_type === "tv" || item.media_type === "person" ? "tv" : "movie",
    item,
    aCarregar: true,
    erro: ""
  });
}, []);

const lidarComPrefetch = useCallback((item: ItemConteudo): void => {
  if (!item.id || cachePrefetch.current.has(String(item.id))) return;
  cachePrefetch.current.add(String(item.id));
  
  const tipo = item.media_type === "tv" || item.media_type === "person" ? "tv" : "movie";
  void pedidoTMDB(`/${tipo}/${item.id}`).catch(() => undefined);
}, []);
```

### 1.3 Virtualização de Listas Longas

**Problema:** Renderizar todos os itens de uma lista grande (6+ colunas × múltiplas páginas) pode causar lentidão.

**Solução:** Implementar virtualização para listas com mais de 50 itens.

```bash
npm install @tanstack/react-virtual
```

```tsx
// Em SecaoCatalogo, substituir o mapeamento direto por:
import { useVirtualizer } from '@tanstack/react-virtual';

const paiRef = useRef<HTMLDivElement>(null);
const virtualizador = useVirtualizer({
  count: props.estado.lista.length,
  getScrollElement: () => paiRef.current,
  estimateSize: () => 300, // altura estimada de cada card
  overscan: 3
});

// Renderizar apenas itens visíveis
{virtualizador.getVirtualItems().map((virtualItem) => {
  const item = props.estado.lista[virtualItem.index];
  return (
    <div
      key={`${props.id}-${item.id}`}
      style={{
        height: `${virtualItem.size}px`,
        transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`
      }}
    >
      {/* conteúdo do card */}
    </div>
  );
})}
```

### 1.4 Lazy Loading de Imagens Otimizado

**Problema:** Embora já exista `loading="lazy"`, pode-se melhorar com Intersection Observer.

**Solução:** Implementar componente de imagem com lazy loading avançado.

```tsx
// src/components/ImagemLazy.tsx
import { useEffect, useRef, useState } from 'react';

interface Props {
  src: string;
  srcSet?: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
}

export function ImagemLazy({ src, srcSet, alt, className, width, height }: Props) {
  const [carregada, setCarregada] = useState(false);
  const [erro, setErro] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting && ref.current) {
          if (srcSet) ref.current.srcset = srcSet;
          ref.current.src = src;
          observador.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    if (ref.current) observador.observe(ref.current);
    return () => observador.disconnect();
  }, [src, srcSet]);

  if (erro) {
    return (
      <div className={className} style={{ width, height }}>
        <div className="w-full h-full bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
          <span className="text-xs text-gray-500">Imagem indisponível</span>
        </div>
      </div>
    );
  }

  return (
    <img
      ref={ref}
      alt={alt}
      className={`${className} ${!carregada ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}`}
      width={width}
      height={height}
      onLoad={() => setCarregada(true)}
      onError={() => setErro(true)}
    />
  );
}
```

---

## 🔧 2. Melhorias de Arquitetura

### 2.1 Extração de Componentes

**Problema:** O arquivo `App.tsx` tem ~2000 linhas, violando o princípio de responsabilidade única.

**Solução:** Dividir em componentes menores.

```
src/
├── components/
│   ├── Cabecalho.tsx
│   ├── Hero.tsx
│   ├── SecaoCatalogo.tsx
│   ├── CartaoConteudo.tsx
│   ├── ModalDetalhes.tsx
│   ├── ModalPlayer.tsx
│   ├── ModalDownload.tsx
│   ├── BarraProgresso.tsx
│   └── Layout.tsx
├── hooks/
│   ├── useArmazenamento.ts
│   ├── usePlayer.ts
│   ├── useBusca.ts
│   └── useFavoritos.ts
├── utils/
│   ├── tmdb.ts
│   ├── formatacao.ts
│   └── validacao.ts
└── types/
    └── index.ts
```

### 2.2 Custom Hooks para Lógica Reutilizável

```tsx
// src/hooks/useArmazenamento.ts
import { useState, useEffect, useCallback } from 'react';

export function useArmazenamento<T>(chave: string, valorPadrao: T) {
  const [valor, setValor] = useState<T>(() => {
    try {
      const bruto = localStorage.getItem(`angomovie_v2_${chave}`);
      return bruto ? JSON.parse(bruto) : valorPadrao;
    } catch {
      return valorPadrao;
    }
  });

  useEffect(() => {
    localStorage.setItem(`angomovie_v2_${chave}`, JSON.stringify(valor));
  }, [chave, valor]);

  const atualizar = useCallback((novoValor: T | ((prev: T) => T)) => {
    setValor(prev => typeof novoValor === 'function' 
      ? (novoValor as (p: T) => T)(prev) 
      : novoValor
    );
  }, []);

  const remover = useCallback(() => {
    localStorage.removeItem(`angomovie_v2_${chave}`);
    setValor(valorPadrao);
  }, [chave, valorPadrao]);

  return [valor, atualizar, remover] as const;
}
```

```tsx
// src/hooks/useBusca.ts
import { useState, useCallback, useRef, useEffect } from 'react';

interface ResultadoBusca {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  media_type?: string;
}

export function useBusca() {
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const debounceRef = useRef<NodeJS.Timeout>();

  const buscar = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResultados([]);
      return;
    }

    setCarregando(true);
    setErro('');

    try {
      const resposta = await fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(query)}&language=pt-BR&page=1`);
      if (!resposta.ok) throw new Error('Falha na busca');
      
      const dados = await resposta.json();
      const filtrados = (dados.results || []).filter(
        (item: any) => item.media_type === 'movie' || item.media_type === 'tv'
      );
      setResultados(filtrados);
    } catch {
      setErro('Não foi possível realizar a busca.');
      setResultados([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  const debouncedBuscar = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscar(query), 400);
  }, [buscar]);

  useEffect(() => {
    debouncedBuscar(termo);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [termo, debouncedBuscar]);

  return { termo, setTermo, resultados, carregando, erro };
}
```

---

## 🌐 3. Otimizações de Rede e Cache

### 3.1 Implementar Service Worker para Cache

**Problema:** A função `registarServiceWorker()` referencia `/sw.js` que não existe.

**Solução:** Criar service worker com estratégias de cache modernas.

```js
// public/sw.js
const CACHE_NAME = 'angomovie-v1';
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 dias

const urlsParaCachear = [
  '/',
  '/index.html',
  '/robots.txt',
  '/sitemap.xml'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsParaCachear))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) => {
      return Promise.all(
        nomes.filter((nome) => nome !== CACHE_NAME).map((nome) => caches.delete(nome))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);

  // Imagens TMDB: Cache-first
  if (url.hostname === 'image.tmdb.org') {
    evento.respondWith(
      caches.match(evento.request).then((resposta) => {
        if (resposta) {
          // Atualizar em background
          fetch(evento.request).then((novaResposta) => {
            if (novaResposta.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, novaResposta));
            }
          }).catch(() => {});
          return resposta;
        }
        return fetch(evento.request).then((novaResposta) => {
          if (novaResposta.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, novaResposta));
          }
          return novaResposta;
        });
      })
    );
    return;
  }

  // API TMDB: Network-first com fallback
  if (url.pathname.startsWith('/api/tmdb')) {
    evento.respondWith(
      fetch(evento.request)
        .then((resposta) => {
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia));
          }
          return resposta;
        })
        .catch(() => caches.match(evento.request))
    );
    return;
  }

  // Padrão: Stale-while-revalidate
  evento.respondWith(
    caches.match(evento.request).then((respostaCache) => {
      const fetchPromise = fetch(evento.request).then((redeResposta) => {
        if (redeResposta.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, redeResposta.clone()));
        }
        return redeResposta;
      }).catch(() => respostaCache);

      return respostaCache || fetchPromise;
    })
  );
});
```

### 3.2 Prefetch Inteligente

**Problema:** O prefetch atual é básico e pode desperdiçar largura de banda.

**Solução:** Implementar prefetch baseado em intenção do usuário.

```tsx
// src/utils/prefetch.ts
const cachePrefetch = new Map<string, Promise<any>>();
const MAX_CACHE_SIZE = 20;

export function prefetchedComIntencao(
  endpoint: string, 
  opcoes: RequestInit = {}
): Promise<any> {
  if (cachePrefetch.has(endpoint)) {
    return cachePrefetch.get(endpoint)!;
  }

  const promessa = fetch(endpoint, opcoes)
    .then(r => r.json())
    .finally(() => {
      if (cachePrefetch.size >= MAX_CACHE_SIZE) {
        const primeiraChave = cachePrefetch.keys().next().value;
        cachePrefetch.delete(primeiraChave);
      }
    });

  cachePrefetch.set(endpoint, promessa);
  return promessa;
}

// Hook para prefetch baseado em hover
export function usePrefetchOnHover(url: string) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;

    let timeout: NodeJS.Timeout;

    const handleMouseEnter = () => {
      timeout = setTimeout(() => {
        void prefetchedComIntencao(url);
      }, 100); // Aguarda 100ms para confirmar intenção
    };

    const handleMouseLeave = () => {
      clearTimeout(timeout);
    };

    elemento.addEventListener('mouseenter', handleMouseEnter);
    elemento.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      elemento.removeEventListener('mouseenter', handleMouseEnter);
      elemento.removeEventListener('mouseleave', handleMouseLeave);
      clearTimeout(timeout);
    };
  }, [url]);

  return ref;
}
```

---

## 🎨 4. Otimizações de Build

### 4.1 Configuração Vite Otimizada

```ts
// vite.config.ts
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          ['babel-plugin-react-compiler', {}], // React Compiler para memoização automática
        ],
      },
    }), 
    tailwindcss(), 
    viteSingleFile()
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'framer-motion': ['framer-motion'],
          'utils': ['./src/utils/cn', './src/utils/download-handler']
        }
      }
    },
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'framer-motion'],
  },
});
```

### 4.2 Análise de Bundle

```bash
# Instalar plugin de análise
npm install --save-dev rollup-plugin-visualizer

# Adicionar ao vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    // ...outros plugins
    visualizer({ open: true, filename: 'dist/stats.html' })
  ]
});
```

---

## 🔒 5. Melhorias de Segurança

### 5.1 Validação de Inputs Reforçada

```tsx
// src/utils/validacao.ts
import { z } from 'zod';

export const schemaBusca = z.string()
  .min(1, 'Busca vazia')
  .max(100, 'Busca muito longa')
  .regex(/^[\p{L}\p{N}\s\-_'.,:!?]+$/u, 'Caracteres inválidos')
  .refine(s => !/<|>|script|javascript|onerror|onload/i.test(s), 'Conteúdo malicioso detectado');

export const schemaIdTMDB = z.number()
  .int()
  .positive()
  .max(10_000_000);

export const schemaUrlEmbed = z.string()
  .url()
  .refine(url => url.startsWith('https://'), 'Apenas HTTPS permitido')
  .refine(url => {
    const hostname = new URL(url).hostname;
    return ['myembed.biz', 'www.myembed.biz'].includes(hostname);
  }, 'Origem não permitida');
```

### 5.2 Rate Limiting no Cliente

```tsx
// src/hooks/useRateLimit.ts
import { useRef, useCallback } from 'react';

export function useRateLimit<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
  maxExecutions: number
): T {
  const execucoesRef = useRef<{ timestamp: number }[]>([]);

  return useCallback((...args: Parameters<T>) => {
    const agora = Date.now();
    execucoesRef.current = execucoesRef.current.filter(
      (e) => agora - e.timestamp < delay
    );

    if (execucoesRef.current.length >= maxExecutions) {
      console.warn('Rate limit excedido');
      return;
    }

    execucoesRef.current.push({ timestamp: agora });
    return fn(...args);
  }, [fn, delay, maxExecutions]) as T;
}

// Uso:
const buscarComRateLimit = useRateLimit(buscar, 1000, 5); // Máx 5 buscas por segundo
```

---

## 📊 6. Monitoramento e Métricas

### 6.1 Web Vitals Aprimorado

```ts
// src/observabilidade.ts
import * as Sentry from "@sentry/react";
import { onCLS, onINP, onLCP, onFCP, onTTFB, type Metric } from "web-vitals";

function enviarMetrica(metrica: Metric): void {
  const corpo = {
    nome: metrica.name,
    valor: metrica.value,
    id: metrica.id,
    url: window.location.pathname,
    userAgent: navigator.userAgent,
    effectiveConnectionType: navigator.connection?.effectiveType,
    deviceMemory: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency
  };

  // Enviar para backend
  fetch("/api/observability/web-vitals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    keepalive: true
  }).catch(() => {});

  // Reportar para Sentry
  Sentry.addBreadcrumb({
    category: 'web-vital',
    message: metrica.name,
    data: corpo,
    level: 'info'
  });
}

export function iniciarObservabilidade(): void {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const dsn = env?.VITE_SENTRY_DSN;
  const ambiente = env?.VITE_ENV ?? 'development';

  if (dsn) {
    Sentry.init({
      dsn,
      environment: ambiente,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        })
      ],
      tracesSampleRate: ambiente === 'production' ? 0.1 : 1.0,
      replaysSessionSampleRate: ambiente === 'production' ? 0.1 : 1.0,
      replaysOnErrorSampleRate: 1.0,
      beforeSend(event, hint) {
        // Ignorar erros de extensão
        if (event.exception?.values?.some(v => 
          v.stacktrace?.frames?.some(f => 
            f.filename?.match(/chrome-extension:\/\//i)
          )
        )) {
          return null;
        }
        return event;
      }
    });
  }

  // Monitorar todos os Core Web Vitals
  onLCP(enviarMetrica);
  onINP(enviarMetrica);
  onCLS(enviarMetrica);
  onFCP(enviarMetrica);
  onTTFB(enviarMetrica);
}
```

---

## ♿ 7. Acessibilidade

### 7.1 Melhorias de ARIA e Focus Management

```tsx
// Adicionar ao ModalBase
useEffect(() => {
  if (!props.aberto) return;

  const focoAnterior = document.activeElement as HTMLElement;
  const modal = document.querySelector('[role="dialog"]') as HTMLElement;
  const elementosFocaveis = modal?.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const primeiroFocavel = elementosFocaveis?.[0] as HTMLElement;
  const ultimoFocavel = elementosFocaveis?.[elementosFocaveis.length - 1] as HTMLElement;

  primeiroFocavel?.focus();

  const lidarComTab = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === primeiroFocavel) {
        e.preventDefault();
        ultimoFocavel?.focus();
      }
    } else {
      if (document.activeElement === ultimoFocavel) {
        e.preventDefault();
        primeiroFocavel?.focus();
      }
    }
  };

  const lidarComEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.aoFechar();
  };

  document.addEventListener('keydown', lidarComTab);
  document.addEventListener('keydown', lidarComEscape);

  return () => {
    document.removeEventListener('keydown', lidarComTab);
    document.removeEventListener('keydown', lidarComEscape);
    focoAnterior?.focus();
  };
}, [props.aberto, props.aoFechar]);
```

---

## 📱 8. Performance Mobile

### 8.1 Detecção de Conexão Lenta

```tsx
// src/hooks/useConexao.ts
import { useState, useEffect } from 'react';

export function useConexao() {
  const [conexao, setConexao] = useState({
    efetiva: navigator.connection?.effectiveType ?? '4g',
    downlink: navigator.connection?.downlink ?? 10,
    saveData: navigator.connection?.saveData ?? false
  });

  useEffect(() => {
    const handleChange = () => {
      setConexao({
        efetiva: navigator.connection?.effectiveType ?? '4g',
        downlink: navigator.connection?.downlink ?? 10,
        saveData: navigator.connection?.saveData ?? false
      });
    };

    navigator.connection?.addEventListener('change', handleChange);
    return () => navigator.connection?.removeEventListener('change', handleChange);
  }, []);

  return conexao;
}

// Uso no App:
const { efetiva, saveData } = useConexao();
const modoDadosReduzidosAuto = saveData || efetiva === '2g' || efetiva === 'slow-2g';
```

### 8.2 Imagens Responsivas Avançadas

```tsx
// Substituir urlImagem por versão com picture element
function renderizarImagemResponsiva(caminho: string | null, tamanhos: string[] = ['w185', 'w342', 'w500', 'w780']) {
  if (!caminho) return null;

  return (
    <picture>
      {tamanhos.map(tamanho => (
        <source
          key={tamanho}
          mediaQuery={`(min-width: ${getBreakpoint(tamanho)}px)`}
          srcSet={`${URL_BASE_IMAGEM}/${tamanho}${caminho}`}
        />
      ))}
      <img
        src={URL_BASE_IMAGEM}/w500${caminho}}
        alt="..."
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}
```

---

## ✅ Checklist de Implementação Prioritária

### Alta Prioridade (Impacto Imediato)
- [ ] Aplicar `React.memo()` no `SecaoCatalogo`
- [ ] Implementar `useCallback` para handlers no App
- [ ] Criar Service Worker para cache de imagens
- [ ] Adicionar debounce na busca (400ms)
- [ ] Configurar code splitting no Vite

### Média Prioridade (Próxima Sprint)
- [ ] Extrair componentes para arquivos separados
- [ ] Criar custom hooks (`useArmazenamento`, `useBusca`)
- [ ] Implementar virtualização de listas
- [ ] Adicionar monitoramento de Web Vitals completo
- [ ] Melhorar acessibilidade (focus trap, ARIA)

### Baixa Prioridade (Otimizações Futuras)
- [ ] Implementar React Compiler
- [ ] Adicionar análise de bundle
- [ ] Criar sistema de prefetch inteligente
- [ ] Implementar detecção de conexão lenta
- [ ] Adicionar skeleton screens avançados

---

## 📈 Métricas de Sucesso

Após implementar as otimizações, monitore:

| Métrica | Meta | Ferramenta |
|---------|------|------------|
| LCP (Largest Contentful Paint) | < 2.5s | Web Vitals |
| INP (Interaction to Next Paint) | < 200ms | Web Vitals |
| CLS (Cumulative Layout Shift) | < 0.1 | Web Vitals |
| FCP (First Contentful Paint) | < 1.8s | Web Vitals |
| TTI (Time to Interactive) | < 3.8s | Lighthouse |
| Bundle Size (gzipped) | < 200KB | Rollup Visualizer |
| Image Load Time | < 1s | Chrome DevTools |

---

## 🛠️ Comandos Úteis

```bash
# Análise de performance
npm run build
npx vite preview

# Testar Lighthouse
npx lighthouse http://localhost:4173 --output=html --output-path=./lighthouse-report.html

# Verificar tamanho do bundle
npm install --save-dev rollup-plugin-visualizer
npm run build

# Simular conexão lenta
# Chrome DevTools > Network > No throttling > Slow 3G
```

---

## 📚 Referências

- [React Performance Best Practices](https://react.dev/learn/render-and-commit)
- [Vite Optimization Guide](https://vitejs.dev/guide/performance.html)
- [Web Vitals Documentation](https://web.dev/vitals/)
- [TailwindCSS Performance](https://tailwindcss.com/docs/optimizing-for-production)
- [Service Worker Best Practices](https://web.dev/service-worker-caching-strategies/)

---

*Documento gerado em: $(date)*
*Versão: 1.0*
