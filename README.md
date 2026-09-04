# FF Sensi Store — Automatic Payment Checkout

## What this structure does
- Customer chooses a plan on the existing storefront.
- The server creates a Razorpay Order.
- Razorpay Checkout opens on the site.
- The server verifies the returned payment signature.
- Razorpay webhooks (`payment.captured`, `order.paid`, `payment.failed`) update order status automatically.
- Customer details are not exposed through the public order-status endpoint.

## Setup
1. Use an adult/guardian-owned payment-gateway account where required.
2. Create a Razorpay account and obtain test/live API credentials.
3. Copy `.env.example` to `.env` and fill the values. NEVER put the secret in frontend JavaScript.
4. Install Node.js, then run:
   `npm install`
5. Start:
   `npm start`
6. Deploy the server to HTTPS hosting.
7. In the Razorpay Dashboard, configure a webhook to:
   `https://YOUR-DOMAIN.example/api/razorpay-webhook`
8. Set the same webhook secret in `.env`.
9. Enable at least `payment.captured`, `payment.failed`, and `order.paid`.
10. Test in Razorpay test mode before going live.

## Important
The browser success callback is not enough to trust a payment. The server verifies the signature, and the webhook is used for server-to-server status updates. Fulfil the order only after the server confirms the payment is captured/paid.

For production, replace `data/orders.json` with a real database and add an authenticated admin dashboard.
