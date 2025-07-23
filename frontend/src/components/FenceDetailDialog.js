// 围栏详情对话框组件
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
  Chip,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Card,
  CardContent,
  Grid,
  TableContainer,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Table,
  Paper
} from '@mui/material';
import {
  Close,
  Edit,
  Delete,
  ExpandMore,
  Warning,
  Analytics,
  Info,
  CheckCircle,
  ErrorOutline,
  LocationOn,
  Layers,
  Square
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useLoadingState } from '../hooks/useLoadingState';
import { 
  detectFenceOverlaps, 
  getFenceLayerAnalysis,
  formatArea, 
  formatDateTime, 
  Z_INDEX,
  getOverlapSeverityColor,
  normalizeError
} from '../utils/fenceUtils';

/**
 * 围栏详情对话框组件
 * 简化后的版本，移除重复逻辑
 */
const FenceDetailDialog = ({ 
  open, 
  onClose, 
  fence, 
  mapInstance,
  onEdit,
  onDelete 
}) => {
  const { t } = useTranslation();

  // 统一的loading状态管理
  const { loading, error, startLoading, stopLoading, setErrorState } = useLoadingState();

  // 状态管理
  const [overlapData, setOverlapData] = useState(null);
  const [layerAnalysis, setLayerAnalysis] = useState(null);
  const [activeAccordion, setActiveAccordion] = useState('basic');

  // 加载详细数据
  const loadDetailData = useCallback(async () => {
    if (!fence || !fence.id) return;

    try {
      startLoading();

      // 并行加载重叠检测和图层分析
      const [overlapResult, layerResult] = await Promise.allSettled([
        detectFenceOverlaps(fence.id),
        getFenceLayerAnalysis(fence.id)
      ]);

      // 处理重叠检测结果
      if (overlapResult.status === 'fulfilled') {
        setOverlapData(overlapResult.value);
      }

      // 处理图层分析结果
      if (layerResult.status === 'fulfilled') {
        setLayerAnalysis(layerResult.value);
      }

    } catch (error) {
      console.error('加载围栏详情失败:', error);
      setErrorState(normalizeError(error));
    } finally {
      stopLoading();
    }
  }, [fence, startLoading, stopLoading, setErrorState]);

  // 组件打开时加载数据
  useEffect(() => {
    if (open && fence) {
      loadDetailData();
    }
  }, [open, fence, loadDetailData]);

  // 定位到围栏
  const focusOnFence = useCallback(() => {
    if (!mapInstance || !fence || !fence.geometry) return;

    try {
      if (fence.geometry.type === 'Polygon') {
        const coordinates = fence.geometry.coordinates[0];
        const bounds = coordinates.reduce((bounds, coord) => {
          return bounds.extend([coord[1], coord[0]]); // [lat, lng]
        }, L.latLngBounds());
        
        mapInstance.fitBounds(bounds, { padding: [20, 20] });
      }
    } catch (error) {
      console.error('定位到围栏失败:', error);
    }
  }, [mapInstance, fence]);

  if (!fence) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { 
          maxHeight: '90vh',
          zIndex: Z_INDEX.DIALOG
        }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box display="flex" alignItems="center" gap={1}>
            <Square sx={{ color: fence.fence_color || '#1976d2' }} />
            <Typography variant="h6">{fence.fence_name}</Typography>
            <Chip
              size="small"
              label={fence.fence_status}
              color={fence.fence_status === 'active' ? 'success' : 'warning'}
            />
          </Box>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading && (
          <Box display="flex" justifyContent="center" p={2}>
            <CircularProgress />
          </Box>
        )}

        {/* 基本信息 */}
        <Accordion 
          expanded={activeAccordion === 'basic'} 
          onChange={() => setActiveAccordion(activeAccordion === 'basic' ? '' : 'basic')}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box display="flex" alignItems="center" gap={1}>
              <Info color="primary" />
              <Typography variant="h6">{t('fenceDetailDialog.basicInfo')}</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.fenceType')}</Typography>
                <Typography variant="body1">{fence.fence_type || 'N/A'}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.fencePurpose')}</Typography>
                <Typography variant="body1">{fence.fence_purpose || 'N/A'}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.fenceArea')}</Typography>
                <Typography variant="body1">{formatArea(fence.fence_area)}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.fencePerimeter')}</Typography>
                <Typography variant="body1">{fence.fence_perimeter ? `${fence.fence_perimeter.toFixed(1)} m` : 'N/A'}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.createdAt')}</Typography>
                <Typography variant="body1">{formatDateTime(fence.created_at)}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.updatedAt')}</Typography>
                <Typography variant="body1">{formatDateTime(fence.updated_at)}</Typography>
              </Grid>
              {fence.fence_description && (
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.fenceDescription')}</Typography>
                  <Typography variant="body1">{fence.fence_description}</Typography>
                </Grid>
              )}
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* 重叠检测结果 */}
        <Accordion 
          expanded={activeAccordion === 'overlap'} 
          onChange={() => setActiveAccordion(activeAccordion === 'overlap' ? '' : 'overlap')}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box display="flex" alignItems="center" gap={1}>
              <Warning color="warning" />
              <Typography variant="h6">{t('fenceDetailDialog.overlapDetection')}</Typography>
              {overlapData && (
                <Chip 
                  size="small" 
                  label={`${overlapData.overlap_count || 0} ${t('fenceDetailDialog.overlapsFound')}`}
                  color={overlapData.overlap_count > 0 ? 'warning' : 'success'}
                />
              )}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {overlapData ? (
              overlapData.overlap_count > 0 ? (
                <List>
                  {overlapData.overlaps.map((overlap, index) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        <ErrorOutline color={getOverlapSeverityColor(overlap.overlap_percentage)} />
                      </ListItemIcon>
                      <ListItemText
                        primary={overlap.overlap_fence_info?.fence_name || `围栏 ${overlap.overlapping_fence_id}`}
                        secondary={
                          <Box>
                            <Typography variant="body2">
                              {t('fenceDetailDialog.overlapArea')}: {formatArea(overlap.overlap_area)}
                            </Typography>
                            <Typography variant="body2">
                              {t('fenceDetailDialog.overlapPercentage')}: {overlap.overlap_percentage?.toFixed(1)}%
                            </Typography>
                            <Typography variant="body2">
                              {t('fenceDetailDialog.overlapType')}: {overlap.overlap_type}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Box display="flex" alignItems="center" gap={1} p={2}>
                  <CheckCircle color="success" />
                  <Typography>{t('fenceDetailDialog.noOverlapsDetected')}</Typography>
                </Box>
              )
            ) : (
              <Typography color="text.secondary">{t('fenceDetailDialog.loadingData')}</Typography>
            )}
          </AccordionDetails>
        </Accordion>

        {/* 图层分析 */}
        <Accordion 
          expanded={activeAccordion === 'analysis'} 
          onChange={() => setActiveAccordion(activeAccordion === 'analysis' ? '' : 'analysis')}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box display="flex" alignItems="center" gap={1}>
              <Analytics color="info" />
              <Typography variant="h6">{t('fenceDetailDialog.layerAnalysis')}</Typography>
              {layerAnalysis && Object.keys(layerAnalysis).length > 0 && (
                <Chip 
                  size="small" 
                  label={`${Object.keys(layerAnalysis).length} ${t('fenceDetailDialog.layers')}`}
                  color="info"
                />
              )}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {layerAnalysis ? (
              Object.keys(layerAnalysis).length > 0 ? (
                <Grid container spacing={2}>
                  {Object.entries(layerAnalysis).map(([layerType, analysis]) => (
                    <Grid item xs={12} sm={6} md={4} key={layerType}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="h6" gutterBottom>
                            {layerType}
                          </Typography>
                          {typeof analysis === 'object' ? (
                            <Box>
                              <Typography variant="body2">
                                {t('fenceDetailDialog.featureCount')}: {analysis.feature_count || 0}
                              </Typography>
                              <Typography variant="body2">
                                {t('fenceDetailDialog.coverageArea')}: {formatArea(analysis.coverage_area)}
                              </Typography>
                              <Typography variant="body2">
                                {t('fenceDetailDialog.coveragePercentage')}: {analysis.coverage_percentage?.toFixed(1)}%
                              </Typography>
                            </Box>
                          ) : (
                            <Typography variant="body2">
                              {analysis}
                            </Typography>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Typography color="text.secondary">{t('fenceDetailDialog.noLayerAnalysisData')}</Typography>
              )
            ) : (
              <Typography color="text.secondary">{t('fenceDetailDialog.loadingData')}</Typography>
            )}
          </AccordionDetails>
        </Accordion>

        {/* 几何信息 */}
        <Accordion 
          expanded={activeAccordion === 'geometry'} 
          onChange={() => setActiveAccordion(activeAccordion === 'geometry' ? '' : 'geometry')}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box display="flex" alignItems="center" gap={1}>
              <Layers color="secondary" />
              <Typography variant="h6">{t('fenceDetailDialog.geometryInfo')}</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.geometryType')}</Typography>
                <Typography variant="body1">{fence.geometry?.type || 'N/A'}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.coordinateCount')}</Typography>
                <Typography variant="body1">
                  {fence.geometry?.coordinates?.[0]?.length || 'N/A'}
                </Typography>
              </Grid>
              {fence.bounds && (
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.boundingBox')}</Typography>
                  <Typography variant="body1" component="div">
                    <Box component="span" fontFamily="monospace">
                      {JSON.stringify(fence.bounds, null, 2)}
                    </Box>
                  </Typography>
                </Grid>
              )}
              {fence.center && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.centerPoint')}</Typography>
                  <Typography variant="body1">
                    {fence.center.coordinates?.[1]?.toFixed(6)}, {fence.center.coordinates?.[0]?.toFixed(6)}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* 样式配置 */}
        <Accordion 
          expanded={activeAccordion === 'style'} 
          onChange={() => setActiveAccordion(activeAccordion === 'style' ? '' : 'style')}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box display="flex" alignItems="center" gap={1}>
              <Square sx={{ color: fence.fence_color || '#1976d2' }} />
              <Typography variant="h6">{t('fenceDetailDialog.styleConfig')}</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.fillColor')}</Typography>
                <Box display="flex" alignItems="center" gap={1}>
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      backgroundColor: fence.fence_color || '#1976d2',
                      border: '1px solid #ccc',
                      borderRadius: 1
                    }}
                  />
                  <Typography variant="body1">{fence.fence_color || '#1976d2'}</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.transparency')}</Typography>
                <Typography variant="body1">{(fence.fence_opacity * 100).toFixed(0)}%</Typography>
              </Grid>
              {fence.fence_stroke_color && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.borderColor')}</Typography>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        backgroundColor: fence.fence_stroke_color,
                        border: '1px solid #ccc',
                        borderRadius: 1
                      }}
                    />
                    <Typography variant="body1">{fence.fence_stroke_color}</Typography>
                  </Box>
                </Grid>
              )}
              {fence.fence_stroke_width && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">{t('fenceDetailDialog.borderWidth')}</Typography>
                  <Typography variant="body1">{fence.fence_stroke_width}px</Typography>
                </Grid>
              )}
            </Grid>
          </AccordionDetails>
        </Accordion>
      </DialogContent>

      <DialogActions>
        <Button onClick={focusOnFence} startIcon={<LocationOn />}>
          {t('fenceDetailDialog.focusOnFence')}
        </Button>
        <Button onClick={() => onEdit(fence)} startIcon={<Edit />}>
          {t('fenceDetailDialog.edit')}
        </Button>
        <Button 
          onClick={() => onDelete(fence)} 
          color="error" 
          startIcon={<Delete />}
        >
          {t('fenceDetailDialog.delete')}
        </Button>
        <Button onClick={onClose}>{t('fenceDetailDialog.close')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default FenceDetailDialog; 