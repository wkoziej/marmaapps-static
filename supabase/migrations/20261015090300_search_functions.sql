-- Funkcje SQL wyszukiwania (U3). Odtwarzają 1:1 logikę z djangoapp/pointsdb/server_utils.py
-- (search_marma_points_by_names, search_marma_points_by_dosha, find_nearest_neighbours, get_answer)
-- z poprawkami koniecznymi technicznie (R25): pusta fraza → brak wyników, pierwszy wynik
-- semantyczny bez duplikatu, punkt bez opisu → pusty opis.
--
-- Wszystkie funkcje: security invoker (RLS działa wewnątrz), pusty search_path (pełne nazwy
-- obiektów), execute tylko dla authenticated. Orkiestrację (nazwa → dosza → embedding) wykonuje
-- funkcja Edge `search` (U4).
--
-- Dopasowanie tekstu jak Django icontains na SQLite: LIKE ze znakiem ucieczki '\' (znaki %, _ i \
-- we frazie są dosłowne) i bez rozróżniania wielkości liter tylko dla liter ASCII (SQLite LIKE
-- bez ICU). Dlatego zamiast ILIKE: translate(A-Z → a-z) po obu stronach i LIKE.

-- Wyszukiwanie po nazwie: podciąg w name, alt_name lub w identyfikatorze jako tekst
-- (jak dziś; usunięcie dopasowania po id po teście regresji — Deferred to Follow-Up Work).
-- Wynik: nazwy bez powtórzeń (w Pythonie set()), w kolejności najmniejszego id punktu.
create or replace function public.search_points_by_name(phrase text)
returns table (name text)
language sql
stable
security invoker
set search_path = ''
as $$
  with pattern as (
    select '%' || pg_catalog.translate(
      pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(phrase, '\', '\\'), '%', '\%'), '_', '\_'),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'
    ) || '%' as p
    where phrase is not null and phrase <> ''
  )
  select mp.name::text
  from public.marma_points mp, pattern
  where pg_catalog.translate(mp.name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') like pattern.p escape '\'
     or pg_catalog.translate(mp.alt_name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') like pattern.p escape '\'
     or mp.id::text like pattern.p escape '\'
  group by mp.name
  order by min(mp.id);
$$;

-- Wyszukiwanie po doszy: fraza bez diakrytyków (unaccent ≈ unidecode) i małymi literami;
-- kolumna doshic_subtypes bez normalizacji diakrytyków (jak dziś).
create or replace function public.search_points_by_dosha(phrase text)
returns table (name text)
language sql
stable
security invoker
set search_path = ''
as $$
  with normalized as (
    select pg_catalog.lower(extensions.unaccent('extensions.unaccent'::regdictionary, phrase)) as q
    where phrase is not null and phrase <> ''
  ),
  pattern as (
    select '%' || pg_catalog.translate(
      pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(q, '\', '\\'), '%', '\%'), '_', '\_'),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'
    ) || '%' as p
    from normalized
  )
  select mp.name::text
  from public.marma_points mp, pattern
  where pg_catalog.translate(mp.doshic_subtypes, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') like pattern.p escape '\'
  group by mp.name
  order by min(mp.id);
$$;

-- Dopasowanie wektora zapytania (embedding OpenAI text-embedding-3-small, 1536 wymiarów).
-- Odpowiednik Qdrant search(limit=5, score_threshold=0.65) dla kolekcji cosinusowej:
-- similarity = 1 − odległość cosinusowa; top 5 wierszy (EN i PL osobno) z similarity ≥ 0.65.
-- Przyjęte tematy: pierwszy oraz te z similarity ≥ pierwszy − 0.05 lub ≥ 0.8 (bez duplikatu).
-- Tematy → punkty przez marma_point_subjects; nazwy bez powtórzeń (w Pythonie dict po nazwie).
-- Kolejność: najlepsze similarity tematu prowadzącego do punktu, malejąco; przy remisie
-- najmniejsze id punktu (tylko kolejność wyniku, zbiór punktów bez zmian).
-- Wektor o innym wymiarze niż wektory w tabeli → błąd pgvector (22000).
create or replace function public.match_points_by_embedding(query_embedding extensions.vector)
returns table (name text)
language sql
stable
security invoker
set search_path = ''
as $$
  with top_rows as (
    select e.subject_id,
           1 - (e.embedding operator(extensions.<=>) query_embedding) as similarity
    from public.subject_embeddings e
    where 1 - (e.embedding operator(extensions.<=>) query_embedding) >= 0.65
    order by e.embedding operator(extensions.<=>) query_embedding
    limit 5
  ),
  ranked as (
    select t.subject_id,
           t.similarity,
           pg_catalog.max(t.similarity) over () as first_similarity
    from top_rows t
  ),
  accepted as (
    select r.subject_id, pg_catalog.max(r.similarity) as similarity
    from ranked r
    where r.similarity = r.first_similarity
       or r.similarity >= r.first_similarity - 0.05
       or r.similarity >= 0.8
    group by r.subject_id
  )
  select mp.name::text
  from accepted a
  join public.marma_point_subjects mps on mps.subject_id = a.subject_id
  join public.marma_points mp on mp.id = mps.marma_point_id
  group by mp.name
  order by pg_catalog.max(a.similarity) desc, pg_catalog.min(mp.id);
$$;

-- Szczegóły punktów w kształcie answer.points: [{name, location, doc, coordinates: [{x, y, z, label}]}].
-- Kolejność jak w point_names; nieznane nazwy pominięte; powtórzone nazwy raz.
-- Przy kilku punktach o tej samej nazwie: punkt o najmniejszym id (jak .first() w Django).
-- Brak opisu (null lub JSON null) → {} (poprawka R25: frontend czyta doc.names).
-- Współrzędne w kolejności id.
create or replace function public.get_points_details(point_names text[])
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with wanted as (
    select distinct on (u.name) u.name, u.ord
    from pg_catalog.unnest(point_names) with ordinality as u(name, ord)
    order by u.name, u.ord
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'name', p.name,
        'location', p.location,
        'doc', case when p.doc is null or p.doc = 'null'::jsonb then '{}'::jsonb else p.doc end,
        'coordinates', coalesce((
          select pg_catalog.jsonb_agg(
                   pg_catalog.jsonb_build_object('x', c.x, 'y', c.y, 'z', c.z, 'label', c.label)
                   order by c.id)
          from public.marma_point_coordinates c
          where c.marma_point_id = p.id
        ), '[]'::jsonb)
      )
      order by w.ord
    ),
    '[]'::jsonb
  )
  from wanted w
  cross join lateral (
    select mp.id, mp.name, mp.location, mp.doc
    from public.marma_points mp
    where mp.name = w.name
    order by mp.id
    limit 1
  ) p;
$$;

revoke execute on function public.search_points_by_name(text) from public, anon;
revoke execute on function public.search_points_by_dosha(text) from public, anon;
revoke execute on function public.match_points_by_embedding(extensions.vector) from public, anon;
revoke execute on function public.get_points_details(text[]) from public, anon;

grant execute on function public.search_points_by_name(text) to authenticated;
grant execute on function public.search_points_by_dosha(text) to authenticated;
grant execute on function public.match_points_by_embedding(extensions.vector) to authenticated;
grant execute on function public.get_points_details(text[]) to authenticated;
