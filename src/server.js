const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth.routes");
const leadRoutes = require("./routes/lead.routes");
const exportRoutes = require("./routes/export.routes");
const outreachRoutes = require("./routes/outreach.routes");
const crmRoutes = require("./routes/crm.routes");
const automationRoutes = require("./routes/automation.routes");
const billingRoutes = require("./routes/billing.routes");
const referralRoutes = require("./routes/referral.routes");
const ownerRoutes = require("./routes/owner.routes");

const app = express();

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));
app.use(cors({ origin: "*", credentials: true }));
app.use(compression());
app.use(morgan("combined"));
app.use(express.json({ limit: "2mb" }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 180 }));

app.get("/health", (_, res) => res.json({ status: "online", version: "mega-platform-v2" }));
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/outreach", outreachRoutes);
app.use("/api/crm", crmRoutes);
app.use("/api/automations", automationRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/owner", ownerRoutes);

app.use((err, req, res, next) => {
  console.error("UNHANDLED_ERROR", err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`LeadFinder AI Mega Platform online on ${port}`));
