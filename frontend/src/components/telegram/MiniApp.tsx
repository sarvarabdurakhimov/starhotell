"use client";

import Script from "next/script";
import { useCallback, useEffect, useMemo, useState } from "react";
import { somNumber } from "@/lib/api/helpers";

// ── Telegram WebApp (only the parts used here) ─────────────────────────────

interface TgButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}
interface TgWebApp {
  initData: string;
  ready(): void;
  expand(): void;
  close(): void;
  BackButton: TgButton;
  HapticFeedback?: { notificationOccurred(type: "success" | "error" | "warning"): void };
}
declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp };
  }
}

// ── API ─────────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

interface RoomType {
  id: number;
  name: string;
  description: string;
  max_occupancy: number;
  amenities: string[];
  price_per_night: number;
  total: number | null;
  discount_percent?: number; // returning guest: the total already has it taken off
  photos: string[];
}
interface Info {
  hotel: { name: string; address: string; phone: string };
  today: string;
  last_check_in: string;
  max_nights: number;
  max_guests: number;
  room_types: RoomType[];
  profile: { first_name: string; last_name: string; phone: string; language: string };
  blocked: boolean;
  open_request: string | null;
}
interface MyBooking {
  id: number;
  reference: string;
  room_type: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number;
  total: number;
  status: string;
  status_text: string;
  cancel_pending: boolean;
  can_pay: boolean;
  can_withdraw: boolean;
  can_ask_cancel: boolean;
}

interface SvcItem {
  id: number;
  name: string;
  category: string;
  price: number;
}
interface SvcOrder {
  id: number;
  status: "new" | "accepted" | "delivered" | "cancelled";
  created_at: string;
  note: string;
  total: number;
  is_paid: boolean;
  lines: { name: string; quantity: number; price: number }[];
  can_cancel: boolean;
}
interface Services {
  stay: { room_number: string; check_out: string; reference: string } | null;
  categories: { value: string; label: string }[];
  items: SvcItem[];
  orders: SvcOrder[];
}

class ApiError extends Error {}

// ── texts ───────────────────────────────────────────────────────────────────

