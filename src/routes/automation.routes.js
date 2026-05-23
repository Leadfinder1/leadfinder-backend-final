const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { auth } = require("../middleware/auth");

const router = express.Router();

router.post("/", auth, async (req, res, next) => {
  try {
    const data = z.object({
      name: z.string().min(2),
      niche: z.string().min(2),
      cities: z.array(z.string()).min(1),
      schedule: z.string().default("daily")
    }).parse(req.body);

    const automation = await prisma.automation.create({ data: { userId: req.user.userId, ...data } });
    res.json({ automation });
  } catch (error) { next(error); }
});

router.get("/", auth, async (req, res, next) => {
  try {
    const automations = await prisma.automation.findMany({ where: { userId: req.user.userId }, orderBy: { createdAt: "desc" } });
    res.json({ automations });
  } catch (error) { next(error); }
});

router.patch("/:id/toggle", auth, async (req, res, next) => {
  try {
    const automation = await prisma.automation.findFirst({ where: { id: req.params.id, userId: req.user.userId } });
    if (!automation) return res.status(404).json({ error: "Automation non trovata" });
    const nextStatus = automation.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const updated = await prisma.automation.update({ where: { id: automation.id }, data: { status: nextStatus } });
    res.json({ automation: updated });
  } catch (error) { next(error); }
});

module.exports = router;
