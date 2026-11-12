"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";
import { clearSession, setSession, PanelRole, ROLE_BASE, STAFF_PAGES } from "@/lib/session";

interface MeResponse {
  email: string;
  full_name?: string;
  memberships?: Array<{ hotel_id: number; hotel_name: string; role: string }>;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (msg: string) => {
    setError(msg);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    clearSession();

    try {
      await apiClient.post("/auth/login/", { email: email.trim().toLowerCase(), password });
    } catch (err: any) {
      const status = err?.response?.status;
      if (!status) return fail("Server bilan aloqa yo'q.");
      if (status === 429) return fail("Juda ko'p urinish. Bir daqiqadan keyin qayta urinib ko'ring.");
      if (status >= 500) return fail("Serverda xatolik. Keyinroq urinib ko'ring.");
      return fail("Email yoki parol noto'g'ri.");
    }

    // Rol backend'dagi a'zolikdan olinadi
    let me: MeResponse;
    try {
      me = (await apiClient.get<MeResponse>("/auth/me/")).data;
    } catch {
      return fail("Profilni yuklab bo'lmadi.");
    }

    const memberships = me.memberships || [];
    // Owner first, then manager, then any staff role (receptionist, housekeeping, …)
    const pick =
      memberships.find((m) => m.role === "owner") ||
      memberships.find((m) => m.role === "manager") ||
      memberships.find((m) => m.role in STAFF_PAGES);

    if (!pick) {
      await apiClient.post("/auth/logout/").catch(() => {});
      return fail("Bu akkaunt hali mehmonxonaga biriktirilmagan. Boshliq sizni taklif qilishi kerak.");
    }

    const role: PanelRole = pick.role === "owner" || pick.role === "manager" ? pick.role : "staff";
    setSession({
      email: me.email,
      name: me.full_name || me.email,
      role,
      hotelId: pick.hotel_id,
      hotelRole: pick.role,
    });
    router.push(ROLE_BASE[role]);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-stone-900">Kirish</h2>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">Email</label>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 border border-stone-300 rounded focus:outline-none focus:border-stone-800 text-sm bg-white"
            placeholder="email@example.com"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">Parol</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-stone-300 rounded focus:outline-none focus:border-stone-800 text-sm bg-white"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 text-sm font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded transition disabled:opacity-50"
        >
          {loading ? "Kirmoqda..." : "Kirish"}
        </button>
      </form>
    </div>
  );
}
