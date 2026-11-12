"use client";

// Guest ratings collected by the Telegram bot after check-out.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconBrandTelegram, IconStar, IconStarFilled } from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { usePanel } from "@/lib/panel-context";
import { GuestHistoryModal } from "@/components/guests/GuestHistoryModal";

interface Review {
  id: number;
  rating: number;
  comment: string;
  created_at: string;
  reference: string;
  guest: number;
  guest_name: string;
  room_number: string;
  room_type: string;
  check_in: string;
  check_out: string;
}

interface ReviewsResponse {
  count: number;
  average: number | null;
  counts: Record<string, number>;
  results: Review[];
}

const Stars = ({ n, size = "w-3.5 h-3.5" }: { n: number; size?: string }) => (
  <span className="inline-flex items-center text-amber-500">
    {[1, 2, 3, 4, 5].map((i) =>
      i <= n ? <IconStarFilled key={i} className={size} /> : <IconStar key={i} className={`${size} text-stone-300`} />
    )}
  </span>
);

export default function ReviewsPage() {
  const { hotelId } = usePanel();
  const [only, setOnly] = useState<number | null>(null);
  const [openGuest, setOpenGuest] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["reviews", hotelId],
    queryFn: async () => (await apiClient.get<ReviewsResponse>(`/bookings/hotels/${hotelId}/reviews/`)).data,
  });

  const reviews = (data?.results || []).filter((r) => only === null || r.rating === only);
  const max = Math.max(1, ...Object.values(data?.counts || {}));

  return (
    <div className="space-y-6 font-sans">
      <div className="pb-4 border-b border-stone-200">
        <h1 className="text-2xl font-serif font-bold text-stone-900">Sharhlar</h1>
        <p className="text-xs text-stone-500 mt-1 flex items-center gap-1">
          <IconBrandTelegram className="w-3.5 h-3.5 text-sky-600" /> Mijozlar check-out&apos;dan keyin Telegram botda baho beradi.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-stone-200 rounded p-5 shadow-sm flex flex-col items-center justify-center">
          <div className="text-4xl font-serif font-bold text-stone-900">{data?.average ? data.average.toFixed(1) : "—"}</div>
          <Stars n={Math.round(data?.average || 0)} size="w-5 h-5" />
          <div className="text-xs text-stone-500 mt-1">{data?.count || 0} ta baho</div>
        </div>
        <div className="md:col-span-2 bg-white border border-stone-200 rounded p-5 shadow-sm space-y-1.5">
          {[5, 4, 3, 2, 1].map((n) => {
            const c = data?.counts?.[n] || 0;
            return (
              <button
                key={n}
                onClick={() => setOnly(only === n ? null : n)}
                className={`w-full flex items-center gap-3 text-xs rounded px-1 py-0.5 transition ${only === n ? "bg-amber-50" : "hover:bg-stone-50"}`}
                title={`Faqat ${n} yulduzli sharhlar`}
              >
                <span className="w-8 font-bold text-stone-700 flex items-center gap-0.5">
                  {n} <IconStarFilled className="w-3 h-3 text-amber-500" />
                </span>
                <span className="flex-1 h-2.5 bg-stone-100 rounded overflow-hidden">
                  <span
                    className={`block h-full rounded ${n >= 4 ? "bg-emerald-500" : n === 3 ? "bg-amber-400" : "bg-rose-500"}`}
                    style={{ width: `${(c / max) * 100}%` }}
                  />
                </span>
                <span className="w-8 text-right font-mono text-stone-600">{c}</span>
              </button>
            );
          })}
        </div>
      </div>

      {only !== null && (
        <div className="text-xs text-stone-600">
          Faqat {only} yulduzli sharhlar ko&apos;rsatilmoqda.{" "}
          <button onClick={() => setOnly(null)} className="font-semibold underline">
            Barchasini ko&apos;rsatish
          </button>
        </div>
      )}

      <div className="space-y-3">
        {isLoading && <div className="text-center text-stone-400 text-xs py-8">Yuklanmoqda...</div>}
        {!isLoading && reviews.length === 0 && (
          <div className="bg-white border border-stone-200 rounded p-10 text-center text-stone-400 text-xs">Hozircha sharh yo&apos;q</div>
        )}
        {reviews.map((r) => (
          <div
            key={r.id}
            className={`bg-white border rounded p-4 shadow-sm text-xs ${r.rating <= 2 ? "border-rose-300" : "border-stone-200"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Stars n={r.rating} />
                <button onClick={() => setOpenGuest(r.guest)} className="font-bold text-stone-900 hover:underline">
                  {r.guest_name}
                </button>
              </div>
              <span className="text-stone-400 font-mono">{new Date(r.created_at).toLocaleDateString("ru-RU")}</span>
            </div>
            {r.comment ? (
              <p className="mt-2 text-stone-800 whitespace-pre-line">{r.comment}</p>
            ) : (
              <p className="mt-2 text-stone-400 italic">Izoh qoldirilmagan</p>
            )}
            <div className="mt-2 text-[11px] text-stone-500 font-mono">
              {r.reference} · {r.room_number}-xona ({r.room_type}) · {r.check_in} — {r.check_out}
            </div>
          </div>
        ))}
      </div>

      {openGuest !== null && <GuestHistoryModal guestId={openGuest} onClose={() => setOpenGuest(null)} />}
    </div>
  );
}
