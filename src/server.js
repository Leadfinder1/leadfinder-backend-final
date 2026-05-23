const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 400 }));

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const OWNER_EMAIL = (process.env.OWNER_EMAIL || "simonedepadova0088@gmail.com").toLowerCase();

const PLAN_LIMITS = {
  FREE: { scans: 20, ai: 50, exports: true, cities: 2 },
  PRO: { scans: 500, ai: 1000, exports: true, cities: 20 },
  AGENCY: { scans: 999999, ai: 999999, exports: true, cities: 200 },
  OWNER: { scans: 999999, ai: 999999, exports: true, cities: 999 }
};

function token(user) {
  return jwt.sign({ id: user.id, role: user.role, plan: user.plan }, JWT_SECRET, { expiresIn: "30d" });
}

function referralCode(email) {
  return "LF-" + Buffer.from(email).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() + "-" + Math.floor(Math.random()*9999);
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const raw = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!raw) return res.status(401).json({ error: "Token mancante" });
  try {
    req.user = jwt.verify(raw, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Sessione scaduta. Fai login di nuovo." });
  }
}

async function fullUser(id) {
  return prisma.user.findUnique({ where: { id }, select: { id:true,email:true,fullName:true,role:true,plan:true,scansUsed:true,aiCreditsUsed:true,referralCode:true,createdAt:true }});
}

function cleanText(x) { return String(x || "").trim(); }
function opportunity(score) {
  if (score >= 85) return "very hot";
  if (score >= 70) return "hot";
  if (score >= 45) return "warm";
  return "cold";
}

function scoreLead(b) {
  let score = 20;
  const reasons = [];
  if (!b.website) { score += 35; reasons.push("Non ha sito web pubblico"); }
  else { score -= 5; reasons.push("Ha già un sito, serve audit qualità"); }
  if ((b.rating || 0) >= 4.3) { score += 15; reasons.push("Rating alto"); }
  if ((b.reviews || 0) >= 30) { score += 15; reasons.push("Molte recensioni"); }
  if (b.phone) { score += 10; reasons.push("Telefono disponibile"); }
  if (b.email || b.instagram || b.facebook || b.whatsapp) { score += 10; reasons.push("Contatti digitali presenti"); }
  score = Math.max(0, Math.min(100, score));
  return { aiScore: score, opportunityLevel: opportunity(score), scoreReason: reasons.join(" · ") };
}

function contactQuality(b) {
  let q = 0;
  if (b.phone) q += 25;
  if (b.email) q += 30;
  if (b.instagram) q += 15;
  if (b.facebook) q += 10;
  if (b.linkedin) q += 10;
  if (b.whatsapp) q += 10;
  return Math.min(100, q);
}

function fallbackBusinesses(niche, city) {
  return Array.from({ length: 10 }).map((_, i) => {
    const rating = Number((3.6 + Math.random()*1.3).toFixed(1));
    const reviews = Math.floor(8 + Math.random()*180);
    return {
      businessName: `${niche} ${city} Lead ${i+1}`,
      phone: i % 2 === 0 ? `+39 02 ${Math.floor(1000000+Math.random()*8999999)}` : null,
      address: `${city}, Italia`,
      rating,
      reviews,
      website: i % 3 === 0 ? `https://example-${i+1}.com` : null,
      mapsUrl: `https://www.google.com/maps/search/${encodeURIComponent(niche+" "+city)}`,
      placeId: `fallback-${Date.now()}-${i}`,
      niche,
      city
    };
  });
}

async function googleTextSearch(niche, city) {
  if (!process.env.GOOGLE_API_KEY) return fallbackBusinesses(niche, city);
  try {
    const url = "https://places.googleapis.com/v1/places:searchText";
    const response = await axios.post(url, { textQuery: `${niche} ${city}`, maxResultCount: 20 }, {
      timeout: 20000,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri,places.nationalPhoneNumber"
      }
    });
    return (response.data.places || []).map(p => ({
      businessName: p.displayName?.text || "Business senza nome",
      phone: p.nationalPhoneNumber || null,
      address: p.formattedAddress || null,
      rating: p.rating || null,
      reviews: p.userRatingCount || 0,
      website: p.websiteUri || null,
      mapsUrl: p.googleMapsUri || null,
      placeId: p.id || null,
      niche,
      city
    }));
  } catch (e) {
    console.error("Google Places error", e.response?.data || e.message);
    return fallbackBusinesses(niche, city).map(x => ({ ...x, warning: "Google API non disponibile: risultati demo fallback." }));
  }
}

