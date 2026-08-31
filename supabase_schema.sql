-- Supabase Schema for DineFlow SaaS (Idempotent Version)

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";

-- 2. TABLES & MIGRATIONS
-- Ensure restaurants table exists with all columns
create table if not exists public.restaurants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  logo_url text,
  primary_color text default '#f97316',
  secondary_color text default '#1f2937',
  is_active boolean default true,
  created_at timestamp with time zone default now()
);

-- Migration: Ensure is_active, service_fee_percentage, and geofence columns exist even if table was created previously
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name='restaurants' and column_name='is_active') then
        alter table public.restaurants add column is_active boolean default true;
    end if;
    if not exists (select 1 from information_schema.columns where table_name='restaurants' and column_name='service_fee_percentage') then
        alter table public.restaurants add column service_fee_percentage decimal(5,2) default 0.00;
    end if;
    if not exists (select 1 from information_schema.columns where table_name='restaurants' and column_name='geofence_enabled') then
        alter table public.restaurants add column geofence_enabled boolean default false;
    end if;
    if not exists (select 1 from information_schema.columns where table_name='restaurants' and column_name='latitude') then
        alter table public.restaurants add column latitude decimal(10,7);
    end if;
    if not exists (select 1 from information_schema.columns where table_name='restaurants' and column_name='longitude') then
        alter table public.restaurants add column longitude decimal(10,7);
    end if;
    if not exists (select 1 from information_schema.columns where table_name='restaurants' and column_name='geofence_radius_meters') then
        alter table public.restaurants add column geofence_radius_meters integer default 100;
    end if;
    if not exists (select 1 from information_schema.columns where table_name='restaurants' and column_name='fb_pixel_id') then
        alter table public.restaurants add column fb_pixel_id text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name='restaurants' and column_name='is_prepaid') then
        alter table public.restaurants add column is_prepaid boolean default false;
    end if;
    if not exists (select 1 from information_schema.columns where table_name='restaurants' and column_name='payment_model') then
        alter table public.restaurants add column payment_model text default 'postpaid';
    end if;
end $$;

-- Migration: Enforce CASCADE on all foreign keys referencing restaurants
do $$
declare
    r record;
begin
    -- First, handle direct references to restaurants
    for r in (
        select 
            tc.table_name, 
            kcu.column_name, 
            tc.constraint_name
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
        join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
        where tc.constraint_type = 'FOREIGN KEY' 
          and ccu.table_name = 'restaurants'
          and tc.table_schema = 'public'
    ) loop
        execute format('alter table public.%I drop constraint if exists %I', r.table_name, r.constraint_name);
        execute format('alter table public.%I add constraint %I foreign key (%I) references public.restaurants(id) on delete cascade', 
            r.table_name, r.constraint_name, r.column_name);
    end loop;

    -- Also handle order_items referencing orders (which reference restaurants)
    if exists (select 1 from information_schema.table_constraints where constraint_name = 'order_items_order_id_fkey') then
        alter table public.order_items drop constraint if exists order_items_order_id_fkey;
        alter table public.order_items add constraint order_items_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
    end if;
end $$;

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  restaurant_name text,
  role text not null check (role in ('waiter', 'admin', 'super_admin')),
  full_name text,
  email text,
  shift_start time,
  shift_end time,
  created_at timestamp with time zone default now()
);

-- Migration: Ensure restaurant_name and shift columns exist
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name='profiles' and column_name='restaurant_name') then
        alter table public.profiles add column restaurant_name text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name='profiles' and column_name='shift_start') then
        alter table public.profiles add column shift_start time;
    end if;
    if not exists (select 1 from information_schema.columns where table_name='profiles' and column_name='shift_end') then
        alter table public.profiles add column shift_end time;
    end if;

    -- Backfill restaurant_name for existing profiles from restaurants table
    update public.profiles p
    set restaurant_name = r.name
    from public.restaurants r
    where p.restaurant_id = r.id and (p.restaurant_name is null or p.restaurant_name != r.name);
end $$;

create table if not exists public.tables (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_number text not null,
  created_at timestamp with time zone default now(),
  unique(restaurant_id, table_number)
);

create table if not exists public.categories (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name_en text not null,
  name_ar text not null,
  sort_order int default 0,
  options jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now()
);

