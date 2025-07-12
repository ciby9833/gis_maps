#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GIS 后端服务 - 主程序入口点
负责FastAPI应用初始化和服务器启动
支持环境变量配置
"""

import os
import sys
from pathlib import Path

# 第一步：立即加载.env文件（必须在所有导入之前）
def load_environment():
    """加载环境变量配置"""
    try:
        from dotenv import load_dotenv
        # 加载.env文件
        env_path = Path(__file__).parent / '.env'
        if env_path.exists():
            load_dotenv(env_path)
            print(f"✅ 已加载环境变量文件: {env_path}")
            return True
        else:
            print("⚠️  未找到.env文件，使用系统环境变量")
            return False
    except ImportError:
        print("⚠️  python-dotenv未安装，使用系统环境变量")
        return False

# 立即加载环境变量
load_environment()

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import signal
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 配置验证函数
def validate_environment():
    """验证必需的环境变量"""
    required_vars = ['DB_PASSWORD', 'GOOGLE_API_KEY']
    missing_vars = []
    
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        logger.error("❌ 缺少必需的环境变量:")
        for var in missing_vars:
            logger.error(f"   - {var}")
        logger.error("请参考 ENVIRONMENT_SETUP.md 配置环境变量")
        return False
    
    logger.info("✅ 环境变量验证通过")
    return True

try:
    # 验证环境变量
    if not validate_environment():
        sys.exit(1)
    
    import config
    from services import init_db_pool, close_db_pool, clear_cache
    from routes import router
    # 导入电子围栏路由
    from fence_routes import fence_router
except ImportError as e:
    logger.error(f"导入模块失败: {e}")
    sys.exit(1)

# 创建FastAPI应用
app = FastAPI(
    title="GIS Map Service",
    description="基于PostGIS的高性能地图服务 - 支持电子围栏功能",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# 🔥 关键修复：在应用启动时创建连接池，而不是每次请求都创建
@app.on_event("startup")
async def startup_event():
    """应用启动事件：初始化数据库连接池"""
    logger.info("🚀 正在初始化数据库连接池...")
    await init_db_pool()
    logger.info("✅ 数据库连接池初始化完成")

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭事件：关闭数据库连接池"""
    logger.info("🔄 正在关闭数据库连接池...")
    await close_db_pool()
    clear_cache()
    logger.info("✅ 数据库连接池已关闭")

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001", 
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(router)
# 注册电子围栏路由
app.include_router(fence_router)

# 处理打印插件相关请求 (避免404错误)
@app.get("/CLodopfuncs.js", include_in_schema=False)
@app.options("/CLodopfuncs.js", include_in_schema=False)
async def handle_lodop_print_plugin():
    """处理Lodop打印插件请求，避免404错误"""
    # 返回空的JavaScript响应，避免控制台错误
    return Response(
        content="// Lodop print plugin placeholder - not available in this application",
        media_type="application/javascript"
    )

