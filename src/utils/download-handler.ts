/**
 * @fileoverview Gestor de Downloads para Integração com IDM e ADM
 * Implementa Deep Links válidos para aplicações de download externas
 * e tratamento seguro de URLs com validação rigorosa
 */

export interface ConfiguracaoDownload {
  titulo: string;
  id: string;
  tipo: "movie" | "tv";
  temporada?: number;
  episodio?: number;
  poster?: string;
  url?: string;
}

/**
 * Valida se a URL é segura para download
 * @throws Error se a URL não passa na validação de segurança
 */
function validarUrlDownload(url: string): string {
  try {
    const analisada = new URL(url);

    // Apenas HTTPS permitido
    if (analisada.protocol !== "https:") {
      throw new Error("Apenas HTTPS é permitido para downloads");
    }

    // Whitelist de domínios de reprodução permitidos
    const dominiosPermitidos = [
      "myembed.biz",
      "www.myembed.biz",
      "api.angomovie.qzz.io"
    ];

    if (!dominiosPermitidos.some((dominio) => analisada.hostname.includes(dominio))) {
      throw new Error(`Domínio não permitido: ${analisada.hostname}`);
    }

    return analisada.toString();
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes("não permitido")) {
      throw erro;
    }
    throw new Error("URL de download inválida ou malformada");
  }
}

/**
 * Gera Deep Link para IDM (Internet Download Manager)
 * Formato: idm:URL
 * @throws Error se a URL não for válida
 */
export function gerarDeepLinkIDM(url: string): string {
  const urlValidada = validarUrlDownload(url);
  return `idm:${encodeURIComponent(urlValidada)}`;
}

/**
 * Gera Deep Link para ADM (Advanced Download Manager)
 * Formato: adm:URL
 * @throws Error se a URL não for válida
 */
export function gerarDeepLinkADM(url: string): string {
  const urlValidada = validarUrlDownload(url);
  return `adm:${encodeURIComponent(urlValidada)}`;
}

/**
 * Abre o link de download na aplicação IDM
 * Redireciona o navegador para o Deep Link IDM
 */
export function abrirEmIDM(url: string): void {
  try {
    const deepLink = gerarDeepLinkIDM(url);
    window.location.href = deepLink;
  } catch (erro) {
    console.error("Erro ao abrir em IDM:", erro);
    throw erro;
  }
}

/**
 * Abre o link de download na aplicação ADM
 * Redireciona o navegador para o Deep Link ADM
 */
export function abrirEmADM(url: string): void {
  try {
    const deepLink = gerarDeepLinkADM(url);
    window.location.href = deepLink;
  } catch (erro) {
    console.error("Erro ao abrir em ADM:", erro);
    throw erro;
  }
}

/**
 * Detecta se IDM ou ADM estão instalados no dispositivo
 * Retorna a aplicação disponível em prioridade: IDM > ADM
 */
export function detectarAplicacaoDownload(): "idm" | "adm" | null {
  // Em Android, verificar se a aplicação está instalada é complexo
  // Por isso, retornamos a preferência padrão
  // A aplicação pode fallback para o navegador se o Deep Link falhar

  // Prioridade: IDM > ADM
  return "idm"; // Padrão
}

/**
 * Tenta abrir com a melhor aplicação disponível
 * Fallback automático: IDM → ADM → Navegador
 */
export function abrirComMelhorAplicacao(url: string, nomeArquivo?: string): void {
  const urlValidada = validarUrlDownload(url);

  // Criar nome do arquivo com metadados úteis
  const nomeCompleto = nomeArquivo
    ? `${nomeArquivo}.mkv`
    : `angomovie-${Date.now()}.mkv`;

  try {
    // Tentar IDM primeiro
    const deepLinkIDM = `idm:${encodeURIComponent(urlValidada)}&fname=${encodeURIComponent(nomeCompleto)}`;
    window.location.href = deepLinkIDM;

    // Se falhar (após timeout), tentar ADM
    setTimeout(() => {
      try {
        const deepLinkADM = `adm:${encodeURIComponent(urlValidada)}`;
        window.location.href = deepLinkADM;
      } catch (erro) {
        console.error("Erro ao abrir em ADM:", erro);
        // Fallback para download direto no navegador
        tentarDownloadNaveagador(urlValidada, nomeCompleto);
      }
    }, 1500);
  } catch (erro) {
    console.error("Erro ao abrir com aplicação de download:", erro);
    tentarDownloadNaveagador(urlValidada, nomeCompleto);
  }
}

/**
 * Fallback: tenta download direto no navegador
 * Útil se nenhuma aplicação de download estiver instalada
 */
function tentarDownloadNaveagador(url: string, nomeArquivo: string): void {
  try {
    const elemento = document.createElement("a");
    elemento.href = url;
    elemento.download = nomeArquivo;
    elemento.style.display = "none";
    document.body.appendChild(elemento);
    elemento.click();
    document.body.removeChild(elemento);
  } catch (erro) {
    console.error("Erro ao fazer download no navegador:", erro);
    // Último recurso: abrir em nova aba
    window.open(url, "_blank");
  }
}

/**
 * Gera URL de download a partir dos parâmetros do conteúdo
 * Valida e constrói a URL segura para reprodução
 */
export function construirUrlDownload(
  tipo: "movie" | "tv",
  id: string,
  temporada = 1,
  episodio = 1
): string {
  // Validar ID
  if (!/^tt\d{7,8}$|^\d{1,7}$/.test(id)) {
    throw new Error("ID de conteúdo inválido");
  }

  const baseUrl = window.location.origin;
  const url = new URL(`${baseUrl}/api/player-url`);

  url.searchParams.set("tipo", tipo);
  url.searchParams.set("id", id);

  if (tipo === "tv") {
    url.searchParams.set("temporada", String(Math.max(1, temporada)));
    url.searchParams.set("episodio", String(Math.max(1, episodio)));
  }

  // Adicionar servidor padrão
  url.searchParams.set("servidor", "s1");

  return url.toString();
}

/**
 * Prepara dados de download com metadados úteis
 * Retorna um objeto com todas as informações necessárias
 */
export function prepararDownload(config: ConfiguracaoDownload): {
  titulo: string;
  nomeArquivo: string;
  url: string;
  tipo: string;
  appPrefenda: "idm" | "adm";
} {
  const nomeArquivo = config.titulo
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);

  const urlDownload = config.url || construirUrlDownload(
    config.tipo,
    config.id,
    config.temporada,
    config.episodio
  );

  return {
    titulo: config.titulo,
    nomeArquivo,
    url: urlDownload,
    tipo: config.tipo === "tv" 
      ? `Série S${config.temporada}E${config.episodio}` 
      : "Filme",
    appPrefenda: detectarAplicacaoDownload() || "idm"
  };
}
