"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { apiError, asList } from "@/lib/api/helpers";
import { usePanel } from "@/lib/panel-context";
import type { Guest, PaginatedResponse } from "@/types";

const emptyGuest = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  nationality: "",
  id_number: "",
  is_vip: false,
};

export default function GuestsPage() {
  const { hotelId } = usePanel();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyGuest);
  const [error, setError] = useState<string | null>(null);

  const { data: guests = [], isLoading } = useQuery({
    queryKey: ["guests", hotelId],
    queryFn: async () =>
      asList((await apiClient.get<PaginatedResponse<Guest>>(`/guests/hotels/${hotelId}/guests/`)).data),
  });

  const create = useMutation({
    mutationFn: async () =>
      apiClient.post(`/guests/hotels/${hotelId}/guests/`, {
        ...form,
        id_type: form.id_number ? "passport" : "",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guests", hotelId] });
      setShowModal(false);
      setForm(emptyGuest);
      setError(null);
    },
    onError: (err) => setError(apiError(err)),
  });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? guests.filter((g) =>
        [g.full_name, g.email, g.phone, g.id_number].some((v) => (v || "").toLowerCase().includes(q))
      )
    : guests;

  const input = (key: keyof typeof emptyGuest, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="block font-bold text-stone-700 uppercase mb-1">{label}</label>
      <input
        {...props}
        value={form[key] as string}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
      />
    </div>
  );

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <h1 className="text-2xl font-serif font-bold text-stone-900">Mehmonlar</h1>
        <button
          onClick={() => {
            setError(null);
            setShowModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs rounded shadow-sm transition"
        >
          <IconPlus className="w-4 h-4 text-amber-400" /> Yangi mehmon
        </button>
      </div>

      <div className="relative max-w-md">
        <IconSearch className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Qidiruv..."
          className="w-full pl-9 pr-4 py-2 border border-stone-300 rounded text-xs focus:border-stone-900 outline-none bg-white shadow-sm"
        />
      </div>

      <div className="bg-white border border-stone-200 rounded shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-stone-100 text-stone-700 font-semibold uppercase tracking-wider text-[11px] border-b border-stone-200">
            <tr>
              <th className="py-3 px-4">№</th>
              <th className="py-3 px-4">Mehmon</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Tel</th>
              <th className="py-3 px-4">Fuqarolik</th>
              <th className="py-3 px-4">Pasport</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 font-medium">
            {isLoading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-stone-400">Yuklanmoqda...</td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-stone-400">Mehmon yo&apos;q</td>
              </tr>
            )}
            {filtered.map((g, idx) => (
              <tr key={g.id} className="hover:bg-stone-50 transition">
                <td className="py-3 px-4 text-stone-400 font-mono">{idx + 1}</td>
                <td className="py-3 px-4 font-bold text-stone-900">
                  <div className="flex items-center gap-1.5">
                    {g.full_name}
                    {g.is_vip && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-amber-100 text-amber-950 border border-amber-300 rounded">
                        VIP
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 font-mono text-stone-700">{g.email || "—"}</td>
                <td className="py-3 px-4 font-mono text-stone-600">{g.phone || "—"}</td>
                <td className="py-3 px-4 text-stone-600">{g.nationality || "—"}</td>
                <td className="py-3 px-4 font-mono text-stone-600">{g.id_number || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full p-6 shadow-xl border border-stone-300">
            <h3 className="text-lg font-serif font-bold text-stone-900 mb-4">Yangi mehmon</h3>

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
              <div className="grid grid-cols-2 gap-3">
                {input("first_name", "Ism *", { required: true })}
                {input("last_name", "Familiya *", { required: true })}
              </div>
              {input("email", "Email", { type: "email" })}
              <div className="grid grid-cols-2 gap-3">
                {input("phone", "Telefon")}
                {input("id_number", "Pasport")}
              </div>
              {input("nationality", "Fuqarolik")}
              <label className="flex items-center gap-2 font-semibold text-stone-700">
                <input
                  type="checkbox"
                  checked={form.is_vip}
                  onChange={(e) => setForm({ ...form, is_vip: e.target.checked })}
                />
                VIP
              </label>

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
