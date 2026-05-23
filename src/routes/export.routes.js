const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { auth } = require("../middleware/auth");
const { leadsToCsv, leadsToJson } = require("../services/export.service");

const router = express.Router();

router.post("/", auth, async (req, res, next) => {
  try {
    const data = z.object({
      format: z.enum(["csv", "json"]),
      mode: z.enum(["all", "selected", "filtered"]).default("all"),
      ids: z.array(z.string()).optional(),
      city: z.string().optional(),
      niche: z.string().optional()
    }).parse(req.body);

    const where = { userId: req.user.userId };
    if (data.mode === "selected") where.id = { in: data.ids || [] };
    if (data.mode === "filtered") {
      if (data.city) where.city = { contains: data.city, mode: "insensitive" };
      if (data.niche) where.niche = { contains: data.niche, mode: "insensitive" };
    }

    const leads = await prisma.lead.findMany({ where, orderBy: { createdAt: "desc" } });
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `leadfinder-${data.mode}-${stamp}.${data.format}`;

    if (data.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(leadsToCsv(leads));
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(leadsToJson(leads));
  } catch (error) { next(error); }
});

module.exports = router;
