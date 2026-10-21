"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdminLead, AdminLeadsResponse } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

const INTENT_STYLES: Record<string, string> = {
  sell: "bg-red-100 text-red-700",
  trade: "bg-amber-100 text-amber-700",
  buy: "bg-blue-100 text-blue-700",
  dealer: "bg-neutral-200 text-neutral-700",
};

const ACCIDENTS = [
  "No accident",
  "Minor accident",
  "Major accident",
  "Structural damage",
  "Not sure",
];
const INSPECTION_OPTS = [
  { value: "", label: "Any inspection" },
  { value: "booked", label: "Inspection booked" },
  { value: "none", label: "No inspection" },
];
const PAGE_SIZES = [10, 20, 50, 100];

interface Query {
  q: string;
  intent: string;
  make: string;
  condition: string;
  accident: string;
  inspection: string;
  dateFrom: string;
  dateTo: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
  order: "asc" | "desc";
  page: number;
  pageSize: number;
}

const DEFAULT_QUERY: Query = {
  q: "",
  intent: "",
  make: "",
  condition: "",
  accident: "",
  inspection: "",
  dateFrom: "",
  dateTo: "",
  minPrice: "",
  maxPrice: "",
  sort: "createdAt",
  order: "desc",
  page: 1,
  pageSize: 20,
};

// Which filters count toward the "active filters" badge.
const FILTER_KEYS: (keyof Query)[] = [
  "intent",
  "make",
  "condition",
  "accident",
  "inspection",
  "dateFrom",
  "dateTo",
  "minPrice",
  "maxPrice",
];

