-- Testy funkcji SQL wyszukiwania (U3).
-- Dane tylko syntetyczne. Wektory budowane w SQL: wektor zapytania q = e1,
-- wektor tematu sim_vec(s) = [s, sqrt(1 - s^2), 0, ...], więc cos(q, sim_vec(s)) = s.
begin;
create extension if not exists pgtap with schema extensions;

select plan(48);

-- Pomocnicza funkcja testowa (tylko w tej sesji).
create function pg_temp.sim_vec(s double precision)
returns extensions.vector
language sql
immutable
as $$
  select (array[s, sqrt(1 - s * s)]::real[] || array_fill(0::real, array[1534]))::extensions.vector
$$;

-- Wektor zapytania jako ustawienie sesji: dostępny także po zmianie roli.
select set_config('test.q', pg_temp.sim_vec(1)::text, true);

-- ---------------------------------------------------------------------------
-- Struktura: security invoker, ustawiony search_path, uprawnienia.
-- ---------------------------------------------------------------------------
create temp view search_fns as
select p.oid, p.proname, p.prosecdef, p.proconfig, p.proacl
from pg_proc p
where p.oid in (
  'public.search_points_by_name(text)'::regprocedure,
  'public.search_points_by_dosha(text)'::regprocedure,
  'public.match_points_by_embedding(extensions.vector)'::regprocedure,
  'public.get_points_details(text[])'::regprocedure
);

select is((select count(*)::int from search_fns), 4, 'istnieją 4 funkcje wyszukiwania');
select is((select count(*)::int from search_fns where not prosecdef), 4, 'wszystkie funkcje są security invoker');
select is(
  (select count(*)::int from search_fns where proconfig = array['search_path=""']),
  4, 'wszystkie funkcje mają ustawiony (pusty) search_path');
select is(
  (select count(*)::int from search_fns where has_function_privilege('authenticated', oid, 'execute')),
  4, 'authenticated może wywołać funkcje');
select is(
  (select count(*)::int from search_fns where has_function_privilege('anon', oid, 'execute')),
  0, 'anon nie może wywołać funkcji');
select is(
  (select count(*)::int from search_fns f, aclexplode(f.proacl) a
   where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  0, 'public nie ma prawa execute');

-- ---------------------------------------------------------------------------
-- Dane syntetyczne.
-- ---------------------------------------------------------------------------
insert into public.marma_points (id, name, alt_name, location, doshic_subtypes, doc) values
  (1, 'Tala Hrida', null, 'dłoń', 'Vata',
     jsonb_build_object('names', jsonb_build_array('Tala Hrida'), 'location_in_polish', 'dłoń')),
  (2, 'Kurcha', 'Kurca', 'stopa', 'Pitta, Kapha', jsonb_build_object('names', jsonb_build_array('Kurcha'))),
  (3, 'Adhipati', 'Śródka', 'głowa', 'Pittā', '{}'::jsonb),
  (4, 'Bez Opisu', null, 'brak', 'Vata', 'null'::jsonb),
  (5, 'Punkt A', null, 'loc a', null, '{}'::jsonb),
  (6, 'Punkt B', null, 'loc b', 'Kapha', '{}'::jsonb),
  (7, 'Punkt C', null, 'loc c', null, '{}'::jsonb),
  (8, 'Punkt D', null, 'loc d', null, '{}'::jsonb),
  (9, 'Punkt E', null, 'loc e', null, '{}'::jsonb),
  (20, 'Kurcha', null, 'inna', 'Vata', '{}'::jsonb);

insert into public.marma_point_coordinates (id, marma_point_id, label, x, y, z) values
  (1, 1, 'R', -0.1, 0.2, 0.3),
  (2, 1, 'L', 0.1, 0.2, 0.3),
  (3, 2, 'C', 1, 2, 3);

insert into public.marma_point_functions (id, function_name, subject_type, marmani_description)
values (1, 'funkcja testowa', 'typ testowy', 'opis testowy');

insert into public.subjects (id, name) values
  (1, 'temat 1'), (2, 'temat 2'), (3, 'temat 3'), (4, 'temat 4'), (5, 'temat 5'), (6, 'temat 6');

-- Temat k → Punkt A..E; temat 6 → Punkt A (dwa tematy prowadzą do tego samego punktu).
insert into public.marma_point_subjects (marma_point_id, subject_id, function_id) values
  (5, 1, 1), (6, 2, 1), (7, 3, 1), (8, 4, 1), (9, 5, 1), (5, 6, 1);

insert into private.allowed_emails (email) values ('allowed@example.com');
insert into auth.users (id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'allowed@example.com', now()),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'stranger@example.com', now());

