"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSession, panelPath, setSession } from "@/lib/session";

// Old /hotels/<id>/<page> links -> /boshliq/<page> or /meneger/<page>.
export function LegacyHotelRedirect() {
  const router = useRouter();
  const pathname = usePathname() || "";

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    const [, , id, sub] = pathname.split("/");
    const hotelId = Number(id);
    if (hotelId && hotelId !== session.hotelId) {
      setSession({ ...session, hotelId });
    } else {
      setSession(session); // make sure cookies exist
    }
    router.replace(panelPath(session.role, sub));
  }, [pathname, router]);

  return null;
}
