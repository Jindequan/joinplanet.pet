#!/usr/bin/env bash
# Guard the cross-screen product contracts that are easy to regress during UI work.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/APP/src"
FAIL=0

pass() { echo "PASS — $1"; }
fail() { echo "FAIL — $1" >&2; FAIL=1; }

if rg -q 'publicWebBaseUrl}/s/' "$APP/features/pets/sharing-section.tsx"; then
  pass "public share links use the web /s/:token route"
else
  fail "public share links drifted from the web /s/:token route"
fi

if rg -q 'useLocalSearchParams' "$APP/features/families/form-screen.tsx" && \
   rg -q 'inviteCodeParam' "$APP/features/families/form-screen.tsx"; then
  pass "invite deep links seed the join form"
else
  fail "invite deep links no longer seed the join form"
fi

if ! rg -q 'CareRequestInbox' "$APP/features/today/screen.tsx"; then
  pass "Today does not embed the full request inbox"
else
  fail "Today embeds the full request inbox"
fi

if ! rg -q 'useQueries' "$APP/features/families/screen.tsx"; then
  pass "family list does not fan out Today queries"
else
  fail "family list still fans out Today queries"
fi

if rg -q "PetWorkspaceTab = 'overview' \| 'care'" "$APP/features/pets/types.ts"; then
  pass "pet workspace keeps the two-tab information architecture"
else
  fail "pet workspace tab contract drifted"
fi

if rg -q 'commitTimelineSync' "$APP/core/storage/timeline-event-queue.ts" && \
   rg -q 'const merged = await commitTimelineSync' "$APP/core/storage/timeline-event-queue.ts"; then
  pass "timeline replay merges concurrent local events"
else
  fail "timeline replay can overwrite concurrent local events"
fi

if rg -q 'UpdateWithIdempotency' "$ROOT/planet-api/internal/modules/timeline/http.go" && \
   rg -q "update: \\(eventId:.*createIdempotencyKey" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'idempotencyKey: commandId\.current' "$ROOT/APP/src/features/timeline/composer.tsx"; then
  pass "timeline edits reuse a stable idempotency key across retries"
else
  fail "timeline edits can lose their outcome after a network retry"
fi

if rg -q 'useReducedMotion' "$APP/ui/motion/fade-in-view.tsx" && \
   rg -q 'AccessibilityInfo' "$APP/ui/motion/reduced-motion.ts"; then
  pass "motion respects the system reduced-motion preference"
else
  fail "motion preference handling is missing"
fi

if ! rg -q 'refetchInterval' "$APP/ui/navigation/web-workspace-rail.tsx" && \
   ! rg -q 'refetchInterval' "$APP/ui/navigation/floating-tab-bar.tsx"; then
  pass "navigation surfaces do not create duplicate polling loops"
else
  fail "navigation surfaces still create duplicate polling loops"
fi

if rg -q 'primaryAction: \{ minHeight: 44' "$APP/features/care-requests/incoming-request-toast.tsx" && \
   rg -q 'claimButton: \{ minHeight: 44' "$APP/features/collaboration/care-risk-banner.tsx"; then
  pass "care response actions meet the 44pt touch target"
else
  fail "care response actions have a sub-44pt touch target"
fi

if rg -q 'expandButton: \{ minHeight: 44' "$APP/features/digest/digest-card.tsx" && \
   rg -q 'itemButton: \{ minHeight: 44' "$APP/features/digest/digest-card.tsx" && \
   rg -q 'revokeButton: \{ minHeight: 44' "$APP/features/account/screen.tsx" && \
   rg -q 'assignmentButton: \{ minHeight: 44' "$APP/features/pets/care-section.tsx" && \
   rg -q 'historyToggle: \{ minHeight: 44' "$APP/features/care-requests/panel.tsx"; then
  pass "secondary actions meet the 44pt mobile touch target"
else
  fail "secondary actions have a sub-44pt mobile touch target"
fi

if rg -q 'roleButton: \{' "$APP/features/families/detail-screen.tsx" && \
   rg -q 'minWidth: 44,' "$APP/features/families/detail-screen.tsx" && \
   rg -q 'moveButton: \{ width: 44, height: 44' "$APP/features/pets/assignments-screen.tsx"; then
  pass "family role and assignment reorder actions meet the 44pt mobile touch target"
else
  fail "family role or assignment reorder actions have a sub-44pt mobile touch target"
fi

if rg -q "accessibilityRole=\{rest\.accessibilityRole \?\? 'button'\}" "$APP/ui/motion/pressable-scale.tsx"; then
  pass "scaled pressables expose button semantics by default"
else
  fail "scaled pressables can be invisible to screen readers"
fi

if rg -q 'close: \{ width: 44, height: 44' "$ROOT/APP/src/ui/navigation/app-menu-button.tsx" && \
   rg -q 'width: 44,' "$ROOT/APP/src/ui/components/scope-cascade.tsx" && \
   rg -q 'height: 44,' "$ROOT/APP/src/ui/components/scope-cascade.tsx" && \
   rg -q 'close: \{ width: 44, height: 44' "$APP/features/care-requests/incoming-request-toast.tsx" && \
   rg -q 'width: 44,' "$APP/ui/components/modal-sheet.tsx" && \
   rg -q 'height: 44,' "$APP/ui/components/modal-sheet.tsx"; then
  pass "icon close and scope actions keep a full mobile hit target"
