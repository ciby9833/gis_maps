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

// 统一的层级配置
export const Z_INDEX = {
  MAP_LAYERS: 1000,
  MAP_CONTROLS: 1500,  
  FENCE_LAYERS: 9999,
  ANCHORS: 10000,
  ANCHOR_HANDLES: 10001,
  FENCE_TOOLBAR: 10002,
  FENCE_TOOLBAR_COLLAPSED: 10002,
  DIALOG: 10003,
  ALERT: 9999
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