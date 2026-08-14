import fs from "node:fs";
import path from "node:path";

const inputPath = path.resolve("data/geometry.json");
const outputTownsPath = path.resolve("data/towns.geojson");
const outputCountiesPath = path.resolve("data/counties.geojson");

const REGION_BOUNDS = {
  main: { west: 120.0, south: 21.86, east: 122.04, north: 25.34 },
  kinmen: { west: 118.18, south: 24.35, east: 118.5, north: 24.56 },
  matsu: { west: 119.88, south: 25.92, east: 120.33, north: 26.3 },
};

const geometry = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const towns = {
  type: "FeatureCollection",
  features: geometry.towns
    .map((town) => buildFeature(geometry, town.path, town.region, {
      code: town.code,
      county: town.county,
      town: town.town,
      towneng: town.towneng,
      region: town.region,
    }))
    .filter(Boolean),
};

const counties = {
  type: "FeatureCollection",
  features: (geometry.counties || [])
    .map((county) => buildFeature(geometry, county.path, county.region, {
      county: county.county,
      region: county.region,
    }))
    .filter(Boolean),
};

fs.writeFileSync(outputTownsPath, `${JSON.stringify(towns)}\n`, "utf8");
fs.writeFileSync(outputCountiesPath, `${JSON.stringify(counties)}\n`, "utf8");

console.log(`Wrote ${outputTownsPath}`);
console.log(`Wrote ${outputCountiesPath}`);

function buildFeature(geometry, pathData, regionKey, properties) {
  const bounds = REGION_BOUNDS[regionKey];
  if (!bounds) return null;
  const rings = parseSvgPathToRings(pathData)
    .map((ring) => ring.map(([x, y]) => svgPointToLonLat(geometry, x, y, regionKey)))
    .filter((ring) => ring.length >= 4);
  if (!rings.length) return null;
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "MultiPolygon",
      coordinates: rings.map((ring) => [[...ring]]),
    },
  };
}

function svgPointToLonLat(geometry, x, y, regionKey) {
  const region = geometry.regions[regionKey];
  const bounds = REGION_BOUNDS[regionKey];
  const nx = (x - region.x) / region.width;
  const ny = (y - region.y) / region.height;
  const lon = bounds.west + nx * (bounds.east - bounds.west);
  const lat = bounds.north - ny * (bounds.north - bounds.south);
  return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
}

function parseSvgPathToRings(pathData) {
  const tokens = pathData.match(/[MLHVZmlhvz]|-?\d*\.?\d+/g) || [];
  const rings = [];
  let cursor = [0, 0];
  let ring = [];
  let command = null;
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[MLHVZmlhvz]$/.test(token)) {
      command = token;
      index += 1;
      if (command === "Z" || command === "z") {
        if (ring.length) {
          closeRing(ring);
          rings.push(ring);
          ring = [];
        }
      }
      continue;
    }

    if (!command) {
      index += 1;
      continue;
    }

    const lower = command.toLowerCase();
    const isRelative = command === lower;
    if (lower === "m" || lower === "l") {
      const x = Number(tokens[index]);
      const y = Number(tokens[index + 1]);
      index += 2;
      cursor = isRelative ? [cursor[0] + x, cursor[1] + y] : [x, y];
      if (lower === "m") {
        if (ring.length) {
          closeRing(ring);
          rings.push(ring);
        }
        ring = [cursor];
        command = isRelative ? "l" : "L";
      } else {
        ring.push(cursor);
      }
      continue;
    }

    if (lower === "h") {
      const x = Number(tokens[index]);
      index += 1;
      cursor = isRelative ? [cursor[0] + x, cursor[1]] : [x, cursor[1]];
      ring.push(cursor);
      continue;
    }

    if (lower === "v") {
      const y = Number(tokens[index]);
      index += 1;
      cursor = isRelative ? [cursor[0], cursor[1] + y] : [cursor[0], y];
      ring.push(cursor);
      continue;
    }

    index += 1;
  }

  if (ring.length) {
    closeRing(ring);
    rings.push(ring);
  }

  return rings;
}

function closeRing(ring) {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push(first);
  }
}
