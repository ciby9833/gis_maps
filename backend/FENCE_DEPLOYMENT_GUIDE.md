# 电子围栏功能部署和使用指南

## 📋 目录

1. [功能概述](#功能概述)
2. [系统要求](#系统要求)
3. [部署步骤](#部署步骤)
4. [数据库初始化](#数据库初始化)
5. [API使用指南](#api使用指南)
6. [功能特性](#功能特性)
7. [性能优化](#性能优化)
8. [故障排除](#故障排除)
9. [最佳实践](#最佳实践)

## 🎯 功能概述

电子围栏功能是基于PostGIS的高性能地理围栏管理系统，提供以下核心功能：

### 核心功能
- ✅ **围栏管理**：创建、更新、删除、查询围栏
- ✅ **重叠检测**：自动检测围栏重叠并提供详细分析
- ✅ **图层分析**：分析围栏内的地理要素（建筑、道路、POI等）
- ✅ **高级操作**：围栏合并、切割、几何验证
- ✅ **权限管理**：基于用户和角色的权限控制
- ✅ **历史追踪**：完整的操作历史记录和版本控制
- ✅ **导入导出**：支持GeoJSON格式的批量导入导出
- ✅ **性能优化**：多层缓存、空间索引、查询优化

### 技术特点
- 🚀 **高并发**：支持大量并发用户和操作
- 🔄 **实时分析**：实时重叠检测和图层分析
- 💾 **智能缓存**：内存+Redis多层缓存策略
- 🗄️ **空间优化**：PostGIS空间索引和优化查询
- 🔍 **精确计算**：支持多种坐标系和精确面积计算

## 💻 系统要求

### 基础环境
- **操作系统**：Linux/macOS/Windows
- **Python**：3.8+
- **PostgreSQL**：12+ (带PostGIS扩展)
- **Redis**：6.0+ (可选，用于分布式缓存)

### 硬件要求
- **内存**：最少4GB，推荐8GB+
- **存储**：SSD存储，最少20GB可用空间
- **网络**：稳定的网络连接

### 软件依赖
```
fastapi==0.104.1
uvicorn[standard]==0.24.0
asyncpg==0.30.0
psycopg2-binary==2.9.10
shapely==2.0.3
pyproj==3.6.1
redis==5.0.1
pydantic==2.5.0
aiofiles==23.2.0
```

## 🚀 部署步骤

### 1. 环境准备

```bash
# 创建Python虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/macOS
# 或
venv\Scripts\activate     # Windows

# 安装依赖
pip install -r requirements.txt
```

### 2. 数据库配置

```bash
# 确保PostgreSQL已安装PostGIS扩展
sudo apt-get install postgresql-12-postgis-3  # Ubuntu/Debian
# 或
brew install postgis  # macOS
```

### 3. 配置文件设置

编辑 `config.py` 文件，设置数据库连接信息：

```python
# 数据库配置
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'your_gis_db',
    'user': 'your_db_user',
    'password': 'your_password'
}

# 异步数据库配置
ASYNC_DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'your_gis_db',
    'user': 'your_db_user',
    'password': 'your_password',
    'min_size': 5,
    'max_size': 20
}
```

### 4. Redis配置（可选）

```python
# Redis配置
REDIS_CONFIG = {
    'host': 'localhost',
    'port': 6379,
    'db': 0,
    'password': None  # 如果有密码请设置
}
```

## 🗄️ 数据库初始化

### 1. 创建数据库表结构

```bash
# 连接到PostgreSQL数据库
psql -U your_db_user -d your_gis_db

# 执行围栏表结构脚本
\i fence_schema.sql
```

### 2. 验证表结构

```sql
-- 检查围栏相关表是否创建成功
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%fence%';

-- 检查围栏统计视图
SELECT * FROM v_fence_statistics;
```

### 3. 测试数据库函数

```sql
-- 测试围栏重叠检测函数
SELECT * FROM detect_fence_overlaps(1);

-- 测试围栏图层分析函数
SELECT analyze_fence_layer_features(1, 'buildings');
```

## 🌐 API使用指南

### 启动服务

```bash
# 启动开发服务器
python main.py

# 或使用uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### API文档访问

- **Swagger UI**：http://localhost:8000/docs
- **ReDoc**：http://localhost:8000/redoc

### 基础API操作

#### 1. 创建围栏

```bash
curl -X POST "http://localhost:8000/api/fences" \
  -H "Content-Type: application/json" \
  -d '{
    "fence_name": "测试围栏",
    "fence_geometry": {
      "type": "Polygon",
      "coordinates": [[[106.8, -6.15], [106.85, -6.15], [106.85, -6.2], [106.8, -6.2], [106.8, -6.15]]]
    },
    "fence_purpose": "测试用途",
    "fence_description": "这是一个测试围栏",
    "fence_color": "#FF0000",
    "fence_opacity": 0.3
  }'
```

#### 2. 查询围栏列表

```bash
curl -X GET "http://localhost:8000/api/fences?status=active&limit=10"
```

#### 3. 获取围栏详情

```bash
curl -X GET "http://localhost:8000/api/fences/1?include_overlaps=true&include_layer_analysis=true"
```

#### 4. 检测围栏重叠

```bash
curl -X GET "http://localhost:8000/api/fences/1/overlaps"
```

#### 5. 围栏图层分析

```bash
curl -X GET "http://localhost:8000/api/fences/1/layer-analysis?layer_types=buildings,roads,pois"
```

#### 6. 合并围栏

```bash
curl -X POST "http://localhost:8000/api/fences/merge" \
  -H "Content-Type: application/json" \
  -d '{
    "fence_ids": [1, 2, 3],
    "new_fence_name": "合并后的围栏",
    "operator_id": 1
  }'
```

#### 7. 切割围栏

```bash
curl -X POST "http://localhost:8000/api/fences/split" \
  -H "Content-Type: application/json" \
  -d '{
    "fence_id": 1,
    "split_line": {
      "type": "LineString",
      "coordinates": [[106.82, -6.17], [106.83, -6.17]]
    },
    "operator_id": 1
  }'
```

#### 8. 导出围栏

```bash
curl -X GET "http://localhost:8000/api/fences/export/geojson?fence_ids=1,2,3&include_properties=true"
```

#### 9. 导入围栏

```bash
curl -X POST "http://localhost:8000/api/fences/import/geojson" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[106.8, -6.15], [106.85, -6.15], [106.85, -6.2], [106.8, -6.2], [106.8, -6.15]]]
        },
        "properties": {
          "fence_name": "导入的围栏",
          "fence_purpose": "导入测试"
        }
      }
    ]
  }'
