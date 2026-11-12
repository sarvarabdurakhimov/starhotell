"use client";

// The one "Yangi bron" form. Opened from the Bookings page, and from the Calendar
// with the clicked room and date already filled in.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { apiError, asList } from "@/lib/api/helpers";
import { usePanel } from "@/lib/panel-context";
import type { Guest, PaginatedResponse, Room } from "@/types";

const isoDay = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface NewBookingPrefill {
  room_id?: number;
  check_in?: string;
}

export function NewBookingModal({ prefill, onClose }: { prefill?: NewBookingPrefill; onClose: () => void }) {
  const { hotelId } = usePanel();
  const queryClient = useQueryClient();
  const today = isoDay(new Date());
  const checkIn = prefill?.check_in && prefill.check_in >= today ? prefill.check_in : today;

  const [form, setForm] = useState({
    guest_id: "",
    first_name: "",
    last_name: "",
    phone: "",
    room_id: prefill?.room_id ? String(prefill.room_id) : "",
    check_in: checkIn,
    check_out: addDays(checkIn, 1),
    special_requests: "",
  });
  const [error, setError] = useState<string | null>(null);

  const { data: guests = [] } = useQuery({
    queryKey: ["guests", hotelId],
    queryFn: async () =>
      asList((await apiClient.get<PaginatedResponse<Guest>>(`/guests/hotels/${hotelId}/guests/`, { params: { page_size: 100 } })).data),
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms", hotelId],
    queryFn: async () =>
      asList((await apiClient.get<PaginatedResponse<Room>>(`/rooms/hotels/${hotelId}/rooms/`, { params: { page_size: 100 } })).data),
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
      ["bookings", "booking-calendar", "rooms", "guests", "room-overview", "manager-operations"].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k, hotelId] })
      );
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  const newGuest = !form.guest_id;
  const input = "w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none bg-white";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded max-w-md w-full p-6 shadow-xl border border-stone-300" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-serif font-bold text-stone-900 mb-4">Yangi bron</h3>

        {error && <div className="mb-3 p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">{error}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-3 text-xs"
        >
          <div>
            <label className="block font-bold text-stone-700 uppercase mb-1">Mehmon *</label>
            <select value={form.guest_id} onChange={(e) => setForm({ ...form, guest_id: e.target.value })} className={input}>
              <option value="">+ Yangi mehmon</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.is_blacklisted ? "⛔ " : ""}
                  {g.full_name}
                  {g.phone ? ` — ${g.phone}` : ""}
                </option>
              ))}
            </select>
            {(() => {
              const picked = guests.find((g) => String(g.id) === String(form.guest_id));
              return picked?.is_blacklisted ? (
                <div className="mt-1.5 p-2 rounded bg-stone-900 text-white text-[11px]">
                  ⛔ Bu mijoz qora ro&apos;yxatda{picked.blacklist_reason ? `: ${picked.blacklist_reason}` : ""}.
                </div>
              ) : null;
            })()}
          </div>

          {newGuest && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Ism *</label>
                <input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={input} />
              </div>
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Familiya *</label>
                <input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={input} />
              </div>
              <div className="col-span-2">
                <label className="block font-bold text-stone-700 uppercase mb-1">Telefon</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} />
              </div>
            </div>
          )}

          <div>
            <label className="block font-bold text-stone-700 uppercase mb-1">Xona *</label>
            <select required value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })} className={input}>
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
                min={today}
                value={form.check_in}
                onChange={(e) => {
                  const ci = e.target.value;
                  setForm({ ...form, check_in: ci, check_out: form.check_out > ci ? form.check_out : addDays(ci, 1) });
                }}
                className={input}
              />
            </div>
            <div>
              <label className="block font-bold text-stone-700 uppercase mb-1">Chiqish *</label>
              <input
                type="date"
                required
                min={addDays(form.check_in, 1)}
                value={form.check_out}
                onChange={(e) => setForm({ ...form, check_out: e.target.value })}
                className={input}
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-stone-700 uppercase mb-1">So&apos;rov</label>
            <input value={form.special_requests} onChange={(e) => setForm({ ...form, special_requests: e.target.value })} className={input} />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-stone-200">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 rounded font-semibold">
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
  );
}
