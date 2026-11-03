"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";
import { apiError, asList } from "@/lib/api/helpers";
import { clearSession, ROLE_BASE, setSession } from "@/lib/session";
import {
  IconBuilding,
  IconCircleCheck,
  IconCircleX,
  IconEye,
  IconEyeOff,
  IconLock,
  IconMail,
  IconShieldCheck,
  IconSparkles,
  IconUser,
} from "@tabler/icons-react";

export default function RegisterPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    fullName: "",
    gmail: "",
    role: "owner", // owner | manager
    hotelName: "",
    password: "",
    passwordConfirm: "",
  });

  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Parol ishonchliligi tekshiruvlari
  const hasMinLength = formData.password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(formData.password);
  const hasNumber = /[0-9]/.test(formData.password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(formData.password);
  const passwordsMatch =
    formData.password.length > 0 && formData.password === formData.passwordConfirm;

  const isPasswordStrong = hasMinLength && hasUpperCase && hasNumber && hasSpecialChar;

  // Gmail validatsiyasi
  const isGmailValid = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(formData.gmail.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 1. Gmail tekshiruvi
    if (!isGmailValid) {
      setError("Faqat @gmail.com manzil.");
      return;
    }

    // 2. Kuchli parol tekshiruvi
    if (!isPasswordStrong) {
      setError("Parol talablarga javob bermaydi.");
      return;
    }

    // 3. Parollar mosligi
    if (!passwordsMatch) {
      setError("Parollar mos emas.");
      return;
    }

    const isOwner = formData.role === "owner";
    if (isOwner && !formData.hotelName.trim()) {
      setError("Mehmonxona nomini kiriting.");
      return;
    }

    setLoading(true);
    clearSession();
    const email = formData.gmail.trim().toLowerCase();
    const parts = formData.fullName.trim().split(/\s+/);

    try {
      await apiClient.post("/auth/register/", {
        email,
        first_name: parts[0] || "",
        last_name: parts.slice(1).join(" "),
        password: formData.password,
        password_confirm: formData.passwordConfirm,
      });
    } catch (err) {
      setError(apiError(err));
      setLoading(false);
      return;
    }

    // Meneger mehmonxonaga boshliq taklifi bilan qo'shiladi
    if (!isOwner) {
      setSuccess(true);
      setLoading(false);
      setTimeout(() => router.push("/login"), 2500);
      return;
    }

    try {
      await apiClient.post("/auth/login/", { email, password: formData.password });
      const hotel = await apiClient.post<{ id?: number }>("/hotels/create/", {
        name: formData.hotelName.trim(),
      });
      // Create javobida id bo'lmasligi mumkin — ro'yxatdan olamiz
      let hotelId = hotel.data.id;
      if (!hotelId) {
        const list = await apiClient.get("/hotels/");
        hotelId = asList<{ id: number }>(list.data)[0]?.id;
      }
      setSession({
        email,
        name: formData.fullName.trim() || email,
        role: "owner",
        hotelId,
      });
      router.push(ROLE_BASE.owner);
    } catch (err) {
      setError(apiError(err));
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-serif font-bold text-stone-900 tracking-tight mb-6">
        Ro&apos;yxatdan o&apos;tish
      </h2>

      {error && (
        <div className="mb-4 p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2">
          <IconCircleX className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <IconCircleCheck className="w-4 h-4 text-emerald-700" />
          <span>Akkaunt ochildi. Boshliq sizni taklif qilgach, kira olasiz.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 font-sans text-xs">
        {/* Ism Sharif */}
        <div>
          <label className="block font-bold text-stone-700 uppercase mb-1">
            Ism familiya *
          </label>
          <div className="relative">
            <IconUser className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full pl-9 pr-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none bg-white text-sm"
              placeholder="Ism Familiya"
            />
          </div>
        </div>

        {/* Gmail Manzil */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-bold text-stone-700 uppercase">
              Gmail *
            </label>
            {formData.gmail && (
              <span
                className={`text-[10px] font-semibold ${
                  isGmailValid ? "text-emerald-700 font-mono" : "text-amber-800"
                }`}
              >
                {isGmailValid ? "✓" : "faqat @gmail.com"}
              </span>
            )}
          </div>
          <div className="relative">
            <IconMail className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="email"
              required
              value={formData.gmail}
              onChange={(e) => setFormData({ ...formData, gmail: e.target.value })}
              className={`w-full pl-9 pr-3 py-2 border rounded focus:border-stone-900 outline-none bg-white text-sm ${
                formData.gmail && !isGmailValid
                  ? "border-amber-400 bg-amber-50/20"
                  : "border-stone-300"
              }`}
              placeholder="nom@gmail.com"
            />
          </div>
        </div>

        {/* Lavozim tanlash */}
        <div>
          <label className="block font-bold text-stone-700 uppercase mb-1">
            Lavozim *
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, role: "owner" })}
              className={`p-2.5 rounded border text-left transition ${
                formData.role === "owner"
                  ? "bg-amber-50/80 border-amber-600 ring-1 ring-amber-600 font-bold text-stone-900"
                  : "bg-white border-stone-200 text-stone-700 hover:border-stone-400"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">👑</span>
                <div>
                  <div className="font-bold text-xs">Boshliq</div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setFormData({ ...formData, role: "manager" })}
              className={`p-2.5 rounded border text-left transition ${
                formData.role === "manager"
                  ? "bg-emerald-50/80 border-emerald-600 ring-1 ring-emerald-600 font-bold text-stone-900"
                  : "bg-white border-stone-200 text-stone-700 hover:border-stone-400"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">🗝️</span>
                <div>
                  <div className="font-bold text-xs">Meneger</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Mehmonxona nomi — boshliq yangi mehmonxona ochadi */}
        {formData.role === "owner" && (
          <div>
            <label className="block font-bold text-stone-700 uppercase mb-1">
              Mehmonxona nomi *
            </label>
            <div className="relative">
              <IconBuilding className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              <input
                type="text"
                required
                value={formData.hotelName}
                onChange={(e) => setFormData({ ...formData, hotelName: e.target.value })}
                className="w-full pl-9 pr-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none bg-white text-sm"
                placeholder="Mehmonxona nomi"
              />
            </div>
          </div>
        )}

        {/* Ishonchli Parol */}
        <div>
          <label className="block font-bold text-stone-700 uppercase mb-1">
            Parol *
          </label>
          <div className="relative">
            <IconLock className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            <input
              type={showPass ? "text" : "password"}
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full pl-9 pr-10 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none bg-white text-sm"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-700"
            >
              {showPass ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
            </button>
          </div>

          {/* Xavfsizlik ko'rsatkichlari */}
          {formData.password && (
            <div className="mt-2 p-2.5 bg-stone-50 border border-stone-200 rounded text-[11px] space-y-1">
              <div className="font-bold text-stone-700 mb-1 flex items-center justify-between">
                <span>Parol</span>
                <span
                  className={`font-semibold ${
                    isPasswordStrong ? "text-emerald-700" : "text-amber-800"
                  }`}
                >
                  {isPasswordStrong ? "✓ Ishonchli" : "Zaif"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div
                  className={`flex items-center gap-1 ${
                    hasMinLength ? "text-emerald-800 font-semibold" : "text-stone-400"
                  }`}
                >
                  {hasMinLength ? "✓" : "○"} 8+ belgi
                </div>
                <div
                  className={`flex items-center gap-1 ${
                    hasUpperCase ? "text-emerald-800 font-semibold" : "text-stone-400"
                  }`}
                >
                  {hasUpperCase ? "✓" : "○"} A-Z
                </div>
                <div
                  className={`flex items-center gap-1 ${
                    hasNumber ? "text-emerald-800 font-semibold" : "text-stone-400"
                  }`}
                >
                  {hasNumber ? "✓" : "○"} 0-9
                </div>
                <div
                  className={`flex items-center gap-1 ${
                    hasSpecialChar ? "text-emerald-800 font-semibold" : "text-stone-400"
                  }`}
                >
                  {hasSpecialChar ? "✓" : "○"} !@#$
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Parolni Takrorlash */}
        <div>
          <label className="block font-bold text-stone-700 uppercase mb-1">
            Parolni tasdiqlang *
          </label>
          <div className="relative">
            <IconLock className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            <input
              type={showPass ? "text" : "password"}
              required
              value={formData.passwordConfirm}
              onChange={(e) => setFormData({ ...formData, passwordConfirm: e.target.value })}
              className={`w-full pl-9 pr-3 py-2 border rounded focus:border-stone-900 outline-none bg-white text-sm ${
                formData.passwordConfirm && !passwordsMatch
                  ? "border-rose-400 bg-rose-50/20"
                  : "border-stone-300"
              }`}
              placeholder="••••••••"
            />
          </div>
          {formData.passwordConfirm && (
            <div className="mt-1 text-[10px]">
              {passwordsMatch ? (
                <span className="text-emerald-800 font-semibold">✓ Mos</span>
              ) : (
                <span className="text-rose-700 font-semibold">✕ Mos emas</span>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !isPasswordStrong || !passwordsMatch || !isGmailValid}
          className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-stone-900 hover:bg-stone-800 active:bg-black rounded shadow transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? "Yaratilmoqda..." : "Ro'yxatdan o'tish →"}
        </button>
      </form>

      <div className="mt-6 text-center text-xs text-stone-500">
        Akkaunt bormi?{" "}
        <Link href="/login" className="font-semibold text-stone-900 hover:underline">
          Kirish
        </Link>
      </div>
    </div>
  );
}