import { useState, useCallback } from 'react';

/**
 * 统一的loading状态管理Hook
 * 简化版本，合并各组件中重复的loading、error状态逻辑
 */
export const useLoadingState = (initialLoading = false) => {
  const [loading, setLoading] = useState(initialLoading);
  const [error, setError] = useState(null);

  const startLoading = useCallback(() => {
    setLoading(true);
    setError(null);
  }, []);

  const stopLoading = useCallback(() => {
    setLoading(false);
  }, []);

  const setErrorState = useCallback((errorMessage) => {
    setLoading(false);
    setError(errorMessage);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    loading,
    error,
    startLoading,
    stopLoading,
    setErrorState,
    clearError
  };
}; 