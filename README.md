# StarHotel — Multi-Tenant Hotel Management SaaS Platform

A production-ready, scalable, multi-tenant Hotel Management System (HMS) built with **Django 5.2 LTS**, **Django REST Framework**, **Next.js 16 (App Router)**, **PostgreSQL 17**, and **Redis/Celery**.

Designed to manage from independent boutique hotels to hotel chains exceeding 500 properties with strict tenant isolation, double-booking prevention, role-based access control, and asynchronous task execution.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technology | Key Capabilities |
| :--- | :--- | :--- |
| **Backend** | Python 3.13 / Django 5.2 LTS | Modular monolith with clean domain apps |
| **API** | Django REST Framework | Versioned REST API (`/api/v1/`), OpenAPI via `drf-spectacular` |
| **Frontend** | Next.js 16 / React 19 / TypeScript / Tailwind | App Router, Server/Client components, TanStack Query |
| **Database** | PostgreSQL 17 + `psycopg 3` | Authoritative persistence, `SELECT FOR UPDATE` locking |
| **Cache & Queue** | Redis 7 + Celery 5.4 | Asynchronous email dispatch, scheduled jobs (beat), caching |
| **Guest channel** | Telegram bot (per hotel) | Booking requests, Click/Payme payments, reviews |
| **Currency** | Uzbek so'm (UZS) only | All prices, bookings, payments and reports are in so'm |
| **Security** | HttpOnly Cookies + JWT + CSRF | Cross-tenant isolation filters, token blacklisting |
| **Infrastructure** | Docker & Docker Compose | Multi-container composition with health checks |

---

## 📁 Repository Structure

```text
├── backend/                       # Django Modular Monolith
│   ├── apps/
│   │   ├── users/                 # Custom AbstractBaseUser & JWT auth
│   │   ├── organizations/         # Hotel chains / Parent corporate entities
│   │   ├── hotels/                # Core tenant model & property settings
│   │   ├── memberships/           # User-hotel roles (Owner, Manager, etc.)
│   │   ├── rooms/                 # Room types, physical room units
│   │   ├── guests/                # Privacy-compliant guest profiles
│   │   ├── bookings/              # Stay interval reservations, concurrency locks
│   │   ├── payments/              # Idempotent payments & audit trail
│   │   ├── housekeeping/          # Task allocation & cleaning statuses
│   │   ├── notifications/         # Celery background dispatch
│   │   ├── reports/               # Occupancy & revenue analytics
│   │   ├── telegram_bot/          # Per-hotel booking bot (webhook or long polling)
│   │   └── common/                # Permissions, pagination, middleware
│   ├── config/                    # Django base/dev/prod settings, WSGI/ASGI
│   ├── tests/                     # Pytest suite with cross-tenant security tests
│   └── requirements/              # base.txt, development.txt, production.txt
│
├── frontend/                      # Next.js 16 App Router
│   └── src/
│       ├── app/                   # (auth), dashboard, role panels: boshliq/ (owner), meneger/ (manager), xodim/ (staff)
│       │                          #   hotels/[hotelId]/* only forwards old links to the right panel
│       ├── screens/               # Panel pages shared by the role panels
│       ├── components/            # Layouts, navigation, sidebar, providers
│       ├── lib/api/               # Axios client with CSRF & 401 interceptors
│       └── types/                 # Strict TypeScript entity schemas
│
├── nginx/                         # Production reverse proxy config
├── .github/workflows/             # GitHub Actions CI matrix
├── docker-compose.yml             # Full-stack local development cluster
└── README.md
```

---

## 🔒 Multi-Tenancy & Security Rules

1. **Shared PostgreSQL Schema with Explicit Tenant Foreign Keys**: Every tenant-owned resource (rooms, reservations, guests, bills) links to a validated `hotel_id`.
2. **Derive Tenant Context from Authenticated Request**: The API never trusts raw client-supplied `hotel_id` parameters without checking active membership.
3. **Double-Booking Race Condition Prevention**:
   - Stay interval defined as `[check_in, check_out)` — departure day is unoccupied.
   - Bookings use `Room.objects.select_for_update()` inside `@transaction.atomic` to serialize concurrent requests.
4. **Cookie-Based JWT & CSRF**:
   - Access & refresh tokens stored in secure `HttpOnly` cookies.
   - CSRF token in accessible cookie and passed via `X-CSRFToken` header.
5. **Role-Based Access, Enforced by the API**: hiding a page is not the protection, the backend checks the role on every request (`HotelRoleAccess` in `apps/common/permissions.py`):

   | Action | Owner / Manager | Receptionist | Housekeeping | Finance / Auditor |
   | :--- | :---: | :---: | :---: | :---: |
   | View bookings & calendar | ✅ | ✅ | ✅ (rooms page) | ✅ |
   | Create / cancel bookings, check-in / check-out | ✅ | ✅ | ❌ | ❌ |
   | Guest records (view / edit) | ✅ | ✅ | ❌ | ❌ |
   | Housekeeping tasks | ✅ | ✅ | ✅ | ❌ |
   | Payments list | ✅ | ❌ | ❌ | ✅ |
   | Approve / refund / reviews / room setup | ✅ | ❌ | ❌ | ❌ |
