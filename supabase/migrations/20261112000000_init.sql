-- Tahmintor: temel şema.
-- İlkeler:
--   * İstemci saatine güvenilmez: kilit kuralı veritabanı saatiyle tetikleyicide uygulanır.
--   * Puan, seri ve sonuç alanlarını yalnızca sunucu (service role) yazar.
--   * Başkasının tahmini ancak soru kesinleşince görünür (satır güvenliği).

-- ---------------------------------------------------------------- tipler
create type public.round_status as enum ('scheduled', 'open', 'locked', 'pending', 'finalized', 'cancelled');
create type public.question_status as enum ('open', 'locked', 'pending', 'finalized', 'cancelled');
create type public.participation_status as enum ('participated', 'frozen', 'missed', 'void');
create type public.report_status as enum ('open', 'actioned', 'dismissed');

-- ---------------------------------------------------------------- profiller
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (nickname ~ '^[A-Za-z0-9_çğıöşüÇĞİÖŞÜ]{3,16}$'),
  -- Yalnızca kullanıcı adı; serbest link kabul edilmez.
  x_handle text check (x_handle ~ '^[A-Za-z0-9_]{1,15}$'),
  instagram_handle text check (instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'),
  age_confirmed_at timestamptz not null,
  -- Apple/Google bağlı hesap: genel tablo ve rozet şartı. Sunucu günceller.
  is_linked boolean not null default false,
  total_points integer not null default 0,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  freeze_used_month text check (freeze_used_month ~ '^\d{4}-\d{2}$'),
  notify_results boolean not null default true,
  notify_reminder boolean not null default true,
  push_token text,
  hidden_at timestamptz, -- moderasyon: şikâyet sonucu gizlenen profil
  created_at timestamptz not null default now()
);
create unique index profiles_nickname_key on public.profiles (lower(nickname));

-- Başkalarının görebildiği alanlar (bildirim tercihleri ve push token hariç).
create view public.public_profiles as
  select id, nickname, x_handle, instagram_handle, is_linked,
         total_points, current_streak, longest_streak
  from public.profiles
  where hidden_at is null;

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

-- ---------------------------------------------------------------- varlıklar ve turlar
create table public.assets (
  code text primary key,
  name text not null,
  unit text not null,
  decimals smallint not null check (decimals between 0 and 8),
  step numeric not null check (step > 0),
  initial_sigma numeric not null check (initial_sigma > 0),
  sigma_floor numeric not null check (sigma_floor > 0),
  -- Değişiklik ancak sonraki turdan itibaren geçerlidir: tur açılırken soruya kopyalanır.
  source_label text not null,
  formula jsonb not null,
  active boolean not null default true,
  sort_order smallint not null default 0
);

create table public.rounds (
  result_date date primary key,          -- İstanbul günü
  opens_at timestamptz,                  -- önceki tur kesinleşince dolar
  locks_at timestamptz not null,         -- 12:00 İstanbul
  result_at timestamptz not null,        -- 18:00 İstanbul
  status public.round_status not null default 'scheduled',
  entered_at timestamptz,                -- admin'in son girişi/düzeltmesi
  finalizes_at timestamptz,              -- entered_at + 15 dk
  closed_at timestamptz,                 -- kesinleşme veya iptal anı
  check (locks_at < result_at)
);

-- Admin'in girdiği ham pariteler (ör. USDTTRY, PAXGUSDT, BTCUSDT).
create table public.round_inputs (
  round_date date not null references public.rounds (result_date) on delete cascade,
  symbol text not null,
  price numeric not null check (price > 0),
  primary key (round_date, symbol)
);

create table public.questions (
  id bigint generated always as identity primary key,
  round_date date not null references public.rounds (result_date) on delete cascade,
  asset_code text not null references public.assets (code),
  reference_price numeric check (reference_price > 0), -- son kesinleşen sonuç
  sigma numeric not null check (sigma > 0),            -- tur açılırken dondurulur
  source_label text not null,                          -- tur açılırken kopyalanır
  result_price numeric check (result_price > 0),
  status public.question_status not null default 'open',
  cancel_reason text,
  explanation text,                                    -- "neden böyle oldu"; boşsa gizlenir
  unique (round_date, asset_code)
);

