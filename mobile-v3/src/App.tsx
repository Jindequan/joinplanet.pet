import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { LangProvider } from "./core/i18n";
import { SessionProvider } from "./core/auth/session-context";
import { queryClient } from "./core/query/client";
import { AppErrorBoundary, AppRoutes } from "./app/routes";

export default function App() {
  return (
    <AppErrorBoundary>
      <LangProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </SessionProvider>
      </QueryClientProvider>
      </LangProvider>
    </AppErrorBoundary>
  );
}