else
  fail "icon close or scope actions have a sub-44pt hit target"
fi

if rg -q 'platform=iOS Simulator' "$ROOT/scripts/ios.sh" && \
   rg -q 'deviceTypeIdentifier' "$ROOT/scripts/ios.sh" && \
   rg -q 'DeviceHub\.app' "$ROOT/scripts/ios.sh" && \
   rg -q 'expo start --localhost --offline --port 8082' "$ROOT/APP/package.json" && \
   ! rg -q 'devicectl|ios-deploy' "$ROOT/scripts/ios.sh" && \
   ! rg -q 'PLANETTests' "$ROOT/APP/ios/PLANET.xcodeproj/xcshareddata/xcschemes/PLANET.xcscheme"; then
  pass "native launch path is Simulator-only and references existing Xcode targets"
else
  fail "native launch path can target a physical device or stale Xcode target"
fi

if rg -q 'UIApplicationSceneManifest' "$ROOT/APP/ios/PLANET/Info.plist" && \
   rg -q 'final class SceneDelegate: UIResponder, UIWindowSceneDelegate' "$ROOT/APP/ios/PLANET/AppDelegate.swift"; then
  pass "iOS native target adopts the UIScene lifecycle"
else
  fail "iOS native target is missing UIScene lifecycle adoption"
fi

if rg -q '_ = NotificationCenterManager\.shared' "$ROOT/APP/ios/PLANET/AppDelegate.swift"; then
  pass "iOS notification delegate initializes before JS for cold-start responses"
else
  fail "iOS notification delegate may miss cold-start responses before JS loads"
fi

if rg -q 'api_binary_needs_rebuild' "$ROOT/scripts/ios.sh" && \
   rg -q 'find "\$ROOT_DIR/planet-api".*-newer "\$API_BIN"' "$ROOT/scripts/ios.sh"; then
  pass "Simulator launch refreshes stale API binaries before acceptance"
else
  fail "Simulator launch can reuse an API binary older than the current sources"
fi

if [[ -x "$ROOT/scripts/mobile-release-preflight.sh" ]] && \
   rg -q '"preflight:release"\s*:' "$ROOT/APP/package.json"; then
  pass "mobile release configuration has a read-only preflight gate"
else
  fail "mobile release configuration can drift without a preflight gate"
fi

# founder 2026-09-17 裁决：Today 二次工具区为常驻 chips（临时照护/家庭摘要），
# 折叠壳+说明卡形态被否。守门断言对齐裁决后的实现形态。
# i18n 迁移（APP main@edbeae5）后锚点从中文字面改为字典键：临时照护=today.temporaryCare、
# 家庭摘要=today.digest（zh 字典值与原字面逐字一致），chip 行容器 styles.toolsRow。
if rg -q 'styles\.toolsRow' "$APP/features/today/screen.tsx" && \
   rg -q "t\('today\.temporaryCare'\)" "$APP/features/today/screen.tsx" && \
   rg -q "t\('today\.digest'\)" "$APP/features/today/screen.tsx" && \
   ! rg -q 'secondaryToolsOpen' "$APP/features/today/screen.tsx"; then
  pass "Today keeps secondary tools as persistent chips (founder ruling 2026-09-17)"
else
  fail "Today secondary tools drifted from the persistent chips form or regressed to a collapsed shell"
fi

# Today 的次级动作使用封闭的 Arrange sheet：主动作留在卡面，调整/转交/跳过
# 进入同一份弹层，避免多枚同权按钮挤在照护卡内。旧版 secondaryOpen 已删除，
# 不能再用不存在的折叠实现作为验收锚点。
if rg -q 'const \[arrangeOpen' "$APP/features/today/cards.tsx" && \
   rg -q 'function ArrangeSheet' "$APP/features/today/cards.tsx" && \
   rg -q "t\('today\.arrange'\)" "$APP/features/today/cards.tsx" && \
   rg -q 'styles\.featureSecondaryRow' "$APP/features/today/cards.tsx"; then
  pass "Today cards keep alternate actions behind Arrange"
else
  fail "Today cards expose too many equal-priority actions"
fi

if ! rg -q 'queryKeys\.careRequestInbox|careRequests\.inbox|照护请求' "$APP/features/more/screen.tsx"; then
  pass "More page does not duplicate the Requests workspace"
else
  fail "More page duplicates the Requests workspace"
fi

# 查看详情锚点：care.a11yViewRequest（zh=查看请求详情）。delegate 仍只能经
# 详情路由参数（openDetail 的 'delegate' 形参）触达，不得在 toast 上直接暴露。
if rg -q "t\('care\.a11yViewRequest'\)" "$APP/features/care-requests/incoming-request-toast.tsx" && \
   ! rg -q "openDetail\('delegate'\)" "$APP/features/care-requests/incoming-request-toast.tsx"; then
  pass "incoming request toast keeps reassignment behind request details"
