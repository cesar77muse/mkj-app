
-- ============ FIX F-33: notif_insert_self MADE NOTIFICATIONS UNTRUSTWORTHY ============
-- notif_insert_self let any authenticated user insert a notification for
-- themselves (recipient_user_id = auth.uid()) directly via the API. Every
-- real notification in this app is actually created server-side by
-- SECURITY DEFINER triggers (notify_borrow_request, etc.), which bypass
-- RLS entirely and never needed this policy -- confirmed no client code
-- anywhere calls .from("notifications").insert(...). The policy had no
-- legitimate use and only made it possible to fabricate a fake
-- notification (e.g. a bogus "PO approved" message), undermining trust in
-- notification content as an audit signal. Removed outright rather than
-- narrowed further, since nothing depends on it.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

DROP POLICY IF EXISTS notif_insert_self ON public.notifications;

COMMIT;
