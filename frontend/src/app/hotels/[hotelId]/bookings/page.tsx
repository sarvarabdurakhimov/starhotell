"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBan, IconBrandTelegram, IconCash, IconCheck, IconFilter, IconMessage, IconPlus, IconStarFilled, IconX } from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { apiError, asList, BOOKING_STATUS } from "@/lib/api/helpers";
import { usePanel } from "@/lib/panel-context";
import { NewBookingModal } from "@/components/bookings/NewBookingModal";
import type { Booking, PaginatedResponse } from "@/types";

type Filter = "all" | "telegram" | "cancel_asks" | "confirmed" | "checked_in" | "checked_out" | "requests";

// Special requests that still matter: guest is coming or staying
const hasOpenRequest = (b: Booking) =>
  !!b.special_requests?.trim() && (b.status === "confirmed" || b.status === "checked_in");

// Telegram requests still waiting for the manager or for the guest's payment
// The guest asked in Telegram to cancel; waits for the manager to decide
const isCancelAsked = (b: Booking) => !!b.cancel_requested_at && (b.status === "pending" || b.status === "confirmed");

const isTelegramOpen = (b: Booking) => (b.source === "telegram" && b.status === "pending") || isCancelAsked(b);

const shortTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

export default function BookingsPage() {
  const { hotelId, role } = usePanel();
  const canApprove = role !== "staff";
  const [note, setNote] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["bookings", hotelId],
    queryFn: async () =>
      asList(
        (await apiClient.get<PaginatedResponse<Booking>>(`/bookings/hotels/${hotelId}/bookings/`, { params: { page_size: 100 } })).data
      ),
  });

  const refresh = () =>
    ["bookings", "booking-calendar", "rooms", "room-overview", "manager-operations"].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k, hotelId] })
    );

  const action = useMutation({
    mutationFn: async ({
      id,
      kind,
      reason,
      amount,
    }: {
      id: number;
      kind: "check-in" | "check-out" | "cancel" | "approve" | "reject" | "keep" | "refund";
      reason?: string;
      asked?: boolean;
      amount?: string;
    }) =>
      apiClient.post(
        `/bookings/hotels/${hotelId}/bookings/${id}/${kind}/`,
        kind === "refund" ? { amount, note: reason || "" } : reason ? { reason } : {}
      ),
    onSuccess: (res, vars) => {
      setError(null);
      setNote(
        vars.kind === "approve"
          ? res.data?.note || "Tasdiqlandi."
          : vars.kind === "reject"
          ? "So'rov rad etildi, mijozga xabar yuborildi."
          : vars.kind === "refund"
          ? `Qaytarilgan pul qayd qilindi: ${vars.amount}.`
          : vars.kind === "keep"
          ? "Bekor qilish so'rovi rad etildi: bron saqlandi, mijozga xabar yuborildi."
          : vars.kind === "cancel" && vars.asked
          ? "Bron bekor qilindi, xona bo'shadi. Mijozga xabar yuborildi."
          : null
      );
      refresh();
    },
    onError: (err) => setError(apiError(err)),
  });

  const requestCount = bookings.filter(hasOpenRequest).length;
  const telegramCount = bookings.filter(isTelegramOpen).length;
  const cancelAskCount = bookings.filter(isCancelAsked).length;
  const filtered =
    filter === "all"
      ? bookings
      : filter === "telegram"
      ? bookings.filter(isTelegramOpen)
      : filter === "cancel_asks"
      ? bookings.filter(isCancelAsked)
      : filter === "requests"
      ? bookings.filter(hasOpenRequest)
      : bookings.filter((b) => b.status === filter);

  const filterBtn = (key: Filter, label: React.ReactNode) => (
    <button
      onClick={() => setFilter(key)}
      className={`px-3 py-1 rounded border transition inline-flex items-center gap-1 ${
        filter === key
          ? "bg-stone-900 text-white border-stone-900 font-semibold"
          : "bg-white text-stone-700 border-stone-300 hover:bg-stone-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <h1 className="text-2xl font-serif font-bold text-stone-900">Bronlar</h1>
        <button
          onClick={() => {
            setError(null);
            setShowModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs rounded shadow-sm transition"
        >
          <IconPlus className="w-4 h-4 text-amber-400" /> Yangi bron
        </button>
      </div>

      {error && <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">{error}</div>}
      {note && (
        <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between">
          <span>{note}</span>
          <button onClick={() => setNote(null)} title="Yopish" aria-label="Yopish" className="text-emerald-700 hover:text-emerald-950">
            <IconX className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-stone-500 font-semibold flex items-center gap-1">
          <IconFilter className="w-3.5 h-3.5" /> Holat:
        </span>
        {filterBtn("all", `Barchasi (${bookings.length})`)}
        {filterBtn(
          "telegram",
          <>
            <IconBrandTelegram className="w-3.5 h-3.5" /> Telegram ({telegramCount})
          </>
        )}
        {cancelAskCount > 0 &&
          filterBtn(
            "cancel_asks",
            <>
              <IconBan className="w-3.5 h-3.5 text-rose-600" /> Bekor qilish so'rovlari ({cancelAskCount})
            </>
          )}
        {filterBtn("confirmed", "Kutilmoqda")}
        {filterBtn("checked_in", "Joylashgan")}
        {filterBtn("checked_out", "Chiqib ketgan")}
        {filterBtn(
          "requests",
          <>
            <IconMessage className="w-3.5 h-3.5" /> So&apos;rovlar ({requestCount})
          </>
        )}
      </div>

      <div className="bg-white border border-stone-200 rounded shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-stone-100 text-stone-700 font-semibold uppercase tracking-wider text-[11px] border-b border-stone-200">
            <tr>
              <th className="py-3 px-4">Kod</th>
              <th className="py-3 px-4">Mehmon</th>
              <th className="py-3 px-4">Xona</th>
              <th className="py-3 px-4">Sana</th>
              <th className="py-3 px-4 text-right">Summa</th>
              <th className="py-3 px-4 text-center">Holat</th>
              <th className="py-3 px-4 text-right">Amallar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 font-medium">
            {isLoading && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-stone-400">Yuklanmoqda...</td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-stone-400">
                  {filter === "requests" || filter === "telegram" ? "So'rov yo'q" : "Bron yo'q"}
                </td>
              </tr>
            )}
            {filtered.map((b) => (
              <tr key={b.id} className="hover:bg-stone-50 transition">
                <td className="py-3 px-4 font-mono font-bold text-stone-900 whitespace-nowrap">
                  {b.source === "telegram" && (
                    <IconBrandTelegram className="w-4 h-4 inline -mt-0.5 mr-1 text-sky-600" aria-label="Telegram orqali" />
                  )}
                  {b.reference}
                </td>
                <td className="py-3 px-4">
                  <div className="font-bold text-stone-900 flex items-center gap-1.5">
                    {b.guest_name}
                    {b.guest_blacklisted && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-stone-900 text-white rounded" title="Qora ro'yxatda">
                        Qora ro&apos;yxat
                      </span>
                    )}
                    {b.review_rating ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600" title="Mijoz bahosi">
                        <IconStarFilled className="w-3 h-3" /> {b.review_rating}
                      </span>
                    ) : null}
                  </div>
                  {b.source === "telegram" && b.guest_phone && (
                    <div className="text-[11px] font-mono font-normal text-stone-500">{b.guest_phone}</div>
                  )}
                  {b.special_requests && (
                    <div className="mt-0.5 text-[11px] font-normal text-amber-900 flex items-start gap-1">
                      <IconMessage className="w-3 h-3 mt-0.5 shrink-0" /> {b.special_requests}
                    </div>
                  )}
                </td>
                <td className="py-3 px-4 font-bold text-stone-900">№ {b.room_number}</td>
                <td className="py-3 px-4 font-mono text-stone-600">
                  {b.check_in} &rarr; {b.check_out}
                </td>
                <td className="py-3 px-4 text-right font-mono font-bold text-stone-900">
                  {Number(b.total_amount).toLocaleString()} {b.currency}
                  {Number(b.paid_amount || 0) > 0 && (
                    <div className="text-[10px] font-sans font-semibold text-emerald-700">
                      {Number(b.paid_amount) >= Number(b.total_amount)
                        ? "To'langan"
                        : `To'langan: ${Number(b.paid_amount).toLocaleString()}`}
                    </div>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                      b.status === "checked_in"
                        ? "bg-rose-100 text-rose-900 border border-rose-300"
                        : b.status === "confirmed"
                        ? "bg-amber-100 text-amber-950 border border-amber-300"
                        : b.status === "pending" && b.approved_at
                        ? "bg-violet-100 text-violet-900 border border-violet-300"
                        : b.status === "pending"
                        ? "bg-sky-100 text-sky-900 border border-sky-300"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {b.status === "pending" && b.approved_at
                      ? "To'lov kutilmoqda"
                      : b.status === "pending" && b.source === "telegram"
                      ? "Yangi so'rov"
                      : BOOKING_STATUS[b.status] || b.status}
                  </span>
                  {b.status === "pending" && b.payment_due_at && (
                    <div className="mt-0.5 text-[10px] text-stone-500 font-mono">{shortTime(b.payment_due_at)} gacha</div>
                  )}
                  {b.status === "cancelled" && b.cancellation_reason && (
                    <div className="mt-0.5 text-[10px] text-stone-500 max-w-[160px] mx-auto truncate" title={b.cancellation_reason}>
                      {b.cancellation_reason.startsWith("Cancelled by guest") ? "Mijoz bekor qildi" : b.cancellation_reason}
                    </div>
                  )}
                  {b.status === "cancelled" && Number(b.paid_amount) > Number(b.refunded_amount || 0) && (
                    <div className="mt-0.5 text-[10px] font-bold text-rose-700">
                      Pulni qaytarish kerak: {(Number(b.paid_amount) - Number(b.refunded_amount || 0)).toLocaleString()}
                    </div>
                  )}
                  {Number(b.refunded_amount) > 0 && (
                    <div className="mt-0.5 text-[10px] font-bold text-emerald-700">
                      Qaytarildi: {Number(b.refunded_amount).toLocaleString()}
                    </div>
                  )}
                  {isCancelAsked(b) && (
                    <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 border border-rose-300 text-rose-800 text-[10px] font-bold">
                      <IconBan className="w-3 h-3" /> Mijoz bekor qilishni so&apos;rayapti
                      {b.cancel_requested_at && <span className="font-mono font-normal">({shortTime(b.cancel_requested_at)})</span>}
                    </div>
                  )}
                </td>
                <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                  {b.status === "cancelled" && canApprove && Number(b.paid_amount) > Number(b.refunded_amount || 0) && (
                    <button
                      disabled={action.isPending}
                      onClick={() => {
                        const left = (Number(b.paid_amount) - Number(b.refunded_amount || 0)).toFixed(2);
                        const amount = prompt(`Mijozga qancha pul qaytarildi? (eng ko'pi ${left})`, left);
                        if (amount === null || !amount.trim()) return;
                        const note = prompt("Izoh (masalan: Click orqali, naqd):", "") ?? "";
                        action.mutate({ id: b.id, kind: "refund", amount: amount.trim().replace(",", "."), reason: note });
                      }}
                      className="px-2.5 py-1 inline-flex items-center gap-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[11px] font-semibold transition shadow-sm disabled:opacity-50"
                    >
                      <IconCash className="w-3.5 h-3.5" /> Qaytarildi
                    </button>
                  )}
                  {isCancelAsked(b) && canApprove && (
                    <>
                      <button
                        disabled={action.isPending}
                        onClick={() => {
                          const paid = Number(b.paid_amount) > 0;
                          const msg = `${b.reference} bronini bekor qilasizmi? Xona bo'shaydi.` + (paid ? "\n\nMijoz to'lagan: pulni qaytarishni unutmang." : "");
                          if (confirm(msg)) action.mutate({ id: b.id, kind: "cancel", asked: true });
                        }}
                        className="px-2.5 py-1 inline-flex items-center gap-1 bg-rose-700 hover:bg-rose-800 text-white rounded text-[11px] font-semibold transition shadow-sm disabled:opacity-50"
                      >
                        <IconBan className="w-3.5 h-3.5" /> Bekor qilish
                      </button>
                      <button
                        disabled={action.isPending}
                        onClick={() => {
                          const reason = prompt("Bron saqlanadi. Sababi (mijozga yuboriladi, bo'sh qoldirsa ham bo'ladi):");
                          if (reason !== null) action.mutate({ id: b.id, kind: "keep", reason });
                        }}
                        title="So'rovni rad etish: bron saqlanadi"
                        className="px-2.5 py-1 inline-flex items-center gap-1 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded text-[11px] font-semibold transition disabled:opacity-50"
                      >
                        <IconX className="w-3.5 h-3.5" /> Rad etish
                      </button>
                    </>
                  )}
                  {b.status === "pending" && !b.approved_at && canApprove && (
                    <>
                      <button
                        disabled={action.isPending}
                        onClick={() => action.mutate({ id: b.id, kind: "approve" })}
                        className="px-2.5 py-1 inline-flex items-center gap-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[11px] font-semibold transition shadow-sm disabled:opacity-50"
                      >
                        <IconCheck className="w-3.5 h-3.5" /> Tasdiqlash
                      </button>
                      <button
                        disabled={action.isPending}
                        onClick={() => {
                          const reason = prompt("Rad etish sababi (mijozga yuboriladi):");
                          if (reason !== null) action.mutate({ id: b.id, kind: "reject", reason });
                        }}
                        title="Rad etish"
                        aria-label="Rad etish"
                        className="p-1 inline-flex align-middle bg-stone-100 hover:bg-rose-100 text-stone-700 hover:text-rose-900 border border-stone-300 rounded transition disabled:opacity-50"
                      >
                        <IconX className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {b.status === "pending" && b.approved_at && canApprove && !isCancelAsked(b) && (
                    <button
                      disabled={action.isPending}
                      onClick={() => {
                        const reason = prompt("Bekor qilish sababi (mijozga yuboriladi):");
                        if (reason !== null) action.mutate({ id: b.id, kind: "cancel", reason });
                      }}
                      title="Bronni bekor qilish"
                      aria-label="Bronni bekor qilish"
                      className="p-1 inline-flex align-middle bg-stone-100 hover:bg-rose-100 text-stone-700 hover:text-rose-900 border border-stone-300 rounded transition disabled:opacity-50"
                    >
                      <IconBan className="w-4 h-4" />
                    </button>
                  )}
                  {b.status === "confirmed" && (
                    <>
                      <button
                        disabled={action.isPending}
                        onClick={() => action.mutate({ id: b.id, kind: "check-in" })}
                        className="px-2.5 py-1 bg-stone-900 hover:bg-stone-800 text-white rounded text-[11px] font-semibold transition shadow-sm disabled:opacity-50"
                      >
                        Check-in
                      </button>
                      {!isCancelAsked(b) && (
                        <button
                          disabled={action.isPending}
                          onClick={() => {
                            const reason = prompt("Bekor qilish sababi:");
                            if (reason !== null) action.mutate({ id: b.id, kind: "cancel", reason });
                          }}
                          title="Bronni bekor qilish"
                          aria-label="Bronni bekor qilish"
                          className="p-1 inline-flex align-middle bg-stone-100 hover:bg-rose-100 text-stone-700 hover:text-rose-900 border border-stone-300 rounded transition disabled:opacity-50"
                        >
                          <IconBan className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                  {b.status === "checked_in" && (
                    <button
                      disabled={action.isPending}
                      onClick={() => action.mutate({ id: b.id, kind: "check-out" })}
                      className="px-2.5 py-1 bg-stone-200 hover:bg-stone-300 text-stone-900 rounded text-[11px] font-semibold transition disabled:opacity-50"
                    >
                      Check-out
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && <NewBookingModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
