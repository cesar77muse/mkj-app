CREATE OR REPLACE FUNCTION public.notify_borrow_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _src TEXT;
  _tgt TEXT;
  _part TEXT;
  _link TEXT;
  _actor UUID := auth.uid();
  _title TEXT;
  _body TEXT;
  _type TEXT;
BEGIN
  SELECT mkj_number INTO _src FROM public.projects WHERE id = NEW.source_project_id;
  SELECT mkj_number INTO _tgt FROM public.projects WHERE id = NEW.target_project_id;
  SELECT part_number INTO _part FROM public.products WHERE id = NEW.product_id;
  _link := '/borrow-requests?request=' || NEW.id::TEXT;

  IF TG_OP = 'INSERT' THEN
    -- Requester confirmation
    IF NEW.requested_by IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_user_id, type, title, body, link)
      VALUES (NEW.requested_by, 'borrow_created',
        'Borrow request sent to ' || _src,
        'You requested ' || trim(to_char(NEW.qty_requested, 'FM999999999')) || ' x ' || _part || ' from ' || _src || ' for ' || _tgt || '.',
        _link);
    END IF;

    -- Lending side: project managers + oversight roles
    INSERT INTO public.notifications (recipient_user_id, type, title, body, link)
    SELECT u, 'borrow_requested',
      'Borrow request from ' || _tgt,
      _tgt || ' is requesting ' || trim(to_char(NEW.qty_requested, 'FM999999999')) || ' x ' || _part || ' from ' || _src || '. Review to approve or deny.',
      _link
    FROM public.borrow_notify_recipients(NEW.source_project_id) u
    WHERE u IS DISTINCT FROM NEW.requested_by;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' THEN
      INSERT INTO public.notifications (recipient_user_id, type, title, body, link)
      SELECT u, 'borrow_cancelled',
        'Borrow request withdrawn',
        _tgt || ' withdrew its request for ' || _part || ' from ' || _src || '.',
        _link
      FROM public.borrow_notify_recipients(NEW.source_project_id) u
      WHERE u IS DISTINCT FROM _actor;
      RETURN NEW;
    END IF;

    IF NEW.status IN ('approved', 'partially_approved', 'denied') THEN
      IF NEW.status = 'denied' THEN
        _type := 'borrow_denied';
        _title := 'Borrow request denied by ' || _src;
        _body := _src || ' denied the request for ' || _part || '.';
      ELSE
        _type := 'borrow_approved';
        _title := CASE WHEN NEW.status = 'partially_approved'
          THEN 'Borrow request partially approved by ' || _src
          ELSE 'Borrow request approved by ' || _src END;
        _body := _src || ' approved ' || trim(to_char(COALESCE(NEW.qty_approved, NEW.qty_requested), 'FM999999999'))
          || ' of ' || trim(to_char(NEW.qty_requested, 'FM999999999')) || ' x ' || _part || ' for ' || _tgt || '.';
      END IF;

      IF NEW.decision_note IS NOT NULL AND NEW.decision_note <> '' THEN
        _body := _body || ' Note: ' || NEW.decision_note;
      END IF;

      -- Requester + everyone on both sides who should know
      INSERT INTO public.notifications (recipient_user_id, type, title, body, link)
      SELECT DISTINCT u, _type, _title, _body, _link
      FROM (
        SELECT NEW.requested_by AS u
        UNION SELECT * FROM public.borrow_notify_recipients(NEW.target_project_id)
        UNION SELECT * FROM public.borrow_notify_recipients(NEW.source_project_id)
      ) r
      WHERE u IS NOT NULL AND u IS DISTINCT FROM _actor;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_borrow_notify ON public.borrow_requests;
CREATE TRIGGER trg_borrow_notify
AFTER INSERT OR UPDATE ON public.borrow_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_borrow_request();
