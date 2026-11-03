import { LegacyHotelRedirect } from "@/components/layout/LegacyHotelRedirect";

// Panels now live at /boshliq and /meneger; this route only forwards old links.
export default function HotelLayout() {
  return <LegacyHotelRedirect />;
}
