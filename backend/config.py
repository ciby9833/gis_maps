# -*- coding: utf-8 -*-
"""
后端配置文件 - 高并发优化版本
支持环境变量配置，提高安全性
3"""

import os
from zoom_strategy_config import LAYER_ZOOM_STRATEGIES, HIGH_ZOOM_STRATEGY, ZOOM_STRATEGY_DESCRIPTION

# 加载 .env 文件
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # 如果没有安装 python-dotenv，继续使用系统环境变量
    pass

# 统一的环境变量函数
def get_env(key: str, default=None, required=False, cast=None):
    """
    获取环境变量的统一函数
    
    Args:
        key: 环境变量名
        default: 默认值
        required: 是否必需
        cast: 类型转换函数
    
    Returns:
        转换后的环境变量值
    """
    value = os.getenv(key, default)
    if required and not value:
        raise ValueError(f"必需的环境变量 {key} 未设置")
    
    if value is None:
        return default
    
    if cast is None:
        return value
    
    try:
        return cast(value)
    except (ValueError, TypeError) as e:
        print(f"警告: 环境变量 {key}={value} 转换失败，使用默认值 {default}: {e}")
        return default

# 便捷函数，保持向后兼容
def get_env_var(key: str, default=None, required=False):
    """获取字符串类型环境变量"""
    return get_env(key, default, required, str)

def get_env_bool(key: str, default=False):
    """获取布尔类型环境变量"""
    return get_env(key, default, False, lambda v: str(v).lower() in ('true', '1', 'yes', 'on'))

def get_env_int(key: str, default=0):
    """获取整数类型环境变量"""
    try:
        value = os.getenv(key)
        return int(value) if value is not None else default
    except ValueError:
        return default

def get_env_float(key: str, default=0.0):
    """获取浮点数类型环境变量"""
    try:
        value = os.getenv(key)
        return float(value) if value is not None else default
    except ValueError:
        return default

# 连接池总体配置 - 避免连接数超限
MAX_TOTAL_CONNECTIONS = get_env_int('MAX_TOTAL_CONNECTIONS', 50)
CONNECTION_SAFETY_MARGIN = get_env_int('CONNECTION_SAFETY_MARGIN', 10)

# PostgreSQL 数据库配置 - 从环境变量读取
DB_CONFIG = {
    'host': get_env_var('DB_HOST', 'localhost'),
    'port': get_env_int('DB_PORT', 5432),
    'database': get_env_var('DB_NAME', 'gisdb'),
    'user': get_env_var('DB_USER', 'postgres'),
    'password': get_env_var('DB_PASSWORD', required=True)
}

# 动态计算连接池大小
def calculate_connection_pool_sizes():
    """
    动态计算连接池大小，确保不超过总连接数限制
    """
    available_connections = MAX_TOTAL_CONNECTIONS - CONNECTION_SAFETY_MARGIN
    
    # 计算写连接池大小（主要用于异步操作）
    write_pool_size = min(
        get_env_int('ASYNC_DB_MAX_SIZE', 10),
        available_connections // 2  # 分配一半给写操作
    )
    
    # 计算读连接池大小（用于读副本）
    read_replicas = get_env_var('DB_READ_REPLICAS', 'localhost:5432')
    replica_count = len(read_replicas.split(',')) if read_replicas else 1
    read_pool_size = min(
        get_env_int('READ_DB_MAX_SIZE', 8),
        (available_connections - write_pool_size) // max(1, replica_count)
    )
    
    return {
        'write_pool_size': max(2, write_pool_size),  # 至少2个写连接
        'read_pool_size': max(2, read_pool_size),    # 至少2个读连接
        'min_pool_size': 2
    }

# 计算连接池大小
pool_sizes = calculate_connection_pool_sizes()

# 异步数据库连接池配置 - 高并发优化，从环境变量读取
ASYNC_DB_CONFIG = {
    'host': get_env_var('DB_HOST', 'localhost'),
    'port': get_env_int('DB_PORT', 5432),
    'database': get_env_var('DB_NAME', 'gisdb'),
    'user': get_env_var('DB_USER', 'postgres'),
    'password': get_env_var('DB_PASSWORD', required=True),
    'min_size': pool_sizes['min_pool_size'],
    'max_size': pool_sizes['write_pool_size'],
    'max_queries': 100000,  # 每连接最大查询数
    'max_inactive_connection_lifetime': 600,  # 连接最大空闲时间(秒)
    'command_timeout': 120,  # 查询超时时间(秒) - 增加到120秒支持复杂PostGIS查询
    'server_settings': {
        'application_name': 'gis_map_service_hc',  # hc = high_concurrency
        'timezone': 'UTC',
        'statement_timeout': '120s',  # SQL语句超时
        'lock_timeout': '30s',       # 锁超时
        'idle_in_transaction_session_timeout': '300s',  # 事务空闲超时
        'tcp_keepalives_idle': '600',     # TCP keepalive设置
        'tcp_keepalives_interval': '30',
        'tcp_keepalives_count': '3'
    }
}

