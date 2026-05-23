const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { auth } = require("../middleware/auth");
const { searchGooglePlaces } = require("../services/maps.service");
const { enrichWebsite } = require("../services/enrichment.service");
const { scoreLead, contactQuality } = require("../services/scoring.service");
const { auditWebsite } = require("../services/audit.service");

const router = express.Router();

router.post("/search", auth, async (req, res, next) => {
  try {
    const data = z.object({
      niche: z.string().min(2),
      city: z.string().min(2),
      searchName: z.string().optional(),
      enrich: z.boolean().optional(),
      maxResults: z.number().optional()
    }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: "Utente non trovato" });
    if (user.scanCredits <= 0 && user.plan === "FREE") return res.status(402).json({ error: "Limite scansioni raggiunto" });

    const search = await prisma.search.create({
      data: { userId: user.id, name: data.searchName || `${data.niche} ${data.city}`, niche: data.niche, city: data.city }
    });

    const rawPlaces = await searchGooglePlaces({ niche: data.niche, city: data.city, maxResults: data.maxResults || 20 });

    const processed = [];
    for (const place of rawPlaces) {
      const enriched = data.enrich ? await enrichWebsite(place) : place;
      const score = scoreLead(enriched);
      const quality = contactQuality(enriched);
      const lead = await prisma.lead.create({
        data: {
          userId: user.id,
          searchId: search.id,
          businessName: enriched.businessName,
          niche: data.niche,
          city: data.city,
          address: enriched.address,
          phone: enriched.phone,
          website: enriched.website,
          mapsUrl: enriched.mapsUrl,
          placeId: enriched.placeId,
          rating: enriched.rating,
          reviews: enriched.reviews,
          email: enriched.email,
          instagram: enriched.instagram,
          facebook: enriched.facebook,
          linkedin: enriched.linkedin,
          tiktok: enriched.tiktok,
          youtube: enriched.youtube,
          whatsapp: enriched.whatsapp,
          contactQuality: quality,
          aiScore: score.score,
          opportunityLevel: score.level,
          scoreExplanation: score.explanation
        }
      });
      processed.push({ ...lead, scoreBreakdown: score.breakdown });
    }

    await prisma.search.update({ where: { id: search.id }, data: { totalFound: processed.length } });
    await prisma.user.update({ where: { id: user.id }, data: { scanCredits: { decrement: user.plan === "FREE" ? 1 : 0 } } }).catch(() => {});

    res.json({ search, leads: processed });
  } catch (error) { next(error); }
});

router.get("/", auth, async (req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({ where: { userId: req.user.userId }, orderBy: { createdAt: "desc" }, take: 500 });
    res.json({ leads });
  } catch (error) { next(error); }
});

router.get("/searches", auth, async (req, res, next) => {
  try {
    const searches = await prisma.search.findMany({
      where: { userId: req.user.userId },
      include: { leads: true },
      orderBy: { createdAt: "desc" }
    });
    res.json({ searches });
  } catch (error) { next(error); }
});

router.post("/:id/enrich", auth, async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, userId: req.user.userId } });
    if (!lead) return res.status(404).json({ error: "Lead non trovato" });
    const enriched = await enrichWebsite(lead);
    const quality = contactQuality(enriched);
    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        email: enriched.email, instagram: enriched.instagram, facebook: enriched.facebook,
        linkedin: enriched.linkedin, tiktok: enriched.tiktok, youtube: enriched.youtube,
        whatsapp: enriched.whatsapp, contactQuality: quality, stage: "ENRICHED"
      }
    });
    res.json({ lead: updated });
  } catch (error) { next(error); }
});

router.post("/:id/audit", auth, async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, userId: req.user.userId } });
    if (!lead) return res.status(404).json({ error: "Lead non trovato" });
    const audit = auditWebsite(lead);
    const saved = await prisma.websiteAudit.upsert({
      where: { leadId: lead.id },
      update: audit,
      create: { leadId: lead.id, ...audit }
    });
    res.json({ audit: saved });
  } catch (error) { next(error); }
});

module.exports = router;
