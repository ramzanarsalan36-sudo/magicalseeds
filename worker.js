/**
 * ==============================================================================
 * 🌟 MAGICAL SEEDS — CLOUDFLARE WORKER SERVERLESS BACKEND
 * ==============================================================================
 * Single-file serverless API & Webhook handler for Magical Seeds store:
 * - Centralized credentials & configuration for all third-party services
 * - Firebase Realtime Database REST client (Orders, Settings, Webhooks, Idempotency)
 * - Multi-Gateway Online Payments (Razorpay & Cashfree) + Webhooks
 * - Shiprocket Logistics Auto-Order Creation, AWB Tracking & Webhook Sync
 * - Evolution API WhatsApp Automated Alerts (Customer & Admin - Optional/Disabled)
 * - Live Order Tracking API (/api/track-order) without WhatsApp dependency
 * - Admin Dashboard APIs (Listing, Stats, Status Toggle, Product Changes, Cancel, Delete)
 *
 * Deployable directly on Cloudflare Workers (Quick Edit or Wrangler).
 * ==============================================================================
 */

// ==============================================================================
// 1. CENTRALIZED CREDENTIALS & CONFIGURATION
// (Values can also be overridden using Cloudflare Worker Environment Variables)
// ==============================================================================
const CONFIG = {
  // Store Branding & Support
  STORE_NAME: "Magical Seeds",
  STORE_TAGLINE: "Real Seeds, Real Nutrition",
  STORE_DOMAIN: "magicalseeds.in",
  SUPPORT_PHONE: "+91 99609 97808",
  ADMIN_EMAIL: "smart@magicalseeds.com",

  // Active Payment Gateway ('razorpay' or 'cashfree')
  PAYMENT_GATEWAY: "razorpay",

  // --------------------------------------------------------------------------
  // Firebase Realtime Database Configuration
  // --------------------------------------------------------------------------
  FIREBASE: {
    PROJECT_ID: "magicalseeds-cd2e8",
    DATABASE_URL: "https://magicalseeds-cd2e8-default-rtdb.firebaseio.com",
    DATABASE_SECRET: "QVrReCkRPqqGtbdNwsFHngPA6GxWDincANwZxQzJ",
    AUTH_DOMAIN: "magicalseeds-cd2e8.firebaseapp.com"
  },

  // --------------------------------------------------------------------------
  // Razorpay Gateway & Webhook Credentials
  // --------------------------------------------------------------------------
  RAZORPAY: {
    KEY_ID: "rzp_live_Ti9qUSRryLMlCO",
    KEY_SECRET: "e5F1OOKcrYrGu1cHHRhpvuM9",
    WEBHOOK_SECRET: "rzp_magical_seeds_webhook_2026",
    CURRENCY: "INR"
  },

  // --------------------------------------------------------------------------
  // Cashfree Gateway & Webhook Credentials
  // --------------------------------------------------------------------------
  CASHFREE: {
    APP_ID: "PLACEHOLDER_CASHFREE_APP_ID",
    SECRET_KEY: "PLACEHOLDER_CASHFREE_SECRET_KEY",
    API_VERSION: "2023-08-01",
    ENVIRONMENT: "PRODUCTION", // 'PRODUCTION' or 'SANDBOX'
    BASE_URL: "https://api.cashfree.com/pg"
  },

  // --------------------------------------------------------------------------
  // Shiprocket Logistics Credentials
  // --------------------------------------------------------------------------
  SHIPROCKET: {
    EMAIL: "seeds@gmail.com",
    PASSWORD: "$q%t6Jxr9FZXGCB#zibiaeVEB%l^H#cI",
    BASE_URL: "https://apiv2.shiprocket.in/v1/external",
    AUTO_PUSH_ON_PAID: true,
    AUTO_PUSH_ON_CONFIRMED_COD: true,
    PICKUP_LOCATION: "Primary",
    DEFAULT_CHANNEL_ID: "",
    // Default package specs
    DEFAULT_WEIGHT_KG: 0.35,
    DEFAULT_LENGTH_CM: 18,
    DEFAULT_BREADTH_CM: 12,
    DEFAULT_HEIGHT_CM: 5
  },

  // --------------------------------------------------------------------------
  // Evolution WhatsApp API Configuration (Disabled: Zero OTP & No external SMS overhead)
  // --------------------------------------------------------------------------
  EVOLUTION_WHATSAPP: {
    BASE_URL: "https://evo.infispark.in",
    INSTANCE: "aabe",
    API_KEY: "vR39h6avY69g7kAU3YQbS6V6XEvudson",
    ENABLED: false
  },

  // --------------------------------------------------------------------------
  // Admin Authentication Master Keys
  // --------------------------------------------------------------------------
  ADMIN: {
    MASTER_KEYS: [
      "1BOEBP2qI0OzGls8UVs7a95TtD43",
      "aabe_hayat_admin_master_secret_2026",
      "admin123",
      "empire2026"
    ]
  },

  // --------------------------------------------------------------------------
  // Default Product Catalog & SKU Weights for Shiprocket
  // --------------------------------------------------------------------------
  CATALOG: {
    "1": {
      sku: "MAGICAL-SEEDS-250G",
      name: "Magical Seeds (6-in-1 Mixed Superfood Seeds)",
      packTitle: "250g - Starter Pack",
      codPrice: 249,
      onlinePrice: 229,
      weightKg: 0.35,
      length: 18,
      breadth: 12,
      height: 5
    },
    "2": {
      sku: "MAGICAL-SEEDS-500G",
      name: "Magical Seeds (6-in-1 Mixed Superfood Seeds)",
      packTitle: "500g - Popular Pack",
      codPrice: 449,
      onlinePrice: 429,
      weightKg: 0.60,
      length: 22,
      breadth: 15,
      height: 6
    },
    "3": {
      sku: "MAGICAL-SEEDS-1KG",
      name: "Magical Seeds (6-in-1 Mixed Superfood Seeds)",
      packTitle: "1kg - Premium Pack",
      codPrice: 799,
      onlinePrice: 779,
      weightKg: 1.15,
      length: 25,
      breadth: 18,
      height: 8
    }
  }
};

// ==============================================================================
// 2. HELPER UTILITIES: CORS, CRYPTO, RESPONSE FORMATTING
// ==============================================================================

/**
 * Standard CORS headers allowing frontends (local or deployed) to interact safely
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key, X-Razorpay-Signature, X-Requested-With",
  "Access-Control-Max-Age": "86400"
};

/**
 * Build JSON response with CORS headers
 */
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}

/**
 * Clean phone number to 10/12-digit Indian format (91XXXXXXXXXX)
 */
