/**
 * @file Exemplo de otimizações críticas para o App.tsx
 * 
 * Este arquivo demonstra as principais otimizações que devem ser aplicadas
 * ao componente App.tsx para melhorar significativamente o desempenho.
 */

import { useCallback, useMemo, useEffect, useState } from 'react';

// ============================================================================
// 1. MEMOIZAÇÃO DE FUNÇÕES DE VERIFICAÇÃO (Alta Prioridade)
// ============================================================================

// ANTES (causa re-renders desnecessários):
// const verificaFavorito = (id: number) => favoritos.some(f => f.id === String(id));

// DEPOIS (memoizado com useCallback):
export const exemploVerificacoesMemoizadas = () => {
  const [favoritos, setFavoritos] = useState<any[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [verDepois, setVerDepois] = useState<any[]>([]);

  // ✅ Otimizado: só recria quando o dependência muda
  const verificarFavorito = useCallback((id: number): boolean => {
    return favoritos.some((f) => f.id === String(id));
  }, [favoritos]);

  const verificarVisto = useCallback((id: number): boolean => {
    return historico.some((h) => h.id === String(id));
  }, [historico]);

  const verificarVerDepois = useCallback((id: number): boolean => {
    return verDepois.some((v) => v.id === String(id));
  }, [verDepois]);

  return { verificarFavorito, verificarVisto, verificarVerDepois };
};

// ============================================================================
// 2. HANDLERS DE EVENTOS MEMOIZADOS (Alta Prioridade)
// ============================================================================

export const exemploHandlersMemoizados = () => {
  const [modalDetalhes, setModalDetalhes] = useState<any>({});
  const cachePrefetch = new Set<string>();

  // ✅ Otimizado: função estável que não causa re-renders em componentes filhos
  const lidarComDetalhes = useCallback((item: any): void => {
    setModalDetalhes({
      aberto: true,
      tipo: item.media_type === "tv" || item.media_type === "person" ? "tv" : "movie",
      item,
      aCarregar: true,
      erro: ""
    });
  }, []); // ✅ Sem dependências = função criada uma única vez

  const lidarComPrefetch = useCallback((item: any): void => {
    if (!item.id || cachePrefetch.has(String(item.id))) return;
    cachePrefetch.add(String(item.id));
    
    const tipo = item.media_type === "tv" || item.media_type === "person" ? "tv" : "movie";
    // Simulação de prefetch
    console.log(`Prefetching ${tipo}/${item.id}`);
  }, []);

  return { lidarComDetalhes, lidarComPrefetch };
};

// ============================================================================
// 3. CÁLCULOS CAROS COM USEMEMO (Média Prioridade)
// ============================================================================

export const exemploCalculosCaros = () => {
  const [progressoLocal, setProgressoLocal] = useState<Record<string, any>>({});
  const [player, setPlayer] = useState<any>({ activo: false, id: '', duracaoSegundos: 0 });
  const [tempoSessaoPlayer, setTempoSessaoPlayer] = useState(0);

  // ✅ Otimizado: só recalcula quando as dependências mudam
  const continuarAVer = useMemo(() => {
    const lista = Object.values(progressoLocal);
    if (lista.length === 0) return [];

    return lista
      .filter((p: any) => {
        if (!p.duracaoSegundos || !p.posicaoSegundos) return false;
        const percentual = (p.posicaoSegundos / p.duracaoSegundos) * 100;
        return percentual < 90 && percentual > 5;
      })
      .sort((a: any, b: any) => 
        new Date(b.actualizadoEm).getTime() - new Date(a.actualizadoEm).getTime()
      )
      .slice(0, 12);
  }, [progressoLocal]); // ✅ Só recalcula quando progressoLocal muda

  const proximoEpisodioExiste = useMemo(() => {
    if (!player.activo || player.tipo !== 'tv') return false;
    // Lógica complexa de verificação...
    return true;
  }, [player.activo, player.tipo, player.temporada, player.episodio]);

  return { continuarAVer, proximoEpisodioExiste };
};

// ============================================================================
// 4. COMPONENTE MEMOIZADO COM COMPARAÇÃO CUSTOMIZADA (Alta Prioridade)
// ============================================================================

interface PropriedadesSecao {
  id: string;
  titulo: string;
  estado: {
    aCarregar: boolean;
    lista: any[];
    pagina: number;
    totalPaginas: number;
    erro: string;
  };
  reduzMovimento: boolean;
  onDetalhes: (item: any) => void;
  onPrefetch: (item: any) => void;
}

// ✅ Otimizado: React.memo evita re-render se props não mudarem
const SecaoCatalogoOtimizada = React.memo(function SecaoCatalogo(props: PropriedadesSecao) {
  // Componente só re-renderiza quando:
  // - estado.aCarregar muda
  // - estado.lista.length muda
  // - estado.pagina muda
  // - reduzMovimento muda
  
  return (
    <section>
      {/* Conteúdo da seção */}
      <h2>{props.titulo}</h2>
      {props.estado.aCarregar && <div>Carregando...</div>}
      {props.estado.lista.map(item => (
        <div key={item.id}>{item.title}</div>
      ))}
    </section>
  );
}, (prevProps, nextProps) => {
  // Comparação customizada para controle fino de quando re-renderizar
  return (
    prevProps.id === nextProps.id &&
    prevProps.titulo === nextProps.titulo &&
    prevProps.estado.aCarregar === nextProps.estado.aCarregar &&
    prevProps.estado.lista.length === nextProps.estado.lista.length &&
    prevProps.estado.pagina === nextProps.estado.pagina &&
    prevProps.reduzMovimento === nextProps.reduzMovimento
  );
});

// ============================================================================
// 5. DEBOUNCE PARA BUSCA (Alta Prioridade)
// ============================================================================

export const exemploBuscaDebounce = () => {
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const buscar = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResultados([]);
      return;
    }

    try {
      const resposta = await fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(query)}`);
      const dados = await resposta.json();
      setResultados(dados.results || []);
    } catch (erro) {
      console.error('Erro na busca:', erro);
    }
  }, []);

  // ✅ Otimizado: debounce de 400ms para evitar requisições excessivas
  const debouncedBuscar = useCallback((query: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      buscar(query);
    }, 400); // 400ms de delay
  }, [buscar]);

  useEffect(() => {
    debouncedBuscar(termo);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [termo, debouncedBuscar]);

  return { termo, setTermo, resultados };
};

// ============================================================================
// 6. LAZY LOADING DE IMAGENS COM INTERSECTION OBSERVER (Média Prioridade)
// ============================================================================

interface ImagemLazyProps {
  src: string;
  srcSet?: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
}

export function ImagemLazy({ src, srcSet, alt, className, width, height }: ImagemLazyProps) {
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
      { rootMargin: '200px' } // Carrega 200px antes de entrar na viewport
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
      loading="lazy"
      decoding="async"
    />
  );
}

// ============================================================================
// 7. VIRTUALIZAÇÃO DE LISTAS LONGAS (Média Prioridade)
// ============================================================================

// Instalar: npm install @tanstack/react-virtual
// import { useVirtualizer } from '@tanstack/react-virtual';

export const exemploVirtualizacao = () => {
  const paiRef = useRef<HTMLDivElement>(null);
  const lista = Array.from({ length: 1000 }, (_, i) => ({ id: i, title: `Item ${i}` }));

  // ✅ Otimizado: renderiza apenas itens visíveis + overscan
  /*
  const virtualizador = useVirtualizer({
    count: lista.length,
    getScrollElement: () => paiRef.current,
    estimateSize: () => 300, // altura estimada de cada card
    overscan: 3 // renderiza 3 itens extras acima/abaixo da viewport
  });

  return (
    <div ref={paiRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ 
        height: `${virtualizador.getTotalSize()}px`,
        width: '100%',
        position: 'relative'
      }}>
        {virtualizador.getVirtualItems().map((virtualItem) => {
          const item = lista[virtualItem.index];
          return (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`
              }}
            >
              {item.title}
            </div>
          );
        })}
      </div>
    </div>
  );
  */
};

