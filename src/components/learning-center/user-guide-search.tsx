"use client";

import { useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";

interface UserGuideSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  hasResults: boolean;
}

export function UserGuideSearch({ query, onQueryChange, hasResults }: UserGuideSearchProps) {
  const t = useTranslations("learning");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function handleChange(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onQueryChange(value);
    }, 300);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="relative mb-4">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        type="text"
        defaultValue={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
      />
      {query && (
        <button
          onClick={() => {
            onQueryChange("");
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
