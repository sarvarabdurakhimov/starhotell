# StarHotel: vazifalar va o'zgarishlar tarixi

Bu fayl Telegram'dagi Claude yordamchisining bilim manbai. Har bir yangi vazifadan keyin
oxiriga yangi bo'lim qo'shiladi (eng yangisi eng pastda). Sanalar YYYY-MM-DD ko'rinishida.

## Loyiha haqida qisqacha

- Backend: Django 5.2 + DRF (`backend/`), frontend: Next.js 16 (`frontend/`).
- Panellar: `/boshliq` (ega), `/meneger` (menejer), `/xodim` (qabulxona, tozalovchi, moliya, auditor).
- Har bir mehmonxonaning o'z Telegram bron boti bor (`backend/apps/telegram_bot/`).
- Mahalliy ishga tushirish: backend `config.settings.local` (SQLite) bilan, frontend `npm run dev`,
  bot `manage.py run_telegram_bot`. Deploy: Railway (backend), Vercel (frontend).
- GitHub: https://github.com/sarvarabdurakhimov/starhotell (`starhotell` remote). Eski `origin`
  (`starhotel`, bitta "l") ham bor, unga yangi o'zgarishlar push qilinmagan.

---

## 1-vazifa (2026-11-16): ilovani qayta ishga tushirish

**Vazifa:** "qayta run qil" — ilovani ishga tushirish (keyin bir necha marta takrorlandi).

**Nima qilindi:**
- Backend standart sozlamada PostgreSQL (5432) kutadi, lekin u ishlamaydi va Docker yo'q edi.
  Shuning uchun backend `DJANGO_SETTINGS_MODULE=config.settings.local` (SQLite) bilan ishga tushirildi.
- Frontend `npm run dev` (http://localhost:3000), backend http://127.0.0.1:8000.
- Telegram bot `manage.py run_telegram_bot` (long polling) bilan ishga tushirildi; server webhook'i
  bo'lsa bot o'zini to'xtatadi (`--force` ishlatilmadi).
- Serverlar Claude sessiyasi yopilganda to'xtaydi; doimiy ishlashi uchun 3 ta alohida terminalda
  ishga tushirish yo'riqnomasi berildi (README'da ham bor).
- Next.js dev server o'rnatilgan versiyada xavfsizlik zaifligi borligini ogohlantirib, birinchi
  ishga tushirishda to'xtaydi; ikkinchi ishga tushirishda ishlaydi. Yangilash hali qilinmagan.

## 2-vazifa (2026-11-17): qaytib kelgan mijozning akkaunti saqlanishi

**Vazifa:** mijoz bir marta akkaunt ochsa, 2-3 oydan keyin qaytganda ham akkaunti turishi va xonani
tanlab bron qila olishi kerak.

**Topilgan sabab:** ma'lumotlar (ism, telefon, mehmon kartasi) bazada muddatsiz saqlanardi, lekin bot
har bir yangi bronda ism va telefonni qaytadan so'rardi.

**Nima o'zgardi:**
- `telegram_bot/handlers.py`: saqlangan mijoz ism/telefon so'ralmasdan to'g'ri bron tasdig'iga o'tadi;
  "Qaytganingizdan xursandmiz, <ism>!" deb kutib oladi; tasdiqlashda "✏️ Ism yoki telefonni
  o'zgartirish" tugmasi qo'shildi.
