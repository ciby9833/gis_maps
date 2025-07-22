import React, { useCallback, useRef, useEffect, useMemo } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

/**
 * 锚点类型定义
 */
const ANCHOR_TYPES = {
  CORNER: "corner", // 尖角锚点
  SMOOTH: "smooth", // 平滑锚点
  ASYMMETRIC: "asymmetric", // 非对称锚点
};

/**
 * 锚点类 - 管理锚点和控制柄
 */
class AnchorPoint {
  constructor(latlng, type = ANCHOR_TYPES.CORNER) {
    this.position = latlng;
    this.type = type;
    this.controlHandle1 = null; // 前控制柄
    this.controlHandle2 = null; // 后控制柄
    this.marker = null; // 锚点标记
    this.handle1Marker = null; // 控制柄1标记
    this.handle2Marker = null; // 控制柄2标记
    this.handleLine1 = null; // 控制柄连线1
    this.handleLine2 = null; // 控制柄连线2
  }

  // 设置控制柄
  setControlHandles(handle1, handle2) {
    this.controlHandle1 = handle1;
    this.controlHandle2 = handle2;
    this.type = handle1 || handle2 ? ANCHOR_TYPES.SMOOTH : ANCHOR_TYPES.CORNER;
  }

  // 获取是否有控制柄
  hasControlHandles() {
    return this.controlHandle1 || this.controlHandle2;
  }

  // 转换为贝塞尔曲线控制点
  getBezierControlPoints() {
    return {
      anchor: this.position,
      control1: this.controlHandle1,
      control2: this.controlHandle2,
    };
  }
}

/**
 * 路径管理器 - 管理整个路径的绘制和编辑
 */
class PathManager {
  constructor(map, style) {
    this.map = map;
    this.style = style;
    this.anchors = []; // 锚点数组
    this.pathLayer = null; // 路径图层
    this.isDrawing = false; // 是否在绘制模式
    this.isEditing = false; // 是否在编辑模式
    this.dragState = null; // 拖动状态
  }

  // 添加锚点
  addAnchor(latlng) {
    const anchor = new AnchorPoint(latlng);
    this.anchors.push(anchor);
    this.createAnchorMarker(anchor, this.anchors.length - 1);
    this.updatePath();
    return anchor;
  }

  // 创建锚点标记
  createAnchorMarker(anchor, index) {
    const marker = L.circleMarker(anchor.position, {
      radius: 8,
      fillColor: "#FF0000",
      color: "#ffffff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8,
      draggable: true,
      pane: "tooltipPane", // 使用最高层级的pane
      zIndexOffset: 10000, // 确保在最上层
      interactive: true,
    }).addTo(this.map);

    // 确保标记在最高层级
    if (marker._path) {
      marker._path.style.zIndex = "10001";
    }

    marker._anchorIndex = index;
    marker._isAnchor = true;

    // 锚点拖动事件
    marker.on("dragstart", (e) => {
      this.map.dragging.disable();
      this.dragState = { type: "anchor", index, startPos: e.target.getLatLng() };
    });

    marker.on("drag", (e) => {
      const newPos = e.target.getLatLng();
      anchor.position = newPos;
      this.updateAnchorHandles(anchor);
      this.updatePath();
    });

    marker.on("dragend", () => {
      this.map.dragging.enable();
      this.dragState = null;
    });

    // 双击锚点切换类型
    marker.on("dblclick", (e) => {
      L.DomEvent.stopPropagation(e);
      this.toggleAnchorType(anchor, index);
    });

    anchor.marker = marker;
  }

  // 切换锚点类型（直线/曲线）
  toggleAnchorType(anchor, index) {
    if (anchor.type === ANCHOR_TYPES.CORNER) {
      // 从直线变为曲线，创建控制柄
      this.createControlHandles(anchor, index);
    } else {
      // 从曲线变为直线，移除控制柄
      this.removeControlHandles(anchor);
    }
    this.updatePath();
  }