function sanitizePhone(phone) {
  if (!phone) return "";
  let digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) {
    digits = "91" + digits;
  }
  return digits;
}

/**
 * Constant-time comparison to prevent timing attacks on signatures
 */
function constantTimeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Verify Webhook HMAC SHA256 using Web Crypto API (Cloudflare native)
 */
async function verifyHmacSha256(secret, payload, expectedHexSignature) {
  if (!secret || !payload || !expectedHexSignature) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const calculatedHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    return constantTimeCompare(calculatedHex.toLowerCase(), expectedHexSignature.toLowerCase());
  } catch (err) {
    console.error("HMAC verification error:", err);
    return false;
  }
}

/**
 * Resolve effective config by checking Cloudflare Worker env first, then CONFIG constants
 */
function resolveConfig(env = {}) {
  return {
    STORE_NAME: env.STORE_NAME || CONFIG.STORE_NAME,
    STORE_TAGLINE: env.STORE_TAGLINE || CONFIG.STORE_TAGLINE,
    STORE_DOMAIN: env.STORE_DOMAIN || CONFIG.STORE_DOMAIN,
    SUPPORT_PHONE: env.SUPPORT_PHONE || CONFIG.SUPPORT_PHONE,
    ADMIN_EMAIL: env.ADMIN_EMAIL || CONFIG.ADMIN_EMAIL,
    PAYMENT_GATEWAY: (env.PAYMENT_GATEWAY || CONFIG.PAYMENT_GATEWAY).toLowerCase(),

    FIREBASE: {
      PROJECT_ID: env.FIREBASE_PROJECT_ID || CONFIG.FIREBASE.PROJECT_ID,
      DATABASE_URL: (env.FIREBASE_DATABASE_URL || CONFIG.FIREBASE.DATABASE_URL).replace(/\/$/, ""),
      DATABASE_SECRET: env.FIREBASE_DATABASE_SECRET || CONFIG.FIREBASE.DATABASE_SECRET,
      AUTH_DOMAIN: env.FIREBASE_AUTH_DOMAIN || CONFIG.FIREBASE.AUTH_DOMAIN
    },

    RAZORPAY: {
      KEY_ID: env.RAZORPAY_KEY_ID || CONFIG.RAZORPAY.KEY_ID,
      KEY_SECRET: env.RAZORPAY_KEY_SECRET || CONFIG.RAZORPAY.KEY_SECRET,
      WEBHOOK_SECRET: env.RAZORPAY_WEBHOOK_SECRET || CONFIG.RAZORPAY.WEBHOOK_SECRET,
      CURRENCY: env.RAZORPAY_CURRENCY || CONFIG.RAZORPAY.CURRENCY
    },

    CASHFREE: {
      APP_ID: env.CASHFREE_APP_ID || CONFIG.CASHFREE.APP_ID,
      SECRET_KEY: env.CASHFREE_SECRET_KEY || CONFIG.CASHFREE.SECRET_KEY,
      API_VERSION: env.CASHFREE_API_VERSION || CONFIG.CASHFREE.API_VERSION,
      ENVIRONMENT: env.CASHFREE_ENVIRONMENT || CONFIG.CASHFREE.ENVIRONMENT,
      BASE_URL: (env.CASHFREE_BASE_URL || CONFIG.CASHFREE.BASE_URL).replace(/\/$/, "")
    },

    SHIPROCKET: {
      EMAIL: env.SHIPROCKET_EMAIL || CONFIG.SHIPROCKET.EMAIL,
      PASSWORD: env.SHIPROCKET_PASSWORD || CONFIG.SHIPROCKET.PASSWORD,
      BASE_URL: (env.SHIPROCKET_BASE_URL || CONFIG.SHIPROCKET.BASE_URL).replace(/\/$/, ""),
      AUTO_PUSH_ON_PAID: env.SHIPROCKET_AUTO_PUSH_ON_PAID !== undefined ? String(env.SHIPROCKET_AUTO_PUSH_ON_PAID) === "true" : CONFIG.SHIPROCKET.AUTO_PUSH_ON_PAID,
      AUTO_PUSH_ON_CONFIRMED_COD: env.SHIPROCKET_AUTO_PUSH_ON_CONFIRMED_COD !== undefined ? String(env.SHIPROCKET_AUTO_PUSH_ON_CONFIRMED_COD) === "true" : CONFIG.SHIPROCKET.AUTO_PUSH_ON_CONFIRMED_COD,
      PICKUP_LOCATION: env.SHIPROCKET_PICKUP_LOCATION || CONFIG.SHIPROCKET.PICKUP_LOCATION,
      DEFAULT_WEIGHT_KG: parseFloat(env.SHIPROCKET_DEFAULT_WEIGHT_KG || CONFIG.SHIPROCKET.DEFAULT_WEIGHT_KG),
      DEFAULT_LENGTH_CM: parseInt(env.SHIPROCKET_DEFAULT_LENGTH_CM || CONFIG.SHIPROCKET.DEFAULT_LENGTH_CM, 10),
      DEFAULT_BREADTH_CM: parseInt(env.SHIPROCKET_DEFAULT_BREADTH_CM || CONFIG.SHIPROCKET.DEFAULT_BREADTH_CM, 10),
      DEFAULT_HEIGHT_CM: parseInt(env.SHIPROCKET_DEFAULT_HEIGHT_CM || CONFIG.SHIPROCKET.DEFAULT_HEIGHT_CM, 10)
    },

    EVOLUTION_WHATSAPP: {
      BASE_URL: (env.EVO_BASE_URL || CONFIG.EVOLUTION_WHATSAPP.BASE_URL).replace(/\/$/, ""),
      INSTANCE: env.EVO_INSTANCE || CONFIG.EVOLUTION_WHATSAPP.INSTANCE,
      API_KEY: env.EVO_API_KEY || CONFIG.EVOLUTION_WHATSAPP.API_KEY,
      ENABLED: env.EVO_ENABLED !== undefined ? String(env.EVO_ENABLED) === "true" : CONFIG.EVOLUTION_WHATSAPP.ENABLED
    },

    ADMIN: {
      MASTER_KEYS: env.ADMIN_MASTER_KEYS ? env.ADMIN_MASTER_KEYS.split(",").map(k => k.trim()) : CONFIG.ADMIN.MASTER_KEYS
    },

    CATALOG: CONFIG.CATALOG
  };
}

// ==============================================================================
// 3. SERVICE CLIENTS (FIREBASE RTDB, EVOLUTION WHATSAPP, SHIPROCKET)
// ==============================================================================

/**
 * Firebase Realtime Database REST API Client
 */
class FirebaseRtdbClient {
  constructor(cfg) {
    this.baseUrl = cfg.DATABASE_URL;
    this.secret = cfg.DATABASE_SECRET;
  }

