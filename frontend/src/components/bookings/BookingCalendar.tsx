"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconBan,
  IconCalendarMonth,
  IconChevronLeft,
  IconChevronRight,
  IconCrown,
  IconDoorEnter,
  IconDoorExit,
  IconExternalLink,
  IconMessage,
  IconPhone,
  IconX,
} from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { apiError, money } from "@/lib/api/helpers";
import { usePanel } from "@/lib/panel-context";
import { NewBookingModal, type NewBookingPrefill } from "@/components/bookings/NewBookingModal";

interface CalRoom {
  id: number;
  room_number: string;
  floor: number;
  status: string;
  room_type_name: string;
  base_price: number;
  max_occupancy: number;
}

interface CalBooking {
  id: number;
  reference: string;
  room: number;
  status: "pending" | "confirmed" | "checked_in" | "checked_out";
  guest_name: string;
  guest_phone: string;
  is_vip: boolean;
  check_in: string;
  check_out: string;
  display_end: string;
  nights: number;
  num_adults: number;
  num_children: number;
  total_amount: number;
  currency: string;
  special_requests: string;
}

interface CalendarData {
  start: string;
  end: string;
  today: string;
  rooms: CalRoom[];
  bookings: CalBooking[];
}

// ---- Date helpers on "YYYY-MM-DD" strings (UTC, so time zones never shift a day) ----
const toUTC = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const fromUTC = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => fromUTC(toUTC(s) + n * 86_400_000);
const diffDays = (a: string, b: string) => Math.round((toUTC(a) - toUTC(b)) / 86_400_000);
const localToday = () => {
  const d = new Date();
  return fromUTC(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

const WEEKDAYS = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];

// "2 – 15 noy 2026", or "26 okt – 8 noy 2026" across months
function rangeLabel(from: string, to: string) {
  const day = (s: string) => +s.slice(8, 10);
  const mon = (s: string) => MONTHS[+s.slice(5, 7) - 1];
  const year = to.slice(0, 4);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${day(from)} – ${day(to)} ${mon(to)} ${year}`;
  const fromYear = from.slice(0, 4) !== year ? ` ${from.slice(0, 4)}` : "";
  return `${day(from)} ${mon(from)}${fromYear} – ${day(to)} ${mon(to)} ${year}`;
}

const DAY_W = 64;
const ROOM_W = 168;

const BAR: Record<CalBooking["status"], string> = {
  checked_in: "bg-rose-600 text-white border-rose-700",
  confirmed: "bg-emerald-600 text-white border-emerald-700",
  pending: "bg-amber-400 text-amber-950 border-amber-500",
  checked_out: "bg-stone-300 text-stone-700 border-stone-400",
};
const STATUS_LABEL: Record<CalBooking["status"], string> = {
  checked_in: "Yashayapti",
  confirmed: "Keladi",
  pending: "Kutilmoqda",
  checked_out: "Ketgan",
};
const ROOM_DOT: Record<string, string> = {
  available: "bg-emerald-500",
  occupied: "bg-rose-500",
  cleaning: "bg-amber-500",
  maintenance: "bg-stone-500",
  out_of_order: "bg-stone-500",
};

export function BookingCalendar() {
  const { hotelId, base } = usePanel();
  const queryClient = useQueryClient();
  const [days, setDays] = useState(14);
  const [start, setStart] = useState(() => addDays(localToday(), -2));
  const [selected, setSelected] = useState<CalBooking | null>(null);
  // Clicked empty cell -> the shared new-booking form (same one as the Bookings page)
  const [newBooking, setNewBooking] = useState<NewBookingPrefill | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["booking-calendar", hotelId, start, days],
    queryFn: async () =>
      (await apiClient.get<CalendarData>(`/bookings/hotels/${hotelId}/calendar/`, { params: { start, days } })).data,
    placeholderData: (prev) => prev,
  });

  const refresh = () =>
    ["booking-calendar", "bookings", "rooms", "room-overview", "manager-operations", "guests"].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k, hotelId] })
    );

  const stayAction = useMutation({
    mutationFn: async ({ id, kind, reason }: { id: number; kind: "check-in" | "check-out" | "cancel"; reason?: string }) =>
      apiClient.post(`/bookings/hotels/${hotelId}/bookings/${id}/${kind}/`, reason ? { reason } : {}),
    onSuccess: () => {
      setSelected(null);
      setError(null);
      refresh();
    },
    onError: (err) => setError(apiError(err)),
  });

  const today = data?.today || localToday();
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDays(start, i)), [start, days]);
  const rooms = data?.rooms || [];
  const bookings = data?.bookings || [];
  const end = addDays(start, days);

  // Rooms free each night (a room is taken on night d if some stay covers [d, d+1))
  const freeByDay = dates.map(
    (d) => rooms.length - new Set(bookings.filter((b) => b.check_in <= d && b.display_end > d).map((b) => b.room)).size
  );

  const byRoom = useMemo(() => {
    const m = new Map<number, CalBooking[]>();
    // A guest who left early may end before the visible range; skip those
    bookings
      .filter((b) => b.display_end > start)
      .forEach((b) => m.set(b.room, [...(m.get(b.room) || []), b]));
    return m;
  }, [bookings, start]);

  const floors = useMemo(() => {
    const m = new Map<number, CalRoom[]>();
    rooms.forEach((r) => m.set(r.floor, [...(m.get(r.floor) || []), r]));
    return [...m.entries()];
  }, [rooms]);

  const openNew = (roomId: number, date: string) => {
    setError(null);
    setSelected(null);
    setNewBooking({ room_id: roomId, check_in: date });
  };

  // Bar geometry: a stay runs from midday of arrival to midday of departure
  const barStyle = (b: CalBooking) => {
    const from = b.check_in < start ? 0 : diffDays(b.check_in, start) * DAY_W + DAY_W / 2;
    const to = b.display_end > end ? days * DAY_W : diffDays(b.display_end, start) * DAY_W + DAY_W / 2;
    return { left: from + 2, width: Math.max(to - from - 4, 18) };
  };


  return (
    <div className="space-y-5 pb-12 font-sans">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-900 flex items-center gap-2">
            <IconCalendarMonth className="w-6 h-6 text-amber-700" /> Kalendar
          </h1>
          <div className="mt-1 text-sm font-semibold text-stone-600" aria-live="polite">
            {rangeLabel(start, addDays(start, days - 1))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-white rounded border border-stone-300 shadow-sm">
            {/* Arrows move by the whole visible range, so every date on screen changes */}
            <button
              onClick={() => setStart(addDays(start, -days))}
              title={`Oldingi ${days} kun`}
              aria-label="Oldingi davr"
              className="p-2 hover:bg-stone-100 rounded-l"
            >
              <IconChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setStart(addDays(today, -2))}
              className="px-3 py-1.5 text-xs font-bold border-x border-stone-300 hover:bg-stone-100"
            >
              Bugun
            </button>
            <button
              onClick={() => setStart(addDays(start, days))}
              title={`Keyingi ${days} kun`}
              aria-label="Keyingi davr"
              className="p-2 hover:bg-stone-100 rounded-r"
            >
              <IconChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center bg-white p-1 rounded border border-stone-300 text-xs shadow-sm">
            {[7, 14, 30].map((n) => (
              <button
                key={n}
                onClick={() => setDays(n)}
                className={`px-3 py-1 rounded font-medium transition ${
                  days === n ? "bg-stone-900 text-white font-bold" : "text-stone-700 hover:text-stone-900"
                }`}
              >
                {n} kun
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-stone-600">
        {(Object.keys(STATUS_LABEL) as CalBooking["status"][]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`w-4 h-2.5 rounded-sm border ${BAR[s]}`} /> {STATUS_LABEL[s]}
          </span>
        ))}
        <span className="text-stone-400">· Bo&apos;sh katakni bosing — yangi bron</span>
      </div>

      {error && (
        <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} title="Yopish" aria-label="Yopish">
            <IconX className="w-4 h-4" />
          </button>
        </div>
      )}
      {isError && <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">Kalendarni yuklab bo&apos;lmadi.</div>}
      {isLoading && <p className="text-xs text-stone-400">Yuklanmoqda...</p>}

      {/* Grid */}
      {data && (
        // Scrolls on its own (both ways) so the day header and room column stay pinned
        <div className="bg-white border border-stone-200 rounded-lg shadow-sm overflow-auto max-h-[calc(100vh-15rem)] min-h-[20rem]">
          <div style={{ width: ROOM_W + days * DAY_W }}>
            {/* Day header */}
            <div className="flex border-b border-stone-200 bg-stone-50 sticky top-0 z-30 shadow-[0_1px_0_0_rgb(231_229_228)]">
              <div
                className="sticky left-0 z-40 bg-stone-50 border-r border-stone-200 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 flex items-end"
                style={{ width: ROOM_W, minWidth: ROOM_W }}
              >
                Xona
              </div>
              {dates.map((d, i) => {
                const dow = new Date(toUTC(d)).getUTCDay();
                const isToday = d === today;
                return (
                  <div
                    key={d}
                    style={{ width: DAY_W, minWidth: DAY_W }}
                    className={`text-center py-1.5 border-r border-stone-100 ${
                      isToday ? "bg-amber-100" : dow === 0 || dow === 6 ? "bg-stone-100" : "bg-stone-50"
                    }`}
                  >
                    <div className={`text-[10px] font-semibold ${isToday ? "text-amber-900" : "text-stone-500"}`}>{WEEKDAYS[dow]}</div>
                    <div className={`text-sm font-bold ${isToday ? "text-amber-900" : "text-stone-900"}`}>{+d.slice(8, 10)}</div>
                    <div className="text-[9px] text-stone-400">{MONTHS[+d.slice(5, 7) - 1]}</div>
                    <div
                      className={`mt-0.5 text-[9px] font-bold ${freeByDay[i] === 0 ? "text-rose-700" : "text-emerald-700"}`}
                      title="Bo'sh xonalar"
                    >
                      {freeByDay[i]} bo&apos;sh
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rooms grouped by floor */}
            {floors.map(([floor, floorRooms]) => (
              <Fragment key={floor}>
                <div className="flex bg-stone-100/70 border-b border-stone-200">
                  <div
                    className="sticky left-0 z-10 bg-stone-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-600"
                    style={{ width: ROOM_W, minWidth: ROOM_W }}
                  >
                    {floor}-qavat
                  </div>
                </div>
                {floorRooms.map((room) => (
                  <div key={room.id} className="flex border-b border-stone-100 h-11">
                    <Link
                      href={`${base}/rooms/${room.id}`}
                      title="Xona tafsilotlari"
                      className="sticky left-0 z-10 bg-white hover:bg-stone-50 border-r border-stone-200 px-3 flex items-center gap-2"
                      style={{ width: ROOM_W, minWidth: ROOM_W }}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${ROOM_DOT[room.status] || "bg-stone-400"}`} />
                      <span className="font-serif font-bold text-sm text-stone-900">{room.room_number}</span>
                      <span className="text-[10px] text-stone-500 truncate">{room.room_type_name}</span>
                    </Link>
                    <div className="relative" style={{ width: days * DAY_W }}>
                      {/* Empty cells: click to book */}
                      <div className="absolute inset-0 flex">
                        {dates.map((d) => {
                          const dow = new Date(toUTC(d)).getUTCDay();
                          const past = d < today;
                          return (
                            <button
                              key={d}
                              disabled={past}
                              onClick={() => openNew(room.id, d)}
                              title={past ? undefined : `${room.room_number}-xona, ${d}: yangi bron`}
                              style={{ width: DAY_W, minWidth: DAY_W }}
                              className={`h-full border-r border-stone-100 transition ${
                                d === today ? "bg-amber-50" : dow === 0 || dow === 6 ? "bg-stone-50" : ""
                              } ${past ? "cursor-default" : "hover:bg-emerald-50"}`}
                            />
                          );
                        })}
                      </div>
                      {/* Booking bars */}
                      {(byRoom.get(room.id) || []).map((b) => (
                        <button
                          key={b.id}
                          onClick={() => {
                            setError(null);
                            setSelected(b);
                          }}
                          title={`${b.guest_name}: ${b.check_in} → ${b.check_out}`}
                          style={barStyle(b)}
                          className={`absolute top-1.5 bottom-1.5 rounded border px-2 text-[11px] font-semibold flex items-center gap-1 overflow-hidden whitespace-nowrap shadow-sm hover:brightness-110 transition ${BAR[b.status]} ${
                            selected?.id === b.id ? "ring-2 ring-stone-900 ring-offset-1" : ""
                          }`}
                        >
                          {b.is_vip && <IconCrown className="w-3 h-3 shrink-0" />}
                          <span className="truncate">{b.guest_name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Booking details */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl border border-stone-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between pb-3 border-b border-stone-200 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-serif font-bold text-lg text-stone-900">{selected.guest_name}</h3>
                  {selected.is_vip && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                      <IconCrown className="w-3 h-3" /> VIP
                    </span>
                  )}
                </div>
                <span className={`mt-1 inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${BAR[selected.status]}`}>
                  {STATUS_LABEL[selected.status]}
                </span>
              </div>
              <button onClick={() => setSelected(null)} title="Yopish" aria-label="Yopish" className="text-stone-400 hover:text-stone-700">
                <IconX className="w-5 h-5" />
              </button>
            </div>
            {error && <div className="mb-3 p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">{error}</div>}
            <dl className="text-xs space-y-2">
              {[
                ["Xona", rooms.find((r) => r.id === selected.room)?.room_number || "—"],
                ["Muddat", `${selected.check_in} → ${selected.check_out} (${selected.nights} tun)`],
                ["Kishilar", `${selected.num_adults} katta${selected.num_children ? `, ${selected.num_children} bola` : ""}`],
                ["Summa", money(selected.total_amount, selected.currency)],
                ["Bron", selected.reference],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-stone-500">{k}</dt>
                  <dd className="font-semibold text-stone-900 text-right">{v}</dd>
                </div>
              ))}
              {selected.guest_phone && (
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Telefon</dt>
                  <dd>
                    <a href={`tel:${selected.guest_phone}`} className="font-semibold text-stone-900 inline-flex items-center gap-1 hover:underline">
                      <IconPhone className="w-3 h-3" /> {selected.guest_phone}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            {selected.special_requests && (
              <div className="mt-3 p-2.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-950 flex gap-1.5">
                <IconMessage className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {selected.special_requests}
              </div>
            )}
            <div className="mt-5 pt-4 border-t border-stone-200 flex flex-wrap items-center gap-2">
              {selected.status === "confirmed" && selected.check_in <= today && (
                <button
                  disabled={stayAction.isPending}
                  onClick={() => stayAction.mutate({ id: selected.id, kind: "check-in" })}
                  className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <IconDoorEnter className="w-4 h-4" /> Check-in
                </button>
              )}
              {selected.status === "checked_in" && (
                <button
                  disabled={stayAction.isPending}
                  onClick={() => stayAction.mutate({ id: selected.id, kind: "check-out" })}
                  className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <IconDoorExit className="w-4 h-4" /> Check-out
                </button>
              )}
              {(selected.status === "confirmed" || selected.status === "pending") && (
                <button
                  disabled={stayAction.isPending}
                  onClick={() => {
                    const reason = prompt("Bekor qilish sababi:");
                    if (reason !== null) stayAction.mutate({ id: selected.id, kind: "cancel", reason });
                  }}
                  className="px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <IconBan className="w-4 h-4" /> Bekor qilish
                </button>
              )}
              <Link
                href={`${base}/rooms/${selected.room}`}
                className="ml-auto px-3 py-2 text-xs font-semibold text-stone-700 hover:text-stone-950 inline-flex items-center gap-1"
              >
                Xona sahifasi <IconExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {newBooking && <NewBookingModal prefill={newBooking} onClose={() => setNewBooking(null)} />}
    </div>
  );
}
