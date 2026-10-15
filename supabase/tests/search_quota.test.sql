-- Testy limitu zapytań funkcji Edge `search` (U4): public.consume_search_quota().
-- Limity: 30 zapytań na minutę i 500 na dobę (UTC) na użytkownika. Dane tylko syntetyczne.
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- Struktura i uprawnienia.
-- ---------------------------------------------------------------------------
select ok((select prosecdef from pg_proc where oid = 'public.consume_search_quota()'::regprocedure),
  'consume_search_quota jest security definer');
select is((select proconfig from pg_proc where oid = 'public.consume_search_quota()'::regprocedure),
  array['search_path=""'], 'consume_search_quota ma pusty search_path');
select ok(has_function_privilege('authenticated', 'public.consume_search_quota()', 'execute'),
  'authenticated może wywołać consume_search_quota');
select ok(not has_function_privilege('anon', 'public.consume_search_quota()', 'execute'),
  'anon nie może wywołać consume_search_quota');
select is(
  (select count(*)::int from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'public.consume_search_quota()'::regprocedure
     and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  0, 'public nie ma prawa execute');
select ok((select relrowsecurity from pg_class where oid = 'private.search_quota'::regclass),
  'RLS: private.search_quota');
select ok(not has_table_privilege('anon', 'private.search_quota', 'select'), 'anon: brak select na licznikach');
select ok(not has_table_privilege('authenticated', 'private.search_quota', 'select'),
  'authenticated: brak select na licznikach');
select ok(not has_table_privilege('authenticated', 'private.search_quota', 'update'),
  'authenticated: brak update na licznikach');

-- ---------------------------------------------------------------------------
-- Dane syntetyczne.
-- ---------------------------------------------------------------------------
insert into private.allowed_emails (email) values ('allowed@example.com'), ('allowed2@example.com');
insert into auth.users (id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'allowed@example.com', now()),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'stranger@example.com', now()),
  ('00000000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated', 'allowed2@example.com', now());

-- Wywołanie consume_search_quota() n razy jako bieżąca rola; wynik: liczba zgód.
create function pg_temp.consume_n(n int) returns int language plpgsql as $$
declare
  granted int := 0;
begin
  for i in 1..n loop
    if public.consume_search_quota() then granted := granted + 1; end if;
  end loop;
  return granted;
end;
$$;
grant execute on function pg_temp.consume_n(int) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- anon i użytkownik spoza listy.
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select public.consume_search_quota() $$, '42501', null, 'anon: brak uprawnień');
select throws_ok($$ select count(*) from private.search_quota $$, '42501', null, 'anon: brak dostępu do liczników');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","amr":[{"method":"otp"}],"email":"stranger@example.com","is_anonymous":false}';
select throws_ok($$ select public.consume_search_quota() $$, '42501', null, 'spoza listy: odmowa');
select throws_ok($$ select count(*) from private.search_quota $$, '42501', null,
  'authenticated: brak dostępu do liczników');
reset role;
select is((select count(*)::int from private.search_quota), 0, 'spoza listy: licznik nie powstał');

-- ---------------------------------------------------------------------------
-- Limit minutowy.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select is(pg_temp.consume_n(30), 30, '30 zapytań w minucie: zgoda');
select is(public.consume_search_quota(), false, '31. zapytanie w minucie: odmowa');
select is(public.consume_search_quota(), false, 'kolejne zapytanie w tej samej minucie: odmowa');
reset role;

select is(
  (select minute_count from private.search_quota where user_id = '00000000-0000-0000-0000-00000000000a'),
  30, 'odrzucone zapytania nie zwiększają licznika minutowego');
select is(
  (select day_count from private.search_quota where user_id = '00000000-0000-0000-0000-00000000000a'),
  30, 'odrzucone zapytania nie zwiększają licznika dobowego');

-- Inny użytkownik z listy ma własny limit.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed2@example.com","is_anonymous":false}';
select is(public.consume_search_quota(), true, 'inny użytkownik: własny limit');
reset role;

-- Nowe okno minutowe (symulacja upływu czasu: początek okna w przeszłości).
update private.search_quota set minute_start = minute_start - interval '1 minute'
where user_id = '00000000-0000-0000-0000-00000000000a';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select is(public.consume_search_quota(), true, 'nowe okno minutowe: zgoda');
reset role;
select is(
  (select minute_count from private.search_quota where user_id = '00000000-0000-0000-0000-00000000000a'),
  1, 'nowe okno minutowe: licznik od 1');
select is(
  (select day_count from private.search_quota where user_id = '00000000-0000-0000-0000-00000000000a'),
  31, 'nowe okno minutowe nie zeruje licznika dobowego');

-- ---------------------------------------------------------------------------
-- Limit dobowy.
-- ---------------------------------------------------------------------------
update private.search_quota set day_count = 499, minute_count = 0
where user_id = '00000000-0000-0000-0000-00000000000a';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select is(public.consume_search_quota(), true, '500. zapytanie w dobie: zgoda');
select is(public.consume_search_quota(), false, '501. zapytanie w dobie: odmowa mimo wolnego limitu minutowego');
reset role;

-- Nowa doba: liczniki od początku.
update private.search_quota
set day_start = day_start - interval '1 day', minute_start = minute_start - interval '1 minute'
where user_id = '00000000-0000-0000-0000-00000000000a';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select is(public.consume_search_quota(), true, 'nowa doba: zgoda');
reset role;
select is(
  (select day_count from private.search_quota where user_id = '00000000-0000-0000-0000-00000000000a'),
  1, 'nowa doba: licznik od 1');

select * from finish();
rollback;
