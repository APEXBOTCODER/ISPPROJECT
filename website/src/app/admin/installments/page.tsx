import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { PAYMENT_METHODS } from "@/lib/installments";
import UserSearch from "@/components/UserSearch";
import {
  recordPaymentAction,
  startPaymentPlanByCodeAction,
  forceCancelPlanAction,
} from "./actions";

export const metadata = { title: "Admin · Installments" };
export const dynamic = "force-dynamic";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-navy p-5 text-white">
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-white/60">{label}</div>
    </div>
  );
}

function dateRange(bookings: { date: string }[]): string {
  if (bookings.length === 0) return "—";
  const dates = bookings.map((b) => b.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first === last ? first : `${first} → ${last}`;
}

export default async function AdminInstallmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; ok?: string; error?: string }>;
}) {
  const staff = await requireStaff();
  const isAdmin = staff.role === "ADMIN";
  const { userId, ok, error } = await searchParams;

  const selectedUser = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } })
    : null;

  const plans = await prisma.reservation.findMany({
    where: { paymentPlan: true, ...(userId ? { userId } : {}) },
    include: {
      user: { select: { name: true, email: true } },
      bookings: {
        select: { date: true, startHour: true, endHour: true, status: true, resource: { select: { name: true } } },
        orderBy: [{ date: "asc" }, { startHour: "asc" }],
      },
      payments: {
        orderBy: { createdAt: "desc" },
        include: { staff: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Active (non-cancelled) first, then cancelled; within each, most recent first.
  const rank = (s: string) => (s === "CANCELLED" ? 1 : 0);
  plans.sort((a, b) => rank(a.status) - rank(b.status));

  const active = plans.filter((p) => p.status !== "CANCELLED");
  const contracted = active.reduce((s, p) => s + p.totalCents, 0);
  const collected = plans.reduce((s, p) => s + (p.paidCents - p.refundedCents), 0);
  const outstanding = active.reduce((s, p) => s + Math.max(0, p.totalCents - p.paidCents), 0);

  return (
    <div>
      <h1 className="display text-4xl text-navy">Installments</h1>
      <p className="mt-2 text-sm text-navy/60">
        Payment plans: record deposits and installments, and track how much each customer has paid and still owes.
      </p>

      {ok && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={`Outstanding dues${userId ? " (this customer)" : ""}`} value={formatCents(outstanding)} />
        <Tile label={`Collected on plans${userId ? " (this customer)" : ""}`} value={formatCents(collected)} />
        <Tile label="Contracted (active plans)" value={formatCents(contracted)} />
        <Tile label="Active plans" value={String(active.length)} />
      </div>

      {/* Start a plan by reservation code */}
      <section className="mt-8 rounded-2xl border border-navy/10 p-5">
        <h2 className="display text-2xl text-navy">Put a reservation on a payment plan</h2>
        <p className="mt-1 text-sm text-navy/60">
          Enter a reservation code (e.g. <span className="font-mono">ISP-ABC234</span>). This locks the slots
          immediately and lets the customer pay in installments — it can no longer be self-cancelled.
        </p>
        <form action={startPaymentPlanByCodeAction} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase text-navy/50">Reservation code</label>
            <input name="code" required placeholder="ISP-ABC234" className="mt-1 rounded-md border border-navy/20 px-3 py-2 font-mono uppercase" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-navy/50">Deposit now (optional)</label>
            <input name="deposit" inputMode="decimal" placeholder="$ e.g. 200" className="mt-1 w-32 rounded-md border border-navy/20 px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-navy/50">Method</label>
            <select name="method" className="mt-1 rounded-md border border-navy/20 px-3 py-2">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-brand rounded-md px-4 py-2 text-sm font-bold uppercase">Start plan</button>
        </form>
      </section>

      {/* Filter by customer */}
      <section className="mt-8">
        <div className="max-w-md">
          <label className="block text-xs font-semibold uppercase text-navy/50">Filter by customer</label>
          <div className="mt-1">
            <UserSearch
              redirectBase="/admin/installments?userId="
              placeholder="Search customer by name or email…"
              initialLabel={selectedUser ? `${selectedUser.name} · ${selectedUser.email}` : undefined}
            />
          </div>
          {userId && (
            <a href="/admin/installments" className="mt-2 inline-block text-xs font-semibold text-sky hover:underline">
              ← Clear filter
            </a>
          )}
        </div>
      </section>

      {/* Plans */}
      <section className="mt-6">
        <h2 className="display text-2xl text-navy">Payment plans {userId && selectedUser ? `· ${selectedUser.name}` : ""}</h2>
        {plans.length === 0 ? (
          <p className="mt-3 text-sm text-navy/60">No payment plans yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {plans.map((p) => {
              const balance = Math.max(0, p.totalCents - p.paidCents);
              const cancelled = p.status === "CANCELLED";
              const paidInFull = !cancelled && balance === 0;
              const badge = cancelled
                ? "bg-navy/5 text-navy/50 ring-navy/10"
                : paidInFull
                  ? "bg-green-50 text-green-700 ring-green-200"
                  : "bg-amber-50 text-amber-800 ring-amber-200";
              const badgeText = cancelled ? "Cancelled" : paidInFull ? "Paid in full" : "Owing";
              return (
                <details key={p.id} className="rounded-2xl border border-navy/10 p-4 [&[open]]:bg-navy/[0.02]">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 list-none">
                    <span>
                      <span className="font-semibold text-navy">{p.label || p.user.name}</span>
                      <span className="ml-2 text-xs text-navy/50">
                        {p.user.name} · {p.user.email} {p.code ? `· ${p.code}` : ""}
                      </span>
                      <span className="block text-xs text-navy/50">
                        {p.bookings.length} session(s) · {dateRange(p.bookings)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 text-sm">
                      <span className="text-navy/70">
                        Paid <strong className="text-navy">{formatCents(p.paidCents)}</strong> / {formatCents(p.totalCents)}
                      </span>
                      <span className="font-semibold text-navy">
                        Bal {formatCents(balance)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${badge}`}>{badgeText}</span>
                    </span>
                  </summary>

                  <div className="mt-4 grid gap-5 lg:grid-cols-2">
                    {/* Record a payment */}
                    <div>
                      {!cancelled && !paidInFull ? (
                        <>
                          <h3 className="text-sm font-semibold uppercase text-navy/60">Record a payment</h3>
                          <form action={recordPaymentAction} className="mt-2 flex flex-wrap items-end gap-2">
                            <input type="hidden" name="reservationId" value={p.id} />
                            <input type="hidden" name="mode" value="amount" />
                            <div>
                              <label className="block text-[11px] font-semibold uppercase text-navy/40">Amount</label>
                              <input name="amount" inputMode="decimal" required placeholder="$" className="mt-1 w-28 rounded-md border border-navy/20 px-3 py-2" />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold uppercase text-navy/40">Method</label>
                              <select name="method" className="mt-1 rounded-md border border-navy/20 px-2 py-2">
                                {PAYMENT_METHODS.map((m) => (
                                  <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold uppercase text-navy/40">Type</label>
                              <select name="kind" className="mt-1 rounded-md border border-navy/20 px-2 py-2">
                                <option value="INSTALLMENT">Installment</option>
                                <option value="DEPOSIT">Deposit</option>
                              </select>
                            </div>
                            <input name="note" placeholder="Note (optional)" className="w-full rounded-md border border-navy/20 px-3 py-2 sm:w-auto" />
                            <button type="submit" className="btn-brand rounded-md px-3 py-2 text-sm font-bold uppercase">Record</button>
                          </form>
                          <form action={recordPaymentAction} className="mt-2 flex items-end gap-2">
                            <input type="hidden" name="reservationId" value={p.id} />
                            <input type="hidden" name="mode" value="full" />
                            <select name="method" className="rounded-md border border-navy/20 px-2 py-2 text-sm">
                              {PAYMENT_METHODS.map((m) => (
                                <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>
                              ))}
                            </select>
                            <button type="submit" className="rounded-md border border-navy/30 px-3 py-2 text-sm font-semibold text-navy hover:bg-navy/5">
                              Mark paid in full ({formatCents(balance)})
                            </button>
                          </form>
                        </>
                      ) : (
                        <p className="text-sm text-navy/50">
                          {cancelled ? "This plan is cancelled." : "This plan is paid in full."}
                        </p>
                      )}

                      {isAdmin && !cancelled && (
                        <div className="mt-5 rounded-lg border border-red-200 bg-red-50/50 p-3">
                          <h3 className="text-sm font-semibold text-red-700">Admin: cancel this plan</h3>
                          <p className="mt-1 text-xs text-navy/50">
                            Customers can&apos;t cancel plans. Cancelling frees the slots. Optionally record a refund
                            (max {formatCents(Math.max(0, p.paidCents - p.refundedCents))}).
                          </p>
                          <form action={forceCancelPlanAction} className="mt-2 flex flex-wrap items-end gap-2">
                            <input type="hidden" name="reservationId" value={p.id} />
                            <input name="reason" required placeholder="Reason (required)" className="w-full rounded-md border border-navy/20 px-3 py-2 text-sm sm:w-56" />
                            <input name="refund" inputMode="decimal" placeholder="Refund $ (optional)" className="w-40 rounded-md border border-navy/20 px-3 py-2 text-sm" />
                            <button type="submit" className="rounded-md bg-red-600 px-3 py-2 text-sm font-bold uppercase text-white hover:bg-red-700">
                              Cancel plan
                            </button>
                          </form>
                        </div>
                      )}
                    </div>

                    {/* Payment history */}
                    <div>
                      <h3 className="text-sm font-semibold uppercase text-navy/60">Payment history</h3>
                      {p.payments.length === 0 ? (
                        <p className="mt-2 text-sm text-navy/50">No payments recorded yet.</p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {p.payments.map((pay) => (
                            <li key={pay.id} className="flex items-center justify-between gap-2 rounded-md border border-navy/10 px-3 py-1.5 text-sm">
                              <span>
                                <strong className="text-navy">{formatCents(pay.amountCents)}</strong>
                                <span className="ml-2 text-xs text-navy/50">
                                  {pay.method.toLowerCase()} · {pay.kind.toLowerCase()}
                                  {pay.note ? ` · ${pay.note}` : ""}
                                </span>
                              </span>
                              <span className="whitespace-nowrap text-xs text-navy/40">
                                {pay.createdAt.toISOString().slice(0, 10)} · {pay.staff.name}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {p.refundedCents > 0 && (
                        <p className="mt-2 text-xs text-navy/50">Refunded: {formatCents(p.refundedCents)}</p>
                      )}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