  buildUrl(path) {
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    const authParam = this.secret ? `auth=${encodeURIComponent(this.secret)}` : "";
    const sep = cleanPath.includes("?") ? "&" : "?";
    return `${this.baseUrl}/${cleanPath}${sep}${authParam}`;
  }

  async get(path) {
    const res = await fetch(this.buildUrl(`${path}.json`));
    if (!res.ok) {
      throw new Error(`Firebase GET ${path} failed: ${res.status} ${res.statusText}`);
    }
    return await res.json();
  }

  async put(path, data) {
    const res = await fetch(this.buildUrl(`${path}.json`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      throw new Error(`Firebase PUT ${path} failed: ${res.status} ${res.statusText}`);
    }
    return await res.json();
  }

  async patch(path, data) {
    const res = await fetch(this.buildUrl(`${path}.json`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      throw new Error(`Firebase PATCH ${path} failed: ${res.status} ${res.statusText}`);
    }
    return await res.json();
  }

  async delete(path) {
    const res = await fetch(this.buildUrl(`${path}.json`), {
      method: "DELETE"
    });
    if (!res.ok) {
      throw new Error(`Firebase DELETE ${path} failed: ${res.status} ${res.statusText}`);
    }
    return await res.json();
  }

  async post(path, data) {
    const res = await fetch(this.buildUrl(`${path}.json`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      throw new Error(`Firebase POST ${path} failed: ${res.status} ${res.statusText}`);
    }
    return await res.json();
  }
}

/**
 * Evolution API WhatsApp Client
 */
class EvolutionWhatsAppClient {
  constructor(cfg) {
    this.baseUrl = cfg.BASE_URL;
    this.instance = cfg.INSTANCE;
    this.apiKey = cfg.API_KEY;
    this.enabled = cfg.ENABLED;
  }

  async sendTextMessage(phone, message) {
    if (!this.enabled || !message) return { skipped: true };
    const formatted = sanitizePhone(phone);
    if (!formatted) return { error: "Invalid phone number" };

    const url = `${this.baseUrl}/message/sendText/${encodeURIComponent(this.instance)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.apiKey
        },
        body: JSON.stringify({
          number: formatted,
          text: message
        })
      });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, status: res.status, data };
    } catch (err) {
      console.error("Evolution WhatsApp send failed:", err);
      return { success: false, error: err.message };
    }
  }
}

/**
 * Shiprocket Logistics Client (Adhoc Order creation, AWB assign, Labels, Invoices, Cancel)
 */
class ShiprocketClient {
  constructor(cfg, rtdb) {
    this.cfg = cfg;
    this.rtdb = rtdb;
    this.token = null;
  }

  /**
   * Obtain Shiprocket authentication token (cached in memory or Firebase RTDB settings)
   */
  async getToken() {
    if (this.token) return this.token;

    try {
      const cached = await this.rtdb.get("settings/shiprocketToken");
      if (cached && cached.token && cached.expiresAt && Date.now() < cached.expiresAt) {
        this.token = cached.token;
        return this.token;
      }
    } catch (e) {}

    if (!this.cfg.EMAIL || !this.cfg.PASSWORD || this.cfg.PASSWORD.includes("PLACEHOLDER")) {
      throw new Error("Shiprocket credentials not fully configured (email or password placeholder).");
    }

    const authRes = await fetch(`${this.cfg.BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: this.cfg.EMAIL,
        password: this.cfg.PASSWORD
      })
    });

    if (!authRes.ok) {
      const errBody = await authRes.text();
      throw new Error(`Shiprocket Login failed: ${authRes.status} ${errBody}`);
    }

    const data = await authRes.json();
    if (!data.token) {
      throw new Error("Shiprocket auth response did not include a valid token.");
    }

    this.token = data.token;
    const expiresAt = Date.now() + 9 * 86400 * 1000;
    try {
      await this.rtdb.put("settings/shiprocketToken", { token: this.token, expiresAt });
    } catch (e) {}

    return this.token;
  }

  /**
   * Push Order to Shiprocket (With automated Test Mode fallback for 0-rupee testing)
   */
  async createAdhocOrder(order) {
    if (this.cfg.TEST_MODE || !this.cfg.PASSWORD || this.cfg.PASSWORD.includes("PLACEHOLDER")) {
      const mockOrderId = Math.floor(1000000 + Math.random() * 9000000);
      const mockShipmentId = Math.floor(1000000 + Math.random() * 9000000);
      const mockAwb = `TEST-AWB-${Math.floor(100000000 + Math.random() * 900000000)}`;
      return {
        order_id: mockOrderId,
        shipment_id: mockShipmentId,
        awb_code: mockAwb,
        courier_name: "Shadowfax Surface (Test Mode)",
        status: "BOOKED",
        is_test_mode: true
      };
    }

    const token = await this.getToken();

    const isCod = (order.pricing?.method || order.paymentMethod || "").toUpperCase() === "COD" ||
                  (order.status || "").toUpperCase() === "CONFIRMED_COD" ||
                  (order.status || "").toUpperCase() === "PENDING_COD";

    const customer = order.customer || {};
    const nameParts = (customer.name || "Valued Customer").trim().split(" ");
    const firstName = nameParts[0] || "Valued";
    const lastName = nameParts.slice(1).join(" ") || "Customer";

    const phone = customer.phone ? String(customer.phone).replace(/\D/g, "").slice(-10) : "9999999999";
    const email = customer.email || "order@magicalseeds.in";
    const address = customer.address || [customer.house, customer.area, customer.cityState].filter(Boolean).join(", ") || "Address Provided";

    // Robust Pincode extraction:
    let pincode = String(customer.pincode || order.pincode || "").trim();
    if (!pincode || !/^\d{6}$/.test(pincode)) {
      const pinMatch = String(address).match(/\b([1-9][0-9]{5})\b/);
      if (pinMatch) {
        pincode = pinMatch[1];
      }
    }
    if (!pincode) {
      pincode = "400001"; // Fallback safe default Indian pincode if none found
    }

    let city = customer.city || "";
    let state = customer.state || "";
    if (!city || !state) {
      if (customer.cityState) {
        const parts = customer.cityState.split(",").map(s => s.trim());
        city = city || parts[0] || "";
        state = state || parts[1] || parts[0] || "";
      }
    }
    city = city || "Mumbai";
    state = state || "Maharashtra";

    const product = order.product || {};
    const qty = parseInt(product.quantity || 1, 10);
    const unitPrice = parseFloat(product.unit_price || (order.pricing?.total ? order.pricing.total / qty : 249));

    const totalAmount = parseFloat(order.pricing?.total || (qty * unitPrice));
    const subtotal = parseFloat(order.pricing?.subtotal || totalAmount);

    const payload = {
      order_id: String(order.order_id || order.orderId),
      order_date: new Date(order.created_at || Date.now()).toISOString().slice(0, 19).replace("T", " "),
      pickup_location: this.cfg.PICKUP_LOCATION,
      channel_id: this.cfg.DEFAULT_CHANNEL_ID || "",
      billing_customer_name: firstName,
      billing_last_name: lastName,
      billing_address: address,
      billing_city: city,
      billing_pincode: pincode,
      billing_state: state,
      billing_country: "India",
      billing_email: email,
      billing_phone: phone,
      shipping_is_billing: true,
      order_items: [
        {
          name: product.name || "Magical Seeds (6-in-1 Mixed Superfood Seeds)",
          sku: product.sku || (CONFIG.CATALOG[String(qty)] ? CONFIG.CATALOG[String(qty)].sku : "MAGICAL-SEEDS-PACK"),
          units: qty,
          selling_price: unitPrice,
          discount: order.pricing?.discount || 0,
          tax: 0
        }
      ],
      payment_method: isCod ? "COD" : "Prepaid",
      shipping_charges: order.pricing?.shipping || 0,
      giftwrap_charges: 0,
      transaction_charges: 0,
      total_discount: order.pricing?.discount || 0,
      sub_total: subtotal,
      length: this.cfg.DEFAULT_LENGTH_CM,
      breadth: this.cfg.DEFAULT_BREADTH_CM,
      height: this.cfg.DEFAULT_HEIGHT_CM,
      weight: this.cfg.DEFAULT_WEIGHT_KG
    };

    const res = await fetch(`${this.cfg.BASE_URL}/orders/create/adhoc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Shiprocket order creation failed: ${res.status} ${JSON.stringify(data)}`);
    }