-- anon: brak uprawnień do wywołania.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$ select * from public.search_points_by_name('tala') $$,
  '42501', null, 'anon: wywołanie funkcji → brak uprawnień');
reset role;

-- ---------------------------------------------------------------------------
-- Wyszukiwanie po nazwie (użytkownik z listy).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';

select results_eq(
  $$ select name from public.search_points_by_name('tala') $$,
  $$ values ('Tala Hrida'::text) $$,
  'nazwa: „tala” → Tala Hrida');
select results_eq(
  $$ select name from public.search_points_by_name('TALA hr') $$,
  $$ values ('Tala Hrida'::text) $$,
  'nazwa: bez rozróżniania wielkości liter (ASCII)');
select results_eq(
  $$ select name from public.search_points_by_name('1') $$,
  $$ values ('Tala Hrida'::text) $$,
  'nazwa: „1” → trafienie po identyfikatorze jako tekst (charakteryzacja obecnej wersji)');
select results_eq(
  $$ select name from public.search_points_by_name('kurca') $$,
  $$ values ('Kurcha'::text) $$,
  'nazwa: dopasowanie w alt_name');
select results_eq(
  $$ select name from public.search_points_by_name('kurcha') $$,
  $$ values ('Kurcha'::text) $$,
  'nazwa: dwa punkty o tej samej nazwie → nazwa raz (jak set() w Pythonie)');
select is_empty(
  $$ select name from public.search_points_by_name('_') $$,
  'nazwa: znaki wieloznaczne LIKE są dosłowne (jak Django icontains)');
select results_eq(
  $$ select name from public.search_points_by_name('Śródka') $$,
  $$ values ('Adhipati'::text) $$,
  'nazwa: znaki spoza ASCII przy tej samej wielkości liter → trafienie');
select is_empty(
  $$ select name from public.search_points_by_name('śródka') $$,
  'nazwa: wielkość liter spoza ASCII rozróżniana (jak LIKE w SQLite)');
select is_empty(
  $$ select name from public.search_points_by_name('') $$,
  'nazwa: pusta fraza → brak wyników');
select is_empty(
  $$ select name from public.search_points_by_name(null) $$,
  'nazwa: fraza null → brak wyników');
select results_eq(
  $$ select name from public.search_points_by_name('punkt') $$,
  $$ values ('Punkt A'::text), ('Punkt B'), ('Punkt C'), ('Punkt D'), ('Punkt E') $$,
  'nazwa: kolejność według identyfikatora punktu');

select is_empty(
  $$ select name from public.search_points_by_name('\\') $$,
  'nazwa: ukośnik wsteczny jest dosłowny (brak błędu escape, brak trafień)');

-- ---------------------------------------------------------------------------
-- Wyszukiwanie po doszy.
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select name from public.search_points_by_dosha('pitta') $$,
  $$ values ('Kurcha'::text) $$,
  'dosza: „pitta” → punkty z Pitta (bez punktu z „Pittā” w kolumnie)');
select results_eq(
  $$ select name from public.search_points_by_dosha('Pittā') $$,
  $$ values ('Kurcha'::text) $$,
  'dosza: kolumna z diakrytykiem nie jest normalizowana (nawet ta sama fraza nie trafia)');
select results_eq(
  $$ select name from public.search_points_by_dosha('KÁPHA') $$,
  $$ values ('Kurcha'::text), ('Punkt B') $$,
  'dosza: fraza z diakrytykami i wielkimi literami → trafienie, kolejność według id');
select is_empty(
  $$ select name from public.search_points_by_dosha('') $$,
  'dosza: pusta fraza → brak wyników');
select is_empty(
  $$ select name from public.search_points_by_dosha(null) $$,
  'dosza: fraza null → brak wyników');
select is_empty(
  $$ select name from public.search_points_by_dosha('%') $$,
  'dosza: znaki wieloznaczne LIKE są dosłowne');
reset role;

-- ---------------------------------------------------------------------------
-- Dopasowanie wektorów. Przed każdym scenariuszem wektory są wymieniane.
-- ---------------------------------------------------------------------------

-- 0.9 / 0.87 / 0.7 → przyjęte dwa pierwsze tematy.
delete from public.subject_embeddings;
insert into public.subject_embeddings (subject_id, is_polish, embedding) values
  (1, false, pg_temp.sim_vec(0.9)),
  (2, false, pg_temp.sim_vec(0.87)),
  (3, false, pg_temp.sim_vec(0.7));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select results_eq(
  $$ select name from public.match_points_by_embedding(current_setting('test.q')::extensions.vector) $$,
  $$ values ('Punkt A'::text), ('Punkt B') $$,
  'wektory: 0.9 / 0.87 / 0.7 → dwa pierwsze tematy, kolejność według similarity');
