import React, { useCallback, useRef, useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * 锚点类型定义
 */
const ANCHOR_TYPES = {
  CORNER: 'corner',     // 尖角锚点
  SMOOTH: 'smooth',     // 平滑锚点
  ASYMMETRIC: 'asymmetric' // 非对称锚点
};

/**
 * 锚点类 - 管理锚点和控制柄
 */
class AnchorPoint {
  constructor(latlng, type = ANCHOR_TYPES.CORNER) {
    // 验证输入坐标的有效性
    if (!latlng || isNaN(latlng.lat) || isNaN(latlng.lng) || 
        !isFinite(latlng.lat) || !isFinite(latlng.lng)) {
      throw new Error('Invalid latlng provided to AnchorPoint constructor: ' + JSON.stringify(latlng));
    }
    
    // 检查坐标是否在有效范围内
    if (latlng.lat < -90 || latlng.lat > 90 || latlng.lng < -180 || latlng.lng > 180) {
      throw new Error('Coordinates out of valid range: ' + JSON.stringify(latlng));
    }
    
    this.position = latlng;
    this.type = type;
    this.controlHandle1 = null; // 前控制柄
    this.controlHandle2 = null; // 后控制柄
    this.marker = null;          // 锚点标记
    this.handle1Marker = null;   // 控制柄1标记
    this.handle2Marker = null;   // 控制柄2标记
    this.handleLine1 = null;     // 控制柄连线1
    this.handleLine2 = null;     // 控制柄连线2
  }

  // 设置控制柄
  setControlHandles(handle1, handle2) {
    // 验证控制柄的有效性
    if (handle1 && (isNaN(handle1.lat) || isNaN(handle1.lng) || 
                   !isFinite(handle1.lat) || !isFinite(handle1.lng))) {
      console.warn('Invalid handle1 provided to setControlHandles:', handle1);
      handle1 = null;
    }
    
    if (handle2 && (isNaN(handle2.lat) || isNaN(handle2.lng) || 
                   !isFinite(handle2.lat) || !isFinite(handle2.lng))) {
      console.warn('Invalid handle2 provided to setControlHandles:', handle2);
      handle2 = null;
    }
    
    this.controlHandle1 = handle1;
    this.controlHandle2 = handle2;
    this.type = (handle1 || handle2) ? ANCHOR_TYPES.SMOOTH : ANCHOR_TYPES.CORNER;
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
      control2: this.controlHandle2
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
    this.anchors = [];           // 锚点数组
    this.pathLayer = null;       // 路径图层
    this.isDrawing = false;      // 是否在绘制模式
    this.isEditing = false;      // 是否在编辑模式
    this.dragState = null;       // 拖动状态
  }

  // 添加锚点
  addAnchor(latlng) {
    // 验证输入坐标的有效性
    if (!latlng || isNaN(latlng.lat) || isNaN(latlng.lng) || 
        !isFinite(latlng.lat) || !isFinite(latlng.lng)) {
      console.warn('Invalid latlng for anchor creation:', latlng);
      return null;
    }
    
    // 检查坐标是否在有效范围内
    if (latlng.lat < -90 || latlng.lat > 90 || latlng.lng < -180 || latlng.lng > 180) {
      console.warn('Coordinates out of valid range:', latlng);
      return null;
    }
    
    try {
      const anchor = new AnchorPoint(latlng);
      this.anchors.push(anchor);
      this.createAnchorMarker(anchor, this.anchors.length - 1);
      this.updatePath();
      return anchor;
    } catch (error) {
      console.error('Error creating anchor:', error);
      return null;
    }
  }

  // 创建锚点标记
  createAnchorMarker(anchor, index) {
    // 验证锚点位置
    if (!anchor.position || isNaN(anchor.position.lat) || isNaN(anchor.position.lng)) {
      console.warn('Cannot create marker for invalid anchor position:', anchor.position);
      return;
    }
    
    try {
      const marker = L.circleMarker(anchor.position, {
        radius: 8,
        fillColor: '#FF0000',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8,
        draggable: true,
        pane: 'tooltipPane', // 使用最高层级的pane
        zIndexOffset: 10000, // 确保在最上层
        interactive: true
      }).addTo(this.map);

      // 确保标记在最高层级
      if (marker._path) {
        marker._path.style.zIndex = '10001';
      }

      marker._anchorIndex = index;
      marker._isAnchor = true;

      // 锚点拖动事件
      marker.on('dragstart', (e) => {
        this.map.dragging.disable();
        this.dragState = { type: 'anchor', index, startPos: e.target.getLatLng() };
      });

      marker.on('drag', (e) => {
        const newPos = e.target.getLatLng();
        
        // 验证拖动位置的有效性
        if (isNaN(newPos.lat) || isNaN(newPos.lng) || 
            !isFinite(newPos.lat) || !isFinite(newPos.lng)) {
          console.warn('Invalid drag position:', newPos);
          return;
        }
        
        // 检查坐标范围
        if (newPos.lat < -90 || newPos.lat > 90 || newPos.lng < -180 || newPos.lng > 180) {
          console.warn('Drag position out of valid range:', newPos);
          return;
        }
        
        anchor.position = newPos;
        this.updateAnchorHandles(anchor);
        this.updatePath();
      });

      marker.on('dragend', () => {
        this.map.dragging.enable();
        this.dragState = null;
      });

      // 双击锚点切换类型
      marker.on('dblclick', (e) => {
        L.DomEvent.stopPropagation(e);
        try {
          this.toggleAnchorType(anchor, index);
        } catch (error) {
          console.error('Error toggling anchor type:', error);
        }
      });

      anchor.marker = marker;
    } catch (error) {
      console.error('Error creating anchor marker:', error);
    }
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
    const minDistance = 0.0001; // 最小距离阈值，防止除零

    // 计算控制柄的初始位置
    let handle1Pos = null;
    let handle2Pos = null;

    // 安全的数学计算函数
    const safeCalculatePosition = (anchor, targetAnchor, direction = 1) => {
      const dx = targetAnchor.position.lng - anchor.position.lng;
      const dy = targetAnchor.position.lat - anchor.position.lat;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // 防止除零：如果距离太小，使用默认方向
      if (distance < minDistance) {
        return {
          lat: anchor.position.lat + direction * baseDistance,
          lng: anchor.position.lng + direction * baseDistance * 0.5
        };
      }
      
      const normalizedDx = dx / distance;
      const normalizedDy = dy / distance;
      const controlDistance = Math.min(distance * 0.3, baseDistance * 10);
      
      return {
        lat: anchor.position.lat + direction * normalizedDy * controlDistance,
        lng: anchor.position.lng + direction * normalizedDx * controlDistance
      };
    };

    // 计算前控制柄
    if (index > 0) {
      const prevAnchor = this.anchors[index - 1];
      try {
        const pos = safeCalculatePosition(anchor, prevAnchor, -1);
        handle1Pos = L.latLng(pos.lat, pos.lng);
        
        // 验证生成的坐标是否有效
        if (isNaN(handle1Pos.lat) || isNaN(handle1Pos.lng)) {
          console.warn('Invalid handle1 position, using default');
          handle1Pos = L.latLng(anchor.position.lat, anchor.position.lng - baseDistance);
        }
      } catch (error) {
        console.error('Error calculating handle1 position:', error);
        handle1Pos = L.latLng(anchor.position.lat, anchor.position.lng - baseDistance);
      }
    }

    // 计算后控制柄
    if (index < this.anchors.length - 1) {
      const nextAnchor = this.anchors[index + 1];
      try {
        const pos = safeCalculatePosition(anchor, nextAnchor, 1);
        handle2Pos = L.latLng(pos.lat, pos.lng);
        
        // 验证生成的坐标是否有效
        if (isNaN(handle2Pos.lat) || isNaN(handle2Pos.lng)) {
          console.warn('Invalid handle2 position, using default');
          handle2Pos = L.latLng(anchor.position.lat, anchor.position.lng + baseDistance);
        }
      } catch (error) {
        console.error('Error calculating handle2 position:', error);
        handle2Pos = L.latLng(anchor.position.lat, anchor.position.lng + baseDistance);
      }
    }

    // 如果没有相邻锚点，创建默认控制柄
    if (!handle1Pos && !handle2Pos) {
      handle1Pos = L.latLng(anchor.position.lat, anchor.position.lng - baseDistance);
      handle2Pos = L.latLng(anchor.position.lat, anchor.position.lng + baseDistance);
    }

    anchor.setControlHandles(handle1Pos, handle2Pos);

    // 创建控制柄标记
    if (handle1Pos && !isNaN(handle1Pos.lat) && !isNaN(handle1Pos.lng)) {
      this.createControlHandleMarker(anchor, 'handle1', handle1Pos, index);
    }
    if (handle2Pos && !isNaN(handle2Pos.lat) && !isNaN(handle2Pos.lng)) {
      this.createControlHandleMarker(anchor, 'handle2', handle2Pos, index);
    }
  }

  // 创建控制柄标记
  createControlHandleMarker(anchor, handleType, position, anchorIndex) {
    // 验证位置的有效性
    if (!position || isNaN(position.lat) || isNaN(position.lng) || 
        !isFinite(position.lat) || !isFinite(position.lng)) {
      console.warn('Invalid position for control handle marker:', position);
      return;
    }
    
    try {
      const marker = L.circleMarker(position, {
        radius: 6,
        fillColor: '#FFA500',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8,
        draggable: true,
        pane: 'tooltipPane', // 使用最高层级的pane
        zIndexOffset: 10000, // 确保在最上层
        interactive: true
      }).addTo(this.map);

      // 确保标记在最高层级
      if (marker._path) {
        marker._path.style.zIndex = '10001';
      }

      marker._isControlHandle = true;
      marker._anchorIndex = anchorIndex;
      marker._handleType = handleType;

      // 控制柄拖动事件
      marker.on('dragstart', () => {
        this.map.dragging.disable();
        this.dragState = { 
          type: 'control', 
          anchorIndex, 
          handleType,
          startPos: marker.getLatLng() 
        };
      });

      marker.on('drag', (e) => {
        const newPos = e.target.getLatLng();
        
        // 验证拖动位置的有效性
        if (isNaN(newPos.lat) || isNaN(newPos.lng) || 
            !isFinite(newPos.lat) || !isFinite(newPos.lng)) {
          console.warn('Invalid control handle drag position:', newPos);
          return;
        }
        
        // 检查坐标范围
        if (newPos.lat < -90 || newPos.lat > 90 || newPos.lng < -180 || newPos.lng > 180) {
          console.warn('Control handle drag position out of valid range:', newPos);
          return;
        }
        
        if (handleType === 'handle1') {
          anchor.controlHandle1 = newPos;
        } else {
          anchor.controlHandle2 = newPos;
        }
        this.updateControlHandleLine(anchor, handleType);
        this.updatePath();
      });

      marker.on('dragend', () => {
        this.map.dragging.enable();
        this.dragState = null;
      });

      // 保存标记引用
      if (handleType === 'handle1') {
        anchor.handle1Marker = marker;
      } else {
        anchor.handle2Marker = marker;
      }

      // 创建控制柄连线
      this.createControlHandleLine(anchor, handleType);
    } catch (error) {
      console.error('Error creating control handle marker:', error);
    }
  }

  // 创建控制柄连线
  createControlHandleLine(anchor, handleType) {
    const handlePos = handleType === 'handle1' ? anchor.controlHandle1 : anchor.controlHandle2;
    if (!handlePos) return;

    const line = L.polyline([anchor.position, handlePos], {
      color: '#999999',
      weight: 1,
      opacity: 0.8,
      dashArray: '5, 5',
      pane: 'tooltipPane', // 使用最高层级的pane
      interactive: false // 连线不需要交互
    }).addTo(this.map);

    // 确保连线在最高层级
    if (line._path) {
      line._path.style.zIndex = '10001';
    }

    if (handleType === 'handle1') {
      anchor.handleLine1 = line;
    } else {
      anchor.handleLine2 = line;
    }
  }

  // 更新控制柄连线
  updateControlHandleLine(anchor, handleType) {
    const line = handleType === 'handle1' ? anchor.handleLine1 : anchor.handleLine2;
    const handlePos = handleType === 'handle1' ? anchor.controlHandle1 : anchor.controlHandle2;
    
    if (line && handlePos) {
      // 验证锚点和控制柄位置的有效性
      if (isNaN(anchor.position.lat) || isNaN(anchor.position.lng) ||
          isNaN(handlePos.lat) || isNaN(handlePos.lng)) {
        console.warn('Invalid positions for control handle line update:', {
          anchor: anchor.position,
          handle: handlePos
        });
        return;
      }
      
      try {
        line.setLatLngs([anchor.position, handlePos]);
      } catch (error) {
        console.error('Error updating control handle line:', error);
      }
    }
  }

  // 更新锚点的控制柄位置
  updateAnchorHandles(anchor) {
    if (!anchor.position || isNaN(anchor.position.lat) || isNaN(anchor.position.lng)) {
      console.warn('Cannot update handles for invalid anchor position:', anchor.position);
      return;
    }
    
    try {
      if (anchor.handle1Marker && anchor.controlHandle1) {
        if (!isNaN(anchor.controlHandle1.lat) && !isNaN(anchor.controlHandle1.lng)) {
          anchor.handle1Marker.setLatLng(anchor.controlHandle1);
          this.updateControlHandleLine(anchor, 'handle1');
        }
      }
      if (anchor.handle2Marker && anchor.controlHandle2) {
        if (!isNaN(anchor.controlHandle2.lat) && !isNaN(anchor.controlHandle2.lng)) {
          anchor.handle2Marker.setLatLng(anchor.controlHandle2);
          this.updateControlHandleLine(anchor, 'handle2');
        }
      }
    } catch (error) {
      console.error('Error updating anchor handles:', error);
    }
  }

  // 移除控制柄
  removeControlHandles(anchor) {
    try {
      if (anchor.handle1Marker && this.map) {
        this.map.removeLayer(anchor.handle1Marker);
        anchor.handle1Marker = null;
      }
      if (anchor.handle2Marker && this.map) {
        this.map.removeLayer(anchor.handle2Marker);
        anchor.handle2Marker = null;
      }
      if (anchor.handleLine1 && this.map) {
        this.map.removeLayer(anchor.handleLine1);
        anchor.handleLine1 = null;
      }
      if (anchor.handleLine2 && this.map) {
        this.map.removeLayer(anchor.handleLine2);
        anchor.handleLine2 = null;
      }
      anchor.setControlHandles(null, null);
      anchor.type = ANCHOR_TYPES.CORNER;
    } catch (error) {
      console.error('Error removing control handles:', error);
    }
  }

  // 生成贝塞尔曲线路径
  generateBezierPath() {
    if (this.anchors.length < 2) return [];

    const pathPoints = [];
    
    for (let i = 0; i < this.anchors.length - 1; i++) {
      const current = this.anchors[i];
      const next = this.anchors[i + 1];
      
      // 验证锚点位置
      if (isNaN(current.position.lat) || isNaN(current.position.lng) ||
          isNaN(next.position.lat) || isNaN(next.position.lng)) {
        console.warn(`Invalid anchor positions at segment ${i}:`, {
          current: current.position,
          next: next.position
        });
        continue;
      }
      
      // 确定控制点
      const startPoint = current.position;
      const endPoint = next.position;
      const control1 = current.controlHandle2 || startPoint;
      const control2 = next.controlHandle1 || endPoint;

      // 生成贝塞尔曲线点
      const curvePoints = this.calculateBezierCurve(
        startPoint, control1, control2, endPoint, 20
      );
      
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
    
    // 验证所有控制点的有效性
    const validatePoint = (point, name) => {
      if (!point || isNaN(point.lat) || isNaN(point.lng) || !isFinite(point.lat) || !isFinite(point.lng)) {
        console.warn(`Invalid ${name} point in bezier calculation:`, point);
        return false;
      }
      return true;
    };
    
    if (!validatePoint(p0, 'p0') || !validatePoint(p1, 'p1') || 
        !validatePoint(p2, 'p2') || !validatePoint(p3, 'p3')) {
      // 如果有无效点，返回直线
      console.warn('Falling back to straight line due to invalid control points');
      return [p0, p3];
    }
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;

      const lat = mt3 * p0.lat + 3 * mt2 * t * p1.lat + 3 * mt * t2 * p2.lat + t3 * p3.lat;
      const lng = mt3 * p0.lng + 3 * mt2 * t * p1.lng + 3 * mt * t2 * p2.lng + t3 * p3.lng;

      // 验证计算结果
      if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
        console.warn(`Invalid bezier point at t=${t}:`, {lat, lng});
        continue; // 跳过无效点
      }

      points.push(L.latLng(lat, lng));
    }
    
    // 确保至少有起点和终点
    if (points.length === 0) {
      console.warn('No valid bezier points generated, using endpoints');
      return [p0, p3];
    }
    
    return points;
  }

  // 更新路径显示
  updatePath() {
    if (this.pathLayer) {
      this.map.removeLayer(this.pathLayer);
    }

    if (this.anchors.length < 2) return;

    try {
      const pathPoints = this.generateBezierPath();
      
      if (pathPoints.length > 0) {
        // 验证路径点的有效性
        const validPoints = pathPoints.filter(point => 
          !isNaN(point.lat) && !isNaN(point.lng) && 
          isFinite(point.lat) && isFinite(point.lng)
        );
        
        if (validPoints.length < 2) {
          console.warn('Not enough valid points for path rendering');
          return;
        }
        
        this.pathLayer = L.polygon(validPoints, {
          ...this.style,
          fill: this.anchors.length > 2,
          fillOpacity: this.anchors.length > 2 ? this.style.fillOpacity : 0,
          pane: 'overlayPane', // 使用标准覆盖层
          interactive: false // 路径不需要交互
        }).addTo(this.map);

        // 确保路径在围栏图层之上但在锚点之下
        if (this.pathLayer._path) {
          this.pathLayer._path.style.zIndex = '9999';
        }
      }
    } catch (error) {
      console.error('Error updating path:', error);
    }
  }

  // 完成路径绘制
  finishPath() {
    if (this.anchors.length < 3) {
      console.warn('需要至少3个锚点才能创建围栏');
      return null;
    }

    const pathPoints = this.generateBezierPath();
    
    // 生成几何数据
    const geometry = {
      type: 'Polygon',
      coordinates: [pathPoints.concat([pathPoints[0]]).map(point => [point.lng, point.lat])]
    };

    return {
      layer: this.pathLayer,
      geometry: geometry,
      anchors: this.anchors.map(anchor => ({
        position: anchor.position,
        type: anchor.type,
        controlHandle1: anchor.controlHandle1,
        controlHandle2: anchor.controlHandle2
      }))
    };
  }

  // 清理所有元素
  cleanup() {
    try {
      this.anchors.forEach(anchor => {
        try {
          if (anchor.marker && this.map) {
            this.map.removeLayer(anchor.marker);
          }
          this.removeControlHandles(anchor);
        } catch (error) {
          console.error('Error cleaning up anchor:', error);
        }
      });
      
      if (this.pathLayer && this.map) {
        this.map.removeLayer(this.pathLayer);
      }
      
      this.anchors = [];
      this.pathLayer = null;
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  // 进入编辑模式
  enterEditMode(geometry, anchorData = null) {
    try {
      this.cleanup();
      this.isEditing = true;

      if (anchorData && anchorData.length > 0) {
        // 从锚点数据恢复
        let validAnchorsCreated = 0;
        
        anchorData.forEach((data, index) => {
          try {
            // 验证锚点数据的有效性
            if (!data.position || isNaN(data.position.lat) || isNaN(data.position.lng)) {
              console.warn(`Invalid anchor data at index ${index}:`, data);
              return;
            }
            
            const anchor = new AnchorPoint(data.position, data.type);
            anchor.setControlHandles(data.controlHandle1, data.controlHandle2);
            this.anchors.push(anchor);
            this.createAnchorMarker(anchor, validAnchorsCreated);
            
            if (anchor.hasControlHandles()) {
              if (anchor.controlHandle1 && !isNaN(anchor.controlHandle1.lat) && !isNaN(anchor.controlHandle1.lng)) {
                this.createControlHandleMarker(anchor, 'handle1', anchor.controlHandle1, validAnchorsCreated);
              }
              if (anchor.controlHandle2 && !isNaN(anchor.controlHandle2.lat) && !isNaN(anchor.controlHandle2.lng)) {
                this.createControlHandleMarker(anchor, 'handle2', anchor.controlHandle2, validAnchorsCreated);
              }
            }
            
            validAnchorsCreated++;
          } catch (error) {
            console.error(`Error creating anchor from data at index ${index}:`, error, data);
          }
        });
        
        if (validAnchorsCreated < 3) {
          console.warn('Not enough valid anchors created from anchor data:', validAnchorsCreated);
        }
        
      } else if (geometry && geometry.coordinates) {
        // 从几何数据创建锚点 - 添加坐标去重逻辑
        const coords = geometry.coordinates[0];
        const uniqueCoords = [];
        const tolerance = 0.0001; // 坐标去重容差
        
        coords.slice(0, -1).forEach((coord, index) => {
          // 验证坐标有效性
          if (!Array.isArray(coord) || coord.length < 2 || 
              isNaN(coord[0]) || isNaN(coord[1]) ||
              !isFinite(coord[0]) || !isFinite(coord[1])) {
            console.warn(`Invalid coordinate at index ${index}:`, coord);
            return;
          }
          
          const [lng, lat] = coord;
          
          // 检查坐标范围
          if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            console.warn(`Coordinate out of valid range at index ${index}:`, coord);
            return;
          }
          
          // 检查是否与已有坐标重复
          const isDuplicate = uniqueCoords.some(existingCoord => {
            const dx = Math.abs(existingCoord[0] - lng);
            const dy = Math.abs(existingCoord[1] - lat);
            return dx < tolerance && dy < tolerance;
          });
          
          if (!isDuplicate) {
            uniqueCoords.push([lng, lat]);
          } else {
            console.warn(`Duplicate coordinate removed at index ${index}:`, coord);
          }
        });
        
        // 确保至少有3个有效坐标
        if (uniqueCoords.length < 3) {
          console.error('Not enough valid coordinates for fence editing:', uniqueCoords.length);
          return;
        }
        
        // 创建锚点
        let validAnchorsCreated = 0;
        
        uniqueCoords.forEach((coord, index) => {
          try {
            const anchor = new AnchorPoint(L.latLng(coord[1], coord[0]));
            this.anchors.push(anchor);
            this.createAnchorMarker(anchor, validAnchorsCreated);
            validAnchorsCreated++;
          } catch (error) {
            console.error(`Error creating anchor at index ${index}:`, error, coord);
          }
        });
        
        if (validAnchorsCreated < 3) {
          console.warn('Not enough valid anchors created from geometry:', validAnchorsCreated);
        }
      }

      this.updatePath();
    } catch (error) {
      console.error('Error in enterEditMode:', error);
      this.cleanup(); // 清理任何可能创建的部分状态
    }
  }

  // 暴露方法
  getAnchors() {
    return this.anchors.map(anchor => ({
      position: anchor.position,
      type: anchor.type,
      controlHandle1: anchor.controlHandle1,
      controlHandle2: anchor.controlHandle2
    }));
  }

  clearAnchors() {
    this.anchors.forEach(anchor => {
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

    try {
      const pathPoints = this.generateBezierPath();
      
      if (pathPoints.length === 0) {
        console.warn('No valid path points for geometry generation');
        return null;
      }
      
      // 验证路径点并转换为坐标
      const coordinates = pathPoints
        .filter(point => !isNaN(point.lat) && !isNaN(point.lng) && 
                        isFinite(point.lat) && isFinite(point.lng))
        .map(point => [point.lng, point.lat]);
      
      if (coordinates.length < 3) {
        console.warn('Not enough valid coordinates for polygon generation');
        return null;
      }
      
      // 确保多边形闭合
      const firstCoord = coordinates[0];
      const lastCoord = coordinates[coordinates.length - 1];
      
      if (firstCoord[0] !== lastCoord[0] || firstCoord[1] !== lastCoord[1]) {
        coordinates.push(firstCoord);
      }
      
      // 生成几何数据
      const geometry = {
        type: 'Polygon',
        coordinates: [coordinates]
      };

      return geometry;
    } catch (error) {
      console.error('Error generating geometry:', error);
      return null;
    }
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
  drawingMode = 'polygon',
  drawLayerGroup = null,
  editingGeometry = null,
  editingAnchors = null,
  style = {
    color: '#FF0000',
    fillColor: '#FF0000',
    fillOpacity: 0.3,
    weight: 2
  }
}) => {
  const map = useMap();
  const pathManagerRef = useRef(null);
  const drawingOverlayRef = useRef(null);

  // 创建绘制覆盖层
  const createDrawingOverlay = useCallback(() => {
    if (!map || drawingOverlayRef.current) return;

    const mapContainer = map.getContainer();
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.zIndex = '10000'; // 确保在围栏图层之上
    overlay.style.pointerEvents = 'none';
    overlay.style.backgroundColor = 'transparent';
    overlay.className = 'drawing-overlay';

    mapContainer.appendChild(overlay);
    drawingOverlayRef.current = overlay;

  }, [map]);

  // 激活绘制覆盖层
  const activateDrawingOverlay = useCallback(() => {
    if (drawingOverlayRef.current) {
      drawingOverlayRef.current.style.pointerEvents = 'auto';
      drawingOverlayRef.current.style.cursor = 'crosshair';
        drawingOverlayRef.current.style.zIndex = '10000'; // 确保在最上层
      }
  }, []);

  // 停用绘制覆盖层
  const deactivateDrawingOverlay = useCallback(() => {
    if (drawingOverlayRef.current) {
      drawingOverlayRef.current.style.pointerEvents = 'none';
      drawingOverlayRef.current.style.cursor = '';
      drawingOverlayRef.current.style.backgroundColor = 'transparent';
    }
  }, []);

  // 屏幕坐标转地图坐标
  const screenToLatLng = useCallback((clientX, clientY) => {
    const mapContainer = map.getContainer();
    const rect = mapContainer.getBoundingClientRect();
    const point = L.point(clientX - rect.left, clientY - rect.top);
    return map.containerPointToLatLng(point);
  }, [map]);

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
      mapContainer.style.cursor = '';
    }

    // 清理地图事件监听器
    if (map._customDrawHandlers) {
      map.off('click', map._customDrawHandlers.click);
      map.off('contextmenu', map._customDrawHandlers.contextmenu);
      delete map._customDrawHandlers;
    }

    // 恢复其他图层的交互事件
    if (map.enableLayerEvents) {
      map.enableLayerEvents();
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
        type: 'polygon'
      });
    }
  }, [map, onDrawStop, onDrawComplete]);

  // 开始绘制函数
  const handleStartDrawing = useCallback(() => {
    if (!pathManagerRef.current) {
      return;
    }

    // 禁用其他图层的交互事件
    if (map.disableLayerEvents) {
      map.disableLayerEvents();
    }

    // 清理现有路径
    pathManagerRef.current.clearAnchors();

    // 开始绘制
    pathManagerRef.current.startDrawing();

    // 设置地图样式
    const mapContainer = map.getContainer();
    if (mapContainer) {
      mapContainer.style.cursor = 'crosshair';
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
    map.on('click', handleMapClick);
    map.on('contextmenu', handleMapContextMenu);
    
    // 存储事件处理器以便后续清理
    map._customDrawHandlers = {
      click: handleMapClick,
      contextmenu: handleMapContextMenu
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

    // 恢复地图样式
    const mapContainer = map.getContainer();
    if (mapContainer) {
      mapContainer.style.cursor = '';
    }

    // 清理地图事件监听器
    if (map._customDrawHandlers) {
      map.off('click', map._customDrawHandlers.click);
      map.off('contextmenu', map._customDrawHandlers.contextmenu);
      delete map._customDrawHandlers;
    }

    // 恢复其他图层的交互事件
    if (map.enableLayerEvents) {
      map.enableLayerEvents();
    }

    // 通知外部
    if (onDrawStop) {
      onDrawStop();
    }
  }, [map, onDrawStop]);

  // 暴露组件方法给外部
  const componentMethods = useMemo(() => ({
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
    }
  }), []);

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
        map.off('click', map._customDrawHandlers.click);
        map.off('contextmenu', map._customDrawHandlers.contextmenu);
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
    
    if (isActive && !pathManagerRef.current?.isDrawingActive()) {
      // 当工具栏激活时，自动开始绘制
      setTimeout(() => {
        handleStartDrawing();
      }, 100);
    } else if (!isActive && pathManagerRef.current?.isDrawingActive()) {
      // 当工具栏关闭时，停止绘制
      handleStopDrawing();
    }
  }, [isActive, handleStartDrawing, handleStopDrawing]);

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
        getCurrentMode: () => drawingMode
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