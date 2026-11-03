"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconFilter, IconPlus } from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { apiError, asList, BOOKING_STATUS } from "@/lib/api/helpers";
import { usePanel } from "@/lib/panel-context";
import type { Booking, Guest, PaginatedResponse, Room } from "@/types";

type Filter = "all" | "confirmed" | "checked_in" | "checked_out";

const today = () => new Date().toISOString().split("T")[0];
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
};

const emptyForm = () => ({
  guest_id: "",
  first_name: "",
  last_name: "",
  phone: "",
  room_id: "",
  check_in: today(),
  check_out: plusDays(1),
  special_requests: "",
});

export default function BookingsPage() {
  const { hotelId } = usePanel();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["bookings", hotelId],
    queryFn: async () =>
      asList((await apiClient.get<PaginatedResponse<Booking>>(`/bookings/hotels/${hotelId}/bookings/`)).data),
  });

  const { data: guests = [] } = useQuery({
    queryKey: ["guests", hotelId],
    queryFn: async () =>
      asList((await apiClient.get<PaginatedResponse<Guest>>(`/guests/hotels/${hotelId}/guests/`)).data),
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms", hotelId],
    queryFn: async () =>
      asList((await apiClient.get<PaginatedResponse<Room>>(`/rooms/hotels/${hotelId}/rooms/`)).data),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["bookings", hotelId] });
    queryClient.invalidateQueries({ queryKey: ["rooms", hotelId] });
    queryClient.invalidateQueries({ queryKey: ["guests", hotelId] });
  };

  const action = useMutation({
    mutationFn: async ({ id, kind, reason }: { id: number; kind: "check-in" | "check-out" | "cancel"; reason?: string }) =>
      apiClient.post(`/bookings/hotels/${hotelId}/bookings/${id}/${kind}/`, reason ? { reason } : {}),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) => setError(apiError(err)),
  });

  const create = useMutation({
    mutationFn: async () => {
      let guestId = Number(form.guest_id);
      if (!guestId) {
        const g = await apiClient.post<Guest>(`/guests/hotels/${hotelId}/guests/`, {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone: form.phone.trim(),
        });
        guestId = g.data.id;
      }
      return apiClient.post(`/bookings/hotels/${hotelId}/bookings/`, {
        guest_id: guestId,
        room_id: Number(form.room_id),
        check_in: form.check_in,
        check_out: form.check_out,
        special_requests: form.special_requests,
      });
    },
    onSuccess: () => {
      setShowModal(false);
      setForm(emptyForm());
      setError(null);
      refresh();
    },
    onError: (err) => setError(apiError(err)),
  });

  const filtered = filter === "all" ? bookings : bookings.filter((b) => b.status === filter);
  const newGuest = !form.guest_id;

  const filterBtn = (key: Filter, label: string) => (
    <button
      onClick={() => setFilter(key)}
      className={`px-3 py-1 rounded border transition ${
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

      {error && !showModal && (
        <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-stone-500 font-semibold flex items-center gap-1">
          <IconFilter className="w-3.5 h-3.5" /> Holat:
        </span>
        {filterBtn("all", `Barchasi (${bookings.length})`)}
        {filterBtn("confirmed", "Kutilmoqda")}
        {filterBtn("checked_in", "Joylashgan")}
        {filterBtn("checked_out", "Chiqib ketgan")}
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
                <td colSpan={7} className="py-10 text-center text-stone-400">Bron yo&apos;q</td>
              </tr>
            )}
            {filtered.map((b) => (
              <tr key={b.id} className="hover:bg-stone-50 transition">
                <td className="py-3 px-4 font-mono font-bold text-stone-900">{b.reference}</td>
                <td className="py-3 px-4 font-bold text-stone-900">{b.guest_name}</td>
                <td className="py-3 px-4 font-bold text-stone-900">№ {b.room_number}</td>
                <td className="py-3 px-4 font-mono text-stone-600">
                  {b.check_in} &rarr; {b.check_out}
                </td>
                <td className="py-3 px-4 text-right font-mono font-bold text-stone-900">
                  {Number(b.total_amount).toLocaleString()} {b.currency}
                </td>
                <td className="py-3 px-4 text-center">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                      b.status === "checked_in"
                        ? "bg-rose-100 text-rose-900 border border-rose-300"
                        : b.status === "confirmed"
                        ? "bg-amber-100 text-amber-950 border border-amber-300"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {BOOKING_STATUS[b.status] || b.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                  {b.status === "confirmed" && (
                    <>
                      <button
                        disabled={action.isPending}
                        onClick={() => action.mutate({ id: b.id, kind: "check-in" })}
                        className="px-2.5 py-1 bg-stone-900 hover:bg-stone-800 text-white rounded text-[11px] font-semibold transition shadow-sm disabled:opacity-50"
                      >
                        Check-in
                      </button>
                      <button
                        disabled={action.isPending}
                        onClick={() => {
                          const reason = prompt("Bekor qilish sababi:");
                          if (reason !== null) action.mutate({ id: b.id, kind: "cancel", reason });
                        }}
                        className="px-2 py-1 bg-stone-100 hover:bg-rose-100 text-stone-700 hover:text-rose-900 border border-stone-300 rounded text-[11px] font-semibold transition disabled:opacity-50"
                      >
                        Bekor
                      </button>
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

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full p-6 shadow-xl border border-stone-300">
            <h3 className="text-lg font-serif font-bold text-stone-900 mb-4">Yangi bron</h3>

            {error && (
              <div className="mb-3 p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">{error}</div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Mehmon *</label>
                <select
                  value={form.guest_id}
                  onChange={(e) => setForm({ ...form, guest_id: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none bg-white"
                >
                  <option value="">+ Yangi mehmon</option>
                  {guests.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.full_name}
                      {g.phone ? ` — ${g.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {newGuest && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-stone-700 uppercase mb-1">Ism *</label>
                    <input
                      required
                      value={form.first_name}
                      onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                      className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-stone-700 uppercase mb-1">Familiya *</label>
                    <input
                      required
                      value={form.last_name}
                      onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                      className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block font-bold text-stone-700 uppercase mb-1">Telefon</label>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Xona *</label>
                <select
                  required
                  value={form.room_id}
                  onChange={(e) => setForm({ ...form, room_id: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none bg-white"
                >
                  <option value="">— Tanlang —</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.room_number}-xona
                      {r.room_type_detail ? ` (${r.room_type_detail.name}, ${r.room_type_detail.base_price})` : ""}
                    </option>
                  ))}
                </select>
                {rooms.length === 0 && (
                  <p className="mt-1 text-[11px] text-amber-800">Avval Xonalar bo&apos;limida xona qo&apos;shing.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 uppercase mb-1">Kelish *</label>
                  <input
                    type="date"
                    required
                    value={form.check_in}
                    onChange={(e) => setForm({ ...form, check_in: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 uppercase mb-1">Chiqish *</label>
                  <input
                    type="date"
                    required
                    value={form.check_out}
                    onChange={(e) => setForm({ ...form, check_out: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">So&apos;rov</label>
                <input
                  value={form.special_requests}
                  onChange={(e) => setForm({ ...form, special_requests: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 rounded font-semibold"
                >
                  Bekor
                </button>
                <button
                  type="submit"
                  disabled={create.isPending}
                  className="px-4 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded font-semibold disabled:opacity-50"
                >
                  {create.isPending ? "Saqlanmoqda..." : "Saqlash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