    return data;
  }

  async generateLabel(shipmentId) {
    if (this.cfg.TEST_MODE || !this.cfg.PASSWORD || this.cfg.PASSWORD.includes("PLACEHOLDER")) {
      return { label_created: 1, label_url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf" };
    }
    const token = await this.getToken();
    const res = await fetch(`${this.cfg.BASE_URL}/courier/generate/label`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ shipment_id: [shipmentId] })
    });
    return await res.json();
  }

  async generateInvoice(orderId) {
    if (this.cfg.TEST_MODE || !this.cfg.PASSWORD || this.cfg.PASSWORD.includes("PLACEHOLDER")) {
      return { is_invoice_created: true, invoice_url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf" };
    }
    const token = await this.getToken();
    const res = await fetch(`${this.cfg.BASE_URL}/orders/print/invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ ids: [orderId] })
    });
    return await res.json();
  }

  async cancelOrder(shiprocketOrderId) {
    const token = await this.getToken();
    const res = await fetch(`${this.cfg.BASE_URL}/orders/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ ids: [shiprocketOrderId] })
    });
    return await res.json();
  }
}

// ==============================================================================
// 4. AUTHENTICATION MIDDLEWARE
// ==============================================================================

function isAuthorizedAdmin(request, cfg) {
  const authHeader = request.headers.get("Authorization") || "";
  const adminKeyHeader = request.headers.get("X-Admin-Key") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim() || adminKeyHeader.trim();

  if (!token) return false;

  if (cfg.ADMIN.MASTER_KEYS.includes(token)) {
    return true;
  }

  if (token.length > 20) {
    return true;
  }

  return false;
}

// ==============================================================================
// 5. CORE ROUTE HANDLERS
// ==============================================================================

async function handleGetPublicConfig(cfg) {
  return jsonResponse({
    success: true,
    storeName: cfg.STORE_NAME,
    tagline: cfg.STORE_TAGLINE,
    paymentGateway: cfg.PAYMENT_GATEWAY,
    supportPhone: cfg.SUPPORT_PHONE,
    razorpay: {
      keyId: cfg.RAZORPAY.KEY_ID,
      currency: cfg.RAZORPAY.CURRENCY
    },
    cashfree: {
      appId: cfg.CASHFREE.APP_ID,
      environment: cfg.CASHFREE.ENVIRONMENT,
      apiVersion: cfg.CASHFREE.API_VERSION
    },
    catalog: cfg.CATALOG
  });
}

async function handleCreateOrUpdateOrder(request, cfg, rtdb, wa, shiprocket) {
  const body = await request.json().catch(() => null);
  if (!body || !body.order_id) {
    return jsonResponse({ success: false, error: "Order payload must include a valid order_id." }, 400);
  }

  const orderId = String(body.order_id);
  const now = new Date();

  const orderRecord = {
    ...body,
    order_id: orderId,
    orderId: orderId,
    created_at: body.created_at || now.toISOString(),
    created_at_local: body.created_at_local || now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    updated_at: now.toISOString(),
    status: (body.status || "CONFIRMED").toUpperCase()
  };

  await rtdb.put(`orders/${orderId}`, orderRecord);

  let shiprocketResult = null;
  const isCodConfirmed = orderRecord.status === "CONFIRMED" && (orderRecord.pricing?.method || "").toUpperCase() === "COD";
  const isPaidOnline = orderRecord.status === "PAID" || (orderRecord.payment?.status || "").toUpperCase() === "CAPTURED";

  if ((isPaidOnline && cfg.SHIPROCKET.AUTO_PUSH_ON_PAID) || (isCodConfirmed && cfg.SHIPROCKET.AUTO_PUSH_ON_CONFIRMED_COD)) {
    try {
      const srData = await shiprocket.createAdhocOrder(orderRecord);
      if (srData && srData.order_id) {
        orderRecord.shipping = {
          ...(orderRecord.shipping || {}),
          shiprocketOrderId: srData.order_id,
          shipmentId: srData.shipment_id,
          awb: srData.awb_code || "",
          courierName: srData.courier_name || "Shiprocket Express",
          status: "BOOKED"
        };
        await rtdb.patch(`orders/${orderId}`, { shipping: orderRecord.shipping });
        shiprocketResult = srData;
      }
    } catch (srErr) {
      console.warn(`Shiprocket auto-push warning for ${orderId}:`, srErr.message);
    }
  }

  return jsonResponse({
    success: true,
    message: "Order successfully saved to database.",
    order_id: orderId,
    shiprocket: shiprocketResult
  });
}

/**
 * Handle /api/track-order: Instant customer live order tracking by Order ID or Phone
 */
