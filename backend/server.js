const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

/* ----------------------------------------
   Nominatim: comply with usage policy (1 req/sec, identifiable User-Agent)
   https://operations.osmfoundation.org/policies/nominatim/
-----------------------------------------*/
const NOMINATIM_HEADERS = {
  "User-Agent": "CabCompareFareApp/1.0 (Node.js; educational/portfolio project)",
  "Accept": "application/json",
  "Accept-Language": "en"
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.get("/suggest", async (req, res) => {
  const q = typeof req.query?.q === "string" ? req.query.q.trim() : "";
  if (!q || q.length < 2) return res.json({ suggestions: [] });

  try {
    const r = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: { q, format: "json", addressdetails: 1, limit: 8 },
      headers: NOMINATIM_HEADERS,
      timeout: 8000
    });

    const raw = Array.isArray(r.data) ? r.data : [];
    const suggestions = raw.map((x) => ({
      id: String(x.place_id || x.osm_id || Math.random()),
      label: x.display_name || "",
      lat: parseFloat(x.lat),
      lon: parseFloat(x.lon)
    })).filter((s) => s.label);

    res.json({ suggestions });
  } catch (e) {
    console.error("Suggest error:", e.message);
    res.status(200).json({ suggestions: [] });
  }
});

/* ----------------------------------------
   Surge Engine - capped at 2.0
-----------------------------------------*/
function getSurgeMultiplier() {
  const hour = new Date().getHours();
  let surge = 1.0;

  if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20)) {
    surge = 1.3;
  } else if (hour >= 22 || hour <= 5) {
    surge = 1.2;
  }

  return Math.min(surge, 2.0);
}

const MIN_FARE = { micro: 60, sedan: 80, suv: 100, mini: 50, primeSedan: 75, primeSUV: 95, auto: 30, uberGo: 55, premier: 85, uberXL: 100 };

function applyMinFare(baseFare, cabKey) {
  const min = MIN_FARE[cabKey] || 40;
  return Math.max(baseFare, min);
}

/* ----------------------------------------
   Fare Calculator (city + outstation)
-----------------------------------------*/
function calculateFares(distanceKm, durationMin, surge) {
  const isOutstation = distanceKm > 40;
  const outstationFactor = isOutstation ? 1.15 : 1;

  const baseFares = {
    redTaxi: {
      micro: 60 + distanceKm * 11 + durationMin * 1,
      sedan: 80 + distanceKm * 14 + durationMin * 1.5,
      suv: 100 + distanceKm * 18 + durationMin * 2
    },
    ola: {
      mini: 50 + distanceKm * 12 + durationMin * 1,
      primeSedan: 75 + distanceKm * 15 + durationMin * 1.5,
      primeSUV: 95 + distanceKm * 20 + durationMin * 2,
      auto: 30 + distanceKm * 9 + durationMin * 0.8
    },
    uber: {
      uberGo: 55 + distanceKm * 13 + durationMin * 1,
      premier: 85 + distanceKm * 16 + durationMin * 1.5,
      uberXL: 100 + distanceKm * 19 + durationMin * 2,
      auto: 35 + distanceKm * 10 + durationMin * 0.8
    }
  };

  const fares = {};
  for (const [service, cabTypes] of Object.entries(baseFares)) {
    fares[service] = {};
    for (const [type, raw] of Object.entries(cabTypes)) {
      const afterSurge = raw * surge * outstationFactor;
      fares[service][type] = Math.round(applyMinFare(afterSurge, type) * 100) / 100;
    }
  }
  return fares;
}

/* ----------------------------------------
   Fallback: known city coords when Nominatim fails
-----------------------------------------*/
const FALLBACK_COORDS = [
  { match: /coimbatore.*airport|airport.*coimbatore/i, lat: 11.0308, lon: 77.0432 },
  { match: /chennai.*airport|airport.*chennai|madras.*airport/i, lat: 12.9944, lon: 80.1807 },
  { match: /bangalore.*airport|airport.*bangalore|bengaluru.*airport/i, lat: 13.1986, lon: 77.7066 },
  { match: /psg.*institute|psg.*technology/i, lat: 11.0168, lon: 76.9558 },
  { match: /coimbatore|kovai/i, lat: 11.0168, lon: 76.9558 },
  { match: /chennai|madras/i, lat: 13.0827, lon: 80.2707 },
  { match: /salem/i, lat: 11.6643, lon: 78.146 },
  { match: /bangalore|bengaluru/i, lat: 12.9716, lon: 77.5946 },
  { match: /mumbai|bombay/i, lat: 19.076, lon: 72.8777 },
  { match: /delhi|new delhi/i, lat: 28.6139, lon: 77.209 },
  { match: /hyderabad/i, lat: 17.385, lon: 78.4867 }
];

