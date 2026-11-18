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

  const [tab, setTab] = useState<"book" | "mine">("book");
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

  const loadMine = useCallback(() => {
    call<MyBooking[]>("bookings/").then(setMine).catch((e: Error) => setError(e.message));
  }, [call]);
  useEffect(() => {
    if (tab === "mine" && tg) loadMine();
  }, [tab, tg, loadMine]);

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
    <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: C.card }}>
      {(["book", "mine"] as const).map((k) => (
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
          {k === "book" ? t.tabBook : t.tabMine}
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

  let body: React.ReactNode;
  if (tab === "mine") {
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
                  <div className="text-lg font-bold">{som(rt.total)}</div>
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