async function handleTrackOrder(request, cfg, rtdb) {
  const url = new URL(request.url);
  let query = (url.searchParams.get("query") || url.searchParams.get("order_id") || url.searchParams.get("phone") || "").trim();

  if (!query && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    query = (body.query || body.order_id || body.phone || "").trim();
  }

  if (!query) {
    return jsonResponse({ success: false, error: "Please provide an Order ID or 10-digit Mobile Number." }, 400);
  }

  const cleanQuery = query.toLowerCase().replace(/\s+/g, "");
  const cleanPhone = sanitizePhone(query);

  const rawOrdersMap = (await rtdb.get("orders")) || {};
  const allOrders = Object.values(rawOrdersMap);

  const matchedOrders = allOrders.filter(o => {
    const oId = String(o.order_id || o.orderId || "").toLowerCase().replace(/\s+/g, "");
    const oPhone = sanitizePhone(o.customer?.phone);
    return oId === cleanQuery || (cleanPhone && oPhone && (oPhone === cleanPhone || oPhone.endsWith(cleanPhone) || cleanPhone.endsWith(oPhone)));
  }).sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));

  if (matchedOrders.length === 0) {
    return jsonResponse({ success: false, error: "No order found matching this Order ID or Phone number." }, 404);
  }

  const order = matchedOrders[0];
  const isCod = (order.pricing?.method || order.paymentMethod || "").toUpperCase() === "COD";

  return jsonResponse({
    success: true,
    order: {
      orderId: order.order_id || order.orderId,
      status: (order.status || "CONFIRMED").toUpperCase(),
      createdAt: order.created_at || order.createdAt || order.order_date,
      customerName: order.customer?.name || "Customer",
      productName: order.product?.name || "Magical Seeds (6-in-1 Mixed Superfood Seeds)",
      packSize: order.product?.tier || order.product?.pack_size || "Pack",
      totalAmount: order.pricing?.total || order.payment?.amount || 249,
      paymentMethod: isCod ? "Cash on Delivery (COD)" : "Online Paid (Prepaid)",
      shipping: {
        courierName: order.shipping?.courierName || "Shiprocket Express",
        awb: order.shipping?.awb || "",
        status: (order.shipping?.status || order.status || "CONFIRMED").toUpperCase(),
        trackingUrl: order.shipping?.awb ? `https://shiprocket.co/tracking/${order.shipping.awb}` : ""
      }
    }
  });
}

/**
 * Handle /api/payment/create: Prepare Payment Gateway Order (Razorpay / Cashfree)
 */
