from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from datetime import datetime, timedelta
import uuid

app = FastAPI(
    title="CloudBank API",
    version="2.0",
    root_path="/default"
)

# ---------------------------
# CORS — required for GitHub Pages / browser access
# ---------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten to your GitHub Pages URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------
# In-memory storage
# ---------------------------
accounts = {}       # account_id -> { name, balance }
transactions = {}   # account_id -> [ { type, amount, timestamp, suspicious, ... } ]

LARGE_AMOUNT_THRESHOLD = 10000
RAPID_TX_WINDOW_SECONDS = 60
RAPID_TX_LIMIT = 5
DAILY_TRANSFER_LIMIT = 20000


# ---------------------------
# Request Models
# ---------------------------
class AccountCreate(BaseModel):
    name: str
    initial_balance: float

    @validator("initial_balance")
    def balance_must_be_positive(cls, v):
        if v < 0:
            raise ValueError("Initial balance cannot be negative")
        return v

    @validator("name")
    def name_must_not_be_empty(cls, v):
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()


class DepositRequest(BaseModel):
    account_id: str
    amount: float

    @validator("amount")
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v


class WithdrawRequest(BaseModel):
    account_id: str
    amount: float

    @validator("amount")
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v


class TransferRequest(BaseModel):
    from_account: str
    to_account: str
    amount: float

    @validator("amount")
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v


# ---------------------------
# Helpers
# ---------------------------
def now_iso():
    return datetime.utcnow().isoformat() + "Z"


def get_account_or_404(account_id: str):
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail="Account not found")
    return accounts[account_id]


# ---------------------------
# Fraud Detection
# ---------------------------
def check_fraud(account_id: str, amount: float) -> dict:
    flags = []

    # Rule 1 — Large transaction
    if amount > LARGE_AMOUNT_THRESHOLD:
        flags.append(f"Large transaction: ${amount:,.2f} exceeds ${LARGE_AMOUNT_THRESHOLD:,}")

    # Rule 2 — Rapid successive transactions
    recent_cutoff = datetime.utcnow() - timedelta(seconds=RAPID_TX_WINDOW_SECONDS)
    recent_txs = [
        t for t in transactions.get(account_id, [])
        if datetime.fromisoformat(t["timestamp"].replace("Z", "")) > recent_cutoff
    ]
    if len(recent_txs) >= RAPID_TX_LIMIT:
        flags.append(f"Rapid transactions: {len(recent_txs)} transactions in last {RAPID_TX_WINDOW_SECONDS}s")

    return {
        "fraud_flag": len(flags) > 0,
        "fraud_reasons": flags
    }


# ---------------------------
# Daily Transfer Limit
# ---------------------------
def get_daily_spent(account_id: str) -> float:
    today = datetime.utcnow().date()
    total = 0.0
    for t in transactions.get(account_id, []):
        tx_date = datetime.fromisoformat(t["timestamp"].replace("Z", "")).date()
        if tx_date == today and t["type"] in ("withdraw", "transfer_sent"):
            total += t["amount"]
    return total


# ---------------------------
# Endpoints
# ---------------------------
@app.get("/")
def home():
    return {"message": "CloudBank API v2.0 — Running"}


@app.post("/create-account", status_code=201)
def create_account(account: AccountCreate):
    account_id = str(uuid.uuid4())
    accounts[account_id] = {
        "name": account.name,
        "balance": account.initial_balance
    }
    transactions[account_id] = []
    if account.initial_balance > 0:
        transactions[account_id].append({
            "type": "deposit",
            "amount": account.initial_balance,
            "timestamp": now_iso(),
            "note": "Initial deposit",
            "fraud_flag": False,
            "fraud_reasons": []
        })
    return {
        "account_id": account_id,
        "name": account.name,
        "balance": account.initial_balance
    }


@app.get("/balance/{account_id}")
def get_balance(account_id: str):
    acc = get_account_or_404(account_id)
    return {
        "account_id": account_id,
        "name": acc["name"],
        "balance": acc["balance"]
    }


@app.post("/deposit")
def deposit(data: DepositRequest):
    acc = get_account_or_404(data.account_id)
    fraud = check_fraud(data.account_id, data.amount)
    acc["balance"] += data.amount
    transactions[data.account_id].append({
        "type": "deposit",
        "amount": data.amount,
        "timestamp": now_iso(),
        **fraud
    })
    return {
        "message": "Deposit successful",
        "balance": acc["balance"],
        **fraud
    }


