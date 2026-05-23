const express = require("express");
const prisma = require("../lib/prisma");
const { auth, ownerOnly } = require("../middleware/auth");
const router = express.Router();

router.get("/users", auth, ownerOnly, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, plan: true, aiCredits: true, scanCredits: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    });
    res.json({ users });
  } catch (error) { next(error); }
});

router.get("/analytics", auth, ownerOnly, async (req, res, next) => {
  try {
    const [users, leads, searches] = await Promise.all([
      prisma.user.count(),
      prisma.lead.count(),
      prisma.search.count()
    ]);
    res.json({ users, leads, searches, mrr: 0, status: "demo-analytics" });
  } catch (error) { next(error); }
});

module.exports = router;
