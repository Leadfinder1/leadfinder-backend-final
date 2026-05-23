const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { signToken, hashPassword, verifyPassword, referralCode } = require("../lib/security");

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
  fullName: z.string().optional(),
  referral: z.string().optional()
});

router.post("/register", async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) return res.status(409).json({ error: "Email già registrata" });

    const role = data.email === (process.env.OWNER_EMAIL || "").toLowerCase() ? "OWNER" : "USER";
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: await hashPassword(data.password),
        fullName: data.fullName || null,
        role,
        referralCode: referralCode(data.email),
        referredBy: data.referral || null
      },
      select: { id: true, email: true, fullName: true, role: true, plan: true, aiCredits: true, scanCredits: true, referralCode: true }
    });

    if (data.referral) {
      await prisma.referral.create({ data: { referrerId: user.id, email: data.email, status: "SIGNED_UP", reward: 5 } }).catch(() => {});
    }

    res.json({ token: signToken(user), user });
  } catch (error) { next(error); }
});

router.post("/login", async (req, res, next) => {
  try {
    const data = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !(await verifyPassword(data.password, user.password))) return res.status(401).json({ error: "Login non valido" });

    res.json({
      token: signToken(user),
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, plan: user.plan, aiCredits: user.aiCredits, scanCredits: user.scanCredits, referralCode: user.referralCode }
    });
  } catch (error) { next(error); }
});

module.exports = router;
