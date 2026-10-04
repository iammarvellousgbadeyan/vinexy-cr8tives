-- Vinexy Graduate Jotter system. Run once in Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table prices(
  id serial primary key,
  size text not null check (size in ('A5','A6')),
  cover text not null check (cover in ('Soft','Hard')),
  qty int not null check (qty in (50,100)),
  price int not null check (price > 0),
  active boolean not null default true,
  unique(size,cover,qty)
);
insert into prices(size,cover,qty,price) values
('A5','Soft',50,65000),('A5','Soft',100,95000),('A5','Hard',50,90000),('A5','Hard',100,135000),
('A6','Soft',50,58000),('A6','Soft',100,88000),('A6','Hard',50,78000),('A6','Hard',100,110000);

create table admins(user_id uuid primary key references auth.users on delete cascade);
create function is_admin() returns boolean language sql security definer stable as
$$ select exists(select 1 from admins where user_id = auth.uid()) $$;

create sequence order_seq;
create function next_order_no() returns bigint language sql security definer as $$ select nextval('order_seq') $$;

create table orders(
  id uuid primary key default gen_random_uuid(),
  order_no text unique not null,
  access_token text not null default encode(gen_random_bytes(18),'hex'),
  size text, cover text, qty int, custom_qty boolean not null default false,
  base_price int, discount int not null default 0, total int,
  quote_status text not null default 'none' check (quote_status in ('none','requested','sent','accepted')),
  quote_note text,
  payment_plan text,
  amount_paid int not null default 0, balance int,
  payment_status text not null default 'pending' check (payment_status in ('pending','partially_paid','fully_paid')),
  status text not null default 'new_order',
  customer_name text, email text, phone text,
  details jsonb not null default '{}', colours jsonb not null default '{}',
  final_released boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table files(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders on delete cascade,
  kind text not null check (kind in ('photo','colour_ref','final')),
  bucket text not null, path text not null, name text, uploaded boolean not null default false, created_at timestamptz not null default now()
);
create table proofs(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders on delete cascade,
  version int not null, pages jsonb not null default '[]', -- [{preview, original}] one entry per page image
  status text not null default 'sent' check (status in ('sent','approved','revision_requested')),
  created_at timestamptz not null default now(), unique(order_id,version)
);
create table revisions(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders on delete cascade,
  proof_id uuid references proofs, version int,
  action text not null, comment text, created_at timestamptz not null default now()
);
create table payments(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders on delete cascade,
  reference text unique not null, amount int not null check (amount > 0),
  method text not null default 'paystack', status text not null default 'success',
  paid_at timestamptz not null default now(), raw jsonb, confirmed_by uuid
);

-- Payment status is derived ONLY from rows in payments. A form submission can never mark an order paid.
create function recompute_payment() returns trigger language plpgsql security definer as $$
declare paid int; o orders; ps text;
begin
  select coalesce(sum(amount),0) into paid from payments where order_id = new.order_id and status = 'success';
  select * into o from orders where id = new.order_id;
  ps := case when o.total is not null and paid >= o.total then 'fully_paid' when paid > 0 then 'partially_paid' else 'pending' end;
  update orders set amount_paid = paid, balance = greatest(coalesce(total,0) - paid, 0), payment_status = ps,
    status = case when status in ('new_order','payment_pending','partially_paid') and ps <> 'pending' then ps else status end,
    updated_at = now()
  where id = new.order_id;
  return new;
end $$;
create trigger payments_recompute after insert on payments for each row execute function recompute_payment();

alter table prices enable row level security; alter table admins enable row level security;
alter table orders enable row level security; alter table files enable row level security;
alter table proofs enable row level security; alter table revisions enable row level security;
alter table payments enable row level security;
create policy admin_all on prices for all using (is_admin()) with check (is_admin());
create policy admin_all on orders for all using (is_admin()) with check (is_admin());
create policy admin_all on files for all using (is_admin()) with check (is_admin());
create policy admin_all on proofs for all using (is_admin()) with check (is_admin());
create policy admin_all on revisions for all using (is_admin()) with check (is_admin());
create policy admin_all on payments for all using (is_admin()) with check (is_admin());
create policy self_admin on admins for select using (user_id = auth.uid());

-- Private buckets. Nothing is public. Customers only receive short-lived signed links from server functions.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('uploads','uploads',false,10485760,array['image/jpeg','image/png']),
 ('previews','previews',false,null,null),
 ('production','production',false,null,null)
on conflict (id) do update set public=false;
create policy admin_storage on storage.objects for all using (is_admin()) with check (is_admin());

create table payment_requests(
  reference text primary key, order_id uuid not null references orders on delete cascade,
  amount int not null check (amount > 0), plan text not null,
  created_at timestamptz not null default now()
);
create table events(
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders on delete cascade,
  type text not null, detail jsonb, created_at timestamptz not null default now()
);
alter table payment_requests enable row level security; alter table events enable row level security;
create policy admin_all on payment_requests for all using (is_admin()) with check (is_admin());
create policy admin_all on events for all using (is_admin()) with check (is_admin());

-- Helper functions must not be callable by the public API.
revoke execute on function next_order_no() from public, anon, authenticated;
revoke execute on function recompute_payment() from public, anon, authenticated;

-- After creating your admin user in Authentication > Users, run:
-- insert into admins(user_id) select id from auth.users where email = 'YOUR_ADMIN_EMAIL';
grant execute on function next_order_no() to service_role;