function getFallbackCoords(query) {
  const q = String(query || "").toLowerCase();
  for (const { match, lat, lon } of FALLBACK_COORDS) {
    if (match.test(q)) return { lat, lon };
  }
  return null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function buildFallbackRoute(pickupLat, pickupLon, dropLat, dropLon) {
  return {
    type: "LineString",
    coordinates: [
      [parseFloat(pickupLon), parseFloat(pickupLat)],
      [parseFloat(dropLon), parseFloat(dropLat)]
    ]
  };
}

/* ----------------------------------------
   Main API Route
-----------------------------------------*/
app.post("/calculate", async (req, res) => {
  const { pickup, drop } = req.body;

  const trimmedPickup = typeof pickup === "string" ? pickup.trim() : "";
  const trimmedDrop = typeof drop === "string" ? drop.trim() : "";

  if (!trimmedPickup || !trimmedDrop) {
    return res.status(400).json({ error: "Please select valid pickup/drop location." });
  }

  let pickupLat, pickupLon, dropLat, dropLon, distanceKm, durationMin, routeGeoJson;
  let usedFallback = false;

  try {
    /* -------------------------
       1. Geocoding (Nominatim) with fallback
    --------------------------*/
    let gotPickup = false;
    let gotDrop = false;

    try {
      const pickupRes = await axios.get(
        "https://nominatim.openstreetmap.org/search",
        { 
          params: { q: trimmedPickup, format: "json", limit: 1, addressdetails: 1 }, 
          headers: NOMINATIM_HEADERS, 
          timeout: 10000 
        }
      );
      if (pickupRes.data?.length && pickupRes.data[0].lat && pickupRes.data[0].lon) {
        pickupLat = parseFloat(pickupRes.data[0].lat);
        pickupLon = parseFloat(pickupRes.data[0].lon);
        if (!isNaN(pickupLat) && !isNaN(pickupLon)) {
          gotPickup = true;
          console.log(`✓ Geocoded pickup: ${trimmedPickup} -> ${pickupLat}, ${pickupLon}`);
        }
      }
    } catch (e) {
      console.warn("Nominatim pickup failed:", e.message);
    }

    await delay(1100);

    try {
      const dropRes = await axios.get(
        "https://nominatim.openstreetmap.org/search",
        { 
          params: { q: trimmedDrop, format: "json", limit: 1, addressdetails: 1 }, 
          headers: NOMINATIM_HEADERS, 
          timeout: 10000 
        }
      );
      if (dropRes.data?.length && dropRes.data[0].lat && dropRes.data[0].lon) {
        dropLat = parseFloat(dropRes.data[0].lat);
        dropLon = parseFloat(dropRes.data[0].lon);
        if (!isNaN(dropLat) && !isNaN(dropLon)) {
          gotDrop = true;
          console.log(`✓ Geocoded drop: ${trimmedDrop} -> ${dropLat}, ${dropLon}`);
        }
      }
    } catch (e) {
      console.warn("Nominatim drop failed:", e.message);
    }

    if (!gotPickup) {
      const fb = getFallbackCoords(trimmedPickup);
      if (fb) {
        pickupLat = fb.lat;
        pickupLon = fb.lon;
        usedFallback = true;
      } else {
        return res.status(400).json({ error: `Could not find location: ${trimmedPickup}. Please try a more specific address.` });
      }
    }
    if (!gotDrop) {
      const fb = getFallbackCoords(trimmedDrop);
      if (fb) {
        dropLat = fb.lat;
        dropLon = fb.lon;
        usedFallback = true;
      } else {
        return res.status(400).json({ error: `Could not find location: ${trimmedDrop}. Please try a more specific address.` });
      }
    }

    /* -------------------------
       2. Routing (OSRM) with fallback
    --------------------------*/
    try {
      const routeRes = await axios.get(
        `https://router.project-osrm.org/route/v1/driving/${pickupLon},${pickupLat};${dropLon},${dropLat}?overview=full&geometries=geojson`,
        { timeout: 10000 }
      );
      if (routeRes.data?.routes?.length) {
        const r = routeRes.data.routes[0];
        distanceKm = (r.distance || 0) / 1000;
        durationMin = (r.duration || 0) / 60;
        routeGeoJson = r.geometry || buildFallbackRoute(pickupLat, pickupLon, dropLat, dropLon);
      } else throw new Error("No routes");
    } catch (e) {
      console.warn("OSRM failed:", e.message);
      usedFallback = true;
      distanceKm = haversineKm(pickupLat, pickupLon, dropLat, dropLon);
      durationMin = Math.max(10, distanceKm * 2.5);
      routeGeoJson = buildFallbackRoute(pickupLat, pickupLon, dropLat, dropLon);
    }

    if (distanceKm < 0.5) distanceKm = 5;
    if (durationMin < 5) durationMin = 15;

    /* -------------------------
       3. Fare Calculation
    --------------------------*/
    const surge = getSurgeMultiplier();
    const fares = calculateFares(distanceKm, durationMin, surge);
    const isOutstation = distanceKm > 40;

    res.json({
      pickup: { lat: pickupLat, lon: pickupLon },
      drop: { lat: dropLat, lon: dropLon },
      routeGeoJson,
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      durationMin: parseFloat(durationMin.toFixed(2)),
      surgeMultiplier: surge,
      isOutstation: !!isOutstation,
      fares,
      estimated: usedFallback
    });
  } catch (error) {
    console.error("Backend Error:", error.message);
    const fbPickup = getFallbackCoords(trimmedPickup);
    const fbDrop = getFallbackCoords(trimmedDrop);
    
    if (!fbPickup || !fbDrop) {
      return res.status(400).json({ 
        error: "Unable to determine locations. Please use more specific addresses or city names." 
      });
    }
    
    distanceKm = haversineKm(fbPickup.lat, fbPickup.lon, fbDrop.lat, fbDrop.lon) || 12;
    durationMin = Math.max(15, distanceKm * 2.5);

    const surge = getSurgeMultiplier();
    const fares = calculateFares(distanceKm, durationMin, surge);

    res.json({
      pickup: fbPickup,
      drop: fbDrop,
      routeGeoJson: buildFallbackRoute(fbPickup.lat, fbPickup.lon, fbDrop.lat, fbDrop.lon),
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      durationMin: parseFloat(durationMin.toFixed(2)),
      surgeMultiplier: surge,
      isOutstation: distanceKm > 40,
      fares,
      estimated: true
    });
  }
});

/* ----------------------------------------
   Start Server
-----------------------------------------*/
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
