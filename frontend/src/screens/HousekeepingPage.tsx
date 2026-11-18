"use client";

import { useState } from "react";
import { usePanel } from "@/lib/panel-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { asList } from "@/lib/api/helpers";
import { HotelMembershipItem, PaginatedResponse, Room } from "@/types";
import {
  IconSparkles,
  IconCheck,
  IconChecks,
  IconPlayerPlay,
  IconCircleCheck,
  IconAlertCircle,
  IconClock,
  IconPlus,
  IconShieldCheck,
} from "@tabler/icons-react";

export interface HousekeepingTask {
  id: number;
  room: number;
  room_number: string;
  assigned_to: number | null;
  status: "dirty" | "in_progress" | "clean" | "inspected";
  status_display: string;
  notes: string;
  completed_at?: string;
  created_at: string;
}

export default function HousekeepingPage() {
  const { hotelId } = usePanel();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    room: "",
    status: "dirty",
    notes: "",
    assigned_to: "",
  });

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ["housekeeping-tasks", hotelId],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<HousekeepingTask>>(
        `/housekeeping/hotels/${hotelId}/housekeeping/`
      );
      return res.data;
    },
  });

  // Same cache key and shape (plain list) as the rooms page
  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms", hotelId],
    queryFn: async () =>
      asList((await apiClient.get<PaginatedResponse<Room>>(`/rooms/hotels/${hotelId}/rooms/`, { params: { page_size: 100 } })).data),
  });

  // Staff who can be given a task (moved here from the manager dashboard)
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

  const createTaskMutation = useMutation({
    mutationFn: async (payload: any) =>
      apiClient.post(`/housekeeping/hotels/${hotelId}/housekeeping/`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["housekeeping-tasks", hotelId] });
      queryClient.invalidateQueries({ queryKey: ["manager-operations", hotelId] });
      setShowModal(false);
      setFormData({ room: "", status: "dirty", notes: "", assigned_to: "" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) =>
      apiClient.patch(`/housekeeping/hotels/${hotelId}/housekeeping/${taskId}/`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["housekeeping-tasks", hotelId] });
      // "Tayyor" xonani bo'sh qiladi
      queryClient.invalidateQueries({ queryKey: ["rooms", hotelId] });
      queryClient.invalidateQueries({ queryKey: ["manager-operations", hotelId] });
    },
  });

  const tasks = tasksData?.results || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-bold text-stone-900">Tozalash</h1>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs rounded shadow-sm transition"
        >
          <IconPlus className="w-4 h-4 text-amber-400" /> Yangi topshiriq
        </button>
      </div>

      {/* Task Summary Badges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded border border-stone-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-stone-500 font-semibold uppercase">Kutilmoqda</span>
            <p className="text-2xl font-bold text-rose-700">
              {tasks.filter((t) => t.status === "dirty").length}
            </p>
          </div>
          <IconAlertCircle className="w-6 h-6 text-rose-500" />
        </div>
        <div className="bg-white p-4 rounded border border-stone-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-stone-500 font-semibold uppercase">Jarayonda</span>
            <p className="text-2xl font-bold text-amber-700">
              {tasks.filter((t) => t.status === "in_progress").length}
            </p>
          </div>
          <IconClock className="w-6 h-6 text-amber-500" />
        </div>
        <div className="bg-white p-4 rounded border border-stone-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-stone-500 font-semibold uppercase">Tozalandi</span>
            <p className="text-2xl font-bold text-stone-700">
              {tasks.filter((t) => t.status === "clean").length}
            </p>
          </div>
          <IconSparkles className="w-6 h-6 text-stone-500" />
        </div>
        <div className="bg-white p-4 rounded border border-stone-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-stone-500 font-semibold uppercase">Tayyor</span>
            <p className="text-2xl font-bold text-emerald-800">
              {tasks.filter((t) => t.status === "inspected").length}
            </p>
          </div>
          <IconShieldCheck className="w-6 h-6 text-emerald-700" />
        </div>
      </div>

      {/* Tasks Table */}
      <div className="bg-white border border-stone-200 rounded shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b bg-stone-50 text-stone-700 font-bold uppercase tracking-wider">
              <th className="py-3 px-5">Xona</th>
              <th className="py-3 px-5">Holat</th>
              <th className="py-3 px-5">Xodim</th>
              <th className="py-3 px-5">Izoh</th>
              <th className="py-3 px-5">Sana</th>
              <th className="py-3 px-5 text-right">Amal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-stone-400">
                  Yuklanmoqda...
                </td>
              </tr>
            )}
            {!isLoading && tasks.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-stone-400">
                  Topshiriq yo&apos;q
                </td>
              </tr>
            )}
            {tasks.map((task) => (
              <tr key={task.id} className="hover:bg-stone-50 transition">
                <td className="py-3 px-5 font-bold text-stone-900">
                  {task.room_number}-Xona
                </td>
                <td className="py-3 px-5">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                      task.status === "dirty"
                        ? "bg-rose-50 text-rose-800 border-rose-200"
                        : task.status === "in_progress"
                        ? "bg-amber-50 text-amber-900 border-amber-300"
                        : task.status === "clean"
                        ? "bg-stone-100 text-stone-800 border-stone-300"
                        : "bg-emerald-50 text-emerald-900 border-emerald-300"
                    }`}
                  >
                    {task.status === "dirty"
                      ? "Kutilmoqda"
                      : task.status === "in_progress"
                      ? "Jarayonda"
                      : task.status === "clean"
                      ? "Tozalangan"
                      : "Tayyor"}
                  </span>
                </td>
                <td className="py-3 px-5 font-semibold text-stone-900">{memberName(task.assigned_to)}</td>
                <td className="py-3 px-5 text-stone-600 max-w-xs truncate">
                  {task.notes || "—"}
                </td>
                <td className="py-3 px-5 text-stone-500 font-mono">
                  {new Date(task.created_at).toLocaleDateString()}
                </td>
                <td className="py-3 px-5 text-right space-x-1.5">
                  {task.status === "dirty" && (
                    <button
                      onClick={() =>
                        updateStatusMutation.mutate({ taskId: task.id, status: "in_progress" })
                      }
                      title="Boshlash"
                      aria-label="Boshlash"
                      className="p-1.5 inline-flex bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded transition"
                    >
                      <IconPlayerPlay className="w-4 h-4" />
                    </button>
                  )}
                  {task.status === "in_progress" && (
                    <button
                      onClick={() =>
                        updateStatusMutation.mutate({ taskId: task.id, status: "clean" })
                      }
                      title="Tugadi"
                      aria-label="Tugadi"
                      className="p-1.5 inline-flex bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded transition"
                    >
                      <IconCheck className="w-4 h-4" />
                    </button>
                  )}
                  {task.status === "clean" && (
                    <button
                      onClick={() =>
                        updateStatusMutation.mutate({ taskId: task.id, status: "inspected" })
                      }
                      title="Qabul qilish"
                      aria-label="Qabul qilish"
                      className="p-1.5 inline-flex bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded transition"
                    >
                      <IconChecks className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Staff (moved here from the manager dashboard) */}
      <div>
        <h2 className="font-serif font-bold text-sm text-stone-900 mb-3">Xodimlar</h2>
        {members.length === 0 ? (
          <p className="text-xs text-stone-400">Yo&apos;q</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {members.map((m) => {
              const open = tasks.filter((t) => t.assigned_to === m.user.id && t.status !== "inspected").length;
              return (
                <div key={m.id} className="p-3 bg-white border border-stone-200 rounded flex items-center justify-between shadow-sm">
                  <div className="min-w-0">
                    <div className="font-bold text-xs text-stone-900 truncate">{m.user.full_name || m.user.email}</div>
                    <div className="text-[11px] text-stone-500 font-mono truncate">{m.user.email}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-700 uppercase">{m.role}</span>
                    <div className="mt-1 text-[10px] text-stone-500">{open} ta topshiriq</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full p-6 shadow-xl border border-stone-300">
            <h3 className="text-base font-serif font-bold text-stone-900 mb-4">
              Yangi topshiriq
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createTaskMutation.mutate({
                  room: Number(formData.room),
                  status: formData.status,
                  notes: formData.notes,
                  assigned_to: formData.assigned_to ? Number(formData.assigned_to) : null,
                });
              }}
              className="space-y-4 text-xs font-sans"
            >
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">
                  Xona *
                </label>
                <select
                  required
                  value={formData.room}
                  onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded text-xs bg-white focus:outline-none focus:border-stone-900"
                >
                  <option value="">-- Tanlang --</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.room_number}-Xona ({r.floor}-qavat)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">
                  Xodim
                </label>
                <select
                  value={formData.assigned_to}
                  onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded text-xs bg-white focus:outline-none focus:border-stone-900"
                >
                  <option value="">— Biriktirilmagan —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.user.id}>
                      {m.user.full_name || m.user.email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">
                  Holat
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-stone-300 rounded text-xs bg-white focus:outline-none focus:border-stone-900"
                >
                  <option value="dirty">Kutilmoqda</option>
                  <option value="in_progress">Boshlandi</option>
                  <option value="clean">Tozalangan</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">
                  Izoh
                </label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Choyshab, vanna"
                  className="w-full px-3 py-2 border border-stone-300 rounded text-xs focus:outline-none focus:border-stone-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-2 font-medium text-stone-600 hover:bg-stone-100 rounded transition"
                >
                  Bekor
                </button>
                <button
                  type="submit"
                  disabled={createTaskMutation.isPending}
                  className="px-4 py-2 font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded shadow transition disabled:opacity-50"
                >
                  {createTaskMutation.isPending ? "Saqlanmoqda..." : "Saqlash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
