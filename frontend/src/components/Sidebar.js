import React, { useState, Fragment, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Switch,
  Badge
} from '@mui/material';
import {
  ExpandMore,
  Business,
  School,
  LocalHospital,
  Info,
  CheckCircle,
  Error
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { configLoader, getLocalizedCategories } from '../config';

const Sidebar = ({ 
  apiStatus, 
  selectedCategory, 
  onCategoryChange,
  layersVisible = {},
  onLayerToggle,
  onDataTypeFilter,
  configLoaded
}) => {
  const { t } = useTranslation();
  const [selectedDataTypes, setSelectedDataTypes] = useState({});
  const [selectedSubcategories, setSelectedSubcategories] = useState({});
  const [localizedCategories, setLocalizedCategories] = useState({});
  
  // 简单的建筑物类别配置（保持向后兼容）
  const LEGACY_BUILDING_CATEGORIES = {
    malls: {
      name: 'categories.buildings.malls',
      color: '#ff6b6b',
      icon: '🏬'
    },
    schools: {
      name: 'categories.buildings.schools',
      color: '#4ecdc4',
      icon: '🏫'
    },
    hospitals: {
      name: 'categories.buildings.hospitals',
      color: '#45b7d1',
      icon: '🏥'
    }
  };

  // 异步加载本地化类别数据
  useEffect(() => {
    if (configLoaded) {
      const loadCategories = async () => {
        try {
          const categories = await getLocalizedCategories(t);
          setLocalizedCategories(categories);
        } catch (error) {
          console.error('Failed to load localized categories:', error);
          setLocalizedCategories({});
        }
      };
      
      loadCategories();
    }
  }, [configLoaded, t]);

  const handleCategorySelect = (category) => {
    const newCategory = category === selectedCategory ? null : category;
    onCategoryChange(newCategory);
  };

  const handleDataTypeFilter = (dataType, subcategory = null) => {
    const key = `${dataType}_${subcategory || 'all'}`;
    const newSelection = { ...selectedSubcategories };
    
    if (newSelection[key]) {
      delete newSelection[key];
    } else {
      newSelection[key] = { dataType, subcategory };
    }
    
    setSelectedSubcategories(newSelection);
    if (onDataTypeFilter) {
      onDataTypeFilter(dataType, subcategory);
    }
  };

  const getStatusIcon = () => {
    if (apiStatus?.status === 'running') {
      return <CheckCircle color="success" />;
    }
    return <Error color="error" />;
  };

  const getStatusText = () => {
    if (apiStatus?.status === 'running') {
      return t('sidebar.statusConnected');
    }
    return t('sidebar.statusDisconnected');
  };

  // 获取数据统计信息
  const getDataCategoryStats = (category) => {
    if (!apiStatus?.osm_data_summary) return null;
    
    const categoryMap = {
      'buildings': t('categories.buildings.name'),
      'roads': t('categories.roads.name'),
      'pois': t('categories.pois.name'), 
      'natural': t('categories.natural.name'),
      'transport': t('categories.transport.name'),
      'places': t('categories.places.name')
    };
    
    const categoryName = categoryMap[category];
    return apiStatus.osm_data_summary[categoryName];
  };

  return (
    <Paper
      sx={{
        width: 350,
        height: '100%',
        overflow: 'auto',
        borderRadius: 0
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          {t('app.system')}
        </Typography>
        
        {/* 系统状态 */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            {t('sidebar.systemStatus')}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getStatusIcon()}
            <Typography variant="body2">{getStatusText()}</Typography>
          </Box>
          {apiStatus?.total_features && (
            <Chip
              label={`${apiStatus.total_features.toLocaleString()} ${t('sidebar.featuresCount')}`}
              size="small"
              sx={{ mt: 1 }}
            />
          )}
          {/* 配置加载状态 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            {configLoaded ? <CheckCircle color="success" fontSize="small" /> : <Error color="warning" fontSize="small" />}
            <Typography variant="caption">
              {configLoaded ? '✅ ' : '⚠️ '}{t('sidebar.backendConfig')}: {configLoaded ? t('sidebar.loaded') : t('sidebar.loading')}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* 图层控制 */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="subtitle2">{t('sidebar.layerControl')}</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 1 }}>
            <List dense>
              <ListItem>
                <FormControlLabel
                  control={
                    <Switch
                      checked={layersVisible.landPolygons || false}
                      onChange={(e) => onLayerToggle && onLayerToggle('landPolygons', e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>🌍</span>
                      <Typography variant="body2">{t('sidebar.landPolygons')}</Typography>
                    </Box>
                  }
                />
              </ListItem>
              <ListItem>
                <FormControlLabel
                  control={
                    <Switch
                      checked={layersVisible.buildings || false}
                      onChange={(e) => onLayerToggle && onLayerToggle('buildings', e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>🏢</span>
                      <Typography variant="body2">{t('sidebar.buildings')}</Typography>
                    </Box>
                  }
                />
              </ListItem>
              <ListItem>
                <FormControlLabel
                  control={
                    <Switch
                      checked={layersVisible.roads || false}
                      onChange={(e) => onLayerToggle && onLayerToggle('roads', e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>🛣️</span>
                      <Typography variant="body2">{t('sidebar.roads')}</Typography>
                    </Box>
                  }
                />
              </ListItem>
              <ListItem>
                <FormControlLabel
                  control={
                    <Switch
                      checked={layersVisible.pois || false}
                      onChange={(e) => onLayerToggle && onLayerToggle('pois', e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>📍</span>
                      <Typography variant="body2">{t('sidebar.pois')}</Typography>
                    </Box>
                  }
                />
              </ListItem>
              <ListItem>
                <FormControlLabel
                  control={
                    <Switch
                      checked={layersVisible.natural || false}
                      onChange={(e) => onLayerToggle && onLayerToggle('natural', e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>🌿</span>
                      <Typography variant="body2">{t('sidebar.natural')}</Typography>
                    </Box>
                  }
                />
              </ListItem>
              <ListItem>
                <FormControlLabel
                  control={
                    <Switch
                      checked={layersVisible.transport || false}
                      onChange={(e) => onLayerToggle && onLayerToggle('transport', e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>🚌</span>
                      <Typography variant="body2">{t('sidebar.transport')}</Typography>
                    </Box>
                  }
                />
              </ListItem>
              <ListItem>
                <FormControlLabel
                  control={
                    <Switch
                      checked={layersVisible.places || false}
                      onChange={(e) => onLayerToggle && onLayerToggle('places', e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>📍</span>
                      <Typography variant="body2">{t('sidebar.places')}</Typography>
                    </Box>
                  }
                />
              </ListItem>
            </List>
          </AccordionDetails>
        </Accordion>

        <Divider sx={{ my: 2 }} />

        {/* OSM数据分类筛选 - 仅在配置加载完成后显示 */}
        {configLoaded && Object.keys(localizedCategories).length > 0 && Object.entries(localizedCategories).map(([key, category]) => {
          const stats = getDataCategoryStats(key);
          const isVisible = layersVisible[key];
          
          return (
            <Accordion key={key}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                  <span>{category.icon}</span>
                  <Typography variant="subtitle2">{category.name}</Typography>
                  {stats && (
                    <Badge 
                      badgeContent={stats.table_count} 
                      color="primary" 
                      sx={{ ml: 'auto' }}
                    />
                  )}
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                <List dense>
                  {/* 显示数据统计 */}
                  {stats && (
                    <ListItem>
                      <ListItemText
                        primary={
                          <Typography variant="caption" color="text.secondary">
                            {stats.table_count} {t('sidebar.more')}, {stats.total_count.toLocaleString()} {t('sidebar.records')}
                          </Typography>
                        }
                      />
                    </ListItem>
                  )}
                  
                  {/* 子类别筛选 */}
                  {category.subcategories && Object.entries(category.subcategories).map(([subKey, subcategory]) => {
                    const filterKey = `${key}_${subKey}`;
                    const isSelected = Boolean(selectedSubcategories[filterKey]);
                    
                    return (
                      <ListItem key={subKey} disablePadding>
                        <ListItemButton
                          selected={isSelected}
                          onClick={() => handleDataTypeFilter(key, subKey === 'all' ? null : subKey)}
                          disabled={!isVisible}
                          sx={{ pl: 2 }}
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <span style={{ fontSize: '0.9rem' }}>{subcategory.icon}</span>
                          </ListItemIcon>
                          <ListItemText 
                            primary={
                              <Typography variant="body2" fontSize="0.85rem">
                                {subcategory.name}
                              </Typography>
                            }
                          />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              </AccordionDetails>
            </Accordion>
          );
        })}

        <Divider sx={{ my: 2 }} />

        {/* 数据表信息 */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="subtitle2">{t('sidebar.dataCategories')}</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <List dense>
              {apiStatus?.osm_data_summary && Object.entries(apiStatus.osm_data_summary).map(([category, stats]) => (
                <ListItem key={category}>
                  <ListItemText
                    primary={category}
                    secondary={
                      <Fragment>
                        <Typography variant="caption" display="block">
                          {t('sidebar.more')}: {stats.table_count} | {t('sidebar.records')}: {stats.total_count.toLocaleString()}
                        </Typography>
                        {stats.tables.filter(t => t.count > 0).map(table => (
                          <Typography key={table.table} variant="caption" display="block" color="text.secondary">
                            • {table.table}: {table.count.toLocaleString()} ({table.size})
                          </Typography>
                        ))}
                      </Fragment>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>

        <Divider sx={{ my: 2 }} />

        {/* 建筑物类别 (保持向后兼容) */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="subtitle2">{t('sidebar.featureFilter')}</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <List dense>
              {Object.entries(LEGACY_BUILDING_CATEGORIES).map(([key, category]) => (
                <ListItem key={key} disablePadding>
                  <ListItemButton
                    selected={selectedCategory === key}
                    onClick={() => handleCategorySelect(key)}
                  >
                    <ListItemIcon>
                      <span style={{ fontSize: '1.2rem' }}>{category.icon}</span>
                    </ListItemIcon>
                    <ListItemText 
                      primary={t(category.name)}
                      secondary={`${t('sidebar.viewAll')} ${t(category.name)}`}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      </Box>
    </Paper>
  );
};

export default Sidebar; 