-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor, sur le projet existant.
-- Préserve les réservations, les virements, et les paiements Mollie existants.
BEGIN;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending','paid','failed','cancelled','expired','transfer_pending','transfer_expired','admin_cancelled'));

-- La vue est sécurisée par les règles RLS de bookings.
DROP VIEW IF EXISTS public.admin_booking_overview;
CREATE VIEW public.admin_booking_overview WITH (security_invoker=true) AS
SELECT id,reference,first_name,last_name,email,phone,team,notes,items,total_cents,status,
       created_at,payment_method,paid_at,cancelled_at,refunded_at
FROM public.bookings;
GRANT SELECT ON public.admin_booking_overview TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_cancel_booking(booking_uuid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_club_admin() THEN
    RAISE EXCEPTION 'Accès administrateur requis';
  END IF;
  UPDATE public.bookings
  SET status='admin_cancelled',cancelled_at=now()
  WHERE id=booking_uuid AND status IN ('paid','pending','transfer_pending');
  IF NOT FOUND THEN RAISE EXCEPTION 'Réservation introuvable ou non annulable'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_cancel_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_booking(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_mark_booking_refunded(booking_uuid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_club_admin() THEN
    RAISE EXCEPTION 'Accès administrateur requis';
  END IF;
  UPDATE public.bookings SET refunded_at=now()
  WHERE id=booking_uuid AND status='admin_cancelled' AND paid_at IS NOT NULL AND refunded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Réservation non éligible ou remboursement déjà enregistré'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_mark_booking_refunded(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_booking_refunded(uuid) TO authenticated;
COMMIT;