else
  fail "incoming request toast exposes reassignment alongside the primary response"
fi

if rg -q '<Stack.Screen name="account/index" />' "$ROOT/APP/app/_layout.tsx" && \
   rg -q "status === 'unauthenticated'.*Redirect href=\"/auth\"" "$APP/features/account/screen.tsx"; then
  pass "account route is protected at both navigator and screen boundaries"
else
  fail "account route can bypass the authenticated navigation boundary"
fi

if rg -q 'accessibilityRole="alert"' "$APP/ui/components/error-boundary.tsx" && \
   rg -q 'minHeight: 44,' "$APP/ui/components/error-boundary.tsx"; then
  pass "global crash recovery exposes alert semantics and a 44pt retry target"
else
  fail "global crash recovery has an inaccessible or undersized retry action"
fi

if rg -q 'accessibilityRole="switch"' "$APP/features/settings/notifications-screen.tsx" && \
   rg -q 'accessibilityLabel=\{label\}' "$APP/features/settings/notifications-screen.tsx" && \
   rg -q 'accessibilityState=\{\{ checked: value, disabled, busy \}\}' "$APP/features/settings/notifications-screen.tsx" && \
   rg -q 'disabled=\{disabled\}' "$APP/features/settings/notifications-screen.tsx" && \
   rg -q "t\('settings\.saving'\)" "$APP/features/settings/notifications-screen.tsx"; then
  pass "notification toggles expose label, hint, and checked state"
else
  fail "notification toggles are ambiguous to assistive technology"
fi

# 有界输入锚点：date 字段 web 直键 maxLength=10；time 字段按裁决 00a1a20 改为
# 只经 TimePickerSheet/原生选择器录入（无自由键入即天然有界，原行内 maxLength=5 输入框已删）；
# 快速记录仍按类型截长，体重标签锚点=timeline.weightField（zh=体重（kg））。
if rg -q 'maxLength=\{10\}' "$APP/ui/components/date-field.tsx" && \
   rg -q 'TimePickerSheet' "$APP/ui/components/date-field.tsx" && \
   rg -q 'maxLength=\{type === "weight" \? 10 : type === "photo" \? 300 : 1000\}' "$APP/features/timeline/composer.tsx" && \
   rg -q 'accessibilityLabel=\{type === "weight" \? t\("timeline\.weightField"\)' "$APP/features/timeline/composer.tsx"; then
  pass "date, time, and quick-record inputs expose bounded values and meaningful labels"
else
  fail "date, time, or quick-record inputs lack bounds or semantic labels"
fi

if rg -q 'normalizeBaseUrl' "$ROOT/APP/src/core/config.ts" && \
   rg -q 'replace\(/\\/\+\$' "$ROOT/APP/src/core/config.ts"; then
  pass "runtime API and public links normalize trailing slashes"
else
  fail "runtime base URLs can generate double-slash routes"
fi

# 加载态文案锚点改为字典键（zh 字典值与原中文字面逐字一致）：
# app.restoringSession=正在恢复登录状态、ui.scopeLoadingA11y=正在加载家庭和宠物范围、
# pets.loadingShares=正在加载分享链接、timeline.a11yLoadingOlder=正在加载更早的记录、
# app.preparingWorkspace=正在准备照护工作区。
if rg -q "LoadingState label=\{t\('app\.restoringSession'\)\}" "$ROOT/APP/app/_layout.tsx" && \
   rg -q "accessibilityLabel=\{t\('ui\.scopeLoadingA11y'\)\}" "$APP/ui/components/scope-cascade.tsx" && \
   rg -q "LoadingState label=\{t\('pets\.loadingShares'\)\}" "$APP/features/pets/sharing-section.tsx" && \
   rg -q "accessibilityLabel=\{t\('timeline\.a11yLoadingOlder'\)\}" "$APP/features/timeline/screen.tsx" && \
   rg -q "LoadingState label=\{t\('app\.restoringSession'\)\}" "$ROOT/APP/app/index.tsx" && \
   rg -q "LoadingState label=\{t\('app\.preparingWorkspace'\)\}" "$ROOT/APP/app/index.tsx"; then
  pass "inline loading states announce what is being loaded"
else
  fail "inline loading states are visually present but semantically ambiguous"
fi

if ! rg -q '<LoadingState />' "$ROOT/APP/src" "$ROOT/APP/app"; then
  pass "all LoadingState instances include a task-specific label"
else
  fail "an unlabeled LoadingState leaves the user without loading context"
fi

if rg -q 'accessibilityState=\{\{ disabled: busy, busy \}\}' "$APP/features/today/cards.tsx" && \
   rg -q "accessibilityLabel=\{t\('today\.a11ySyncing'\)\}" "$APP/features/today/screen.tsx"; then
  pass "Today sync and completion actions expose busy semantics"
else
  fail "Today sync or completion actions hide their busy state"
fi

if rg -q 'accessibilityRole="alert"[^>]*variant="caption"' "$APP/features/digest/digest-card.tsx" "$APP/features/pets/care-section.tsx" "$APP/features/pets/detail-screen.tsx" "$APP/features/care-requests/panel.tsx"; then
  pass "inline dependency failures expose alert semantics"
