#!/usr/bin/env python3
"""Send one hash-bound Fuehrungsmandat approval mail."""

from __future__ import annotations

import argparse
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
import html
import json
import os
from pathlib import Path
import re
import smtplib
import ssl
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465
REVIEW_PATH = re.compile(r"^/review/[A-Za-z0-9_-]{32,128}$")


class ApprovalMailError(RuntimeError):
    pass


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ApprovalMailError(f"Erforderliche Konfiguration fehlt: {name}")
    return value


def load_json(path: str) -> dict:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ApprovalMailError("Ungültige JSON-Datei.")
    return value


def normalize_app_password(value: str) -> str:
    normalized = "".join(value.split())
    if len(normalized) != 16 or not normalized.isascii() or not normalized.isalnum():
        raise ApprovalMailError("Das Gmail-App-Passwort hat nicht das erwartete Format.")
    return normalized


def mail_config(config: dict) -> tuple[str, str, str, str]:
    mail = config.get("mail") or {}
    brand = config.get("brand") or {}
    sender = str(mail.get("senderAddress") or "").strip()
    recipient = str(mail.get("recipientAddress") or "").strip()
    display_name = str(brand.get("editorialDisplayName") or "").strip()
    prefix = str(mail.get("subjectPrefix") or "").strip()
    if mail.get("live") is not True or not all(
        [sender, recipient, display_name, prefix]
    ):
        raise ApprovalMailError("Freigabemail ist noch nicht vollständig aktiviert.")
    return sender, recipient, display_name, prefix


def validate_review_url(value: str, portal_base_url: str) -> str:
    parsed = urlparse(value)
    portal = urlparse(portal_base_url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != portal.hostname
        or parsed.port != portal.port
        or parsed.query
        or parsed.fragment
        or not REVIEW_PATH.fullmatch(parsed.path)
    ):
        raise ApprovalMailError("Die Freigabe-URL gehört nicht zum konfigurierten Portal.")
    return value


def replace_template(template: str, values: dict[str, str]) -> str:
    result = template
    for key, value in values.items():
        result = result.replace("{{" + key + "}}", html.escape(value))
    if re.search(r"\{\{[a-z_]+\}\}", result):
        raise ApprovalMailError("Die Freigabemail enthält unersetzte Platzhalter.")
    return result


def build_message(
    review: dict, package: dict, template: str, config: dict, portal_url: str
) -> EmailMessage:
    sender, recipient, display_name, prefix = mail_config(config)
    review_url = validate_review_url(str(review.get("reviewUrl", "")), portal_url)
    payload = package.get("payload") or {}
    values = {
        "titel": str(package.get("title") or "").strip(),
        "cluster": str(package.get("cluster") or "").strip(),
        "version": str(package.get("version") or "").strip(),
        "kurzfassung": str(payload.get("summary") or "").strip(),
        "evidenzhinweis": str(payload.get("evidenceNote") or "").strip(),
        "review_url": review_url,
        "draft_id": str(review.get("id") or "").strip(),
        "expires_at": str(review.get("expiresAt") or "").strip(),
    }
    if not all(values.values()):
        raise ApprovalMailError("Das Freigabepaket ist unvollständig.")

    message = EmailMessage()
    message["From"] = f"{display_name} <{sender}>"
    message["To"] = recipient
    message["Reply-To"] = sender
    message["Subject"] = f"{prefix} {values['titel']} · Version {values['version']}"
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid(domain=sender.split("@", 1)[-1])
    message.set_content(
        f"""Der neue Führungsmandat-Beitrag ist zur kanalgenauen Prüfung bereit.

Thema: {values["titel"]}
Cluster: {values["cluster"]}
Version: {values["version"]}

Kurzfassung:
{values["kurzfassung"]}

Quellen und Übertragungsgrenzen:
{values["evidenzhinweis"]}

Beitrag und Kanäle prüfen:
{review_url}

Ohne formal gültige Portalentscheidung wird nichts veröffentlicht.
"""
    )
    message.add_alternative(replace_template(template, values), subtype="html")
    return message