# 添加根路径重定向到API文档
@app.get("/", include_in_schema=False)
async def root():
    """根路径重定向到API文档"""
    return {
        "message": "GIS Map Service API - 支持电子围栏功能",
        "version": "2.0.0",
        "features": [
            "高并发数据库连接池",
            "Redis分布式缓存",
            "多层缓存策略",
            "读写分离",
            "统一缩放级别策略",
            "电子围栏全级别加载",
            "地理编码优化",
            "电子围栏管理",
            "围栏重叠检测",
            "图层分析",
            "围栏合并切割"
        ],
        "zoom_strategy": {
            "description": "基于行业标准的分级加载策略",
            "levels": {
                "overview (1-7)": "总览级别 - 电子围栏 + 关键信息",
                "regional (8-11)": "区域级别 - 主要地理要素",
                "urban (12-15)": "城市级别 - 详细城市信息", 
                "street (16+)": "街道级别 - 所有图层最高精度"
            },
            "fence_policy": "电子围栏在所有缩放级别都加载",
            "high_zoom_policy": "16级以上加载所有图层以获得最佳细节"
        },
        "endpoints": {
            "配置接口": {
                "layer_config": "/api/config/layers",
                "layer_strategy": "/api/config/layers/{layer_name}?zoom={zoom}",
                "zoom_strategy": "/api/config/zoom/{zoom}"
            },
            "地图数据": {
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
                "natural": "/api/natural"
            },
            "地理编码": {
                "validate_location": "/api/validate_location",
                "search": "/api/search",
                "geocode": "/api/geocode",
                "nearby": "/api/nearby"
            },
            "系统状态": {
                "status": "/api/status",
                "cache_stats": "/api/cache_stats"
            },
            "电子围栏": {
                "围栏管理": "/api/fences",
                "围栏详情": "/api/fences/{fence_id}",
                "重叠检测": "/api/fences/{fence_id}/overlaps",
                "图层分析": "/api/fences/{fence_id}/layer-analysis",
                "围栏合并": "/api/fences/merge",
                "围栏切割": "/api/fences/split",
                "围栏统计": "/api/fences/statistics/summary",
                "围栏导出": "/api/fences/export/geojson",
                "围栏导入": "/api/fences/import/geojson",
                "围栏组管理": "/api/fences/groups",
                "围栏历史": "/api/fences/{fence_id}/history",
                "几何验证": "/api/fences/validate-geometry",
                "重叠检查": "/api/fences/check-overlaps"
            }
        },
        "documentation": {
            "swagger_ui": "/docs",
            "redoc": "/redoc"
        }
    }

async def main():
    """主函数：启动服务器并处理信号"""
    # 🔥 关键修复：移除这里的连接池初始化
    # 连接池现在在应用启动事件中创建，而不是在main()中
    
    # 配置 Uvicorn 服务器
    import uvicorn
    
    uvicorn_config = uvicorn.Config(
        app, 
        host=os.getenv('API_HOST', '0.0.0.0'), 
        port=int(os.getenv('API_PORT', '8000')),
        log_level="info",
        access_log=True
    )
    server = uvicorn.Server(uvicorn_config)
    
    # 创建停止事件
    stop_event = asyncio.Event()
    
    # 设置信号处理器 (仅在非 Windows 系统上)
    if sys.platform != 'win32':
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(
                sig, 
                lambda: (
                    logger.info(f"收到信号 {sig}, 开始优雅关闭..."),
                    stop_event.set()
                )
            )
    else:
        # Windows 系统使用 KeyboardInterrupt 处理
        logger.info("Windows 系统: 使用 Ctrl+C 停止服务")
    
    api_host = os.getenv('API_HOST', '0.0.0.0')
    api_port = os.getenv('API_PORT', '8000')
    
    logger.info(f"🚀 GIS Map Service 启动中...")
    logger.info(f"📍 服务地址: http://{api_host}:{api_port}")
    logger.info(f"📘 API 文档: http://{api_host}:{api_port}/docs")
    logger.info(f"🔍 ReDoc 文档: http://{api_host}:{api_port}/redoc")
    logger.info(f"🛑 按 Ctrl+C 停止服务")
    
    try:
        # 启动服务器和等待停止信号
        if sys.platform != 'win32':
            # 非 Windows 系统：使用信号处理
            server_task = asyncio.create_task(server.serve())
            stop_task = asyncio.create_task(stop_event.wait())
            
            # 等待服务器启动或停止信号
            done, pending = await asyncio.wait(
                [server_task, stop_task],
                return_when=asyncio.FIRST_COMPLETED
            )
            
            # 取消未完成的任务
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                    
        else:
            # Windows 系统：直接运行服务器
            await server.serve()
            
    except KeyboardInterrupt:
        logger.info("收到 Ctrl+C, 开始优雅关闭...")
    except Exception as e:
        logger.error(f"服务器运行异常: {e}")
        raise
    finally:
        # 🔥 关键修复：移除这里的连接池关闭
        # 连接池现在在应用关闭事件中处理
        logger.info("🎉 GIS Map Service 已安全关闭")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 服务已停止") 