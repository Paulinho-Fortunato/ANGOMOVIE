/**
 * Utilitários para integração com Monetag Direct Links
 * Estratégias não intrusivas para maximizar receita sem prejudicar UX
 */

export interface MonetagConfig {
  directLinkUrl: string;
  minIntervalBetweenAds?: number; // ms entre exibições
  enableInterstitial?: boolean;
  enableDownloadFallback?: boolean;
}

interface AdState {
  lastShown: number;
  impressions: number;
  clicks: number;
}

const STORAGE_KEY = 'angomovie_ad_state';
const DEFAULT_CONFIG: MonetagConfig = {
  directLinkUrl: '',
  minIntervalBetweenAds: 300000, // 5 minutos
  enableInterstitial: true,
  enableDownloadFallback: true
};

/**
 * Estado global dos anúncios (persistido em localStorage)
 */
function getAdState(): AdState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as AdState;
    }
  } catch (e) {
    console.warn('[Monetag] Erro ao ler estado dos anúncios:', e);
  }
  return { lastShown: 0, impressions: 0, clicks: 0 };
}

function saveAdState(state: AdState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[Monetag] Erro ao salvar estado dos anúncios:', e);
  }
}

/**
 * Verifica se pode mostrar anúncio baseado no intervalo mínimo
 */
export function canShowAd(config: MonetagConfig): boolean {
  if (!config.directLinkUrl) return false;
  
  const state = getAdState();
  const now = Date.now();
  const elapsed = now - state.lastShown;
  
  return elapsed >= (config.minIntervalBetweenAds || DEFAULT_CONFIG.minIntervalBetweenAds);
}

/**
 * Registra que um anúncio foi mostrado
 */
export function recordAdImpression(): void {
  const state = getAdState();
  state.lastShown = Date.now();
  state.impressions += 1;
  saveAdState(state);
  console.log('[Monetag] Impressão registrada. Total:', state.impressions);
}

/**
 * Registra clique no anúncio
 */
export function recordAdClick(): void {
  const state = getAdState();
  state.clicks += 1;
  saveAdState(state);
  console.log('[Monetag] Clique registrado. Total:', state.clicks);
}

/**
 * Abre direct link em nova aba (estratégia menos intrusiva)
 * Ideal para botões de "Baixar" ou "Assistir em HD"
 */
export function openDirectLinkNewTab(config: MonetagConfig, callback?: () => void): void {
  if (!canShowAd(config)) {
    callback?.();
    return;
  }

  recordAdImpression();
  
  // Abre em nova aba para não interromper experiência
  const newTab = window.open(config.directLinkUrl, '_blank', 'noopener,noreferrer');
  
  if (newTab) {
    recordAdClick();
    // Fecha automaticamente após 2 segundos se for popup
    setTimeout(() => {
      if (!newTab.closed && newTab.location.href === config.directLinkUrl) {
        newTab.close();
      }
    }, 2000);
  }
  
  // Sempre executa ação principal após tentar abrir anúncio
  setTimeout(() => callback?.(), 100);
}

/**
 * Estratégia de interstitial suave - mostra antes do conteúdo
 * Apenas em momentos naturais (troca de episódio, filme, etc.)
 */
