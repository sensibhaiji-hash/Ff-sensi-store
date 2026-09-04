require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ordersFile = path.join(__dirname, "data", "orders.json");

const PLANS = {
  headshot: { name: "Headshot Sensi", amount: 7900 },
  brazilian: { name: "Brazilian Sensi", amount: 8900 },
  player: { name: "YouTuber / Player Sensi", amount: 9900 },
  custom: { name: "Custom Sensi", amount: 12900 },
  premium: { name: "Premium Sensi Pack", amount: 15900 }
};

function loadOrders() {
  try { return JSON.parse(fs.readFileSync(ordersFile, "utf8")); }
  catch { return {}; }
}
function saveOrders(orders) {
  fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
}
function safeEqualHex(a, b) {
  try {
    const x = Buffer.from(a || "", "utf8");
    const y = Buffer.from(b || "", "utf8");
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  } catch { return false; }
}

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env before using live/test checkout.");
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "missing",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "missing"
});

// Webhook MUST receive the raw request body for signature verification.
app.post("/api/razorpay-webhook", express.raw({type:"application/json"}), (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET || "")
    .update(req.body)
    .digest("hex");

  if (!safeEqualHex(signature, expected)) return res.status(400).send("Invalid signature");

  let event;
  try { event = JSON.parse(req.body.toString("utf8")); }
  catch { return res.status(400).send("Invalid JSON"); }

  const orders = loadOrders();
  const entity = event.payload?.payment?.entity || event.payload?.order?.entity;
  const orderId = entity?.order_id || entity?.id;

  if (orderId && (event.event === "payment.captured" || event.event === "order.paid")) {
    if (orders[orderId]) {
      orders[orderId].status = "paid";
      orders[orderId].paidAt = new Date().toISOString();
      orders[orderId].event = event.event;
      orders[orderId].paymentId = event.payload?.payment?.entity?.id || orders[orderId].paymentId || null;
      saveOrders(orders);
    }
  }

  if (orderId && event.event === "payment.failed" && orders[orderId]) {
    orders[orderId].status = "failed";
    saveOrders(orders);
  }

  res.json({received:true});
});

app.use(express.json({limit:"100kb"}));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/create-order", async (req, res) => {
  try {
    const {plan, name, email, phone, playerName} = req.body;
    const selected = PLANS[plan];
    if (!selected) return res.status(400).json({error:"Invalid plan."});
    if (!name || !email || !phone) return res.status(400).json({error:"Name, email and phone are required."});

    const order = await razorpay.orders.create({
      amount: selected.amount,
      currency: "INR",
      receipt: "ff_" + Date.now(),
      notes: {plan, playerName: playerName || ""}
    });

    const orders = loadOrders();
    orders[order.id] = {
      orderId: order.id,
      plan,
      planName: selected.name,
      amount: selected.amount,
      customer: {name, email, phone},
      playerName: playerName || "",
      status: "created",
      createdAt: new Date().toISOString()
    };
    saveOrders(orders);

    res.json({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: selected.amount,
      planName: selected.name
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({error:"Unable to create payment order."});
  }
});

app.post("/api/verify-payment", (req, res) => {
  const {razorpay_order_id, razorpay_payment_id, razorpay_signature} = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    return res.status(400).json({verified:false,error:"Missing payment fields."});

  const generated = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  if (!safeEqualHex(generated, razorpay_signature))
    return res.status(400).json({verified:false,error:"Invalid signature."});

  const orders = loadOrders();
  if (!orders[razorpay_order_id])
    return res.status(404).json({verified:false,error:"Order not found."});

  orders[razorpay_order_id].paymentId = razorpay_payment_id;
  orders[razorpay_order_id].status = "payment_verified";
  orders[razorpay_order_id].verifiedAt = new Date().toISOString();
  saveOrders(orders);

  res.json({verified:true});
});

app.get("/api/order/:orderId", (req, res) => {
  const orders = loadOrders();
  const order = orders[req.params.orderId];
  if (!order) return res.status(404).json({error:"Order not found."});
  // Don't expose customer details.
  res.json({orderId:order.orderId, planName:order.planName, status:order.status, paidAt:order.paidAt || null});
});

app.listen(PORT, () => console.log(`FF Sensi Store running on http://localhost:${PORT}`));
