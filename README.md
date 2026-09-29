# 🌱 Magical Seeds — Superfood Store & Cloudflare Worker Backend

A high-converting, mobile-first e-commerce application for **Magical Seeds (6-in-1 Mixed Superfood Seeds)**, backed by **Firebase Realtime Database**, **Shiprocket Logistics Auto-Push**, and **Razorpay & Cashfree Multi-Gateway Support** with a fast **Cloudflare Worker** serverless backend.

---

## ⚡ Architecture & Overview

The store uses a serverless decoupled architecture:
- **Storefront**: Mobile-first single-page web app ([index.html](file:///c:/Users/smart/OneDrive/Desktop/web%20project/magical.seeds/index.html)) with Cash on Delivery (COD) OTP verification & Online payments
- **Admin Dashboard**: Operational dashboard ([admin.html](file:///c:/Users/smart/OneDrive/Desktop/web%20project/magical.seeds/admin.html)) for tracking, order management, and WhatsApp updates
- **Serverless Backend**: Cloudflare Worker ([worker.js](file:///c:/Users/smart/OneDrive/Desktop/web%20project/magical.seeds/worker.js)) handling REST APIs, payment webhooks, database sync, and logistics automation
- **Database**: Firebase Realtime Database (`magicalseeds-cd2e8`)
- **Customer Helpline**: `+91 99609 97808`

> 🔒 **Security Notice:** All private API secrets, gateway webhook signatures, and logistics credentials are kept securely in private `worker.js` / Cloudflare Worker Secrets and are excluded from public Git tracking.

---

## 🚀 Cloudflare Worker Deployment (Quick Edit)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages**.
2. Click **Create Application** → **Create Worker** (e.g., name it `magical-seeds`).
3. Click **Deploy**.
4. In the worker page, click **Edit code** (Quick Edit).
5. Copy the entire contents of [`worker.js`](file:///c:/Users/smart/OneDrive/Desktop/web%20project/magical.seeds/worker.js), paste it into the editor, and review the `CONFIG` object at the top.
6. Click **Save and Deploy**.

*(Optional)* You can also set any credential as an Environment Variable under **Settings** → **Variables and Secrets** in the Cloudflare Dashboard.

---

## 🔔 Webhook Configuration

### 1. Razorpay Webhooks
In your [Razorpay Dashboard](https://dashboard.razorpay.com/) under **Settings** → **Webhooks**:
- **Webhook URL**:
  ```
  https://flat-silence-26f4.ramzanarsalan36.workers.dev/api/webhooks/razorpay
  ```
- **Secret**: Enter the custom webhook secret configured in your `worker.js` / Cloudflare environment variable.
- **Active Events**:
  - `payment.captured`
  - `payment.authorized`
  - `payment.failed`
  - `order.paid`

### 2. Shiprocket Logistics Webhooks
In your [Shiprocket Dashboard](https://app.shiprocket.in/) under **Settings** → **API** → **Webhooks**:
- **Webhook URL**:
  ```
  https://flat-silence-26f4.ramzanarsalan36.workers.dev/api/webhooks/shiprocket
  ```
- **Events**: Order Status Updates, Tracking Updates (In Transit, Out For Delivery, Delivered, Cancelled).

---

## 📂 Repository Structure

```
magical.seeds/
├── index.html              # Customer storefront & responsive checkout (Razorpay + Cashfree + COD OTP)
├── admin.html              # Admin dashboard for orders, tracking, statuses, and Shiprocket sync
├── worker.js               # Cloudflare Worker serverless backend (APIs, RTDB REST, Gateways, Shiprocket)
├── database.rules.json     # Firebase Realtime Database security rules
├── README.md               # Setup & webhook configuration guide
└── image/                  # Product image gallery & lifestyle banners
```

---

## 🛠️ API Endpoints in `worker.js`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health & active gateway status |
| `GET` | `/api/config` | Public store configuration & gateway public keys |
| `POST` | `/api/orders` | Create or update customer order |
| `POST` | `/api/payment/create` | Initiate Razorpay or Cashfree payment session |
| `POST` | `/api/webhooks/razorpay` | Razorpay webhook (Captures payment, auto-pushes to Shiprocket, WhatsApp alert) |
| `POST` | `/api/webhooks/shiprocket` | Shiprocket tracking updates |
| `GET` | `/api/admin/orders` | Fetch orders list with real-time statistics (Revenue, Delivered, Counts) |
| `POST` | `/api/admin/orders/:id/toggle-delivered` | 1-Click set or revert delivered status |
| `POST` | `/api/admin/orders/:id/move-to-shiprocket` | Book shipment directly on Shiprocket |
| `POST` | `/api/admin/orders/:id/change-product` | Update SKU, Quantity, Pricing, or Shipping fees |
| `POST` | `/api/admin/orders/:id/cancel` | Cancel order and void Shiprocket shipment |
| `DELETE`| `/api/admin/orders/:id` | Permanently delete order from Firebase |
| `GET` | `/api/admin/whatsapp/templates` | Fetch custom WhatsApp message templates |
| `POST` | `/api/admin/whatsapp/templates` | Save customized WhatsApp templates |
| `GET` | `/api/shipments/:id/label` | Download/Redirect to Shiprocket shipping label |
| `GET` | `/api/shipments/:id/invoice` | Download/Redirect to Shiprocket tax invoice |
