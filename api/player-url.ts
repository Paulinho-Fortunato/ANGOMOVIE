import type { VercelRequest, VercelResponse } from '@vercel/node';

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

  const { tipo, id, servidor, titulo, ano } = req.query;

  if (!tipo || !id || !servidor) {
    return res.status(400).json({ error: 'Parâmetros faltando: tipo, id, servidor' });
  }

  try {
    // Nome do arquivo para o download
    let nomeArquivo = titulo ? `${titulo} (${ano || ''})` : `Conteudo_${id}`;
    nomeArquivo = encodeURIComponent(nomeArquivo.replace(/[^\w\sà-úÀ-Ú0-9]/g, '_').trim());

    // URL de vídeo (em produção, substitua pela lógica real de obtenção de link)
    // Aqui usamos um placeholder pois não temos acesso a um backend de streaming real
    const videoUrl = `https://exemplo.com/videos/${servidor}/${tipo}_${id}.mp4`;

    // Deep Links para gerenciadores de download
    // 1DM: https://1dm.app/?url=URL&name=NOME
    const link1DM = `https://1dm.app/?url=${encodeURIComponent(videoUrl)}&name=${nomeArquivo}.mp4`;
    
    // Intent URI para ADM (Android Download Manager)
    const linkADM = `intent://${videoUrl}#Intent;scheme=https;package=com.dv.adm;S.name=${nomeArquivo}.mp4;end;`;

    return res.status(200).json({
      success: true,
      data: {
        url: videoUrl,
        deepLinks: {
          oneDm: link1DM,
          adm: linkADM
        }
      }
    });

  } catch (error) {
    console.error('Erro ao gerar link:', error);
    return res.status(500).json({ error: 'Erro interno ao gerar link de download' });
  }
}