```

## 🔧 功能特性

### 1. 围栏几何验证

系统自动验证围栏几何的有效性：

- **面积检查**：确保围栏面积在合理范围内
- **几何有效性**：检查多边形是否自相交或有其他几何问题
- **坐标范围**：验证坐标是否在有效范围内
- **顶点数量**：检查顶点数量是否符合要求

### 2. 重叠检测算法

智能重叠检测提供详细分析：

```python
# 重叠类型
- 'intersection': 相交重叠
- 'contains': 包含关系
- 'within': 被包含关系
- 'equals': 完全重合

# 重叠分析结果
{
  "overlapping_fence_id": 2,
  "overlap_area": 1250.5,     # 重叠面积（平方米）
  "overlap_percentage": 25.8,  # 重叠百分比
  "overlap_type": "intersection"
}
```

### 3. 图层分析功能

支持多种地理图层的分析：

```python
# 支持的图层类型
supported_layers = [
    'buildings',    # 建筑物
    'roads',        # 道路
    'pois',         # 兴趣点
    'water',        # 水体
    'railways',     # 铁路
    'landuse',      # 土地使用
    'natural',      # 自然特征
    'transport',    # 交通运输
    'traffic',      # 交通设施
    'worship'       # 宗教场所
]
```

### 4. 高级几何操作

#### 围栏合并
- 支持多个围栏合并为一个
- 自动处理几何拓扑关系
- 保留原始围栏的历史记录

#### 围栏切割
- 使用线几何切割多边形围栏
- 生成多个子围栏
- 自动命名和属性继承

### 5. 权限控制

完善的权限管理系统：

```python
# 权限类型
permission_types = [
    'read',    # 读取权限
    'write',   # 写入权限
    'delete',  # 删除权限
    'manage'   # 管理权限
]

# 权限级别
- 所有者：拥有全部权限
- 组权限：基于围栏组的权限
- 用户权限：特定用户权限
- 角色权限：基于角色的权限
```

## ⚡ 性能优化

### 1. 数据库优化

```sql
-- 关键空间索引
CREATE INDEX idx_fences_geometry ON electronic_fences USING GIST (fence_geometry);
CREATE INDEX idx_fences_bounds ON electronic_fences USING GIST (fence_bounds);
CREATE INDEX idx_fences_center ON electronic_fences USING GIST (fence_center);

