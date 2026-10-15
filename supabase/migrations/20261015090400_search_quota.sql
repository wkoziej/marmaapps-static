-- Limit zapytań funkcji Edge `search` na użytkownika (U4).
-- Chroni koszty OpenAI i wywołań Edge. NIE ogranicza pobierania danych: użytkownik z listy
-- może czytać tabele i funkcje bezpośrednio przez API (ryzyko zaakceptowane przez właściciela).
-- Limit jest zużywany przez każde poprawne żądanie użytkownika z listy (także bez OpenAI):
-- jedna reguła jest prostsza do wyjaśnienia. Żądanie zakończone 500/502 też zużywa limit
-- (frontend nie ponawia żądań automatycznie).
-- Okna stałe: minuta i doba (UTC). Odrzucone żądanie nie zwiększa liczników.

create table private.search_quota (
  user_id uuid primary key references auth.users (id) on delete cascade,
  minute_start timestamptz not null,
  minute_count integer not null check (minute_count >= 0),
  day_start timestamptz not null,
  day_count integer not null check (day_count >= 0)
);

-- Dostęp tylko przez public.consume_search_quota() (security definer). RLS bez polityk:
-- anon i authenticated nie mają uprawnień do tabeli (schemat private nie jest wystawiony).
alter table private.search_quota enable row level security;
revoke all on table private.search_quota from public, anon, authenticated;

-- Zużywa jedno zapytanie z limitu bieżącego użytkownika (auth.uid()).
-- Zwraca true (zgoda) albo false (limit przekroczony → 429 w funkcji Edge).
-- Wymaga is_allowed(); w przeciwnym razie błąd 42501.
create or replace function public.consume_search_quota()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Jedyne miejsce z wartościami limitów.
  per_minute constant integer := 30;
  per_day constant integer := 500;
  v_uid uuid := auth.uid();
  v_minute timestamptz := pg_catalog.date_trunc('minute', pg_catalog.now(), 'UTC');
  v_day timestamptz := pg_catalog.date_trunc('day', pg_catalog.now(), 'UTC');
  v_minute_count integer;
  v_day_count integer;
begin
  if v_uid is null or not public.is_allowed() then
    raise exception 'brak dostępu' using errcode = '42501';
  end if;

  insert into private.search_quota (user_id, minute_start, minute_count, day_start, day_count)
  values (v_uid, v_minute, 0, v_day, 0)
  on conflict (user_id) do nothing;

  -- Blokada wiersza: równoległe żądania tego samego użytkownika liczą się po kolei.
  select case when q.minute_start = v_minute then q.minute_count else 0 end,
         case when q.day_start = v_day then q.day_count else 0 end
  into v_minute_count, v_day_count
  from private.search_quota q
  where q.user_id = v_uid
  for update;

  if v_minute_count >= per_minute or v_day_count >= per_day then
    return false;
  end if;

  update private.search_quota
  set minute_start = v_minute,
      minute_count = v_minute_count + 1,
      day_start = v_day,
      day_count = v_day_count + 1
  where user_id = v_uid;

  return true;
end;
$$;

revoke execute on function public.consume_search_quota() from public, anon;
grant execute on function public.consume_search_quota() to authenticated;
