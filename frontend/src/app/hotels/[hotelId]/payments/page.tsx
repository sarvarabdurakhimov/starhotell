"use client";

import { useState } from "react";
import { usePanel } from "@/lib/panel-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { PaginatedResponse, Expense, ExpenseCategory, ExpenseStatus } from "@/types";
import {
  IconAlertTriangle,
  IconArrowDownRight,
  IconBuildingCommunity,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconCurrencyDollar,
  IconDownload,
  IconPlus,
  IconReceipt,
  IconRotate,
  IconShieldCheck,
  IconTrendingDown,
} from "@tabler/icons-react";

export interface PaymentRecord {
  id: number;
  idempotency_key: string;
  status: "pending" | "succeeded" | "failed" | "refunded" | "partially_refunded";
  amount: string;
  currency: string;
  refunded_amount: string;
  provider: string;
  provider_transaction_id: string;
  failure_reason?: string;
  processed_at?: string;
  created_at: string;
}

export default function PaymentsAndExpensesPage() {
  const { hotelId } = usePanel();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"payments" | "expenses">("payments");
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [reversalModalOpen, setReversalModalOpen] = useState(false);
  const [selectedExpenseId, setSelectedExpenseId] = useState<number | null>(null);
  const [reversalReason, setReversalReason] = useState("");

  const [expenseForm, setExpenseForm] = useState({
    title: "",
    category: "supplies" as ExpenseCategory,
    amount: "",
    expense_date: new Date().toISOString().split("T")[0],
    description: "",
  });

  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // 1. Fetch Settled Payments & Refunds
  const { data: paymentsData, isLoading: isPaymentsLoading } = useQuery({
    queryKey: ["payments", hotelId],
    queryFn: async () => {
      try {
        const res = await apiClient.get<PaginatedResponse<PaymentRecord>>(
          `/payments/hotels/${hotelId}/payments/`
        );
        return res.data;
      } catch {
        return null;
      }
    },
  });


  const payments = paymentsData?.results || [];

  // 2. Fetch Operating Expenses
  const { data: expensesData, isLoading: isExpensesLoading } = useQuery<Expense[]>({
    queryKey: ["hotel-expenses", hotelId],
    queryFn: async () => {
      try {
        const res = await apiClient.get<Expense[] | PaginatedResponse<Expense>>(
          `/payments/hotels/${hotelId}/expenses/`
        );
        // Backend sahifalangan javob ({ count, results }) qaytaradi
        return Array.isArray(res.data) ? res.data : res.data.results;
      } catch {
        return [];
      }
    },
  });

  const expenses = expensesData || [];

  // Mutations for Expenses
  const createExpenseMutation = useMutation({
    mutationFn: async (payload: any) => {
      return apiClient.post(`/payments/hotels/${hotelId}/expenses/`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel-expenses", hotelId] });
      setExpenseModalOpen(false);
      setExpenseForm({
        title: "",
        category: "supplies",
        amount: "",
        expense_date: new Date().toISOString().split("T")[0],
        description: "",
      });
      setNotification({ type: "success", message: "Xarajat saqlandi." });
      setTimeout(() => setNotification(null), 3000);
    },
    onError: () => {
      setNotification({ type: "error", message: "Xatolik." });
      setTimeout(() => setNotification(null), 3000);
    }
  });

  const approveExpenseMutation = useMutation({
    mutationFn: async (expenseId: number) => {
      return apiClient.post(`/payments/hotels/${hotelId}/expenses/${expenseId}/approve/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel-expenses", hotelId] });
      setNotification({ type: "success", message: "Tasdiqlandi." });
      setTimeout(() => setNotification(null), 3000);
    }
  });

  const reverseExpenseMutation = useMutation({
    mutationFn: async ({ expenseId, reason }: { expenseId: number; reason: string }) => {
      return apiClient.post(`/payments/hotels/${hotelId}/expenses/${expenseId}/reverse/`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel-expenses", hotelId] });
      setReversalModalOpen(false);
      setReversalReason("");
      setSelectedExpenseId(null);
      setNotification({ type: "success", message: "Qaytarildi." });
      setTimeout(() => setNotification(null), 3000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Xatolik.";
      setNotification({ type: "error", message: msg });
      setTimeout(() => setNotification(null), 4000);
    }
  });

  const totalSucceeded = payments
    .filter((p) => p.status === "succeeded")
    .reduce((acc, curr) => acc + parseFloat(curr.amount || "0"), 0);

  const totalRefunded = payments
    .reduce((acc, curr) => acc + parseFloat(curr.refunded_amount || "0"), 0);

  const totalExpensesApproved = expenses
    .filter((e) => e.status === "approved")
    .reduce((acc, curr) => acc + parseFloat(curr.amount || "0"), 0);

  const netRevenue = totalSucceeded - totalRefunded;
  const estimatedProfit = netRevenue - totalExpensesApproved;

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <h1 className="text-2xl font-serif font-bold text-stone-900">Moliya</h1>

        {/* Tab switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white p-1 rounded border border-stone-300 shadow-sm text-xs">
            <button
              onClick={() => setActiveTab("payments")}
              className={`px-3 py-1.5 rounded font-medium transition ${
                activeTab === "payments" ? "bg-stone-900 text-white font-bold" : "text-stone-700 hover:text-stone-900"
              }`}
            >
              To&apos;lovlar
            </button>
            <button
              onClick={() => setActiveTab("expenses")}
              className={`px-3 py-1.5 rounded font-medium transition ${
                activeTab === "expenses" ? "bg-stone-900 text-white font-bold" : "text-stone-700 hover:text-stone-900"
              }`}
            >
              Xarajatlar ({expenses.length})
            </button>
          </div>

          {activeTab === "expenses" && (
            <button
              onClick={() => setExpenseModalOpen(true)}
              className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow"
            >
              <IconPlus className="w-3.5 h-3.5 text-amber-400" /> Yangi xarajat
            </button>
          )}
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              Tushum
            </span>
            <div className="w-7 h-7 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
              <IconCircleCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-serif font-bold text-stone-900">
              ${totalSucceeded.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-stone-500">USD</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              Qaytarilgan
            </span>
            <div className="w-7 h-7 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center">
              <IconRotate className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-serif font-bold text-amber-900">
              ${totalRefunded.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-stone-500">USD</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              Xarajatlar
            </span>
            <div className="w-7 h-7 rounded bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center">
              <IconTrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-serif font-bold text-rose-800">
              -${totalExpensesApproved.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-stone-500">USD</span>
          </div>
        </div>

        <div className="bg-stone-900 text-white p-5 rounded border border-stone-800 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-300 uppercase tracking-wider">
              Sof foyda
            </span>
            <div className="w-7 h-7 rounded bg-stone-800 text-amber-400 border border-stone-700 flex items-center justify-center font-bold text-xs">
              ★
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-serif font-bold text-white">
              ${estimatedProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-stone-400">USD</span>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------
          TAB 1: SETTLED PAYMENTS & REFUNDS AUDIT
      --------------------------------------------------------- */}
      {activeTab === "payments" && (
        <div className="bg-white border border-stone-200 rounded shadow-sm overflow-hidden">
          <div className="p-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-900">To&apos;lovlar</h2>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b bg-stone-100 text-stone-700 font-bold uppercase">
                <th className="py-3 px-5">ID</th>
                <th className="py-3 px-5">Provayder</th>
                <th className="py-3 px-5">Summa</th>
                <th className="py-3 px-5">Holat</th>
                <th className="py-3 px-5">Tranzaksiya</th>
                <th className="py-3 px-5">Sana</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-stone-50 transition">
                  <td className="py-3 px-5 font-mono text-stone-600">
                    {p.idempotency_key.substring(0, 18)}...
                  </td>
                  <td className="py-3 px-5 font-bold text-stone-900">
                    {p.provider}
                  </td>
                  <td className="py-3 px-5 font-bold text-stone-900">
                    ${Number(p.amount).toLocaleString()} {p.currency}
                  </td>
                  <td className="py-3 px-5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        p.status === "succeeded"
                          ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                          : p.status === "pending"
                          ? "bg-amber-50 text-amber-900 border-amber-300"
                          : p.status === "refunded"
                          ? "bg-stone-100 text-stone-800 border-stone-300"
                          : "bg-rose-50 text-rose-800 border-rose-300"
                      }`}
                    >
                      {p.status === "succeeded"
                        ? "To'landi ✓"
                        : p.status === "pending"
                        ? "Kutilmoqda"
                        : p.status === "refunded"
                        ? "Qaytarildi"
                        : "Bekor qilindi"}
                    </span>
                  </td>
                  <td className="py-3 px-5 font-mono text-stone-500">
                    {p.provider_transaction_id || "—"}
                  </td>
                  <td className="py-3 px-5 text-stone-500 font-mono">
                    {new Date(p.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------------------------------------------------
          TAB 2: OPERATING EXPENSES WITH AUDITABLE REVERSALS
      --------------------------------------------------------- */}
      {activeTab === "expenses" && (
        <div className="bg-white border border-stone-200 rounded shadow-sm overflow-hidden space-y-4">
          <div className="p-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-900">Xarajatlar</h2>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b bg-stone-100 text-stone-700 font-bold uppercase">
                <th className="py-3 px-5">Nomi</th>
                <th className="py-3 px-5">Kategoriya</th>
                <th className="py-3 px-5">Summa</th>
                <th className="py-3 px-5">Sana</th>
                <th className="py-3 px-5">Holat</th>
                <th className="py-3 px-5">Xodim</th>
                <th className="py-3 px-5 text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium">
              {expenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-stone-50 transition">
                  <td className="py-3 px-5">
                    <div className="font-bold text-stone-900">{exp.title}</div>
                    {exp.description && <div className="text-[11px] text-stone-500">{exp.description}</div>}
                    {exp.reversal_reason && (
                      <div className="text-[11px] text-rose-700 font-semibold mt-0.5">
                        Sabab: {exp.reversal_reason}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-5 font-mono text-stone-600">
                    {exp.category_display || exp.category}
                  </td>
                  <td className="py-3 px-5 font-bold text-rose-800">
                    -${Number(exp.amount).toLocaleString()} {exp.currency}
                  </td>
                  <td className="py-3 px-5 font-mono text-stone-600">
                    {exp.expense_date}
                  </td>
                  <td className="py-3 px-5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                      exp.status === "approved"
                        ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                        : exp.status === "pending_approval"
                        ? "bg-amber-50 text-amber-900 border-amber-300"
                        : exp.status === "reversed"
                        ? "bg-rose-50 text-rose-900 border-rose-300 line-through"
                        : "bg-stone-100 text-stone-700 border-stone-300"
                    }`}>
                      {exp.status === "approved"
                        ? "Tasdiqlangan ✓"
                        : exp.status === "pending_approval"
                        ? "Kutilmoqda"
                        : exp.status === "reversed"
                        ? "Qaytarilgan"
                        : exp.status}
                    </span>
                  </td>
                  <td className="py-3 px-5 text-stone-600">
                    {exp.recorded_by_name || "Xodim"}
                  </td>
                  <td className="py-3 px-5 text-right space-x-1.5">
                    {exp.status === "pending_approval" && (
                      <button
                        onClick={() => approveExpenseMutation.mutate(exp.id)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition"
                      >
                        Tasdiqlash
                      </button>
                    )}
                    {exp.status !== "reversed" && (
                      <button
                        onClick={() => {
                          setSelectedExpenseId(exp.id);
                          setReversalModalOpen(true);
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:text-rose-900 border border-rose-200 hover:bg-rose-50 rounded transition"
                      >
                        Qaytarish
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Expense Modal */}
      {expenseModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full p-6 shadow-xl border border-stone-300 text-xs">
            <h3 className="text-base font-serif font-bold text-stone-900 mb-4">Yangi xarajat</h3>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createExpenseMutation.mutate({
                  title: expenseForm.title,
                  category: expenseForm.category,
                  amount: expenseForm.amount,
                  expense_date: expenseForm.expense_date,
                  description: expenseForm.description,
                  currency: "USD",
                });
              }}
              className="space-y-3"
            >
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Nomi *</label>
                <input
                  type="text"
                  required
                  value={expenseForm.title}
                  onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                  placeholder="Tozalash vositalari"
                  className="w-full px-3 py-2 border border-stone-300 rounded outline-none focus:border-stone-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 uppercase mb-1">Kategoriya *</label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as any })}
                    className="w-full px-3 py-2 border border-stone-300 rounded outline-none bg-white focus:border-stone-900"
                  >
                    <option value="salaries">Maosh</option>
                    <option value="utilities">Kommunal</option>
                    <option value="maintenance">Ta&apos;mir</option>
                    <option value="supplies">Vositalar</option>
                    <option value="marketing">Marketing</option>
                    <option value="food_beverage">Restoran</option>
                    <option value="taxes_licenses">Soliqlar</option>
                    <option value="software">Dasturlar</option>
                    <option value="other">Boshqa</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 uppercase mb-1">Summa (USD) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-stone-300 rounded outline-none focus:border-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Sana *</label>
                <input
                  type="date"
                  required
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded outline-none focus:border-stone-900 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">Izoh</label>
                <textarea
                  rows={2}
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  placeholder="Chek raqami"
                  className="w-full px-3 py-2 border border-stone-300 rounded outline-none focus:border-stone-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setExpenseModalOpen(false)}
                  className="px-3 py-2 font-medium text-stone-600 hover:bg-stone-100 rounded"
                >
                  Bekor
                </button>
                <button
                  type="submit"
                  disabled={createExpenseMutation.isPending}
                  className="px-4 py-2 font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded shadow"
                >
                  {createExpenseMutation.isPending ? "Saqlanmoqda..." : "Saqlash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auditable Reversal Modal */}
      {reversalModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full p-6 shadow-xl border border-stone-300 text-xs">
            <h3 className="text-base font-serif font-bold text-stone-900 mb-4">Xarajatni qaytarish</h3>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!reversalReason.trim() || !selectedExpenseId) return;
                reverseExpenseMutation.mutate({
                  expenseId: selectedExpenseId,
                  reason: reversalReason.trim()
                });
              }}
              className="space-y-3"
            >
              <div>
                <label className="block font-bold text-stone-700 uppercase mb-1">
                  Sabab *
                </label>
                <textarea
                  required
                  rows={3}
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Adashib kiritilgan"
                  className="w-full px-3 py-2 border border-stone-300 rounded outline-none focus:border-stone-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setReversalModalOpen(false)}
                  className="px-3 py-2 font-medium text-stone-600 hover:bg-stone-100 rounded"
                >
                  Yopish
                </button>
                <button
                  type="submit"
                  disabled={reverseExpenseMutation.isPending}
                  className="px-4 py-2 font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded shadow"
                >
                  {reverseExpenseMutation.isPending ? "Qaytarilmoqda..." : "Tasdiqlash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