-- 业务索引
CREATE INDEX idx_fences_status_level ON electronic_fences (fence_status, fence_level);
CREATE INDEX idx_fences_owner ON electronic_fences (owner_id);
```

### 2. 缓存策略

```python
# 缓存配置
FENCE_CACHE_CONFIG = {
    'fence_list_ttl': 300,          # 围栏列表缓存5分钟
    'fence_detail_ttl': 600,        # 围栏详情缓存10分钟
    'overlap_analysis_ttl': 900,    # 重叠分析缓存15分钟
    'layer_analysis_ttl': 1800,     # 图层分析缓存30分钟
    'fence_stats_ttl': 3600,        # 围栏统计缓存1小时
}
```

### 3. 并发控制

```python
# 连接池配置
ASYNC_DB_CONFIG = {
    'min_size': 5,          # 最小连接数
    'max_size': 20,         # 最大连接数
    'command_timeout': 120,  # 命令超时时间
}
```

### 4. 几何简化

```python
# 根据缩放级别简化几何
def simplify_geometry(wkt_geometry: str, zoom_level: int) -> str:
    tolerance = {
        10: 0.001,   # 高精度
        12: 0.0001,  # 中精度
        15: 0.00001  # 低精度
    }.get(zoom_level, 0.0001)
    
    return simplified_geometry
```

## 🔍 故障排除

### 常见问题及解决方案

#### 1. 数据库连接失败

```bash
# 检查数据库连接
psql -U your_db_user -d your_gis_db -c "SELECT version();"

# 检查PostGIS扩展
psql -U your_db_user -d your_gis_db -c "SELECT PostGIS_Version();"
```

#### 2. 围栏创建失败

```python
# 检查几何有效性
from shapely.geometry import Polygon
from shapely.validation import make_valid

# 修复无效几何
geom = Polygon(coordinates)
if not geom.is_valid:
    geom = make_valid(geom)
```

#### 3. 重叠检测性能问题

```sql
-- 检查空间索引
SELECT * FROM pg_indexes WHERE tablename = 'electronic_fences';

-- 重建索引
REINDEX INDEX idx_fences_geometry;
```

#### 4. 缓存问题

```python
# 清理缓存
import redis
r = redis.Redis(host='localhost', port=6379, db=0)
r.flushdb()
```

### 日志分析

```python
# 启用详细日志
logging.basicConfig(level=logging.DEBUG)

# 查看慢查询日志
tail -f logs/gis_service.log | grep "slow_query"
```

## 📋 最佳实践

### 1. 围栏设计原则

- **合理大小**：围栏面积应在10平方米到100平方公里之间
- **简化几何**：避免过于复杂的几何形状
- **避免重叠**：尽量避免不必要的围栏重叠
- **合理分组**：使用围栏组进行逻辑分类

### 2. 性能最佳实践

- **批量操作**：使用批量导入而不是单个创建
- **适当缓存**：合理设置缓存TTL
- **索引优化**：定期维护空间索引
- **查询优化**：使用边界框过滤减少查询范围

### 3. 安全最佳实践

- **权限控制**：为不同用户设置适当权限
- **输入验证**：严格验证输入数据
- **操作记录**：启用详细的操作日志
- **备份策略**：定期备份围栏数据

### 4. 运维最佳实践

- **监控告警**：设置围栏数量和重叠告警
- **性能监控**：监控API响应时间和数据库性能
- **容量规划**：根据业务增长规划存储和计算资源
- **定期维护**：定期清理历史数据和优化数据库

## 📊 监控和统计

### 围栏统计API

```bash
# 获取围栏统计信息
curl -X GET "http://localhost:8000/api/fences/statistics/summary"
```

### 关键指标监控

- **围栏总数**：活跃围栏数量
- **重叠率**：重叠围栏占比
- **平均面积**：围栏平均面积
- **操作频率**：创建、更新、删除频率
- **缓存命中率**：缓存性能指标
- **API响应时间**：接口性能指标

### 告警配置

```python
# 告警阈值配置
FENCE_MONITORING_CONFIG = {
    'alert_overlap_threshold': 20,       # 重叠告警阈值
    'alert_fence_count_threshold': 5000, # 围栏数量告警阈值
    'slow_operation_threshold': 2.0,     # 慢操作告警阈值
}
```

## 🔄 版本升级

### 升级步骤

1. **备份数据**
```bash
pg_dump -U your_db_user your_gis_db > backup_$(date +%Y%m%d).sql
```

2. **更新代码**
```bash
git pull origin main
pip install -r requirements.txt
```

3. **升级数据库**
```bash
# 执行数据库升级脚本
-- 执行数据库脚本
psql -U postgres -d gisdb -f fence_schema.sql
```

4. **重启服务**
```bash
systemctl restart gis-service
```

## 📞 技术支持

### 问题反馈

- **Issue报告**：在GitHub项目中创建Issue
- **邮件支持**：发送邮件到 support@example.com
- **在线文档**：访问 https://docs.example.com

### 社区资源

- **用户手册**：详细的用户操作指南
- **开发文档**：API开发文档和示例
- **最佳实践**：社区最佳实践分享
- **FAQ**：常见问题解答

---

# 激活虚拟环境
source venv/bin/activate  # Linux/Mac

# 方式1: 直接启动 (推荐)
python main.py

# 方式2: 使用uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000

# 方式3: 多进程启动 (生产环境)
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

