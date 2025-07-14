import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  CircularProgress, 
  IconButton, 
  Tooltip,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Divider,
  Chip,
  Grid,
  Alert
} from '@mui/material';
import { MapContainer, TileLayer, GeoJSON, useMap, Marker, Popup, CircleMarker, LayerGroup } from 'react-leaflet';
import { API_BASE_URL, MAP_CONFIG, configLoader } from '../config';
import { MyLocation, Layers, Search, LocationOn } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import 'leaflet/dist/leaflet.css';

// 围栏图层样式 - 确保绘制工具能在其上方
const fenceLayerStyle = `
  .fence-layer {
    z-index: 1000 !important;
    pointer-events: auto !important;
  }
  .leaflet-interactive.fence-layer {
    z-index: 1000 !important;
  }
  .drawing-overlay {
    z-index: 10000 !important;
    pointer-events: none !important;
  }
  .drawing-overlay.active {
    pointer-events: auto !important;
  }
  /* 锚点和控制柄层级 */
  .leaflet-tooltip-pane {
    z-index: 10001 !important;
  }
  .leaflet-tooltip-pane .leaflet-interactive {
    z-index: 10001 !important;
  }
  /* 围栏工具栏层级 */
  [data-drawing-toolbar="true"] {
    z-index: 10002 !important;
  }
`;

// 注入样式
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = fenceLayerStyle;
  document.head.appendChild(style);
}

// 修复Leaflet图标问题
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// localStorage 键名
const MAPVIEWER_STORAGE_KEYS = {
  FENCES_VISIBLE: 'gis_fences_visible',
  VALIDATE_BUILDINGS: 'gis_validate_buildings',
  LAND_DISPLAY_MODE: 'gis_land_display_mode',
  AUTO_LOCATION_ENABLED: 'gis_auto_location_enabled'
};

// 从localStorage获取布尔值
const getStoredBoolean = (key, defaultValue = false) => {
  try {
    const stored = localStorage.getItem(key);
    return stored !== null ? JSON.parse(stored) : defaultValue;
  } catch (error) {
    console.warn(`Failed to load ${key} from localStorage:`, error);
    return defaultValue;
  }
};

// 从localStorage获取字符串值
const getStoredString = (key, defaultValue = '') => {
  try {
    const stored = localStorage.getItem(key);
    return stored !== null ? stored : defaultValue;
  } catch (error) {
    console.warn(`Failed to load ${key} from localStorage:`, error);
    return defaultValue;
  }
};

// 保存值到localStorage
const saveToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to save ${key} to localStorage:`, error);
  }
};

// 创建自定义定位点图标
const createLocationIcon = () => {
  return L.divIcon({
    className: 'custom-location-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: #FF4444;
        border: 3px solid #FFFFFF;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        position: relative;
      ">
        <div style="
          width: 12px;
          height: 12px;
          background: #FFFFFF;
          border-radius: 50%;
          animation: pulse 2s infinite;
        "></div>
        <div style="
          position: absolute;
          top: 32px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 8px solid #FF4444;
        "></div>
      </div>
      <style>
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
      </style>
    `,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40]
  });
};

// 防抖函数
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// 地图事件处理组件
const MapEventHandler = ({ onBoundsChange, onZoomChange, onMapReady }) => {
  const map = useMap();

  useEffect(() => {
    // 通知父组件地图已准备好
    if (onMapReady) {
      onMapReady(map);
    }

    const handleMoveEnd = () => {
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      onBoundsChange(bounds, zoom);
    };

    const handleZoomEnd = () => {
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      onBoundsChange(bounds, zoom);
      onZoomChange(zoom);
    };

    map.on('moveend', handleMoveEnd);
    map.on('zoomend', handleZoomEnd);

    // 初始加载
    handleMoveEnd();

    return () => {
      try {
        if (map && map.off) {
          map.off('moveend', handleMoveEnd);
          map.off('zoomend', handleZoomEnd);
        }
      } catch (error) {
        console.warn('Error cleaning up map event listeners:', error);
      }
    };
  }, [map, onBoundsChange, onZoomChange, onMapReady]);

  return null;
};

// 导入组件
import NearbyInfoDialog from './NearbyInfoDialog';
import LocationIndicator from './LocationIndicator';
import FenceManager from './FenceManager';
import FenceToolbar from './FenceToolbar';
import CustomDrawTools from './CustomDrawTools';

// 验证和过滤GeoJSON要素的通用函数
const validateAndFilterFeatures = (features, layerName) => {
  if (!Array.isArray(features)) {
    console.warn(`${layerName}: features is not an array`);
    return [];
  }
  
  const validFeatures = features.filter(f => {
    try {
      // 严格的验证逻辑
      if (!f || f === null || typeof f !== 'object' || f.type !== 'Feature') {
        return false;
      }
      
      const geometry = f.geometry;
      if (!geometry || geometry === null || geometry === 'null' || typeof geometry !== 'object') {
        return false;
      }
      
      if (!geometry.type || !geometry.coordinates) {
        return false;
      }
      
      if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
        return false;
      }
      
      // 递归验证坐标数组，确保没有 null、undefined 或 NaN 值
      const validateCoordinates = (coords) => {
        if (!Array.isArray(coords)) {
          return coords !== null && coords !== undefined && !isNaN(coords) && isFinite(coords);
        }
        return coords.every(coord => validateCoordinates(coord));
      };
      
      if (!validateCoordinates(geometry.coordinates)) {
        console.warn(`${layerName}: Invalid coordinates found`, geometry.coordinates);
        return false;
      }
      
      if (!f.properties || f.properties === null || typeof f.properties !== 'object') {
        return false;
      }
      
      // 额外检查：确保坐标数组不包含null值的字符串表示
      const coordStr = JSON.stringify(geometry.coordinates);
      if (coordStr.includes('null') || coordStr.includes('undefined') || coordStr.includes('NaN')) {
        console.warn(`${layerName}: Coordinates contain invalid string values`, coordStr);
        return false;
      }
      
      return true;
    } catch (e) {
      console.warn(`Error filtering ${layerName} features:`, e, f);
      return false;
    }
  });
  
  return validFeatures;
};

