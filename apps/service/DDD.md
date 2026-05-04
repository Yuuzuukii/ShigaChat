# Backend Architecture

`apps/service` は FastAPI のメイン API です。

DB スキーマは既存のまま使い、コード側だけを layered architecture に分けています。

## 全体方針

この backend では、DB テーブル単位ではなく、サービスが扱う概念でコードを分けています。

現在の主な概念は以下です。

- `identity`: ユーザー、認証、使用言語
- `conversation`: スレッド、チャット履歴、RAG 参照
- `knowledge`: カテゴリ、Q&A、翻訳
- `retrieval`: embedding 検索、参照 Q&A

Domain は FastAPI、JWT、SQL、OpenAI SDK を直接扱いません。

## レイヤー

```text
controllers/
  HTTP request / response

usecases/
  アプリケーションの処理手順

domain/
  モデル、値オブジェクト、repository interface、業務エラー

repositories/
  PostgreSQL repository 実装

infrastructure/
  DB 接続、JWT、password hash、agent client、OpenAI client
```

依存方向は基本的に以下です。

```text
controllers -> usecases -> domain
                         -> repositories
                         -> infrastructure
```

`domain` は外側の層に依存しません。

## Controller

場所:

```text
controllers/
├── identity/user_controller.py
├── conversation/chat_controller.py
├── knowledge/category_controller.py
└── retrieval/retrieval_controller.py
```

Controller は FastAPI の境界です。

担当:

- request body / query parameter を受け取る
- `Depends` で認証済み `Actor` や repository を受け取る
- UseCase を呼び出す
- Domain error を HTTP error に変換する
- StreamingResponse など HTTP 固有の返却を行う

Controller には SQL や OpenAI 呼び出しを書きません。

## UseCase

場所:

```text
usecases/
├── identity/
├── conversation/
├── knowledge/
└── retrieval/
```

UseCase はアプリケーションの処理手順を表します。

例:

- `RegisterUserUseCase`
- `LoginUserUseCase`
- `AskQuestionUseCase`
- `StreamAnswerUseCase`
- `GetCategoryQAUseCase`
- `RetrieveReferencesUseCase`

`StreamAnswerUseCase` では、現在以下の流れを担当しています。

1. thread が存在すれば所有者確認
2. thread がなければ作成
3. 直近の会話履歴を取得
4. agent に SSE 回答生成を依頼
5. token を controller に流す
6. 最終回答と RAG 参照を `thread_qa` に保存
7. `threads` の更新日時と初回タイトルを更新

## Domain

場所:

```text
domain/
├── identity/
├── conversation/
├── knowledge/
├── retrieval/
└── shared/
```

Domain は業務上の概念を表します。

### identity

主なモデル:

- `User`

主な repository interface:

- `UserRepository`

現在の DB では `"user"` テーブルを使っていますが、Domain では `User` として扱います。

### conversation

主なモデル:

- `Thread`
- `ChatTurn`
- `ChatReference`

主な repository interface:

- `ThreadRepository`
- `ChatTurnRepository`

`Thread.assert_owner(actor)` により、スレッド操作の所有者チェックを Domain 側に置いています。

現在の DB では以下に対応します。

```text
Thread   -> threads
ChatTurn -> thread_qa
refs     -> thread_qa.rag_qa
```

### knowledge

主なモデル:

- `Category`
- `QA`
- `QATranslation`

主な repository interface:

- `CategoryRepository`
- `QARepository`

既存 DB では `question`, `answer`, `qa`, `question_translation`, `answer_translation`, `category`, `category_translation` に分かれています。

Domain ではそれらを `QA` と `Category` として扱います。

### retrieval

主なモデル:

- `RetrievedReference`

主な repository interface:

- `EmbeddingRepository`

`RetrieveReferencesUseCase` は OpenAI embedding を作成し、`EmbeddingRepository` で pgvector 検索を行います。

### shared

複数ドメインで使う共通要素です。

- `Actor`
- `LanguageCode`
- `DomainError`
- `NotFoundError`
- `PermissionDeniedError`
- `ValidationError`
- `ConflictError`

`Actor` は認証済みユーザーを UseCase / Domain に渡すための値です。JWT 自体は Domain に渡しません。

## Repository

場所:

```text
repositories/
├── identity/user_repository.py
├── conversation/thread_repository.py
├── conversation/chat_turn_repository.py
├── knowledge/category_repository.py
├── knowledge/qa_repository.py
└── retrieval/embedding_repository.py
```

Repository は既存 PostgreSQL スキーマへの具体的なアクセスを担当します。

例:

- `PostgresUserRepository`
- `PostgresThreadRepository`
- `PostgresChatTurnRepository`
- `PostgresCategoryRepository`
- `PostgresQARepository`
- `PostgresEmbeddingRepository`

既存 DB のテーブル名や join の複雑さは Repository に閉じ込めます。

## Infrastructure

場所:

```text
infrastructure/
├── db/connection.py
├── auth/jwt_service.py
├── auth/password_hasher.py
├── agent/agent_client.py
└── llm/
    ├── embedding_client.py
    └── title_generator.py
```

Infrastructure は外部技術との接続です。

- `connection.py`: psycopg 接続
- `JwtService`: JWT 作成 / 検証
- `PasswordHasher`: bcrypt hash / verify
- `AgentClient`: `apps/agent` への HTTP / SSE client
- `OpenAIEmbeddingClient`: OpenAI Embeddings API
- `ThreadTitleGenerator`: 初回質問から簡易タイトル生成

## Dependency Injection

FastAPI の依存注入は `controllers/dependencies.py` にまとめています。

ここで repository、JWT、password hasher、agent client などを生成します。

また、JWT token から current user を取得し、`Actor` に変換します。

```text
JWT token
  -> JwtService.verify
  -> UserRepository.find_by_id
  -> Actor
```

## 現在の API 境界

`main.py` では以下の controller を登録しています。

```python
app.include_router(user_controller.router, prefix="/user")
app.include_router(chat_controller.router, prefix="/question")
app.include_router(category_controller.router, prefix="/category")
app.include_router(retrieval_controller.router, prefix="/retrieval")
```

## 注意点

- DB スキーマはまだ既存のままです。
- Repository が既存テーブル構造との差分を吸収しています。
- Domain に JWT、HTTPException、SQL、OpenAI SDK を入れない方針です。
- QA 編集機能を追加する場合は、`knowledge` の UseCase と Repository を拡張し、必要に応じて `retrieval` の embedding 再生成を呼び出します。
