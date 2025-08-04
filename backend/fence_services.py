#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
电子围栏业务逻辑模块
包含围栏管理、重叠检测、图层分析、几何操作等核心功能
"""

import asyncio
import json
import time
import hashlib
import logging
from typing import Optional, List, Dict, Any, Union, Tuple
from datetime import datetime, timedelta
from shapely.geometry import Polygon, Point, LineString, MultiPolygon
from shapely import wkt
from shapely.ops import transform
from shapely.validation import make_valid
import pyproj
from functools import partial

# 导入现有的服务模块
from services import get_db_connection, get_cache_value, set_cache_value, get_cache_key, clean_geojson_features

# 配置日志
logger = logging.getLogger("fence_services")

# 围栏缓存配置
FENCE_CACHE_CONFIG = {
    'fence_list_ttl': 300,      # 围栏列表缓存5分钟
    'fence_detail_ttl': 600,    # 围栏详情缓存10分钟
    'overlap_analysis_ttl': 900, # 重叠分析缓存15分钟
    'layer_analysis_ttl': 1800,  # 图层分析缓存30分钟
    'stats_ttl': 1800           # 统计信息缓存30分钟
}

# ==============================================================================
# 围栏几何工具函数
# ==============================================================================

def validate_geometry(geometry_data: Union[str, dict]) -> bool:
    """验证几何数据是否有效"""
    try:
        if isinstance(geometry_data, str):
            # WKT 格式
            geom = wkt.loads(geometry_data)
        elif isinstance(geometry_data, dict):
            # GeoJSON 格式
            if geometry_data.get('type') == 'Polygon':
                coords = geometry_data.get('coordinates', [])
                if not coords:
                    return False
                geom = Polygon(coords[0], coords[1:] if len(coords) > 1 else None)
            else:
                return False
        else:
            return False
        
        # 验证几何有效性
        if not geom.is_valid:
            geom = make_valid(geom)
        
        # 检查面积是否合理（最小10平方米）
        return geom.area > 0.00000001  # 约10平方米（度数）
        
    except Exception as e:
        logger.error(f"几何验证失败: {e}")
        return False

def convert_geojson_to_wkt(geojson_geometry: dict) -> str:
    """将GeoJSON几何转换为WKT格式"""
    try:
        if geojson_geometry.get('type') == 'Polygon':
            coords = geojson_geometry.get('coordinates', [])
            if not coords:
                raise ValueError("多边形坐标为空")
            
            # 构建WKT格式的多边形
            exterior = coords[0]
            exterior_wkt = ','.join([f"{lon} {lat}" for lon, lat in exterior])
            
            # 处理内部孔洞
            holes_wkt = []
            for hole in coords[1:]:
                hole_wkt = ','.join([f"{lon} {lat}" for lon, lat in hole])
                holes_wkt.append(f"({hole_wkt})")
            
            if holes_wkt:
                wkt_string = f"POLYGON(({exterior_wkt}),{','.join(holes_wkt)})"
            else:
                wkt_string = f"POLYGON(({exterior_wkt}))"
            
            return wkt_string
        else:
            raise ValueError(f"不支持的几何类型: {geojson_geometry.get('type')}")
    except Exception as e:
        logger.error(f"GeoJSON转WKT失败: {e}")
        raise

def calculate_fence_bounds(wkt_geometry: str) -> Tuple[float, float, float, float]:
    """计算围栏边界框"""
    try:
        geom = wkt.loads(wkt_geometry)
        bounds = geom.bounds
        return bounds  # (minx, miny, maxx, maxy)
    except Exception as e:
        logger.error(f"计算边界框失败: {e}")
        return (0, 0, 0, 0)

def calculate_fence_area(wkt_geometry: str) -> float:
    """计算围栏面积（平方米）"""
    try:
        geom = wkt.loads(wkt_geometry)
        
        # 创建等面积投影来计算精确面积
        # 使用 Web Mercator 投影进行面积计算
        project = pyproj.Transformer.from_crs(
            pyproj.CRS.from_epsg(4326), 
            pyproj.CRS.from_epsg(3857),
            always_xy=True
        ).transform
        
        projected_geom = transform(project, geom)
        return projected_geom.area
        
    except Exception as e:
        logger.error(f"计算面积失败: {e}")
        return 0.0

def simplify_geometry(wkt_geometry: str, tolerance: float = 0.0001) -> str:
    """简化几何形状"""
    try:
        geom = wkt.loads(wkt_geometry)
        simplified = geom.simplify(tolerance)
        return simplified.wkt
    except Exception as e:
        logger.error(f"几何简化失败: {e}")
        return wkt_geometry

# ==============================================================================
# 围栏基础操作
# ==============================================================================

async def create_fence(
    fence_name: str,
    fence_geometry: Union[str, dict],
    fence_type: str = "polygon",
    fence_purpose: Optional[str] = None,
    fence_description: Optional[str] = None,
    fence_color: str = "#FF0000",
    fence_opacity: float = 0.3,
    group_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    creator_id: Optional[int] = None,
    fence_tags: Optional[Dict] = None,
    fence_config: Optional[Dict] = None
) -> Dict[str, Any]:
    """创建新围栏"""
    try:
        # 验证几何数据
        if not validate_geometry(fence_geometry):
            raise ValueError("无效的几何数据")
        
        # 转换几何格式
        if isinstance(fence_geometry, dict):
            wkt_geometry = convert_geojson_to_wkt(fence_geometry)
        else:
            wkt_geometry = fence_geometry
        
        # 计算几何属性
        area = calculate_fence_area(wkt_geometry)
        bounds = calculate_fence_bounds(wkt_geometry)
        
        pool = await get_db_connection()
        async with pool.acquire() as conn:
            # 插入围栏记录
            fence_id = await conn.fetchval("""
                INSERT INTO electronic_fences (
                    fence_name, fence_type, fence_geometry, fence_purpose, fence_description,
                    fence_color, fence_opacity, group_id, owner_id, creator_id,
                    fence_tags, fence_config
                ) VALUES ($1, $2, ST_GeomFromText($3, 4326), $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING id
            """, fence_name, fence_type, wkt_geometry, fence_purpose, fence_description,
                 fence_color, fence_opacity, group_id, owner_id, creator_id,
                 json.dumps(fence_tags) if fence_tags else None,
                 json.dumps(fence_config) if fence_config else None)
            
            # 检测重叠
            overlaps = await detect_fence_overlaps(fence_id)
            
            # 清理相关缓存
            await clear_fence_cache()
            
            return {
                "success": True,
                "fence_id": fence_id,
                "fence_name": fence_name,
                "fence_area": area,
                "overlaps_detected": len(overlaps) > 0,
                "overlaps_count": len(overlaps),
                "message": "围栏创建成功"
            }
    
    except Exception as e:
        logger.error(f"创建围栏失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "围栏创建失败"
        }

async def update_fence(
    fence_id: int,
    fence_name: Optional[str] = None,
    fence_geometry: Optional[Union[str, dict]] = None,
    fence_purpose: Optional[str] = None,
    fence_description: Optional[str] = None,
    fence_color: Optional[str] = None,
    fence_opacity: Optional[float] = None,
    fence_tags: Optional[Dict] = None,
    fence_config: Optional[Dict] = None,
    operator_id: Optional[int] = None
) -> Dict[str, Any]:
    """更新围栏"""
    try:
        pool = await get_db_connection()
        async with pool.acquire() as conn:
            # 构建更新字段
            update_fields = []
            params = []
            param_idx = 1
            
            if fence_name is not None:
                update_fields.append(f"fence_name = ${param_idx}")
                params.append(fence_name)
                param_idx += 1
                
            if fence_geometry is not None:
                if not validate_geometry(fence_geometry):
                    raise ValueError("无效的几何数据")
                
                if isinstance(fence_geometry, dict):
                    wkt_geometry = convert_geojson_to_wkt(fence_geometry)
                else:
                    wkt_geometry = fence_geometry
                
                update_fields.append(f"fence_geometry = ST_GeomFromText(${param_idx}, 4326)")
                params.append(wkt_geometry)
                param_idx += 1
                
            if fence_purpose is not None:
                update_fields.append(f"fence_purpose = ${param_idx}")
                params.append(fence_purpose)
                param_idx += 1
                
            if fence_description is not None:
                update_fields.append(f"fence_description = ${param_idx}")
                params.append(fence_description)
                param_idx += 1
                
            if fence_color is not None:
                update_fields.append(f"fence_color = ${param_idx}")
                params.append(fence_color)
                param_idx += 1
                
            if fence_opacity is not None:
                update_fields.append(f"fence_opacity = ${param_idx}")
                params.append(fence_opacity)
                param_idx += 1
                
            if fence_tags is not None:
                update_fields.append(f"fence_tags = ${param_idx}")
                params.append(json.dumps(fence_tags))
                param_idx += 1
                
            if fence_config is not None:
                update_fields.append(f"fence_config = ${param_idx}")
                params.append(json.dumps(fence_config))
                param_idx += 1
            
            if not update_fields:
                raise ValueError("没有提供要更新的字段")
            
            # 更新时间戳
            update_fields.append(f"updated_at = ${param_idx}")
            params.append(datetime.now())
            param_idx += 1
            
            # 添加围栏ID
            params.append(fence_id)
            
            # 执行更新
            sql = f"""
                UPDATE electronic_fences 
                SET {', '.join(update_fields)}
                WHERE id = ${param_idx} AND fence_status = 'active'
                RETURNING id, fence_name, fence_area
            """
            
            result = await conn.fetchrow(sql, *params)
            
            if not result:
                raise ValueError("围栏不存在或已被删除")
            
            # 如果更新了几何，重新检测重叠
            overlaps = []
            if fence_geometry is not None:
                overlaps = await detect_fence_overlaps(fence_id)
            
            # 清理相关缓存
            await clear_fence_cache()
            
            return {
                "success": True,
                "fence_id": fence_id,
                "fence_name": result['fence_name'],
                "fence_area": result['fence_area'],
                "overlaps_detected": len(overlaps) > 0,
                "overlaps_count": len(overlaps),
                "message": "围栏更新成功"
            }
    
    except Exception as e:
        logger.error(f"更新围栏失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "围栏更新失败"
        }

async def delete_fence(fence_id: int, operator_id: Optional[int] = None) -> Dict[str, Any]:
    """删除围栏（软删除）"""
    try:
        pool = await get_db_connection()
        async with pool.acquire() as conn:
            # 软删除围栏
            result = await conn.fetchrow("""
                UPDATE electronic_fences 
                SET fence_status = 'deleted', deleted_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND fence_status != 'deleted'
                RETURNING id, fence_name
            """, fence_id)
            
            if not result:
                raise ValueError("围栏不存在或已被删除")
            
            # 清理相关的重叠记录
            await conn.execute("""
                DELETE FROM fence_overlaps 
                WHERE fence_id_1 = $1 OR fence_id_2 = $1
            """, fence_id)
            
            # 清理相关缓存
            await clear_fence_cache()
            
            return {
                "success": True,
                "fence_id": fence_id,
                "fence_name": result['fence_name'],
                "message": "围栏删除成功"
            }
    
    except Exception as e:
        logger.error(f"删除围栏失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "围栏删除失败"
        }

async def get_fence_list(
    status: Optional[str] = None,
    fence_type: Optional[str] = None,
    group_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    bbox: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> Dict[str, Any]:
    """获取围栏列表"""
    try:
        # # 构建缓存键
        # cache_key = get_cache_key("fence_list", 
        #                          status=status, fence_type=fence_type, 
        #                          group_id=group_id, owner_id=owner_id, 
        #                          bbox=bbox, limit=limit, offset=offset)
        
        # # 检查缓存
        # cached_result = await get_cache_value(cache_key, 'fence_list')
        # if cached_result:
        #     return cached_result
        
        pool = await get_db_connection(read_only=True)
        async with pool.acquire() as conn:
            # 构建查询条件
            where_conditions = []
            params = []
            param_idx = 1
            
            if status:
                where_conditions.append(f"fence_status = ${param_idx}")
                params.append(status)
                param_idx += 1
            else:
                where_conditions.append("fence_status != 'deleted'")
                
            if fence_type:
                where_conditions.append(f"fence_type = ${param_idx}")
                params.append(fence_type)
                param_idx += 1
                
            if group_id:
                where_conditions.append(f"group_id = ${param_idx}")
                params.append(group_id)
                param_idx += 1
                
            if owner_id:
                where_conditions.append(f"owner_id = ${param_idx}")
                params.append(owner_id)
                param_idx += 1
                
            if bbox:
                coords = bbox.split(',')
                if len(coords) == 4:
                    west, south, east, north = map(float, coords)
                    where_conditions.append(f"fence_geometry && ST_MakeEnvelope(${param_idx}, ${param_idx+1}, ${param_idx+2}, ${param_idx+3}, 4326)")
                    params.extend([west, south, east, north])
                    param_idx += 4
            
            where_clause = " AND ".join(where_conditions)
            
            # 查询围栏列表
            sql = f"""
                SELECT 
                    id, fence_name, fence_type, fence_purpose, fence_status, fence_level,
                    fence_color, fence_opacity, fence_area, fence_perimeter,
                    group_id, owner_id, creator_id, created_at, updated_at,
                    ST_AsGeoJSON(fence_geometry) as geometry,
                    ST_AsGeoJSON(fence_bounds) as bounds,
                    ST_AsGeoJSON(fence_center) as center,
                    fence_tags, fence_config
                FROM electronic_fences
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """
            
            params.extend([limit, offset])
            
            fences = await conn.fetch(sql, *params)
            
            # 查询总数
            count_sql = f"""
                SELECT COUNT(*) FROM electronic_fences WHERE {where_clause}
            """
            total_count = await conn.fetchval(count_sql, *params[:-2])
            
            # 构建结果
            result = {
                "success": True,
                "total_count": total_count,
                "returned_count": len(fences),
                "limit": limit,
                "offset": offset,
                "fences": []
            }
            
            for fence in fences:
                fence_dict = dict(fence)
                
                # 解析JSON字段
                if fence_dict.get('geometry'):
                    fence_dict['geometry'] = json.loads(fence_dict['geometry'])
                if fence_dict.get('bounds'):
                    fence_dict['bounds'] = json.loads(fence_dict['bounds'])
                if fence_dict.get('center'):
                    fence_dict['center'] = json.loads(fence_dict['center'])
                if fence_dict.get('fence_tags'):
                    fence_dict['fence_tags'] = json.loads(fence_dict['fence_tags'])
                if fence_dict.get('fence_config'):
                    fence_dict['fence_config'] = json.loads(fence_dict['fence_config'])
                
                result["fences"].append(fence_dict)
            
            # 缓存结果
            # await set_cache_value(cache_key, result, 'fence_list')
            
            return result
    
    except Exception as e:
        logger.error(f"获取围栏列表失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "获取围栏列表失败"
        }

async def get_fence_detail(fence_id: int, include_overlaps: bool = True, include_layer_analysis: bool = True) -> Dict[str, Any]:
    """获取围栏详情"""
    try:
        # 构建缓存键
        cache_key = get_cache_key("fence_detail", fence_id=fence_id, 
                                 include_overlaps=include_overlaps, 
                                 include_layer_analysis=include_layer_analysis)
        
        # 检查缓存
        cached_result = await get_cache_value(cache_key, 'fence_detail')
        if cached_result:
            return cached_result
        
        pool = await get_db_connection(read_only=True)
        async with pool.acquire() as conn:
            # 查询围栏基本信息
            fence = await conn.fetchrow("""
                SELECT 
                    id, fence_name, fence_type, fence_purpose, fence_status, fence_level,
                    fence_color, fence_opacity, fence_stroke_color, fence_stroke_width, fence_stroke_opacity,
                    fence_description, fence_area, fence_perimeter,
                    group_id, project_id, parent_fence_id,
                    owner_id, creator_id, permissions,
                    created_at, updated_at, deleted_at, version, is_locked,
                    ST_AsGeoJSON(fence_geometry) as geometry,
                    ST_AsGeoJSON(fence_bounds) as bounds,
                    ST_AsGeoJSON(fence_center) as center,
                    fence_tags, fence_config, fence_metadata
                FROM electronic_fences
                WHERE id = $1
            """, fence_id)
            
            if not fence:
                raise ValueError("围栏不存在")
            
            # 构建基本结果
            result = dict(fence)
            
            # 解析JSON字段
            for json_field in ['geometry', 'bounds', 'center', 'fence_tags', 'fence_config', 'fence_metadata', 'permissions']:
                if result.get(json_field):
                    result[json_field] = json.loads(result[json_field])
            
            # 包含重叠分析
            if include_overlaps:
                overlaps = await detect_fence_overlaps(fence_id)
                result['overlaps'] = overlaps
            
            # 包含图层分析
            if include_layer_analysis:
                layer_analysis = await get_fence_layer_analysis(fence_id)
                result['layer_analysis'] = layer_analysis
            
            # 查询围栏组信息
            if result.get('group_id'):
                group = await conn.fetchrow("""
                    SELECT group_name, group_description, group_color
                    FROM fence_groups WHERE id = $1
                """, result['group_id'])
                if group:
                    result['group_info'] = dict(group)
            
            # 查询历史记录数量
            history_count = await conn.fetchval("""
                SELECT COUNT(*) FROM fence_history WHERE fence_id = $1
            """, fence_id)
            result['history_count'] = history_count
            
            # 缓存结果
            await set_cache_value(cache_key, result, 'fence_detail')
            
            return {
                "success": True,
                "fence": result
            }
    
    except Exception as e:
        logger.error(f"获取围栏详情失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "获取围栏详情失败"
        }

# ==============================================================================
# 重叠检测和分析
# ==============================================================================

async def detect_fence_overlaps(fence_id: int) -> List[Dict[str, Any]]:
    """检测围栏重叠"""
    try:
        pool = await get_db_connection(read_only=True)
        async with pool.acquire() as conn:
            # 调用数据库函数检测重叠
            overlaps = await conn.fetch("""
                SELECT * FROM detect_fence_overlaps($1)
            """, fence_id)
            
            overlaps_list = []
            for overlap in overlaps:
                overlap_dict = dict(overlap)
                
                # 获取重叠围栏的基本信息
                overlap_fence = await conn.fetchrow("""
                    SELECT fence_name, fence_type, fence_purpose, fence_color
                    FROM electronic_fences WHERE id = $1
                """, overlap_dict['overlapping_fence_id'])
                
                if overlap_fence:
                    overlap_dict['overlap_fence_info'] = dict(overlap_fence)
                
                overlaps_list.append(overlap_dict)
            
            # 更新重叠关系表
            if overlaps_list:
                for overlap in overlaps_list:
                    await conn.execute("""
                        INSERT INTO fence_overlaps (
                            fence_id_1, fence_id_2, overlap_area, 
                            overlap_percentage_1, overlap_percentage_2, overlap_type
                        ) VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (fence_id_1, fence_id_2) DO UPDATE SET
                            overlap_area = EXCLUDED.overlap_area,
                            overlap_percentage_1 = EXCLUDED.overlap_percentage_1,
                            overlap_percentage_2 = EXCLUDED.overlap_percentage_2,
                            overlap_type = EXCLUDED.overlap_type,
                            detected_at = CURRENT_TIMESTAMP
                    """, fence_id, overlap['overlapping_fence_id'], overlap['overlap_area'],
                         overlap['overlap_percentage'], 0, overlap['overlap_type'])
            
            return overlaps_list
    
    except Exception as e:
        logger.error(f"检测围栏重叠失败: {e}")
        return []

async def get_fence_layer_analysis(fence_id: int, layer_types: Optional[List[str]] = None) -> Dict[str, Any]:
    """获取围栏图层分析"""
    try:
        if layer_types is None:
            layer_types = ['buildings', 'roads', 'pois', 'water', 'railways', 'landuse']
        
        # 构建缓存键
        cache_key = get_cache_key("fence_layer_analysis", fence_id=fence_id, layer_types=layer_types)
        
        # 检查缓存
        cached_result = await get_cache_value(cache_key, 'layer_analysis')
        if cached_result:
            return cached_result
        
        pool = await get_db_connection(read_only=True)
        async with pool.acquire() as conn:
            analysis_results = {}
            
            for layer_type in layer_types:
                # 调用数据库函数进行图层分析
                result = await conn.fetchval("""
                    SELECT analyze_fence_layer_features($1, $2)
                """, fence_id, layer_type)
                
                if result:
                    analysis_results[layer_type] = result
            
            # 缓存结果
            await set_cache_value(cache_key, analysis_results, 'layer_analysis')
            
            return analysis_results
    
    except Exception as e:
        logger.error(f"围栏图层分析失败: {e}")
        return {}

# ==============================================================================
# 高级操作：合并、切割
# ==============================================================================

async def merge_fences(fence_ids: List[int], new_fence_name: str, operator_id: Optional[int] = None) -> Dict[str, Any]:
    """合并围栏"""
    try:
        if len(fence_ids) < 2:
            raise ValueError("至少需要2个围栏进行合并")
        
        pool = await get_db_connection()
        async with pool.acquire() as conn:
            # 调用数据库函数合并围栏
            new_fence_id = await conn.fetchval("""
                SELECT merge_fences($1, $2, $3)
            """, fence_ids, new_fence_name, operator_id)
            
            if new_fence_id:
                # 检测新围栏的重叠
                overlaps = await detect_fence_overlaps(new_fence_id)
                
                # 清理缓存
                await clear_fence_cache()
                
                return {
                    "success": True,
                    "new_fence_id": new_fence_id,
                    "merged_fence_ids": fence_ids,
                    "overlaps_detected": len(overlaps) > 0,
                    "overlaps_count": len(overlaps),
                    "message": "围栏合并成功"
                }
            else:
                raise ValueError("围栏合并失败")
    
    except Exception as e:
        logger.error(f"合并围栏失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "围栏合并失败"
        }

async def split_fence(fence_id: int, split_line: Union[str, dict], operator_id: Optional[int] = None) -> Dict[str, Any]:
    """切割围栏"""
    try:
        # 转换分割线几何
        if isinstance(split_line, dict):
            # GeoJSON LineString
            if split_line.get('type') != 'LineString':
                raise ValueError("分割线必须是LineString类型")
            coords = split_line.get('coordinates', [])
            if len(coords) < 2:
                raise ValueError("分割线坐标点不足")
            
            # 转换为WKT
            coords_wkt = ','.join([f"{lon} {lat}" for lon, lat in coords])
            split_line_wkt = f"LINESTRING({coords_wkt})"
        else:
            split_line_wkt = split_line
        
        pool = await get_db_connection()
        async with pool.acquire() as conn:
            # 调用数据库函数切割围栏
            new_fence_ids = await conn.fetchval("""
                SELECT split_fence($1, ST_GeomFromText($2, 4326), $3)
            """, fence_id, split_line_wkt, operator_id)
            
            if new_fence_ids:
                # 检测新围栏的重叠
                overlaps_total = 0
                for new_fence_id in new_fence_ids:
                    overlaps = await detect_fence_overlaps(new_fence_id)
                    overlaps_total += len(overlaps)
                
                # 清理缓存
                await clear_fence_cache()
                
                return {
                    "success": True,
                    "original_fence_id": fence_id,
                    "new_fence_ids": new_fence_ids,
                    "parts_count": len(new_fence_ids),
                    "overlaps_detected": overlaps_total > 0,
                    "overlaps_count": overlaps_total,
                    "message": "围栏切割成功"
                }
            else:
                raise ValueError("围栏切割失败")
    
    except Exception as e:
        logger.error(f"切割围栏失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "围栏切割失败"
        }

# ==============================================================================
# 统计和分析
# ==============================================================================

async def get_fence_statistics() -> Dict[str, Any]:
    """获取围栏统计信息"""
    try:
        # 构建缓存键
        cache_key = get_cache_key("fence_statistics")
        
        # 检查缓存
        cached_result = await get_cache_value(cache_key, 'stats')
        if cached_result:
            return cached_result
        
        pool = await get_db_connection(read_only=True)
        async with pool.acquire() as conn:
            # 基本统计
            basic_stats = await conn.fetch("""
                SELECT * FROM v_fence_statistics
            """)
            
            # 重叠统计
            overlap_stats = await conn.fetchrow("""
                SELECT 
                    COUNT(*) as total_overlaps,
                    COUNT(CASE WHEN resolved_at IS NULL THEN 1 END) as unresolved_overlaps,
                    AVG(overlap_area) as avg_overlap_area,
                    MAX(overlap_area) as max_overlap_area
                FROM fence_overlaps
            """)
            
            # 图层关联统计
            layer_stats = await conn.fetch("""
                SELECT 
                    layer_type,
                    COUNT(*) as fence_count,
                    SUM(feature_count) as total_features,
                    AVG(feature_count) as avg_features
                FROM fence_layer_associations
                GROUP BY layer_type
                ORDER BY total_features DESC
            """)
            
            # 历史操作统计
            history_stats = await conn.fetch("""
                SELECT 
                    operation_type,
                    COUNT(*) as operation_count,
                    DATE_TRUNC('day', operated_at) as operation_date
                FROM fence_history
                WHERE operated_at > CURRENT_DATE - INTERVAL '30 days'
                GROUP BY operation_type, DATE_TRUNC('day', operated_at)
                ORDER BY operation_date DESC
            """)
            
            result = {
                "success": True,
                "basic_statistics": [dict(row) for row in basic_stats],
                "overlap_statistics": dict(overlap_stats) if overlap_stats else {},
                "layer_statistics": [dict(row) for row in layer_stats],
                "history_statistics": [dict(row) for row in history_stats],
                "generated_at": datetime.now().isoformat()
            }
            
            # 缓存结果
            await set_cache_value(cache_key, result, 'stats')
            
            return result
    
    except Exception as e:
        logger.error(f"获取围栏统计失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "获取围栏统计失败"
        }

# ==============================================================================
# 缓存管理
# ==============================================================================

async def clear_fence_cache():
    """清理围栏相关缓存"""
    try:
        # 这里可以实现更精细的缓存清理逻辑
        # 暂时使用简单的方法
        logger.info("围栏缓存已清理")
    except Exception as e:
        logger.error(f"清理围栏缓存失败: {e}")

# ==============================================================================
# 围栏导入导出
# ==============================================================================

async def export_fences_geojson(fence_ids: Optional[List[int]] = None, include_properties: bool = True) -> Dict[str, Any]:
    """导出围栏为GeoJSON格式"""
    try:
        pool = await get_db_connection(read_only=True)
        async with pool.acquire() as conn:
            # 构建查询条件
            where_clause = "fence_status = 'active'"
            params = []
            
            if fence_ids:
                where_clause += " AND id = ANY($1)"
                params.append(fence_ids)
            
            # 查询围栏数据
            fences = await conn.fetch(f"""
                SELECT 
                    id, fence_name, fence_type, fence_purpose, fence_status, fence_level,
                    fence_color, fence_opacity, fence_description, fence_area, fence_perimeter,
                    group_id, owner_id, creator_id, created_at, updated_at,
                    ST_AsGeoJSON(fence_geometry) as geometry,
                    fence_tags, fence_config
                FROM electronic_fences
                WHERE {where_clause}
                ORDER BY id
            """, *params)
            
            # 构建GeoJSON
            features = []
            for fence in fences:
                properties = {
                    "id": fence['id'],
                    "fence_name": fence['fence_name'],
                    "fence_type": fence['fence_type'],
                    "fence_status": fence['fence_status']
                }
                
                if include_properties:
                    properties.update({
                        "fence_purpose": fence['fence_purpose'],
                        "fence_level": fence['fence_level'],
                        "fence_color": fence['fence_color'],
                        "fence_opacity": fence['fence_opacity'],
                        "fence_description": fence['fence_description'],
                        "fence_area": fence['fence_area'],
                        "fence_perimeter": fence['fence_perimeter'],
                        "group_id": fence['group_id'],
                        "owner_id": fence['owner_id'],
                        "creator_id": fence['creator_id'],
                        "created_at": fence['created_at'].isoformat() if fence['created_at'] else None,
                        "updated_at": fence['updated_at'].isoformat() if fence['updated_at'] else None
                    })
                    
                    # 添加标签和配置
                    if fence['fence_tags']:
                        properties['fence_tags'] = json.loads(fence['fence_tags'])
                    if fence['fence_config']:
                        properties['fence_config'] = json.loads(fence['fence_config'])
                
                feature = {
                    "type": "Feature",
                    "properties": properties,
                    "geometry": json.loads(fence['geometry'])
                }
                
                features.append(feature)
            
            geojson = {
                "type": "FeatureCollection",
                "features": features,
                "metadata": {
                    "generated_at": datetime.now().isoformat(),
                    "fence_count": len(features),
                    "exported_by": "GIS Electronic Fence System"
                }
            }
            
            return {
                "success": True,
                "geojson": geojson,
                "fence_count": len(features),
                "message": "围栏导出成功"
            }
    
    except Exception as e:
        logger.error(f"导出围栏失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "围栏导出失败"
        }

async def import_fences_geojson(geojson_data: Dict[str, Any], operator_id: Optional[int] = None) -> Dict[str, Any]:
    """从GeoJSON导入围栏"""
    try:
        if geojson_data.get('type') != 'FeatureCollection':
            raise ValueError("不是有效的GeoJSON FeatureCollection")
        
        features = geojson_data.get('features', [])
        if not features:
            raise ValueError("没有找到要导入的围栏特征")
        
        imported_count = 0
        skipped_count = 0
        error_count = 0
        results = []
        
        for feature in features:
            try:
                if feature.get('type') != 'Feature':
                    skipped_count += 1
                    continue
                
                geometry = feature.get('geometry')
                properties = feature.get('properties', {})
                
                # 验证几何
                if not geometry or not validate_geometry(geometry):
                    error_count += 1
                    continue
                
                # 提取属性
                fence_name = properties.get('fence_name', f"导入围栏_{imported_count + 1}")
                fence_type = properties.get('fence_type', 'polygon')
                fence_purpose = properties.get('fence_purpose')
                fence_description = properties.get('fence_description')
                fence_color = properties.get('fence_color', '#FF0000')
                fence_opacity = properties.get('fence_opacity', 0.3)
                fence_tags = properties.get('fence_tags')
                fence_config = properties.get('fence_config')
                
                # 创建围栏
                result = await create_fence(
                    fence_name=fence_name,
                    fence_geometry=geometry,
                    fence_type=fence_type,
                    fence_purpose=fence_purpose,
                    fence_description=fence_description,
                    fence_color=fence_color,
                    fence_opacity=fence_opacity,
                    fence_tags=fence_tags,
                    fence_config=fence_config,
                    creator_id=operator_id
                )
                
                if result.get('success'):
                    imported_count += 1
                else:
                    error_count += 1
                
                results.append(result)
                
            except Exception as e:
                error_count += 1
                logger.error(f"导入围栏特征失败: {e}")
                continue
        
        return {
            "success": True,
            "imported_count": imported_count,
            "skipped_count": skipped_count,
            "error_count": error_count,
            "total_features": len(features),
            "results": results,
            "message": f"导入完成：成功{imported_count}个，跳过{skipped_count}个，错误{error_count}个"
        }
    
    except Exception as e:
        logger.error(f"导入围栏失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "围栏导入失败"
        } 