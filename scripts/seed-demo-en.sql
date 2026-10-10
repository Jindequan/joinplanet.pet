-- PLANET 商店截图英文演示数据集（planet_shots 库专用）。
-- 内容对齐已过审的 6.5″ 图集：The Chen Family / Alex & Jamie Chen / Milo & Luna。
-- 依赖 dev.sh 已跑完 migrations；幂等不保证——只在空库跑一次。

-- 用户
INSERT INTO users (email, display_name) VALUES
  ('alex@planet.demo',  'Alex Chen'),
  ('jamie@planet.demo', 'Jamie Chen');

INSERT INTO subscriptions (user_id, plan, status)
SELECT id, 'free', 'active' FROM users WHERE email IN ('alex@planet.demo','jamie@planet.demo');

-- 家庭（洛杉矶时区，驱动 Today 的「今天」）
WITH f AS (
  INSERT INTO families (name, timezone, created_by_user_id)
  VALUES ('The Chen Family','America/Los_Angeles',(SELECT id FROM users WHERE email='alex@planet.demo'))
  RETURNING id
)
INSERT INTO family_memberships (family_id, user_id, role)
SELECT f.id, us.id, u.r FROM f
JOIN (VALUES
  ('alex@planet.demo','owner'),
  ('jamie@planet.demo','caregiver')
) AS u(email,r) ON true
JOIN users us ON us.email = u.email;

INSERT INTO family_invitations (family_id, token_hash, expires_at, created_by_user_id)
SELECT id, md5(random()::text), now() + interval '30 days', created_by_user_id FROM families;

-- 宠物：Milo（金毛）+ Luna（猫）
WITH m AS (
  INSERT INTO pets (name, species, breed, birth_date, sex, neutered, weight_g, created_by_user_id)
  VALUES ('Milo','dog','Golden Retriever','2022-03-14','male',true,31400,
          (SELECT id FROM users WHERE email='alex@planet.demo'))
  RETURNING id, created_by_user_id
)
INSERT INTO pet_ownerships (pet_id, owner_user_id, created_by_user_id)
SELECT m.id, m.created_by_user_id, m.created_by_user_id FROM m;

WITH l AS (
  INSERT INTO pets (name, species, breed, birth_date, sex, neutered, weight_g, created_by_user_id)
  VALUES ('Luna','cat','Domestic Shorthair','2024-06-02','female',true,4600,
          (SELECT id FROM users WHERE email='alex@planet.demo'))
  RETURNING id, created_by_user_id
)
INSERT INTO pet_ownerships (pet_id, owner_user_id, created_by_user_id)
SELECT l.id, l.created_by_user_id, l.created_by_user_id FROM l;

INSERT INTO family_pet_links (family_id, pet_id, linked_by_user_id)
SELECT f.id, p.id, f.created_by_user_id FROM families f CROSS JOIN pets p
WHERE f.name='The Chen Family' AND p.name IN ('Milo','Luna');

-- Milo 档案
UPDATE pets SET
  allergies = '[{"name":"Chicken","severity":"medium","note":"Soft stool after chicken"}]',
  conditions = '[{"name":"Patellar luxation (grade 1)","since":"2024-06","note":"Avoid intense jumping"}]',
  emergency_contacts = '[{"name":"Harborview Animal Hospital","phone":"(415) 555-0148","relation":"Vet"}]',
  med_decision_maker = '{"name":"Alex Chen","phone":"(415) 555-0100"}',
  notes = 'Loves the water. Gets the zoomies after dinner — a 20 minute walk settles him.'
WHERE name='Milo';
UPDATE pets SET notes = 'Indoor only. Prefers the sunny spot on the couch.' WHERE name='Luna';

-- 照护计划（Milo）：每日五件套 + 时间对齐已过审图集
INSERT INTO care_plans (pet_id, type, title, created_by_user_id)
SELECT p.id,'custom',t.title,(SELECT id FROM users WHERE email='alex@planet.demo')
FROM pets p CROSS JOIN (VALUES
  ('Breakfast'),('Heartworm pill'),('Midday walk'),('Dinner'),('Joint supplement')
) AS t(title) WHERE p.name='Milo';

INSERT INTO care_rules (care_plan_id, frequency, schedule, local_time, timezone, effective_from, created_by_user_id)
SELECT cp.id,'daily','{"v":1,"kind":"daily"}',t.tod::time,'America/Los_Angeles',((now() AT TIME ZONE 'America/Los_Angeles')::date),
       (SELECT id FROM users WHERE email='alex@planet.demo')
