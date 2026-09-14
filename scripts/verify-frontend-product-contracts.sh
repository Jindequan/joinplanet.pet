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

if rg -q 'publicWebBaseUrl}/invite/' "$APP/features/families/invite-sheet.tsx" && \
   rg -q '用邀请码加入' "$APP/features/families/invite-sheet.tsx"; then
  pass "family invites share a preview link with a manual-code fallback"
else
  fail "family invites do not provide a usable preview link and fallback"
fi

if rg -q '<Stack.Screen name="invite/\[code\]"' "$ROOT/APP/app/_layout.tsx" && \
   rg -q 'publicInviteRoute' "$ROOT/APP/app/_layout.tsx" && \
   rg -q 'inviteHref' "$APP/features/auth/screen.tsx" && \
   rg -q "status !== 'authenticated'" "$APP/features/families/form-screen.tsx"; then
  pass "public invite previews preserve the code through authentication"
else
  fail "public invite previews can lose the code at the auth boundary"
fi

if rg -q 'useLocalSearchParams' "$APP/features/families/form-screen.tsx" && \
   rg -q 'inviteCodeParam' "$APP/features/families/form-screen.tsx"; then
  pass "invite deep links seed the join form"
else
  fail "invite deep links no longer seed the join form"
fi

if rg -q 'previewError' "$APP/features/families/form-screen.tsx" && \
   rg -q 'label="重试核对"' "$APP/features/families/form-screen.tsx"; then
  pass "invite preview failures expose a recovery action"
else
  fail "invite preview failures have no recovery action"
fi

if rg -q 'continuationError' "$APP/features/care-requests/panel.tsx" && \
   rg -q 'label="重试打开继续安排"' "$APP/features/care-requests/panel.tsx"; then
  pass "offline decline continuation failures expose a recovery action"
else
  fail "offline decline continuation failures can become silent"
fi

if rg -q 'continuationError' "$APP/features/care-requests/batch-panel.tsx" && \
   rg -q 'label="重试打开继续安排"' "$APP/features/care-requests/batch-panel.tsx"; then
  pass "batch decline continuation failures expose a recovery action"
else
  fail "batch decline continuation failures can become silent"
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

if rg -q 'secondaryToolsOpen' "$APP/features/today/screen.tsx" && \
   rg -q 'secondaryToolsTrigger' "$APP/features/today/screen.tsx"; then
  pass "Today keeps secondary tools collapsed by default"
else
  fail "Today secondary tools can crowd the primary checklist"
fi

if rg -q 'secondaryOpen' "$APP/features/today/cards.tsx" && \
   rg -q '展开其他安排方式' "$APP/features/today/cards.tsx"; then
  pass "collaboration cards keep alternate actions behind More"
else
  fail "collaboration cards expose too many equal-priority actions"
fi

if ! rg -q 'queryKeys\.careRequestInbox|careRequests\.inbox|照护请求' "$APP/features/more/screen.tsx"; then
  pass "More page does not duplicate the Requests workspace"
else
  fail "More page duplicates the Requests workspace"
fi

if rg -q 'accessibilityLabel="查看请求详情"' "$APP/features/care-requests/incoming-request-toast.tsx" && \
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
   rg -q 'accessibilityState=\{\{ checked: value \}\}' "$APP/features/settings/notifications-screen.tsx"; then
  pass "notification toggles expose label, hint, and checked state"
else
  fail "notification toggles are ambiguous to assistive technology"
fi

if rg -q 'maxLength=\{10\}' "$APP/ui/components/date-field.tsx" && \
   rg -q 'maxLength=\{5\}' "$APP/ui/components/date-field.tsx" && \
   rg -q 'maxLength=\{type === "weight" \? 10 : type === "photo" \? 300 : 1000\}' "$APP/features/timeline/composer.tsx" && \
   rg -q 'accessibilityLabel=\{type === "weight" \? "体重（kg）"' "$APP/features/timeline/composer.tsx"; then
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

if rg -q 'LoadingState label="正在恢复登录状态"' "$ROOT/APP/app/_layout.tsx" && \
   rg -q 'accessibilityLabel="正在加载家庭和宠物范围"' "$APP/ui/components/scope-cascade.tsx" && \
   rg -q 'LoadingState label="正在加载分享链接"' "$APP/features/pets/sharing-section.tsx" && \
   rg -q 'accessibilityLabel="正在加载更早的记录"' "$APP/features/timeline/screen.tsx" && \
   rg -q 'LoadingState label="正在恢复登录状态"' "$ROOT/APP/app/index.tsx" && \
   rg -q 'LoadingState label="正在准备照护工作区"' "$ROOT/APP/app/index.tsx"; then
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
   rg -q 'accessibilityLabel="正在同步最新照护状态"' "$APP/features/today/screen.tsx"; then
  pass "Today sync and completion actions expose busy semantics"
else
  fail "Today sync or completion actions hide their busy state"
fi

if rg -q 'accessibilityRole="alert"[^>]*variant="caption"' "$APP/features/digest/digest-card.tsx" "$APP/features/pets/care-section.tsx" "$APP/features/pets/detail-screen.tsx" "$APP/features/care-requests/panel.tsx"; then
  pass "inline dependency failures expose alert semantics"
else
  fail "an inline dependency failure can be silent to assistive technology"
fi