else
  fail "an inline dependency failure can be silent to assistive technology"
fi

# deploy 契约随 planet-api 演进重锚（非 i18n 失配）：
# - landing 兜底后端 8080→8082（planet-api ba536d1「双后端分流修正」：8080 是另一产品的
#   端口会把结账打成 404，Caddyfile 内注明 2026-09-18 上机实测）；
# - deploy.sh 由 rsync 改为 scp 暂存 + install 落盘，实际 /etc/caddy 切换在
#   install-and-restart.sh：caddy validate → reload → app_paths_ok 请求级分流门，
#   失败自动回滚 Caddy（「caddy split routing regression」）。@app_api 路径集合与
#   production-smoke 的 LANDING_PROGRESS_URL 探针保持不变。
if rg -q '@app_api path /api/v1 /api/v1/\* /healthz /readyz' "$ROOT/planet-api/deploy/Caddyfile" && \
   rg -q 'reverse_proxy 127\.0\.0\.1:8081' "$ROOT/planet-api/deploy/Caddyfile" && \
   rg -q 'reverse_proxy 127\.0\.0\.1:8082' "$ROOT/planet-api/deploy/Caddyfile" && \
   rg -q 'install -m 0644 "\$STAGE_DIR/deploy/Caddyfile"' "$ROOT/planet-api/deploy/deploy.sh" && \
   rg -q 'caddy split routing regression' "$ROOT/planet-api/deploy/install-and-restart.sh" && \
   rg -q 'LANDING_PROGRESS_URL' "$ROOT/scripts/production-smoke.sh"; then
  pass "App API and Landing payment routes keep an explicit Caddy split"
else
  fail "App API deployment can steal or lose Landing payment routes"
fi

if rg -q 'ShareWithFamilyWithIdempotency' "$ROOT/planet-api/internal/modules/pets/http.go" && \
   rg -q "shareFamily: .*Idempotency-Key" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'GrantAccessWithIdempotency' "$ROOT/planet-api/internal/modules/pets/http.go" && \
   rg -q "grantAccess: .*Idempotency-Key" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'revokeShare\(shareId, idempotencyKey\)' "$ROOT/APP/src/core/extension/writers.ts" && \
   rg -q 'revokeCommandIds' "$ROOT/APP/src/features/pets/sharing-section.tsx"; then
  pass "pet sharing and access grants are retry-safe across API and client"
else
  fail "pet sharing or access grants can duplicate after a lost response"
fi

if rg -q 'MoveAssignmentWithIdempotency' "$ROOT/planet-api/internal/modules/tasks/http.go" && \
   rg -q "moveAssignment: .*createIdempotencyKey" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'StopForFamilyWithIdempotency' "$ROOT/planet-api/internal/modules/meds/http.go" && \
   rg -q "stop: .*Idempotency-Key" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'UpdateWithIdempotency' "$ROOT/planet-api/internal/modules/meds/http.go" && \
   rg -q "update: \\(medicationId:.*createIdempotencyKey" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'planetApi\.medications\.update\(initial\.id' "$ROOT/APP/src/features/pets/medications-section.tsx" && \
   rg -q '\}, commandId\.current\)' "$ROOT/APP/src/features/pets/medications-section.tsx" && \
   rg -q 'UpdateWithIdempotency' "$ROOT/planet-api/internal/modules/tasks/http.go" && \
   rg -q "update: \\(carePlanId:.*createIdempotencyKey" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'planetApi\.carePlans\.update\(plan\.id' "$ROOT/APP/src/features/pets/care-section.tsx" && \
   rg -q '\}, commandId\.current\)' "$ROOT/APP/src/features/pets/care-section.tsx" && \
   rg -q 'DeleteWithIdempotency' "$ROOT/planet-api/internal/modules/tasks/http.go" && \
   rg -q "delete: .*care-plans/.*Idempotency-Key" "$ROOT/APP/src/core/api/planet-api.ts"; then
  pass "assignment reorder, care-plan update/delete, and medication stop are retry-safe"
else
  fail "a care-plan edit or destructive care action can repeat on network retry"
fi

