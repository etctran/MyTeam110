"use client";

import { useState } from "react";

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  taType: string | null;
  isSenior: boolean;
  weeklyQuota: number | null;
  hoursAssigned: number;
  lectureHelpHours: number;
  effectiveQuota: number;
};

export function TeamTable({ rows }: { rows: TeamRow[] }) {
  const [query, setQuery] = useState("");

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
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
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
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-text-muted">
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
