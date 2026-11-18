"use client";

// Owner connects the hotel's Telegram booking bot and its Click / Payme payments.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconBrandTelegram,
  IconCircleCheck,
  IconCreditCard,
  IconDeviceFloppy,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconPlugConnectedX,
} from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { apiError } from "@/lib/api/helpers";
import { usePanel } from "@/lib/panel-context";

interface BotInfo {
  configured: boolean;
  bot_username?: string;
  is_active?: boolean;
  token_hint?: string;
  payment_provider_name?: string;
  payment_token_hint?: string;
  payment_test_mode?: boolean;
  payment_hours?: number;
  notify_chat_id?: string;
  mode: "webhook" | "polling";
  warning?: string | null;
}

const input = "w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none bg-white text-xs";
const label = "block text-[11px] font-bold text-stone-700 uppercase mb-1";

export function TelegramBotSettings() {
  const { hotelId } = usePanel();
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState({
    token: "",
    is_active: true,
    payment_provider_name: "",
    payment_provider_token: "",
    payment_hours: "2",
    notify_chat_id: "",
  });

  const { data: bot, isLoading } = useQuery({
    queryKey: ["telegram-bot", hotelId],
    queryFn: async () => (await apiClient.get<BotInfo>(`/telegram/hotels/${hotelId}/bot/`)).data,
  });

  useEffect(() => {
    if (!bot) return;
    setForm((f) => ({
      ...f,
      token: "",
      payment_provider_token: "",
      is_active: bot.is_active ?? true,
      payment_provider_name: bot.payment_provider_name || "",
      payment_hours: String(bot.payment_hours ?? 2),
      notify_chat_id: bot.notify_chat_id || "",
    }));
  }, [bot]);

  const save = useMutation({
    mutationFn: async () => (await apiClient.put<BotInfo>(`/telegram/hotels/${hotelId}/bot/`, form)).data,
    onSuccess: (data) => {
      queryClient.setQueryData(["telegram-bot", hotelId], data);
      setMsg(
        data.warning
          ? { ok: false, text: data.warning }
          : { ok: true, text: `Saqlandi. Bot: @${data.bot_username}` }
      );
    },
    onError: (err) => setMsg({ ok: false, text: apiError(err) }),
  });

  const disconnect = useMutation({
    mutationFn: () => apiClient.delete(`/telegram/hotels/${hotelId}/bot/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-bot", hotelId] });
      setMsg({ ok: true, text: "Bot uzildi." });
    },
  });

  if (isLoading || !bot) return <p className="text-xs text-stone-400">Yuklanmoqda...</p>;

  const paymentsOn = !!form.payment_provider_name && (!!form.payment_provider_token || !!bot.payment_token_hint);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          save.mutate();
        }}
        className="lg:col-span-2 bg-white border border-stone-200 rounded shadow-sm p-5 space-y-5"
      >
        {msg && (
          <div
            className={`p-3 rounded border text-xs flex items-center gap-2 ${
              msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {msg.ok ? <IconCircleCheck className="w-4 h-4 shrink-0" /> : <IconAlertTriangle className="w-4 h-4 shrink-0" />}
            {msg.text}
          </div>
        )}

        {/* Bot */}
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <IconBrandTelegram className="w-4 h-4 text-sky-600" /> Bot
          </h3>
          {bot.configured && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded bg-sky-50 border border-sky-200 text-xs">
              <span className="text-sky-950">
                Ulangan:{" "}
                <a href={`https://t.me/${bot.bot_username}`} target="_blank" rel="noreferrer" className="font-bold underline inline-flex items-center gap-0.5">
                  @{bot.bot_username} <IconExternalLink className="w-3 h-3" />
                </a>
              </span>
              <label className="inline-flex items-center gap-1.5 text-stone-700">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                Bot ishlayapti
              </label>
            </div>
          )}
          <div>
            <label className={label}>Bot tokeni {bot.configured ? "" : "*"}</label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                autoComplete="off"
                value={form.token}
                onChange={(e) => setForm({ ...form, token: e.target.value })}
                placeholder={bot.configured ? `${bot.token_hint} (o'zgartirish uchun yangisini kiriting)` : "123456789:AAH..."}
                className={`${input} pr-9 font-mono`}
                required={!bot.configured}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                title={showToken ? "Yashirish" : "Ko'rsatish"}
                aria-label={showToken ? "Yashirish" : "Ko'rsatish"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
              >
                {showToken ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className={label}>Yangi so&apos;rovlar xabari uchun chat ID</label>
            <input
              value={form.notify_chat_id}
              onChange={(e) => setForm({ ...form, notify_chat_id: e.target.value })}
              placeholder="-1001234567890 (ixtiyoriy)"
              className={`${input} font-mono`}
            />
            <p className="mt-1 text-[11px] text-stone-500">
              Menejerlar guruhi yoki o&apos;zingizning ID raqamingiz. Har yangi bron so&apos;rovida bot shu yerga xabar yozadi.
            </p>
          </div>
        </section>

        {/* Payments */}
        <section className="space-y-3 pt-4 border-t border-stone-200">
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <IconCreditCard className="w-4 h-4 text-stone-600" /> Oldindan to&apos;lov
            {bot.payment_test_mode && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-bold">TEST</span>
            )}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>To&apos;lov tizimi</label>
              <select
                value={form.payment_provider_name}
                onChange={(e) => setForm({ ...form, payment_provider_name: e.target.value })}
                className={input}
              >
                <option value="">— Yo&apos;q —</option>
                <option value="click">Click</option>
                <option value="payme">Payme</option>
              </select>
            </div>
            <div>
              <label className={label}>Provider token</label>
              <input
                type="password"
                autoComplete="off"
                value={form.payment_provider_token}
                onChange={(e) => setForm({ ...form, payment_provider_token: e.target.value })}
                placeholder={bot.payment_token_hint || "398062629:TEST:..."}
                className={`${input} font-mono`}
              />
            </div>
            <div>
              <label className={label}>To&apos;lov muddati (soat)</label>
              <input
                type="number"
                min="1"
                max="72"
                value={form.payment_hours}
                onChange={(e) => setForm({ ...form, payment_hours: e.target.value })}
                className={input}
              />
            </div>
          </div>
          <p className={`text-[11px] ${paymentsOn ? "text-emerald-800" : "text-amber-800"}`}>
            {paymentsOn
              ? "Menejer tasdiqlagach mijozga to'lov yuboriladi. Muddat ichida to'lanmasa, bron bekor bo'ladi."
              : `To'lov sozlanmagan: menejer tasdiqlagan bron to'lovsiz tasdiqlanadi.`}
          </p>
        </section>

        <div className="flex items-center justify-between pt-4 border-t border-stone-200">
          {bot.configured ? (
            <button
              type="button"
              onClick={() => {
                if (confirm("Botni mehmonxonadan uzasizmi? Bot mijozlarga javob bermay qo'yadi.")) disconnect.mutate();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded"
            >
              <IconPlugConnectedX className="w-4 h-4" /> Botni uzish
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={save.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded disabled:opacity-50"
          >
            <IconDeviceFloppy className="w-4 h-4 text-amber-400" />
            {save.isPending ? "Tekshirilmoqda..." : bot.configured ? "Saqlash" : "Botni ulash"}
          </button>
        </div>
      </form>

      {/* How-to */}
      <aside className="bg-stone-50 border border-stone-200 rounded p-5 text-xs text-stone-700 space-y-4">
        <div>
          <h4 className="font-bold text-stone-900 mb-1.5">1. Bot yaratish</h4>
          <ol className="list-decimal list-inside space-y-1">
            <li>Telegram&apos;da <b>@BotFather</b> ni oching</li>
            <li><code className="bg-white px-1 border rounded">/newbot</code> yuboring, nom va username bering</li>
            <li>Bergan tokenni chapdagi &quot;Bot tokeni&quot; ga qo&apos;ying</li>
          </ol>
        </div>
        <div>
          <h4 className="font-bold text-stone-900 mb-1.5">2. Click yoki Payme ulash</h4>
          <ol className="list-decimal list-inside space-y-1">
            <li>@BotFather → <code className="bg-white px-1 border rounded">/mybots</code> → botingiz → <b>Payments</b></li>
            <li><b>Click</b> yoki <b>Payme</b> ni tanlang</li>
            <li>Sinov uchun <b>Test</b> tokenni oling, haqiqiy to&apos;lov uchun Click/Payme bilan shartnoma kerak</li>
            <li>Tokenni &quot;Provider token&quot; ga qo&apos;ying</li>
          </ol>
        </div>
        <div>
          <h4 className="font-bold text-stone-900 mb-1.5">3. Xona rasmlari</h4>
          <p>Xonalar sahifasidagi &quot;Xona turlari&quot; bo&apos;limida har bir turga rasm va tavsif qo&apos;shing.</p>
        </div>
        {bot.mode === "polling" && (
          <p className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-900">
            Lokal rejim: bot kompyuterda ishlayotgan server orqali javob beradi. Kompyuter o&apos;chsa, bot ham to&apos;xtaydi.
          </p>
        )}
      </aside>
    </div>
  );
}
