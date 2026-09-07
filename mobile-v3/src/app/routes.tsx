import * as React from "react";
import { Navigate, Route, Routes, Link } from "react-router-dom";
import { EmptyState } from "../core/ui";
import { useT, tt } from "../core/i18n";
import { AppLayout, Brand } from "./shared";
import { AuthPage } from "../features/auth/page";
import { TodayPage } from "../features/today/page";
import { TrendsPage } from "../features/trends/page";
import { TimelinePage } from "../features/timeline/page";
import { PetsPage, PetPage } from "../features/pets/page";
import {
  AssignmentsPage,
  PetTransferPage,
  FamiliesPage,
  FamilyPage,
  FamilyTransfersPage,
} from "../features/families/page";
import {
  AccountPage,
  DeletedFamiliesPage,
  NotificationSettings,
  SettingsPage,
  PublicSharePage,
  NotFound,
  CreatePetRoute,
  FamilyFormRoute,
} from "../features/account/page";

function AccountDeletedPage() {
  const t = useT();
  return (
    <main className="center-page">
      <Brand />
      <EmptyState
        title={t("账户已删除", "Account Deleted")}
        description={t("你的 Planet 账户和相关访问权限已移除。如果以后改变主意，可以重新登录并创建新账户。", "Your Planet account and its access have been removed. If you ever change your mind, you can sign in again and create a new account.")}
        action={
          <Link className="button primary" to="/auth">
            {t("返回登录", "Back to Sign In")}
          </Link>
        }
      />
    </main>
  );
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="center-page">
          <EmptyState
            title={tt("页面需要刷新", "This Page Needs a Refresh")}
            description={tt("这次页面没有正确显示。刷新后即可重新尝试，已保存的数据不会受影响。", "This page didn't display correctly. Refresh to try again — any saved data is unaffected.")}
            action={
              <button
                className="button primary"
                onClick={() => window.location.reload()}
              >
                {tt("刷新页面", "Refresh Page")}
              </button>
            }
          />
        </main>
      );
    }
    return this.props.children;
  }
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/code" element={<AuthPage />} />
      <Route path="/account/deleted" element={<AccountDeletedPage />} />
      <Route path="/share/:token" element={<PublicSharePage />} />
      <Route path="/s/:token" element={<PublicSharePage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/trends" element={<TrendsPage />} />
        <Route path="/pets" element={<PetsPage />} />
        <Route path="/pets/new" element={<CreatePetRoute />} />
        <Route path="/pets/:petId" element={<PetPage />} />
        <Route path="/pets/:petId/edit" element={<PetPage />} />
        <Route path="/pets/:petId/timeline" element={<TimelinePage />} />
        <Route path="/pets/:petId/care" element={<PetPage />} />
        <Route path="/pets/:petId/care/new" element={<PetPage />} />
        <Route path="/pets/:petId/medications" element={<PetPage />} />
        <Route path="/pets/:petId/sharing" element={<PetPage />} />
        <Route path="/pets/:petId/access" element={<PetPage />} />
        <Route path="/pets/:petId/transfer" element={<PetTransferPage />} />
        <Route
          path="/pets/:petId/care/:planId/assignments"
          element={<AssignmentsPage />}
        />
        <Route path="/families" element={<FamiliesPage />} />
        <Route
          path="/families/new"
          element={<FamilyFormRoute mode="create" />}
        />
        <Route
          path="/families/join"
          element={<FamilyFormRoute mode="join" />}
        />
        <Route path="/families/:familyId" element={<FamilyPage />} />
        <Route path="/families/:familyId/settings" element={<FamilyPage />} />
        <Route
          path="/families/:familyId/transfers"
          element={<FamilyTransfersPage />}
        />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/account/preferences" element={<AccountPage />} />
        <Route
          path="/account/deleted-families"
          element={<DeletedFamiliesPage />}
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route
          path="/settings/notifications"
          element={<NotificationSettings />}
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
