"""Claude-backed assistant for the project owner, reached through its own Telegram bot.

It knows what was asked and what was changed in the project from knowledge/tarix.md
and answers questions about it. It is read-only: it never touches code or data.
"""
import logging
import os
import re
from pathlib import Path

import anthropic

logger = logging.getLogger(__name__)

MODEL = 'claude-opus-5-5'
KNOWLEDGE_FILE = Path(__file__).resolve().parent / 'knowledge' / 'tarix.md'
MAX_HISTORY = 20            # messages kept per chat (10 question/answer pairs)
TELEGRAM_LIMIT = 4000       # Telegram allows 4096 characters per message

INSTRUCTIONS = """\
Sen StarHotel loyihasining egasi uchun Telegram'dagi yordamchisan. Egasi sendan loyihada qanday \
vazifalar berganini va Claude (dasturchi-agent) loyihada nimalarni o'zgartirganini so'raydi.

Qoidalar:
- Faqat quyidagi "Loyiha tarixi" hujjatiga tayan. Unda yo'q narsani to'qima: "tarixda bu haqda \
ma'lumot yo'q" deb ayt.
- Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob ber (odatda o'zbekcha).
- Javob Telegram'da oddiy matn sifatida ko'rinadi: Markdown sarlavha, jadval, ** yulduzcha ishlatma. \
Ro'yxat kerak bo'lsa qatorni "- " bilan boshla. Qisqa va aniq yoz.
- Sen kodni o'zgartira olmaysan va hech narsani ishga tushira olmaysan. Yangi ish so'ralsa, buni \
Claude Code'da (kompyuterda) berish kerakligini ayt.
- Fayl nomlari va buyruqlarni hujjatda qanday yozilgan bo'lsa, shunday keltir.
"""


def load_knowledge() -> str:
    try:
        return KNOWLEDGE_FILE.read_text(encoding='utf-8')
    except OSError:
        logger.exception('Assistant knowledge file is missing: %s', KNOWLEDGE_FILE)
        return '(Loyiha tarixi fayli topilmadi.)'


def system_prompt(knowledge: str) -> list:
    # One stable block: cached between questions, so the history is billed at cache-read rates
    return [{
        'type': 'text',
        'text': f'{INSTRUCTIONS}\n<loyiha_tarixi>\n{knowledge}\n</loyiha_tarixi>',
        'cache_control': {'type': 'ephemeral'},
    }]


def allowed_chat_ids() -> set:
    raw = os.environ.get('ASSISTANT_ALLOWED_CHAT_IDS', '')
    return {int(x) for x in re.findall(r'-?\d+', raw)}


def split_message(text: str, limit: int = TELEGRAM_LIMIT) -> list:
    """Split a long answer into Telegram-sized parts, preferring paragraph and line breaks."""
    parts, text = [], text.strip()
    while len(text) > limit:
        cut = text.rfind('\n\n', 0, limit)
        if cut < limit // 2:
            cut = text.rfind('\n', 0, limit)
        if cut < limit // 2:
            cut = limit
        parts.append(text[:cut].rstrip())
        text = text[cut:].lstrip()
    if text:
        parts.append(text)
    return parts or ['…']


def section(knowledge: str, title_prefix: str) -> str:
    """The '## ...' sections whose title starts with title_prefix, e.g. every '## 3-vazifa'."""
    blocks = re.split(r'(?m)^(?=## )', knowledge)
    return '\n'.join(b.strip() for b in blocks if b.startswith(f'## {title_prefix}')).strip()


def task_list(knowledge: str) -> str:
    """One line per task: '## 4-vazifa (2026-11-18): ...' -> '4. (2026-11-18) ...'."""
    lines = []
    for m in re.finditer(r'(?m)^## (\d+)-vazifa \(([^)]*)\): (.+)$', knowledge):
        lines.append(f'{m.group(1)}. ({m.group(2)}) {m.group(3)}')
    return '\n'.join(lines) or "Tarixda vazifalar yo'q."


class Assistant:
    """Per-chat conversation with Claude. History is text-only and lives in memory."""

    def __init__(self, client=None):
        self.client = client or anthropic.Anthropic()
        self.histories: dict[int, list] = {}

    def reset(self, chat_id: int):
        self.histories.pop(chat_id, None)

    def ask(self, chat_id: int, question: str) -> str:
        history = self.histories.setdefault(chat_id, [])
        history.append({'role': 'user', 'content': question})
        try:
            response = self.client.beta.messages.create(
                model=MODEL,
                max_tokens=16000,
                output_config={'effort': 'medium'},
                # If a safety classifier declines, the API retries on a suitable model in the same call
                betas=['server-side-fallback-2026-07-01'],
                fallbacks='default',
                system=system_prompt(load_knowledge()),
                messages=history,
            )
        except anthropic.AuthenticationError:
            history.pop()
            return "ANTHROPIC_API_KEY noto'g'ri yoki o'rnatilmagan. backend/.env faylini tekshiring."
        except anthropic.RateLimitError:
            history.pop()
            return "Claude hozir band (so'rovlar chegarasi). Bir daqiqadan keyin qayta yozing."
        except anthropic.APIStatusError as exc:
            history.pop()
            logger.warning('Claude API error %s: %s', exc.status_code, exc.message)
            return f"Claude xatosi ({exc.status_code}). Keyinroq qayta urinib ko'ring."
        except anthropic.APIConnectionError:
            history.pop()
            return "Claude bilan aloqa yo'q (internet). Keyinroq qayta urinib ko'ring."

        if response.stop_reason == 'refusal':
            history.pop()
            return "Claude bu savolga javob bermadi. Savolni boshqacha yozib ko'ring."
        answer = '\n'.join(b.text for b in response.content if b.type == 'text').strip()
        if response.stop_reason == 'max_tokens':
            answer += '\n\n(Javob juda uzun bo\'lgani uchun kesildi.)'
        answer = answer or "Javob bo'sh qaytdi. Savolni qayta yozing."

        # Text only (as in the SDK's multi-turn example): no thinking blocks are replayed,
        # so trimming the oldest turns below never breaks a later request.
        history.append({'role': 'assistant', 'content': answer})
        if len(history) > MAX_HISTORY:
            del history[:len(history) - MAX_HISTORY]
        return answer
