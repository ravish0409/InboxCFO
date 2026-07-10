"""Send fake subscription emails into a test inbox so /api/sync has something to read.

This is the sender side of end-to-end sync testing: it drops realistic renewal /
price-hike / trial-trap / duplicate-service emails into the inbox you sync from, so
the real Gmail read + LLM extraction path runs against real messages (not seed.py's
direct DB inserts).

Gmail SMTP rewrites the From *address* to the authenticated account but keeps the
display name, so `From: Netflix <you@gmail.com>` shows as "Netflix" in the inbox —
which is all the extractor needs (it parses the body, not just the sender).

Setup (one time):
  1. Turn on 2-Step Verification on the SENDING account.
  2. Create an App Password: https://myaccount.google.com/apppasswords  (16 chars)
  3. Export env vars, then run:

     # PowerShell
     $env:GMAIL_SENDER="rajnishthe1@gmail.com"
     $env:GMAIL_APP_PASSWORD="xxxxxxxxxxxxxxxx"
     python send_test_subs.py                 # sends to rajnishthe1@gmail.com by default

     # dry run — print the emails, send nothing
     python send_test_subs.py --dry-run

     # override recipient
     python send_test_subs.py --to someone@gmail.com

Sending from rajnishthe1 to rajnishthe1 (the default) is fine — it lands in the inbox
you sync. After it runs, hit Sync in the app (or POST /api/sync) and watch the
subscriptions, the trial trap, the price hike and the music duplicate get extracted.
"""

import argparse
import os
import smtplib
import sys
from datetime import date, timedelta
from email.message import EmailMessage
from email.utils import formataddr, formatdate

TODAY = date.today()
FIRST_OF_MONTH = TODAY.replace(day=1)
LAST_MONTH_START = (FIRST_OF_MONTH - timedelta(days=1)).replace(day=1)


def d(days: int) -> str:  # ISO date `days` from today (negative = in the past)
    return (TODAY + timedelta(days=days)).isoformat()


def lm(day: int) -> str:  # ISO date on `day` of last month (mirrors seed.py)
    return LAST_MONTH_START.replace(day=day).isoformat()


# --- BATCH 1: subscriptions — ALREADY SENT. Commented so a re-run won't duplicate
#     them. Uncomment if you wipe the inbox / DB and want to resend from scratch.
# (display_name, from_address, subject, body). The from_address is cosmetic — Gmail
# replaces it with the authenticated sender — but we keep it realistic for the header.
# _SENT_SUBSCRIPTIONS = [
#     ("Netflix", "info@netflix.com",
#      "Your Netflix plan price is changing",
#      "Hi,\n\nYour Netflix Premium plan price is increasing from Rs.499.00 to "
#      "Rs.649.00 starting this month. We've received your payment of Rs.649.00.\n\n"
#      f"Next billing date: {d(8)}.\n\nThe Netflix Team"),
#     ("Audible", "no-reply@audible.in",
#      "Your Audible free trial ends soon",
#      "Hi,\n\nYour 30-day Audible free trial ends on "
#      f"{d(2)}. After that you'll be charged Rs.199/month automatically.\n\n"
#      "Manage or cancel anytime: https://www.audible.in/account/membership\n\nAudible"),
#     ("Spotify", "no-reply@spotify.com",
#      "Spotify Premium - payment confirmation",
#      "Your Spotify Premium subscription of Rs.119.00 was renewed successfully.\n\n"
#      f"Next renewal: {d(10)}.\n\nThanks for listening,\nSpotify"),
#     ("Google Play", "googleplay-noreply@google.com",
#      "YouTube Music Premium receipt",
#      "Thanks for your purchase.\n\nYouTube Music Premium: Rs.99.00/month.\n"
#      f"Renews on {d(14)}.\n\nManage your subscriptions: "
#      "https://play.google.com/store/account/subscriptions\n\nGoogle Play"),
#     ("Amazon.in", "auto-confirm@amazon.in",
#      "Amazon Prime membership renewed",
#      "Your Amazon Prime annual membership (Rs.1499) has been renewed.\n\n"
#      f"Valid until {d(285)}.\n\nAmazon.in"),
# ]

