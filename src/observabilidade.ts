import * as Sentry from "@sentry/react";
import { onCLS, onINP, onLCP } from "web-vitals";

function enviarWebVital(metrica: { name: string; value: number; id: string }): void {
  fetch("/api/observability/web-vitals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nome: metrica.name,
      valor: metrica.value,
      id: metrica.id,
      url: window.location.pathname,
      userAgent: navigator.userAgent
    })
  }).catch(() => undefined);
}

export function iniciarObservabilidade(): void {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const dsn = env?.VITE_SENTRY_DSN;

  if (dsn) {
    Sentry.init({
      dsn,
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: 0.1
    });
  }

  onLCP(enviarWebVital);
  onINP(enviarWebVital);
  onCLS(enviarWebVital);
}

export function registarServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
