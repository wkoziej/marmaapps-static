-- Testy uzupełniające po przeglądzie PR #2: gałęzie is_allowed(), uprawnienia
-- supabase_auth_admin, normalizacja adresów na liście, domyślne uprawnienia
-- dla nowych obiektów w schemacie public. Dane tylko syntetyczne.
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

insert into public.marma_points (id, name, location, doshic_subtypes, doc)
values (1, 'Punkt Testowy', 'okolica', 'Vata', '{}'::jsonb);
insert into private.allowed_emails (email) values ('allowed@example.com');
insert into auth.users (id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'allowed@example.com', now());

-- is_allowed(): konto anonimowe z adresem z listy → brak dostępu.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":true}';
select is(public.is_allowed(), false, 'is_anonymous=true: is_allowed() = false');
select is((select count(*)::int from public.marma_points), 0, 'is_anonymous=true: 0 punktów');
reset role;

-- is_allowed(): claim role inny niż authenticated → brak dostępu.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"service_role","email":"allowed@example.com","is_anonymous":false}';
select is(public.is_allowed(), false, 'claim role=service_role: is_allowed() = false');
reset role;

-- Kontrola pozytywna (ten sam użytkownik, poprawne claimy).
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select is(public.is_allowed(), true, 'poprawne claimy: is_allowed() = true');
reset role;

-- Uprawnienia potrzebne hookowi w prawdziwym przepływie Auth.
select ok(has_schema_privilege('supabase_auth_admin', 'private', 'usage'), 'supabase_auth_admin: usage na private');
select ok(has_table_privilege('supabase_auth_admin', 'private.allowed_emails', 'select'), 'supabase_auth_admin: select na liście');
select ok(not has_table_privilege('anon', 'private.allowed_emails', 'select'), 'anon: brak select na liście');
select ok(not has_table_privilege('authenticated', 'private.allowed_emails', 'select'), 'authenticated: brak select na liście');

-- Hook: spacje wokół adresu → zgoda; zdarzenie bez użytkownika → odmowa.
select is(
  private.before_user_created_hook('{"user":{"email":"  Allowed@Example.com "}}'::jsonb),
  '{}'::jsonb, 'hook: adres ze spacjami i wielkimi literami → zgoda');
select is(
  private.before_user_created_hook('{"metadata":{}}'::jsonb) -> 'error' ->> 'http_code',
  '403', 'hook: brak użytkownika w zdarzeniu → 403');

-- Lista: wpis wklejony z białymi znakami (tab, NBSP) i wielkimi literami jest normalizowany.
insert into private.allowed_emails (email) values (E'\t Mixed@Example.COM' || chr(160) || E'\n');
select is(
  (select count(*)::int from private.allowed_emails where email = 'mixed@example.com'),
  1, 'lista: adres znormalizowany (bez białych znaków, małe litery)');
select is(
  private.before_user_created_hook('{"user":{"email":"mixed@example.com"}}'::jsonb),
  '{}'::jsonb, 'hook: znormalizowany wpis pasuje');
select throws_ok(
  $$ insert into private.allowed_emails (email) values ('bez-malpy') $$,
  '23514', null, 'lista: wpis bez @ jest odrzucony');

-- Domyślne uprawnienia: nowe tabele i funkcje w public nie są dostępne dla anon/authenticated.
create table public.tmp_new_table (id int);
create function public.tmp_new_function() returns int language sql as 'select 1';
select ok(not has_table_privilege('anon', 'public.tmp_new_table', 'select'), 'nowa tabela: anon bez select');
select ok(not has_table_privilege('authenticated', 'public.tmp_new_table', 'select'), 'nowa tabela: authenticated bez select');
select ok(not has_function_privilege('anon', 'public.tmp_new_function()', 'execute'), 'nowa funkcja: anon bez execute');
select ok(not has_function_privilege('authenticated', 'public.tmp_new_function()', 'execute'), 'nowa funkcja: authenticated bez execute');

-- Sesja z hasłem (amr=password) nie ma dostępu, nawet dla potwierdzonego adresu z listy:
-- ktoś mógł założyć konto z hasłem przed właścicielem adresu (sprawdzone na lokalnym Auth).
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"password"}],"email":"allowed@example.com","is_anonymous":false}';
select is(public.is_allowed(), false, 'amr=password: is_allowed() = false');
select is((select count(*)::int from public.marma_points), 0, 'amr=password: 0 punktów');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"oauth"}],"email":"allowed@example.com","is_anonymous":false}';
select is(public.is_allowed(), true, 'amr=oauth (Google): is_allowed() = true');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"email/signup"}],"email":"allowed@example.com","is_anonymous":false}';
select is(public.is_allowed(), true, 'amr=email/signup (pierwsze logowanie linkiem, PKCE): is_allowed() = true');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"recovery"}],"email":"allowed@example.com","is_anonymous":false}';
select is(public.is_allowed(), false, 'amr=recovery: is_allowed() = false');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","email":"allowed@example.com","is_anonymous":false}';
select is(public.is_allowed(), false, 'brak amr: is_allowed() = false');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"},{"method":"password"}],"email":"allowed@example.com","is_anonymous":false}';
select is(public.is_allowed(), false, 'amr z otp i password: is_allowed() = false');
reset role;

select * from finish();
rollback;
