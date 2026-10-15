-- Reguły dostępu do danych punktów (U2).
-- Odczyt tylko dla roli authenticated z potwierdzonym adresem z listy.
-- Brak polityk dla anon i brak polityk zapisu (zapis tylko przy imporcie, jako właściciel bazy).

-- Funkcja pomocnicza (używana w politykach RLS i przez funkcję Edge w U4).
-- Adres pochodzi z claimu JWT `email` (nigdy z user_metadata, które użytkownik może zmieniać).
-- JWT Supabase nie ma pewnego claimu potwierdzenia adresu (email_verified jest tylko
-- w user_metadata), dlatego potwierdzenie jest sprawdzane w auth.users dla auth.uid():
-- konto musi mieć email_confirmed_at i ten sam adres co claim `email`.
-- Zwraca tylko true/false; nie ujawnia listy.
create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() ->> 'role') = 'authenticated'
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1
      from auth.users u
      join private.allowed_emails a on lower(btrim(a.email)) = lower(btrim(u.email))
      where u.id = auth.uid()
        and u.email_confirmed_at is not null
        and lower(btrim(u.email)) = lower(btrim(auth.jwt() ->> 'email'))
    ),
    false
  );
$$;

revoke execute on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'marma_points',
    'marma_point_coordinates',
    'marma_point_functions',
    'subjects',
    'marma_point_subjects',
    'subject_embeddings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.is_allowed()))',
      t || '_select_allowed', t
    );
  end loop;
end;
$$;

-- Sekwencje kolumn identity: brak dostępu dla anon i authenticated.
revoke all on all sequences in schema public from anon, authenticated;
