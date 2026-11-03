"use client";

import { useEffect, useState } from "react";
import { usePanel } from "@/lib/panel-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { apiError } from "@/lib/api/helpers";
import { HotelMembershipItem, Hotel, PaginatedResponse } from "@/types";
import {
  IconAdjustments,
  IconAlertTriangle,
  IconBuildingCommunity,
  IconCircleCheck,
  IconCurrencyDollar,
  IconDeviceFloppy,
  IconKey,
  IconShield,
  IconShieldExclamation,
  IconUserCheck,
  IconUserPlus,
  IconUserX,
  IconUsers,
} from "@tabler/icons-react";

export default function HotelStaffAndSettingsPage() {
  const { hotelId } = usePanel();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"staff" | "settings">("staff");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    role: "receptionist",
  });
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // 1. Fetch Staff Memberships
  const { data: membersData, isLoading: isMembersLoading } = useQuery<HotelMembershipItem[]>({
    queryKey: ["hotel-members", hotelId],
    queryFn: async () => {
      try {
        const res = await apiClient.get<HotelMembershipItem[] | PaginatedResponse<HotelMembershipItem>>(
          `/memberships/hotels/${hotelId}/members/`
        );
        // Backend sahifalangan javob ({ count, results }) qaytaradi
        return Array.isArray(res.data) ? res.data : res.data.results;
      } catch {
        return [];
      }
    },
  });

  // 2. Fetch Hotel Settings
  const { data: hotelData } = useQuery({
    queryKey: ["hotel-detail-settings", hotelId],
    queryFn: async () => {
      try {
        const res = await apiClient.get<Hotel>(`/hotels/${hotelId}/`);
        return res.data;
      } catch {
        return null;
      }
    },
  });

  const [settingsForm, setSettingsForm] = useState({
    name: "",
    phone: "",
    email: "",
    check_in_time: "",
    check_out_time: "",
    tax_rate_percent: "",
    cancellation_hours: 0,
  });

  // Formani bazadagi haqiqiy qiymatlar bilan to'ldiramiz
  useEffect(() => {
    if (!hotelData) return;
    const s = hotelData.settings;
    setSettingsForm({
      name: hotelData.name || "",
      phone: hotelData.phone || "",
      email: hotelData.email || "",
      check_in_time: (s?.check_in_time || "").slice(0, 5),
      check_out_time: (s?.check_out_time || "").slice(0, 5),
      tax_rate_percent: s?.tax_rate_percent || "",
      cancellation_hours: s?.cancellation_hours ?? 0,
    });
  }, [hotelData]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () =>
      apiClient.patch(`/hotels/${hotelId}/`, {
        name: settingsForm.name,
        phone: settingsForm.phone,
        email: settingsForm.email,
        settings: {
          check_in_time: settingsForm.check_in_time,
          check_out_time: settingsForm.check_out_time,
          tax_rate_percent: settingsForm.tax_rate_percent || "0",
          cancellation_hours: settingsForm.cancellation_hours,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel-detail-settings", hotelId] });
      queryClient.invalidateQueries({ queryKey: ["hotel", hotelId] });
      setNotification({ type: "success", message: "Saqlandi." });
      setTimeout(() => setNotification(null), 3000);
    },
    onError: (err: any) => {
      setNotification({ type: "error", message: apiError(err) });
      setTimeout(() => setNotification(null), 4000);
    },
  });

  // Staff Role Update Mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ membershipId, role }: { membershipId: number; role: string }) => {
      return apiClient.patch(`/memberships/hotels/${hotelId}/members/${membershipId}/role/`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel-members", hotelId] });
      setNotification({ type: "success", message: "Rol yangilandi." });
      setTimeout(() => setNotification(null), 3000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Xatolik.";
      setNotification({ type: "error", message: msg });
      setTimeout(() => setNotification(null), 4000);
    }
  });

  // Staff Deactivate Mutation
  const deactivateStaffMutation = useMutation({
    mutationFn: async (membershipId: number) => {
      return apiClient.delete(`/memberships/hotels/${hotelId}/members/${membershipId}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel-members", hotelId] });
      setNotification({ type: "success", message: "Xodim o'chirildi." });
      setTimeout(() => setNotification(null), 3000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Xatolik.";
      setNotification({ type: "error", message: msg });
      setTimeout(() => setNotification(null), 4000);
    }
  });

  // Invite Staff Mutation
  const inviteMutation = useMutation({
    mutationFn: async (payload: { email: string; role: string }) => {
      return apiClient.post(`/memberships/hotels/${hotelId}/members/invite/`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel-members", hotelId] });
      setInviteModalOpen(false);
      setInviteForm({ email: "", role: "receptionist" });
      setNotification({ type: "success", message: "Taklif yuborildi." });
      setTimeout(() => setNotification(null), 3000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Xatolik.";
      setNotification({ type: "error", message: msg });
      setTimeout(() => setNotification(null), 4000);
    }
  });

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email.trim()) return;
    inviteMutation.mutate(inviteForm);
  };

  const members = membersData || [];

  return (
    <div className="space-y-6 font-sans pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <h1 className="text-2xl font-serif font-bold text-stone-900">Xodimlar va sozlamalar</h1>

        {/* Tab switcher */}
        <div className="flex items-center bg-white p-1 rounded border border-stone-300 shadow-sm text-xs">
          <button
            onClick={() => setActiveTab("staff")}
            className={`px-3 py-1.5 rounded font-medium transition ${
              activeTab === "staff" ? "bg-stone-900 text-white font-bold" : "text-stone-700 hover:text-stone-900"
            }`}
          >
            Xodimlar ({members.length})
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-3 py-1.5 rounded font-medium transition ${
              activeTab === "settings" ? "bg-stone-900 text-white font-bold" : "text-stone-700 hover:text-stone-900"
            }`}
          >
            Sozlamalar
          </button>
        </div>
      </div>

      {notification && (
        <div className={`p-3 rounded border text-xs font-semibold flex items-center gap-2 ${
          notification.type === "success"
            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
            : "bg-rose-50 border-rose-200 text-rose-900"
        }`}>
          {notification.type === "success" ? (
            <IconCircleCheck className="w-4 h-4 text-emerald-700" />
          ) : (
            <IconAlertTriangle className="w-4 h-4 text-rose-700" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* ---------------------------------------------------------
          TAB 1: STAFF & ACCESS MANAGEMENT
      --------------------------------------------------------- */}
      {activeTab === "staff" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
                <IconUsers className="w-4 h-4 text-amber-700" /> Xodimlar
            </h2>
            <button
              onClick={() => setInviteModalOpen(true)}
              className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow"
            >
              <IconUserPlus className="w-3.5 h-3.5 text-amber-400" /> Yangi xodim
            </button>
          </div>

          <div className="bg-white border border-stone-200 rounded shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 text-stone-700 font-bold uppercase border-b border-stone-200">
                <tr>
                  <th className="py-3 px-4">Xodim</th>
                  <th className="py-3 px-4">Rol</th>
                  <th className="py-3 px-4">Holat</th>
                  <th className="py-3 px-4">Sana</th>
                  <th className="py-3 px-4 text-right">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-stone-50 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-stone-900">{member.user.full_name || member.user.email}</div>
                      <div className="text-[11px] font-mono text-stone-500">{member.user.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${
                        member.role === "owner"
                          ? "bg-amber-100 text-amber-950 border-amber-300"
                          : member.role === "manager"
                          ? "bg-emerald-100 text-emerald-950 border-emerald-300"
                          : "bg-stone-100 text-stone-800 border-stone-300"
                      }`}>
                        {member.role === "owner"
                          ? "👑 Boshliq"
                          : member.role === "manager"
                          ? "🗝️ Meneger"
                          : member.role === "receptionist"
                          ? "Receptionist"
                          : member.role === "housekeeping"
                          ? "Housekeeping"
                          : member.role === "finance"
                          ? "Finance"
                          : "Auditor"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-emerald-800 font-semibold flex items-center gap-1">
                        <IconCircleCheck className="w-3.5 h-3.5" /> Faol
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-stone-500">
                      {new Date(member.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      {member.role !== "owner" ? (
                        <>
                          <select
                            value={member.role}
                            onChange={(e) => updateRoleMutation.mutate({ membershipId: member.id, role: e.target.value })}
                            className="px-2 py-1 border border-stone-300 rounded text-xs outline-none bg-white font-medium"
                          >
                            <option value="receptionist">Receptionist</option>
                            <option value="manager">Meneger</option>
                            <option value="housekeeping">Housekeeping</option>
                            <option value="finance">Moliya</option>
                            <option value="auditor">Auditor</option>
                          </select>

                          <button
                            onClick={() => {
                              if (confirm(`${member.user.email} o'chirilsinmi?`)) {
                                deactivateStaffMutation.mutate(member.id);
                              }
                            }}
                            className="px-2.5 py-1 text-xs text-rose-700 hover:text-rose-900 border border-rose-200 hover:bg-rose-50 rounded font-semibold transition"
                          >
                            O&apos;chirish
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] text-stone-400 font-semibold italic">
                          Boshliq
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------
          TAB 2: HOTEL CONFIGURATION
      --------------------------------------------------------- */}
      {activeTab === "settings" && (
        <div className="bg-white border border-stone-200 rounded p-6 shadow-sm space-y-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-stone-900 pb-3 border-b border-stone-200">
            Parametrlar
          </h2>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveSettingsMutation.mutate();
            }}
            className="space-y-4 text-xs"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Nomi</label>
                <input
                  type="text"
                  value={settingsForm.name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Telefon</label>
                <input
                  type="text"
                  value={settingsForm.phone}
                  onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Email</label>
                <input
                  type="email"
                  value={settingsForm.email}
                  onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Check-in</label>
                <input
                  type="time"
                  value={settingsForm.check_in_time}
                  onChange={(e) => setSettingsForm({ ...settingsForm, check_in_time: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Check-out</label>
                <input
                  type="time"
                  value={settingsForm.check_out_time}
                  onChange={(e) => setSettingsForm({ ...settingsForm, check_out_time: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Soliq (%)</label>
                <input
                  type="text"
                  value={settingsForm.tax_rate_percent}
                  onChange={(e) => setSettingsForm({ ...settingsForm, tax_rate_percent: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Bekor qilish (soat)</label>
                <input
                  type="number"
                  value={settingsForm.cancellation_hours}
                  onChange={(e) => setSettingsForm({ ...settingsForm, cancellation_hours: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none font-mono"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-stone-100 flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded font-semibold flex items-center gap-1.5 shadow"
              >
                <IconDeviceFloppy className="w-3.5 h-3.5 text-amber-400" /> Saqlash
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invite Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full p-6 shadow-xl border border-stone-300">
            <h3 className="text-base font-serif font-bold text-stone-900 mb-4">Xodim taklif qilish</h3>

            <form onSubmit={handleInviteSubmit} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="email@example.com"
                  className="w-full px-3 py-2 border border-stone-300 rounded text-xs outline-none focus:border-stone-900"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Rol *</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded text-xs outline-none bg-white focus:border-stone-900"
                >
                  <option value="receptionist">Receptionist</option>
                  <option value="manager">Meneger</option>
                  <option value="housekeeping">Housekeeping</option>
                  <option value="finance">Moliya</option>
                  <option value="auditor">Auditor</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="px-3 py-2 font-medium text-stone-600 hover:bg-stone-100 rounded"
                >
                  Bekor
                </button>
                <button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  className="px-4 py-2 font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded shadow disabled:opacity-50"
                >
                  {inviteMutation.isPending ? "Yuborilmoqda..." : "Yuborish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