async function enrichWebsite(url) {
  const out = { email:null, instagram:null, facebook:null, linkedin:null, tiktok:null, youtube:null, whatsapp:null };
  if (!url) return out;
  try {
    const r = await axios.get(url, { timeout: 7000, maxRedirects: 3, headers: { "User-Agent": "LeadFinderAI/2.0" }});
    const html = String(r.data || "").slice(0, 300000);
    const email = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    out.email = email ? email[0] : null;
    const patterns = {
      instagram: /https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9_.-]+/i,
      facebook: /https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9_.-]+/i,
      linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/[^"' <]+/i,
      tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@?[a-zA-Z0-9_.-]+/i,
      youtube: /https?:\/\/(?:www\.)?youtube\.com\/[^"' <]+/i,
      whatsapp: /https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^"' <]+/i
    };
    for (const [k, re] of Object.entries(patterns)) {
      const m = html.match(re);
      out[k] = m ? m[0] : null;
    }
  } catch (e) {}
  return out;
}

function outreachTemplates(lead, opts={}) {
  const tone = opts.tone || "professionale";
  const lang = opts.language || "it";
  const need = lead.website ? "migliorare la presenza online" : "creare un sito professionale";
  const base = `Ciao ${lead.businessName}, ho notato che la vostra attività a ${lead.city || ""} ha ${lead.reviews || 0} recensioni e un rating di ${lead.rating || "N/D"}. Potreste ottenere più richieste e più fiducia dai clienti con un sito moderno e ottimizzato.`;
  return {
    subject: `Idea veloce per aumentare clienti per ${lead.businessName}`,
    short: `${base} Posso mostrarvi una proposta concreta in 2 minuti?`,
    professional: `${base}\n\nMi occupo di siti web per attività locali: pagine veloci, mobile-first, ottimizzate per Google e pensate per convertire visite in contatti. Se vuole, posso preparare una mini analisi gratuita della vostra presenza online.`,
    aggressive: `${base}\n\nOggi molti clienti scelgono un'attività prima ancora di chiamarla. Se i concorrenti hanno un sito migliore, rischiate di perdere richieste ogni settimana. Posso aiutarvi a risolvere questo punto rapidamente.`,
    whatsapp: `Ciao! Ho visto ${lead.businessName} su Google Maps. Posso mandarvi una mini idea gratuita per migliorare la vostra presenza online?`,
    instagram: `Ciao! Ho visto la vostra attività e penso ci sia un'opportunità per portarvi più contatti con un sito/landing fatta bene. Posso inviarvi una mini proposta?`,
    cta: "Vuole che le mandi una demo gratuita?"
  };
}

function websiteAudit(lead) {
  if (!lead.website) {
    return { score: 22, summary: "Non risulta un sito web pubblico: opportunità alta per proposta di nuovo sito.", issues:["Nessun sito trovato","Branding digitale debole","Meno fiducia pre-contatto"], opportunities:["Nuovo sito mobile-first","Landing con CTA","SEO locale"] };
  }
  return { score: 68, summary: "Sito presente: consigliato audit manuale per performance, mobile, CTA e SEO locale.", issues:["Audit tecnico non eseguito in questa modalità base"], opportunities:["Miglioramento CTA","SEO locale","Velocità mobile"] };
}

app.get("/health", (req, res) => res.json({ status: "online", version: "enterprise-functional-full" }));

