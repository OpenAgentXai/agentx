"use client";

import { useState, useRef, useEffect } from "react";
import { useI18n, LOCALES, type Locale } from "@/lib/i18n";
import { Globe, Check } from "lucide-react";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <Globe className="h-4 w-4" />
        {!compact && (
          <>
            <span>{LOCALES[locale].flag}</span>
            <span>{LOCALES[locale].label}</span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-50 w-56 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl py-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-xs font-semibold uppercase text-zinc-400">
              {t("common.language")}
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {(Object.entries(LOCALES) as [Locale, (typeof LOCALES)[Locale]][]).map(
              ([code, { label, flag }]) => (
                <button
                  key={code}
                  onClick={() => {
                    setLocale(code);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                    locale === code
                      ? "bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="text-base">{flag}</span>
                  <span className="flex-1 text-left">{label}</span>
                  {locale === code && (
                    <Check className="h-4 w-4 text-primary-500" />
                  )}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