if rg -q 'UpdateWithIdempotency' "$ROOT/planet-api/internal/modules/families/http.go" && \
   rg -q "update: \\(familyId:.*createIdempotencyKey" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'planetApi\.families\.update\(family\.id' "$ROOT/APP/src/features/families/detail-screen.tsx" && \
   rg -q '\}, commandId\.current\)' "$ROOT/APP/src/features/families/detail-screen.tsx" && \
   rg -q 'RemoveMemberWithIdempotency' "$ROOT/planet-api/internal/modules/families/http.go" && \
   rg -q "removeMember: .*Idempotency-Key" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'UpdateMemberRoleWithIdempotency' "$ROOT/planet-api/internal/modules/families/http.go" && \
   rg -q "updateMemberRole: .*Idempotency-Key" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'UnshareFromFamilyWithIdempotency' "$ROOT/planet-api/internal/modules/pets/http.go" && \
   rg -q "unshareFamily: .*Idempotency-Key" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'RemoveFromFamilyWithIdempotency' "$ROOT/planet-api/internal/modules/pets/http.go" && \
   rg -q "removeFromFamily: .*Idempotency-Key" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'RevokeAccessWithIdempotency' "$ROOT/planet-api/internal/modules/pets/http.go" && \
   rg -q "revokeAccess: .*Idempotency-Key" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'RemoveAssignmentWithIdempotency' "$ROOT/planet-api/internal/modules/tasks/http.go" && \
   rg -q "removeAssignment: .*Idempotency-Key" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'SetAssignmentWithIdempotency' "$ROOT/planet-api/internal/modules/tasks/http.go" && \
   rg -q "setAssignment: .*createIdempotencyKey" "$ROOT/APP/src/core/api/planet-api.ts"; then
  pass "family role changes and care-assignment governance writes are retry-safe"
else
  fail "a family role change or care-assignment governance write can repeat on network retry"
fi

if rg -q 'UpdateProfileWithIdempotency' "$ROOT/planet-api/internal/modules/identity/http.go" && \
   rg -q 'UpdatePreferencesWithIdempotency' "$ROOT/planet-api/internal/modules/identity/http.go" && \
   rg -q 'update: \(body: \{ display_name\?: string; locale\?: string \}' "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'updatePreferences: ' "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q "'Idempotency-Key': requestKey" "$ROOT/APP/src/core/api/planet-api.ts"; then
  pass "account profile and default scope writes are retry-safe"
else
  fail "account profile or default scope writes can repeat on network retry"
fi

if rg -q 'defaultCommand' "$APP/features/settings/screen.tsx" && \
   rg -q 'updatePreferences\(body, requestKey\)' "$APP/features/settings/screen.tsx" && \
   rg -q 'defaultCommand\.current = null' "$APP/features/settings/screen.tsx"; then
  pass "default scope editor preserves retry identity until the server confirms"
else
  fail "default scope editor regenerates a request key before confirmation"
fi

if rg -q 'destructiveCommandId\.current' "$APP/features/families/detail-screen.tsx" && \
   rg -q 'lifecycleCommandId\.current' "$APP/features/pets/detail-screen.tsx" && \
   rg -q 'function cancelDestructive' "$APP/features/families/detail-screen.tsx" && \
   rg -q 'function cancelLifecycle' "$APP/features/pets/detail-screen.tsx" && \
   rg -q 'restoreCommandIds\.current' "$APP/features/pets/screen.tsx" && \
   rg -q 'restoreCommandIds\.current' "$APP/features/settings/deleted-families-screen.tsx" && \
   rg -q 'families\.restore\(family\.id, requestKey\)' "$APP/features/settings/deleted-families-screen.tsx" && \
   rg -q "archive: .*createIdempotencyKey" "$ROOT/APP/src/core/api/planet-api.ts"; then
  pass "lifecycle confirmations reuse one command key after a lost response"
else
  fail "lifecycle confirmations can issue a new command after a lost response"
fi

if rg -q 'roleCommandIds' "$APP/features/families/detail-screen.tsx" && \
   rg -q 'updateMemberRole\(family\.id, member\.user_id, nextRole, requestKey\)' "$APP/features/families/detail-screen.tsx" && \
   rg -q 'removePetCommand' "$APP/features/families/detail-screen.tsx" && \
   rg -q 'removeFromFamily\(petToRemove\.id, family\.id, requestKey\)' "$APP/features/families/detail-screen.tsx" && \
   rg -q 'familyCommandIds' "$APP/features/pets/detail-screen.tsx" && \
   rg -q 'shareFamily\(pet\.id, selectedFamily\.id, requestKey\)' "$APP/features/pets/detail-screen.tsx" && \
   rg -q 'unshareFamily\(pet\.id, familyToRemove\.id, requestKey\)' "$APP/features/pets/detail-screen.tsx"; then
  pass "family role and pet-family governance writes reuse one command key"
else
  fail "family role or pet-family governance writes can repeat on network retry"
fi

if rg -q 'assignmentCommandIds' "$APP/features/pets/assignments-screen.tsx" && \
   rg -q 'setAssignment\(planId, userId, .helper., requestKey\)' "$APP/features/pets/assignments-screen.tsx" && \
   rg -q 'rethrowOnError' "$APP/features/pets/assignments-screen.tsx" && \
   rg -q 'actionCommandIds' "$APP/features/pets/medications-section.tsx" && \
   rg -q 'medications\.stop\(' "$APP/features/pets/medications-section.tsx" && \
   rg -q 'medications\.delete\(deleting\.id, requestKey\)' "$APP/features/pets/medications-section.tsx"; then
  pass "assignment and medication lifecycle actions preserve retry and failure state"
else
  fail "assignment or medication actions can lose retry identity or close on failure"
fi

