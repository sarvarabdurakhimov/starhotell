"use client";

import { useState } from "react";
import { usePanel } from "@/lib/panel-context";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { BOOKING_STATUS } from "@/lib/api/helpers";
import type { Hotel } from "@/types";
import {
  IconCalendar,
  IconChartBar,
  IconChartPie,
  IconCircleCheck,
  IconCurrencyDollar,
  IconTrendingUp,
  IconUsers,
} from "@tabler/icons-react";

export default function ReportsPage() {
  const { hotelId } = usePanel();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: occupancy, isLoading: isOccLoading } = useQuery({
    queryKey: ["occupancy-report", hotelId, selectedDate],
    queryFn: async () => {
      const res = await apiClient.get(`/reports/hotels/${hotelId}/reports/occupancy/`, {
        params: { date: selectedDate },
      });
      return res.data;
    },
  });

  const { data: revenue, isLoading: isRevLoading } = useQuery({
    queryKey: ["revenue-report", hotelId],
    queryFn: async () => {
      const res = await apiClient.get(`/reports/hotels/${hotelId}/reports/revenue/`);
      return res.data;
    },
  });

  const { data: hotel } = useQuery({
    queryKey: ["hotel", hotelId],
    queryFn: async () => {
      try {
        return (await apiClient.get<Hotel>(`/hotels/${hotelId}/`)).data;
      } catch {
        return null;
      }
    },
  });

  const bookingsByStatus: Array<{ status: string; count: number }> =
    revenue?.bookings_by_status || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-900">
            Hisobotlar
          </h1>
        </div>

        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-stone-200 shadow-sm text-xs">
          <IconCalendar className="w-4 h-4 text-stone-400" />
          <span className="font-semibold text-stone-700">Sana:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs font-mono font-medium outline-none bg-transparent text-stone-900"
          />
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              Bandlik
            </span>
            <div className="w-8 h-8 rounded bg-stone-100 text-stone-800 border border-stone-200 flex items-center justify-center">
              <IconTrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-stone-900">
              {occupancy?.occupancy_rate_percent ?? 0}%
            </span>
            <span className="text-xs text-stone-500">
              ({occupancy?.occupied_rooms ?? 0} / {occupancy?.total_rooms ?? 0} ta xona)
            </span>
          </div>
          <div className="w-full bg-stone-100 h-2 rounded-full mt-4 overflow-hidden border border-stone-200">
            <div
              className="bg-amber-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(occupancy?.occupancy_rate_percent ?? 0, 100)}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-white p-5 rounded border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              Tushum
            </span>
            <div className="w-8 h-8 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center">
              <IconCurrencyDollar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-stone-900">
              {Number(revenue?.total_revenue ?? 0).toLocaleString()}
            </span>
            <span className="text-xs text-stone-600 font-semibold">{hotel?.currency || ""}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              Mehmonlar
            </span>
            <div className="w-8 h-8 rounded bg-stone-100 text-stone-800 border border-stone-200 flex items-center justify-center">
              <IconUsers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-stone-900">
              {bookingsByStatus.reduce((acc, curr) => acc + curr.count, 0)}
            </span>
            <span className="text-xs text-stone-500">bron</span>
          </div>
        </div>
      </div>

      {/* Reservation Distribution Breakdown */}
      <div className="bg-white rounded border border-stone-200 p-6 shadow-sm">
        <h3 className="font-serif font-bold text-stone-900 mb-4 flex items-center gap-2">
          <IconChartPie className="w-4 h-4 text-amber-700" />
          Bronlar taqsimoti
        </h3>

        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {bookingsByStatus.map((item) => (
              <div key={item.status} className="flex items-center justify-between p-3 rounded bg-stone-50 border border-stone-200">
                <span className="text-xs font-bold text-stone-800">
                  {BOOKING_STATUS[item.status] || item.status}
                </span>
                <span className="text-xs font-bold bg-white px-2.5 py-1 rounded border border-stone-300 text-stone-900">
                  {item.count} ta
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
