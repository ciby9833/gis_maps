#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GIS 后端服务 - API路由模块（高并发优化版本）
包含所有API端点的定义和路由处理逻辑
"""

from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List
import time
import json
import logging
import urllib.parse
from services import *

# 配置日志
logger = logging.getLogger("gis_backend")

# 创建路由器
router = APIRouter()

# ==============================================================================
# 图层配置API端点
# ==============================================================================

@router.get("/api/config/layers")
async def get_layer_config():
    """获取图层配置信息"""
    try:
        # 动态导入配置以避免循环导入
        import config
        
        return {
            "success": True,
            "data": {
                "layer_strategies": config.LAYER_ZOOM_STRATEGIES,
                "high_zoom_strategy": config.HIGH_ZOOM_STRATEGY,
                "zoom_descriptions": config.ZOOM_STRATEGY_DESCRIPTION,
                "api_info": {
                    "version": "2.0.0",
                    "description": "统一的图层缩放级别策略配置",
                    "features": [
                        "电子围栏在所有级别加载",
                        "16级以上加载所有图层",
                        "动态缩放级别策略",
                        "智能性能优化"
                    ]
                }
            },
            "message": "图层配置获取成功"
        }
    except Exception as e:
        logger.error(f"获取图层配置失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "图层配置获取失败"
        }

@router.get("/api/config/layers/{layer_name}")
async def get_layer_strategy(layer_name: str, zoom: int = Query(..., description="缩放级别")):
    """获取指定图层的缩放策略"""
    try:
        from config import get_layer_zoom_strategy
        
        strategy = get_layer_zoom_strategy(layer_name, zoom)
        
        return {
            "success": True,
            "data": {
                "layer_name": layer_name,
                "zoom": zoom,
                "strategy": strategy
            },
            "message": f"{layer_name}图层策略获取成功"
        }
    except Exception as e:
        logger.error(f"获取图层策略失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "图层策略获取失败"
        }

@router.get("/api/config/zoom/{zoom}")
async def get_zoom_strategy_all(zoom: int):
    """获取指定缩放级别下所有图层的策略"""
    try:
        from config import get_all_layers_zoom_strategy
        
        strategies = get_all_layers_zoom_strategy(zoom)
        
        return {
            "success": True,
            "data": {
                "zoom": zoom,
                "strategies": strategies,
                "summary": {
                    "loadable_layers": len([k for k, v in strategies.items() if v.get('load_data')]),
                    "total_layers": len(strategies)
                }
            },
            "message": f"缩放级别{zoom}策略获取成功"
        }
    except Exception as e:
        logger.error(f"获取缩放策略失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "缩放策略获取失败"
        }

# ==============================================================================
# 基础API端点
# ==============================================================================

@router.get("/")
async def root():
    """API根路径"""
    return {
        "message": "GIS Map Service API - 高并发优化版本",
        "version": "2.0.0",
        "features": [
            "高并发数据库连接池",
            "Redis分布式缓存",
            "多层缓存策略",
            "读写分离",
            "智能缩放策略",
            "地理编码优化"
        ],
        "endpoints": {
            "buildings": "/api/buildings",
            "land_polygons": "/api/land_polygons",
            "roads": "/api/roads",
            "pois": "/api/pois",
            "water": "/api/water",
            "railways": "/api/railways",
            "traffic": "/api/traffic",
            "worship": "/api/worship",
            "landuse": "/api/landuse",
            "transport": "/api/transport",
            "places": "/api/places", 
            "natural": "/api/natural",
            "validate_location": "/api/validate_location",
            "search": "/api/search",
            "geocode": "/api/geocode",
            "nearby": "/api/nearby",
            "status": "/api/status",
            "cache_stats": "/api/cache_stats"
        }
    }

@router.get("/api/status")
async def get_status():
    """获取服务状态 - 高并发优化版本"""
    cache_key = get_cache_key("status")
    
    # 使用新的缓存系统
    cached_result = await get_cache_value(cache_key, 'status')
    if cached_result:
        return cached_result
    
    pool = await get_db_connection(read_only=True)  # 状态查询使用读库
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            # 获取数据库版本
            version = await conn.fetchval("SELECT version()", timeout=DB_QUERY_TIMEOUT)
            
            # 统计所有OSM数据表
            osm_data_summary = {}
            total_features = 0
            
            # 定义数据分类和对应的表
            data_categories = {
                "道路网络": ["osm_roads"],
                "水体系统": ["osm_water_areas", "osm_waterways"],
                "铁路网络": ["osm_railways"],
                "土地使用": ["osm_landuse"]
            }
            
            # 检查陆地多边形
            land_count = await conn.fetchval("SELECT COUNT(*) FROM land_polygons", timeout=DB_QUERY_TIMEOUT)
            
            # 统计每个分类的数据
            for category, tables in data_categories.items():
                category_stats = {
                    "table_count": 0,
                    "total_count": 0,
                    "tables": []
                }
                
                for table in tables:
                    try:
                        # 检查表是否存在
                        table_exists = await conn.fetchval("""
                            SELECT EXISTS (
                                SELECT FROM information_schema.tables 
                                WHERE table_name = $1
                            )
                        """, table, timeout=DB_QUERY_TIMEOUT)
                        
                        if table_exists:
                            # 获取记录数
                            count = await conn.fetchval(f"SELECT COUNT(*) FROM {table}", timeout=DB_QUERY_TIMEOUT)
                            
                            # 获取表大小
                            size_result = await conn.fetchval("""
                                SELECT pg_size_pretty(pg_total_relation_size($1))
                            """, table, timeout=DB_QUERY_TIMEOUT)
                            
                            if count > 0:
                                category_stats["table_count"] += 1
                                category_stats["total_count"] += count
                                category_stats["tables"].append({
                                    "table": table,
                                    "count": count,
                                    "size": size_result or "0 bytes"
                                })
                                total_features += count
                                
                    except Exception as table_error:
                        logger.warning(f"统计表 {table} 时出错: {table_error}")
                        continue
                
                if category_stats["table_count"] > 0:
                    osm_data_summary[category] = category_stats
            
            # 添加陆地多边形统计
            if land_count > 0:
                land_size = await conn.fetchval("""
                    SELECT pg_size_pretty(pg_total_relation_size('land_polygons'))
                """, timeout=DB_QUERY_TIMEOUT)
                osm_data_summary["陆地多边形"] = {
                    "table_count": 1,
                    "total_count": land_count,
                    "tables": [{
                        "table": "land_polygons",
                        "count": land_count,
                        "size": land_size or "0 bytes"
                    }]
                }
                total_features += land_count
            
            # 添加merged_osm_features统计
            try:
                merged_count = await conn.fetchval("SELECT COUNT(*) FROM merged_osm_features", timeout=DB_QUERY_TIMEOUT)
                if merged_count > 0:
                    merged_size = await conn.fetchval("""
                        SELECT pg_size_pretty(pg_total_relation_size('merged_osm_features'))
                    """, timeout=DB_QUERY_TIMEOUT)
                    osm_data_summary["合并OSM特征"] = {
                        "table_count": 1,
                        "total_count": merged_count,
                        "tables": [{
                            "table": "merged_osm_features",
                            "count": merged_count,
                            "size": merged_size or "0 bytes"
                        }]
                    }
                    total_features += merged_count
            except Exception as e:
                logger.warning(f"统计merged_osm_features表时出错: {e}")
            
            # 添加缓存统计
            cache_stats = get_cache_stats()
            
            result = {
                "status": "running",
                "database": "connected",
                "postgres_version": version,
                "total_features": total_features,
                "total_building_features": osm_data_summary.get("合并OSM特征", {}).get("total_count", 0),
                "land_polygons": {"count": land_count, "available": land_count > 0},
                "osm_data_summary": osm_data_summary,
                "cache_stats": cache_stats,
                "connection_info": {
                    "read_replicas": len(read_pools),
                    "redis_available": redis_client is not None
                }
            }
            
            # 缓存结果
            await set_cache_value(cache_key, result, 'status')
            return result
            
    except Exception as e:
        logger.error(f"获取状态失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取状态失败: {str(e)}")

@router.get("/api/cache_stats")
async def get_cache_statistics():
    """获取缓存统计信息"""
    return {
        "timestamp": time.time(),
        "cache_stats": get_cache_stats(),
        "memory_usage": {
            "memory_cache_size": len(memory_cache),
            "memory_cache_max": CACHE_CONFIG['memory_cache']['max_size']
        }
    }

# ==============================================================================
# 主要数据API端点 - 高并发优化
# ==============================================================================

@router.get("/api/buildings")
async def get_buildings(
    bbox: Optional[str] = Query(None, description="边界框: west,south,east,north"),
    category: Optional[str] = Query(None, description="建筑物类别"),
    limit: int = Query(50000, description="最大返回数量"),
    zoom: Optional[int] = Query(None, description="缩放级别，用于LOD优化"),
    validate_land: bool = Query(False, description="是否验证建筑物是否在陆地上")
):
    """获取建筑物数据 - 高并发优化版本"""
    start_time = time.time()
    
    # 使用新的统一缩放策略
    try:
        from config import get_layer_zoom_strategy
        strategy = get_layer_zoom_strategy('buildings', zoom or 1)
    except Exception as e:
        # 回退到简单策略
        logger.warning(f"缩放策略加载失败，使用回退策略: {e}")
        strategy = {
            'load_data': zoom is None or zoom >= 6,
            'max_features': 50000,
            'reason': 'fallback_strategy'
        }
    
    if not strategy.get('load_data'):
        return {
            "type": "FeatureCollection", 
            "features": [],
            "zoom_info": {"zoom": zoom, "reason": strategy.get('reason', 'zoom_too_low')},
            "performance": {"query_time": time.time() - start_time, "cache_hit": False}
        }
    
    effective_limit = min(limit, strategy['max_features'])
    cache_key = get_cache_key("buildings", bbox=bbox, category=category, limit=effective_limit, zoom=zoom)
    
    # 使用新的缓存系统
    cached_result = await get_cache_value(cache_key, 'buildings')
    if cached_result:
        cached_result['performance'] = {
            "query_time": time.time() - start_time,
            "cache_hit": True
        }
        return cached_result

    pool = await get_db_connection(read_only=True)  # 建筑物查询使用读库
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            where_conditions = []
            params = []

            if bbox:
                coords = bbox.split(',')
                if len(coords) == 4:
                    west, south, east, north = map(float, coords)
                    where_conditions.append("geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)")
                    params.extend([west, south, east, north])

            # 建筑物相关的fclass类型
            building_fclasses = "('building', 'buildings', 'house', 'residential', 'apartments', 'commercial', 'industrial', 'office', 'retail', 'warehouse', 'hospital', 'school', 'university', 'hotel', 'public')"
            
            # 添加建筑物过滤条件
            where_conditions.append(f"(fclass IN {building_fclasses} OR geometry_type = 'MultiPolygon')")
            
            # 构建完整的where子句
            where_clause = " AND ".join(where_conditions)
            
            # 查询merged_osm_features表中的建筑物数据
            params.append(effective_limit)
            limit_param = f"${len(params)}"
            
            # 优化SQL查询 - 添加几何简化
            simplify_tolerance = strategy.get('simplify_tolerance', 0)
            geom_field = "geom"
            if simplify_tolerance > 0:
                geom_field = f"ST_Simplify(geom, {simplify_tolerance / 111320.0})"
            
            sql = f"""
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'geometry', ST_AsGeoJSON({geom_field})::jsonb,
                        'properties', jsonb_build_object(
                            'id', id,
                            'osm_id', COALESCE(osm_id, ''),
                            'name', COALESCE(name, ''),
                            'fclass', COALESCE(fclass, ''),
                            'type', COALESCE(type, ''),
                            'geometry_type', COALESCE(geometry_type, ''),
                            'source_table', COALESCE(source_table, '')
                        )
                    ) ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
                ), '[]'::jsonb)
            ) as geojson
            FROM (
                SELECT 
                    id, osm_id, name, fclass, type, geom, geometry_type, source_table
                FROM merged_osm_features
                WHERE {where_clause} 
                    AND geom IS NOT NULL 
                    AND ST_IsValid(geom) 
                    AND ST_AsGeoJSON(geom) IS NOT NULL
                    AND ST_AsGeoJSON(geom) != 'null'
                    AND ST_GeometryType(geom) IS NOT NULL
                ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
                LIMIT {limit_param}
            ) sub
            """
            
            # 使用统一的超时时间
            result = await conn.fetchrow(sql, *params, timeout=DB_QUERY_TIMEOUT)
            
            if result and result['geojson']:
                geojson_data = result['geojson']
                if isinstance(geojson_data, str):
                    geojson_data = json.loads(geojson_data)
                
                # 清理GeoJSON数据
                geojson_data = clean_geojson_features(geojson_data)
                
                # 添加性能信息
                query_time = time.time() - start_time
                geojson_data['performance'] = {
                    "query_time": query_time,
                    "cache_hit": False,
                    "features_count": len(geojson_data.get('features', [])),
                    "zoom_strategy": strategy['reason'],
                    "simplified": simplify_tolerance > 0
                }
                
                # 慢查询监控
                if query_time > MONITORING_CONFIG.get('slow_query_threshold', 1.0):
                    logger.warning(f"慢查询 - /api/buildings 耗时 {query_time:.2f}s, bbox={bbox}, limit={limit}, zoom={zoom}")
                
                # 缓存结果
                await set_cache_value(cache_key, geojson_data, 'buildings')
                
                return geojson_data
            else:
                empty_result = {
                    "type": "FeatureCollection", 
                    "features": [],
                    "performance": {
                        "query_time": time.time() - start_time,
                        "cache_hit": False
                    }
                }
                await set_cache_value(cache_key, empty_result, 'buildings')
                return empty_result
                
    except Exception as e:
        import traceback
        error_msg = f"建筑物查询失败: {str(e)}"
        logger.error(error_msg)
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        
        # 返回标准化错误信息
        return {
            "type": "FeatureCollection", 
            "features": [],
            "error": error_msg,
            "performance": {
                "query_time": time.time() - start_time,
                "cache_hit": False
            }
        }

@router.get("/api/land_polygons")
async def get_land_polygons(
    bbox: Optional[str] = Query(None, description="边界框: west,south,east,north"),
    limit: int = Query(10000, description="最大返回数量"),
    zoom: Optional[int] = Query(None, description="缩放级别，用于LOD优化")
):
    """获取陆地多边形数据 - 高并发优化版本"""
    start_time = time.time()
    
    strategy = get_land_polygon_zoom_strategy(zoom)
    
    if not strategy['load_data']:
        return {
            "type": "FeatureCollection", 
            "features": [],
            "zoom_info": {"zoom": zoom, "reason": strategy['reason']},
            "performance": {"query_time": time.time() - start_time, "cache_hit": False}
        }
    
    effective_limit = min(limit, strategy['max_features'])
    cache_key = get_cache_key("land_polygons", bbox=bbox, limit=effective_limit, zoom=zoom)
    
    # 使用新的缓存系统
    cached_result = await get_cache_value(cache_key, 'land_polygons')
    if cached_result:
        cached_result['performance'] = {
            "query_time": time.time() - start_time,
            "cache_hit": True
        }
        return cached_result

    pool = await get_db_connection(read_only=True)  # 使用读库
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            where_conditions = []
            params = []

            if bbox:
                coords = bbox.split(',')
                if len(coords) == 4:
                    west, south, east, north = map(float, coords)
                    where_conditions.append("geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)")
                    params.extend([west, south, east, north])

            where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
            
            params.append(effective_limit)
            limit_param = f"${len(params)}"
            
            # 添加几何简化
            simplify_tolerance = strategy.get('simplify_tolerance', 0)
            geom_field = "geom"
            if simplify_tolerance > 0:
                geom_field = f"ST_Simplify(geom, {simplify_tolerance / 111320.0})"
            
            sql = f"""
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'geometry', ST_AsGeoJSON({geom_field})::jsonb,
                        'properties', jsonb_build_object('gid', gid, 'type', 'land_polygon')
                    )
                ), '[]'::jsonb)
            ) as geojson
            FROM (
                SELECT gid, geom
                FROM land_polygons
                WHERE {where_clause} AND geom IS NOT NULL AND ST_IsValid(geom)
                ORDER BY ST_Area(geom) DESC
                LIMIT {limit_param}
            ) sub
            """
            
            result = await conn.fetchrow(sql, *params, timeout=DB_QUERY_TIMEOUT)
            
            if result and result['geojson']:
                geojson_data = result['geojson']
                if isinstance(geojson_data, str):
                    geojson_data = json.loads(geojson_data)
                
                # 清理GeoJSON数据
                geojson_data = clean_geojson_features(geojson_data)
                
                # 添加性能信息
                query_time = time.time() - start_time
                geojson_data['performance'] = {
                    "query_time": query_time,
                    "cache_hit": False,
                    "features_count": len(geojson_data.get('features', [])),
                    "zoom_strategy": strategy['reason'],
                    "simplified": simplify_tolerance > 0
                }
                
                # 慢查询监控
                if query_time > MONITORING_CONFIG.get('slow_query_threshold', 1.0):
                    logger.warning(f"慢查询 - /api/land_polygons 耗时 {query_time:.2f}s, bbox={bbox}, limit={limit}, zoom={zoom}")
                
                await set_cache_value(cache_key, geojson_data, 'land_polygons')
                return geojson_data
            else:
                empty_result = {
                    "type": "FeatureCollection", 
                    "features": [],
                    "performance": {
                        "query_time": time.time() - start_time,
                        "cache_hit": False
                    }
                }
                await set_cache_value(cache_key, empty_result, 'land_polygons')
                return empty_result
                
    except Exception as e:
        import traceback
        error_msg = f"陆地多边形查询失败: {str(e)}"
        logger.error(error_msg)
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        return {
            "type": "FeatureCollection", 
            "features": [],
            "error": error_msg,
            "performance": {
                "query_time": time.time() - start_time,
                "cache_hit": False
            }
        }

@router.get("/api/roads")
async def get_roads(
    bbox: Optional[str] = Query(None, description="边界框: west,south,east,north"),
    limit: int = Query(10000, description="最大返回数量"),
    zoom: Optional[int] = Query(None, description="缩放级别，用于LOD优化")
):
    """获取道路数据 - 高并发优化版本"""
    start_time = time.time()
    
    # 使用新的统一缩放策略
    try:
        from config import get_layer_zoom_strategy
        strategy = get_layer_zoom_strategy('roads', zoom or 1)
    except Exception as e:
        # 回退到简单策略
        logger.warning(f"道路缩放策略加载失败，使用回退策略: {e}")
        strategy = {
            'load_data': zoom is None or zoom >= 9,
            'max_features': 10000,
            'reason': 'fallback_strategy',
            'road_filter': "1=1"  # 加载所有道路
        }
    
    if not strategy.get('load_data'):
        return {
            "type": "FeatureCollection", 
            "features": [],
            "zoom_info": {"zoom": zoom, "reason": strategy.get('reason', 'zoom_too_low')},
            "performance": {"query_time": time.time() - start_time, "cache_hit": False}
        }
    
    effective_limit = min(limit, strategy.get('max_features', 10000))
    cache_key = get_cache_key("roads", bbox=bbox, limit=effective_limit, zoom=zoom)
    
    # 使用新的缓存系统
    cached_result = await get_cache_value(cache_key, 'roads')
    if cached_result:
        cached_result['performance'] = {
            "query_time": time.time() - start_time,
            "cache_hit": True
        }
        return cached_result

    pool = await get_db_connection(read_only=True)
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            where_conditions = [strategy.get('road_filter', '1=1')]
            params = []

            if bbox:
                coords = bbox.split(',')
                if len(coords) == 4:
                    west, south, east, north = map(float, coords)
                    where_conditions.append("geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)")
                    params.extend([west, south, east, north])

            where_clause = " AND ".join(where_conditions)
            
            params.append(effective_limit)
            limit_param = f"${len(params)}"
            
            # 添加几何简化
            simplify_tolerance = strategy.get('simplify_tolerance', 0)
            geom_field = "geom"
            if simplify_tolerance > 0:
                geom_field = f"ST_Simplify(geom, {simplify_tolerance / 111320.0})"
            
            sql = f"""
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'geometry', ST_AsGeoJSON({geom_field})::jsonb,
                        'properties', jsonb_build_object(
                            'gid', gid,
                            'osm_id', osm_id,
                            'name', name,
                            'fclass', fclass
                        )
                    )
                ), '[]'::jsonb)
            ) as geojson
            FROM (
                SELECT gid, osm_id, name, fclass, geom
                FROM osm_roads
                WHERE {where_clause} AND geom IS NOT NULL AND ST_IsValid(geom)
                LIMIT {limit_param}
            ) sub
            """
            
            result = await conn.fetchrow(sql, *params, timeout=DB_QUERY_TIMEOUT)
            
            if result and result['geojson']:
                geojson_data = result['geojson']
                if isinstance(geojson_data, str):
                    geojson_data = json.loads(geojson_data)
                
                # 清理GeoJSON数据
                geojson_data = clean_geojson_features(geojson_data)
                
                # 添加性能信息
                query_time = time.time() - start_time
                geojson_data['performance'] = {
                    "query_time": query_time,
                    "cache_hit": False,
                    "features_count": len(geojson_data.get('features', [])),
                    "zoom_strategy": strategy['reason'],
                    "simplified": simplify_tolerance > 0
                }
                
                # 慢查询监控
                if query_time > MONITORING_CONFIG.get('slow_query_threshold', 1.0):
                    logger.warning(f"慢查询 - /api/roads 耗时 {query_time:.2f}s, bbox={bbox}, limit={limit}, zoom={zoom}")
                
                await set_cache_value(cache_key, geojson_data, 'roads')
                return geojson_data
            else:
                empty_result = {
                    "type": "FeatureCollection", 
                    "features": [],
                    "performance": {
                        "query_time": time.time() - start_time,
                        "cache_hit": False
                    }
                }
                await set_cache_value(cache_key, empty_result, 'roads')
                return empty_result
    except Exception as e:
        import traceback
        error_msg = f"道路查询失败: {str(e)}"
        logger.error(error_msg)
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        return {
            "type": "FeatureCollection", 
            "features": [],
            "error": error_msg,
            "performance": {
                "query_time": time.time() - start_time,
                "cache_hit": False
            }
        }

@router.get("/api/pois")
async def get_pois(
    bbox: Optional[str] = Query(None, description="边界框: west,south,east,north"),
    limit: int = Query(5000, description="最大返回数量"),
    zoom: Optional[int] = Query(None, description="缩放级别，用于LOD优化")
):
    """获取POI数据 - 高并发优化版本"""
    start_time = time.time()
    
    # 使用新的统一缩放策略
    try:
        from config import get_layer_zoom_strategy
        strategy = get_layer_zoom_strategy('pois', zoom or 1)
    except:
        # 回退到原有策略
    if zoom is None or zoom < 12:
        return {
            "type": "FeatureCollection", 
            "features": [],
            "zoom_info": {"zoom": zoom, "reason": "zoom_too_low"},
            "performance": {"query_time": time.time() - start_time, "cache_hit": False}
        }
        strategy = {'load_data': True, 'max_features': 5000}
    
    if not strategy.get('load_data'):
        return {
            "type": "FeatureCollection", 
            "features": [],
            "zoom_info": {"zoom": zoom, "reason": strategy.get('reason', 'zoom_too_low')},
            "performance": {"query_time": time.time() - start_time, "cache_hit": False}
        }
    
    effective_limit = min(limit, strategy.get('max_features', 5000))
    cache_key = get_cache_key("pois", bbox=bbox, limit=effective_limit, zoom=zoom)
    
    # 使用新的缓存系统
    cached_result = await get_cache_value(cache_key, 'pois')
    if cached_result:
        cached_result['performance'] = {
            "query_time": time.time() - start_time,
            "cache_hit": True
        }
        return cached_result

    pool = await get_db_connection(read_only=True)
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            where_conditions = []
            params = []

            # POI相关的fclass类型 - 扩展版本，包含更多商业和服务设施
            poi_fclasses = "('restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'food_court', 'hospital', 'clinic', 'pharmacy', 'school', 'university', 'college', 'bank', 'atm', 'post_office', 'police', 'fire_station', 'government', 'hotel', 'motel', 'guest_house', 'shop', 'mall', 'supermarket', 'market', 'gas_station', 'parking', 'bus_station', 'subway_station', 'train_station', 'airport', 'museum', 'library', 'theatre', 'cinema', 'park', 'playground', 'stadium', 'sports_centre', 'swimming_pool', 'place_of_worship', 'mosque', 'church', 'temple', 'convenience', 'market_place', 'kindergarten', 'comms_tower', 'street_lamp')"
            
            where_conditions.append(f"fclass IN {poi_fclasses}")

            if bbox:
                coords = bbox.split(',')
                if len(coords) == 4:
                    west, south, east, north = map(float, coords)
                    where_conditions.append("geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)")
                    params.extend([west, south, east, north])

            where_clause = " AND ".join(where_conditions)
            
            params.append(effective_limit)
            limit_param = f"${len(params)}"
            sql = f"""
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'geometry', ST_AsGeoJSON(geom)::jsonb,
                        'properties', jsonb_build_object(
                            'id', id,
                            'osm_id', COALESCE(osm_id, ''),
                            'name', COALESCE(name, ''),
                            'fclass', COALESCE(fclass, ''),
                            'type', COALESCE(type, ''),
                            'geometry_type', COALESCE(geometry_type, ''),
                            'source_table', COALESCE(source_table, '')
                        )
                    ) ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
                ), '[]'::jsonb)
            ) as geojson
            FROM (
                SELECT id, osm_id, name, fclass, type, geom, geometry_type, source_table
                FROM merged_osm_features
                WHERE {where_clause} AND geom IS NOT NULL AND ST_IsValid(geom) AND ST_AsGeoJSON(geom) IS NOT NULL
                ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
                LIMIT {limit_param}
            ) sub
            """
            
            result = await conn.fetchrow(sql, *params, timeout=DB_QUERY_TIMEOUT)
            
            if result and result['geojson']:
                geojson_data = result['geojson']
                if isinstance(geojson_data, str):
                    geojson_data = json.loads(geojson_data)
                
                # 清理GeoJSON数据
                geojson_data = clean_geojson_features(geojson_data)
                
                # 添加性能信息
                query_time = time.time() - start_time
                geojson_data['performance'] = {
                    "query_time": query_time,
                    "cache_hit": False,
                    "features_count": len(geojson_data.get('features', []))
                }
                
                # 慢查询监控
                if query_time > MONITORING_CONFIG.get('slow_query_threshold', 1.0):
                    logger.warning(f"慢查询 - /api/pois 耗时 {query_time:.2f}s, bbox={bbox}, limit={limit}, zoom={zoom}")
                
                await set_cache_value(cache_key, geojson_data, 'pois')
                return geojson_data
            else:
                empty_result = {
                    "type": "FeatureCollection", 
                    "features": [],
                    "performance": {
                        "query_time": time.time() - start_time,
                        "cache_hit": False
                    }
                }
                await set_cache_value(cache_key, empty_result, 'pois')
                return empty_result
    except Exception as e:
        import traceback
        error_msg = f"POI查询失败: {str(e)}"
        logger.error(error_msg)
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        return {
            "type": "FeatureCollection", 
            "features": [], 
            "error": error_msg,
            "performance": {
                "query_time": time.time() - start_time,
                "cache_hit": False
            }
        }

# ==============================================================================
# 地理编码和搜索API端点
# ==============================================================================

@router.get("/api/geocode")
async def geocode_location(
    query: str = Query(..., description="搜索查询（地址或坐标）")
):
    """地理编码 - 支持地址转坐标和坐标转地址"""
    decoded_query = urllib.parse.unquote(query).strip()
    
    if not decoded_query:
        raise HTTPException(status_code=400, detail="请输入有效的地址或坐标")
    
    # 处理坐标输入
    if is_coordinate_string(decoded_query):
        lat, lng = parse_coordinates(decoded_query)
        if lat is None or lng is None:
            raise HTTPException(status_code=400, detail="坐标格式无效")
        return {"type": "reverse_geocode", "coordinates": {"lat": lat, "lng": lng}}
    
    # 处理地址搜索
    try:
        # 首先尝试 Google API
        google_result = await google_geocode(decoded_query)
        if google_result:
            return {
                "type": "forward_geocode",
                "query": decoded_query,
                "lat": google_result['lat'],
                "lng": google_result['lng'],
                "formatted_address": google_result['formatted_address']
            }
        
        # Google API 没找到结果，尝试本地数据库搜索
        logger.info(f"Google API 未找到结果，尝试本地搜索: {decoded_query}")
        
        pool = await get_db_connection(read_only=True)
        if pool:
            async with pool.acquire() as conn:
                # 搜索本地POI数据
                sql = """
                SELECT id, osm_id, name, fclass, type, geometry_type, source_table,
                       ST_X(ST_Centroid(geom)) as lng, 
                       ST_Y(ST_Centroid(geom)) as lat,
                       ST_AsGeoJSON(geom) as geometry
                FROM merged_osm_features
                WHERE LOWER(name) ILIKE LOWER($1) 
                  AND name IS NOT NULL 
                  AND geom IS NOT NULL 
                  AND ST_IsValid(geom)
                  AND (geometry_type = 'Point' OR geometry_type = 'MultiPolygon')
                ORDER BY 
                  CASE 
                    WHEN LOWER(name) = LOWER($2) THEN 1  -- 精确匹配优先
                    WHEN LOWER(name) LIKE LOWER($3) THEN 2  -- 开头匹配次之
                    ELSE 3  -- 包含匹配最后
                  END,
                  CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END,
                  id
                LIMIT 5
                """
                
                # 使用不同的匹配模式
                like_pattern = f"%{decoded_query}%"
                starts_pattern = f"{decoded_query}%"
                
                results = await conn.fetch(sql, like_pattern, decoded_query, starts_pattern, timeout=DB_QUERY_TIMEOUT)
                
                if results:
                    # 返回最佳匹配
                    best_match = results[0]
                    return {
                        "type": "forward_geocode_local",
                        "query": decoded_query,
                        "lat": float(best_match['lat']),
                        "lng": float(best_match['lng']),
                        "formatted_address": f"{best_match['name']} ({best_match['fclass'] or '地点'})",
                        "local_result": {
                            "name": best_match['name'],
                            "type": best_match['fclass'],
                            "source": "local_database",
                            "osm_id": best_match['osm_id']
                        },
                        "alternative_results": [
                            {
                                "name": r['name'],
                                "lat": float(r['lat']),
                                "lng": float(r['lng']),
                                "type": r['fclass']
                            } for r in results[1:] if r['name']
                        ] if len(results) > 1 else []
                    }
        
        # 所有搜索都失败
        return {
            "type": "no_results",
            "query": decoded_query,
            "message": f"未找到匹配 '{decoded_query}' 的结果",
            "suggestions": [
                "请尝试输入更完整的地址",
                "检查拼写是否正确",
                "尝试使用地标名称或主要街道名",
                "可以直接输入坐标格式：经度,纬度"
            ]
        }
        
    except HTTPException:
        # 重新抛出 HTTP 异常
        raise
    except Exception as e:
        logger.error(f"地理编码过程中发生错误: {e}")
        return {
            "type": "error",
            "query": decoded_query,
            "message": "搜索服务暂时不可用，请稍后重试",
            "error": str(e)
        }

@router.get("/api/search")
async def search_buildings(
    q: str = Query(..., description="搜索关键词"),
    limit: int = Query(20, description="最大返回数量")
):
    """搜索建筑物"""
    pool = await get_db_connection()
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            sql = """
            SELECT id, osm_id, name, type, fclass, geometry_type, source_table, ST_AsGeoJSON(geom) as geometry
            FROM merged_osm_features
            WHERE LOWER(name) LIKE LOWER($1) AND name IS NOT NULL AND geom IS NOT NULL AND ST_IsValid(geom)
            ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
            LIMIT $2
            """
            
            results = await conn.fetch(sql, f"%{q}%", limit)
            results_list = []
            
            for record in results:
                record_dict = dict(record)
                # 检查geometry是否有效
                if record_dict.get('geometry') and record_dict['geometry'] not in ('null', None, ''):
                    try:
                        # 验证geometry是否为有效JSON
                        if isinstance(record_dict['geometry'], str):
                            json.loads(record_dict['geometry'])
                        results_list.append(record_dict)
                    except:
                        continue
            
            return {
                "query": q,
                "count": len(results_list),
                "results": results_list
            }
    except Exception as e:
        logger.error(f"搜索失败: {e}")
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")

@router.get("/api/validate_location")
async def validate_location(
    lat: float = Query(..., description="纬度"),
    lng: float = Query(..., description="经度"),
    include_distance: bool = Query(False, description="是否包含到最近海岸线的距离")
):
    """验证坐标是否在陆地上"""
    pool = await get_db_connection()
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            sql_check = """
            SELECT EXISTS (
                SELECT 1 FROM land_polygons 
                WHERE ST_Contains(geom, ST_SetSRID(ST_Point($1, $2), 4326))
            ) as is_on_land
            """
            
            result = await conn.fetchrow(sql_check, lng, lat)
            is_on_land = result['is_on_land'] if result else False
            
            return {
                "location": {"lat": lat, "lng": lng},
                "is_on_land": is_on_land,
                "location_type": "land" if is_on_land else "water"
            }
            
    except Exception as e:
        logger.error(f"位置验证失败: {e}")
        raise HTTPException(status_code=500, detail=f"位置验证失败: {str(e)}")

@router.get("/api/nearby")
async def get_nearby_info(
    lat: float = Query(..., description="纬度"),
    lng: float = Query(..., description="经度"),
    radius: int = Query(50, description="搜索半径（米）")
):
    """获取指定坐标周边信息"""
    pool = await get_db_connection()
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            radius_deg = radius / 111320.0  # 转换为度
            
            sql = """
            SELECT 
                id, osm_id, name, fclass, type, geometry_type, source_table,
                ST_AsGeoJSON(geom) as geometry,
                ST_Distance(geom, ST_SetSRID(ST_Point($1, $2), 4326)) * 111320 as distance_meters
            FROM merged_osm_features
            WHERE ST_DWithin(geom, ST_SetSRID(ST_Point($3, $4), 4326), $5)
                AND geom IS NOT NULL AND ST_IsValid(geom)
            ORDER BY distance_meters
            LIMIT 10
            """
            
            features = await conn.fetch(sql, lng, lat, lng, lat, radius_deg)
            features_list = []
            
            for record in features:
                record_dict = dict(record)
                # 检查geometry是否有效
                if record_dict.get('geometry') and record_dict['geometry'] not in ('null', None, ''):
                    try:
                        # 验证geometry是否为有效JSON
                        if isinstance(record_dict['geometry'], str):
                            json.loads(record_dict['geometry'])
                        features_list.append(record_dict)
                    except:
                        continue
            
            return {
                "center": {"lat": lat, "lng": lng},
                "radius": radius,
                "features": features_list,
                "summary": {"total_features": len(features_list)}
            }
            
    except Exception as e:
        logger.error(f"获取周边信息失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取周边信息失败: {str(e)}") 

# ==============================================================================
# 新增数据类型API端点 - 支持遗漏的重要数据
# ==============================================================================

@router.get("/api/water")
async def get_water_features(
    bbox: Optional[str] = Query(None, description="边界框: west,south,east,north"),
    limit: int = Query(8000, description="最大返回数量"),
    zoom: Optional[int] = Query(None, description="缩放级别，用于LOD优化")
):
    """获取水体相关数据（水体区域和水道）"""
    start_time = time.time()
    
    # 使用新的统一缩放策略
    try:
        from config import get_layer_zoom_strategy
        strategy = get_layer_zoom_strategy('water', zoom or 1)
    except:
        strategy = {'load_data': True, 'max_features': 8000}  # 回退策略
    
    if not strategy.get('load_data'):
        return {
            "type": "FeatureCollection", 
            "features": [],
            "zoom_info": {"zoom": zoom, "reason": strategy.get('reason', 'zoom_too_low')},
            "performance": {"query_time": time.time() - start_time, "cache_hit": False}
        }
    
    effective_limit = min(limit, strategy.get('max_features', 8000))
    cache_key = get_cache_key("water", bbox=bbox, limit=effective_limit, zoom=zoom)
    
    cached_result = await get_cache_value(cache_key, 'water')
    if cached_result:
        cached_result['performance'] = {
            "query_time": time.time() - start_time,
            "cache_hit": True
        }
        return cached_result

    pool = await get_db_connection(read_only=True)
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            where_conditions = []
            params = []

            if bbox:
                coords = bbox.split(',')
                if len(coords) == 4:
                    west, south, east, north = map(float, coords)
                    where_conditions.append("geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)")
                    params.extend([west, south, east, north])

            where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
            
            params.append(effective_limit)
            limit_param = f"${len(params)}"
            
            # 查询水体区域和水道
            sql = f"""
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'geometry', ST_AsGeoJSON(geom)::jsonb,
                        'properties', jsonb_build_object(
                            'gid', gid,
                            'osm_id', COALESCE(osm_id, ''),
                            'name', COALESCE(name, ''),
                            'fclass', COALESCE(fclass, ''),
                            'width', COALESCE(width::text, ''),
                            'source_table', source_table
                        )
                    ) ORDER BY name_priority, gid
                ), '[]'::jsonb)
            ) as geojson
            FROM (
                SELECT 
                    gid, osm_id, name, fclass, NULL as width, geom, 'osm_water_areas' as source_table,
                    CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END as name_priority
                FROM osm_water_areas
                WHERE {where_clause} AND geom IS NOT NULL AND ST_IsValid(geom)
                
                UNION ALL
                
                SELECT 
                    gid, osm_id, name, fclass, width, geom, 'osm_waterways' as source_table,
                    CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END as name_priority
                FROM osm_waterways
                WHERE {where_clause} AND geom IS NOT NULL AND ST_IsValid(geom)
                
                ORDER BY name_priority, gid
                LIMIT {limit_param}
            ) sub
            """
            
            result = await conn.fetchrow(sql, *params, timeout=DB_QUERY_TIMEOUT)
            
            if result and result['geojson']:
                geojson_data = result['geojson']
                if isinstance(geojson_data, str):
                    geojson_data = json.loads(geojson_data)
                
                # 清理GeoJSON数据
                geojson_data = clean_geojson_features(geojson_data)
                
                # 添加性能信息
                query_time = time.time() - start_time
                geojson_data['performance'] = {
                    "query_time": query_time,
                    "cache_hit": False,
                    "features_count": len(geojson_data.get('features', []))
                }
                
                # 慢查询监控
                if query_time > MONITORING_CONFIG.get('slow_query_threshold', 1.0):
                    logger.warning(f"慢查询 - /api/water 耗时 {query_time:.2f}s, bbox={bbox}, limit={limit}, zoom={zoom}")
                
                await set_cache_value(cache_key, geojson_data, 'water')
                return geojson_data
            else:
                empty_result = {
                    "type": "FeatureCollection",
                    "features": [],
                    "performance": {
                        "query_time": time.time() - start_time,
                        "cache_hit": False
                    }
                }
                await set_cache_value(cache_key, empty_result, 'water')
                return empty_result
                
    except Exception as e:
        import traceback
        error_msg = f"水体数据查询失败: {str(e)}"
        logger.error(error_msg)
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        return {
            "type": "FeatureCollection",
            "features": [],
            "error": error_msg,
            "performance": {
                "query_time": time.time() - start_time,
                "cache_hit": False
            }
        }

@router.get("/api/railways")
async def get_railways(
    bbox: Optional[str] = Query(None, description="边界框: west,south,east,north"),
    limit: int = Query(5000, description="最大返回数量"),
    zoom: Optional[int] = Query(None, description="缩放级别，用于LOD优化")
):
    """获取铁路数据"""
    start_time = time.time()
    cache_key = get_cache_key("railways", bbox=bbox, limit=limit, zoom=zoom)
    
    cached_result = await get_cache_value(cache_key, 'railways')
    if cached_result:
        cached_result['performance'] = {
            "query_time": time.time() - start_time,
            "cache_hit": True
        }
        return cached_result

    pool = await get_db_connection(read_only=True)
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            where_conditions = []
            params = []

            if bbox:
                coords = bbox.split(',')
                if len(coords) == 4:
                    west, south, east, north = map(float, coords)
                    where_conditions.append("geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)")
                    params.extend([west, south, east, north])

            where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
            
            params.append(limit)
            limit_param = f"${len(params)}"
            
            sql = f"""
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'geometry', ST_AsGeoJSON(geom)::jsonb,
                        'properties', jsonb_build_object(
                            'gid', gid,
                            'osm_id', osm_id,
                            'name', name,
                            'fclass', fclass,
                            'bridge', bridge,
                            'tunnel', tunnel,
                            'layer', layer
                        )
                    )
                ), '[]'::jsonb)
            ) as geojson
            FROM (
                SELECT gid, osm_id, name, fclass, bridge, tunnel, layer, geom
                FROM osm_railways
                WHERE {where_clause} AND geom IS NOT NULL AND ST_IsValid(geom)
                ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, gid
                LIMIT {limit_param}
            ) sub
            """
            
            result = await conn.fetchrow(sql, *params, timeout=DB_QUERY_TIMEOUT)
            
            if result and result['geojson']:
                geojson_data = result['geojson']
                if isinstance(geojson_data, str):
                    geojson_data = json.loads(geojson_data)
                
                # 清理GeoJSON数据
                geojson_data = clean_geojson_features(geojson_data)
                
                # 添加性能信息
                query_time = time.time() - start_time
                geojson_data['performance'] = {
                    "query_time": query_time,
                    "cache_hit": False,
                    "features_count": len(geojson_data.get('features', []))
                }
                
                # 慢查询监控
                if query_time > MONITORING_CONFIG.get('slow_query_threshold', 1.0):
                    logger.warning(f"慢查询 - /api/railways 耗时 {query_time:.2f}s, bbox={bbox}, limit={limit}, zoom={zoom}")
                
                await set_cache_value(cache_key, geojson_data, 'railways')
                return geojson_data
            else:
                empty_result = {
                    "type": "FeatureCollection",
                    "features": [],
                    "performance": {
                        "query_time": time.time() - start_time,
                        "cache_hit": False
                    }
                }
                await set_cache_value(cache_key, empty_result, 'railways')
                return empty_result
                
    except Exception as e:
        import traceback
        error_msg = f"铁路数据查询失败: {str(e)}"
        logger.error(error_msg)
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        return {
            "type": "FeatureCollection",
            "features": [],
            "error": error_msg,
            "performance": {
                "query_time": time.time() - start_time,
                "cache_hit": False
            }
        }

@router.get("/api/traffic")
async def get_traffic_facilities(
    bbox: Optional[str] = Query(None, description="边界框: west,south,east,north"),
    limit: int = Query(6000, description="最大返回数量"),
    zoom: Optional[int] = Query(None, description="缩放级别，用于LOD优化")
):
    """获取交通设施数据（交通区域和交通点）"""
    start_time = time.time()
    cache_key = get_cache_key("traffic", bbox=bbox, limit=limit, zoom=zoom)
    
    cached_result = await get_cache_value(cache_key, 'traffic')
    if cached_result:
        cached_result['performance'] = {
            "query_time": time.time() - start_time,
            "cache_hit": True
        }
        return cached_result

    pool = await get_db_connection(read_only=True)
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            where_conditions = []
            params = []

            if bbox:
                coords = bbox.split(',')
                if len(coords) == 4:
                    west, south, east, north = map(float, coords)
                    where_conditions.append("geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)")
                    params.extend([west, south, east, north])

            # 交通管理相关的fclass类型
            traffic_fclasses = "('traffic_signals', 'stop', 'give_way', 'mini_roundabout', 'turning_circle', 'speed_camera', 'toll_booth', 'border_control', 'customs', 'checkpoint', 'crossing', 'traffic_calming', 'traffic_mirror', 'traffic_island', 'motorway_junction', 'turning_loop', 'passing_place', 'rest_area', 'services', 'emergency_access_point', 'traffic')"
            
            where_conditions.append(f"fclass IN {traffic_fclasses}")
            where_clause = " AND ".join(where_conditions)
            
            params.append(limit)
            limit_param = f"${len(params)}"
            
            sql = f"""
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'geometry', ST_AsGeoJSON(geom)::jsonb,
                        'properties', jsonb_build_object(
                            'id', id,
                            'osm_id', COALESCE(osm_id, ''),
                            'name', COALESCE(name, ''),
                            'fclass', COALESCE(fclass, ''),
                            'type', COALESCE(type, ''),
                            'geometry_type', COALESCE(geometry_type, ''),
                            'source_table', COALESCE(source_table, '')
                        )
                    ) ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
                ), '[]'::jsonb)
            ) as geojson
            FROM (
                SELECT id, osm_id, name, fclass, type, geom, geometry_type, source_table
                FROM merged_osm_features
                WHERE {where_clause} AND geom IS NOT NULL AND ST_IsValid(geom) AND ST_AsGeoJSON(geom) IS NOT NULL
                ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
                LIMIT {limit_param}
            ) sub
            """
            
            result = await conn.fetchrow(sql, *params, timeout=DB_QUERY_TIMEOUT)
            
            if result and result['geojson']:
                geojson_data = result['geojson']
                if isinstance(geojson_data, str):
                    geojson_data = json.loads(geojson_data)
                
                # 清理GeoJSON数据
                geojson_data = clean_geojson_features(geojson_data)
                
                # 添加性能信息
                query_time = time.time() - start_time
                geojson_data['performance'] = {
                    "query_time": query_time,
                    "cache_hit": False,
                    "features_count": len(geojson_data.get('features', []))
                }
                
                # 慢查询监控
                if query_time > MONITORING_CONFIG.get('slow_query_threshold', 1.0):
                    logger.warning(f"慢查询 - /api/traffic 耗时 {query_time:.2f}s, bbox={bbox}, limit={limit}, zoom={zoom}")
                
                await set_cache_value(cache_key, geojson_data, 'traffic')
                return geojson_data
            else:
                empty_result = {
                    "type": "FeatureCollection", 
                    "features": [],
                    "performance": {
                        "query_time": time.time() - start_time,
                        "cache_hit": False
                    }
                }
                await set_cache_value(cache_key, empty_result, 'traffic')
                return empty_result
                
    except Exception as e:
        import traceback
        error_msg = f"交通设施数据查询失败: {str(e)}"
        logger.error(error_msg)
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        return {
            "type": "FeatureCollection", 
            "features": [], 
            "error": error_msg,
            "performance": {
                "query_time": time.time() - start_time,
                "cache_hit": False
            }
        }

@router.get("/api/worship")
async def get_worship_places(
    bbox: Optional[str] = Query(None, description="边界框: west,south,east,north"),
    limit: int = Query(8000, description="最大返回数量"),
    zoom: Optional[int] = Query(None, description="缩放级别，用于LOD优化")
):
    """获取宗教场所数据"""
    start_time = time.time()
    cache_key = get_cache_key("worship", bbox=bbox, limit=limit, zoom=zoom)
    
    cached_result = await get_cache_value(cache_key, 'worship')
    if cached_result:
        cached_result['performance'] = {
            "query_time": time.time() - start_time,
            "cache_hit": True
        }
        return cached_result

    pool = await get_db_connection(read_only=True)
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            where_conditions = []
            params = []

            if bbox:
                coords = bbox.split(',')
                if len(coords) == 4:
                    west, south, east, north = map(float, coords)
                    where_conditions.append("geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)")
                    params.extend([west, south, east, north])

            # 宗教场所相关的fclass类型
            worship_fclasses = "('place_of_worship', 'mosque', 'church', 'chapel', 'cathedral', 'basilica', 'temple', 'synagogue', 'shrine', 'monastery', 'convent', 'cemetery', 'grave_yard', 'memorial', 'monument', 'wayside_cross', 'wayside_shrine', 'christian', 'jewish', 'muslim', 'buddhist', 'hindu', 'sikh', 'shinto', 'taoist', 'bahai', 'jain', 'unitarian', 'multifaith', 'worship')"
            
            where_conditions.append(f"fclass IN {worship_fclasses}")
            where_clause = " AND ".join(where_conditions)
            
            params.append(limit)
            limit_param = f"${len(params)}"
            
            sql = f"""
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'geometry', ST_AsGeoJSON(geom)::jsonb,
                        'properties', jsonb_build_object(
                            'id', id,
                            'osm_id', COALESCE(osm_id, ''),
                            'name', COALESCE(name, ''),
                            'fclass', COALESCE(fclass, ''),
                            'type', COALESCE(type, ''),
                            'geometry_type', COALESCE(geometry_type, ''),
                            'source_table', COALESCE(source_table, '')
                        )
                    ) ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
                ), '[]'::jsonb)
            ) as geojson
            FROM (
                SELECT id, osm_id, name, fclass, type, geom, geometry_type, source_table
                FROM merged_osm_features
                WHERE {where_clause} AND geom IS NOT NULL AND ST_IsValid(geom) AND ST_AsGeoJSON(geom) IS NOT NULL
                ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
                LIMIT {limit_param}
            ) sub
            """
            
            result = await conn.fetchrow(sql, *params, timeout=DB_QUERY_TIMEOUT)
            
            if result and result['geojson']:
                geojson_data = result['geojson']
                if isinstance(geojson_data, str):
                    geojson_data = json.loads(geojson_data)
                
                # 清理GeoJSON数据
                geojson_data = clean_geojson_features(geojson_data)
                
                # 添加性能信息
                query_time = time.time() - start_time
                geojson_data['performance'] = {
                    "query_time": query_time,
                    "cache_hit": False,
                    "features_count": len(geojson_data.get('features', []))
                }
                
                # 慢查询监控
                if query_time > MONITORING_CONFIG.get('slow_query_threshold', 1.0):
                    logger.warning(f"慢查询 - /api/worship 耗时 {query_time:.2f}s, bbox={bbox}, limit={limit}, zoom={zoom}")
                
                await set_cache_value(cache_key, geojson_data, 'worship')
                return geojson_data
            else:
                empty_result = {
                    "type": "FeatureCollection", 
                    "features": [],
                    "performance": {
                        "query_time": time.time() - start_time,
                        "cache_hit": False
                    }
                }
                await set_cache_value(cache_key, empty_result, 'worship')
                return empty_result
                
    except Exception as e:
        import traceback
        error_msg = f"宗教场所数据查询失败: {str(e)}"
        logger.error(error_msg)
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        return {
            "type": "FeatureCollection", 
            "features": [], 
            "error": error_msg,
            "performance": {
                "query_time": time.time() - start_time,
                "cache_hit": False
            }
        }

@router.get("/api/landuse")
async def get_landuse(
    bbox: Optional[str] = Query(None, description="边界框: west,south,east,north"),
    limit: int = Query(15000, description="最大返回数量"),
    zoom: Optional[int] = Query(None, description="缩放级别，用于LOD优化")
):
    """获取土地使用数据"""
    start_time = time.time()
    cache_key = get_cache_key("landuse", bbox=bbox, limit=limit, zoom=zoom)
    
    cached_result = await get_cache_value(cache_key, 'landuse')
    if cached_result:
        cached_result['performance'] = {
            "query_time": time.time() - start_time,
            "cache_hit": True
        }
        return cached_result

    pool = await get_db_connection(read_only=True)
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            where_conditions = []
            params = []

            if bbox:
                coords = bbox.split(',')
                if len(coords) == 4:
                    west, south, east, north = map(float, coords)
                    where_conditions.append("geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)")
                    params.extend([west, south, east, north])

            where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
            
            params.append(limit)
            limit_param = f"${len(params)}"
            
            sql = f"""
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'geometry', ST_AsGeoJSON(geom)::jsonb,
                        'properties', jsonb_build_object(
                            'gid', gid,
                            'osm_id', osm_id,
                            'name', name,
                            'fclass', fclass,
                            'code', code
                        )
                    )
                ), '[]'::jsonb)
            ) as geojson
            FROM (
                SELECT gid, osm_id, name, fclass, code, geom
                FROM osm_landuse
                WHERE {where_clause} AND geom IS NOT NULL AND ST_IsValid(geom)
                ORDER BY ST_Area(geom) DESC, CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, gid
                LIMIT {limit_param}
            ) sub
            """
            
            result = await conn.fetchrow(sql, *params, timeout=DB_QUERY_TIMEOUT)
            
            if result and result['geojson']:
                geojson_data = result['geojson']
                if isinstance(geojson_data, str):
                    geojson_data = json.loads(geojson_data)
                
                # 清理GeoJSON数据
                geojson_data = clean_geojson_features(geojson_data)
                
                # 添加性能信息
                query_time = time.time() - start_time
                geojson_data['performance'] = {
                    "query_time": query_time,
                    "cache_hit": False,
                    "features_count": len(geojson_data.get('features', []))
                }
                
                # 慢查询监控
                if query_time > MONITORING_CONFIG.get('slow_query_threshold', 1.0):
                    logger.warning(f"慢查询 - /api/landuse 耗时 {query_time:.2f}s, bbox={bbox}, limit={limit}, zoom={zoom}")
                
                await set_cache_value(cache_key, geojson_data, 'landuse')
                return geojson_data
            else:
                empty_result = {
                    "type": "FeatureCollection", 
                    "features": [],
                    "performance": {
                        "query_time": time.time() - start_time,
                        "cache_hit": False
                    }
                }
                await set_cache_value(cache_key, empty_result, 'landuse')
                return empty_result 
                
    except Exception as e:
        import traceback
        error_msg = f"土地使用数据查询失败: {str(e)}"
        logger.error(error_msg)
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        return {
            "type": "FeatureCollection", 
            "features": [], 
            "error": error_msg,
            "performance": {
                "query_time": time.time() - start_time,
                "cache_hit": False
            }
        }

# ==============================================================================
# 缺失的API端点 - 交通运输和地名数据
# ==============================================================================

@router.get("/api/transport")
async def get_transport(
    bbox: Optional[str] = Query(None, description="边界框: west,south,east,north"),
    limit: int = Query(3000, description="最大返回数量"),
    zoom: Optional[int] = Query(None, description="缩放级别，用于LOD优化")
):
    """获取交通运输数据"""
    start_time = time.time()
    cache_key = get_cache_key("transport", bbox=bbox, limit=limit, zoom=zoom)
    
    cached_result = await get_cache_value(cache_key, 'transport')
    if cached_result:
        cached_result['performance'] = {
            "query_time": time.time() - start_time,
            "cache_hit": True
        }
        return cached_result

    pool = await get_db_connection(read_only=True)
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            where_conditions = []
            params = []

            if bbox:
                coords = bbox.split(',')
                if len(coords) == 4:
                    west, south, east, north = map(float, coords)
                    where_conditions.append("geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)")
                    params.extend([west, south, east, north])

            # 交通运输相关的fclass类型
            transport_fclasses = "('bus_station', 'bus_stop', 'subway_station', 'subway_entrance', 'railway_station', 'railway_halt', 'tram_stop', 'taxi', 'ferry_terminal', 'airport', 'aerodrome', 'helipad', 'airfield', 'terminal', 'halt', 'platform', 'public_transport', 'transport_hub', 'transport', 'station')"
            
            where_conditions.append(f"fclass IN {transport_fclasses}")
            where_clause = " AND ".join(where_conditions)
            
            params.append(limit)
            limit_param = f"${len(params)}"
            
            sql = f"""
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'geometry', ST_AsGeoJSON(geom)::jsonb,
                        'properties', jsonb_build_object(
                            'id', id,
                            'osm_id', COALESCE(osm_id, ''),
                            'name', COALESCE(name, ''),
                            'fclass', COALESCE(fclass, ''),
                            'type', COALESCE(type, ''),
                            'geometry_type', COALESCE(geometry_type, ''),
                            'source_table', COALESCE(source_table, '')
                        )
                    ) ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
                ), '[]'::jsonb)
            ) as geojson
            FROM (
                SELECT id, osm_id, name, fclass, type, geom, geometry_type, source_table
                FROM merged_osm_features
                WHERE {where_clause} AND geom IS NOT NULL AND ST_IsValid(geom) AND ST_AsGeoJSON(geom) IS NOT NULL
                ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
                LIMIT {limit_param}
            ) sub
            """
            
            result = await conn.fetchrow(sql, *params, timeout=DB_QUERY_TIMEOUT)
            
            if result and result['geojson']:
                geojson_data = result['geojson']
                if isinstance(geojson_data, str):
                    geojson_data = json.loads(geojson_data)
                
                # 清理GeoJSON数据
                geojson_data = clean_geojson_features(geojson_data)
                
                # 添加性能信息
                query_time = time.time() - start_time
                geojson_data['performance'] = {
                    "query_time": query_time,
                    "cache_hit": False,
                    "features_count": len(geojson_data.get('features', []))
                }
                
                # 慢查询监控
                if query_time > MONITORING_CONFIG.get('slow_query_threshold', 1.0):
                    logger.warning(f"慢查询 - /api/transport 耗时 {query_time:.2f}s, bbox={bbox}, limit={limit}, zoom={zoom}")
                
                await set_cache_value(cache_key, geojson_data, 'transport')
                return geojson_data
            else:
                empty_result = {
                    "type": "FeatureCollection", 
                    "features": [],
                    "performance": {
                        "query_time": time.time() - start_time,
                        "cache_hit": False
                    }
                }
                await set_cache_value(cache_key, empty_result, 'transport')
                return empty_result
                
    except Exception as e:
        import traceback
        error_msg = f"交通运输数据查询失败: {str(e)}"
        logger.error(error_msg)
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        return {
            "type": "FeatureCollection", 
            "features": [], 
            "error": error_msg,
            "performance": {
                "query_time": time.time() - start_time,
                "cache_hit": False
            }
        }

@router.get("/api/places")
async def get_places(
    bbox: Optional[str] = Query(None, description="边界框: west,south,east,north"),
    limit: int = Query(2000, description="最大返回数量"),
    zoom: Optional[int] = Query(None, description="缩放级别，用于LOD优化")
):
    """获取地名数据"""
    start_time = time.time()
    cache_key = get_cache_key("places", bbox=bbox, limit=limit, zoom=zoom)
    
    cached_result = await get_cache_value(cache_key, 'places')
    if cached_result:
        cached_result['performance'] = {
            "query_time": time.time() - start_time,
            "cache_hit": True
        }
        return cached_result

    pool = await get_db_connection(read_only=True)
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            where_conditions = []
            params = []

            if bbox:
                coords = bbox.split(',')
                if len(coords) == 4:
                    west, south, east, north = map(float, coords)
                    where_conditions.append("geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)")
                    params.extend([west, south, east, north])

            # 地名相关的fclass类型
            places_fclasses = "('city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'quarter', 'city_block', 'residential', 'locality', 'place', 'county', 'state', 'country', 'continent', 'island', 'islet', 'archipelago', 'region', 'administrative', 'boundary', 'border', 'district', 'municipality', 'province', 'territory', 'area', 'zone', 'ward', 'settlement', 'populated_place')"
            
            where_conditions.append(f"fclass IN {places_fclasses}")
            where_clause = " AND ".join(where_conditions)
            
            params.append(limit)
            limit_param = f"${len(params)}"
            
            sql = f"""
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'geometry', ST_AsGeoJSON(geom)::jsonb,
                        'properties', jsonb_build_object(
                            'id', id,
                            'osm_id', COALESCE(osm_id, ''),
                            'name', COALESCE(name, ''),
                            'fclass', COALESCE(fclass, ''),
                            'type', COALESCE(type, ''),
                            'geometry_type', COALESCE(geometry_type, ''),
                            'source_table', COALESCE(source_table, '')
                        )
                    ) ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
                ), '[]'::jsonb)
            ) as geojson
            FROM (
                SELECT id, osm_id, name, fclass, type, geom, geometry_type, source_table
                FROM merged_osm_features
                WHERE {where_clause} AND geom IS NOT NULL AND ST_IsValid(geom) AND ST_AsGeoJSON(geom) IS NOT NULL
                ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
                LIMIT {limit_param}
            ) sub
            """
            
            result = await conn.fetchrow(sql, *params, timeout=DB_QUERY_TIMEOUT)
            
            if result and result['geojson']:
                geojson_data = result['geojson']
                if isinstance(geojson_data, str):
                    geojson_data = json.loads(geojson_data)
                
                # 清理GeoJSON数据
                geojson_data = clean_geojson_features(geojson_data)
                
                # 添加性能信息
                query_time = time.time() - start_time
                geojson_data['performance'] = {
                    "query_time": query_time,
                    "cache_hit": False,
                    "features_count": len(geojson_data.get('features', []))
                }
                
                # 慢查询监控
                if query_time > MONITORING_CONFIG.get('slow_query_threshold', 1.0):
                    logger.warning(f"慢查询 - /api/places 耗时 {query_time:.2f}s, bbox={bbox}, limit={limit}, zoom={zoom}")
                
                await set_cache_value(cache_key, geojson_data, 'places')
                return geojson_data
            else:
                empty_result = {
                    "type": "FeatureCollection", 
                    "features": [],
                    "performance": {
                        "query_time": time.time() - start_time,
                        "cache_hit": False
                    }
                }
                await set_cache_value(cache_key, empty_result, 'places')
                return empty_result
                
    except Exception as e:
        import traceback
        error_msg = f"地名数据查询失败: {str(e)}"
        logger.error(error_msg)
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        return {
            "type": "FeatureCollection", 
            "features": [], 
            "error": error_msg,
            "performance": {
                "query_time": time.time() - start_time,
                "cache_hit": False
            }
        }

@router.get("/api/natural")
async def get_natural_features(
    bbox: Optional[str] = Query(None, description="边界框: west,south,east,north"),
    limit: int = Query(5000, description="最大返回数量"),
    zoom: Optional[int] = Query(None, description="缩放级别，用于LOD优化")
):
    """获取自然特征数据"""
    start_time = time.time()
    cache_key = get_cache_key("natural", bbox=bbox, limit=limit, zoom=zoom)
    
    cached_result = await get_cache_value(cache_key, 'natural')
    if cached_result:
        cached_result['performance'] = {
            "query_time": time.time() - start_time,
            "cache_hit": True
        }
        return cached_result

    pool = await get_db_connection(read_only=True)
    if not pool:
        raise HTTPException(status_code=500, detail="数据库连接失败")
    
    try:
        async with pool.acquire() as conn:
            where_conditions = []
            params = []

            if bbox:
                coords = bbox.split(',')
                if len(coords) == 4:
                    west, south, east, north = map(float, coords)
                    where_conditions.append("geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)")
                    params.extend([west, south, east, north])

            # 自然特征相关的fclass类型
            natural_fclasses = "('forest', 'wood', 'tree', 'park', 'nature_reserve', 'national_park', 'grass', 'grassland', 'meadow', 'wetland', 'swamp', 'marsh', 'bog', 'water', 'lake', 'pond', 'river', 'stream', 'spring', 'waterfall', 'beach', 'sand', 'rock', 'stone', 'cliff', 'peak', 'volcano', 'mountain', 'hill', 'valley', 'glacier', 'desert', 'scrub', 'heath', 'moor', 'fell', 'tundra', 'bare_rock', 'scree', 'shingle', 'cave_entrance', 'spring', 'natural', 'farmland', 'farmyard', 'orchard', 'vineyard', 'allotments', 'cemetery', 'grave_yard', 'recreation_ground', 'garden', 'village_green', 'common', 'conservation', 'protected_area')"
            
            where_conditions.append(f"fclass IN {natural_fclasses}")
            where_clause = " AND ".join(where_conditions)
            
            params.append(limit)
            limit_param = f"${len(params)}"
            
            sql = f"""
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'geometry', ST_AsGeoJSON(geom)::jsonb,
                        'properties', jsonb_build_object(
                            'id', id,
                            'osm_id', COALESCE(osm_id, ''),
                            'name', COALESCE(name, ''),
                            'fclass', COALESCE(fclass, ''),
                            'type', COALESCE(type, ''),
                            'geometry_type', COALESCE(geometry_type, ''),
                            'source_table', COALESCE(source_table, '')
                        )
                    ) ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
                ), '[]'::jsonb)
            ) as geojson
            FROM (
                SELECT id, osm_id, name, fclass, type, geom, geometry_type, source_table
                FROM merged_osm_features
                WHERE {where_clause} AND geom IS NOT NULL AND ST_IsValid(geom) AND ST_AsGeoJSON(geom) IS NOT NULL
                ORDER BY CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 2 END, id
                LIMIT {limit_param}
            ) sub
            """
            
            result = await conn.fetchrow(sql, *params, timeout=DB_QUERY_TIMEOUT)
            
            if result and result['geojson']:
                geojson_data = result['geojson']
                if isinstance(geojson_data, str):
                    geojson_data = json.loads(geojson_data)
                
                # 清理GeoJSON数据
                geojson_data = clean_geojson_features(geojson_data)
                
                # 添加性能信息
                query_time = time.time() - start_time
                geojson_data['performance'] = {
                    "query_time": query_time,
                    "cache_hit": False,
                    "features_count": len(geojson_data.get('features', []))
                }
                
                # 慢查询监控
                if query_time > MONITORING_CONFIG.get('slow_query_threshold', 1.0):
                    logger.warning(f"慢查询 - /api/natural 耗时 {query_time:.2f}s, bbox={bbox}, limit={limit}, zoom={zoom}")
                
                await set_cache_value(cache_key, geojson_data, 'natural')
                return geojson_data
            else:
                empty_result = {
                    "type": "FeatureCollection", 
                    "features": [],
                    "performance": {
                        "query_time": time.time() - start_time,
                        "cache_hit": False
                    }
                }
                await set_cache_value(cache_key, empty_result, 'natural')
                return empty_result
                
    except Exception as e:
        import traceback
        error_msg = f"自然特征数据查询失败: {str(e)}"
        logger.error(error_msg)
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        return {
            "type": "FeatureCollection", 
            "features": [], 
            "error": error_msg,
            "performance": {
                "query_time": time.time() - start_time,
                "cache_hit": False
            }
        } 