# 解析读副本配置
def parse_read_replicas():
    """
    解析读副本配置，支持多个副本
    """
    replicas = []
    replica_env = get_env_var('DB_READ_REPLICAS', 'localhost:5432')
    if replica_env:
        for i, replica in enumerate(replica_env.split(',')):
            parts = replica.strip().split(':')
            host = parts[0]
            port = int(parts[1]) if len(parts) > 1 else 5432
            
            replicas.append({
                'host': host,
                'port': port,
                'database': get_env_var('DB_READ_NAME', get_env_var('DB_NAME', 'gisdb')),
                'user': get_env_var('DB_READ_USER', get_env_var('DB_USER', 'postgres')),
                'password': get_env_var('DB_READ_PASSWORD', get_env_var('DB_PASSWORD', required=True)),
                'min_size': pool_sizes['min_pool_size'],
                'max_size': pool_sizes['read_pool_size'],
                'command_timeout': 60,
                'server_settings': {
                    'application_name': f'gis_map_service_read{i+1}',
                    'default_transaction_isolation': 'read committed',
                    'work_mem': '16MB'
                }
            })
    
    return replicas

# 读写分离配置 - 为高并发准备，从环境变量读取
READ_REPLICA_CONFIGS = parse_read_replicas()

# API配置 - 高并发优化，从环境变量读取
API_HOST = get_env_var('API_HOST', '0.0.0.0')
API_PORT = get_env_int('API_PORT', 8000)
API_DEBUG = get_env_bool('API_DEBUG', False)  # 生产环境关闭调试
API_WORKERS = get_env_int('API_WORKERS', 4)    # 🔥 关键修复：减少进程数，避免连接数爆炸

# CORS配置
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "https://yourdomain.com"  # 生产域名
]

# Redis缓存配置 - 分布式缓存，从环境变量读取
REDIS_CONFIG = {
    'host': get_env_var('REDIS_HOST', 'localhost'),
    'port': get_env_int('REDIS_PORT', 6379),
    'db': get_env_int('REDIS_DB', 0),
    'password': get_env_var('REDIS_PASSWORD', None),
    'socket_timeout': 5,
    'connection_pool_max_connections': 100,
    'decode_responses': True,
    'health_check_interval': 30
}

# 多层缓存配置
CACHE_CONFIG = {
    'memory_cache': {
        'max_size': 1000,  # 最大缓存条目数
        'ttl': 300,        # 内存缓存TTL(秒)
    },
    'redis_cache': {
        'buildings_ttl': 3600,      # 建筑物缓存1小时
        'land_polygons_ttl': 7200,  # 陆地多边形缓存2小时
        'roads_ttl': 1800,          # 道路缓存30分钟
        'pois_ttl': 1800,           # POI缓存30分钟
        'max_geojson_size': 10 * 1024 * 1024,  # 最大GeoJSON大小10MB
    },
    'precompute_cache': {
        'enabled': True,
        'zoom_levels': [6, 8, 10, 12, 14, 16, 18],  # 预计算缩放级别
        'update_interval': 3600,  # 预计算更新间隔(秒)
    }
}

# Google Geocoding API配置 - 从环境变量读取
GOOGLE_GEOCODING_CONFIG = {
    'api_key': get_env_var('GOOGLE_API_KEY', required=True),
    'base_url': 'https://maps.googleapis.com/maps/api/geocode/json',
    'language': get_env_var('GOOGLE_LANGUAGE', 'id,en'),
    'region': get_env_var('GOOGLE_REGION', 'id'),
    'timeout': get_env_int('GOOGLE_TIMEOUT', 5),  # 增加超时时间
    'max_retries': get_env_int('GOOGLE_MAX_RETRIES', 3),  # 重试次数
    'backoff_factor': 0.3  # 重试间隔
}

