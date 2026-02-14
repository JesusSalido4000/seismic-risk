// backend/src/server.js

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const turf = require("@turf/turf");
const GeoTIFF = require("geotiff");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Paths (desde backend/src -> ../../data)
const dataDir = path.join(__dirname, "../../data");
const soilPath = path.join(dataDir, "soil_ensenada.geojson");
const faultsPath = path.join(dataDir, "faults_global.geojson");
const quakesPath = path.join(dataDir, "earthquakes_recent.geojson");
const demPath = path.join(dataDir, "elevation_ensenada.tif");

function loadJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

let soilData = null;
let faultsData = null;
let quakesData = null;

// DEM cache
let dem = null; // { image, bbox, width, height }

async function loadDem() {
  const tiff = await GeoTIFF.fromFile(demPath);
  const image = await tiff.getImage();

  const [minX, minY, maxX, maxY] = image.getBoundingBox(); // [west, south, east, north]
  const width = image.getWidth();
  const height = image.getHeight();

  dem = {
    image,
    bbox: { minX, minY, maxX, maxY },
    width,
    height,
  };

  console.log("✅ DEM cargado");
  console.log(" - bbox:", dem.bbox);
  console.log(" - size:", width, "x", height);
}

function loadAll() {
  soilData = loadJson(soilPath);
  faultsData = loadJson(faultsPath);
  quakesData = loadJson(quakesPath);
}

// Carga inicial
(async () => {
  try {
    loadAll();

    console.log("✅ Datasets cargados");
    console.log(" - soil:", soilPath);
    console.log(" - faults:", faultsPath);
    console.log(" - quakes:", quakesPath);
    console.log(" - dem:", demPath);

    if (fs.existsSync(demPath)) {
      await loadDem();
    } else {
      console.warn("⚠️ DEM no existe:", demPath);
    }
  } catch (err) {
    console.error("❌ Error cargando datasets:", err.message);
  }
})();

// Healthcheck
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    port: PORT,
    data: {
      soil: !!soilData,
      faults: !!faultsData,
      quakes: !!quakesData,
      dem_loaded: !!dem?.image,
      dem_exists: fs.existsSync(demPath),
    },
  });
});

// Soil raw
app.get("/soil", (req, res) => {
  if (!soilData) return res.status(500).json({ error: "soil no cargado" });
  res.json(soilData);
});

// Faults summary
app.get("/faults", (req, res) => {
  if (!faultsData) return res.status(500).json({ error: "faults no cargado" });
  res.json({
    type: faultsData.type,
    features: faultsData.features?.length ?? 0,
  });
});

// Quakes summary
app.get("/quakes", (req, res) => {
  if (!quakesData) return res.status(500).json({ error: "quakes no cargado" });
  res.json({
    type: quakesData.type,
    features: quakesData.features?.length ?? 0,
  });
});

// Soil at coordinate
app.get("/soil/at", (req, res) => {
  if (!soilData) return res.status(500).json({ error: "soil no cargado" });

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "Parámetros requeridos: lat,lng" });
  }

  const pt = turf.point([lng, lat]);
  let found = null;

  for (const feature of soilData.features || []) {
    try {
      if (turf.booleanPointInPolygon(pt, feature)) {
        found = feature;
        break;
      }
    } catch (_) {}
  }

  res.json({
    input: { lat, lng },
    found: !!found,
    properties: found?.properties ?? null,
  });
});

// Elevation at coordinate
app.get("/elevation", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "Parámetros requeridos: lat,lng" });
  }

  if (!dem?.image) {
    return res.status(500).json({ error: "DEM no cargado" });
  }

  const { minX, minY, maxX, maxY } = dem.bbox;

  if (lng < minX || lng > maxX || lat < minY || lat > maxY) {
    return res.status(400).json({
      error: "Coordenada fuera del DEM",
      bbox: dem.bbox,
      input: { lat, lng },
    });
  }

  const xFrac = (lng - minX) / (maxX - minX);
  const yFrac = (maxY - lat) / (maxY - minY);

  const col = Math.floor(xFrac * dem.width);
  const row = Math.floor(yFrac * dem.height);

  try {
    const raster = await dem.image.readRasters({
      window: [col, row, col + 1, row + 1],
      interleave: true,
    });

    const elevation = raster?.[0];

    if (elevation === undefined || elevation === null) {
      return res.json({
        input: { lat, lng },
        elevation_m: null,
        pixel: { row, col },
      });
    }

    res.json({
      input: { lat, lng },
      elevation_m: Number(elevation),
      pixel: { row, col },
    });
  } catch (err) {
    res.status(500).json({
      error: "Error leyendo DEM",
      message: err.message,
    });
  }
});

