-- Lista dozwolonych adresów i hook „Before User Created” (U2).
-- Schemat private nie jest wystawiony przez API (config.toml: [api].schemas).
-- Adresy wpisuje właściciel ręcznie w panelu Supabase (zob. README.md).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.allowed_emails (
  email text not null primary key,
  created_at timestamptz not null default now(),
  -- Wpis jest przechowywany po normalizacji (trigger niżej): małe litery, bez białych znaków.
  constraint allowed_emails_email_normalized check (
    email = lower(email) and email !~ '[[:space:]\u00a0]' and email ~ '^[^@]+@[^@]+$'
  )
);

-- Adres wklejony w panelu Supabase może mieć wielkie litery, spacje, tabulatory lub NBSP.
create or replace function private.normalize_allowed_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(regexp_replace(new.email, '[[:space:]\u00a0]', '', 'g'));
  return new;
end;
$$;

revoke execute on function private.normalize_allowed_email() from public, anon, authenticated;

create trigger allowed_emails_normalize
  before insert or update of email on private.allowed_emails
  for each row execute function private.normalize_allowed_email();

-- Porównanie bez rozróżniania wielkości liter: jeden wpis na adres niezależnie od liter.
create unique index allowed_emails_email_lower_idx on private.allowed_emails (lower(btrim(email)));

revoke all on table private.allowed_emails from public, anon, authenticated;

-- Hook: deny by default. Zgoda tylko, gdy adres z event.user.email jest na liście.
-- Działa dla każdego dostawcy (e-mail, Google), bo Supabase Auth wywołuje go
-- przed utworzeniem konta niezależnie od metody logowania.
-- Format: wejście {"metadata": {...}, "user": {"email": ..., "app_metadata": {...}, ...}};
-- wyjście {} (zgoda) albo {"error": {"http_code": 403, "message": "..."}} (odmowa).
create or replace function private.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(event -> 'user' ->> 'email'));
begin
  if v_email is not null and v_email <> '' and exists (
    select 1 from private.allowed_emails a where lower(btrim(a.email)) = v_email
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Ten adres e-mail nie ma dostępu do aplikacji. Skontaktuj się z właścicielem.'
    )
  );
end;
$$;

revoke execute on function private.before_user_created_hook(jsonb) from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant select on table private.allowed_emails to supabase_auth_admin;
grant execute on function private.before_user_created_hook(jsonb) to supabase_auth_admin;

