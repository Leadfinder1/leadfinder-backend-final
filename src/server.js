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

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 250 }));

function token(user) {
  return jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET || "dev-secret",
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const raw = header.replace("Bearer ", "");
  if (!raw) return res.status(401).json({ error: "Token mancante" });
  try {
    req.user = jwt.verify(raw, process.env.JWT_SECRET || "dev-secret");
    next();
  } catch {
    res.status(401).json({ error: "Token non valido" });
  }
}

function owner(req, res, next) {
  if (req.user?.role !== "OWNER") return res.status(403).json({ error: "Solo owner" });
  next();
}

function scoreLead({ website, phone, rating, reviews }) {
  let score = 0;
  if (!website) score += 45;
  if (phone) score += 15;
  if ((rating || 0) >= 4.3) score += 20;
  if ((reviews || 0) >= 30) score += 20;
  return {
    score,
    tag: score >= 75 ? "ALTA" : score >= 45 ? "MEDIA" : "BASSA"
  };
}

app.get("/", (_, res) => res.json({ status: "online", app: "LeadFinder AI" }));
app.get("/health", (_, res) => res.json({ status: "online" }));

app.post("/api/auth/register", async (req, res) => {
  try {
    const data = z.object({
      email: z.string().email().toLowerCase(),
      password: z.string().min(8),
      fullName: z.string().optional()
    }).parse(req.body);

    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) return res.status(409).json({ error: "Email già registrata" });

    const role = data.email === String(process.env.OWNER_EMAIL || "").toLowerCase() ? "OWNER" : "USER";
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: await bcrypt.hash(data.password, 12),
        fullName: data.fullName,
        role
      },
      select: { id: true, email: true, fullName: true, role: true, plan: true }
    });

    res.json({ token: token(user), accessToken: token(user), user });
  } catch (e) {
    res.status(400).json({ error: "Registrazione non valida" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const data = z.object({
      email: z.string().email().toLowerCase(),
      password: z.string().min(1)
    }).parse(req.body);

    const found = await prisma.user.findUnique({ where: { email: data.email } });
    if (!found) return res.status(401).json({ error: "Credenziali non valide" });

    const ok = await bcrypt.compare(data.password, found.password);
    if (!ok) return res.status(401).json({ error: "Credenziali non valide" });

    const user = { id: found.id, email: found.email, fullName: found.fullName, role: found.role, plan: found.plan };
    res.json({ token: token(found), accessToken: token(found), user });
  } catch {
    res.status(400).json({ error: "Login non valido" });
  }
});

async function googlePlaces(category, city) {
  if (!process.env.GOOGLE_API_KEY) {
    return [
      { displayName: { text: "Demo Restaurant Milano" }, formattedAddress: "Milano, Italia", nationalPhoneNumber: "+39 000 000 0000", rating: 4.6, userRatingCount: 120, googleMapsUri: "https://maps.google.com", id: "demo1" },
      { displayName: { text: "Demo Bar Senza Sito" }, formattedAddress: "Milano, Italia", nationalPhoneNumber: "+39 111 111 1111", rating: 4.3, userRatingCount: 65, googleMapsUri: "https://maps.google.com", id: "demo2" }
    ];
  }

  const response = await axios.post(
    "https://places.googleapis.com/v1/places:searchText",
    { textQuery: `${category} ${city}` },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri,places.nationalPhoneNumber"
      }
    }
  );

  return response.data.places || [];
}

app.post("/api/leads/search", auth, async (req, res) => {
  try {
    const data = z.object({
      category: z.string().min(2),
      city: z.string().min(2),
      saveName: z.string().min(1).optional()
    }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: "Utente non trovato" });

    const limits = { FREE: 3, BASIC: 50, PRO: 250, MASTER: 999999, PERSONALIZE: 999999 };
    if (user.searchesCount >= limits[user.plan]) {
      return res.status(403).json({ error: "Limite piano raggiunto" });
    }

    const places = await googlePlaces(data.category, data.city);
    const withoutWebsite = places.filter((p) => !p.websiteUri);

    const search = await prisma.search.create({
      data: { userId: user.id, name: data.saveName || `${data.category} ${data.city}`, category: data.category, city: data.city }
    });

    const leads = [];
    for (const place of withoutWebsite) {
      const rating = place.rating || null;
      const reviews = place.userRatingCount || 0;
      const phone = place.nationalPhoneNumber || null;
      const result = scoreLead({ website: null, phone, rating, reviews });

      leads.push(await prisma.lead.create({
        data: {
          searchId: search.id,
          businessName: place.displayName?.text || "Nome non disponibile",
          address: place.formattedAddress || null,
          phone,
          website: null,
          placeId: place.id || null,
          mapsUrl: place.googleMapsUri || "https://maps.google.com",
          rating,
          reviews,
          opportunity: result.score,
          opportunityTag: result.tag,
          aiMessage: `Ciao, ho notato che la vostra attività ha ottime potenzialità ma non risulta avere un sito web professionale. Un sito potrebbe aiutarvi a ricevere più richieste, aumentare la fiducia dei clienti e distinguervi dai concorrenti nella vostra zona.`
        }
      }));
    }

    await prisma.user.update({ where: { id: user.id }, data: { searchesCount: { increment: 1 } } });
    res.json({ searchId: search.id, totalFound: leads.length, leads });
  } catch (e) {
    res.status(400).json({ error: "Ricerca non valida" });
  }
});

app.get("/api/leads/saved", auth, async (req, res) => {
  const searches = await prisma.search.findMany({
    where: { userId: req.user.userId },
    include: { leads: true },
    orderBy: { createdAt: "desc" }
  });
  res.json(searches);
});

app.get("/api/owner/users", auth, owner, async (_, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, fullName: true, role: true, plan: true, searchesCount: true, createdAt: true },
    orderBy: { createdAt: "desc" }
  });
  res.json(users);
});

app.patch("/api/owner/users/:id/plan", auth, owner, async (req, res) => {
  const plan = z.enum(["FREE", "BASIC", "PRO", "MASTER", "PERSONALIZE"]).parse(req.body.plan);
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { plan },
    select: { id: true, email: true, plan: true }
  });
  res.json(user);
});

app.listen(process.env.PORT || 5000, () => {
  console.log(`LeadFinder backend online on port ${process.env.PORT || 5000}`);
});