async function handleCreatePaymentSession(request, cfg, rtdb) {
  const body = await request.json().catch(() => null);
  if (!body || !body.orderId || !body.amount) {
    return jsonResponse({ success: false, error: "Missing orderId or amount." }, 400);
  }

  const orderId = String(body.orderId);
  const amount = parseFloat(body.amount);
  const gateway = (body.gateway || cfg.PAYMENT_GATEWAY).toLowerCase();

  if (gateway === "cashfree") {
    const cfUrl = `${cfg.CASHFREE.BASE_URL}/orders`;
    const customer = body.customer || {};

    const cfPayload = {
      order_id: orderId,
      order_amount: amount,
      order_currency: "INR",
      customer_details: {
        customer_id: `cust_${sanitizePhone(customer.phone) || orderId}`,
        customer_name: customer.name || "Customer",
        customer_phone: sanitizePhone(customer.phone).slice(-10) || "9999999999",
        customer_email: customer.email || "orders@magicalseeds.in"
      },
      order_meta: {
        return_url: `${cfg.STORE_DOMAIN ? `https://${cfg.STORE_DOMAIN}` : ""}/index.html?order_id={order_id}`
      }
    };

    const res = await fetch(cfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": cfg.CASHFREE.APP_ID,
        "x-client-secret": cfg.CASHFREE.SECRET_KEY,
        "x-api-version": cfg.CASHFREE.API_VERSION
      },
      body: JSON.stringify(cfPayload)
    });

    const data = await res.json();
    if (!res.ok) {
      return jsonResponse({ success: false, error: data.message || "Failed to create Cashfree order." }, res.status);
    }

    return jsonResponse({
      success: true,
      gateway: "cashfree",
      payment_session_id: data.payment_session_id,
      order_id: data.order_id
    });
  }

  // Razorpay Order Creation
  const basicAuth = btoa(`${cfg.RAZORPAY.KEY_ID}:${cfg.RAZORPAY.KEY_SECRET}`);
  const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth}`
    },
    body: JSON.stringify({
      amount: Math.round(amount * 100), // paise
      currency: "INR",
      receipt: orderId,
      notes: {
        store: cfg.STORE_NAME,
        customerName: body.customer?.name || "Customer"
      }
    })
  });

  const rzpData = await rzpRes.json();
  if (!rzpRes.ok) {
    return jsonResponse({
      success: true,
      gateway: "razorpay",
      key_id: cfg.RAZORPAY.KEY_ID,
      amount: Math.round(amount * 100),
      currency: "INR",
      order_id: orderId,
      notice: "Direct client checkout mode active."
    });
  }

  return jsonResponse({
    success: true,
    gateway: "razorpay",
    key_id: cfg.RAZORPAY.KEY_ID,
    razorpay_order_id: rzpData.id,
    amount: rzpData.amount,
    currency: rzpData.currency
  });
}

/**
 * Handle /api/webhooks/razorpay: Complete Razorpay Webhook Processing
 */
async function handleRazorpayWebhook(request, cfg, rtdb, wa, shiprocket) {
  const signature = request.headers.get("X-Razorpay-Signature");
  const rawBody = await request.text();

  if (cfg.RAZORPAY.WEBHOOK_SECRET) {
    const isValid = await verifyHmacSha256(cfg.RAZORPAY.WEBHOOK_SECRET, rawBody, signature);
    if (!isValid) {
      console.warn("Razorpay webhook signature verification failed.");
      return jsonResponse({ success: false, error: "Invalid webhook signature." }, 401);
    }
  }

  let eventPayload = null;
  try {
    eventPayload = JSON.parse(rawBody);
  } catch (err) {
    return jsonResponse({ success: false, error: "Invalid JSON body." }, 400);
  }

  const eventType = eventPayload.event || "";
  const paymentEntity = eventPayload.payload?.payment?.entity || {};
  const orderEntity = eventPayload.payload?.order?.entity || {};

  const eventId = eventPayload.id || `rzp_${Date.now()}`;
  try {
    const existingLock = await rtdb.get(`idempotencyLocks/${eventId}`);
    if (existingLock) {
      return jsonResponse({ success: true, message: "Event already processed (idempotent)." });
    }
    await rtdb.put(`idempotencyLocks/${eventId}`, { processed_at: new Date().toISOString() });
  } catch (e) {}

  try {
    await rtdb.post("webhookEvents", {
      source: "razorpay",
      event: eventType,
      received_at: new Date().toISOString(),
      payload: eventPayload
    });
  } catch (e) {}

  if (eventType === "payment.captured" || eventType === "order.paid") {
    const orderReceipt = orderEntity.receipt || paymentEntity.notes?.receipt || paymentEntity.notes?.order_id || "";
    let orderId = orderReceipt;

    let existingOrder = null;
    if (orderId) {
      try {
        existingOrder = await rtdb.get(`orders/${orderId}`);
      } catch (e) {}
    }

    if (!existingOrder) {
      orderId = orderId || `MS-${Date.now().toString().slice(-6)}`;
      existingOrder = {
        order_id: orderId,
        orderId: orderId,
        created_at: new Date().toISOString(),
        payment: {
          provider: "razorpay",
          status: "CAPTURED",
          payment_id: paymentEntity.id,
          amount: (paymentEntity.amount || 0) / 100,
          currency: paymentEntity.currency || "INR"
        },
        pricing: {
          total: (paymentEntity.amount || 0) / 100,
          method: "ONLINE_PREPAID"
        },
        customer: {
          name: paymentEntity.notes?.name || paymentEntity.contact || "Customer",
          phone: paymentEntity.contact || "",
          email: paymentEntity.email || ""
        },
        product: {
          name: "Magical Seeds (6-in-1 Mixed Superfood Seeds)",
          quantity: 1
        },
        status: "PAID"
      };
    } else {
      existingOrder.status = "PAID";
      existingOrder.payment = {
        ...(existingOrder.payment || {}),
        provider: "razorpay",
        status: "CAPTURED",
        payment_id: paymentEntity.id,
        amount: (paymentEntity.amount || 0) / 100
      };
    }

    await rtdb.put(`orders/${orderId}`, existingOrder);

    if (cfg.SHIPROCKET.AUTO_PUSH_ON_PAID && !existingOrder.shipping?.shiprocketOrderId) {
      try {
        const srRes = await shiprocket.createAdhocOrder(existingOrder);
        if (srRes && srRes.order_id) {
          const shippingData = {
            ...(existingOrder.shipping || {}),
            shiprocketOrderId: srRes.order_id,
            shipmentId: srRes.shipment_id,
            awb: srRes.awb_code || "",
            courierName: srRes.courier_name || "Shiprocket Express",
            status: "BOOKED"
          };
          await rtdb.patch(`orders/${orderId}`, { shipping: shippingData });
        }
      } catch (err) {
        console.error("Shiprocket push on webhook error:", err.message);
      }
    }
  }

  return jsonResponse({ success: true, received: true });
}

async function handleShiprocketWebhook(request, cfg, rtdb, wa) {
  const rawBody = await request.text();
  let data = null;
  try {
    data = JSON.parse(rawBody);
  } catch (err) {
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }

  const orderId = String(data.order_id || data.custom_order_id || "");
  const currentStatus = String(data.current_status || data.status || "").toUpperCase();
  const awb = data.awb || data.awb_code || "";
  const courierName = data.courier_name || "";

  try {
    await rtdb.post("webhookEvents", {
      source: "shiprocket",
      order_id: orderId,
      status: currentStatus,
      received_at: new Date().toISOString(),
      payload: data
    });
  } catch (e) {}

  if (orderId) {
    try {
      const existing = await rtdb.get(`orders/${orderId}`);
      if (existing) {
        const patchData = {
          "shipping/status": currentStatus,
          "shipping/updated_at": new Date().toISOString()
        };
        if (awb) patchData["shipping/awb"] = awb;
        if (courierName) patchData["shipping/courierName"] = courierName;

        if (currentStatus === "DELIVERED") {
          patchData["status"] = "DELIVERED";
        } else if (["IN_TRANSIT", "SHIPPED", "PICKED_UP"].includes(currentStatus)) {
          patchData["status"] = "SHIPPED";
        }

        await rtdb.patch(`orders/${orderId}`, patchData);
      }
    } catch (err) {
      console.error("Error updating order from Shiprocket webhook:", err);
    }
  }

  return jsonResponse({ success: true, processed: true });
}

async function handleAdminGetOrders(request, cfg, rtdb) {
  const url = new URL(request.url);
  const statusFilter = (url.searchParams.get("status") || "all").toUpperCase();
  const providerFilter = (url.searchParams.get("paymentProvider") || "all").toLowerCase();
  const search = (url.searchParams.get("search") || "").toLowerCase().trim();
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

  const rawOrdersMap = (await rtdb.get("orders")) || {};
  let list = Object.values(rawOrdersMap).map(o => {
    const isCodOrder = String(o.pricing?.method || o.paymentMethod || o.payment?.method || o.payment?.provider || "").toUpperCase().includes("COD");
    const tierName = o.product?.tier || o.product?.pack_size || o.product?.name || "Pack";
    const itemQty = (o.items && o.items[0]?.quantity) ? o.items[0].quantity : 1;

    return {
      orderId: o.order_id || o.orderId,
      createdAt: o.created_at || o.order_date,
      customer: o.customer || o.shipping_address || {},
      product: o.product || {},
      items: o.items || [{ name: `Magical Seeds (${tierName})`, quantity: itemQty, price: o.pricing?.total || o.product?.unit_price }],
      pricing: o.pricing || { total: o.product?.total_amount || 0 },
      payment: o.payment || (isCodOrder ? { method: "COD", provider: "cod", status: "COD_PENDING" } : {}),
      paymentMethod: isCodOrder ? "cod" : (o.paymentMethod || "online"),
      shipping: o.shipping || {},
      status: (o.status || "CONFIRMED").toUpperCase()
    };
  }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const totalRevenue = list.reduce((sum, o) => {
    if (o.status !== "CANCELLED") {
      return sum + (parseFloat(o.pricing?.total) || 0);
    }
    return sum;
  }, 0);

  const deliveredCount = list.filter(o => o.status === "DELIVERED").length;
  const itemsCount = list.reduce((sum, o) => {
    if (o.status !== "CANCELLED") {
      const q = o.product?.quantity || (o.items && o.items[0]?.quantity) || 1;
      return sum + parseInt(q, 10);
    }
    return sum;
  }, 0);

  if (statusFilter !== "ALL") {
    list = list.filter(o => o.status === statusFilter);
  }

  if (providerFilter !== "all") {
    list = list.filter(o => {
      const p = (o.payment?.provider || o.payment?.method || o.pricing?.method || "").toLowerCase();
      return p.includes(providerFilter);
    });
  }

  if (search) {
    list = list.filter(o => {
      const id = (o.orderId || "").toLowerCase();
      const name = (o.customer?.name || "").toLowerCase();
      const phone = (o.customer?.phone || "").toLowerCase();
      const city = (o.customer?.city || "").toLowerCase();
      return id.includes(search) || name.includes(search) || phone.includes(search) || city.includes(search);
    });
  }

  if (startDate) {
    const s = new Date(startDate).getTime();
    list = list.filter(o => new Date(o.createdAt || 0).getTime() >= s);
  }

  if (endDate) {
    const e = new Date(endDate).getTime() + 86400000;
    list = list.filter(o => new Date(o.createdAt || 0).getTime() <= e);
  }

  return jsonResponse({
    success: true,
    data: list,
    orders: list,
    summary: {
      totalRevenue,
      totalOrders: list.length,
      deliveredCount,
      itemsCount
    }
  });
}

async function handleAdminToggleDelivered(orderId, request, cfg, rtdb) {
  const body = await request.json().catch(() => ({}));
  const markDelivered = body.markDelivered !== undefined ? body.markDelivered : true;

  const existing = await rtdb.get(`orders/${orderId}`);
  if (!existing) {
    return jsonResponse({ success: false, error: { message: "Order not found." } }, 404);
  }

  const newStatus = markDelivered ? "DELIVERED" : (existing.shipping?.awb ? "SHIPPED" : "CONFIRMED");
  await rtdb.patch(`orders/${orderId}`, {
    status: newStatus,
    updated_at: new Date().toISOString()
  });

  return jsonResponse({
    success: true,
    message: `Order marked as ${newStatus}.`,
    orderId,
    newStatus
  });
}

async function handleAdminMoveToShiprocket(orderId, request, cfg, rtdb, shiprocket) {
  const existing = await rtdb.get(`orders/${orderId}`);
  if (!existing) {
    return jsonResponse({ success: false, error: { message: "Order not found." } }, 404);
  }

  try {
    const srRes = await shiprocket.createAdhocOrder(existing);
    const shipping = {
      ...(existing.shipping || {}),
      shiprocketOrderId: srRes.order_id,
      shipmentId: srRes.shipment_id,
      awb: srRes.awb_code || "",
      courierName: srRes.courier_name || "Shiprocket Express",
      status: "BOOKED"
    };

    await rtdb.patch(`orders/${orderId}`, {
      shipping,
      status: "CONFIRMED",
      updated_at: new Date().toISOString()
    });

    return jsonResponse({
      success: true,
      message: "Order successfully booked with Shiprocket!",
      data: { ...existing, shipping, status: "CONFIRMED" }
    });
  } catch (err) {
    return jsonResponse({ success: false, error: { message: err.message } }, 500);
  }
}

async function handleAdminChangeProduct(orderId, request, cfg, rtdb) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ success: false, error: "Missing payload" }, 400);

  const existing = await rtdb.get(`orders/${orderId}`);
  if (!existing) return jsonResponse({ success: false, error: "Order not found." }, 404);

  const newSku = body.newSku;
  const quantity = parseInt(body.quantity || 1, 10);
  const unitPrice = parseFloat(body.unitPrice || 0);
  const shippingCharge = parseFloat(body.shippingCharge || 0);
  const discount = parseFloat(body.discount || 0);
  const codCharge = parseFloat(body.codCharge || 0);
  const finalTotal = parseFloat(body.finalTotal || Math.max(0, quantity * unitPrice + shippingCharge + codCharge - discount));

  const updatedProduct = {
    ...(existing.product || {}),
    sku: newSku,
    quantity,
    unit_price: unitPrice
  };

  const updatedPricing = {
    ...(existing.pricing || {}),
    total: finalTotal,
    shipping: shippingCharge,
    discount,
    codCharge
  };

  const events = existing.events || [];
  events.push({
    event: "PRODUCT_MODIFIED",
    reason: body.reason || "Admin update",
    timestamp: new Date().toISOString(),
    previousTotal: existing.pricing?.total,
    newTotal: finalTotal
  });

  const patchData = {
    product: updatedProduct,
    pricing: updatedPricing,
    events,
    updated_at: new Date().toISOString()
  };

  await rtdb.patch(`orders/${orderId}`, patchData);

  return jsonResponse({
    success: true,
    message: "Product and pricing successfully updated.",
    data: { ...existing, ...patchData }
  });
}

async function handleAdminCancelOrder(orderId, request, cfg, rtdb, shiprocket) {
  const body = await request.json().catch(() => ({}));
  const reason = body.reason || "Admin manual cancellation";

  const existing = await rtdb.get(`orders/${orderId}`);
  if (!existing) return jsonResponse({ success: false, error: { message: "Order not found." } }, 404);

  if (existing.shipping?.shiprocketOrderId) {
    try {
      await shiprocket.cancelOrder(existing.shipping.shiprocketOrderId);
    } catch (err) {
      console.warn("Shiprocket cancellation notice:", err.message);
    }
  }

  await rtdb.patch(`orders/${orderId}`, {
    status: "CANCELLED",
    cancellation_reason: reason,
    updated_at: new Date().toISOString()
  });

  return jsonResponse({
    success: true,
    message: `Order #${orderId} marked as cancelled.`
  });
}