# 搜索配置 - 高并发优化
SEARCH_CONFIG = {
    'max_results': 50,           # 增加最大搜索结果数
    'radius_meters': 100,        # 增加周边搜索半径
    'max_distance': 20000,       # 增加最大搜索距离
    'text_search_limit': 100,    # 文本搜索限制
    'fuzzy_search_enabled': True, # 启用模糊搜索
    'search_cache_ttl': 1800     # 搜索缓存30分钟
}

# 性能监控配置
MONITORING_CONFIG = {
    'enabled': True,
    'metrics_port': 8001,
    'log_slow_queries': True,
    'slow_query_threshold': 1.0,  # 慢查询阈值(秒)
    'enable_profiling': True,
    'max_request_size': 50 * 1024 * 1024,  # 最大请求大小50MB
    'max_response_size': 100 * 1024 * 1024  # 最大响应大小100MB
}

# 限流配置
RATE_LIMIT_CONFIG = {
    'enabled': True,
    'requests_per_minute': 1000,    # 每分钟1000个请求
    'requests_per_hour': 10000,     # 每小时10000个请求
    'burst_limit': 100,             # 突发限制
    'whitelist_ips': ['127.0.0.1', '::1'],  # IP白名单
    'blacklist_ips': []             # IP黑名单
}

# 数据库分片配置 - 地理分片
SHARDING_CONFIG = {
    'enabled': False,  # 暂时关闭，后续实现
    'shard_by': 'geography',
    'shards': {
        'indonesia_west': {
            'bounds': [95.0, -11.0, 110.0, 6.0],  # 印尼西部
            'host': 'localhost',
            'port': 5432,
            'database': 'gisdb_west'
        },
        'indonesia_east': {
            'bounds': [110.0, -11.0, 141.0, 6.0],  # 印尼东部
            'host': 'localhost',
            'port': 5432,
            'database': 'gisdb_east'
        }
    }
}

# 健康检查配置
HEALTH_CHECK_CONFIG = {
    'enabled': True,
    'check_interval': 30,  # 检查间隔(秒)
    'timeout': 5,          # 健康检查超时
    'max_failures': 3,     # 最大失败次数
    'endpoints': [
        '/health',
        '/api/status'
    ]
}

# 日志配置 - 支持环境变量
LOG_CONFIG = {
    'level': get_env_var('LOG_LEVEL', 'INFO'),
    'format': get_env_var('LOG_FORMAT', '%(asctime)s - %(name)s - %(levelname)s - %(message)s'),
    'file': get_env_var('LOG_FILE', 'logs/gis_service.log'),
    'max_size': get_env_int('LOG_MAX_SIZE', 100 * 1024 * 1024),  # 最大日志文件大小100MB
    'backup_count': get_env_int('LOG_BACKUP_COUNT', 5),
    'enable_access_log': get_env_bool('LOG_ENABLE_ACCESS', True),
    'enable_slow_log': get_env_bool('LOG_ENABLE_SLOW', True),
    'slow_query_threshold': get_env_float('LOG_SLOW_THRESHOLD', 1.0)  # 慢查询阈值(秒)
}

# ==============================================================================
# 电子围栏功能配置
# ==============================================================================

# 围栏基础配置
FENCE_CONFIG = {
    'enabled': True,
    'max_fences_per_user': 1000,    # 每个用户最大围栏数
    'max_fence_area': 100000000,    # 最大围栏面积(平方米，100平方公里)
    'min_fence_area': 10,           # 最小围栏面积(平方米)
    'max_fence_vertices': 10000,    # 最大围栏顶点数
    'min_fence_vertices': 3,        # 最小围栏顶点数
    'default_fence_color': '#FF0000',
    'default_fence_opacity': 0.3,
    'default_stroke_color': '#FF0000',
    'default_stroke_width': 2,
    'default_stroke_opacity': 0.8
}

# 围栏缓存配置
FENCE_CACHE_CONFIG = {
    'fence_list_ttl': 300,          # 围栏列表缓存5分钟
    'fence_detail_ttl': 600,        # 围栏详情缓存10分钟
    'fence_geojson_ttl': 1800,      # GeoJSON缓存30分钟
    'overlap_analysis_ttl': 900,    # 重叠分析缓存15分钟
    'layer_analysis_ttl': 1800,     # 图层分析缓存30分钟
    'fence_stats_ttl': 3600,        # 围栏统计缓存1小时
    'fence_history_ttl': 1800,      # 围栏历史缓存30分钟
    'fence_groups_ttl': 3600        # 围栏组缓存1小时
}

