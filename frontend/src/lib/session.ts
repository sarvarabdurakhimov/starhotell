// Logged-in user info kept in the browser after a real backend login.
// The role comes from the backend membership, never from the email text.
// Role and hotel are also written to cookies so the server can pick the panel
// for /boshliq and /meneger without the hotel id in the URL.

export type PanelRole = "owner" | "manager";

export interface Session {
  email: string;
  name: string;
  role: PanelRole;
  hotelId?: number;
}

const KEY = "hms_demo_user";
export const ROLE_COOKIE = "hms_role";
export const HOTEL_COOKIE = "hms_hotel";

export const ROLE_BASE: Record<PanelRole, string> = {
  owner: "/boshliq",
  manager: "/meneger",
};

export const ROLE_LABEL: Record<PanelRole, string> = {
  owner: "Boshliq",
  manager: "Meneger",
};

// Panel sub-pages each role has (matches the folders under app/boshliq and app/meneger).
const ROLE_PAGES: Record<PanelRole, string[]> = {
  owner: ["payments", "settings", "rooms", "bookings", "reports"],
  manager: ["rooms", "bookings", "housekeeping", "guests", "reports"],
};

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
    if (!s?.email || (s.role !== "owner" && s.role !== "manager")) return null;
    return s as Session;
  } catch {
    return null;
  }
}

export function setSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
  writeCookie(ROLE_COOKIE, s.role);
  if (s.hotelId) writeCookie(HOTEL_COOKIE, String(s.hotelId));
}

export function clearSession() {
  localStorage.removeItem(KEY);
  writeCookie(ROLE_COOKIE, null);
  writeCookie(HOTEL_COOKIE, null);
}
