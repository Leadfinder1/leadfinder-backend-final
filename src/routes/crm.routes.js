const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { auth } = require("../middleware/auth");

const router = express.Router();

router.get("/pipeline", auth, async (req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({ where: { userId: req.user.userId }, include: { notes: true }, orderBy: { updatedAt: "desc" } });
    const stages = ["NEW", "ENRICHED", "CONTACTED", "INTERESTED", "MEETING", "CLOSED", "LOST"];
    const pipeline = Object.fromEntries(stages.map(stage => [stage, leads.filter(l => l.stage === stage)]));
    res.json({ pipeline });
  } catch (error) { next(error); }
});

router.patch("/leads/:id/stage", auth, async (req, res, next) => {
  try {
    const data = z.object({ stage: z.enum(["NEW","ENRICHED","CONTACTED","INTERESTED","MEETING","CLOSED","LOST"]) }).parse(req.body);
    const lead = await prisma.lead.updateMany({ where: { id: req.params.id, userId: req.user.userId }, data: { stage: data.stage } });
    res.json({ ok: true, updated: lead.count });
  } catch (error) { next(error); }
});

router.post("/leads/:id/notes", auth, async (req, res, next) => {
  try {
    const data = z.object({ content: z.string().min(1) }).parse(req.body);
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, userId: req.user.userId } });
    if (!lead) return res.status(404).json({ error: "Lead non trovato" });
    const note = await prisma.note.create({ data: { userId: req.user.userId, leadId: lead.id, content: data.content } });
    res.json({ note });
  } catch (error) { next(error); }
});

module.exports = router;
