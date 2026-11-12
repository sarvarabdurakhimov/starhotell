import type { PaginatedResponse } from "@/types";

// List endpoints return { count, results }; a few return a plain array.
export function asList<T>(data: T[] | PaginatedResponse<T> | undefined | null): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : data.results || [];
}

// Readable message from a DRF error response.
export function apiError(err: any, fallback = "Xatolik yuz berdi."): string {
  const data = err?.response?.data;
  if (!err?.response) return "Server bilan aloqa yo'q.";
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);
  const first = Object.values(data)[0];
  if (Array.isArray(first)) return String(first[0]);
  if (first) return String(first);
  return fallback;
}

export const BOOKING_STATUS: Record<string, string> = {
  pending: "So'rov",
  confirmed: "Tasdiqlangan",
  checked_in: "Joylashgan",
  checked_out: "Chiqib ketgan",
  cancelled: "Bekor qilingan",
  no_show: "Kelmadi",
};

export const ROOM_STATUS: Record<string, string> = {
  available: "Bo'sh",
  occupied: "Band",
  cleaning: "Tozalashda",
  maintenance: "Ta'mirda",
  out_of_order: "Ishlamaydi",
};

export const TASK_STATUS: Record<string, string> = {
  dirty: "Kutilmoqda",
  in_progress: "Jarayonda",
  clean: "Tozalangan",
  inspected: "Tayyor",
};

export function money(value: string | number | undefined, currency = "USD"): string {
  const n = Number(value || 0);
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}
