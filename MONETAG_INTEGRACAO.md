# Guia de Integração Monetag Direct Link - AngoMovie

## 📋 Visão Geral

Este guia mostra como adicionar anúncios **Direct Link da Monetag** ao seu projeto AngoMovie de forma **não intrusiva**, maximizando receita sem prejudicar a experiência do usuário.

## 🎯 Estratégias Implementadas

### 1. **Interstitial Suave (Recomendado)**
- Modal elegante que aparece antes do conteúdo
- Apenas em momentos naturais (início de reprodução, troca de episódio)
- Respeita intervalo mínimo entre exibições (padrão: 5 minutos)
- Botão claro de "Continuar para o conteúdo"

### 2. **Direct Link em Nova Aba**
- Abre anúncio em background quando usuário clica em ações principais
- Não interrompe o fluxo principal
- Ideal para botões de "Baixar" ou "Assistir em HD"

### 3. **Banner Discreto (Opcional)**
- Pode ser colocado no rodapé ou lateral
- Design integrado ao tema do site
- Clique opcional do usuário

## 🚀 Como Configurar

### Passo 1: Obtenha seu Direct Link da Monetag

1. Acesse sua conta Monetag
2. Vá para **Direct Link** na dashboard
3. Crie um novo Direct Link ou use existente
4. Copie a URL gerada

### Passo 2: Configure no App.tsx

No arquivo `/workspace/src/App.tsx`, localize a configuração do Monetag (linha ~527):

```typescript
const monetagConfig: MonetagConfig = useMemo(() => ({
  directLinkUrl: 'https://SEU_DIRECT_LINK_AQUI.com', // ⚠️ SUBSTITUA AQUI
  minIntervalBetweenAds: 300000, // 5 minutos entre anúncios
  enableInterstitial: true,
  enableDownloadFallback: true
}), []);
```

**Substitua** `'https://SEU_DIRECT_LINK_AQUI.com'` pelo seu link real da Monetag.

### Passo 3: Ajuste o Intervalo entre Anúncios

O `minIntervalBetweenAds` controla a frequência dos anúncios:

- `300000` (5 minutos) - Recomendado para bom equilíbrio UX/receita
- `600000` (10 minutos) - Mais conservador, melhor UX
- `180000` (3 minutos) - Mais agressivo, mais receita mas pode irritar usuários

### Passo 4: Personalize as Estratégias

```typescript
const monetagConfig: MonetagConfig = {
  directLinkUrl: 'https://seu-link.com',
  
  // Controle de frequência
  minIntervalBetweenAds: 300000,
  
  // Habilita/desabilita interstitial antes do player
  enableInterstitial: true,
  
  // Habilita anúncio ao baixar conteúdo
  enableDownloadFallback: true
};
```

## 📍 Pontos de Integração no Código

### No Player de Vídeo (Já Implementado)

O código já está configurado para mostrar interstitial antes de iniciar reprodução:

```typescript
// Linha ~938 em App.tsx
const reproduzir = useCallback(async (item, tipo, temporada, episodio) => {
  // Usa hook do Monetag para envolver ação de reproduzir
  monetagHook.wrapAction(() => {
    // Lógica de reprodução existente
  });
});
```

### Para Adicionar em Outras Ações

#### Exemplo: Botão de Download

```typescript
const handleDownload = () => {
  monetagHook.wrapDownload(urlDownload, 'filme.mp4');
};
```

#### Exemplo: Ação Personalizada

```typescript
const handleClickPremium = () => {
  if (canShowAd(monetagConfig)) {
    showInterstitialAd(monetagConfig, () => {
      // Sua ação aqui
      navegarParaPremium();
    });
  } else {
    navegarParaPremium();
  }
};
```

## 🎨 Personalização Visual

### Customizar o Modal Interstitial

Edite a função `showInterstitialAd` em `/workspace/src/utils/monetag-ads.ts`:

