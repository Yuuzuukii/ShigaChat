"user" (
id bigserial primary key,
name text not null unique,
password text not null,
spoken_language text not null default '日本語',
created_at timestamptz not null default now()
);

threads (
id bigserial primary key,
user_id bigint not null references "user"(id) on delete cascade,
thread_title text,
created_at timestamptz not null default now(),
last_updated timestamptz not null default now()
);

thread_qa (
id bigserial primary key,
thread_id bigint not null references threads(id) on delete cascade,
question text not null,
answer text not null,
rag_qa jsonb not null default '[]',
type text not null default 'rag',
created_at timestamptz not null default now()
);

category (
id integer primary key,
slug text not null unique,
names jsonb not null
);

qa (
id bigserial primary key,
category_id integer references category(id),
translations jsonb not null,
public boolean not null default true,
source text,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
);

qa_embedding (
id bigserial primary key,
qa_id bigint not null references qa(id) on delete cascade,
language_code text not null,
embedded_content text not null,
embedding vector(1536) not null,
updated_at timestamptz not null default now(),
unique (qa_id, language_code)
);
