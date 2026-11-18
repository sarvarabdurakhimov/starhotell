"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendarCheck,
  IconChevronRight,
  IconCircleCheck,
  IconPlus,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { apiError, asList, money, ROOM_STATUS } from "@/lib/api/helpers";
import { usePanel } from "@/lib/panel-context";
import { isFrontDesk } from "@/lib/session";
import { RoomTypesSection } from "@/components/rooms/RoomTypesSection";
import type { Booking, PaginatedResponse, Room, RoomStatus, RoomType } from "@/types";

type Filter = "all" | RoomStatus;

const BADGE: Record<string, string> = {
  occupied: "bg-rose-100 text-rose-900 border-rose-300",
  available: "bg-emerald-100 text-emerald-900 border-emerald-300",
  cleaning: "bg-amber-100 text-amber-950 border-amber-300",
  maintenance: "bg-stone-200 text-stone-800 border-stone-300",
  out_of_order: "bg-stone-200 text-stone-800 border-stone-300",
};

export default function RoomsPage() {
  const { hotelId, base, role, staffRole } = usePanel();
  // Staff can view rooms; changing rooms needs a manager (backend rule). Reception still does check-out.
  const canManage = role !== "staff";
  const canCheckOut = isFrontDesk(role, staffRole);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [roomModal, setRoomModal] = useState(false);
  const [typeModal, setTypeModal] = useState(false);
  const [roomForm, setRoomForm] = useState({ room_number: "", floor: "1", room_type: "" });
  const [typeForm, setTypeForm] = useState({ name: "", base_price: "", max_occupancy: "2", description: "" });

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["rooms", hotelId],
    queryFn: async () =>
      asList((await apiClient.get<PaginatedResponse<Room>>(`/rooms/hotels/${hotelId}/rooms/`, { params: { page_size: 100 } })).data),
  });

  const { data: roomTypes = [] } = useQuery({
    queryKey: ["room-types", hotelId],
    queryFn: async () =>
      asList((await apiClient.get<PaginatedResponse<RoomType>>(`/rooms/hotels/${hotelId}/room-types/`, { params: { page_size: 100 } })).data),
  });

  // Who is staying in each room right now
  const { data: stays = [] } = useQuery({
    queryKey: ["bookings", hotelId, "checked_in"],
    queryFn: async () =>
      asList(
        (
          await apiClient.get<PaginatedResponse<Booking>>(`/bookings/hotels/${hotelId}/bookings/`, {
            params: { status: "checked_in" },
          })
        ).data
      ),
  });
  const stayByRoom = new Map(stays.map((b) => [b.room, b]));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["rooms", hotelId] });
    queryClient.invalidateQueries({ queryKey: ["room-types", hotelId] });
    queryClient.invalidateQueries({ queryKey: ["bookings", hotelId] });
  };
  const onError = (err: unknown) => setError(apiError(err));

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: RoomStatus }) =>
      apiClient.patch(`/rooms/hotels/${hotelId}/rooms/${id}/`, { status }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError,
  });

  const checkOut = useMutation({
    mutationFn: async (bookingId: number) =>
      apiClient.post(`/bookings/hotels/${hotelId}/bookings/${bookingId}/check-out/`),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError,
  });

  const addRoom = useMutation({
    mutationFn: async () =>
      apiClient.post(`/rooms/hotels/${hotelId}/rooms/`, {
        room_number: roomForm.room_number.trim(),
        floor: Number(roomForm.floor),
        room_type: Number(roomForm.room_type),
      }),
    onSuccess: () => {
      setRoomModal(false);
      setRoomForm({ room_number: "", floor: "1", room_type: "" });
      setError(null);
      refresh();
    },
    onError,
  });

  const addType = useMutation({
    mutationFn: async () =>
      apiClient.post<RoomType>(`/rooms/hotels/${hotelId}/room-types/`, {
        name: typeForm.name.trim(),
        base_price: typeForm.base_price,
        max_occupancy: Number(typeForm.max_occupancy),
        description: typeForm.description.trim(),
      }),
    onSuccess: (res) => {
      setTypeModal(false);
      setTypeForm({ name: "", base_price: "", max_occupancy: "2", description: "" });
      setRoomForm((f) => ({ ...f, room_type: String(res.data.id) }));
      setError(null);
      refresh();
    },
    onError,
  });

  const count = (s: RoomStatus) => rooms.filter((r) => r.status === s).length;
  const filtered = filter === "all" ? rooms : rooms.filter((r) => r.status === filter);
  const busy = setStatus.isPending || checkOut.isPending;

  const card = (s: RoomStatus, label: string, Icon: typeof IconCircleCheck, tone: string) => (
    <button
      onClick={() => setFilter(filter === s ? "all" : s)}
      className={`p-4 rounded border text-left transition ${
        filter === s ? `${tone} ring-2` : "bg-white border-stone-200 hover:border-stone-400"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-stone-700">{label}</span>
        <Icon className="w-4 h-4 text-stone-600" />
      </div>
      <div className="mt-2 text-3xl font-extrabold text-stone-900 font-mono">{count(s)}</div>
    </button>
  );

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <h1 className="text-2xl font-serif font-bold text-stone-900">Xonalar</h1>
        {canManage && <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setError(null);
              setTypeModal(true);
            }}
            className="px-3.5 py-2 text-xs font-semibold bg-white hover:bg-stone-100 text-stone-900 border border-stone-300 rounded transition"
          >
            Xona turi +
          </button>
          <button
            onClick={() => {
              setError(null);
              setRoomModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-white rounded transition shadow-sm"
          >
            <IconPlus className="w-4 h-4 text-amber-400" /> Yangi xona
          </button>
        </div>}
      </div>

      {error && !roomModal && !typeModal && (
        <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} title="Yopish" aria-label="Yopish" className="text-stone-400 hover:text-stone-700">
            <IconX className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {card("occupied", "Band", IconCalendarCheck, "bg-rose-50 border-rose-600 ring-rose-500")}
        {card("available", "Bo'sh", IconCircleCheck, "bg-emerald-50 border-emerald-600 ring-emerald-500")}
        {card("cleaning", "Tozalashda", IconSparkles, "bg-amber-50 border-amber-600 ring-amber-500")}
        {card("maintenance", "Ta'mirda", IconAlertTriangle, "bg-stone-200 border-stone-600 ring-stone-600")}
      </div>

      {isLoading && <p className="text-xs text-stone-400">Yuklanmoqda...</p>}
      {!isLoading && rooms.length === 0 && (
        <div className="p-10 text-center bg-white border border-dashed border-stone-300 rounded text-sm text-stone-500">
          Xona yo&apos;q. &ldquo;Yangi xona&rdquo; tugmasi bilan qo&apos;shing.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((room) => {
          const stay = stayByRoom.get(room.id);
          return (
            <div
              key={room.id}
              className="group bg-white border border-stone-200 hover:border-stone-400 hover:shadow-md rounded p-5 shadow-sm flex flex-col justify-between transition"
            >
              <Link href={`${base}/rooms/${room.id}`} className="block" title="Xona tafsilotlari">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-mono text-stone-500 uppercase">{room.floor}-qavat</span>
                    <h3 className="text-2xl font-serif font-extrabold text-stone-900 group-hover:underline underline-offset-4">
                      Xona {room.room_number}
                    </h3>
                    <p className="text-xs text-stone-600">{room.room_type_detail?.name || "—"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold border ${BADGE[room.status] || BADGE.maintenance}`}>
                      {ROOM_STATUS[room.status] || room.status}
                    </span>
                    <IconChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-900 transition" />
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100 text-xs space-y-1.5">
                  {room.room_type_detail && (
                    <div className="flex justify-between">
                      <span className="text-stone-500">Kunlik:</span>
                      <span className="font-mono font-bold text-stone-900">{money(room.room_type_detail.base_price)}</span>
                    </div>
                  )}
                  {stay && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Mehmon:</span>
                        <span className="font-bold text-stone-900">{stay.guest_name}</span>
                      </div>
                      <div className="flex justify-between font-mono text-[11px]">
                        <span className="text-stone-500">Muddat:</span>
                        <span className="text-stone-700">
                          {stay.check_in} &rarr; {stay.check_out}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </Link>

              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-2">
                {stay && canCheckOut && (
                  <button
                    disabled={busy}
                    onClick={() => checkOut.mutate(stay.id)}
                    className="w-full py-1.5 flex items-center justify-center gap-1.5 text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded transition disabled:opacity-50"
                  >
                    Check-out <IconArrowRight className="w-3.5 h-3.5" /> Tozalash
                  </button>
                )}
                {canManage && !stay && room.status === "cleaning" && (
                  <button
                    disabled={busy}
                    onClick={() => setStatus.mutate({ id: room.id, status: "available" })}
                    className="w-full py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded transition disabled:opacity-50"
                  >
                    Tayyor
                  </button>
                )}
                {canManage && !stay && room.status === "available" && (
                  <button
                    disabled={busy}
                    onClick={() => setStatus.mutate({ id: room.id, status: "maintenance" })}
                    className="w-full py-1.5 text-xs font-semibold bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 rounded transition disabled:opacity-50"
                  >
                    Ta&apos;mirga
                  </button>
                )}
                {canManage && !stay && (room.status === "maintenance" || room.status === "out_of_order") && (
                  <button
                    disabled={busy}
                    onClick={() => setStatus.mutate({ id: room.id, status: "cleaning" })}
                    className="w-full py-1.5 flex items-center justify-center gap-1.5 text-xs font-semibold bg-stone-800 hover:bg-stone-900 text-white rounded transition disabled:opacity-50"
                  >
                    Tugadi <IconArrowRight className="w-3.5 h-3.5" /> Tozalash
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <RoomTypesSection roomTypes={roomTypes} canManage={canManage} />

      {roomModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full p-6 shadow-xl border border-stone-300">
            <h3 className="text-lg font-serif font-bold text-stone-900 mb-4">Yangi xona</h3>
            {error && <div className="mb-3 p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">{error}</div>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addRoom.mutate();
              }}
              className="space-y-3 text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 uppercase mb-1">Raqam *</label>
                  <input
                    required
                    value={roomForm.room_number}
                    onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 uppercase mb-1">Qavat *</label>
                  <input
                    type="number"
                    required
                    value={roomForm.floor}
                    onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Turi *</label>
                <select
                  required
                  value={roomForm.room_type}
                  onChange={(e) => setRoomForm({ ...roomForm, room_type: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none bg-white"
                >
                  <option value="">— Tanlang —</option>
                  {roomTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({money(t.base_price)})
                    </option>
                  ))}
                </select>
                {roomTypes.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setRoomModal(false);
                      setTypeModal(true);
                    }}
                    className="mt-1 text-[11px] text-amber-800 font-semibold hover:underline inline-flex items-center gap-1"
                  >
                    Avval xona turini qo&apos;shing <IconArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-stone-200">
                <button type="button" onClick={() => setRoomModal(false)} className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 rounded font-semibold">
                  Bekor
                </button>
                <button
                  type="submit"
                  disabled={addRoom.isPending}
                  className="px-4 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded font-semibold disabled:opacity-50"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {typeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full p-6 shadow-xl border border-stone-300">
            <h3 className="text-lg font-serif font-bold text-stone-900 mb-4">Xona turi</h3>
            {error && <div className="mb-3 p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">{error}</div>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addType.mutate();
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Nomi *</label>
                <input
                  required
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  placeholder="Standard"
                  className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 uppercase mb-1">Narx / tun (so&apos;m) *</label>
                  <input
                    type="number"
                    step="1000"
                    min="0"
                    required
                    value={typeForm.base_price}
                    onChange={(e) => setTypeForm({ ...typeForm, base_price: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 uppercase mb-1">Sig&apos;im *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={typeForm.max_occupancy}
                    onChange={(e) => setTypeForm({ ...typeForm, max_occupancy: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Tavsif</label>
                <textarea
                  rows={2}
                  maxLength={600}
                  value={typeForm.description}
                  onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                  placeholder="Telegram botda mijozga ko'rsatiladi"
                  className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                />
              </div>
              <p className="text-[11px] text-stone-500">Rasmlarni saqlagandan keyin pastdagi &quot;Xona turlari&quot; bo&apos;limidan qo&apos;shasiz.</p>
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-stone-200">
                <button type="button" onClick={() => setTypeModal(false)} className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 rounded font-semibold">
                  Bekor
                </button>
                <button
                  type="submit"
                  disabled={addType.isPending}
                  className="px-4 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded font-semibold disabled:opacity-50"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
