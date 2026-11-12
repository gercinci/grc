-- Veritabanı seviyesindeki kuralların testi. Her beklenti başarısızsa hata fırlatır.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid)::text, false);
  set role authenticated;
$$;

-- sql çalışırsa hata verir; beklenen hata ile düşerse geçer.
-- 42501 yetki/satır güvenliği, 23514 kısıt, 23505 benzersizlik, P0001 tetikleyici.
create function pg_temp.must_fail(label text, expected text, sql text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlstate <> expected then
      raise exception 'BAŞARISIZ (% bekleniyordu, % geldi: %): %', expected, sqlstate, sqlerrm, label;
    end if;
    return;
  end;
  raise exception 'BAŞARISIZ (reddedilmeliydi): %', label;
end $$;

create function pg_temp.check_that(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'BAŞARISIZ: %', label; end if;
end $$;

-- ------------------------------------------------------------ hazırlık
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');

insert into public.rounds (result_date, opens_at, locks_at, result_at, status) values
  ('2026-11-13', now() - interval '1 hour', now() + interval '1 hour', now() + interval '7 hours', 'open'),
  ('2026-11-14', null, now() + interval '25 hours', now() + interval '31 hours', 'scheduled');
insert into public.questions (round_date, asset_code, reference_price, sigma, source_label) values
  ('2026-11-13', 'BTC', 99000, 0.02, 'test'),
  ('2026-11-13', 'USDTRY', 42.4, 0.0015, 'test'),
  ('2026-11-14', 'BTC', null, 0.02, 'test');
update public.questions set status = 'cancelled' where round_date = '2026-11-13' and asset_code = 'USDTRY';

-- ------------------------------------------------------------ profil kuralları
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.profiles (id, nickname, age_confirmed_at) values (auth.uid(), 'Ali_34', now());
select pg_temp.must_fail('puan alanı kullanıcı tarafından yazılamaz', '42501',
  $$update public.profiles set total_points = 999999$$);
select pg_temp.must_fail('bağlı hesap bayrağı kullanıcı tarafından yazılamaz', '42501',
  $$update public.profiles set is_linked = true$$);
select pg_temp.must_fail('sosyal alana link girilemez', '23514',
  $$update public.profiles set x_handle = 'https://t.me/sinyal'$$);
select pg_temp.must_fail('instagram alanına link girilemez', '23514',
  $$update public.profiles set instagram_handle = 'bit.ly/abc'$$);
update public.profiles set x_handle = 'ali_34', instagram_handle = 'ali.34';

reset role;
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.must_fail('takma ad büyük/küçük harf duyarsız benzersizdir', '23505',
  $$insert into public.profiles (id, nickname, age_confirmed_at) values (auth.uid(), 'ali_34', now())$$);
select pg_temp.must_fail('başkası adına profil açılamaz', '42501',
  $$insert into public.profiles (id, nickname, age_confirmed_at)
    values ('00000000-0000-0000-0000-00000000000c', 'Sahte', now())$$);
select pg_temp.must_fail('takma ad 3 karakterden kısa olamaz', '23514',
  $$insert into public.profiles (id, nickname, age_confirmed_at) values (auth.uid(), 'ab', now())$$);
insert into public.profiles (id, nickname, age_confirmed_at) values (auth.uid(), 'Ece', now());
select pg_temp.check_that('başkasının profil satırı (push token vb.) okunamaz',
  (select count(*) from public.profiles) = 1);
select pg_temp.check_that('herkese açık profil görünümü okunur',
  (select count(*) from public.public_profiles) = 2);

-- ------------------------------------------------------------ tahmin: açık tur
reset role;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.predictions (question_id, value)
  select id, 100000 from public.questions where round_date = '2026-11-13' and asset_code = 'BTC';
update public.predictions set value = 100500;
select pg_temp.check_that('kilitten önce tahmin değiştirilebilir',
  (select value from public.predictions) = 100500);
select pg_temp.must_fail('gönderim zamanı istemciden alınmaz', '42501',
  $$update public.predictions set submitted_at = now() - interval '1 day'$$);
select pg_temp.must_fail('puan alanları kullanıcı tarafından yazılamaz', '42501',
  $$update public.predictions set points = 100$$);
select pg_temp.must_fail('başkası adına tahmin girilemez', '42501',
  $$insert into public.predictions (user_id, question_id, value)
    select '00000000-0000-0000-0000-00000000000b', id, 1 from public.questions
    where round_date = '2026-11-13' and asset_code = 'BTC'$$);
select pg_temp.must_fail('tahmin silinemez', '42501', $$delete from public.predictions$$);
select pg_temp.must_fail('iptal edilen soruya tahmin girilemez', 'P0001',
  $$insert into public.predictions (question_id, value)
    select id, 42 from public.questions where round_date = '2026-11-13' and asset_code = 'USDTRY'$$);
select pg_temp.must_fail('henüz açılmamış tura tahmin girilemez', 'P0001',
  $$insert into public.predictions (question_id, value)
    select id, 1 from public.questions where round_date = '2026-11-14'$$);
select pg_temp.must_fail('sıfır veya negatif tahmin girilemez', '23514',
  $$update public.predictions set value = 0$$);

reset role;
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into public.predictions (question_id, value)
  select id, 98000 from public.questions where round_date = '2026-11-13' and asset_code = 'BTC';
select pg_temp.check_that('sonuçtan önce başkasının tahmini görünmez',
  (select count(*) from public.predictions) = 1);
select pg_temp.must_fail('başkasının tahmini değiştirilemez (0 satır değil, görünmez)', 'P0001',
  $q$do $do$ begin
      update public.predictions set value = 1
        where user_id = '00000000-0000-0000-0000-00000000000a';
      if not found then raise exception 'satır yok'; end if;
    end $do$$q$);

-- ------------------------------------------------------------ kilit sonrası
reset role;
update public.rounds set locks_at = clock_timestamp() where result_date = '2026-11-13';

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.must_fail('kilit sonrası tahmin değiştirilemez', 'P0001',
  $$update public.predictions set value = 101000$$);
reset role;
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
insert into public.profiles (id, nickname, age_confirmed_at) values (auth.uid(), 'Can', now());
select pg_temp.must_fail('kilit sonrası yeni tahmin girilemez', 'P0001',
  $$insert into public.predictions (question_id, value)
    select id, 1 from public.questions where round_date = '2026-11-13' and asset_code = 'BTC'$$);
select pg_temp.check_that('kilit sonrası, sonuçtan önce tahminler hâlâ gizli',
  (select count(*) from public.predictions) = 0);

reset role;
select pg_temp.must_fail('kilit kuralı sunucu rolü için de geçerlidir', 'P0001',
  $$update public.predictions set value = value + 1$$);
select pg_temp.must_fail('tahmin başka soruya taşınamaz', 'P0001',
  $$update public.predictions set question_id = (select id from public.questions where round_date = '2026-11-14')$$);

-- sonuçlandırma: sunucu yalnızca puan alanlarını yazar
update public.predictions set deviation = 0.005, points = 84, league_points = 84, rank = 1, badge = 1
  where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check_that('puan yazılırken tahmin ve gönderim zamanı değişmez',
  (select value = 100500 and submitted_at < (select locks_at from public.rounds where result_date = '2026-11-13')
   from public.predictions where user_id = '00000000-0000-0000-0000-00000000000a'));
update public.questions set status = 'finalized', result_price = 100000
  where round_date = '2026-11-13' and asset_code = 'BTC';

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.check_that('sonuç kesinleşince herkesin tahmini görünür',
  (select count(*) from public.predictions) = 2);
select pg_temp.must_fail('kesinleşmiş soruda tahmin değiştirilemez', 'P0001',
  $$insert into public.predictions (question_id, value)
    select id, 1 from public.questions where round_date = '2026-11-13' and asset_code = 'BTC'$$);

-- ------------------------------------------------------------ şikâyet, engelleme, analitik
insert into public.reports (reported_id, reason) values ('00000000-0000-0000-0000-00000000000a', 'nickname');
select pg_temp.must_fail('kendini şikâyet edemez', '23514',
  $$insert into public.reports (reported_id, reason) values (auth.uid(), 'other')$$);
select pg_temp.check_that('şikâyetler admin olmayanlarca okunamaz',
  (select count(*) from public.reports) = 0);
insert into public.blocks (blocked_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.events (name, props) values ('share_card', '{"asset":"BTC"}');
select pg_temp.must_fail('tanımsız analitik olayı yazılamaz', '23514',
  $$insert into public.events (name) values ('konum')$$);
select pg_temp.must_fail('analitik olayları kullanıcılarca okunamaz', '42501', $$select * from public.events$$);
select pg_temp.must_fail('sonuç fiyatı kullanıcı tarafından yazılamaz', '42501',
  $$update public.questions set result_price = 1$$);
select pg_temp.must_fail('varlık ayarı kullanıcı tarafından yazılamaz', '42501',
  $$update public.assets set active = false$$);

-- admin olmayan şikâyet kuyruğunu göremez; admin görür
reset role;
insert into public.admins values ('00000000-0000-0000-0000-00000000000b');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.check_that('admin şikâyet kuyruğunu görür', (select count(*) from public.reports) = 1);

-- ------------------------------------------------------------ hesap silme (KVKK)
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check_that('hesap silinince profil, tahmin, şikâyet ve engelleme kayıtları da silinir',
  not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000a')
  and not exists (select 1 from public.predictions where user_id = '00000000-0000-0000-0000-00000000000a')
  and not exists (select 1 from public.reports)
  and not exists (select 1 from public.blocks));
delete from auth.users where id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check_that('silinen kullanıcının analitik olayları da silinir',
  not exists (select 1 from public.events));

select pg_temp.check_that('tohum veri: 3 aktif varlık',
  (select count(*) from public.assets where active) = 3);

\echo 'TAMAM: tüm veritabanı kuralı testleri geçti'
