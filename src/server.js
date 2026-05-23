const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const axios = require("axios");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-now";
const OWNER_EMAIL = (process.env.OWNER_EMAIL || "simonedepadova0088@gmail.com").toLowerCase();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName || "",
    role: user.role,
    plan: user.plan,
    searchesCount: user.searchesCount
  };
}

function signToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) return res.status(401).json({ error: "Token mancante" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: "Sessione scaduta. Effettua di nuovo il login." });
  }
}

function requireOwner(req, res, next) {
  if (req.user?.role !== "OWNER") {
    return res.status(403).json({ error: "Accesso non autorizzato" });
  }
  return next();
}

function scoreLead({ website, phone, rating, reviews }) {
  let score = 0;
  if (!website) score += 45;
  if (phone) score += 15;
  if ((rating || 0) >= 4.2) score += 20;
  if ((reviews || 0) >= 30) score += 20;
  if (score > 100) score = 100;

  return {
    score,
    tag: score >= 75 ? "ALTA" : score >= 45 ? "MEDIA" : "BASSA"
  };
}

function createSalesMessage(lead) {
  const name = lead.businessName || "la vostra attività";
  const ratingText = lead.rating ? ` Ho visto anche che avete una valutazione di ${lead.rating}/5.` : "";
  return `Ciao, ho notato che ${name} ha una presenza interessante su Google Maps ma non risulta avere un sito web professionale.${ratingText} Un sito potrebbe aiutarvi a ricevere più richieste, aumentare la fiducia dei clienti e trasformare le ricerche locali in nuovi contatti. Posso mostrarvi una proposta semplice e concreta per portarvi online in modo professionale.`;
}

const PLAN_LIMITS = {
  FREE: 3,
  BASIC: 50,
  PRO: 250,
  MASTER: 100000,
  PERSONALIZE: 100000
};

app.get("/", (req, res) => res.json({ status: "online", app: "LeadFinder AI" }));
app.get("/health", (req, res) => res.json({ status: "online" }));

app.post("/api/auth/register", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const fullName = String(req.body.fullName || "").trim();

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Inserisci una email valida." });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "La password deve avere almeno 8 caratteri." });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Email già registrata. Effettua il login." });
    }

    const hashed = await bcrypt.hash(password, 12);
    const role = email === OWNER_EMAIL ? "OWNER" : "USER";

    const user = await prisma.user.create({
      data: { email, password: hashed, fullName, role, plan: "FREE" }
    });

    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error("REGISTER_ERROR", error);
    return res.status(500).json({ error: "Registrazione non riuscita. Controlla database e riprova." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Credenziali non valide." });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Credenziali non valide." });

    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error("LOGIN_ERROR", error);
    return res.status(500).json({ error: "Login non riuscito." });
  }
});

app.get("/api/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) return res.status(404).json({ error: "Utente non trovato." });
  return res.json(publicUser(user));
});

app.post("/api/leads/search", requireAuth, async (req, res) => {
  try {
    const category = String(req.body.category || "").trim();
    const city = String(req.body.city || "").trim();
    const saveName = String(req.body.saveName || `${category} ${city}`).trim();

    if (category.length < 2 || city.length < 2) {
      return res.status(400).json({ error: "Inserisci categoria e città." });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: "Utente non trovato." });

    const limit = PLAN_LIMITS[user.plan] || PLAN_LIMITS.FREE;
    if (user.searchesCount >= limit) {
      return res.status(403).json({ error: "Limite ricerche raggiunto. Effettua upgrade del piano." });
    }

    let places = [];
    const googleKey = process.env.GOOGLE_API_KEY;

    if (googleKey) {
      const googleRes = await axios.post(
        "https://places.googleapis.com/v1/places:searchText",
        { textQuery: `${category} ${city}`, maxResultCount: 20 },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": googleKey,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri,places.nationalPhoneNumber"
          },
          timeout: 20000
        }
      );
      places = googleRes.data.places || [];
    } else {
      // Demo fallback so the extension works even before Google API is configured.
      places = [
        {
          id: "demo-1",
          displayName: { text: `${category} Demo 1` },
          formattedAddress: `${city}, Italia`,
          rating: 4.6,
          userRatingCount: 88,
          googleMapsUri: `https://www.google.com/maps/search/${encodeURIComponent(category + " " + city)}`,
          nationalPhoneNumber: "+39 000 000 000"
        },
        {
          id: "demo-2",
          displayName: { text: `${category} Demo 2` },
          formattedAddress: `${city}, Italia`,
          rating: 4.1,
          userRatingCount: 23,
          googleMapsUri: `https://www.google.com/maps/search/${encodeURIComponent(category + " " + city)}`,
          nationalPhoneNumber: null
        }
      ];
    }

    const withoutWebsite = places.filter((p) => !p.websiteUri);

    const search = await prisma.search.create({
      data: { userId: user.id, name: saveName || `${category} ${city}`, category, city }
    });

    const leads = [];
    for (const p of withoutWebsite) {
      const baseLead = {
        businessName: p.displayName?.text || "Nome non disponibile",
        address: p.formattedAddress || "",
        phone: p.nationalPhoneNumber || "",
        website: p.websiteUri || "",
        mapsUrl: p.googleMapsUri || `https://www.google.com/maps/search/${encodeURIComponent((p.displayName?.text || category) + " " + city)}`,
        placeId: p.id || "",
        rating: p.rating || null,
        reviews: p.userRatingCount || 0
      };

      const score = scoreLead(baseLead);
      const created = await prisma.lead.create({
        data: {
          searchId: search.id,
          ...baseLead,
          opportunity: score.score,
          opportunityTag: score.tag,
          aiMessage: createSalesMessage({ ...baseLead, ...score })
        }
      });

      leads.push(created);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { searchesCount: { increment: 1 } }
    });

    return res.json({ searchId: search.id, totalFound: leads.length, leads });
  } catch (error) {
    console.error("SEARCH_ERROR", error.response?.data || error.message || error);
    return res.status(500).json({ error: "Ricerca non riuscita. Controlla Google API o riprova." });
  }
});

app.get("/api/leads/saved", requireAuth, async (req, res) => {
  const searches = await prisma.search.findMany({
    where: { userId: req.user.userId },
    include: { leads: true },
    orderBy: { createdAt: "desc" }
  });
  return res.json(searches);
});

app.get("/api/owner/users", requireAuth, requireOwner, async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, fullName: true, role: true, plan: true, searchesCount: true, createdAt: true },
    orderBy: { createdAt: "desc" }
  });
  return res.json(users);
});

app.patch("/api/owner/users/:id/plan", requireAuth, requireOwner, async (req, res) => {
  const allowed = ["FREE", "BASIC", "PRO", "MASTER", "PERSONALIZE"];
  const plan = String(req.body.plan || "").toUpperCase();

  if (!allowed.includes(plan)) return res.status(400).json({ error: "Piano non valido." });

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { plan }
  });

  return res.json(publicUser(user));
});

app.get("/api/billing/discord", requireAuth, (req, res) => {
  return res.json({ url: process.env.DISCORD_INVITE || "https://discord.com" });
});

app.post("/api/billing/checkout", requireAuth, (req, res) => {
  return res.json({
    demo: true,
    message: "Stripe non configurato. Aggiungi STRIPE_SECRET_KEY e price IDs per attivare i pagamenti reali.",
    url: "https://stripe.com"
  });
});

app.use((req, res) => res.status(404).json({ error: "Endpoint non trovato." }));

app.listen(PORT, () => {
  console.log(`LeadFinder backend online on port ${PORT}`);
});
