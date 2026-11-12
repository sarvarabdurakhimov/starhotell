"use client";

// One guest's visit history: stats, every booking (with rating), and the blacklist switch.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBan, IconBrandTelegram, IconStarFilled, IconX } from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { apiError, BOOKING_STATUS } from "@/lib/api/helpers";
import { usePanel } from "@/lib/panel-context";
import type { Booking, Guest } from "@/types";

type HistoryBooking = Booking & { room_type: string; review_comment: string };

const money = (v?: string | number | null) => Number(v || 0).toLocaleString();

export function GuestHistoryModal({ guestId, onClose }: { guestId: number; onClose: () => void }) {
  const { hotelId, role } = usePanel();
  const canManage = role !== "staff";
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [askReason, setAskReason] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["guest-history", hotelId, guestId],
    queryFn: async () =>
      (await apiClient.get<{ guest: Guest; bookings: HistoryBooking[] }>(`/guests/hotels/${hotelId}/guests/${guestId}/history/`)).data,
  });

  const blacklist = useMutation({
    mutationFn: (on: boolean) =>
      apiClient.post(`/guests/hotels/${hotelId}/guests/${guestId}/blacklist/`, { blacklisted: on, reason: on ? reason : "" }),
    onSuccess: () => {
      setAskReason(false);
      setReason("");
      setError(null);
      ["guest-history", "guests", "bookings"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k, hotelId] }));
    },
    onError: (err) => setError(apiError(err)),
  });

  const g = data?.guest;
  const stat = (label: string, value: React.ReactNode) => (
    <div className="bg-stone-50 border border-stone-200 rounded p-2.5">
      <div className="text-[10px] uppercase font-bold text-stone-500">{label}</div>
      <div className="text-sm font-bold text-stone-900 font-mono">{value}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-stone-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-stone-200">
          <div>
            <h3 className="text-lg font-serif font-bold text-stone-900 flex items-center gap-2">
              {g?.full_name || "..."}
              {g?.is_vip && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-amber-100 text-amber-950 border border-amber-300 rounded">VIP</span>
              )}
              {g?.is_blacklisted && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-stone-900 text-white rounded">Qora ro&apos;yxat</span>
              )}
            </h3>
            <div className="text-xs text-stone-500 font-mono">
              {[g?.phone, g?.email, g?.nationality].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <button onClick={onClose} title="Yopish" aria-label="Yopish" className="p-1 rounded hover:bg-stone-100 text-stone-500">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {isLoading || !g ? (
          <div className="p-10 text-center text-stone-400 text-xs">Yuklanmoqda...</div>
        ) : (
          <div className="p-5 space-y-5 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {stat("Tashriflar", g.stays ?? 0)}
              {stat("Bronlar", g.bookings_count ?? 0)}
              {stat("Bekor / kelmagan", g.cancellations ?? 0)}
              {stat("To'lagan", money(g.total_paid))}
              {stat(
                "O'rtacha baho",
                g.avg_rating ? (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <IconStarFilled className="w-3.5 h-3.5" /> {g.avg_rating.toFixed(1)}
                  </span>
                ) : (
                  "—"
                )
              )}
            </div>

            {g.is_blacklisted && (
              <div className="p-3 rounded bg-stone-900 text-white">
                <div className="font-bold flex items-center gap-1.5">
                  <IconBan className="w-4 h-4" /> Qora ro&apos;yxatda
                  {g.blacklisted_at && <span className="font-normal text-stone-400">({new Date(g.blacklisted_at).toLocaleDateString("ru-RU")})</span>}
                </div>
                {g.blacklist_reason && <div className="mt-1 text-stone-300">Sabab: {g.blacklist_reason}</div>}
                <div className="mt-1 text-stone-400">Telegram bot orqali bron qila olmaydi.</div>
              </div>
            )}

            {error && <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800">{error}</div>}

            {canManage && (
              <div>
                {g.is_blacklisted ? (
                  <button
                    onClick={() => blacklist.mutate(false)}
                    disabled={blacklist.isPending}
                    className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded font-semibold disabled:opacity-50"
                  >
                    Qora ro&apos;yxatdan chiqarish
                  </button>
                ) : askReason ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      autoFocus
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={500}
                      placeholder="Sabab (masalan: to'lamay ketgan, xonani buzgan)"
                      className="flex-1 px-3 py-1.5 border border-stone-300 rounded focus:border-stone-900 outline-none"
                    />
                    <button
                      onClick={() => blacklist.mutate(true)}
                      disabled={blacklist.isPending}
                      className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded font-semibold disabled:opacity-50"
                    >
                      Qo&apos;shish
                    </button>
                    <button onClick={() => setAskReason(false)} className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 rounded font-semibold">
                      Bekor
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAskReason(true)}
                    className="px-3 py-1.5 inline-flex items-center gap-1 bg-white hover:bg-rose-50 text-rose-800 border border-rose-300 rounded font-semibold"
                  >
                    <IconBan className="w-3.5 h-3.5" /> Qora ro&apos;yxatga qo&apos;shish
                  </button>
                )}
              </div>
            )}

            <div>
              <h4 className="font-bold text-stone-900 mb-2">Bronlar tarixi</h4>
              {data.bookings.length === 0 ? (
                <p className="text-stone-400">Bron yo&apos;q</p>
              ) : (
                <div className="border border-stone-200 rounded divide-y divide-stone-200">
                  {data.bookings.map((b) => (
                    <div key={b.id} className="p-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div>
                        <div className="font-mono font-bold text-stone-900">
                          {b.source === "telegram" && <IconBrandTelegram className="w-3.5 h-3.5 inline -mt-0.5 mr-1 text-sky-600" />}
                          {b.reference}
                          <span className="ml-2 font-sans font-normal text-stone-600">
                            {b.room_number}-xona · {b.room_type}
                          </span>
                        </div>
                        <div className="text-stone-500 font-mono">
                          {b.check_in} — {b.check_out}
                        </div>
                        {b.review_rating ? (
                          <div className="mt-1 text-amber-700">
                            <span className="inline-flex items-center gap-0.5 font-bold">
                              {Array.from({ length: b.review_rating }).map((_, i) => (
                                <IconStarFilled key={i} className="w-3 h-3" />
                              ))}
                            </span>
                            {b.review_comment && <span className="ml-2 text-stone-700 italic">&ldquo;{b.review_comment}&rdquo;</span>}
                          </div>
                        ) : null}
                      </div>
                      <div className="sm:text-right whitespace-nowrap">
                        <div className="font-bold">{BOOKING_STATUS[b.status] || b.status}</div>
                        <div className="font-mono text-stone-600">
                          {money(b.total_amount)} {b.currency}
                        </div>
                        {Number(b.paid_amount) > 0 && <div className="text-emerald-700">To&apos;langan: {money(b.paid_amount)}</div>}
                        {Number(b.refunded_amount) > 0 && <div className="text-rose-700">Qaytarilgan: {money(b.refunded_amount)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