- `telegram_bot/services.py`: qabulxonada ochilgan mehmon kartasi telefon formati boshqacha bo'lsa ham
  (oxirgi 9 raqam bo'yicha) topiladi, dublikat ochilmaydi (`find_guest_by_phone`).
- `telegram_bot/texts.py`: o'zbek va rus tillarida yangi matnlar.
- Mijoz mehmonlar sonini raqam bilan yozishi ham mumkin bo'ldi.

## 3-vazifa (2026-11-17): GitHub'ga yuklash

**Vazifa:** loyihani https://github.com/sarvarabdurakhimov/starhotell ga qo'yish.

**Nima qilindi:**
- Commit `a2bbad5` ("Remember returning Telegram guests; remove payments pages") — 2-vazifa va
  oldindan commit qilinmagan o'zgarishlar (to'lovlar sahifalari o'chirilgani va h.k.).
- `starhotell` remote qo'shildi, `main` unga push qilindi va kuzatiladi. `.env`, `.env.local`,
  `db.sqlite3` yuklanmadi.

## 4-vazifa (2026-11-18): barcha pullar faqat o'zbek so'mida

**Vazifa:** barcha pullar o'zbek so'mida bo'lsin, boshqa davlat valyutalari bo'lmasin.

**Qaror:** mavjud dollar summalari 1 USD = 12 500 so'm kursi bilan qayta hisoblandi (foydalanuvchi tanladi).

**Nima o'zgardi:**
- Backend: `apps/common/money.py` (yagona valyuta UZS, `som()` formatlash). Mehmonxona, bron, to'lov,
  xarajat modellarida `currency` har doim UZS va API orqali o'zgartirib bo'lmaydi.
- Migratsiya `hotels/0004_convert_money_to_uzs`: xona narxlari, bronlar, to'lovlar, xarajatlar ×12 500.
  Orqaga qaytarib bo'lmaydi. EUR summalar bo'lsa faqat belgisi o'zgaradi (ogohlantirish chiqadi).
- Telegram bot: narxlar `6 750 000 so'm` ko'rinishida; "1 USD = necha so'm" kurs sozlamasi o'chirildi.
- Frontend: barcha summalar `1 250 000 so'm`; mehmonxona yaratishda valyuta tanlovi olib tashlandi;
  `/learning` tarif narxlari so'mga o'tkazildi (masalan $49 → 600 000 so'm).
- Demo ma'lumotlar va testlar so'mga o'tkazildi.

## 5-vazifa (2026-11-18): topilgan 6 ta muammoni tuzatish

**Vazifa:** foydalanuvchi bergan ro'yxatdagi muammolarni tuzatish.

1. **Rol cheklovlari faqat frontendda edi.** Endi backend tekshiradi: `HotelRoleAccess`
   (`apps/common/permissions.py`). Bron yaratish/bekor qilish/check-in/out — faqat ega, menejer,
   qabulxona. Mehmon ma'lumotlari — faqat ega, menejer, qabulxona. Housekeeping — qabulxona va tozalovchi
   ham. To'lovlar ro'yxati — moliya va auditor ham. Bronlarni ko'rish — barcha xodimlar.
   Frontend tugmalari ham shu qoidaga moslandi (`isFrontDesk` in `lib/session.ts`).
2. **Pasport raqami hamma xodimga ochiq edi.** Endi API uni faqat qabul qiladi, javobda faqat
   `••••4567` (oxirgi 4 belgi) qaytadi.
3. **Izoh kod qatorini yutib yuborgan edi** (`.order_by('-updated_at')`, 2-vazifadagi xato). Tuzatildi.
4. **Muddati o'tgan Telegram so'rovlari faqat "dangasa" bekor qilinardi.** Endi bron yaratishda va
   kalendarda ham tozalanadi; `manage.py expire_telegram_requests` buyrug'i (Railway cron uchun) va
   Celery beat (har 5 daqiqa, docker-compose'da `-B`) qo'shildi; bir vaqtda ishlash xavfsiz qilindi.
5. **Ikki xil sahifa daraxti.** Sahifalar `frontend/src/screens/` ga ko'chirildi; `boshliq|meneger|xodim`
   ulardan oladi; eski `/hotels/<id>/...` havolalari faqat yo'naltiradi.
6. **README eskirgan edi.** Next 16, rollar jadvali, so'm, Docker'siz ishga tushirish, rejalashtirilgan
   vazifa qo'shildi; CI nomi "StarHotel CI".

Testlar: 16 ta yangi test (`tests/test_roles.py`, `tests/test_telegram_requests.py`); jami 36 o'tdi.
Bitta eski xato: `test_room_cannot_be_marked_available_when_guest_checked_in` (`room_factory` fixture yo'q).

**Foydalanuvchi qilishi kerak:** Railway'da cron xizmati: jadval `*/5 * * * *`,
buyruq `python manage.py expire_telegram_requests`.

## 6-vazifa (2026-11-18): Telegram'da Claude yordamchisi

**Vazifa:** Telegram'da Claude agenti bo'lsin; unda Claude nimani o'zgartirgani va foydalanuvchi qanday
vazifalar bergani bo'lsin.

**Nima qilindi:**
- Yangi Django app `apps/assistant`: alohida Telegram bot (mehmonlar botidan ajratilgan), Claude Opus 5.5
  orqali shu fayl asosida savollarga javob beradi.
- Buyruq: `python manage.py run_assistant_bot` (long polling).
- Sozlamalar (`backend/.env`): `ASSISTANT_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `ASSISTANT_ALLOWED_CHAT_IDS`.
- Bot faqat ruxsat berilgan Telegram ID'larga javob beradi. Kodni o'zgartira olmaydi, faqat tarixni biladi.
- Telegram buyruqlari: /vazifalar, /ozgarishlar, /yangi (suhbatni yangilash), /id.

## 7-vazifa (2026-11-19): StarHotel botiga Telegram Web App (Mini App)

**Vazifa:** mehmonxona botiga Telegram web app qo'shish.

**Nima qilindi:**
- Frontend sahifa `/tg/<bot id>` (`frontend/src/app/tg/[botId]`, `components/telegram/MiniApp.tsx`):
  xonalar rasmlari bilan, sana va mehmonlar soni, bo'sh xonalar va jami narx so'mda, ism/telefon,
  bron so'rovi; "Bronlarim": holat, so'rovni bekor qilish, bekor qilishni so'rash, to'lov (hisob chatga
  yuboriladi). O'zbek va rus tillari, Telegram mavzusi ranglari (yorug'/qorong'i), Telegram orqaga tugmasi.
- Backend `apps/telegram_bot/webapp.py`, API `/api/v1/telegram/webapp/<bot id>/` (info, availability,
  book, bookings, bookings/<id>/cancel|pay). Login yo'q: Telegram imzolagan `initData` bot tokeni bilan
  tekshiriladi (24 soat amal qiladi). Chat bot bilan bir xil qoidalar: qora ro'yxat, bitta ochiq so'rov,
  30 kechagacha, menejerga xabar, chatga tasdiq xabari.
- Bot: menyu tugmasi "Bron" va "🌐 Ilovada bron qilish" tugmasi — faqat `TELEGRAM_WEBAPP_URL`
  (yoki `FRONTEND_URL`) https bo'lsa chiqadi, chunki Telegram faqat https sahifani ochadi.
- Testlar: `tests/test_telegram_webapp.py` (11 ta). Mahalliy tekshiruv: sahifa Edge'da imzolangan
  initData bilan ochildi, xonalar va narxlar ko'rindi.

**Ishga tushirish uchun:** frontend https manzilda (Vercel) deploy qilinishi va backend'da
`TELEGRAM_WEBAPP_URL=https://...` o'rnatilishi kerak; keyin bot sozlamasini panelda bir marta saqlash yoki
deploy (menyu tugmasi o'rnatiladi).

---

## Holat (2026-11-18)

- 1-6 vazifalarning hammasi commit qilingan va GitHub'ga (`starhotell` repo, `main`) push qilingan
  (2026-11-18). Eski `origin` (`starhotel`) repoga push qilinmagan.
- Telegram yordamchi boti (@Claudb_bot) mahalliy kompyuterda ishga tushirildi: tokeni va egasining
  Telegram ID'si backend/.env'da. Erkin savollarga javob berishi uchun hali `ANTHROPIC_API_KEY` kerak
  (platform.claude.com); busiz faqat /vazifalar, /ozgarishlar, /holat ishlaydi.
- Railway cron (`expire_telegram_requests`) hali sozlanmagan.
- 7-vazifa (Mini App) commit qilindi; Telegram'da ishlashi uchun frontend https'da deploy qilinishi va
  `TELEGRAM_WEBAPP_URL` o'rnatilishi kerak.
- Next.js xavfsizlik yangilanishi hali qilinmagan.
