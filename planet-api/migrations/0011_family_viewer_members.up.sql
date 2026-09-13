-- 家庭成员可以只查看全部宠物与事件，也可以参与照护。
ALTER TABLE public.family_memberships
    DROP CONSTRAINT family_memberships_role_check;

ALTER TABLE public.family_memberships
    ADD CONSTRAINT family_memberships_role_check
    CHECK (role IN ('owner', 'caregiver', 'viewer'));

ALTER TABLE public.family_invitations
    DROP CONSTRAINT family_invitations_role_check;

ALTER TABLE public.family_invitations
    ADD CONSTRAINT family_invitations_role_check
    CHECK (role IN ('owner', 'caregiver', 'viewer'));