@app.post("/withdraw")
def withdraw(data: WithdrawRequest):
    acc = get_account_or_404(data.account_id)
    if acc["balance"] < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient funds")
    daily_spent = get_daily_spent(data.account_id)
    if daily_spent + data.amount > DAILY_TRANSFER_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"Daily limit exceeded. Spent ${daily_spent:,.2f} of ${DAILY_TRANSFER_LIMIT:,} today."
        )
    fraud = check_fraud(data.account_id, data.amount)
    acc["balance"] -= data.amount
    transactions[data.account_id].append({
        "type": "withdraw",
        "amount": data.amount,
        "timestamp": now_iso(),
        **fraud
    })
    return {
        "message": "Withdrawal successful",
        "balance": acc["balance"],
        **fraud
    }


@app.post("/transfer")
def transfer(data: TransferRequest):
    if data.from_account == data.to_account:
        raise HTTPException(status_code=400, detail="Cannot transfer to same account")
    from_acc = get_account_or_404(data.from_account)
    get_account_or_404(data.to_account)   # validate receiver exists
    if from_acc["balance"] < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    daily_spent = get_daily_spent(data.from_account)
    if daily_spent + data.amount > DAILY_TRANSFER_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"Daily transfer limit exceeded. Spent ${daily_spent:,.2f} of ${DAILY_TRANSFER_LIMIT:,} today."
        )
    fraud = check_fraud(data.from_account, data.amount)
    from_acc["balance"] -= data.amount
    accounts[data.to_account]["balance"] += data.amount
    ts = now_iso()
    transactions[data.from_account].append({
        "type": "transfer_sent",
        "amount": data.amount,
        "to": data.to_account,
        "timestamp": ts,
        **fraud
    })
    transactions[data.to_account].append({
        "type": "transfer_received",
        "amount": data.amount,
        "from": data.from_account,
        "timestamp": ts,
        "fraud_flag": False,
        "fraud_reasons": []
    })
    return {
        "message": "Transfer successful",
        "from_balance": from_acc["balance"],
        **fraud
    }


@app.get("/transactions/{account_id}")
def get_transactions(account_id: str):
    get_account_or_404(account_id)
    return {
        "account_id": account_id,
        "transactions": list(reversed(transactions[account_id]))   # newest first
    }


@app.get("/analytics/{account_id}")
def get_analytics(account_id: str):
    get_account_or_404(account_id)
    txs = transactions[account_id]

    total_deposited = sum(t["amount"] for t in txs if t["type"] in ("deposit",))
    total_withdrawn = sum(t["amount"] for t in txs if t["type"] in ("withdraw",))
    total_sent = sum(t["amount"] for t in txs if t["type"] == "transfer_sent")
    total_received = sum(t["amount"] for t in txs if t["type"] == "transfer_received")
    suspicious_count = sum(1 for t in txs if t.get("fraud_flag"))

    # Monthly breakdown — last 6 months
    monthly = {}
    for t in txs:
        month = t["timestamp"][:7]   # "YYYY-MM"
        if month not in monthly:
            monthly[month] = {"deposits": 0.0, "withdrawals": 0.0}
        if t["type"] in ("deposit", "transfer_received"):
            monthly[month]["deposits"] += t["amount"]
        elif t["type"] in ("withdraw", "transfer_sent"):
            monthly[month]["withdrawals"] += t["amount"]

    sorted_months = sorted(monthly.keys())[-6:]
    chart_data = {
        "labels": sorted_months,
        "deposits": [monthly[m]["deposits"] for m in sorted_months],
        "withdrawals": [monthly[m]["withdrawals"] for m in sorted_months],
    }

    return {
        "account_id": account_id,
        "total_transactions": len(txs),
        "total_deposited": total_deposited,
        "total_withdrawn": total_withdrawn,
        "total_sent": total_sent,
        "total_received": total_received,
        "suspicious_transactions": suspicious_count,
        "chart_data": chart_data
    }


@app.get("/accounts")
def list_accounts():
    """Dev helper — list all accounts (remove in production)"""
    return [
        {"account_id": aid, "name": acc["name"], "balance": acc["balance"]}
        for aid, acc in accounts.items()
    ]
