"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { localizeItem, resolveLocale, translateUI, type Locale, type Translations } from "@/lib/i18n";
import type { FeedItem } from "@/lib/types";
const LanguageContext = createContext<{
  locale: Locale; setLocale: (locale: Locale) => void; t: (text: string) => string;
  localize: (item: FeedItem) => FeedItem;
} | null>(null);
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("en");
  const [translations, setTranslations] = useState<Translations>({});
  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem("signal-language"); } catch { /* private mode */ }
    // Hydrate a browser-only preference after the SSR-compatible initial render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updateLocale(resolveLocale(saved, navigator.language));
  }, []);
  useEffect(() => { document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"; }, [locale]);
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next);
    try { localStorage.setItem("signal-language", next); } catch { /* private mode */ }
  }, []);
  useEffect(() => {
    if (locale !== "zh") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      let delay = 60_000;
      try {
        const response = await fetch("/api/feed/translations", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Translation unavailable");
        const data = await response.json();
        if (!cancelled) setTranslations(data.translations ?? {});
        if (data.pending) delay = 5_000;
      } catch { /* original text remains available */ }
      if (!cancelled) timer = setTimeout(poll, delay);
    };
    void poll();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [locale]);
  const t = useCallback((text: string) => translateUI(text, locale), [locale]);
  const localize = useCallback((item: FeedItem) => localizeItem(item, locale, translations), [locale, translations]);
  const value = useMemo(() => ({ locale, setLocale, t, localize }), [locale, setLocale, t, localize]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("LanguageProvider missing");
  return context;
}
