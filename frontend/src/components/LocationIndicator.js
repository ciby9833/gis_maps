import React, { useState, useCallback } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  CircularProgress, 
  IconButton, 
  Tooltip,
  Chip
} from '@mui/material';
import { Terrain, WaterDrop, LocationOn, InfoOutlined, GpsFixed } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';

const LocationIndicator = ({ selectedLocation, currentZoom }) => {
  const { t } = useTranslation();
  const [locationInfo, setLocationInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 验证位置是否在陆地上
  const validateLocation = useCallback(async (lat, lng) => {
    if (!lat || !lng) return;

    setLoading(true);
    setError(null);

    try {
      const url = `${API_BASE_URL}/api/validate_location?lat=${lat}&lng=${lng}&include_distance=true`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`${t('map.dataError')}: ${response.status}`);
      }

      const data = await response.json();
      setLocationInfo(data);
      console.log('位置验证结果:', data);
    } catch (err) {
      console.error('位置验证失败:', err);
      setError(err.message);
      setLocationInfo(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  // 当选中位置改变时，验证位置
  React.useEffect(() => {
    if (selectedLocation && selectedLocation.lat && selectedLocation.lng) {
      validateLocation(selectedLocation.lat, selectedLocation.lng);
    } else {
      setLocationInfo(null);
    }
  }, [selectedLocation, validateLocation]);

  // 如果没有选中位置，不显示组件
  if (!selectedLocation) {
    return null;
  }

  return (
    <Paper
      sx={{
        position: 'absolute',
        bottom: 10,
        left: 10,
        p: 2,
        zIndex: 1000,
        minWidth: 280,
        maxWidth: 350
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <GpsFixed 
          sx={{ 
            color: '#FF4444', 
            mr: 1, 
            fontSize: '1.5rem',
            animation: 'pulse 2s infinite'
          }} 
        />
        <Typography variant="subtitle2" sx={{ color: '#FF4444', fontWeight: 'bold' }}>
          📍 {t('map.nearbyInfo')}
        </Typography>
        {loading && <CircularProgress size={16} sx={{ ml: 1 }} />}
      </Box>

      <Typography variant="body2" sx={{ mb: 1 }}>
        {t('map.coordinates')}: {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
      </Typography>

      {error && (
        <Typography variant="body2" color="error" sx={{ mb: 1 }}>
          ❌ {error}
        </Typography>
      )}

      {locationInfo && (
        <Box sx={{ mt: 1 }}>
                <Chip 
            icon={locationInfo.is_on_land ? <Terrain /> : <WaterDrop />}
            label={locationInfo.is_on_land ? 
              `✅ ${t('map.onLand')}` : 
              `❌ ${t('map.inWater')}`
            }
            color={locationInfo.is_on_land ? 'success' : 'warning'}
                  size="small" 
            sx={{ mr: 1, mb: 1 }}
          />
          
          {locationInfo.distance_to_coast !== undefined && (
                <Chip 
              icon={<LocationOn />}
              label={`${locationInfo.distance_to_coast < 0.1 ? 
                t('map.coastalArea') : 
                `${locationInfo.distance_to_coast.toFixed(1)}km ${t('map.fromCoast')}`
              }`}
                  color="info" 
                  size="small" 
              sx={{ mr: 1, mb: 1 }}
                />
            )}
          
          {locationInfo.validation_method && (
            <Chip
              label={`${t('map.validationMethod')}: ${locationInfo.validation_method}`}
              size="small"
              variant="outlined"
              sx={{ mr: 1, mb: 1 }}
            />
          )}

          <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
            <Tooltip title={t('map.basedOnGlobalData')}>
              <IconButton size="small">
                <InfoOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Typography variant="caption" color="text.secondary">
              {t('map.zoomLevel')}: {currentZoom}
            </Typography>
          </Box>
        </Box>
      )}

      {!loading && !error && !locationInfo && (
        <Typography variant="body2" color="text.secondary">
          {t('map.locating')}...
        </Typography>
      )}
      
      {/* 添加CSS动画 */}
      <style jsx>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </Paper>
  );
};

export default LocationIndicator; 