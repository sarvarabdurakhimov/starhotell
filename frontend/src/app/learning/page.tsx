"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  IconAdjustments,
  IconArrowRight,
  IconBed,
  IconBolt,
  IconBuilding,
  IconBuildingSkyscraper,
  IconCalendarCheck,
  IconChartBar,
  IconChevronDown,
  IconCircleCheck,
  IconCircleX,
  IconCurrencyDollar,
  IconHelpCircle,
  IconLock,
  IconMoon,
  IconPlayerPlay,
  IconReceipt,
  IconRotate,
  IconSend,
  IconShieldCheck,
  IconSparkles,
  IconStack2,
  IconSun,
  IconTrendingUp,
  IconUsersGroup,
} from "@tabler/icons-react";

export default function LearningLandingPage() {
  const [isDark, setIsDark] = useState(false);
  const [annualBilling, setAnnualBilling] = useState(true);
  const [activeWalkthroughStep, setActiveWalkthroughStep] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(null);


  // Initialize theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("hms_theme");
    if (savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem("hms_theme", next ? "dark" : "light");
  };

  // Walkthrough interactive steps
  const walkthroughSteps = [
    {
      title: "1. Xonalarni sozlash",
      desc: "Valyuta, vaqt va xona turlari.",
      badge: "Sozlash",
      uiPreview: {
        title: "Xona qo'shish",
        status: "Saqlandi",
        item1: "Xona turi va narxi",
        item2: "Xona raqami va qavati",
      },
    },
    {
      title: "2. Bron yaratish",
      desc: "Bir xona — bir vaqtda bitta bron.",
      badge: "Himoya",
      uiPreview: {
        title: "Double-booking himoyasi",
        status: "Himoyalangan",
        item1: "Sanalar tekshiriladi",
        item2: "To'qnashuv bo'lsa rad etiladi",
      },
    },
    {
      title: "3. Check-in",
      desc: "Bir tugmada joylashtirish.",
      badge: "Tezkor",
      uiPreview: {
        title: "Joylashtirildi",
        status: "Checked In",
        item1: "Xona band bo'ladi",
        item2: "Kelgan vaqt yoziladi",
      },
    },
    {
      title: "4. Tozalash",
      desc: "Bo'shagan xona avtomatik navbatga tushadi.",
      badge: "Avtomatik",
      uiPreview: {
        title: "Tozalash holati",
        status: "Tayyor",
        item1: "Topshiriq avtomatik yaratiladi",
        item2: "Qabul qilingach xona bo'shaydi",
      },
    },
  ];

  // Pricing data
  const pricingPlans = [
    {
      name: "Mini",
      desc: "1–25 xona",
      monthlyPrice: 49,
      annualPrice: 39,
      features: ["25 tagacha xona", "Cheksiz bron", "Email yordam"],
      cta: "Boshlash",
      popular: false,
    },
    {
      name: "Professional",
      desc: "25–150 xona",
      monthlyPrice: 129,
      annualPrice: 99,
      features: ["150 tagacha xona", "Tozalash va xodimlar", "SMS xabarnoma", "24/7 yordam"],
      cta: "14 kun bepul",
      popular: true,
    },
    {
      name: "Enterprise",
      desc: "Tarmoqlar, 150+ xona",
      monthlyPrice: 299,
      annualPrice: 249,
      features: ["Cheksiz filiallar", "API integratsiya", "Ustuvor yordam"],
      cta: "Bog'lanish",
      popular: false,
    },
  ];

  // FAQs
  const faqs = [
    {
      q: "Ma'lumotlarim boshqa mehmonxonalarga ko'rinadimi?",
      a: "Yo'q. Har bir so'rov mehmonxona a'zoligi bo'yicha tekshiriladi.",
    },
    {
      q: "Double-booking qanday oldi olinadi?",
      a: "Bron paytida xona bazada qulflanadi — parallel so'rov rad etiladi.",
    },
    {
      q: "Xodimga cheklangan rol bera olamanmi?",
      a: "Ha. Sozlamalarda email va rolni tanlang.",
    },
    {
      q: "O'rganish qancha vaqt oladi?",
      a: "15–30 daqiqa.",
    },
  ];

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900"}`}>
      {/* 1. Header / Navigation */}
      <header className={`sticky top-0 z-50 backdrop-blur-md border-b transition-colors ${
        isDark ? "bg-slate-950/80 border-slate-800" : "bg-white/80 border-slate-200"
      }`}>
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-black text-xl tracking-tight">
            <img
              src="/logo.png"
              alt="StarHotel Logo"
              className="w-10 h-10 rounded-xl object-cover"
            />
            <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 bg-clip-text text-transparent">
              StarHotel
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold">
            <a href="#walkthrough" className="hover:text-blue-600 transition">Yo'riqnoma</a>
            <a href="#features" className="hover:text-blue-600 transition">Imkoniyatlar</a>
            <a href="#comparison" className="hover:text-blue-600 transition">Taqqoslash</a>
            <a href="#pricing" className="hover:text-blue-600 transition">Tariflar</a>
            <a href="#faq" className="hover:text-blue-600 transition">FAQ</a>
          </nav>

          {/* Action buttons + Theme Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              title={isDark ? "Kunduzgi rejimga o'tish" : "Tungi rejimga o'tish"}
              className={`p-2.5 rounded-xl border transition ${
                isDark
                  ? "bg-slate-900 border-slate-700 text-amber-400 hover:bg-slate-800"
                  : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {isDark ? <IconSun className="w-4 h-4" /> : <IconMoon className="w-4 h-4" />}
            </button>

            <Link
              href="/login"
              className={`hidden sm:inline-flex px-4 py-2 text-sm font-semibold rounded-xl transition ${
                isDark ? "hover:bg-slate-900 text-slate-300" : "hover:bg-slate-100 text-slate-700"
              }`}
            >
              Kirish
            </Link>

            <a
              href="/register"
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/25 transition"
            >
              Ro'yxatdan o'tish
            </a>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative pt-16 pb-20 px-6 overflow-hidden">
        {/* Background gradient glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-blue-500/8 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-amber-400/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">

            {/* Left: Text content */}
            <div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1]">
                Mehmonxonani{" "}
                <span className="bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">
                  aqlli
                </span>{" "}
                boshqaring
              </h1>

              <p className={`mt-6 text-base sm:text-lg leading-relaxed max-w-xl ${
                isDark ? "text-slate-400" : "text-slate-600"
              }`}>
                Bron, tozalash va moliya — bitta joyda.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xl shadow-blue-600/30 transition transform hover:-translate-y-0.5"
                >
                  Boshlash <IconArrowRight className="w-4 h-4" />
                </Link>

                <a
                  href="#walkthrough"
                  className={`inline-flex items-center gap-2 px-6 py-3.5 font-bold rounded-xl border transition ${
                    isDark
                      ? "bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <IconPlayerPlay className="w-4 h-4 text-blue-600 fill-blue-600" /> Yo'riqnoma
                </a>
              </div>
            </div>

            {/* Right: Hero Image — uploaded hotel logo / visual */}
            <div className="relative flex items-center justify-center">
              {/* Decorative ring */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-80 h-80 rounded-full border-2 border-dashed animate-spin-slow opacity-20 ${
                  isDark ? "border-blue-500" : "border-blue-300"
                }`} style={{ animationDuration: "20s" }}></div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-64 h-64 rounded-full opacity-10 ${
                  isDark ? "bg-amber-500" : "bg-blue-200"
                } blur-2xl`}></div>
              </div>

              {/* Main image card */}
              <div className={`relative z-10 rounded-3xl overflow-hidden shadow-2xl border ${
                isDark ? "border-slate-700/60 shadow-black/40" : "border-slate-200/80 shadow-slate-300/40"
              }`}>
                <img
                  src="/hero-hotel.png"
                  alt="StarHotel — Premium Hotel Management Platform"
                  className="w-80 h-80 object-cover"
                />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 4. Interactive Learning Walkthrough & Product Guide */}
      <section id="walkthrough" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
            4 qadamda
          </h2>
        </div>

        {/* Walkthrough tabs + preview grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Steps List */}
          <div className="lg:col-span-5 space-y-4">
            {walkthroughSteps.map((step, idx) => {
              const isActive = activeWalkthroughStep === idx;
              return (
                <div
                  key={idx}
                  onClick={() => setActiveWalkthroughStep(idx)}
                  className={`p-6 rounded-2xl cursor-pointer border transition-all duration-300 ${
                    isActive
                      ? isDark
                        ? "bg-slate-900 border-blue-500 shadow-xl shadow-blue-500/10 ring-1 ring-blue-500"
                        : "bg-blue-50/70 border-blue-500 shadow-md ring-1 ring-blue-500"
                      : isDark
                      ? "bg-slate-900/40 border-slate-800/80 hover:bg-slate-900"
                      : "bg-white border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                      {step.badge}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      isActive ? "bg-blue-600 text-white" : "text-slate-500"
                    }`}>
                      0{idx + 1}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold">{step.title}</h3>
                  <p className={`mt-1.5 text-xs sm:text-sm leading-relaxed ${
                    isDark ? "text-slate-400" : "text-slate-600"
                  }`}>
                    {step.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Interactive Live Screen Mockup */}
          <div className="lg:col-span-7">
            <div className={`p-8 rounded-3xl border shadow-2xl transition-all relative overflow-hidden ${
              isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <div className="flex items-center justify-between border-b pb-4 mb-6 border-slate-700/40">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <span className="ml-2 text-xs font-mono text-slate-500">
                    StarHotel
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500">
                  {walkthroughSteps[activeWalkthroughStep].uiPreview.status}
                </span>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-2xl font-black text-blue-600">
                    {walkthroughSteps[activeWalkthroughStep].uiPreview.title}
                  </h4>
                </div>

                <div className={`p-4 rounded-xl border space-y-2 text-sm font-mono ${
                  isDark ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"
                }`}>
                  <div className="flex items-center gap-2 text-emerald-500 font-semibold">
                    <IconCircleCheck className="w-4 h-4" />
                    {walkthroughSteps[activeWalkthroughStep].uiPreview.item1}
                  </div>
                  <div className="flex items-center gap-2 text-blue-500 font-semibold">
                    <IconCircleCheck className="w-4 h-4" />
                    {walkthroughSteps[activeWalkthroughStep].uiPreview.item2}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Core SaaS Features */}
      <section id="features" className={`py-24 px-6 border-t transition-colors ${
        isDark ? "bg-slate-900/30 border-slate-800" : "bg-slate-50 border-slate-200"
      }`}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
              Imkoniyatlar
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className={`p-8 rounded-2xl border transition hover:shadow-lg ${
              isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <IconShieldCheck className="w-10 h-10 text-blue-600 mb-5" />
              <h3 className="text-xl font-bold">Ma'lumotlar izolyatsiyasi</h3>
              <p className={`mt-2 text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Har bir mehmonxona faqat o'z ma'lumotini ko'radi.
              </p>
            </div>

            <div className={`p-8 rounded-2xl border transition hover:shadow-lg ${
              isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <IconLock className="w-10 h-10 text-emerald-500 mb-5" />
              <h3 className="text-xl font-bold">Bron qulfi</h3>
              <p className={`mt-2 text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Bir xonani ikki kishi band qila olmaydi.
              </p>
            </div>

            <div className={`p-8 rounded-2xl border transition hover:shadow-lg ${
              isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <IconUsersGroup className="w-10 h-10 text-indigo-500 mb-5" />
              <h3 className="text-xl font-bold">Rollar</h3>
              <p className={`mt-2 text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Boshliq, meneger, resepshn, tozalash, moliya.
              </p>
            </div>

            <div className={`p-8 rounded-2xl border transition hover:shadow-lg ${
              isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <IconBolt className="w-10 h-10 text-amber-500 mb-5" />
              <h3 className="text-xl font-bold">Fon vazifalari</h3>
              <p className={`mt-2 text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Email va SMS fonda yuboriladi.
              </p>
            </div>

            <div className={`p-8 rounded-2xl border transition hover:shadow-lg ${
              isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <IconReceipt className="w-10 h-10 text-cyan-500 mb-5" />
              <h3 className="text-xl font-bold">Xavfsiz to'lov</h3>
              <p className={`mt-2 text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Takroriy to'lov yo'q, karta saqlanmaydi.
              </p>
            </div>

            <div className={`p-8 rounded-2xl border transition hover:shadow-lg ${
              isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <IconChartBar className="w-10 h-10 text-blue-600 mb-5" />
              <h3 className="text-xl font-bold">Jonli tahlil</h3>
              <p className={`mt-2 text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Bandlik va tushum real vaqtda.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Comparison Table (Standart Tizimlar vs Biz) */}
      <section id="comparison" className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
            Nega StarHotel?
          </h2>
        </div>

        <div className={`rounded-2xl border overflow-hidden shadow-xl ${
          isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
        }`}>
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className={`border-b text-xs uppercase tracking-wider font-bold ${
                isDark ? "bg-slate-950 text-slate-400 border-slate-800" : "bg-slate-50 text-slate-600 border-slate-200"
              }`}>
                <th className="py-4 px-6"></th>
                <th className="py-4 px-6 text-slate-400">Eski tizimlar</th>
                <th className="py-4 px-6 text-blue-600 bg-blue-500/5">StarHotel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/20">
              <tr>
                <td className="py-4 px-6 font-semibold">Double-bookingdan himoya</td>
                <td className="py-4 px-6 text-rose-500 flex items-center gap-1.5"><IconCircleX className="w-4 h-4" /> Xato ko'p</td>
                <td className="py-4 px-6 text-emerald-500 font-bold bg-blue-500/5"><IconCircleCheck className="w-4 h-4 inline mr-1" /> Qulf bilan</td>
              </tr>
              <tr>
                <td className="py-4 px-6 font-semibold">Ko'p mehmonxona</td>
                <td className="py-4 px-6 text-slate-500">Qimmat</td>
                <td className="py-4 px-6 text-blue-600 font-bold bg-blue-500/5"><IconCircleCheck className="w-4 h-4 inline mr-1" /> Bitta platformada</td>
              </tr>
              <tr>
                <td className="py-4 px-6 font-semibold">Kirish xavfsizligi</td>
                <td className="py-4 px-6 text-slate-500">Zaif</td>
                <td className="py-4 px-6 text-blue-600 font-bold bg-blue-500/5"><IconCircleCheck className="w-4 h-4 inline mr-1" /> HttpOnly Cookies + CSRF</td>
              </tr>
              <tr>
                <td className="py-4 px-6 font-semibold">Tozalash</td>
                <td className="py-4 px-6 text-slate-500">Qog'ozda</td>
                <td className="py-4 px-6 text-blue-600 font-bold bg-blue-500/5"><IconCircleCheck className="w-4 h-4 inline mr-1" /> Jonli</td>
              </tr>
              <tr>
                <td className="py-4 px-6 font-semibold">Testlar</td>
                <td className="py-4 px-6 text-rose-500 flex items-center gap-1.5"><IconCircleX className="w-4 h-4" /> Yo'q</td>
                <td className="py-4 px-6 text-emerald-500 font-bold bg-blue-500/5"><IconCircleCheck className="w-4 h-4 inline mr-1" /> Bor</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 7. Pricing Tiers */}
      <section id="pricing" className={`py-24 px-6 border-t transition-colors ${
        isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-200"
      }`}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
              Tariflar
            </h2>

            {/* Monthly / Annual toggle */}
            <div className="mt-8 inline-flex items-center gap-3 p-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
              <button
                onClick={() => setAnnualBilling(false)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                  !annualBilling ? "bg-blue-600 text-white" : "text-slate-500"
                }`}
              >
                Oylik
              </button>
              <button
                onClick={() => setAnnualBilling(true)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  annualBilling ? "bg-blue-600 text-white" : "text-slate-500"
                }`}
              >
                Yillik <span className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">-20%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {pricingPlans.map((plan, idx) => {
              const price = annualBilling ? plan.annualPrice : plan.monthlyPrice;
              return (
                <div
                  key={idx}
                  className={`p-8 rounded-3xl border flex flex-col justify-between transition-all duration-300 relative ${
                    plan.popular
                      ? isDark
                        ? "bg-slate-900 border-blue-500 shadow-2xl ring-2 ring-blue-500"
                        : "bg-white border-blue-600 shadow-2xl ring-2 ring-blue-600"
                      : isDark
                      ? "bg-slate-900/60 border-slate-800"
                      : "bg-white border-slate-200"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wider shadow">
                      Ommabop
                    </div>
                  )}

                  <div>
                    <h3 className="text-2xl font-black">{plan.name}</h3>
                    <p className={`mt-2 text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                      {plan.desc}
                    </p>

                    <div className="mt-6 flex items-baseline gap-1">
                      <span className="text-5xl font-black">${price}</span>
                      <span className="text-xs text-slate-500 font-semibold">/ oy</span>
                    </div>

                    <div className="mt-8 space-y-3 pt-6 border-t border-slate-700/20">
                      {plan.features.map((f, fIdx) => (
                        <div key={fIdx} className="flex items-center gap-2.5 text-xs sm:text-sm">
                          <IconCircleCheck className="w-4 h-4 text-blue-600 shrink-0" />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-8">
                    <a
                      href="/register"
                      className={`w-full py-3 px-4 rounded-xl font-bold text-sm text-center block transition ${
                        plan.popular
                          ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30"
                          : isDark
                          ? "bg-slate-800 hover:bg-slate-700 text-white"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-800"
                      }`}
                    >
                      {plan.cta}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 9. Interactive FAQ Section */}
      <section id="faq" className={`py-24 px-6 border-t transition-colors ${
        isDark ? "bg-slate-900/30 border-slate-800" : "bg-slate-50 border-slate-200"
      }`}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
              Savollar
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className={`rounded-2xl border transition-all ${
                    isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                  }`}
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full p-6 text-left flex items-center justify-between font-bold text-base sm:text-lg focus:outline-none"
                  >
                    <span>{faq.q}</span>
                    <IconChevronDown className={`w-5 h-5 text-blue-600 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className={`px-6 pb-6 text-sm leading-relaxed ${
                      isDark ? "text-slate-400" : "text-slate-600"
                    }`}>
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 11. Footer */}
      <footer className={`border-t py-12 px-6 transition-colors ${
        isDark ? "bg-slate-950 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"
      }`}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-sm">
          <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
            <IconBuilding className="w-5 h-5 text-blue-600" />
            <span>StarHotel</span>
          </div>

          <div className="flex items-center gap-6 text-xs">
            <a href="#features" className="hover:text-blue-600">Imkoniyatlar</a>
            <a href="#pricing" className="hover:text-blue-600">Tariflar</a>
            <Link href="/login" className="hover:text-blue-600">Kirish</Link>
            <Link href="/register" className="hover:text-blue-600">Ro'yxatdan o'tish</Link>
          </div>

          <div className="text-xs text-slate-500">
            &copy; {new Date().getFullYear()} StarHotel
          </div>
        </div>
      </footer>
    </div>
  );
}
