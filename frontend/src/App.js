import React, { useMemo, useState } from "react";
import axios from "axios";
import MapComponent from "./MapComponent";
import FareResults from "./FareResults";
import "./App.css";

const API_BASE =
  process.env.NODE_ENV === "development" ? "" : (process.env.REACT_APP_API_URL || "http://localhost:5000");

function App() {
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const handleCalculate = async () => {
    const trimmedPickup = pickup?.trim();
    const trimmedDrop = drop?.trim();

    if (!trimmedPickup || !trimmedDrop) {
      setResult({ error: "Please select valid pickup/drop location." });
      return;
    }

    setLoading(true);
    setResult(null);
    setLoadingStep("Fetching route...");

    try {
      const response = await axios.post(`${API_BASE}/calculate`, {
        pickup: trimmedPickup,
        drop: trimmedDrop
      });

      setLoadingStep("Analyzing surge, wait times & ETA...");
      setResult(response.data);
    } catch (err) {
      const errorMsg =
        err.response?.data?.error ||
        (err.code === "ERR_NETWORK"
          ? "Unable to fetch real-time data. Please check if the backend is running."
          : "Unable to fetch real-time data. Showing estimated pricing.");

      setResult({
        error: errorMsg,
        isFallback: err.response?.status === 500 || err.code === "ERR_NETWORK"
      });
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  const pickupPoint = useMemo(() => result?.pickup || null, [result]);
  const dropPoint = useMemo(() => result?.drop || null, [result]);
  const routeGeoJson = useMemo(() => result?.routeGeoJson || null, [result]);

  return (
    <div className="cc-page">
      <div className="cc-card">
        <div className="cc-titleRow">
          <h2 className="cc-title">Routes</h2>
        </div>

        <div className="cc-inputGroup">
          <div className="cc-inputWrap">
            <div className="cc-label">FROM</div>
            <input
              className="cc-input"
              type="text"
              placeholder="Enter pickup location"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="cc-inputWrap">
            <div className="cc-label to">TO</div>
            <input
              className="cc-input"
              type="text"
              placeholder="Enter drop location"
              value={drop}
              onChange={(e) => setDrop(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <button className="cc-primaryBtn" onClick={handleCalculate} disabled={loading}>
          {loading ? "Estimating..." : "Get Fare Estimates"}
        </button>
      </div>

      {loading ? (
        <div className="cc-loadingCard">
          <div className="cc-loadingIcon">🚕</div>
          <div className="cc-loadingTitle">Compare Rides</div>
          <div className="cc-loadingSub">{loadingStep || "Analyzing surge, wait times & ETA..."}</div>
        </div>
      ) : null}

      {result ? (
        <FareResults
          data={result}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
      ) : null}

      <MapComponent pickup={pickupPoint} drop={dropPoint} routeGeoJson={routeGeoJson} />
    </div>
  );
}

export default App;
