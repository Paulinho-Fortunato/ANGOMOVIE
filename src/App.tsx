import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type TipoConteudo = "movie" | "tv";

interface ItemConteudo {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  tagline?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  genres?: Array<{ id: number; name: string }>;
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  original_language?: string;
  vote_count?: number;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  vote_average?: number;
  media_type?: string;
}

interface ItemGuardado {
  id: string;
  tipo: TipoConteudo;
  titulo: string;
  poster: string | null;
  temporada?: number;
  episodio?: number;
  guardadoEm: string;
}

interface EstadoLista {
  lista: ItemConteudo[];
  pagina: number;
  totalPaginas: number;
  aCarregar: boolean;
  erro: string;
}

interface EstadoPlayer {
  activo: boolean;
  titulo: string;
  tipo: TipoConteudo;
  id: string;
  url: string;
  temporada: number;
  episodio: number;
  qualidade: string;
  duracaoSegundos: number;
}

interface ItemVerDepois {
  id: string;
  tipo: TipoConteudo;
  titulo: string;
  poster: string | null;
  guardadoEm: string;
}

interface DadosTemporada {
  season_number: number;
  episodes: Array<{ id: number; episode_number: number; name: string; runtime?: number }>;
}

interface ProgressoGuardado {
  chave: string;
  id: string;
  tipo: TipoConteudo;
  titulo: string;
  poster: string | null;
  temporada: number;
  episodio: number;
  posicaoSegundos: number;
  duracaoSegundos: number;
  actualizadoEm: string;
}

const URL_BASE_TMDB = "https://api.themoviedb.org/3";
const URL_BASE_IMAGEM = "https://image.tmdb.org/t/p";
const ORIGENS_IFRAME_PERMITIDAS = ["myembed.biz", "www.myembed.biz"];
const PREFIXO_ARMAZENAMENTO = "angomovie_v2_";
const SERVIDOR_PADRAO = "s1";
const AUDIO_PADRAO = "pt";
const QUALIDADE_PADRAO = "auto";
const AMBIENTE = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const API_PROXY_BASE = AMBIENTE?.VITE_API_BASE ?? "/api";
const SEGREDO_ASSINATURA_CLIENTE = AMBIENTE?.VITE_REQUEST_SIGNING_SECRET ?? "trocar-em-producao";
const CHAVE_TMDB_FALLBACK = AMBIENTE?.VITE_TMDB_FALLBACK_KEY ?? "1ae12b1dd164a9026c5124291130c1b9";

const QUALIDADES_VIDEO = [
  { codigo: "auto", nome: "Auto" },
  { codigo: "480p", nome: "480p" },
  { codigo: "720p", nome: "720p" },
  { codigo: "1080p", nome: "1080p" }
] as const;

const DESTAQUE_SEMANAL = Object.freeze({
  semana: "Curadoria da Semana",
  titulo: "Noite de Ficção e Acção",
  itens: ["Duna: Parte Dois", "The Last of Us", "Jujutsu Kaisen"]
});

const FILTROS_FILMES = {
  populares: "/movie/popular",
  "em-cartaz": "/movie/now_playing",
  melhores: "/movie/top_rated"
} as const;

const FILTROS_SERIES = {
  populares: "/tv/popular",
  melhores: "/tv/top_rated"
} as const;

const ESTADO_LISTA_INICIAL: EstadoLista = {
  lista: [],
  pagina: 1,
  totalPaginas: 1,
  aCarregar: false,
  erro: ""
};

