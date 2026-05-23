function getLanguageName(language) {
  const map = { it: "Italiano", en: "English", es: "Español", fr: "Français" };
  return map[language] || "Italiano";
}

function buildOutreachPrompt({ lead, tone = "professional", length = "medium", language = "it", channel = "email" }) {
  return `
You are an expert B2B sales copywriter.
Generate a high-converting ${channel} outreach message.

Language: ${getLanguageName(language)}
Tone: ${tone}
Length: ${length}

Business:
- Name: ${lead.businessName}
- Niche: ${lead.niche || "local business"}
- City: ${lead.city || ""}
- Rating: ${lead.rating || "unknown"}
- Reviews: ${lead.reviews || 0}
- Website: ${lead.website ? "has website" : "no website detected"}
- Phone available: ${lead.phone ? "yes" : "no"}

Output JSON:
{
  "subject": "...",
  "short": "...",
  "professional": "...",
  "direct": "...",
  "cta": "..."
}
`;
}

function fallbackOutreach({ lead, tone = "professional", language = "it", channel = "email" }) {
  const name = lead.businessName || "la vostra attività";
  const noWebsite = !lead.website;
  const opportunity = noWebsite
    ? "ho notato che non risulta un sito web professionale collegato alla vostra attività"
    : "ho visto la vostra presenza online e credo ci siano margini per aumentare contatti e richieste";
  return {
    subject: `Possibile crescita online per ${name}`,
    short: `Ciao, ${opportunity}. Posso mostrarvi come ottenere più richieste locali con una presenza digitale più efficace?`,
    professional: `Buongiorno, ho analizzato ${name} e ${opportunity}. Un sito moderno, veloce e ottimizzato per Google può aumentare fiducia, richieste e conversioni. Posso inviarvi una proposta semplice con esempi concreti?`,
    direct: `Ciao, state lasciando potenziali clienti ai concorrenti online. Posso prepararvi una soluzione rapida per migliorare visibilità e richieste dal web.`,
    cta: "Posso mandarvi un esempio gratuito di come potrebbe apparire il vostro nuovo sito?"
  };
}

async function generateOutreach(input) {
  if (!process.env.OPENAI_API_KEY) return fallbackOutreach(input);
  try {
    const OpenAI = require("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: "Return only valid JSON. No markdown." },
        { role: "user", content: buildOutreachPrompt(input) }
      ]
    });
    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    return fallbackOutreach(input);
  }
}

module.exports = { generateOutreach, buildOutreachPrompt };
