-- À exécuter dans Supabase SQL Editor. Projet dédié recommandé.
create extension if not exists pgcrypto;
create table public.event_settings (id integer primary key default 1 check (id=1),title text not null default 'Repas de Saint-Nicolas',event_details text default '',booking_open boolean not null default false,booking_deadline timestamptz);
insert into public.event_settings(id) values(1);
create table public.menus (id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 120),category text not null check(category in ('adulte','enfant')),price_cents integer not null check(price_cents between 1 and 999900),sort_order integer not null default 0,active boolean not null default true);
create table public.admin_users (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.bookings (id uuid primary key default gen_random_uuid(),reference text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),first_name text not null,last_name text not null,email text not null,phone text not null,team text,notes text,items jsonb not null,total_cents integer not null check(total_cents>0),status text not null default 'pending' check(status in ('pending','paid','failed','cancelled','expired')),mollie_payment_id text unique,created_at timestamptz not null default now(),paid_at timestamptz);
create index bookings_created_idx on public.bookings(created_at desc);
create index bookings_status_idx on public.bookings(status);
create index bookings_mollie_idx on public.bookings(mollie_payment_id);
create or replace function public.is_club_admin() returns boolean language sql stable security definer set search_path = '' as $$select exists(select 1 from public.admin_users where user_id=(select auth.uid()))$$;
revoke all on function public.is_club_admin() from public;
grant execute on function public.is_club_admin() to authenticated;
alter table public.event_settings enable row level security;
alter table public.menus enable row level security;
alter table public.admin_users enable row level security;
alter table public.bookings enable row level security;
create policy "read settings" on public.event_settings for select to anon,authenticated using(true);
create policy "admin settings" on public.event_settings for update to authenticated using(public.is_club_admin()) with check(public.is_club_admin());
create policy "read active menus or admin" on public.menus for select to anon,authenticated using(active or public.is_club_admin());
create policy "admin insert menus" on public.menus for insert to authenticated with check(public.is_club_admin());
create policy "admin update menus" on public.menus for update to authenticated using(public.is_club_admin()) with check(public.is_club_admin());
create policy "admin read own role" on public.admin_users for select to authenticated using(user_id=(select auth.uid()));
create policy "admin bookings read" on public.bookings for select to authenticated using(public.is_club_admin());
-- Aucune écriture directe sur bookings pour anon/authenticated : uniquement les Edge Functions avec service role.
create view public.admin_booking_overview with (security_invoker=true) as select reference,first_name,last_name,email,phone,team,notes,items,total_cents,status,created_at from public.bookings;
grant select on public.admin_booking_overview to authenticated;
-- Après création d'un utilisateur dans Authentication > Users, remplacer l'UUID ci-dessous :
-- insert into public.admin_users(user_id) values ('UUID-UTILISATEUR-ADMIN');
