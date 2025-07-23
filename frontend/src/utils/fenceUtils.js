/**
 * 围栏工具函数和API调用
 * 统一的围栏相关功能文件
 */

import { API_BASE_URL } from '../config';

// ========== 常量定义 ==========
export const FENCE_COLORS = [
  "#FF0000", "#00FF00", "#0000FF", "#FFFF00", 
  "#FF00FF", "#00FFFF", "#FFA500", "#800080", 
  "#008000", "#808080", "#000000", "#FFFFFF"
];

// 统一的层级配置 - 与MapViewer.js中的CSS样式保持一致
export const Z_INDEX = {
  // 基础地图图层
  FENCE_LAYER: 1000,              // .fence-layer (CSS !important)
  MAP_CONTROLS: 1500,             // 地图控件
  
  // 绘制相关图层 (高优先级)
  FENCE_PATH: 9999,               // 围栏路径图层
  DRAWING_OVERLAY: 10000,         // .drawing-overlay (CSS !important)  
  ANCHOR_POINTS: 10001,           // 锚点和控制柄 (CSS !important)
  FENCE_TOOLBAR: 10002,           // 围栏工具栏 (CSS !important)
  FENCE_TOOLBAR_COLLAPSED: 10002, // 折叠状态工具栏 (与展开状态同级)
  
  // 对话框和提示
  DIALOG: 10003,                  // 对话框
  ALERT: 9999                     // 提示信息
};

// ========== API调用函数 ==========

// 通用请求函数
const makeRequest = async (url, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
};

// 获取围栏列表
export const getFenceList = async (params = {}) => {
  const urlParams = new URLSearchParams();
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      urlParams.append(key, params[key]);
    }
  });
  return await makeRequest(`/api/fences?${urlParams}`);
};

// 删除围栏
export const deleteFence = async (fenceId) => {
  return await makeRequest(`/api/fences/${fenceId}`, { method: 'DELETE' });
};

// 创建围栏
export const createFence = async (fenceData) => {
  return await makeRequest('/api/fences', {
    method: 'POST',
    body: JSON.stringify(fenceData),
  });
};

// 更新围栏
export const updateFence = async (fenceId, fenceData) => {
  return await makeRequest(`/api/fences/${fenceId}`, {
    method: 'PUT', 
    body: JSON.stringify(fenceData),
  });
};

// 检测围栏重叠
export const detectFenceOverlaps = async (fenceId) => {
  return await makeRequest(`/api/fences/${fenceId}/overlaps`);
};

// 获取围栏图层分析
export const getFenceLayerAnalysis = async (fenceId, layerTypes = null) => {
  const urlParams = new URLSearchParams();
  if (layerTypes && layerTypes.length > 0) {
    urlParams.append('layer_types', layerTypes.join(','));
  }
  return await makeRequest(`/api/fences/${fenceId}/layer-analysis?${urlParams}`);
};

// ========== 格式化函数 ==========

/**
 * 格式化面积显示
 */
export const formatArea = (area) => {
  if (!area || isNaN(area)) return 'N/A';
  
  if (area < 1000) {
    return `${area.toFixed(1)} m²`;
  } else if (area < 1000000) {
    return `${(area / 1000).toFixed(2)} km²`;
  } else {
    return `${(area / 1000000).toFixed(2)} km²`;
  }
};

/**
 * 格式化时间显示
 */
export const formatDateTime = (dateStr) => {
  if (!dateStr) return 'N/A';
  
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
  } catch (error) {
    console.warn('Invalid date string:', dateStr);
    return 'N/A';
  }
};

// ========== 状态工具函数 ==========

/**
 * 获取围栏状态颜色
 */
export const getFenceStatusColor = (status) => {
  switch (status) {
    case 'active': return 'success';
    case 'inactive': return 'warning';
    case 'deleted': return 'error';
    default: return 'default';
  }
};

/**
 * 获取重叠严重程度颜色
 */
export const getOverlapSeverityColor = (percentage) => {
  if (percentage > 50) return 'error';
  if (percentage > 20) return 'warning';
  if (percentage > 5) return 'info';
  return 'success';
};

// ========== 验证函数 ==========

/**
 * 简单的围栏数据验证
 */