if rg -q 'nameCommandId\.current' "$APP/features/account/screen.tsx" && \
   rg -q 'localeCommandId\.current' "$APP/features/account/screen.tsx" && \
   rg -q 'me\.update\(\{ display_name: displayName \}, nameCommandId\.current\)' "$APP/features/account/screen.tsx" && \
   rg -q 'me\.update\(\{ locale: value \}, localeCommandId\.current\)' "$APP/features/account/screen.tsx"; then
  pass "account editors reuse one command key until the save is confirmed"
else
  fail "account editors regenerate a command key before the save is confirmed"
fi

if rg -q 'setSessionToRevoke\(null\)' "$APP/features/account/screen.tsx" && \
   ! rg -q 'finally \{[[:space:]]*setSessionToRevoke\(null\)' "$APP/features/account/screen.tsx"; then
  pass "session revoke keeps its confirmation open after a failed request"
else
  fail "session revoke can close before the server confirms the action"
fi

if rg -q "t\('account\.displayNameLabel'\)[^\n]*maxLength=\{60\}" "$APP/features/account/screen.tsx" && \
   rg -q 'display_name must be 1-60 chars' "$ROOT/planet-api/internal/modules/identity/service.go"; then
  pass "account display-name input matches the server validation boundary"
else
  fail "account display-name input allows values the server will reject"
fi

# 事实说明锚点改为当前页面契约（键值经五语核对）：
# - 时间线由记录行保留记录者/家庭归属，范围只读时说明如何恢复写权限；
# - 分享快照时效说明 settings.snapshotDesc（五语均含「生成时点+向家庭确认」）；
# - 趋势页按 info-design 裁决 f10f8cc（E7 归属不逐行复读/E8 开发者注脚不进卡片）删除
#   逐卡「数据来源 ·」注脚，改为结论先行句子（trendStatLine）+ 卡尾「查看记录」入口
#   （trends.viewRecords，通向带来源说明的时间线）；
# - 用药删除的后果在确认弹层 pets.confirmDeleteMedConsequence 与完成 toast
#   pets.medDeletedToast（五语均含「相关自动记录一并移除」，且不再误称「错误档案」）。
if rg -q 'const timelineSubtitle' "$APP/features/timeline/screen.tsx" && \
   rg -q 'timelineActorLine\(event\.recorded_by_name\)' "$APP/features/timeline/event-card.tsx" && \
   rg -q "t\('timeline\.scopeViewOnlyDesc'\)" "$APP/features/timeline/screen.tsx" && \
   rg -q "t\('settings\.snapshotDesc'" "$APP/features/settings/public-share-screen.tsx" && \
   rg -q 'trendStatLine' "$APP/features/trends/screen.tsx" && \
   rg -q "t\('trends\.viewRecords'\)" "$APP/features/trends/screen.tsx" && \
   rg -q "t\('pets\.confirmDeleteMedConsequence'\)" "$APP/features/pets/medications-section.tsx" && \
   rg -q "t\('pets\.medDeletedToast'\)" "$APP/features/pets/medications-section.tsx"; then
  pass "timeline, trends, shares, and destructive feedback explain their facts"
else
  fail "a factual view or destructive action hides important consequences"
fi

if rg -q 'commandIdForIntent' "$APP/features/care-requests/panel.tsx" && \
   ! rg -q 'mutation\.mutate\(createIdempotencyKey\(\)\)' "$APP/features/care-requests/panel.tsx"; then
  pass "single care-request composer reuses one command key while the intent is unchanged"
else
  fail "single care-request composer can regenerate a command key after a lost response"
fi

if rg -q 'responseCommandIds' "$APP/features/care-requests/panel.tsx" && \
   rg -q 'responseCommandIds\.current\.delete' "$APP/features/care-requests/panel.tsx" && \
   rg -q 'responseCommandIds' "$APP/features/care-requests/batch-panel.tsx" && \
   rg -q 'responseCommandIds\.current\.delete' "$APP/features/care-requests/batch-panel.tsx" && \
   ! rg -q 'commandId: createIdempotencyKey\(\)' "$APP/features/care-requests/panel.tsx" "$APP/features/care-requests/batch-panel.tsx" "$APP/features/care-requests/incoming-request-toast.tsx"; then
  pass "care-request and batch response actions preserve retry identity"
else
  fail "care-request or batch response actions can duplicate after a lost response"
fi

if rg -q 'commandIdForDelete' "$APP/features/timeline/screen.tsx" && \
   rg -q 'deleteTimelineEvent: \(eventId: string, petId\?: string, idempotencyKey\?: string\)' "$APP/core/foundation/contracts.ts" && \
   rg -q 'idempotencyKey \?\? createIdempotencyKey' "$APP/core/foundation/writers.ts"; then
  pass "timeline deletion keeps its command key while the confirmation remains open"
else
  fail "timeline deletion can issue a second command after a lost response"
fi

if rg -q 'skipCommandIds' "$APP/features/today/screen.tsx" && \
   rg -q 'setError\(errorMessage\(reason\)\)' "$APP/features/today/screen.tsx" && \
   rg -q 'accessibilityRole="alert" variant="caption" color=\{theme\.colors\.danger\}' "$APP/features/today/screen.tsx" && \
   rg -q "label=\{choice \? skipChoiceLabel\(choice\) : t\('today\.continue'\)\}" "$APP/features/today/screen.tsx"; then
  pass "skip actions preserve retry identity and keep failure recovery in context"