# 围栏重叠检测配置
FENCE_OVERLAP_CONFIG = {
    'enabled': True,
    'auto_detect_on_create': True,   # 创建时自动检测重叠
    'auto_detect_on_update': True,   # 更新时自动检测重叠
    'min_overlap_area': 1,           # 最小重叠面积(平方米)
    'min_overlap_percentage': 0.1,   # 最小重叠百分比(%)
    'max_overlap_check_distance': 10000,  # 最大重叠检查距离(米)
    'overlap_notification_enabled': True,  # 重叠通知开关
    'overlap_warning_threshold': 10,       # 重叠告警阈值(%)
    'overlap_critical_threshold': 50       # 重叠严重告警阈值(%)
}

# 围栏图层分析配置
FENCE_LAYER_ANALYSIS_CONFIG = {
    'enabled': True,
    'supported_layers': [
        'buildings', 'roads', 'pois', 'water', 'railways', 
        'landuse', 'natural', 'transport', 'traffic', 'worship'
    ],
    'analysis_cache_ttl': 1800,     # 分析结果缓存30分钟
    'auto_analyze_on_create': True,  # 创建时自动分析
    'analysis_timeout': 60,          # 分析超时时间(秒)
    'max_features_per_layer': 50000, # 每层最大特征数
    'analysis_detail_level': 'summary'  # 分析详细级别: summary, detailed
}

# 围栏高级操作配置
FENCE_ADVANCED_CONFIG = {
    'merge_enabled': True,
    'split_enabled': True,
    'max_merge_fences': 10,         # 最大合并围栏数
    'max_split_parts': 20,          # 最大分割部分数
    'merge_tolerance': 0.001,       # 合并容差(度)
    'split_tolerance': 0.001,       # 分割容差(度)
    'geometry_simplify_enabled': True,
    'default_simplify_tolerance': 0.0001,  # 默认简化容差(度)
    'history_retention_days': 365,  # 历史记录保留天数
    'version_control_enabled': True  # 版本控制开关
}

# 围栏权限配置
FENCE_PERMISSION_CONFIG = {
    'enabled': True,
    'default_permissions': ['read'],  # 默认权限
    'permission_types': ['read', 'write', 'delete', 'manage'],
    'inherit_group_permissions': True,  # 继承组权限
    'owner_full_permissions': True,    # 所有者拥有全部权限
    'public_read_enabled': False,      # 公共读取开关
    'permission_cache_ttl': 1800       # 权限缓存30分钟
}

# 围栏导入导出配置
FENCE_IMPORT_EXPORT_CONFIG = {
    'import_enabled': True,
    'export_enabled': True,
    'supported_formats': ['geojson', 'kml', 'shapefile'],
    'max_import_file_size': 50 * 1024 * 1024,  # 最大导入文件大小50MB
    'max_export_features': 10000,    # 最大导出特征数
    'import_validation_enabled': True,
    'export_include_metadata': True,
    'batch_import_size': 100,        # 批量导入大小
    'import_duplicate_handling': 'skip',  # 重复处理: skip, replace, merge
    'export_compression_enabled': True
}

# 围栏监控配置
FENCE_MONITORING_CONFIG = {
    'enabled': True,
    'log_all_operations': True,      # 记录所有操作
    'performance_monitoring': True,  # 性能监控
    'slow_operation_threshold': 2.0, # 慢操作阈值(秒)
    'error_notification_enabled': True,
    'usage_statistics_enabled': True,
    'metrics_collection_interval': 300,  # 指标收集间隔(秒)
    'alert_overlap_threshold': 20,       # 重叠告警阈值(个)
    'alert_fence_count_threshold': 5000, # 围栏数量告警阈值
    'health_check_enabled': True
}

# 围栏地理计算配置
FENCE_GEO_CONFIG = {
    'coordinate_system': 'EPSG:4326',    # 坐标系
    'area_calculation_crs': 'EPSG:3857', # 面积计算坐标系
    'distance_calculation_crs': 'EPSG:3857',  # 距离计算坐标系
    'geometry_validation_enabled': True,
    'auto_repair_geometry': True,        # 自动修复几何
    'precision_digits': 8,               # 精度位数
    'buffer_default_distance': 100,      # 默认缓冲距离(米)
    'simplify_threshold': 0.0001,        # 简化阈值(度)
    'topology_validation_enabled': True
}