export default function AdminLeadsPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [query, setQuery] = useState<Query>(DEFAULT_QUERY);
  const [searchText, setSearchText] = useState("");
  const [data, setData] = useState<AdminLeadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [busy, setBusy] = useState(false);

  // Debounce the free-text search into the query.
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
    if (qy.intent) sp.set("intent", qy.intent);
    if (qy.make) sp.set("make", qy.make);
    if (qy.condition) sp.set("condition", qy.condition);
    if (qy.accident) sp.set("accident", qy.accident);
    if (qy.inspection) sp.set("inspection", qy.inspection);
    if (qy.dateFrom) sp.set("dateFrom", qy.dateFrom);
    if (qy.dateTo) sp.set("dateTo", qy.dateTo);
    if (qy.minPrice) sp.set("minPrice", qy.minPrice);
    if (qy.maxPrice) sp.set("maxPrice", qy.maxPrice);
    sp.set("sort", qy.sort);
    sp.set("order", qy.order);
    sp.set("page", String(qy.page));
    sp.set("pageSize", String(qy.pageSize));
    return sp.toString();
  }, []);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/leads?${buildParams(query)}`);
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) {
        setError("Failed to load leads.");
        return;
      }
      setData(await res.json());
    } catch {
      setError("Network error while loading leads.");
    } finally {
      setLoading(false);
    }
  }, [buildParams, query, onUnauthorized]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  // Clear selection when the underlying result set changes.
  useEffect(() => {
    setSelected(new Set());
  }, [data]);

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

  const leads = data?.leads ?? [];
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} lead${ids.length === 1 ? "" : "s"}? This cannot be undone.`))
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setSelected(new Set());
        await fetchLeads();
      }
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv(scope: "selected" | "filtered") {
    let rows: AdminLead[];
    if (scope === "selected") {
      rows = leads.filter((l) => selected.has(l.id));
    } else {
      // Fetch every matching lead (ignore pagination) for the export.
      const all = { ...query, page: 1, pageSize: 10000 };
      const res = await fetch(`/api/admin/leads?${buildParams(all)}`);
      if (!res.ok) return;
      rows = ((await res.json()) as AdminLeadsResponse).leads;
    }
    downloadLeadsCsv(rows);
  }

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const from = total === 0 ? 0 : (query.page - 1) * query.pageSize + 1;
  const to = Math.min(total, query.page * query.pageSize);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
            🔍
          </span>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search name, mobile, email, make, model…"
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
          onClick={() => exportCsv("filtered")}
          className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          ⬇ Export
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Type">
            <Select
              value={query.intent}
              onChange={(v) => patch({ intent: v })}
              options={[
                { value: "", label: "All types" },
                ...(data?.facets.intents ?? []).map((i) => ({ value: i, label: i })),
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
          <Field label="Condition">
            <Select
              value={query.condition}
              onChange={(v) => patch({ condition: v })}
              options={[
                { value: "", label: "Any condition" },
                ...(data?.facets.conditions ?? []).map((c) => ({ value: c, label: c })),
              ]}
            />
          </Field>
          <Field label="Accident">
            <Select
              value={query.accident}
              onChange={(v) => patch({ accident: v })}
              options={[
                { value: "", label: "Any accident status" },
                ...ACCIDENTS.map((a) => ({ value: a, label: a })),
              ]}
            />
          </Field>
          <Field label="Inspection">
            <Select
              value={query.inspection}
              onChange={(v) => patch({ inspection: v })}
              options={INSPECTION_OPTS}
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
          <Field label="Created from">
            <input
              type="date"
              value={query.dateFrom}
              onChange={(e) => patch({ dateFrom: e.target.value })}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-red-500"
            />
          </Field>
          <Field label="Created to">
            <input
              type="date"
              value={query.dateTo}
              onChange={(e) => patch({ dateTo: e.target.value })}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-red-500"
            />
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

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_KEYS.filter((k) => query[k] !== "").map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700"
            >
              <span className="text-neutral-400">{filterLabel(k)}:</span>
              {String(query[k])}
              <button
                onClick={() => patch({ [k]: "" } as Partial<Query>)}
                className="text-neutral-400 hover:text-red-600"
                aria-label={`Remove ${k} filter`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Result count + bulk bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-500">
        <span>
          {loading ? "Loading…" : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} leads`}
        </span>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-700">{selected.size} selected</span>
            <button
              onClick={() => exportCsv("selected")}
              className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
            >
              ⬇ Export selected
            </button>
            <button
              onClick={bulkDelete}
              disabled={busy}
              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              🗑 Delete
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
              <SortableTh label="Date" field="createdAt" query={query} onSort={toggleSort} />
              <th className="px-3 py-2.5">Type</th>
              <SortableTh label="Car" field="make" query={query} onSort={toggleSort} />
              <th className="px-3 py-2.5">Contact</th>
              <SortableTh label="Estimate" field="estimateMin" query={query} onSort={toggleSort} />
              <th className="px-3 py-2.5">Inspection</th>
              <th className="w-10 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-neutral-400">
                  Loading…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-red-500">
                  {error}{" "}
                  <button onClick={fetchLeads} className="underline">
                    Retry
                  </button>
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-neutral-400">
                  No leads match your search / filters.
                </td>
              </tr>
            ) : (
              leads.map((l) => (
                <LeadRow
                  key={l.id}
                  lead={l}
                  selected={selected.has(l.id)}
                  onToggle={() => toggleOne(l.id)}
                  expanded={expanded === l.id}
                  onExpand={() => setExpanded(expanded === l.id ? null : l.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <label className="flex items-center gap-2 text-neutral-500">
          Rows per page:
          <select
            value={query.pageSize}
            onChange={(e) => patch({ pageSize: Number(e.target.value) })}
            className="rounded-md border border-neutral-300 px-2 py-1 outline-none focus:border-red-500"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <PageBtn disabled={query.page <= 1} onClick={() => patch({ page: 1 })}>
            «
          </PageBtn>
          <PageBtn disabled={query.page <= 1} onClick={() => patch({ page: query.page - 1 })}>
            ‹ Prev
          </PageBtn>
          <span className="px-2 text-neutral-600">
            Page {query.page} of {totalPages}
          </span>
          <PageBtn
            disabled={query.page >= totalPages}
            onClick={() => patch({ page: query.page + 1 })}
          >
            Next ›
          </PageBtn>
          <PageBtn disabled={query.page >= totalPages} onClick={() => patch({ page: totalPages })}>
            »
          </PageBtn>
        </div>
      </div>
    </div>
  );
}

function SortableTh({
  label,
  field,
  query,
  onSort,
}: {
  label: string;
  field: string;
  query: Query;
  onSort: (f: string) => void;
}) {
  const active = query.sort === field;
  return (
    <th className="px-3 py-2.5">
      <button
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 hover:text-neutral-800 ${
          active ? "text-neutral-900" : ""
        }`}
      >
        {label}
        <span className="text-[10px]">{active ? (query.order === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function LeadRow({
  lead,
  selected,
  onToggle,
  expanded,
  onExpand,
}: {
  lead: AdminLead;
  selected: boolean;
  onToggle: () => void;
  expanded: boolean;
  onExpand: () => void;
}) {
  const car = [lead.year || "", lead.make, lead.model].filter(Boolean).join(" ").trim();
  const details: Array<[string, string]> = [];
  if (lead.mileage) details.push(["Mileage", `${lead.mileage.toLocaleString()} km`]);
  if (lead.condition) details.push(["Condition", lead.condition]);
  if (lead.accident) details.push(["Accident", lead.accident]);
  if (lead.serviceHistory) details.push(["Service", lead.serviceHistory]);
  if (lead.previousOwners != null) details.push(["Owners", String(lead.previousOwners)]);
  if (lead.warranty) details.push(["Warranty", lead.warranty]);
  if (lead.keys) details.push(["Keys", lead.keys]);
  if (lead.modifications) details.push(["Modifications", lead.modifications]);

  return (
    <>
      <tr className={`border-b border-neutral-100 ${selected ? "bg-red-50/40" : "hover:bg-neutral-50"}`}>
        <td className="px-3 py-2.5">
          <input type="checkbox" checked={selected} onChange={onToggle} aria-label="Select lead" />
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-neutral-500">
          {new Date(lead.createdAt).toLocaleDateString()}
          <span className="block text-[11px] text-neutral-400">
            {new Date(lead.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
              INTENT_STYLES[lead.intent] ?? "bg-neutral-200 text-neutral-700"
            }`}
          >
            {lead.intent}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-neutral-900">{car || "—"}</td>
        <td className="px-3 py-2.5">
          <span className="block text-neutral-800">{lead.name || "—"}</span>
          {lead.mobile && (
            <a href={`tel:${lead.mobile}`} className="text-xs text-neutral-500 hover:text-red-600">
              {lead.mobile}
            </a>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-red-700">
          {lead.estimateMin != null && lead.estimateMax != null
            ? `${formatCurrency(lead.estimateMin, lead.currency)} – ${formatCurrency(lead.estimateMax, lead.currency)}`
            : "—"}
        </td>
        <td className="px-3 py-2.5">
          {lead.inspectionType ? (
            <span className="rounded-md bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
              {inspectionLabel(lead.inspectionType)}
              {lead.inspectionSlot ? ` · ${lead.inspectionSlot}` : ""}
            </span>
          ) : (
            <span className="text-neutral-300">—</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right">
          <button
            onClick={onExpand}
            className="text-neutral-400 hover:text-neutral-700"
            aria-label="Toggle details"
          >
            {expanded ? "▲" : "▼"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-neutral-100 bg-neutral-50/60">
          <td colSpan={8} className="px-6 py-3">
            <div className="flex flex-wrap gap-1.5">
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="rounded-md bg-white px-2 py-0.5 text-[11px] text-neutral-600 ring-1 ring-neutral-200 hover:text-red-600"
                >
                  ✉ {lead.email}
                </a>
              )}
              {details.map(([k, v]) => (
                <span
                  key={k}
                  className="rounded-md bg-white px-2 py-0.5 text-[11px] text-neutral-600 ring-1 ring-neutral-200"
                >
                  <span className="text-neutral-400">{k}:</span> {v}
                </span>
              ))}
              {details.length === 0 && !lead.email && (
                <span className="text-xs text-neutral-400">No extra details captured.</span>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// --- small helpers --------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500">{label}</span>
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
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm capitalize outline-none focus:border-red-500"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function PageBtn({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function filterLabel(k: string): string {
  const map: Record<string, string> = {
    intent: "Type",
    make: "Make",
    condition: "Condition",
    accident: "Accident",
    inspection: "Inspection",
    dateFrom: "From",
    dateTo: "To",
    minPrice: "Min AED",
    maxPrice: "Max AED",
  };
  return map[k] ?? k;
}

function inspectionLabel(type: string): string {
  if (type === "home") return "Home visit";
  if (type === "branch") return "Branch visit";
  if (type === "expert-chat") return "Expert callback";
  return type;
}

function downloadLeadsCsv(leads: AdminLead[]) {
  const headers = [
    "Created", "Intent", "Make", "Model", "Year", "Mileage", "Condition",
    "Accident", "Service", "Owners", "Warranty", "Keys", "Modifications",
    "EstimateMin", "EstimateMax", "Currency", "Name", "Mobile", "Email",
    "Inspection", "InspectionSlot",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = leads.map((l) =>
    [
      new Date(l.createdAt).toISOString(), l.intent, l.make, l.model, l.year ?? "",
      l.mileage ?? "", l.condition, l.accident ?? "", l.serviceHistory ?? "",
      l.previousOwners ?? "", l.warranty ?? "", l.keys ?? "", l.modifications ?? "",
      l.estimateMin ?? "", l.estimateMax ?? "", l.currency, l.name, l.mobile, l.email,
      l.inspectionType ?? "", l.inspectionSlot ?? "",
    ]
      .map(esc)
      .join(","),
  );
  const csv = [headers.map(esc).join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wheeler-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
