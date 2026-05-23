const axios = require("axios");

const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

function normalizePlace(place, niche, city) {
  return {
    businessName: place.displayName?.text || "Unknown business",
    address: place.formattedAddress || null,
    phone: place.nationalPhoneNumber || place.internationalPhoneNumber || null,
    website: place.websiteUri || null,
    mapsUrl: place.googleMapsUri || null,
    placeId: place.id || null,
    rating: place.rating || null,
    reviews: place.userRatingCount || 0,
    niche,
    city
  };
}

async function searchGooglePlaces({ niche, city, maxResults = 20 }) {
  if (!process.env.GOOGLE_API_KEY) {
    return demoPlaces(niche, city);
  }

  const response = await axios.post(
    GOOGLE_PLACES_URL,
    { textQuery: `${niche} ${city}`, maxResultCount: Math.min(maxResults, 20) },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_API_KEY,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.rating",
          "places.userRatingCount",
          "places.googleMapsUri",
          "places.websiteUri",
          "places.nationalPhoneNumber",
          "places.internationalPhoneNumber"
        ].join(",")
      },
      timeout: 25000
    }
  );

  return (response.data.places || []).map(p => normalizePlace(p, niche, city));
}

function demoPlaces(niche, city) {
  return Array.from({ length: 8 }).map((_, index) => ({
    businessName: `${niche} Demo ${index + 1}`,
    address: `Via Demo ${index + 1}, ${city}`,
    phone: index % 2 === 0 ? `+39 02 0000 ${1000 + index}` : null,
    website: index % 3 === 0 ? `https://example-${index}.com` : null,
    mapsUrl: "https://maps.google.com",
    placeId: `demo-${Date.now()}-${index}`,
    rating: 3.8 + (index % 12) / 10,
    reviews: 12 + index * 18,
    niche,
    city
  }));
}

module.exports = { searchGooglePlaces };