// RISK (combine soil + elevation + nearest fault + nearby quakes)
app.get("/risk", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusKm = Number(req.query.radiusKm ?? 50);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "Parámetros requeridos: lat,lng" });
  }
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 300) {
    return res.status(400).json({ error: "radiusKm inválido (1..300)" });
  }

  if (!soilData || !faultsData || !quakesData || !dem?.image) {
    return res.status(500).json({ error: "Datasets no listos" });
  }

  const pt = turf.point([lng, lat]);

  // 1) Soil feature
  let soilFeature = null;
  for (const f of soilData.features || []) {
    try {
      if (turf.booleanPointInPolygon(pt, f)) {
        soilFeature = f;
        break;
      }
    } catch (_) {}
  }

  // 2) Elevation inline
  const { minX, minY, maxX, maxY } = dem.bbox;
  let elevation_m = null;

  if (lng >= minX && lng <= maxX && lat >= minY && lat <= maxY) {
    const xFrac = (lng - minX) / (maxX - minX);
    const yFrac = (maxY - lat) / (maxY - minY);
    const col = Math.floor(xFrac * dem.width);
    const row = Math.floor(yFrac * dem.height);

    try {
      const raster = await dem.image.readRasters({
        window: [col, row, col + 1, row + 1],
        interleave: true,
      });
      const v = raster?.[0];
      if (v !== undefined && v !== null) elevation_m = Number(v);
    } catch (_) {}
  }

  // 3) Nearest fault distance (km)
  let nearestFaultKm = null;
  for (const f of faultsData.features || []) {
    try {
      const d = turf.pointToLineDistance(pt, f, { units: "kilometers" });
      if (Number.isFinite(d)) {
        if (nearestFaultKm === null || d < nearestFaultKm) nearestFaultKm = d;
      }
    } catch (_) {}
  }

  // 4) Nearby earthquakes
  let quakesNear = 0;
  let maxMag = null;

  for (const q of quakesData.features || []) {
    const coords = q?.geometry?.coordinates; // [lng, lat, depth]
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const qpt = turf.point([coords[0], coords[1]]);
    const d = turf.distance(pt, qpt, { units: "kilometers" });
    if (d > radiusKm) continue;

    quakesNear++;
    const mag = q?.properties?.mag;
    if (Number.isFinite(mag)) maxMag = maxMag === null ? mag : Math.max(maxMag, mag);
  }

  // 5) Score heuristic 0–100
  let score = 0;

  // Fault: 0km => +45, 50km => ~0
  if (nearestFaultKm !== null) {
    const faultScore = Math.max(0, 45 * (1 - Math.min(nearestFaultKm, 50) / 50));
    score += faultScore;
  }

  // Quakes count: up to +25
  score += Math.min(25, quakesNear);

  // Max magnitude: up to +20
  if (maxMag !== null) score += Math.min(20, (maxMag / 8) * 20);

  // Soil hint: up to +10
  let soilClass = null;
  let soilAmplificationHint = null;

  if (soilFeature?.properties) {
    soilClass = soilFeature.properties.CLASE_TEX ?? null;

    const blob = JSON.stringify(soilFeature.properties).toLowerCase();
    if (blob.includes("arcill") || blob.includes("aluv") || blob.includes("rellen") || blob.includes("lacustr")) {
      soilAmplificationHint = "soft";
      score += 10;
    } else if (blob.includes("roca") || blob.includes("igne") || blob.includes("basalt")) {
      soilAmplificationHint = "rock";
      score -= 5;
    } else {
      soilAmplificationHint = "unknown";
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  res.json({
    input: { lat, lng, radiusKm },
    elevation_m,
    soil: soilFeature ? { properties: soilFeature.properties } : null,
    faults: { nearest_km: nearestFaultKm },
    quakes: { near_count: quakesNear, max_mag: maxMag },
    soil_class: soilClass,
    soil_hint: soilAmplificationHint,
    risk_score_0_100: score,
    notes: {
      model: "v0 heuristic (fault distance + recent quakes + soil hint)",
      next: "Refinar soil amplification por CLASE_TEX real y agregar pendiente (slope) desde DEM",
    },
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend escuchando en http://localhost:${PORT}`);
});
