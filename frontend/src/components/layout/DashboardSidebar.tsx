"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconLayoutDashboard,
  IconCalendarCheck,
  IconBed,
  IconUsers,
  IconSparkles,
  IconReceipt,
  IconChartBar,
} from "@tabler/icons-react";
import { usePanel } from "@/lib/panel-context";
import { ROLE_LABEL } from "@/lib/session";

export function DashboardSidebar() {
  const pathname = usePathname();
  const { role, base } = usePanel();

  const links =
    role === "manager"
      ? [
          { label: "Boshqaruv", href: base, icon: IconLayoutDashboard },
          { label: "Xonalar", href: `${base}/rooms`, icon: IconBed },
          { label: "Bronlar", href: `${base}/bookings`, icon: IconCalendarCheck },
          { label: "Tozalash", href: `${base}/housekeeping`, icon: IconSparkles },
          { label: "Mehmonlar", href: `${base}/guests`, icon: IconUsers },
          { label: "Hisobotlar", href: `${base}/reports`, icon: IconChartBar },
        ]
      : [
          { label: "Boshqaruv", href: base, icon: IconLayoutDashboard },
          { label: "Moliya", href: `${base}/payments`, icon: IconReceipt },
          { label: "Xodimlar", href: `${base}/settings`, icon: IconUsers },
          { label: "Xonalar", href: `${base}/rooms`, icon: IconBed },
          { label: "Bronlar", href: `${base}/bookings`, icon: IconCalendarCheck },
          { label: "Hisobotlar", href: `${base}/reports`, icon: IconChartBar },
        ];

  return (
    <aside className="w-64 border-r border-stone-200 bg-stone-50 min-h-[calc(100vh-4rem)] p-4 flex flex-col justify-between">
      <nav className="space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-stone-500">
          {ROLE_LABEL[role]}
        </div>

        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.label}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition ${
                isActive
                  ? "bg-stone-900 text-white font-semibold shadow-sm"
                  : "text-stone-700 hover:bg-stone-200/70 hover:text-stone-950"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-amber-400" : "text-stone-500"}`} />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="pt-4 border-t border-stone-200">
        <Link
          href="/dashboard"
          className="text-xs text-stone-700 hover:text-stone-950 font-semibold flex items-center justify-center p-2 rounded bg-stone-200/60 hover:bg-stone-200 transition border border-stone-300"
        >
          &larr; Mehmonxonalar
        </Link>
      </div>
    </aside>
  );
}
