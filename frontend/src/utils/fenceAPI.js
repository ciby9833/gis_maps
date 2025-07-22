/**
 * 围栏API公共函数
 * 合并所有组件中重复的API调用逻辑
 */

// 获取API基础URL
const getApiBaseUrl = () => {
  if (process.env.REACT_APP_API_BASE_URL) {
    return process.env.REACT_APP_API_BASE_URL;
  }
  return process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : '';
};

const API_BASE_URL = getApiBaseUrl();

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

// ========== 合并所有组件的API函数 ==========

// 获取围栏列表 (来自 FenceManager.js)
export const getFenceList = async (params = {}) => {
  const urlParams = new URLSearchParams();
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      urlParams.append(key, params[key]);
    }
  });
  return await makeRequest(`/api/fences?${urlParams}`);
};

// 删除围栏 (来自 FenceManager.js) 
export const deleteFence = async (fenceId) => {
  return await makeRequest(`/api/fences/${fenceId}`, { method: 'DELETE' });
};

// 创建围栏 (来自 FenceToolbar.js)
export const createFence = async (fenceData) => {
  return await makeRequest('/api/fences', {
    method: 'POST',
    body: JSON.stringify(fenceData),
  });
};

// 更新围栏 (来自 FenceToolbar.js)
export const updateFence = async (fenceId, fenceData) => {
  return await makeRequest(`/api/fences/${fenceId}`, {
    method: 'PUT', 
    body: JSON.stringify(fenceData),
  });
};

// 验证围栏几何 (来自 FenceToolbar.js)
export const validateFenceGeometry = async (geometry) => {
  return await makeRequest('/api/fences/validate-geometry', {
    method: 'POST',
    body: JSON.stringify(geometry),
  });
};

// 检测围栏重叠 (来自 FenceDetailDialog.js)
export const detectFenceOverlaps = async (fenceId) => {
  return await makeRequest(`/api/fences/${fenceId}/overlaps`);
};

// 获取围栏图层分析 (来自 FenceDetailDialog.js) 
export const getFenceLayerAnalysis = async (fenceId, layerTypes = null) => {
  const urlParams = new URLSearchParams();
  if (layerTypes && layerTypes.length > 0) {
    urlParams.append('layer_types', layerTypes.join(','));
  }
  return await makeRequest(`/api/fences/${fenceId}/layer-analysis?${urlParams}`);
}; 