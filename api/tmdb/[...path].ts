import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  
  if (!TMDB_API_KEY) {
    return res.status(500).json({ erro: 'TMDB_API_KEY não configurada no servidor' });
  }

  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-angomovie-timestamp, x-angomovie-device, x-angomovie-signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  try {
    const path = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path || '';
    const url = new URL(`https://api.themoviedb.org/3/${path}`);

    // Adicionar parâmetros da query
    Object.entries(req.query).forEach(([key, value]) => {
      if (key !== 'path' && value !== undefined) {
        const values = Array.isArray(value) ? value : [value];
        values.forEach((v) => url.searchParams.append(key, String(v)));
      }
    });

    // Adicionar chave da API
    url.searchParams.set('api_key', TMDB_API_KEY);

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' }
    });

    const data = await response.text();
    res.setHeader('Content-Type', 'application/json');
    return res.status(response.status).send(data);
  } catch (error) {
    console.error('Erro ao contactar TMDB:', error);
    return res.status(502).json({ erro: 'Falha ao contactar TMDB' });
  }
}
