// 围栏编辑创建组件
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Paper, Typography, TextField, Button, IconButton, FormControl, InputLabel, Select, MenuItem, Slider, Alert, CircularProgress, Grid, Chip, Tooltip, Divider, ButtonGroup } from "@mui/material";
import { Close, Save, Cancel, Draw, Edit, Square, Palette, Delete, Undo, Redo } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useLoadingState } from "../hooks/useLoadingState";
import { createFence, updateFence, FENCE_COLORS, Z_INDEX, validateFenceData, normalizeError } from "../utils/fenceUtils";

/**
 * 围栏工具栏组件
 * 统一的围栏配置界面 - 自动判断新增/编辑模式
 * fence=null时为新增模式，fence有值时为编辑模式
 */
const FenceToolbar = ({
  visible,
  fence = null, // 统一参数：null=新增，有值=编辑
  mapInstance,
  onClose,
  onSuccess,
  onDrawingStateChange,
}) => {
  const { t } = useTranslation();

  // 自动判断操作模式
  const isEditMode = Boolean(fence);

  // 统一的loading状态管理
  const { loading, error, startLoading, stopLoading, setErrorState, clearError } = useLoadingState();

  // 表单状态
  const [formData, setFormData] = useState({
    fence_name: "",
    fence_type: "polygon",
    fence_purpose: "",
    fence_description: "",
    fence_color: "#FF0000",
    fence_opacity: 0.3,
    fence_stroke_color: "#FF0000",
    fence_stroke_width: 2,
    fence_stroke_opacity: 0.8,
  });

  // 几何和状态
  const [geometry, setGeometry] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [drawingMode, setDrawingMode] = useState("polygon"); // 'polygon' | 'rectangle'
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [anchorCount, setAnchorCount] = useState(0); // 跟踪锚点数量

  // 地图绘制相关
  const drawLayerRef = useRef(null);
  const isInitializedRef = useRef(false);

  // 更新锚点数量
  const updateAnchorCount = useCallback(() => {
    if (mapInstance?.customDrawTools) {
      const count = mapInstance.customDrawTools.getAnchors().length;
      setAnchorCount(count);
    }
  }, [mapInstance]);

  // 定期更新锚点数量（当绘制状态时）
  useEffect(() => {
    if (isDrawing && mapInstance?.customDrawTools) {
      const interval = setInterval(updateAnchorCount, 500);
      return () => clearInterval(interval);
    }
  }, [isDrawing, mapInstance, updateAnchorCount]);

  // 初始化表单数据
  useEffect(() => {
    if (fence) {
      setFormData({
        fence_name: fence.fence_name || "",
        fence_type: fence.fence_type || "polygon",
        fence_purpose: fence.fence_purpose || "",
        fence_description: fence.fence_description || "",
        fence_color: fence.fence_color || "#FF0000",
        fence_opacity: fence.fence_opacity || 0.3,
        fence_stroke_color: fence.fence_stroke_color || fence.fence_color || "#FF0000",
        fence_stroke_width: fence.fence_stroke_width || 2,
        fence_stroke_opacity: fence.fence_stroke_opacity || 0.8,
      });

      if (fence.geometry) {
        setGeometry(fence.geometry);
      }
    } else {
      setFormData({
        fence_name: "",
        fence_type: "polygon",
        fence_purpose: "",
        fence_description: "",
        fence_color: "#FF0000",
        fence_opacity: 0.3,
        fence_stroke_color: "#FF0000",
        fence_stroke_width: 2,
        fence_stroke_opacity: 0.8,
      });
      setGeometry(null);
    }

    // 清除错误和验证状态
    clearError();
    setValidationErrors({});
  }, [fence, clearError]);

  // 开始绘制
  const startDrawing = useCallback(() => {
    if (!mapInstance) {
      return;
    }

    setIsDrawing(true);
    setToolbarCollapsed(true);
    setAnchorCount(0); // 重置锚点计数

    // 通知MapViewer更新绘制状态
    // if (onDrawingStateChange) {
    //   onDrawingStateChange(true);
    // }

    // 启动绘制工具
    if (mapInstance.customDrawTools) {
      try {
        mapInstance.customDrawTools.startDrawing();
      } catch (error) {
        console.error("启动绘制工具失败:", error);
      }
    }
  }, [mapInstance, onDrawingStateChange]);

  // 停止绘制
  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    setToolbarCollapsed(false);

    // 通知MapViewer更新绘制状态
    if (onDrawingStateChange) {
      onDrawingStateChange(false);
    }

    // 停止绘制工具
    if (mapInstance?.customDrawTools) {
      try {
        mapInstance.customDrawTools.stopDrawing();
      } catch (error) {
        console.error("停止绘制工具失败:", error);
      }
    }
  }, [mapInstance, onDrawingStateChange]);

  // 完成绘制
  const finishDrawing = useCallback(() => {
    if (mapInstance?.customDrawTools) {
      try {
        // 获取当前锚点数量
        const anchors = mapInstance.customDrawTools.getAnchors();
        if (anchors.length >= 3) {
          // 调用CustomDrawTools的完成绘制方法，这会立即显示围栏
          const result = mapInstance.customDrawTools.finishDrawing();

          if (result && result.geometry) {
            setGeometry(result.geometry);
            console.log("围栏绘制完成，几何数据已获取:", result.geometry);
            stopDrawing();
          } else {
            alert("生成几何数据失败，请重试");
          }
        } else {
          alert("至少需要3个锚点才能创建围栏");
        }
      } catch (error) {
        console.error("完成绘制失败:", error);
        alert("完成绘制失败: " + error.message);
      }
    } else {
      alert("绘制工具尚未初始化，请稍后重试");
    }
  }, [mapInstance, stopDrawing]);

  // 绘制完成处理 - 改进自动处理逻辑
  const handleCustomDrawComplete = useCallback(
    (event) => {
      console.log("收到绘制完成事件:", event);
      if (event && event.geometry) {
        setGeometry(event.geometry);
        console.log("围栏几何数据已设置:", event.geometry);
      }

      // 自动停止绘制状态
      stopDrawing();
    },
    [stopDrawing]
  );

  // 初始化自定义绘制图层和回调注册
  useEffect(() => {
    if (!visible || !mapInstance) {
      return;
    }

    // 注册绘制完成回调到地图实例
    if (!mapInstance.fenceToolbar) {
      mapInstance.fenceToolbar = {};
    }
    mapInstance.fenceToolbar.handleDrawComplete = handleCustomDrawComplete;

    isInitializedRef.current = true;

    return () => {
      if (!visible && mapInstance) {
        try {
          // 清理回调注册
          if (mapInstance.fenceToolbar) {
            delete mapInstance.fenceToolbar.handleDrawComplete;
          }
        } catch (error) {
          console.error("清理失败:", error);
        }
        isInitializedRef.current = false;
      }
    };
  }, [visible, mapInstance, handleCustomDrawComplete]);

  // 处理编辑模式下现有围栏几何的显示 - 确保正确启动编辑
  useEffect(() => {
    if (isEditMode && fence && fence.geometry && mapInstance && visible) {
      // 添加延迟确保CustomDrawTools已经初始化
      const startEditMode = () => {
        try {
          console.log("进入编辑模式，围栏数据:", fence);

          // 使用CustomDrawTools的编辑模式
          if (mapInstance.customDrawTools && mapInstance.customDrawTools.enterEditMode) {
            mapInstance.customDrawTools.enterEditMode(fence.geometry, fence.anchors || null);
            console.log("CustomDrawTools编辑模式已启动");
          } else {
            console.warn("CustomDrawTools编辑功能不可用，等待初始化...");
            // 重试机制
            setTimeout(startEditMode, 200);
          }
        } catch (error) {
          console.error("显示编辑围栏几何失败:", error);
        }
      };

      // 稍微延迟启动，确保CustomDrawTools已经完全初始化
      setTimeout(startEditMode, 100);
    }
  }, [isEditMode, fence, mapInstance, visible]);

  // 表单字段变化处理
  const handleFieldChange = useCallback(
    (field, value) => {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));

      // 清除相关的验证错误
      if (validationErrors[field]) {
        setValidationErrors((prev) => ({
          ...prev,
          [field]: null,
        }));
      }
    },
    [validationErrors]
  );

  // 表单验证
  const validateForm = useCallback(() => {
    const fenceData = {
      ...formData,
      fence_geometry: geometry || (fence ? fence.geometry : null),
    };

    const validation = validateFenceData(fenceData);
    setValidationErrors(validation.errors);

    return validation.isValid;
  }, [formData, geometry, fence]);

  // 保存围栏
  const handleSave = useCallback(async () => {
    if (!validateForm()) {
      return;
    }

    try {
      startLoading();

      // 使用当前几何数据或编辑模式下的原始几何数据
      const geometryData = geometry || (fence ? fence.geometry : null);

      const submitData = {
        ...formData,
        fence_geometry: geometryData,
        // 保存锚点数据以便后续编辑
        fence_anchors: formData.fence_anchors || (fence ? fence.anchors : null),
      };

      let result;
      if (!fence) {
        // 新增模式
        result = await createFence(submitData);
      } else {
        // 编辑模式
        result = await updateFence(fence.id, submitData);
      }

      if (onSuccess) {
        onSuccess(result);
      }

      handleClose();
    } catch (error) {
      console.error(`${!fence ? "创建" : "更新"}围栏失败:`, error);
      setErrorState(normalizeError(error));
    } finally {
      stopLoading();
    }
  }, [formData, geometry, fence, onSuccess, validateForm, startLoading, stopLoading, setErrorState]);

  // 关闭工具栏
  const handleClose = useCallback(() => {
    // 如果正在绘制，先停止绘制
    if (isDrawing) {
      stopDrawing();
    }

    // 清理绘制图层
    if (drawLayerRef.current && mapInstance) {
      mapInstance.removeLayer(drawLayerRef.current);
      drawLayerRef.current = null;
    }

    // 重置状态
    setGeometry(null);
    setFormData({
      fence_name: "",
      fence_type: "restricted",
      description: "",
      priority: "normal",
      rules: {
        restriction_type: "no_entry",
        applies_to: "all",
      },
    });

    // 调用关闭回调
    if (onClose) {
      onClose();
    }
  }, [isDrawing, stopDrawing, mapInstance, onClose]);

  // 清除当前绘制 - 改进清理逻辑
  const handleClearDrawing = useCallback(() => {
    try {
      // 清理CustomDrawTools中的绘制
      if (mapInstance?.customDrawTools?.clearDrawing) {
        mapInstance.customDrawTools.clearDrawing();
        console.log("CustomDrawTools绘制已清理");
      }

      // 清理FenceToolbar的图层
      if (drawLayerRef.current) {
        drawLayerRef.current.clearLayers();
      }

      // 重置几何数据
      setGeometry(null);
      console.log("围栏绘制已清除");
    } catch (error) {
      console.error("清除绘制失败:", error);
    }
  }, [mapInstance]);

  if (!visible) {
    return null;
  }

  // 如果工具栏折叠，只显示一个小的控制按钮
  if (toolbarCollapsed) {
    return (
      <Paper
        elevation={6}
        sx={{
          position: "fixed",
          top: 20,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: Z_INDEX.FENCE_TOOLBAR_COLLAPSED,
          p: 1,
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(5px)",
        }}
        data-testid="fence-toolbar-collapsed"
      >
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="caption" color="primary">
            🖊️ {t("fenceToolbar.drawingInProgress")}
          </Typography>
          <Button size="small" variant="contained" color="primary" onClick={finishDrawing}>
            {t("fenceToolbar.finishDrawing")}
          </Button>
          <Button size="small" variant="contained" color="warning" onClick={stopDrawing}>
            {t("fenceToolbar.stopDrawing")}
          </Button>
          <Button size="small" variant="outlined" onClick={handleClose}>
            {t("fenceToolbar.cancel")}
          </Button>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={6}
      sx={{
        position: "fixed",
        top: 20,
        left: "50%",
        transform: "translateX(-50%)",
        width: "90%",
        maxWidth: "800px",
        minHeight: "400px",
        zIndex: Z_INDEX.FENCE_TOOLBAR,
        p: 3,
        backgroundColor: "rgba(255, 255, 255, 0.98)",
        backdropFilter: "blur(10px)",
      }}
    >
      {/* 工具栏标题 */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <Draw color="primary" />
          <Typography variant="h6">{!fence ? t("fenceToolbar.createFence") : t("fenceToolbar.editFence")}</Typography>
          {isDrawing && <Chip size="small" label={t("fenceToolbar.drawing")} color="primary" />}
          {geometry && <Chip size="small" label={t("fenceToolbar.drawn")} color="success" />}
        </Box>
        <IconButton onClick={handleClose} size="small">
          <Close />
        </IconButton>
      </Box>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* 表单内容 */}
      <Grid container spacing={2}>
        {/* 基本信息 */}
        <Grid item xs={12} md={6}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t("fenceToolbar.basicInfo")}
            </Typography>
            <Grid container spacing={1}>
              <Grid item xs={12} sm={6}>
                <TextField size="small" fullWidth label={t("fenceToolbar.fenceName") + " *"} value={formData.fence_name} onChange={(e) => handleFieldChange("fence_name", e.target.value)} error={!!validationErrors.fence_name} helperText={validationErrors.fence_name} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t("fenceToolbar.fenceType")}</InputLabel>
                  <Select value={formData.fence_type} onChange={(e) => handleFieldChange("fence_type", e.target.value)} label={t("fenceToolbar.fenceType")}>
                    <MenuItem value="polygon">{t("fenceToolbar.polygon")}</MenuItem>
                    <MenuItem value="rectangle">{t("fenceToolbar.rectangle")}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField size="small" fullWidth label={t("fenceToolbar.fencePurpose")} value={formData.fence_purpose} onChange={(e) => handleFieldChange("fence_purpose", e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField size="small" fullWidth label={t("fenceToolbar.fenceDescription")} value={formData.fence_description} onChange={(e) => handleFieldChange("fence_description", e.target.value)} />
              </Grid>
            </Grid>
          </Box>
        </Grid>

        {/* 样式设置 */}
        <Grid item xs={12} md={3}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t("fenceToolbar.styleSettings")}
            </Typography>
            <Grid container spacing={1}>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  {t("fenceToolbar.color")}
                </Typography>
                <Box display="flex" gap={0.5} mb={1} flexWrap="wrap">
                  {FENCE_COLORS.map((color) => (
                    <Box
                      key={color}
                      sx={{
                        width: 20,
                        height: 20,
                        backgroundColor: color,
                        border: formData.fence_color === color ? "2px solid #1976d2" : "1px solid #ccc",
                        borderRadius: 1,
                        cursor: "pointer",
                        "&:hover": { transform: "scale(1.1)" },
                      }}
                      onClick={() => handleFieldChange("fence_color", color)}
                    />
                  ))}
                </Box>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  {t("fenceToolbar.transparency")}: {(formData.fence_opacity * 100).toFixed(0)}%
                </Typography>
                <Slider size="small" value={formData.fence_opacity} onChange={(e, value) => handleFieldChange("fence_opacity", value)} min={0} max={1} step={0.1} />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  {t("fenceToolbar.borderWidth")}: {formData.fence_stroke_width}px
                </Typography>
                <Slider size="small" value={formData.fence_stroke_width} onChange={(e, value) => handleFieldChange("fence_stroke_width", value)} min={1} max={10} step={1} />
              </Grid>
            </Grid>
          </Box>
        </Grid>

        {/* 绘制工具 */}
        <Grid item xs={12} md={3}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t("fenceToolbar.drawingTools")}
            </Typography>
            <Grid container spacing={1}>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t("fenceToolbar.selectDrawingMode")}
                </Typography>
                <ButtonGroup size="small" fullWidth sx={{ mb: 1 }}>
                  <Button variant={drawingMode === "polygon" ? "contained" : "outlined"} onClick={() => setDrawingMode("polygon")} disabled={isDrawing}>
                    {t("fenceToolbar.polygon")}
                  </Button>
                  <Button variant={drawingMode === "rectangle" ? "contained" : "outlined"} onClick={() => setDrawingMode("rectangle")} disabled={isDrawing}>
                    {t("fenceToolbar.rectangle")}
                  </Button>
                </ButtonGroup>
              </Grid>

              <Grid item xs={12}>
                {!isDrawing ? (
                  <Button variant="contained" color="success" onClick={startDrawing} disabled={loading} startIcon={<Edit />} fullWidth>
                    {!fence ? t("fenceToolbar.startDrawing") : t("fenceToolbar.startEditing")}
                  </Button>
                ) : (
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button variant="contained" color="primary" onClick={finishDrawing} sx={{ flex: 1 }} startIcon={<Save />}>
                      完成绘制
                    </Button>
                    <Button variant="outlined" color="warning" onClick={stopDrawing} sx={{ flex: 1 }}>
                      取消绘制
                    </Button>
                  </Box>
                )}
              </Grid>

              <Grid item xs={12}>
                {geometry || (fence && fence.geometry) ? (
                  <Alert severity="success" sx={{ mb: 1 }}>
                    ✅ {fence ? t("fenceToolbar.fenceEdited") : t("fenceToolbar.fenceDrawn")}
                  </Alert>
                ) : isDrawing ? (
                  <Alert severity="warning" sx={{ mb: 1 }}>
                    🖊️ {fence ? t("fenceToolbar.editingInProgress") : t("fenceToolbar.drawingInProgress")}
                    <Chip size="small" label={`${anchorCount} 个锚点`} color={anchorCount >= 3 ? "success" : "default"} sx={{ ml: 1 }} />
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" display="block" sx={{ fontWeight: "bold", color: "primary.main" }}>
                        📍 在地图上点击添加锚点
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ color: "info.main" }}>
                        ✅ 点击"完成绘制"按钮或右键完成 (至少需要3个锚点)
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ color: "success.main" }}>
                        ✨ 双击锚点可切换为曲线控制点
                      </Typography>
                    </Box>
                  </Alert>
                ) : (
                  <Alert severity="info" sx={{ mb: 1 }}>
                    {validationErrors.geometry || (fence ? `🎯 ${t("fenceToolbar.clickStartEditing")}` : `🎯 ${t("fenceToolbar.clickStartDrawing")}`)}
                  </Alert>
                )}
              </Grid>

              <Grid item xs={12}>
                <ButtonGroup size="small" fullWidth>
                  <Button onClick={handleClearDrawing} disabled={!geometry && !(fence && fence.geometry)} startIcon={<Delete />} color="warning">
                    {fence ? t("fenceToolbar.resetFence") : t("fenceToolbar.clearDrawing")}
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
            <Button variant="outlined" onClick={handleClose} startIcon={<Cancel />}>
              {t("fenceToolbar.cancel")}
            </Button>
            <Button variant="contained" onClick={handleSave} disabled={loading || (!geometry && !(fence && fence.geometry)) || !formData.fence_name.trim()} startIcon={loading ? <CircularProgress size={16} /> : <Save />}>
              {fence ? t("fenceToolbar.updateFenceAction") : t("fenceToolbar.createFenceAction")}
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
};

export default FenceToolbar;
