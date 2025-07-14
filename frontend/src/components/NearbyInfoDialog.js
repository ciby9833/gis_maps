import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip
} from '@mui/material';
import { 
  GpsFixed, 
  Place, 
  DirectionsCar,
  Home,
  Business,
  LocalHospital,
  School,
  Restaurant,
  ShoppingCart,
  AccountBalance,
  LocalPolice,
  FireTruck,
  Train,
  Flight,
  DirectionsBus,
  LocalGasStation,
  LocalParking
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

const NearbyInfoDialog = ({ open, onClose, nearbyInfo }) => {
  const { t } = useTranslation();

  // 根据类型获取图标
  const getIconForType = (type) => {
    switch (type) {
      case 'hospital':
        return <LocalHospital sx={{ color: '#DC143C' }} />;
      case 'school':
      case 'university':
        return <School sx={{ color: '#1E90FF' }} />;
      case 'restaurant':
      case 'cafe':
        return <Restaurant sx={{ color: '#FF8C00' }} />;
      case 'mall':
      case 'supermarket':
        return <ShoppingCart sx={{ color: '#9932CC' }} />;
      case 'bank':
        return <AccountBalance sx={{ color: '#008000' }} />;
      case 'police':
        return <LocalPolice sx={{ color: '#000080' }} />;
      case 'fire_station':
        return <FireTruck sx={{ color: '#FF4500' }} />;
      case 'station':
        return <Train sx={{ color: '#191970' }} />;
      case 'airport':
        return <Flight sx={{ color: '#B22222' }} />;
      case 'bus_station':
        return <DirectionsBus sx={{ color: '#FF6600' }} />;
      case 'gas_station':
        return <LocalGasStation sx={{ color: '#8B0000' }} />;
      case 'parking':
        return <LocalParking sx={{ color: '#708090' }} />;
      default:
        return <Place sx={{ color: '#4169E1' }} />;
    }
  };

  if (!nearbyInfo) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <GpsFixed sx={{ color: '#FF4444', fontSize: '1.5rem' }} />
            {t('dialogs.nearbyInfo.title')}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography>{t('map.loading')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('dialogs.nearbyInfo.close')}</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <GpsFixed sx={{ color: '#FF4444', fontSize: '1.5rem' }} />
          {t('dialogs.nearbyInfo.title')} ({t('dialogs.nearbyInfo.within50m')} + {t('dialogs.nearbyInfo.within100m')})
        </Box>
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={2}>
          {/* 统计信息 */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2, mb: 2, bgcolor: '#f5f5f5' }}>
              <Typography variant="h6" gutterBottom>{t('map.dataStatistics')}</Typography>
              <Box display="flex" gap={2} flexWrap="wrap">
                <Chip 
                  icon={<Home />} 
                  label={`${t('dialogs.nearbyInfo.within50m')} ${t('categories.buildings.name')}: ${nearbyInfo?.summary?.buildings_50m || 0}`} 
                  color="primary" 
                />
                <Chip 
                  icon={<Place />} 
                  label={`${t('dialogs.nearbyInfo.within50m')} ${t('categories.pois.name')}: ${nearbyInfo?.summary?.pois_50m || 0}`} 
                  sx={{ color: '#FFFFFF', bgcolor: '#4169E1' }}
                />
                <Chip 
                  icon={<DirectionsCar />} 
                  label={`${t('dialogs.nearbyInfo.within100m')} ${t('categories.pois.name')}: ${nearbyInfo?.summary?.pois_100m || 0}`} 
                  sx={{ color: '#FFFFFF', bgcolor: '#2F4F4F' }}
                />
              </Box>
            </Paper>
          </Grid>
          
          {/* 50米内建筑物 */}
          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom>
              <Home sx={{ mr: 1, color: '#1976d2' }} />
              {t('dialogs.nearbyInfo.within50m')} {t('categories.buildings.name')}
            </Typography>
            <List dense>
              {(nearbyInfo?.buildings_50m || []).map((building, index) => (
                <ListItem key={index}>
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Business sx={{ color: '#1976d2', fontSize: '1.1rem' }} />
                        <span>{building.name || t('map.noData')}</span>
                        {building.name_source && (
                          <Chip 
                            size="small" 
                            label={building.name_source === 'google' ? 'Google' : building.name_source === 'generated' ? t('map.generated') : t('map.database')} 
                            color={building.name_source === 'google' ? 'success' : building.name_source === 'generated' ? 'warning' : 'primary'}
                            variant="outlined"
                          />
                        )}
                      </Box>
                    }
                    secondary={`${building.fclass || building.type || t('map.unknown')} (${building.distance?.toFixed(1) || 0}m)`}
                  />
                </ListItem>
              ))}
              {(nearbyInfo?.buildings_50m || []).length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  {t('dialogs.nearbyInfo.within50m')} {t('dialogs.nearbyInfo.noData')}
                </Typography>
              )}
            </List>
          </Grid>
          
          {/* 100米内地标建筑 */}
          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom>
              <DirectionsCar sx={{ mr: 1, color: '#2F4F4F' }} />
              {t('dialogs.nearbyInfo.within100m')} {t('categories.pois.name')}
            </Typography>
            <List dense>
              {(nearbyInfo?.pois_100m || []).map((poi, index) => (
                <ListItem key={index}>
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1}>
                        {getIconForType(poi.fclass)}
                        <span>{poi.name || t('map.noData')}</span>
                        {poi.name_source && (
                          <Chip 
                            size="small" 
                            label={poi.name_source === 'google' ? 'Google' : poi.name_source === 'generated' ? t('map.generated') : t('map.database')} 
                            color={poi.name_source === 'google' ? 'success' : poi.name_source === 'generated' ? 'warning' : 'primary'}
                            variant="outlined"
                          />
                        )}
                      </Box>
                    }
                    secondary={`${poi.fclass || poi.type || t('map.unknown')} (${poi.distance?.toFixed(1) || 0}m)`}
                  />
                </ListItem>
              ))}
              {(nearbyInfo?.pois_100m || []).length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  {t('dialogs.nearbyInfo.within100m')} {t('dialogs.nearbyInfo.noData')}
            </Typography>
              )}
            </List>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary" variant="contained">
          {t('dialogs.nearbyInfo.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NearbyInfoDialog; 