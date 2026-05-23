const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { auth } = require("../middleware/auth");
const { generateOutreach } = require("../services/outreach.service");

const router = express.Router();

router.post("/generate", auth, async (req, res, next) => {
  try {
    const data = z.object({
      leadId: z.string(),
      channel: z.enum(["email", "whatsapp", "instagram", "linkedin"]).default("email"),
      tone: z.enum(["friendly", "professional", "direct", "aggressive"]).default("professional"),
      length: z.enum(["short", "medium", "long"]).default("medium"),
      language: z.string().default("it")
    }).parse(req.body);

    const lead = await prisma.lead.findFirst({ where: { id: data.leadId, userId: req.user.userId } });
    if (!lead) return res.status(404).json({ error: "Lead non trovato" });

    const generated = await generateOutreach({ lead, ...data });
    const message = await prisma.outreachMessage.create({
      data: {
        leadId: lead.id,
        channel: data.channel,
        tone: data.tone,
        language: data.language,
        subject: generated.subject,
        body: JSON.stringify(generated, null, 2)
      }
    });

    res.json({ message, generated });
  } catch (error) { next(error); }
});

router.get("/:leadId", auth, async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({ where: { id: req.params.leadId, userId: req.user.userId } });
    if (!lead) return res.status(404).json({ error: "Lead non trovato" });
    const messages = await prisma.outreachMessage.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "desc" } });
    res.json({ messages });
  } catch (error) { next(error); }
});

module.exports = router;
