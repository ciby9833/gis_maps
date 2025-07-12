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
  ListItemText
} from '@mui/material';
import {
  Map,
  Info,
  GitHub,
  Language,
  Check
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

const Header = () => {
  const { t, i18n } = useTranslation();
  const [languageMenuAnchor, setLanguageMenuAnchor] = useState(null);

  const handleLanguageMenuOpen = (event) => {
    setLanguageMenuAnchor(event.currentTarget);
  };

  const handleLanguageMenuClose = () => {
    setLanguageMenuAnchor(null);
  };

  const handleLanguageChange = (language) => {
    i18n.changeLanguage(language);
    handleLanguageMenuClose();
  };

  const languages = [
    { code: 'zh', name: t('toolbar.chinese'), flag: '🇨🇳' },
    { code: 'en', name: t('toolbar.english'), flag: '🇺🇸' }
  ];

  return (
    <AppBar position="static" elevation={1}>
      <Toolbar>
        <Map sx={{ mr: 2 }} />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          {t('app.title')}
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={t('toolbar.language')}>
            <Button
              color="inherit"
              startIcon={<Language />}
              onClick={handleLanguageMenuOpen}
              sx={{ textTransform: 'none' }}
            >
              {languages.find(lang => lang.code === i18n.language)?.flag || '🌐'}
            </Button>
          </Tooltip>
          
          <Menu
            anchorEl={languageMenuAnchor}
            open={Boolean(languageMenuAnchor)}
            onClose={handleLanguageMenuClose}
          >
            {languages.map((language) => (
              <MenuItem
                key={language.code}
                onClick={() => handleLanguageChange(language.code)}
              >
                <ListItemIcon>
                  <span style={{ fontSize: '18px' }}>{language.flag}</span>
                </ListItemIcon>
                <ListItemText primary={language.name} />
                {i18n.language === language.code && (
                  <Check sx={{ ml: 1, color: 'primary.main' }} />
                )}
              </MenuItem>
            ))}
          </Menu>

          <Tooltip title={t('header.systemInfo')}>
            <IconButton color="inherit" size="small">
              <Info />
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
    </AppBar>
  );
};

export default Header; 