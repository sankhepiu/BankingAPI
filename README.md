# ☁️ CloudBank — Serverless Banking System with Fraud Detection

> A production-grade, cloud-native banking API and dashboard built with FastAPI, AWS Lambda, and a real-time frontend. Designed to demonstrate full-stack engineering, cloud deployment, and intelligent fraud detection.

---

## 🌐 Live Demo

| Layer | URL |
|-------|-----|
| **Frontend Dashboard** | [your-username.github.io/cloudbank](https://your-username.github.io/cloudbank) |
| **Backend API (AWS)** | `https://xxxx.execute-api.amazonaws.com/prod` |
| **API Docs (Swagger)** | `https://xxxx.execute-api.amazonaws.com/prod/docs` |

---

## 📐 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      GitHub Pages                           │
│              index.html + script.js (SPA)                   │
│        Dashboard · Accounts · Transfers · Analytics         │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTPS / fetch API
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   AWS API Gateway                           │
│          (REST API — rate limiting, CORS, routing)          │
└────────────────────────┬────────────────────────────────────┘
                         │  Lambda Proxy Integration
                         ▼
┌─────────────────────────────────────────────────────────────┐
│               AWS Lambda (Python 3.11)                      │
│         FastAPI via Mangum ASGI adapter                     │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │  Banking     │  │  Fraud       │  │  Analytics        │ │
│  │  Engine      │  │  Detection   │  │  Engine           │ │
│  │  (CRUD)      │  │  (Rules)     │  │  (Aggregation)    │ │
│  └──────────────┘  └──────────────┘  └───────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

### Core Banking
- **Create Account** — UUID-based accounts with initial deposit
- **Deposit & Withdraw** — Real-time balance updates with validation
- **Peer-to-Peer Transfer** — Between any two accounts with daily limits
- **Transaction History** — Full audit trail with timestamps, newest-first

### Fraud Detection Engine (Rule-Based)
| Rule | Threshold | Action |
|------|-----------|--------|
| Large Transaction | > $10,000 | Flag + return `fraud_flag: true` |
| Rapid Transactions | 5+ in 60 seconds | Flag + return reason |
| Daily Limit Breach | > $20,000 sent/day | Hard reject (HTTP 400) |

All fraud events surface instantly in the UI as a dismissible banner with the specific reason.

### Analytics
- Monthly deposits vs withdrawals (bar + line chart via Chart.js)
- Aggregate stats: total deposited, withdrawn, sent, received, flagged

### Frontend Dashboard
- 5-section SPA: Dashboard · Accounts · Transfers · Transactions · Analytics
- Real-time card updates after every action
- Dynamic Chart.js visualisation pulled from `/analytics/{id}`
- Full transaction table with colour-coded fraud badges
- Toast notifications for success/error
- Account session persistence via `localStorage`

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend Framework | FastAPI (Python) |
| Cloud Compute | AWS Lambda |
| API Gateway | AWS API Gateway (REST) |
| Frontend Hosting | GitHub Pages |
| Frontend | HTML5 + CSS3 + Vanilla JS |
| Charts | Chart.js |
| ASGI Adapter | Mangum |
| Data Storage | In-memory (Python dicts) |

---

## 🚀 Local Development

### Backend

```bash
# 1. Clone the repo
git clone https://github.com/your-username/cloudbank.git
cd cloudbank/backend

# 2. Create a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install fastapi uvicorn mangum pydantic

# 4. Run locally
uvicorn main:app --reload --port 8000

# API docs available at:
# http://127.0.0.1:8000/docs
```

### Frontend

```bash
# In script.js, set:
const BASE_URL = "http://127.0.0.1:8000";

# Open index.html in your browser (no build step needed)
```

---

## ☁️ AWS Deployment

### Package for Lambda

```bash
pip install fastapi mangum pydantic -t ./package
cp main.py ./package/
cd package && zip -r ../cloudbank.zip . && cd ..
```

### Lambda Settings
- **Runtime**: Python 3.11
- **Handler**: `main.handler`
- **Memory**: 256 MB
- **Timeout**: 30 seconds
- In `main.py`, add at the bottom:
  ```python
  from mangum import Mangum
  handler = Mangum(app)
  ```

### API Gateway
1. Create REST API → Lambda Proxy Integration
2. Add resource `/{proxy+}` with `ANY` method
3. Enable CORS on the resource
4. Deploy to stage `prod`
5. Copy the Invoke URL → paste into `script.js` as `BASE_URL`

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/create-account` | Create new account |
| `GET` | `/balance/{account_id}` | Get current balance |
| `POST` | `/deposit` | Deposit funds |
| `POST` | `/withdraw` | Withdraw funds |
| `POST` | `/transfer` | Transfer between accounts |
| `GET` | `/transactions/{account_id}` | Full transaction history |
| `GET` | `/analytics/{account_id}` | Aggregated stats + chart data |

### Example: Create Account
```bash
curl -X POST https://your-api.execute-api.amazonaws.com/prod/create-account \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice Kumar", "initial_balance": 5000}'
```

```json
{
  "account_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "name": "Alice Kumar",
  "balance": 5000
}
```

### Example: Fraud-Flagged Deposit
```bash
curl -X POST .../deposit \
  -d '{"account_id": "...", "amount": 15000}'
```

```json
{
  "message": "Deposit successful",
  "balance": 20000,
  "fraud_flag": true,
  "fraud_reasons": ["Large transaction: $15,000.00 exceeds $10,000"]
}
```

---

## 🗂️ Project Structure

```
cloudbank/
├── backend/
│   └── main.py            # FastAPI app — all routes, models, fraud logic
├── frontend/
│   ├── index.html         # Dashboard SPA
│   └── script.js          # API integration, chart, table rendering
└── README.md
```

---

## 🔮 Roadmap / Improvements

- [ ] PostgreSQL / DynamoDB persistence (replace in-memory store)
- [ ] JWT authentication (login / logout)
- [ ] WebSocket support for real-time push notifications
- [ ] ML-based fraud detection (anomaly scoring)
- [ ] Multi-currency support
- [ ] Rate limiting (per IP, per account)
- [ ] Structured logging (CloudWatch)

---

## 💡 Why This Project Matters

Modern fintech systems face three hard engineering problems simultaneously: **reliability** (transactions must never corrupt state), **security** (fraud must be caught in real time), and **scale** (serverless handles unpredictable load without over-provisioning).

CloudBank addresses all three with a clean layered architecture — stateless API, rule-based fraud engine, and a real-time dashboard — while staying deployable by a single engineer in under an hour. The same patterns power production systems at companies like Razorpay, PhonePe, and Stripe.

---

## 👤 Author

**Your Name** · [LinkedIn](https://linkedin.com/in/yourprofile) · [GitHub](https://github.com/your-username)