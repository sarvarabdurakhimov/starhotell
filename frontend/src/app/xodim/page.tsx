import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STAFF_PAGES, STAFF_ROLE_COOKIE } from "@/lib/session";

// The staff panel has no dashboard: open the first page this role works with.
export default async function Page() {
  const staffRole = (await cookies()).get(STAFF_ROLE_COOKIE)?.value || "";
  const first = STAFF_PAGES[staffRole]?.[0];
  redirect(first ? `/xodim/${first}` : "/login");
}
