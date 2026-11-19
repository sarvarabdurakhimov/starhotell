"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconCheck,
  IconPlus,
  IconToolsKitchen2,
  IconTrash,
  IconTruckDelivery,
  IconX,
} from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { apiError, money } from "@/lib/api/helpers";
import { usePanel } from "@/lib/panel-context";

interface OrderLine {
  name: string;
  price: string;
  quantity: number;
}
interface Order {
  id: number;
  status: "new" | "accepted" | "delivered" | "cancelled";
  status_display: string;
  room_number: string;
  guest_name: string;
  guest_phone: string;
  booking_reference: string;
  note: string;
  total: string;
  is_paid: boolean;
  lines: OrderLine[];
  created_at: string;
  delivered_at: string | null;
  handled_by: string | null;
}
interface Item {
  id: number;
  name: string;
  category: string;
  category_display: string;
  price: string;
  is_active: boolean;
  stock: number | null;
  low_stock: number;
  is_low: boolean;
}
interface GuestRequest {
  id: number;
  kind: "cleaning" | "repair";
  kind_display: string;
  text: string;
  status: "new" | "accepted" | "done" | "cancelled";
  status_display: string;
  room_number: string;
  guest_name: string;
  guest_phone: string;
  created_at: string;
  done_at: string | null;
  handled_by: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  new: "bg-amber-100 text-amber-900 border-amber-300",
  accepted: "bg-sky-100 text-sky-900 border-sky-300",
  delivered: "bg-emerald-100 text-emerald-900 border-emerald-300",
  done: "bg-emerald-100 text-emerald-900 border-emerald-300",
  cancelled: "bg-stone-100 text-stone-600 border-stone-300",
};

const time = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Tab = "open" | "delivered" | "cancelled" | "requests" | "menu";

