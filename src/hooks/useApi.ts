import { useCallback } from 'react';
import { callApi as apiCall } from '@/lib/apiClient';

export const useApi = () => {
  const callApi = useCallback(async (action: string, data: Record<string, unknown> = {}) => {
    return apiCall(action, data);
  }, []);

  return { callApi };
};
