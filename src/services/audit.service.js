function auditWebsite(lead) {
  const hasWebsite = Boolean(lead.website);
  const seoScore = hasWebsite ? 55 : 5;
  const uxScore = hasWebsite ? 60 : 0;
  const performance = hasWebsite ? 58 : 0;
  const mobileScore = hasWebsite ? 62 : 0;
  const brandingScore = hasWebsite ? 52 : 8;

  const issues = [];
  const opportunities = [];

  if (!hasWebsite) {
    issues.push("No website detected from Google Places data.");
    opportunities.push("Create a fast mobile-first website with SEO local pages.");
    opportunities.push("Add Google Maps CTA, WhatsApp button and trust reviews.");
  } else {
    issues.push("Website exists but requires deeper audit for SEO, UX and conversion.");
    opportunities.push("Improve landing pages, CTA hierarchy and performance.");
  }

  if ((lead.rating || 0) > 4.2 && (lead.reviews || 0) > 30) {
    opportunities.push("Strong reputation can be used as conversion proof on website.");
  }

  return {
    seoScore,
    uxScore,
    performance,
    mobileScore,
    brandingScore,
    summary: hasWebsite
      ? "This business may benefit from a conversion and SEO audit."
      : "This business likely needs a professional website urgently.",
    issues,
    opportunities
  };
}

module.exports = { auditWebsite };
