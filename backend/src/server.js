const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Ruta absoluta al geojson (desde backend/src -> ../../data)
const soilPath = path.join(__dirname, "../../data/soil_ensenada.geojson");

let soilData = null;

function loadSoil() {
  const raw = fs.readFileSync(soilPath, "utf8");
  soilData = JSON.parse(raw);
  return soilData;
}

try {
  loadSoil();
  console.log("✅ GeoJSON cargado:", soilPath);
} catch (err) {
  console.error("❌ Error cargando GeoJSON:", err.message);
}

// Healthcheck
app.get("/health", (req, res) => {
  res.json({ ok: true, port: PORT });
});

// Soil
app.get("/soil", (req, res) => {
  if (!soilData) {
    return res.status(500).json({ error: "GeoJSON no cargado" });
  }
  res.json(soilData);
});

app.listen(PORT, () => {
  console.log(`🚀 Backend escuchando en http://localhost:${PORT}`);
});
