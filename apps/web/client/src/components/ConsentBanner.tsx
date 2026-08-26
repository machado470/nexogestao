import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { X } from "lucide-react";


import { saveConsent, type ConsentPreferences } from "./ConsentBanner.logic";
import { persistLocalConsent, readStoredConsent } from "./ConsentBanner.storage";

export function ConsentBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>({
    marketing: false,
    analytics: false,
    cookies: true,
  });

  useEffect(() => {
    const stored = readStoredConsent();
    if (stored?.preferences) {
      setPreferences(stored.preferences);
    }
    setIsVisible(!stored);
  }, []);

  const closeBanner = () => {
    setIsVisible(false);
    setIsCustomizing(false);
  };

  const recordConsents = async (prefs: ConsentPreferences) => {
    setIsSubmitting(true);

    try {
      const ok = await saveConsent(prefs);
      if (ok) {
        persistLocalConsent(prefs);
      }
      return ok;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptAll = async () => {
    const ok = await recordConsents({
      marketing: true,
      analytics: true,
      cookies: true,
    });
    if (ok) closeBanner();
  };

  const handleCustomize = async () => {
    if (!isCustomizing) {
      setIsCustomizing(true);
      return;
    }

    const ok = await recordConsents(preferences);
    if (ok) closeBanner();
  };

  const handleRejectOptional = async () => {
    const ok = await recordConsents({
      marketing: false,
      analytics: false,
      cookies: true,
    });
    if (ok) closeBanner();
  };

  if (!isVisible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 px-3 sm:bottom-4 sm:px-5">
      <div className="pointer-events-auto mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.14)] backdrop-blur-sm sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Privacidade e cookies
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">
              Usamos cookies essenciais para funcionamento da plataforma. Você
              pode aceitar categorias opcionais ou personalizar. Leia a nossa{" "}
              <a
                href="/privacidade"
                className="font-medium text-orange-600 hover:text-orange-700"
              >
                Política de Privacidade
              </a>
              .
            </p>
          </div>

          <button
            type="button"
            onClick={handleRejectOptional}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar banner de cookies"
          >
            <X className="size-4" />
          </button>
        </div>

        {isCustomizing ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <label className="rounded-xl border border-slate-200 bg-[var(--surface-base)] p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked
                disabled
                className="mr-2 align-middle"
              />
              Essenciais (obrigatório)
            </label>
            <label className="rounded-xl border border-slate-200 bg-[var(--surface-base)] p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={preferences.analytics}
                onChange={e =>
                  setPreferences({
                    ...preferences,
                    analytics: e.target.checked,
                  })
                }
                className="mr-2 align-middle"
              />
              Analytics e performance
            </label>
            <label className="rounded-xl border border-slate-200 bg-[var(--surface-base)] p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={preferences.marketing}
                onChange={e =>
                  setPreferences({
                    ...preferences,
                    marketing: e.target.checked,
                  })
                }
                className="mr-2 align-middle"
              />
              Marketing
            </label>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleRejectOptional}
            disabled={isSubmitting}
          >
            Somente essenciais
          </Button>
          <Button
            variant="outline"
            onClick={handleCustomize}
            disabled={isSubmitting}
          >
            {isCustomizing ? "Salvar preferências" : "Personalizar"}
          </Button>
          <Button
            onClick={handleAcceptAll}
            disabled={isSubmitting}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {isSubmitting ? "Salvando..." : "Aceitar tudo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