export function showInterstitialAd(
  config: MonetagConfig,
  onContinue: () => void,
  onCancel?: () => void
): void {
  if (!config.enableInterstitial || !canShowAd(config)) {
    onContinue();
    return;
  }

  recordAdImpression();
  
  // Cria modal de interstitial não intrusivo
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s ease;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 32px;
    max-width: 400px;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: slideUp 0.3s ease;
  `;

  modal.innerHTML = `
    <h3 style="color: #fff; margin: 0 0 12px 0; font-size: 20px; font-weight: 600;">
      Preparando seu conteúdo...
    </h3>
    <p style="color: rgba(255, 255, 255, 0.7); margin: 0 0 24px 0; font-size: 14px; line-height: 1.5;">
      Enquanto isso, confira esta oferta especial para você!
    </p>
    <button 
      id="monetag-continue-btn"
      style="
        background: linear-gradient(135deg, #e50914 0%, #b20710 100%);
        color: white;
        border: none;
        padding: 12px 32px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s;
      "
    >
      Continuar para o conteúdo
    </button>
    <p style="color: rgba(255, 255, 255, 0.5); margin: 16px 0 0 0; font-size: 12px;">
      Isso ajuda a manter o serviço gratuito
    </p>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Adiciona estilos de animação
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    #monetag-continue-btn:hover {
      transform: scale(1.05);
    }
    #monetag-continue-btn:active {
      transform: scale(0.98);
    }
  `;
  document.head.appendChild(style);

  // Handler do botão continuar
  const continueBtn = document.getElementById('monetag-continue-btn');
  continueBtn?.addEventListener('click', () => {
    recordAdClick();
    
    // Abre direct link em background
    window.open(config.directLinkUrl, '_blank', 'noopener,noreferrer');
    
    // Remove overlay e continua
    setTimeout(() => {
      overlay.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => {
        overlay.remove();
        style.remove();
      }, 200);
      onContinue();
    }, 300);
  });

  // Permite fechar clicando fora
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      style.remove();
      onCancel ? onCancel() : onContinue();
    }
  });
}

/**
 * Hook React para gerenciar anúncios em componentes
 * Uso: const { showAdForAction } = useMonetagAds(config);
 */
export function createMonetagHook(config: MonetagConfig) {
  return {
    /**
     * Envolve uma ação com verificação de anúncio
     * Exemplo: handlePlay = showAdForAction(() => startVideo())
     */
    wrapAction: <T extends (...args: any[]) => any>(action: T): T => {
      return ((...args: any[]) => {
        if (canShowAd(config)) {
          showInterstitialAd(config, () => action(...args));
        } else {
          action(...args);
        }
      }) as T;
    },

    /**
     * Versão para links de download
     */
    wrapDownload: (url: string, filename?: string): void => {
      if (config.enableDownloadFallback && canShowAd(config)) {
        openDirectLinkNewTab(config, () => {
          const link = document.createElement('a');
          link.href = url;
          link.download = filename || '';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        });
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };
}

/**
 * Componente React para banner discreto (opcional)
 * Pode ser colocado no rodapé ou lateral
 */
export function createBannerElement(containerId: string, config: MonetagConfig): HTMLDivElement | null {
  const container = document.getElementById(containerId);
  if (!container || !config.directLinkUrl) return null;

  const banner = document.createElement('div');
  banner.style.cssText = `
    background: linear-gradient(90deg, rgba(229, 9, 20, 0.1) 0%, rgba(229, 9, 20, 0.05) 100%);
    border: 1px solid rgba(229, 9, 20, 0.2);
    border-radius: 8px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
    transition: all 0.3s ease;
  `;

  banner.innerHTML = `
    <span style="color: rgba(255, 255, 255, 0.8); font-size: 13px; font-weight: 500;">
      ✨ Conteúdo Premium Disponível
    </span>
    <button 
      style="
        background: #e50914;
        color: white;
        border: none;
        padding: 6px 16px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      "
    >
      Acessar
    </button>
  `;

  banner.addEventListener('click', () => {
    recordAdClick();
    window.open(config.directLinkUrl, '_blank', 'noopener,noreferrer');
  });

  banner.addEventListener('mouseenter', () => {
    banner.style.transform = 'translateY(-2px)';
    banner.style.boxShadow = '0 8px 20px rgba(229, 9, 20, 0.2)';
  });

  banner.addEventListener('mouseleave', () => {
    banner.style.transform = 'translateY(0)';
    banner.style.boxShadow = 'none';
  });

  container.appendChild(banner);
  return banner;
}