const T = {
  uz: {
    loading: "Yuklanmoqda…",
    openInTelegram: "Bu sahifa mehmonxona botidan ochiladi. Telegram'da botga o'ting va «Bron» tugmasini bosing.",
    tabBook: "Bron qilish",
    tabMine: "Bronlarim",
    checkIn: "Kelish",
    checkOut: "Ketish",
    guests: "Mehmonlar",
    search: "Bo'sh xonalarni ko'rish",
    nights: (n: number) => `${n} kecha`,
    perNight: "1 kecha",
    upTo: (n: number) => `${n} kishigacha`,
    noRooms: "Bu sanalarda bo'sh xona yo'q. Boshqa sanalarni tanlang.",
    choose: "Tanlash",
    total: "Jami",
    yourDetails: "Ma'lumotlaringiz",
    firstName: "Ism",
    lastName: "Familiya",
    phone: "Telefon",
    confirm: "So'rov yuborish",
    sending: "Yuborilmoqda…",
    doneTitle: "So'rov yuborildi!",
    doneText: (ref: string) => `Bron raqami: ${ref}. Menejer ko'rib chiqqach, botda xabar olasiz.`,
    toMine: "Bronlarimga o'tish",
    close: "Yopish",
    pending: (ref: string) => `Sizda ko'rib chiqilayotgan so'rov bor (${ref}). Yangi bron uchun javobni kuting yoki uni bekor qiling.`,
    blocked: "Kechirasiz, bu mehmonxonada onlayn bron qila olmaysiz. Mehmonxona bilan bog'laning.",
    empty: "Hali bron yo'q.",
    pay: "To'lash",
    paySent: "To'lov chatga yuborildi: botga qayting va to'lang.",
    withdraw: "So'rovni bekor qilish",
    askCancel: "Bekor qilishni so'rash",
    confirmWithdraw: "So'rovni bekor qilasizmi?",
    confirmAskCancel: "Bronni bekor qilish so'rovi menejerga yuboriladi. Davom etasizmi?",
    contacts: "Aloqa",
    error: "Xatolik yuz berdi. Qayta urinib ko'ring.",
    tabServices: "Xizmatlar",
    noStay: "Xizmatlar mehmonxonaga joylashganingizdan keyin ochiladi: suv, meva, sochiq, ko'rpa, ovqat va boshqalarni xonangizga buyurtma qilasiz.",
    room: (n: string) => `${n}-xona`,
    free: "bepul",
    cart: "Savatcha",
    notePlaceholder: "Izoh (masalan: soat 20:00 da olib keling)",
    order: "Buyurtma berish",
    ordered: "Buyurtma yuborildi! Xodim qabul qilgach, botda xabar olasiz.",
    payNote: "To'lov qabulxonada, chiqishda.",
    myOrders: "Buyurtmalarim",
    cancelOrder: "Bekor qilish",
    confirmCancelOrder: "Buyurtmani bekor qilasizmi?",
    orderStatus: { new: "⏳ Yuborildi", accepted: "🛎 Qabul qilindi", delivered: "✅ Yetkazildi", cancelled: "❌ Bekor qilindi" },
    menuEmpty: "Mehmonxona hali menyu qo'shmagan.",
  },
  ru: {
    loading: "Загрузка…",
    openInTelegram: "Эта страница открывается из бота отеля. Перейдите в бот в Telegram и нажмите «Бронь».",
    tabBook: "Бронирование",
    tabMine: "Мои брони",
    checkIn: "Заезд",
    checkOut: "Выезд",
    guests: "Гости",
    search: "Показать свободные номера",
    nights: (n: number) => `${n} ноч.`,
    perNight: "1 ночь",
    upTo: (n: number) => `до ${n} чел.`,
    noRooms: "На эти даты свободных номеров нет. Выберите другие даты.",
    choose: "Выбрать",
    total: "Итого",
    yourDetails: "Ваши данные",
    firstName: "Имя",
    lastName: "Фамилия",
    phone: "Телефон",
    confirm: "Отправить запрос",
    sending: "Отправка…",
    doneTitle: "Запрос отправлен!",
    doneText: (ref: string) => `Номер брони: ${ref}. Когда менеджер рассмотрит его, вы получите сообщение в боте.`,
    toMine: "Перейти к моим броням",
    close: "Закрыть",
    pending: (ref: string) => `У вас уже есть запрос на рассмотрении (${ref}). Дождитесь ответа или отмените его.`,
    blocked: "К сожалению, онлайн-бронирование в этом отеле для вас недоступно. Свяжитесь с отелем.",
    empty: "Броней пока нет.",
    pay: "Оплатить",
    paySent: "Счёт отправлен в чат: вернитесь в бот и оплатите.",
    withdraw: "Отменить запрос",
    askCancel: "Запросить отмену",
    confirmWithdraw: "Отменить запрос?",
    confirmAskCancel: "Запрос на отмену брони будет отправлен менеджеру. Продолжить?",
    contacts: "Контакты",
    error: "Произошла ошибка. Попробуйте ещё раз.",
    tabServices: "Услуги",
    noStay: "Услуги откроются после заселения: закажите в номер воду, фрукты, полотенца, одеяло, еду и другое.",
    room: (n: string) => `номер ${n}`,
    free: "бесплатно",
    cart: "Корзина",
    notePlaceholder: "Комментарий (например: принесите в 20:00)",
    order: "Оформить заказ",
    ordered: "Заказ отправлен! Когда сотрудник примет его, вы получите сообщение в боте.",
    payNote: "Оплата на ресепшене при выезде.",
    myOrders: "Мои заказы",
    cancelOrder: "Отменить",
    confirmCancelOrder: "Отменить заказ?",
    orderStatus: { new: "⏳ Отправлен", accepted: "🛎 Принят", delivered: "✅ Доставлен", cancelled: "❌ Отменён" },
    menuEmpty: "Отель ещё не добавил меню.",
  },
};
type Lang = keyof typeof T;

// ── helpers ─────────────────────────────────────────────────────────────────

