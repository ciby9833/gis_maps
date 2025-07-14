import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Tooltip,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Popover,
  Paper,
  Divider,
  Chip
} from '@mui/material';
import {
  Map,
  Info,
  GitHub,
  Language,
  Check,
  Settings,
  Brightness4,
  Brightness7
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

const Header = () => {
  const { t, i18n } = useTranslation();
  const [languageMenuAnchor, setLanguageMenuAnchor] = useState(null);
  const [settingsMenuAnchor, setSettingsMenuAnchor] = useState(null);

  const handleLanguageMenuOpen = (event) => {
    setLanguageMenuAnchor(event.currentTarget);
  };

  const handleLanguageMenuClose = () => {
    setLanguageMenuAnchor(null);
  };

  const handleSettingsMenuOpen = (event) => {
    setSettingsMenuAnchor(event.currentTarget);
  };

  const handleSettingsMenuClose = () => {
    setSettingsMenuAnchor(null);
  };

  const handleLanguageChange = (language) => {
    i18n.changeLanguage(language);
    handleLanguageMenuClose();
  };

  const languages = [
    { code: 'zh', name: t('toolbar.chinese'), flag: '🇨🇳', nativeName: '中文' },
    { code: 'en', name: t('toolbar.english'), flag: '🇺🇸', nativeName: 'English' }
  ];

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[1];

  return (
    <AppBar position="static" elevation={1}>
      <Toolbar>
        <Map sx={{ mr: 2 }} />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          {t('app.title')}
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          {/* 语言选择按钮 */}
          <Tooltip title={t('toolbar.language')}>
            <Button
              color="inherit"
              startIcon={<Language />}
              onClick={handleLanguageMenuOpen}
              sx={{ 
                textTransform: 'none',
                minWidth: '120px',
                justifyContent: 'flex-start'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span style={{ fontSize: '18px' }}>{currentLanguage.flag}</span>
                <span>{currentLanguage.nativeName}</span>
              </Box>
            </Button>
          </Tooltip>
          
          {/* 设置菜单按钮 */}
          <Tooltip title={t('header.settings')}>
            <IconButton 
              color="inherit" 
              size="small"
              onClick={handleSettingsMenuOpen}
            >
              <Settings />
            </IconButton>
          </Tooltip>
          
          <Tooltip title={t('header.github')}>
            <IconButton 
              color="inherit" 
              size="small"
              onClick={() => window.open('https://github.com/ciby9833', '_blank')}
            >
              <GitHub />
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>

      {/* 语言选择弹窗 - 确保最高层级 */}
      <Popover
        open={Boolean(languageMenuAnchor)}
        anchorEl={languageMenuAnchor}
        onClose={handleLanguageMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 200,
              maxWidth: 300,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              border: '1px solid rgba(0,0,0,0.1)'
            }
          }
        }}
        sx={{
          zIndex: 99999, // 确保在最上层
          '& .MuiPopover-paper': {
            zIndex: 99999
          }
        }}
      >
        <Paper sx={{ p: 1 }}>
          <Typography variant="subtitle2" sx={{ px: 2, py: 1, fontWeight: 600 }}>
            {t('toolbar.selectLanguage')}
          </Typography>
          <Divider />
          {languages.map((language) => (
            <MenuItem
              key={language.code}
              onClick={() => handleLanguageChange(language.code)}
              sx={{
                py: 1.5,
                px: 2,
                borderRadius: 1,
                mx: 1,
                my: 0.5,
                backgroundColor: i18n.language === language.code ? 'action.selected' : 'transparent',
                '&:hover': {
                  backgroundColor: 'action.hover'
                }
              }}
            >
              <ListItemIcon sx={{ minWidth: '32px' }}>
                <span style={{ fontSize: '20px' }}>{language.flag}</span>
              </ListItemIcon>
              <ListItemText 
                primary={language.nativeName}
                secondary={language.name}
                primaryTypographyProps={{ fontWeight: 500 }}
              />
              {i18n.language === language.code && (
                <Check sx={{ ml: 1, color: 'primary.main' }} />
              )}
            </MenuItem>
          ))}
          <Divider sx={{ my: 1 }} />
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              💡 {t('toolbar.languageAutoSaved')}
            </Typography>
          </Box>
        </Paper>
      </Popover>

      {/* 设置菜单弹窗 */}
      <Popover
        open={Boolean(settingsMenuAnchor)}
        anchorEl={settingsMenuAnchor}
        onClose={handleSettingsMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 250,
              maxWidth: 350,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              border: '1px solid rgba(0,0,0,0.1)'
            }
          }
        }}
        sx={{
          zIndex: 99999, // 确保在最上层
          '& .MuiPopover-paper': {
            zIndex: 99999
          }
        }}
      >
        <Paper sx={{ p: 1 }}>
          <Typography variant="subtitle2" sx={{ px: 2, py: 1, fontWeight: 600 }}>
            {t('header.settings')}
          </Typography>
          <Divider />
          
          {/* 系统信息 */}
          <MenuItem
            onClick={() => {
              handleSettingsMenuClose();
              // 可以添加系统信息对话框
            }}
            sx={{ py: 1.5, px: 2, borderRadius: 1, mx: 1, my: 0.5 }}
          >
            <ListItemIcon>
              <Info />
            </ListItemIcon>
            <ListItemText 
              primary={t('header.systemInfo')}
              secondary={t('header.systemInfoDesc')}
            />
          </MenuItem>

          {/* 当前语言状态 */}
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom>
              {t('header.currentLanguage')}
            </Typography>
            <Chip
              icon={<span style={{ fontSize: '14px' }}>{currentLanguage.flag}</span>}
              label={`${currentLanguage.nativeName} (${currentLanguage.name})`}
              size="small"
              variant="outlined"
              sx={{ mt: 0.5 }}
            />
          </Box>

          <Divider sx={{ my: 1 }} />
          
          {/* 版本信息 */}
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              GIS Maps v1.0.0 | React + Leaflet
            </Typography>
          </Box>
        </Paper>
      </Popover>
    </AppBar>
  );
};

export default Header; 