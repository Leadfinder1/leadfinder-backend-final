const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();

app.use(helmet());
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 220 }));

const OWNER_EMAIL = (process.env.OWNER_EMAIL || "simonedepadova0088@gmail.com").toLowerCase();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function token(user){ return jwt.sign({ userId:user.id, role:user.role }, JWT_SECRET, { expiresIn:"7d" }); }
function auth(req,res,next){
  const h = req.headers.authorization || "";
  if(!h.startsWith("Bearer ")) return res.status(401).json({error:"Non autorizzato"});
  try{ req.user = jwt.verify(h.replace("Bearer ",""), JWT_SECRET); next(); }
  catch(e){ return res.status(401).json({error:"Sessione scaduta"}); }
}
function owner(req,res,next){ if(req.user?.role !== "OWNER") return res.status(403).json({error:"Accesso owner richiesto"}); next(); }

app.get("/health", (_,res)=>res.json({status:"online", app:"LeadFinder AI Hacker Pro"}));

app.post("/api/auth/register", async (req,res)=>{
  try{
    const email = String(req.body.email||"").trim().toLowerCase();
    const password = String(req.body.password||"");
    const fullName = String(req.body.fullName||"").trim();
    if(!email.includes("@")) return res.status(400).json({error:"Email non valida"});
    if(password.length < 8) return res.status(400).json({error:"Password minima 8 caratteri"});
    const exists = await prisma.user.findUnique({where:{email}});
    if(exists) return res.status(409).json({error:"Email già registrata. Fai login."});
    const hash = await bcrypt.hash(password, 12);
    const role = email === OWNER_EMAIL ? "OWNER" : "USER";
    const user = await prisma.user.create({data:{email,password:hash,fullName,role,plan:"FREE"}, select:{id:true,email:true,fullName:true,role:true,plan:true}});
    res.json({token:token(user), user});
  }catch(e){ console.error("REGISTER_ERROR", e); res.status(500).json({error:"Registrazione non riuscita"}); }
});
app.post("/api/auth/login", async (req,res)=>{
  try{
    const email = String(req.body.email||"").trim().toLowerCase();
    const password = String(req.body.password||"");
    const user = await prisma.user.findUnique({where:{email}});
    if(!user) return res.status(401).json({error:"Credenziali non valide"});
    const ok = await bcrypt.compare(password, user.password);
    if(!ok) return res.status(401).json({error:"Credenziali non valide"});
    res.json({token:token(user), user:{id:user.id,email:user.email,fullName:user.fullName,role:user.role,plan:user.plan}});
  }catch(e){ console.error("LOGIN_ERROR", e); res.status(500).json({error:"Login non riuscito"}); }
});

function scoreLead(p){
  let score = 45;
  if(p.phone) score += 15;
  if((p.rating||0) >= 4.4) score += 18;
  if((p.reviews||0) >= 50) score += 18;
  if((p.reviews||0) >= 200) score += 8;
  score = Math.min(100, score);
  return { score, tag: score >= 80 ? "ALTA" : score >= 58 ? "MEDIA" : "BASSA" };
}
function salesMessage(p, category, city){
  return `Ciao, ho trovato la vostra attività cercando ${category} a ${city}. Avete una presenza interessante su Google Maps${p.rating?` con rating ${p.rating}`:""}, ma non risulta un sito web collegato. Un sito professionale può aumentare fiducia, richieste e prenotazioni, soprattutto quando i clienti vi cercano online. Posso mostrarvi una proposta semplice per trasformare le visite Google in contatti reali.`;
}
async function googlePlaces(category, city){
  if(!process.env.GOOGLE_API_KEY){
    const err = new Error("Manca GOOGLE_API_KEY su Railway. Aggiungi la chiave Google Places API per risultati reali.");
    err.status = 500; throw err;
  }
  const textQuery = `${category} in ${city}`;
  const response = await axios.post("https://places.googleapis.com/v1/places:searchText",
    { textQuery, languageCode:"it", maxResultCount:20 },
    { headers:{
      "Content-Type":"application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri,places.googleMapsUri"
    }, timeout: 20000}
  );
  return response.data.places || [];
}
app.post("/api/leads/search", auth, async (req,res)=>{
  try{
    const category = String(req.body.category||"").trim();
    const city = String(req.body.city||"").trim();
    if(!category || !city) return res.status(400).json({error:"Inserisci tipo di impresa e città"});
    const search = await prisma.search.create({data:{userId:req.user.userId, category, city, name:null}});
    const places = await googlePlaces(category, city);
    const withoutWebsite = places.filter(p => !p.websiteUri);
    const leads = [];
    for(const p of withoutWebsite){
      const rating = typeof p.rating === "number" ? p.rating : null;
      const reviews = p.userRatingCount || 0;
      const phone = p.nationalPhoneNumber || null;
      const s = scoreLead({phone,rating,reviews});
      const businessName = p.displayName?.text || "Nome non disponibile";
      const lead = await prisma.lead.create({data:{
        searchId: search.id,
        businessName,
        address: p.formattedAddress || null,
        phone,
        website: p.websiteUri || null,
        mapsUrl: p.googleMapsUri || null,
        placeId: p.id || null,
        rating,
        reviews,
        opportunity:s.score,
        opportunityTag:s.tag,
        aiMessage:salesMessage({rating}, category, city)
      }});
      leads.push(lead);
    }
    res.json({searchId: search.id, totalFound: leads.length, leads});
  }catch(e){
    console.error("SEARCH_ERROR", e.response?.data || e.message);
    res.status(e.status || 500).json({error:e.message || "Ricerca non riuscita"});
  }
});
app.patch("/api/leads/search/:id/name", auth, async (req,res)=>{
  try{
    const name = String(req.body.name||"").trim();
    if(!name) return res.status(400).json({error:"Nome ricerca mancante"});
    const search = await prisma.search.update({where:{id:req.params.id}, data:{name}});
    res.json({ok:true, search});
  }catch(e){res.status(500).json({error:"Salvataggio nome non riuscito"});}
});
app.get("/api/leads/saved", auth, async (req,res)=>{
  const searches = await prisma.search.findMany({where:{userId:req.user.userId}, include:{leads:true}, orderBy:{createdAt:"desc"}});
  res.json({searches});
});
app.get("/api/owner/users", auth, owner, async (_,res)=>{
  const users = await prisma.user.findMany({select:{id:true,email:true,fullName:true,role:true,plan:true,createdAt:true}, orderBy:{createdAt:"desc"}});
  res.json({users});
});

const port = process.env.PORT || 5000;
app.listen(port, ()=>console.log(`LeadFinder AI Hacker Pro online on ${port}`));