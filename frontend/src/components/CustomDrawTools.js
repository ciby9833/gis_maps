import React, { useCallback, useRef, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * 自定义绘图工具组件 - 重写版本
 * 确保绘制事件在所有图层之上，直接操作地图容器
 */
const CustomDrawTools = ({ 
  onDrawComplete, 
  onDrawStart, 
  onDrawStop,
  drawingMode = 'polygon', // 'polygon' | 'rectangle'
  drawLayerGroup = null, // 传入的绘制图层组
  isActive = false, // 是否激活绘制工具
  style = {
    color: '#FF0000',
    fillColor: '#FF0000',
    fillOpacity: 0.3,
    weight: 2
  }
}) => {
  const map = useMap();
  const drawingRef = useRef(false);
  const currentLayerRef = useRef(null);
  const pointsRef = useRef([]);
  const tempMarkers = useRef([]);
  const mapContainerRef = useRef(null);
  const drawingOverlayRef = useRef(null);

  // 创建绘制覆盖层 - 确保在最上层
  const createDrawingOverlay = useCallback(() => {
    if (!map || drawingOverlayRef.current) return;

    const mapContainer = map.getContainer();
    mapContainerRef.current = mapContainer;

    // 创建一个透明的覆盖层，专门用于捕获绘制事件
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.zIndex = '9999'; // 确保在最上层
    overlay.style.pointerEvents = 'none'; // 默认不拦截事件
    overlay.style.backgroundColor = 'transparent';
    overlay.className = 'drawing-overlay';

    mapContainer.appendChild(overlay);
    drawingOverlayRef.current = overlay;

    console.log('CustomDrawTools: 绘制覆盖层已创建');
  }, [map]);

  // 激活绘制覆盖层
  const activateDrawingOverlay = useCallback(() => {
    if (drawingOverlayRef.current) {
      drawingOverlayRef.current.style.pointerEvents = 'auto'; // 拦截所有事件
      drawingOverlayRef.current.style.cursor = 'crosshair';
      
      // 监听鼠标移动，检测是否在工具栏区域
      const handleMouseMove = (e) => {
        if (!drawingOverlayRef.current) return;
        
        // 检查鼠标是否在工具栏区域内
        const toolbars = document.querySelectorAll('[data-testid="toolbar"], [data-testid="fence-toolbar"], [data-drawing-toolbar="true"], .MuiPaper-root[elevation="6"]');
        let isInToolbar = false;
        
        toolbars.forEach(toolbar => {
          const rect = toolbar.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right && 
              e.clientY >= rect.top && e.clientY <= rect.bottom) {
            isInToolbar = true;
          }
        });
        
        // 根据鼠标位置设置指针样式
        if (isInToolbar) {
          drawingOverlayRef.current.style.cursor = 'default';
        } else {
          drawingOverlayRef.current.style.cursor = 'crosshair';
        }
      };
      
      // 监听鼠标进出地图容器
      const mapContainer = map.getContainer();
      
      const handleMouseEnter = () => {
        if (drawingRef.current && drawingOverlayRef.current) {
          drawingOverlayRef.current.style.cursor = 'crosshair';
        }
      };
      
      const handleMouseLeave = () => {
        if (drawingOverlayRef.current) {
          drawingOverlayRef.current.style.cursor = 'default';
        }
      };
      
      mapContainer.addEventListener('mouseenter', handleMouseEnter);
      mapContainer.addEventListener('mouseleave', handleMouseLeave);
      drawingOverlayRef.current.addEventListener('mousemove', handleMouseMove);
      
      // 保存事件监听器引用以便清理
      drawingOverlayRef.current._mouseEnterHandler = handleMouseEnter;
      drawingOverlayRef.current._mouseLeaveHandler = handleMouseLeave;
      drawingOverlayRef.current._mouseMoveHandler = handleMouseMove;
      drawingOverlayRef.current._mapContainer = mapContainer;
      
      console.log('CustomDrawTools: 绘制覆盖层已激活，鼠标样式智能切换');
    }
  }, [map]);

  // 停用绘制覆盖层
  const deactivateDrawingOverlay = useCallback(() => {
    if (drawingOverlayRef.current) {
      drawingOverlayRef.current.style.pointerEvents = 'none'; // 恢复事件穿透
      drawingOverlayRef.current.style.cursor = '';
      
      // 清理所有事件监听器
      if (drawingOverlayRef.current._mapContainer) {
        const mapContainer = drawingOverlayRef.current._mapContainer;
        const mouseEnterHandler = drawingOverlayRef.current._mouseEnterHandler;
        const mouseLeaveHandler = drawingOverlayRef.current._mouseLeaveHandler;
        const mouseMoveHandler = drawingOverlayRef.current._mouseMoveHandler;
        
        if (mouseEnterHandler) mapContainer.removeEventListener('mouseenter', mouseEnterHandler);
        if (mouseLeaveHandler) mapContainer.removeEventListener('mouseleave', mouseLeaveHandler);
        if (mouseMoveHandler) drawingOverlayRef.current.removeEventListener('mousemove', mouseMoveHandler);
        
        delete drawingOverlayRef.current._mouseEnterHandler;
        delete drawingOverlayRef.current._mouseLeaveHandler;
        delete drawingOverlayRef.current._mouseMoveHandler;
        delete drawingOverlayRef.current._mapContainer;
      }
      
      console.log('CustomDrawTools: 绘制覆盖层已停用');
    }
  }, []);

  // 将屏幕坐标转换为地图坐标
  const screenToLatLng = useCallback((clientX, clientY) => {
    const mapContainer = map.getContainer();
    const rect = mapContainer.getBoundingClientRect();
    const point = L.point(clientX - rect.left, clientY - rect.top);
    return map.containerPointToLatLng(point);
  }, [map]);

  // 创建可编辑的多边形
  const createEditablePolygon = useCallback((points) => {
    const polygon = L.polygon(points, {
      ...style,
      opacity: 0.8,
      fillOpacity: 0.3
    });
    
    polygon._completed = true;
    
    if (drawLayerGroup && drawLayerGroup.addLayer) {
      drawLayerGroup.addLayer(polygon);
      console.log('CustomDrawTools: 多边形已添加到指定图层组');
    } else {
      polygon.addTo(map);
      console.log('CustomDrawTools: 多边形已添加到地图');
    }
    
    // 添加交互功能
    polygon.on('click', (e) => {
      console.log('CustomDrawTools: 点击围栏，可以添加编辑功能');
    });
    
    polygon.on('mouseover', function() {
      this.setStyle({ fillOpacity: 0.5, weight: 3 });
    });
    
    polygon.on('mouseout', function() {
      this.setStyle({ fillOpacity: style.fillOpacity, weight: style.weight });
    });
    
    console.log('CustomDrawTools: 创建可编辑多边形完成');
    return polygon;
  }, [map, style, drawLayerGroup]);

  // 创建可编辑的矩形
  const createEditableRectangle = useCallback((bounds) => {
    const rectangle = L.rectangle(bounds, {
      ...style,
      opacity: 0.8,
      fillOpacity: 0.3
    });
    
    rectangle._completed = true;
    
    if (drawLayerGroup && drawLayerGroup.addLayer) {
      drawLayerGroup.addLayer(rectangle);
    } else {
      rectangle.addTo(map);
    }
    
    rectangle.on('click', (e) => {
      console.log('CustomDrawTools: 点击矩形围栏，可以添加编辑功能');
    });
    
    rectangle.on('mouseover', function() {
      this.setStyle({ fillOpacity: 0.5, weight: 3 });
    });
    
    rectangle.on('mouseout', function() {
      this.setStyle({ fillOpacity: style.fillOpacity, weight: style.weight });
    });
    
    console.log('CustomDrawTools: 创建可编辑矩形完成');
    return rectangle;
  }, [map, style, drawLayerGroup]);

  // 开始绘制
  const startDrawing = useCallback((mode = null) => {
    if (drawingRef.current || !isActive) return;
    
    const useMode = mode || drawingMode;
    drawingRef.current = true;
    pointsRef.current = [];
    
    console.log('CustomDrawTools: 开始绘制，模式:', useMode);
    
    // 激活绘制覆盖层
    activateDrawingOverlay();
    
    if (onDrawStart) {
      onDrawStart();
    }

    if (useMode === 'polygon') {
      startPolygonDrawing();
    } else if (useMode === 'rectangle') {
      startRectangleDrawing();
    }
  }, [drawingMode, isActive, onDrawStart, activateDrawingOverlay]);

  // 停止绘制
  const stopDrawing = useCallback(() => {
    if (!drawingRef.current) return;
    
    drawingRef.current = false;
    
    // 停用绘制覆盖层
    deactivateDrawingOverlay();
    
    // 清理临时标记
    tempMarkers.current.forEach(marker => {
      if (map.hasLayer(marker)) {
        map.removeLayer(marker);
      }
    });
    tempMarkers.current = [];
    
    // 移除临时图层
    if (currentLayerRef.current && !currentLayerRef.current._completed) {
      map.removeLayer(currentLayerRef.current);
      currentLayerRef.current = null;
    }
    
    // 移除所有事件监听器
    if (drawingOverlayRef.current) {
      const overlay = drawingOverlayRef.current;
      overlay.onclick = null;
      overlay.ondblclick = null;
      overlay.onmousedown = null;
      overlay.onmousemove = null;
      overlay.onmouseup = null;
    }
    
    console.log('CustomDrawTools: 绘制模式已退出');
    
    if (onDrawStop) {
      onDrawStop();
    }
  }, [map, deactivateDrawingOverlay, onDrawStop]);

  // 多边形绘制
  const startPolygonDrawing = useCallback(() => {
    console.log('CustomDrawTools: 开始多边形绘制');
    
    if (!drawingOverlayRef.current) return;
    
    const overlay = drawingOverlayRef.current;
    
    // 直接在覆盖层上添加事件监听器
    overlay.onclick = (e) => {
      if (!drawingRef.current || !isActive) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const latlng = screenToLatLng(e.clientX, e.clientY);
      pointsRef.current.push(latlng);
      
      console.log(`CustomDrawTools: 添加点 ${pointsRef.current.length}:`, latlng);
      
      // 添加可视化标记点
      const marker = L.circleMarker(latlng, {
        radius: 5,
        fillColor: style.color,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(map);
      tempMarkers.current.push(marker);
      
      if (pointsRef.current.length === 1) {
        // 第一个点，创建多边形
        currentLayerRef.current = L.polygon([latlng], {
          ...style,
          opacity: 0.8,
          fillOpacity: 0.2
        }).addTo(map);
      } else {
        // 更新多边形
        currentLayerRef.current.setLatLngs(pointsRef.current);
      }
    };

    overlay.ondblclick = (e) => {
      if (!drawingRef.current || !isActive || pointsRef.current.length < 3) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      console.log('CustomDrawTools: 双击完成多边形绘制，点数:', pointsRef.current.length);
      
      // 完成绘制
      const finalLayer = createEditablePolygon(pointsRef.current);
      
      // 清理临时图层和标记
      if (currentLayerRef.current) {
        map.removeLayer(currentLayerRef.current);
      }
      tempMarkers.current.forEach(marker => map.removeLayer(marker));
      tempMarkers.current = [];
      
      // 生成几何数据
      const geometry = {
        type: 'Polygon',
        coordinates: [pointsRef.current.concat([pointsRef.current[0]]).map(point => [point.lng, point.lat])]
      };
      
      if (onDrawComplete) {
        onDrawComplete({
          layer: finalLayer,
          geometry: geometry
        });
      }
      
      stopDrawing();
    };
    
    console.log('CustomDrawTools: 多边形绘制事件监听器已注册到覆盖层');
  }, [map, style, isActive, screenToLatLng, onDrawComplete, stopDrawing, createEditablePolygon]);

  // 矩形绘制
  const startRectangleDrawing = useCallback(() => {
    console.log('CustomDrawTools: 开始矩形绘制');
    
    if (!drawingOverlayRef.current) return;
    
    const overlay = drawingOverlayRef.current;
    let startPoint = null;
    let isDrawing = false;

    overlay.onmousedown = (e) => {
      if (!drawingRef.current || !isActive) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      isDrawing = true;
      startPoint = screenToLatLng(e.clientX, e.clientY);
      
      console.log('CustomDrawTools: 矩形绘制开始点:', startPoint);
      
      // 创建临时矩形
      currentLayerRef.current = L.rectangle([startPoint, startPoint], {
        ...style,
        opacity: 0.8,
        fillOpacity: 0.2,
        dashArray: '5, 5'
      }).addTo(map);
    };

    overlay.onmousemove = (e) => {
      if (!drawingRef.current || !isActive || !isDrawing || !startPoint) return;
      
      const endPoint = screenToLatLng(e.clientX, e.clientY);
      const bounds = L.latLngBounds(startPoint, endPoint);
      
      if (currentLayerRef.current) {
        currentLayerRef.current.setBounds(bounds);
      }
    };

    overlay.onmouseup = (e) => {
      if (!drawingRef.current || !isActive || !isDrawing || !startPoint) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      isDrawing = false;
      const endPoint = screenToLatLng(e.clientX, e.clientY);
      
      console.log('CustomDrawTools: 矩形绘制结束点:', endPoint);
      
      // 检查是否有效矩形
      const distance = startPoint.distanceTo(endPoint);
      if (distance < 50) {
        console.log('CustomDrawTools: 矩形太小，忽略');
        if (currentLayerRef.current) {
          map.removeLayer(currentLayerRef.current);
          currentLayerRef.current = null;
        }
        return;
      }
      
      // 完成绘制
      const bounds = L.latLngBounds(startPoint, endPoint);
      const finalLayer = createEditableRectangle(bounds);
      
      // 移除临时图层
      if (currentLayerRef.current) {
        map.removeLayer(currentLayerRef.current);
        currentLayerRef.current = null;
      }
      
      // 生成几何数据
      const geometry = {
        type: 'Polygon',
        coordinates: [[
          [bounds.getWest(), bounds.getSouth()],
          [bounds.getEast(), bounds.getSouth()],
          [bounds.getEast(), bounds.getNorth()],
          [bounds.getWest(), bounds.getNorth()],
          [bounds.getWest(), bounds.getSouth()]
        ]]
      };
      
      console.log('CustomDrawTools: 矩形绘制完成，几何:', geometry);
      
      if (onDrawComplete) {
        onDrawComplete({
          layer: finalLayer,
          geometry: geometry
        });
      }
      
      stopDrawing();
    };
    
    console.log('CustomDrawTools: 矩形绘制事件监听器已注册到覆盖层');
  }, [map, style, isActive, screenToLatLng, onDrawComplete, stopDrawing, createEditableRectangle]);

  // 初始化绘制覆盖层
  useEffect(() => {
    if (map) {
      createDrawingOverlay();
    }
    
    return () => {
      // 清理覆盖层
      if (drawingOverlayRef.current && mapContainerRef.current) {
        try {
          mapContainerRef.current.removeChild(drawingOverlayRef.current);
        } catch (error) {
          console.warn('清理绘制覆盖层失败:', error);
        }
        drawingOverlayRef.current = null;
      }
    };
  }, [map, createDrawingOverlay]);

  // 监听激活状态变化
  useEffect(() => {
    if (!isActive && drawingRef.current) {
      console.log('CustomDrawTools: 工具被停用，停止当前绘制');
      stopDrawing();
    }
  }, [isActive, stopDrawing]);

  // 暴露方法给父组件
  useEffect(() => {
    if (map) {
      map.customDrawTools = {
        startDrawing,
        stopDrawing,
        isDrawing: () => drawingRef.current,
        setDrawingMode: (mode) => {
          console.log('CustomDrawTools: 设置绘制模式为', mode);
        },
        getCurrentMode: () => drawingMode
      };
      
      console.log('CustomDrawTools: 方法已暴露到地图实例');
    }
    
    return () => {
      if (map && map.customDrawTools) {
        delete map.customDrawTools;
      }
    };
  }, [map, startDrawing, stopDrawing, drawingMode]);

  return null; // 这是一个逻辑组件，不渲染任何内容
};

export default CustomDrawTools; 