# 围栏API配置
FENCE_API_CONFIG = {
    'enabled': True,
    'rate_limit_per_minute': 200,    # 每分钟请求限制
    'rate_limit_per_hour': 2000,     # 每小时请求限制
    'max_fences_per_request': 100,   # 每次请求最大围栏数
    'max_geometry_size': 10 * 1024 * 1024,  # 最大几何大小10MB
    'pagination_default_limit': 50,  # 默认分页大小
    'pagination_max_limit': 500,     # 最大分页大小
    'api_key_required': False,       # API密钥要求
    'cors_enabled': True,
    'api_documentation_enabled': True
}

# 围栏集成配置
FENCE_INTEGRATION_CONFIG = {
    'webhook_enabled': True,
    'webhook_events': [
        'fence_created', 'fence_updated', 'fence_deleted',
        'fence_merged', 'fence_split', 'overlap_detected'
    ],
    'webhook_timeout': 30,           # Webhook超时时间(秒)
    'webhook_retry_count': 3,        # Webhook重试次数
    'notification_enabled': True,
    'notification_channels': ['email', 'webhook', 'database'],
    'external_system_sync': False,   # 外部系统同步
    'backup_enabled': True,
    'backup_interval': 24 * 3600,    # 备份间隔(秒)
    'backup_retention_days': 30      # 备份保留天数
} 

# ==============================================================================
# 图层缩放级别策略工具函数
# ==============================================================================

def calc_simplify_tolerance(zoom: int) -> float:
    """
    计算简化容差的独立函数
    
    Args:
        zoom: 缩放级别
        
    Returns:
        简化容差值
    """
    if zoom < 10:
        return 100.0
    elif zoom < 12:
        return 20.0
    elif zoom < 15:
        return 5.0
    else:
        return 1.0

def calc_cache_ttl(zoom: int) -> int:
    """
    计算缓存TTL的函数
    
    Args:
        zoom: 缩放级别
        
    Returns:
        缓存TTL（秒）
    """
    # 缩放级别越高，缓存时间越短（更新频率越高）
    base_ttl = 600  # 基础10分钟
    return max(300, base_ttl - zoom * 15)  # 最少5分钟缓存

def get_layer_zoom_strategy(layer_name: str, zoom: int) -> dict:
    """
    获取指定图层的缩放级别策略（优化版本）
    
    Args:
        layer_name: 图层名称
        zoom: 缩放级别
        
    Returns:
        包含加载策略的字典
    """
    # 检查图层是否存在
    if layer_name not in LAYER_ZOOM_STRATEGIES:
        return {'load_data': False, 'reason': 'layer_not_configured'}
    
    strategy = LAYER_ZOOM_STRATEGIES[layer_name]
    limits = strategy.get('limits', {})
    
    # 电子围栏始终加载
    if strategy.get('always_load'):
        # 查找小于等于当前zoom的最大zoom级别
        available_zooms = [z for z in limits.keys() if z <= zoom]
        target_zoom = max(available_zooms) if available_zooms else min(limits.keys())
        limit = limits[target_zoom]
        
        return {
            'load_data': True,
            'reason': 'always_load',
            'max_features': limit,
            'simplify_tolerance': 0,
            'cache_ttl': calc_cache_ttl(zoom)
        }
    
    # 检查缩放级别范围
    if zoom < strategy['min_zoom']:
        return {'load_data': False, 'reason': 'zoom_too_low'}
    
    # 16级以上加载所有图层
    if zoom >= HIGH_ZOOM_STRATEGY['zoom_threshold']:
        return {
            'load_data': True,
            'reason': 'high_zoom_all_layers',
            'max_features': max(limits.values()) if limits else 5000,
            'simplify_tolerance': 0,
            'cache_ttl': calc_cache_ttl(zoom)
        }
    
    # 根据缩放级别确定限制
    zoom_levels = sorted([z for z in limits.keys() if z <= zoom])
    if not zoom_levels:
        return {'load_data': False, 'reason': 'no_suitable_zoom'}
    
    target_zoom = max(zoom_levels)
    limit = limits[target_zoom]
    
    return {
        'load_data': True,
        'reason': f'zoom_{target_zoom}_strategy',
        'max_features': limit,
        'simplify_tolerance': calc_simplify_tolerance(zoom),
        'cache_ttl': calc_cache_ttl(zoom)
    }

def get_all_layers_zoom_strategy(zoom: int) -> dict:
    """获取所有图层在指定缩放级别的策略"""
    result = {}
    for layer_name in LAYER_ZOOM_STRATEGIES.keys():
        result[layer_name] = get_layer_zoom_strategy(layer_name, zoom)
    return result

