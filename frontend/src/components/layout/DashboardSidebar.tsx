"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconAddressBook,
  IconArrowLeft,
  IconBed,
  IconCalendarCheck,
  IconCalendarMonth,
  IconChartBar,
  IconLayoutDashboard,
  IconSparkles,
  IconStar,
  IconUsers,
  IconToolsKitchen2,
} from "@tabler/icons-react";
import { usePanel } from "@/lib/panel-context";
import { ROLE_LABEL, STAFF_PAGES, STAFF_ROLE_LABEL } from "@/lib/session";

export function DashboardSidebar() {
  const pathname = usePathname();
  const { role, base, staffRole } = usePanel();

  // Staff panel: only the pages this hotel role works with
  const STAFF_LINKS: Record<string, { label: string; icon: typeof IconBed }> = {
    calendar: { label: "Kalendar", icon: IconCalendarMonth },
    bookings: { label: "Bronlar", icon: IconCalendarCheck },
    rooms: { label: "Xonalar", icon: IconBed },
    guests: { label: "Mehmonlar", icon: IconUsers },
    housekeeping: { label: "Tozalash", icon: IconSparkles },
    orders: { label: "Buyurtmalar", icon: IconToolsKitchen2 },
  };

  const links =
    role === "staff"
      ? (STAFF_PAGES[staffRole || ""] || []).map((p) => ({ label: STAFF_LINKS[p].label, href: `${base}/${p}`, icon: STAFF_LINKS[p].icon }))
      : role === "manager"
      ? [
          { label: "Boshqaruv", href: base, icon: IconLayoutDashboard },
          { label: "Kalendar", href: `${base}/calendar`, icon: IconCalendarMonth },
          { label: "Xonalar", href: `${base}/rooms`, icon: IconBed },
          { label: "Bronlar", href: `${base}/bookings`, icon: IconCalendarCheck },
          { label: "Tozalash", href: `${base}/housekeeping`, icon: IconSparkles },
          { label: "Buyurtmalar", href: `${base}/orders`, icon: IconToolsKitchen2 },
          { label: "Mehmonlar", href: `${base}/guests`, icon: IconUsers },
          { label: "Sharhlar", href: `${base}/reviews`, icon: IconStar },
          { label: "Hisobotlar", href: `${base}/reports`, icon: IconChartBar },
        ]
      : [
          { label: "Boshqaruv", href: base, icon: IconLayoutDashboard },
          { label: "Xodimlar", href: `${base}/settings`, icon: IconUsers },
          { label: "Kalendar", href: `${base}/calendar`, icon: IconCalendarMonth },
          { label: "Xonalar", href: `${base}/rooms`, icon: IconBed },
          { label: "Bronlar", href: `${base}/bookings`, icon: IconCalendarCheck },
          { label: "Mehmonlar", href: `${base}/guests`, icon: IconAddressBook },
          { label: "Buyurtmalar", href: `${base}/orders`, icon: IconToolsKitchen2 },
          { label: "Sharhlar", href: `${base}/reviews`, icon: IconStar },
          { label: "Hisobotlar", href: `${base}/reports`, icon: IconChartBar },
        ];

  return (
    // Sticky under the 4rem top nav, so the menu stays put while the page scrolls
    <aside className="w-64 shrink-0 border-r border-stone-200 bg-stone-50 sticky top-16 self-start h-[calc(100vh-4rem)] overflow-y-auto p-4 flex flex-col justify-between">
      <nav className="space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-stone-500">
          {role === "staff" ? STAFF_ROLE_LABEL[staffRole || ""] || ROLE_LABEL.staff : ROLE_LABEL[role]}
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

      {role !== "staff" && (
      <div className="pt-4 border-t border-stone-200">
        <Link
          href="/dashboard"
          className="text-xs text-stone-700 hover:text-stone-950 font-semibold flex items-center justify-center p-2 rounded bg-stone-200/60 hover:bg-stone-200 transition border border-stone-300"
        >
          <IconArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Mehmonxonalar
        </Link>
      </div>
      )}
    </aside>
  );
}