FROM care_plans cp JOIN (VALUES
  ('Breakfast','08:00'),('Heartworm pill','07:30'),('Midday walk','12:30'),
  ('Dinner','18:00'),('Joint supplement','21:00')
) AS t(title,tod) ON t.title=cp.title WHERE cp.pet_id=(SELECT id FROM pets WHERE name='Milo');

INSERT INTO care_plan_assignments (care_plan_id, user_id, role, created_by_user_id)
SELECT cp.id,(SELECT id FROM users WHERE email='alex@planet.demo'),'owner',
       (SELECT id FROM users WHERE email='alex@planet.demo')
FROM care_plans cp WHERE cp.pet_id=(SELECT id FROM pets WHERE name='Milo');

-- 今天的发生项：早餐+心丝虫已done；Midday walk / Dinner / Joint supplement 待办
INSERT INTO care_occurrences (care_plan_id, care_rule_id, pet_id, occurrence_key, due_at, due_date,
  local_time, timezone, assigned_to_user_id, status, type_snapshot, title_snapshot, frequency_snapshot,
  completed_by_user_id, completed_at, note)
SELECT ci.id, cr.id, ci.pet_id, cr.id::text||':'||((now() AT TIME ZONE 'America/Los_Angeles')::date),
  ((((now() AT TIME ZONE 'America/Los_Angeles')::date) + COALESCE(cr.local_time,'00:00'::time)) AT TIME ZONE cr.timezone),
  ((now() AT TIME ZONE 'America/Los_Angeles')::date), cr.local_time, cr.timezone,
  (SELECT id FROM users WHERE email='alex@planet.demo'),
  CASE WHEN ci.title IN ('Breakfast','Heartworm pill') THEN 'completed' ELSE 'pending' END,
  ci.type, ci.title, cr.schedule,
  CASE WHEN ci.title IN ('Breakfast','Heartworm pill')
    THEN (SELECT id FROM users WHERE email='alex@planet.demo') END,
  CASE WHEN ci.title IN ('Breakfast','Heartworm pill') THEN now() END,
  ''
FROM care_plans ci JOIN care_rules cr ON cr.care_plan_id=ci.id
WHERE ci.pet_id=(SELECT id FROM pets WHERE name='Milo') AND cr.frequency='daily'
ON CONFLICT (care_rule_id, due_date) WHERE deleted_at IS NULL DO NOTHING;

-- 过去 28 天的历史发生项（~90% 完成，喂 care-stats 与 Trends）
INSERT INTO care_occurrences (care_plan_id, care_rule_id, pet_id, occurrence_key, due_at, due_date,
  local_time, timezone, assigned_to_user_id, status, type_snapshot, title_snapshot, frequency_snapshot,
  completed_by_user_id, completed_at, note)
SELECT ci.id, cr.id, ci.pet_id,
  cr.id::text||':'||d::text,
  ((d + COALESCE(cr.local_time,'00:00'::time)) AT TIME ZONE cr.timezone),
  d, cr.local_time, cr.timezone,
  (SELECT id FROM users WHERE email='alex@planet.demo'),
  CASE WHEN (abs(hashtext(cr.id::text||d::text)) % 10) < 9 THEN 'completed' ELSE 'skipped' END,
  ci.type, ci.title, cr.schedule,
  (SELECT id FROM users WHERE email='alex@planet.demo'),
  ((d + COALESCE(cr.local_time,'00:00'::time)) AT TIME ZONE cr.timezone),
  ''
FROM care_plans ci JOIN care_rules cr ON cr.care_plan_id=ci.id
CROSS JOIN generate_series(((now() AT TIME ZONE 'America/Los_Angeles')::date) - 28, ((now() AT TIME ZONE 'America/Los_Angeles')::date) - 1, interval '1 day') AS d
WHERE ci.pet_id=(SELECT id FROM pets WHERE name='Milo') AND cr.frequency='daily'
ON CONFLICT (care_rule_id, due_date) WHERE deleted_at IS NULL DO NOTHING;

-- 用药：在用 ×2 + 已停 ×1（对齐 Medication 页三卡）
INSERT INTO medications (pet_id, name, dose, instructions, started_on, note, created_by_user_id)
VALUES
  ((SELECT id FROM pets WHERE name='Milo'),'Heartworm preventive','1 chewable','Monthly','2026-03-01','Since 3/1',
   (SELECT id FROM users WHERE email='alex@planet.demo')),
  ((SELECT id FROM pets WHERE name='Milo'),'Joint supplement','1 tablet','With breakfast','2026-05-10','In use · with breakfast',
   (SELECT id FROM users WHERE email='alex@planet.demo')),
  ((SELECT id FROM pets WHERE name='Milo'),'Apoquel','16 mg','Twice daily','2026-08-10','Itch flare over the winter',
   (SELECT id FROM users WHERE email='alex@planet.demo'));
