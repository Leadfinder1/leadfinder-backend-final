const express = require("express");
const { auth } = require("../middleware/auth");
const router = express.Router();

const PLANS = {
  FREE: { scans: 10, exports: 3, aiCredits: 25, cities: 1 },
  PRO: { scans: 500, exports: 200, aiCredits: 1000, cities: 50 },
  AGENCY: { scans: 5000, exports: 2000, aiCredits: 10000, cities: 500 }
};

router.get("/plans", auth, (req, res) => res.json({ plans: PLANS }));

router.post("/checkout", auth, async (req, res) => {
  // Production Stripe checkout can be connected with STRIPE_SECRET_KEY and price IDs.
  res.json({ url: process.env.STRIPE_CHECKOUT_URL || "https://stripe.com", mode: "demo" });
});

module.exports = router;