  // 创建控制柄
  createControlHandles(anchor, index) {
    const baseDistance = 0.001; // 控制柄的基础距离

    // 计算控制柄的初始位置
    let handle1Pos = null;
    let handle2Pos = null;

    if (index > 0) {
      const prevAnchor = this.anchors[index - 1];
      const dx = anchor.position.lng - prevAnchor.position.lng;
      const dy = anchor.position.lat - prevAnchor.position.lat;
      const dist = Math.sqrt(dx * dx + dy * dy) * 0.3;
      handle1Pos = L.latLng(anchor.position.lat - ((dy * dist) / Math.sqrt(dx * dx + dy * dy)) * baseDistance, anchor.position.lng - ((dx * dist) / Math.sqrt(dx * dx + dy * dy)) * baseDistance);
    }

    if (index < this.anchors.length - 1) {
      const nextAnchor = this.anchors[index + 1];
      const dx = nextAnchor.position.lng - anchor.position.lng;
      const dy = nextAnchor.position.lat - anchor.position.lat;
      const dist = Math.sqrt(dx * dx + dy * dy) * 0.3;
      handle2Pos = L.latLng(anchor.position.lat + ((dy * dist) / Math.sqrt(dx * dx + dy * dy)) * baseDistance, anchor.position.lng + ((dx * dist) / Math.sqrt(dx * dx + dy * dy)) * baseDistance);
    }

    // 如果没有相邻锚点，创建默认控制柄
    if (!handle1Pos && !handle2Pos) {
      handle1Pos = L.latLng(anchor.position.lat, anchor.position.lng - baseDistance);
      handle2Pos = L.latLng(anchor.position.lat, anchor.position.lng + baseDistance);
    }

    anchor.setControlHandles(handle1Pos, handle2Pos);

    // 创建控制柄标记
    if (handle1Pos) {
      this.createControlHandleMarker(anchor, "handle1", handle1Pos, index);
    }
    if (handle2Pos) {
      this.createControlHandleMarker(anchor, "handle2", handle2Pos, index);
    }
  }

  // 创建控制柄标记
  createControlHandleMarker(anchor, handleType, position, anchorIndex) {
    const marker = L.circleMarker(position, {
      radius: 6,
      fillColor: "#FFA500",
      color: "#ffffff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8,
      draggable: true,
      pane: "tooltipPane", // 使用最高层级的pane
      zIndexOffset: 10000, // 确保在最上层
      interactive: true,
    }).addTo(this.map);

    // 确保标记在最高层级
    if (marker._path) {
      marker._path.style.zIndex = "10001";
    }

    marker._isControlHandle = true;
    marker._anchorIndex = anchorIndex;
    marker._handleType = handleType;

    // 控制柄拖动事件
    marker.on("dragstart", () => {
      this.map.dragging.disable();
      this.dragState = {
        type: "control",
        anchorIndex,
        handleType,
        startPos: marker.getLatLng(),
      };
    });

    marker.on("drag", (e) => {
      const newPos = e.target.getLatLng();
      if (handleType === "handle1") {
        anchor.controlHandle1 = newPos;
      } else {
        anchor.controlHandle2 = newPos;
      }
      this.updateControlHandleLine(anchor, handleType);
      this.updatePath();
    });

    marker.on("dragend", () => {
      this.map.dragging.enable();
      this.dragState = null;
    });

    // 保存标记引用
    if (handleType === "handle1") {
      anchor.handle1Marker = marker;
    } else {
      anchor.handle2Marker = marker;
    }

    // 创建控制柄连线
    this.createControlHandleLine(anchor, handleType);
  }

  // 创建控制柄连线
  createControlHandleLine(anchor, handleType) {
    const handlePos = handleType === "handle1" ? anchor.controlHandle1 : anchor.controlHandle2;
    if (!handlePos) return;

    const line = L.polyline([anchor.position, handlePos], {
      color: "#999999",
      weight: 1,
      opacity: 0.8,
      dashArray: "5, 5",
      pane: "tooltipPane", // 使用最高层级的pane
      interactive: false, // 连线不需要交互
    }).addTo(this.map);

    // 确保连线在最高层级
    if (line._path) {
      line._path.style.zIndex = "10001";
    }

    if (handleType === "handle1") {
      anchor.handleLine1 = line;
    } else {
      anchor.handleLine2 = line;
    }
  }