-- ---------------------------------------------------------------- tahminler
create table public.predictions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id bigint not null references public.questions (id) on delete cascade,
  value numeric not null check (value > 0),
  submitted_at timestamptz not null default clock_timestamp(), -- eşitlik bozucu
  -- Aşağısını yalnızca sonuçlandırma yazar.
  deviation numeric,
  points integer,
  league_points integer,
  rank integer,
  badge smallint check (badge between 1 and 3),
  unique (user_id, question_id)
);
create index predictions_question_idx on public.predictions (question_id);

-- Kilit kuralı: tahmin yalnızca tur açıkken ve sunucu saati kilitten önceyken
-- yazılabilir/değiştirilebilir. Service role dahil herkes için geçerlidir.
create function public.enforce_prediction_lock() returns trigger
  language plpgsql set search_path = public as $$
declare
  ts timestamptz := clock_timestamp();
  q record;
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id or new.question_id <> old.question_id then
      raise exception 'Tahmin başka bir kullanıcıya veya soruya taşınamaz' using errcode = 'P0001';
    end if;
    if new.value = old.value then
      new.submitted_at := old.submitted_at; -- yalnızca puan alanları değişiyor
      return new;
    end if;
  end if;

  select qu.status, r.opens_at, r.locks_at into q
  from public.questions qu
  join public.rounds r on r.result_date = qu.round_date
  where qu.id = new.question_id;

  if not found or q.status <> 'open' or q.opens_at is null
     or ts < q.opens_at or ts >= q.locks_at then
    raise exception 'Tahminler kilitlendi' using errcode = 'P0001';
  end if;

  new.submitted_at := ts;
  return new;
end $$;

create trigger predictions_lock
  before insert or update on public.predictions
  for each row execute function public.enforce_prediction_lock();

-- ---------------------------------------------------------------- seri ve ligler
create table public.participations (
  user_id uuid not null references auth.users (id) on delete cascade,
  round_date date not null references public.rounds (result_date) on delete cascade,
  status public.participation_status not null,
  primary key (user_id, round_date)
);

create table public.weekly_scores (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null, -- pazartesi (İstanbul)
  points integer not null default 0,
  primary key (user_id, week_start)
);
create index weekly_scores_rank_idx on public.weekly_scores (week_start, points desc);

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 30),
  invite_code text not null unique,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create function public.is_league_member(league uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.league_members
                       where league_id = league and user_id = auth.uid()) $$;

-- ---------------------------------------------------------------- moderasyon
create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reported_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('nickname', 'social_handle', 'investment_advice', 'other')),
  note text check (char_length(note) <= 500),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create table public.blocks (
  blocker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- analitik
-- Üçüncü taraf araç yok; yalnızca kendi olay tablomuz.
create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (name in
    ('app_open', 'prediction_submitted', 'result_viewed', 'share_card', 'notification_open')),
  props jsonb not null default '{}' check (pg_column_size(props) <= 1024),
  created_at timestamptz not null default now()
);
create index events_name_time_idx on public.events (name, created_at);
create index events_user_time_idx on public.events (user_id, created_at);

-- ---------------------------------------------------------------- yetkiler
-- Supabase varsayılan olarak her şeyi açar; önce kapatıp yalnızca gerekeni veriyoruz.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.assets enable row level security;
alter table public.rounds enable row level security;
alter table public.round_inputs enable row level security;
alter table public.questions enable row level security;
alter table public.predictions enable row level security;
alter table public.participations enable row level security;
alter table public.weekly_scores enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.events enable row level security;

-- profiller: kendi satırını okur/yazar; başkaları public_profiles üzerinden.
grant select on public.profiles to authenticated;
grant insert (id, nickname, age_confirmed_at, x_handle, instagram_handle) on public.profiles to authenticated;
grant update (nickname, x_handle, instagram_handle, notify_results, notify_reminder, push_token)
  on public.profiles to authenticated;
