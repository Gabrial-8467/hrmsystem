"use client";

import { useState, useMemo } from "react";
import {
  Search,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  cell?: (item: T) => React.ReactNode;
}

export interface FilterOption {
  key: string;
  label: string;
  options: { label: string; value: string }[];
}

interface EnterpriseDataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  searchKey?: keyof T | (keyof T)[];
  searchPlaceholder?: string;
  filters?: FilterOption[];
  exportFileName?: string;
  actions?: React.ReactNode;
  onRowClick?: (item: T) => void;
  pageSize?: number;
}

export function EnterpriseDataTable<T extends Record<string, unknown>>({
  data,
  columns,
  searchKey,
  searchPlaceholder = "Search records...",
  filters = [],
  exportFileName = "data-export",
  actions,
  onRowClick,
  pageSize = 10,
}: EnterpriseDataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
    columns.reduce((acc, col) => ({ ...acc, [col.key]: true }), {})
  );

  // 1. Filtering
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      // Global Search
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        let matchesSearch = false;
        if (searchKey) {
          const keys = Array.isArray(searchKey) ? searchKey : [searchKey];
          matchesSearch = keys.some((k) => {
            const val = item[k];
            return val !== undefined && val !== null && String(val).toLowerCase().includes(query);
          });
        } else {
          matchesSearch = Object.values(item).some(
            (val) => val !== undefined && val !== null && String(val).toLowerCase().includes(query)
          );
        }
        if (!matchesSearch) return false;
      }

      // Dropdown Filters
      for (const [filterKey, filterVal] of Object.entries(activeFilters)) {
        if (filterVal && filterVal !== "ALL") {
          const itemVal = item[filterKey];
          if (typeof itemVal === "object" && itemVal !== null) {
            const objectVal = itemVal as Record<string, unknown>;
            if (objectVal.name !== filterVal && objectVal.id !== filterVal && objectVal.title !== filterVal) {
              return false;
            }
          } else if (String(itemVal) !== filterVal) {
            return false;
          }
        }
      }

      return true;
    });
  }, [data, searchTerm, searchKey, activeFilters]);

  // 2. Sorting
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredData, sortKey, sortDirection]);

  // 3. Pagination
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortKey(null);
      }
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const exportToCsv = () => {
    if (sortedData.length === 0) return;
    const activeCols = columns.filter((c) => visibleColumns[c.key]);
    const headers = activeCols.map((c) => `"${c.header}"`).join(",");
    const rows = sortedData.map((row) =>
      activeCols
        ? activeCols
            .map((col) => {
              const val = row[col.key];
              const objectVal = typeof val === "object" && val !== null ? (val as Record<string, unknown>) : null;
              const cleanVal = objectVal ? objectVal.name || objectVal.title || JSON.stringify(val) : val;
              return `"${String(cleanVal ?? "").replace(/"/g, '""')}"`;
            })
            .join(",")
        : ""
    );

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${exportFileName}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Filter Dropdowns */}
          {filters.map((filter) => (
            <select
              key={filter.key}
              value={activeFilters[filter.key] || "ALL"}
              onChange={(e) => {
                setActiveFilters((prev) => ({ ...prev, [filter.key]: e.target.value }));
                setCurrentPage(1);
              }}
              className="h-9 px-3 py-1 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary shrink-0"
            >
              <option value="ALL">All {filter.label}s</option>
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Column Toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 shadow-sm">
                <SlidersHorizontal className="size-3.5" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {columns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={visibleColumns[col.key] !== false}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((prev) => ({ ...prev, [col.key]: !!checked }))
                  }
                  className="text-xs"
                >
                  {col.header}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export CSV */}
          <Button variant="outline" size="sm" onClick={exportToCsv} className="h-9 text-xs gap-1.5 shadow-sm">
            <Download className="size-3.5" /> Export CSV
          </Button>

          {actions}
        </div>
      </div>

      {/* Table Body */}
      <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
              <tr>
                {columns
                  .filter((col) => visibleColumns[col.key] !== false)
                  .map((col) => (
                    <th
                      key={col.key}
                      onClick={() => col.sortable && handleSort(col.key)}
                      className={`px-4 py-3 select-none ${
                        col.sortable ? "cursor-pointer hover:text-foreground transition-colors" : ""
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{col.header}</span>
                        {col.sortable && (
                          <span className="text-muted-foreground">
                            {sortKey === col.key ? (
                              sortDirection === "asc" ? (
                                <ChevronUp className="size-3.5 text-primary" />
                              ) : (
                                <ChevronDown className="size-3.5 text-primary" />
                              )
                            ) : (
                              <ChevronsUpDown className="size-3.5 opacity-50" />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.filter((c) => visibleColumns[c.key] !== false).length}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No matching records found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, index) => (
                  <tr
                    key={(item.id as string | number | undefined) || index}
                    onClick={() => onRowClick && onRowClick(item)}
                    className={`hover:bg-muted/30 transition-colors ${
                      onRowClick ? "cursor-pointer" : ""
                    }`}
                  >
                    {columns
                      .filter((col) => visibleColumns[col.key] !== false)
                      .map((col) => (
                        <td key={col.key} className="px-4 py-3 text-xs">
                          {col.cell ? col.cell(item) : String(item[col.key] ?? "—")}
                        </td>
                      ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-3 bg-muted/20 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>
            Showing <span className="font-semibold text-foreground">
              {sortedData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </span> to <span className="font-semibold text-foreground">
              {Math.min(currentPage * pageSize, sortedData.length)}
            </span> of <span className="font-semibold text-foreground">{sortedData.length}</span> entries
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="size-8"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 font-medium text-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="size-8"
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
