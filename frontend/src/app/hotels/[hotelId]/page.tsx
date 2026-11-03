"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePanel } from "@/lib/panel-context";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";
import { Hotel, ExecutiveReportData } from "@/types";
import { ManagerOperationsDashboard } from "@/components/manager/ManagerOperationsDashboard";
import {
  IconAlertTriangle,
  IconArrowDownRight,
  IconArrowUpRight,
  IconBed,
  IconBriefcase,
  IconBuildingCommunity,
  IconCalendar,
  IconChevronRight,
  IconCircleCheck,
  IconClock,
  IconCurrencyDollar,
  IconDownload,
  IconFilter,
  IconLogout,
  IconRefresh,
  IconShieldExclamation,
  IconSparkles,
  IconTrendingUp,
  IconUsers,
} from "@tabler/icons-react";

export default function HotelDashboardPage() {
  const router = useRouter();
  const { hotelId, role, base } = usePanel();

  const [dateFilter, setDateFilter] = useState<"today" | "last_7_days" | "this_month" | "last_month" | "custom">("this_month");
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [customEnd, setCustomEnd] = useState<string>(() => new Date().toISOString().split("T")[0]);


  // 1. Fetch Hotel Information
  const { data: hotelData, isLoading: isHotelLoading } = useQuery({
    queryKey: ["hotel", hotelId],
    queryFn: async () => {
      try {
        const res = await apiClient.get<Hotel>(`/hotels/${hotelId}/`);
        return res.data;
      } catch {
        return null;
      }
    },
  });

  const hotel = hotelData || { id: Number(hotelId), name: "", currency: "USD" };

  // 2. Fetch Executive Dashboard KPIs & Financials
  const {
    data: execData,
    isLoading: isExecLoading,
    refetch: refetchExec
  } = useQuery<ExecutiveReportData | null>({
    queryKey: ["executive-report", hotelId, dateFilter, customStart, customEnd],
    queryFn: async () => {
      try {
        const paramsObj: any = { filter: dateFilter };
        if (dateFilter === "custom") {
          paramsObj.start_date = customStart;
          paramsObj.end_date = customEnd;
        }
        const res = await apiClient.get<ExecutiveReportData>(
          `/reports/hotels/${hotelId}/reports/executive/`,
          { params: paramsObj }
        );
        return res.data;
      } catch {
        return null;
      }
    },
  });

  const handleExportCSV = () => {
    const url = `/api/v1/reports/hotels/${hotelId}/reports/export/?filter=${dateFilter}&start_date=${customStart}&end_date=${customEnd}`;
    window.open(url, "_blank");
  };

  // ----------------------------------------------------
  // 1. MANAGER VIEW (Comprehensive Daily Operations Dashboard)
  // ----------------------------------------------------
  if (role === "manager") {
    return <ManagerOperationsDashboard hotelId={hotelId} hotel={hotel} />;
  }

  // ----------------------------------------------------
  // 2. OWNER EXECUTIVE DASHBOARD (Full Business & Financial Oversight)
  // ----------------------------------------------------
  const kpis = execData?.kpis || {
    today_revenue: "0.00",
    period_settled_revenue: "0.00",
    period_booking_value: "0.00",
    recorded_expenses: "0.00",
    refunds: "0.00",
    net_revenue: "0.00",
    estimated_profit: "0.00",
    outstanding_balance: "0.00",
    total_rooms: 0,
    occupied_rooms: 0,
    available_rooms: 0,
    maintenance_rooms: 0,
    occupancy_rate: 0,
    today_arrivals: 0,
    today_departures: 0,
  };

  const currency = hotel.currency || "USD";

  return (
    <div className="space-y-6 pb-12">
      {/* Executive Header & Date Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900">{hotel.name}</h1>

        {/* Date Filters & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-white p-1 rounded border border-stone-300 text-xs shadow-sm">
            <button
              onClick={() => setDateFilter("today")}
              className={`px-3 py-1.5 rounded font-medium transition ${
                dateFilter === "today" ? "bg-stone-900 text-white font-bold" : "text-stone-700 hover:text-stone-900"
              }`}
            >
              Bugun
            </button>
            <button
              onClick={() => setDateFilter("last_7_days")}
              className={`px-3 py-1.5 rounded font-medium transition ${
                dateFilter === "last_7_days" ? "bg-stone-900 text-white font-bold" : "text-stone-700 hover:text-stone-900"
              }`}
            >
              Oxirgi 7 kun
            </button>
            <button
              onClick={() => setDateFilter("this_month")}
              className={`px-3 py-1.5 rounded font-medium transition ${
                dateFilter === "this_month" ? "bg-stone-900 text-white font-bold" : "text-stone-700 hover:text-stone-900"
              }`}
            >
              Shu oy
            </button>
            <button
              onClick={() => setDateFilter("last_month")}
              className={`px-3 py-1.5 rounded font-medium transition ${
                dateFilter === "last_month" ? "bg-stone-900 text-white font-bold" : "text-stone-700 hover:text-stone-900"
              }`}
            >
              O&apos;tgan oy
            </button>
            <button
              onClick={() => setDateFilter("custom")}
              className={`px-3 py-1.5 rounded font-medium transition ${
                dateFilter === "custom" ? "bg-stone-900 text-white font-bold" : "text-stone-700 hover:text-stone-900"
              }`}
            >
              Maxsus
            </button>
          </div>

          {dateFilter === "custom" && (
            <div className="flex items-center gap-1.5 bg-white p-1 rounded border border-stone-300 text-xs shadow-sm">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1 border border-stone-200 rounded text-xs outline-none"
              />
              <span className="text-stone-400">—</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1 border border-stone-200 rounded text-xs outline-none"
              />
            </div>
          )}

          <button
            onClick={handleExportCSV}
            className="px-3 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow transition"
            title="CSV yuklab olish"
          >
            <IconDownload className="w-3.5 h-3.5 text-amber-400" /> CSV
          </button>
        </div>
      </div>

      {/* Operational Alerts Section */}
      {execData?.alerts && execData.alerts.length > 0 && (
        <div className="space-y-2">
          {execData.alerts.map((alert, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded border text-xs flex items-start gap-3 shadow-sm ${
                alert.type === "warning"
                  ? "bg-amber-50/90 border-amber-300 text-amber-950"
                  : alert.type === "success"
                  ? "bg-emerald-50/90 border-emerald-300 text-emerald-950"
                  : "bg-stone-100 border-stone-300 text-stone-900"
              }`}
            >
              <IconAlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
                alert.type === "warning" ? "text-amber-700" : alert.type === "success" ? "text-emerald-700" : "text-stone-600"
              }`} />
              <div>
                <span className="font-bold block">{alert.title}</span>
                <span className="text-[11px] opacity-90">{alert.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 1. TOP FINANCIAL PERFORMANCE CARDS */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
            <IconCurrencyDollar className="w-3.5 h-3.5 text-amber-600" /> Moliya
          </h2>
          <span className="text-[11px] text-stone-400 font-mono">
            {currency}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* A. Bugungi Tushum */}
          <div className="bg-white p-5 rounded border border-stone-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-stone-500 font-bold uppercase tracking-wider">
              <span>Bugun</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-serif font-bold text-stone-900">
                {Number(kpis.today_revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-semibold text-stone-500">{currency}</span>
            </div>
          </div>

          {/* B. Tanlangan Davr Tushumi */}
          <div className="bg-white p-5 rounded border border-stone-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-stone-500 font-bold uppercase tracking-wider">
              <span>Davr tushumi</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-serif font-bold text-stone-900">
                {Number(kpis.period_settled_revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-semibold text-stone-500">{currency}</span>
            </div>
            <div className="mt-2 text-[11px] text-stone-500">
              Bronlar: {Number(kpis.period_booking_value).toLocaleString()} {currency}
            </div>
          </div>

          {/* C. Qayd Etilgan Xarajatlar & Qaytarmalar */}
          <div className="bg-white p-5 rounded border border-stone-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-stone-500 font-bold uppercase tracking-wider">
              <span>Xarajatlar</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-serif font-bold text-rose-800">
                -{Number(kpis.recorded_expenses).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-semibold text-stone-500">{currency}</span>
            </div>
            <div className="mt-2 text-[11px] text-stone-500 flex items-center justify-between">
              <span>Qaytarish: {Number(kpis.refunds).toLocaleString()} {currency}</span>
              <Link href={`${base}/payments`} className="text-amber-800 font-semibold hover:underline">
                Batafsil &rarr;
              </Link>
            </div>
          </div>

          {/* D. Hisoblangan Sof Foyda */}
          <div className="bg-stone-900 text-white p-5 rounded border border-stone-800 shadow-md relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-stone-300 font-bold uppercase tracking-wider">
              <span className="text-amber-400">Sof foyda</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-serif font-bold text-white">
                {Number(kpis.estimated_profit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-semibold text-stone-400">{currency}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. OPERATIONAL STATUS & OCCUPANCY METRICS */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
            <IconBed className="w-3.5 h-3.5 text-stone-700" /> Xonalar
          </h2>
          <span className="text-xs text-stone-600 font-medium">
            Jami: {kpis.total_rooms}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded border border-stone-200 shadow-sm">
            <span className="text-[11px] text-stone-500 font-bold uppercase block">Bandlik</span>
            <div className="text-2xl font-serif font-bold text-stone-900 mt-1">
              {kpis.occupancy_rate}%
            </div>
            <div className="w-full bg-stone-100 h-2 rounded-full mt-2 overflow-hidden border border-stone-200">
              <div
                className="bg-amber-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(kpis.occupancy_rate, 100)}%` }}
              ></div>
            </div>
          </div>

          <div className="bg-white p-4 rounded border border-stone-200 shadow-sm">
            <span className="text-[11px] text-stone-500 font-bold uppercase block">Band</span>
            <div className="text-2xl font-serif font-bold text-emerald-800 mt-1">
              {kpis.occupied_rooms} <span className="text-xs font-sans font-normal text-stone-500">ta</span>
            </div>
            <span className="text-[11px] text-stone-500 mt-1 block">
              Bo&apos;sh: {kpis.available_rooms}
            </span>
          </div>

          <div className="bg-white p-4 rounded border border-stone-200 shadow-sm">
            <span className="text-[11px] text-stone-500 font-bold uppercase block">Kelish / Ketish</span>
            <div className="text-base font-bold text-stone-900 mt-2 flex items-center justify-between">
              <span className="text-emerald-800">↓ {kpis.today_arrivals}</span>
              <span className="text-amber-800">↑ {kpis.today_departures}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded border border-stone-200 shadow-sm">
            <span className="text-[11px] text-stone-500 font-bold uppercase block">Qoldiq</span>
            <div className="text-xl font-serif font-bold text-amber-900 mt-1">
              {Number(kpis.outstanding_balance).toLocaleString()} {currency}
            </div>
          </div>
        </div>
      </div>

      {/* 3. TRENDS & FINANCIAL AUDIT BREAKDOWN */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Trend grafiki / jadvali */}
        <div className="lg:col-span-8 bg-white p-5 rounded border border-stone-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-200">
            <h3 className="font-serif font-bold text-stone-900 text-sm">Dinamika</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b bg-stone-50 text-stone-700 font-bold uppercase">
                  <th className="py-2.5 px-3">Sana</th>
                  <th className="py-2.5 px-3">Tushum</th>
                  <th className="py-2.5 px-3">Xarajat</th>
                  <th className="py-2.5 px-3">Sof Foyda</th>
                  <th className="py-2.5 px-3 text-right">Marja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {(execData?.trends || []).map((t, idx) => {
                  const margin = t.revenue > 0 ? ((t.profit / t.revenue) * 100).toFixed(1) : "0.0";
                  return (
                    <tr key={idx} className="hover:bg-stone-50 transition">
                      <td className="py-2.5 px-3 font-mono text-stone-900">{t.date}</td>
                      <td className="py-2.5 px-3 font-bold text-emerald-800">
                        +{t.revenue.toLocaleString()} {currency}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-rose-800">
                        -{t.expenses.toLocaleString()} {currency}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-stone-900">
                        {t.profit.toLocaleString()} {currency}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-stone-600">
                        {margin}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tezkor Boshqaruv & Konfiguratsiyaga Havolalar */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-stone-50 p-5 rounded border border-stone-300 shadow-sm space-y-3">
            <h3 className="font-serif font-bold text-stone-900 text-sm flex items-center gap-2">
              <IconBriefcase className="w-4 h-4 text-amber-700" /> Bo&apos;limlar
            </h3>

            <div className="space-y-2 pt-2 border-t border-stone-200">
              <Link
                href={`${base}/settings`}
                className="flex items-center justify-between p-2.5 bg-white hover:bg-stone-100 rounded border border-stone-200 text-xs font-semibold text-stone-900 transition"
              >
                <span>Xodimlar va rollar</span>
                <IconChevronRight className="w-4 h-4 text-stone-400" />
              </Link>

              <Link
                href={`${base}/payments`}
                className="flex items-center justify-between p-2.5 bg-white hover:bg-stone-100 rounded border border-stone-200 text-xs font-semibold text-stone-900 transition"
              >
                <span>Xarajatlarni tasdiqlash</span>
                <IconChevronRight className="w-4 h-4 text-stone-400" />
              </Link>

              <Link
                href={`${base}/rooms`}
                className="flex items-center justify-between p-2.5 bg-white hover:bg-stone-100 rounded border border-stone-200 text-xs font-semibold text-stone-900 transition"
              >
                <span>Xonalar va narxlar</span>
                <IconChevronRight className="w-4 h-4 text-stone-400" />
              </Link>

              <Link
                href={`${base}/reports`}
                className="flex items-center justify-between p-2.5 bg-white hover:bg-stone-100 rounded border border-stone-200 text-xs font-semibold text-stone-900 transition"
              >
                <span>Audit va hisobotlar</span>
                <IconChevronRight className="w-4 h-4 text-stone-400" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
