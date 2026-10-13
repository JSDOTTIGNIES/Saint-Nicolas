-- Exécuter UNE SEULE FOIS dans le SQL Editor du projet Supabase EXISTANT.
-- Ajoute les virements sans toucher aux réservations Mollie existantes.
BEGIN;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'mollie';
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_method_check CHECK (payment_method IN ('mollie','transfer'));
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending','paid','failed','cancelled','expired','transfer_pending','transfer_expired'));

-- Vue sécurisée : seuls les administrateurs connectés peuvent consulter les données.
DROP VIEW IF EXISTS public.admin_booking_overview;
CREATE VIEW public.admin_booking_overview WITH (security_invoker=true) AS
SELECT id,reference,first_name,last_name,email,phone,team,notes,items,total_cents,status,created_at,payment_method,paid_at
FROM public.bookings;
GRANT SELECT ON public.admin_booking_overview TO authenticated;

-- Le navigateur ne peut pas modifier directement le statut d'une réservation.
-- Seule cette fonction, avec vérification du rôle admin, peut confirmer un virement.
CREATE OR REPLACE FUNCTION public.confirm_transfer_payment(booking_uuid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_club_admin() THEN
    RAISE EXCEPTION 'Accès administrateur requis';
  END IF;
  UPDATE public.bookings
  SET status='paid',paid_at=now()
  WHERE id=booking_uuid AND payment_method='transfer' AND status='transfer_pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Virement introuvable ou déjà traité'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_transfer_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_transfer_payment(uuid) TO authenticated;
COMMIT;