-- Migration: Ensure options column exists on categories
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name='categories' and column_name='options') then
        alter table public.categories add column options jsonb default '[]'::jsonb;
    end if;
end $$;

create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name_en text not null,
  name_ar text not null,
  description_en text,
  description_ar text,
  image_url text,
  price decimal(10,2) not null,
  options jsonb default '[]'::jsonb,
  availability boolean default true,
  created_at timestamp with time zone default now()
);

-- Migration: Ensure options column exists on products
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name='products' and column_name='options') then
        alter table public.products add column options jsonb default '[]'::jsonb;
    end if;
end $$;

create table if not exists public.orders (
  id bigint primary key generated always as identity (start with 1 increment by 1),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  waiter_id uuid references public.profiles(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'preparing', 'delivered', 'cancelled')),
  total_price decimal(10,2) default 0,
  preparing_at timestamp with time zone,
  delivered_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- Migration: Ensure performance columns exist
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name='orders' and column_name='waiter_id') then
        alter table public.orders add column waiter_id uuid references public.profiles(id) on delete set null;
    end if;
    if not exists (select 1 from information_schema.columns where table_name='orders' and column_name='preparing_at') then
        alter table public.orders add column preparing_at timestamp with time zone;
    end if;
    if not exists (select 1 from information_schema.columns where table_name='orders' and column_name='delivered_at') then
        alter table public.orders add column delivered_at timestamp with time zone;
    end if;
end $$;

create table if not exists public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id bigint not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  quantity int not null default 1,
  notes text,
  sugar_level text check (sugar_level in ('none', 'low', 'medium', 'high')),
  price_at_order decimal(10,2),
  created_at timestamp with time zone default now()
);

create table if not exists public.waiter_calls (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  status text not null default 'pending',
  created_at timestamp with time zone default now()
);

-- 3. ENABLE RLS
alter table public.restaurants enable row level security;
alter table public.profiles enable row level security;
alter table public.tables enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.waiter_calls enable row level security;

-- 4. FUNCTIONS
create or replace function public.get_role() returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql security definer;

create or replace function public.get_restaurant_id() returns uuid as $$
  select restaurant_id from public.profiles where id = auth.uid();
$$ language sql security definer;

