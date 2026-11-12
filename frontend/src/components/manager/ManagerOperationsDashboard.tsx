"use client";

// Manager's "Boshqaruv": a short overview only. Rooms, cleaning, new bookings and guest
// requests each live on their own page; the cards here link to them.
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconEye,
  IconPhone,
  IconX,
} from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { apiError } from "@/lib/api/helpers";
import { usePanel } from "@/lib/panel-context";
import type { Hotel, ManagerOperationsData } from "@/types";

interface Props {
  hotelId: string;
  hotel: Partial<Hotel> & { id: number; name: string; currency?: string };
}

type Period = "today" | "last_7_days" | "this_month";

export function ManagerOperationsDashboard({ hotelId, hotel }: Props) {
  const { base } = usePanel();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("today");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const notify = (message: string, type: "success" | "error" = "success") => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const { data: ops, isLoading, isError } = useQuery({
    queryKey: ["manager-operations", hotelId, period],
    queryFn: async () =>
      (
        await apiClient.get<ManagerOperationsData>(`/reports/hotels/${hotelId}/reports/operations/`, {
          params: { filter: period },
        })
      ).data,
  });

  const stayAction = useMutation({
    mutationFn: async ({ id, kind }: { id: number; kind: "check-in" | "check-out" }) =>
      apiClient.post(`/bookings/hotels/${hotelId}/bookings/${id}/${kind}/`),
    onSuccess: (_, v) => {
      notify(v.kind === "check-in" ? "Joylashtirildi." : "Chiqdi. Xona tozalashga o'tdi.");
      ["manager-operations", "rooms", "housekeeping-tasks", "bookings", "booking-calendar", "room-overview"].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k, hotelId] })
      );
    },
    onError: (err) => notify(apiError(err), "error"),
  });

  const kpis = ops?.kpis;
  const arrivals = ops?.arrivals || [];
  const departures = ops?.departures || [];

  // Each card opens the page that owns that data
  const kpi = (label: string, value: React.ReactNode, sub?: React.ReactNode, tone = "text-stone-900", href?: string) => {
    const body = (
      <>
        <div className="text-[10px] uppercase font-bold text-stone-500 tracking-wider flex items-center justify-between">
          {label}
          {href && <IconArrowRight className="w-3 h-3 text-stone-300 group-hover:text-stone-700 transition" />}
        </div>
        <div className={`mt-1.5 text-2xl font-bold font-serif ${tone}`}>{value}</div>
        {sub !== undefined && <div className="text-[10px] text-stone-500">{sub}</div>}
      </>
    );
    const cls = "group block bg-white p-3.5 rounded border border-stone-200 shadow-sm";
    return href ? (
      <Link href={href} className={`${cls} hover:border-stone-400 hover:shadow transition`}>
        {body}
      </Link>
    ) : (
      <div className={cls}>{body}</div>
    );
  };

  return (
    <div className="space-y-6 pb-12 font-sans">
      {feedback && (
        <div
          className={`p-3.5 rounded text-xs font-semibold flex items-center justify-between border shadow-sm ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-900 border-emerald-300"
              : "bg-rose-50 text-rose-900 border-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <IconCircleCheck className="w-4 h-4 text-emerald-700" />
            ) : (
              <IconAlertTriangle className="w-4 h-4 text-rose-700" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} title="Yopish" aria-label="Yopish" className="text-stone-500 hover:text-stone-900">
            <IconX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-stone-200">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900">{hotel.name}</h1>
        <div className="flex items-center bg-white p-1 rounded border border-stone-300 text-xs shadow-sm">
          {(
            [
              ["today", "Bugun"],
              ["last_7_days", "Oxirgi 7 kun"],
              ["this_month", "Shu oy"],
            ] as [Period, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 rounded font-medium transition ${
                period === key ? "bg-stone-900 text-white font-bold" : "text-stone-700 hover:text-stone-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          Ma&apos;lumotlarni yuklab bo&apos;lmadi.
        </div>
      )}

      {/* Alerts from the backend */}
      {(ops?.alerts || []).map((alert, idx) => (
        <div
          key={alert.id || idx}
          className={`p-3.5 rounded border text-xs flex items-start justify-between gap-3 shadow-sm ${
            alert.type === "warning"
              ? "bg-amber-50/70 border-amber-300 text-amber-950"
              : alert.type === "error"
              ? "bg-rose-50 border-rose-300 text-rose-950"
              : "bg-emerald-50 border-emerald-300 text-emerald-950"
          }`}
        >
          <div className="flex items-start gap-2.5">
            <IconAlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-bold">{alert.title}</h4>
              {alert.message && <p className="text-[11px] opacity-90 mt-0.5">{alert.message}</p>}
            </div>
          </div>
          {alert.link && (
            <Link
              href={alert.link}
              title="Ko'rish"
              aria-label="Ko'rish"
              className="shrink-0 p-1.5 rounded text-stone-700 hover:text-stone-900 hover:bg-white/70 transition"
            >
              <IconEye className="w-4 h-4" />
            </Link>
          )}
        </div>
      ))}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpi("Kelishlar", kpis?.today_arrivals ?? "—", kpis && `kutilmoqda: ${kpis.pending_check_ins}`, undefined, `${base}/bookings`)}
        {kpi("Ketishlar", kpis?.today_departures ?? "—", kpis && `kutilmoqda: ${kpis.pending_check_outs}`, undefined, `${base}/bookings`)}
        {kpi("Band", kpis?.occupied_rooms ?? "—", kpis && `/ ${kpis.total_rooms} · ${kpis.occupancy_rate}%`, "text-rose-800", `${base}/rooms`)}
        {kpi("Bo'sh", kpis?.available_rooms ?? "—", undefined, "text-emerald-800", `${base}/rooms`)}
        {kpi("Tozalashda", kpis?.cleaning_rooms ?? "—", kpis && `navbatda: ${kpis.dirty_tasks}`, "text-amber-700", `${base}/housekeeping`)}
        {kpi("Ta'mirda", kpis?.maintenance_rooms ?? "—", undefined, "text-stone-600", `${base}/rooms`)}
        {kpi(
          "Kechikkan",
          kpis?.overdue_tasks ?? "—",
          undefined,
          kpis && kpis.overdue_tasks > 0 ? "text-rose-800" : "text-emerald-800",
          `${base}/housekeeping`
        )}
        {kpi("Qoldiq", kpis ? `${Number(kpis.pending_payments_amount).toLocaleString()}` : "—", hotel.currency)}
      </div>

      {/* Arrivals & departures for the chosen period */}
      <div className="bg-white border border-stone-200 rounded-lg shadow-sm p-6 space-y-6">
        {isLoading && <p className="text-xs text-stone-400">Yuklanmoqda...</p>}
        {!isLoading &&
          [
            { title: "Keluvchilar", rows: arrivals, kind: "check-in" as const, done: "checked_in" },
            { title: "Ketuvchilar", rows: departures, kind: "check-out" as const, done: "checked_out" },
          ].map((sec) => (
            <div key={sec.title}>
              <h3 className="font-serif font-bold text-base text-stone-900 mb-3">
                {sec.title} <span className="text-xs font-sans text-stone-500">({sec.rows.length})</span>
              </h3>
              <div className="border border-stone-200 rounded overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-stone-100/70 border-b border-stone-200 text-stone-600 uppercase font-bold text-[10px] tracking-wider">
                      <th className="py-2.5 px-3">Kod</th>
                      <th className="py-2.5 px-3">Mehmon</th>
                      <th className="py-2.5 px-3">Xona</th>
                      <th className="py-2.5 px-3">Muddat</th>
                      <th className="py-2.5 px-3">Summa</th>
                      <th className="py-2.5 px-3 text-right">Amal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {sec.rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-6 text-stone-400">Yo&apos;q</td>
                      </tr>
                    )}
                    {sec.rows.map((b) => (
                      <tr key={b.id} className="hover:bg-stone-50 transition">
                        <td className="py-3 px-3 font-mono font-bold text-stone-900">{b.reference}</td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-stone-900">{b.guest_name}</div>
                          {b.guest_phone && (
                            <div className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                              <IconPhone className="w-3 h-3" /> {b.guest_phone}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-stone-900">{b.room_number}</span>
                          <div className="text-[10px] text-stone-500">{b.room_type}</div>
                        </td>
                        <td className="py-3 px-3 text-[11px] text-stone-600">
                          {b.check_in} &rarr; {b.check_out}
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-stone-900">
                          {Number(b.total_amount).toLocaleString()} {hotel.currency}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {b.status === sec.done ? (
                            <IconCircleCheck className="w-4 h-4 text-emerald-600 inline" aria-label="Bajarildi" />
                          ) : (
                            <button
                              disabled={stayAction.isPending || (sec.kind === "check-out" && b.status !== "checked_in")}
                              onClick={() => stayAction.mutate({ id: b.id, kind: sec.kind })}
                              className="px-3 py-1 inline-flex items-center gap-1 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded text-xs transition shadow-sm disabled:opacity-40"
                            >
                              {sec.kind === "check-in" ? "Check-In" : "Check-Out"} <IconArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
