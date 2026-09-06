import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Search,
  X,
  Users,
  Calendar,
  Briefcase,
  DollarSign,
  Loader,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";

interface SearchResult {
  id: string | number;
  type: "customer" | "appointment" | "serviceOrder" | "charge";
  title: string;
  subtitle?: string;
  route: string;
}

function getResultIcon(type: SearchResult["type"]) {
  switch (type) {
    case "customer":
      return <Users className="h-4 w-4" />;
    case "appointment":
      return <Calendar className="h-4 w-4" />;
    case "serviceOrder":
      return <Briefcase className="h-4 w-4" />;
    case "charge":
      return <DollarSign className="h-4 w-4" />;
    default:
      return <Search className="h-4 w-4" />;
  }
}

export function GlobalSearch() {
  const { isAuthenticated, isInitializing } = useAuth();
  const canQuery = isAuthenticated && !isInitializing;

  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const globalSearchQuery = trpc.globalSearch.search.useQuery(
    {
      query: debouncedQuery,
    },
    {
      enabled: canQuery && debouncedQuery.trim().length >= 2,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  useEffect(() => {
    if (!canQuery) {
      setDebouncedQuery("");
      return;
    }

    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setDebouncedQuery("");
      return;
    }

    const timeout = window.setTimeout(() => {
      setDebouncedQuery(trimmed);
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [canQuery, query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const results = Array.isArray(globalSearchQuery.data)
    ? globalSearchQuery.data
    : [];

  const isSearching =
    canQuery &&
    query.trim().length >= 2 &&
    (globalSearchQuery.isLoading || globalSearchQuery.isFetching);

  const handleSelectResult = (result: SearchResult) => {
    navigate(result.route);
    setQuery("");
    setDebouncedQuery("");
    setIsOpen(false);
  };

  return (
    <div ref={searchRef} className="relative w-full">
      <div className="nexo-search-input relative h-9">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-[var(--text-muted)]" />

        <input
          type="text"
          placeholder={
            canQuery
              ? "Buscar clientes, agendamentos..."
              : "Entre para pesquisar"
          }
          value={query}
          disabled={!canQuery}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="h-full w-full bg-transparent py-2 pl-9 pr-9 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />

        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setDebouncedQuery("");
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 transform text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {isOpen && canQuery && (
        <div className="nexo-floating-panel absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-hidden rounded-[var(--radius-surface)] p-1">
          {isSearching ? (
            <div className="flex items-center justify-center gap-2 p-4 text-[var(--text-muted)]">
              <Loader className="h-4 w-4 animate-spin" />
              <span className="text-sm">Buscando...</span>
            </div>
          ) : results.length > 0 ? (
            <div className="max-h-96 overflow-y-auto" data-scrollbar="nexo">
              {results.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  type="button"
                  onClick={() => handleSelectResult(result)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--accent-soft)]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-muted)]">
                    {getResultIcon(result.type)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {result.title}
                    </p>

                    {result.subtitle && (
                      <p className="truncate text-xs text-[var(--text-muted)]">
                        {result.subtitle}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : query.trim().length >= 2 ? (
            <div className="p-4 text-center text-sm text-[var(--text-muted)]">
              Nenhum resultado para essa busca.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