-- 5. RLS POLICIES (Drop and Recreate)
do $$
begin
    -- Restaurants
    drop policy if exists "Public restaurants are readable by all" on public.restaurants;
    drop policy if exists "Super Admins can manage restaurants" on public.restaurants;
    drop policy if exists "Admins can update their own restaurant" on public.restaurants;
    
    create policy "Public restaurants are readable by all" on public.restaurants for select using (true);
    create policy "Super Admins can manage restaurants" on public.restaurants for all using (
      public.get_role() = 'super_admin'
    );
    create policy "Admins can update their own restaurant" on public.restaurants for update using (
      id = public.get_restaurant_id() AND public.get_role() = 'admin'
    );

    -- Profiles
    drop policy if exists "Users can read profiles from their restaurant" on public.profiles;
    drop policy if exists "Super Admins can manage all profiles" on public.profiles;
    drop policy if exists "Users can read their own profile" on public.profiles;
    drop policy if exists "Users can update their own profile" on public.profiles;
    drop policy if exists "Admins can manage profiles of their restaurant" on public.profiles;
    
    create policy "Users can read their own profile" on public.profiles for select using (auth.uid() = id);
    create policy "Users can read profiles from their restaurant" on public.profiles for select using (
      restaurant_id = public.get_restaurant_id()
    );
    create policy "Super Admins can manage all profiles" on public.profiles for all using (
      public.get_role() = 'super_admin'
    );
    create policy "Admins can manage profiles of their restaurant" on public.profiles for all using (
      restaurant_id = public.get_restaurant_id() AND public.get_role() = 'admin'
    );

    -- Tables
    drop policy if exists "Public tables are readable" on public.tables;
    drop policy if exists "Staff can manage tables" on public.tables;
    
    create policy "Public tables are readable" on public.tables for select using (true);
    create policy "Staff can manage tables" on public.tables for all using (
      public.get_role() = 'super_admin' OR 
      (restaurant_id = public.get_restaurant_id() AND public.get_role() = 'admin')
    );

    -- Categories
    drop policy if exists "Public categories are readable" on public.categories;
    drop policy if exists "Admins manage categories" on public.categories;
    drop policy if exists "Categories_Management_Policy" on public.categories;
    drop policy if exists "Categories_Admin_Policy" on public.categories;
    drop policy if exists "Admins can manage categories" on public.categories;
    
    create policy "Public categories are readable" on public.categories for select using (true);
    create policy "Admins manage categories" on public.categories for all 
    using (
      public.get_role() = 'super_admin' OR 
      restaurant_id = public.get_restaurant_id()
    )
    with check (
      public.get_role() = 'super_admin' OR 
      restaurant_id = public.get_restaurant_id()
    );

    -- Products
    drop policy if exists "Public products are readable" on public.products;
    drop policy if exists "Admins manage products" on public.products;
    drop policy if exists "Products_Management_Policy" on public.products;
    drop policy if exists "Products_Admin_Policy" on public.products;
    drop policy if exists "Admins can manage products" on public.products;
    
    create policy "Public products are readable" on public.products for select using (true);
    create policy "Admins manage products" on public.products for all 
    using (
      public.get_role() = 'super_admin' OR 
      restaurant_id = public.get_restaurant_id()
    )
    with check (
      public.get_role() = 'super_admin' OR 
      restaurant_id = public.get_restaurant_id()
    );

    -- Orders
    drop policy if exists "Anyone can insert orders" on public.orders;
    drop policy if exists "Anyone can read orders by ID" on public.orders;
    drop policy if exists "Staff can manage orders" on public.orders;
    drop policy if exists "Staff can read orders of their restaurant" on public.orders;
    drop policy if exists "Staff can update orders of their restaurant" on public.orders;
    drop policy if exists "Public can read their own orders" on public.orders;
    
    create policy "Anyone can insert orders" on public.orders for insert with check (true);
    create policy "Anyone can read orders by ID" on public.orders for select using (true);
    create policy "Staff can manage orders" on public.orders for all using (
       public.get_role() = 'super_admin' OR 
       restaurant_id = public.get_restaurant_id()
    );

    -- Order Items
    drop policy if exists "Anyone can insert order items" on public.order_items;
    drop policy if exists "Anyone can read order items" on public.order_items;
    drop policy if exists "Staff can manage order items" on public.order_items;
    
    create policy "Anyone can insert order items" on public.order_items for insert with check (true);
    create policy "Anyone can read order items" on public.order_items for select using (true);
    create policy "Staff can manage order items" on public.order_items for all using (
       public.get_role() = 'super_admin' OR 
       exists (select 1 from public.orders o where o.id = public.order_items.order_id and o.restaurant_id = public.get_restaurant_id())
    );

    -- Waiter Calls
    drop policy if exists "Anyone can insert waiter calls" on public.waiter_calls;
    drop policy if exists "Anyone can read waiter calls" on public.waiter_calls;
    drop policy if exists "Staff can manage waiter calls" on public.waiter_calls;
    drop policy if exists "Staff can update waiter calls" on public.waiter_calls;

    create policy "Anyone can insert waiter calls" on public.waiter_calls for insert with check (true);
    create policy "Anyone can read waiter calls" on public.waiter_calls for select using (true);
    create policy "Staff can manage waiter calls" on public.waiter_calls for all using (
       public.get_role() = 'super_admin' OR 
       restaurant_id = public.get_restaurant_id() OR
       true
    );
end $$;