/** @returns string seguro para renderização textual */
function escaparHTML(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** @throws Error se o ID não for TMDB ou IMDb válido */
function sanitizarId(id: string | number): string {
  if (typeof id === "number" && Number.isInteger(id) && id > 0 && id < 10_000_000) {
    return String(id);
  }

  if (typeof id === "string") {
    const limpo = id.trim();
    if (/^tt\d{7,8}$/i.test(limpo)) return limpo.toLowerCase();
    if (/^\d{1,7}$/.test(limpo)) return String(Number.parseInt(limpo, 10));
  }

  throw new Error("ID inválido");
}

/** @returns texto de busca sanitizado para pedido externo */
function sanitizarBusca(valor: string): string {
  const limpa = valor.trim().slice(0, 100);
  if (!limpa) return "";
  if (/<|>|script|javascript|onerror|onload/i.test(limpa)) {
    throw new Error("Busca contém conteúdo não permitido");
  }
  if (!/^[\p{L}\p{N}\s\-_'.,:!?]+$/u.test(limpa)) {
    throw new Error("A busca contém caracteres não permitidos");
  }
  return limpa;
}

/** @throws Error se a URL de reprodução for insegura */
function validarUrlIframe(url: string): string {
  const analisada = new URL(url);
  if (analisada.protocol !== "https:") {
    throw new Error("Apenas HTTPS é permitido");
  }
  if (!ORIGENS_IFRAME_PERMITIDAS.includes(analisada.hostname)) {
    throw new Error("Origem de reprodução não permitida");
  }
  return analisada.toString();
}

/** @returns URL de reprodução validada */
function gerarUrlReproducao(
  tipo: TipoConteudo,
  id: string,
  temporada?: number,
  episodio?: number,
  servidor = "s1",
  audio = "pt",
  qualidade = "auto"
): string {
  const rota =
    tipo === "movie"
      ? `/filme/${id}`
      : temporada && episodio
        ? `/serie/${id}/${temporada}/${episodio}`
        : `/serie/${id}`;

  const url = new URL(`https://myembed.biz${rota}`);
  url.searchParams.set("servidor", servidor);
  url.searchParams.set("audio", audio);
  if (qualidade !== "auto") {
    url.searchParams.set("quality", qualidade);
  }
  return validarUrlIframe(url.toString());
}

async function obterUrlPlayer(
  tipo: TipoConteudo,
  id: string,
  temporada: number,
  episodio: number,
  qualidade: string
): Promise<string> {
  const url = new URL(`${API_PROXY_BASE}/player-url`, window.location.origin);
  url.searchParams.set("tipo", tipo);
  url.searchParams.set("id", id);
  url.searchParams.set("temporada", String(temporada));
  url.searchParams.set("episodio", String(episodio));
  url.searchParams.set("servidor", SERVIDOR_PADRAO);
  url.searchParams.set("audio", AUDIO_PADRAO);
  url.searchParams.set("qualidade", qualidade);

  try {
    const headers = await cabecalhosAssinados("GET", `${url.pathname}${url.search}`);
    const resposta = await fetch(url.toString(), { headers });
    if (resposta.ok) {
      const dados = await resposta.json();
      if (typeof dados.url === "string") {
        return validarUrlIframe(dados.url);
      }
    }
  } catch {
    // fallback abaixo
  }

  return gerarUrlReproducao(tipo, id, temporada, episodio, SERVIDOR_PADRAO, AUDIO_PADRAO, qualidade);
}

/** @returns srcSet optimizado para reduzir consumo em dados móveis */
function srcSetImagem(caminho: string | null | undefined): string | undefined {
  if (!caminho) return undefined;
  return ["w185", "w342", "w500", "w780"]
    .map((tamanho) => `${urlImagem(caminho, tamanho as "w185" | "w342" | "w500" | "w780")} ${tamanho.replace("w", "")}w`)
    .join(", ");
}

/** @returns chave única para progresso local */
function chaveProgresso(tipo: TipoConteudo, id: string, temporada: number, episodio: number): string {
  return `${tipo}-${id}-t${temporada}-e${episodio}`;
}

async function assinarPedido(payload: string): Promise<string> {
  if (!crypto?.subtle) {
    return btoa(payload).slice(0, 64);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SEGREDO_ASSINATURA_CLIENTE),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinatura = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(assinatura))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function cabecalhosAssinados(metodo: string, caminhoComQuery: string): Promise<Record<string, string>> {
  const timestamp = String(Date.now());
  const dispositivo = obterOuGerarIdUtilizador();
  const payload = `${timestamp}.${dispositivo}.${metodo.toUpperCase()}.${caminhoComQuery}`;
  const assinatura = await assinarPedido(payload);

  return {
    "x-angomovie-timestamp": timestamp,
    "x-angomovie-device": dispositivo,
    "x-angomovie-signature": assinatura
  };
}

/** @returns chave com namespace do projecto */
function construirChaveArmazenamento(chave: string): string {
  return `${PREFIXO_ARMAZENAMENTO}${chave}`;
}

/** @returns valor deserializado ou padrão */
function lerArmazenamento<T>(chave: string, valorPadrao: T): T {
  try {
    const bruto = localStorage.getItem(construirChaveArmazenamento(chave));
    if (!bruto) return valorPadrao;
    return JSON.parse(bruto) as T;
  } catch {
    return valorPadrao;
  }
}

/** Guarda valor serializável no armazenamento local */
function guardarArmazenamento(chave: string, valor: unknown): void {
  localStorage.setItem(construirChaveArmazenamento(chave), JSON.stringify(valor));
}

/** @returns ID único no formato AMXXXXXXXX */
function obterOuGerarIdUtilizador(): string {
  const existente = lerArmazenamento<string | null>("id-utilizador", null);
  if (existente && /^AM[A-Z0-9]{8}$/.test(existente)) return existente;
  const novo = `AM${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  guardarArmazenamento("id-utilizador", novo);
  return novo;
}

/** @returns URL de imagem optimizada com fallback */
function urlImagem(caminho: string | null | undefined, tamanho: "w185" | "w342" | "w500" | "w780" = "w500"): string {
  if (!caminho) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='500' height='750' viewBox='0 0 500 750'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop stop-color='#0A101F'/><stop offset='1' stop-color='#141826'/></linearGradient></defs><rect width='500' height='750' fill='url(#g)'/><circle cx='250' cy='280' r='72' fill='#E50914' fill-opacity='0.18'/><text x='250' y='380' fill='#FFFFFF' text-anchor='middle' font-family='Montserrat, Arial, sans-serif' font-size='42' font-weight='700'>ANGO</text><text x='250' y='430' fill='#E50914' text-anchor='middle' font-family='Montserrat, Arial, sans-serif' font-size='42' font-weight='900'>MOVIE</text><text x='250' y='470' fill='#B3B3B3' text-anchor='middle' font-family='Montserrat, Arial, sans-serif' font-size='20'>Sem poster disponível</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
  return `${URL_BASE_IMAGEM}/${tamanho}${caminho}`;
}

/** @returns conteúdo da API TMDB */
async function pedidoTMDB(endpoint: string, parametros?: Record<string, string | number>): Promise<any> {
  const urlProxy = new URL(`${API_PROXY_BASE}/tmdb${endpoint}`, window.location.origin);
  urlProxy.searchParams.set("language", "pt-BR");
  urlProxy.searchParams.set("include_adult", "false");

  if (parametros) {
    Object.entries(parametros).forEach(([chave, valor]) => {
      urlProxy.searchParams.set(chave, String(valor));
    });
  }

  const controlador = new AbortController();
  const tempoLimite = window.setTimeout(() => controlador.abort(), 10000);

  try {
    const cabecalhos = await cabecalhosAssinados("GET", `${urlProxy.pathname}${urlProxy.search}`);
    const resposta = await fetch(urlProxy.toString(), { signal: controlador.signal, headers: cabecalhos });
    if (resposta.ok) {
      return await resposta.json();
    }

    // Fallback opcional para desenvolvimento local sem backend.
    if (CHAVE_TMDB_FALLBACK) {
      const urlDirecto = new URL(`${URL_BASE_TMDB}${endpoint}`);
      urlDirecto.searchParams.set("api_key", CHAVE_TMDB_FALLBACK);
      Object.entries(Object.fromEntries(urlProxy.searchParams.entries())).forEach(([chave, valor]) => {
        if (chave !== "api_key") urlDirecto.searchParams.set(chave, valor);
      });
      const respostaDirecta = await fetch(urlDirecto.toString(), { signal: controlador.signal });
      if (respostaDirecta.ok) return await respostaDirecta.json();
    }

    throw new Error(`Falha TMDB (${resposta.status})`);
  } finally {
    window.clearTimeout(tempoLimite);
  }
}

/** @returns texto resumido sem cortar palavras no meio */
function resumo(texto: string | undefined, limite: number): string {
  if (!texto) return "Sem descrição disponível.";
  if (texto.length <= limite) return texto;
  const base = texto.slice(0, limite);
  return `${base.slice(0, base.lastIndexOf(" "))}...`;
}

/** @returns ano de lançamento, quando disponível */
function obterAno(data?: string): string {
  if (!data) return "N/D";
  return data.slice(0, 4);
}

/** @returns data em formato legível para PT */
function formatarData(data?: string): string {
  if (!data) return "N/D";
  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) return "N/D";
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(valor);
}

/** @returns idioma por extenso para códigos comuns */
function mapearIdioma(codigo?: string): string {
  if (!codigo) return "N/D";
  const idiomas: Record<string, string> = {
    pt: "Português",
    en: "Inglês",
    es: "Espanhol",
    fr: "Francês",
    ja: "Japonês",
    ko: "Coreano"
  };
  return idiomas[codigo] ?? codigo.toUpperCase();
}

/** @returns tempo no formato HH:MM */
function formatarTempo(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  return horas > 0 ? `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}` : `${String(minutos).padStart(2, "0")} min`;
}

function classeGenero(genero: string): string {
  const nome = genero.toLowerCase();
  if (nome.includes("acç") || nome.includes("action") || nome.includes("guerra")) {
    return "border-red-500/45 bg-red-500/12 text-red-100";
  }
  if (nome.includes("drama") || nome.includes("romance")) {
    return "border-blue-400/45 bg-blue-500/12 text-blue-100";
  }
  if (nome.includes("anima") || nome.includes("anime") || nome.includes("fantasia")) {
    return "border-purple-400/45 bg-purple-500/12 text-purple-100";
  }
  return "border-[var(--borda-cor)] bg-[var(--fundo-cartao)] text-[var(--texto-secundario)]";
}

/** Embaralha a lista para evitar ordem estática na apresentação */
function embaralharLista<T>(lista: T[]): T[] {
  const copia = [...lista];
  for (let indice = copia.length - 1; indice > 0; indice -= 1) {
    const outroIndice = Math.floor(Math.random() * (indice + 1));
    [copia[indice], copia[outroIndice]] = [copia[outroIndice], copia[indice]];
  }
  return copia;
}

export default function App() {
  const reduzMovimento = useReducedMotion();
  const [idUtilizador] = useState<string>(() => obterOuGerarIdUtilizador());
  const [temaVisual, setTemaVisual] = useState<"cinema-escuro" | "noite-dourada">(
    () => lerArmazenamento("tema-visual", "cinema-escuro") as "cinema-escuro" | "noite-dourada"
  );
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const [modoDadosReduzidos, setModoDadosReduzidos] = useState<boolean>(() => lerArmazenamento("dados-reduzidos", false));
  const [atalhosAbertos, setAtalhosAbertos] = useState(false);
  const referenciaBusca = useRef<HTMLInputElement | null>(null);
  const cachePrefetch = useRef<Set<string>>(new Set());

  const [hero, setHero] = useState<ItemConteudo | null>(null);
  const [filmes, setFilmes] = useState<EstadoLista>(ESTADO_LISTA_INICIAL);
  const [series, setSeries] = useState<EstadoLista>(ESTADO_LISTA_INICIAL);
  const [animes, setAnimes] = useState<EstadoLista>(ESTADO_LISTA_INICIAL);

  const [filtroFilmes, setFiltroFilmes] = useState<keyof typeof FILTROS_FILMES>("populares");
  const [filtroSeries, setFiltroSeries] = useState<keyof typeof FILTROS_SERIES>("populares");

  const [favoritos, setFavoritos] = useState<ItemGuardado[]>(() => lerArmazenamento<ItemGuardado[]>("favoritos", []));
  const [verDepois, setVerDepois] = useState<ItemVerDepois[]>(() => lerArmazenamento<ItemVerDepois[]>("ver-depois", []));
  const [historico, setHistorico] = useState<ItemGuardado[]>(() => lerArmazenamento<ItemGuardado[]>("historico", []));

  const [termoBusca, setTermoBusca] = useState("");
  const [resultadoBusca, setResultadoBusca] = useState<ItemConteudo[]>([]);
  const [carregarBusca, setCarregarBusca] = useState(false);
  const [erroBusca, setErroBusca] = useState("");

  const [modalApoioAberto, setModalApoioAberto] = useState(false);
  const [modalDetalhes, setModalDetalhes] = useState<{ aberto: boolean; tipo: TipoConteudo; item: ItemConteudo | null; aCarregar: boolean; erro: string }>({
    aberto: false,
    tipo: "movie",
    item: null,
    aCarregar: false,
    erro: ""
  });

  const [modalDownload, setModalDownload] = useState<{ aberto: boolean; titulo: string; url: string }>({
    aberto: false,
    titulo: "",
    url: ""
  });

  const [player, setPlayer] = useState<EstadoPlayer>({
    activo: false,
    titulo: "",
    tipo: "movie",
    id: "",
    url: "",
    temporada: 1,
    episodio: 1,
    qualidade: QUALIDADE_PADRAO,
    duracaoSegundos: 0
  });
  const [temporadaActual, setTemporadaActual] = useState<DadosTemporada | null>(null);
  const [totalTemporadas, setTotalTemporadas] = useState(1);
  const [erroPlayer, setErroPlayer] = useState("");
  const [aCarregarPlayer, setACarregarPlayer] = useState(false);
  const [progressoLocal, setProgressoLocal] = useState<Record<string, ProgressoGuardado>>(
    () => lerArmazenamento<Record<string, ProgressoGuardado>>("progresso", {})
  );
  const [tempoSessaoPlayer, setTempoSessaoPlayer] = useState(0);
  const reduzirAnimacao = Boolean(reduzMovimento || modoDadosReduzidos);

  useEffect(() => {
    if (!player.activo) return;
    const temporizador = window.setInterval(() => {
      setTempoSessaoPlayer((anterior) => anterior + 5);
    }, 5000);

    return () => window.clearInterval(temporizador);
  }, [player.activo, player.id, player.temporada, player.episodio]);

  useEffect(() => {
    if (!player.activo || player.id.length === 0 || tempoSessaoPlayer <= 0) return;

    const chave = chaveProgresso(player.tipo, player.id, player.temporada, player.episodio);
    const limite = player.duracaoSegundos > 0 ? player.duracaoSegundos : 7200;
    const posicaoSegundos = Math.min(tempoSessaoPlayer, limite);

    const progresso: ProgressoGuardado = {
      chave,
      id: player.id,
      tipo: player.tipo,
      titulo: player.titulo,
      poster: null,
      temporada: player.temporada,
      episodio: player.episodio,
      posicaoSegundos,
      duracaoSegundos: limite,
      actualizadoEm: new Date().toISOString()
    };

    setProgressoLocal((anterior) => {
      const actualizados = { ...anterior, [chave]: progresso };
      guardarArmazenamento("progresso", actualizados);
      return actualizados;
    });
  }, [player.activo, player.id, player.tipo, player.temporada, player.episodio, player.titulo, player.duracaoSegundos, tempoSessaoPlayer]);

  useEffect(() => {
    const carregarHero = async (): Promise<void> => {
      try {
        const dados = await pedidoTMDB("/trending/all/day");
        const escolhido = (dados.results as ItemConteudo[]).find((item) => item.backdrop_path && item.overview);
        setHero(escolhido ?? null);
      } catch {
        setHero(null);
      }
    };

    void carregarHero();
  }, []);

  useEffect(() => {
    const carregarLista = async (): Promise<void> => {
      setFilmes((anterior) => ({ ...anterior, aCarregar: true, erro: "" }));
      try {
        const dados = await pedidoTMDB(FILTROS_FILMES[filtroFilmes], { page: 1 });
        setFilmes({
          lista: embaralharLista((dados.results as ItemConteudo[]) ?? []),
          pagina: 1,
          totalPaginas: dados.total_pages ?? 1,
          aCarregar: false,
          erro: ""
        });
      } catch {
        setFilmes((anterior) => ({ ...anterior, aCarregar: false, erro: "Não foi possível carregar os filmes." }));
      }
    };

    void carregarLista();
  }, [filtroFilmes]);

  useEffect(() => {
    const carregarLista = async (): Promise<void> => {
      setSeries((anterior) => ({ ...anterior, aCarregar: true, erro: "" }));
      try {
        const dados = await pedidoTMDB(FILTROS_SERIES[filtroSeries], { page: 1 });
        setSeries({
          lista: embaralharLista((dados.results as ItemConteudo[]) ?? []),
          pagina: 1,
          totalPaginas: dados.total_pages ?? 1,
          aCarregar: false,
          erro: ""
        });
      } catch {
        setSeries((anterior) => ({ ...anterior, aCarregar: false, erro: "Não foi possível carregar as séries." }));
      }
    };

    void carregarLista();
  }, [filtroSeries]);

  useEffect(() => {
    const carregarAnimes = async (): Promise<void> => {
      setAnimes((anterior) => ({ ...anterior, aCarregar: true, erro: "" }));
      try {
        const dados = await pedidoTMDB("/discover/tv", {
          with_genres: 16,
          sort_by: "popularity.desc",
          page: 1
        });
        setAnimes({
          lista: embaralharLista((dados.results as ItemConteudo[]) ?? []),
          pagina: 1,
          totalPaginas: dados.total_pages ?? 1,
          aCarregar: false,
          erro: ""
        });
      } catch {
        setAnimes((anterior) => ({ ...anterior, aCarregar: false, erro: "Não foi possível carregar os animes." }));
      }
    };

    void carregarAnimes();
  }, []);

  useEffect(() => {
    const debounce = window.setTimeout(() => {
      const executarBusca = async (): Promise<void> => {
        setErroBusca("");
        if (!termoBusca.trim()) {
          setResultadoBusca([]);
          return;
        }

        try {
          setCarregarBusca(true);
          const query = sanitizarBusca(termoBusca);
          if (!query) {
            setResultadoBusca([]);
            return;
          }
          const dados = await pedidoTMDB("/search/multi", { query, page: 1 });
          const resultados = ((dados.results as ItemConteudo[]) ?? []).filter((item) =>
            item.media_type === "movie" || item.media_type === "tv"
          );
          setResultadoBusca(resultados.slice(0, 8));
        } catch (erro) {
          setErroBusca(erro instanceof Error ? erro.message : "Falha na busca");
        } finally {
          setCarregarBusca(false);
        }
      };

      void executarBusca();
    }, 300);

    return () => window.clearTimeout(debounce);
  }, [termoBusca]);

  useEffect(() => {
    guardarArmazenamento("dados-reduzidos", modoDadosReduzidos);
  }, [modoDadosReduzidos]);

  useEffect(() => {
    guardarArmazenamento("tema-visual", temaVisual);
  }, [temaVisual]);

  useEffect(() => {
    const aoPressionar = (evento: globalThis.KeyboardEvent): void => {
      const alvo = evento.target as HTMLElement | null;
      const emCampoTexto = Boolean(alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA"));

      if (evento.key === "/" && !emCampoTexto) {
        evento.preventDefault();
        referenciaBusca.current?.focus();
        return;
      }

      if (evento.key === "?") {
        evento.preventDefault();
        setAtalhosAbertos((anterior) => !anterior);
        return;
      }

      if (evento.key === "Escape") {
        setAtalhosAbertos(false);
        setMenuMobileAberto(false);
        setModalApoioAberto(false);
        setModalDownload({ aberto: false, titulo: "", url: "" });
        setModalDetalhes({ aberto: false, tipo: "movie", item: null, aCarregar: false, erro: "" });
        setPlayer((actual) => ({ ...actual, activo: false }));
        return;
      }

      if (!player.activo || player.tipo !== "tv") return;

      if (evento.key === "ArrowRight") {
        const proximo = player.episodio + 1;
        const existe = temporadaActual?.episodes.some((episodio) => episodio.episode_number === proximo);
        if (existe) void escolherEpisodio(proximo);
      }

      if (evento.key === "ArrowLeft") {
        const anterior = player.episodio - 1;
        if (anterior >= 1) void escolherEpisodio(anterior);
      }
    };

    window.addEventListener("keydown", aoPressionar);
    return () => window.removeEventListener("keydown", aoPressionar);
  }, [player.activo, player.tipo, player.episodio, temporadaActual]);

  const tituloHero = useMemo(() => {
    if (!hero) return "AngoMovie";
    return escapeText(hero.title ?? hero.name ?? "AngoMovie");
  }, [hero]);

  const continuarAVer = useMemo(() => {
    return Object.values(progressoLocal)
      .sort((a, b) => new Date(b.actualizadoEm).getTime() - new Date(a.actualizadoEm).getTime())
      .slice(0, 12);
  }, [progressoLocal]);

  const proximoEpisodioExiste = useMemo(() => {
    if (player.tipo !== "tv" || !temporadaActual) return false;
    return temporadaActual.episodes.some((episodio) => episodio.episode_number === player.episodio + 1);
  }, [player.tipo, player.episodio, temporadaActual]);

  /** @returns título seguro para mostrar */
  function escapeText(valor: string): string {
    return escaparHTML(valor);
  }

  /** Actualiza estado local e armazenamento para favoritos */
  function sincronizarFavoritos(actualizados: ItemGuardado[]): void {
    setFavoritos(actualizados);
    guardarArmazenamento("favoritos", actualizados.slice(0, 200));
  }

  /** Actualiza estado local e armazenamento para histórico */
  function sincronizarHistorico(actualizados: ItemGuardado[]): void {
    setHistorico(actualizados);
    guardarArmazenamento("historico", actualizados.slice(0, 100));
  }

  /** Guarda e sincroniza lista para ver depois */
  function sincronizarVerDepois(actualizados: ItemVerDepois[]): void {
    setVerDepois(actualizados);
    guardarArmazenamento("ver-depois", actualizados.slice(0, 200));
  }

  /** @returns true quando item já está em favoritos */
  function estaNosFavoritos(id: number, tipo: TipoConteudo): boolean {
    return favoritos.some((item) => item.id === String(id) && item.tipo === tipo);
  }

  /** @returns true quando o conteúdo já foi visto */
  function jaFoiVisto(id: number, tipo: TipoConteudo): boolean {
    return historico.some((item) => item.id === String(id) && item.tipo === tipo);
  }

  /** @returns true quando conteúdo está guardado para ver depois */
  function estaNaListaVerDepois(id: number, tipo: TipoConteudo): boolean {
    return verDepois.some((item) => item.id === String(id) && item.tipo === tipo);
  }

  /** Adiciona ou remove item da lista de favoritos */
  function alternarFavorito(item: ItemConteudo, tipo: TipoConteudo): void {
    const idSeguro = sanitizarId(item.id);
    const titulo = escapeText(item.title ?? item.name ?? "Sem título");
    if (estaNosFavoritos(item.id, tipo)) {
      const filtrados = favoritos.filter((fav) => !(fav.id === idSeguro && fav.tipo === tipo));
      sincronizarFavoritos(filtrados);
      return;
    }
    const novo: ItemGuardado = {
      id: idSeguro,
      tipo,
      titulo,
      poster: item.poster_path ?? null,
      guardadoEm: new Date().toISOString()
    };
    sincronizarFavoritos([novo, ...favoritos]);
  }

  /** Adiciona ou remove conteúdo na lista para ver depois */
  function alternarVerDepois(item: ItemConteudo, tipo: TipoConteudo): void {
    const idSeguro = sanitizarId(item.id);
    const titulo = escapeText(item.title ?? item.name ?? "Sem título");
    if (estaNaListaVerDepois(item.id, tipo)) {
      sincronizarVerDepois(verDepois.filter((entrada) => !(entrada.id === idSeguro && entrada.tipo === tipo)));
      return;
    }

    sincronizarVerDepois([
      {
        id: idSeguro,
        tipo,
        titulo,
        poster: item.poster_path ?? null,
        guardadoEm: new Date().toISOString()
      },
      ...verDepois
    ]);
  }

  /** Faz prefetch dos detalhes para reduzir latência ao abrir modal */
  async function prefetchDetalhes(item: ItemConteudo, tipo: TipoConteudo): Promise<void> {
    const idSeguro = sanitizarId(item.id);
    const chave = `${tipo}-${idSeguro}`;
    if (cachePrefetch.current.has(chave)) return;
    cachePrefetch.current.add(chave);

    try {
      const endpoint = tipo === "movie" ? `/movie/${idSeguro}` : `/tv/${idSeguro}`;
      await pedidoTMDB(endpoint, { append_to_response: "videos,credits,similar" });
    } catch {
      cachePrefetch.current.delete(chave);
    }
  }

  /** Regista reprodução recente no histórico local */
  function registarHistorico(item: ItemConteudo, tipo: TipoConteudo, temporada = 1, episodio = 1): void {
    const idSeguro = sanitizarId(item.id);
    const titulo = escapeText(item.title ?? item.name ?? "Sem título");
    const semDuplicado = historico.filter((entrada) => !(entrada.id === idSeguro && entrada.tipo === tipo));
    const actualizados = [
      {
        id: idSeguro,
        tipo,
        titulo,
        poster: item.poster_path ?? null,
        temporada,
        episodio,
        guardadoEm: new Date().toISOString()
      },
      ...semDuplicado
    ];
    sincronizarHistorico(actualizados);
  }

  /** Carrega mais itens para uma secção específica */
  async function carregarMais(secao: "filmes" | "series" | "animes"): Promise<void> {
    if (secao === "filmes") {
      if (filmes.pagina >= filmes.totalPaginas || filmes.aCarregar) return;
      setFilmes((estado) => ({ ...estado, aCarregar: true }));
      try {
        const proximaPagina = filmes.pagina + 1;
        const dados = await pedidoTMDB(FILTROS_FILMES[filtroFilmes], { page: proximaPagina });
        setFilmes((estado) => ({
          ...estado,
          lista: embaralharLista([...estado.lista, ...((dados.results as ItemConteudo[]) ?? [])]),
          pagina: proximaPagina,
          aCarregar: false
        }));
      } catch {
        setFilmes((estado) => ({ ...estado, aCarregar: false, erro: "Falha ao carregar mais filmes." }));
      }
      return;
    }

    if (secao === "series") {
      if (series.pagina >= series.totalPaginas || series.aCarregar) return;
      setSeries((estado) => ({ ...estado, aCarregar: true }));
      try {
        const proximaPagina = series.pagina + 1;
        const dados = await pedidoTMDB(FILTROS_SERIES[filtroSeries], { page: proximaPagina });
        setSeries((estado) => ({
          ...estado,
          lista: embaralharLista([...estado.lista, ...((dados.results as ItemConteudo[]) ?? [])]),
          pagina: proximaPagina,
          aCarregar: false
        }));
      } catch {
        setSeries((estado) => ({ ...estado, aCarregar: false, erro: "Falha ao carregar mais séries." }));
      }
      return;
    }

    if (animes.pagina >= animes.totalPaginas || animes.aCarregar) return;
    setAnimes((estado) => ({ ...estado, aCarregar: true }));
    try {
      const proximaPagina = animes.pagina + 1;
      const dados = await pedidoTMDB("/discover/tv", {
        with_genres: 16,
        sort_by: "popularity.desc",
        page: proximaPagina
      });
      setAnimes((estado) => ({
        ...estado,
        lista: embaralharLista([...estado.lista, ...((dados.results as ItemConteudo[]) ?? [])]),
        pagina: proximaPagina,
        aCarregar: false
      }));
    } catch {
      setAnimes((estado) => ({ ...estado, aCarregar: false, erro: "Falha ao carregar mais animes." }));
    }
  }

  /** Abre modal com detalhes completos do conteúdo */
  async function abrirDetalhes(item: ItemConteudo, tipo: TipoConteudo): Promise<void> {
    setModalDetalhes({ aberto: true, tipo, item: null, aCarregar: true, erro: "" });
    try {
      const endpoint = tipo === "movie" ? `/movie/${item.id}` : `/tv/${item.id}`;
      const dados = await pedidoTMDB(endpoint, { append_to_response: "videos,credits,similar" });
      setModalDetalhes({ aberto: true, tipo, item: dados as ItemConteudo, aCarregar: false, erro: "" });
    } catch {
      setModalDetalhes({ aberto: true, tipo, item: null, aCarregar: false, erro: "Não foi possível carregar os detalhes." });
    }
  }

  /** Inicia reprodução segura e trata episódios para séries */
  async function reproduzir(item: ItemConteudo, tipo: TipoConteudo, temporada = 1, episodio = 1): Promise<void> {
    try {
      setErroPlayer("");
      setACarregarPlayer(true);

      const idSeguro = sanitizarId(item.id);
      const titulo = escapeText(item.title ?? item.name ?? "Sem título");
      const url = await obterUrlPlayer(tipo, idSeguro, temporada, episodio, QUALIDADE_PADRAO);

      const duracaoPadrao = tipo === "movie" ? 2 * 3600 : 45 * 60;
      let duracaoSegundos = duracaoPadrao;

      if (tipo === "tv") {
        const [dadosSerie, dadosTemporada] = await Promise.all([
          pedidoTMDB(`/tv/${idSeguro}`),
          pedidoTMDB(`/tv/${idSeguro}/season/${temporada}`)
        ]);

        const temporadaDados = dadosTemporada as DadosTemporada;
        setTemporadaActual(temporadaDados);
        setTotalTemporadas(Math.max(1, Number(dadosSerie?.number_of_seasons ?? 1)));
        const episodioActual = temporadaDados.episodes.find((itemEpisodio) => itemEpisodio.episode_number === episodio);
        duracaoSegundos = (episodioActual?.runtime ?? 45) * 60;
      } else {
        setTemporadaActual(null);
        setTotalTemporadas(1);
        duracaoSegundos = ((item.runtime ?? 120) * 60);
      }

      const chaveActual = chaveProgresso(tipo, idSeguro, temporada, episodio);
      const progressoGuardado = progressoLocal[chaveActual];

      setPlayer({
        activo: true,
        titulo,
        tipo,
        id: idSeguro,
        url,
        temporada,
        episodio,
        qualidade: QUALIDADE_PADRAO,
        duracaoSegundos
      });

      setTempoSessaoPlayer(progressoGuardado?.posicaoSegundos ?? 0);

      registarHistorico(item, tipo, temporada, episodio);
      setACarregarPlayer(false);

    } catch (erro) {
      setACarregarPlayer(false);
      setErroPlayer(erro instanceof Error ? erro.message : "Não foi possível iniciar a reprodução.");
      reportarFalhaPlayer("iniciar-reproducao");
    }
  }

  /** Reproduz um episódio específico da temporada carregada */
  async function escolherEpisodio(numeroEpisodio: number): Promise<void> {
    if (!player.id || player.tipo !== "tv") return;
    try {
      setACarregarPlayer(true);
      const novaUrl = await obterUrlPlayer("tv", player.id, player.temporada, numeroEpisodio, player.qualidade);
      const duracaoEpisodio = temporadaActual?.episodes.find((itemEpisodio) => itemEpisodio.episode_number === numeroEpisodio)?.runtime ?? 45;
      setPlayer((actual) => ({ ...actual, url: novaUrl, episodio: numeroEpisodio, duracaoSegundos: duracaoEpisodio * 60 }));
      setACarregarPlayer(false);
    } catch {
      setErroPlayer("Não foi possível mudar para o episódio seleccionado.");
      setACarregarPlayer(false);
      reportarFalhaPlayer("troca-episodio");
    }
  }

  /** Carrega uma temporada completa e selecciona episódio inicial */
  async function escolherTemporada(numeroTemporada: number): Promise<void> {
    if (!player.id || player.tipo !== "tv") return;
    try {
      setACarregarPlayer(true);
      const dadosTemporada = await pedidoTMDB(`/tv/${player.id}/season/${numeroTemporada}`);
      const temporadaDados = dadosTemporada as DadosTemporada;
      setTemporadaActual(temporadaDados);

      const primeiroEpisodio = temporadaDados.episodes[0]?.episode_number ?? 1;
      const novaUrl = await obterUrlPlayer("tv", player.id, numeroTemporada, primeiroEpisodio, player.qualidade);

      setPlayer((actual) => ({
        ...actual,
        temporada: numeroTemporada,
        episodio: primeiroEpisodio,
        url: novaUrl,
        duracaoSegundos: (temporadaDados.episodes[0]?.runtime ?? 45) * 60
      }));
      setACarregarPlayer(false);
    } catch {
      setErroPlayer("Não foi possível carregar a temporada seleccionada.");
      setACarregarPlayer(false);
      reportarFalhaPlayer("troca-temporada");
    }
  }

  /** Fecha o popup do player */
  function fecharPlayer(): void {
    setPlayer((actual) => ({ ...actual, activo: false }));
  }

  /** Prepara modal de download e valida URL */
  function abrirDownload(item: ItemConteudo, tipo: TipoConteudo): void {
    try {
      const idSeguro = sanitizarId(item.id);
      const url = gerarUrlReproducao(tipo, idSeguro, 1, 1, SERVIDOR_PADRAO, AUDIO_PADRAO, QUALIDADE_PADRAO);
      setModalDownload({
        aberto: true,
        titulo: escapeText(item.title ?? item.name ?? "Sem título"),
        url
      });
    } catch {
      setErroPlayer("Download indisponível para este conteúdo.");
    }
  }

  function abrirDeepLink(prefixo: "idm" | "adm", url: string): void {
    window.location.href = `${prefixo}:${encodeURIComponent(url)}`;
  }

  /** Inicia reprodução a partir do modal de detalhes e fecha o modal */
  function verAgoraPelosDetalhes(): void {
    if (!modalDetalhes.item) return;
    setModalDetalhes({ aberto: false, tipo: modalDetalhes.tipo, item: null, aCarregar: false, erro: "" });
    void reproduzir(modalDetalhes.item, modalDetalhes.tipo, 1, 1);
  }

  /** Abre download a partir dos detalhes e fecha o modal de detalhes */
  function baixarPelosDetalhes(): void {
    if (!modalDetalhes.item) return;
    const item = modalDetalhes.item;
    const tipo = modalDetalhes.tipo;
    setModalDetalhes({ aberto: false, tipo, item: null, aCarregar: false, erro: "" });
    abrirDownload(item, tipo);
  }

  function reportarFalhaPlayer(contexto: string): void {
    fetch(`${API_PROXY_BASE}/observability/player-falha`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contexto,
        id: player.id,
        tipo: player.tipo,
        temporada: player.temporada,
        episodio: player.episodio,
        qualidade: player.qualidade
      })
    }).catch(() => undefined);
  }

  /** Retoma conteúdo com temporada/episódio guardados no progresso local */
  function retomarConteudo(item: ProgressoGuardado): void {
    const itemBase: ItemConteudo = {
      id: Number.parseInt(item.id, 10),
      title: item.tipo === "movie" ? item.titulo : undefined,
      name: item.tipo === "tv" ? item.titulo : undefined,
      poster_path: item.poster
    };
    void reproduzir(itemBase, item.tipo, item.temporada, item.episodio);
  }

  return (
    <div className={`min-h-screen bg-[radial-gradient(circle_at_top_right,#1a2743_0%,#050a18_45%,#040815_100%)] text-[var(--texto-principal)] ${modoDadosReduzidos ? "modo-lite" : ""} ${temaVisual === "noite-dourada" ? "tema-noite-dourada" : "tema-cinema-escuro"}`}>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[var(--fundo-sobreposicao)]/55 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
          <a href="#inicio" className="flex items-center gap-3" aria-label="AngoMovie início">
            <span className="text-2xl font-black tracking-tight">
              <span className="text-white">ANGO</span>
              <span className="text-[var(--destaque-principal)]">MOVIE</span>
            </span>
          </a>

          <nav className="hidden items-center gap-6 text-sm text-[var(--texto-secundario)] md:flex" aria-label="Navegação principal">
            <a href="#filmes" className="hover:text-white">Filmes</a>
            <a href="#series" className="hover:text-white">Séries</a>
            <a href="#animes" className="hover:text-white">Animes</a>
            <a href="#favoritos" className="hover:text-white">Favoritos</a>
          </nav>

          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--texto-suave)]" aria-hidden="true" />
              <input
                ref={referenciaBusca}
                type="search"
                value={termoBusca}
                onChange={(evento) => setTermoBusca(evento.target.value)}
                placeholder="Buscar filmes, séries, animes"
                className="h-12 w-72 rounded-xl border border-white/15 bg-white/10 pl-9 pr-3 text-sm text-white placeholder:text-[var(--texto-suave)] backdrop-blur-xl"
              />
            </div>
            <button
              type="button"
              onClick={() => setModoDadosReduzidos((actual) => !actual)}
              className="hidden h-12 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white md:inline-flex md:items-center"
            >
              {modoDadosReduzidos ? "Dados reduzidos: On" : "Dados reduzidos: Off"}
            </button>
            <button
              type="button"
              onClick={() => setAtalhosAbertos(true)}
              className="hidden h-12 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white md:inline-flex md:items-center"
            >
              Atalhos
            </button>
            <button
              type="button"
              onClick={() => setTemaVisual((actual) => (actual === "cinema-escuro" ? "noite-dourada" : "cinema-escuro"))}
              className="hidden h-12 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white md:inline-flex md:items-center"
            >
              {temaVisual === "cinema-escuro" ? "Noite dourada" : "Cinema escuro"}
            </button>
            <button
              type="button"
              onClick={() => setModalApoioAberto(true)}
              className="h-12 rounded-md bg-[var(--destaque-apoio)] px-4 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Apoiar
            </button>
            <button
              type="button"
              onClick={() => setMenuMobileAberto((estado) => !estado)}
              aria-label="Abrir menu"
              aria-expanded={menuMobileAberto}
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white backdrop-blur-xl md:hidden"
            >
              <i className={`fa-solid ${menuMobileAberto ? "fa-xmark" : "fa-bars"}`} aria-hidden="true" />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuMobileAberto ? (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: reduzirAnimacao ? 0 : 0.2 }}
              className="mx-4 mb-4 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-2xl md:hidden"
            >
              <nav className="grid gap-2" aria-label="Menu mobile">
                <a href="#filmes" onClick={() => setMenuMobileAberto(false)} className="rounded-lg px-3 py-2 text-sm text-[var(--texto-secundario)] hover:bg-white/10 hover:text-white">Filmes</a>
                <a href="#series" onClick={() => setMenuMobileAberto(false)} className="rounded-lg px-3 py-2 text-sm text-[var(--texto-secundario)] hover:bg-white/10 hover:text-white">Séries</a>
                <a href="#animes" onClick={() => setMenuMobileAberto(false)} className="rounded-lg px-3 py-2 text-sm text-[var(--texto-secundario)] hover:bg-white/10 hover:text-white">Animes</a>
                <a href="#favoritos" onClick={() => setMenuMobileAberto(false)} className="rounded-lg px-3 py-2 text-sm text-[var(--texto-secundario)] hover:bg-white/10 hover:text-white">Favoritos</a>
                <button
                  type="button"
                  onClick={() => setModoDadosReduzidos((actual) => !actual)}
                  className="rounded-lg border border-white/15 px-3 py-2 text-left text-sm text-[var(--texto-secundario)] hover:bg-white/10 hover:text-white"
                >
                  {modoDadosReduzidos ? "Reduzir dados: ligado" : "Reduzir dados: desligado"}
                </button>
              </nav>
              <div className="relative mt-3">
                <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--texto-suave)]" aria-hidden="true" />
                <input
                  type="search"
                  value={termoBusca}
                  onChange={(evento) => setTermoBusca(evento.target.value)}
                  placeholder="Buscar filmes, séries, animes"
                  className="h-12 w-full rounded-xl border border-white/15 bg-black/25 pl-9 pr-3 text-sm text-white placeholder:text-[var(--texto-suave)]"
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {(carregarBusca || resultadoBusca.length > 0 || erroBusca) && termoBusca.trim().length > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: reduzirAnimacao ? 0 : 0.2 }}
              className="mx-auto w-full max-w-[1400px] px-4 pb-4 sm:px-6 lg:px-10"
            >
              <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-2xl">
                {carregarBusca && <p className="text-sm text-[var(--texto-suave)]">A procurar resultados...</p>}
                {erroBusca && <p className="text-sm text-[var(--cor-erro)]">{erroBusca}</p>}
                {!carregarBusca && !erroBusca && resultadoBusca.length === 0 && (
                  <p className="text-sm text-[var(--texto-suave)]">Nenhum resultado encontrado.</p>
                )}
                <div className="grid gap-2">
                  {resultadoBusca.map((item) => (
                    <button
                      key={`busca-${item.media_type}-${item.id}`}
                      type="button"
                      onClick={() => {
                        void abrirDetalhes(item as ItemConteudo, item.media_type as TipoConteudo);
                        setTermoBusca("");
                      }}
                      className="flex items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-black/30"
                    >
                      <img
                        src={urlImagem(item.poster_path, "w342")}
                        srcSet={srcSetImagem(item.poster_path)}
                        sizes="56px"
                        alt={`Poster de ${escapeText(item.title ?? item.name ?? "Conteúdo")}`}
                        width={56}
                        height={84}
                        loading="lazy"
                        className="aspect-[2/3] w-14 rounded object-cover"
                      />
                      <span className="text-sm text-white">{escapeText(item.title ?? item.name ?? "Sem título")}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      <main id="inicio">
        <section className={`fundo-hero ${reduzirAnimacao ? "" : "fundo-hero-animado"} relative min-h-[82vh] overflow-hidden border-b border-white/10`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_20%,rgba(242,169,0,0.18),transparent_34%),radial-gradient(circle_at_74%_74%,rgba(229,9,20,0.3),transparent_42%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(112deg,#020612_12%,#050a18_48%,#091126_100%)]" />
          <div className="fundo-hero-linhas absolute inset-0 opacity-60" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,10,24,0.2),rgba(5,10,24,0.72))]" />

          <motion.div
            initial={{ opacity: 0, y: reduzirAnimacao ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduzirAnimacao ? 0 : 0.45 }}
            className="relative mx-auto flex w-full max-w-[1400px] flex-col justify-end gap-5 px-4 pb-18 pt-28 sm:px-6 sm:pb-24 sm:pt-32 lg:px-10"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--destaque-dourado)]">Plataforma angolana 100% gratuita</p>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              <span className="text-white">ANGO</span>
              <span className="text-[var(--destaque-principal)]">MOVIE</span>
            </h1>
            <p className="max-w-2xl text-base text-[var(--texto-secundario)]/95 sm:text-lg">
              Filmes, séries e animes para todos, sem login obrigatório e sem planos pagos. Apoio ao projecto é sempre voluntário.
            </p>
            {hero ? <p className="text-sm text-white/70">Em destaque agora: {tituloHero}</p> : null}
            <div className="max-w-xl rounded-xl border border-white/15 bg-white/8 px-4 py-3 backdrop-blur-xl">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--destaque-dourado)]">{DESTAQUE_SEMANAL.semana}</p>
              <p className="mt-1 text-sm font-semibold text-white">{DESTAQUE_SEMANAL.titulo}</p>
              <p className="mt-1 text-xs text-[var(--texto-suave)]">{DESTAQUE_SEMANAL.itens.join(" • ")}</p>
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <a href="#filmes" className="btn-premium inline-flex h-12 items-center rounded-xl bg-[var(--destaque-principal)] px-6 font-semibold shadow-[0_10px_35px_rgba(229,9,20,0.38)] transition hover:bg-[var(--destaque-hover)]">
                Explorar catálogo
              </a>
              <button
                type="button"
                onClick={() => setModalApoioAberto(true)}
                className="btn-premium inline-flex h-12 items-center rounded-xl border border-white/20 bg-white/10 px-6 font-semibold backdrop-blur-xl transition hover:bg-white/15"
              >
                Apoiar voluntariamente
              </button>
            </div>
          </motion.div>
        </section>

        <SecaoCatalogo
          id="filmes"
          titulo="Filmes"
          subtitulo="Escolhe entre populares, em cartaz e melhores avaliados."
          estado={filmes}
          tipo="movie"
          filtroActual={filtroFilmes}
          filtros={["populares", "em-cartaz", "melhores"]}
          onMudarFiltro={(valor) => setFiltroFilmes(valor as keyof typeof FILTROS_FILMES)}
          onDetalhes={(item) => void abrirDetalhes(item, "movie")}
          onVer={(item) => void reproduzir(item, "movie")}
          onFavorito={(item) => alternarFavorito(item, "movie")}
          onDownload={(item) => abrirDownload(item, "movie")}
          onVerDepois={(item) => alternarVerDepois(item, "movie")}
          onPrefetch={(item) => void prefetchDetalhes(item, "movie")}
          onCarregarMais={() => void carregarMais("filmes")}
          verificaFavorito={(id) => estaNosFavoritos(id, "movie")}
          verificaVisto={(id) => jaFoiVisto(id, "movie")}
          verificaVerDepois={(id) => estaNaListaVerDepois(id, "movie")}
          reduzMovimento={reduzirAnimacao}
        />

        <SecaoCatalogo
          id="series"
          titulo="Séries"
          subtitulo="Séries populares e melhor avaliadas, com selecção de episódios."
          estado={series}
          tipo="tv"
          filtroActual={filtroSeries}
          filtros={["populares", "melhores"]}
          onMudarFiltro={(valor) => setFiltroSeries(valor as keyof typeof FILTROS_SERIES)}
          onDetalhes={(item) => void abrirDetalhes(item, "tv")}
          onVer={(item) => void reproduzir(item, "tv", 1, 1)}
          onFavorito={(item) => alternarFavorito(item, "tv")}
          onDownload={(item) => abrirDownload(item, "tv")}
          onVerDepois={(item) => alternarVerDepois(item, "tv")}
          onPrefetch={(item) => void prefetchDetalhes(item, "tv")}
          onCarregarMais={() => void carregarMais("series")}
          verificaFavorito={(id) => estaNosFavoritos(id, "tv")}
          verificaVisto={(id) => jaFoiVisto(id, "tv")}
          verificaVerDepois={(id) => estaNaListaVerDepois(id, "tv")}
          reduzMovimento={reduzirAnimacao}
        />

        <SecaoCatalogo
          id="animes"
          titulo="Animes"
          subtitulo="Selecção baseada em conteúdo de animação na TMDB."
          estado={animes}
          tipo="tv"
          filtros={[]}
          onMudarFiltro={() => undefined}
          onDetalhes={(item) => void abrirDetalhes(item, "tv")}
          onVer={(item) => void reproduzir(item, "tv", 1, 1)}
          onFavorito={(item) => alternarFavorito(item, "tv")}
          onDownload={(item) => abrirDownload(item, "tv")}
          onVerDepois={(item) => alternarVerDepois(item, "tv")}
          onPrefetch={(item) => void prefetchDetalhes(item, "tv")}
          onCarregarMais={() => void carregarMais("animes")}
          verificaFavorito={(id) => estaNosFavoritos(id, "tv")}
          verificaVisto={(id) => jaFoiVisto(id, "tv")}
          verificaVerDepois={(id) => estaNaListaVerDepois(id, "tv")}
          reduzMovimento={reduzirAnimacao}
        />

        <section id="ver-depois" className="mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-6 lg:px-10">
          <h2 className="text-2xl font-bold">Lista para ver depois</h2>
          <p className="mt-1 text-sm text-[var(--texto-suave)]">Separada dos favoritos para te ajudar a organizar melhor.</p>
          {verDepois.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center text-[var(--texto-suave)]">
              <i className="fa-regular fa-bookmark mb-3 text-lg" aria-hidden="true" />
              <p className="text-sm">Ainda não guardaste títulos para ver depois.</p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {verDepois.map((item) => (
                <article key={`depois-${item.tipo}-${item.id}`} className="group">
                  <img
                    src={urlImagem(item.poster, modoDadosReduzidos ? "w185" : "w342")}
                    srcSet={srcSetImagem(item.poster)}
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 16vw"
                    alt={`Poster de ${item.titulo}`}
                    width={342}
                    height={513}
                    loading="lazy"
                    className="aspect-[2/3] w-full rounded-md object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => sincronizarVerDepois(verDepois.filter((entrada) => !(entrada.id === item.id && entrada.tipo === item.tipo)))}
                    className="mt-2 h-10 w-full rounded-md border border-[var(--borda-cor)] text-sm transition hover:border-[var(--destaque-dourado)]"
                  >
                    Remover
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="favoritos" className="mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-6 lg:px-10">
          <h2 className="text-2xl font-bold">Os meus favoritos</h2>
          <p className="mt-1 text-sm text-[var(--texto-suave)]">Guardados no teu dispositivo, sem conta.</p>
          {favoritos.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center text-[var(--texto-suave)]">
              <i className="fa-regular fa-heart mb-3 text-lg" aria-hidden="true" />
              <p className="text-sm">Ainda não tens favoritos.</p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {favoritos.map((item) => (
                <article key={`fav-${item.tipo}-${item.id}`} className="group">
                  <img
                    src={urlImagem(item.poster, "w342")}
                    srcSet={srcSetImagem(item.poster)}
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 16vw"
                    alt={`Poster de ${item.titulo}`}
                    width={342}
                    height={513}
                    loading="lazy"
                    className="aspect-[2/3] w-full rounded-md object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => sincronizarFavoritos(favoritos.filter((fav) => !(fav.id === item.id && fav.tipo === item.tipo)))}
                    className="mt-2 h-10 w-full rounded-md border border-[var(--borda-cor)] text-sm transition hover:border-[var(--destaque-principal)]"
                  >
                    Remover
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="historico" className="mx-auto w-full max-w-[1400px] px-4 pb-16 sm:px-6 lg:px-10">
          <h2 className="text-2xl font-bold">Continuar a ver</h2>
          <p className="mt-1 text-sm text-[var(--texto-suave)]">Guardado localmente por filme e episódio.</p>
          {continuarAVer.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center text-[var(--texto-suave)]">
              <i className="fa-solid fa-clock-rotate-left mb-3 text-lg" aria-hidden="true" />
              <p className="text-sm">Ainda não há progresso guardado.</p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {continuarAVer.map((item) => {
                const percentagem = Math.min(100, Math.round((item.posicaoSegundos / Math.max(item.duracaoSegundos, 1)) * 100));
                return (
                  <button
                    key={`continuar-${item.chave}`}
                    type="button"
                    onClick={() => retomarConteudo(item)}
                    className="rounded-xl border border-white/10 bg-white/5 p-3 text-left backdrop-blur-xl"
                  >
                    <p className="line-clamp-1 text-sm font-semibold text-white">{item.titulo}</p>
                    <p className="mt-1 text-xs text-[var(--texto-suave)]">
                      {item.tipo === "tv" ? `Temporada ${item.temporada}, episódio ${item.episodio}` : "Filme"}
                    </p>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/40">
                      <div className="h-full rounded-full bg-[var(--destaque-principal)]" style={{ width: `${percentagem}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--texto-suave)]">{percentagem}% visto • {formatarTempo(item.posicaoSegundos)}</p>
                  </button>
                );
              })}
            </div>
          )}

          <h2 className="mt-10 text-2xl font-bold">Visto recentemente</h2>
          <p className="mt-1 text-sm text-[var(--texto-suave)]">O teu histórico fica apenas neste dispositivo.</p>
          {historico.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center text-[var(--texto-suave)]">
              <i className="fa-solid fa-film mb-3 text-lg" aria-hidden="true" />
              <p className="text-sm">Ainda não reproduziste nenhum conteúdo.</p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {historico.map((item) => (
                <article key={`hist-${item.tipo}-${item.id}`}>
                  <img
                    src={urlImagem(item.poster, "w342")}
                    srcSet={srcSetImagem(item.poster)}
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 16vw"
                    alt={`Poster de ${item.titulo}`}
                    width={342}
                    height={513}
                    loading="lazy"
                    className="aspect-[2/3] w-full rounded-md object-cover"
                  />
                  <p className="mt-2 line-clamp-2 text-xs text-[var(--texto-secundario)]">{item.titulo}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <ModalBase aberto={modalApoioAberto} aoFechar={() => setModalApoioAberto(false)} titulo="Apoiar o AngoMovie">
        <p className="text-sm text-[var(--texto-secundario)]">
          O AngoMovie é e continuará 100% gratuito. O apoio é voluntário e ajuda a manter os custos da plataforma.
        </p>
        <dl className="mt-4 grid gap-3 text-sm">
          <LinhaDado rotulo="Entidade" valor="10116" copiavel />
          <LinhaDado rotulo="Referência" valor="956305691" copiavel />
          <LinhaDado rotulo="Valor mínimo" valor="1000 Kz" />
          <LinhaDado rotulo="Teu ID AngoMovie" valor={idUtilizador} copiavel />
        </dl>
        <p className="mt-4 text-xs text-[var(--texto-suave)]">
          Valor mínimo estabelecido pela entidade de pagamento: 1000 Kz.
        </p>
        <p className="mt-2 text-xs text-[var(--texto-suave)]">
          Envia comprovativo para WhatsApp: <a className="font-semibold text-[var(--destaque-dourado)]" href="https://wa.me/244956305691" target="_blank" rel="noreferrer">+244 956 305 691</a>
        </p>
        <button
          type="button"
          onClick={() => setModalApoioAberto(false)}
          className="mt-4 h-12 rounded-md bg-[var(--destaque-principal)] px-4 font-semibold"
        >
          Fechar
        </button>
      </ModalBase>

      <ModalBase aberto={modalDownload.aberto} aoFechar={() => setModalDownload({ aberto: false, titulo: "", url: "" })} titulo="Baixar conteúdo">
        <p className="text-sm text-[var(--texto-secundario)]">{modalDownload.titulo}</p>
        <p className="mt-2 text-sm text-[var(--texto-suave)]">Escolhe a aplicação instalada no teu telemóvel.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => abrirDeepLink("idm", modalDownload.url)}
            className="h-12 rounded-md border border-[var(--borda-cor)] transition hover:border-[var(--destaque-principal)]"
          >
            Baixar com 1DM
          </button>
          <button
            type="button"
            onClick={() => abrirDeepLink("adm", modalDownload.url)}
            className="h-12 rounded-md border border-[var(--borda-cor)] transition hover:border-[var(--destaque-principal)]"
          >
            Baixar com ADM
          </button>
        </div>
      </ModalBase>

      <ModalBase aberto={atalhosAbertos} aoFechar={() => setAtalhosAbertos(false)} titulo="Atalhos de teclado">
        <ul className="grid gap-2 text-sm text-[var(--texto-secundario)]">
          <li><strong>/</strong> - Focar a busca</li>
          <li><strong>Esc</strong> - Fechar modais e menu</li>
          <li><strong>?</strong> - Abrir esta ajuda</li>
          <li><strong>Seta direita/esquerda</strong> - Próximo/anterior episódio (no player de séries)</li>
          <li><strong>Setas na grelha</strong> - Navegar cartões</li>
          <li><strong>Enter ou Espaço</strong> - Abrir detalhes do cartão focado</li>
        </ul>
      </ModalBase>

      <ModalBase aberto={player.activo} aoFechar={fecharPlayer} titulo={`A ver: ${player.titulo}`} grande>
        <div className="flex h-full flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--texto-suave)]">Qualidade:</span>
            {QUALIDADES_VIDEO.map((qualidade) => (
              <button
                key={qualidade.codigo}
                type="button"
                onClick={() => {
                  void (async () => {
                    const urlActualizada = await obterUrlPlayer(
                      player.tipo,
                      player.id,
                      player.temporada,
                      player.episodio,
                      qualidade.codigo
                    );
                    setPlayer((actual) => ({ ...actual, qualidade: qualidade.codigo, url: urlActualizada }));
                  })();
                }}
                className={`h-9 rounded-md border px-3 text-xs font-semibold ${
                  player.qualidade === qualidade.codigo
                    ? "border-[var(--destaque-principal)] bg-[var(--destaque-principal)]/20"
                    : "border-[var(--borda-cor)]"
                }`}
              >
                {qualidade.nome}
              </button>
            ))}
            <span className="ml-auto text-xs text-[var(--texto-suave)]">Posição guardada: {formatarTempo(tempoSessaoPlayer)}</span>
          </div>

          <div className="relative min-h-[220px] w-full flex-1 overflow-hidden rounded-md border border-[var(--borda-cor)] bg-black sm:min-h-[320px] lg:min-h-[420px]">
            {aCarregarPlayer ? (
              <div className="h-full w-full animate-pulse bg-[linear-gradient(120deg,#0b1222_20%,#15213d_50%,#0b1222_80%)]" aria-label="A carregar reprodutor" />
            ) : (
              <iframe
                src={player.url}
                title={`Reprodutor: ${player.titulo}`}
                className="h-full w-full"
                loading="lazy"
                onError={() => {
                  setErroPlayer("Falha no carregamento do player.");
                  reportarFalhaPlayer("iframe-onerror");
                }}
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                referrerPolicy="no-referrer"
              />
            )}
          </div>

          {erroPlayer ? <p className="text-sm text-[var(--cor-erro)]">{erroPlayer}</p> : null}

          {temporadaActual && temporadaActual.episodes.length > 0 ? (
            <div className="rounded-xl border border-white/15 bg-white/5 p-4 backdrop-blur-xl">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--texto-secundario)]">
                  Temporada {temporadaActual.season_number} de {totalTemporadas}
                </p>
                <button
                  type="button"
                  onClick={() => void escolherEpisodio(player.episodio + 1)}
                  disabled={!proximoEpisodioExiste}
                  className="h-9 rounded-md border border-[var(--borda-cor)] px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Próximo episódio
                </button>
              </div>

              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {Array.from({ length: totalTemporadas }).map((_, indice) => {
                  const numero = indice + 1;
                  const activa = numero === player.temporada;
                  return (
                    <button
                      key={`temp-${numero}`}
                      type="button"
                      onClick={() => void escolherTemporada(numero)}
                      className={`h-10 shrink-0 rounded-lg border px-3 text-xs font-semibold transition ${
                        activa
                          ? "border-[var(--destaque-principal)] bg-[var(--destaque-principal)]/20 text-white"
                          : "border-[var(--borda-cor)] text-[var(--texto-suave)] hover:border-[var(--destaque-principal)]/60"
                      }`}
                    >
                      T{numero}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
                {temporadaActual.episodes.map((episodio) => (
                  <button
                    key={episodio.id}
                    type="button"
                    onClick={() => void escolherEpisodio(episodio.episode_number)}
                    className={`h-11 rounded-lg border text-xs font-semibold transition ${
                      episodio.episode_number === player.episodio
                        ? "border-[var(--destaque-principal)] bg-[var(--destaque-principal)]/25 text-white"
                        : "border-[var(--borda-cor)] text-[var(--texto-suave)] hover:border-[var(--destaque-principal)]/60 hover:text-white"
                    }`}
                    aria-label={`Episódio ${episodio.episode_number}`}
                  >
                    Ep. {episodio.episode_number}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </ModalBase>

      <ModalBase
        aberto={modalDetalhes.aberto}
        aoFechar={() => setModalDetalhes({ aberto: false, tipo: "movie", item: null, aCarregar: false, erro: "" })}
        titulo="Detalhes"
        grande
      >
        {modalDetalhes.aCarregar ? (
          <div className="space-y-4" aria-label="A carregar detalhes">
            <div className="aspect-[21/9] w-full animate-pulse rounded-xl bg-[linear-gradient(120deg,#0b1222_20%,#18294a_50%,#0b1222_80%)]" />
            <div className="h-8 w-2/3 animate-pulse rounded-md bg-white/10" />
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="h-14 animate-pulse rounded-md bg-white/10" />
              <div className="h-14 animate-pulse rounded-md bg-white/10" />
            </div>
            <div className="h-24 animate-pulse rounded-md bg-white/10" />
          </div>
        ) : null}
        {modalDetalhes.erro ? <p className="text-sm text-[var(--cor-erro)]">{modalDetalhes.erro}</p> : null}
        {modalDetalhes.item ? (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="space-y-3">
                <img
                  src={urlImagem(modalDetalhes.item.poster_path, "w500")}
                  srcSet={srcSetImagem(modalDetalhes.item.poster_path)}
                  sizes="(max-width: 1024px) 80vw, 280px"
                  alt={`Poster de ${escapeText(modalDetalhes.item.title ?? modalDetalhes.item.name ?? "conteúdo")}`}
                  width={500}
                  height={750}
                  className="aspect-[2/3] w-full rounded-xl object-cover"
                />
                <div className="grid grid-cols-2 gap-2">
                  <InfoCurta rotulo="Ano" valor={obterAno(modalDetalhes.item.release_date ?? modalDetalhes.item.first_air_date)} />
                  <InfoCurta rotulo="Avaliação" valor={modalDetalhes.item.vote_average ? modalDetalhes.item.vote_average.toFixed(1) : "N/D"} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold leading-tight">{escapeText(modalDetalhes.item.title ?? modalDetalhes.item.name ?? "Sem título")}</h3>
                  {modalDetalhes.item.tagline ? <p className="text-sm italic text-[var(--texto-suave)]">{escapeText(modalDetalhes.item.tagline)}</p> : null}
                </div>

                <p className="text-sm leading-7 text-[var(--texto-secundario)]">{resumo(modalDetalhes.item.overview, 680)}</p>

                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <InfoLinha rotulo="Estreia" valor={formatarData(modalDetalhes.item.release_date ?? modalDetalhes.item.first_air_date)} />
                  <InfoLinha rotulo="Duração" valor={modalDetalhes.tipo === "movie" ? `${modalDetalhes.item.runtime ?? "N/D"} min` : `${modalDetalhes.item.episode_run_time?.[0] ?? "N/D"} min/ep`} />
                  <InfoLinha rotulo="Idioma original" valor={mapearIdioma(modalDetalhes.item.original_language)} />
                  <InfoLinha rotulo="Estado" valor={modalDetalhes.item.status ?? "N/D"} />
                  {modalDetalhes.tipo === "tv" ? <InfoLinha rotulo="Temporadas" valor={String(modalDetalhes.item.number_of_seasons ?? "N/D")} /> : null}
                  {modalDetalhes.tipo === "tv" ? <InfoLinha rotulo="Episódios" valor={String(modalDetalhes.item.number_of_episodes ?? "N/D")} /> : null}
                  <InfoLinha rotulo="Votos" valor={String(modalDetalhes.item.vote_count ?? 0)} />
                </dl>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--texto-suave)]">Géneros</p>
                  <div className="flex flex-wrap gap-2">
                    {modalDetalhes.item.genres && modalDetalhes.item.genres.length > 0 ? (
                      modalDetalhes.item.genres.map((genero) => (
                        <span
                          key={genero.id}
                          className={`rounded-full border px-3 py-1 text-xs ${classeGenero(genero.name)}`}
                        >
                          {genero.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-[var(--texto-suave)]">N/D</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={verAgoraPelosDetalhes}
                className="h-12 rounded-md bg-[var(--destaque-principal)] font-semibold"
              >
                Ver agora
              </button>
              <button
                type="button"
                onClick={() => alternarFavorito(modalDetalhes.item as ItemConteudo, modalDetalhes.tipo)}
                className="h-12 rounded-md border border-[var(--borda-cor)] font-semibold"
              >
                Favorito
              </button>
              <button
                type="button"
                onClick={baixarPelosDetalhes}
                className="h-12 rounded-md border border-[var(--borda-cor)] font-semibold"
              >
                Download
              </button>
            </div>
          </div>
        ) : null}
      </ModalBase>

    </div>
  );
}

interface PropriedadesSecao {
  id: string;
  titulo: string;
  subtitulo: string;
  estado: EstadoLista;
  tipo: TipoConteudo;
  filtros: string[];
  filtroActual?: string;
  onMudarFiltro: (valor: string) => void;
  onDetalhes: (item: ItemConteudo) => void;
  onVer: (item: ItemConteudo) => void;
  onFavorito: (item: ItemConteudo) => void;
  onDownload: (item: ItemConteudo) => void;
  onVerDepois: (item: ItemConteudo) => void;
  onPrefetch: (item: ItemConteudo) => void;
  onCarregarMais: () => void;
  verificaFavorito: (id: number) => boolean;
  verificaVisto: (id: number) => boolean;
  verificaVerDepois: (id: number) => boolean;
  reduzMovimento: boolean;
}

function SecaoCatalogo(props: PropriedadesSecao) {
  const tamanhoPoster = props.reduzMovimento ? "w185" : "w342";

  function gerirNavegacaoTeclado(evento: KeyboardEvent<HTMLButtonElement>, indice: number, item: ItemConteudo): void {
    const colunas = window.innerWidth >= 1024 ? 6 : window.innerWidth >= 640 ? 3 : 2;
    let proximoIndice = indice;

    if (evento.key === "ArrowRight") proximoIndice = Math.min(indice + 1, props.estado.lista.length - 1);
    if (evento.key === "ArrowLeft") proximoIndice = Math.max(indice - 1, 0);
    if (evento.key === "ArrowDown") proximoIndice = Math.min(indice + colunas, props.estado.lista.length - 1);
    if (evento.key === "ArrowUp") proximoIndice = Math.max(indice - colunas, 0);

    if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      props.onDetalhes(item);
      return;
    }

    if (proximoIndice !== indice) {
      evento.preventDefault();
      const selector = `[data-grelha="${props.id}"][data-indice="${proximoIndice}"]`;
      const alvo = document.querySelector<HTMLButtonElement>(selector);
      alvo?.focus();
    }
  }

  return (
    <section id={props.id} className="mx-auto w-full max-w-[1400px] border-t border-white/10 px-4 py-10 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{props.titulo}</h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--texto-suave)]">{props.subtitulo}</p>
        </div>
        {props.filtros.length > 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1 backdrop-blur-xl">
            {props.filtros.map((filtro) => (
              <button
                key={`${props.id}-${filtro}`}
                type="button"
                onClick={() => props.onMudarFiltro(filtro)}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  props.filtroActual === filtro
                    ? "bg-[var(--destaque-principal)] text-white shadow-[0_8px_24px_rgba(229,9,20,0.35)]"
                    : "text-[var(--texto-secundario)] hover:bg-white/10"
                }`}
              >
                {filtro === "em-cartaz" ? "Em cartaz" : filtro}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {props.estado.aCarregar && props.estado.lista.length === 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`${props.id}-skeleton-${index}`} className="aspect-[2/3] animate-pulse rounded-xl bg-[linear-gradient(120deg,#0b1222_20%,#18294a_50%,#0b1222_80%)]" />
          ))}
        </div>
      ) : null}

      {props.estado.erro ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span>{props.estado.erro}</span>
        </div>
      ) : null}

      {!props.estado.aCarregar && !props.estado.erro && props.estado.lista.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center text-[var(--texto-suave)]">
          <p className="text-sm">Sem resultados nesta secção.</p>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {props.estado.lista.map((item, indice) => (
          <motion.article
            key={`${props.id}-${item.id}`}
            initial={{ opacity: 0, y: props.reduzMovimento ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: props.reduzMovimento ? 0 : 0.25 }}
            whileHover={props.reduzMovimento ? {} : { scale: 1.03 }}
            className="group rounded-xl border border-white/[0.08] bg-white/5 p-2 backdrop-blur-xl transition hover:border-white/20"
          >
            <button
              type="button"
              onClick={() => props.onDetalhes(item)}
              onMouseEnter={() => props.onPrefetch(item)}
              onFocus={() => props.onPrefetch(item)}
              onKeyDown={(evento) => gerirNavegacaoTeclado(evento, indice, item)}
              data-grelha={props.id}
              data-indice={indice}
              className="w-full text-left"
            >
              <div className="relative">
                <img
                  src={urlImagem(item.poster_path, tamanhoPoster)}
                  srcSet={srcSetImagem(item.poster_path)}
                  sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 16vw"
                  alt={`Poster de ${escaparHTML(item.title ?? item.name ?? "conteúdo")}`}
                  width={342}
                  height={513}
                  loading="lazy"
                  className="aspect-[2/3] w-full rounded-lg object-cover"
                />
                {props.verificaVisto(item.id) ? (
                  <span className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-[var(--cor-sucesso)]" aria-label="Já visto">
                    <i className="fa-solid fa-check text-xs" aria-hidden="true" />
                  </span>
                ) : null}
              </div>
            </button>
            <h3 className="mt-2 line-clamp-1 text-sm font-semibold">{escaparHTML(item.title ?? item.name ?? "Sem título")}</h3>
            <p className="text-xs text-[var(--texto-suave)]">Avaliação: {item.vote_average ? item.vote_average.toFixed(1) : "N/D"}</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <button type="button" onClick={() => props.onVer(item)} className="h-10 rounded-md border border-[var(--borda-cor)] text-xs transition hover:border-[var(--destaque-principal)]">
                Ver
              </button>
              <button
                type="button"
                onClick={() => props.onFavorito(item)}
                className={`h-10 rounded-md border text-xs transition ${
                  props.verificaFavorito(item.id)
                    ? "border-[var(--destaque-principal)] text-[var(--destaque-principal)]"
                    : "border-[var(--borda-cor)] hover:border-[var(--destaque-principal)]"
                }`}
              >
                <i className="fa-solid fa-heart" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => props.onDownload(item)} className="h-10 rounded-md border border-[var(--borda-cor)] text-xs transition hover:border-[var(--destaque-principal)]">
                <i className="fa-solid fa-download" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => props.onVerDepois(item)}
                className={`h-10 rounded-md border text-xs transition ${
                  props.verificaVerDepois(item.id)
                    ? "border-[var(--destaque-dourado)] text-[var(--destaque-dourado)]"
                    : "border-[var(--borda-cor)] hover:border-[var(--destaque-dourado)]"
                }`}
                aria-label="Guardar para ver depois"
              >
                <i className="fa-regular fa-bookmark" aria-hidden="true" />
              </button>
            </div>
          </motion.article>
        ))}
      </div>

      {props.estado.pagina < props.estado.totalPaginas ? (
        <button
          type="button"
          onClick={props.onCarregarMais}
          className="mt-6 h-12 rounded-md border border-[var(--borda-cor)] px-4 text-sm font-semibold transition hover:border-[var(--destaque-principal)]"
        >
          Carregar mais
        </button>
      ) : null}
    </section>
  );
}

interface PropriedadesModal {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  grande?: boolean;
}

function ModalBase(props: PropriedadesModal) {
  if (!props.aberto) return null;
  const classeJanela = props.grande
    ? "max-w-[96vw] h-[92vh] max-h-[92vh]"
    : "max-w-2xl";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4" role="dialog" aria-modal="true" aria-label={props.titulo}>
      <div className={`flex w-full flex-col rounded-2xl border border-white/15 bg-[linear-gradient(135deg,rgba(255,255,255,0.14),rgba(255,255,255,0.04))] p-4 shadow-2xl backdrop-blur-3xl sm:p-5 ${classeJanela}`}>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">{props.titulo}</h2>
          <button type="button" onClick={props.aoFechar} className="h-10 w-10 rounded-md border border-[var(--borda-cor)]">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
        <div className={props.grande ? "min-h-0 flex-1 overflow-y-auto pr-1" : ""}>{props.children}</div>
      </div>
    </div>
  );
}

interface PropriedadesLinhaDado {
  rotulo: string;
  valor: string;
  copiavel?: boolean;
}

interface PropriedadesInfoLinha {
  rotulo: string;
  valor: string;
}

function InfoLinha(props: PropriedadesInfoLinha) {
  return (
    <div className="rounded-md border border-[var(--borda-cor)] bg-[var(--fundo-cartao)] px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--texto-suave)]">{props.rotulo}</dt>
      <dd className="mt-1 text-sm text-[var(--texto-secundario)]">{props.valor}</dd>
    </div>
  );
}

function InfoCurta(props: PropriedadesInfoLinha) {
  return (
    <div className="rounded-md border border-[var(--borda-cor)] bg-[var(--fundo-cartao)] px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--texto-suave)]">{props.rotulo}</p>
      <p className="mt-1 text-sm text-[var(--texto-secundario)]">{props.valor}</p>
    </div>
  );
}

function LinhaDado(props: PropriedadesLinhaDado) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border border-[var(--borda-cor)] px-3 py-2">
      <span className="text-[var(--texto-suave)]">{props.rotulo}</span>
      <strong>{props.valor}</strong>
      {props.copiavel ? (
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(props.valor)}
          className="h-9 rounded-md border border-[var(--borda-cor)] px-2 text-xs"
        >
          Copiar
        </button>
      ) : (
        <span className="h-9" />
      )}
    </div>
  );
}
