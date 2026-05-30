import type { VercelRequest, VercelResponse } from '@vercel/node';

const SERVIDOR_BASE = 'https://myembed.biz';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tipo, id, servidor, temporada, episodio, titulo, ano, qualidade = 'auto' } = req.query;

  if (!tipo || !id || !servidor) {
    return res.status(400).json({ error: 'Parâmetros faltando: tipo, id, servidor' });
  }

  try {
    // Construir URL do embed
    let embedUrl: string;
    if (tipo === 'tv') {
      const temp = temporada ? String(temporada) : '1';
      const eps = episodio ? String(episodio) : '1';
      embedUrl = `${SERVIDOR_BASE}/embed/serie/${id}/${temp}/${eps}?server=${servidor}&quality=${qualidade}`;
    } else {
      embedUrl = `${SERVIDOR_BASE}/embed/movie/${id}?server=${servidor}&quality=${qualidade}`;
    }

    // Nome do arquivo para o download
    let nomeArquivo = titulo ? `${titulo} (${ano || ''})` : `Conteudo_${id}`;
    nomeArquivo = encodeURIComponent(nomeArquivo.replace(/[^a-zA-Z0-9_\s-]/g, '_').trim());

    // Retornar apenas URL direta para download via navegador
    return res.status(200).json({
      success: true,
      data: {
        url: embedUrl,
        embedUrl
      }
    });

  } catch (error) {
    console.error('Erro ao gerar link:', error);
    return res.status(500).json({ error: 'Erro interno ao gerar link de download' });
  }
}
