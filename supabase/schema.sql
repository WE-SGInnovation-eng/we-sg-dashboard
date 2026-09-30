-- WE SG Dashboard — Supabase schema
-- Run once in the Supabase dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run: it only creates what is missing and replaces the functions.

-- ── Tables ──────────────────────────────────────────────────────────────────
-- `position` keeps rows in the same order as the dashboard and the Sheet.

create table if not exists public.anchors (
  id         bigint generated always as identity primary key,
  position   integer     not null,
  name       text        not null,
  ini        text        not null default '',
  value      bigint      not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.sprints (
  id         integer     primary key,          -- the dashboard's own sprint id
  position   integer     not null,
  team       text        not null default '',
  name       text        not null default '',
  stage      text        not null default 'Scoping',
  ms         text        not null default '',  -- milestone, e.g. '09.26'
  updated_at timestamptz not null default now()
);

create table if not exists public.prospects (
  id         bigint generated always as identity primary key,
  position   integer     not null,
  name       text        not null,
  industry   text        not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id         bigint generated always as identity primary key,
  position   integer     not null,
  text       text        not null,
  updated_at timestamptz not null default now()
);

-- Row level security on, with no policies: the public (anon) key can read and
-- write nothing. Only the server, using the service role key, can reach the data.
alter table public.anchors   enable row level security;
alter table public.sprints   enable row level security;
alter table public.prospects enable row level security;
alter table public.quotes    enable row level security;

-- ── Replace functions ───────────────────────────────────────────────────────
-- Each save replaces a whole list in one transaction, so readers always see
-- either the old list or the new one — never a half-written or empty list.
-- `rows` is a JSON array, in display order.

create or replace function public.replace_anchors(rows jsonb)
returns void language plpgsql as $$
begin
  delete from public.anchors;
  insert into public.anchors (position, name, ini, value)
  select r.ord,
         trim(r.elem->>'name'),
         coalesce(trim(r.elem->>'ini'), ''),
         coalesce(round(nullif(regexp_replace(r.elem->>'value', '[^0-9.]', '', 'g'), '')::numeric), 0)
  from jsonb_array_elements(rows) with ordinality as r(elem, ord)
  where coalesce(trim(r.elem->>'name'), '') <> '';
end;
$$;

create or replace function public.replace_sprints(rows jsonb)
returns void language plpgsql as $$
begin
  delete from public.sprints;
  insert into public.sprints (id, position, team, name, stage, ms)
  select distinct on (trim(r.elem->>'id')::integer)
         trim(r.elem->>'id')::integer,
         r.ord,
         coalesce(r.elem->>'team', ''),
         coalesce(r.elem->>'name', ''),
         coalesce(nullif(r.elem->>'stage', ''), 'Scoping'),
         coalesce(r.elem->>'ms', '')
  from jsonb_array_elements(rows) with ordinality as r(elem, ord)
  where (r.elem->>'id') ~ '^\s*[0-9]+\s*$'
  order by trim(r.elem->>'id')::integer, r.ord;
end;
$$;

-- Each element is either a plain name ("Acme") or an object
-- ({"name": "Acme", "industry": "Media"}). The dashboard sends plain names,
-- so a prospect that has no industry in the payload keeps the one it already
-- had. The Sheet sends objects, so its industries always win.
create or replace function public.replace_prospects(rows jsonb)
returns void language plpgsql as $$
declare
  old_industry jsonb;
begin
  select coalesce(jsonb_object_agg(k, industry), '{}') into old_industry
  from (
    select distinct on (lower(trim(name))) lower(trim(name)) as k, industry
    from public.prospects
    order by lower(trim(name)), position
  ) o;

  delete from public.prospects;
  insert into public.prospects (position, name, industry)
  select i.ord, i.name, coalesce(i.industry, old_industry->>lower(i.name), '')
  from (
    select r.ord,
           trim(case jsonb_typeof(r.elem) when 'string' then r.elem #>> '{}'
                                          else r.elem->>'name' end) as name,
           case when jsonb_typeof(r.elem) = 'object' and r.elem ? 'industry'
                then coalesce(trim(r.elem->>'industry'), '') end    as industry
    from jsonb_array_elements(rows) with ordinality as r(elem, ord)
  ) i
  where coalesce(i.name, '') <> '';
end;
$$;

create or replace function public.replace_quotes(rows jsonb)
returns void language plpgsql as $$
begin
  delete from public.quotes;
  insert into public.quotes (position, text)
  select r.ord, trim(r.elem #>> '{}')
  from jsonb_array_elements(rows) with ordinality as r(elem, ord)
  where coalesce(trim(r.elem #>> '{}'), '') <> '';
end;
$$;

-- Only the server may call these.
revoke execute on function public.replace_anchors(jsonb)   from public, anon, authenticated;
revoke execute on function public.replace_sprints(jsonb)   from public, anon, authenticated;
revoke execute on function public.replace_prospects(jsonb) from public, anon, authenticated;
revoke execute on function public.replace_quotes(jsonb)    from public, anon, authenticated;
grant  execute on function public.replace_anchors(jsonb)   to service_role;
grant  execute on function public.replace_sprints(jsonb)   to service_role;
grant  execute on function public.replace_prospects(jsonb) to service_role;
grant  execute on function public.replace_quotes(jsonb)    to service_role;
