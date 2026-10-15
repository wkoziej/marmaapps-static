-- Pierwsze logowanie nowego użytkownika (U7): przy włączonym potwierdzaniu e-mail
-- Supabase wysyła link potwierdzenia rejestracji; w flow PKCE sesja z tego linku ma
-- amr = email/signup. Taką sesję daje tylko link ze skrzynki, więc jest dozwolona.
-- Sesje z hasłem (amr = password) nadal nie mają dostępu.

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
    -- Tylko sesje bez hasła (link e-mail, Google). Ktoś mógł założyć konto z hasłem
    -- na adres z listy, zanim właściciel adresu potwierdził je linkiem.
    -- email/signup: pierwsze logowanie linkiem w flow PKCE (kod z linku w skrzynce).
    and jsonb_typeof(auth.jwt() -> 'amr') = 'array'
    and jsonb_array_length(auth.jwt() -> 'amr') > 0
    and not exists (
      select 1 from jsonb_array_elements(auth.jwt() -> 'amr') m
      where m ->> 'method' is null or m ->> 'method' not in ('otp', 'magiclink', 'oauth', 'email/signup')
    )
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
