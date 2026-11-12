import { PanelShell } from "@/components/layout/PanelShell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PanelShell role="staff">{children}</PanelShell>;
}
