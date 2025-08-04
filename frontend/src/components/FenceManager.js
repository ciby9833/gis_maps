// 围栏列表管理组件
import React, { useState, useEffect, useCallback } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, IconButton, Box, Typography, TextField, FormControl, InputLabel, Select, MenuItem, Chip, Alert, CircularProgress, Paper, Grid, Card, CardContent, CardActions, Badge } from "@mui/material";
import { Close, Add, Edit, Delete, Visibility, Search, Refresh, Map, CheckCircle, Warning, VisibilityOff, Info } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import FenceDetailDialog from "./FenceDetailDialog";
import { useLoadingState } from "../hooks/useLoadingState";
import { getFenceList, deleteFence, formatArea, getFenceStatusColor, Z_INDEX, getConfirmMessage, normalizeError } from "../utils/fenceUtils";

/**
 * 围栏管理器主组件
 * 简化后的版本，移除重复逻辑
 */
const FenceManager = ({ open, onClose, mapInstance, onFenceSelect, onFenceCreate, onFenceEdit, onFenceUpdate, onFenceDelete, toolbarVisible = false }) => {
  const { t } = useTranslation();

  // 统一的loading状态管理
  const { loading, error, startLoading, stopLoading, setErrorState } = useLoadingState();

  // 围栏数据管理
  const [fences, setFences] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  // 组件状态
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedFence, setSelectedFence] = useState(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);

  // 加载围栏数据
  const loadFenceData = useCallback(async () => {
    try {
      startLoading();

      const params = {
        status: statusFilter,
        limit: pageSize,
        offset: page * pageSize,
      };

      if (typeFilter) {
        params.fence_type = typeFilter;
      }

      const response = await getFenceList(params);

      if (response.success) {
        setFences(response.data.fences || []);
        setTotalCount(response.data.total_count || 0);
      } else {
        setErrorState(response.error || "加载围栏数据失败");
      }
    } catch (error) {
      console.error("加载围栏数据失败:", error);
      setErrorState(normalizeError(error));
    } finally {
      stopLoading();
    }
  }, [statusFilter, typeFilter, page, pageSize, startLoading, stopLoading, setErrorState]);

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
    // 这里可以实现搜索逻辑
  }, [searchQuery, loadFenceData]);

  // 查看围栏详情
  const handleViewDetail = useCallback(
    (fence) => {
      setSelectedFence(fence);
      setShowDetailDialog(true);

      if (onFenceSelect) {
        onFenceSelect(fence);
      }
    },
    [onFenceSelect]
  );

  // 编辑围栏
  const handleEdit = useCallback(
    (fence) => {
      if (onFenceEdit) {
        onFenceEdit(fence);
      }
      onClose();
    },
    [onFenceEdit, onClose]
  );

  // 删除围栏
  const handleDelete = useCallback(
    async (fence) => {
      if (!window.confirm(t("fenceManager.confirmDelete", { name: fence.fence_name }))) {
        return;
      }
      try {
        startLoading();
        await deleteFence(fence.id);

        if (onFenceDelete) {
          onFenceDelete(fence);
        }

        await loadFenceData();
      } catch (error) {
        console.error(t("fenceManager.deleteFailed"), error);
        setErrorState(normalizeError(error));
      } finally {
        stopLoading();
      }
    },
    [onFenceDelete, loadFenceData, startLoading, stopLoading, setErrorState]
  );

  // 创建围栏
  const handleCreate = useCallback(() => {
    if (onFenceCreate) {
      onFenceCreate();
    }
    onClose();
  }, [onFenceCreate, onClose]);

  // 刷新数据
  const handleRefresh = useCallback(() => {
    loadFenceData();
  }, [loadFenceData]);

  // 过滤围栏数据
  const filteredFences = fences.filter((fence) => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return fence.fence_name.toLowerCase().includes(query) || (fence.fence_purpose && fence.fence_purpose.toLowerCase().includes(query)) || (fence.fence_description && fence.fence_description.toLowerCase().includes(query));
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
          sx: {
            minHeight: "70vh",
            maxHeight: "90vh",
            zIndex: Z_INDEX.DIALOG,
          },
        }}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1}>
              <Map color="primary" />
              <Typography variant="h6">{t("fenceManager.title")}</Typography>
              <Badge badgeContent={totalCount} color="primary" max={999}>
                <Chip size="small" label={t("fenceManager.fences")} />
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
                {t("fenceManager.toolbarActive")}
              </Alert>
            )}
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder={t("fenceManager.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  InputProps={{
                    endAdornment: (
                      <IconButton size="small" onClick={handleSearch}>
                        <Search />
                      </IconButton>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t("fenceManager.status")}</InputLabel>
                  <Select value={statusFilter} label={t("fenceManager.status")} onChange={(e) => setStatusFilter(e.target.value)}>
                    <MenuItem value="active">{t("fenceManager.active")}</MenuItem>
                    <MenuItem value="inactive">{t("fenceManager.inactive")}</MenuItem>
                    <MenuItem value="">{t("fenceManager.all")}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t("fenceManager.type")}</InputLabel>
                  <Select value={typeFilter} label={t("fenceManager.type")} onChange={(e) => setTypeFilter(e.target.value)}>
                    <MenuItem value="">{t("fenceManager.all")}</MenuItem>
                    <MenuItem value="polygon">{t("fenceManager.polygon")}</MenuItem>
                    <MenuItem value="circle">{t("fenceManager.circle")}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <Box display="flex" gap={1}>
                  <Button variant="contained" startIcon={<Add />} onClick={handleCreate} disabled={toolbarVisible} size="small">
                    {t("fenceManager.newFence")}
                  </Button>
                  <Button variant="outlined" startIcon={<Refresh />} onClick={handleRefresh} disabled={loading} size="small">
                    {t("fenceManager.refresh")}
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
                <Paper sx={{ p: 4, textAlign: "center" }}>
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    {t("fenceManager.noFencesFound")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {searchQuery ? t("fenceManager.adjustSearchCriteria") : t("fenceManager.clickToCreateFence")}
                  </Typography>
                </Paper>
              ) : (
                <Grid container spacing={2}>
                  {filteredFences.map((fence) => (
                    <Grid item xs={12} sm={6} md={4} key={fence.id}>
                      <Card
                        sx={{
                          height: "100%",
                          cursor: "pointer",
                          "&:hover": {
                            boxShadow: 3,
                          },
                        }}
                        onClick={() => handleViewDetail(fence)}
                      >
                        <CardContent>
                          <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                            <Typography variant="h6" component="div" noWrap>
                              {fence.fence_name}
                            </Typography>
                            <Chip size="small" icon={fence.fence_status === "active" ? <CheckCircle /> : fence.fence_status === "inactive" ? <Warning /> : fence.fence_status === "deleted" ? <VisibilityOff /> : <Info />} label={fence.fence_status} color={getFenceStatusColor(fence.fence_status)} />
                          </Box>

                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            {t("fenceManager.type")}: {fence.fence_type || "N/A"}
                          </Typography>

                          {fence.fence_purpose && (
                            <Typography variant="body2" color="text.secondary" gutterBottom>
                              {t("fenceManager.purpose")}: {fence.fence_purpose}
                            </Typography>
                          )}

                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            {t("fenceManager.area")}: {formatArea(fence.fence_area)}
                          </Typography>

                          {fence.fence_description && (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                              }}
                            >
                              {fence.fence_description}
                            </Typography>
                          )}

                          <Box display="flex" gap={0.5} mt={1} flexWrap="wrap">
                            {fence.group_id && <Chip size="small" label={`${t("fenceManager.group")}:${fence.group_id}`} />}
                            {fence.fence_level && <Chip size="small" label={`${t("fenceManager.level")}:${fence.fence_level}`} />}
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
                            {t("fenceManager.details")}
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
                            {t("fenceManager.edit")}
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            startIcon={<Delete />}
                            disabled={loading}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(fence);
                            }}
                          >
                            {t("fenceManager.delete")}
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
                    {t("fenceManager.showing")} {page * pageSize + 1} - {Math.min((page + 1) * pageSize, totalCount)} {t("fenceManager.of")} {totalCount} {t("fenceManager.items")}
                  </Typography>
                  <Box>
                    <Button size="small" disabled={page === 0} onClick={() => setPage(page - 1)}>
                      {t("fenceManager.previousPage")}
                    </Button>
                    <Button size="small" disabled={(page + 1) * pageSize >= totalCount} onClick={() => setPage(page + 1)}>
                      {t("fenceManager.nextPage")}
                    </Button>
                  </Box>
                </Box>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {t("fenceManager.loaded")} {filteredFences.length} {t("fenceManager.fencesCount")}
          </Typography>
          <Button onClick={onClose}>{t("fenceManager.close")}</Button>
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
        mapInstance={mapInstance}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* 工具栏激活提示 */}
      {toolbarVisible && (
        <Alert severity="info" sx={{ position: "fixed", bottom: 16, right: 16, zIndex: Z_INDEX.ALERT }}>
          {t("fenceManager.toolbarActive")}
        </Alert>
      )}
    </>
  );
};

export default FenceManager;