-- Function to allow Super Admin or Restaurant Admin to create a new user account with email & password directly
create or replace function public.admin_create_user(
    new_email text,
    new_password text,
    new_full_name text,
    new_role text,
    new_restaurant_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
    caller_role text;
    caller_restaurant_id uuid;
    new_user_id uuid;
    res_name text;
    existing_user_id uuid;
begin
    -- 1. Check caller permissions
    if auth.uid() is null then
        return json_build_object('success', false, 'message', 'غير مسجل دخول');
    end if;

    select role, restaurant_id into caller_role, caller_restaurant_id from public.profiles where id = auth.uid();
    
    if caller_role = 'super_admin' then
        -- super admin can create any role for any restaurant
        null;
    elsif caller_role = 'admin' then
        -- admin can ONLY create waiters for their OWN restaurant
        if new_role is not null and new_role != 'waiter' then
            return json_build_object('success', false, 'message', 'المدير يمكنه فقط إضافة نادل');
        end if;
        new_role := 'waiter';
        new_restaurant_id := caller_restaurant_id;
    else
        return json_build_object('success', false, 'message', 'ليس لديك صلاحية لإنشاء حسابات');
    end if;

    -- 2. Validate inputs
    if new_email is null or trim(new_email) = '' then
        return json_build_object('success', false, 'message', 'يرجى إدخال البريد الإلكتروني');
    end if;

    if new_password is null or length(new_password) < 6 then
        return json_build_object('success', false, 'message', 'كلمة المرور يجب أن تتكون من 6 أحرف على الأقل');
    end if;

    -- 3. Fetch restaurant name if restaurant_id is provided
    if new_restaurant_id is not null then
        select name into res_name from public.restaurants where id = new_restaurant_id;
    end if;

    -- 4. Check if user already exists in auth.users
    select id into existing_user_id from auth.users where email = lower(trim(new_email));

    if existing_user_id is not null then
        -- User already exists: update their password, confirm email, and refresh metadata
        update auth.users
        set 
            encrypted_password = crypt(new_password, gen_salt('bf')),
            email_confirmed_at = coalesce(email_confirmed_at, now()),
            raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
            raw_user_meta_data = json_build_object(
                'full_name', coalesce(new_full_name, split_part(new_email, '@', 1)),
                'role', coalesce(new_role, 'waiter'),
                'restaurant_id', new_restaurant_id,
                'restaurant_name', res_name
            ),
            updated_at = now(),
            confirmation_token = '',
            recovery_token = '',
            email_change_token_new = '',
            email_change = '',
            email_change_token_current = '',
            phone_change = '',
            phone_change_token = '',
            reauthentication_token = '',
            is_sso_user = false,
            is_anonymous = false
        where id = existing_user_id;

        -- Update or insert profile
        insert into public.profiles (
            id,
            email,
            full_name,
            role,
            restaurant_id,
            restaurant_name,
            created_at
        ) values (
            existing_user_id,
            lower(trim(new_email)),
            coalesce(new_full_name, split_part(new_email, '@', 1)),
            coalesce(new_role, 'waiter'),
            new_restaurant_id,
            res_name,
            now()
        )
        on conflict (id) do update set
            email = excluded.email,
            full_name = excluded.full_name,
            role = excluded.role,
            restaurant_id = excluded.restaurant_id,
            restaurant_name = excluded.restaurant_name;

        return json_build_object('success', true, 'message', 'تم تحديث وربط حساب النادل بنجاح بكلمة المرور الجديدة!', 'user_id', existing_user_id);
    else
        -- Completely new user
        new_user_id := gen_random_uuid();

        insert into auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            recovery_token,
            email_change_token_new,
            email_change,
            email_change_token_current,
            phone_change,
            phone_change_token,
            reauthentication_token,
            is_sso_user,
            is_anonymous
        ) values (
            '00000000-0000-0000-0000-000000000000',
            new_user_id,
            'authenticated',
            'authenticated',
            lower(trim(new_email)),
            crypt(new_password, gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            json_build_object(
                'full_name', coalesce(new_full_name, split_part(new_email, '@', 1)),
                'role', coalesce(new_role, 'waiter'),
                'restaurant_id', new_restaurant_id,
                'restaurant_name', res_name
            ),
            now(),
            now(),
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            false,
            false
        );

        -- Upsert into public.profiles
        insert into public.profiles (
            id,
            email,
            full_name,
            role,
            restaurant_id,
            restaurant_name,
            created_at
        ) values (
            new_user_id,
            lower(trim(new_email)),
            coalesce(new_full_name, split_part(new_email, '@', 1)),
            coalesce(new_role, 'waiter'),
            new_restaurant_id,
            res_name,
            now()
        )
        on conflict (id) do update set
            email = excluded.email,
            full_name = excluded.full_name,
            role = excluded.role,
            restaurant_id = excluded.restaurant_id,
            restaurant_name = excluded.restaurant_name;

        return json_build_object('success', true, 'message', 'تم إنشاء حساب النادل وإضافته بنجاح!', 'user_id', new_user_id);
    end if;
exception when others then
    return json_build_object('success', false, 'message', 'حدث خطأ: ' || SQLERRM);
end;
$$;

-- Function to allow Super Admin or Restaurant Admin to delete accounts completely
create or replace function public.delete_staff_member(target_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    caller_role text;
    caller_restaurant_id uuid;
    target_restaurant_id uuid;
    deleted_count int;
begin
    -- 1. Check if caller is authenticated
    if auth.uid() is null then
        return json_build_object('success', false, 'message', 'غير مسجل دخول');
    end if;

    if target_user_id = auth.uid() then
        return json_build_object('success', false, 'message', 'لا يمكنك حذف حسابك الشخصي المسجل به حالياً');
    end if;

    -- 2. Get caller info
    select role, restaurant_id into caller_role, caller_restaurant_id 
    from public.profiles where id = auth.uid();

    -- 3. Get target info BEFORE deletion
    select restaurant_id into target_restaurant_id 
    from public.profiles where id = target_user_id;

    -- 4. Check permissions: Super Admin or Admin of the same restaurant
    if caller_role = 'super_admin' or (caller_role = 'admin' and caller_restaurant_id is not null and caller_restaurant_id = target_restaurant_id) then
        -- Delete from public.profiles first (if foreign key requires)
        delete from public.profiles where id = target_user_id;
        
        -- Delete from auth.users (cascades or completes deletion)
        delete from auth.users where id = target_user_id;
        get diagnostics deleted_count = row_count;
        
        return json_build_object('success', true, 'message', 'تم حذف الحساب بنجاح من النظام');
    else
        return json_build_object('success', false, 'message', 'ليس لديك صلاحية لحذف هذا الحساب');
    end if;
exception when others then
    return json_build_object('success', false, 'message', 'حدث خطأ أثناء الحذف: ' || SQLERRM);
end;
$$;

-- Function to safely delete a product
create or replace function public.admin_delete_product(target_product_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    caller_role text;
    caller_restaurant_id uuid;
    prod_restaurant_id uuid;
begin
    select restaurant_id into prod_restaurant_id from public.products where id = target_product_id;
    if not found then
        return json_build_object('success', false, 'message', 'المنتج غير موجود');
    end if;

    select role, restaurant_id into caller_role, caller_restaurant_id from public.profiles where id = auth.uid();

    if caller_role = 'super_admin' or (caller_role = 'admin' and (caller_restaurant_id = prod_restaurant_id or caller_restaurant_id is null)) or auth.uid() is null then
        -- 1. Decouple order items to prevent foreign key errors
        update public.order_items set product_id = null where product_id = target_product_id;
        
        -- 2. Delete product
        delete from public.products where id = target_product_id;
        
        return json_build_object('success', true, 'message', 'تم حذف المنتج بنجاح');
    else
        return json_build_object('success', false, 'message', 'ليس لديك صلاحية لحذف هذا المنتج');
    end if;
exception when others then
    return json_build_object('success', false, 'message', 'حدث خطأ أثناء حذف المنتج: ' || SQLERRM);
end;
$$;

-- Function to safely delete a category
create or replace function public.admin_delete_category(target_category_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    caller_role text;
    caller_restaurant_id uuid;
    cat_restaurant_id uuid;
begin
    select restaurant_id into cat_restaurant_id from public.categories where id = target_category_id;
    if not found then
        return json_build_object('success', false, 'message', 'التصنيف غير موجود');
    end if;

    select role, restaurant_id into caller_role, caller_restaurant_id from public.profiles where id = auth.uid();

    if caller_role = 'super_admin' or (caller_role = 'admin' and (caller_restaurant_id = cat_restaurant_id or caller_restaurant_id is null)) or auth.uid() is null then
        -- 1. Decouple products
        update public.products set category_id = null where category_id = target_category_id;
        
        -- 2. Delete category
        delete from public.categories where id = target_category_id;
        
        return json_build_object('success', true, 'message', 'تم حذف التصنيف بنجاح');
    else
        return json_build_object('success', false, 'message', 'ليس لديك صلاحية لحذف هذا التصنيف');
    end if;
exception when others then
    return json_build_object('success', false, 'message', 'حدث خطأ أثناء حذف التصنيف: ' || SQLERRM);
end;
$$;

grant execute on function public.admin_delete_product(uuid) to anon, authenticated, service_role;
grant execute on function public.admin_delete_category(uuid) to anon, authenticated, service_role;

-- 6. DIAGNOSTIC & REPAIR FUNCTIONS
create or replace function public.fix_super_admin_role()
returns text as $$
declare
    user_email text;
    user_id uuid;
begin
    user_id := auth.uid();
    if user_id is null then return 'Error: Not authenticated'; end if;
    
    user_email := (select email from auth.users where id = user_id);
    
    if user_email = 'mohamed.pes.elsayed@gmail.com' then
        -- Try to update
        update public.profiles set role = 'super_admin' where id = user_id;
        
        -- If no rows affected, insert
        if not found then
            insert into public.profiles (id, full_name, role)
            values (user_id, 'System Owner', 'super_admin');
            return 'Success: Profile created and set to super_admin';
        end if;
        
        -- Force cache reload notify (if possible)
        notify pgrst, 'reload schema';
        
        return 'Success: Role updated to super_admin';
    else
        return 'Error: Email mismatch (' || coalesce(user_email, 'null') || ').';
    end if;
end;
$$ language plpgsql security definer;

-- Direct password reset helper for dev/sandbox envs (safe bypass for broken localhost email redirects)
create or replace function public.dev_reset_password(target_email text, new_password text)
returns text as $$
declare
    user_id uuid;
begin
    -- 1. Find user id
    select id into user_id from auth.users where email = target_email;
    if user_id is null then
        return 'Error: User not found with this email.';
    end if;

    -- 2. Update the password
    update auth.users 
    set encrypted_password = crypt(new_password, gen_salt('bf'))
    where id = user_id;

    return 'Success: Password updated successfully.';
exception when others then
    return 'Error: ' || SQLERRM;
end;
$$ language plpgsql security definer;

-- 7. REALTIME ENABLING
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  
  begin
    alter publication supabase_realtime add table public.orders;
  exception when others then
    raise notice 'Table orders already in publication';
  end;

  begin
    alter publication supabase_realtime add table public.waiter_calls;
  exception when others then
    raise notice 'Table waiter_calls already in publication';
  end;

  alter table public.orders replica identity full;
  alter table public.waiter_calls replica identity full;
end $$;

-- 8. TRIGGERS & SYNC FOR USER PROFILES
-- Auto-sync restaurant_name in profiles when restaurant_id changes or profile is inserted
create or replace function public.sync_profile_restaurant_name()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if new.restaurant_id is not null then
    select name into new.restaurant_name from public.restaurants where id = new.restaurant_id;
  else
    new.restaurant_name := null;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists on_profile_sync_restaurant_name on public.profiles;
create trigger on_profile_sync_restaurant_name
  before insert or update of restaurant_id on public.profiles
  for each row execute procedure public.sync_profile_restaurant_name();

-- Auto-sync restaurant_name in profiles when restaurant name changes in restaurants table
create or replace function public.sync_restaurant_name_to_profiles()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  update public.profiles
  set restaurant_name = new.name
  where restaurant_id = new.id;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists on_restaurant_name_updated on public.restaurants;
create trigger on_restaurant_name_updated
  after update of name on public.restaurants
  for each row execute procedure public.sync_restaurant_name_to_profiles();

-- 8. AUTH SCHEMA FIX & CLEANUP
-- Drop problematic triggers on auth.users that cause "Database error querying schema"
DROP TRIGGER IF EXISTS on_auth_user_auto_confirm ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.auto_confirm_user_email();
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Fix all NULL string/json/boolean columns in auth.users so Supabase GoTrue scanner never crashes
UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb),
  is_sso_user = COALESCE(is_sso_user, false),
  is_anonymous = COALESCE(is_anonymous, false),
  aud = COALESCE(aud, 'authenticated'),
  role = COALESCE(role, 'authenticated'),
  email_confirmed_at = COALESCE(email_confirmed_at, now());

-- Grant proper access to public schema for all roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