UPDATE medications SET ended_on = ((now() AT TIME ZONE 'America/Los_Angeles')::date) - 1 WHERE name='Apoquel';

INSERT INTO pet_events (pet_id, event_type, occurred_at, recorded_by_user_id, payload, source)
SELECT p.id,'medication', now(), (SELECT id FROM users WHERE email='alex@planet.demo'),
  jsonb_build_object('medication_id', m.id,'action','started','name',m.name), 'auto:med'
FROM medications m JOIN pets p ON p.id=m.pet_id WHERE p.name='Milo';

-- 时间线：体重 30 天爬坡 29.4→31.4kg（Trends 曲线）+ 记录若干（Records 页）
INSERT INTO pet_events (pet_id, event_type, occurred_at, recorded_by_user_id, payload, source)
SELECT (SELECT id FROM pets WHERE name='Milo'),'weight',
  now() - (g.i || ' days')::interval,
  (SELECT id FROM users WHERE email='alex@planet.demo'),
  jsonb_build_object('weight_g', 29400 + g.i * 70), 'user'
FROM generate_series(0, 29) AS g(i);

INSERT INTO pet_events (pet_id, event_type, occurred_at, recorded_by_user_id, payload, source)
VALUES
  ((SELECT id FROM pets WHERE name='Milo'),'symptom', now() - interval '12 days',
   (SELECT id FROM users WHERE email='alex@planet.demo'),
   '{"title":"Soft stool","detail":"Appeared the day after the food switch, cleared up in a day."}','user'),
  ((SELECT id FROM pets WHERE name='Milo'),'vaccine', now() - interval '45 days',
   (SELECT id FROM users WHERE email='alex@planet.demo'),
   '{"name":"Rabies vaccine","due":"2027-05-02"}','user'),
  ((SELECT id FROM pets WHERE name='Milo'),'vet_visit', now() - interval '45 days',
   (SELECT id FROM users WHERE email='alex@planet.demo'),
   '{"title":"Annual checkup","clinic":"Harborview Animal Hospital","summary":"All values normal, keep watching his weight."}','user'),
  ((SELECT id FROM pets WHERE name='Milo'),'note', now() - interval '3 days',
   (SELECT id FROM users WHERE email='alex@planet.demo'),
   '{"title":"Long fetch session at the park, then a bath. Coat looks great."}','user'),
  ((SELECT id FROM pets WHERE name='Milo'),'note', now() - interval '1 day',
   (SELECT id FROM users WHERE email='alex@planet.demo'),
   '{"title":"Luna claimed the sunny spot on the couch for most of the afternoon."}','user');

-- 请求：1 收到（Jamie→Alex）+ 1 发出待回应（Alex→Jamie）
INSERT INTO care_requests (family_id, pet_id, occurrence_id, from_user_id, target_user_id, state, message, created_at)
SELECT f.id, co.pet_id, co.id,
  (SELECT id FROM users WHERE email='jamie@planet.demo'),
  (SELECT id FROM users WHERE email='alex@planet.demo'),
  'sent',
  'Could you take today''s walk? I''ll be at the clinic until 6.',
  now() - interval '2 hours'
FROM families f
JOIN care_occurrences co ON co.title_snapshot='Midday walk' AND co.due_date=((now() AT TIME ZONE 'America/Los_Angeles')::date)
WHERE f.name='The Chen Family';

INSERT INTO care_requests (family_id, pet_id, occurrence_id, from_user_id, target_user_id, state, message, created_at)
SELECT f.id, co.pet_id, co.id,
  (SELECT id FROM users WHERE email='alex@planet.demo'),
  (SELECT id FROM users WHERE email='jamie@planet.demo'),
  'sent',
  'Can you cover his evening joint supplement? Running late tonight.',
  now() - interval '3 hours'
FROM families f
JOIN care_occurrences co ON co.title_snapshot='Joint supplement' AND co.due_date=((now() AT TIME ZONE 'America/Los_Angeles')::date)
WHERE f.name='The Chen Family';

-- 完成事实（Done 区两行带完成人）
INSERT INTO pet_events (pet_id, event_type, occurred_at, recorded_by_user_id, payload, source)
SELECT (SELECT id FROM pets WHERE name='Milo'),'care_completed', co.completed_at,
  co.completed_by_user_id,
  jsonb_build_object('title', co.title_snapshot,'occurrence_id', co.id), 'user'
FROM care_occurrences co
WHERE co.due_date=((now() AT TIME ZONE 'America/Los_Angeles')::date) AND co.status='completed';