else
  fail "skip actions close or lose retry context after a failed submission"
fi

if rg -q 'careCommandIds' "$APP/features/today/screen.tsx" && \
   rg -q "commandIdForCare\('undo'" "$APP/features/today/screen.tsx" && \
   rg -q "commandIdForCare\('claim'" "$APP/features/today/screen.tsx" && \
   rg -q "commandIdForCare\('complete'" "$APP/features/today/screen.tsx"; then
  pass "Today completion, undo, and claim actions preserve retry identity"
else
  fail "Today completion, undo, or claim can duplicate after a lost response"
fi

if rg -q 'const rereadRequestInbox = async' "$APP/features/care-requests/incoming-request-toast.tsx" && \
   [[ "$(rg -c 'await rereadRequestInbox\(\)' "$APP/features/care-requests/incoming-request-toast.tsx")" -ge 4 ]] && \
   rg -q 'requestRefreshFailures' "$APP/features/care-requests/incoming-request-toast.tsx" && \
   rg -q 'onSettled' "$APP/features/care-requests/incoming-request-toast.tsx"; then
  pass "notification fallback actions reread request state before closing or routing"
else
  fail "notification fallback actions can close or route before request state is reread"
fi

if rg -q 'const rereadToday = async' "$APP/features/today/screen.tsx" && \
   rg -q 'await rereadToday\(\)' "$APP/features/today/screen.tsx" && \
   rg -q 'todayRefreshFailures' "$APP/features/today/screen.tsx" && \
   rg -q "accessibilityLabel=\{t\('today\.a11yRetryTodaySync'\)\}" "$APP/features/today/screen.tsx"; then
  pass "Today execution writes reread authoritative state before success or retry reset"
else
  fail "Today execution writes can report success before the current checklist is reread"
fi

if rg -q 'client\.refetchQueries' "$APP/features/today/schedule-adjustment.tsx" && \
   rg -q "queryKey: \['today'\]" "$APP/features/today/schedule-adjustment.tsx" && \
   rg -q 'client\.refetchQueries' "$APP/features/today/temporary-care.tsx" && \
   rg -q "queryKey: \['today'\]" "$APP/features/today/temporary-care.tsx"; then
  pass "Today schedule writes reread authoritative state before showing success"
else
  fail "Today schedule writes can show success before rereading authoritative state"
fi

if rg -q 'await client\.refetchQueries' "$APP/features/pets/edit-screen.tsx" && \
   rg -q 'queryKeys\.pet\(pet\.id\)' "$APP/features/pets/edit-screen.tsx" && \
   rg -q 'invalidateAfterPetChange\(client, pet\.id\)' "$APP/features/pets/edit-screen.tsx"; then
  pass "pet profile writes reread the authoritative pet record before navigation"
else
  fail "pet profile writes can navigate before the authoritative pet record is reread"
fi

if rg -q 'async function refresh' "$APP/features/pets/medications-section.tsx" && \
   rg -q 'queryKeys\.medications\(pet\.id\)' "$APP/features/pets/medications-section.tsx" && \
   rg -q 'await refresh\(\)' "$APP/features/pets/medications-section.tsx" && \
   rg -q 'await onSaved\(saved\)' "$APP/features/pets/medications-section.tsx"; then
  pass "medication writes reread authoritative history before closing or showing success"
else
  fail "medication writes can close or show success before authoritative history is reread"
fi

if rg -q 'async function refresh' "$APP/features/pets/care-section.tsx" && \
   rg -q 'queryKeys\.carePlans\(pet\.id, true, familyId\)' "$APP/features/pets/care-section.tsx" && \
   rg -q 'await refresh\(\)' "$APP/features/pets/care-section.tsx" && \
   rg -q 'await onSaved\(\)' "$APP/features/pets/care-section.tsx"; then
  pass "care-plan writes reread authoritative plans before closing or routing"
else
  fail "care-plan writes can close or route before authoritative plans are reread"
fi

if rg -q 'await client\.refetchQueries' "$APP/features/pets/detail-screen.tsx" && \
   rg -q 'queryKeys\.pet\(pet\.id\)' "$APP/features/pets/detail-screen.tsx" && \
   rg -q 'queryKeys\.accessiblePets' "$APP/features/pets/detail-screen.tsx"; then
  pass "pet lifecycle writes reread authoritative detail or accessible list before closing or routing"
else
  fail "pet lifecycle writes can close or route before authoritative state is reread"
fi

if rg -q 'queryKeys\.families' "$APP/features/families/detail-screen.tsx" && \
   rg -q 'await client\.refetchQueries' "$APP/features/families/detail-screen.tsx" && \
   rg -q 'query\.refetch\(\{ throwOnError: true \}\)' "$APP/features/families/detail-screen.tsx" && \
   rg -q 'pets\.refetch\(\{ throwOnError: true \}\)' "$APP/features/families/detail-screen.tsx"; then
  pass "family governance writes keep confirmation and retry keys until authoritative lists refresh"
