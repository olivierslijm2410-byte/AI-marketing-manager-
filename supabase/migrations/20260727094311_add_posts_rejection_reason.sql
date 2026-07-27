-- posts.rejection_reason already exists in production (added manually via the
-- Supabase SQL Editor / MCP). This migration only documents that change and
-- makes it safe to (re)run on any environment, including a fresh local setup
-- where the column doesn't exist yet.
--
-- Purpose: free-text reason a post was rejected (status = 'afgewezen'), shown
-- back to the user. Nullable — only set when a post is actually rejected.

alter table public.posts
  add column if not exists rejection_reason text;
