function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function scoreLead(lead) {
  let score = 35;
  const breakdown = [];

  if (!lead.website) {
    score += 25;
    breakdown.push({ label: "No website detected", points: 25, reason: "High opportunity for website sales." });
  } else {
    score -= 10;
    breakdown.push({ label: "Website exists", points: -10, reason: "May need audit instead of new website." });
  }

  if ((lead.rating || 0) >= 4.4) {
    score += 12;
    breakdown.push({ label: "Strong reputation", points: 12, reason: "Good reviews indicate active business." });
  }

  if ((lead.reviews || 0) >= 50) {
    score += 14;
    breakdown.push({ label: "High review volume", points: 14, reason: "Business likely has traffic and budget." });
  } else if ((lead.reviews || 0) < 10) {
    score -= 5;
    breakdown.push({ label: "Low review volume", points: -5, reason: "May be less mature." });
  }

  if (lead.phone) {
    score += 8;
    breakdown.push({ label: "Phone available", points: 8, reason: "Easy outreach path." });
  }

  const socialCount = ["instagram","facebook","linkedin","tiktok","youtube","whatsapp"].filter(k => lead[k]).length;
  if (socialCount >= 2) {
    score += 10;
    breakdown.push({ label: "Social presence", points: 10, reason: "Marketing-aware business." });
  }

  const finalScore = clamp(score);
  const level = finalScore >= 85 ? "very hot" : finalScore >= 70 ? "hot" : finalScore >= 50 ? "warm" : "cold";

  return {
    score: finalScore,
    level,
    breakdown,
    explanation: breakdown.map(b => `${b.label}: ${b.reason}`).join(" ")
  };
}

function contactQuality(lead) {
  let score = 0;
  if (lead.phone) score += 25;
  if (lead.email) score += 30;
  if (lead.website) score += 10;
  if (lead.instagram) score += 10;
  if (lead.facebook) score += 10;
  if (lead.linkedin) score += 10;
  if (lead.whatsapp) score += 15;
  return clamp(score);
}

module.exports = { scoreLead, contactQuality };