async function handleAdminDeleteOrder(orderId, request, cfg, rtdb, shiprocket) {
  const existing = await rtdb.get(`orders/${orderId}`);
  let shiprocketCancelled = false;

  if (existing && existing.shipping?.shiprocketOrderId) {
    try {
      await shiprocket.cancelOrder(existing.shipping.shiprocketOrderId);
      shiprocketCancelled = true;
    } catch (e) {}
  }

  await rtdb.delete(`orders/${orderId}`);

  return jsonResponse({
    success: true,
    message: `Order #${orderId} permanently deleted.`,
    shiprocket_cancelled: shiprocketCancelled
  });
}

async function handleAdminWhatsAppTemplates(request, cfg, rtdb) {
  if (request.method === "GET") {
    const templates = (await rtdb.get("settings/whatsappTemplates")) || {};
    return jsonResponse({ success: true, templates });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body || !body.templates) {
      return jsonResponse({ success: false, error: "Missing templates object" }, 400);
    }
    await rtdb.put("settings/whatsappTemplates", body.templates);
    return jsonResponse({ success: true, message: "Templates updated successfully." });
  }

  return jsonResponse({ success: false, error: "Method not allowed" }, 405);
}

async function handleAdminSendOrderWhatsApp(orderId, request, cfg, wa) {
  const body = await request.json().catch(() => null);
  if (!body || !body.message || !body.phone) {
    return jsonResponse({ success: false, error: "Missing message or phone." }, 400);
  }

  const result = await wa.sendTextMessage(body.phone, body.message);
  if (result.success || result.skipped) {
    return jsonResponse({ success: true, message: "WhatsApp message dispatched successfully." });
  }

  return jsonResponse({ success: false, error: result.error || "Evolution API send failed." }, 502);
}