# --- BATCH 2: the remaining seed.py cases — bills, insurance, warranty, and bank
#     transaction alerts. This is what gets sent now.
MESSAGES = [
    # Car insurance renewal -> DocumentRecord (insurance_policy) + Bill (the canonical
    # "when does my car insurance expire" question).
    (
        "ICICI Lombard", "care@icicilombard.com",
        "Your car insurance policy - renewal notice",
        "Dear Customer,\n\nYour Private Car Package Policy no. 3001/XA123456 for vehicle "
        f"KA-01-MJ-4321 expires on {d(39)}. Renewal premium: Rs.8,450.\n\n"
        "Renew before expiry to retain your 25% No Claim Bonus.\n\nICICI Lombard",
    ),
    # Electricity bill -> Bill (utility).
    (
        "BESCOM", "ebill@bescom.co.in",
        "BESCOM e-bill for this month",
        f"Your electricity bill of Rs.1,286 is due on {d(13)}. "
        "Account: 4567890123.\n\nBESCOM",
    ),
    # Laptop invoice with warranty -> DocumentRecord (warranty).
    (
        "Dell", "orders@dell.com",
        "Invoice & warranty - Dell XPS 13",
        "Thank you for your purchase.\n\nDell XPS 13 (Rs.1,24,990). Premium Support "
        f"warranty valid until {d(165)}.\n\nDell",
    ),
]

# Bank transaction alerts (HDFC UPI) -> Transaction rows. Swiggy spread across last
# month is the canonical "how much did I spend on Swiggy last month" check, so keep
# these amounts in sync with seed.py's _SWIGGY total.
_SWIGGY = [(2, 384.0), (7, 512.5), (13, 289.0), (19, 645.0), (24, 431.0)]
for _day, _amt in _SWIGGY:
    MESSAGES.append((
        "HDFC Bank", "alerts@hdfcbank.net", "HDFC Bank: transaction alert",
        f"Rs.{_amt:.2f} debited from a/c **6789 on {lm(_day)} to SWIGGY BANGALORE "
        "via UPI. Not you? Call 18002586161.",
    ))

# Misc transactions for the spend-by-category chart (last month + a couple recent).
_MISC = [
    ("Uber", 245.0, lm(6)), ("Amazon.in", 1899.0, lm(11)),
    ("Big Bazaar", 2340.0, lm(15)), ("Uber", 189.0, lm(21)),
    ("Zomato", 421.0, lm(26)),
    ("Swiggy", 366.0, d(-3)), ("Uber", 210.0, d(-2)),
]
for _merchant, _amt, _date in _MISC:
    MESSAGES.append((
        "HDFC Bank", "alerts@hdfcbank.net", "HDFC Bank: transaction alert",
        f"Rs.{_amt:.2f} debited from a/c **6789 on {_date} to {_merchant.upper()} via UPI.",
    ))


def build(sender_addr: str, to_addr: str, display: str, from_addr: str,
          subject: str, body: str) -> EmailMessage:
    msg = EmailMessage()
    # Gmail keeps the display name and swaps the address for the authenticated account.
    msg["From"] = formataddr((f"{display} ({from_addr})", sender_addr))
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=True)
    msg.set_content(body)
    return msg


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--to", default="rajnishthe1@gmail.com",
                        help="recipient inbox (default: rajnishthe1@gmail.com)")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the emails without sending")
    args = parser.parse_args()

    if args.dry_run:
        for display, from_addr, subject, body in MESSAGES:
            print(f"\n=== From: {display} <{from_addr}>  To: {args.to} ===")
            print(f"Subject: {subject}\n")
            print(body)
        print(f"\n[dry-run] {len(MESSAGES)} emails NOT sent.")
        return 0

    sender = os.environ.get("GMAIL_SENDER")
    password = os.environ.get("GMAIL_APP_PASSWORD")
    if not sender or not password:
        print("ERROR: set GMAIL_SENDER and GMAIL_APP_PASSWORD env vars first.\n"
              "  GMAIL_APP_PASSWORD is a 16-char App Password, not your login password:\n"
              "  https://myaccount.google.com/apppasswords", file=sys.stderr)
        return 1

    with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
        smtp.starttls()
        smtp.login(sender, password)
        for display, from_addr, subject, body in MESSAGES:
            msg = build(sender, args.to, display, from_addr, subject, body)
            smtp.send_message(msg)
            print(f"sent: {subject!r} -> {args.to}")

    print(f"\nDone. {len(MESSAGES)} emails delivered to {args.to}. "
          "Now run Sync in the app (or POST /api/sync) to extract them.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