const MapViewer = ({ 
  apiStatus, 
  selectedCategory, 
  layersVisible, 
  onLayerToggle, 
  dataTypeFilters, 
  configLoaded,
  // 新增的可选props
  onLayerDataChange, 
  onBoundsChange, 
  onLocationUpdate, 
  onStatsUpdate,
  onFenceSuccess 
}) => {
  const { t } = useTranslation();
  
  // 基础状态
  const [currentZoom, setCurrentZoom] = useState(MAP_CONFIG.zoom);
  const [currentBounds, setCurrentBounds] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);
  
  // 定位相关状态
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [autoLocationEnabled, setAutoLocationEnabled] = useState(() => 
    getStoredBoolean(MAPVIEWER_STORAGE_KEYS.AUTO_LOCATION_ENABLED, false)
  ); // 控制是否自动定位
  
  // 搜索相关状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [nearbyInfo, setNearbyInfo] = useState(null);
  const [showNearbyDialog, setShowNearbyDialog] = useState(false);
  
  // 图层数据状态 - 统一管理
  const [layerData, setLayerData] = useState({
    buildings: null,
    landPolygons: null,
    roads: null,
    pois: null,
    natural: null,
    transport: null,
    places: null,
    fences: null
  });

  // 图层加载状态
  const [layerLoading, setLayerLoading] = useState({
    buildings: false,
    landPolygons: false,
    roads: false,
    pois: false,
    natural: false,
    transport: false,
    places: false,
    fences: false
  });
  
  // 围栏管理状态
  const [showFenceManager, setShowFenceManager] = useState(false);
  const [selectedFence, setSelectedFence] = useState(null);
  const [fencesVisible, setFencesVisible] = useState(() => 
    getStoredBoolean(MAPVIEWER_STORAGE_KEYS.FENCES_VISIBLE, true)
  );
  const [fenceToolbarVisible, setFenceToolbarVisible] = useState(false);
  const [fenceToolbarMode, setFenceToolbarMode] = useState('create');
  const [currentFence, setCurrentFence] = useState(null);
  const [fenceDrawing, setFenceDrawing] = useState(false);

  // 其他功能状态
  const [validateBuildings, setValidateBuildings] = useState(() => 
    getStoredBoolean(MAPVIEWER_STORAGE_KEYS.VALIDATE_BUILDINGS, false)
  );
  const [landDisplayMode, setLandDisplayMode] = useState(() => 
    getStoredString(MAPVIEWER_STORAGE_KEYS.LAND_DISPLAY_MODE, 'subtle')
  );

  // 围栏统计状态
  const [fenceStats, setFenceStats] = useState({ totalFences: 0, activeFences: 0 });

  // 获取全部围栏统计
  const loadFenceStats = useCallback(async () => {
    if (!configLoaded) return;
    
    try {
      const url = `${API_BASE_URL}/api/fences?status=active&stats_only=true`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      let totalCount = 0;
      if (data.success && data.data && data.data.fences) {
        totalCount = data.data.fences.length;
      } else if (data.success && data.data && data.data.data && data.data.data.fences) {
        totalCount = data.data.data.fences.length;
      } else if (data.fences) {
        totalCount = data.fences.length;
      } else if (Array.isArray(data)) {
        totalCount = data.length;
      }
      
      setFenceStats({ totalFences: totalCount, activeFences: totalCount });
    } catch (error) {
      console.error('Error loading fence stats:', error);
      setFenceStats({ totalFences: 0, activeFences: 0 });
    }
  }, [configLoaded]);

  // 当配置加载完成时加载围栏统计
  useEffect(() => {
    if (configLoaded) {
      loadFenceStats();
    }
  }, [configLoaded, loadFenceStats]);

  // 围栏可见性变化时重新加载统计
  useEffect(() => {
    if (fencesVisible && configLoaded) {
      loadFenceStats();
    }
  }, [fencesVisible, configLoaded, loadFenceStats]);

  // 图层名称映射函数
  const getBackendLayerName = (frontendLayerName) => {
    const layerNameMapping = {
      'landPolygons': 'land_polygons',
      'fences': 'fences',
      'buildings': 'buildings',
      'roads': 'roads',
      'pois': 'pois',
      'natural': 'natural',
      'transport': 'transport',
      'places': 'places',
      'water': 'water',
      'railways': 'railways',
      'traffic': 'traffic',
      'worship': 'worship',
      'landuse': 'landuse'
    };
    return layerNameMapping[frontendLayerName] || frontendLayerName;
  };

  // 统一的图层数据加载函数
  const loadLayerData = useCallback(async (layerName, bounds, zoom) => {
    if (!configLoaded) return;
    
    try {
      // 获取后端图层名称
      const backendLayerName = getBackendLayerName(layerName);
      
      // 检查加载策略 - 使用后端图层名称
      const strategy = await configLoader.getLayerStrategy(backendLayerName, zoom);
      if (!strategy.load_data) {
        
        
        // 清空图层数据
        setLayerData(prev => ({ ...prev, [layerName]: null }));
        return;
      }
      
      // 设置加载状态
      setLayerLoading(prev => ({ ...prev, [layerName]: true }));
      
      // 构建API URL - 使用后端图层名称
      const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
      let url = `${API_BASE_URL}/api/${backendLayerName}?bbox=${bbox}&zoom=${zoom}&limit=${strategy.max_features}`;
      
      // 特殊处理
      if (layerName === 'buildings' && selectedCategory) {
        url += `&category=${selectedCategory}`;
          }
      if (layerName === 'buildings' && validateBuildings) {
        url += `&validate_land=true`;
      }
      if (layerName === 'fences') {
        url += `&status=active`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // 更新图层数据 - 修复围栏数据结构处理
      let processedData = null;
      if (layerName === 'fences') {
        // 围栏数据处理 - 处理嵌套结构
        if (data.success && data.data && data.data.fences) {
          // 处理 {success: true, data: {fences: []}} 格式
          processedData = data.data.fences;
        } else if (data.success && data.data && data.data.data && data.data.data.fences) {
          // 处理双重嵌套 {success: true, data: {success: true, data: {fences: []}}} 格式
          processedData = data.data.data.fences;
        } else if (data.fences) {
          // 处理直接 {fences: []} 格式
          processedData = data.fences;
        } else if (Array.isArray(data)) {
          // 处理直接数组格式
          processedData = data;
        }
        
        // 将围栏数据转换为GeoJSON Feature格式
        if (Array.isArray(processedData)) {
          processedData = processedData.map(fence => ({
            type: 'Feature',
            geometry: fence.fence_geometry || fence.geometry,
            properties: {
              id: fence.id,
              fence_name: fence.fence_name || fence.name,
              fence_type: fence.fence_type || fence.type,
              fence_purpose: fence.fence_purpose || fence.purpose,
              fence_description: fence.fence_description || fence.description,
              fence_status: fence.fence_status || fence.status || 'active',
              fence_color: fence.fence_color || fence.color || '#FF0000',
              fence_opacity: fence.fence_opacity || fence.opacity || 0.3,
              fence_stroke_color: fence.fence_stroke_color || fence.stroke_color || fence.fence_color || fence.color || '#FF0000',
              fence_stroke_width: fence.fence_stroke_width || fence.stroke_width || 2,
              fence_stroke_opacity: fence.fence_stroke_opacity || fence.stroke_opacity || 0.8,
              fence_area: fence.fence_area || fence.area,
              fence_perimeter: fence.fence_perimeter || fence.perimeter,
              created_at: fence.created_at,
              updated_at: fence.updated_at,
              group_id: fence.group_id,
              fence_level: fence.fence_level || fence.level
            }
          }));
        }
      } else {
        // 其他图层数据处理
        if (data.type === 'FeatureCollection' && data.features) {
          processedData = data;
        } else if (Array.isArray(data)) {
          processedData = data;
        } else if (data.features) {
          processedData = data.features;
        }
      }
      
      setLayerData(prev => ({
        ...prev,
        [layerName]: processedData
      }));
      
    } catch (error) {
      console.error(`Error loading ${layerName} (zoom: ${zoom}):`, error);
      setLayerData(prev => ({ ...prev, [layerName]: null }));
    } finally {
      setLayerLoading(prev => ({ ...prev, [layerName]: false }));
    }
  }, [configLoaded, selectedCategory, validateBuildings]);

  // 防抖处理边界变化
  const debouncedLoadData = useCallback(
    debounce(async (bounds, zoom) => {
      if (!configLoaded || !bounds) return;
      
      // 根据图层可见性和后端策略加载数据
      const layersToLoad = [];
      
      if (layersVisible.buildings) layersToLoad.push('buildings');
      if (layersVisible.landPolygons) layersToLoad.push('landPolygons'); // 注意这里使用驼峰命名
      if (layersVisible.roads) layersToLoad.push('roads');
      if (layersVisible.pois) layersToLoad.push('pois');
      if (layersVisible.natural) layersToLoad.push('natural');
      if (layersVisible.transport) layersToLoad.push('transport');
      if (layersVisible.places) layersToLoad.push('places');
      if (fencesVisible) layersToLoad.push('fences');
      
      // 并行加载所有需要的图层
      await Promise.all(layersToLoad.map(layer => loadLayerData(layer, bounds, zoom)));
    }, 800),
    [configLoaded, layersVisible, fencesVisible, loadLayerData]
  );

  // 当配置加载完成时重新加载数据
  useEffect(() => {
    if (configLoaded && currentBounds && currentZoom) {
      debouncedLoadData(currentBounds, currentZoom);
    }
  }, [configLoaded, currentBounds, currentZoom, debouncedLoadData]);

  // 搜索地址或坐标 - 修复：不自动定位
  const searchLocation = async (query) => {
    if (!query.trim()) return;
    
    setSearchLoading(true);
    
    try {
      const cleanQuery = query.trim();
      
      // 坐标输入校验
      const coordPattern = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;
      if (coordPattern.test(cleanQuery)) {
        const [lng, lat] = cleanQuery.split(',').map(Number);
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
          alert(t('mapViewer.coordinateOutOfRange'));
          setSearchLoading(false);
          return;
        }
      }
      
      const url = `${API_BASE_URL}/api/geocode?query=${encodeURIComponent(cleanQuery)}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`${t('mapViewer.searchFailed')}: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.type === 'forward_geocode' || data.type === 'forward_geocode_local') {
        let location = null;
        
        if (data.lat !== undefined && data.lng !== undefined) {
          location = { lat: data.lat, lng: data.lng };
        } else if (data.google_result) {
          location = { lat: data.google_result.lat, lng: data.google_result.lng };
        } else if (data.local_pois && data.local_pois.length > 0) {
          const firstPoi = data.local_pois[0];
          location = { lat: firstPoi.lat, lng: firstPoi.lng };
        } else {
          alert(t('mapViewer.noResultsFound'));
          return;
        }
        
        // 🔥 修复：设置标记位置并自动缩放到16级
        setSelectedLocation(location);
        
        // 🔥 修复：搜索到地点后自动缩放到16级
        if (mapInstance) {
          mapInstance.setView([location.lat, location.lng], 16);
        }
        
        
      } else if (data.type === 'reverse_geocode') {
        const location = { lat: data.coordinates.lat, lng: data.coordinates.lng };
        setSelectedLocation(location);
        
        // 反向地理编码后自动缩放到16级
        if (mapInstance) {
          mapInstance.setView([location.lat, location.lng], 16);
        }
      } else {
        alert(data.message || t('mapViewer.noResultsFound'));
      }
    } catch (error) {
      console.error('Search failed:', error);
      alert(t('mapViewer.searchFailed') + ': ' + error.message);
    } finally {
      setSearchLoading(false);
    }
  };

  // 获取周边信息
  const getNearbyInfo = async (lat, lng) => {
    try {
      const url50m = `${API_BASE_URL}/api/nearby?lat=${lat}&lng=${lng}&radius=50&include_land_info=true`;
      const response50m = await fetch(url50m);
      
      if (!response50m.ok) {
        throw new Error(`Failed to get nearby info: ${response50m.status}`);
      }
      
      const data50m = await response50m.json();
      
      const url100m = `${API_BASE_URL}/api/nearby?lat=${lat}&lng=${lng}&radius=100&include_land_info=true`;
      const response100m = await fetch(url100m);
      
      if (!response100m.ok) {
        throw new Error(`Failed to get 100m nearby info: ${response100m.status}`);
      }
      
      const data100m = await response100m.json();
      
      // 分类处理数据
      const classify = (features) => {
        const buildings = [];
        const pois = [];
        const roads = [];
        
        const poiTypes = new Set([
          'restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'food_court', 
          'hospital', 'clinic', 'pharmacy', 'school', 'university', 'college',
          'bank', 'atm', 'post_office', 'police', 'fire_station', 'government',
          'hotel', 'motel', 'guest_house', 'shop', 'mall', 'supermarket', 'market',
          'gas_station', 'parking', 'bus_station', 'subway_station', 'train_station', 
          'airport', 'museum', 'library', 'theatre', 'cinema', 'park', 'playground',
          'stadium', 'sports_centre', 'swimming_pool', 'place_of_worship', 'mosque', 
          'church', 'temple', 'commercial', 'office', 'retail', 'services'
        ]);
        
        features.forEach(feature => {
          const fclass = feature.fclass || '';
          
          if (feature.source_table === 'osm_roads') {
            roads.push({
              name: feature.name || 'Unnamed Road',
              type: feature.type || feature.fclass || 'Unknown',
              fclass: feature.fclass,
              distance: feature.distance_meters,
              osm_id: feature.osm_id,
              geometry_type: feature.geometry_type,
              name_source: feature.name_source || 'osm'
            });
          } else if (poiTypes.has(fclass)) {
            pois.push({
              name: feature.name || 'Unnamed POI',
              type: feature.type || feature.fclass || 'Unknown',
              fclass: feature.fclass,
              distance: feature.distance_meters,
              osm_id: feature.osm_id,
              geometry_type: feature.geometry_type,
              name_source: feature.name_source || 'osm'
            });
          } else {
            buildings.push({
              name: feature.name || 'Unnamed Building',
              type: feature.type || feature.fclass || 'Unknown',
              fclass: feature.fclass,
              distance: feature.distance_meters,
              osm_id: feature.osm_id,
              geometry_type: feature.geometry_type,
              name_source: feature.name_source || 'osm'
            });
          }
        });
        
        return { buildings, pois, roads };
      };
      
      const classified50m = classify(data50m.features || []);
      const classified100m = classify(data100m.features || []);
      
      const combinedData = {
        buildings_50m: classified50m.buildings,
        pois_50m: classified50m.pois,
        roads_50m: classified50m.roads,
        pois_100m: classified100m.pois,
        buildings_100m: classified100m.buildings,
        roads_100m: classified100m.roads,
        summary: {
          buildings_50m: classified50m.buildings.length,
          pois_50m: classified50m.pois.length,
          roads_50m: classified50m.roads.length,
          pois_100m: classified100m.pois.length,
          buildings_100m: classified100m.buildings.length,
          roads_100m: classified100m.roads.length,
          total_features: (data50m.features?.length || 0) + (data100m.features?.length || 0)
        }
      };
      
      setNearbyInfo(combinedData);
      setShowNearbyDialog(true);
    } catch (error) {
      console.error('Get nearby info failed:', error);
      alert(t('mapViewer.getNearbyInfoFailed') + ': ' + error.message);
    }
  };