export const validateFenceData = (fence) => {
  const errors = {};
  
  if (!fence.fence_name?.trim()) {
    errors.fence_name = 'Fence name is required';
  }
  
  if (!fence.fence_geometry && !fence.geometry) {
    errors.geometry = 'Fence geometry is required';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// ========== 错误处理函数 ==========

/**
 * 标准化错误信息
 */
export const normalizeError = (error) => {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error?.message) {
    return error.message;
  }
  
  return 'An unknown error occurred';
};

/**
 * 生成操作确认消息
 */
export const getConfirmMessage = (action, fenceName) => {
  const messages = {
    delete: `Are you sure you want to delete fence "${fenceName}"?`,
  };
  
  return messages[action] || `Are you sure you want to ${action} fence "${fenceName}"?`;
}; 

// ========== 样式生成函数 ==========

/**
 * 生成围栏图层CSS样式字符串
 * 确保CSS中的z-index值与JavaScript常量一致
 */
export const generateFenceLayerCSS = () => `
  /* 围栏图层样式 - 确保持久显示 */
  .fence-layer {
    z-index: ${Z_INDEX.FENCE_LAYER} !important;
    pointer-events: auto;
  }
  
  /* 绘制覆盖层样式 - 最高优先级 */
  .drawing-overlay {
    z-index: ${Z_INDEX.DRAWING_OVERLAY} !important;
    pointer-events: none;
    background: transparent;
    cursor: crosshair;
  }
  
  /* 锚点和控制柄样式 */
  .leaflet-marker-icon,
  .leaflet-marker-shadow {
    z-index: ${Z_INDEX.ANCHOR_POINTS} !important;
  }
  
  /* 围栏工具栏样式 */
  .fence-toolbar {
    z-index: ${Z_INDEX.FENCE_TOOLBAR} !important;
    backdrop-filter: blur(10px);
    background: rgba(255, 255, 255, 0.98);
  }
  
  /* 完成绘制后的围栏图层 */
  .completed-fence-layer {
    z-index: ${Z_INDEX.FENCE_PATH} !important;
    pointer-events: auto;
  }
  
  /* 编辑模式的围栏图层 */
  .editing-fence-layer {
    z-index: ${Z_INDEX.FENCE_PATH} !important;
    pointer-events: auto;
    cursor: move;
  }
  
  /* 编辑模式备用显示 */
  .editing-fence-fallback {
    z-index: ${Z_INDEX.FENCE_PATH} !important;
    pointer-events: auto;
    opacity: 0.8;
  }
  
  /* 绘制过程中的路径 */
  .leaflet-interactive {
    z-index: ${Z_INDEX.FENCE_PATH} !important;
  }
`;

/**
 * 应用z-index到图层
 * @param {L.Layer} layer - Leaflet图层对象
 * @param {number} zIndex - z-index值
 */
export const applyZIndexToLayer = (layer, zIndex) => {
  if (!layer) return;
  
  try {
    // 设置图层的z-index
    if (layer.setZIndex) {
      layer.setZIndex(zIndex);
    }
    
    // 对于路径图层，直接设置DOM元素的z-index
    if (layer._path) {
      layer._path.style.zIndex = zIndex;
    }
    
    // 对于标记图层
    if (layer._icon) {
      layer._icon.style.zIndex = zIndex;
    }
    
    // 对于图层组
    if (layer.eachLayer) {
      layer.eachLayer(subLayer => applyZIndexToLayer(subLayer, zIndex));
    }
    
    console.log(`图层z-index已设置为: ${zIndex}`);
  } catch (error) {
    console.error("设置图层z-index失败:", error);
  }
};

/**
 * 创建持久化的围栏显示图层
 * @param {Object} geometry - GeoJSON几何对象
 * @param {Object} style - 样式配置
 * @param {L.Map} map - Leaflet地图实例
 * @returns {L.Layer} 创建的图层
 */
export const createPersistentFenceLayer = (geometry, style, map) => {
  if (!geometry || !geometry.coordinates || !map) {
    console.warn("创建围栏图层参数不足");
    return null;
  }
  
  try {
    const coords = geometry.coordinates[0];
    const latLngs = coords.slice(0, -1).map(coord => L.latLng(coord[1], coord[0]));
    
    if (latLngs.length < 3) {
      console.warn("坐标点不足，无法创建围栏图层");
      return null;
    }
    
    const layer = L.polygon(latLngs, {
      ...style,
      className: 'persistent-fence-layer',
      interactive: true
    });
    
    // 应用z-index
    applyZIndexToLayer(layer, Z_INDEX.FENCE_PATH);
    
    // 添加到地图
    layer.addTo(map);
    
    console.log("持久化围栏图层已创建");
    return layer;
  } catch (error) {
    console.error("创建持久化围栏图层失败:", error);
    return null;
  }
};

/**
 * 清理围栏相关的所有图层
 * @param {L.Map} map - Leaflet地图实例
 */
export const cleanupFenceLayers = (map) => {
  if (!map) return;
  
  try {
    // 清理所有围栏相关的图层
    map.eachLayer(layer => {
      if (layer.options && layer.options.className) {
        const className = layer.options.className;
        if (className.includes('fence') || className.includes('drawing') || className.includes('anchor')) {
          map.removeLayer(layer);
        }
      }
    });
    
    console.log("围栏图层已清理");
  } catch (error) {
    console.error("清理围栏图层失败:", error);
  }
};

/**
 * 注入围栏样式到页面
 */
export const injectFenceStyles = () => {
  const styleId = 'fence-layer-styles';
  
  // 避免重复注入
  if (document.getElementById(styleId)) {
    return;
  }
  
  try {
    const style = document.createElement('style');
    style.id = styleId;
    style.type = 'text/css';
    style.innerHTML = generateFenceLayerCSS();
    document.head.appendChild(style);
    
    console.log("围栏样式已注入");
  } catch (error) {
    console.error("注入围栏样式失败:", error);
  }
}; 