"""Owner's Claude assistant bot: access control, commands, and the conversation sent to Claude."""
from types import SimpleNamespace

import pytest

from apps.assistant import services
from apps.assistant.management.commands.run_assistant_bot import Command


class FakeClaude:
    """Records each request; answers like the Messages API would."""

    def __init__(self, stop_reason='end_turn'):
        self.requests = []
        self.stop_reason = stop_reason
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self.create))

    def create(self, **kw):
        self.requests.append({**kw, 'messages': [dict(m) for m in kw['messages']]})
        n = len(self.requests)
        return SimpleNamespace(
            stop_reason=self.stop_reason,
            content=[SimpleNamespace(type='thinking', thinking=''), SimpleNamespace(type='text', text=f'javob {n}')],
        )


class FakeTelegram:
    def __init__(self):
        self.sent = []

    def call(self, method, **kw):
        if method == 'sendMessage':
            self.sent.append((kw['chat_id'], kw['text']))
        return {}


def bot(monkeypatch, allowed='111'):
    monkeypatch.setenv('ASSISTANT_ALLOWED_CHAT_IDS', allowed)
    cmd = Command()
    cmd.api = FakeTelegram()
    cmd.assistant = services.Assistant(client=FakeClaude())
    return cmd


def say(cmd, chat_id, text):
    cmd.on_message({'chat': {'id': chat_id, 'type': 'private'}, 'text': text})
    return cmd.api.sent[-1][1]


def test_knowledge_file_lists_every_task():
    tasks = services.task_list(services.load_knowledge())
    for n in range(1, 7):
        assert f'{n}. (' in tasks
    assert "so'm" in services.section(services.load_knowledge(), '4-vazifa')


def test_strangers_are_refused_and_claude_is_not_called(monkeypatch):
    cmd = bot(monkeypatch, allowed='111')
    assert 'shaxsiy' in say(cmd, 222, 'Nima o\'zgardi?')
    assert cmd.assistant.client.requests == []
    assert say(cmd, 222, '/id') == 'Sizning Telegram ID: 222'


def test_first_run_tells_owner_how_to_allow_themselves(monkeypatch):
    cmd = bot(monkeypatch, allowed='')
    assert 'ASSISTANT_ALLOWED_CHAT_IDS=333' in say(cmd, 333, 'salom')


def test_commands_answer_from_the_history_file(monkeypatch):
    cmd = bot(monkeypatch)
    assert '6. (' in say(cmd, 111, '/vazifalar')
    assert '12 500' in say(cmd, 111, '/ozgarishlar 4')
    assert 'push' in say(cmd, 111, '/holat')
    assert cmd.assistant.client.requests == []  # no Claude call needed for these


def test_questions_go_to_claude_with_history_and_project_log(monkeypatch):
    cmd = bot(monkeypatch)
    assert say(cmd, 111, 'Valyuta qanday?') == 'javob 1'
    assert say(cmd, 111, 'Va keyin?') == 'javob 2'
    req = cmd.assistant.client.requests[-1]
    assert req['model'] == 'claude-opus-5-5'
    assert '<loyiha_tarixi>' in req['system'][0]['text']
    assert req['messages'] == [
        {'role': 'user', 'content': 'Valyuta qanday?'},
        {'role': 'assistant', 'content': 'javob 1'},  # text only, no thinking blocks replayed
        {'role': 'user', 'content': 'Va keyin?'},
    ]
    say(cmd, 111, '/yangi')
    say(cmd, 111, 'Yangi savol')
    assert cmd.assistant.client.requests[-1]['messages'] == [{'role': 'user', 'content': 'Yangi savol'}]


def test_history_is_capped_and_starts_with_a_user_turn():
    a = services.Assistant(client=FakeClaude())
    for i in range(30):
        a.ask(1, f'savol {i}')
    history = a.histories[1]
    assert len(history) == services.MAX_HISTORY
    assert history[0]['role'] == 'user'


@pytest.mark.parametrize('stop_reason', ['refusal'])
def test_refused_question_is_not_kept(stop_reason):
    a = services.Assistant(client=FakeClaude(stop_reason=stop_reason))
    assert 'javob bermadi' in a.ask(1, 'savol')
    assert a.histories[1] == []


def test_long_answers_are_split_for_telegram():
    text = '\n\n'.join('x' * 1500 for _ in range(5))
    parts = services.split_message(text)
    assert all(len(p) <= services.TELEGRAM_LIMIT for p in parts)
    assert ''.join(parts).replace('\n', '') == 'x' * 7500
