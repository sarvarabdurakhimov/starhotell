"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";
import { Hotel, PaginatedResponse } from "@/types";
import {
  IconBuilding,
  IconPlus,
  IconMapPin,
  IconArrowRight,
  IconCrown,
  IconBriefcase,
} from "@tabler/icons-react";


export default function DashboardPage() {
  const [role, setRole] = useState<"owner" | "manager">("owner");

  useEffect(() => {
    const raw = localStorage.getItem("hms_demo_user");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setRole(parsed.role === "manager" ? "manager" : "owner");
      } catch {
        // ignore
      }
    }
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["user-hotels"],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Hotel>>("/hotels/");
      return res.data;
    },
  });

  const hotels = data?.results || [];

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-stone-200">
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-900">Mehmonxonalar</h1>
        </div>

        {role === "owner" && (
          <Link
            href="/hotels/create"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs rounded shadow-sm transition"
          >
            <IconPlus className="w-4 h-4 text-amber-400" /> Yangi mehmonxona
          </Link>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
          {[1, 2].map((n) => (
            <div key={n} className="h-44 bg-stone-200 rounded"></div>
          ))}
        </div>
      )}

      {!isLoading && hotels.length === 0 && (
        <div className="p-10 text-center bg-white border border-dashed border-stone-300 rounded text-sm text-stone-500">
          Mehmonxona yo&apos;q.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {hotels.map((hotel) => (
          <div
            key={hotel.id}
            className="bg-white border border-stone-200 rounded p-6 shadow-sm hover:shadow transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded bg-stone-100 border border-stone-200 text-stone-800 flex items-center justify-center font-bold">
                  <IconBuilding className="w-5 h-5 text-stone-700" />
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Faol
                </span>
              </div>

              <h3 className="font-serif font-bold text-lg text-stone-900">{hotel.name}</h3>

              <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-1">
                <IconMapPin className="w-3.5 h-3.5 text-stone-400" />
                <span>{hotel.city ? `${hotel.city}, ${hotel.country}` : hotel.country}</span>
              </div>
            </div>

            <div className="mt-5">
              <Link
                href={`/hotels/${hotel.id}`}
                className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 bg-stone-900 hover:bg-stone-800 text-white rounded text-xs font-semibold transition"
              >
                Kirish <IconArrowRight className="w-3.5 h-3.5 text-amber-400" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}