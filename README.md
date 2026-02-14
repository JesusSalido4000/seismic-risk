# Seismic Risk API — Ensenada, Baja California

API geoespacial para estimar riesgo sísmico utilizando datos reales de elevación, suelo, fallas geológicas y actividad sísmica reciente.

Este sistema está diseñado como una base técnica para análisis geotécnico, evaluación estructural, planeación urbana y visualización geoespacial.

---

# Descripción general

El sistema integra múltiples fuentes de datos geoespaciales:

* Modelo Digital de Elevación (DEM) — INEGI
* Clasificación de suelo — INEGI
* Fallas geológicas — USGS
* Terremotos recientes — USGS

El backend procesa estos datos y calcula un puntaje de riesgo sísmico basado en:

* Distancia a fallas geológicas
* Actividad sísmica reciente
* Tipo de suelo (textura)
* Elevación del terreno

---

# Arquitectura del proyecto

```
seismic-risk/
│
├── backend/
│   ├── src/
│   │   └── server.js
│   │
│   ├── package.json
│   └── node_modules/
│
├── data/
│   ├── soil_ensenada.geojson
│   ├── faults_global.geojson
│   ├── earthquakes_recent.geojson
│   └── elevation_ensenada.tif
│
└── README.md
```

---

# Stack tecnológico

Backend:

* Node.js
* Express
* GeoTIFF.js
* Turf.js

Procesamiento geoespacial:

* GeoJSON
* GeoTIFF raster
* GDAL (preprocesamiento)

Fuentes de datos:

* INEGI — Continuo de Elevaciones Mexicano
* INEGI — Edafología
* USGS — Earthquake Catalog
* USGS — Fault Database

---

# Ejecución del sistema

Requisitos:

* Node.js 18 o superior
* Linux o WSL recomendado

Instalación:

```
cd backend
npm install
```

Ejecución:

```
npm run dev
```

Servidor disponible en:

```
http://localhost:3001
```

---

# Endpoints disponibles

## Health check

```
GET /health
```

Ejemplo:

```
curl http://localhost:3001/health
```

---

## Tipo de suelo en coordenada

```
GET /soil/at?lat=31.8667&lng=-116.5964
```

---

## Elevación del terreno

```
GET /elevation?lat=31.8667&lng=-116.5964
```

---

## Fallas geológicas

```
GET /faults
```

---

## Terremotos recientes

```
GET /quakes
```

---

## Cálculo de riesgo sísmico

```
GET /risk?lat=31.8667&lng=-116.5964&radiusKm=50
```

Ejemplo de respuesta:

```
{
  "elevation_m": 36,
  "faults": {
    "nearest_km": 14.65
  },
  "quakes": {
    "near_count": 2,
    "max_mag": 2.81
  },
  "soil_class": "MEDIA",
  "risk_score_0_100": 41
}
```

---

# Modelo de riesgo actual

Modelo heurístico basado en:

* Distancia a fallas
* Actividad sísmica reciente
* Clasificación de suelo
* Elevación

Versión actual:

```
v0 — heurístico inicial
```

Mejoras futuras:

* Amplificación sísmica basada en Vs30
* Pendiente del terreno (slope)
* Modelo probabilístico
* Integración con mapas interactivos

---

# Uso previsto

Aplicaciones potenciales:

* Evaluación de riesgo estructural
* Planeación urbana
* Ingeniería civil
* Sistemas geoespaciales
* Visualización GIS
* Sistemas de monitoreo

---

# Desarrollo asistido por IA

Este sistema fue diseñado, implementado y validado por el autor utilizando herramientas modernas de ingeniería de software.

Se utilizó inteligencia artificial como herramienta de productividad para acelerar el desarrollo, integración de datos geoespaciales y validación técnica.

Todas las decisiones de arquitectura, integración y modelo fueron definidas y controladas por el autor.

---

# Estado del proyecto

Backend funcional
Procesamiento geoespacial operativo
Modelo inicial de riesgo implementado

Versión actual:

```
v0.1
```

---

# Autor

**Jesús Salido**
Desarrollador de Seismic Risk API
Ensenada, Baja California, México

GitHub: https://github.com/JesusSalido4000

---

# Licencia

Todos los derechos reservados.

Este software es propiedad de Jesús Salido.

No se permite copiar, modificar, distribuir o utilizar este software sin autorización explícita del autor.
