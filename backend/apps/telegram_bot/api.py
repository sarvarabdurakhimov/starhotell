"""Minimal Telegram Bot API client (standard library only).

Speed matters here: every button press triggers a few API calls in a row.
  * Connections are kept open and reused (one per thread), so each call skips
    the TCP + TLS handshake.
  * Connections go over IPv4. Where IPv6 is advertised but broken, the default
    resolver order made some calls hang ~21 s before falling back.
"""
import http.client
import json
import logging
import socket
import ssl
import threading
import uuid

logger = logging.getLogger(__name__)

HOST = 'api.telegram.org'
_local = threading.local()
_ssl_context = ssl.create_default_context()


class TelegramError(Exception):
    pass


class _IPv4HTTPSConnection(http.client.HTTPSConnection):
    def connect(self):
        last_exc = None
        for family, type_, proto, _, addr in socket.getaddrinfo(self.host, self.port, socket.AF_INET, socket.SOCK_STREAM):
            sock = None
            try:
                sock = socket.socket(family, type_, proto)
                sock.settimeout(10)  # connect timeout
                sock.connect(addr)
                sock.settimeout(self.timeout)
                sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                self.sock = _ssl_context.wrap_socket(sock, server_hostname=self.host)
                return
            except OSError as exc:
                last_exc = exc
                if sock:
                    sock.close()
        raise last_exc or OSError(f'cannot connect to {self.host}')


def _connection(timeout):
    conn = getattr(_local, 'conn', None)
    if conn is None:
        conn = _local.conn = _IPv4HTTPSConnection(HOST, 443, timeout=timeout)
    conn.timeout = timeout
    if conn.sock is not None:
        conn.sock.settimeout(timeout)
    return conn


def _drop_connection():
    conn = getattr(_local, 'conn', None)
    if conn is not None:
        conn.close()
    _local.conn = None


class TelegramAPI:
    def __init__(self, token: str):
        self.token = token

    def call(self, method: str, _timeout: int = 30, **params):
        """JSON call; returns `result` or raises TelegramError with Telegram's description."""
        body = json.dumps({k: v for k, v in params.items() if v is not None}).encode()
        return self._post(method, body, 'application/json', _timeout)

    def delete_messages(self, chat_id, message_ids):
        """Delete several messages in one call; quietly skips ones that are already gone."""
        ids = [m for m in message_ids if m]
        if not ids:
            return
        try:
            self.call('deleteMessages', chat_id=chat_id, message_ids=ids[:100])
        except TelegramError:
            for mid in ids:  # older Bot API or a single bad id: fall back one by one
                try:
                    self.call('deleteMessage', chat_id=chat_id, message_id=mid)
                except TelegramError:
                    pass

    def send_photo_bytes(self, chat_id, data: bytes, caption: str = '', reply_markup=None, parse_mode='HTML'):
        """Upload a photo from memory (multipart/form-data)."""
        boundary = uuid.uuid4().hex
        fields = {'chat_id': str(chat_id), 'caption': caption, 'parse_mode': parse_mode}
        if reply_markup:
            fields['reply_markup'] = json.dumps(reply_markup)
        parts = [
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
            for name, value in fields.items()
        ]
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="photo"; filename="room.jpg"\r\n'
            f'Content-Type: image/jpeg\r\n\r\n'.encode() + data + b'\r\n'
        )
        parts.append(f'--{boundary}--\r\n'.encode())
        return self._post('sendPhoto', b''.join(parts), f'multipart/form-data; boundary={boundary}', 60)

    def _post(self, method, body, content_type, timeout):
        path = f'/bot{self.token}/{method}'
        headers = {'Content-Type': content_type, 'Connection': 'keep-alive'}
        for attempt in (1, 2):
            conn = _connection(timeout)
            try:
                conn.request('POST', path, body=body, headers=headers)
                resp = conn.getresponse()
                raw = resp.read()
                break
            except (http.client.HTTPException, OSError) as exc:
                # A kept-alive connection the server already closed: reconnect once
                _drop_connection()
                if attempt == 2 or isinstance(exc, (socket.timeout, TimeoutError)):
                    raise TelegramError(f'{method}: {exc}') from exc
        try:
            payload = json.loads(raw.decode())
        except ValueError as exc:
            raise TelegramError(f'{method}: HTTP {resp.status}') from exc
        if not payload.get('ok'):
            raise TelegramError(payload.get('description') or f'{method} failed')
        return payload.get('result')
