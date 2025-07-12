import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Alert,
  CircularProgress,
  Tooltip,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  Fab,
  Badge
} from '@mui/material';
import {
  Close,
  Add,
  Edit,
  Delete,
  Visibility,
  VisibilityOff,
  Search,
  Refresh,
  Map,
  Analytics,
  Warning,
  CheckCircle,
  Info
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import FenceDetailDialog from './FenceDetailDialog';

/**
 * 内联API函数 - 获取围栏列表
 */
const getFenceList = async (apiBaseUrl, params = {}) => {
  const urlParams = new URLSearchParams();
  
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      urlParams.append(key, params[key]);
    }
  });

  const response = await fetch(`${apiBaseUrl}/api/fences?${urlParams}`);
  
  if (!response.ok) {
    throw new Error(`获取围栏列表失败: ${response.status}`);
  }

  return await response.json();
};

/**
 * 内联API函数 - 删除围栏
 */
const deleteFence = async (apiBaseUrl, fenceId) => {
  const response = await fetch(`${apiBaseUrl}/api/fences/${fenceId}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    throw new Error(`删除围栏失败: ${response.status}`);
  }

  return await response.json();
};

/**
 * 围栏管理器主组件
 */
const FenceManager = ({ 
  open, 
  onClose, 
  apiBaseUrl, 
  mapInstance, 
  currentBounds, 
  onFenceSelect, 
  onFenceCreate, 
  onFenceEdit, 
  onFenceUpdate, 
  onFenceDelete,
  toolbarVisible = false 
}) => {
  const { t } = useTranslation();
  
  // 围栏数据管理
  const [fences, setFences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  // 组件状态
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedFence, setSelectedFence] = useState(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);

  // 加载围栏数据
  const loadFenceData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        status: statusFilter,
        limit: pageSize,
        offset: page * pageSize
      };

      if (typeFilter) {
        params.fence_type = typeFilter;
      }

      // 🔥 围栏管理器不使用bbox过滤，显示全部围栏便于管理
      // if (currentBounds) {
      //   const bbox = `${currentBounds.getWest()},${currentBounds.getSouth()},${currentBounds.getEast()},${currentBounds.getNorth()}`;
      //   params.bbox = bbox;
      // }

      const response = await getFenceList(apiBaseUrl, params);
      
      if (response.success) {
        setFences(response.data.fences || []);
        setTotalCount(response.data.total_count || 0);
      } else {
        setError(response.error || '加载围栏数据失败');
      }
    } catch (error) {
      console.error('加载围栏数据失败:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, statusFilter, typeFilter, page, pageSize]); // 移除currentBounds依赖

  // 组件挂载时加载数据
  useEffect(() => {
    if (open) {
      loadFenceData();
    }
  }, [open, loadFenceData]);

  // 搜索功能
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      loadFenceData();
      return;
    }

    try {
      // 这里可以实现搜索逻辑
      // 暂时使用过滤已加载的数据
      console.log('搜索围栏:', searchQuery);
    } catch (error) {
      console.error('搜索围栏失败:', error);
    }
  }, [searchQuery, loadFenceData]);

  // 查看围栏详情
  const handleViewDetail = useCallback((fence) => {
    setSelectedFence(fence);
    setShowDetailDialog(true);
    
    if (onFenceSelect) {
      onFenceSelect(fence);
    }
  }, [onFenceSelect]);

  // 编辑围栏
  const handleEdit = useCallback((fence) => {
    if (onFenceEdit) {
      onFenceEdit(fence);
    }
    // 关闭管理器对话框，让用户使用工具栏
    onClose();
  }, [onFenceEdit, onClose]);

  // 删除围栏
  const handleDelete = useCallback(async (fence) => {
    if (!window.confirm(t('fenceManager.confirmDelete', { name: fence.fence_name }))) {
      return;
    }

    try {
      setActionLoading(true);
      await deleteFence(apiBaseUrl, fence.id);
      
      if (onFenceDelete) {
        onFenceDelete(fence);
      }
      
      // 重新加载数据
      await loadFenceData();
      
      console.log(t('fenceManager.deleteSuccess'), fence.fence_name);
    } catch (error) {
      console.error(t('fenceManager.deleteFailed'), error);
      alert(t('fenceManager.deleteFailed') + ': ' + error.message);
    } finally {
      setActionLoading(false);
    }
  }, [apiBaseUrl, onFenceDelete, loadFenceData, t]);

  // 创建围栏
  const handleCreate = useCallback(() => {
    if (onFenceCreate) {
      onFenceCreate();
    }
    // 关闭管理器对话框，让用户使用工具栏
    onClose();
  }, [onFenceCreate, onClose]);

  // 刷新数据
  const handleRefresh = useCallback(() => {
    loadFenceData();
  }, [loadFenceData]);

  // 获取围栏状态颜色
  const getFenceStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'warning';
      case 'deleted':
        return 'error';
      default:
        return 'default';
    }
  };

  // 获取围栏状态图标
  const getFenceStatusIcon = (status) => {
    switch (status) {
      case 'active':
        return <CheckCircle />;
      case 'inactive':
        return <Warning />;
      case 'deleted':
        return <VisibilityOff />;
      default:
        return <Info />;
    }
  };

  // 格式化面积显示
  const formatArea = (area) => {
    if (!area) return 'N/A';
    if (area < 1000) {
      return `${area.toFixed(1)} m²`;
    } else if (area < 1000000) {
      return `${(area / 1000).toFixed(2)} km²`;
    } else {
      return `${(area / 1000000).toFixed(2)} km²`;
    }
  };

  // 过滤围栏数据
  const filteredFences = fences.filter(fence => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return (
        fence.fence_name.toLowerCase().includes(query) ||
        (fence.fence_purpose && fence.fence_purpose.toLowerCase().includes(query)) ||
        (fence.fence_description && fence.fence_description.toLowerCase().includes(query))
      );
    }
    return true;
  });

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { minHeight: '70vh', maxHeight: '90vh' }
        }}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1}>
              <Map color="primary" />
              <Typography variant="h6">{t('fenceManager.title')}</Typography>
              <Badge badgeContent={totalCount} color="primary" max={999}>
                <Chip size="small" label={t('fenceManager.fences')} />
              </Badge>
            </Box>
            <IconButton onClick={onClose} size="small">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          {/* 工具栏 */}
          <Paper sx={{ p: 2, mb: 2 }}>
            {toolbarVisible && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {t('fenceManager.toolbarActive')}
              </Alert>
            )}
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder={t('fenceManager.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  InputProps={{
                    endAdornment: (
                      <IconButton size="small" onClick={handleSearch}>
                        <Search />
                      </IconButton>
                    )
                  }}
                />
              </Grid>
              <Grid item xs={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('fenceManager.status')}</InputLabel>
                  <Select
                    value={statusFilter}
                    label={t('fenceManager.status')}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <MenuItem value="active">{t('fenceManager.active')}</MenuItem>
                    <MenuItem value="inactive">{t('fenceManager.inactive')}</MenuItem>
                    <MenuItem value="">{t('fenceManager.all')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('fenceManager.type')}</InputLabel>
                  <Select
                    value={typeFilter}
                    label={t('fenceManager.type')}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    <MenuItem value="">{t('fenceManager.all')}</MenuItem>
                    <MenuItem value="polygon">{t('fenceManager.polygon')}</MenuItem>
                    <MenuItem value="circle">{t('fenceManager.circle')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <Box display="flex" gap={1}>
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={handleCreate}
                    disabled={toolbarVisible}
                    size="small"
                  >
                    {t('fenceManager.newFence')}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<Refresh />}
                    onClick={handleRefresh}
                    disabled={loading}
                    size="small"
                  >
                    {t('fenceManager.refresh')}
                  </Button>

                </Box>
              </Grid>
            </Grid>
          </Paper>

          {/* 错误提示 */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* 加载状态 */}
          {loading && (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          )}

          {/* 围栏列表 */}
          {!loading && (
            <>
              {filteredFences.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    {t('fenceManager.noFencesFound')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {searchQuery ? t('fenceManager.adjustSearchCriteria') : t('fenceManager.clickToCreateFence')}
                  </Typography>
                </Paper>
              ) : (
                <Grid container spacing={2}>
                  {filteredFences.map((fence) => (
                    <Grid item xs={12} sm={6} md={4} key={fence.id}>
                      <Card 
                        sx={{ 
                          height: '100%',
                          cursor: 'pointer',
                          '&:hover': {
                            boxShadow: 3
                          }
                        }}
                        onClick={() => handleViewDetail(fence)}
                      >
                        <CardContent>
                          <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                            <Typography variant="h6" component="div" noWrap>
                              {fence.fence_name}
                            </Typography>
                            <Chip
                              size="small"
                              icon={getFenceStatusIcon(fence.fence_status)}
                              label={fence.fence_status}
                              color={getFenceStatusColor(fence.fence_status)}
                            />
                          </Box>
                          
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            {t('fenceManager.type')}: {fence.fence_type || 'N/A'}
                          </Typography>
                          
                          {fence.fence_purpose && (
                            <Typography variant="body2" color="text.secondary" gutterBottom>
                              {t('fenceManager.purpose')}: {fence.fence_purpose}
                            </Typography>
                          )}
                          
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            {t('fenceManager.area')}: {formatArea(fence.fence_area)}
                          </Typography>
                          
                          {fence.fence_description && (
                            <Typography 
                              variant="body2" 
                              color="text.secondary"
                              sx={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }}
                            >
                              {fence.fence_description}
                            </Typography>
                          )}

                          <Box display="flex" gap={0.5} mt={1} flexWrap="wrap">
                            {fence.group_id && (
                              <Chip size="small" label={`${t('fenceManager.group')}:${fence.group_id}`} />
                            )}
                            {fence.fence_level && (
                              <Chip size="small" label={`${t('fenceManager.level')}:${fence.fence_level}`} />
                            )}
                          </Box>
                        </CardContent>
                        
                        <CardActions>
                          <Button 
                            size="small" 
                            startIcon={<Visibility />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDetail(fence);
                            }}
                          >
                            {t('fenceManager.details')}
                          </Button>
                          <Button 
                            size="small" 
                            startIcon={<Edit />}
                            disabled={toolbarVisible}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(fence);
                            }}
                          >
                            {t('fenceManager.edit')}
                          </Button>
                          <Button 
                            size="small" 
                            color="error"
                            startIcon={<Delete />}
                            disabled={actionLoading}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(fence);
                            }}
                          >
                            {t('fenceManager.delete')}
                          </Button>
                        </CardActions>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}

              {/* 分页信息 */}
              {totalCount > pageSize && (
                <Box mt={3} display="flex" justifyContent="center" alignItems="center" gap={2}>
                  <Typography variant="body2" color="text.secondary">
                    {t('fenceManager.showing')} {page * pageSize + 1} - {Math.min((page + 1) * pageSize, totalCount)} {t('fenceManager.of')} {totalCount} {t('fenceManager.items')}
                  </Typography>
                  <Box>
                    <Button
                      size="small"
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      {t('fenceManager.previousPage')}
                    </Button>
                    <Button
                      size="small"
                      disabled={(page + 1) * pageSize >= totalCount}
                      onClick={() => setPage(page + 1)}
                    >
                      {t('fenceManager.nextPage')}
                    </Button>
                  </Box>
                </Box>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {t('fenceManager.loaded')} {filteredFences.length} {t('fenceManager.fencesCount')}
          </Typography>
          <Button onClick={onClose}>{t('fenceManager.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* 围栏详情对话框 */}
      <FenceDetailDialog
        open={showDetailDialog}
        onClose={() => {
          setShowDetailDialog(false);
          setSelectedFence(null);
        }}
        fence={selectedFence}
        apiBaseUrl={apiBaseUrl}
        mapInstance={mapInstance}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* 工具栏激活提示 */}
      {toolbarVisible && (
        <Alert severity="info" sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: 9999 }}>
          {t('fenceManager.toolbarActive')}
        </Alert>
      )}
    </>
  );
};

export default FenceManager; 