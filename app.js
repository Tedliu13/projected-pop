import { feature as topojsonFeature } from "./vendor/topojson-client.mjs";

const CESIUM_ION_ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyZjI0NDZjYS02YjRlLTRkNzQtOTkyMi1lMTllN2U0NTdjOWIiLCJpZCI6Mjg5NDQwLCJpYXQiOjE3NDM0MTExNTl9.YipWOIxM9T1BTJ89miUOM9NUQu8IVYUpE8NPxDzh0r8";
const BING_MAPS_KEY = window.BING_MAPS_KEY || "YOUR_BING_MAPS_KEY";
const DEFAULT_TREND_TYPE = "exponential";
const DEFAULT_SAMPLE_WINDOW = "5y_2021_2025";
const DEFAULT_SCENARIO_KEY = "taiwan|中推估";
const DEFAULT_PALETTE_KEY = "red";
const YEAR_PLAY_INTERVAL_MS = 900;
const TOPO_TOWN_CODES = [
  "63000", "64000", "65000", "66000", "67000", "68000",
  "10002", "10004", "10005", "10007", "10008", "10009",
  "10010", "10013", "10014", "10015", "10016", "10017",
  "10018", "10020", "09007", "09020",
];

const state = {
  geometry: null,
  trends: null,
  projections: null,
  geojson: null,
  regionGeometryBounds: null,
  regionTransforms: null,
  selectedCode: null,
  selectedScenarioKey: DEFAULT_SCENARIO_KEY,
  selectedPaletteKey: DEFAULT_PALETTE_KEY,
  year: "2025",
  years: [],
  playTimer: null,
  hoverCode: null,
  selectedCountyCode: null,
  countyBounds: null,
  townCenters: null,
  map: null,
  townDataSource: null,
  countyDataSource: null,
  townOutlineDataSource: null,
  countyOutlineDataSource: null,
  selectedTownLabelEntity: null,
};

const els = {
  scenarioSelect: document.getElementById("scenarioSelect"),
  paletteSelect: document.getElementById("paletteSelect"),
  playYearsBtn: document.getElementById("playYearsBtn"),
  stopYearsBtn: document.getElementById("stopYearsBtn"),
  yearRange: document.getElementById("yearRange"),
  yearValue: document.getElementById("yearValue"),
  yearTicks: document.getElementById("yearTicks"),
  mapTitle: document.getElementById("mapTitle"),
  chartTitle: document.getElementById("chartTitle"),
  chartSvg: document.getElementById("chartSvg"),
  townSummary: document.getElementById("townSummary"),
  legend: document.getElementById("legend"),
  mapSvg: document.getElementById("mapSvg"),
  mapViewport: document.getElementById("mapViewport"),
  mapSceneContainer: document.getElementById("mapSceneContainer"),
  mapStage: document.getElementById("mapStage"),
  townLayer: document.getElementById("townLayer"),
  countyLayer: document.getElementById("countyLayer"),
  insetLayer: document.getElementById("insetLayer"),
  tooltip: document.getElementById("tooltip"),
  mapTokenNotice: document.getElementById("mapTokenNotice"),
};

const townNodes = new Map();
const townEntities = new Map();
const geometryTownIndex = new Map();
const projectionCodeIndex = new Map();
const MAP_ALIGNMENT = {
  scale: 1.08,
  translateX: 0.018,
  translateY: 0.012,
};
const REGION_BOUNDS = {
  main: { west: 120.0, south: 21.86, east: 122.04, north: 25.34 },
  kinmen: { west: 118.18, south: 24.35, east: 118.5, north: 24.56 },
  matsu: { west: 119.88, south: 25.92, east: 120.33, north: 26.3 },
};
const MAINLAND_CONTROL_POINTS = {
  "10017010": { lon: 121.75, lat: 25.13 }, // 基隆市中正區
  "65000100": { lon: 121.44, lat: 25.17 }, // 新北市淡水區
  "10002040": { lon: 121.82, lat: 24.86 }, // 宜蘭縣頭城鎮
  "10014020": { lon: 121.38, lat: 23.1 }, // 臺東縣成功鎮
  "64000100": { lon: 120.28, lat: 22.61 }, // 高雄市旗津區
  "10013040": { lon: 120.74, lat: 22.0 }, // 屏東縣恆春鎮
};
const TAIWAN_VIEW_RECTANGLE = Cesium?.Rectangle?.fromDegrees
  ? Cesium.Rectangle.fromDegrees(118.7, 21.75, 122.1, 25.55)
  : null;
const OUTLINE_STYLE = {
  town: {
    color: "rgba(232,244,255,0.22)",
    widthMin: 0.45,
    widthMax: 0.85,
  },
  county: {
    color: "rgba(255,255,255,0.82)",
    widthMin: 1.1,
    widthMax: 2.4,
  },
  selected: {
    color: Cesium?.Color?.WHITE ?? "#ffffff",
    widthBoost: 1.35,
  },
};
const COLOR_PALETTES = {
  rainbow: {
    gradient: "linear-gradient(90deg, #f4fbff 0%, #46b5ff 18%, #19d42b 38%, #fff04a 58%, #ff9a2f 74%, #e42020 88%, #d420ff 100%)",
    stops: [
      [244, 251, 255],
      [70, 181, 255],
      [25, 212, 43],
      [255, 240, 74],
      [255, 154, 47],
      [228, 32, 32],
      [212, 32, 255],
    ],
  },
  red: {
    gradient: "linear-gradient(90deg, #ffffff 0%, #ffd8d8 20%, #ffadad 40%, #ff7b7b 62%, #f24343 80%, #b10000 100%)",
    stops: [
      [255, 255, 255],
      [255, 216, 216],
      [255, 173, 173],
      [255, 123, 123],
      [242, 67, 67],
      [177, 0, 0],
    ],
  },
  blue: {
    gradient: "linear-gradient(90deg, #ffffff 0%, #dceeff 20%, #add6ff 40%, #74b8ff 62%, #3f8dff 80%, #0f4fbf 100%)",
    stops: [
      [255, 255, 255],
      [220, 238, 255],
      [173, 214, 255],
      [116, 184, 255],
      [63, 141, 255],
      [15, 79, 191],
    ],
  },
};
function getScenarioLabel(source, scenario) {
  if (source === "taiwan") {
    const labelMap = {
      "低推估": "國發會低發展",
      "中推估": "國發會中發展",
      "高推估": "國發會高發展",
    };
    return labelMap[scenario] ?? `國發會-${scenario}`;
  }
  return `IPCC-${scenario}`;
}

