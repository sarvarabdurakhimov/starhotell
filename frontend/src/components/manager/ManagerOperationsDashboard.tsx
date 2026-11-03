"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconBed,
  IconCalendarCheck,
  IconCheck,
  IconCircleCheck,
  IconClock,
  IconInfoCircle,
  IconPhone,
  IconPlus,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { apiError, asList, ROOM_STATUS, TASK_STATUS } from "@/lib/api/helpers";
import { usePanel } from "@/lib/panel-context";
import type {
  Guest,
  Hotel,
  HotelMembershipItem,
  ManagerOperationsData,
  PaginatedResponse,
  Room,
  RoomStatus,
} from "@/types";

interface Props {
  hotelId: string;
  hotel: Partial<Hotel> & { id: number; name: string; currency?: string };
}

interface Task {
  id: number;
  room: number;
  room_number: string;
  assigned_to: number | null;
  status: "dirty" | "in_progress" | "clean" | "inspected";
  notes: string;
  created_at: string;
}

type Tab = "arrivals" | "rooms" | "tasks" | "requests";
type Period = "today" | "last_7_days" | "this_month";

const today = () => new Date().toISOString().split("T")[0];
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
};
const emptyBooking = () => ({
  guest_id: "",
  first_name: "",
  last_name: "",
  phone: "",
  room_id: "",
  check_in: today(),
  check_out: plusDays(1),
  special_requests: "",
});

const ROOM_CARD: Record<string, string> = {
  available: "bg-emerald-50/50 border-emerald-300",
  occupied: "bg-rose-50/40 border-rose-300",
  cleaning: "bg-amber-50/60 border-amber-300",
};