def build_smoke_message(config: dict) -> EmailMessage:
    sender, recipient, display_name, prefix = mail_config(config)
    message = EmailMessage()
    message["From"] = f"{display_name} <{sender}>"
    message["To"] = recipient
    message["Reply-To"] = sender
    message["Subject"] = f"{prefix} Technischer Versandtest"
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid(domain=sender.split("@", 1)[-1])
    message.set_content(
        "Dies ist ein einmaliger technischer Versandtest für die "
        "Führungsmandat-Freigabeautomation.\n\n"
        "Gmail-Anmeldung, Absender und feste Prüferadresse funktionieren. "
        "Dieser Test hat weder eine Freigabe angelegt noch Inhalte "
        "veröffentlicht.\n"
    )
    return message


def send_via_gmail(
    message: EmailMessage, sender: str, recipient: str
) -> None:
    password = normalize_app_password(
        required_env("FUEHRUNGSMANDAT_GMAIL_APP_PASSWORD")
    )
    try:
        with smtplib.SMTP_SSL(
            SMTP_HOST, SMTP_PORT, context=ssl.create_default_context(), timeout=30
        ) as smtp:
            smtp.login(sender, password)
            refused = smtp.send_message(
                message, from_addr=sender, to_addrs=[recipient]
            )
    except smtplib.SMTPAuthenticationError as exc:
        raise ApprovalMailError(
            "Gmail-Anmeldung fehlgeschlagen; nichts gesendet."
        ) from exc
    except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
        raise ApprovalMailError(
            "SMTP-Fehler mit unklarem Versandstatus; nicht automatisch wiederholen."
        ) from exc
    finally:
        password = ""

    if refused:
        raise ApprovalMailError("Gmail hat die feste Freigabeadresse abgewiesen.")


def confirm_delivery(
    portal_url: str, secret: str, review_id: str, message_id: str
) -> bool:
    bypass_token = os.environ.get(
        "FUEHRUNGSMANDAT_PORTAL_BYPASS_TOKEN", ""
    ).strip()
    body = json.dumps({"messageId": message_id, "status": "sent"}).encode("utf-8")
    request = Request(
        f"{portal_url.rstrip('/')}/api/editorial/reviews/{review_id}/mail-status",
        data=body,
        method="POST",
        headers={
            "Authorization": "Bearer " + (bypass_token or secret),
            "X-Fuehrungsmandat-Secret": secret,
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            return response.status == 200
    except (HTTPError, URLError, TimeoutError):
        return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--review")
    parser.add_argument("--package")
    parser.add_argument("--template")
    parser.add_argument("--config", required=True)
    parser.add_argument("--smoke-test", action="store_true")
    args = parser.parse_args()

    config = load_json(args.config)
    sender, recipient, _, _ = mail_config(config)
    if args.smoke_test:
        send_via_gmail(build_smoke_message(config), sender, recipient)
        print("Technische Freigabe-Testmail versendet.")
        return 0

    if not all([args.review, args.package, args.template]):
        raise ApprovalMailError(
            "Review, Paket und Vorlage sind für eine Freigabemail erforderlich."
        )

    review = load_json(args.review)
    package = load_json(args.package)
    portal_url = required_env("FUEHRUNGSMANDAT_PORTAL_URL").rstrip("/")
    portal_secret = required_env("FUEHRUNGSMANDAT_PORTAL_SECRET")
    message = build_message(
        review,
        package,
        Path(args.template).read_text(encoding="utf-8"),
        config,
        portal_url,
    )
    send_via_gmail(message, sender, recipient)

    if confirm_delivery(
        portal_url,
        portal_secret,
        str(review.get("id") or ""),
        str(message["Message-ID"]),
    ):
        print("Freigabemail versendet und Portalstatus bestätigt.")
    else:
        print(
            "Freigabemail versendet; Portalstatus konnte nicht bestätigt werden. "
            "Kein automatischer Neuversand.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ApprovalMailError as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        raise SystemExit(2)
