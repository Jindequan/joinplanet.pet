-- 仅允许在没有 viewer 成员或待接受 viewer 邀请时回滚。
UPDATE public.family_memberships SET role = 'caregiver' WHERE role = 'viewer';
UPDATE public.family_invitations SET role = 'caregiver' WHERE role = 'viewer';

ALTER TABLE public.family_memberships
    DROP CONSTRAINT family_memberships_role_check;

ALTER TABLE public.family_memberships
    ADD CONSTRAINT family_memberships_role_check
    CHECK (role IN ('owner', 'caregiver'));

ALTER TABLE public.family_invitations
    DROP CONSTRAINT family_invitations_role_check;

ALTER TABLE public.family_invitations
    ADD CONSTRAINT family_invitations_role_check
    CHECK (role IN ('owner', 'caregiver'));
