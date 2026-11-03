import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { PanelProvider } from "@/lib/panel-context";
import { HOTEL_COOKIE, PanelRole, ROLE_BASE, ROLE_COOKIE } from "@/lib/session";

// Shared layout for /boshliq and /meneger. Only the matching role gets in.
export async function PanelShell({ role, children }: { role: PanelRole; children: React.ReactNode }) {
  const jar = await cookies();
  const cookieRole = jar.get(ROLE_COOKIE)?.value as PanelRole | undefined;
  const hotelId = jar.get(HOTEL_COOKIE)?.value;

  if (!cookieRole || !hotelId || !(cookieRole in ROLE_BASE)) redirect("/login");
  if (cookieRole !== role) redirect(ROLE_BASE[cookieRole]);

  return (
    <PanelProvider value={{ hotelId, role, base: ROLE_BASE[role] }}>
      <div className="min-h-screen bg-stone-100 flex flex-col font-sans">
        <DashboardNav />
        <div className="flex-1 flex">
          <DashboardSidebar />
          <main className="flex-1 p-6 md:p-8 overflow-y-auto">{children}</main>
        </div>
      </div>
    </PanelProvider>
  );
}