select results_eq(
  $$ select name from public.match_points_by_embedding(current_setting('test.q')::extensions.vector) $$,
  $$ values ('Punkt A'::text), ('Punkt B') $$,
  'wektory: wynik deterministyczny przy powtórzeniu');
select throws_ok(
  $$ select name from public.match_points_by_embedding('[1,0,0]'::extensions.vector) $$,
  '22000', null, 'wektory: zły wymiar wektora zapytania → błąd');
reset role;

-- 0.75 / 0.71 / 0.68 (wszystkie < 0.8) → reguła „pierwszy − 0.05” sama: 0.71 przyjęty, 0.68 odrzucony.
delete from public.subject_embeddings;
insert into public.subject_embeddings (subject_id, is_polish, embedding) values
  (1, false, pg_temp.sim_vec(0.75)),
  (2, false, pg_temp.sim_vec(0.71)),
  (3, false, pg_temp.sim_vec(0.68));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select results_eq(
  $$ select name from public.match_points_by_embedding(current_setting('test.q')::extensions.vector) $$,
  $$ values ('Punkt A'::text), ('Punkt B') $$,
  'wektory: 0.75 / 0.71 / 0.68 → reguła pierwszy − 0.05 bez progu 0.8');
reset role;

-- Kolejność według similarity, a nie według id: temat 2 (Punkt B) 0.95, temat 1 (Punkt A) 0.9.
delete from public.subject_embeddings;
insert into public.subject_embeddings (subject_id, is_polish, embedding) values
  (1, false, pg_temp.sim_vec(0.9)),
  (2, false, pg_temp.sim_vec(0.95));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select results_eq(
  $$ select name from public.match_points_by_embedding(current_setting('test.q')::extensions.vector) $$,
  $$ values ('Punkt B'::text), ('Punkt A') $$,
  'wektory: kolejność według similarity (B 0.95 przed A 0.9)');
reset role;

-- Wszystkie similarity < 0.65 → brak wyników.
delete from public.subject_embeddings;
insert into public.subject_embeddings (subject_id, is_polish, embedding) values
  (1, false, pg_temp.sim_vec(0.6)),
  (2, true, pg_temp.sim_vec(0.5));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select is_empty(
  $$ select name from public.match_points_by_embedding(current_setting('test.q')::extensions.vector) $$,
  'wektory: wszystkie similarity < 0.65 → brak wyników');
reset role;

-- 0.95 / 0.82 / 0.79 → 0.82 przyjęty (próg 0.8), 0.79 odrzucony.
delete from public.subject_embeddings;
insert into public.subject_embeddings (subject_id, is_polish, embedding) values
  (1, false, pg_temp.sim_vec(0.95)),
  (2, false, pg_temp.sim_vec(0.82)),
  (3, false, pg_temp.sim_vec(0.79));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select results_eq(
  $$ select name from public.match_points_by_embedding(current_setting('test.q')::extensions.vector) $$,
  $$ values ('Punkt A'::text), ('Punkt B') $$,
  'wektory: 0.82 przy pierwszym 0.95 → przyjęty (próg 0.8); 0.79 odrzucony');
reset role;

-- Dwa tematy prowadzą do tego samego punktu → punkt raz.
delete from public.subject_embeddings;
insert into public.subject_embeddings (subject_id, is_polish, embedding) values
  (1, false, pg_temp.sim_vec(0.9)),
  (6, false, pg_temp.sim_vec(0.88));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select results_eq(
  $$ select name from public.match_points_by_embedding(current_setting('test.q')::extensions.vector) $$,
  $$ values ('Punkt A'::text) $$,
  'wektory: dwa tematy → ten sam punkt → punkt raz');
reset role;

-- Wektory EN i PL tego samego tematu zajmują 2 z 5 miejsc; temat raz.
delete from public.subject_embeddings;
insert into public.subject_embeddings (subject_id, is_polish, embedding) values
  (1, false, pg_temp.sim_vec(0.95)),
  (1, true, pg_temp.sim_vec(0.94)),
  (2, false, pg_temp.sim_vec(0.93)),
  (3, false, pg_temp.sim_vec(0.92)),
  (4, false, pg_temp.sim_vec(0.91)),
  (5, false, pg_temp.sim_vec(0.905));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select results_eq(
  $$ select name from public.match_points_by_embedding(current_setting('test.q')::extensions.vector) $$,
  $$ values ('Punkt A'::text), ('Punkt B'), ('Punkt C'), ('Punkt D') $$,
  'wektory: EN i PL tego samego tematu liczone osobno w top 5 (temat 5 poza top 5)');