else
  fail "family governance writes can clear confirmation or retry keys before lists refresh"
fi

if rg -q 'await query\.refetch\(\{ throwOnError: true \}\)' "$APP/features/timeline/screen.tsx" && \
   rg -q 'await onSaved\(\)' "$APP/features/timeline/composer.tsx" && \
   rg -q 'serverWriteSucceeded' "$APP/features/timeline/composer.tsx" && \
   rg -q 'await query\.refetch\(\{ throwOnError: true \}\)' "$APP/features/timeline/screen.tsx"; then
  pass "timeline writes reread authoritative events without queueing duplicates after refresh failure"
else
  fail "timeline writes can finish before reread or queue a duplicate after refresh failure"
fi

if rg -q "pet profile save keeps the editor open until authoritative reread succeeds" "$ROOT/APP/e2e/core-flows.spec.ts" && \
   rg -q "medication edit keeps its modal and request key until history reread succeeds" "$ROOT/APP/e2e/core-flows.spec.ts" && \
   rg -q "pet archive confirmation stays open until the detail reread succeeds" "$ROOT/APP/e2e/core-flows.spec.ts"; then
  pass "direct UI regression covers profile, medication, and lifecycle reread recovery"
else
  fail "direct UI regression is missing profile, medication, or lifecycle reread recovery"
fi

if rg -q 'if \(query\.error && !query\.data\)' "$APP/features/timeline/screen.tsx" && \
   rg -q 'if \(query\.error && !query\.data\)' "$APP/features/families/transfers-screen.tsx" && \
   rg -q 'if \(query\.error && !query\.data\)' "$APP/features/pets/sharing-section.tsx" && \
   rg -q 'query\.error && !query\.data' "$APP/features/settings/deleted-families-screen.tsx" && \
   rg -q 'if \(!user\)' "$APP/features/account/screen.tsx"; then
  pass "stale-data refresh errors preserve active editors and destructive contexts"
else
  fail "stale-data refresh errors can replace an active editor or destructive context"
fi

if rg -q 'const rereadRequestState = async' "$APP/features/care-requests/panel.tsx" && \
   rg -q 'await rereadRequestState\(' "$APP/features/care-requests/panel.tsx" && \
   rg -q 'responseRefreshFailures' "$APP/features/care-requests/panel.tsx" && \
   rg -q 'const rereadBatchResponseState = async' "$APP/features/care-requests/batch-panel.tsx" && \
   rg -q 'const rereadBatchState = async' "$APP/features/care-requests/batch-panel.tsx" && \
   rg -q 'const rereadCreatedBatchState = async' "$APP/features/care-requests/batch-panel.tsx" && \
   rg -q 'await rereadBatchResponseState\(' "$APP/features/care-requests/batch-panel.tsx" && \
   rg -q 'await rereadBatchState\(' "$APP/features/care-requests/batch-panel.tsx" && \
   rg -q 'await rereadCreatedBatchState\(' "$APP/features/care-requests/batch-panel.tsx" && \
   rg -q 'refreshFailures' "$APP/features/care-requests/batch-panel.tsx"; then
  pass "care-request and batch writes reread authoritative state before success or retry reset"
else
  fail "care-request or batch writes can report success before authoritative state is reread"
fi

if rg -q 'refreshFailures' "$APP/features/collaboration/care-responsibility-banner.tsx" && \
   rg -q 'queryKeys\.careResponsibility\(familyId\)' "$APP/features/collaboration/care-responsibility-banner.tsx" && \
   rg -q 'queryKeys\.handoffSummary\(familyId\)' "$APP/features/collaboration/care-responsibility-banner.tsx" && \
   rg -q 'syncError' "$APP/features/collaboration/care-risk-banner.tsx" && \
   rg -q 'queryKeys\.careRisks\(familyId\)' "$APP/features/collaboration/care-risk-banner.tsx" && \
   rg -q "t\('collaboration\.retrySync'\)" "$APP/features/collaboration/care-risk-banner.tsx"; then
  pass "handoff and care-risk writes reread authoritative responsibility state before closing or clearing retry keys"
else
  fail "handoff or care-risk writes can close or clear retry state before authoritative reread"
fi

if rg -q 'StaleDataNotice' "$APP/features/pets/care-section.tsx" "$APP/features/pets/medications-section.tsx" "$APP/features/pets/sharing-section.tsx" "$APP/features/timeline/screen.tsx" "$APP/features/families/transfers-screen.tsx" "$APP/features/settings/notifications-screen.tsx" && \
   rg -q 'button: \{ minHeight: 44 \}' "$APP/ui/components/stale-data-notice.tsx" && \
   rg -q 'await query\.refetch\(\{ throwOnError: true \}\)' "$APP/features/families/transfers-screen.tsx" && \
   rg -q 'commandKeys\.current\.delete\(commandScope\)' "$APP/features/families/transfers-screen.tsx"; then
  pass "stale-data refreshes are visible and transfer confirmations keep retry keys until reread"
else
  fail "stale-data refreshes are silent or transfer confirmations clear retry keys too early"
fi

exit "$FAIL"
