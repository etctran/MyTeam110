"use client";

import { useState, useTransition } from "react";
import { updateTa } from "./actions";
import type { TaType } from "@/generated/prisma/client";

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  taType: TaType | null;
  isSenior: boolean;
  weeklyQuota: number | null;
  hoursAssigned: number;
  lectureHelpHours: number;
  effectiveQuota: number;
};

export function TeamTable({ rows }: { rows: TeamRow[] }) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
  });

  return (
    <div>
      <input
        type="search"
        placeholder="Search by name or email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="field-input mb-4 w-full max-w-sm"
      />

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Assigned / quota</th>
              <th className="px-3 py-2">Lecture help</th>
              <th className="px-3 py-2">Effective quota</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) =>
              editingId === r.id ? (
                <EditRow key={r.id} row={r} onDone={() => setEditingId(null)} />
              ) : (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-text-muted">{r.email}</div>
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {r.taType ?? "—"}
                    {r.isSenior && " · senior"}
                  </td>
                  <td className="px-3 py-2">
                    {r.hoursAssigned}h / {r.weeklyQuota ?? "—"}h
                  </td>
                  <td className="px-3 py-2">{r.lectureHelpHours}h</td>
                  <td className="px-3 py-2">{r.effectiveQuota}h</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingId(r.id)}
                      className="text-xs text-text-muted underline hover:text-text"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ),
            )}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                  No matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const QUOTA_BY_TA_TYPE: Record<TaType, number> = { FIVE_HOUR: 4, TEN_HOUR: 8 };

function EditRow({ row, onDone }: { row: TeamRow; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [taType, setTaType] = useState<TaType | "">(row.taType ?? "");
  const [isSenior, setIsSenior] = useState(row.isSenior);
  const [weeklyQuota, setWeeklyQuota] = useState(row.weeklyQuota?.toString() ?? "");

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateTa(row.id, {
        taType: taType === "" ? null : taType,
        isSenior,
        weeklyQuota: weeklyQuota.trim() === "" ? null : Number(weeklyQuota),
      });
      if (!result.ok) setError(result.error);
      else onDone();
    });
  }

  return (
    <tr className="border-b border-border bg-bg-input last:border-0">
      <td className="px-3 py-2">
        <div className="font-medium">{row.name}</div>
        <div className="text-xs text-text-muted">{row.email}</div>
      </td>
      <td className="px-3 py-2">
        <select
          value={taType}
          onChange={(e) => {
            const next = e.target.value as TaType | "";
            setTaType(next);
            if (next) setWeeklyQuota(String(QUOTA_BY_TA_TYPE[next]));
          }}
          className="field-input mb-1 py-1 text-xs"
        >
          <option value="">No type</option>
          <option value="FIVE_HOUR">5-hour</option>
          <option value="TEN_HOUR">10-hour</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <input type="checkbox" checked={isSenior} onChange={(e) => setIsSenior(e.target.checked)} />
          Senior
        </label>
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min={0}
          value={weeklyQuota}
          onChange={(e) => setWeeklyQuota(e.target.value)}
          placeholder="Quota"
          className="field-input w-20 py-1 text-xs"
        />
        <span className="text-text-muted"> h</span>
      </td>
      <td className="px-3 py-2 text-text-muted">{row.lectureHelpHours}h</td>
      <td className="px-3 py-2 text-text-muted">—</td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-2">
          <button type="button" disabled={isPending} onClick={save} className="text-xs text-accent underline">
            Save
          </button>
          <button type="button" disabled={isPending} onClick={onDone} className="text-xs text-text-muted underline">
            Cancel
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </td>
    </tr>
  );
}