grant select on public.public_profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- oyun verisi: herkes okur, yalnızca sunucu yazar.
grant select on public.assets, public.rounds, public.questions to authenticated;
create policy assets_read on public.assets for select to authenticated using (true);
create policy rounds_read on public.rounds for select to authenticated using (true);
create policy questions_read on public.questions for select to authenticated using (true);

-- tahminler: yalnızca soru ve değer yazılabilir; silme yok.
grant select on public.predictions to authenticated;
grant insert (question_id, value) on public.predictions to authenticated;
grant update (value) on public.predictions to authenticated;
create policy predictions_select on public.predictions for select to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.questions q where q.id = question_id and q.status = 'finalized')
);
create policy predictions_insert_own on public.predictions for insert to authenticated
  with check (user_id = auth.uid());
create policy predictions_update_own on public.predictions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.participations to authenticated;
create policy participations_select_own on public.participations for select to authenticated
  using (user_id = auth.uid());

grant select on public.weekly_scores to authenticated;
create policy weekly_scores_read on public.weekly_scores for select to authenticated using (true);

-- arkadaş ligleri: üyeler okur; kurma/katılma aşama (d)'de sunucu fonksiyonuyla.
grant select on public.leagues, public.league_members to authenticated;
create policy leagues_select_member on public.leagues for select to authenticated
  using (public.is_league_member(id));
create policy league_members_select_member on public.league_members for select to authenticated
  using (public.is_league_member(league_id));

-- şikâyet: gönderilir, okunmaz. Engelleme: kendi listesi.
grant insert (reported_id, reason, note) on public.reports to authenticated;
create policy reports_insert_own on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
grant select, delete on public.blocks to authenticated;
grant insert (blocked_id) on public.blocks to authenticated;
create policy blocks_own on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- analitik: yalnızca kendi olayını yazar, kimse okumaz (admin özeti sunucudan).
grant insert (name, props) on public.events to authenticated;
create policy events_insert_own on public.events for insert to authenticated
  with check (user_id = auth.uid());

-- admin sayfası: okuma. Yazma işlemleri aşama (c)'de sunucu fonksiyonlarıyla.
grant select on public.round_inputs, public.reports, public.admin_audit_log to authenticated;
create policy round_inputs_admin on public.round_inputs for select to authenticated using (public.is_admin());
create policy reports_admin on public.reports for select to authenticated using (public.is_admin());
create policy audit_admin on public.admin_audit_log for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- tohum veri
-- packages/core/src/assets.ts içindeki DEFAULT_ASSETS ile aynı.
insert into public.assets (code, name, unit, decimals, step, initial_sigma, sigma_floor, source_label, formula, active, sort_order) values
  ('USDTRY', 'Dolar/TL', 'TL', 2, 0.01, 0.0015, 0.0005,
   'Binance spot, 18:00 1 dk mum kapanışı (USDT/TRY)',
   '{"kind":"direct","symbol":"USDTTRY"}', true, 1),
  ('GOLD', 'Gram altın (spot)', 'TL', 2, 1, 0.009, 0.002,
   'Binance spot, 18:00 1 dk mum kapanışı (PAXG/USDT × USDT/TRY ÷ 31,1035)',
   '{"kind":"gramGold","ounceSymbol":"PAXGUSDT","fxSymbol":"USDTTRY"}', true, 2),
  ('BTC', 'Bitcoin', 'USDT', 2, 10, 0.02, 0.002,
   'Binance spot, 18:00 1 dk mum kapanışı (BTC/USDT)',
   '{"kind":"direct","symbol":"BTCUSDT"}', true, 3),
  ('ETH', 'Ethereum', 'USDT', 2, 1, 0.028, 0.002,
   'Binance spot, 18:00 1 dk mum kapanışı (ETH/USDT)',
   '{"kind":"direct","symbol":"ETHUSDT"}', false, 4);
