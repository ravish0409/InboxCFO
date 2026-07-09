from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Bill, DocumentRecord, Source, Subscription, Transaction
from ..services.actions import _monthly
from ..services.insights import build_insights

router = APIRouter(prefix="/api", tags=["data"])


@router.get("/subscriptions")
def get_subscriptions(session: Session = Depends(get_session)):
    return session.exec(select(Subscription)).all()


@router.get("/bills")
def get_bills(session: Session = Depends(get_session)):
    return session.exec(select(Bill)).all()


@router.get("/documents")
def get_documents(session: Session = Depends(get_session)):
    return session.exec(select(DocumentRecord)).all()


@router.get("/transactions")
def get_transactions(session: Session = Depends(get_session)):
    txns = session.exec(select(Transaction)).all()
    return sorted(txns, key=lambda t: t.txn_date or date.min, reverse=True)


@router.get("/spend-by-month")
def spend_by_month(session: Session = Depends(get_session)):
    txns = session.exec(select(Transaction)).all()
    buckets: dict[str, float] = defaultdict(float)
    for t in txns:
        if t.txn_date:
            buckets[t.txn_date.strftime("%Y-%m")] += t.amount
    return [{"month": m, "total": round(v, 2)} for m, v in sorted(buckets.items())][-6:]


@router.get("/sources/{source_id}")
def get_source(source_id: int, session: Session = Depends(get_session)):
    src = session.get(Source, source_id)
    if src is None:
        raise HTTPException(404, "source not found")
    return src


@router.get("/insights")
def get_insights(session: Session = Depends(get_session)):
    return build_insights(session)


@router.get("/stats")
def get_stats(session: Session = Depends(get_session)):
    subs = session.exec(select(Subscription).where(Subscription.status == "active")).all()
    txns = session.exec(select(Transaction)).all()
    sources = session.exec(select(Source)).all()
    monthly = sum(_monthly(s) for s in subs)
    today = date.today()
    this_month = sum(
        t.amount for t in txns
        if t.txn_date and t.txn_date.year == today.year and t.txn_date.month == today.month
    )
    return {
        "active_subscriptions": len(subs),
        "monthly_subscription_cost": round(monthly, 2),
        "spend_this_month": round(this_month, 2),
        "items_ingested": len(sources),
    }
