import { QueryClient } from '@tanstack/react-query';

/** Session-wide QueryClient — shared by the root provider and the bootstrap screen. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