6. **Data Privacy**: A guest's passport / ID number is write-only in the API: staff can record it, but responses carry only a masked hint (`••••4321`). Internal staff notes are never serialized.

---

## 🚀 Quick Start (Docker Compose)

### 1. Clone & Configure
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

### 2. Launch Services
```bash
docker-compose up --build
```
This spins up:
- **PostgreSQL 17** at port `5432`
- **Redis 7** at port `6379`
- **Django Backend** at port `8000`
- **Celery Worker** connected to Redis (with `-B`: also runs the beat schedule)
- **Next.js Frontend** at port `3000`

### 3. Apply Migrations & Create Superuser
```bash
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py createsuperuser
```

### 4. Access Platform
- **Frontend App**: `http://localhost:3000`
- **API Documentation (Swagger UI)**: `http://localhost:8000/api/docs/`
- **OpenAPI Schema (JSON)**: `http://localhost:8000/api/schema/`
- **Django Administration**: `http://localhost:8000/admin/`

---

## 💻 Local Run Without Docker (SQLite)

`config.settings.local` uses SQLite, an in-memory cache and runs Celery tasks inline, so no PostgreSQL or Redis is needed. Three terminals:

```powershell
# 1. Backend API (http://127.0.0.1:8000)
cd backend; $env:DJANGO_SETTINGS_MODULE="config.settings.local"; .venv\Scripts\python manage.py migrate; .venv\Scripts\python manage.py runserver 127.0.0.1:8000

# 2. Frontend (http://localhost:3000)
cd frontend; npm run dev

# 3. Telegram bot by long polling (refuses to start if a server webhook is set; --force takes it over)
cd backend; $env:DJANGO_SETTINGS_MODULE="config.settings.local"; .venv\Scripts\python manage.py run_telegram_bot
```

---

## 📱 Telegram Mini App (guests)

Each hotel's guest bot opens a booking web app inside Telegram: rooms with photos, dates and guests,
prices in so'm, a booking request, and "my bookings" (cancel, pay). Page: `frontend/src/app/tg/[botId]`,
API: `/api/v1/telegram/webapp/<bot id>/...` (`apps/telegram_bot/webapp.py`). There is no login: every
request carries Telegram's signed `initData`, checked with the bot's token.

Telegram opens only **https** pages, so the bot shows the app buttons (menu button + "🌐 Ilovada bron
qilish") only when `TELEGRAM_WEBAPP_URL` (or `FRONTEND_URL`) is https - i.e. on the deployed frontend.
The menu button is set when the bot is saved in the panel, on deploy (`set_telegram_webhooks`) and
when `run_telegram_bot` starts.

---

## 🛎 Room Service (orders to the room)

A checked-in guest orders water, fruit, towels, blankets, pillows, food and the like from the Mini App's
**Xizmatlar** tab (only while the stay is in progress). Staff get a Telegram notice and handle orders in the
panel's **Buyurtmalar** page (front desk and housekeeping: accept / delivered / cancel, mark paid; finance and
auditor view only). The owner or manager edits the menu there (price 0 = free; a default list can be added in
one click). Payment is taken at the front desk. After check-in the bot sends the guest a button that opens the
Services tab (needs the https Mini App address). Code: `apps/room_service`, `frontend/src/screens/OrdersPage.tsx`.

---

## 🤖 Owner's Claude Assistant (Telegram)

A private Telegram bot, separate from the hotels' guest bots, that answers the owner's questions about
the tasks given and the changes made in this project. It reads `backend/apps/assistant/knowledge/tarix.md`
(append a section there after every task) and calls Claude Opus 5.5. It is read-only.

1. Create a bot with @BotFather and get an API key at https://platform.claude.com.
2. In `backend/.env`: `ASSISTANT_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `ASSISTANT_ALLOWED_CHAT_IDS` (send `/id` to the bot to see yours).
3. Run `python manage.py run_assistant_bot`. Commands: `/vazifalar`, `/ozgarishlar 4`, `/holat`, `/yangi`, `/id`.

---

## ⏱️ Scheduled Job: Lapsed Telegram Requests

A Telegram request is cancelled when its payment time runs out or its arrival day passes unanswered, which frees the room and tells the guest. This runs on every bot update, when the panel lists or creates bookings or opens the calendar, and on a schedule:

- **Docker Compose**: the Celery worker runs with `-B`, and `CELERY_BEAT_SCHEDULE` calls it every 5 minutes.
- **Railway / Render (web process only, no Celery)**: add a cron service with the same image, schedule `*/5 * * * *` and command `python manage.py expire_telegram_requests`.

---

## 🧪 Running Automated Tests

Run backend tests using Pytest inside the container or local virtual environment:

```bash
docker-compose exec backend pytest -v
```

Tests include:
- `test_users.py`: Authentication, JWT issuance, cookie handling.
- `test_hotels.py`: Multi-property creation, automatic ownership assignment.
- `test_cross_tenant.py`: Hardened verification that staff of Hotel A receive `403 Forbidden` when attempting to access Hotel B data.
- `test_bookings.py`: Race condition prevention, overlapping date rejection, and valid status transitions.
