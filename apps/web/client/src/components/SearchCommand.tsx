import { Button } from "@/components/ui/button";
import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';


interface SearchResult {
  id: string;
  title: string;
  description?: string;
  category: string;
  action: () => void;
}

interface SearchCommandProps {
  results: SearchResult[];
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

export function SearchCommand({ results, onSearch, isLoading = false }: SearchCommandProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Open with Cmd+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = (result: SearchResult) => {
    result.action();
    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    }
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-between border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
        onClick={() => setIsOpen(true)}
      >
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4" />
          <span className="text-xs">Buscar...</span>
        </div>
        <kbd className="rounded bg-[var(--surface-operational-light,var(--surface-base))] px-2 py-1 text-xs text-[var(--text-secondary)]">⌘K</kbd>
      </Button>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-[var(--app-overlay-bg)] backdrop-blur-[2px]"
        onClick={() => setIsOpen(false)}
      />

      {/* Search Dialog */}
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg">
        <div className="nexo-floating-panel rounded-[var(--radius-surface)] border border-[var(--app-overlay-border)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-[var(--app-overlay-shadow)]">
          {/* Search Input */}
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--app-overlay-header)] p-4">
            <Search className="h-5 w-5 text-[var(--text-muted)]" />
            <Input
              autoFocus
              placeholder="Buscar clientes, agendamentos, ordens..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                onSearch(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              className="border-0 bg-transparent text-lg shadow-none focus-visible:ring-0"
            />
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
            >
              <X className="h-5 w-5 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-[var(--text-muted)]">Buscando...</div>
            ) : results.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-muted)]">
                {query ? 'Nenhum resultado encontrado' : 'Digite para buscar'}
              </div>
            ) : (
              <div className="p-2">
                {/* Group by category */}
                {Array.from(
                  new Set(results.map((r) => r.category))
                ).map((category) => (
                  <div key={category}>
                    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {category}
                    </div>
                    {results
                      .filter((r) => r.category === category)
                      .map((result, idx) => {
                        const globalIdx = results.indexOf(result);
                        return (
                          <button
                            key={result.id}
                            onClick={() => handleSelect(result)}
                            className={`w-full text-left px-3 py-2 rounded transition-colors ${
                              selectedIndex === globalIdx
                                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-operational-light,var(--surface-base))] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            <div className="font-medium text-sm">{result.title}</div>
                            {result.description && (
                              <div className="text-xs text-[var(--text-muted)]">{result.description}</div>
                            )}
                          </button>
                        );
                      })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--app-overlay-footer)] p-3 text-xs text-[var(--text-muted)]">
            <div className="flex gap-2">
              <kbd className="rounded bg-[var(--surface-operational-light,var(--surface-base))] px-2 py-1 text-[var(--text-secondary)]">↑↓</kbd>
              <span>Navegar</span>
              <kbd className="rounded bg-[var(--surface-operational-light,var(--surface-base))] px-2 py-1 text-[var(--text-secondary)]">Enter</kbd>
              <span>Selecionar</span>
              <kbd className="rounded bg-[var(--surface-operational-light,var(--surface-base))] px-2 py-1 text-[var(--text-secondary)]">Esc</kbd>
              <span>Fechar</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