export function ManagerOperationsDashboard({ hotelId, hotel }: Props) {
  const { base } = usePanel();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("today");
  const [tab, setTab] = useState<Tab>("arrivals");
  const [roomFilter, setRoomFilter] = useState<"all" | RoomStatus>("all");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ room: "", notes: "", assigned_to: "" });
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingForm, setBookingForm] = useState(emptyBooking);

  const notify = (message: string, type: "success" | "error" = "success") => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };
  const onError = (err: unknown) => notify(apiError(err), "error");

  // ---- Data (all from the backend) ----
  const { data: ops, isLoading, isError } = useQuery({
    queryKey: ["manager-operations", hotelId, period],
    queryFn: async () =>
      (
        await apiClient.get<ManagerOperationsData>(`/reports/hotels/${hotelId}/reports/operations/`, {
          params: { filter: period },
        })
      ).data,
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms", hotelId],
    queryFn: async () =>
      asList((await apiClient.get<PaginatedResponse<Room>>(`/rooms/hotels/${hotelId}/rooms/`)).data),
  });

  const { data: tasksData } = useQuery({
    queryKey: ["housekeeping-tasks", hotelId],
    queryFn: async () =>
      (await apiClient.get<PaginatedResponse<Task>>(`/housekeeping/hotels/${hotelId}/housekeeping/`)).data,
  });
  const tasks = (tasksData?.results || []).filter((t) => t.status !== "inspected");

  const { data: guests = [] } = useQuery({
    queryKey: ["guests", hotelId],
    queryFn: async () =>
      asList((await apiClient.get<PaginatedResponse<Guest>>(`/guests/hotels/${hotelId}/guests/`)).data),
  });

  const { data: members = [] } = useQuery<HotelMembershipItem[]>({
    queryKey: ["hotel-members", hotelId],
    queryFn: async () => {
      try {
        return asList(
          (await apiClient.get<PaginatedResponse<HotelMembershipItem>>(`/memberships/hotels/${hotelId}/members/`)).data
        );
      } catch {
        return [];
      }
    },
  });
  const memberName = (userId: number | null) =>
    members.find((m) => m.user.id === userId)?.user.full_name || "—";

  const refreshAll = () => {
    ["manager-operations", "rooms", "housekeeping-tasks", "bookings", "guests"].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k, hotelId] })
    );
  };

  // ---- Actions ----
  const stayAction = useMutation({
    mutationFn: async ({ id, kind }: { id: number; kind: "check-in" | "check-out" }) =>
      apiClient.post(`/bookings/hotels/${hotelId}/bookings/${id}/${kind}/`),
    onSuccess: (_, v) => {
      notify(v.kind === "check-in" ? "Joylashtirildi." : "Chiqdi. Xona tozalashga o'tdi.");
      refreshAll();
    },
    onError,
  });

  const roomStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: RoomStatus }) =>
      apiClient.patch(`/rooms/hotels/${hotelId}/rooms/${id}/`, { status }),
    onSuccess: () => refreshAll(),
    onError,
  });

  const taskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: Task["status"] }) =>
      apiClient.patch(`/housekeeping/hotels/${hotelId}/housekeeping/${id}/`, { status }),
    onSuccess: () => refreshAll(),
    onError,
  });

  const createTask = useMutation({
    mutationFn: async () =>
      apiClient.post(`/housekeeping/hotels/${hotelId}/housekeeping/`, {
        room: Number(taskForm.room),
        notes: taskForm.notes,
        status: "dirty",
        assigned_to: taskForm.assigned_to ? Number(taskForm.assigned_to) : null,
      }),
    onSuccess: () => {
      setShowTaskModal(false);
      setTaskForm({ room: "", notes: "", assigned_to: "" });
      notify("Topshiriq qo'shildi.");
      refreshAll();
    },
    onError,
  });

  const createBooking = useMutation({
    mutationFn: async () => {
      const f = bookingForm;
      let guestId = Number(f.guest_id);
      if (!guestId) {
        const g = await apiClient.post<Guest>(`/guests/hotels/${hotelId}/guests/`, {
          first_name: f.first_name.trim(),
          last_name: f.last_name.trim(),
          phone: f.phone.trim(),
        });
        guestId = g.data.id;
      }
      return apiClient.post(`/bookings/hotels/${hotelId}/bookings/`, {
        guest_id: guestId,
        room_id: Number(f.room_id),
        check_in: f.check_in,
        check_out: f.check_out,
        special_requests: f.special_requests,
      });
    },
    onSuccess: () => {
      setShowBookingModal(false);
      setBookingForm(emptyBooking());
      notify("Bron yaratildi.");
      refreshAll();
    },
    onError,
  });

  const kpis = ops?.kpis;
  const arrivals = ops?.arrivals || [];
  const departures = ops?.departures || [];
  const requests = ops?.guest_requests || [];
  const staff = ops?.staff_on_duty || [];
  const filteredRooms = roomFilter === "all" ? rooms : rooms.filter((r) => r.status === roomFilter);
  const busy = stayAction.isPending || roomStatus.isPending || taskStatus.isPending;

  const kpi = (label: string, value: React.ReactNode, sub?: React.ReactNode, tone = "text-stone-900") => (
    <div className="bg-white p-3.5 rounded border border-stone-200 shadow-sm">
      <div className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">{label}</div>
      <div className={`mt-1.5 text-2xl font-bold font-serif ${tone}`}>{value}</div>
      {sub !== undefined && <div className="text-[10px] text-stone-500">{sub}</div>}
    </div>
  );

  const tabBtn = (key: Tab, label: string, Icon: typeof IconBed) => (
    <button
      onClick={() => setTab(key)}
      className={`px-5 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
        tab === key ? "border-stone-900 text-stone-900 bg-white" : "border-transparent text-stone-600 hover:text-stone-900"
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  const field = "w-full px-3 py-2 border border-stone-300 rounded text-stone-900 bg-white";

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
          <button onClick={() => setFeedback(null)} className="text-stone-500 hover:text-stone-900">
            <IconX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-stone-200">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900">{hotel.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
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
          <button
            onClick={() => setShowTaskModal(true)}
            className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-900 border border-stone-300 rounded text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <IconSparkles className="w-3.5 h-3.5 text-amber-700" /> Tozalash
          </button>
          <button
            onClick={() => setShowBookingModal(true)}
            className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
          >
            <IconPlus className="w-3.5 h-3.5 text-amber-400" /> Yangi bron
          </button>
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
            <Link href={alert.link} className="shrink-0 text-[11px] font-bold text-stone-900 hover:underline">
              Ko&apos;rish &rarr;
            </Link>
          )}
        </div>
      ))}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpi("Kelishlar", kpis?.today_arrivals ?? "—", kpis && `kutilmoqda: ${kpis.pending_check_ins}`)}
        {kpi("Ketishlar", kpis?.today_departures ?? "—", kpis && `kutilmoqda: ${kpis.pending_check_outs}`)}
        {kpi("Band", kpis?.occupied_rooms ?? "—", kpis && `/ ${kpis.total_rooms} · ${kpis.occupancy_rate}%`, "text-rose-800")}
        {kpi("Bo'sh", kpis?.available_rooms ?? "—", undefined, "text-emerald-800")}
        {kpi("Tozalashda", kpis?.cleaning_rooms ?? "—", kpis && `navbatda: ${kpis.dirty_tasks}`, "text-amber-700")}
        {kpi("Ta'mirda", kpis?.maintenance_rooms ?? "—", undefined, "text-stone-600")}
        {kpi("Kechikkan", kpis?.overdue_tasks ?? "—", undefined, kpis && kpis.overdue_tasks > 0 ? "text-rose-800" : "text-emerald-800")}
        {kpi("Qoldiq", kpis ? `${Number(kpis.pending_payments_amount).toLocaleString()}` : "—", hotel.currency)}
      </div>

      {/* Tabs */}
      <div className="bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden">
        <div className="flex border-b border-stone-200 overflow-x-auto bg-stone-50/70">
          {tabBtn("arrivals", `Kelish / Ketish (${arrivals.length + departures.length})`, IconCalendarCheck)}
          {tabBtn("rooms", `Xonalar (${rooms.length})`, IconBed)}
          {tabBtn("tasks", `Tozalash (${tasks.length})`, IconSparkles)}
          {tabBtn("requests", `So'rovlar (${requests.length})`, IconInfoCircle)}
        </div>

        {isLoading && <p className="p-6 text-xs text-stone-400">Yuklanmoqda...</p>}

        {/* Arrivals & departures */}
        {tab === "arrivals" && !isLoading && (
          <div className="p-6 space-y-6">
            {[
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
                              <span className="text-xs text-stone-400 font-semibold">✓</span>
                            ) : (
                              <button
                                disabled={busy || (sec.kind === "check-out" && b.status !== "checked_in")}
                                onClick={() => stayAction.mutate({ id: b.id, kind: sec.kind })}
                                className="px-3 py-1 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded text-xs transition shadow-sm disabled:opacity-40"
                              >
                                {sec.kind === "check-in" ? "Check-In" : "Check-Out"} &rarr;
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
        )}

        {/* Rooms */}
        {tab === "rooms" && (
          <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(["all", "available", "occupied", "cleaning", "maintenance"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setRoomFilter(s)}
                  className={`px-2.5 py-1 rounded border transition ${
                    roomFilter === s ? "bg-stone-900 text-white font-bold" : "bg-white text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  {s === "all" ? `Barchasi (${rooms.length})` : ROOM_STATUS[s]}
                </button>
              ))}
            </div>

            {rooms.length === 0 ? (
              <p className="text-sm text-stone-500">
                Xona yo&apos;q.{" "}
                <Link href={`${base}/rooms`} className="font-semibold text-amber-800 hover:underline">
                  Xona qo&apos;shish &rarr;
                </Link>
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredRooms.map((room) => (
                  <div
                    key={room.id}
                    className={`p-4 rounded-lg border shadow-sm ${ROOM_CARD[room.status] || "bg-stone-100 border-stone-300"}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-serif font-bold text-xl text-stone-900 flex items-center gap-1.5">
                        <IconBed className="w-5 h-5 text-stone-700" /> {room.room_number}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/70 text-stone-800">
                        {ROOM_STATUS[room.status] || room.status}
                      </span>
                    </div>
                    <div className="text-xs text-stone-600">
                      {room.room_type_detail?.name || "—"} • {room.floor}-qavat
                    </div>
                    {room.status !== "occupied" && (
                      <div className="mt-4 pt-3 border-t border-stone-200/70 grid grid-cols-3 gap-1">
                        {(
                          [
                            ["available", "✓ Tayyor"],
                            ["cleaning", "Tozalash"],
                            ["maintenance", "Ta'mir"],
                          ] as [RoomStatus, string][]
                        ).map(([s, label]) => (
                          <button
                            key={s}
                            disabled={busy || room.status === s}
                            onClick={() => roomStatus.mutate({ id: room.id, status: s })}
                            className="py-1 px-1 text-[10px] font-bold rounded bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 disabled:opacity-30 transition"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Housekeeping tasks */}
        {tab === "tasks" && (
          <div className="p-6 space-y-6">
            <div className="border border-stone-200 rounded overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-stone-100/70 border-b border-stone-200 text-stone-600 uppercase font-bold text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Xona</th>
                    <th className="py-2.5 px-3">Topshiriq</th>
                    <th className="py-2.5 px-3">Xodim</th>
                    <th className="py-2.5 px-3">Holat</th>
                    <th className="py-2.5 px-3 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {tasks.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-stone-400">Topshiriq yo&apos;q</td>
                    </tr>
                  )}
                  {tasks.map((t) => {
                    const next: Record<string, [Task["status"], string]> = {
                      dirty: ["in_progress", "Boshlash"],
                      in_progress: ["clean", "Tugadi"],
                      clean: ["inspected", "Qabul qilish"],
                    };
                    const step = next[t.status];
                    return (
                      <tr key={t.id} className="hover:bg-stone-50 transition">
                        <td className="py-3 px-3 font-serif font-bold text-sm text-stone-900">{t.room_number}-xona</td>
                        <td className="py-3 px-3 text-stone-700">{t.notes || "—"}</td>
                        <td className="py-3 px-3 font-bold text-stone-900">{memberName(t.assigned_to)}</td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-stone-100 text-stone-800 border border-stone-300">
                            {TASK_STATUS[t.status] || t.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          {step && (
                            <button
                              disabled={busy}
                              onClick={() => taskStatus.mutate({ id: t.id, status: step[0] })}
                              className="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-700 text-white rounded text-xs font-bold transition shadow-sm disabled:opacity-50"
                            >
                              {step[1]}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-stone-200">
              <h4 className="font-serif font-bold text-sm text-stone-900 mb-3">Xodimlar</h4>
              {staff.length === 0 ? (
                <p className="text-xs text-stone-400">Yo&apos;q</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {staff.map((s) => (
                    <div key={s.id} className="p-3 bg-white border border-stone-200 rounded flex items-center justify-between shadow-sm">
                      <div>
                        <div className="font-bold text-xs text-stone-900">{s.name}</div>
                        <div className="text-[11px] text-stone-500 font-mono">{s.email}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-700 uppercase">
                        {s.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Guest special requests (from bookings) */}
        {tab === "requests" && (
          <div className="p-6 space-y-3">
            {requests.length === 0 && <p className="text-xs text-stone-400">So&apos;rov yo&apos;q</p>}
            {requests.map((req) => (
              <div key={req.booking_id} className="p-4 rounded border border-amber-300 bg-white shadow-sm flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-stone-900">{req.guest_name}</span>
                    <span className="text-[10px] font-mono bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded font-bold">
                      {req.room_number}-xona
                    </span>
                  </div>
                  <p className="text-xs mt-1 text-stone-800 font-medium">{req.request}</p>
                </div>
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-amber-900">
                  <IconClock className="w-3 h-3" /> {req.status === "checked_in" ? "Joylashgan" : "Kutilmoqda"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Task modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl border border-stone-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 mb-4">
              <h3 className="font-serif font-bold text-base text-stone-900 flex items-center gap-2">
                <IconSparkles className="w-4 h-4 text-amber-700" /> Tozalash topshirig&apos;i
              </h3>
              <button onClick={() => setShowTaskModal(false)} className="text-stone-400 hover:text-stone-700">
                <IconX className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createTask.mutate();
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-stone-700 mb-1">Xona *</label>
                <select required value={taskForm.room} onChange={(e) => setTaskForm({ ...taskForm, room: e.target.value })} className={field}>
                  <option value="">— Tanlang —</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.room_number}-xona
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-stone-700 mb-1">Xodim</label>
                <select value={taskForm.assigned_to} onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })} className={field}>
                  <option value="">— Biriktirilmagan —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.user.id}>
                      {m.user.full_name || m.user.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-stone-700 mb-1">Izoh</label>
                <textarea rows={3} value={taskForm.notes} onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} className={field} />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button type="button" onClick={() => setShowTaskModal(false)} className="px-3.5 py-2 text-stone-700 hover:bg-stone-100 rounded font-semibold">
                  Bekor
                </button>
                <button type="submit" disabled={createTask.isPending} className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded font-bold shadow disabled:opacity-50">
                  Yuborish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Booking modal */}
      {showBookingModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 shadow-xl border border-stone-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 mb-4">
              <h3 className="font-serif font-bold text-base text-stone-900 flex items-center gap-2">
                <IconCalendarCheck className="w-4 h-4 text-emerald-800" /> Yangi bron
              </h3>
              <button onClick={() => setShowBookingModal(false)} className="text-stone-400 hover:text-stone-700">
                <IconX className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createBooking.mutate();
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-stone-700 mb-1">Mehmon *</label>
                <select value={bookingForm.guest_id} onChange={(e) => setBookingForm({ ...bookingForm, guest_id: e.target.value })} className={field}>
                  <option value="">+ Yangi mehmon</option>
                  {guests.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.full_name}
                      {g.phone ? ` — ${g.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              {!bookingForm.guest_id && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-stone-700 mb-1">Ism *</label>
                    <input required value={bookingForm.first_name} onChange={(e) => setBookingForm({ ...bookingForm, first_name: e.target.value })} className={field} />
                  </div>
                  <div>
                    <label className="block font-bold text-stone-700 mb-1">Familiya *</label>
                    <input required value={bookingForm.last_name} onChange={(e) => setBookingForm({ ...bookingForm, last_name: e.target.value })} className={field} />
                  </div>
                  <div>
                    <label className="block font-bold text-stone-700 mb-1">Telefon</label>
                    <input value={bookingForm.phone} onChange={(e) => setBookingForm({ ...bookingForm, phone: e.target.value })} className={field} />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Xona *</label>
                  <select required value={bookingForm.room_id} onChange={(e) => setBookingForm({ ...bookingForm, room_id: e.target.value })} className={field}>
                    <option value="">—</option>
                    {rooms
                      .filter((r) => r.status === "available")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.room_number}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Kelish *</label>
                  <input type="date" required value={bookingForm.check_in} onChange={(e) => setBookingForm({ ...bookingForm, check_in: e.target.value })} className={field} />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Ketish *</label>
                  <input type="date" required value={bookingForm.check_out} onChange={(e) => setBookingForm({ ...bookingForm, check_out: e.target.value })} className={field} />
                </div>
              </div>
              <div>
                <label className="block font-bold text-stone-700 mb-1">So&apos;rov</label>
                <input value={bookingForm.special_requests} onChange={(e) => setBookingForm({ ...bookingForm, special_requests: e.target.value })} className={field} />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button type="button" onClick={() => setShowBookingModal(false)} className="px-3.5 py-2 text-stone-700 hover:bg-stone-100 rounded font-semibold">
                  Bekor
                </button>
                <button type="submit" disabled={createBooking.isPending} className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded font-bold shadow disabled:opacity-50">
                  {createBooking.isPending ? "Saqlanmoqda..." : "Tasdiqlash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
