#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GIS 后端服务 - 业务逻辑模块（高并发优化版本）
包含数据库连接、Redis缓存、缩放策略、地理编码等核心业务逻辑
"""

import asyncio
import json
import time
import hashlib
import logging
import requests
import re
import urllib.parse
import os
from typing import Optional, List, Dict, Any, Union

# 动态导入配置，处理可能不存在的配置项
try:
    from config import (
        DB_CONFIG, ASYNC_DB_CONFIG, GOOGLE_GEOCODING_CONFIG, SEARCH_CONFIG
    )
    
    # 尝试导入新的高并发配置项，如果不存在则使用默认值
    try:
        from config import READ_REPLICA_CONFIGS, REDIS_CONFIG, CACHE_CONFIG, MONITORING_CONFIG
    except ImportError:
        # 默认配置
        READ_REPLICA_CONFIGS = []
        REDIS_CONFIG = {
            'host': 'localhost',
            'port': 6379,
            'db': 0,
            'password': None,
            'socket_timeout': 5,
            'connection_pool_max_connections': 100,
            'decode_responses': True,
            'health_check_interval': 30
        }
        CACHE_CONFIG = {
            'memory_cache': {'max_size': 1000, 'ttl': 300},
            'redis_cache': {
                'buildings_ttl': 3600,
                'land_polygons_ttl': 7200,
                'roads_ttl': 1800,
                'pois_ttl': 1800,
                'max_geojson_size': 10 * 1024 * 1024,
            },
            'precompute_cache': {
                'enabled': True,
                'zoom_levels': [6, 8, 10, 12, 14, 16, 18],
                'update_interval': 3600,
            }
        }
        MONITORING_CONFIG = {
            'enabled': True,
            'slow_query_threshold': 1.0,
            'enable_profiling': True
        }
        
except ImportError:
    # 如果config.py不存在，使用默认配置
    DB_CONFIG = {
        'host': 'localhost',
        'port': 5432,
        'database': 'gisdb',
        'user': 'postgres',
        'password': 'xiaotao4vip'
    }
    
    ASYNC_DB_CONFIG = {
        'host': 'localhost',
        'port': 5432,
        'database': 'gisdb',
        'user': 'postgres',
        'password': 'xiaotao4vip',
        'min_size': 100,
        'max_size': 500,
        'max_queries': 100000,
        'max_inactive_connection_lifetime': 600,
        'command_timeout': 120,
        'server_settings': {
            'application_name': 'gis_map_service_hc',
            'timezone': 'UTC'
        }
    }
    
    READ_REPLICA_CONFIGS = []
    REDIS_CONFIG = {
        'host': 'localhost',
        'port': 6379,
        'db': 0,
        'password': None,
        'socket_timeout': 5,
        'connection_pool_max_connections': 100,
        'decode_responses': True,
        'health_check_interval': 30
    }
    
    CACHE_CONFIG = {
        'memory_cache': {'max_size': 1000, 'ttl': 300},
        'redis_cache': {
            'buildings_ttl': 3600,
            'land_polygons_ttl': 7200,
            'roads_ttl': 1800,
            'pois_ttl': 1800,
            'max_geojson_size': 10 * 1024 * 1024,
        }
    }
    
    GOOGLE_GEOCODING_CONFIG = {
        'api_key': os.getenv('GOOGLE_API_KEY', 'YOUR_GOOGLE_API_KEY_HERE'),
        'base_url': 'https://maps.googleapis.com/maps/api/geocode/json',
        'language': os.getenv('GOOGLE_LANGUAGE', 'id,en'),
        'region': os.getenv('GOOGLE_REGION', 'id'),
        'timeout': int(os.getenv('GOOGLE_TIMEOUT', '5')),
        'max_retries': int(os.getenv('GOOGLE_MAX_RETRIES', '3')),
        'backoff_factor': 0.3
    }
    
    SEARCH_CONFIG = {
        'max_results': 50,
        'radius_meters': 100,
        'max_distance': 20000
    }
    
    MONITORING_CONFIG = {
        'enabled': True,
        'slow_query_threshold': 1.0,
        'enable_profiling': True
    }

# 配置日志
logger = logging.getLogger("gis_backend")

# 统一数据库查询超时配置
DB_QUERY_TIMEOUT = 120.0

# 全局连接池和缓存
db_pool = None
read_pools = []
redis_client = None
memory_cache = {}
cache_stats = {'hits': 0, 'misses': 0, 'redis_hits': 0, 'redis_misses': 0}

# ==============================================================================
# GeoJSON数据清理工具
# ==============================================================================

def clean_geojson_features(geojson):
    """移除 geometry 为 null 或 'null' 的 feature"""
    if not geojson or "features" not in geojson:
        return geojson
    
    cleaned_features = []
    for f in geojson["features"]:
        # 检查feature本身是否有效
        if not f or not isinstance(f, dict):
            continue
            
        # 检查geometry是否有效
        geometry = f.get("geometry")
        if (geometry is None or 
            geometry == "null" or 
            geometry == "" or
            (isinstance(geometry, dict) and not geometry) or
            (isinstance(geometry, str) and geometry.strip() == "")):
            continue
            
        # 如果geometry是字符串且为JSON，尝试解析
        if isinstance(geometry, str):
            try:
                import json
                geometry = json.loads(geometry)
                f["geometry"] = geometry
            except:
                continue
                
        # 检查解析后的geometry是否有效
        if (not isinstance(geometry, dict) or
            not geometry.get("type") or
            not geometry.get("coordinates")):
            continue
            
        cleaned_features.append(f)
    
    geojson["features"] = cleaned_features
    return geojson

# ==============================================================================
# 高并发数据库连接管理
# ==============================================================================

async def init_db_pool():
    """初始化数据库连接池 - 高并发优化"""
    global db_pool, read_pools
    try:
        # 动态导入asyncpg
        try:
            import asyncpg
        except ImportError:
            logger.error("asyncpg未安装，请运行: pip install asyncpg")
            raise
        
        # 创建主数据库连接池（写操作）
        db_pool = await asyncpg.create_pool(**ASYNC_DB_CONFIG)
        logger.info(f"主数据库连接池已创建: min_size={ASYNC_DB_CONFIG['min_size']}, max_size={ASYNC_DB_CONFIG['max_size']}")
        
        # 创建读副本连接池
        for i, read_config in enumerate(READ_REPLICA_CONFIGS):
            read_pool = await asyncpg.create_pool(**read_config)
            read_pools.append(read_pool)
            logger.info(f"读副本{i+1}连接池已创建: min_size={read_config['min_size']}, max_size={read_config['max_size']}")
        
        # 初始化Redis缓存
        await init_redis_cache()
        
        return db_pool
        
    except Exception as e:
        logger.error(f"数据库连接池创建失败: {e}")
        raise

async def init_redis_cache():
    """初始化Redis缓存连接"""
    global redis_client
    try:
        try:
            import redis.asyncio as redis
        except ImportError:
            logger.warning("redis未安装，请运行: pip install redis")
            redis_client = None
            return
        
        redis_client = redis.Redis(
            host=REDIS_CONFIG['host'],
            port=REDIS_CONFIG['port'],
            db=REDIS_CONFIG['db'],
            password=REDIS_CONFIG['password'],
            socket_timeout=REDIS_CONFIG['socket_timeout'],
            decode_responses=REDIS_CONFIG['decode_responses'],
            health_check_interval=REDIS_CONFIG['health_check_interval']
        )
        
        # 测试连接
        await redis_client.ping()
        logger.info("Redis缓存连接已建立")
        
    except Exception as e:
        logger.warning(f"Redis连接失败: {e}")
        redis_client = None

async def get_db_connection(read_only=False):
    """获取数据库连接 - 支持读写分离"""
    global db_pool, read_pools
    
    # 🔥 关键修复：不要在这里创建连接池！
    # 连接池应该在应用启动时创建一次，而不是每次请求都创建
    if db_pool is None:
        raise Exception("数据库连接池未初始化，请确保在应用启动时调用 init_db_pool()")
    
    # 读操作使用读副本
    if read_only and read_pools:
        # 简单轮询负载均衡
        pool_index = int(time.time()) % len(read_pools)
        return read_pools[pool_index]
    
    # 写操作使用主库
    return db_pool

def get_db_connection_sync():
    """获取数据库连接 (同步版本)"""
    try:
        import psycopg2
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        logger.error(f"同步数据库连接失败: {e}")
        return None

async def close_db_pool():
    """关闭数据库连接池"""
    global db_pool, read_pools, redis_client
    
    if db_pool:
        await db_pool.close()
        logger.info("主数据库连接池已关闭")
    
    for i, read_pool in enumerate(read_pools):
        if read_pool:
            await read_pool.close()
            logger.info(f"读副本{i+1}连接池已关闭")
    
    if redis_client:
        await redis_client.close()
        logger.info("Redis连接已关闭")

# ==============================================================================
# 多层缓存管理 - 高并发优化
# ==============================================================================

async def get_cache_value(key: str, cache_type: str = 'buildings') -> Optional[Dict]:
    """获取缓存值 - 支持内存+Redis多层缓存"""
    global cache_stats
    
    # 1. 检查内存缓存
    if key in memory_cache:
        timestamp, value = memory_cache[key]
        if time.time() - timestamp < CACHE_CONFIG['memory_cache']['ttl']:
            cache_stats['hits'] += 1
            return value
        else:
            # 过期删除
            del memory_cache[key]
    
    # 2. 检查Redis缓存
    if redis_client:
        try:
            redis_value = await redis_client.get(key)
            if redis_value:
                cache_stats['redis_hits'] += 1
                value = json.loads(redis_value)
                
                # 回写到内存缓存
                if len(memory_cache) < CACHE_CONFIG['memory_cache']['max_size']:
                    memory_cache[key] = (time.time(), value)
                
                return value
            else:
                cache_stats['redis_misses'] += 1
        except Exception as e:
            logger.warning(f"Redis获取失败: {e}")
    
    cache_stats['misses'] += 1
    return None

async def set_cache_value(key: str, value: Dict, cache_type: str = 'buildings'):
    """设置缓存值 - 支持内存+Redis多层缓存"""
    try:
        # 1. 设置内存缓存
        if len(memory_cache) < CACHE_CONFIG['memory_cache']['max_size']:
            memory_cache[key] = (time.time(), value)
        
        # 2. 设置Redis缓存
        if redis_client:
            ttl = CACHE_CONFIG['redis_cache'].get(f'{cache_type}_ttl', 3600)
            
            # 检查大小限制
            json_str = json.dumps(value)
            if len(json_str.encode()) <= CACHE_CONFIG['redis_cache']['max_geojson_size']:
                await redis_client.setex(key, ttl, json_str)
            else:
                logger.warning(f"缓存值过大，跳过Redis缓存: {len(json_str.encode())} bytes")
                
    except Exception as e:
        logger.warning(f"设置缓存失败: {e}")

def get_cache_key(endpoint: str, **params) -> str:
    """生成缓存键 - 优化版本"""
    # 移除空值参数
    filtered_params = {k: v for k, v in params.items() if v is not None}
    
    # 对bbox进行标准化（减少缓存碎片）
    if 'bbox' in filtered_params:
        bbox = filtered_params['bbox']
        if isinstance(bbox, str):
            coords = [float(x) for x in bbox.split(',')]
            # 标准化到小数点后4位
            normalized_bbox = ','.join([f"{x:.4f}" for x in coords])
            filtered_params['bbox'] = normalized_bbox
    
    param_str = json.dumps(filtered_params, sort_keys=True)
    cache_hash = hashlib.md5(param_str.encode()).hexdigest()
    return f"{endpoint}:{cache_hash}"

def is_cache_valid(cache_key: str) -> bool:
    """检查缓存是否有效 - 废弃，使用get_cache_value"""
    return cache_key in memory_cache

def clear_cache():
    """清理所有缓存"""
    global memory_cache, cache_stats
    
    # 清理内存缓存
    memory_cache.clear()
    
    # 清理Redis缓存（可选）
    if redis_client:
        try:
            asyncio.create_task(redis_client.flushdb())
        except Exception as e:
            logger.warning(f"清理Redis缓存失败: {e}")
    
    # 重置统计
    cache_stats = {'hits': 0, 'misses': 0, 'redis_hits': 0, 'redis_misses': 0}
    logger.info("缓存已清理")

def get_cache_stats() -> Dict:
    """获取缓存统计信息"""
    total_requests = cache_stats['hits'] + cache_stats['misses']
    memory_hit_rate = (cache_stats['hits'] / total_requests * 100) if total_requests > 0 else 0
    
    redis_requests = cache_stats['redis_hits'] + cache_stats['redis_misses']
    redis_hit_rate = (cache_stats['redis_hits'] / redis_requests * 100) if redis_requests > 0 else 0
    
    return {
        'memory_cache': {
            'size': len(memory_cache),
            'max_size': CACHE_CONFIG['memory_cache']['max_size'],
            'hit_rate': f"{memory_hit_rate:.2f}%",
            'hits': cache_stats['hits'],
            'misses': cache_stats['misses']
        },
        'redis_cache': {
            'available': redis_client is not None,
            'hit_rate': f"{redis_hit_rate:.2f}%",
            'hits': cache_stats['redis_hits'],
            'misses': cache_stats['redis_misses']
        },
        'total_requests': total_requests
    }

# ==============================================================================
# 缩放级别策略函数 - 高并发优化
# ==============================================================================

def get_zoom_strategy(zoom):
    """根据缩放级别返回加载策略 - 优化版本"""
    if zoom is None or zoom < 6:
        return {
            'load_data': False,
            'reason': 'zoom_too_low',
            'max_features': 0,
            'simplify_tolerance': 0,
            'attributes': [],
            'cache_ttl': 7200  # 2小时
        }
    elif zoom < 10:  # Z6-Z9: 超简化数据
        return {
            'load_data': True,
            'reason': 'overview_data',
            'max_features': 5000,  # 增加特征数量
            'simplify_tolerance': 100,  # 100米简化
            'attributes': ['id', 'osm_id', 'name', 'fclass', 'type', 'geometry_type', 'source_table'],
            'cache_ttl': 3600  # 1小时
        }
    elif zoom < 12:  # Z10-Z11: 简化数据
        return {
            'load_data': True,
            'reason': 'simplified_data',
            'max_features': 15000,  # 增加特征数量
            'simplify_tolerance': 20,  # 20米简化
            'attributes': ['id', 'osm_id', 'name', 'fclass', 'type', 'geometry_type', 'source_table'],
            'cache_ttl': 1800  # 30分钟
        }
    elif zoom < 15:  # Z12-Z14: 详细数据
        return {
            'load_data': True,
            'reason': 'detailed_data',
            'max_features': 30000,  # 增加特征数量
            'simplify_tolerance': 5,   # 5米简化
            'attributes': ['id', 'osm_id', 'name', 'fclass', 'type', 'code', 'geometry_type', 'source_table'],
            'cache_ttl': 900   # 15分钟
        }
    else:  # Z15+: 全精度数据
        return {
            'load_data': True,
            'reason': 'full_precision',
            'max_features': 50000,  # 增加特征数量
            'simplify_tolerance': 1,   # 1米简化
            'attributes': ['id', 'osm_id', 'name', 'fclass', 'type', 'code', 'geometry_type', 'source_table'],
            'cache_ttl': 300   # 5分钟
        }

def get_land_polygon_zoom_strategy(zoom):
    """根据缩放级别返回陆地多边形加载策略 - 优化版本"""
    if zoom is None or zoom < 4:
        return {
            'load_data': False,
            'reason': 'zoom_too_low',
            'max_features': 0,
            'simplify_tolerance': 0,
            'cache_ttl': 7200
        }
    elif zoom < 8:  # Z4-Z7: 极简化数据
        return {
            'load_data': True,
            'reason': 'extremely_simplified',
            'max_features': 2000,  # 增加特征数量
            'simplify_tolerance': 2000,  # 2公里简化
            'cache_ttl': 7200
        }
    elif zoom < 10:  # Z8-Z9: 高度简化数据
        return {
            'load_data': True,
            'reason': 'highly_simplified',
            'max_features': 5000,  # 增加特征数量
            'simplify_tolerance': 1000,  # 1公里简化
            'cache_ttl': 3600
        }
    elif zoom < 12:  # Z10-Z11: 中度简化数据
        return {
            'load_data': True,
            'reason': 'moderately_simplified',
            'max_features': 8000,  # 增加特征数量
            'simplify_tolerance': 200,  # 200米简化
            'cache_ttl': 1800
        }
    elif zoom < 14:  # Z12-Z13: 轻度简化数据
        return {
            'load_data': True,
            'reason': 'lightly_simplified',
            'max_features': 6000,  # 平衡性能
            'simplify_tolerance': 50,   # 50米简化
            'cache_ttl': 900
        }
    else:  # Z14+: 高精度数据
        return {
            'load_data': True,
            'reason': 'high_precision',
            'max_features': 3000,  # 控制数量
            'simplify_tolerance': 10,   # 10米简化
            'cache_ttl': 300
        }

def get_roads_zoom_strategy(zoom):
    """根据缩放级别返回道路网络加载策略 - 优化版本"""
    if zoom is None or zoom < 9:  # 降低最低缩放级别
        return {
            'load_data': False,
            'reason': 'zoom_too_low',
            'max_features': 0,
            'simplify_tolerance': 0,
            'cache_ttl': 7200
        }
    elif zoom < 11:  # Z9-Z10: 主要道路
        return {
            'load_data': True,
            'reason': 'major_roads_only',
            'max_features': 5000,  # 增加特征数量
            'simplify_tolerance': 100,  # 100米简化
            'road_filter': "fclass IN ('primary', 'trunk', 'motorway', 'motorway_link', 'trunk_link', 'primary_link')",
            'cache_ttl': 3600
        }
    elif zoom < 13:  # Z11-Z12: 主要道路和次要道路
        return {
            'load_data': True,
            'reason': 'major_and_secondary_roads',
            'max_features': 10000,  # 增加特征数量
            'simplify_tolerance': 50,  # 50米简化
            'road_filter': "fclass IN ('primary', 'trunk', 'motorway', 'motorway_link', 'trunk_link', 'primary_link', 'secondary', 'secondary_link')",
            'cache_ttl': 1800
        }
    elif zoom < 15:  # Z13-Z14: 包含三级道路
        return {
            'load_data': True,
            'reason': 'all_major_roads',
            'max_features': 20000,  # 增加特征数量
            'simplify_tolerance': 20,  # 20米简化
            'road_filter': "fclass NOT IN ('track', 'path', 'footway', 'cycleway', 'bridleway', 'steps')",
            'cache_ttl': 900
        }
    else:  # Z15+: 所有道路
        return {
            'load_data': True,
            'reason': 'all_roads',
            'max_features': 30000,  # 增加特征数量
            'simplify_tolerance': 10,  # 10米简化
            'road_filter': "1=1",  # 所有道路
            'cache_ttl': 300
        }

# ==============================================================================
# 地理编码工具函数 - 高并发优化
# ==============================================================================

def is_coordinate_string(query):
    """检查输入是否为坐标格式"""
    coord_patterns = [
        r'^-?\d+\.?\d*,\s*-?\d+\.?\d*$',
        r'^\(-?\d+\.?\d*,\s*-?\d+\.?\d*\)$',
        r'^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$',
    ]
    
    for pattern in coord_patterns:
        if re.match(pattern, query.strip()):
            return True
    return False

def parse_coordinates(query):
    """解析坐标字符串"""
    query = query.strip().replace('(', '').replace(')', '')
    parts = query.split(',')
    if len(parts) == 2:
        try:
            lng = float(parts[0].strip())
            lat = float(parts[1].strip())
            
            # 验证坐标范围
            if lat < -90 or lat > 90 or lng < -180 or lng > 180:
                return None, None
            
            return lat, lng
        except ValueError:
            return None, None
    return None, None

# ==============================================================================
# Google地理编码服务 - 高并发优化
# ==============================================================================

async def google_geocode(address: str) -> Optional[Dict]:
    """使用Google Geocoding API获取地址的坐标 - 高并发优化版本"""
    start_time = time.time()
    
    try:
        logger.info(f"🌐 开始Google地理编码请求 - 地址: {address}")
        
        # 检查缓存
        cache_key = f"geocode:{hashlib.md5(address.encode()).hexdigest()}"
        cached_result = await get_cache_value(cache_key, 'geocode')
        if cached_result:
            elapsed_time = (time.time() - start_time) * 1000
            logger.info(f"✅ Google地理编码缓存命中 - 地址: {address}, 耗时: {elapsed_time:.2f}ms")
            logger.debug(f"📍 缓存结果: lat={cached_result.get('lat')}, lng={cached_result.get('lng')}, address={cached_result.get('formatted_address')}")
            return cached_result
        
        # 检查API密钥
        if not GOOGLE_GEOCODING_CONFIG['api_key'] or GOOGLE_GEOCODING_CONFIG['api_key'] == 'YOUR_GOOGLE_API_KEY_HERE':
            raise Exception("Google API密钥未配置")
        
        try:
            import aiohttp
        except ImportError:
            logger.error("aiohttp未安装，请运行: pip install aiohttp")
            return None
        
        params = {
            'address': address,
            'key': GOOGLE_GEOCODING_CONFIG['api_key'],
            'language': GOOGLE_GEOCODING_CONFIG['language'],
            'region': GOOGLE_GEOCODING_CONFIG['region']
        }
        
        # 记录请求参数（隐藏API密钥）
        safe_params = params.copy()
        safe_params['key'] = f"{params['key'][:10]}...{params['key'][-5:]}" if len(params['key']) > 15 else "***"
        logger.info(f"🔍 Google地理编码请求参数: {safe_params}")
        
        # 支持重试机制
        max_retries = GOOGLE_GEOCODING_CONFIG.get('max_retries', 3)
        backoff_factor = GOOGLE_GEOCODING_CONFIG.get('backoff_factor', 0.3)
        
        for attempt in range(max_retries):
            try:
                request_start = time.time()
                async with aiohttp.ClientSession(
                    timeout=aiohttp.ClientTimeout(total=GOOGLE_GEOCODING_CONFIG['timeout'])
                ) as session:
                    async with session.get(
                        GOOGLE_GEOCODING_CONFIG['base_url'],
                        params=params
                    ) as response:
                        request_time = (time.time() - request_start) * 1000
                        
                        if response.status == 200:
                            data = await response.json()
                            
                            # 记录API响应状态
                            logger.info(f"📡 Google API响应: status={data.get('status')}, 请求耗时: {request_time:.2f}ms")
                            
                            if data.get('status') == 'OK':
                                results = data.get('results', [])
                                if results:
                                    location = results[0]['geometry']['location']
                                    result = {
                                        'lat': location['lat'],
                                        'lng': location['lng'],
                                        'formatted_address': results[0].get('formatted_address', address),
                                        'google_result': results[0]
                                    }
                                    
                                    # 记录成功结果
                                    total_time = (time.time() - start_time) * 1000
                                    logger.info(f"✅ Google地理编码成功 - 地址: {address}")
                                    logger.info(f"📍 结果: lat={result['lat']}, lng={result['lng']}, formatted_address={result['formatted_address']}")
                                    logger.info(f"⏱️  总耗时: {total_time:.2f}ms (API请求: {request_time:.2f}ms)")
                                    
                                    # 缓存结果
                                    await set_cache_value(cache_key, result, 'geocode')
                                    return result
                                else:
                                    raise Exception("未找到该地址的坐标信息")
                            else:
                                error_msg = f"Google Geocoding API错误: {data.get('status')}"
                                if data.get('error_message'):
                                    error_msg += f" - {data.get('error_message')}"
                                raise Exception(error_msg)
                        else:
                            raise Exception(f"HTTP错误: {response.status}")
                            
            except Exception as e:
                if attempt == max_retries - 1:
                    raise e
                retry_delay = backoff_factor * (2 ** attempt)
                logger.warning(f"⚠️  Google地理编码重试 {attempt + 1}/{max_retries} - 错误: {e}, {retry_delay:.2f}秒后重试")
                await asyncio.sleep(retry_delay)
        
        return None
        
    except Exception as e:
        total_time = (time.time() - start_time) * 1000
        logger.error(f"❌ Google地理编码失败 - 地址: {address}, 错误: {e}, 耗时: {total_time:.2f}ms")
        return None

# 保留原有的同步Google地理编码函数以兼容性
def google_geocode_sync(address: str) -> Optional[Dict]:
    """同步版本的Google地理编码"""
    start_time = time.time()
    
    try:
        logger.info(f"🌐 开始Google地理编码请求（同步） - 地址: {address}")
        
        # 使用requests的同步版本
        cache_key = f"geocode:{hashlib.md5(address.encode()).hexdigest()}"
        
        # 检查内存缓存
        if cache_key in memory_cache:
            timestamp, result = memory_cache[cache_key]
            if time.time() - timestamp < 3600:  # 1小时缓存
                elapsed_time = (time.time() - start_time) * 1000
                logger.info(f"✅ Google地理编码缓存命中（同步） - 地址: {address}, 耗时: {elapsed_time:.2f}ms")
                logger.debug(f"📍 缓存结果: lat={result.get('lat')}, lng={result.get('lng')}, address={result.get('formatted_address')}")
                return result
        
        params = {
            'address': address,
            'key': GOOGLE_GEOCODING_CONFIG['api_key'],
            'language': GOOGLE_GEOCODING_CONFIG['language'],
            'region': GOOGLE_GEOCODING_CONFIG['region']
        }
        
        # 记录请求参数（隐藏API密钥）
        safe_params = params.copy()
        safe_params['key'] = f"{params['key'][:10]}...{params['key'][-5:]}" if len(params['key']) > 15 else "***"
        logger.info(f"🔍 Google地理编码请求参数（同步）: {safe_params}")
        
        request_start = time.time()
        response = requests.get(
            GOOGLE_GEOCODING_CONFIG['base_url'],
            params=params,
            timeout=GOOGLE_GEOCODING_CONFIG['timeout']
        )
        request_time = (time.time() - request_start) * 1000
        
        if response.status_code == 200:
            data = response.json()
            
            # 记录API响应状态
            logger.info(f"📡 Google API响应（同步）: status={data.get('status')}, 请求耗时: {request_time:.2f}ms")
            
            if data.get('status') == 'OK':
                results = data.get('results', [])
                if results:
                    location = results[0]['geometry']['location']
                    result = {
                        'lat': location['lat'],
                        'lng': location['lng'],
                        'formatted_address': results[0].get('formatted_address', address),
                        'google_result': results[0]
                    }
                    
                    # 记录成功结果
                    total_time = (time.time() - start_time) * 1000
                    logger.info(f"✅ Google地理编码成功（同步） - 地址: {address}")
                    logger.info(f"📍 结果: lat={result['lat']}, lng={result['lng']}, formatted_address={result['formatted_address']}")
                    logger.info(f"⏱️  总耗时: {total_time:.2f}ms (API请求: {request_time:.2f}ms)")
                    
                    # 缓存结果
                    memory_cache[cache_key] = (time.time(), result)
                    return result
                else:
                    logger.warning(f"⚠️  Google地理编码无结果（同步） - 地址: {address}")
            else:
                error_msg = f"Google Geocoding API错误: {data.get('status')}"
                if data.get('error_message'):
                    error_msg += f" - {data.get('error_message')}"
                logger.error(f"❌ {error_msg}")
        else:
            logger.error(f"❌ HTTP错误（同步）: {response.status_code}")
                    
        return None
        
    except Exception as e:
        total_time = (time.time() - start_time) * 1000
        logger.error(f"❌ 同步Google地理编码失败 - 地址: {address}, 错误: {e}, 耗时: {total_time:.2f}ms")
        return None

# 保留原有的反向地理编码函数
def google_reverse_geocode(lat, lng):
    """使用Google Geocoding API进行反向地理编码获取地址信息"""
    start_time = time.time()
    
    try:
        logger.info(f"🔍 开始Google反向地理编码请求 - 坐标: ({lat}, {lng})")
        
        if not GOOGLE_GEOCODING_CONFIG['api_key'] or GOOGLE_GEOCODING_CONFIG['api_key'] == 'YOUR_GOOGLE_API_KEY_HERE':
            logger.error("❌ Google API密钥未配置")
            return None
        
        # 检查缓存
        cache_key = f"reverse_geocode:{lat:.6f}:{lng:.6f}"
        if cache_key in memory_cache:
            timestamp, result = memory_cache[cache_key]
            if time.time() - timestamp < 3600:  # 1小时缓存
                elapsed_time = (time.time() - start_time) * 1000
                logger.info(f"✅ Google反向地理编码缓存命中 - 坐标: ({lat}, {lng}), 耗时: {elapsed_time:.2f}ms")
                logger.debug(f"📍 缓存结果: name={result.get('name')}, place_id={result.get('place_id')}")
                return result
        
        params = {
            'latlng': f"{lat},{lng}",
            'key': GOOGLE_GEOCODING_CONFIG['api_key'],
            'language': GOOGLE_GEOCODING_CONFIG['language'],
            'region': GOOGLE_GEOCODING_CONFIG['region'],
            'result_type': 'establishment|point_of_interest|premise'
        }
        
        # 记录请求参数（隐藏API密钥）
        safe_params = params.copy()
        safe_params['key'] = f"{params['key'][:10]}...{params['key'][-5:]}" if len(params['key']) > 15 else "***"
        logger.info(f"🔍 Google反向地理编码请求参数: {safe_params}")
        
        request_start = time.time()
        response = requests.get(
            GOOGLE_GEOCODING_CONFIG['base_url'],
            params=params,
            timeout=GOOGLE_GEOCODING_CONFIG['timeout']
        )
        request_time = (time.time() - request_start) * 1000
        
        if response.status_code == 200:
            data = response.json()
            
            # 记录API响应状态
            logger.info(f"📡 Google反向地理编码API响应: status={data.get('status')}, 请求耗时: {request_time:.2f}ms")
            
            if data.get('status') == 'OK':
                results = data.get('results', [])
                if results:
                    # 提取建筑名称
                    building_name = None
                    address_components = results[0].get('address_components', [])
                    for component in address_components:
                        types = component.get('types', [])
                        if 'establishment' in types or 'point_of_interest' in types:
                            building_name = component.get('long_name', '')
                            break
                        elif 'premise' in types:
                            building_name = component.get('long_name', '')
                            break
                    
                    if not building_name:
                        formatted_address = results[0].get('formatted_address', '')
                        if formatted_address and ',' in formatted_address:
                            building_name = formatted_address.split(',')[0].strip()
                        else:
                            building_name = formatted_address
                    
                    if building_name and len(building_name) > 95:
                        building_name = building_name[:95] + "..."
                    
                    if building_name and len(building_name.strip()) >= 3:
                        address_info = {
                            'name': building_name,
                            'place_id': results[0].get('place_id', ''),
                            'types': results[0].get('types', [])
                        }
                        
                        # 记录成功结果
                        total_time = (time.time() - start_time) * 1000
                        logger.info(f"✅ Google反向地理编码成功 - 坐标: ({lat}, {lng})")
                        logger.info(f"📍 结果: name={address_info['name']}, place_id={address_info['place_id']}")
                        logger.info(f"⏱️  总耗时: {total_time:.2f}ms (API请求: {request_time:.2f}ms)")
                        
                        # 缓存结果
                        memory_cache[cache_key] = (time.time(), address_info)
                        return address_info
                    else:
                        logger.warning(f"⚠️  Google反向地理编码结果无效 - 坐标: ({lat}, {lng}), 名称: {building_name}")
                else:
                    logger.warning(f"⚠️  Google反向地理编码无结果 - 坐标: ({lat}, {lng})")
            else:
                error_msg = f"Google反向地理编码API错误: {data.get('status')}"
                if data.get('error_message'):
                    error_msg += f" - {data.get('error_message')}"
                logger.error(f"❌ {error_msg}")
        else:
            logger.error(f"❌ Google反向地理编码HTTP错误: {response.status_code}")
        
        return None
        
    except Exception as e:
        total_time = (time.time() - start_time) * 1000
        logger.error(f"❌ Google反向地理编码失败 - 坐标: ({lat}, {lng}), 错误: {e}, 耗时: {total_time:.2f}ms")
        return None

def get_google_building_name(lat, lng):
    """获取Google建筑名称"""
    try:
        logger.debug(f"🏢 获取Google建筑名称 - 坐标: ({lat}, {lng})")
        address_info = google_reverse_geocode(lat, lng)
        if address_info and address_info.get('name'):
            logger.debug(f"📍 获取到建筑名称: {address_info['name']}")
            return address_info['name']
        logger.debug(f"⚠️  未获取到建筑名称 - 坐标: ({lat}, {lng})")
        return None
    except Exception as e:
        logger.error(f"❌ 获取Google建筑名称失败 - 坐标: ({lat}, {lng}), 错误: {e}")
        return None 