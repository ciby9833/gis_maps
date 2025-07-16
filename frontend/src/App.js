import React, { useState, useEffect, Suspense } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import MapViewer from './components/MapViewer';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { API_BASE_URL, configLoader, DEFAULT_LAYER_VISIBILITY } from './config';
import './i18n';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

// localStorage 键名
const STORAGE_KEYS = {
  LAYER_VISIBILITY: 'gis_layer_visibility',
  SELECTED_CATEGORY: 'gis_selected_category'
};

// 从localStorage获取图层可见性设置
const getStoredLayerVisibility = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.LAYER_VISIBILITY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 合并默认配置和存储的配置，确保新增的图层有默认值
      return { ...DEFAULT_LAYER_VISIBILITY, ...parsed };
    }
  } catch (error) {
    console.warn('Failed to load layer visibility from localStorage:', error);
  }
  return DEFAULT_LAYER_VISIBILITY;
};

// 保存图层可见性设置到localStorage
const saveLayerVisibility = (layerVisibility) => {
  try {
    localStorage.setItem(STORAGE_KEYS.LAYER_VISIBILITY, JSON.stringify(layerVisibility));
  } catch (error) {
    console.warn('Failed to save layer visibility to localStorage:', error);
  }
};

// 从localStorage获取选中的分类
const getStoredSelectedCategory = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SELECTED_CATEGORY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn('Failed to load selected category from localStorage:', error);
    return null;
  }
};

// 保存选中的分类到localStorage
const saveSelectedCategory = (category) => {
  try {
    if (category) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_CATEGORY, JSON.stringify(category));
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_CATEGORY);
    }
  } catch (error) {
    console.warn('Failed to save selected category to localStorage:', error);
  }
};

function App() {
  const { t } = useTranslation();
  const [apiStatus, setApiStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [configLoaded, setConfigLoaded] = useState(false);
  
  // 从localStorage初始化状态
  const [selectedCategory, setSelectedCategory] = useState(getStoredSelectedCategory);
  const [layersVisible, setLayersVisible] = useState(getStoredLayerVisibility);

  // 数据类型筛选状态
  const [dataTypeFilters, setDataTypeFilters] = useState({});

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // 同时加载API状态和配置
      const [apiStatusResult, configResult] = await Promise.all([
        checkApiStatus(),
        loadConfiguration()
      ]);

      setApiStatus(apiStatusResult);
      setConfigLoaded(true);
    } catch (error) {
      console.error('App initialization failed:', error);
      setApiStatus({ status: 'error', error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const checkApiStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/status`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API连接失败:', error);
      return { status: 'error', error: error.message };
    }
  };

  const loadConfiguration = async () => {
    try {
      const config = await configLoader.loadLayerConfig();
      console.log('Configuration loaded successfully:', config);
      
      // 根据后端配置更新默认图层可见性
      if (config.layer_strategies) {
        const backendLayers = Object.keys(config.layer_strategies);
        const currentVisibility = getStoredLayerVisibility();
        const updatedVisibility = { ...currentVisibility };
        
        // 确保后端配置的图层都有可见性设置
        backendLayers.forEach(layerName => {
          if (!(layerName in updatedVisibility)) {
            updatedVisibility[layerName] = true; // 默认显示新图层
          }
        });
        
        setLayersVisible(updatedVisibility);
        saveLayerVisibility(updatedVisibility);
      }
      
      return config;
    } catch (error) {
      console.error('Failed to load configuration:', error);
      throw error;
    }
  };

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    saveSelectedCategory(category);
  };

  // 处理图层显示/隐藏
  const handleLayerToggle = (layerType, isVisible) => {
    const newLayersVisible = {
      ...layersVisible,
      [layerType]: isVisible
    };
    setLayersVisible(newLayersVisible);
    saveLayerVisibility(newLayersVisible);
  };

  // 处理数据类型筛选
  const handleDataTypeFilter = (dataType, subcategory) => {
    setDataTypeFilters(prev => {
      const key = `${dataType}_${subcategory || 'all'}`;
      const newFilters = { ...prev };
      
      if (newFilters[key]) {
        delete newFilters[key];
      } else {
        newFilters[key] = { dataType, subcategory };
      }
      
      return newFilters;
    });
  };

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
          <div>
            <div>{t('app.connecting')}</div>
            <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
              {t('app.loadingConfig')}...
            </div>
          </div>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Suspense fallback={<div>{t('app.connecting')}</div>}>
      <Box sx={{ display: 'flex', height: '100vh' }}>
        <Sidebar 
          apiStatus={apiStatus} 
          selectedCategory={selectedCategory}
          onCategoryChange={handleCategoryChange}
          layersVisible={layersVisible}
          onLayerToggle={handleLayerToggle}
          onDataTypeFilter={handleDataTypeFilter}
          dataTypeFilters={dataTypeFilters}
            configLoaded={configLoaded}
        />
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Header />
          <MapViewer 
            apiStatus={apiStatus} 
            selectedCategory={selectedCategory}
            layersVisible={layersVisible}
            onLayerToggle={handleLayerToggle}
            dataTypeFilters={dataTypeFilters}
              configLoaded={configLoaded}
          />
        </Box>
      </Box>
      </Suspense>
    </ThemeProvider>
  );
}

export default App; 