// ============================================================================
// 8. DETECÇÃO DE CONEXÃO LENTA (Baixa Prioridade)
// ============================================================================

export function useConexao() {
  const [conexao, setConexao] = useState({
    efetiva: typeof navigator !== 'undefined' ? navigator.connection?.effectiveType ?? '4g' : '4g',
    downlink: typeof navigator !== 'undefined' ? navigator.connection?.downlink ?? 10 : 10,
    saveData: typeof navigator !== 'undefined' ? navigator.connection?.saveData ?? false : false
  });

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.connection) return;

    const handleChange = () => {
      setConexao({
        efetiva: navigator.connection?.effectiveType ?? '4g',
        downlink: navigator.connection?.downlink ?? 10,
        saveData: navigator.connection?.saveData ?? false
      });
    };

    navigator.connection.addEventListener('change', handleChange);
    return () => navigator.connection.removeEventListener('change', handleChange);
  }, []);

  return conexao;
}

// Uso no App:
/*
const { efetiva, saveData } = useConexao();
const modoDadosReduzidosAuto = saveData || efetiva === '2g' || efetiva === 'slow-2g';

// Ajustar qualidade de imagens automaticamente
const tamanhoImagem = modoDadosReduzidosAuto ? 'w185' : 'w500';
*/

// ============================================================================
// 9. RATE LIMITING NO CLIENTE (Baixa Prioridade)
// ============================================================================