reset role;

-- Jeden temat ponad progiem → pierwszy wynik raz (poprawiony duplikat).
delete from public.subject_embeddings;
insert into public.subject_embeddings (subject_id, is_polish, embedding) values
  (1, false, pg_temp.sim_vec(0.9)),
  (2, false, pg_temp.sim_vec(0.5));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select results_eq(
  $$ select name from public.match_points_by_embedding(current_setting('test.q')::extensions.vector) $$,
  $$ values ('Punkt A'::text) $$,
  'wektory: pierwszy temat występuje w wyniku raz');

-- ---------------------------------------------------------------------------
-- Szczegóły punktów (kontrakt answer.points).
-- ---------------------------------------------------------------------------
select is(
  public.get_points_details(array['Tala Hrida']),
  jsonb_build_array(jsonb_build_object(
    'name', 'Tala Hrida',
    'location', 'dłoń',
    'doc', jsonb_build_object('names', jsonb_build_array('Tala Hrida'), 'location_in_polish', 'dłoń'),
    'coordinates', jsonb_build_array(
      jsonb_build_object('x', -0.1, 'y', 0.2, 'z', 0.3, 'label', 'R'),
      jsonb_build_object('x', 0.1, 'y', 0.2, 'z', 0.3, 'label', 'L')))),
  'szczegóły: name, location, doc, coordinates[{x,y,z,label}] w kolejności id');
select is(
  public.get_points_details(array['Bez Opisu']) -> 0 -> 'doc',
  '{}'::jsonb,
  'szczegóły: opis null → pusty opis, bez błędu');
select is(
  public.get_points_details(array['Punkt A']) -> 0 -> 'doc',
  '{}'::jsonb,
  'szczegóły: pusty opis → pusty opis');
select is(
  public.get_points_details(array['Punkt A']) -> 0 -> 'coordinates',
  '[]'::jsonb,
  'szczegóły: punkt bez współrzędnych → pusta lista');
select is(
  (select jsonb_agg(e -> 'name') from jsonb_array_elements(
     public.get_points_details(array['Kurcha', 'Nieznany', 'Tala Hrida', 'Kurcha'])) e),
  jsonb_build_array('Kurcha', 'Tala Hrida'),
  'szczegóły: kolejność jak na wejściu, nieznane nazwy pominięte, bez duplikatów');
select is(
  public.get_points_details(array['Kurcha']) -> 0 -> 'location',
  to_jsonb('stopa'::text),
  'szczegóły: dwa punkty o tej samej nazwie → punkt o najmniejszym id (jak .first())');
select is(public.get_points_details(array[]::text[]), '[]'::jsonb, 'szczegóły: pusta lista → []');
select is(public.get_points_details(null), '[]'::jsonb, 'szczegóły: null → []');
reset role;

-- ---------------------------------------------------------------------------
-- RLS wewnątrz funkcji: authenticated spoza listy → brak wyników.
-- ---------------------------------------------------------------------------
delete from public.subject_embeddings;
insert into public.subject_embeddings (subject_id, is_polish, embedding) values
  (1, false, pg_temp.sim_vec(0.9));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","amr":[{"method":"otp"}],"email":"stranger@example.com","is_anonymous":false}';
select is_empty(
  $$ select name from public.search_points_by_name('tala') $$,
  'spoza listy: nazwa → brak wyników');
select is_empty(
  $$ select name from public.search_points_by_dosha('pitta') $$,
  'spoza listy: dosza → brak wyników');
select is_empty(
  $$ select name from public.match_points_by_embedding(current_setting('test.q')::extensions.vector) $$,
  'spoza listy: wektory → brak wyników');
select is(public.get_points_details(array['Tala Hrida']), '[]'::jsonb, 'spoza listy: szczegóły → []');
reset role;

-- Kontrola: ten sam stan danych dla użytkownika z listy daje wynik.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[{"method":"otp"}],"email":"allowed@example.com","is_anonymous":false}';
select results_eq(
  $$ select name from public.match_points_by_embedding(current_setting('test.q')::extensions.vector) $$,
  $$ values ('Punkt A'::text) $$,
  'z listy: ten sam stan danych → wynik (kontrola testu RLS)');
reset role;

select * from finish();
rollback;
