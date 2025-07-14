import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// 导入语言资源
import en from './locales/en.json';
import zh from './locales/zh.json';

const resources = {
  en: { translation: en },
  zh: { translation: zh }
};

// 支持的语言列表
const supportedLanguages = Object.keys(resources);

// 语言映射配置 - 将浏览器语言代码映射到支持的语言
const languageMapping = {
  'zh-CN': 'zh',
  'zh-TW': 'zh', 
  'zh-HK': 'zh',
  'zh-SG': 'zh',
  'en-US': 'en',
  'en-GB': 'en',
  'en-AU': 'en',
  'en-CA': 'en'
};

// 自定义语言检测器
const customLanguageDetector = {
  type: 'languageDetector',
  
  detect: function() {
    // 1. 首先检查localStorage中的用户选择
    const savedLanguage = localStorage.getItem('i18nextLng');
    if (savedLanguage && supportedLanguages.includes(savedLanguage)) {
      return savedLanguage;
    }
    
    // 2. 检测浏览器语言
    const browserLanguage = navigator.language || navigator.userLanguage;
    
    // 3. 尝试精确匹配
    if (supportedLanguages.includes(browserLanguage)) {
      return browserLanguage;
    }
    
    // 4. 尝试映射匹配
    if (languageMapping[browserLanguage]) {
      return languageMapping[browserLanguage];
    }
    
    // 5. 尝试语言前缀匹配（如 en-US -> en）
    const languagePrefix = browserLanguage.split('-')[0];
    if (supportedLanguages.includes(languagePrefix)) {
      return languagePrefix;
    }
    
    // 6. 默认返回英语
    return 'en';
  },
  
  cache: function(lng) {
    // 缓存用户选择的语言
    if (lng && supportedLanguages.includes(lng)) {
      localStorage.setItem('i18nextLng', lng);
    }
  }
};

i18n
  .use(customLanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: undefined, // 让检测器决定语言
    fallbackLng: 'en', // 如果检测失败或不支持，默认使用英语
    supportedLngs: supportedLanguages, // 明确指定支持的语言
    
    interpolation: {
      escapeValue: false,
    },
    
    detection: {
      order: ['localStorage', 'navigator'], // 检测顺序：用户选择 -> 浏览器语言
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'], // 缓存到localStorage
    },
    
    react: {
      useSuspense: false,
    },
    
    // 调试选项（生产环境可设为false）
    debug: process.env.NODE_ENV === 'development',
  });

// 监听语言变化事件，自动保存用户选择
i18n.on('languageChanged', (lng) => {
  if (lng && supportedLanguages.includes(lng)) {
    localStorage.setItem('i18nextLng', lng);
    // 同时更新HTML的lang属性
    document.documentElement.lang = lng;
  }
});

// 设置初始HTML lang属性
document.documentElement.lang = i18n.language || 'en';

export default i18n; 