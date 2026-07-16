"use client";

/**
 * A header checkbox that toggles every checkbox with the given `name` on the
 * page (used by the Signatures log to select all signers at once).
 */
export default function BulkSelectAll({ name }: { name: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Select all signers"
      className="align-middle"
      onChange={(e) => {
        const checked = e.currentTarget.checked;
        document
          .querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)
          .forEach((el) => {
            el.checked = checked;
          });
      }}
    />
  );
}
