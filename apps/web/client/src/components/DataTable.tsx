import { Button } from "@/components/ui/button";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Search } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface Column<T> {
  key: keyof T;
  label: string;
  width?: string;
  sortable?: boolean;
  render?: (value: T[keyof T], row: T) => ReactNode;
  hidden?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  searchable?: boolean;
  searchFields?: (keyof T)[];
  emptyMessage?: string;
  rowActions?: (row: T) => ReactNode;
  topActions?: ReactNode;
}

export function DataTable<T extends { id?: number | string }>({
  columns,
  data,
  loading = false,
  searchable = true,
  searchFields = [],
  emptyMessage = "Nenhum registro encontrado",
  rowActions,
  topActions,
}: DataTableProps<T>) {
  const [sortConfig, setSortConfig] = useState<{ key: keyof T; direction: "asc" | "desc" } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRow, setExpandedRow] = useState<number | string | null | undefined>(null);

  const visibleColumns = useMemo(() => columns.filter((col) => !col.hidden), [columns]);
  const primaryColumn = visibleColumns[0];

  const filteredData = useMemo(() => {
    if (!searchTerm || searchFields.length === 0) return data;

    return data.filter((row) =>
      searchFields.some((field) => {
        const value = row[field];
        return String(value ?? "").toLowerCase().includes(searchTerm.toLowerCase());
      })
    );
  }, [data, searchFields, searchTerm]);

  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue === bValue) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      return (aValue < bValue ? -1 : 1) * (sortConfig.direction === "asc" ? 1 : -1);
    });
  }, [filteredData, sortConfig]);

  const handleSort = (key: keyof T) => {
    setSortConfig((current) => {
      if (current?.key === key) {
        return { key, direction: current.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {searchable && searchFields.length > 0 ? (
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar..." className="pl-9" />
          </div>
        ) : (
          <div />
        )}
        {topActions}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : sortedData.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="Sem resultados"
          description={emptyMessage}
        />
      ) : (
        <>
          <div className="nexo-data-table-wrap hidden md:block">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  {visibleColumns.map((column) => (
                    <TableHead key={String(column.key)} className={column.width || ""}>
                      {column.sortable ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left hover:bg-[var(--surface-elevated)]/55"
                          onClick={() => handleSort(column.key)}
                        >
                          {column.label}
                          {sortConfig?.key === column.key ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                          ) : null}
                        </button>
                      ) : (
                        column.label
                      )}
                    </TableHead>
                  ))}
                  {rowActions ? <TableHead className="w-[132px] text-right">Ações</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((row, rowIndex) => (
                  <TableRow key={row.id || rowIndex}>
                    {visibleColumns.map((column) => (
                      <TableCell key={String(column.key)} className={`min-w-0 ${column.width || ""}`.trim()}>
                        <span className="block min-w-0 max-w-full truncate">
                          {column.render ? column.render(row[column.key], row) : String(row[column.key] ?? "—")}
                        </span>
                      </TableCell>
                    ))}
                    {rowActions ? <TableCell className="min-w-[120px] text-right">{rowActions(row)}</TableCell> : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {sortedData.map((row, rowIndex) => (
              <div key={row.id || rowIndex} className="nexo-surface-operational overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => setExpandedRow(expandedRow === row.id ? null : (row.id ?? null))}
                  className="flex w-full items-center justify-between px-4 py-3"
                >
                  <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                    {primaryColumn?.render
                      ? primaryColumn.render(row[primaryColumn.key], row)
                      : String(row[primaryColumn?.key as keyof T] ?? "—")}
                  </span>
                  <ChevronRight className={`h-4 w-4 transition-transform ${expandedRow === row.id ? "rotate-90" : ""}`} />
                </button>
                {expandedRow === row.id ? (
                  <div className="space-y-2 border-t border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 dark:border-white/10 dark:bg-white/[0.02]">
                    {visibleColumns.slice(1).map((column) => (
                      <div key={String(column.key)} className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{column.label}</span>
                        <span className="text-sm text-right text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                          {column.render ? column.render(row[column.key], row) : String(row[column.key] ?? "—")}
                        </span>
                      </div>
                    ))}
                    {rowActions ? <div className="pt-1">{rowActions(row)}</div> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