  // 更新控制柄连线
  updateControlHandleLine(anchor, handleType) {
    const line = handleType === "handle1" ? anchor.handleLine1 : anchor.handleLine2;
    const handlePos = handleType === "handle1" ? anchor.controlHandle1 : anchor.controlHandle2;

    if (line && handlePos) {
      line.setLatLngs([anchor.position, handlePos]);
    }
  }

  // 更新锚点的控制柄位置
  updateAnchorHandles(anchor) {
    if (anchor.handle1Marker && anchor.controlHandle1) {
      anchor.handle1Marker.setLatLng(anchor.controlHandle1);
      this.updateControlHandleLine(anchor, "handle1");
    }
    if (anchor.handle2Marker && anchor.controlHandle2) {
      anchor.handle2Marker.setLatLng(anchor.controlHandle2);
      this.updateControlHandleLine(anchor, "handle2");
    }
  }

  // 移除控制柄
  removeControlHandles(anchor) {
    if (anchor.handle1Marker) {
      this.map.removeLayer(anchor.handle1Marker);
      anchor.handle1Marker = null;
    }
    if (anchor.handle2Marker) {
      this.map.removeLayer(anchor.handle2Marker);
      anchor.handle2Marker = null;
    }
    if (anchor.handleLine1) {
      this.map.removeLayer(anchor.handleLine1);
      anchor.handleLine1 = null;
    }
    if (anchor.handleLine2) {
      this.map.removeLayer(anchor.handleLine2);
      anchor.handleLine2 = null;
    }
    anchor.setControlHandles(null, null);
    anchor.type = ANCHOR_TYPES.CORNER;
  }

  // 生成贝塞尔曲线路径
  generateBezierPath() {
    if (this.anchors.length < 2) return [];

    const pathPoints = [];

    for (let i = 0; i < this.anchors.length - 1; i++) {
      const current = this.anchors[i];
      const next = this.anchors[i + 1];

      // 确定控制点
      const startPoint = current.position;
      const endPoint = next.position;
      const control1 = current.controlHandle2 || startPoint;
      const control2 = next.controlHandle1 || endPoint;

      // 生成贝塞尔曲线点
      const curvePoints = this.calculateBezierCurve(startPoint, control1, control2, endPoint, 20);

      if (i === 0) {
        pathPoints.push(...curvePoints);
      } else {
        pathPoints.push(...curvePoints.slice(1)); // 跳过第一个点避免重复
      }
    }

    return pathPoints;
  }

  // 计算贝塞尔曲线点
  calculateBezierCurve(p0, p1, p2, p3, segments = 20) {
    const points = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;

      const lat = mt3 * p0.lat + 3 * mt2 * t * p1.lat + 3 * mt * t2 * p2.lat + t3 * p3.lat;
      const lng = mt3 * p0.lng + 3 * mt2 * t * p1.lng + 3 * mt * t2 * p2.lng + t3 * p3.lng;

      points.push(L.latLng(lat, lng));
    }