// 获取用户位置 - 支持直接传map实例
const getUserLocation = useCallback(
  (customMapInstance = null) => {
    if (!navigator.geolocation) {
      console.warn(t('mapViewer.browserNotSupportGeolocation'));
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const location = { lat: latitude, lng: longitude };
        setUserLocation(location);
        setSelectedLocation(location);
        
        // 🔥 修复: 如果有传map参数，用它；否则用state
        const map = customMapInstance || mapInstance;
        if (map) {
          map.setView([latitude, longitude], 16);
        }
        
        setLocationLoading(false);
      },
      (error) => {
        console.warn('Get location failed:', error.message);
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  },
  [mapInstance, t]
);

// 地图准备就绪回调 - 只在首次加载时获取用户位置
  const handleMapReady = useCallback((map) => {
    setMapInstance(map);
    
    // 创建围栏图层
    if (!map._fenceDrawLayer) {
      map._fenceDrawLayer = new window.L.FeatureGroup().addTo(map);
    }
    
    // 仅在首次加载时自动获取定位（遵循Google地图的做法）
    // 检查是否已经有用户位置，如果没有才自动获取
    if (!userLocation) {
      getUserLocation(map);
    }
  }, [getUserLocation, userLocation]);

// 边界变化处理
const handleBoundsChange = useCallback(
  (bounds, zoom) => {
    setCurrentBounds(bounds);
    setCurrentZoom(zoom);
    debouncedLoadData(bounds, zoom);
  },
  [debouncedLoadData]
);

  const handleZoomChange = useCallback((zoom) => {
    setCurrentZoom(zoom);
  }, []);

// 根据category刷新 - 不触发自动定位
  useEffect(() => {
    if (currentBounds && currentZoom) {
      debouncedLoadData(currentBounds, currentZoom);
    }
  }, [selectedCategory, validateBuildings, currentBounds, currentZoom, debouncedLoadData]);

  // 样式函数
  const getGeoJSONStyle = () => ({
    fillColor: '#1976d2',
    weight: 1,
    opacity: 0.8,
    color: '#1976d2',
    fillOpacity: 0.3
  });
  
  const getLandPolygonStyleEnhanced = () => {
    switch (landDisplayMode) {
      case 'clear':
        return {
          fillColor: '#E6FFE6',
          weight: 1,                
          opacity: 0.8,             
          color: '#32CD32',
          fillOpacity: 0.4          
        };
      case 'coastline':
        return {
          fillColor: 'transparent', 
          weight: 2,                
          opacity: 1,               
          color: '#1E90FF',
          fillOpacity: 0            
        };
      default:
        return {
          fillColor: '#F0F8FF',
          weight: 0.5,              
          opacity: 0.6,             
          color: '#1E90FF',
          fillOpacity: 0.3          
        };
    }
  };

  const getEnhancedBuildingStyle = (feature) => {
    const baseStyle = {
      fillColor: '#FFF5E6',
      weight: 1,
      opacity: 0.8,
      color: '#FFA500',
      fillOpacity: 0.3
    };

    if (feature.properties && feature.properties.is_on_land !== undefined) {
      if (feature.properties.is_on_land === false) {
        return {
          ...baseStyle,
          fillColor: '#FF6B6B',
          color: '#DC143C',
          weight: 2
        };
      } else {
        return {
          ...baseStyle,
          fillColor: '#E6FFE6',
          color: '#32CD32'
        };
      }
    }

    return baseStyle;
  };

  const getRoadStyle = (feature) => {
    const props = feature.properties || {};
    const fclass = props.fclass || '';
    
    switch (fclass) {
      case 'motorway':
        return { color: '#DC143C', weight: 4, opacity: 0.9 };
      case 'trunk':
        return { color: '#FF6347', weight: 3, opacity: 0.8 };
      case 'primary':
        return { color: '#FFA500', weight: 3, opacity: 0.8 };
      case 'secondary':
        return { color: '#32CD32', weight: 2, opacity: 0.7 };
      case 'tertiary':
        return { color: '#DA70D6', weight: 2, opacity: 0.6 };
      case 'residential':
        return { color: '#A0522D', weight: 1, opacity: 0.5 };
      default:
        return { color: '#696969', weight: 1, opacity: 0.4 };
    }
  };

  const getPoiStyle = (feature) => {
    const props = feature.properties || {};
    const fclass = props.fclass || '';
    const geometryType = feature.geometry?.type || '';
    
    const baseStyle = geometryType === 'Point' ? {
      radius: 7,
      weight: 3,
      opacity: 0.9,
      fillOpacity: 0.8
    } : {
      weight: 3,
      opacity: 0.9,
      fillOpacity: 0.7
    };
    
    switch (fclass) {
      case 'hospital':
        return { ...baseStyle, color: '#DC143C', fillColor: '#FF69B4' };
      case 'school':
      case 'university':
        return { ...baseStyle, color: '#1E90FF', fillColor: '#87CEEB' };
      case 'mall':
      case 'supermarket':
        return { ...baseStyle, color: '#9932CC', fillColor: '#DA70D6' };
      case 'bank':
        return { ...baseStyle, color: '#008000', fillColor: '#90EE90' };
      case 'police':
        return { ...baseStyle, color: '#000080', fillColor: '#87CEFA' };
      case 'fire_station':
        return { ...baseStyle, color: '#FF4500', fillColor: '#FF6347' };
      case 'church':
      case 'mosque':
      case 'temple':
        return { ...baseStyle, color: '#8B4513', fillColor: '#D2B48C' };
      case 'restaurant':
      case 'cafe':
        return { ...baseStyle, color: '#FF8C00', fillColor: '#FFA500' };
      case 'shop':
      case 'retail':
        return { ...baseStyle, color: '#FF1493', fillColor: '#FF69B4' };
      default:
        return { ...baseStyle, color: '#4169E1', fillColor: '#87CEEB' };
    }
  };

  const getNaturalStyle = (feature) => {
    const props = feature.properties || {};
    const fclass = props.fclass || '';
    
    switch (fclass) {
      case 'water':
        return { color: '#0077BE', weight: 1, fillColor: '#66CCFF', fillOpacity: 0.6 };
      case 'forest':
        return { color: '#228B22', weight: 1, fillColor: '#32CD32', fillOpacity: 0.6 };
      case 'park':
        return { color: '#228B22', weight: 1, fillColor: '#90EE90', fillOpacity: 0.6 };
      case 'residential':
        return { color: '#FFD700', weight: 1, fillColor: '#FFFF99', fillOpacity: 0.4 };
      case 'commercial':
        return { color: '#FF6347', weight: 1, fillColor: '#FFA07A', fillOpacity: 0.4 };
      case 'industrial':
        return { color: '#708090', weight: 1, fillColor: '#C0C0C0', fillOpacity: 0.4 };
      default:
        return { color: '#8FBC8F', weight: 1, fillColor: '#F0FFF0', fillOpacity: 0.3 };
    }
  };

  const getTransportStyle = (feature) => {
    const props = feature.properties || {};
    const fclass = props.fclass || '';
    const geometryType = feature.geometry?.type || '';
    
    const baseStyle = geometryType === 'Point' ? {
      radius: 9,
      weight: 4,
      opacity: 1.0,
      fillOpacity: 0.9
    } : {
      weight: 4,
      opacity: 1.0,
      fillOpacity: 0.8
    };
    
    switch (fclass) {
      case 'airport':
        return { 
          ...baseStyle, 
          color: '#B22222', 
          fillColor: '#FF0000', 
          ...(geometryType === 'Point' && { radius: 14 })
        };
      case 'station':
        return { ...baseStyle, color: '#191970', fillColor: '#4169E1' };
      case 'subway_station':
        return { ...baseStyle, color: '#006400', fillColor: '#32CD32' };
      case 'bus_station':
        return { ...baseStyle, color: '#FF6600', fillColor: '#FF8C00' };
      case 'ferry_terminal':
        return { ...baseStyle, color: '#008B8B', fillColor: '#20B2AA' };
      case 'railway':
        return { color: '#2F4F4F', weight: 4, opacity: 0.9 };
      case 'parking':
        return { ...baseStyle, color: '#708090', fillColor: '#A9A9A9' };
      case 'gas_station':
        return { ...baseStyle, color: '#8B0000', fillColor: '#DC143C' };
      case 'taxi':
        return { ...baseStyle, color: '#DAA520', fillColor: '#FFD700' };
      default:
        return { ...baseStyle, color: '#2F4F4F', fillColor: '#696969' };
    }
  };

  const getPlaceStyle = (feature) => {
    const props = feature.properties || {};
    const fclass = props.fclass || '';
    const geometryType = feature.geometry?.type || '';
    
    const baseStyle = geometryType === 'Point' ? {
      radius: 6,
      weight: 1,
      opacity: 0.9,
      fillOpacity: 0.7
    } : {
      weight: 2,
      opacity: 0.8,
      fillOpacity: 0.5
    };
    
    switch (fclass) {
      case 'city':
        return { 
          ...baseStyle, 
          color: '#8B0000', 
          fillColor: '#CD5C5C', 
          ...(geometryType === 'Point' && { radius: 10 })
        };
      case 'town':
        return { 
          ...baseStyle, 
          color: '#B8860B', 
          fillColor: '#DAA520', 
          ...(geometryType === 'Point' && { radius: 8 })
        };
      case 'village':
        return { 
          ...baseStyle, 
          color: '#228B22', 
          fillColor: '#32CD32', 
          ...(geometryType === 'Point' && { radius: 6 })
        };
      case 'hamlet':
        return { 
          ...baseStyle, 
          color: '#4682B4', 
          fillColor: '#87CEEB', 
          ...(geometryType === 'Point' && { radius: 4 })
        };
      default:
        return { ...baseStyle, color: '#696969', fillColor: '#A9A9A9' };
    }
  };

  const getFenceStyle = (feature) => {
    const props = feature.properties || {};
    
    return {
      fillColor: props.fence_color || '#FF1493',
      color: props.fence_stroke_color || props.fence_color || '#DC143C',
      weight: props.fence_stroke_width || 3,
      opacity: props.fence_stroke_opacity || 1.0,
      fillOpacity: props.fence_opacity || 0.4,
      dashArray: props.fence_status === 'inactive' ? '8, 4' : null,
      className: 'fence-layer'
    };
  };

  // 交互功能
  const onEachFeature = (feature, layer) => {
    if (feature.properties) {
      const props = feature.properties;
      const isOnLandText = props.is_on_land !== undefined 
        ? (props.is_on_land ? `✅ ${t('mapViewer.onLand')}` : `❌ ${t('mapViewer.inWater')}`) 
        : '';
      
      const center = layer.getBounds().getCenter();
      const lat = center.lat;
      const lng = center.lng;
      
      const popupContent = `
        <div style="padding: 10px; max-width: 250px;">
          <h4 style="margin: 0 0 8px 0; color: #1976d2;">
            ${props.name || t('mapViewer.unnamedBuilding')}
          </h4>
          <p style="margin: 2px 0;"><strong>${t('mapViewer.type')}:</strong> ${props.type || props.fclass || t('mapViewer.unknown')}</p>
          <p style="margin: 2px 0;"><strong>${t('mapViewer.osmId')}:</strong> ${props.osm_id || t('mapViewer.na')}</p>
          <p style="margin: 2px 0;"><strong>${t('mapViewer.code')}:</strong> ${props.code || t('mapViewer.na')}</p>
          <p style="margin: 2px 0;"><strong>${t('mapViewer.category')}:</strong> ${props.fclass || t('mapViewer.na')}</p>
          <p style="margin: 2px 0;"><strong>${t('mapViewer.coordinates')}:</strong> ${lat}, ${lng}</p>
          ${isOnLandText ? `<p style="margin: 4px 0; padding: 4px; background: ${props.is_on_land ? '#e8f5e8' : '#ffebee'}; border-radius: 4px;"><strong>${t('mapViewer.locationValidation')}:</strong> ${isOnLandText}</p>` : ''}
        </div>
      `;
      layer.bindPopup(popupContent);
      
      layer.on('mouseover', function() {
        const hoverStyle = props.is_on_land === false 
          ? { fillColor: '#ff1744', fillOpacity: 0.8, weight: 3 }
          : { fillColor: '#ff5722', fillOpacity: 0.6, weight: 2 };
        this.setStyle(hoverStyle);
      });
      
      layer.on('mouseout', function() {
        this.setStyle(getEnhancedBuildingStyle(feature));
      });
    }
  };

  const onEachLandFeature = (feature, layer) => {
    if (feature.properties) {
      const props = feature.properties;
      const popupContent = `
        <div style="padding: 10px; max-width: 200px;">
          <h4 style="margin: 0 0 8px 0; color: #2e7d32;">
            🌍 ${t('mapViewer.landPolygonFeature')}
          </h4>
          <p style="margin: 2px 0;"><strong>ID:</strong> ${props.gid || t('mapViewer.na')}</p>
          <p style="margin: 2px 0;"><strong>${t('mapViewer.type')}:</strong> ${t('mapViewer.landArea')}</p>
          <div style="margin-top: 8px; padding: 4px; background: #e8f5e8; border-radius: 4px;">
            <small>💡 ${t('mapViewer.landValidationTip')}</small>
          </div>
        </div>
      `;
      layer.bindPopup(popupContent);
      
      layer.on('mouseover', function() {
        this.setStyle({
          fillColor: '#81c784',
          fillOpacity: 0.6,
          weight: 2,
          color: '#1b5e20'
        });
      });

      layer.on('mouseout', function() {
        this.setStyle(getLandPolygonStyleEnhanced());
      });
    }
  };

  const onEachFenceFeature = (feature, layer) => {
    if (feature.properties) {
      const props = feature.properties;
      
      const popupContent = `
        <div style="padding: 10px; max-width: 250px;">
          <h4 style="margin: 0 0 8px 0; color: ${props.fence_color || '#1976d2'};">
            🏠 ${props.fence_name || t('mapViewer.unnamedFence')}
          </h4>
          <p style="margin: 2px 0;"><strong>${t('mapViewer.type')}:</strong> ${props.fence_type || t('mapViewer.na')}</p>
          <p style="margin: 2px 0;"><strong>${t('mapViewer.purpose')}:</strong> ${props.fence_purpose || t('mapViewer.na')}</p>
          <p style="margin: 2px 0;"><strong>${t('mapViewer.status')}:</strong> ${props.fence_status || t('mapViewer.na')}</p>
          <p style="margin: 2px 0;"><strong>${t('mapViewer.area')}:</strong> ${props.fence_area ? `${props.fence_area.toFixed(1)} ${t('mapViewer.squareMeters')}` : t('mapViewer.na')}</p>
          ${props.fence_description ? `<p style="margin: 4px 0;"><strong>${t('mapViewer.description')}:</strong> ${props.fence_description}</p>` : ''}
          <div style="margin-top: 8px;">
            <button onclick="window.selectFence && window.selectFence(${props.id})" 
                    style="background: #1976d2; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
              ${t('mapViewer.viewDetails')}
            </button>
          </div>
        </div>
      `;
      layer.bindPopup(popupContent);
      
      layer.on('mouseover', function() {
        this.setStyle({
          fillOpacity: Math.min((props.fence_opacity || 0.3) + 0.2, 1),
          weight: (props.fence_stroke_width || 2) + 1
        });
      });
      
      layer.on('mouseout', function() {
        this.setStyle(getFenceStyle(feature));
      });

      layer.on('click', function() {
        setSelectedFence(props);
        if (layer._clickCount && layer._clickCount === 2) {
          if (!fenceToolbarVisible) {
            handleEditFence(props);
          }
        } else {
          layer._clickCount = 1;
          setTimeout(() => {
            layer._clickCount = 0;
          }, 300);
        }
      });
    }
  };

  // 围栏相关函数
  const handleFenceSelect = useCallback((fence) => {
    setSelectedFence(fence);
    // 🔥 修复：选择围栏后自动定位到围栏
    if (mapInstance && fence.geometry) {
      try {
        if (fence.geometry.type === 'Polygon') {
          const coordinates = fence.geometry.coordinates[0];
          const bounds = coordinates.reduce((bounds, coord) => {
            return bounds.extend([coord[1], coord[0]]);
          }, window.L.latLngBounds());
          
          mapInstance.fitBounds(bounds, { padding: [20, 20] });
        }
      } catch (error) {
        console.error('Failed to locate fence:', error);
      }
    }
  }, [mapInstance]);

  const handleCreateFence = useCallback(() => {
    setFenceToolbarMode('create');
    setCurrentFence(null);
    setFenceToolbarVisible(true);
  }, []);

  const handleEditFence = useCallback((fence) => {
    setFenceToolbarMode('edit');
    setCurrentFence(fence);
    setFenceToolbarVisible(true);
  }, []);

  const handleCloseFenceToolbar = useCallback(() => {
    setFenceToolbarVisible(false);
    setFenceDrawing(false);
    setCurrentFence(null);
  }, []);

  const handleFenceToolbarSuccess = useCallback((fence) => {
    if (currentBounds) {
      loadLayerData('fences', currentBounds, currentZoom);
    }
    
    // 刷新围栏统计
    loadFenceStats();
    
    setFenceToolbarVisible(false);
    setCurrentFence(null);
    setFenceDrawing(false);
  }, [currentBounds, currentZoom, loadLayerData, loadFenceStats]);

  const handleDrawingStateChange = useCallback((isDrawing) => {
    setFenceDrawing(isDrawing);
  }, []);

  // 全局围栏选择函数
  useEffect(() => {
    window.selectFence = (fenceId) => {
      const fence = layerData.fences?.find(f => f.id === fenceId);
      if (fence) {
        handleFenceSelect(fence);
      }
    };

    return () => {
      delete window.selectFence;
    };
  }, [layerData.fences, handleFenceSelect]);

  // 围栏可见性变化
  useEffect(() => {
    if (fencesVisible && currentBounds) {
      loadLayerData('fences', currentBounds, currentZoom);
    }
  }, [fencesVisible, currentBounds, currentZoom, loadLayerData]);

  // 清除缓存函数
  const clearAllCache = useCallback(() => {
    setLayerData({
      buildings: null,
      landPolygons: null,
      roads: null,
      pois: null,
      natural: null,
      transport: null,
      places: null,
      fences: null
    });
    
    if (currentBounds) {
      debouncedLoadData(currentBounds, currentZoom);
        }
  }, [currentBounds, currentZoom, debouncedLoadData]);

  // 手动定位到用户位置
  const handleGoToLocation = useCallback(() => {
    if (userLocation && mapInstance) {
      mapInstance.setView([userLocation.lat, userLocation.lng], 16);
        } else {
      getUserLocation();
    }
  }, [userLocation, mapInstance, getUserLocation]);

  // 手动定位到搜索结果
  const handleGoToSearchResult = useCallback(() => {
    if (selectedLocation && mapInstance) {
      mapInstance.setView([selectedLocation.lat, selectedLocation.lng], 16);
    }
  }, [selectedLocation, mapInstance]);

  // CustomDrawTools完成回调
  const handleCustomDrawComplete = useCallback((event) => {
    // 直接调用当前活动的FenceToolbar的处理函数
    if (mapInstance?.fenceToolbar?.handleDrawComplete) {
      mapInstance.fenceToolbar.handleDrawComplete(event);
    }
  }, [mapInstance]);

  // CustomDrawTools引用回调
  const handleCustomDrawToolsRef = useCallback((ref) => {
    if (mapInstance && ref) {
      mapInstance.customDrawTools = ref;
    }
  }, [mapInstance]);

  if (!apiStatus) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100%">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, minHeight: '600px', position: 'relative' }}>
      {/* 围栏工具栏 */}
      <FenceToolbar
        visible={fenceToolbarVisible}
        mode={fenceToolbarMode}
        fence={currentFence}
        mapInstance={mapInstance}
        apiBaseUrl={API_BASE_URL}
        onClose={handleCloseFenceToolbar}
        onSuccess={handleFenceToolbarSuccess}
        onDrawingStateChange={handleDrawingStateChange}
      />

      <MapContainer
        center={[MAP_CONFIG.center.lat, MAP_CONFIG.center.lng]}
        zoom={MAP_CONFIG.zoom}
        minZoom={MAP_CONFIG.minZoom}
        maxZoom={MAP_CONFIG.maxZoom}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        <MapEventHandler 
          onBoundsChange={handleBoundsChange}
          onZoomChange={handleZoomChange}
          onMapReady={handleMapReady}
        />
        
        {/* 改进的CustomDrawTools组件 */}
        <CustomDrawTools 
          isActive={fenceDrawing}
          onDrawComplete={handleCustomDrawComplete}
          onRef={handleCustomDrawToolsRef}
          drawingMode="polygon"
          drawLayerGroup={mapInstance?._fenceDrawLayer}
          editingGeometry={fenceToolbarMode === 'edit' && currentFence ? currentFence.geometry : null}
          editingAnchors={fenceToolbarMode === 'edit' && currentFence ? currentFence.anchors : null}
          style={{
            color: '#FF0000',
            fillColor: '#FF0000',
            fillOpacity: 0.3,
            weight: 2
          }}
        />
        
        {/* 陆地多边形图层 */}
        {layersVisible.landPolygons && layerData.landPolygons && Array.isArray(layerData.landPolygons.features) && layerData.landPolygons.features.length > 0 && (() => {
          const validFeatures = validateAndFilterFeatures(layerData.landPolygons.features, 'Land Polygons');
          
          if (validFeatures.length === 0) return null;
          
          try {
            return (
              <GeoJSON
                key={`land-polygons-${landDisplayMode}-${currentZoom}-${validFeatures.length}`}
                data={{
                  type: 'FeatureCollection',
                  features: validFeatures
                }}
                style={getLandPolygonStyleEnhanced}
                filter={(feature) => feature && feature.geometry && feature.geometry.type}
                onEachFeature={onEachLandFeature}
                eventHandlers={{
                  error: (e) => console.error('Land polygon GeoJSON render error:', e)
                }}
              />
            );
          } catch (error) {
            console.error('Land polygon layer render failed:', error);
            return null;
          }
        })()}
        
        {/* 建筑物图层 */}
        {layersVisible.buildings && layerData.buildings && Array.isArray(layerData.buildings.features) && layerData.buildings.features.length > 0 && (() => {
          const validFeatures = validateAndFilterFeatures(layerData.buildings.features, 'Buildings');
          
          if (validFeatures.length === 0) return null;
          
          try {
            return (
              <GeoJSON
                key={`buildings-${selectedCategory || 'all'}-${currentZoom}-${validFeatures.length}`}
                data={{
                  type: 'FeatureCollection',
                  features: validFeatures
                }}
                style={getEnhancedBuildingStyle}
                filter={(feature) => feature && feature.geometry && feature.geometry.type}
                onEachFeature={onEachFeature}
                eventHandlers={{
                  error: (e) => console.error('Building GeoJSON render error:', e)
                }}
              />
            );
          } catch (error) {
            console.error('Building layer render failed:', error);
            return null;
          }
        })()}

        {/* 道路图层 */}
        {layersVisible.roads && layerData.roads && layerData.roads.features && Array.isArray(layerData.roads.features) && layerData.roads.features.length > 0 && (() => {
          const validFeatures = validateAndFilterFeatures(layerData.roads.features, 'Roads');
          
          if (validFeatures.length === 0) return null;
          
          try {
            return (
              <GeoJSON
                key={`roads-${currentZoom}-${validFeatures.length}`}
                data={{
                  type: 'FeatureCollection',
                  features: validFeatures
                }}
                style={getRoadStyle}
                filter={(feature) => feature && feature.geometry && feature.geometry.type}
                onEachFeature={(feature, layer) => {
                  if (feature.properties) {
                    const props = feature.properties;
                    const popupContent = `
                      <div style="padding: 10px; max-width: 250px;">
                        <h4 style="margin: 0 0 8px 0; color: #1976d2;">🛣️ ${t('mapViewer.roadInfo')}</h4>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.name')}:</strong> ${props.name || t('mapViewer.unnamedRoad')}</p>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.type')}:</strong> ${props.fclass || t('mapViewer.na')}</p>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.maxSpeed')}:</strong> ${props.maxspeed || t('mapViewer.na')}</p>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.oneWay')}:</strong> ${props.oneway === 'yes' ? t('mapViewer.yes') : t('mapViewer.no')}</p>
                        ${props.bridge === 'yes' ? `<p style="margin: 2px 0; color: #ff6b35;">🌉 ${t('mapViewer.bridge')}</p>` : ''}
                        ${props.tunnel === 'yes' ? `<p style="margin: 2px 0; color: #666;">🚇 ${t('mapViewer.tunnel')}</p>` : ''}
                      </div>
                    `;
                    layer.bindPopup(popupContent);
                  }
                }}
                eventHandlers={{
                  error: (e) => console.error('Road GeoJSON render error:', e)
                }}
              />
            );
          } catch (error) {
            console.error('Road layer render failed:', error);
            return null;
          }
        })()}

        {/* POI图层 */}
        {layersVisible.pois && layerData.pois && layerData.pois.features && Array.isArray(layerData.pois.features) && layerData.pois.features.length > 0 && (() => {
          const validFeatures = validateAndFilterFeatures(layerData.pois.features, 'POIs');
          
          if (validFeatures.length === 0) return null;
          
          try {
            return (
              <GeoJSON
                key={`pois-${currentZoom}-${validFeatures.length}`}
                data={{
                  type: 'FeatureCollection',
                  features: validFeatures
                }}
                style={getPoiStyle}
                filter={(feature) => feature && feature.geometry && feature.geometry.type}
                onEachFeature={(feature, layer) => {
                  if (feature.properties) {
                    const props = feature.properties;
                    const popupContent = `
                      <div style="padding: 10px; max-width: 250px;">
                        <h4 style="margin: 0 0 8px 0; color: #1976d2;">📍 ${t('mapViewer.pointOfInterest')}</h4>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.name')}:</strong> ${props.name || t('mapViewer.unnamed')}</p>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.type')}:</strong> ${props.fclass || t('mapViewer.na')}</p>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.category')}:</strong> ${props.code || t('mapViewer.na')}</p>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.dataSource')}:</strong> ${props.source_table || t('mapViewer.na')}</p>
                      </div>
                    `;
                    layer.bindPopup(popupContent);
                  }
                }}
                eventHandlers={{
                  error: (e) => console.error('POI GeoJSON render error:', e)
                }}
              />
            );
          } catch (error) {
            console.error('POI layer render failed:', error);
            return null;
          }
        })()}

        {/* 自然地理要素图层 */}
        {layersVisible.natural && layerData.natural && layerData.natural.features && Array.isArray(layerData.natural.features) && layerData.natural.features.length > 0 && (() => {
          const validFeatures = validateAndFilterFeatures(layerData.natural.features, 'Natural Features');
          
          if (validFeatures.length === 0) return null;
          
          try {
            return (
              <GeoJSON
                key={`natural-${currentZoom}-${validFeatures.length}`}
                data={{
                  type: 'FeatureCollection',
                  features: validFeatures
                }}
                style={getNaturalStyle}
                filter={(feature) => feature && feature.geometry && feature.geometry.type}
                onEachFeature={(feature, layer) => {
                  if (feature.properties) {
                    const props = feature.properties;
                    const popupContent = `
                      <div style="padding: 10px; max-width: 250px;">
                        <h4 style="margin: 0 0 8px 0; color: #1976d2;">🌿 ${t('mapViewer.naturalGeoFeatures')}</h4>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.name')}:</strong> ${props.name || t('mapViewer.unnamed')}</p>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.type')}:</strong> ${props.fclass || t('mapViewer.na')}</p>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.category')}:</strong> ${props.code || t('mapViewer.na')}</p>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.dataSource')}:</strong> ${props.source_table || t('mapViewer.na')}</p>
                      </div>
                    `;
                    layer.bindPopup(popupContent);
                  }
                }}
                eventHandlers={{
                  error: (e) => console.error('Natural GeoJSON render error:', e)
                }}
              />
            );
          } catch (error) {
            console.error('Natural layer render failed:', error);
            return null;
          }
        })()}

        {/* 交通设施图层 */}
        {layersVisible.transport && layerData.transport && layerData.transport.features && Array.isArray(layerData.transport.features) && layerData.transport.features.length > 0 && (() => {
          const validFeatures = validateAndFilterFeatures(layerData.transport.features, 'Transport');
          
          if (validFeatures.length === 0) return null;
          
          try {
            return (
              <GeoJSON
                key={`transport-${currentZoom}-${validFeatures.length}`}
                data={{
                  type: 'FeatureCollection',
                  features: validFeatures
                }}
                style={getTransportStyle}
                filter={(feature) => feature && feature.geometry && feature.geometry.type}
                onEachFeature={(feature, layer) => {
                  if (feature.properties) {
                    const props = feature.properties;
                    const popupContent = `
                      <div style="padding: 10px; max-width: 250px;">
                        <h4 style="margin: 0 0 8px 0; color: #1976d2;">🚌 ${t('mapViewer.transportFacility')}</h4>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.name')}:</strong> ${props.name || t('mapViewer.unnamed')}</p>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.type')}:</strong> ${props.fclass || t('mapViewer.na')}</p>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.category')}:</strong> ${props.code || t('mapViewer.na')}</p>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.dataSource')}:</strong> ${props.source_table || t('mapViewer.na')}</p>
                      </div>
                    `;
                    layer.bindPopup(popupContent);
                  }
                }}
                eventHandlers={{
                  error: (e) => console.error('Transport GeoJSON render error:', e)
                }}
              />
            );
          } catch (error) {
            console.error('Transport layer render failed:', error);
            return null;
          }
        })()}

        {/* 地名图层 */}
        {layersVisible.places && layerData.places && layerData.places.features && Array.isArray(layerData.places.features) && layerData.places.features.length > 0 && (() => {
          const validFeatures = validateAndFilterFeatures(layerData.places.features, 'Places');
          
          if (validFeatures.length === 0) return null;
          
          try {
            return (
              <GeoJSON
                key={`places-${currentZoom}-${validFeatures.length}`}
                data={{
                  type: 'FeatureCollection',
                  features: validFeatures
                }}
                style={getPlaceStyle}
                filter={(feature) => feature && feature.geometry && feature.geometry.type}
                onEachFeature={(feature, layer) => {
                  if (feature.properties) {
                    const props = feature.properties;
                    const popupContent = `
                      <div style="padding: 10px; max-width: 250px;">
                        <h4 style="margin: 0 0 8px 0; color: #1976d2;">📍 ${t('mapViewer.placeName')}</h4>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.name')}:</strong> ${props.name || t('mapViewer.unnamed')}</p>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.type')}:</strong> ${props.fclass || t('mapViewer.na')}</p>
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.category')}:</strong> ${props.code || t('mapViewer.na')}</p>
                        ${props.population ? `<p style="margin: 2px 0;"><strong>${t('mapViewer.population')}:</strong> ${props.population}</p>` : ''}
                        <p style="margin: 2px 0;"><strong>${t('mapViewer.dataSource')}:</strong> ${props.source_table || t('mapViewer.na')}</p>
                      </div>
                    `;
                    layer.bindPopup(popupContent);
                  }
                }}
                eventHandlers={{
                  error: (e) => console.error('Places GeoJSON render error:', e)
                }}
              />
            );
          } catch (error) {
            console.error('Places layer render failed:', error);
            return null;
          }
        })()}
        
        {/* 围栏图层 */}
        {fencesVisible && layerData.fences && Array.isArray(layerData.fences) && layerData.fences.length > 0 && (() => {
          const validFeatures = validateAndFilterFeatures(layerData.fences, 'Fences');
          
          if (validFeatures.length === 0) return null;
          
          try {
            return (
              <GeoJSON
                key={`fences-${validFeatures.length}-${Date.now()}`}
                data={{
                  type: 'FeatureCollection',
                  features: validFeatures
                }}
                style={getFenceStyle}
                filter={(feature) => feature && feature.geometry && feature.geometry.type}
                onEachFeature={onEachFenceFeature}
                eventHandlers={{
                  error: (e) => console.error('Fence GeoJSON render error:', e)
                }}
                pane="overlayPane"
              />
            );
          } catch (error) {
            console.error('Fence layer render failed:', error);
            return null;
          }
        })()}
        
        {/* 定位标记 */}
        {selectedLocation && (
          <Marker position={[selectedLocation.lat, selectedLocation.lng]} icon={createLocationIcon()}>
            <Popup>
              <div style={{ padding: '10px', minWidth: '200px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#1976d2' }}>
                  📍 {t('mapViewer.locationPoint')}
                </h4>
                <p style={{ margin: '2px 0' }}>
                  <strong>{t('mapViewer.coordinates')}:</strong> {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
                </p>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => getNearbyInfo(selectedLocation.lat, selectedLocation.lng)}
                  style={{ marginTop: '8px' }}
                >
                  {t('mapViewer.viewNearbyInfo')}
                </Button>
              </div>
            </Popup>
          </Marker>
        )}

      </MapContainer>
      
      {/* 加载指示器 */}
      {Object.values(layerLoading).some(loading => loading) && (
        <Box
          position="absolute"
          top="50%"
          left="50%"
          transform="translate(-50%, -50%)"
          zIndex={1000}
        >
          <CircularProgress />
        </Box>
      )}

      {/* 统计信息面板 */}
      {!fenceToolbarVisible && (
        <Paper
          sx={{
            position: 'absolute',
            top: 10,
            right: 10,
            p: 2,
            zIndex: 1500, // 比围栏图层高但比绘制工具低
            minWidth: 300
          }}
        >
        {/* 搜索框 */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
              {t('mapViewer.searchLocation')}
          </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small"
                placeholder={t('mapViewer.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchLocation(searchQuery)}
              sx={{ flex: 1 }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={() => searchLocation(searchQuery)}
              disabled={searchLoading}
              startIcon={searchLoading ? <CircularProgress size={16} /> : <Search />}
            >
                {t('mapViewer.search')}
            </Button>
          </Box>
            {/* 自动定位控制 */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button
                size="small"
                variant={autoLocationEnabled ? "contained" : "outlined"}
                onClick={() => {
                  const newAutoLocationEnabled = !autoLocationEnabled;
                  setAutoLocationEnabled(newAutoLocationEnabled);
                  saveToStorage(MAPVIEWER_STORAGE_KEYS.AUTO_LOCATION_ENABLED, newAutoLocationEnabled);
                }}
                color={autoLocationEnabled ? "success" : "primary"}
              >
                {autoLocationEnabled ? '🟢 ' : '⚪ '}
                {t('mapViewer.autoLocation')}
              </Button>
              {selectedLocation && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleGoToSearchResult}
                  startIcon={<LocationOn />}
                >
                  {t('mapViewer.goToResult')}
                </Button>
              )}
          </Box>
        </Box>
        
          {/* 显示模式选择 */}
        {layersVisible.landPolygons && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
                {t('mapViewer.landPolygonDisplayMode')}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Button
                size="small"
                variant={landDisplayMode === 'subtle' ? "contained" : "outlined"}
                onClick={() => {
                  setLandDisplayMode('subtle');
                  saveToStorage(MAPVIEWER_STORAGE_KEYS.LAND_DISPLAY_MODE, 'subtle');
                }}
                style={{ justifyContent: 'flex-start', fontSize: '0.75rem' }}
              >
                  🟢 {t('mapViewer.lightMode')}
              </Button>
              <Button
                size="small"
                variant={landDisplayMode === 'clear' ? "contained" : "outlined"}
                onClick={() => {
                  setLandDisplayMode('clear');
                  saveToStorage(MAPVIEWER_STORAGE_KEYS.LAND_DISPLAY_MODE, 'clear');
                }}
                style={{ justifyContent: 'flex-start', fontSize: '0.75rem' }}
              >
                  🟩 {t('mapViewer.clearMode')}
              </Button>
              <Button
                size="small"
                variant={landDisplayMode === 'coastline' ? "contained" : "outlined"}
                onClick={() => {
                  setLandDisplayMode('coastline');
                  saveToStorage(MAPVIEWER_STORAGE_KEYS.LAND_DISPLAY_MODE, 'coastline');
                }}
                style={{ justifyContent: 'flex-start', fontSize: '0.75rem' }}
              >
                  🌊 {t('mapViewer.coastlineMode')}
              </Button>
            </Box>
          </Box>
        )}
        
        {/* 建筑物验证功能 */}
        {layersVisible.buildings && (
          <Box sx={{ mb: 2 }}>
            <Button
              size="small"
              variant={validateBuildings ? "contained" : "outlined"}
              onClick={() => {
                const newValidateBuildings = !validateBuildings;
                setValidateBuildings(newValidateBuildings);
                saveToStorage(MAPVIEWER_STORAGE_KEYS.VALIDATE_BUILDINGS, newValidateBuildings);
                if (currentBounds) {
                  loadLayerData('buildings', currentBounds, currentZoom);
                }
              }}
              style={{ justifyContent: 'flex-start' }}
              color={validateBuildings ? "success" : "primary"}
            >
              🔍 {t('mapViewer.buildingLandValidation')} ({validateBuildings ? t('mapViewer.on') : t('mapViewer.off')})
            </Button>
          </Box>
        )}
        
          {/* 功能按钮 */}
          <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" onClick={clearAllCache}>
              {t('mapViewer.clearCache')}
          </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                const newAutoLocationEnabled = true;
                setAutoLocationEnabled(newAutoLocationEnabled);
                saveToStorage(MAPVIEWER_STORAGE_KEYS.AUTO_LOCATION_ENABLED, newAutoLocationEnabled);
                handleGoToLocation();
              }}
              startIcon={locationLoading ? <CircularProgress size={16} /> : <MyLocation />}
            >
              {t('mapViewer.myLocation')}
          </Button>
        </Box>

        {/* 围栏管理 */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
            <Button 
              size="small" 
              variant="contained" 
              color="secondary" 
              onClick={handleCreateFence}
              disabled={fenceToolbarVisible}
              sx={{ flex: 1 }}
            >
                🖊️ {t('mapViewer.createFence')}
            </Button>
            <Button 
              size="small" 
              variant="outlined" 
              onClick={() => setShowFenceManager(true)}
              sx={{ flex: 1 }}
            >
                🏠 {t('mapViewer.fenceList')}
            </Button>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant={fencesVisible ? "contained" : "outlined"}
                onClick={() => {
                  const newFencesVisible = !fencesVisible;
                  setFencesVisible(newFencesVisible);
                  saveToStorage(MAPVIEWER_STORAGE_KEYS.FENCES_VISIBLE, newFencesVisible);
                }}
              color={fencesVisible ? "success" : "primary"}
            >
                {fencesVisible ? `🟢 ${t('mapViewer.fenceDisplay')}` : `⚪ ${t('mapViewer.fenceHidden')}`}
            </Button>
            {selectedFence && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleEditFence(selectedFence)}
                disabled={fenceToolbarVisible}
              >
                  ✏️ {t('mapViewer.editFence')}
              </Button>
            )}
            {selectedFence && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => setSelectedFence(null)}
              >
                  {t('mapViewer.cancelSelection')}
              </Button>
            )}
          </Box>
          {fenceToolbarVisible && (
            <Alert severity="info" sx={{ mt: 1 }}>
                🛠️ {t('mapViewer.fenceToolbarActive')}
            </Alert>
          )}
        </Box>
        
          {/* 数据统计 */}
          <Box sx={{ mb: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              {t('mapViewer.dataStatistics')}
            </Typography>
        <Typography variant="body2">
              {t('mapViewer.totalFeatures')}: {apiStatus?.total_features?.toLocaleString() || 0}
        </Typography>
        
            {/* 🔥 优化：显示详细的图层加载状态 */}
            {Object.entries(layerData).map(([layerName, data]) => {
              const isVisible = layerName === 'fences' ? fencesVisible : layersVisible[layerName];
              const isLoading = layerLoading[layerName];
              
              let featureCount = 0;
              if (layerName === 'fences') {
                // 使用全部围栏统计数据
                featureCount = fenceStats.totalFences;
              } else if (Array.isArray(data)) {
                featureCount = data.length;
              } else if (data && data.features && Array.isArray(data.features)) {
                featureCount = data.features.length;
              }
              
              let statusIcon = '⚪';
              let statusColor = '#666';
              
              if (!isVisible) {
                statusIcon = '❌';
                statusColor = '#999';
              } else if (isLoading) {
                statusIcon = '🔄';
                statusColor = '#1976d2';
              } else if (featureCount > 0) {
                statusIcon = '✅';
                statusColor = '#4caf50';
              } else if (data === null && layerName !== 'fences') {
                statusIcon = '⚠️';
                statusColor = '#ff9800';
              }
              
              // 图层名称映射
              const layerNameMap = {
                buildings: t('mapViewer.buildings'),
                landPolygons: t('mapViewer.landPolygons'),
                roads: t('mapViewer.roadNetwork'),
                pois: t('mapViewer.pois'),
                natural: t('mapViewer.naturalFeatures'),
                transport: t('mapViewer.transportFacilities'),
                places: t('mapViewer.placeNames'),
                fences: t('mapViewer.electronicFences')
              };
              
              return (
                <Typography key={layerName} variant="body2" sx={{ color: statusColor }}>
                  {statusIcon} {layerNameMap[layerName] || layerName}: {
                    !isVisible ? t('mapViewer.hidden') :
                    isLoading ? t('mapViewer.loading') :
                    featureCount > 0 ? featureCount.toLocaleString() :
                    data === null && layerName !== 'fences' ? t('mapViewer.noData') :
                    layerName === 'fences' ? '0' :
                    t('mapViewer.notEnabled')
                  }
                  {layerName === 'buildings' && validateBuildings && ` 🔍${t('mapViewer.validating')}`}
                  {layerName === 'fences' && selectedFence && ` ✅${t('mapViewer.selected')}`}
                  {layerName === 'fences' && fenceToolbarVisible && ` 🛠️${t('mapViewer.toolbarActive')}`}
                  {layerName === 'fences' && fenceDrawing && ` 🖊️${t('mapViewer.drawing')}`}
          </Typography>
              );
            })}
        
            <Typography variant="body2">
              {t('mapViewer.zoomLevel')}: {currentZoom}
              {configLoaded && currentZoom >= 16 && (
                <span style={{ color: '#4caf50', marginLeft: '8px' }}>
                  🚀 {t('mapViewer.highZoomMode')}
                </span>
              )}
          </Typography>
            
            {/* 🔥 新增：显示缩放级别建议 */}
            {currentZoom < 9 && (
              <Typography variant="body2" sx={{ color: '#ff9800', fontSize: '0.75rem' }}>
                💡 {t('mapViewer.zoomSuggestion')}: {t('mapViewer.zoomInForMoreLayers')}
          </Typography>
        )}
        
            {/* 配置加载状态 */}
            <Typography variant="body2" color={configLoaded ? "success.main" : "warning.main"}>
              {configLoaded ? '✅ ' : '⚠️ '}{t('mapViewer.backendConfig')}: {configLoaded ? t('mapViewer.loaded') : t('mapViewer.loading')}
          </Typography>
        
            {/* 自动定位状态 */}
            <Typography variant="body2" color={autoLocationEnabled ? "success.main" : "info.main"}>
              {autoLocationEnabled ? '✅ ' : '⚪ '}{t('mapViewer.autoLocationStatus')}: {autoLocationEnabled ? t('mapViewer.enabled') : t('mapViewer.disabled')}
        </Typography>
            
        {userLocation && (
          <Typography variant="body2" color="success.main">
                📍 {t('mapViewer.locationObtained')}: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
          </Typography>
        )}
            
        {selectedCategory && (
          <Typography variant="body2">
                🏷️ {t('mapViewer.filterCategory')}: {selectedCategory}
          </Typography>
        )}
          </Box>
      </Paper>
      )}
      
      {/* 周边信息对话框 */}
      <NearbyInfoDialog 
        open={showNearbyDialog} 
        onClose={() => setShowNearbyDialog(false)}
        nearbyInfo={nearbyInfo}
      />
      
      {/* 位置指示器 */}
      <LocationIndicator 
        selectedLocation={selectedLocation}
        currentZoom={currentZoom}
      />

      {/* 围栏管理对话框 */}
      <FenceManager
        open={showFenceManager}
        onClose={() => setShowFenceManager(false)}
        apiBaseUrl={API_BASE_URL}
        mapInstance={mapInstance}
        currentBounds={currentBounds}
        onFenceSelect={handleFenceSelect}
        onFenceCreate={handleCreateFence}
        onFenceEdit={handleEditFence}
        onFenceUpdate={() => {
          if (currentBounds) {
            loadLayerData('fences', currentBounds, currentZoom);
          }
          loadFenceStats();
        }}
        onFenceDelete={() => {
          if (currentBounds) {
            loadLayerData('fences', currentBounds, currentZoom);
          }
          loadFenceStats();
          setSelectedFence(null);
        }}
        toolbarVisible={fenceToolbarVisible}
      />



    </Box>
  );
};

export default MapViewer; 