app.post("/api/auth/register", async (req, res) => {
  try {
    const body = z.object({ email:z.string().email(), password:z.string().min(6), fullName:z.string().optional(), referral:z.string().optional() }).parse(req.body);
    const email = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where:{ email }});
    if (existing) return res.status(409).json({ error:"Email già registrata" });
    const password = await bcrypt.hash(body.password, 10);
    const role = email === OWNER_EMAIL ? "OWNER" : "USER";
    const plan = role === "OWNER" ? "OWNER" : "FREE";
    const user = await prisma.user.create({ data:{ email, password, fullName:body.fullName || "", role, plan, referralCode: referralCode(email), referredBy: body.referral || null }});
    await prisma.auditLog.create({ data:{ userId:user.id, action:"REGISTER", metadata:{ role, plan } }});
    res.json({ token: token(user), user: await fullUser(user.id) });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error:"Registrazione non valida" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const body = z.object({ email:z.string().email(), password:z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where:{ email: body.email.toLowerCase() }});
    if (!user) return res.status(401).json({ error:"Credenziali non valide" });
    const ok = await bcrypt.compare(body.password, user.password);
    if (!ok) return res.status(401).json({ error:"Credenziali non valide" });
    res.json({ token: token(user), user: await fullUser(user.id) });
  } catch {
    res.status(400).json({ error:"Login non valido" });
  }
});

app.get("/api/me", auth, async (req,res)=> res.json({ user: await fullUser(req.user.id) }));

app.post("/api/search", auth, async (req, res) => {
  try {
    const body = z.object({ niche:z.string().min(2), city:z.string().min(2), enrich:z.boolean().optional() }).parse(req.body);
    const user = await prisma.user.findUnique({ where:{ id:req.user.id }});
    const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.FREE;
    if (user.scansUsed >= limits.scans) return res.status(403).json({ error:"Limite scansioni raggiunto. Fai upgrade." });
    const search = await prisma.search.create({ data:{ userId:user.id, name:`${body.niche} ${body.city}`, niche:body.niche, city:body.city }});
    let businesses = await googleTextSearch(body.niche, body.city);
    const withoutWebsiteFirst = businesses.sort((a,b)=> Number(!!a.website)-Number(!!b.website));
    const created = [];
    for (const b of withoutWebsiteFirst) {
      const enrich = body.enrich ? await enrichWebsite(b.website) : {};
      const combined = { ...b, ...enrich };
      const s = scoreLead(combined);
      const q = contactQuality(combined);
      const audit = websiteAudit(combined);
      const lead = await prisma.lead.create({ data:{ searchId:search.id, ...combined, ...s, contactQuality:q, auditScore:audit.score, auditSummary:audit.summary }});
      created.push(lead);
    }
    await prisma.user.update({ where:{ id:user.id }, data:{ scansUsed:{ increment:1 }}});
    res.json({ search, leads: created, warning: !process.env.GOOGLE_API_KEY ? "GOOGLE_API_KEY mancante: risultati demo." : null });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error:"Ricerca non valida" });
  }
});

app.post("/api/multi-city-scan", auth, async (req,res)=>{
  try {
    const body = z.object({ niche:z.string().min(2), cities:z.array(z.string()).min(1).max(20) }).parse(req.body);
    const all = [];
    for (const city of body.cities) {
      const businesses = await googleTextSearch(body.niche, city);
      all.push({ city, count:businesses.length, leads: businesses.map(b=>({ ...b, ...scoreLead(b), contactQuality:contactQuality(b) })) });
    }
    res.json({ niche:body.niche, results:all, total:all.reduce((a,x)=>a+x.count,0) });
  } catch { res.status(400).json({ error:"Multi city scan non valido" }); }
});

app.get("/api/searches", auth, async (req,res)=>{
  const searches = await prisma.search.findMany({ where:{ userId:req.user.id }, include:{ leads:true }, orderBy:{ createdAt:"desc" }});
  res.json(searches);
});

app.patch("/api/searches/:id/name", auth, async (req,res)=>{
  const body = z.object({ name:z.string().min(1) }).parse(req.body);
  const search = await prisma.search.update({ where:{ id:req.params.id }, data:{ name:body.name }});
  res.json(search);
});

app.post("/api/leads/:id/enrich", auth, async (req,res)=>{
  const lead = await prisma.lead.findFirst({ where:{ id:req.params.id, search:{ userId:req.user.id }}});
  if (!lead) return res.status(404).json({ error:"Lead non trovato" });
  const data = await enrichWebsite(lead.website);
  const updated = await prisma.lead.update({ where:{ id:lead.id }, data:{ ...data, contactQuality: contactQuality({ ...lead, ...data }) }});
  res.json(updated);
});