export function useRateLimit<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
  maxExecutions: number
): T {
  const execucoesRef = useRef<{ timestamp: number }[]>([]);

  return useCallback((...args: Parameters<T>) => {
    const agora = Date.now();
    
    // Remove execuções antigas
    execucoesRef.current = execucoesRef.current.filter(
      (e) => agora - e.timestamp < delay
    );

    // Verifica se excedeu limite
    if (execucoesRef.current.length >= maxExecutions) {
      console.warn(`Rate limit excedido: máximo ${maxExecutions} execuções em ${delay}ms`);
      return;
    }

    // Registra nova execução
    execucoesRef.current.push({ timestamp: agora });
    return fn(...args);
  }, [fn, delay, maxExecutions]) as T;
}

// Uso:
/*
const buscarSemRateLimit = async (query: string) => { ... };
const buscar = useRateLimit(buscarSemRateLimit, 1000, 5); // Máx 5 buscas por segundo
*/

// ============================================================================
// RESUMO DAS OTIMIZAÇÕES
// ============================================================================

/**
 * ORDEM DE IMPLEMENTAÇÃO RECOMENDADA:
 * 
 * 1. 🟢 ALTA PRIORIDADE (Faça agora):
 *    - useCallback em verificaFavorito, verificarVisto, verificarVerDepois
 *    - useCallback em lidarComDetalhes, lidarComPrefetch
 *    - Debounce na busca (400ms)
 *    - React.memo no SecaoCatalogo
 * 
 * 2. 🟡 MÉDIA PRIORIDADE (Próxima sprint):
 *    - useMemo em continuarAVer, proximoEpisodioExiste
 *    - Componente ImagemLazy com Intersection Observer
 *    - Virtualização de listas longas
 *    - Extração de componentes menores
 * 
 * 3. 🔵 BAIXA PRIORIDADE (Otimizações futuras):
 *    - Detecção de conexão lenta
 *    - Rate limiting no cliente
 *    - React Compiler
 *    - Análise de bundle
 * 
 * GANHO ESTIMADO DE PERFORMANCE:
 * - Redução de 40-60% em renders desnecessários
 * - Melhoria de 30-50% no tempo de carregamento inicial
 * - Redução de 70-80% em requisições de busca
 * - Economia de 50-70% de banda em imagens (com lazy loading)
 */
