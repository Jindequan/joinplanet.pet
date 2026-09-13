-- 双数据库角色（以超级用户执行一次；BACKEND-DESIGN §2.2）
-- planet_owner: 仅迁移用（DDL）；planet_app: 服务运行时（无 DDL，仅 DML）
CREATE ROLE planet_owner LOGIN PASSWORD 'CHANGE_ME_OWNER';
CREATE ROLE planet_app LOGIN PASSWORD 'CHANGE_ME_APP';

CREATE DATABASE planet OWNER planet_owner;
\c planet

GRANT ALL ON SCHEMA public TO planet_owner;
GRANT USAGE ON SCHEMA public TO planet_app;

-- 迁移后由 planet_owner 执行（或直接 source 本文件授权段；deploy.sh 在 migrate up 之后也会再次执行）。
-- 这样迁移新建的表也立即对 planet_app 可用（DEFAULT PRIVILEGES）。
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO planet_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO planet_app;
ALTER DEFAULT PRIVILEGES FOR ROLE planet_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO planet_app;
ALTER DEFAULT PRIVILEGES FOR ROLE planet_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO planet_app;

-- 最小权限：计费/配额定义表对运行时角色收权（deploy.sh 每次部署会重放）。
-- plans/quota_configs 只读（限额变更走 planet-cli + owner 角色）；
-- entitlements 只读（授权是管理路径）；subscriptions 允许 INSERT（注册即
-- 订阅 free）但禁止改删。应用层被打穿时无法自改配额。
REVOKE INSERT, UPDATE, DELETE ON plans, quota_configs, entitlements FROM planet_app;
REVOKE UPDATE, DELETE ON subscriptions FROM planet_app;

-- planet-api 的 DATABASE_URL 使用 planet_app；迁移使用 planet_owner。
-- 与 landing 的 lemon-webhook 数据库互不可见（分库分角色）。
