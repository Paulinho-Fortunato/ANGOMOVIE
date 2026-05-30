/**
 * @fileoverview Gestor de Downloads via Navegador
 * Implementa download direto através do navegador, sem dependência de aplicações externas
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
 * Inicia download direto no navegador
 * Método universal que funciona em qualquer dispositivo
 */
export function iniciarDownloadDireto(url: string, nomeArquivo?: string): void {
  const urlValidada = validarUrlDownload(url);
  
  const nomeCompleto = nomeArquivo
    ? `${nomeArquivo}.mkv`
    : `angomovie-${Date.now()}.mkv`;

  try {
    // Criar elemento de download
    const elemento = document.createElement("a");
    elemento.href = urlValidada;
    elemento.download = nomeCompleto;
    elemento.target = "_blank";
    elemento.rel = "noopener noreferrer";
    elemento.style.display = "none";
    document.body.appendChild(elemento);
    elemento.click();
    document.body.removeChild(elemento);
  } catch (erro) {
    console.error("Erro ao fazer download no navegador:", erro);
    // Fallback: abrir em nova aba
    window.open(urlValidada, "_blank", "noopener,noreferrer");
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
  };
}
