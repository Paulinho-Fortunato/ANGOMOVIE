import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();

const PORTA = Number(process.env.PORT ?? 8787);
const CHAVE_TMDB = process.env.TMDB_API_KEY;
const SEGREDO_ASSINATURA = process.env.REQUEST_SIGNING_SECRET ?? "trocar-em-producao";
const ORIGEM_FRONTEND = process.env.FRONTEND_ORIGIN ?? "*";

const ESTADO_SERVIDORES = {
  s1: { estado: "online", ultimaVerificacao: new Date().toISOString() },
  s2: { estado: "online", ultimaVerificacao: new Date().toISOString() },
  s3: { estado: "degradado", ultimaVerificacao: new Date().toISOString() }
};

const FALHAS_PLAYER = [];
const METRICAS_WEB_VITALS = [];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "https://image.tmdb.org", "data:", "blob:"],
        connectSrc: ["'self'", "https://api.themoviedb.org"],
        frameSrc: ["https://myembed.biz", "https://www.myembed.biz"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    referrerPolicy: { policy: "no-referrer" },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    xFrameOptions: { action: "deny" }
  })
);

app.use(
  cors({
    origin: ORIGEM_FRONTEND === "*" ? true : ORIGEM_FRONTEND,
    methods: ["GET", "POST"],
    credentials: false
  })
);

app.use(express.json({ limit: "200kb" }));

app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

function assinarPayload(payload) {
  return crypto.createHmac("sha256", SEGREDO_ASSINATURA).update(payload).digest("hex");
}

function validarAssinatura(req, res, next) {
  const assinatura = req.headers["x-angomovie-signature"];
  const timestamp = req.headers["x-angomovie-timestamp"];
  const dispositivo = req.headers["x-angomovie-device"];

  if (!assinatura || !timestamp || !dispositivo) {
    return res.status(401).json({ erro: "Cabeçalhos de assinatura em falta" });
  }

  const diferenca = Math.abs(Date.now() - Number(timestamp));
  if (Number.isNaN(diferenca) || diferenca > 120_000) {
    return res.status(401).json({ erro: "Timestamp inválido" });
  }

  const payload = `${timestamp}.${dispositivo}.${req.method}.${req.originalUrl}`;
  const esperado = assinarPayload(payload);
  if (esperado !== assinatura) {
    return res.status(401).json({ erro: "Assinatura inválida" });
  }

  return next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get("/api/tmdb/*", validarAssinatura, async (req, res) => {
  if (!CHAVE_TMDB) {
    return res.status(500).json({ erro: "TMDB_API_KEY não configurada no servidor" });
  }

  const caminho = req.params[0] ?? "";
  const url = new URL(`https://api.themoviedb.org/3/${caminho}`);

  Object.entries(req.query).forEach(([chave, valor]) => {
    if (valor !== undefined) url.searchParams.set(chave, String(valor));
  });
  url.searchParams.set("api_key", CHAVE_TMDB);

  try {
    const resposta = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    const dados = await resposta.text();
    return res.status(resposta.status).type("application/json").send(dados);
  } catch {
    return res.status(502).json({ erro: "Falha ao contactar TMDB" });
  }
});

app.get("/api/player-url", validarAssinatura, (req, res) => {
  const tipo = req.query.tipo === "tv" ? "tv" : "movie";
  const id = String(req.query.id ?? "").trim();
  const temporada = Number(req.query.temporada ?? 1);
  const episodio = Number(req.query.episodio ?? 1);
  const servidor = String(req.query.servidor ?? "s1");
  const audio = String(req.query.audio ?? "pt");
  const qualidade = String(req.query.qualidade ?? "auto");

  if (!/^tt\d{7,8}$|^\d{1,7}$/.test(id)) {
    return res.status(400).json({ erro: "ID inválido" });
  }

  const rota =
    tipo === "movie"
      ? `/filme/${id}`
      : `/serie/${id}/${Math.max(1, temporada)}/${Math.max(1, episodio)}`;

  const alvo = new URL(`https://myembed.biz${rota}`);
  alvo.searchParams.set("servidor", servidor);
  alvo.searchParams.set("audio", audio);
  if (qualidade !== "auto") alvo.searchParams.set("quality", qualidade);

  res.json({
    url: alvo.toString(),
    assinatura: assinarPayload(alvo.toString()),
    servidores: ESTADO_SERVIDORES
  });
});

app.post("/api/observability/web-vitals", (req, res) => {
  METRICAS_WEB_VITALS.unshift({ ...req.body, recebidoEm: new Date().toISOString() });
  METRICAS_WEB_VITALS.splice(200);
  res.status(204).end();
});

app.post("/api/observability/player-falha", (req, res) => {
  FALHAS_PLAYER.unshift({ ...req.body, recebidoEm: new Date().toISOString() });
  FALHAS_PLAYER.splice(200);
  res.status(204).end();
});

app.get("/api/monitor/dashboard", (_req, res) => {
  res.json({
    servidores: ESTADO_SERVIDORES,
    ultimasFalhasPlayer: FALHAS_PLAYER.slice(0, 20),
    webVitals: METRICAS_WEB_VITALS.slice(0, 50)
  });
});

app.get("/sitemap-dynamic.xml", async (_req, res) => {
  if (!CHAVE_TMDB) {
    return res.status(500).send("TMDB_API_KEY não configurada");
  }

  try {
    const [filmes, series] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${CHAVE_TMDB}&language=pt-BR&page=1`).then((r) => r.json()),
      fetch(`https://api.themoviedb.org/3/tv/popular?api_key=${CHAVE_TMDB}&language=pt-BR&page=1`).then((r) => r.json())
    ]);

    const itensFilmes = (filmes?.results || []).slice(0, 50).map((item) => ({
      url: `${ORIGEM_FRONTEND === "*" ? "https://angomovie.qzz.io" : ORIGEM_FRONTEND}/?modal=detalhes&tipo=movie&id=${item.id}`,
      data: item.release_date || new Date().toISOString().split("T")[0]
    }));

    const itensSeries = (series?.results || []).slice(0, 50).map((item) => ({
      url: `${ORIGEM_FRONTEND === "*" ? "https://angomovie.qzz.io" : ORIGEM_FRONTEND}/?modal=detalhes&tipo=tv&id=${item.id}`,
      data: item.first_air_date || new Date().toISOString().split("T")[0]
    }));

    const todosItens = [...itensFilmes, ...itensSeries];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${todosItens
  .map(
    (item) => `  <url>
    <loc>${item.url}</loc>
    <lastmod>${item.data}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

    res.header("Content-Type", "application/xml");
    res.send(xml);
  } catch {
    res.status(500).send("Erro ao gerar sitemap dinâmico");
  }
});

app.listen(PORTA, () => {
  // eslint-disable-next-line no-console
  console.log(`[AngoMovie API] online na porta ${PORTA}`);
});
