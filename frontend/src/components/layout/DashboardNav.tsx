"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconLogout, IconBriefcase, IconCrown } from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { clearSession, getSession, ROLE_LABEL, Session } from "@/lib/session";

export function DashboardNav({ user }: { user?: any }) {
  const router = useRouter();
  const [session, setSessionState] = useState<Session | null>(null);

  // Login bo'lmagan bo'lsa — /login. Rol tekshiruvi /boshliq va /meneger layout'ida (serverda).
  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    setSessionState(s);
  }, [router]);

  const handleLogout = async () => {
    try {
      await apiClient.post("/auth/logout/");
    } catch {
      // ignore
    } finally {
      clearSession();
      router.push("/login");
    }
  };

  const isManager = session?.role === "manager";
  const RoleIcon = isManager ? IconBriefcase : IconCrown;

  return (
    <header className="h-16 border-b border-stone-200 bg-white px-6 flex items-center justify-between sticky top-0 z-40">
      <Link href="/dashboard" className="flex items-center gap-2.5">
        <img src="/logo.png" alt="StarHotel" className="w-8 h-8 object-contain rounded" />
        <span className="font-serif tracking-widest text-lg font-bold text-stone-900 uppercase">
          StarHotel
        </span>
      </Link>

      {session && (
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold ${
              isManager
                ? "bg-emerald-100 text-emerald-950 border-emerald-300"
                : "bg-amber-100 text-amber-950 border-amber-300"
            }`}
          >
            <RoleIcon className="w-3.5 h-3.5" />
            {ROLE_LABEL[session.role]}
          </span>

          <div className="flex items-center gap-3 pl-3 border-l border-stone-200">
            <div className="text-right hidden md:block">
              <div className="text-xs font-bold text-stone-900">{session.name}</div>
            </div>

            <div className="w-8 h-8 rounded bg-stone-200 text-stone-800 flex items-center justify-center font-bold text-xs border border-stone-300">
              {session.name ? session.name[0] : "U"}
            </div>

            <button
              onClick={handleLogout}
              title="Chiqish"
              className="text-stone-400 hover:text-stone-900 p-1.5 rounded hover:bg-stone-100 transition"
            >
              <IconLogout className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