function parseScenarioKey(key) {
  const [source, scenario] = key.split("|");
  return { source, scenario };
}

function getScenarioOptions() {
  const options = [];
  Object.entries(state.projections.sources).forEach(([source, sourceEntry]) => {
    const windowEntry = sourceEntry.windows[DEFAULT_SAMPLE_WINDOW];
    if (!windowEntry) return;
    Object.keys(windowEntry.scenarios).forEach((scenario) => {
      options.push({
        key: `${source}|${scenario}`,
        source,
        scenario,
        label: getScenarioLabel(source, scenario),
      });
    });
  });
  return options;
}

function getScenarioData(key = state.selectedScenarioKey) {
  const { source, scenario } = parseScenarioKey(key);
  return state.projections.sources[source].windows[DEFAULT_SAMPLE_WINDOW].scenarios[scenario];
}

function getTownByCode(code) {
  return state.geometry.towns.find((town) => town.code === code) ?? null;
}

function getProjectionIndex(code) {
  return projectionCodeIndex.get(code);
}

function getSelectedTown() {
  return state.selectedCode ? getTownByCode(state.selectedCode) : null;
}

function getCountyLabelByCode(countyCode) {
  if (!countyCode) return null;
  const countyFeature = state.geojson?.counties?.features?.find(
    (feature) => String(feature.properties?.countyCode ?? feature.properties?.code) === String(countyCode),
  );
  return countyFeature?.properties?.county ?? countyFeature?.properties?.name ?? null;
}

function getSelectedCountyLabel() {
  const town = getSelectedTown();
  return town?.county ?? getCountyLabelByCode(state.selectedCountyCode);
}

function getCurrentScenarioLabel() {
  const selectedOption = els.scenarioSelect.selectedOptions?.[0];
  if (selectedOption?.textContent) return selectedOption.textContent.trim();
  const { source, scenario } = parseScenarioKey(state.selectedScenarioKey);
  return getScenarioLabel(source, scenario);
}

function updateMapTitle() {
  const countyLabel = getSelectedCountyLabel();
  const scopeLabel = countyLabel ? countyLabel : "台灣鄉鎮區";
  els.mapTitle.textContent = `${scopeLabel}未來人口空間分布`;
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  return response.json();
}

async function init() {
  const [geometry, trends, projections] = await Promise.all([
    loadJson("./data/geometry.json"),
    loadJson("./data/trends.json"),
    loadJson("./data/projections_exponential.json"),
  ]);

  state.geometry = geometry;
  state.trends = trends;
  state.projections = projections;
  state.regionGeometryBounds = computeRegionGeometryBounds(geometry.towns);
  state.regionTransforms = computeRegionTransforms(geometry.towns);
  state.geojson = await loadPreferredGeoJson(geometry);
  state.countyBounds = computeCountyBounds(state.geojson.towns);
  state.townCenters = computeTownCenters(state.geojson.towns);

  geometry.towns.forEach((town, index) => {
    geometryTownIndex.set(town.code, index);
  });

  projections.codes.forEach((code, index) => {
    projectionCodeIndex.set(code, index);
  });

  configureStaticView();
  setupControls();
  buildChartSkeleton();
  await initCesium();
  updateScenarioState(state.selectedScenarioKey);
  startPlayback();
}

async function loadPreferredGeoJson(geometry) {
  try {
    return await loadTopoJsonCollections();
  } catch (error) {
    try {
      const [towns, counties] = await Promise.all([
        loadJson("./data/towns.geojson"),
        loadJson("./data/counties.geojson"),
      ]);
      return { towns, counties };
    } catch {
      return buildGeoJsonCollections(geometry);
    }
  }
}

async function loadTopoJsonCollections() {
  const [countryTopo, ...townTopos] = await Promise.all([
    loadJson("./data/topojson/taiwan-country.topo.json"),
    ...TOPO_TOWN_CODES.map((code) => loadJson(`./data/topojson/taiwan-towns-${code}.topo.json`)),
  ]);

  const countyGeo = topojsonFeature(countryTopo, countryTopo.objects.map);
  const countyFeatures = countyGeo.features.map((feature) => {
    const countyCode = String(feature.properties?.id ?? "");
    return {
      type: "Feature",
      properties: {
        code: countyCode,
        countyCode,
        county: feature.properties?.name ?? countyCode,
      },
      geometry: feature.geometry,
    };
  });

  const countyNameByCode = new Map(
    countyFeatures.map((feature) => [feature.properties.countyCode, feature.properties.county]),
  );

  const townFeatures = townTopos.flatMap((topology) => {
    const townGeo = topojsonFeature(topology, topology.objects.map);
    return townGeo.features.map((feature) => {
      const code = String(feature.properties?.id ?? "");
      const countyCode = code.slice(0, 5);
      const townName = feature.properties?.name ?? code;
      return {
        type: "Feature",
        properties: {
          code,
          countyCode,
          county: countyNameByCode.get(countyCode) ?? countyCode,
          town: townName,
          towneng: townName,
        },
        geometry: feature.geometry,
      };
    });
  });

  return {
    towns: {
      type: "FeatureCollection",
      features: townFeatures,
    },
    counties: {
      type: "FeatureCollection",
      features: countyFeatures,
    },
  };
}

function configureStaticView() {
  const region = state.geometry.regions.main;
  els.mapSvg.setAttribute("viewBox", `${region.x} ${region.y} ${region.width} ${region.height}`);
  applyOverlayAlignment();
  renderLegend({ min: 0, max: 0 }, null);
}

