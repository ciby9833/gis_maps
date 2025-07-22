#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
电子围栏API路由模块
包含围栏管理、重叠检测、图层分析、合并切割等API端点
"""

from fastapi import APIRouter, HTTPException, Query, Body, Path, Depends, UploadFile, File
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, field_validator
import json
import logging
import time
from datetime import datetime

# 导入围栏服务
from fence_services import (
    create_fence, update_fence, delete_fence, get_fence_list, get_fence_detail,
    detect_fence_overlaps, get_fence_layer_analysis, merge_fences, split_fence,
    get_fence_statistics, export_fences_geojson, import_fences_geojson
)

# 配置日志
logger = logging.getLogger("fence_routes")

# 创建路由器 - 移除prefix以避免重复
fence_router = APIRouter(tags=["电子围栏"])

# ==============================================================================
# 请求模型定义
# ==============================================================================

class FenceGeometry(BaseModel):
    """围栏几何模型"""
    type: str = Field(..., description="几何类型，目前只支持Polygon")
    coordinates: List[List[List[float]]] = Field(..., description="多边形坐标")
    
    @field_validator('type')
    @classmethod
    def validate_type(cls, v):
        if v != 'Polygon':
            raise ValueError('目前只支持Polygon类型')
        return v

class CreateFenceRequest(BaseModel):
    """创建围栏请求模型"""
    fence_name: str = Field(..., min_length=1, max_length=100, description="围栏名称")
    fence_geometry: Union[FenceGeometry, str] = Field(..., description="围栏几何（GeoJSON或WKT）")
    fence_type: str = Field("polygon", description="围栏类型")
    fence_purpose: Optional[str] = Field(None, max_length=100, description="围栏用途")
    fence_description: Optional[str] = Field(None, max_length=500, description="围栏描述")
    fence_color: str = Field("#FF0000", pattern=r'^#[0-9A-Fa-f]{6}$', description="围栏颜色")
    fence_opacity: float = Field(0.3, ge=0, le=1, description="围栏透明度")
    group_id: Optional[int] = Field(None, description="围栏组ID")
    owner_id: Optional[int] = Field(None, description="所有者ID")
    creator_id: Optional[int] = Field(None, description="创建者ID")
    fence_tags: Optional[Dict[str, Any]] = Field(None, description="围栏标签")
    fence_config: Optional[Dict[str, Any]] = Field(None, description="围栏配置")

class UpdateFenceRequest(BaseModel):
    """更新围栏请求模型"""
    fence_name: Optional[str] = Field(None, min_length=1, max_length=100, description="围栏名称")
    fence_geometry: Optional[Union[FenceGeometry, str]] = Field(None, description="围栏几何")
    fence_purpose: Optional[str] = Field(None, max_length=100, description="围栏用途")
    fence_description: Optional[str] = Field(None, max_length=500, description="围栏描述")
    fence_color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$', description="围栏颜色")
    fence_opacity: Optional[float] = Field(None, ge=0, le=1, description="围栏透明度")
    fence_tags: Optional[Dict[str, Any]] = Field(None, description="围栏标签")
    fence_config: Optional[Dict[str, Any]] = Field(None, description="围栏配置")
    operator_id: Optional[int] = Field(None, description="操作者ID")

class MergeFencesRequest(BaseModel):
    """合并围栏请求模型"""
    fence_ids: List[int] = Field(..., min_length=2, description="要合并的围栏ID列表")
    new_fence_name: str = Field(..., min_length=1, max_length=100, description="新围栏名称")
    operator_id: Optional[int] = Field(None, description="操作者ID")

class SplitFenceRequest(BaseModel):
    """切割围栏请求模型"""
    fence_id: int = Field(..., description="要切割的围栏ID")
    split_line: Union[Dict[str, Any], str] = Field(..., description="分割线（GeoJSON LineString或WKT）")
    operator_id: Optional[int] = Field(None, description="操作者ID")

class FenceQuery(BaseModel):
    """围栏查询模型"""
    status: Optional[str] = Field(None, description="围栏状态")
    fence_type: Optional[str] = Field(None, description="围栏类型")
    group_id: Optional[int] = Field(None, description="围栏组ID")
    owner_id: Optional[int] = Field(None, description="所有者ID")
    bbox: Optional[str] = Field(None, description="边界框过滤")
    limit: int = Field(100, ge=1, le=10000, description="返回数量限制")
    offset: int = Field(0, ge=0, description="偏移量")

# ==============================================================================
# 依赖函数
# ==============================================================================

def get_current_user_id() -> Optional[int]:
    """获取当前用户ID（示例，实际应从认证中获取）"""
    # 这里应该从JWT token或session中获取用户ID
    return 1

# ==============================================================================
# 围栏基础CRUD操作
# ==============================================================================

@fence_router.post("/api/fences", summary="创建围栏", description="创建一个新的电子围栏")
async def create_fence_endpoint(
    request: CreateFenceRequest,
    current_user_id: Optional[int] = Depends(get_current_user_id)
):
    """创建围栏"""
    try:
        # 如果没有指定创建者，使用当前用户
        if not request.creator_id:
            request.creator_id = current_user_id
        
        # 转换几何数据
        if isinstance(request.fence_geometry, FenceGeometry):
            fence_geometry = request.fence_geometry.dict()
        else:
            fence_geometry = request.fence_geometry
        
        result = await create_fence(
            fence_name=request.fence_name,
            fence_geometry=fence_geometry,
            fence_type=request.fence_type,
            fence_purpose=request.fence_purpose,
            fence_description=request.fence_description,
            fence_color=request.fence_color,
            fence_opacity=request.fence_opacity,
            group_id=request.group_id,
            owner_id=request.owner_id,
            creator_id=request.creator_id,
            fence_tags=request.fence_tags,
            fence_config=request.fence_config
        )
        
        if result.get('success'):
            # 🔥 修复双重嵌套问题：直接返回围栏数据，避免data中再嵌套data  
            return {
                "success": True,
                "data": {
                    "fence_id": result.get("fence_id"),
                    "fence_name": result.get("fence_name"),
                    "fence_area": result.get("fence_area"),
                    "overlaps_detected": result.get("overlaps_detected"),
                    "overlaps_count": result.get("overlaps_count")
                },
                "message": "围栏创建成功"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get('error', '围栏创建失败'))
    
    except Exception as e:
        logger.error(f"创建围栏API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@fence_router.get("/api/fences", summary="获取围栏列表", description="获取围栏列表，支持多种过滤条件")
async def get_fence_list_endpoint(
    status: Optional[str] = Query(None, description="围栏状态"),
    fence_type: Optional[str] = Query(None, description="围栏类型"),
    group_id: Optional[int] = Query(None, description="围栏组ID"),
    owner_id: Optional[int] = Query(None, description="所有者ID"),
    bbox: Optional[str] = Query(None, description="边界框过滤：west,south,east,north"),
    limit: int = Query(100, ge=1, le=10000, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    zoom: Optional[int] = Query(None, description="缩放级别（围栏在所有级别都加载）")
):
    """获取围栏列表"""
    try:
        # 围栏在所有缩放级别都加载，根据缩放级别调整数量限制
        if zoom is not None:
            if zoom >= 16:
                # 16级以上提供最大数量
                effective_limit = min(limit, 5000)
            elif zoom >= 12:
                # 12-15级提供中等数量
                effective_limit = min(limit, 3000)
            elif zoom >= 8:
                # 8-11级提供基本数量
                effective_limit = min(limit, 1000)
            else:
                # 8级以下提供最少数量但仍然加载
                effective_limit = min(limit, 500)
        else:
            effective_limit = limit
        
        try:
            result = await get_fence_list(
                status=status,
                fence_type=fence_type,
                group_id=group_id,
                owner_id=owner_id,
                bbox=bbox,
                limit=effective_limit,
                offset=offset
            )
            
            if result.get('success'):
                # 添加缩放级别信息
                if zoom is not None:
                    result['zoom_info'] = {
                        'zoom': zoom,
                        'reason': 'always_load',
                        'description': '围栏在所有缩放级别都加载以确保用户可以随时管理围栏',
                        'effective_limit': effective_limit
                    }
                
                return {
                    "success": True,
                    "data": {
                        "fences": result.get("fences", []),
                        "total_count": result.get("total_count", 0),
                        "returned_count": result.get("returned_count", 0),
                        "limit": result.get("limit", effective_limit),
                        "offset": result.get("offset", offset),
                        "zoom_info": result.get("zoom_info")
                    },
                    "message": "围栏列表获取成功"
                }
            else:
                raise HTTPException(status_code=400, detail=result.get('error', '围栏列表获取失败'))
                
        except ValueError as e:
            if "DB_PASSWORD" in str(e) or "必需的环境变量" in str(e):
                # 数据库连接失败，返回空的围栏列表
                logger.warning(f"数据库连接失败，返回空围栏列表: {e}")
                return {
                    "success": True,
                    "data": {
                        "fences": [],
                        "total": 0,
                        "limit": effective_limit,
                        "offset": offset,
                        "message": "电子围栏功能需要数据库配置"
                    },
                    "message": "围栏列表获取成功（数据库未配置）"
                }
            else:
                raise
    
    except Exception as e:
        logger.error(f"获取围栏列表API失败: {e}")
        # 对于任何其他错误，也返回空列表而不是HTTP错误
        return {
            "success": True,
            "data": {
                "fences": [],
                "total": 0,
                "limit": limit,
                "offset": offset,
                "error": str(e)
            },
            "message": "围栏列表获取成功（服务暂时不可用）"
        }

@fence_router.get("/api/fences/{fence_id}", summary="获取围栏详情", description="获取指定围栏的详细信息")
async def get_fence_detail_endpoint(
    fence_id: int = Path(..., description="围栏ID"),
    include_overlaps: bool = Query(True, description="是否包含重叠分析"),
    include_layer_analysis: bool = Query(True, description="是否包含图层分析")
):
    """获取围栏详情"""
    try:
        result = await get_fence_detail(
            fence_id=fence_id,
            include_overlaps=include_overlaps,
            include_layer_analysis=include_layer_analysis
        )
        
        if result.get('success'):
            # 🔥 修复双重嵌套问题：直接返回fence数据，避免data中再嵌套data
            return {
                "success": True,
                "data": result.get("fence", {}),
                "message": "围栏详情获取成功"
            }
        else:
            raise HTTPException(status_code=404, detail=result.get('error', '围栏不存在'))
    
    except Exception as e:
        logger.error(f"获取围栏详情API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@fence_router.put("/api/fences/{fence_id}", summary="更新围栏", description="更新指定围栏的信息")
async def update_fence_endpoint(
    fence_id: int = Path(..., description="围栏ID"),
    request: UpdateFenceRequest = Body(...),
    current_user_id: Optional[int] = Depends(get_current_user_id)
):
    """更新围栏"""
    try:
        # 如果没有指定操作者，使用当前用户
        if not request.operator_id:
            request.operator_id = current_user_id
        
        # 转换几何数据
        fence_geometry = None
        if request.fence_geometry:
            if isinstance(request.fence_geometry, FenceGeometry):
                fence_geometry = request.fence_geometry.dict()
            else:
                fence_geometry = request.fence_geometry
        
        result = await update_fence(
            fence_id=fence_id,
            fence_name=request.fence_name,
            fence_geometry=fence_geometry,
            fence_purpose=request.fence_purpose,
            fence_description=request.fence_description,
            fence_color=request.fence_color,
            fence_opacity=request.fence_opacity,
            fence_tags=request.fence_tags,
            fence_config=request.fence_config,
            operator_id=request.operator_id
        )
        
        if result.get('success'):
            # 🔥 修复双重嵌套问题：直接返回围栏数据，避免data中再嵌套data
            return {
                "success": True,
                "data": {
                    "fence_id": result.get("fence_id"),
                    "fence_name": result.get("fence_name"),
                    "fence_area": result.get("fence_area"),
                    "overlaps_detected": result.get("overlaps_detected"),
                    "overlaps_count": result.get("overlaps_count")
                },
                "message": "围栏更新成功"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get('error', '围栏更新失败'))
    
    except Exception as e:
        logger.error(f"更新围栏API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@fence_router.delete("/api/fences/{fence_id}", summary="删除围栏", description="删除指定围栏")
async def delete_fence_endpoint(
    fence_id: int = Path(..., description="围栏ID"),
    current_user_id: Optional[int] = Depends(get_current_user_id)
):
    """删除围栏"""
    try:
        result = await delete_fence(
            fence_id=fence_id,
            operator_id=current_user_id
        )
        
        if result.get('success'):
            # 🔥 修复双重嵌套问题：直接返回围栏数据，避免data中再嵌套data
            return {
                "success": True,
                "data": {
                    "fence_id": result.get("fence_id"),
                    "fence_name": result.get("fence_name")
                },
                "message": "围栏删除成功"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get('error', '围栏删除失败'))
    
    except Exception as e:
        logger.error(f"删除围栏API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# 围栏分析功能
# ==============================================================================

@fence_router.get("/api/fences/{fence_id}/overlaps", summary="检测围栏重叠", description="检测指定围栏与其他围栏的重叠情况")
async def detect_fence_overlaps_endpoint(
    fence_id: int = Path(..., description="围栏ID")
):
    """检测围栏重叠"""
    try:
        result = await detect_fence_overlaps(fence_id)
        
        return {
            "success": True,
            "data": {
                "fence_id": fence_id,
                "overlaps": result,
                "overlap_count": len(result)
            },
            "message": "重叠检测完成"
        }
    
    except Exception as e:
        logger.error(f"检测围栏重叠API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@fence_router.get("/api/fences/{fence_id}/layer-analysis", summary="围栏图层分析", description="分析围栏内的各类地理要素")
async def get_fence_layer_analysis_endpoint(
    fence_id: int = Path(..., description="围栏ID"),
    layer_types: Optional[str] = Query(None, description="图层类型，多个用逗号分隔")
):
    """围栏图层分析"""
    try:
        layer_types_list = None
        if layer_types:
            layer_types_list = [t.strip() for t in layer_types.split(',')]
        
        result = await get_fence_layer_analysis(fence_id, layer_types_list)
        
        return {
            "success": True,
            "data": {
                "fence_id": fence_id,
                "layer_analysis": result,
                "analyzed_layers": list(result.keys()) if result else []
            },
            "message": "图层分析完成"
        }
    
    except Exception as e:
        logger.error(f"围栏图层分析API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# 围栏高级操作
# ==============================================================================

@fence_router.post("/api/fences/merge", summary="合并围栏", description="将多个围栏合并为一个围栏")
async def merge_fences_endpoint(
    request: MergeFencesRequest,
    current_user_id: Optional[int] = Depends(get_current_user_id)
):
    """合并围栏"""
    try:
        # 如果没有指定操作者，使用当前用户
        if not request.operator_id:
            request.operator_id = current_user_id
        
        result = await merge_fences(
            fence_ids=request.fence_ids,
            new_fence_name=request.new_fence_name,
            operator_id=request.operator_id
        )
        
        if result.get('success'):
            # 🔥 修复双重嵌套问题：直接返回合并结果数据
            return {
                "success": True,
                "data": {
                    "new_fence_id": result.get("new_fence_id"),
                    "merged_fence_ids": result.get("merged_fence_ids"),
                    "overlaps_detected": result.get("overlaps_detected"),
                    "overlaps_count": result.get("overlaps_count")
                },
                "message": "围栏合并成功"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get('error', '围栏合并失败'))
    
    except Exception as e:
        logger.error(f"合并围栏API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@fence_router.post("/api/fences/split", summary="切割围栏", description="使用分割线将围栏切割为多个围栏")
async def split_fence_endpoint(
    request: SplitFenceRequest,
    current_user_id: Optional[int] = Depends(get_current_user_id)
):
    """切割围栏"""
    try:
        # 如果没有指定操作者，使用当前用户
        if not request.operator_id:
            request.operator_id = current_user_id
        
        result = await split_fence(
            fence_id=request.fence_id,
            split_line=request.split_line,
            operator_id=request.operator_id
        )
        
        if result.get('success'):
            # 🔥 修复双重嵌套问题：直接返回切割结果数据
            return {
                "success": True,
                "data": {
                    "original_fence_id": result.get("original_fence_id"),
                    "new_fence_ids": result.get("new_fence_ids"),
                    "parts_count": result.get("parts_count"),
                    "overlaps_detected": result.get("overlaps_detected"),
                    "overlaps_count": result.get("overlaps_count")
                },
                "message": "围栏切割成功"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get('error', '围栏切割失败'))
    
    except Exception as e:
        logger.error(f"切割围栏API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# 围栏统计和管理
# ==============================================================================

@fence_router.get("/api/fences/statistics/summary", summary="围栏统计", description="获取围栏系统的统计信息")
async def get_fence_statistics_endpoint():
    """获取围栏统计"""
    try:
        result = await get_fence_statistics()
        
        if result.get('success'):
            # 🔥 修复双重嵌套问题：直接返回统计数据
            return {
                "success": True,
                "data": {
                    "basic_statistics": result.get("basic_statistics"),
                    "overlap_statistics": result.get("overlap_statistics"), 
                    "layer_statistics": result.get("layer_statistics"),
                    "history_statistics": result.get("history_statistics"),
                    "generated_at": result.get("generated_at")
                },
                "message": "统计信息获取成功"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get('error', '统计信息获取失败'))
    
    except Exception as e:
        logger.error(f"获取围栏统计API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# 围栏导入导出
# ==============================================================================

@fence_router.get("/api/fences/export/geojson", summary="导出围栏为GeoJSON", description="将围栏数据导出为GeoJSON格式")
async def export_fences_endpoint(
    fence_ids: Optional[str] = Query(None, description="围栏ID列表，多个用逗号分隔"),
    include_properties: bool = Query(True, description="是否包含属性信息")
):
    """导出围栏为GeoJSON"""
    try:
        fence_ids_list = None
        if fence_ids:
            fence_ids_list = [int(id.strip()) for id in fence_ids.split(',')]
        
        result = await export_fences_geojson(
            fence_ids=fence_ids_list,
            include_properties=include_properties
        )
        
        if result.get('success'):
            # 🔥 修复双重嵌套问题：直接返回导出数据
            return {
                "success": True,
                "data": {
                    "geojson": result.get("geojson"),
                    "fence_count": result.get("fence_count")
                },
                "message": "围栏导出成功"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get('error', '围栏导出失败'))
    
    except Exception as e:
        logger.error(f"导出围栏API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@fence_router.post("/api/fences/import/geojson", summary="从GeoJSON导入围栏", description="从GeoJSON数据导入围栏")
async def import_fences_endpoint(
    geojson_data: Dict[str, Any] = Body(..., description="GeoJSON数据"),
    current_user_id: Optional[int] = Depends(get_current_user_id)
):
    """从GeoJSON导入围栏"""
    try:
        result = await import_fences_geojson(
            geojson_data=geojson_data,
            operator_id=current_user_id
        )
        
        if result.get('success'):
            # 🔥 修复双重嵌套问题：直接返回导入结果数据
            return {
                "success": True,
                "data": {
                    "imported_count": result.get("imported_count"),
                    "skipped_count": result.get("skipped_count"),
                    "error_count": result.get("error_count"),
                    "total_features": result.get("total_features"),
                    "results": result.get("results")
                },
                "message": "围栏导入成功"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get('error', '围栏导入失败'))
    
    except Exception as e:
        logger.error(f"导入围栏API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@fence_router.post("/api/fences/import/file", summary="从文件导入围栏", description="从上传的文件导入围栏")
async def import_fences_from_file_endpoint(
    file: UploadFile = File(..., description="围栏文件（GeoJSON格式）"),
    current_user_id: Optional[int] = Depends(get_current_user_id)
):
    """从文件导入围栏"""
    try:
        # 检查文件类型
        if not file.filename or (not file.filename.endswith('.geojson') and not file.filename.endswith('.json')):
            raise HTTPException(status_code=400, detail="只支持GeoJSON格式文件")
        
        # 读取文件内容
        contents = await file.read()
        
        try:
            geojson_data = json.loads(contents)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="文件格式错误，无法解析JSON")
        
        result = await import_fences_geojson(
            geojson_data=geojson_data,
            operator_id=current_user_id
        )
        
        if result.get('success'):
            # 🔥 修复双重嵌套问题：直接返回导入结果数据
            return {
                "success": True,
                "data": {
                    "imported_count": result.get("imported_count"),
                    "skipped_count": result.get("skipped_count"),
                    "error_count": result.get("error_count"),
                    "total_features": result.get("total_features"),
                    "results": result.get("results")
                },
                "message": "围栏导入成功"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get('error', '围栏导入失败'))
    
    except Exception as e:
        logger.error(f"从文件导入围栏API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# 围栏组管理
# ==============================================================================

@fence_router.get("/api/fence-groups/", summary="获取围栏组列表", description="获取所有围栏组")
async def get_fence_groups_endpoint():
    """获取围栏组列表"""
    try:
        from services import get_db_connection
        
        pool = await get_db_connection(read_only=True)
        async with pool.acquire() as conn:
            groups = await conn.fetch("""
                SELECT 
                    id, group_name, group_description, group_color, 
                    group_tags, parent_group_id, created_at, created_by,
                    (SELECT COUNT(*) FROM electronic_fences WHERE group_id = fg.id AND fence_status = 'active') as fence_count
                FROM fence_groups fg
                ORDER BY group_name
            """)
            
            groups_list = []
            for group in groups:
                group_dict = dict(group)
                if group_dict.get('group_tags'):
                    group_dict['group_tags'] = json.loads(group_dict['group_tags'])
                groups_list.append(group_dict)
            
            return {
                "success": True,
                "data": {
                    "groups": groups_list,
                    "total_count": len(groups_list)
                },
                "message": "围栏组列表获取成功"
            }
    
    except Exception as e:
        logger.error(f"获取围栏组列表API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@fence_router.post("/api/fence-groups/", summary="创建围栏组", description="创建新的围栏组")
async def create_fence_group_endpoint(
    group_name: str = Body(..., description="组名称"),
    group_description: Optional[str] = Body(None, description="组描述"),
    group_color: str = Body("#0066CC", description="组颜色"),
    group_tags: Optional[Dict[str, Any]] = Body(None, description="组标签"),
    parent_group_id: Optional[int] = Body(None, description="父组ID"),
    current_user_id: Optional[int] = Depends(get_current_user_id)
):
    """创建围栏组"""
    try:
        from services import get_db_connection
        
        pool = await get_db_connection()
        async with pool.acquire() as conn:
            group_id = await conn.fetchval("""
                INSERT INTO fence_groups (
                    group_name, group_description, group_color, 
                    group_tags, parent_group_id, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            """, group_name, group_description, group_color,
                 json.dumps(group_tags) if group_tags else None,
                 parent_group_id, current_user_id)
            
            return {
                "success": True,
                "data": {
                    "group_id": group_id,
                    "group_name": group_name
                },
                "message": "围栏组创建成功"
            }
    
    except Exception as e:
        logger.error(f"创建围栏组API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# 围栏历史记录
# ==============================================================================

@fence_router.get("/api/fences/{fence_id}/history", summary="获取围栏历史", description="获取围栏的变更历史记录")
async def get_fence_history_endpoint(
    fence_id: int = Path(..., description="围栏ID"),
    limit: int = Query(50, ge=1, le=200, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量")
):
    """获取围栏历史"""
    try:
        from services import get_db_connection
        
        pool = await get_db_connection(read_only=True)
        async with pool.acquire() as conn:
            # 检查围栏是否存在
            fence_exists = await conn.fetchval("""
                SELECT EXISTS(SELECT 1 FROM electronic_fences WHERE id = $1)
            """, fence_id)
            
            if not fence_exists:
                raise HTTPException(status_code=404, detail="围栏不存在")
            
            # 获取历史记录
            history = await conn.fetch("""
                SELECT 
                    id, operation_type, changes_summary, change_reason,
                    operated_by, operated_at,
                    ST_AsGeoJSON(old_geometry) as old_geometry,
                    ST_AsGeoJSON(new_geometry) as new_geometry
                FROM fence_history
                WHERE fence_id = $1
                ORDER BY operated_at DESC
                LIMIT $2 OFFSET $3
            """, fence_id, limit, offset)
            
            # 获取总数
            total_count = await conn.fetchval("""
                SELECT COUNT(*) FROM fence_history WHERE fence_id = $1
            """, fence_id)
            
            history_list = []
            for record in history:
                history_dict = dict(record)
                
                # 解析JSON字段
                if history_dict.get('changes_summary'):
                    history_dict['changes_summary'] = json.loads(history_dict['changes_summary'])
                if history_dict.get('old_geometry'):
                    history_dict['old_geometry'] = json.loads(history_dict['old_geometry'])
                if history_dict.get('new_geometry'):
                    history_dict['new_geometry'] = json.loads(history_dict['new_geometry'])
                
                history_list.append(history_dict)
            
            return {
                "success": True,
                "data": {
                    "fence_id": fence_id,
                    "history": history_list,
                    "total_count": total_count,
                    "returned_count": len(history_list),
                    "limit": limit,
                    "offset": offset
                },
                "message": "围栏历史获取成功"
            }
    
    except Exception as e:
        logger.error(f"获取围栏历史API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# 围栏验证工具
# ==============================================================================

@fence_router.post("/api/fences/validate-geometry", summary="验证围栏几何", description="验证围栏几何数据是否有效")
async def validate_fence_geometry_endpoint(
    geometry: Union[FenceGeometry, str] = Body(..., description="围栏几何数据")
):
    """验证围栏几何"""
    try:
        from fence_services import validate_geometry
        
        if isinstance(geometry, FenceGeometry):
            geometry_data = geometry.dict()
        else:
            geometry_data = geometry
        
        is_valid = validate_geometry(geometry_data)
        
        return {
            "success": True,
            "data": {
                "is_valid": is_valid,
                "geometry_type": geometry_data.get('type') if isinstance(geometry_data, dict) else 'WKT'
            },
            "message": "几何验证完成"
        }
    
    except Exception as e:
        logger.error(f"验证围栏几何API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@fence_router.post("/api/fences/check-overlaps", summary="检查围栏重叠", description="检查新围栏是否与现有围栏重叠")
async def check_fence_overlaps_endpoint(
    geometry: Union[FenceGeometry, str] = Body(..., description="围栏几何数据"),
    exclude_fence_id: Optional[int] = Body(None, description="排除的围栏ID")
):
    """检查围栏重叠"""
    try:
        from fence_services import convert_geojson_to_wkt, validate_geometry
        from services import get_db_connection
        
        # 验证几何
        if isinstance(geometry, FenceGeometry):
            geometry_data = geometry.dict()
        else:
            geometry_data = geometry
        
        if not validate_geometry(geometry_data):
            raise HTTPException(status_code=400, detail="无效的几何数据")
        
        # 转换为WKT
        if isinstance(geometry_data, dict):
            wkt_geometry = convert_geojson_to_wkt(geometry_data)
        else:
            wkt_geometry = geometry_data
        
        pool = await get_db_connection(read_only=True)
        async with pool.acquire() as conn:
            # 检查重叠
            where_clause = "fence_status = 'active'"
            params = [wkt_geometry]
            
            if exclude_fence_id:
                where_clause += " AND id != $2"
                params.append(str(exclude_fence_id))
            
            overlapping_fences = await conn.fetch(f"""
                SELECT 
                    id, fence_name, fence_type, fence_purpose,
                    ST_Area(ST_Intersection(fence_geometry, ST_GeomFromText($1, 4326))::geography) as overlap_area,
                    (ST_Area(ST_Intersection(fence_geometry, ST_GeomFromText($1, 4326))::geography) / 
                     ST_Area(ST_GeomFromText($1, 4326)::geography)) * 100 as overlap_percentage
                FROM electronic_fences
                WHERE {where_clause}
                  AND ST_Intersects(fence_geometry, ST_GeomFromText($1, 4326))
                  AND ST_Area(ST_Intersection(fence_geometry, ST_GeomFromText($1, 4326))) > 0
                ORDER BY overlap_area DESC
            """, *params)
            
            overlaps = [dict(fence) for fence in overlapping_fences]
            
            return {
                "success": True,
                "data": {
                    "has_overlaps": len(overlaps) > 0,
                    "overlap_count": len(overlaps),
                    "overlapping_fences": overlaps
                },
                "message": "重叠检查完成"
            }
    
    except Exception as e:
        logger.error(f"检查围栏重叠API失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) 