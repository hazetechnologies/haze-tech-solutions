-- Add category + author to blog_posts (idempotent).
alter table blog_posts add column if not exists category text;
alter table blog_posts add column if not exists author   text default 'Haze Tech Solutions';