if rg -q '@app_api path /api/v1 /api/v1/\* /healthz /readyz' "$ROOT/planet-api/deploy/Caddyfile" && \
   rg -q 'reverse_proxy 127\.0\.0\.1:8081' "$ROOT/planet-api/deploy/Caddyfile" && \
   rg -q 'reverse_proxy 127\.0\.0\.1:8080' "$ROOT/planet-api/deploy/Caddyfile" && \
   rg -q 'rsync -av deploy/Caddyfile' "$ROOT/planet-api/deploy/deploy.sh" && \
   rg -q 'LANDING_PROGRESS_URL' "$ROOT/scripts/production-smoke.sh"; then
  pass "App API and Landing payment routes keep an explicit Caddy split"
else
  fail "App API deployment can steal or lose Landing payment routes"
fi

if rg -q 'ShareWithFamilyWithIdempotency' "$ROOT/planet-api/internal/modules/pets/http.go" && \
   rg -q "shareFamily: .*Idempotency-Key" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'GrantAccessWithIdempotency' "$ROOT/planet-api/internal/modules/pets/http.go" && \
   rg -q "grantAccess: .*Idempotency-Key" "$ROOT/APP/src/core/api/planet-api.ts"; then
  pass "pet sharing and access grants are retry-safe across API and client"
else
  fail "pet sharing or access grants can duplicate after a lost response"
fi

if rg -q 'MoveAssignmentWithIdempotency' "$ROOT/planet-api/internal/modules/tasks/http.go" && \
   rg -q "moveAssignment: .*createIdempotencyKey" "$ROOT/APP/src/core/api/planet-api.ts" && \
   rg -q 'StopForFamilyWithIdempotency' "$ROOT/planet-api/internal/modules/meds/http.go" && \
   rg -q "stop: .*Idempotency-Key" "$ROOT/APP/src/core/api/planet-api.ts"; then
  pass "assignment reorder and medication stop are retry-safe"
else
  fail "assignment reorder or medication stop can repeat on network retry"
fi

if rg -q 'outgoingError' "$APP/features/pets/transfer-screen.tsx" && \
   rg -q '不能安全地发起新的转移' "$APP/features/pets/transfer-screen.tsx"; then
  pass "pet transfer blocks writes when existing status is unknown"
else
  fail "pet transfer can create duplicates when existing status lookup fails"
fi

if rg -q 'incomingTransfers\.error' "$APP/features/families/detail-screen.tsx" && \
   rg -q '重试加载转移请求' "$APP/features/families/detail-screen.tsx"; then
  pass "family detail exposes recovery when incoming transfers are unavailable"
else
  fail "family detail can silently hide incoming transfer requests on failure"
fi

if rg -q 'if \(rule === '\''interval'\''\) schedule\.every_n = Number\(interval\)' "$APP/features/pets/care-section.tsx"; then
  pass "care plan interval edits use the backend every_n schedule contract"
else
  fail "care plan interval edits can send an unsupported interval schedule key"
fi

if rg -q "from 'expo-print'" "$APP/features/settings/public-share-screen.tsx" && \
   rg -q "from 'expo-sharing'" "$APP/features/settings/public-share-screen.tsx" && \
   rg -q 'label="打印 / 保存 PDF"' "$APP/features/settings/public-share-screen.tsx" && \
   rg -q 'buildSummaryPdfHtml' "$APP/features/settings/summary-pdf.ts" && \
   rg -q '准备就诊' "$APP/features/pets/detail-screen.tsx"; then
  pass "Vet-ready summaries expose a native and web PDF output path"
else
  fail "Vet-ready summaries have no complete PDF output path"
fi

if rg -q 'deworm' "$APP/features/timeline/composer.tsx" && \
   rg -q 'deworm' "$APP/features/timeline/registry.ts" && \
   rg -q 'deworm' "$ROOT/planet-api/internal/modules/timeline/registry.go"; then
  pass "Vet timelines capture deworming records alongside vaccines"
else
  fail "Vet timelines have no deworming record contract"
fi

if rg -q "from 'expo-file-system'" "$ROOT/APP/src/features/pets/detail-screen.tsx" && \
   rg -q "shareAsync\(file.uri" "$ROOT/APP/src/features/pets/detail-screen.tsx" && \
   rg -q 'anchor.download' "$ROOT/APP/src/features/pets/detail-screen.tsx"; then
  pass "Structured pet JSON export downloads or shares as a file"
else
  fail "Structured pet JSON export still falls back to text-only sharing"
fi

if rg -q 'med_decision_maker' "$APP/features/settings/public-share-screen.tsx" && \
   rg -q '医疗决定人' "$APP/features/settings/public-share-screen.tsx"; then
  pass "Care Cards expose the medical decision maker"
else
  fail "Care Cards omit the medical decision maker"
fi

if rg -q '数据来源 · 家庭成员记录的照护事实与宠物事件' "$APP/features/timeline/screen.tsx" && \
   rg -q '内容来自分享人生成的只读快照' "$APP/features/settings/public-share-screen.tsx" && \
   rg -q '数据来源 · .*时间线与照护记录' "$APP/features/trends/screen.tsx"; then
  pass "timeline, trends, and public shares explain their factual source"
else
  fail "a factual view does not explain where its data comes from"
fi

exit "$FAIL"