    return points;
  }

  // 更新路径显示
  updatePath() {
    if (this.pathLayer) {
      this.map.removeLayer(this.pathLayer);
    }

    if (this.anchors.length < 2) return;

    const pathPoints = this.generateBezierPath();

    if (pathPoints.length > 0) {
      this.pathLayer = L.polygon(pathPoints, {
        ...this.style,
        fill: this.anchors.length > 2,
        fillOpacity: this.anchors.length > 2 ? this.style.fillOpacity : 0,
        pane: "overlayPane", // 使用标准覆盖层
        interactive: false, // 路径不需要交互
      }).addTo(this.map);

      // 确保路径在围栏图层之上但在锚点之下
      if (this.pathLayer._path) {
        this.pathLayer._path.style.zIndex = "9999";
      }
    }
  }

  // 完成路径绘制
  finishPath() {
    if (this.anchors.length < 3) {
      console.warn("需要至少3个锚点才能创建围栏");
      return null;
    }

    const pathPoints = this.generateBezierPath();

    // 生成几何数据
    const geometry = {
      type: "Polygon",
      coordinates: [pathPoints.concat([pathPoints[0]]).map((point) => [point.lng, point.lat])],
    };

    return {
      layer: this.pathLayer,
      geometry: geometry,
      anchors: this.anchors.map((anchor) => ({
        position: anchor.position,
        type: anchor.type,
        controlHandle1: anchor.controlHandle1,
        controlHandle2: anchor.controlHandle2,
      })),
    };
  }

  // 清理所有元素
  cleanup() {
    this.anchors.forEach((anchor) => {
      if (anchor.marker) this.map.removeLayer(anchor.marker);
      this.removeControlHandles(anchor);
    });

    if (this.pathLayer) {
      this.map.removeLayer(this.pathLayer);
    }

    this.anchors = [];
    this.pathLayer = null;
  }

  // 进入编辑模式
  enterEditMode(geometry, anchorData = null) {
    this.cleanup();
    this.isEditing = true;

    if (anchorData && anchorData.length > 0) {
      // 从锚点数据恢复
      anchorData.forEach((data, index) => {
        const anchor = new AnchorPoint(data.position, data.type);
        anchor.setControlHandles(data.controlHandle1, data.controlHandle2);
        this.anchors.push(anchor);
        this.createAnchorMarker(anchor, index);

        if (anchor.hasControlHandles()) {
          if (anchor.controlHandle1) {
            this.createControlHandleMarker(anchor, "handle1", anchor.controlHandle1, index);
          }
          if (anchor.controlHandle2) {
            this.createControlHandleMarker(anchor, "handle2", anchor.controlHandle2, index);
          }
        }
      });
    } else if (geometry && geometry.coordinates) {
      // 从几何数据创建锚点
      const coords = geometry.coordinates[0];
      coords.slice(0, -1).forEach((coord, index) => {
        const anchor = new AnchorPoint(L.latLng(coord[1], coord[0]));
        this.anchors.push(anchor);
        this.createAnchorMarker(anchor, index);
      });
    }

    this.updatePath();
  }

  // 暴露方法
  getAnchors() {
    return this.anchors.map((anchor) => ({
      position: anchor.position,
      type: anchor.type,
      controlHandle1: anchor.controlHandle1,
      controlHandle2: anchor.controlHandle2,
    }));
  }

  clearAnchors() {
    this.anchors.forEach((anchor) => {
      if (anchor.marker) this.map.removeLayer(anchor.marker);
      this.removeControlHandles(anchor);
    });
    this.anchors = [];
    this.pathLayer = null;
    this.updatePath();
  }

  startDrawing() {
    this.isDrawing = true;
    this.isEditing = false; // 确保在绘制模式下不处于编辑模式
    this.updatePath();
  }

  stopDrawing() {
    this.isDrawing = false;
    this.isEditing = false;
    this.updatePath();
  }

  // 检查是否正在绘制
  isDrawingActive() {
    return this.isDrawing;
  }

  generateGeometry() {
    if (this.anchors.length < 3) {
      return null;
    }

    const pathPoints = this.generateBezierPath();

    // 生成几何数据
    const geometry = {
      type: "Polygon",
      coordinates: [pathPoints.concat([pathPoints[0]]).map((point) => [point.lng, point.lat])],
    };

    return geometry;
  }
}

/**
 * 自定义绘图工具组件 - 高级版本
 * 支持锚点系统和贝塞尔曲线编辑
 */