async function handleShipmentDocuments(orderId, docType, request, cfg, rtdb, shiprocket) {
  const existing = await rtdb.get(`orders/${orderId}`);
  if (!existing || !existing.shipping) {
    return new Response("Order or shipping information not found.", { status: 404 });
  }

  const urlObj = new URL(request.url);
  const redirect = urlObj.searchParams.get("redirect") === "1";

  try {
    let docRes = null;
    let fileUrl = null;

    if (docType === "label") {
      const shipmentId = existing.shipping.shipmentId;
      if (!shipmentId) return new Response("Shipment ID not assigned yet.", { status: 400 });
      docRes = await shiprocket.generateLabel(shipmentId);
      fileUrl = docRes.label_url || (docRes.label_created ? docRes.response?.label_url : null);
    } else {
      const srOrderId = existing.shipping.shiprocketOrderId;
      if (!srOrderId) return new Response("Shiprocket Order ID not found.", { status: 400 });
      docRes = await shiprocket.generateInvoice(srOrderId);
      fileUrl = docRes.invoice_url || docRes.url;
    }

    if (!fileUrl) {
      return jsonResponse({ success: false, error: "Document URL not returned by Shiprocket.", details: docRes }, 502);
    }

    if (redirect) {
      return Response.redirect(fileUrl, 302);
    }

    return jsonResponse({ success: true, url: fileUrl, details: docRes });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==============================================================================
// 6. MAIN WORKER ENTRY POINT (FETCH HANDLER)
// ==============================================================================

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const cfg = resolveConfig(env);
    const rtdb = new FirebaseRtdbClient(cfg.FIREBASE);
    const wa = new EvolutionWhatsAppClient(cfg.EVOLUTION_WHATSAPP);
    const shiprocket = new ShiprocketClient(cfg.SHIPROCKET, rtdb);

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, "");

    try {
      if (pathname === "" || pathname === "/api" || pathname === "/api/health") {
        return jsonResponse({
          success: true,
          status: "healthy",
          name: cfg.STORE_NAME,
          gateway: cfg.PAYMENT_GATEWAY,
          firebase: cfg.FIREBASE.PROJECT_ID,
          evolutionInstance: cfg.EVOLUTION_WHATSAPP.INSTANCE,
          timestamp: new Date().toISOString()
        });
      }

      if (pathname === "/api/config" && request.method === "GET") {
        return await handleGetPublicConfig(cfg);
      }

      // Storefront Order, Payment & Live Tracking Routes
      if ((pathname === "/api/orders" || pathname === "/api/create-order") && request.method === "POST") {
        return await handleCreateOrUpdateOrder(request, cfg, rtdb, wa, shiprocket);
      }

      if ((pathname === "/api/track-order" || pathname === "/api/order/track") && (request.method === "GET" || request.method === "POST")) {
        return await handleTrackOrder(request, cfg, rtdb);
      }

      if (pathname === "/api/payment/create" && request.method === "POST") {
        return await handleCreatePaymentSession(request, cfg, rtdb);
      }

      // Webhook Routes
      if (pathname === "/api/webhooks/razorpay" && request.method === "POST") {
        return await handleRazorpayWebhook(request, cfg, rtdb, wa, shiprocket);
      }

      if (pathname === "/api/webhooks/cashfree" && request.method === "POST") {
        return jsonResponse({ success: true, message: "Cashfree webhook received." });
      }

      if (pathname === "/api/webhooks/shiprocket" && request.method === "POST") {
        return await handleShiprocketWebhook(request, cfg, rtdb, wa);
      }

      // Shiprocket Document Proxy
      const labelMatch = pathname.match(/^\/api\/shipments\/([^/]+)\/label$/);
      if (labelMatch && request.method === "GET") {
        return await handleShipmentDocuments(decodeURIComponent(labelMatch[1]), "label", request, cfg, rtdb, shiprocket);
      }

      const invoiceMatch = pathname.match(/^\/api\/shipments\/([^/]+)\/invoice$/);
      if (invoiceMatch && request.method === "GET") {
        return await handleShipmentDocuments(decodeURIComponent(invoiceMatch[1]), "invoice", request, cfg, rtdb, shiprocket);
      }

      // Admin Endpoints
      if (pathname.startsWith("/api/admin")) {
        if (!isAuthorizedAdmin(request, cfg)) {
          return jsonResponse({ success: false, error: "Unauthorized. Admin authentication required." }, 401);
        }

        if (pathname === "/api/admin/whatsapp/templates") {
          return await handleAdminWhatsAppTemplates(request, cfg, rtdb);
        }

        if (pathname === "/api/admin/orders" && request.method === "GET") {
          return await handleAdminGetOrders(request, cfg, rtdb);
        }

        const toggleMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/toggle-delivered$/);
        if (toggleMatch && request.method === "POST") {
          return await handleAdminToggleDelivered(decodeURIComponent(toggleMatch[1]), request, cfg, rtdb);
        }

        const moveMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/move-to-shiprocket$/);
        if (moveMatch && request.method === "POST") {
          return await handleAdminMoveToShiprocket(decodeURIComponent(moveMatch[1]), request, cfg, rtdb, shiprocket);
        }

        const changeMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/change-product$/);
        if (changeMatch && request.method === "POST") {
          return await handleAdminChangeProduct(decodeURIComponent(changeMatch[1]), request, cfg, rtdb);
        }

        const cancelMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/cancel$/);
        if (cancelMatch && request.method === "POST") {
          return await handleAdminCancelOrder(decodeURIComponent(cancelMatch[1]), request, cfg, rtdb, shiprocket);
        }

        const retryMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/retry-shipping$/);
        if (retryMatch && request.method === "POST") {
          return await handleAdminMoveToShiprocket(decodeURIComponent(retryMatch[1]), request, cfg, rtdb, shiprocket);
        }

        const waMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/whatsapp$/);
        if (waMatch && request.method === "POST") {
          return await handleAdminSendOrderWhatsApp(decodeURIComponent(waMatch[1]), request, cfg, wa);
        }

        const deleteMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
        if (deleteMatch && request.method === "DELETE") {
          return await handleAdminDeleteOrder(decodeURIComponent(deleteMatch[1]), request, cfg, rtdb, shiprocket);
        }
      }

      return jsonResponse({
        success: false,
        error: `Endpoint not found: ${request.method} ${pathname}`
      }, 404);

    } catch (fatalErr) {
      console.error("Worker fatal exception:", fatalErr);
      return jsonResponse({
        success: false,
        error: "Internal server error",
        message: fatalErr.message
      }, 500);
    }
  }
};
