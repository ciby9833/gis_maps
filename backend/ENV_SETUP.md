# 环境变量配置说明

## 概述
本项目使用环境变量来管理敏感配置信息，避免在代码中硬编码敏感数据。

## 环境变量配置

### 1. 创建 .env 文件

在 `backend/` 目录下创建 `.env` 文件：

```bash
# Google API配置
GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY_HERE
GOOGLE_LANGUAGE=id,en
GOOGLE_REGION=id
GOOGLE_TIMEOUT=5
GOOGLE_MAX_RETRIES=3

# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gisdb
DB_USER=postgres
DB_PASSWORD=your_password_here

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=

# 其他配置
DEBUG=false
```

### 2. 环境变量说明

#### Google API配置
- `GOOGLE_API_KEY`: Google Geocoding API 密钥（必需）
- `GOOGLE_LANGUAGE`: 语言设置，默认为 'id,en'
- `GOOGLE_REGION`: 地区设置，默认为 'id'
- `GOOGLE_TIMEOUT`: 请求超时时间（秒），默认为 5
- `GOOGLE_MAX_RETRIES`: 最大重试次数，默认为 3

#### 数据库配置
- `DB_HOST`: 数据库主机地址
- `DB_PORT`: 数据库端口
- `DB_NAME`: 数据库名称
- `DB_USER`: 数据库用户名
- `DB_PASSWORD`: 数据库密码

#### Redis配置
- `REDIS_HOST`: Redis服务器地址
- `REDIS_PORT`: Redis服务器端口
- `REDIS_DB`: Redis数据库编号
- `REDIS_PASSWORD`: Redis密码（可选）

### 3. 获取Google API密钥

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 "Geocoding API"
4. 创建API密钥
5. 将密钥复制到 `.env` 文件中的 `GOOGLE_API_KEY` 变量

### 4. 安全注意事项

- 请勿将 `.env` 文件提交到版本控制系统
- 确保 `.env` 文件在 `.gitignore` 中被忽略
- 定期轮换API密钥
- 为API密钥设置适当的使用限制

### 5. 启动应用

确保配置完成后，按照以下步骤启动应用：

```bash
# 进入backend目录
cd backend

# 激活虚拟环境
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate     # Windows

# 安装依赖
pip install -r requirements.txt

# 启动应用
python main.py
```

### 6. 故障排除

如果遇到配置问题：

1. 检查 `.env` 文件是否存在且格式正确
2. 确认 Google API 密钥有效且具有正确权限
3. 检查数据库连接参数是否正确
4. 查看应用日志以获取更多错误信息 