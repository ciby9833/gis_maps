// API配置
export const API_BASE_URL = "http://localhost:8000";
// export const API_BASE_URL = "https://gis.opsaway.cc/api";

// 地图基础配置 - 这部分保留为前端配置
export const MAP_CONFIG = {
  center: { lat: -6.5, lng: 110.5 }, // 印尼中心
  zoom: 8,
  minZoom: 4,
  maxZoom: 20,
};

// 配置加载器
class ConfigLoader {
  constructor() {
    this.cache = new Map();
    this.loadPromises = new Map();
  }

  async loadLayerConfig() {
    if (this.cache.has("layers")) {
      return this.cache.get("layers");
    }

    if (this.loadPromises.has("layers")) {
      return this.loadPromises.get("layers");
    }

    const promise = this._fetchLayerConfig();
    this.loadPromises.set("layers", promise);

    try {
      const config = await promise;
      this.cache.set("layers", config);
      return config;
    } finally {
      this.loadPromises.delete("layers");
    }
  }

  async _fetchLayerConfig() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/config/layers`);
      if (!response.ok) {
        throw new Error(`Failed to load layer config: ${response.status}`);
      }
      const result = await response.json();

      // 🔥 修复：处理后端返回的数据结构
      if (result.success && result.data) {
        return result.data;
      } else {
        throw new Error(result.message || "Invalid response structure");
      }
    } catch (error) {
      console.error("Failed to load layer config:", error);
      // 返回默认配置
      return this._getDefaultConfig();
    }
  }

  async getLayerStrategy(layerName, zoom) {
    const config = await this.loadLayerConfig();
    const strategies = config.layer_strategies || {};

    if (!strategies[layerName]) {
      return { load_data: false, reason: "layer_not_configured" };
    }

    const strategy = strategies[layerName];

    // 电子围栏始终加载
    if (strategy.always_load) {
      const limits = strategy.limits || {};
      const availableZooms = Object.keys(limits)
        .map(Number)
        .filter((z) => z <= zoom);
      const targetZoom = availableZooms.length > 0 ? Math.max(...availableZooms) : Math.min(...Object.keys(limits).map(Number));

      return {
        load_data: true,
        reason: "always_load",
        max_features: limits[targetZoom] || 1000,
        simplify_tolerance: 0,
        cache_ttl: 300,
      };
    }

    // 检查缩放级别范围
    if (zoom < strategy.min_zoom || zoom > strategy.max_zoom) {
      return {
        load_data: false,
        reason: zoom < strategy.min_zoom ? "zoom_too_low" : "zoom_too_high",
        min_zoom: strategy.min_zoom,
        max_zoom: strategy.max_zoom,
      };
    }

    // 获取当前缩放级别的限制
    const limits = strategy.limits || {};
    const availableZooms = Object.keys(limits)
      .map(Number)
      .filter((z) => z <= zoom);
    const targetZoom = availableZooms.length > 0 ? Math.max(...availableZooms) : Math.min(...Object.keys(limits).map(Number));

    return {
      load_data: true,
      reason: "zoom_in_range",
      max_features: limits[targetZoom] || 5000,
      simplify_tolerance: Math.max(0, 16 - zoom),
      cache_ttl: 300,
    };
  }

  async getZoomStrategy(zoom) {
    const config = await this.loadLayerConfig();
    const highZoomStrategy = config.high_zoom_strategy || {};

    if (zoom >= (highZoomStrategy.zoom_threshold || 16)) {
      return {
        load_all_layers: true,
        reason: "high_zoom_level",
        description: "Load all layers at maximum precision",
      };
    }

    return {
      load_all_layers: false,
      reason: "normal_zoom_level",
      description: "Load layers based on individual strategies",
    };
  }

  _getDefaultConfig() {
    return {
      layer_strategies: {
        fences: {
          min_zoom: 1,
          max_zoom: 20,
          always_load: true,
          limits: { 1: 1000, 10: 3000, 15: 5000 },
        },
        buildings: {
          min_zoom: 6,
          max_zoom: 20,
          limits: { 6: 5000, 10: 15000, 12: 30000, 15: 50000 },
        },
        land_polygons: {
          min_zoom: 4,
          max_zoom: 20,
          limits: { 4: 2000, 8: 5000, 10: 8000, 12: 6000, 14: 3000 },
        },
        // 🔥 修复：与后端配置保持一致
        roads: {
          min_zoom: 7, // 从9改为7
          max_zoom: 20,
          limits: { 7: 3000, 9: 5000, 11: 10000, 13: 20000, 15: 30000 },
        },
        pois: {
          min_zoom: 9, // 从12改为9
          max_zoom: 20,
          limits: { 9: 3000, 12: 5000, 16: 8000 },
        },
        water: {
          min_zoom: 8,
          max_zoom: 20,
          limits: { 8: 5000, 12: 8000, 16: 10000 },
        },
        railways: {
          min_zoom: 10,
          max_zoom: 20,
          limits: { 10: 3000, 14: 5000, 16: 8000 },
        },
        traffic: {
          min_zoom: 13,
          max_zoom: 20,
          limits: { 13: 3000, 16: 6000 },
        },
        worship: {
          min_zoom: 12,
          max_zoom: 20,
          limits: { 12: 5000, 16: 8000 },
        },
        landuse: {
          min_zoom: 10,
          max_zoom: 20,
          limits: { 10: 8000, 14: 15000, 16: 20000 },
        },
        // 🔥 修复：与后端配置保持一致
        transport: {
          min_zoom: 9, // 从12改为9
          max_zoom: 20,
          limits: { 9: 1000, 12: 2000, 16: 3000 },
        },
        places: {
          min_zoom: 6, // 从8改为6
          max_zoom: 20,
          limits: { 6: 500, 8: 1000, 12: 2000, 16: 3000 },
        },
        natural: {
          min_zoom: 8, // 从10改为8
          max_zoom: 20,
          limits: { 8: 2000, 10: 3000, 14: 5000, 16: 8000 },
        },
      },
      high_zoom_strategy: {
        zoom_threshold: 16,
        load_all_layers: true,
        description: "Load all layers at maximum precision",
      },
    };
  }

  clearCache() {
    this.cache.clear();
  }
}

// 创建全局配置加载器实例
export const configLoader = new ConfigLoader();

// 获取本地化的类别数据 - 简化版本，从后端配置生成
export const getLocalizedCategories = async (t) => {
  try {
    const config = await configLoader.loadLayerConfig();
    const strategies = config.layer_strategies || {};

    const localizedCategories = {};

    Object.keys(strategies).forEach((key) => {
      const strategy = strategies[key];
      localizedCategories[key] = {
        name: t(`categories.${key}.name`),
        icon: getLayerIcon(key),
        color: getLayerColor(key),
        api: `/api/${key}`,
        subcategories: {
          all: { name: t(`categories.${key}.all`), icon: getLayerIcon(key) },
        },
      };
    });

    return localizedCategories;
  } catch (error) {
    console.error("Failed to load localized categories:", error);
    return {};
  }
};

// 图层图标映射
const getLayerIcon = (layerName) => {
  const icons = {
    fences: "🏠",
    buildings: "🏢",
    roads: "🛣️",
    pois: "📍",
    landPolygons: "🌍",
    natural: "🌿",
    transport: "🚌",
    places: "📍",
  };
  return icons[layerName] || "📍";
};

// 图层颜色映射
const getLayerColor = (layerName) => {
  const colors = {
    fences: "#FF1493",
    buildings: "#1976d2",
    roads: "#ff4444",
    pois: "#ff6600",
    landPolygons: "#4caf50",
    natural: "#4caf50",
    transport: "#9c27b0",
    places: "#795548",
  };
  return colors[layerName] || "#1976d2";
};

// 默认图层可见性配置
export const DEFAULT_LAYER_VISIBILITY = {
  landPolygons: true,
  buildings: true,
  roads: true,
  pois: true,
  natural: true, // 🔥 修复：改为true，让自然特征默认显示
  transport: true,
  places: true,
  fences: true,
};
