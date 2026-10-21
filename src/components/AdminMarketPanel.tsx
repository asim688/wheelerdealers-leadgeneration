"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminMarketListing, AdminMarketResponse } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

const SOURCE_STYLES: Record<string, string> = {
  dubizzle: "bg-red-100 text-red-700",
  yallamotor: "bg-blue-100 text-blue-700",
  buyanycar: "bg-green-100 text-green-700",
  dubicars: "bg-amber-100 text-amber-700",
  cars24: "bg-purple-100 text-purple-700",
  carswitch: "bg-cyan-100 text-cyan-700",
  kavak: "bg-neutral-800 text-white",
};

const PAGE_SIZES = [10, 20, 50, 100];

interface Query {
  q: string;
  source: string;
  make: string;
  year: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
  order: "asc" | "desc";
  page: number;
  pageSize: number;
}

const DEFAULT_QUERY: Query = {
  q: "",
  source: "",
  make: "",
  year: "",
  minPrice: "",
  maxPrice: "",
  sort: "createdAt",
  order: "desc",
  page: 1,
  pageSize: 20,
};

const FILTER_KEYS: (keyof Query)[] = ["source", "make", "year", "minPrice", "maxPrice"];

export default function AdminMarketPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [query, setQuery] = useState<Query>(DEFAULT_QUERY);
  const [searchText, setSearchText] = useState("");
  const [data, setData] = useState<AdminMarketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery((prev) =>
        prev.q === searchText ? prev : { ...prev, q: searchText, page: 1 },
      );
    }, 350);
    return () => clearTimeout(t);
  }, [searchText]);

  const buildParams = useCallback((qy: Query) => {
    const sp = new URLSearchParams();
    if (qy.q) sp.set("q", qy.q);
    if (qy.source) sp.set("source", qy.source);
    if (qy.make) sp.set("make", qy.make);
    if (qy.year) sp.set("year", qy.year);
    if (qy.minPrice) sp.set("minPrice", qy.minPrice);
    if (qy.maxPrice) sp.set("maxPrice", qy.maxPrice);
    sp.set("sort", qy.sort);
    sp.set("order", qy.order);
    sp.set("page", String(qy.page));
    sp.set("pageSize", String(qy.pageSize));
    return sp.toString();
  }, []);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/market?${buildParams(query)}`);
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) {
        setError("Failed to load market data.");
        return;
      }
      setData(await res.json());
    } catch {
      setError("Network error while loading market data.");
    } finally {
      setLoading(false);
    }
  }, [buildParams, query, onUnauthorized]);

  useEffect(() => {
    void fetchListings();
  }, [fetchListings]);

  function patch(p: Partial<Query>) {
    setQuery((prev) => ({ ...prev, ...p, page: p.page ?? 1 }));
  }

  function toggleSort(field: string) {
    setQuery((prev) => ({
      ...prev,
      sort: field,
      order: prev.sort === field && prev.order === "desc" ? "asc" : "desc",
      page: 1,
    }));
  }

  function clearFilters() {
    setSearchText("");
    setQuery((prev) => ({
      ...DEFAULT_QUERY,
      pageSize: prev.pageSize,
      sort: prev.sort,
      order: prev.order,
    }));
  }

  const activeFilterCount = useMemo(
    () => FILTER_KEYS.filter((k) => query[k] !== "").length,
    [query],
  );

  async function exportCsv() {
    const all = { ...query, page: 1, pageSize: 10000 };
    const res = await fetch(`/api/admin/market?${buildParams(all)}`);
    if (!res.ok) return;
    const rows = ((await res.json()) as AdminMarketResponse).listings;
    downloadCsv(rows);
  }

  const listings = data?.listings ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const from = total === 0 ? 0 : (query.page - 1) * query.pageSize + 1;
  const to = Math.min(total, query.page * query.pageSize);

  return (
    <div className="space-y-3">
      {/* Source summary chips */}
      {data && (
        <div className="flex flex-wrap gap-1.5">
          {data.facets.sources.map((s) => (
            <button
              key={s.source}
              onClick={() => patch({ source: query.source === s.source ? "" : s.source })}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                query.source === s.source
                  ? "bg-red-600 text-white"
                  : "bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50"
              }`}
            >
              {s.source} · {s.count.toLocaleString()}
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
            🔍
          </span>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search make, model, trim, location…"
            className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-red-500"
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            showFilters || activeFilterCount
              ? "border-red-500 bg-red-50 text-red-700"
              : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          🎛 Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
        <button
          onClick={() => void exportCsv()}
          className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          ⬇ Export
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Source">
            <Select
              value={query.source}
              onChange={(v) => patch({ source: v })}
              options={[
                { value: "", label: "All sources" },
                ...(data?.facets.sources ?? []).map((s) => ({
                  value: s.source,
                  label: `${s.source} (${s.count.toLocaleString()})`,
                })),
              ]}
            />
          </Field>
          <Field label="Make">
            <Select
              value={query.make}
              onChange={(v) => patch({ make: v })}
              options={[
                { value: "", label: "All makes" },
                ...(data?.facets.makes ?? []).map((m) => ({ value: m, label: m })),
              ]}
            />
          </Field>
          <Field label="Year">
            <input
              type="number"
              value={query.year}
              onChange={(e) => patch({ year: e.target.value })}
              placeholder="e.g. 2020"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-red-500"
            />
          </Field>
          <Field label="Price range (AED)">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={query.minPrice}
                onChange={(e) => patch({ minPrice: e.target.value })}
                placeholder="Min"
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-red-500"
              />
              <span className="text-neutral-400">–</span>
              <input
                type="number"
                value={query.maxPrice}
                onChange={(e) => patch({ maxPrice: e.target.value })}
                placeholder="Max"
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-red-500"
              />
            </div>
          </Field>
          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* Result count */}
      <div className="text-sm text-neutral-500">
        {loading
          ? "Loading…"
          : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} listings`}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-black/5">
        <table className="min-w-[820px] w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400">
              <SortTh label="Date" field="createdAt" query={query} onSort={toggleSort} />
              <SortTh label="Make" field="make" query={query} onSort={toggleSort} />
              <th className="px-3 py-2.5 font-medium">Model / trim</th>
              <SortTh label="Year" field="year" query={query} onSort={toggleSort} />
              <SortTh label="Km" field="mileageKm" query={query} onSort={toggleSort} />
              <SortTh label="Price" field="priceAed" query={query} onSort={toggleSort} />
              <th className="px-3 py-2.5 font-medium">Location</th>
              <th className="px-3 py-2.5 font-medium">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {listings.map((l) => (
              <tr key={l.id} className="hover:bg-neutral-50">
                <td className="whitespace-nowrap px-3 py-2 text-neutral-500">
                  {new Date(l.createdAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-2 font-medium text-neutral-900">{l.make}</td>
                <td className="px-3 py-2 text-neutral-700">
                  {l.model}
                  {l.trim && <span className="text-neutral-400"> · {l.trim}</span>}
                </td>
                <td className="px-3 py-2 text-neutral-700">{l.year}</td>
                <td className="whitespace-nowrap px-3 py-2 text-neutral-500">
                  {l.mileageKm != null ? l.mileageKm.toLocaleString() : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-red-700">
                  {formatCurrency(l.priceAed, "AED")}
                </td>
                <td className="max-w-[140px] truncate px-3 py-2 text-neutral-500">
                  {l.location || "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      SOURCE_STYLES[l.source] ?? "bg-neutral-200 text-neutral-700"
                    }`}
                  >
                    {l.source}
                  </span>
                </td>
              </tr>
            ))}
            {!loading && listings.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-neutral-400">
                  No listings match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <label className="flex items-center gap-2 text-neutral-500">
          Rows per page
          <select
            value={query.pageSize}
            onChange={(e) => patch({ pageSize: Number(e.target.value) })}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-red-500"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <PageBtn label="«" disabled={query.page <= 1} onClick={() => patch({ page: 1 })} />
          <PageBtn
            label="‹"
            disabled={query.page <= 1}
            onClick={() => patch({ page: query.page - 1 })}
          />
          <span className="px-2 text-neutral-600">
            Page {query.page} of {totalPages}
          </span>
          <PageBtn
            label="›"
            disabled={query.page >= totalPages}
            onClick={() => patch({ page: query.page + 1 })}
          />
          <PageBtn
            label="»"
            disabled={query.page >= totalPages}
            onClick={() => patch({ page: totalPages })}
          />
        </div>
      </div>
    </div>
  );
}

function SortTh({
  label,
  field,
  query,
  onSort,
}: {
  label: string;
  field: string;
  query: { sort: string; order: "asc" | "desc" };
  onSort: (field: string) => void;
}) {
  const active = query.sort === field;
  return (
    <th className="px-3 py-2.5 font-medium">
      <button
        onClick={() => onSort(field)}
        className={`flex items-center gap-1 ${active ? "text-red-600" : "hover:text-neutral-700"}`}
      >
        {label}
        <span className="text-[9px]">{active ? (query.order === "desc" ? "▼" : "▲") : "↕"}</span>
      </button>
    </th>
  );
}

function PageBtn({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-neutral-300 px-2.5 py-1 text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-red-500"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function downloadCsv(rows: AdminMarketListing[]) {
  const cols = [
    "createdAt",
    "make",
    "model",
    "trim",
    "year",
    "mileageKm",
    "priceAed",
    "transmission",
    "specs",
    "location",
    "source",
  ] as const;
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => esc(r[c])).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `market-listings-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
