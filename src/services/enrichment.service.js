const axios = require("axios");

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const SOCIAL_PATTERNS = {
  instagram: /https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._-]+/i,
  facebook: /https?:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9._-]+/i,
  linkedin: /https?:\/\/(www\.)?linkedin\.com\/[^\s"'<>]+/i,
  tiktok: /https?:\/\/(www\.)?tiktok\.com\/@?[a-zA-Z0-9._-]+/i,
  youtube: /https?:\/\/(www\.)?youtube\.com\/[^\s"'<>]+/i,
  whatsapp: /https?:\/\/(wa\.me|api\.whatsapp\.com)\/[^\s"'<>]+/i
};

function unique(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

async function enrichWebsite(lead) {
  if (!lead.website) {
    return { ...lead, enrichmentStatus: "no_website", confidence: 0 };
  }

  try {
    const response = await axios.get(lead.website, {
      timeout: 12000,
      maxRedirects: 4,
      headers: { "User-Agent": "LeadFinderAI/2.0 Contact enrichment bot" }
    });

    const html = String(response.data || "");
    const emails = unique(html.match(EMAIL_REGEX)).slice(0, 5);
    const socials = {};

    for (const [key, regex] of Object.entries(SOCIAL_PATTERNS)) {
      const found = html.match(regex);
      if (found) socials[key] = found[0].replace(/[)"'>]+$/g, "");
    }

    return {
      ...lead,
      email: lead.email || emails[0] || null,
      ...socials,
      enrichmentStatus: "verified",
      confidence: Math.min(100, 30 + emails.length * 20 + Object.keys(socials).length * 10)
    };
  } catch (error) {
    return { ...lead, enrichmentStatus: "failed", confidence: 0, enrichmentError: error.message };
  }
}

module.exports = { enrichWebsite };
