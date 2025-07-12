import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Alert,
  CircularProgress,
  Grid,
  Chip,
  Tooltip,
  Divider,
  ButtonGroup
} from '@mui/material';
import {
  Close,
  Save,
  Cancel,
  Draw,
  Edit,
  Square,
  Palette,
  Delete,
  Undo,
  Redo
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

/**
 * 内联API函数 - 创建围栏
 */
const createFence = async (apiBaseUrl, fenceData) => {
  const response = await fetch(`${apiBaseUrl}/api/fences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(fenceData)
  });
  if (!response.ok) {
    throw new Error(`创建围栏失败: ${response.status}`);
  }
  return await response.json();
};

/**
 * 内联API函数 - 更新围栏
 */
const updateFence = async (apiBaseUrl, fenceId, fenceData) => {
  const response = await fetch(`${apiBaseUrl}/api/fences/${fenceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(fenceData)
  });
  if (!response.ok) {
    throw new Error(`更新围栏失败: ${response.status}`);
  }
  return await response.json();
};

/**
 * 内联API函数 - 验证围栏几何
 */
const validateFenceGeometry = async (apiBaseUrl, geometry) => {
  const response = await fetch(`${apiBaseUrl}/api/fences/validate-geometry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(geometry)
  });
  if (!response.ok) {
    throw new Error(`验证围栏几何失败: ${response.status}`);
  }
  return await response.json();
};

/**
 * 围栏工具栏组件
 * 在地图顶部显示围栏创建和编辑界面
 */
const FenceToolbar = ({ 
  visible,
  mode = 'create', // 'create' | 'edit'
  fence = null,
  mapInstance,
  apiBaseUrl,
  onClose,
  onSuccess,
  onDrawingStateChange
}) => {
  const { t } = useTranslation();

  // 表单状态
  const [formData, setFormData] = useState({
    fence_name: '',
    fence_type: 'polygon',
    fence_purpose: '',
    fence_description: '',
    fence_color: '#FF0000',
    fence_opacity: 0.3,
    fence_stroke_color: '#FF0000',
    fence_stroke_width: 2,
    fence_stroke_opacity: 0.8
  });

  // 几何和状态
  const [geometry, setGeometry] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [drawingMode, setDrawingMode] = useState('polygon'); // 'polygon' | 'rectangle'

  // 地图绘制相关
  const drawLayerRef = useRef(null);
  const isInitializedRef = useRef(false);

  // 预设颜色
  const presetColors = [
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
    '#FFA500', '#800080', '#008000', '#808080', '#000000', '#FFFFFF'
  ];

  // 初始化表单数据
  useEffect(() => {
    if (mode === 'edit' && fence) {
      console.log('FenceToolbar: 编辑模式，加载围栏数据:', fence);
      setFormData({
        fence_name: fence.fence_name || '',
        fence_type: fence.fence_type || 'polygon',
        fence_purpose: fence.fence_purpose || '',
        fence_description: fence.fence_description || '',
        fence_color: fence.fence_color || '#FF0000',
        fence_opacity: fence.fence_opacity || 0.3,
        fence_stroke_color: fence.fence_stroke_color || fence.fence_color || '#FF0000',
        fence_stroke_width: fence.fence_stroke_width || 2,
        fence_stroke_opacity: fence.fence_stroke_opacity || 0.8
      });
      
      if (fence.geometry) {
        setGeometry(fence.geometry);
        console.log('FenceToolbar: 设置围栏几何:', fence.geometry);
      }
    } else {
      // 重置为默认值
      console.log('FenceToolbar: 创建模式，重置表单数据');
      setFormData({
        fence_name: '',
        fence_type: 'polygon',
        fence_purpose: '',
        fence_description: '',
        fence_color: '#FF0000',
        fence_opacity: 0.3,
        fence_stroke_color: '#FF0000',
        fence_stroke_width: 2,
        fence_stroke_opacity: 0.8
      });
      setGeometry(null);
    }
    
    // 清除错误和验证状态
    setError(null);
    setValidationErrors({});
  }, [mode, fence, visible]);

  // 开始绘制
  const startDrawing = useCallback(() => {
    if (!mapInstance) {
      console.error('FenceToolbar: 地图实例不可用');
      return;
    }

    console.log(`FenceToolbar: 开始${drawingMode === 'polygon' ? '多边形' : '矩形'}绘制`);
    setIsDrawing(true);
    
    if (onDrawingStateChange) {
      onDrawingStateChange(true);
    }

    // 使用自定义绘制工具
    if (mapInstance.customDrawTools) {
      // 设置绘制模式
      mapInstance.customDrawTools.setDrawingMode(drawingMode);
      // 开始绘制
      mapInstance.customDrawTools.startDrawing(drawingMode);
      console.log('FenceToolbar: 已调用CustomDrawTools的绘制方法');
    } else {
      console.error('FenceToolbar: CustomDrawTools未加载，请检查CustomDrawTools组件是否正确初始化');
      console.log('FenceToolbar: 当前地图实例:', mapInstance);
      console.log('FenceToolbar: 地图实例上的customDrawTools:', mapInstance.customDrawTools);
      setError(t('fenceToolbar.drawingToolsNotReady'));
    }
  }, [mapInstance, drawingMode, onDrawingStateChange, t]);

  // 停止绘制
  const stopDrawing = useCallback(() => {
    console.log('FenceToolbar: 停止绘制');
    setIsDrawing(false);
    
    if (onDrawingStateChange) {
      onDrawingStateChange(false);
    }

    if (mapInstance && mapInstance.customDrawTools) {
      mapInstance.customDrawTools.stopDrawing();
      console.log('FenceToolbar: 已调用CustomDrawTools的停止方法');
    }
  }, [mapInstance, onDrawingStateChange]);

  // 绘制完成回调 - 从CustomDrawTools接收事件
  const handleCustomDrawComplete = useCallback((event) => {
    console.log('FenceToolbar: 接收到绘制完成事件:', event);
    
    setGeometry(event.geometry);
    
    // 图层已经在CustomDrawTools中添加到drawLayerRef.current了
    // 这里只需要更新几何数据
    console.log('FenceToolbar: 围栏绘制完成，几何数据已设置');
    
    // 自动停止绘制
    stopDrawing();
  }, [stopDrawing]);





  // 初始化自定义绘制图层和回调注册
  useEffect(() => {
    if (!visible || !mapInstance) {
      return;
    }

    console.log('FenceToolbar: 初始化自定义绘制图层');
    
    // 创建绘制图层
    if (!drawLayerRef.current) {
      drawLayerRef.current = new window.L.FeatureGroup();
      mapInstance.addLayer(drawLayerRef.current);
      console.log('FenceToolbar: 绘制图层已创建');
    }

    // 注册绘制完成回调到地图实例
    if (!mapInstance.fenceToolbar) {
      mapInstance.fenceToolbar = {};
    }
    mapInstance.fenceToolbar.handleDrawComplete = handleCustomDrawComplete;
    console.log('FenceToolbar: 绘制完成回调已注册到地图实例');

    isInitializedRef.current = true;

    return () => {
      if (!visible && drawLayerRef.current && mapInstance) {
        console.log('FenceToolbar: 清理绘制图层和回调');
        try {
          mapInstance.removeLayer(drawLayerRef.current);
          drawLayerRef.current = null;
          
          // 清理回调注册
          if (mapInstance.fenceToolbar) {
            delete mapInstance.fenceToolbar.handleDrawComplete;
          }
        } catch (error) {
          console.error('FenceToolbar: 清理失败:', error);
        }
        isInitializedRef.current = false;
      }
    };
  }, [visible, mapInstance, handleCustomDrawComplete]);

  // 处理编辑模式下现有围栏几何的显示
  useEffect(() => {
    if (mode === 'edit' && fence && fence.geometry && drawLayerRef.current && mapInstance && window.L) {
      try {
        console.log('FenceToolbar: 在地图上显示现有围栏几何');
        
        // 清除现有图层
        drawLayerRef.current.clearLayers();
        
        // 创建围栏图层并添加到地图
        const geoJsonLayer = window.L.geoJSON(fence.geometry, {
          style: {
            color: fence.fence_color || '#FF0000',
            fillColor: fence.fence_color || '#FF0000',
            fillOpacity: fence.fence_opacity || 0.3,
            weight: fence.fence_stroke_width || 2
          }
        });
        
        drawLayerRef.current.addLayer(geoJsonLayer);
        
        // 缩放到围栏范围
        const bounds = geoJsonLayer.getBounds();
        if (bounds.isValid()) {
          mapInstance.fitBounds(bounds, { padding: [20, 20] });
        }
        
        console.log('FenceToolbar: 现有围栏几何已显示在地图上');
      } catch (error) {
        console.error('FenceToolbar: 显示现有围栏几何失败:', error);
      }
    }
  }, [mode, fence, mapInstance]);

  // 表单字段变化处理
  const handleFieldChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // 清除相关的验证错误
    if (validationErrors[field]) {
      setValidationErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  }, [validationErrors]);

  // 表单验证
  const validateForm = useCallback(() => {
    const errors = {};

    // 基本信息验证
    if (!formData.fence_name.trim()) {
      errors.fence_name = t('fenceToolbar.fenceNameRequired');
    }

    // 几何验证
    if (!geometry) {
      errors.geometry = t('fenceToolbar.drawFenceOnMap');
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData, geometry, t]);

  // 保存围栏
  const handleSave = useCallback(async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const submitData = {
        ...formData,
        fence_geometry: geometry
      };

      console.log('FenceToolbar: 提交围栏数据:', submitData);

      let result;
      if (mode === 'create') {
        result = await createFence(apiBaseUrl, submitData);
        console.log('FenceToolbar: 围栏创建成功:', result);
      } else {
        result = await updateFence(apiBaseUrl, fence.id, submitData);
        console.log('FenceToolbar: 围栏更新成功:', result);
      }

      if (onSuccess) {
        onSuccess(result);
      }

      handleClose();
    } catch (error) {
      console.error(`FenceToolbar: ${mode === 'create' ? '创建' : '更新'}围栏失败:`, error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [formData, geometry, mode, fence, apiBaseUrl, onSuccess, validateForm]);

  // 取消操作
  const handleClose = useCallback(() => {
    console.log('FenceToolbar: 取消操作 - 清理状态');
    
    // 停止任何正在进行的绘制
    if (isDrawing) {
      stopDrawing();
    }
    
    // 清理状态
    isInitializedRef.current = false;
    setGeometry(null);
    setError(null);
    setValidationErrors({});
    setIsDrawing(false);
    
    // 清理绘制图层
    if (drawLayerRef.current && mapInstance) {
      try {
        mapInstance.removeLayer(drawLayerRef.current);
        drawLayerRef.current = null;
      } catch (error) {
        console.error('FenceToolbar: 清理绘制图层失败:', error);
      }
    }
    
    // 清理回调注册
    if (mapInstance && mapInstance.fenceToolbar) {
      delete mapInstance.fenceToolbar.handleDrawComplete;
    }
    
    if (onClose) {
      onClose();
    }
  }, [mapInstance, onClose, isDrawing, stopDrawing]);

  // 清除当前绘制
  const handleClearDrawing = useCallback(() => {
    if (drawLayerRef.current) {
      drawLayerRef.current.clearLayers();
    }
    setGeometry(null);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <Paper
      elevation={6}
      sx={{
        position: 'absolute',
        top: 10,
        left: 10,
        right: 10,
        zIndex: 1000,
        p: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(5px)'
      }}
      data-testid="fence-toolbar"
      data-drawing-toolbar="true"
    >
      {/* 工具栏标题 */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <Draw color="primary" />
          <Typography variant="h6">
            {mode === 'create' ? t('fenceToolbar.createFence') : t('fenceToolbar.editFence')}
          </Typography>
          {isDrawing && <Chip size="small" label={t('fenceToolbar.drawing')} color="primary" />}
          {geometry && <Chip size="small" label={t('fenceToolbar.drawn')} color="success" />}
          {mapInstance?.customDrawTools && <Chip size="small" label={t('fenceToolbar.toolReady')} color="info" />}
          {!mapInstance?.customDrawTools && visible && <Chip size="small" label={t('fenceToolbar.toolLoading')} color="warning" />}
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="caption" color="text.secondary">
            {t('fenceToolbar.drawingToolsLocation')}
          </Typography>
          <IconButton onClick={handleClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </Box>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* 开发调试面板 */}
      {process.env.NODE_ENV === 'development' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="caption" component="div">
            🔧 {t('fenceToolbar.developmentDebugInfo')}:
          </Typography>
          <Typography variant="caption" display="block">
            • {t('fenceToolbar.leafletLibrary')}: {window.L ? `✅ ${t('fenceToolbar.loaded')}` : `❌ ${t('fenceToolbar.notLoaded')}`}
          </Typography>
          <Typography variant="caption" display="block">
            • {t('fenceToolbar.customDrawTools')}: {mapInstance?.customDrawTools ? `✅ ${t('fenceToolbar.loaded')}` : `❌ ${t('fenceToolbar.notLoaded')}`}
          </Typography>
          <Typography variant="caption" display="block">
            • {t('fenceToolbar.drawingLayer')}: {drawLayerRef.current ? `✅ ${t('fenceToolbar.created')}` : `⏳ ${t('fenceToolbar.notCreated')}`}
          </Typography>
          <Typography variant="caption" display="block">
            • {t('fenceToolbar.drawingMode')}: {drawingMode}
          </Typography>
          <Typography variant="caption" display="block">
            • {t('fenceToolbar.drawingStatus')}: {isDrawing ? `🖊️ ${t('fenceToolbar.drawingActive')}` : `⏹️ ${t('fenceToolbar.drawingInactive')}`}
          </Typography>
        </Alert>
      )}

      {/* 表单内容 */}
      <Grid container spacing={2}>
        {/* 基本信息 */}
        <Grid item xs={12} md={6}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t('fenceToolbar.basicInfo')}
            </Typography>
            <Grid container spacing={1}>
              <Grid item xs={12} sm={6}>
                <TextField
                  size="small"
                  fullWidth
                  label={t('fenceToolbar.fenceName') + ' *'}
                  value={formData.fence_name}
                  onChange={(e) => handleFieldChange('fence_name', e.target.value)}
                  error={!!validationErrors.fence_name}
                  helperText={validationErrors.fence_name}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('fenceToolbar.fenceType')}</InputLabel>
                  <Select
                    value={formData.fence_type}
                    onChange={(e) => handleFieldChange('fence_type', e.target.value)}
                    label={t('fenceToolbar.fenceType')}
                  >
                    <MenuItem value="polygon">{t('fenceToolbar.polygon')}</MenuItem>
                    <MenuItem value="rectangle">{t('fenceToolbar.rectangle')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  size="small"
                  fullWidth
                  label={t('fenceToolbar.fencePurpose')}
                  value={formData.fence_purpose}
                  onChange={(e) => handleFieldChange('fence_purpose', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  size="small"
                  fullWidth
                  label={t('fenceToolbar.fenceDescription')}
                  value={formData.fence_description}
                  onChange={(e) => handleFieldChange('fence_description', e.target.value)}
                />
              </Grid>
            </Grid>
          </Box>
        </Grid>

        {/* 样式设置 */}
        <Grid item xs={12} md={3}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t('fenceToolbar.styleSettings')}
            </Typography>
            <Grid container spacing={1}>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  {t('fenceToolbar.color')}
                </Typography>
                <Box display="flex" gap={0.5} mb={1} flexWrap="wrap">
                  {presetColors.map((color) => (
                    <Box
                      key={color}
                      sx={{
                        width: 20,
                        height: 20,
                        backgroundColor: color,
                        border: formData.fence_color === color ? '2px solid #1976d2' : '1px solid #ccc',
                        borderRadius: 1,
                        cursor: 'pointer',
                        '&:hover': { transform: 'scale(1.1)' }
                      }}
                      onClick={() => handleFieldChange('fence_color', color)}
                    />
                  ))}
                </Box>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  {t('fenceToolbar.transparency')}: {(formData.fence_opacity * 100).toFixed(0)}%
                </Typography>
                <Slider
                  size="small"
                  value={formData.fence_opacity}
                  onChange={(e, value) => handleFieldChange('fence_opacity', value)}
                  min={0}
                  max={1}
                  step={0.1}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  {t('fenceToolbar.borderWidth')}: {formData.fence_stroke_width}px
                </Typography>
                <Slider
                  size="small"
                  value={formData.fence_stroke_width}
                  onChange={(e, value) => handleFieldChange('fence_stroke_width', value)}
                  min={1}
                  max={10}
                  step={1}
                />
              </Grid>
            </Grid>
          </Box>
        </Grid>

        {/* 绘制工具 */}
        <Grid item xs={12} md={3}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t('fenceToolbar.drawingTools')}
            </Typography>
            <Grid container spacing={1}>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('fenceToolbar.selectDrawingMode')}
                </Typography>
                <ButtonGroup size="small" fullWidth sx={{ mb: 1 }}>
                  <Button
                    variant={drawingMode === 'polygon' ? 'contained' : 'outlined'}
                    onClick={() => setDrawingMode('polygon')}
                    disabled={isDrawing}
                  >
                    {t('fenceToolbar.polygon')}
                  </Button>
                  <Button
                    variant={drawingMode === 'rectangle' ? 'contained' : 'outlined'}
                    onClick={() => setDrawingMode('rectangle')}
                    disabled={isDrawing}
                  >
                    {t('fenceToolbar.rectangle')}
                  </Button>
                </ButtonGroup>
              </Grid>
              
              <Grid item xs={12}>
                {!isDrawing ? (
                  <Button
                    variant="contained"
                    color="success"
                    onClick={startDrawing}
                    disabled={loading}
                    startIcon={<Edit />}
                    fullWidth
                  >
                    {t('fenceToolbar.startDrawing')}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="warning"
                    onClick={stopDrawing}
                    fullWidth
                  >
                    {t('fenceToolbar.stopDrawing')}
                  </Button>
                )}
              </Grid>

              <Grid item xs={12}>
                {geometry ? (
                  <Alert severity="success" sx={{ mb: 1 }}>
                    ✅ {t('fenceToolbar.fenceDrawn')}
                  </Alert>
                ) : isDrawing ? (
                  <Alert severity="warning" sx={{ mb: 1 }}>
                    🖊️ {t('fenceToolbar.drawingInProgress')}
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" display="block">
                        {drawingMode === 'polygon' 
                          ? `📍 ${t('fenceToolbar.polygonDrawingTip')}` 
                          : `🖱️ ${t('fenceToolbar.rectangleDrawingTip')}`}
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ color: 'info.main', fontWeight: 'bold' }}>
                        💡 {t('fenceToolbar.mapInteractionTip')}
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ color: 'success.main' }}>
                        🎯 {t('fenceToolbar.editableFenceTip')}
                      </Typography>
                    </Box>
                  </Alert>
                ) : (
                  <Alert severity="info" sx={{ mb: 1 }}>
                    {validationErrors.geometry || `🎯 ${t('fenceToolbar.clickStartDrawing')}`}
                  </Alert>
                )}
              </Grid>
              
              <Grid item xs={12}>
                <ButtonGroup size="small" fullWidth>
                  <Button
                    onClick={handleClearDrawing}
                    disabled={!geometry}
                    startIcon={<Delete />}
                    color="warning"
                  >
                    {t('fenceToolbar.clearDrawing')}
                  </Button>
                </ButtonGroup>
              </Grid>
            </Grid>
          </Box>
        </Grid>

        {/* 操作按钮 */}
        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
          <Box display="flex" justifyContent="flex-end" gap={1}>
            <Button
              variant="outlined"
              onClick={handleClose}
              startIcon={<Cancel />}
            >
              {t('fenceToolbar.cancel')}
            </Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={loading || !geometry || !formData.fence_name.trim()}
              startIcon={loading ? <CircularProgress size={16} /> : <Save />}
            >
              {mode === 'create' ? t('fenceToolbar.createFenceAction') : t('fenceToolbar.updateFenceAction')}
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
};

export default FenceToolbar; 