export default function OrdersPage() {
  const { hotelId, role, staffRole } = usePanel();
  const qc = useQueryClient();
  const canEditMenu = role === "owner" || role === "manager";
  const canHandle = canEditMenu || staffRole === "receptionist" || staffRole === "housekeeping";
  const [tab, setTab] = useState<Tab>("open");
  const [error, setError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ name: "", category: "other", price: "" });

  const [requestFilter, setRequestFilter] = useState<"open" | "done">("open");
  const requests = useQuery({
    queryKey: ["guest-requests", hotelId, requestFilter],
    enabled: tab === "requests",
    refetchInterval: requestFilter === "open" ? 15000 : false,
    queryFn: async () =>
      (await apiClient.get<GuestRequest[]>(`/room-service/hotels/${hotelId}/requests/`, {
        params: { status: requestFilter },
      })).data,
  });
  const updateRequest = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiClient.patch(`/room-service/hotels/${hotelId}/requests/${id}/`, { status }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["guest-requests", hotelId] });
    },
    onError: (e: unknown) => setError(apiError(e)),
  });

  const orders = useQuery({
    queryKey: ["service-orders", hotelId, tab],
    enabled: tab !== "menu" && tab !== "requests",
    refetchInterval: tab === "open" ? 15000 : false, // new orders appear without a reload
    queryFn: async () =>
      (await apiClient.get<Order[]>(`/room-service/hotels/${hotelId}/orders/`, { params: { status: tab } })).data,
  });
  const menu = useQuery({
    queryKey: ["service-items", hotelId],
    queryFn: async () =>
      (await apiClient.get<{ items: Item[]; categories: { value: string; label: string }[] }>(
        `/room-service/hotels/${hotelId}/items/`,
      )).data,
  });

  const done = () => {
    setError(null);
    qc.invalidateQueries({ queryKey: ["service-orders", hotelId] });
    qc.invalidateQueries({ queryKey: ["service-items", hotelId] });
  };
  const onError = (e: unknown) => setError(apiError(e));

  const updateOrder = useMutation({
    mutationFn: ({ id, ...body }: { id: number; status?: string; is_paid?: boolean }) =>
      apiClient.patch(`/room-service/hotels/${hotelId}/orders/${id}/`, body),
    onSuccess: done,
    onError,
  });
  const addItem = useMutation({
    mutationFn: () => apiClient.post(`/room-service/hotels/${hotelId}/items/`, { ...newItem, price: newItem.price || 0 }),
    onSuccess: () => {
      setNewItem({ name: "", category: newItem.category, price: "" });
      done();
    },
    onError,
  });
  const updateItem = useMutation({
    mutationFn: ({ id, ...body }: {
      id: number; price?: string; is_active?: boolean; stock?: number | null; low_stock?: number;
    }) =>
      apiClient.patch(`/room-service/hotels/${hotelId}/items/${id}/`, body),
    onSuccess: done,
    onError,
  });
  const deleteItem = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/room-service/hotels/${hotelId}/items/${id}/`),
    onSuccess: done,
    onError,
  });
  const addDefaults = useMutation({
    mutationFn: () => apiClient.post(`/room-service/hotels/${hotelId}/items/defaults/`),
    onSuccess: done,
    onError,
  });

  const busy = updateOrder.isPending;
  const tabs: { key: Tab; label: string }[] = [
    { key: "open", label: "Faol" },
    { key: "delivered", label: "Yetkazilgan" },
    { key: "cancelled", label: "Bekor qilingan" },
    { key: "requests", label: "So'rovlar (tozalash, ta'mir)" },
    ...(canEditMenu ? [{ key: "menu" as Tab, label: "Menyu" }] : []),
  ];
  const btn = "px-2.5 py-1.5 rounded text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50 transition";

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col gap-1 pb-4 border-b border-stone-200">
        <h1 className="text-2xl font-serif font-bold text-stone-900 flex items-center gap-2">
          <IconToolsKitchen2 className="w-6 h-6 text-amber-600" /> Buyurtmalar
        </h1>
        <p className="text-xs text-stone-500">
          Joylashgan mehmonlar Telegram botdan xonaga suv, meva, sochiq, ko&apos;rpa, ovqat va boshqalarni buyurtma qiladi,
          xonani tozalashni so&apos;raydi yoki texnik muammo haqida xabar beradi. Menyuda ombor qoldig&apos;ini kuzatish mumkin.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setError(null); }}
            className={`px-3.5 py-1.5 rounded text-xs font-semibold border transition ${
              tab === t.key ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">{error}</div>}

      {tab === "requests" && (
        <div className="space-y-3">
          <div className="flex gap-1">
            {(["open", "done"] as const).map((f) => (
              <button key={f} onClick={() => setRequestFilter(f)}
                className={`px-3 py-1 rounded text-[11px] font-semibold border ${
                  requestFilter === f ? "bg-amber-600 text-white border-amber-600" : "bg-white text-stone-600 border-stone-300"}`}>
                {f === "open" ? "Faol" : "Bajarilgan"}
              </button>
            ))}
          </div>
          {requests.isLoading ? (
            <p className="text-xs text-stone-400">Yuklanmoqda...</p>
          ) : !requests.data?.length ? (
            <div className="p-8 text-center bg-white rounded border border-stone-200 text-sm text-stone-500">
              {requestFilter === "open" ? "Hozircha so'rov yo'q." : "Bajarilgan so'rov yo'q."}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {requests.data.map((r) => (
                <div key={r.id} className="bg-white rounded border border-stone-200 shadow-sm p-4 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-2xl font-serif font-bold text-stone-900">{r.room_number}-xona</div>
                      <div className="text-xs text-stone-500">#{r.id} · {time(r.created_at)} · {r.guest_name}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>
                      {r.status_display}
                    </span>
                  </div>
                  <div className="mt-3 text-sm font-semibold text-stone-800">
                    {r.kind === "cleaning" ? "🧹" : "🔧"} {r.kind_display}
                  </div>
                  {r.text && (
                    <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-950">💬 {r.text}</div>
                  )}
                  {canHandle && (r.status === "new" || r.status === "accepted") && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.status === "new" && (
                        <button disabled={updateRequest.isPending}
                          onClick={() => updateRequest.mutate({ id: r.id, status: "accepted" })}
                          className={`${btn} bg-sky-700 hover:bg-sky-800 text-white`}>
                          <IconCheck className="w-3.5 h-3.5" /> Qabul qilish
                        </button>
                      )}
                      <button disabled={updateRequest.isPending}
                        onClick={() => updateRequest.mutate({ id: r.id, status: "done" })}
                        className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>
                        <IconCheck className="w-3.5 h-3.5" /> Bajarildi
                      </button>
                      <button disabled={updateRequest.isPending}
                        onClick={() => confirm(`#${r.id} so'rovni bekor qilasizmi? Mehmonga xabar boradi.`) &&
                          updateRequest.mutate({ id: r.id, status: "cancelled" })}
                        className={`${btn} bg-stone-100 hover:bg-rose-100 text-stone-700 border border-stone-300`}>
                        <IconX className="w-3.5 h-3.5" /> Bekor
                      </button>
                    </div>
                  )}
                  {r.handled_by && <div className="mt-2 text-[11px] text-stone-400">Xodim: {r.handled_by}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab !== "menu" && tab !== "requests" && (
        orders.isLoading ? (
          <p className="text-xs text-stone-400">Yuklanmoqda...</p>
        ) : !orders.data?.length ? (
          <div className="p-8 text-center bg-white rounded border border-stone-200 text-sm text-stone-500">
            {tab === "open" ? "Hozircha yangi buyurtma yo'q." : "Buyurtma yo'q."}
            {tab === "open" && !menu.data?.items.length && canEditMenu && (
              <p className="mt-2 text-xs">Avval «Menyu» bo&apos;limida mehmonlar buyurtma qila oladigan narsalarni qo&apos;shing.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {orders.data.map((o) => (
              <div key={o.id} className="bg-white rounded border border-stone-200 shadow-sm p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-2xl font-serif font-bold text-stone-900">{o.room_number}-xona</div>
                    <div className="text-xs text-stone-500">
                      #{o.id} · {time(o.created_at)} · {o.guest_name}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${STATUS_STYLE[o.status]}`}>
                    {o.status_display}
                  </span>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-stone-800">
                  {o.lines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{l.name} × {l.quantity}</span>
                      <span className="font-mono text-xs text-stone-500">
                        {Number(l.price) ? money(Number(l.price) * l.quantity) : "bepul"}
                      </span>
                    </li>
                  ))}
                </ul>
                {o.note && (
                  <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-950">💬 {o.note}</div>
                )}
                <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between text-sm">
                  <span className="font-bold">{money(o.total)}</span>
                  {Number(o.total) > 0 && o.status !== "cancelled" && (
                    <label className="flex items-center gap-1.5 text-xs text-stone-600">
                      <input type="checkbox" checked={o.is_paid} disabled={!canHandle || busy}
                        onChange={(e) => updateOrder.mutate({ id: o.id, is_paid: e.target.checked })} />
                      To&apos;langan
                    </label>
                  )}
                </div>
                {canHandle && (o.status === "new" || o.status === "accepted") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {o.status === "new" && (
                      <button disabled={busy} onClick={() => updateOrder.mutate({ id: o.id, status: "accepted" })}
                        className={`${btn} bg-sky-700 hover:bg-sky-800 text-white`}>
                        <IconCheck className="w-3.5 h-3.5" /> Qabul qilish
                      </button>
                    )}
                    <button disabled={busy} onClick={() => updateOrder.mutate({ id: o.id, status: "delivered" })}
                      className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>
                      <IconTruckDelivery className="w-3.5 h-3.5" /> Yetkazildi
                    </button>
                    <button disabled={busy}
                      onClick={() => confirm(`#${o.id} buyurtmani bekor qilasizmi? Mehmonga xabar boradi.`) &&
                        updateOrder.mutate({ id: o.id, status: "cancelled" })}
                      className={`${btn} bg-stone-100 hover:bg-rose-100 text-stone-700 border border-stone-300`}>
                      <IconX className="w-3.5 h-3.5" /> Bekor
                    </button>
                  </div>
                )}
                {o.handled_by && <div className="mt-2 text-[11px] text-stone-400">Xodim: {o.handled_by}</div>}
              </div>
            ))}
          </div>
        )
      )}

      {tab === "menu" && canEditMenu && (
        <div className="space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); addItem.mutate(); }}
            className="bg-white rounded border border-stone-200 p-4 grid grid-cols-1 sm:grid-cols-[1fr_180px_160px_auto] gap-2 items-end"
          >
            <label className="text-[11px] font-bold text-stone-600 uppercase">
              Nomi
              <input required value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                placeholder="Masalan: Suv 0,5 L" className="mt-1 w-full px-3 py-2 border border-stone-300 rounded text-sm normal-case font-normal" />
            </label>
            <label className="text-[11px] font-bold text-stone-600 uppercase">
              Turi
              <select value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white normal-case font-normal">
                {menu.data?.categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-bold text-stone-600 uppercase">
              Narx (so&apos;m)
              <input type="number" min="0" step="1000" value={newItem.price} placeholder="0 = bepul"
                onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-stone-300 rounded text-sm normal-case font-normal" />
            </label>
            <button disabled={addItem.isPending}
              className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded text-xs font-semibold inline-flex items-center gap-1.5 justify-center disabled:opacity-50">
              <IconPlus className="w-4 h-4 text-amber-400" /> Qo&apos;shish
            </button>
          </form>

          {menu.data && menu.data.items.length === 0 && (
            <div className="p-6 text-center bg-white rounded border border-stone-200 text-sm text-stone-600">
              Menyu bo&apos;sh.
              <button disabled={addDefaults.isPending} onClick={() => addDefaults.mutate()}
                className="ml-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold disabled:opacity-50">
                Standart ro&apos;yxatni qo&apos;shish
              </button>
              <p className="mt-2 text-xs text-stone-400">Suv, choy, meva, osh, sochiq, ko&apos;rpa, ko&apos;rpacha, yostiq va h.k. Narxlarni keyin o&apos;zgartirasiz.</p>
            </div>
          )}

          {!!menu.data?.items.length && (
            <div className="bg-white rounded border border-stone-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-[11px] uppercase text-stone-500">
                  <tr>
                    <th className="text-left px-4 py-2">Nomi</th>
                    <th className="text-left px-4 py-2">Turi</th>
                    <th className="text-left px-4 py-2">Narx (so&apos;m)</th>
                    <th className="text-left px-4 py-2" title="Bo'sh = sanalmaydi">Qoldiq</th>
                    <th className="text-left px-4 py-2" title="Shu songa tushganda Telegram'da ogohlantiriladi">Ogohlantirish</th>
                    <th className="text-left px-4 py-2">Ko&apos;rinadi</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {menu.data.items.map((it) => (
                    <tr key={it.id} className={`border-t border-stone-100 ${it.is_active ? "" : "opacity-50"}`}>
                      <td className="px-4 py-2 font-medium">{it.name}</td>
                      <td className="px-4 py-2 text-stone-500">{it.category_display}</td>
                      <td className="px-4 py-2">
                        <input type="number" min="0" step="1000" defaultValue={Math.round(Number(it.price))}
                          onBlur={(e) => {
                            if (Number(e.target.value) !== Math.round(Number(it.price)))
                              updateItem.mutate({ id: it.id, price: e.target.value || "0" });
                          }}
                          className="w-32 px-2 py-1 border border-stone-300 rounded text-sm font-mono" />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <input type="number" min="0" step="1" defaultValue={it.stock ?? ""} placeholder="—"
                            key={`stock-${it.id}-${it.stock}`}
                            onBlur={(e) => {
                              const v = e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value)));
                              if (v !== it.stock) updateItem.mutate({ id: it.id, stock: v });
                            }}
                            className="w-20 px-2 py-1 border border-stone-300 rounded text-sm font-mono" />
                          {it.stock === 0 ? (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-semibold">Tugagan</span>
                          ) : it.is_low ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-semibold">Kam qoldi</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min="0" step="1" defaultValue={it.low_stock}
                          key={`low-${it.id}-${it.low_stock}`}
                          onBlur={(e) => {
                            const v = Math.max(0, Math.round(Number(e.target.value) || 0));
                            if (v !== it.low_stock) updateItem.mutate({ id: it.id, low_stock: v });
                          }}
                          className="w-16 px-2 py-1 border border-stone-300 rounded text-sm font-mono" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={it.is_active}
                          onChange={(e) => updateItem.mutate({ id: it.id, is_active: e.target.checked })} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button title="O'chirish" aria-label="O'chirish"
                          onClick={() => confirm(`«${it.name}» menyudan o'chirilsinmi?`) && deleteItem.mutate(it.id)}
                          className="p-1 text-stone-400 hover:text-rose-700">
                          <IconTrash className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