const CustomDrawTools = ({
  isActive = false,
  onDrawComplete,
  onDrawStart,
  onDrawStop,
  onRef, // 新增：引用回调
  // 原始的props，保持向后兼容
  drawingMode = "polygon",
  drawLayerGroup = null,
  editingGeometry = null,
  editingAnchors = null,
  style = {
    color: "#FF0000",
    fillColor: "#FF0000",
    fillOpacity: 0.3,
    weight: 2,
  },
}) => {
  const map = useMap();
  const pathManagerRef = useRef(null);
  const drawingOverlayRef = useRef(null);

  // 创建绘制覆盖层
  const createDrawingOverlay = useCallback(() => {
    if (!map || drawingOverlayRef.current) return;

    const mapContainer = map.getContainer();
    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.zIndex = "10000"; // 确保在围栏图层之上
    overlay.style.pointerEvents = "none";
    overlay.style.backgroundColor = "transparent";
    overlay.className = "drawing-overlay";

    mapContainer.appendChild(overlay);
    drawingOverlayRef.current = overlay;
  }, [map]);

  // 激活绘制覆盖层
  const activateDrawingOverlay = useCallback(() => {
    if (drawingOverlayRef.current) {
      drawingOverlayRef.current.style.pointerEvents = "auto";
      drawingOverlayRef.current.style.cursor = "crosshair";
      drawingOverlayRef.current.style.zIndex = "10000"; // 确保在最上层
    }
  }, []);

  // 停用绘制覆盖层
  const deactivateDrawingOverlay = useCallback(() => {
    if (drawingOverlayRef.current) {
      drawingOverlayRef.current.style.pointerEvents = "none";
      drawingOverlayRef.current.style.cursor = "";
      drawingOverlayRef.current.style.backgroundColor = "transparent";
    }
  }, []);

  // 屏幕坐标转地图坐标
  const screenToLatLng = useCallback(
    (clientX, clientY) => {
      const mapContainer = map.getContainer();
      const rect = mapContainer.getBoundingClientRect();
      const point = L.point(clientX - rect.left, clientY - rect.top);
      return map.containerPointToLatLng(point);
    },
    [map]
  );

  // 完成绘制函数
  const handleFinishDrawing = useCallback(() => {
    if (!pathManagerRef.current) {
      return;
    }

    const anchors = pathManagerRef.current.getAnchors();

    if (anchors.length < 3) {
      return;
    }

    // 生成几何数据
    const geometry = pathManagerRef.current.generateGeometry();

    // 停止绘制
    if (pathManagerRef.current) {
      pathManagerRef.current.stopDrawing();
    }

    // 恢复地图样式
    const mapContainer = map.getContainer();
    if (mapContainer) {
      mapContainer.style.cursor = "";
    }

    // 清理地图事件监听器
    if (map._customDrawHandlers) {
      map.off("click", map._customDrawHandlers.click);
      map.off("contextmenu", map._customDrawHandlers.contextmenu);
      delete map._customDrawHandlers;
    }

    // 通知外部停止
    if (onDrawStop) {
      onDrawStop();
    }

    // 通知外部完成
    if (onDrawComplete && geometry) {
      onDrawComplete({
        geometry: geometry,
        anchors: anchors,
        type: "polygon",
      });
    }
  }, [map, onDrawStop, onDrawComplete]);

  // 开始绘制函数
  const handleStartDrawing = useCallback(() => {
    if (!pathManagerRef.current) {
      return;
    }

    // 清理现有路径
    pathManagerRef.current.clearAnchors();

    // 开始绘制
    pathManagerRef.current.startDrawing();

    // 设置地图样式
    const mapContainer = map.getContainer();
    if (mapContainer) {
      mapContainer.style.cursor = "crosshair";
    }

    // 地图点击事件处理
    const handleMapClick = (e) => {
      if (pathManagerRef.current && pathManagerRef.current.isDrawingActive()) {
        pathManagerRef.current.addAnchor(e.latlng);
      }
    };

    const handleMapContextMenu = (e) => {
      e.originalEvent.preventDefault();
      handleFinishDrawing();
    };

    // 绑定事件
    map.on("click", handleMapClick);
    map.on("contextmenu", handleMapContextMenu);

    // 存储事件处理器以便后续清理
    map._customDrawHandlers = {
      click: handleMapClick,
      contextmenu: handleMapContextMenu,
    };

    // 通知外部
    if (onDrawStart) {
      onDrawStart();
    }
  }, [map, onDrawStart, handleFinishDrawing]);

  // 停止绘制函数
  const handleStopDrawing = useCallback(() => {
    if (pathManagerRef.current) {
      pathManagerRef.current.stopDrawing();
    }

    // // 恢复地图样式
    // const mapContainer = map.getContainer();
    // if (mapContainer) {
    //   mapContainer.style.cursor = '';
    // }

    // // 清理地图事件监听器
    // if (map._customDrawHandlers) {
    //   map.off('click', map._customDrawHandlers.click);
    //   map.off('contextmenu', map._customDrawHandlers.contextmenu);
    //   delete map._customDrawHandlers;
    // }

    // 通知外部
    if (onDrawStop) {
      onDrawStop();
    }
  }, [map, onDrawStop]);

  // 暴露组件方法给外部
  const componentMethods = useMemo(
    () => ({
      startDrawing: () => {
        handleStartDrawing();
      },
      stopDrawing: () => {
        handleStopDrawing();
      },
      isDrawing: () => {
        return pathManagerRef.current?.isDrawingActive() || false;
      },
      getAnchors: () => {
        return pathManagerRef.current?.getAnchors() || [];
      },
      generateGeometry: () => {
        return pathManagerRef.current?.generateGeometry() || null;
      },
      clearDrawing: () => {
        pathManagerRef.current?.clearAnchors();
      },
    }),
    []
  );

  // 通过回调暴露组件引用
  useEffect(() => {
    if (onRef) {
      onRef(componentMethods);
    }

    return () => {
      if (onRef) {
        onRef(null);
      }
    };
  }, [onRef, componentMethods]);

  // 初始化
  useEffect(() => {
    if (map) {
      createDrawingOverlay();

      if (!pathManagerRef.current) {
        pathManagerRef.current = new PathManager(map, style);
      }
    }

    return () => {
      if (pathManagerRef.current) {
        pathManagerRef.current.cleanup();
      }

      // 清理地图事件监听器
      if (map && map._customDrawHandlers) {
        map.off("click", map._customDrawHandlers.click);
        map.off("contextmenu", map._customDrawHandlers.contextmenu);
        delete map._customDrawHandlers;
      }

      if (drawingOverlayRef.current && drawingOverlayRef.current.parentNode) {
        drawingOverlayRef.current.parentNode.removeChild(drawingOverlayRef.current);
        drawingOverlayRef.current = null;
      }
    };
  }, [map, createDrawingOverlay, style]);

  // 监听isActive状态变化，自动激活或停用绘制工具
  useEffect(() => {
    console.log("检测到 isActive 变化:", isActive);
    if (isActive) {
      // if (pathManagerRef.current && !pathManagerRef.current.isDrawingActive()) {
      console.log("启动绘制模式");
      handleStartDrawing();
      // }
    } else {
      // if (pathManagerRef.current?.isDrawingActive()) {
      console.log("关闭绘制模式");
      handleStopDrawing();
      // }
    }
  }, [isActive, handleStartDrawing, handleStopDrawing]);
  // useEffect(() => {
  //   console.log("CustomDrawTools isActive changed:", isActive);
  //   if (isActive && !pathManagerRef.current?.isDrawingActive()) {
  //     // 当工具栏激活时，自动开始绘制
  //     setTimeout(() => {
  //       console.log("CustomDrawTools isActive changed 111:", isActive);
  //       handleStartDrawing();
  //     }, 100);
  //   } else if (!isActive && pathManagerRef.current?.isDrawingActive()) {
  //     // 当工具栏关闭时，停止绘制
  //     handleStopDrawing();
  //   }
  // }, [isActive, handleStartDrawing, handleStopDrawing]);

  // 监听编辑数据变化
  useEffect(() => {
    if (editingGeometry && isActive && pathManagerRef.current) {
      pathManagerRef.current.enterEditMode(editingGeometry, editingAnchors);
    }
  }, [editingGeometry, editingAnchors, isActive]);

  // 暴露方法
  useEffect(() => {
    if (map) {
      map.customDrawTools = {
        startDrawing: handleStartDrawing,
        stopDrawing: handleStopDrawing,
        finishDrawing: handleFinishDrawing,
        isDrawing: () => pathManagerRef.current?.isDrawingActive() || false,
        isEditing: () => pathManagerRef.current?.isEditing || false,
        getAnchors: () => pathManagerRef.current?.getAnchors() || [],
        generateGeometry: () => pathManagerRef.current?.generateGeometry() || null,
        clearDrawing: () => pathManagerRef.current?.clearAnchors(),
        setDrawingMode: () => {},
        getCurrentMode: () => drawingMode,
      };
    }

    return () => {
      if (map && map.customDrawTools) {
        delete map.customDrawTools;
      }
    };
  }, [map, handleStartDrawing, handleStopDrawing, handleFinishDrawing, drawingMode]);

  return null;
};

export default CustomDrawTools;