app.post("/api/leads/:id/outreach", auth, async (req,res)=>{
  const lead = await prisma.lead.findFirst({ where:{ id:req.params.id, search:{ userId:req.user.id }}});
  if (!lead) return res.status(404).json({ error:"Lead non trovato" });
  const messages = outreachTemplates(lead, req.body || {});
  await prisma.user.update({ where:{ id:req.user.id }, data:{ aiCreditsUsed:{ increment:1 }}});
  res.json({ leadId:lead.id, messages });
});

app.get("/api/leads/:id/audit", auth, async (req,res)=>{
  const lead = await prisma.lead.findFirst({ where:{ id:req.params.id, search:{ userId:req.user.id }}});
  if (!lead) return res.status(404).json({ error:"Lead non trovato" });
  res.json(websiteAudit(lead));
});

app.get("/api/crm", auth, async (req,res)=>{
  res.json(await prisma.crmLead.findMany({ where:{ userId:req.user.id }, orderBy:{ updatedAt:"desc" }}));
});

app.post("/api/crm", auth, async (req,res)=>{
  const body = z.object({ leadId:z.string().optional(), businessName:z.string().min(1), stage:z.string().optional(), notes:z.string().optional(), tags:z.string().optional() }).parse(req.body);
  const crm = await prisma.crmLead.create({ data:{ userId:req.user.id, leadId:body.leadId, businessName:body.businessName, stage:body.stage || "new", notes:body.notes || "", tags:body.tags || "" }});
  res.json(crm);
});

app.patch("/api/crm/:id", auth, async (req,res)=>{
  const body = z.object({ stage:z.string().optional(), notes:z.string().optional(), tags:z.string().optional() }).parse(req.body);
  const crm = await prisma.crmLead.update({ where:{ id:req.params.id }, data:body });
  res.json(crm);
});

app.get("/api/automations", auth, async (req,res)=>{
  res.json(await prisma.automation.findMany({ where:{ userId:req.user.id }, orderBy:{ createdAt:"desc" }}));
});

app.post("/api/automations", auth, async (req,res)=>{
  const body = z.object({ name:z.string(), niche:z.string(), cities:z.array(z.string()).min(1), frequency:z.string().optional() }).parse(req.body);
  const a = await prisma.automation.create({ data:{ userId:req.user.id, name:body.name, niche:body.niche, cities:body.cities.join(","), frequency:body.frequency || "daily" }});
  res.json(a);
});

app.patch("/api/automations/:id/toggle", auth, async (req,res)=>{
  const a = await prisma.automation.findUnique({ where:{ id:req.params.id }});
  const updated = await prisma.automation.update({ where:{ id:req.params.id }, data:{ active:!a.active }});
  res.json(updated);
});

app.get("/api/referral", auth, async (req,res)=>{
  const user = await fullUser(req.user.id);
  const referred = await prisma.user.count({ where:{ referredBy:user.referralCode }});
  res.json({ code:user.referralCode, invited:referred, rewards:[{name:"Growth Hacker Badge", unlocked:referred>=1},{name:"Top Scanner", unlocked:referred>=5}] });
});

app.get("/api/billing/plans", auth, async (req,res)=>{
  res.json([
    { id:"FREE", price:"€0", scans:20, ai:50, features:["Google Maps search","Export base","CRM base"] },
    { id:"PRO", price:"€49/mese", scans:500, ai:1000, features:["Multi-city","AI outreach","Audit","Automations"] },
    { id:"AGENCY", price:"€149/mese", scans:"illimitate", ai:"illimitati", features:["Agency usage","Referral","Advanced CRM"] }
  ]);
});

app.get("/api/owner/users", auth, async (req,res)=>{
  if (req.user.role !== "OWNER") return res.status(403).json({ error:"Owner only" });
  res.json(await prisma.user.findMany({ orderBy:{ createdAt:"desc" }, select:{ id:true,email:true,role:true,plan:true,scansUsed:true,aiCreditsUsed:true,createdAt:true }}));
});

app.patch("/api/owner/users/:id/plan", auth, async (req,res)=>{
  if (req.user.role !== "OWNER") return res.status(403).json({ error:"Owner only" });
  const body = z.object({ plan:z.string() }).parse(req.body);
  res.json(await prisma.user.update({ where:{ id:req.params.id }, data:{ plan:body.plan }}));
});

app.use((req,res)=>res.status(404).json({ error:"Route non trovata" }));
app.listen(PORT, () => console.log(`LeadFinder AI backend online on ${PORT}`));