```typescript
// Linhas ~140-180
modal.innerHTML = `
  <h3 style="color: #fff; ...">
    SEU_TITULO_AQUI
  </h3>
  <p style="color: rgba(255, 255, 255, 0.7); ...">
    SUA_MENSAGEM_AQUI
  </p>
`;
```

### Cores e Estilo

O modal usa as cores padrão do AngoMovie:
- Fundo: Gradiente escuro (`#1a1a2e` → `#16213e`)
- Botão: Vermelho Netflix (`#e50914`)
- Texto: Branco com opacidade

Para alterar, modifique os valores CSS inline na função.

## 📊 Melhores Práticas

### ✅ Faça
- Teste diferentes intervalos entre anúncios
- Use interstitial apenas em momentos naturais
- Sempre permita que usuário continue facilmente
- Monitore taxa de cliques vs. retenção de usuários

### ❌ Não Faça
- Não mostre anúncios a cada ação do usuário
- Não esconda o botão de fechar/continuar
- Não use pop-ups invasivos que bloqueiam completamente
- Não ignore o feedback dos usuários

## 🔧 Troubleshooting

### Anúncios não aparecem?

1. Verifique se `directLinkUrl` está configurado corretamente
2. Abra o console do navegador para ver logs `[Monetag]`
3. Verifique se o intervalo mínimo não está muito longo
4. Limpe o localStorage: `localStorage.removeItem('angomovie_ad_state')`

### Muitos anúncios aparecendo?

Aumente o `minIntervalBetweenAds`:

```typescript
minIntervalBetweenAds: 600000, // 10 minutos
```

### Anúncios bloqueiam o conteúdo?

Verifique se o modal está sendo removido corretamente. O código já trata isso, mas extensões de browser podem interferir.

## 📈 Métricas para Monitorar

Acompanhe no localStorage:

```javascript
const state = JSON.parse(localStorage.getItem('angomovie_ad_state'));
console.log('Impressões:', state.impressions);
console.log('Cliques:', state.clicks);
console.log('CTR:', (state.clicks / state.impressions * 100).toFixed(2) + '%');
```

## 🌐 URLs Úteis da Monetag

- Dashboard: https://monetag.com/dashboard
- Direct Links: https://monetag.com/direct-link
- Documentação: https://monetag.com/docs
- Suporte: https://monetag.com/support

## 💡 Dicas Avançadas

### Segmentação por Tipo de Usuário

```typescript
// Mostrar menos anúncios para usuários frequentes
const usuarioFrequente = historico.length > 20;
const configPersonalizada = {
  ...monetagConfig,
  minIntervalBetweenAds: usuarioFrequente ? 600000 : 300000
};
```

### Desativar em Conteúdo Premium

```typescript
if (conteudoEhPremium) {
  // Não mostrar anúncios
  reproduzirConteudo();
} else {
  monetagHook.wrapAction(reproduzirConteudo);
}
```

### A/B Testing

Teste diferentes intervalos para encontrar o ideal:

```typescript
const testeA = Math.random() > 0.5;
const intervalo = testeA ? 300000 : 600000;
```

## 📝 Checklist de Implementação

- [ ] Substituir URL do Direct Link
- [ ] Testar interstitial no player
- [ ] Ajustar intervalo entre anúncios
- [ ] Verificar logs no console
- [ ] Testar em mobile e desktop
- [ ] Monitorar métricas de CTR
- [ ] Coletar feedback de usuários
- [ ] Otimizar baseado em dados

## 🆘 Suporte

Se tiver dúvidas ou problemas:

1. Verifique este guia e o código em `/workspace/src/utils/monetag-ads.ts`
2. Consulte a documentação oficial da Monetag
3. Revise os logs no console do navegador
4. Teste em modo anônimo para evitar cache

---

**Nota Importante**: Esta implementação prioriza a experiência do usuário. Anúncios intrusivos podem aumentar receita a curto prazo mas reduzem retenção e fidelidade dos usuários a longo prazo.
