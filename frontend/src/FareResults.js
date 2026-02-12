import React from "react";

const CATEGORIES = [
  "All",
  "Auto",
  "Cab Economy",
  "Cab Premium",
  "Cab XL"
];

function hashStringTo01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function roundToNearest(value, step) {
  return Math.round(value / step) * step;
}

function formatEstimatedPrice(service, type, price, distanceKm) {
  const seed = `${service}:${type}:${distanceKm}`;
  const r = hashStringTo01(seed);

  const showRange = r < 0.75;
  const jitterPct = 0.06 + (r % 0.07);
  const step = price < 200 ? 5 : price < 600 ? 10 : 20;

  if (!showRange) {
    const approx = roundToNearest(price * (1 + (r - 0.5) * 0.06), step);
    return `₹ ~${approx}`;
  }

  const low = roundToNearest(price * (1 - jitterPct), step);
  const high = roundToNearest(price * (1 + jitterPct), step);
  return `₹ ${Math.min(low, high)}–${Math.max(low, high)}`;
}

function categoryFor(service, type) {
  const t = String(type).toLowerCase();

  if (t.includes("auto")) return "Auto";
  if (t.includes("xl") || t.includes("suv")) return "Cab XL";

  if (t.includes("prime") || t.includes("premier")) return "Cab Premium";
  return "Cab Economy";
}

function labelFor(service, type) {
  const svc = String(service).toLowerCase();
  const niceService = svc === "uber" ? "Uber" : svc === "ola" ? "Ola" : "RedTaxi";

  const niceType = String(type)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase());

  return `${niceService} ${niceType}`;
}

function FareResults({ data, selectedCategory = "All", onSelectCategory }) {
  const [selectedRideKey, setSelectedRideKey] = React.useState(null);

  if (!data) return null;

  const { error, isFallback, distanceKm, durationMin, fares, isOutstation } = data;

  if (error) {
    return (
      <div
        style={{
          marginTop: "20px",
          padding: "16px",
          backgroundColor: isFallback ? "#fff3cd" : "#f8d7da",
          border: `1px solid ${isFallback ? "#ffc107" : "#f5c6cb"}`,
          borderRadius: "8px",
          color: "#721c24"
        }}
      >
        <strong>⚠ {error}</strong>
      </div>
    );
  }

  const allRides = [];
  if (fares) {
    Object.entries(fares).forEach(([service, cabTypes]) => {
      Object.entries(cabTypes).forEach(([type, price]) => {
        allRides.push({
          service,
          type,
          price: Number(price),
          category: categoryFor(service, type),
          label: labelFor(service, type)
        });
      });
    });
  }

  const filtered = allRides
    .filter((r) => selectedCategory === "All" || r.category === selectedCategory)
    .sort((a, b) => a.price - b.price);

  const cheapestPrice = filtered.length ? Math.min(...filtered.map((f) => f.price)) : null;

  return (
    <div style={{ marginTop: "14px" }}>
      <div className="cc-card">
        <div className="cc-rowBetween">
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Compare Rides</div>
            <div className="cc-subtle">
              {distanceKm} km · {durationMin} min{isOutstation ? " · Outstation" : ""}
            </div>
          </div>
          <button
            className="cc-clearBtn"
            onClick={() => onSelectCategory?.("All")}
            type="button"
          >
            Clear All
          </button>
        </div>

        <div style={{ marginTop: 14, fontWeight: 800 }}>Filter by Category</div>
        <div className="cc-chipRow">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`cc-chip ${selectedCategory === c ? "cc-chipActive" : ""}`}
              onClick={() => onSelectCategory?.(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 12 }}>
          {filtered.map((r) => {
            const key = `${r.service}:${r.type}`;
            const isCheapest = cheapestPrice !== null && r.price <= cheapestPrice + 0.01;
            const isSelected = selectedRideKey === key;
            const etaMin = Math.max(2, Math.round(Number(durationMin) + (hashStringTo01(key) * 6 - 2)));
            const est = formatEstimatedPrice(r.service, r.type, r.price, distanceKm);

            return (
              <div
                key={key}
                className={`cc-rideItem ${isSelected ? "cc-rideItemActive" : ""}`}
                onClick={() => setSelectedRideKey(key)}
                role="button"
                tabIndex={0}
              >
                <div>
                  <div className="cc-rideTitle">
                    {r.label} {isCheapest ? <span style={{ color: "#12b76a" }}>· Cheapest</span> : null}
                  </div>
                  <div className="cc-rideMeta">{etaMin} min</div>
                </div>
                <div className="cc-ridePrice">{est}</div>
              </div>
            );
          })}
        </div>

        {selectedRideKey ? (
          <div className="cc-bottomCTA">
            <button className="cc-bookBtn" type="button">
              Book {filtered.find((r) => `${r.service}:${r.type}` === selectedRideKey)?.label || "Ride"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default FareResults;
