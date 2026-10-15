-- Testy reguł dostępu (RLS) do danych punktów (U2).
-- Dane tylko syntetyczne; wektory generowane w SQL.
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

-- Struktura: RLS włączone na każdej tabeli punktów.
select ok((select relrowsecurity from pg_class where oid = 'public.marma_points'::regclass), 'RLS: marma_points');
select ok((select relrowsecurity from pg_class where oid = 'public.marma_point_coordinates'::regclass), 'RLS: marma_point_coordinates');
select ok((select relrowsecurity from pg_class where oid = 'public.marma_point_functions'::regclass), 'RLS: marma_point_functions');
select ok((select relrowsecurity from pg_class where oid = 'public.subjects'::regclass), 'RLS: subjects');
select ok((select relrowsecurity from pg_class where oid = 'public.marma_point_subjects'::regclass), 'RLS: marma_point_subjects');
select ok((select relrowsecurity from pg_class where oid = 'public.subject_embeddings'::regclass), 'RLS: subject_embeddings');

-- Brak polityk dla anon i brak polityk zapisu.
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and 'anon' = any(roles)),
  0, 'brak polityk dla anon');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and cmd <> 'SELECT'),
  0, 'brak polityk zapisu');

-- Funkcja pomocnicza: security definer, pusty search_path, wywoływalna przez authenticated, nie przez anon.
select is(
  (select proconfig from pg_proc where oid = 'public.is_allowed()'::regprocedure),
  array['search_path=""'],
  'is_allowed ma pusty search_path');
select ok((select prosecdef from pg_proc where oid = 'public.is_allowed()'::regprocedure), 'is_allowed jest security definer');
select ok(has_function_privilege('authenticated', 'public.is_allowed()', 'execute'), 'authenticated może wywołać is_allowed');
select ok(not has_function_privilege('anon', 'public.is_allowed()', 'execute'), 'anon nie może wywołać is_allowed');

-- Dane syntetyczne.
insert into public.marma_points (id, name, alt_name, location, doshic_subtypes, doc)
values (1, 'Punkt Testowy', null, 'okolica testowa', 'Vata',
        jsonb_build_object('names', jsonb_build_array('Punkt Testowy'), 'location_in_polish', 'okolica testowa'));
insert into public.marma_point_coordinates (marma_point_id, label, x, y, z) values (1, 'L', 0.1, 0.2, 0.3);
insert into public.marma_point_functions (id, function_name, subject_type, marmani_description)
values (1, 'funkcja testowa', 'typ testowy', 'opis testowy');
insert into public.subjects (id, name) values (1, 'temat testowy');
insert into public.marma_point_subjects (marma_point_id, subject_id, function_id, notes) values (1, 1, 1, null);
insert into public.subject_embeddings (subject_id, is_polish, embedding)
values (1, true, array_fill(0.01::real, array[1536])::extensions.vector);

insert into private.allowed_emails (email) values ('Allowed@Example.com');

insert into auth.users (id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'allowed@example.com', now()),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'stranger@example.com', now()),
  ('00000000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated', 'allowed2@example.com', null);
insert into private.allowed_emails (email) values ('allowed2@example.com');

-- Unikalność jak w modelach Django.
select throws_ok(
  $$ insert into public.marma_point_coordinates (marma_point_id, label, x, y, z) values (1, 'L', 1, 1, 1) $$,
  '23505', null, 'unikalność (punkt, etykieta) współrzędnych');
select throws_ok(
  $$ insert into public.marma_point_subjects (marma_point_id, subject_id, function_id) values (1, 1, 1) $$,
  '23505', null, 'unikalność (punkt, temat, funkcja)');
select throws_ok(
  $$ insert into public.marma_point_functions (id, function_name, subject_type, marmani_description) values (2, 'funkcja testowa', 'x', 'y') $$,
  '23505', null, 'unikalność nazwy funkcji');

-- AE3: anon nie widzi danych punktów.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select count(*) from public.marma_points $$, '42501', null, 'anon: marma_points → brak uprawnień');
select throws_ok($$ select count(*) from public.subject_embeddings $$, '42501', null, 'anon: subject_embeddings → brak uprawnień');
reset role;

-- Użytkownik spoza listy (konto sprzed zmiany listy) → 0 wierszy.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","amr":[{"method":"otp"}],"email":"stranger@example.com","is_anonymous":false}';
select is((select count(*)::int from public.marma_points), 0, 'spoza listy: 0 punktów');
select is((select count(*)::int from public.subject_embeddings), 0, 'spoza listy: 0 wektorów');
reset role;

-- Adres z listy tylko w user_metadata, inny email w JWT → 0 wierszy.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","amr":[{"method":"otp"}],"email":"stranger@example.com","is_anonymous":false,"user_metadata":{"email":"allowed@example.com","email_verified":true}}';
select is((select count(*)::int from public.marma_points), 0, 'adres z listy tylko w user_metadata: 0 wierszy');
reset role;

-- Adres z listy, ale niepotwierdzony → 0 wierszy.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed2@example.com","is_anonymous":false}';
select is((select count(*)::int from public.marma_points), 0, 'adres niepotwierdzony: 0 wierszy');
reset role;

-- Email w JWT z listy, ale nie pasuje do konta (sub) → 0 wierszy.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select is((select count(*)::int from public.marma_points), 0, 'email w JWT inny niż w koncie: 0 wierszy');
reset role;

-- Użytkownik z listy (inna wielkość liter na liście) → widzi wszystko.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select ok(public.is_allowed(), 'z listy: is_allowed() = true');
select is((select count(*)::int from public.marma_points), 1, 'z listy: widzi punkty');
select is((select doc ->> 'location_in_polish' from public.marma_points where id = 1), 'okolica testowa', 'z listy: widzi opis');
select is((select count(*)::int from public.marma_point_coordinates), 1, 'z listy: widzi współrzędne');
select is((select count(*)::int from public.marma_point_functions), 1, 'z listy: widzi funkcje');
select is((select count(*)::int from public.subjects), 1, 'z listy: widzi tematy');
select is((select count(*)::int from public.marma_point_subjects), 1, 'z listy: widzi powiązania');
select is((select count(*)::int from public.subject_embeddings), 1, 'z listy: widzi wektory');

-- Zapis → odmowa.
select throws_ok(
  $$ insert into public.subjects (name) values ('nowy') $$,
  '42501', null, 'z listy: INSERT → brak uprawnień');
select throws_ok(
  $$ update public.marma_points set name = 'zmiana' where id = 1 $$,
  '42501', null, 'z listy: UPDATE → brak uprawnień');
select throws_ok(
  $$ delete from public.marma_point_coordinates $$,
  '42501', null, 'z listy: DELETE → brak uprawnień');
reset role;

-- R7: usunięcie adresu z listy → ten sam użytkownik traci dostęp przy kolejnym zapytaniu.
delete from private.allowed_emails where lower(email) = 'allowed@example.com';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select is((select count(*)::int from public.marma_points), 0, 'po usunięciu z listy: 0 punktów');
reset role;

select * from finish();
rollback;
