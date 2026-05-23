function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function leadsToCsv(leads) {
  const headers = [
    "business name","phone","address","rating","reviews","website",
    "niche","city","AI score","opportunity level","email","instagram","facebook","linkedin","whatsapp"
  ];
  const rows = leads.map(lead => [
    lead.businessName, lead.phone, lead.address, lead.rating, lead.reviews, lead.website,
    lead.niche, lead.city, lead.aiScore, lead.opportunityLevel, lead.email,
    lead.instagram, lead.facebook, lead.linkedin, lead.whatsapp
  ]);
  return "\uFEFF" + [headers, ...rows].map(row => row.map(csvEscape).join(",")).join("\n");
}

function leadsToJson(leads) {
  return JSON.stringify({ exportedAt: new Date().toISOString(), count: leads.length, leads }, null, 2);
}

module.exports = { leadsToCsv, leadsToJson };
