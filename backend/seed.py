"""Seed the DB with realistic demo data — no LLM/Gmail needed. Run: python seed.py

Dates are computed relative to today so 'last month' questions always work.
Wipes existing data first.
"""

from datetime import date, timedelta

from sqlmodel import Session, SQLModel, select

from app.db import engine, init_db
from app.models import Bill, DocumentRecord, Source, Subscription, Transaction
from app.services.extraction import _txn_dedup_key
from app.services.normalize import content_hash, norm_key

TODAY = date.today()
FIRST_OF_MONTH = TODAY.replace(day=1)
LAST_MONTH_START = (FIRST_OF_MONTH - timedelta(days=1)).replace(day=1)


def lm(day: int) -> date:  # a date in last month
    return LAST_MONTH_START.replace(day=day)


def src(session: Session, title: str, sender: str, received: date, body: str, source_type="email") -> int:
    s = Source(source_type=source_type, title=title, sender=sender, received_at=received,
               snippet=body.strip().replace("\n", " ")[:300], raw_text=body,
               content_hash=content_hash(sender, body))
    session.add(s)
    session.commit()
    session.refresh(s)
    return s.id


def main() -> None:
    init_db()
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        # --- Subscriptions (note: TWO music services -> duplicate demo) ---
        s1 = src(session, "Your Netflix plan price is changing", "Netflix <info@netflix.com>", lm(3),
                 "Hi, your Netflix Premium plan price is increasing from ₹499.00 to ₹649.00. "
                 f"We've received your payment of ₹649.00. Next billing date {(TODAY + timedelta(days=8)).isoformat()}.")
        session.add(Subscription(source_id=s1, name="Netflix", category="video", amount=649,
                                 previous_amount=499, price_change_at=lm(3),
                                 billing_cycle="monthly", next_renewal=TODAY + timedelta(days=8)))
        session.add(Transaction(source_id=s1, merchant="Netflix", category="entertainment",
                                amount=649, txn_date=lm(3), description="Netflix Premium monthly"))

        s2 = src(session, "Spotify Premium — payment confirmation", "Spotify <no-reply@spotify.com>", lm(5),
                 "Your Spotify Premium subscription of ₹119.00 was renewed. "
                 f"Next renewal: {(TODAY + timedelta(days=10)).isoformat()}.")
        session.add(Subscription(source_id=s2, name="Spotify", category="music", amount=119,
                                 billing_cycle="monthly", next_renewal=TODAY + timedelta(days=10)))
        session.add(Transaction(source_id=s2, merchant="Spotify", category="entertainment",
                                amount=119, txn_date=lm(5), description="Spotify Premium monthly"))

        s3 = src(session, "YouTube Music Premium receipt", "Google Play <googleplay-noreply@google.com>", lm(9),
                 "Thanks for your purchase. YouTube Music Premium: ₹99.00/month. "
                 f"Renews {(TODAY + timedelta(days=14)).isoformat()}.")
        session.add(Subscription(source_id=s3, name="YouTube Music", category="music", amount=99,
                                 billing_cycle="monthly", next_renewal=TODAY + timedelta(days=14),
                                 cancel_url="https://play.google.com/store/account/subscriptions"))
        session.add(Transaction(source_id=s3, merchant="Google Play (YouTube Music)", category="entertainment",
                                amount=99, txn_date=lm(9), description="YouTube Music Premium"))

        s4 = src(session, "Amazon Prime membership renewed", "Amazon.in <auto-confirm@amazon.in>",
                 TODAY - timedelta(days=80),
                 "Your Amazon Prime annual membership (₹1499) has been renewed. "
                 f"Valid until {(TODAY + timedelta(days=285)).isoformat()}.")
        session.add(Subscription(source_id=s4, name="Amazon Prime", category="video", amount=1499,
                                 billing_cycle="yearly", next_renewal=TODAY + timedelta(days=285)))

        # --- Audible free trial about to convert (the trial-trap interception demo) ---
        s4b = src(session, "Your Audible free trial ends soon", "Audible <no-reply@audible.in>",
                  TODAY - timedelta(days=28),
                  "Your 30-day Audible free trial ends on "
                  f"{(TODAY + timedelta(days=2)).isoformat()}. After that you'll be charged ₹199/month. "
                  "Manage or cancel anytime at https://www.audible.in/account/membership.")
        session.add(Subscription(source_id=s4b, name="Audible", category="other", amount=199,
                                 billing_cycle="monthly", is_trial=True,
                                 trial_end_date=TODAY + timedelta(days=2),
                                 next_renewal=TODAY + timedelta(days=2),
                                 cancel_url="https://www.audible.in/account/membership"))

        # --- Car insurance (the canonical question) ---
        s5 = src(session, "Your car insurance policy — renewal notice", "ICICI Lombard <care@icicilombard.com>",
                 TODAY - timedelta(days=12),
                 "Dear Customer, your Private Car Package Policy no. 3001/XA123456 for vehicle KA-01-MJ-4321 "
                 f"expires on {(TODAY + timedelta(days=39)).isoformat()}. Renewal premium: ₹8,450. "
                 "Renew before expiry to retain your 25% No Claim Bonus.")
        session.add(DocumentRecord(source_id=s5, doc_type="insurance_policy",
                                   title="Private Car Package Policy 3001/XA123456", provider="ICICI Lombard",
                                   expiry_date=TODAY + timedelta(days=39), amount=8450,
                                   summary="Car insurance for KA-01-MJ-4321; renew before expiry to keep 25% NCB."))
        session.add(Bill(source_id=s5, name="Car insurance renewal (ICICI Lombard)", category="insurance",
                         amount=8450, due_date=TODAY + timedelta(days=39), status="due"))

        # --- Electricity bill ---
        s6 = src(session, "BESCOM e-bill for June", "BESCOM <ebill@bescom.co.in>", TODAY - timedelta(days=4),
                 f"Your electricity bill of ₹1,286 is due on {(TODAY + timedelta(days=13)).isoformat()}. "
                 "Account: 4567890123.")
        session.add(Bill(source_id=s6, name="BESCOM Electricity", category="utility", amount=1286,
                         due_date=TODAY + timedelta(days=13), status="due"))

        # --- Swiggy orders last month (the canonical spend question) ---
        swiggy = [(2, 384.0), (7, 512.5), (13, 289.0), (19, 645.0), (24, 431.0)]
        for day, amount in swiggy:
            sid = src(session, f"HDFC Bank: transaction alert", "HDFC Bank <alerts@hdfcbank.net>", lm(day),
                      f"Rs.{amount:.2f} debited from a/c **6789 on {lm(day).isoformat()} to SWIGGY BANGALORE "
                      "via UPI. Not you? Call 18002586161.")
            session.add(Transaction(source_id=sid, merchant="Swiggy", category="food", amount=amount,
                                    txn_date=lm(day), description="Swiggy order (HDFC UPI alert)"))

        # --- Misc transactions for the chart ---
        misc = [
            ("Uber", "transport", 245.0, lm(6)), ("Amazon.in", "shopping", 1899.0, lm(11)),
            ("Big Bazaar", "shopping", 2340.0, lm(15)), ("Uber", "transport", 189.0, lm(21)),
            ("Zomato", "food", 421.0, lm(26)),
            ("Swiggy", "food", 366.0, TODAY - timedelta(days=3)),
            ("Uber", "transport", 210.0, TODAY - timedelta(days=2)),
        ]
        for merchant, cat, amount, d in misc:
            sid = src(session, "HDFC Bank: transaction alert", "HDFC Bank <alerts@hdfcbank.net>", d,
                      f"Rs.{amount:.2f} debited from a/c **6789 on {d.isoformat()} to {merchant.upper()} via UPI.")
            session.add(Transaction(source_id=sid, merchant=merchant, category=cat, amount=amount,
                                    txn_date=d, description=f"{merchant} (HDFC UPI alert)"))

        # --- A warranty-ish document ---
        s7 = src(session, "Invoice & warranty — Dell XPS 13", "Dell <orders@dell.com>", TODAY - timedelta(days=200),
                 "Thank you for your purchase. Dell XPS 13 (₹1,24,990). Premium Support warranty valid until "
                 f"{(TODAY + timedelta(days=165)).isoformat()}.", source_type="pdf")
        session.add(DocumentRecord(source_id=s7, doc_type="warranty", title="Dell XPS 13 Premium Support",
                                   provider="Dell", expiry_date=TODAY + timedelta(days=165), amount=124990,
                                   summary="Laptop warranty with onsite support."))

        # Backfill norm_key so seeded subscriptions/bills participate in upsert/rollup,
        # and dedup_key so a re-uploaded matching charge doesn't double-count.
        for sub in session.exec(select(Subscription)).all():
            sub.norm_key = norm_key(sub.name)
            # Leave last_invoice_at unset — the stale-invoice guard activates once a real
            # invoice arrives; seeding a future date would wrongly reject current invoices.
            session.add(sub)
        for bill in session.exec(select(Bill)).all():
            bill.norm_key = norm_key(bill.name)
            session.add(bill)
        for txn in session.exec(select(Transaction)).all():
            txn.dedup_key = _txn_dedup_key(txn.merchant, txn.txn_date, txn.amount, txn.currency)
            session.add(txn)
        session.commit()

        # Generate the initial action items (trial ending, price hike, duplicates).
        from app.services.actions import refresh_action_items
        refresh_action_items(session)

    swiggy_total = sum(a for _, a in swiggy)
    print(f"Seeded. Last month Swiggy total = Rs.{swiggy_total:.2f} "
          f"({LAST_MONTH_START.strftime('%B %Y')}) — use this to verify the agent.")


if __name__ == "__main__":
    main()
