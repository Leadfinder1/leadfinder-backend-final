const express = require("express");
const { auth } = require("../middleware/auth");
const prisma = require("../lib/prisma");
const router = express.Router();

router.get("/", auth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { referralCode: true } });
    const referrals = await prisma.referral.findMany({ where: { referrerId: req.user.userId }, orderBy: { createdAt: "desc" } });
    res.json({ referralCode: user.referralCode, referralUrl: `https://leadfinder.ai/r/${user.referralCode}`, referrals });
  } catch (error) { next(error); }
});

module.exports = router;
