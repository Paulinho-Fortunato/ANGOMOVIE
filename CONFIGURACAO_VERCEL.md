# Guia de Configuração da API TMDB na Vercel

## Problema
Os erros 404 nas requisições `/api/tmdb/*` ocorrem porque a variável de ambiente `TMDB_API_KEY` não está configurada no servidor da Vercel.

## Solução

### 1. Criar uma chave de API no TMDB
1. Acesse https://www.themoviedb.org/settings/api
2. Faça login ou crie uma conta
3. Copie sua **API Key (v3 auth)**

### 2. Configurar na Vercel
1. Acesse o painel do seu projeto na Vercel: https://vercel.com/dashboard
2. Selecione seu projeto
3. Vá em **Settings** → **Environment Variables**
4. Clique em **Add Environment Variable**
5. Adicione:
   - **Name**: `TMDB_API_KEY`
   - **Value**: (sua chave da API do TMDB)
   - **Environments**: Marque Production, Preview e Development
6. Clique em **Save**

### 3. Redeploy
Após adicionar a variável de ambiente, faça um novo deploy:
```bash
git add .
git commit -m "Adiciona API route TMDB para Vercel"
git push
```

A Vercel irá automaticamente fazer o deploy das mudanças e a nova variável de ambiente estará disponível.

## Estrutura de Arquivos

O projeto agora inclui:
- `/api/tmdb/[...path].ts` - API Route que proxy requests para a API do TMDB
- A variável `TMDB_API_KEY` deve estar configurada no painel da Vercel

## Como Funciona

1. O frontend faz requests para `/api/tmdb/tv/popular?language=pt-BR&...`
2. A API Route `/api/tmdb/[...path].ts` intercepta a requisição
3. Ela adiciona a `TMDB_API_KEY` secretamente e encaminha para `https://api.themoviedb.org/3/`
4. A resposta é retornada ao frontend

## Segurança

- A chave da API fica segura no servidor, nunca exposta no frontend
- A API Route valida o método HTTP (apenas GET permitido)
- Headers CORS configurados apropriadamente
