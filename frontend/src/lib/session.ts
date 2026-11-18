// Logged-in user info kept in the browser after a real backend login.
// The role comes from the backend membership, never from the email text.
// Role and hotel are also written to cookies so the server can pick the panel
// for /boshliq and /meneger without the hotel id in the URL.

export type PanelRole = "owner" | "manager" | "staff";

export interface Session {
  email: string;
  name: string;
  role: PanelRole;
  hotelId?: number;
  hotelRole?: string; // the backend membership role (receptionist, housekeeping, …) for the staff panel
}

const KEY = "hms_demo_user";
export const ROLE_COOKIE = "hms_role";
export const HOTEL_COOKIE = "hms_hotel";
export const STAFF_ROLE_COOKIE = "hms_staff_role";

export const ROLE_BASE: Record<PanelRole, string> = {
  owner: "/boshliq",
  manager: "/meneger",
  staff: "/xodim",
};

export const ROLE_LABEL: Record<PanelRole, string> = {
  owner: "Boshliq",
  manager: "Meneger",
  staff: "Xodim",
};

// Every other hotel role logs into the shared staff panel and sees only its own pages.
export const STAFF_ROLE_LABEL: Record<string, string> = {
  receptionist: "Qabulxona",
  housekeeping: "Tozalovchi",
  finance: "Moliya xodimi",
  auditor: "Auditor",
};

export const STAFF_PAGES: Record<string, string[]> = {
  receptionist: ["calendar", "bookings", "rooms", "guests", "housekeeping", "orders"],
  housekeeping: ["housekeeping", "orders", "rooms"],
  finance: ["calendar", "bookings"],
  auditor: ["calendar", "bookings"],
};

// Panel sub-pages each role has (matches the folders under app/boshliq and app/meneger).
const ROLE_PAGES: Record<PanelRole, string[]> = {
  owner: ["settings", "rooms", "bookings", "guests", "reviews", "reports", "orders"],
  manager: ["rooms", "bookings", "housekeeping", "guests", "reviews", "reports", "orders"],
  staff: ["calendar", "bookings", "rooms", "guests", "housekeeping", "orders"],
};

// Who may create / cancel bookings and check guests in or out. The backend enforces the same rule
// (FRONT_DESK in backend/apps/common/permissions.py); here it only hides buttons that would get a 403.
export function isFrontDesk(role?: PanelRole, staffRole?: string): boolean {
  return role === "owner" || role === "manager" || (role === "staff" && staffRole === "receptionist");
}

export function panelPath(role: PanelRole, sub?: string): string {
  const base = ROLE_BASE[role];
  return sub && ROLE_PAGES[role].includes(sub) ? `${base}/${sub}` : base;
}

function writeCookie(name: string, value: string | null) {
  document.cookie = value === null
    ? `${name}=; path=/; max-age=0; samesite=lax`
    : `${name}=${encodeURIComponent(value)}; path=/; samesite=lax`;
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.email || !(s.role in ROLE_BASE)) return null;
    return s as Session;
  } catch {
    return null;
  }
}

export function setSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
  writeCookie(ROLE_COOKIE, s.role);
  if (s.hotelId) writeCookie(HOTEL_COOKIE, String(s.hotelId));
  writeCookie(STAFF_ROLE_COOKIE, s.role === "staff" ? s.hotelRole || null : null);
}

export function clearSession() {
  localStorage.removeItem(KEY);
  writeCookie(ROLE_COOKIE, null);
  writeCookie(HOTEL_COOKIE, null);
  writeCookie(STAFF_ROLE_COOKIE, null);
}
