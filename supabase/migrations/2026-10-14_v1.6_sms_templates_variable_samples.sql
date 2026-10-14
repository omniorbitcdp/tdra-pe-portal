-- ===========================================================================
-- v1.6 — SMS-only templates + sample content for <varN> variables
--
-- 1. template_registrations.variable_samples: sample content per variable, so a
--    reviewer can read the message the subscriber would receive.
-- 2. channel is fixed to SMS: the platform registers SMS templates only.
-- 3. Legacy {{name}} bodies are converted to the <var1>, <var2> … form.
--
-- Idempotent: safe to re-run, and safe to re-run after a partial failure.
-- Run the whole script in the Supabase SQL editor.
-- ===========================================================================

alter table template_registrations
  add column if not exists variable_samples jsonb not null default '{}'::jsonb;

comment on column template_registrations.variable_samples is 'Sample content per declared variable, e.g. {"var1":"Puneet","var2":"ORD-4471"}';

-- Normalise any legacy non-SMS rows before tightening the constraint.
update template_registrations set channel = 'SMS' where channel is distinct from 'SMS';

-- 1. Legacy {{name}} bodies -> <varN>, numbered in order of first appearance.
do $$
declare
  r record;
  tok text;
  n integer;
  new_body text;
  samples jsonb;
begin
  for r in
    select id, body from template_registrations
    where body ~ '\{\{\s*[A-Za-z0-9_]+\s*\}\}'
  loop
    new_body := r.body;
    samples := '{}'::jsonb;
    n := 0;
    for tok in
      select s.tok from (
        select m[1] as tok, min(position(m[1] in r.body)) as pos
        from regexp_matches(r.body, '\{\{\s*([A-Za-z0-9_]+)\s*\}\}', 'g') as m
        group by m[1]
      ) s
      order by s.pos
    loop
      n := n + 1;
      new_body := regexp_replace(new_body, '\{\{\s*' || tok || '\s*\}\}', '<var' || n || '>', 'g');
      samples := samples || jsonb_build_object('var' || n, '');
    end loop;
    update template_registrations
    set body = new_body,
        variables = coalesce(nullif(variables, ''), (
          select string_agg(k, ',' order by (regexp_replace(k, '\D', '', 'g'))::int)
          from jsonb_object_keys(samples) as k
        )),
        variable_samples = case when variable_samples = '{}'::jsonb then samples else variable_samples end
    where id = r.id;
  end loop;
end $$;

-- 2. Re-point the variable list at whatever <varN> tokens the body now declares.
update template_registrations
set variables = (
  select string_agg('var' || m[1], ',' order by m[1]::int)
  from regexp_matches(body, '<var([0-9]+)>', 'g') as m
)
where body ~ '<var[0-9]+>'
  and (variables is null or variables = '');

-- 3. Give every declared variable an explicit sample slot (empty until the PE
--    fills it) so the reviewer screen renders one input per variable.
update template_registrations t
set variable_samples = coalesce((
  select jsonb_object_agg('var' || v, '')
  from unnest(string_to_array(t.variables, ',')) as v
  where v ~ '^var[0-9]+$'
), '{}'::jsonb)
where t.variables is not null
  and t.variables <> ''
  and t.variable_samples = '{}'::jsonb;

-- 4. channel: drop any old check (whatever it was called) and enforce SMS only.
alter table template_registrations drop constraint if exists template_registrations_channel_sms_only;

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'template_registrations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%channel%'
  loop
    execute format('alter table template_registrations drop constraint %I', c.conname);
  end loop;
end $$;

alter table template_registrations
  add constraint template_registrations_channel_sms_only check (channel = 'SMS');

select
  (select count(*) from template_registrations) as templates,
  (select count(*) from template_registrations where channel <> 'SMS') as non_sms_remaining,
  (select count(*) from template_registrations where body ~ '\{\{') as legacy_bodies_left,
  (select count(*) from information_schema.columns
     where table_name = 'template_registrations' and column_name = 'variable_samples') as samples_column;
