-- Dinner votes: run once in Supabase → SQL Editor → New query → Run.
create table if not exists public.votes (
  dinner      text not null check (char_length(dinner) between 1 and 80),
  voter_id    uuid not null,
  voter_name  text not null check (char_length(voter_name) between 1 and 40),
  picks       jsonb not null default '[]'::jsonb,
  top_pick    text check (char_length(top_pick) <= 80),
  updated_at  timestamptz not null default now(),
  primary key (dinner, voter_id)
);

alter table public.votes enable row level security;

-- Anyone with a dinner link can see the results (names and picks only, never voter ids).
drop policy if exists "Anyone can read votes" on public.votes;
create policy "Anyone can read votes" on public.votes for select to anon, authenticated using (true);
revoke all on public.votes from anon, authenticated;
grant select (dinner, voter_name, picks, top_pick, updated_at) on public.votes to anon, authenticated;

-- Voting goes through this one function, which adds or replaces a person's vote.
create or replace function public.cast_vote(p_dinner text, p_voter_id uuid, p_name text, p_picks jsonb, p_top text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_picks is null or jsonb_typeof(p_picks) <> 'array' or jsonb_array_length(p_picks) > 60 then
    raise exception 'picks must be a list of up to 60 times';
  end if;
  insert into public.votes (dinner, voter_id, voter_name, picks, top_pick, updated_at)
  values (p_dinner, p_voter_id, left(btrim(p_name), 40), p_picks, nullif(p_top, ''), now())
  on conflict (dinner, voter_id) do update
    set voter_name = excluded.voter_name, picks = excluded.picks, top_pick = excluded.top_pick, updated_at = now();
end $$;

revoke all on function public.cast_vote(text, uuid, text, jsonb, text) from public;
grant execute on function public.cast_vote(text, uuid, text, jsonb, text) to anon, authenticated;