function applyOverlayAlignment() {
  const { scale, translateX, translateY } = MAP_ALIGNMENT;
  const xPct = translateX * 100;
  const yPct = translateY * 100;
  els.mapViewport.style.transform = `translate(${xPct}%, ${yPct}%) scale(${scale})`;
}

function setupControls() {
  const scenarioOptions = getScenarioOptions();
  els.scenarioSelect.innerHTML = "";
  scenarioOptions.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.key;
    option.textContent = item.label;
    option.selected = item.key === state.selectedScenarioKey;
    els.scenarioSelect.appendChild(option);
  });

  if (!scenarioOptions.some((item) => item.key === state.selectedScenarioKey) && scenarioOptions.length) {
    state.selectedScenarioKey = scenarioOptions[0].key;
    els.scenarioSelect.value = state.selectedScenarioKey;
  }

  els.scenarioSelect.addEventListener("change", () => {
    updateScenarioState(els.scenarioSelect.value);
  });
  els.paletteSelect.value = state.selectedPaletteKey;
  els.paletteSelect.addEventListener("change", () => {
    state.selectedPaletteKey = els.paletteSelect.value;
    updateVisuals();
  });

  els.playYearsBtn.addEventListener("click", startPlayback);
  els.stopYearsBtn.addEventListener("click", stopPlayback);
  els.yearRange.addEventListener("input", () => {
    const index = Number(els.yearRange.value);
    state.year = String(state.years[index] ?? state.years[0] ?? state.year);
    syncYearUi();
    updateVisuals();
  });
}

function updateScenarioState(key) {
  state.selectedScenarioKey = key;
  const scenarioData = getScenarioData();
  state.years = scenarioData.years.map(Number);
  state.year = scenarioData.years[0];
  els.yearRange.min = "0";
  els.yearRange.max = String(Math.max(0, state.years.length - 1));
  els.yearRange.step = "1";
  els.yearRange.value = "0";
  renderYearTicks();
  syncYearUi();
  updateVisuals();
}

function renderYearTicks() {
  els.yearTicks.innerHTML = "";
  state.years.forEach((year) => {
    const tick = document.createElement("span");
    tick.textContent = String(year);
    els.yearTicks.appendChild(tick);
  });
}

function syncYearUi() {
  els.yearValue.textContent = state.year;
  const index = state.years.indexOf(Number(state.year));
  els.yearRange.value = String(Math.max(0, index));
}

function startPlayback() {
  if (state.playTimer || state.years.length <= 1) return;
  els.playYearsBtn.disabled = true;
  state.playTimer = window.setInterval(() => {
    const currentIndex = state.years.indexOf(Number(state.year));
    const nextIndex = currentIndex >= state.years.length - 1 ? 0 : currentIndex + 1;
    state.year = String(state.years[nextIndex]);
    syncYearUi();
    updateVisuals();
  }, YEAR_PLAY_INTERVAL_MS);
}

function stopPlayback() {
  if (state.playTimer) {
    window.clearInterval(state.playTimer);
    state.playTimer = null;
  }
  els.playYearsBtn.disabled = false;
}

