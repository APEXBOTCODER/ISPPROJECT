"use client";

import { useActionState } from "react";
import { uploadBulk, type UploadState } from "@/app/admin/bookings/bulk/actions";

const initial: UploadState = {};

export default function BulkUploadForm() {
  const [state, formAction, pending] = useActionState(uploadBulk, initial);

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <input
        type="file"
        name="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        required
        className="block w-full text-sm text-navy file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-navy/90"
      />
      <button
        disabled={pending}
        className="btn-brand rounded-md px-5 py-2 text-sm font-bold uppercase disabled:opacity-60"
      >
        {pending ? "Uploading…" : "Upload & create bookings"}
      </button>

      {state.error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{state.error}</p>
      )}

      {state.result && (
        <div className="rounded-xl border border-navy/10 p-4">
          <p className="text-sm font-semibold text-navy">
            Created {state.result.created} booking(s)
            {state.result.failed ? ` · ${state.result.failed} row(s) had problems` : ""}.
          </p>
          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-xs">
            {state.result.results.map((r, i) => (
              <li key={i} className={r.ok ? "text-green-700" : "text-red-700"}>
                <span className="font-semibold">Row {r.row}:</span> {r.ok ? "✓ " : "✕ "}
                {r.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
