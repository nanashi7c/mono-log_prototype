-- マスタ＋プリセットカテゴリの seed（supabase/migrations/0003_seed_master.sql を移植）。
-- ON CONFLICT DO NOTHING で再実行は no-op。monolog_admin（所有者）で実行する想定。

-- platforms
insert into public.platforms (name, fee_rate) values
  ('メルカリ',       0.1000),
  ('ラクマ',         0.0600),
  ('Yahoo!フリマ',   0.0500),
  ('Yahoo!オークション', 0.1000)
on conflict (name) do nothing;

-- services
insert into public.services (shipping_service) values
  ('らくらくメルカリ便'),
  ('ゆうゆうメルカリ便'),
  ('ヤマト宅急便'),
  ('日本郵便（ゆうパック）')
on conflict (shipping_service) do nothing;

-- sizes
insert into public.sizes (shipping_size) values
  ('ネコポス'),
  ('ゆうパケット'),
  ('宅急便コンパクト'),
  ('60サイズ'),
  ('80サイズ'),
  ('100サイズ'),
  ('120サイズ'),
  ('140サイズ'),
  ('160サイズ')
on conflict (shipping_size) do nothing;

-- shipping_fees（service × size → fee）
with svc as (select id, shipping_service from public.services),
     sz  as (select id, shipping_size from public.sizes)
insert into public.shipping_fees (shipping_service_id, shipping_size_id, fee)
select s.id, z.id, f.fee
from (values
  ('らくらくメルカリ便',  'ネコポス',         210),
  ('らくらくメルカリ便',  '宅急便コンパクト', 450),
  ('らくらくメルカリ便',  '60サイズ',          750),
  ('らくらくメルカリ便',  '80サイズ',          850),
  ('らくらくメルカリ便',  '100サイズ',        1050),
  ('らくらくメルカリ便',  '120サイズ',        1200),
  ('らくらくメルカリ便',  '140サイズ',        1450),
  ('らくらくメルカリ便',  '160サイズ',        1700),
  ('ゆうゆうメルカリ便',  'ゆうパケット',      215),
  ('ゆうゆうメルカリ便',  '60サイズ',          770),
  ('ゆうゆうメルカリ便',  '80サイズ',          870),
  ('ゆうゆうメルカリ便',  '100サイズ',        1070),
  ('ヤマト宅急便',         '60サイズ',          940),
  ('ヤマト宅急便',         '80サイズ',         1150),
  ('ヤマト宅急便',         '100サイズ',        1390),
  ('ヤマト宅急便',         '120サイズ',        1610),
  ('ヤマト宅急便',         '140サイズ',        1850),
  ('ヤマト宅急便',         '160サイズ',        2070),
  ('日本郵便（ゆうパック）','60サイズ',          810),
  ('日本郵便（ゆうパック）','80サイズ',         1030),
  ('日本郵便（ゆうパック）','100サイズ',        1270),
  ('日本郵便（ゆうパック）','120サイズ',        1510),
  ('日本郵便（ゆうパック）','140サイズ',        1760),
  ('日本郵便（ゆうパック）','160サイズ',        2010)
) as f(service, size, fee)
join svc s on s.shipping_service = f.service
join sz  z on z.shipping_size = f.size
on conflict (shipping_service_id, shipping_size_id) do nothing;

-- preset categories（user_id NULL, is_preset true）
insert into public.categories (user_id, name, is_preset, color) values
  (null, '電子機器',           true, '#4a6cf7'),
  (null, '衣類',               true, '#ec4899'),
  (null, '本・コミック',       true, '#f59e0b'),
  (null, 'ホビー・おもちゃ',   true, '#10b981'),
  (null, '家具・インテリア',   true, '#a855f7'),
  (null, '食品・飲料',         true, '#ef4444'),
  (null, 'スポーツ',           true, '#06b6d4'),
  (null, '美容・健康',         true, '#f472b6'),
  (null, 'その他',             true, '#94a3b8')
on conflict (user_id, name) do nothing;