async function initCesium() {
  if (!window.Cesium) {
    els.mapTokenNotice.textContent = "CesiumJS 載入失敗，無法建立 Bing 衛星底圖。";
    els.mapTokenNotice.classList.remove("hidden");
    return;
  }

  try {
    state.map = new Cesium.Viewer("mapSceneContainer", {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      baseLayer: false,
      geocoder: false,
      homeButton: false,
      fullscreenButton: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      infoBox: false,
      selectionIndicator: false,
      sceneMode: Cesium.SceneMode.SCENE2D,
      scene3DOnly: false,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      shouldAnimate: false,
    });

    state.map.scene.screenSpaceCameraController.enableRotate = false;
    state.map.scene.screenSpaceCameraController.enableTilt = false;
    state.map.scene.screenSpaceCameraController.enableLook = false;
    state.map.scene.screenSpaceCameraController.enableTranslate = true;
    state.map.scene.screenSpaceCameraController.enableZoom = true;
    state.map.scene.globe.depthTestAgainstTerrain = false;
    state.map.scene.backgroundColor = Cesium.Color.fromCssColorString("#020409");

    const baseLayer = await createCesiumBaseLayer();
    state.map.imageryLayers.removeAll();
    state.map.imageryLayers.add(baseLayer);
    await loadGeoJsonLayers();
    state.selectedTownLabelEntity = state.map.entities.add({
      position: Cesium.Cartesian3.fromDegrees(121, 23.7),
      label: {
        text: "",
        show: false,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString("#02101c"),
        outlineWidth: 4,
        showBackground: false,
        font: "700 26px Microsoft JhengHei, Noto Sans TC, sans-serif",
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -18),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    setupCesiumPicking();
    state.map.camera.changed.addEventListener(syncOutlineStyles);

    state.map.camera.setView({
      destination: TAIWAN_VIEW_RECTANGLE ?? Cesium.Rectangle.fromDegrees(118.0, 21.7, 122.7, 26.45),
    });
    syncOutlineStyles();

    els.mapTokenNotice.classList.add("hidden");
  } catch (error) {
    els.mapTokenNotice.textContent = `Cesium Bing 底圖初始化失敗：${error.message}`;
    els.mapTokenNotice.classList.remove("hidden");
  }
}

async function createCesiumBaseLayer() {
  if (BING_MAPS_KEY && BING_MAPS_KEY !== "YOUR_BING_MAPS_KEY") {
    const provider = await Cesium.BingMapsImageryProvider.fromUrl(
      "https://dev.virtualearth.net",
      {
        key: BING_MAPS_KEY,
        mapStyle: Cesium.BingMapsStyle.AERIAL,
      },
    );
    return new Cesium.ImageryLayer(provider);
  }

  if (CESIUM_ION_ACCESS_TOKEN && CESIUM_ION_ACCESS_TOKEN !== "YOUR_CESIUM_ION_ACCESS_TOKEN") {
    Cesium.Ion.defaultAccessToken = CESIUM_ION_ACCESS_TOKEN;
  }

  try {
    const provider = await Cesium.createWorldImageryAsync({
      style: Cesium.IonWorldImageryStyle.AERIAL,
    });
    return new Cesium.ImageryLayer(provider);
  } catch (error) {
    if (BING_MAPS_KEY && BING_MAPS_KEY !== "YOUR_BING_MAPS_KEY") {
      throw error;
    }
  }

  els.mapTokenNotice.textContent = "Bing Aerial 無法建立。請提供可用的 `BING_MAPS_KEY` 或 `CESIUM_ION_ACCESS_TOKEN`。";
  els.mapTokenNotice.classList.remove("hidden");
  return new Cesium.ImageryLayer(
    new Cesium.OpenStreetMapImageryProvider({
      url: "https://tile.openstreetmap.org/",
    }),
  );
}

async function loadGeoJsonLayers() {
  state.townDataSource = await Cesium.GeoJsonDataSource.load(state.geojson.towns, {
    clampToGround: false,
    stroke: Cesium.Color.fromCssColorString("rgba(232,244,255,0.34)"),
    fill: Cesium.Color.fromCssColorString("rgba(25,55,82,0.85)"),
    strokeWidth: 1.0,
  });
  state.countyDataSource = await Cesium.GeoJsonDataSource.load(state.geojson.counties, {
    clampToGround: false,
    stroke: Cesium.Color.TRANSPARENT,
    fill: Cesium.Color.TRANSPARENT,
    strokeWidth: 0,
  });
  state.townOutlineDataSource = await Cesium.GeoJsonDataSource.load(
    polygonCollectionToLineCollection(state.geojson.towns),
    {
      clampToGround: false,
      stroke: Cesium.Color.fromCssColorString("rgba(232,244,255,0.22)"),
      strokeWidth: OUTLINE_STYLE.town.widthMax,
    },
  );
  state.countyOutlineDataSource = await Cesium.GeoJsonDataSource.load(
    polygonCollectionToLineCollection(state.geojson.counties),
    {
      clampToGround: false,
      stroke: Cesium.Color.fromCssColorString("rgba(255,255,255,0.82)"),
      strokeWidth: OUTLINE_STYLE.county.widthMax,
    },
  );

  state.map.dataSources.add(state.townDataSource);
  state.map.dataSources.add(state.countyDataSource);
  state.map.dataSources.add(state.townOutlineDataSource);
  state.map.dataSources.add(state.countyOutlineDataSource);

  state.townDataSource.entities.values.forEach((entity) => {
    const code = entity.properties?.code?.getValue?.();
    if (!code || !entity.polygon) return;
    entity.polygon.outline = false;
    entity.polygon.height = 0;
    entity.polygon.extrudedHeight = 0;
    const entities = townEntities.get(code) ?? [];
    entities.push(entity);
    townEntities.set(code, entities);
  });

  state.countyDataSource.entities.values.forEach((entity) => {
    if (!entity.polygon) return;
    entity.polygon.material = Cesium.Color.TRANSPARENT;
    entity.polygon.outline = false;
  });

  state.townOutlineDataSource.entities.values.forEach((entity) => {
    if (!entity.polyline) return;
    entity.polyline.clampToGround = false;
    entity.polyline.width = OUTLINE_STYLE.town.widthMax;
    entity.polyline.material = Cesium.Color.fromCssColorString(OUTLINE_STYLE.town.color);
  });

  state.countyOutlineDataSource.entities.values.forEach((entity) => {
    if (!entity.polyline) return;
    entity.polyline.clampToGround = false;
    entity.polyline.width = OUTLINE_STYLE.county.widthMax;
    entity.polyline.material = Cesium.Color.fromCssColorString(OUTLINE_STYLE.county.color);
  });
}

function polygonCollectionToLineCollection(collection) {
  return {
    type: "FeatureCollection",
    features: (collection?.features || [])
      .map((feature) => polygonFeatureToLineFeature(feature))
      .filter(Boolean),
  };
}

function polygonFeatureToLineFeature(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return null;

  if (geometry.type === "Polygon") {
    return {
      type: "Feature",
      properties: feature.properties || {},
      geometry: {
        type: "MultiLineString",
        coordinates: geometry.coordinates || [],
      },
    };
  }

  if (geometry.type === "MultiPolygon") {
    return {
      type: "Feature",
      properties: feature.properties || {},
      geometry: {
        type: "MultiLineString",
        coordinates: (geometry.coordinates || []).flatMap((polygon) => polygon || []),
      },
    };
  }

  return null;
}

function setupCesiumPicking() {
  const handler = new Cesium.ScreenSpaceEventHandler(state.map.scene.canvas);
  handler.setInputAction((movement) => {
    const picked = state.map.scene.pick(movement.position);
    const entity = picked?.id;
    const code = entity?.properties?.code?.getValue?.();
    const countyCode = entity?.properties?.countyCode?.getValue?.();
    const townName = entity?.properties?.town?.getValue?.();
    if (!code) {
      stepBackMapFocus();
      hideTooltip();
      updateVisuals();
      return;
    }

    if (!townName) {
      if (countyCode || String(code).length === 5) {
        state.selectedCode = null;
        state.selectedCountyCode = countyCode ?? String(code);
        syncOutlineStyles();
        zoomToSelectedCounty();
        updateVisuals();
        return;
      }
      stepBackMapFocus();
      updateVisuals();
      return;
    }

    if (state.selectedCode === code) {
      state.selectedCode = null;
      state.selectedCountyCode = countyCode ?? null;
      syncOutlineStyles();
      zoomToSelectedCounty();
      updateVisuals();
      return;
    }

    state.selectedCode = code;
    state.selectedCountyCode = countyCode ?? null;
    syncOutlineStyles();
    zoomToSelectedCounty();
    updateVisuals();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  handler.setInputAction((movement) => {
    const picked = state.map.scene.pick(movement.endPosition);
    const entity = picked?.id;
    const code = entity?.properties?.code?.getValue?.();
    if (!code) {
      hideTooltip();
      return;
    }
    showTooltipFromCode(movement.endPosition, code);
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

function stepBackMapFocus() {
  if (state.selectedCode && state.selectedCountyCode) {
    state.selectedCode = null;
    syncOutlineStyles();
    zoomToSelectedCounty();
    return;
  }
  if (state.selectedCountyCode) {
    state.selectedCountyCode = null;
    syncOutlineStyles();
    resetMapView();
    return;
  }
  state.selectedCode = null;
  state.selectedCountyCode = null;
  syncOutlineStyles();
  resetMapView();
}

function getCurrentPopulationMap() {
  return getScenarioData().populations[state.year];
}

function getPopulationRange(countyCode = state.selectedCountyCode) {
  const selectedTown = getSelectedTown();
  if (selectedTown) {
    return getTownHistoricalRange(selectedTown.code);
  }

  const populationValues = getCurrentPopulationMap();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  state.geometry.towns.forEach((town) => {
    if (countyCode && !town.code.startsWith(countyCode)) return;
    const projectionIndex = getProjectionIndex(town.code);
    const value = populationValues?.[projectionIndex];
    if (!Number.isFinite(value)) return;
    min = Math.min(min, value);
    max = Math.max(max, value);
  });

  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 1,
  };
}

function getTownHistoricalRange(code) {
  const scenarioData = getScenarioData();
  const projectionIndex = getProjectionIndex(code);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  scenarioData.years.forEach((year) => {
    const value = scenarioData.populations?.[year]?.[projectionIndex];
    if (!Number.isFinite(value)) return;
    min = Math.min(min, value);
    max = Math.max(max, value);
  });

  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 1,
  };
}

function updateVisuals() {
  updateMap();
  updateChart();
}

function updateMap() {
  const populationValues = getCurrentPopulationMap();
  const range = getPopulationRange();
  updateMapTitle();
  renderLegend(range, getLegendScopeLabel());

  state.geometry.towns.forEach((town) => {
    const entities = townEntities.get(town.code) ?? [];
    const projectionIndex = getProjectionIndex(town.code);
    const value = populationValues?.[projectionIndex] ?? 0;
    const isSelectedTown = state.selectedCode && town.code === state.selectedCode;
    const isFocusedCounty = !state.selectedCountyCode || town.code.startsWith(state.selectedCountyCode);
    let material;

    if (state.selectedCode) {
      material = isSelectedTown
        ? Cesium.Color.fromCssColorString(interpolateSequential(value, range.min, range.max)).withAlpha(0.95)
        : Cesium.Color.fromCssColorString("rgba(245, 248, 252, 0.18)");
    } else if (isFocusedCounty) {
      material = Cesium.Color.fromCssColorString(interpolateSequential(value, range.min, range.max)).withAlpha(0.9);
    } else {
      material = Cesium.Color.fromCssColorString("rgba(245, 248, 252, 0.42)");
    }
    entities.forEach((entity) => {
      if (!entity?.polygon) return;
      entity.polygon.material = material;
    });
  });
}

function getLegendScopeLabel() {
  const selectedTown = getSelectedTown();
  if (selectedTown) {
    return `${selectedTown.county}${selectedTown.town}歷年範圍`;
  }
  const countyLabel = getSelectedCountyLabel();
  return countyLabel ? `${countyLabel}範圍` : "全台範圍";
}

function renderLegend(range, scopeLabel) {
  const palette = getActivePalette();
  els.legend.innerHTML = `
    <div class="legend-ramp" style="background:${palette.gradient}"></div>
    <div class="legend-range">
      <span>${Math.round(range.min).toLocaleString()} 人</span>
      <span class="legend-scope">(${scopeLabel})</span>
      <span>${Math.round(range.max).toLocaleString()} 人</span>
    </div>
  `;
}

function resetMapView() {
  if (!state.map || !TAIWAN_VIEW_RECTANGLE) return;
  state.map.camera.flyTo({
    destination: TAIWAN_VIEW_RECTANGLE,
    duration: 0.8,
  });
}

function zoomToSelectedCounty() {
  if (!state.map || !state.selectedCountyCode) return;
  const bounds = state.countyBounds?.get(state.selectedCountyCode);
  if (!bounds) return;
  state.map.camera.flyTo({
    destination: Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north),
    duration: 0.8,
  });
}

function syncOutlineStyles() {
  if (!state.map) return;
  const zoomT = getZoomInterpolation();
  const townWidth = lerp(OUTLINE_STYLE.town.widthMin, OUTLINE_STYLE.town.widthMax, zoomT);
  const countyWidth = lerp(OUTLINE_STYLE.county.widthMin, OUTLINE_STYLE.county.widthMax, zoomT);

  state.townOutlineDataSource?.entities?.values?.forEach((entity) => {
    const code = entity.properties?.code?.getValue?.();
    if (!entity.polyline) return;
    const isSelected = code && code === state.selectedCode;
    entity.polyline.width = isSelected
      ? townWidth + OUTLINE_STYLE.selected.widthBoost
      : townWidth;
    entity.polyline.material = isSelected
      ? OUTLINE_STYLE.selected.color
      : Cesium.Color.fromCssColorString(OUTLINE_STYLE.town.color);
  });

  state.countyOutlineDataSource?.entities?.values?.forEach((entity) => {
    if (!entity.polyline) return;
    entity.polyline.width = countyWidth;
    entity.polyline.material = Cesium.Color.fromCssColorString(OUTLINE_STYLE.county.color);
  });

  syncSelectedTownLabel(zoomT);
}

function getZoomInterpolation() {
  const height = state.map?.camera?.positionCartographic?.height;
  if (!Number.isFinite(height)) return 0;
  const fullViewHeight = 900000;
  const countyViewHeight = 180000;
  return clamp((fullViewHeight - height) / (fullViewHeight - countyViewHeight), 0, 1);
}

function lerp(min, max, t) {
  return min + (max - min) * t;
}

function syncSelectedTownLabel(zoomT = getZoomInterpolation()) {
  const label = state.selectedTownLabelEntity?.label;
  if (!label || !state.selectedTownLabelEntity) return;
  const selectedTown = getSelectedTown();
  const center = selectedTown ? state.townCenters?.get(selectedTown.code) : null;
  const shouldShow = Boolean(selectedTown && center && zoomT >= 0.45);

  label.show = shouldShow;
  if (!shouldShow) return;

  state.selectedTownLabelEntity.position = Cesium.Cartesian3.fromDegrees(center.lon, center.lat);
  label.text = selectedTown.town;
}

function updateChart() {
  const scenarioData = getScenarioData();
  const years = scenarioData.years.map(Number);
  const selectedTown = getTownByCode(state.selectedCode);
  const selectedCountyLabel = getSelectedCountyLabel();
  const values = years.map((year) => {
    if (selectedTown) {
      const projectionIndex = getProjectionIndex(selectedTown.code);
      return scenarioData.populations[String(year)][projectionIndex];
    }

    if (state.selectedCountyCode) {
      return state.geometry.towns.reduce((sum, town) => {
        if (!town.code.startsWith(state.selectedCountyCode)) return sum;
        const projectionIndex = getProjectionIndex(town.code);
        return sum + (scenarioData.populations[String(year)][projectionIndex] ?? 0);
      }, 0);
    }

    return scenarioData.populations[String(year)].reduce((sum, value) => sum + value, 0);
  });

  const title = selectedTown
    ? `${selectedTown.county}${selectedTown.town}未來人口推估`
    : selectedCountyLabel
      ? `${selectedCountyLabel}未來人口推估`
    : "全台未來人口推估";

  els.chartTitle.textContent = title;
  renderBarChart(years, values);
  els.townSummary.textContent = "";
}

function buildChartSkeleton() {
  els.chartSvg.setAttribute("viewBox", "0 0 860 540");
  els.chartSvg.addEventListener("click", handleChartClick);
}

function handleChartClick(event) {
  const bar = event.target.closest?.("[data-year]");
  if (!bar) return;
  stopPlayback();
  state.year = String(bar.getAttribute("data-year"));
  syncYearUi();
  updateVisuals();
}

function renderBarChart(years, values) {
  if (!years.length || !values.length) {
    els.chartSvg.innerHTML = `<text x="430" y="270" text-anchor="middle" class="empty-state">無可用資料</text>`;
    return;
  }

  const width = 860;
  const height = 540;
  const margin = { top: 44, right: 22, bottom: 62, left: 108 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(...values, 1);
  const currentIndex = years.indexOf(Number(state.year));
  const barWidth = innerWidth / Math.max(years.length, 1) * 0.62;
  const gap = innerWidth / Math.max(years.length, 1);
  const yScale = (value) => margin.top + innerHeight - (value / maxValue) * innerHeight;
  const svgParts = [];

  svgParts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>`);

  for (let i = 0; i <= 5; i += 1) {
    const tickValue = (maxValue / 5) * i;
    const y = yScale(tickValue);
    svgParts.push(`<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="rgba(152,189,221,0.16)" stroke-dasharray="5 6"></line>`);
    svgParts.push(`<text x="${margin.left - 18}" y="${y + 5}" text-anchor="end" fill="#8ea1b7" font-size="15">${Math.round(tickValue).toLocaleString()}</text>`);
  }

  svgParts.push(`<line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="rgba(241,247,255,0.48)"></line>`);
  svgParts.push(`<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="rgba(241,247,255,0.48)"></line>`);
  svgParts.push(`<text x="${margin.left - 18}" y="${margin.top - 18}" text-anchor="end" fill="#9db0c4" font-size="16">(人)</text>`);
  svgParts.push(`<text x="${width - margin.right + 18}" y="${height - margin.bottom + 28}" text-anchor="start" fill="#9db0c4" font-size="16">(年)</text>`);

  years.forEach((year, index) => {
    const x = margin.left + gap * index + (gap - barWidth) / 2;
    const y = yScale(values[index]);
    const barHeight = margin.top + innerHeight - y;
    const isCurrent = index === currentIndex;
    const isVisible = index <= currentIndex;
    const fill = isCurrent
      ? "url(#barHighlight)"
      : isVisible
        ? "rgba(77, 215, 255, 0.72)"
        : "rgba(77, 215, 255, 0.15)";

    svgParts.push(`<rect class="chart-bar" data-year="${year}" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="12" fill="${fill}" style="cursor:pointer"></rect>`);
    svgParts.push(`<text x="${x + barWidth / 2}" y="${height - margin.bottom + 28}" text-anchor="middle" fill="#9db0c4" font-size="15">${year}</text>`);

    if (isCurrent) {
      svgParts.push(`<text x="${x + barWidth / 2}" y="${y - 12}" text-anchor="middle" fill="#f7fbff" font-size="16">${Math.round(values[index]).toLocaleString()}</text>`);
    }
  });

  const defs = `
    <defs>
      <linearGradient id="barHighlight" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#ffd166"></stop>
        <stop offset="100%" stop-color="#ff7b54"></stop>
      </linearGradient>
    </defs>
  `;

  els.chartSvg.innerHTML = defs + svgParts.join("");
}

function interpolateSequential(value, min, max) {
  const t = clamp((value - min) / (max - min || 1), 0, 1);
  return interpolateStops(getActivePalette().stops, Math.pow(t, 0.92));
}

function getActivePalette() {
  return COLOR_PALETTES[state.selectedPaletteKey] ?? COLOR_PALETTES[DEFAULT_PALETTE_KEY];
}

function interpolateStops(stops, t) {
  const scaled = clamp(t, 0, 1) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const localT = scaled - index;
  return mixColor(stops[index], stops[index + 1], localT);
}

function mixColor(a, b, t) {
  const color = a.map((channel, index) => Math.round(channel + (b[index] - channel) * t));
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeCountyBounds(townsGeoJson) {
  const boundsByCounty = new Map();
  (townsGeoJson?.features || []).forEach((feature) => {
    const countyCode = feature?.properties?.countyCode;
    if (!countyCode) return;
    const bounds = computeFeatureBounds(feature.geometry);
    if (!bounds) return;
    const existing = boundsByCounty.get(countyCode);
    if (!existing) {
      boundsByCounty.set(countyCode, padBounds(bounds, countyCode));
      return;
    }
    existing.west = Math.min(existing.west, bounds.west);
    existing.south = Math.min(existing.south, bounds.south);
    existing.east = Math.max(existing.east, bounds.east);
    existing.north = Math.max(existing.north, bounds.north);
  });
  for (const [countyCode, bounds] of boundsByCounty.entries()) {
    boundsByCounty.set(countyCode, padBounds(bounds, countyCode));
  }
  return boundsByCounty;
}

function computeTownCenters(townsGeoJson) {
  const centers = new Map();
  (townsGeoJson?.features || []).forEach((feature) => {
    const code = feature?.properties?.code;
    const point = computeRepresentativePoint(feature.geometry);
    if (!code || !point) return;
    centers.set(code, point);
  });
  return centers;
}

function computeRepresentativePoint(geometry) {
  const polygons = getOuterRings(geometry)
    .map((ring) => ({ ring, area: Math.abs(computeSignedRingArea(ring)) }))
    .filter((item) => item.ring.length >= 4 && item.area > 0);
  if (!polygons.length) return null;

  const primary = polygons.reduce((largest, current) => (current.area > largest.area ? current : largest));
  const centroid = computePolygonCentroid(primary.ring);
  if (centroid && pointInPolygon(centroid, primary.ring)) {
    return centroid;
  }

  return findInteriorSamplePoint(primary.ring) ?? centroid ?? {
    lon: primary.ring[0][0],
    lat: primary.ring[0][1],
  };
}

function getOuterRings(geometry) {
  if (!geometry?.coordinates) return [];
  if (geometry.type === "Polygon") {
    return geometry.coordinates.length ? [geometry.coordinates[0]] : [];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .map((polygon) => polygon?.[0])
      .filter(Boolean);
  }
  return [];
}

function computeSignedRingArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += (x1 * y2) - (x2 * y1);
  }
  return area / 2;
}

function computePolygonCentroid(ring) {
  let areaFactor = 0;
  let centroidX = 0;
  let centroidY = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = (x1 * y2) - (x2 * y1);
    areaFactor += cross;
    centroidX += (x1 + x2) * cross;
    centroidY += (y1 + y2) * cross;
  }
  if (Math.abs(areaFactor) < 1e-12) return null;
  return {
    lon: centroidX / (3 * areaFactor),
    lat: centroidY / (3 * areaFactor),
  };
}

function pointInPolygon(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > point.lat) !== (yj > point.lat))
      && (point.lon < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function findInteriorSamplePoint(ring) {
  const bounds = computeFeatureBounds({ coordinates: ring });
  if (!bounds) return null;
  let bestPoint = null;
  let bestDistance = Number.NEGATIVE_INFINITY;
  const steps = 8;

  for (let x = 0; x <= steps; x += 1) {
    for (let y = 0; y <= steps; y += 1) {
      const point = {
        lon: bounds.west + ((bounds.east - bounds.west) * x) / steps,
        lat: bounds.south + ((bounds.north - bounds.south) * y) / steps,
      };
      if (!pointInPolygon(point, ring)) continue;
      const distance = distanceToRingEdges(point, ring);
      if (distance > bestDistance) {
        bestDistance = distance;
        bestPoint = point;
      }
    }
  }

  return bestPoint;
}

function distanceToRingEdges(point, ring) {
  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const distance = pointToSegmentDistance(point, ring[i], ring[i + 1]);
    minDistance = Math.min(minDistance, distance);
  }
  return minDistance;
}

function pointToSegmentDistance(point, start, end) {
  const [x, y] = [point.lon, point.lat];
  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(x - x1, y - y1);
  const t = clamp(((x - x1) * dx + (y - y1) * dy) / lengthSquared, 0, 1);
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(x - projX, y - projY);
}

function computeFeatureBounds(geometry) {
  if (!geometry?.coordinates) return null;
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  const visit = (coords) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      west = Math.min(west, coords[0]);
      south = Math.min(south, coords[1]);
      east = Math.max(east, coords[0]);
      north = Math.max(north, coords[1]);
      return;
    }
    coords.forEach(visit);
  };

  visit(geometry.coordinates);
  if (![west, south, east, north].every(Number.isFinite)) return null;
  return { west, south, east, north };
}

function padBounds(bounds, countyCode) {
  const lonPad = Math.max((bounds.east - bounds.west) * 0.12, 0.08);
  const latPad = Math.max((bounds.north - bounds.south) * 0.12, 0.08);
  const extraWest = countyCode === "09020" ? 0.2 : 0;
  const padded = {
    west: bounds.west - lonPad - extraWest,
    south: bounds.south - latPad,
    east: bounds.east + lonPad,
    north: bounds.north + latPad,
  };

  if (countyCode === "10017") {
    return ensureMinimumSpan(padded, 0.42, 0.34);
  }

  return padded;
}

function ensureMinimumSpan(bounds, minLonSpan, minLatSpan) {
  const lonSpan = bounds.east - bounds.west;
  const latSpan = bounds.north - bounds.south;
  const extraLon = Math.max(0, minLonSpan - lonSpan) / 2;
  const extraLat = Math.max(0, minLatSpan - latSpan) / 2;
  return {
    west: bounds.west - extraLon,
    south: bounds.south - extraLat,
    east: bounds.east + extraLon,
    north: bounds.north + extraLat,
  };
}

function getTooltipContent(code) {
  const town = getTownByCode(code);
  if (!town) return "";
  const value = getCurrentPopulationMap()[getProjectionIndex(code)] ?? 0;
  return `${town.county} ${town.town}<br>${state.year} 年人口：${Math.round(value).toLocaleString()} 人`;
}

function showTooltip(event, code) {
  state.hoverCode = code;
  els.tooltip.innerHTML = getTooltipContent(code);
  els.tooltip.classList.remove("hidden");
  moveTooltip(event);
}

function showTooltipFromCode(position, code) {
  state.hoverCode = code;
  els.tooltip.innerHTML = getTooltipContent(code);
  els.tooltip.classList.remove("hidden");
  moveTooltip({ clientX: position.x + els.mapStage.getBoundingClientRect().left, clientY: position.y + els.mapStage.getBoundingClientRect().top });
}

function moveTooltip(event) {
  const rect = els.mapStage.getBoundingClientRect();
  els.tooltip.style.left = `${event.clientX - rect.left}px`;
  els.tooltip.style.top = `${event.clientY - rect.top}px`;
}

function hideTooltip() {
  state.hoverCode = null;
  els.tooltip.classList.add("hidden");
}

function buildGeoJsonCollections(geometry) {
  return {
    towns: {
      type: "FeatureCollection",
      features: geometry.towns
        .map((town) => buildGeoJsonFeatureFromPath(town.path, town.region, {
          code: town.code,
          county: town.county,
          town: town.town,
          towneng: town.towneng,
          region: town.region,
        }))
        .filter(Boolean),
    },
    counties: {
      type: "FeatureCollection",
      features: (geometry.counties || [])
        .map((county) => buildGeoJsonFeatureFromPath(county.path, county.region, {
          county: county.county,
          region: county.region,
        }))
        .filter(Boolean),
    },
  };
}

function buildGeoJsonFeatureFromPath(path, regionKey, properties) {
  const bounds = REGION_BOUNDS[regionKey];
  if (!bounds) return null;
  const rings = parseSvgPathToRings(path)
    .map((ring) => ring.map(([x, y]) => svgPointToLonLat(x, y, regionKey)))
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

function svgPointToLonLat(x, y, regionKey) {
  const transform = state.regionTransforms?.[regionKey];
  if (transform) {
    const lon = transform.lon[0] * x + transform.lon[1] * y + transform.lon[2];
    const lat = transform.lat[0] * x + transform.lat[1] * y + transform.lat[2];
    return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
  }

  const region = state.regionGeometryBounds?.[regionKey] || state.geometry.regions[regionKey];
  const bounds = REGION_BOUNDS[regionKey];
  const nx = (x - region.x) / region.width;
  const ny = (y - region.y) / region.height;
  const lon = bounds.west + nx * (bounds.east - bounds.west);
  const lat = bounds.north - ny * (bounds.north - bounds.south);
  return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
}

function parseSvgPathToRings(path) {
  const tokens = path.match(/[MLHVZmlhvz]|-?\d*\.?\d+/g) || [];
  const rings = [];
  let cursor = [0, 0];
  let start = null;
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
          start = null;
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
        start = cursor;
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
  if (!ring.length) return;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push(first);
  }
}

function computeRegionGeometryBounds(towns) {
  const acc = {};
  towns.forEach((town) => {
    const points = parseSvgPathToRings(town.path).flat();
    if (!points.length) return;
    if (!acc[town.region]) {
      acc[town.region] = {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      };
    }
    const region = acc[town.region];
    points.forEach(([x, y]) => {
      region.minX = Math.min(region.minX, x);
      region.minY = Math.min(region.minY, y);
      region.maxX = Math.max(region.maxX, x);
      region.maxY = Math.max(region.maxY, y);
    });
  });

  return Object.fromEntries(
    Object.entries(acc).map(([key, value]) => [
      key,
      {
        x: value.minX,
        y: value.minY,
        width: value.maxX - value.minX,
        height: value.maxY - value.minY,
      },
    ]),
  );
}

function computeRegionTransforms(towns) {
  const mainlandPoints = towns
    .filter((town) => town.region === "main" && MAINLAND_CONTROL_POINTS[town.code] && Number.isFinite(town.labelX) && Number.isFinite(town.labelY))
    .map((town) => ({
      x: town.labelX,
      y: town.labelY,
      lon: MAINLAND_CONTROL_POINTS[town.code].lon,
      lat: MAINLAND_CONTROL_POINTS[town.code].lat,
    }));

  if (mainlandPoints.length < 3) {
    return {};
  }

  const lonCoefficients = solveAffineLeastSquares(mainlandPoints, "lon");
  const latCoefficients = solveAffineLeastSquares(mainlandPoints, "lat");

  if (!lonCoefficients || !latCoefficients) {
    return {};
  }

  return {
    main: {
      lon: lonCoefficients,
      lat: latCoefficients,
    },
  };
}

function solveAffineLeastSquares(points, targetKey) {
  const normal = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const rhs = [0, 0, 0];

  points.forEach((point) => {
    const row = [point.x, point.y, 1];
    const target = point[targetKey];
    for (let i = 0; i < 3; i += 1) {
      rhs[i] += row[i] * target;
      for (let j = 0; j < 3; j += 1) {
        normal[i][j] += row[i] * row[j];
      }
    }
  });

  return solve3x3(normal, rhs);
}

function solve3x3(matrix, vector) {
  const a = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivot = 0; pivot < 3; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(a[row][pivot]) > Math.abs(a[maxRow][pivot])) {
        maxRow = row;
      }
    }

    if (Math.abs(a[maxRow][pivot]) < 1e-12) {
      return null;
    }

    if (maxRow !== pivot) {
      [a[pivot], a[maxRow]] = [a[maxRow], a[pivot]];
    }

    const pivotValue = a[pivot][pivot];
    for (let col = pivot; col < 4; col += 1) {
      a[pivot][col] /= pivotValue;
    }

    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) continue;
      const factor = a[row][pivot];
      for (let col = pivot; col < 4; col += 1) {
        a[row][col] -= factor * a[pivot][col];
      }
    }
  }

  return [a[0][3], a[1][3], a[2][3]];
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<pre style="padding:24px;color:#ff9a9a;background:#05090f;">載入失敗：${error.message}</pre>`;
});
