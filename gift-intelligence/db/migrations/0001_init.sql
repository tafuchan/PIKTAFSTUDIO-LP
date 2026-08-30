-- Gift Intelligence Database — initial schema
-- Target: PostgreSQL 15+ / Supabase
-- 思想: 商品 = Entity / SNS投稿・Web記事 = Evidence / 推薦された事実 = Mention
-- ローカルではJSONファイルストア(gift-intelligence/data/)が同じ形を保持し、
-- scripts/export-sql.js で本schemaへ流し込める。

-- ============================================================
-- Creator Group（同一人物のマルチ媒体運用を束ねる）
-- ============================================================
create table if not exists gift_creator_groups (
  id            text primary key,
  display_name  text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- Creators（媒体ごとのアカウント）
-- ============================================================
create table if not exists gift_creators (
  id                    text primary key,
  platform              text not null,          -- tiktok / instagram / lemon8 / pinterest / youtube / threads / x / rakuten_room / web
  handle                text,
  profile_url           text,
  display_name          text,
  follower_count        integer,                -- nullable: 取得できない数字を推測しない
  gift_relevance_score  integer check (gift_relevance_score between 0 and 100),
  source_quality_score  integer check (source_quality_score between 0 and 100),
  creator_group_id      text references gift_creator_groups(id),
  watchlist             boolean not null default false,
  last_checked_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (platform, handle)
);

-- ============================================================
-- Products（Canonical Product。主役はこれ）
-- ============================================================
create table if not exists gift_products (
  id                text primary key,
  canonical_brand   text,
  canonical_name    text not null,
  normalized_brand  text,
  normalized_name   text not null,
  category          text,                       -- cosmetics / food / drink / fashion / lifestyle / baby / experience / other
  subcategory       text,
  price_min_jpy     integer,
  price_max_jpy     integer,
  official_url      text,
  purchase_url      text,
  description       text,
  status            text not null default 'active',  -- active / discontinued / unknown
  parent_product_id text references gift_products(id),
  variant_type      text,                       -- scent / color / size / volume / limited / set / series / model
  jan_code          text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_products_norm on gift_products (normalized_brand, normalized_name);

-- ============================================================
-- Product Aliases（表記揺れ）
-- ============================================================
create table if not exists gift_product_aliases (
  id               text primary key,
  product_id       text not null references gift_products(id) on delete cascade,
  alias_brand      text,
  alias_name       text not null,
  normalized_alias text not null,
  source_platform  text,
  created_at       timestamptz not null default now(),
  unique (product_id, normalized_alias)
);
create index if not exists idx_aliases_norm on gift_product_aliases (normalized_alias);

-- ============================================================
-- Crosspost Groups（同一内容の複数媒体転載を1推薦に束ねる）
-- ============================================================
create table if not exists gift_crosspost_groups (
  id            text primary key,
  detection     text not null default 'auto',   -- auto / manual
  confidence    real,
  review_status text not null default 'unreviewed',  -- unreviewed / confirmed / rejected
  notes         text,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- Posts（Evidence: SNS投稿・Web記事）
-- ============================================================
create table if not exists gift_posts (
  id                  text primary key,
  platform            text not null,
  source_url          text not null unique,
  external_post_id    text,
  creator_id          text references gift_creators(id),
  creator_group_id    text references gift_creator_groups(id),
  published_at        timestamptz,
  collected_at        timestamptz not null default now(),
  title_or_summary    text,
  content_type        text not null,            -- tiktok_video / instagram_carousel / instagram_reel / lemon8_post / pinterest_pin / youtube_video / youtube_short / threads_post / x_post / rakuten_room_item / web_article
  views               bigint,
  likes               bigint,
  comments            bigint,
  saves               bigint,
  shares              bigint,
  reposts             bigint,
  discovery_query     text,
  collection_run_id   text,
  source_status       text not null default 'alive',  -- alive / deleted / private / unknown
  verification        text not null default 'unverified', -- browser_verified / search_sourced / unverified
  content_fingerprint text,
  crosspost_group_id  text references gift_crosspost_groups(id),
  raw_metadata        jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists idx_posts_platform on gift_posts (platform);
create index if not exists idx_posts_fingerprint on gift_posts (content_fingerprint);

-- ============================================================
-- Mentions（最重要: この情報源でこの商品がこう紹介された）
-- ============================================================
create table if not exists gift_mentions (
  id                    text primary key,
  post_id               text not null references gift_posts(id) on delete cascade,
  product_id            text not null references gift_products(id),
  rank_in_post          integer,
  observed_price_jpy    integer,                -- 投稿内に明記があった場合のみ
  recipient_tags        text[] not null default '{}',
  occasion_tags         text[] not null default '{}',
  age_tags              text[] not null default '{}',
  relationship_tags     text[] not null default '{}',
  style_tags            text[] not null default '{}',
  budget_tags           text[] not null default '{}',
  recommendation_reason text,
  context_summary       text,                   -- AIによる独自要約（転載しない）
  sentiment             text not null default 'positive',  -- positive / neutral / negative
  extraction_confidence real not null default 0.5,
  created_at            timestamptz not null default now(),
  unique (post_id, product_id)
);
create index if not exists idx_mentions_product on gift_mentions (product_id);

-- ============================================================
-- Collection Runs（調査履歴）
-- ============================================================
create table if not exists gift_collection_runs (
  id               text primary key,
  started_at       timestamptz not null,
  finished_at      timestamptz,
  collection_mode  text not null default 'discovery',  -- discovery / watchlist
  query            text,
  platform         text,
  status           text not null default 'done',       -- done / partial / blocked
  posts_checked    integer not null default 0,
  posts_added      integer not null default 0,
  mentions_added   integer not null default 0,
  products_added   integer not null default 0,
  products_merged  integer not null default 0,
  creators_added   integer not null default 0,
  notes            text
);

-- ============================================================
-- Gift Scores（context_key別スコア）
-- ============================================================
create table if not exists gift_scores (
  product_id                 text not null references gift_products(id) on delete cascade,
  context_key                text not null,     -- 例: "女友達|誕生日|3000-5000"、全体は "all|all|all"
  evidence_count             integer not null default 0,
  unique_creator_count       integer not null default 0,
  unique_creator_group_count integer not null default 0,
  platform_count             integer not null default 0,
  crosspost_adjusted_count   integer not null default 0,
  recency_score              real not null default 0,
  creator_diversity_score    real not null default 0,
  platform_diversity_score   real not null default 0,
  engagement_score           real not null default 0,
  context_consistency_score  real not null default 0,
  availability_score         real not null default 0,
  trend_score                real not null default 0,
  mentions_30d               integer not null default 0,
  mentions_90d               integer not null default 0,
  mentions_prev_90d          integer not null default 0,
  gift_score                 real not null default 0,
  calculated_at              timestamptz not null default now(),
  primary key (product_id, context_key)
);

-- ============================================================
-- Article Candidates
-- ============================================================
create table if not exists gift_article_candidates (
  id                    text primary key,
  context_key           text not null,
  suggested_title       text not null,
  article_angle         text,
  target_reader         text,
  occasion              text,
  recipient             text,
  budget_min            integer,
  budget_max            integer,
  candidate_product_ids text[] not null default '{}',
  evidence_count        integer not null default 0,
  unique_creator_count  integer not null default 0,
  platform_count        integer not null default 0,
  article_score         real not null default 0,
  reason                text,
  status                text not null default 'proposed',  -- proposed / approved / drafted / published / rejected
  generated_at          timestamptz not null default now()
);

-- ============================================================
-- Merge Candidates（誤統合防止の人間レビューキュー）
-- ============================================================
create table if not exists gift_merge_candidates (
  id            text primary key,
  kind          text not null,                  -- product / creator / crosspost
  left_id       text not null,
  right_id      text not null,
  similarity    real,
  ai_verdict    text,                           -- SAME_PRODUCT / VARIANT_OF_PRODUCT / DIFFERENT_PRODUCT / UNKNOWN
  reason        text,
  status        text not null default 'pending',  -- pending / merged / rejected
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
