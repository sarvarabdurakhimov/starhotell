"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconBed,
  IconBrush,
  IconCalendarEvent,
  IconCheck,
  IconChecks,
  IconCircleCheck,
  IconClock,
  IconCrown,
  IconDoorEnter,
  IconDoorExit,
  IconHistory,
  IconMessage,
  IconPhone,
  IconPlayerPlay,
  IconSparkles,
  IconTool,
  IconUser,
  IconUsers,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { apiError, money, ROOM_STATUS, TASK_STATUS } from "@/lib/api/helpers";
import { usePanel } from "@/lib/panel-context";
import type { Room, RoomStatus } from "@/types";

interface Stay {
  id: number;
  reference: string;
  status: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  guest_nationality: string;
  is_vip: boolean;
  check_in: string;
  check_out: string;
  nights: number;
  num_adults: number;
  num_children: number;
  total_amount: number;
  currency: string;
  special_requests: string;
  actual_check_in: string | null;
  actual_check_out: string | null;
  paid_amount?: number;
  balance_due?: number;
}

interface Task {
  id: number;
  status: "dirty" | "in_progress" | "clean" | "inspected";
  notes: string;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface RoomOverview {
  room: Room;
  today: string;
  current_stay: Stay | null;
  departs_today: boolean;
  next_arrival: Stay | null;
  arrives_today: boolean;
  upcoming: Stay[];
  history: Stay[];
  housekeeping: { active_task: Task | null; last_cleaned: Task | null };
  stats: { nights_30d: number; occupancy_30d: number; revenue_30d: number; total_stays: number };
}

// Big status banner: what the room is doing right now
const STATE: Record<string, { tone: string; icon: typeof IconBed; text: string }> = {
  occupied: { tone: "bg-rose-50 border-rose-300 text-rose-950", icon: IconUser, text: "Xonada mehmon yashayapti" },
  available: { tone: "bg-emerald-50 border-emerald-300 text-emerald-950", icon: IconCircleCheck, text: "Xona bo'sh va tayyor" },
  cleaning: { tone: "bg-amber-50 border-amber-300 text-amber-950", icon: IconSparkles, text: "Xona tozalanmoqda" },
  maintenance: { tone: "bg-stone-200 border-stone-400 text-stone-900", icon: IconTool, text: "Xona ta'mirda" },
  out_of_order: { tone: "bg-stone-200 border-stone-400 text-stone-900", icon: IconAlertTriangle, text: "Xona ishlamaydi" },
};

const NEXT_TASK_STEP: Record<string, [Task["status"], string, typeof IconCheck]> = {
  dirty: ["in_progress", "Tozalashni boshlash", IconPlayerPlay],
  in_progress: ["clean", "Tozalab bo'lindi", IconCheck],
  clean: ["inspected", "Tekshirib qabul qilish", IconChecks],
};

const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

const daysFrom = (today: string, date: string) =>
  Math.round((new Date(date).getTime() - new Date(today).getTime()) / 86_400_000);

function whenLabel(today: string, date: string, past: string, future: string) {
  const d = daysFrom(today, date);
  if (d === 0) return "bugun";
  if (d === 1) return "ertaga";
  if (d === -1) return "kecha";
  return d > 0 ? `${d} kundan keyin${future}` : `${-d} kun oldin${past}`;
}

export function RoomDetailPage() {
  const { hotelId, base, role } = usePanel();
  const { roomId } = useParams<{ roomId: string }>();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const key = ["room-overview", hotelId, roomId];
  const { data, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await apiClient.get<RoomOverview>(`/rooms/hotels/${hotelId}/rooms/${roomId}/overview/`)).data,
  });

  const notify = (message: string, type: "success" | "error" = "success") => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };
  const refresh = () => {
    ["room-overview", "rooms", "bookings", "housekeeping-tasks", "manager-operations"].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k, hotelId] })
    );
  };
  const onError = (err: unknown) => notify(apiError(err), "error");

  const stayAction = useMutation({
    mutationFn: async ({ id, kind }: { id: number; kind: "check-in" | "check-out" }) =>
      apiClient.post(`/bookings/hotels/${hotelId}/bookings/${id}/${kind}/`),
    onSuccess: (_, v) => {
      notify(v.kind === "check-in" ? "Mehmon joylashtirildi." : "Mehmon chiqdi. Xona tozalashga o'tdi.");
      refresh();
    },
    onError,
  });

  const roomStatus = useMutation({
    mutationFn: async (status: RoomStatus) =>
      apiClient.patch(`/rooms/hotels/${hotelId}/rooms/${roomId}/`, { status }),
    onSuccess: () => {
      notify("Xona holati yangilandi.");
      refresh();
    },
    onError,
  });

  const taskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: Task["status"] }) =>
      apiClient.patch(`/housekeeping/hotels/${hotelId}/housekeeping/${id}/`, { status }),
    onSuccess: () => {
      notify("Tozalash holati yangilandi.");
      refresh();
    },
    onError,
  });

  const busy = stayAction.isPending || roomStatus.isPending || taskStatus.isPending;

  const backLink = (
    <Link
      href={`${base}/rooms`}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900"
    >
      <IconArrowLeft className="w-4 h-4" /> Xonalar
    </Link>
  );

  if (isLoading) return <div className="space-y-4">{backLink}<p className="text-xs text-stone-400">Yuklanmoqda...</p></div>;
  if (isError || !data)
    return (
      <div className="space-y-4">
        {backLink}
        <div className="p-4 rounded bg-rose-50 border border-rose-200 text-rose-800 text-sm">Xona topilmadi.</div>
      </div>
    );

  const { room, current_stay: cur, next_arrival: next, housekeeping, stats, today } = data;
  const state = STATE[room.status] || STATE.maintenance;
  const StateIcon = state.icon;
  const task = housekeeping.active_task;
  const step = task ? NEXT_TASK_STEP[task.status] : undefined;
  const canCheckIn = !!next && !cur && daysFrom(today, next.check_in) <= 0 && room.status === "available";
  const currency = cur?.currency || next?.currency || "USD";
  const laterArrivals = data.upcoming.filter((b) => b.id !== next?.id);

  const card = "bg-white border border-stone-200 rounded-lg shadow-sm p-5";
  const cardTitle = "font-serif font-bold text-sm text-stone-900 flex items-center gap-2 mb-4";
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 py-1.5 text-xs">
      <span className="text-stone-500">{label}</span>
      <span className="font-semibold text-stone-900 text-right">{value}</span>
    </div>
  );

  return (
    <div className="space-y-6 pb-12 font-sans">
      {backLink}

      {feedback && (
        <div
          className={`p-3 rounded text-xs font-semibold flex items-center justify-between border ${feedback.type === "success" ? "bg-emerald-50 text-emerald-900 border-emerald-300" : "bg-rose-50 text-rose-900 border-rose-300"
            }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} title="Yopish" aria-label="Yopish">
            <IconX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-stone-200">
        <div>
          <div className="text-[11px] font-mono uppercase text-stone-500">
            {room.floor}-qavat · {room.room_type_detail?.name || "—"}
          </div>
          <h1 className="text-3xl font-serif font-extrabold text-stone-900">Xona {room.room_number}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(room.room_type_detail?.amenities || []).map((a) => (
              <span key={a} className="px-2 py-0.5 rounded bg-stone-100 border border-stone-200 text-[10px] text-stone-700">
                {a}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-6 text-xs">
          <div>
            <div className="text-stone-500">Narx / tun</div>
            <div className="font-mono font-bold text-lg text-stone-900">
              {room.room_type_detail ? money(room.room_type_detail.base_price, currency) : "—"}
            </div>
          </div>
          <div>
            <div className="text-stone-500">Sig&apos;im</div>
            <div className="font-bold text-lg text-stone-900 flex items-center gap-1">
              <IconUsers className="w-4 h-4 text-stone-500" /> {room.room_type_detail?.max_occupancy ?? "—"}
            </div>
          </div>
        </div>
      </div>

      {/* State banner + today's events */}
      <div className="space-y-2">
        <div className={`p-4 rounded-lg border flex items-center gap-3 ${state.tone}`}>
          <StateIcon className="w-6 h-6 shrink-0" />
          <div>
            <div className="font-bold text-sm">{state.text}</div>
            <div className="text-[11px] opacity-80">Holat: {ROOM_STATUS[room.status] || room.status}</div>
          </div>
        </div>
        {data.departs_today && cur && (
          <div className="p-3 rounded border bg-amber-50 border-amber-300 text-amber-950 text-xs flex items-center gap-2">
            <IconDoorExit className="w-4 h-4 shrink-0" />
            <span>
              <b>{cur.guest_name}</b> bugun ketishi kerak.
            </span>
          </div>
        )}
        {data.arrives_today && next && (
          <div className="p-3 rounded border bg-emerald-50 border-emerald-300 text-emerald-950 text-xs flex items-center gap-2">
            <IconDoorEnter className="w-4 h-4 shrink-0" />
            <span>
              <b>{next.guest_name}</b> bugun keladi
              {cur ? " — xona avval bo'shatilib, tozalanishi kerak." : "."}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Current guest */}
        <div className={card}>
          <h2 className={cardTitle}>
            <IconUser className="w-4 h-4 text-rose-700" /> Hozir yashayapti
          </h2>
          {!cur ? (
            <p className="text-xs text-stone-400">Xonada hech kim yo&apos;q.</p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-base text-stone-900">{cur.guest_name}</span>
                {cur.is_vip && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                    <IconCrown className="w-3 h-3" /> VIP
                  </span>
                )}
              </div>
              {cur.guest_phone &&
                row(
                  "Telefon",
                  <a href={`tel:${cur.guest_phone}`} className="inline-flex items-center gap-1 hover:underline">
                    <IconPhone className="w-3 h-3" /> {cur.guest_phone}
                  </a>
                )}
              {cur.guest_nationality &&
                row("Davlat", <span className="inline-flex items-center gap-1"><IconWorld className="w-3 h-3" /> {cur.guest_nationality}</span>)}
              {row("Keldi", dt(cur.actual_check_in))}
              {row(
                "Ketadi",
                <span className={data.departs_today ? "text-amber-800" : ""}>
                  {cur.check_out} ({whenLabel(today, cur.check_out, "", "")})
                </span>
              )}
              {row("Kishilar", `${cur.num_adults} katta${cur.num_children ? `, ${cur.num_children} bola` : ""}`)}
              <div className="my-2 border-t border-stone-100" />
              {row("Jami", money(cur.total_amount, cur.currency))}
              {row("To'langan", <span className="text-emerald-800">{money(cur.paid_amount, cur.currency)}</span>)}
              {row(
                "Qoldiq",
                <span className={Number(cur.balance_due) > 0 ? "text-rose-700" : "text-emerald-800"}>
                  {money(cur.balance_due, cur.currency)}
                </span>
              )}
              {cur.special_requests && (
                <div className="mt-3 p-2.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-950 flex gap-1.5">
                  <IconMessage className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {cur.special_requests}
                </div>
              )}
              <button
                disabled={busy}
                onClick={() => stayAction.mutate({ id: cur.id, kind: "check-out" })}
                className="mt-4 w-full py-2 inline-flex items-center justify-center gap-1.5 text-xs font-bold bg-stone-900 hover:bg-stone-800 text-white rounded transition disabled:opacity-50"
              >
                <IconDoorExit className="w-4 h-4" /> Check-out
              </button>
            </>
          )}
        </div>

        {/* Next guest */}
        <div className={card}>
          <h2 className={cardTitle}>
            <IconCalendarEvent className="w-4 h-4 text-emerald-700" /> Keyingi mehmon
          </h2>
          {!next ? (
            <p className="text-xs text-stone-400">Kelishi kutilayotgan mehmon yo&apos;q.</p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-base text-stone-900">{next.guest_name}</span>
                {next.is_vip && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                    <IconCrown className="w-3 h-3" /> VIP
                  </span>
                )}
              </div>
              {row(
                "Keladi",
                <span className={data.arrives_today ? "text-emerald-800" : ""}>
                  {next.check_in} ({whenLabel(today, next.check_in, "", "")})
                </span>
              )}
              {row("Ketadi", next.check_out)}
              {row("Tunlar", next.nights)}
              {row("Kishilar", `${next.num_adults} katta${next.num_children ? `, ${next.num_children} bola` : ""}`)}
              {next.guest_phone &&
                row(
                  "Telefon",
                  <a href={`tel:${next.guest_phone}`} className="inline-flex items-center gap-1 hover:underline">
                    <IconPhone className="w-3 h-3" /> {next.guest_phone}
                  </a>
                )}
              {row("Summa", money(next.total_amount, next.currency))}
              {row("Bron", <span className="font-mono">{next.reference}</span>)}
              {next.special_requests && (
                <div className="mt-3 p-2.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-950 flex gap-1.5">
                  <IconMessage className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {next.special_requests}
                </div>
              )}
              {canCheckIn && (
                <button
                  disabled={busy}
                  onClick={() => stayAction.mutate({ id: next.id, kind: "check-in" })}
                  className="mt-4 w-full py-2 inline-flex items-center justify-center gap-1.5 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded transition disabled:opacity-50"
                >
                  <IconDoorEnter className="w-4 h-4" /> Check-in
                </button>
              )}
            </>
          )}

          {laterArrivals.length > 0 && (
            <div className="mt-4 pt-3 border-t border-stone-100">
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2">Keyingi bronlar</div>
              <ul className="space-y-1.5">
                {laterArrivals.map((b) => (
                  <li key={b.id} className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-stone-900">{b.guest_name}</span>
                    <span className="font-mono text-[11px] text-stone-600 inline-flex items-center gap-1">
                      {b.check_in} <IconArrowRight className="w-3 h-3" /> {b.check_out}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Housekeeping */}
        <div className={card}>
          <h2 className={cardTitle}>
            <IconBrush className="w-4 h-4 text-amber-700" /> Tozalash
          </h2>
          {task ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold border ${task.status === "dirty"
                      ? "bg-rose-50 text-rose-900 border-rose-300"
                      : task.status === "in_progress"
                        ? "bg-amber-50 text-amber-900 border-amber-300"
                        : "bg-emerald-50 text-emerald-900 border-emerald-300"
                    }`}
                >
                  {task.status === "dirty"
                    ? "Tozalanishi kutilmoqda"
                    : task.status === "in_progress"
                      ? "Hozir tozalanmoqda"
                      : "Tozalab bo'lindi, tekshirish kerak"}
                </span>
              </div>
              {row("Xodim", task.assigned_to_name || "Biriktirilmagan")}
              {row("Topshiriq berildi", dt(task.created_at))}
              {row("Holat", TASK_STATUS[task.status] || task.status)}
              {task.notes && <p className="mt-2 text-[11px] text-stone-600">{task.notes}</p>}
              {step && (() => {
                const StepIcon = step[2];
                return (
                  <button
                    disabled={busy}
                    onClick={() => taskStatus.mutate({ id: task.id, status: step[0] })}
                    className="mt-4 w-full py-2 inline-flex items-center justify-center gap-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded transition disabled:opacity-50"
                  >
                    <StepIcon className="w-4 h-4" /> {step[1]}
                  </button>
                );
              })()}
            </>
          ) : (
            <p className="text-xs text-stone-500 flex items-center gap-1.5">
              <IconCircleCheck className="w-4 h-4 text-emerald-600" /> Ochiq tozalash topshirig&apos;i yo&apos;q.
            </p>
          )}
          <div className="mt-3 pt-3 border-t border-stone-100">
            {row(
              "Oxirgi tozalangan",
              housekeeping.last_cleaned ? dt(housekeeping.last_cleaned.completed_at || housekeeping.last_cleaned.updated_at) : "—"
            )}
          </div>

          {!cur && role !== "staff" && (
            <div className="mt-4 pt-3 border-t border-stone-100">
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2">Xona holatini o&apos;zgartirish</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["available", "Tayyor", IconCheck],
                    ["cleaning", "Tozalash", IconSparkles],
                    ["maintenance", "Ta'mir", IconTool],
                  ] as [RoomStatus, string, typeof IconCheck][]
                ).map(([s, label, Icon]) => (
                  <button
                    key={s}
                    title={label}
                    disabled={busy || room.status === s}
                    onClick={() => roomStatus.mutate(s)}
                    className="py-1.5 inline-flex flex-col items-center gap-0.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-[10px] font-semibold text-stone-800 disabled:opacity-30 transition"
                  >
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 30-day stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ["Bandlik (30 kun)", `${stats.occupancy_30d}%`],
          ["Sotilgan tunlar (30 kun)", stats.nights_30d],
          ["Tushum (30 kun)", money(stats.revenue_30d, currency)],
          ["Jami yashaganlar", stats.total_stays],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-white p-4 rounded border border-stone-200 shadow-sm">
            <div className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">{label}</div>
            <div className="mt-1.5 text-xl font-bold font-serif text-stone-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Past guests */}
      <div className={card}>
        <h2 className={cardTitle}>
          <IconHistory className="w-4 h-4 text-stone-600" /> Oxirgi mehmonlar
        </h2>
        {data.history.length === 0 ? (
          <p className="text-xs text-stone-400">Hali hech kim yashamagan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500 uppercase text-[10px] tracking-wider">
                  <th className="py-2 pr-3">Mehmon</th>
                  <th className="py-2 pr-3">Muddat</th>
                  <th className="py-2 pr-3">Tunlar</th>
                  <th className="py-2 pr-3">Chiqdi</th>
                  <th className="py-2 text-right">Summa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.history.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2.5 pr-3 font-semibold text-stone-900">
                      {b.guest_name}
                      {b.guest_nationality && <span className="ml-1.5 text-[10px] text-stone-500">{b.guest_nationality}</span>}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[11px] text-stone-600">
                      <span className="inline-flex items-center gap-1">
                        {b.check_in} <IconArrowRight className="w-3 h-3" /> {b.check_out}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">{b.nights}</td>
                    <td className="py-2.5 pr-3 text-stone-600 inline-flex items-center gap-1">
                      <IconClock className="w-3 h-3" /> {dt(b.actual_check_out)}
                    </td>
                    <td className="py-2.5 text-right font-mono font-semibold">{money(b.total_amount, b.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
