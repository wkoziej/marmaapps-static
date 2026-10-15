-- Testy listy dozwolonych adresów i hooka „Before User Created” (U2).
-- Dane tylko syntetyczne (@example.com).
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- Struktura: lista w schemacie niewystawionym przez API.
select has_table('private', 'allowed_emails', 'lista adresów jest w schemacie private');
select hasnt_table('public', 'allowed_emails', 'lista adresów nie jest w schemacie public');
select has_function('private', 'before_user_created_hook', array['jsonb'], 'hook istnieje w schemacie private');

-- Uprawnienia hooka: tylko supabase_auth_admin.
select ok(has_function_privilege('supabase_auth_admin', 'private.before_user_created_hook(jsonb)', 'execute'),
  'supabase_auth_admin może wykonać hook');
select ok(not has_function_privilege('anon', 'private.before_user_created_hook(jsonb)', 'execute'),
  'anon nie może wykonać hooka');
select ok(not has_function_privilege('authenticated', 'private.before_user_created_hook(jsonb)', 'execute'),
  'authenticated nie może wykonać hooka');

-- Pusty search_path i security definer.
select is(
  (select proconfig from pg_proc where oid = 'private.before_user_created_hook(jsonb)'::regprocedure),
  array['search_path=""'],
  'hook ma pusty search_path');
select ok(
  (select prosecdef from pg_proc where oid = 'private.before_user_created_hook(jsonb)'::regprocedure),
  'hook jest security definer');

-- Dane syntetyczne.
insert into private.allowed_emails (email) values ('allowed@example.com');

-- Wywołania hooka jako właściciel testu (postgres nie może przyjąć roli
-- supabase_auth_admin); uprawnienie supabase_auth_admin sprawdza asercja wyżej,
-- a pełny przepływ przez Supabase Auth sprawdzono ręcznie na lokalnym stacku.

-- AE1: adres spoza listy → 403 z komunikatem po polsku.
select is(
  private.before_user_created_hook(jsonb_build_object(
    'metadata', jsonb_build_object('name', 'before-user-created'),
    'user', jsonb_build_object('email', 'stranger@example.com',
      'app_metadata', jsonb_build_object('provider', 'email')))) -> 'error' ->> 'http_code',
  '403',
  'hook: adres spoza listy → kod 403');
select ok(
  length(private.before_user_created_hook(jsonb_build_object(
    'user', jsonb_build_object('email', 'stranger@example.com'))) -> 'error' ->> 'message') > 0,
  'hook: odmowa zawiera komunikat');

-- Adres z listy → zgoda (pusty obiekt).
select is(
  private.before_user_created_hook(jsonb_build_object(
    'user', jsonb_build_object('email', 'allowed@example.com',
      'app_metadata', jsonb_build_object('provider', 'email')))),
  '{}'::jsonb,
  'hook: adres z listy → zgoda');

-- Adres z listy wielkimi literami → zgoda.
select is(
  private.before_user_created_hook(jsonb_build_object(
    'user', jsonb_build_object('email', 'ALLOWED@Example.COM'))),
  '{}'::jsonb,
  'hook: adres z listy wielkimi literami → zgoda');

-- Google: adres spoza listy → odmowa.
select is(
  private.before_user_created_hook(jsonb_build_object(
    'user', jsonb_build_object('email', 'stranger@example.com',
      'app_metadata', jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google'))))) -> 'error' ->> 'http_code',
  '403',
  'hook: rejestracja Google spoza listy → 403');

-- Brak adresu (np. telefon) → odmowa (deny by default).
select is(
  private.before_user_created_hook(jsonb_build_object(
    'user', jsonb_build_object('phone', '48000000000'))) -> 'error' ->> 'http_code',
  '403',
  'hook: brak adresu e-mail → 403');

-- anon i authenticated nie mogą wywołać hooka bezpośrednio.
set local role anon;
select throws_ok(
  $$ select private.before_user_created_hook('{"user":{"email":"allowed@example.com"}}'::jsonb) $$,
  '42501', null, 'anon: wywołanie hooka → brak uprawnień');
reset role;

set local role authenticated;
select throws_ok(
  $$ select private.before_user_created_hook('{"user":{"email":"allowed@example.com"}}'::jsonb) $$,
  '42501', null, 'authenticated: wywołanie hooka → brak uprawnień');

-- authenticated nie może czytać listy adresów.
select throws_ok(
  $$ select count(*) from private.allowed_emails $$,
  '42501', null, 'authenticated: odczyt listy adresów → brak uprawnień');
reset role;

select * from finish();
rollback;
