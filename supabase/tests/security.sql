-- Execute only against a disposable development database. All fixtures roll back.
begin;
create function pg_temp.check_true(value boolean, message text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %', message; end if;
  raise notice 'PASS: %', message;
end $$;
create function pg_temp.denied(query text, expected_state text, message text) returns void language plpgsql as $$
declare caught boolean := false;
begin
  begin execute query;
  exception when others then
    if sqlstate <> expected_state then raise exception 'FAIL: %, expected %, got % (%)', message, expected_state, sqlstate, sqlerrm; end if;
    caught := true;
  end;
  if not caught then raise exception 'FAIL: % (request succeeded)', message; end if;
  raise notice 'PASS: %', message;
end $$;

insert into auth.users(id,email,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000001','a@example.test','{"is_admin":true,"nickname":" A의 기록 "}'),
('10000000-0000-4000-8000-000000000002','b@example.test','{}'),
('10000000-0000-4000-8000-000000000003','moderator@example.test','{}');
update public.profiles set is_admin = true where id = '10000000-0000-4000-8000-000000000003';
insert into public.works(id,owner_id,title,media_type) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','같은 제목','film'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','같은 제목','book');
insert into public.entries(id,user_id,work_id,summary,experienced_on,date_precision) values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','A 개인 감상','2021','year'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','B 개인 감상','2024-02','month');

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select pg_temp.check_true((select count(*) = 1 from public.entries), 'A sees only their entry');
select pg_temp.check_true((select count(*) = 1 from public.works), 'A sees only their private work');
select pg_temp.check_true((select count(*) = 1 from public.profiles), 'A cannot enumerate other profiles');
select pg_temp.check_true(not public.is_current_user_admin(), 'User metadata cannot grant admin');
select pg_temp.check_true((select nickname = 'A의 기록' from public.profiles), 'Explicit signup nickname is trimmed and preserved');
with changed as (update public.entries set summary = 'hacked' where id = '30000000-0000-4000-8000-000000000002' returning id)
select pg_temp.check_true((select count(*) = 0 from changed), 'A cannot update B entry');
with removed as (delete from public.entries where id = '30000000-0000-4000-8000-000000000002' returning id)
select pg_temp.check_true((select count(*) = 0 from removed), 'A cannot delete B entry');
select pg_temp.denied($q$insert into public.entries(user_id,work_id) values('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002')$q$, '42501', 'A cannot create records as B');
select pg_temp.denied($q$insert into public.entries(user_id,work_id) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002')$q$, '42501', 'A cannot attach B private work');
select pg_temp.denied($q$update public.entries set work_id='20000000-0000-4000-8000-000000000002' where id='30000000-0000-4000-8000-000000000001'$q$, '42501', 'A cannot change a record to B private work');
select pg_temp.denied($q$update public.profiles set is_admin=true where id='10000000-0000-4000-8000-000000000001'$q$, '42501', 'Profile role is not user-editable');
select pg_temp.denied($q$update public.entries set visibility='public' where id='30000000-0000-4000-8000-000000000001'$q$, '42501', 'Direct publication bypass is denied');
select pg_temp.denied($q$update public.entries set user_id='10000000-0000-4000-8000-000000000002' where id='30000000-0000-4000-8000-000000000001'$q$, '42501', 'Owner cannot be reassigned');
select pg_temp.denied($q$insert into public.works(owner_id,title,media_type,is_public) values(null,'공개 우회','film',true)$q$, '42501', 'Direct public work creation is denied');
select pg_temp.denied($q$select public.set_entry_visibility('30000000-0000-4000-8000-000000000002','public')$q$, 'P0002', 'A cannot publish B entry by guessed ID');
select pg_temp.denied($q$select public.moderate_entry('30000000-0000-4000-8000-000000000002',true)$q$, '42501', 'A cannot invoke moderation');
select pg_temp.denied($q$select public.list_moderation_reports()$q$, '42501', 'A cannot enumerate reports');
select pg_temp.denied($q$update public.entries set experienced_on='2023-02-29',date_precision='day' where id='30000000-0000-4000-8000-000000000001'$q$, '23514', 'Invalid calendar date is rejected');
select pg_temp.denied($q$update public.entries set experienced_on='2021-01-01',date_precision='year' where id='30000000-0000-4000-8000-000000000001'$q$, '23514', 'Year precision cannot silently invent month/day');
select pg_temp.denied($q$update public.entries set experienced_on='2021',date_precision='unknown' where id='30000000-0000-4000-8000-000000000001'$q$, '23514', 'Unknown dates must remain null');
select pg_temp.denied($q$update public.entries set tags=array['a','b','c','d','e','f'] where id='30000000-0000-4000-8000-000000000001'$q$, '23514', 'Tag count is bounded');
select pg_temp.denied($q$update public.entries set tags=array[null]::text[] where id='30000000-0000-4000-8000-000000000001'$q$, '23514', 'Null tags are rejected');
select pg_temp.check_true(public.list_public_entries() = '[]'::jsonb, 'Private entries do not appear in public feed');
select pg_temp.check_true(public.get_public_entry('30000000-0000-4000-8000-000000000002') is null, 'Private direct permalink returns no content');
update public.entries set favorite=true where id='30000000-0000-4000-8000-000000000001';
select public.set_entry_visibility('30000000-0000-4000-8000-000000000001','public');
select pg_temp.check_true((select favorite from public.entries), 'Publication preserves private bookmark preference');
select pg_temp.check_true((select work_id = '20000000-0000-4000-8000-000000000001' and experienced_on='2021' from public.entries), 'Publishing preserves original private work and partial date');
select pg_temp.check_true((select not is_public from public.works where id='20000000-0000-4000-8000-000000000001'), 'Publishing does not expose original private work');
select pg_temp.check_true(jsonb_array_length(public.list_public_entries('20000000-0000-4000-8000-000000000001')) = 1, 'Owner can find discussion through their own private work');

set local role anon;
set local "request.jwt.claim.sub" = '';
select pg_temp.check_true((select count(*) = 1 from public.works), 'Anon sees only explicit public work copy');
select pg_temp.check_true((select count(*) = 0 from public.works where id='20000000-0000-4000-8000-000000000001'), 'Anon cannot read original work by ID');
select pg_temp.check_true(jsonb_array_length(public.list_public_entries()) = 1, 'Anon can read published feed');
select pg_temp.check_true(jsonb_array_length(public.list_public_entries(null,0,'같은 제목')) = 1, 'Public search matches work title');
select pg_temp.check_true(jsonb_array_length(public.list_public_entries(null,0,'  a 개인  ')) = 1, 'Public search trims input and matches summary case-insensitively');
select pg_temp.check_true(jsonb_array_length(public.list_public_entries(null,0,'B 개인 감상')) = 0, 'Public search never surfaces private entries');
select pg_temp.check_true(jsonb_array_length(public.list_public_entries(null,0,'%')) = 0, 'Search wildcards are treated literally');
select pg_temp.check_true(jsonb_array_length(public.list_public_entries(null,0,'a@example')) = 0, 'Public search does not match account email');
select pg_temp.check_true(not (public.get_public_entry('30000000-0000-4000-8000-000000000001') ? 'user_id'), 'Public entry excludes auth user ID');
select pg_temp.check_true(public.get_public_entry('30000000-0000-4000-8000-000000000001') ->> 'favorite' = 'false', 'Public entry does not expose private bookmark preference');
select pg_temp.check_true(position('@example.test' in public.list_public_entries()::text) = 0, 'Public result excludes account email');
select pg_temp.check_true(jsonb_array_length(public.list_public_entries('20000000-0000-4000-8000-000000000001')) = 0, 'Anon cannot probe private catalogue mapping');
select pg_temp.denied('select * from public.entries', '42501', 'Anon cannot read entry table directly');
select pg_temp.denied('select * from public.profiles', '42501', 'Anon cannot enumerate profiles');
select pg_temp.denied('select * from public.reports', '42501', 'Anon cannot enumerate reports');
select pg_temp.denied($q$select public.set_entry_visibility('30000000-0000-4000-8000-000000000001','private')$q$, '42501', 'Anon cannot unpublish');
select pg_temp.denied('select public.delete_my_account()', '42501', 'Anon cannot call account deletion');

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
select pg_temp.check_true((select nickname = '기록하는 사람' from public.profiles), 'Missing signup nickname never falls back to account email');
select pg_temp.check_true((select count(*) = 1 from public.entries), 'Public publication does not expose raw rows to B');
select public.report_entry('30000000-0000-4000-8000-000000000001','스포일러 표시를 확인해주세요');
select pg_temp.check_true((select count(*) = 1 from public.reports), 'Reporter can see their own report');
select public.set_entry_visibility('30000000-0000-4000-8000-000000000002','public');
select pg_temp.check_true((select count(*) = 2 from public.works where is_public), 'Same title is not automatically merged across works');

-- Explicit selection of an existing public work shares its discussion.
insert into public.entries(user_id,work_id,summary)
select '10000000-0000-4000-8000-000000000002',id,'선택한 공통 작품' from public.works where is_public and media_type='film';
select public.set_entry_visibility(id,'public') from public.entries where summary='선택한 공통 작품';
select pg_temp.check_true(jsonb_array_length(public.list_public_entries((select id from public.works where is_public and media_type='film'))) = 2, 'Explicit catalogue selection groups reader impressions');
select public.set_entry_visibility(id,'private') from public.entries where summary='선택한 공통 작품';

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select pg_temp.check_true((select count(*) = 0 from public.reports), 'Reported author cannot inspect reporter details');
select public.set_entry_visibility('30000000-0000-4000-8000-000000000001','private');
set local role anon;
set local "request.jwt.claim.sub" = '';
select pg_temp.check_true(public.get_public_entry('30000000-0000-4000-8000-000000000001') is null, 'Unpublished permalink immediately hides content');
select pg_temp.check_true(jsonb_array_length(public.list_public_entries()) = 1, 'Unpublished entry leaves public feed');
select pg_temp.check_true((select count(*) = 1 from public.works), 'Orphan public work disappears after unpublish');

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
select pg_temp.check_true((select count(*) = 1 from public.entries where summary='선택한 공통 작품'), 'Another author unpublishing does not erase personal history');
select pg_temp.check_true((select count(*) = 1 from public.works where is_public and media_type='film'), 'Personally referenced catalogue stays accessible in own archive');
delete from public.entries where summary='선택한 공통 작품';
select pg_temp.denied($q$select public.report_entry('30000000-0000-4000-8000-000000000001','비공개 기록 신고 시도')$q$, 'P0002', 'Reporter cannot probe unpublished entry content');

-- Repeated experiences are independent entries, with stable pagination.
insert into public.entries(user_id,work_id,summary,experienced_on,date_precision)
select '10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','페이지 테스트 ' || n,'2024-02-29','day'
from generate_series(1,21) n;
select public.set_entry_visibility(id,'public') from public.entries where summary like '페이지 테스트 %';
select pg_temp.check_true(jsonb_array_length(public.list_public_entries(null,0)) = 20, 'Public feed page size is 20');
select pg_temp.check_true(jsonb_array_length(public.list_public_entries(null,1)) = 2, 'Public feed second page contains remaining entries');
select pg_temp.check_true(jsonb_array_length(public.list_public_entries(null,2)) = 0, 'Public feed reaches a finite empty page');
select pg_temp.check_true(jsonb_array_length(public.list_public_entries(null,0,'페이지 테스트 21')) = 1, 'Public search finds entries beyond the first page');
select pg_temp.check_true(jsonb_array_length(public.list_public_entries(null,1,'페이지 테스트')) = 1, 'Public search keeps server-side pagination');
select pg_temp.check_true((select count(*) = 22 from public.entries), 'Repeat experiences do not overwrite older records');
delete from public.entries where summary like '페이지 테스트 %';

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select public.set_entry_visibility('30000000-0000-4000-8000-000000000001','public');
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select pg_temp.check_true(public.is_current_user_admin(), 'Trusted database role grants moderation access');
select pg_temp.check_true(jsonb_array_length(public.list_moderation_reports()) = 1, 'Admin can inspect reports');
select public.moderate_entry('30000000-0000-4000-8000-000000000001',true);
select pg_temp.check_true(public.get_public_entry('30000000-0000-4000-8000-000000000001') is null, 'Moderation hides public permalink');
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select pg_temp.check_true((select count(*) = 1 from public.entries), 'Moderation preserves author private history');
select pg_temp.denied($q$select public.set_entry_visibility('30000000-0000-4000-8000-000000000001','public')$q$, '42501', 'Author cannot override moderation');
select pg_temp.denied($q$update public.entries set moderated_hidden=false where id='30000000-0000-4000-8000-000000000001'$q$, '42501', 'Direct unhide is denied');
select public.delete_my_account();
reset role;
select pg_temp.check_true((select count(*) = 0 from auth.users where id='10000000-0000-4000-8000-000000000001'), 'Account deletion removes its auth user');
select pg_temp.check_true((select count(*) = 0 from public.entries where user_id='10000000-0000-4000-8000-000000000001'), 'Account deletion removes private and published entries');
select pg_temp.check_true((select count(*) = 0 from public.works where owner_id='10000000-0000-4000-8000-000000000001'), 'Account deletion removes private works');
select pg_temp.check_true((select count(*) = 0 from public.reports), 'Account deletion removes reports about deleted entries');
select pg_temp.check_true((select count(*) = 1 from public.entries where user_id='10000000-0000-4000-8000-000000000002'), 'Account deletion preserves other users records');
rollback;
