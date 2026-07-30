import Link from "next/link";
import QRCode from "qrcode";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { decryptSecret, totpUri } from "@/lib/twoFactor";
import TotpCodeForm from "@/components/TotpCodeForm";
import {
  startTotpSetup,
  cancelTotpSetup,
  confirmTotp,
  regenerateBackupCodes,
  disableTotp,
} from "./actions";

export const metadata = { title: "Security" };
export const dynamic = "force-dynamic";

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const u = await requireUser();
  const { ok, error } = await searchParams;
  const user = await prisma.user.findUnique({
    where: { id: u.id },
    select: { email: true, totpEnabled: true, totpSecret: true, totpBackupCodes: true },
  });
  if (!user) return null;

  const enabled = user.totpEnabled;
  const pending = !enabled && !!user.totpSecret;
  let backupRemaining = 0;
  try { backupRemaining = user.totpBackupCodes ? (JSON.parse(user.totpBackupCodes) as string[]).length : 0; } catch {}

  let qrDataUrl = "";
  let manualSecret = "";
  if (pending && user.totpSecret) {
    try {
      manualSecret = decryptSecret(user.totpSecret);
      qrDataUrl = await QRCode.toDataURL(totpUri(manualSecret, user.email), { margin: 1, width: 200 });
    } catch {}
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center justify-between gap-2">
        <h1 className="display text-4xl text-navy">Security</h1>
        <Link href="/dashboard" className="text-sm font-semibold text-sky hover:underline">← My Account</Link>
      </div>

      {ok && <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>}
      {error && <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <section className="mt-8 rounded-2xl border border-navy/10 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-2xl text-navy">Two-factor authentication</h2>
          <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ring-1 ${enabled ? "bg-green-50 text-green-700 ring-green-200" : "bg-navy/5 text-navy/60 ring-navy/10"}`}>
            {enabled ? "On" : "Off"}
          </span>
        </div>
        <p className="mt-1 text-sm text-navy/60">
          Adds a one-time code from an authenticator app (Google Authenticator, Authy, 1Password…) on top of
          your password. Strongly recommended for staff and admins.
        </p>

        {/* DISABLED → offer to enable */}
        {!enabled && !pending && (
          <form action={startTotpSetup} className="mt-4">
            <button className="btn-brand rounded-md px-5 py-2 text-sm font-bold uppercase">Enable two-factor</button>
          </form>
        )}

        {/* PENDING → QR + confirm */}
        {pending && (
          <div className="mt-5 space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-navy/80">
              <li>Scan this QR code in your authenticator app (or enter the key manually).</li>
              <li>Enter the 6-digit code it shows to finish.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-5">
              {qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="2FA QR code" className="rounded-lg ring-1 ring-navy/10" width={180} height={180} />
              )}
              <div className="text-sm">
                <div className="text-xs uppercase tracking-wide text-navy/50">Manual key</div>
                <code className="mt-1 block break-all rounded bg-navy/5 px-2 py-1 font-mono text-xs text-navy">{manualSecret}</code>
              </div>
            </div>
            <TotpCodeForm action={confirmTotp} submitLabel="Confirm & enable" />
            <form action={cancelTotpSetup}>
              <button className="text-xs font-semibold text-navy/50 hover:text-navy">Cancel setup</button>
            </form>
          </div>
        )}

        {/* ENABLED → status + backup codes + disable */}
        {enabled && (
          <div className="mt-5 space-y-6">
            <p className="text-sm text-navy/70">
              Two-factor is on. You&apos;ll enter a code from your app each time you log in.{" "}
              <strong>{backupRemaining}</strong> backup code{backupRemaining === 1 ? "" : "s"} remaining.
            </p>

            <div className="rounded-xl border border-navy/10 p-4">
              <h3 className="text-sm font-semibold text-navy">Regenerate backup codes</h3>
              <p className="mt-1 text-xs text-navy/50">Replaces all existing backup codes. Enter a current code to confirm.</p>
              <div className="mt-3">
                <TotpCodeForm action={regenerateBackupCodes} submitLabel="Regenerate" />
              </div>
            </div>

            <div className="rounded-xl border border-red-200 p-4">
              <h3 className="text-sm font-semibold text-red-700">Turn off two-factor</h3>
              <p className="mt-1 text-xs text-navy/50">Enter a current code (or a backup code) to disable.</p>
              <form action={disableTotp} className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-navy/60">
                  Code
                  <input name="code" inputMode="numeric" autoComplete="one-time-code" required
                    className="mt-1 block w-40 rounded-md border border-navy/20 px-3 py-2 text-center font-mono text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30" />
                </label>
                <button className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-bold uppercase text-red-700 hover:bg-red-100">
                  Disable
                </button>
              </form>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
