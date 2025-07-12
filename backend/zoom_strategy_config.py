# -*- coding: utf-8 -*-
"""
图层缩放策略配置文件
独立管理各图层的缩放级别和加载策略
"""

# 图层缩放级别策略配置
LAYER_ZOOM_STRATEGIES = {
    # 电子围栏 - 所有级别都加载（用户管理的重要数据）
    'fences': {
        'min_zoom': 1,
        'max_zoom': 20,
        'always_load': True,
        'limits': {1: 1000, 10: 3000, 15: 5000},
        'description': '电子围栏在所有缩放级别都加载，确保用户可以随时管理围栏'
    },
    
    # 建筑物 - 城市级别开始显示
    'buildings': {
        'min_zoom': 6,
        'max_zoom': 20,
        'limits': {6: 5000, 10: 15000, 12: 30000, 15: 50000},
        'description': '建筑物从城市级别开始显示，提供详细的建筑信息'
    },
    
    # 陆地多边形 - 全球级别开始显示
    'land_polygons': {
        'min_zoom': 4,
        'max_zoom': 20,
        'limits': {4: 2000, 8: 5000, 10: 8000, 12: 6000, 14: 3000},
        'description': '陆地多边形从全球级别开始显示，提供地理背景'
    },
    
    # 道路网络 - 降低到7级开始显示
    'roads': {
        'min_zoom': 7,
        'max_zoom': 20,
        'limits': {7: 3000, 9: 5000, 11: 10000, 13: 20000, 15: 30000},
        'description': '道路网络从区域级别开始显示，支持交通分析'
    },
    
    # POI - 降低到9级开始显示
    'pois': {
        'min_zoom': 9,
        'max_zoom': 20,
        'limits': {9: 3000, 12: 5000, 16: 8000},
        'description': '兴趣点从城市级别开始显示，提供详细的地点信息'
    },
    
    # 水体 - 区域级别开始显示
    'water': {
        'min_zoom': 8,
        'max_zoom': 20,
        'limits': {8: 5000, 12: 8000, 16: 10000},
        'description': '水体从区域级别开始显示，提供水文信息'
    },
    
    # 铁路 - 区域级别开始显示
    'railways': {
        'min_zoom': 10,
        'max_zoom': 20,
        'limits': {10: 3000, 14: 5000, 16: 8000},
        'description': '铁路从区域级别开始显示，支持交通规划'
    },
    
    # 交通设施 - 街道级别开始显示
    'traffic': {
        'min_zoom': 13,
        'max_zoom': 20,
        'limits': {13: 3000, 16: 6000},
        'description': '交通设施从街道级别开始显示，提供交通管理信息'
    },
    
    # 宗教场所 - 街道级别开始显示
    'worship': {
        'min_zoom': 12,
        'max_zoom': 20,
        'limits': {12: 5000, 16: 8000},
        'description': '宗教场所从街道级别开始显示，提供文化信息'
    },
    
    # 土地利用 - 中等级别开始显示
    'landuse': {
        'min_zoom': 10,
        'max_zoom': 20,
        'limits': {10: 8000, 14: 15000, 16: 20000},
        'description': '土地利用从中等级别开始显示，支持规划分析'
    },
    
    # 交通运输 - 降低到9级开始显示
    'transport': {
        'min_zoom': 9,
        'max_zoom': 20,
        'limits': {9: 1000, 12: 2000, 16: 3000},
        'description': '交通运输设施从城市级别开始显示'
    },
    
    # 地名 - 降低到6级开始显示
    'places': {
        'min_zoom': 6,
        'max_zoom': 20,
        'limits': {6: 500, 8: 1000, 12: 2000, 16: 3000},
        'description': '地名从城市级别开始显示，提供地理标识'
    },
    
    # 自然特征 - 降低到8级开始显示
    'natural': {
        'min_zoom': 8,
        'max_zoom': 20,
        'limits': {8: 2000, 10: 3000, 14: 5000, 16: 8000},
        'description': '自然特征从区域级别开始显示，提供地理环境信息'
    }
}

# 高缩放级别策略（16级以上加载所有图层）
HIGH_ZOOM_STRATEGY = {
    'zoom_threshold': 16,
    'load_all_layers': True,
    'description': '16级以上加载所有图层以获得最佳细节'
}

# 缩放级别策略描述
ZOOM_STRATEGY_DESCRIPTION = {
    'overview': '总览级别 (1-7): 只显示关键信息和电子围栏',
    'regional': '区域级别 (8-11): 显示主要地理要素',
    'urban': '城市级别 (12-15): 显示详细城市信息',
    'street': '街道级别 (16+): 显示所有图层的最高精度信息'
}

# 动态策略配置 - 支持运行时修改
DYNAMIC_STRATEGY_CONFIG = {
    'enabled': True,
    'reload_interval': 300,  # 5分钟重新加载一次
    'config_sources': ['file', 'database', 'environment'],
    'fallback_strategy': 'conservative'  # 保守策略：较高的缩放级别才加载
}

def get_available_layers():
    """获取所有可用的图层列表"""
    return list(LAYER_ZOOM_STRATEGIES.keys())

def get_layer_info(layer_name: str) -> dict:
    """获取指定图层的详细信息"""
    return LAYER_ZOOM_STRATEGIES.get(layer_name, {})

def validate_zoom_strategy(layer_name: str, zoom: int) -> bool:
    """验证缩放策略的有效性"""
    if layer_name not in LAYER_ZOOM_STRATEGIES:
        return False
    
    strategy = LAYER_ZOOM_STRATEGIES[layer_name]
    return strategy['min_zoom'] <= zoom <= strategy['max_zoom']

def get_recommended_zoom_for_layer(layer_name: str) -> int:
    """获取图层的推荐缩放级别"""
    if layer_name not in LAYER_ZOOM_STRATEGIES:
        return 10  # 默认推荐级别
    
    strategy = LAYER_ZOOM_STRATEGIES[layer_name]
    # 返回最小缩放级别作为推荐级别
    return strategy['min_zoom'] 