"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconArrowRight,
  IconCheck,
  IconCircleCheck,
} from "@tabler/icons-react";

export default function HomePage() {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      title: "1. Xonalar",
      desc: "Xona va narxlar.",
      badge: "Boshlanishi",
      preview: {
        title: "Xonalar ro'yxati",
        status: "Tayyor",
        item1: "Xona raqami, qavati va turi",
        item2: "Kunlik narx",
      },
    },
    {
      title: "2. Bron qilish",
      desc: "Oldindan band qilish.",
      badge: "Xavfsiz",
      preview: {
        title: "Bron tasdiqlandi",
        status: "Faol",
        item1: "Mehmon va xona tanlanadi",
        item2: "Kelish va ketish sanasi",
      },
    },
    {
      title: "3. Check-In",
      desc: "Bir tugmada joylashtirish.",
      badge: "1 soniyada",
      preview: {
        title: "Joylashtirildi",
        status: "Xonada",
        item1: "Xona band bo'ladi",
        item2: "Kelgan vaqt yoziladi",
      },
    },
    {
      title: "4. Tozalash",
      desc: "Avtomatik tozalash navbati.",
      badge: "Tozalik",
      preview: {
        title: "Tozalash nazorati",
        status: "Tozalanmoqda",
        item1: "Topshiriq avtomatik yaratiladi",
        item2: "Qabul qilingach xona bo'shaydi",
      },
    },
  ];

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 font-sans selection:bg-amber-200">
      {/* 1. Header */}
      <header className="bg-stone-900 text-stone-100 border-b border-stone-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="StarHotel" className="w-9 h-9 object-contain" />
            <span className="font-serif text-lg font-bold tracking-widest uppercase text-white">
              StarHotel
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold uppercase text-stone-300">
            <a href="#imkoniyatlar" className="hover:text-amber-400 transition">Imkoniyatlar</a>
            <a href="#qadamlar" className="hover:text-amber-400 transition">Ishlash tartibi</a>
            <a href="#tariflar" className="hover:text-amber-400 transition">Tariflar</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/hotels/1"
              className="px-4 py-2 inline-flex items-center gap-1.5 text-xs font-bold text-stone-900 bg-amber-400 hover:bg-amber-300 rounded shadow transition"
            >
              Tizimni ko&apos;rish <IconArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Hero banner */}
      <section className="py-16 px-6 bg-stone-900 text-white border-b border-stone-800">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          
          <div className="lg:col-span-7 space-y-5">

            <h1 className="text-3xl sm:text-5xl font-serif font-bold text-white leading-tight">
              Mehmonxonani bittada boshqaring
            </h1>

            <p className="text-stone-300 text-sm sm:text-base max-w-xl font-light">
              Boshliq — pulni, meneger — xonalarni boshqaradi.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/hotels/1"
                className="px-6 py-3 inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-bold bg-amber-400 hover:bg-amber-300 text-stone-950 rounded transition shadow"
              >
                Tizimni ochish <IconArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/login"
                className="px-5 py-3 text-xs uppercase tracking-wider font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 rounded border border-stone-700 transition"
              >
                Kirish sahifasi
              </Link>
            </div>
          </div>

          {/* O'ng tomon: 2 ta asosiy rol */}
          <div className="lg:col-span-5 bg-stone-800/90 border border-stone-700 rounded-lg p-5 shadow-xl space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-400 pb-2 border-b border-stone-700">
              Kim nima qiladi?
            </div>

            {/* Boshliq */}
            <div className="p-3.5 bg-stone-900 rounded border border-amber-900/50 flex items-start gap-3">
              <span className="text-2xl">👑</span>
              <div>
                <div className="text-xs font-bold text-amber-300 uppercase tracking-wide">Boshliq</div>
                <p className="text-xs text-stone-300 mt-1">
                  Tushum, foyda, xarajat, maosh.
                </p>
              </div>
            </div>

            {/* Meneger */}
            <div className="p-3.5 bg-stone-900 rounded border border-emerald-900/50 flex items-start gap-3">
              <span className="text-2xl">🗝️</span>
              <div>
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Meneger</div>
                <p className="text-xs text-stone-300 mt-1">
                  Xonalar, mehmonlar, tozalash.
                </p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 3. Tizim qanday ishlaydi (Oddiy 4 qadam) */}
      <section id="qadamlar" className="py-14 px-6 max-w-7xl mx-auto">
        <div className="text-center max-w-xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 mt-1">
            4 ta oddiy qadam
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Qadamlar ro'yxati */}
          <div className="lg:col-span-5 space-y-2.5">
            {steps.map((s, idx) => {
              const active = activeStep === idx;
              return (
                <div
                  key={idx}
                  onClick={() => setActiveStep(idx)}
                  className={`p-4 rounded cursor-pointer border transition-all ${
                    active
                      ? "bg-white border-amber-600 shadow-md ring-1 ring-amber-600"
                      : "bg-stone-50 border-stone-200 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-900">{s.title}</span>
                    <span className="text-[10px] uppercase font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      {s.badge}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-stone-600">{s.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Jonli ko'rinish simulyatori */}
          <div className="lg:col-span-7">
            <div className="p-5 rounded bg-stone-900 text-white border border-stone-800 shadow-xl">
              <div className="flex items-center justify-between border-b pb-3 mb-4 border-stone-800">
                <span className="text-xs font-mono text-stone-400">
                  {steps[activeStep].title}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {steps[activeStep].preview.status}
                </span>
              </div>

              <div className="space-y-3">
                <h4 className="text-lg font-serif font-bold text-amber-400">
                  {steps[activeStep].preview.title}
                </h4>

                <div className="p-3 rounded bg-stone-950 border border-stone-800 space-y-1.5 text-xs font-mono">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <IconCircleCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>{steps[activeStep].preview.item1}</span>
                  </div>
                  <div className="flex items-center gap-2 text-amber-300">
                    <IconCircleCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>{steps[activeStep].preview.item2}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Asosiy 3 ta imkoniyat */}
      <section id="imkoniyatlar" className="py-14 px-6 bg-white border-y border-stone-200">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 mt-1">
              Barcha ishlar bir joyda
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 bg-stone-50 border border-stone-200 rounded space-y-2">
              <div className="w-8 h-8 rounded bg-stone-900 text-amber-400 flex items-center justify-center font-bold text-sm">
                01
              </div>
              <h3 className="font-serif font-bold text-stone-900 text-sm">
                Xonalar holati
              </h3>
              <p className="text-xs text-stone-600">
                Bo‘sh, band, tozalanayotgan — bitta ekranda.
              </p>
            </div>

            <div className="p-5 bg-stone-50 border border-stone-200 rounded space-y-2">
              <div className="w-8 h-8 rounded bg-stone-900 text-amber-400 flex items-center justify-center font-bold text-sm">
                02
              </div>
              <h3 className="font-serif font-bold text-stone-900 text-sm">
                Tezkor Check-In
              </h3>
              <p className="text-xs text-stone-600">
                Bir zumda joylashtirish.
              </p>
            </div>

            <div className="p-5 bg-stone-50 border border-stone-200 rounded space-y-2">
              <div className="w-8 h-8 rounded bg-stone-900 text-amber-400 flex items-center justify-center font-bold text-sm">
                03
              </div>
              <h3 className="font-serif font-bold text-stone-900 text-sm">
                Moliya va hisobot
              </h3>
              <p className="text-xs text-stone-600">
                Tushum, xarajat va sof foyda.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Tariflar */}
      <section id="tariflar" className="py-14 px-6 max-w-7xl mx-auto">
        <div className="text-center max-w-xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 mt-1">
            Qulay tariflar
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Kichik */}
          <div className="bg-white p-6 rounded border border-stone-300 shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-serif font-bold text-stone-900 text-base">Kichik</h3>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-600">
                  20 xona
                </span>
              </div>
              <div className="text-2xl font-serif font-bold mt-3 text-stone-900">
                490,000 <span className="text-xs font-sans font-normal text-stone-500">so‘m / oy</span>
              </div>
              <ul className="text-xs text-stone-600 space-y-2 pt-3 mt-3 border-t border-stone-200">
                <li className="flex items-center gap-2"><IconCheck className="w-3.5 h-3.5 shrink-0 text-amber-500" /> 20 tagacha xona</li>
                <li className="flex items-center gap-2"><IconCheck className="w-3.5 h-3.5 shrink-0 text-amber-500" /> Boshliq va Meneger paneli</li>
                <li className="flex items-center gap-2"><IconCheck className="w-3.5 h-3.5 shrink-0 text-amber-500" /> Xonalar va tozalash nazorati</li>
              </ul>
            </div>
            <Link
              href="/hotels/1"
              className="flex items-center justify-center gap-1.5 py-2 text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-900 rounded border border-stone-300 transition"
            >
              Tanlash <IconArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* O'rta */}
          <div className="bg-stone-900 text-white p-6 rounded border-2 border-amber-500 shadow-lg flex flex-col justify-between space-y-4 relative">
            <span className="absolute -top-3 right-6 px-2.5 py-0.5 text-[10px] font-bold bg-amber-400 text-stone-950 uppercase rounded">
              Tavsiya
            </span>
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-serif font-bold text-amber-400 text-base">Standard</h3>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-stone-800 text-stone-300">
                  80 xona
                </span>
              </div>
              <div className="text-2xl font-serif font-bold mt-3 text-white">
                1,200,000 <span className="text-xs font-sans font-normal text-stone-400">so‘m / oy</span>
              </div>
              <ul className="text-xs text-stone-300 space-y-2 pt-3 mt-3 border-t border-stone-800">
                <li className="flex items-center gap-2"><IconCheck className="w-3.5 h-3.5 shrink-0 text-amber-500" /> 80 tagacha xona</li>
                <li className="flex items-center gap-2"><IconCheck className="w-3.5 h-3.5 shrink-0 text-amber-500" /> Boshliq va Meneger paneli</li>
                <li className="flex items-center gap-2"><IconCheck className="w-3.5 h-3.5 shrink-0 text-amber-500" /> Moliya va xarajatlar auditi</li>
                <li className="flex items-center gap-2"><IconCheck className="w-3.5 h-3.5 shrink-0 text-amber-500" /> SMS xabarnomalar</li>
              </ul>
            </div>
            <Link
              href="/hotels/1"
              className="flex items-center justify-center gap-1.5 py-2 text-xs font-bold bg-amber-400 hover:bg-amber-300 text-stone-950 rounded transition"
            >
              Tanlash <IconArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Katta */}
          <div className="bg-white p-6 rounded border border-stone-300 shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-serif font-bold text-stone-900 text-base">Tarmoq</h3>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-600">
                  Cheksiz
                </span>
              </div>
              <div className="text-2xl font-serif font-bold mt-3 text-stone-900">
                2,800,000 <span className="text-xs font-sans font-normal text-stone-500">so‘m / oy</span>
              </div>
              <ul className="text-xs text-stone-600 space-y-2 pt-3 mt-3 border-t border-stone-200">
                <li className="flex items-center gap-2"><IconCheck className="w-3.5 h-3.5 shrink-0 text-amber-500" /> Cheksiz xonalar va filiallar</li>
                <li className="flex items-center gap-2"><IconCheck className="w-3.5 h-3.5 shrink-0 text-amber-500" /> To‘liq tahlil va moliya</li>
                <li className="flex items-center gap-2"><IconCheck className="w-3.5 h-3.5 shrink-0 text-amber-500" /> 24/7 yordam</li>
              </ul>
            </div>
            <Link
              href="/hotels/1"
              className="flex items-center justify-center gap-1.5 py-2 text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-900 rounded border border-stone-300 transition"
            >
              Tanlash <IconArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* 6. Footer */}
      <footer className="bg-stone-900 text-stone-400 py-8 px-6 border-t border-stone-800 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="w-6 h-6 object-contain" />
            <span className="text-white font-serif font-bold uppercase">StarHotel</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <Link href="/hotels/1" className="hover:text-white transition">Boshqaruv</Link>
            <Link href="/login" className="hover:text-white transition">Kirish</Link>
            <span>Tel: +998 71 200-00-00</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
