import { DashboardNav } from "@/components/layout/DashboardNav";

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <DashboardNav />
      <div className="flex-1">{children}</div>
    </div>
  );
}
