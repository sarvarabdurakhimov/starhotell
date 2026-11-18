"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";
import { apiError } from "@/lib/api/helpers";
import { ROLE_BASE, setSession } from "@/lib/session";
import {
  IconArrowLeft,
  IconBuilding,
} from "@tabler/icons-react";

export default function CreateHotelPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    city: "Tashkent",
    country: "Uzbekistan",
    timezone: "Asia/Tashkent",
    address_line1: "",
    phone: "",
    email: "",
    star_rating: 4,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiClient.post("/hotels/create/", formData);
      // Yaratuvchi shu mehmonxonaning boshlig'i bo'ladi
      const me = (await apiClient.get<{
        email: string;
        full_name?: string;
        memberships?: Array<{ hotel_id: number; hotel_name: string; role: string }>;
      }>("/auth/me/")).data;
      const created = (me.memberships || [])
        .filter((m) => m.role === "owner" && m.hotel_name === formData.name)
        .sort((a, b) => b.hotel_id - a.hotel_id)[0];
      if (created) {
        setSession({ email: me.email, name: me.full_name || me.email, role: "owner", hotelId: created.hotel_id });
        router.push(ROLE_BASE.owner);
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 mb-6"
      >
        <IconArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="bg-white border border-slate-200/80 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <IconBuilding className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">New Hotel</h1>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Hotel Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm"
              placeholder="Mehmonxona nomi"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                City
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Country
              </label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Valyuta
              </label>
              <div className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-600">
                O&apos;zbek so&apos;mi (UZS)
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Timezone
              </label>
              <input
                type="text"
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Link
              href="/dashboard"
              className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow transition disabled:opacity-50"
            >
              {loading ? "Saving..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