const som = (n: number | null | undefined) => `${somNumber(n ?? 0)} so'm`;
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const nightsBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const fmtDate = (iso: string) => iso.split("-").reverse().join(".");

// Telegram sets these CSS variables from the user's theme (light / dark)
const C = {
  bg: "var(--tg-theme-bg-color, #ffffff)",
  text: "var(--tg-theme-text-color, #1c1917)",
  hint: "var(--tg-theme-hint-color, #78716c)",
  card: "var(--tg-theme-secondary-bg-color, #f5f5f4)",
  button: "var(--tg-theme-button-color, #1c1917)",
  buttonText: "var(--tg-theme-button-text-color, #ffffff)",
  link: "var(--tg-theme-link-color, #b45309)",
  danger: "var(--tg-theme-destructive-text-color, #dc2626)",
};

type Step = "search" | "results" | "details" | "done";

export function MiniApp({ botId }: { botId: string }) {
  const [tg, setTg] = useState<TgWebApp | null>(null);
  const [scriptDone, setScriptDone] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<"book" | "mine" | "services">("book");
  const [svc, setSvc] = useState<Services | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [orderNote, setOrderNote] = useState("");

  // ?tab=services from the bot's "order to the room" button (sent after check-in), ?tab=mine for bookings
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted === "services" || wanted === "mine") setTab(wanted);
  }, []);
  const [step, setStep] = useState<Step>("search");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const [results, setResults] = useState<RoomType[] | null>(null);
  const [chosen, setChosen] = useState<RoomType | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "" });
  const [doneRef, setDoneRef] = useState("");
  const [mine, setMine] = useState<MyBooking[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lang: Lang = info?.profile.language === "ru" ? "ru" : "uz";
  const t = T[lang];

  const call = useCallback(
    async <R,>(path: string, init?: { method?: string; body?: unknown; query?: Record<string, string | number> }) => {
      const qs = init?.query ? `?${new URLSearchParams(Object.entries(init.query).map(([k, v]) => [k, String(v)]))}` : "";
      const res = await fetch(`${API}/telegram/webapp/${botId}/${path}${qs}`, {
        method: init?.method || "GET",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": tg?.initData || "" },
        body: init?.body ? JSON.stringify(init.body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError((data as { detail?: string }).detail || T.uz.error);
      return data as R;
    },
    [botId, tg],
  );

  // 1. Telegram script loaded → 2. initData present → 3. load hotel info
  useEffect(() => {
    if (!scriptDone) return;
    const app = window.Telegram?.WebApp;
    if (!app || !app.initData) {
      setFatal(T.uz.openInTelegram);
      return;
    }
    app.ready();
    app.expand();
    setTg(app);
  }, [scriptDone]);

  useEffect(() => {
    if (!tg) return;
    call<Info>("info/")
      .then((data) => {
        setInfo(data);
        setCheckIn(data.today);
        setCheckOut(addDays(data.today, 1));
        setForm({ first_name: data.profile.first_name, last_name: data.profile.last_name, phone: data.profile.phone });
      })
      .catch((e: Error) => setFatal(e.message));
  }, [tg, call]);

  const loadServices = useCallback(() => {
    call<Services>("services/").then(setSvc).catch((e: Error) => setError(e.message));
  }, [call]);
  const loadMine = useCallback(() => {
    call<MyBooking[]>("bookings/").then(setMine).catch((e: Error) => setError(e.message));
  }, [call]);
  useEffect(() => {
    if (tab === "mine" && tg) loadMine();
    if (tab === "services" && tg) loadServices();
  }, [tab, tg, loadMine, loadServices]);

  // Telegram's own back button walks back through the booking steps
  const back = useMemo(() => {
    if (tab !== "book") return null;
    if (step === "results") return () => setStep("search");
    if (step === "details") return () => setStep("results");
    return null;
  }, [tab, step]);
  useEffect(() => {
    if (!tg) return;
    if (!back) {
      tg.BackButton.hide();
      return;
    }
    tg.BackButton.show();
    tg.BackButton.onClick(back);
    return () => tg.BackButton.offClick(back);
  }, [tg, back]);

  const haptic = (type: "success" | "error") => tg?.HapticFeedback?.notificationOccurred(type);
  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : t.error);
    haptic("error");
  };

  const search = async () => {
    setError(null);
    setBusy(true);
    try {
      const data = await call<{ room_types: RoomType[] }>("availability/", {
        query: { check_in: checkIn, check_out: checkOut, guests },
      });
      setResults(data.room_types);
      setStep("results");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const book = async () => {
    if (!chosen) return;
    setError(null);
    setBusy(true);
    try {
      const b = await call<MyBooking>("book/", {
        method: "POST",
        body: { room_type_id: chosen.id, check_in: checkIn, check_out: checkOut, guests, ...form },
      });
      setDoneRef(b.reference);
      setInfo((i) => (i ? { ...i, open_request: b.reference } : i));
      setStep("done");
      haptic("success");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const act = async (b: MyBooking, action: "cancel" | "pay") => {
    if (action === "cancel" && !window.confirm(b.can_withdraw ? t.confirmWithdraw : t.confirmAskCancel)) return;
    setError(null);
    setBusy(true);
    try {
      const updated = await call<MyBooking>(`bookings/${b.id}/${action}/`, { method: "POST" });
      setMine((list) => list?.map((x) => (x.id === b.id ? updated : x)) ?? null);
      if (action === "pay") setNotice(t.paySent);
      if (action === "cancel" && b.can_withdraw) setInfo((i) => (i ? { ...i, open_request: null } : i));
      haptic("success");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // ── render ──

  const shell = (children: React.ReactNode) => (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh" }} className="overflow-x-hidden font-sans">
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onReady={() => setScriptDone(true)}
        onError={() => setScriptDone(true)}
      />
      <div className="mx-auto max-w-md px-4 pb-10 pt-3">{children}</div>
    </div>
  );

  if (fatal) return shell(<p className="pt-16 text-center text-sm" style={{ color: C.hint }}>{fatal}</p>);
  if (!info) return shell(<p className="pt-16 text-center text-sm" style={{ color: C.hint }}>{T.uz.loading}</p>);

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const datesOk = !!checkIn && !!checkOut && nights >= 1 && nights <= info.max_nights;
  const primary = "w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-50";
  const field = "block w-full min-w-0 appearance-none rounded-xl px-3 py-2.5 text-[15px] outline-none";
  const fieldStyle = { background: C.card, color: C.text };

  const tabs = (
    <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl p-1" style={{ background: C.card }}>
      {(["book", "services", "mine"] as const).map((k) => (
        <button
          key={k}
          onClick={() => {
            setTab(k);
            setError(null);
            setNotice(null);
          }}
          className="rounded-lg py-2 text-sm font-semibold"
          style={tab === k ? { background: C.button, color: C.buttonText } : { color: C.hint }}
        >
          {k === "book" ? t.tabBook : k === "services" ? t.tabServices : t.tabMine}
        </button>
      ))}
    </div>
  );

  const alert = (text: string | null, color = C.danger) =>
    text && (
      <div className="mb-3 rounded-xl px-3 py-2.5 text-sm" style={{ background: C.card, color }}>
        {text}
      </div>
    );

  const photos = (rt: RoomType) =>
    rt.photos.length > 0 && (
      <div className="-mx-3 -mt-3 mb-3 flex snap-x snap-mandatory gap-1 overflow-x-auto rounded-t-2xl">
        {rt.photos.map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt={rt.name} className="h-44 w-full shrink-0 snap-center object-cover" loading="lazy" />
        ))}
      </div>
    );

  const cartLines = svc ? svc.items.filter((i) => cart[i.id]) : [];
  const cartTotal = cartLines.reduce((sum, i) => sum + i.price * cart[i.id], 0);
  const setQty = (id: number, q: number) =>
    setCart((c) => {
      const next = { ...c };
      if (q <= 0) delete next[id];
      else next[id] = Math.min(q, 20);
      return next;
    });

  const placeOrder = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await call<SvcOrder>("services/order/", {
        method: "POST",
        body: { items: cartLines.map((i) => ({ id: i.id, quantity: cart[i.id] })), note: orderNote },
      });
      setCart({});
      setOrderNote("");
      setNotice(t.ordered);
      haptic("success");
      loadServices();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (o: SvcOrder) => {
    if (!window.confirm(t.confirmCancelOrder)) return;
    setError(null);
    setBusy(true);
    try {
      await call<SvcOrder>(`services/orders/${o.id}/cancel/`, { method: "POST" });
      loadServices();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (tab === "services") {
    if (svc === null) {
      body = <p className="pt-8 text-center text-sm" style={{ color: C.hint }}>{t.loading}</p>;
    } else if (!svc.stay) {
      body = <p className="pt-6 text-center text-sm" style={{ color: C.hint }}>{t.noStay}</p>;
    } else {
      body = (
        <>
          <div className="mb-3 text-sm" style={{ color: C.hint }}>
            🛏 {t.room(svc.stay.room_number)} · {t.payNote}
          </div>
          {alert(notice, C.link)}
          {svc.items.length === 0 && alert(t.menuEmpty, C.hint)}
          {svc.categories.map((cat) => (
            <div key={cat.value} className="mb-4">
              <h3 className="mb-2 text-xs font-semibold uppercase" style={{ color: C.hint }}>{cat.label}</h3>
              <div className="overflow-hidden rounded-2xl" style={{ background: C.card }}>
                {svc.items.filter((i) => i.category === cat.value).map((i, idx) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5"
                    style={idx ? { borderTop: `1px solid ${C.bg}` } : undefined}>
                    <div className="min-w-0">
                      <div className="truncate text-[15px]">{i.name}</div>
                      <div className="text-xs" style={{ color: C.hint }}>{i.price ? som(i.price) : t.free}</div>
                    </div>
                    {cart[i.id] ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <button className="h-8 w-8 rounded-full text-lg" style={{ background: C.bg }}
                          onClick={() => setQty(i.id, cart[i.id] - 1)}>−</button>
                        <span className="w-5 text-center font-semibold">{cart[i.id]}</span>
                        <button className="h-8 w-8 rounded-full text-lg" style={{ background: C.bg }}
                          onClick={() => setQty(i.id, cart[i.id] + 1)}>+</button>
                      </div>
                    ) : (
                      <button className="shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold"
                        style={{ background: C.button, color: C.buttonText }} onClick={() => setQty(i.id, 1)}>+</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {cartLines.length > 0 && (
            <div className="sticky bottom-3 mt-4 rounded-2xl p-3 shadow-lg" style={{ background: C.card }}>
              <div className="mb-2 flex justify-between text-sm font-semibold">
                <span>{t.cart}: {cartLines.reduce((n, i) => n + cart[i.id], 0)}</span>
                <span>{cartTotal ? som(cartTotal) : t.free}</span>
              </div>
              <input className={field} style={{ ...fieldStyle, background: C.bg }} placeholder={t.notePlaceholder}
                maxLength={500} value={orderNote} onChange={(e) => setOrderNote(e.target.value)} />
              <button disabled={busy} onClick={placeOrder} className={`${primary} mt-2`}
                style={{ background: C.button, color: C.buttonText }}>
                {busy ? t.sending : t.order}
              </button>
            </div>
          )}

          {svc.orders.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 text-xs font-semibold uppercase" style={{ color: C.hint }}>{t.myOrders}</h3>
              <div className="space-y-2">
                {svc.orders.map((o) => (
                  <div key={o.id} className="rounded-2xl p-3 text-sm" style={{ background: C.card }}>
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold">#{o.id} · {t.orderStatus[o.status]}</span>
                      <span>{o.total ? som(o.total) : t.free}</span>
                    </div>
                    <div className="mt-1 text-xs" style={{ color: C.hint }}>
                      {o.lines.map((l) => `${l.name} × ${l.quantity}`).join(", ")}
                    </div>
                    {o.can_cancel && (
                      <button disabled={busy} onClick={() => cancelOrder(o)} className="mt-2 text-xs font-semibold"
                        style={{ color: C.danger }}>
                        {t.cancelOrder}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      );
    }
  } else if (tab === "mine") {
    body = (
      <>
        {alert(notice, C.link)}
        {mine === null ? (
          <p className="pt-8 text-center text-sm" style={{ color: C.hint }}>{t.loading}</p>
        ) : mine.length === 0 ? (
          <p className="pt-8 text-center text-sm" style={{ color: C.hint }}>{t.empty}</p>
        ) : (
          <div className="space-y-3">
            {mine.map((b) => (
              <div key={b.id} className="rounded-2xl p-3" style={{ background: C.card }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs" style={{ color: C.hint }}>{b.reference}</span>
                  <span className="text-sm font-semibold">{som(b.total)}</span>
                </div>
                <div className="mt-1 font-semibold">{b.room_type}</div>
                <div className="text-sm" style={{ color: C.hint }}>
                  {fmtDate(b.check_in)} — {fmtDate(b.check_out)} · {t.nights(b.nights)}
                </div>
                <div className="mt-2 text-sm">{b.status_text}</div>
                {b.cancel_pending && <div className="text-xs" style={{ color: C.hint }}>📨</div>}
                <div className="mt-3 flex gap-2">
                  {b.can_pay && (
                    <button disabled={busy} onClick={() => act(b, "pay")} className={primary}
                      style={{ background: C.button, color: C.buttonText }}>
                      {t.pay}
                    </button>
                  )}
                  {(b.can_withdraw || b.can_ask_cancel) && (
                    <button disabled={busy} onClick={() => act(b, "cancel")} className={primary}
                      style={{ background: C.bg, color: C.danger }}>
                      {b.can_withdraw ? t.withdraw : t.askCancel}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  } else if (info.blocked) {
    body = alert(t.blocked);
  } else if (step === "done") {
    body = (
      <div className="pt-10 text-center">
        <div className="text-5xl">✅</div>
        <h2 className="mt-4 text-xl font-bold">{t.doneTitle}</h2>
        <p className="mt-2 text-sm" style={{ color: C.hint }}>{t.doneText(doneRef)}</p>
        <div className="mt-8 space-y-2">
          <button className={primary} style={{ background: C.button, color: C.buttonText }}
            onClick={() => { setTab("mine"); setStep("search"); }}>
            {t.toMine}
          </button>
          <button className={primary} style={{ background: C.card, color: C.text }} onClick={() => tg?.close()}>
            {t.close}
          </button>
        </div>
      </div>
    );
  } else if (info.open_request) {
    body = alert(t.pending(info.open_request), C.link);
  } else if (step === "search") {
    body = (
      <>
        <div className="space-y-3 rounded-2xl p-3" style={{ background: C.card }}>
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0 text-xs" style={{ color: C.hint }}>
              {t.checkIn}
              <input type="date" className={`${field} mt-1`} style={{ ...fieldStyle, background: C.bg }}
                value={checkIn} min={info.today} max={info.last_check_in}
                onChange={(e) => {
                  setCheckIn(e.target.value);
                  if (!checkOut || checkOut <= e.target.value) setCheckOut(addDays(e.target.value, 1));
                }} />
            </label>
            <label className="block min-w-0 text-xs" style={{ color: C.hint }}>
              {t.checkOut}
              <input type="date" className={`${field} mt-1`} style={{ ...fieldStyle, background: C.bg }}
                value={checkOut} min={checkIn ? addDays(checkIn, 1) : info.today}
                max={checkIn ? addDays(checkIn, info.max_nights) : undefined}
                onChange={(e) => setCheckOut(e.target.value)} />
            </label>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">{t.guests}</span>
            <div className="flex items-center gap-3">
              <button className="h-9 w-9 rounded-full text-lg" style={{ background: C.bg }}
                onClick={() => setGuests((g) => Math.max(1, g - 1))}>−</button>
              <span className="w-6 text-center font-semibold">{guests}</span>
              <button className="h-9 w-9 rounded-full text-lg" style={{ background: C.bg }}
                onClick={() => setGuests((g) => Math.min(info.max_guests, g + 1))}>+</button>
            </div>
          </div>
          {datesOk && <div className="text-xs" style={{ color: C.hint }}>{t.nights(nights)}</div>}
        </div>
        <button disabled={busy || !datesOk} onClick={search} className={`${primary} mt-4`}
          style={{ background: C.button, color: C.buttonText }}>
          {busy ? t.loading : t.search}
        </button>

        {/* A look at every room type before choosing dates */}
        <div className="mt-6 space-y-3">
          {info.room_types.map((rt) => (
            <div key={rt.id} className="overflow-hidden rounded-2xl p-3" style={{ background: C.card }}>
              {photos(rt)}
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-semibold">{rt.name}</span>
                <span className="text-sm">{som(rt.price_per_night)} <span style={{ color: C.hint }}>/ {t.perNight}</span></span>
              </div>
              <div className="text-xs" style={{ color: C.hint }}>{t.upTo(rt.max_occupancy)}</div>
            </div>
          ))}
        </div>
      </>
    );
  } else if (step === "results") {
    body = (
      <>
        <div className="mb-3 text-sm" style={{ color: C.hint }}>
          {fmtDate(checkIn)} — {fmtDate(checkOut)} · {t.nights(nights)} · {guests} 👤
        </div>
        {results && results.length === 0 && alert(t.noRooms, C.hint)}
        <div className="space-y-3">
          {results?.map((rt) => (
            <div key={rt.id} className="overflow-hidden rounded-2xl p-3" style={{ background: C.card }}>
              {photos(rt)}
              <div className="font-semibold">{rt.name}</div>
              {rt.description && <p className="mt-1 text-sm" style={{ color: C.hint }}>{rt.description}</p>}
              {rt.amenities.length > 0 && (
                <p className="mt-1 text-xs" style={{ color: C.hint }}>✨ {rt.amenities.join(", ")}</p>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-lg font-bold">
                    {som(rt.total)}
                    {!!rt.discount_percent && (
                      <span className="ml-2 rounded-md px-1.5 py-0.5 text-xs font-semibold"
                        style={{ background: C.button, color: C.buttonText }}>🎁 −{rt.discount_percent}%</span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: C.hint }}>{t.nights(nights)} · {t.upTo(rt.max_occupancy)}</div>
                </div>
                <button className="rounded-xl px-5 py-2.5 text-sm font-semibold"
                  style={{ background: C.button, color: C.buttonText }}
                  onClick={() => { setChosen(rt); setStep("details"); setError(null); }}>
                  {t.choose}
                </button>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  } else if (chosen) {
    body = (
      <>
        <div className="rounded-2xl p-3" style={{ background: C.card }}>
          <div className="font-semibold">{chosen.name}</div>
          <div className="text-sm" style={{ color: C.hint }}>
            {fmtDate(checkIn)} — {fmtDate(checkOut)} · {t.nights(nights)} · {guests} 👤
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span>{t.total}</span>
            <span className="font-bold">{som(chosen.total)}</span>
          </div>
        </div>
        <h3 className="mb-2 mt-5 text-sm font-semibold">{t.yourDetails}</h3>
        <div className="space-y-2">
          <input className={field} style={fieldStyle} placeholder={t.firstName} value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <input className={field} style={fieldStyle} placeholder={t.lastName} value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          <input className={field} style={fieldStyle} placeholder="+998 90 123 45 67" type="tel" inputMode="tel"
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <button disabled={busy || !form.first_name.trim() || !form.last_name.trim() || form.phone.replace(/\D/g, "").length < 9}
          onClick={book} className={`${primary} mt-5`} style={{ background: C.button, color: C.buttonText }}>
          {busy ? t.sending : t.confirm}
        </button>
      </>
    );
  }

  return shell(
    <>
      <h1 className="text-lg font-bold">{info.hotel.name}</h1>
      {info.hotel.address && <p className="mb-3 text-xs" style={{ color: C.hint }}>{info.hotel.address}</p>}
      {tabs}
      {alert(error)}
      {body}
      {info.hotel.phone && (
        <p className="mt-8 text-center text-xs" style={{ color: C.hint }}>
          {t.contacts}: <a href={`tel:${info.hotel.phone}`} style={{ color: C.link }}>{info.hotel.phone}</a>
        </p>
      )}
    </>,
  );
}
