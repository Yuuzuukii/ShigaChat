# バックエンドDDD/レイヤード化 計画書

## 目的

現行DBは変更せず、バックエンドの構造だけを段階的に整理する。

現在のバックエンドは、FastAPI router の中に以下の責務が混在している。

- HTTPリクエスト/レスポンス処理
- 認証ユーザー取得
- SQL実行
- 業務ルール
- Agent/LLM呼び出し
- スレッド履歴整形
- RAG参照整形

この状態を、以下の層に分ける。

- Controller
- UseCase
- Domain
- Repository
- Infrastructure

DBスキーマは当面そのまま使う。既存DBの複雑さは Repository 実装に閉じ込める。

## 今回やらないこと

- DBテーブルの変更
- データ移行
- APIレスポンス形式の大幅変更
- フロントエンドの全面変更
- 通知/履歴などの機能削除
- RLS導入

DBを作り直す場合は、バックエンドの層分離が完了してから別計画として行う。

## 基本方針

ドメイン層はDBテーブル単位ではなく、サービスが扱う概念で分ける。

現行DBとの対応は Repository で吸収する。

例:

```text
Domain: Conversation.Thread
  -> DB: threads

Domain: Conversation.ChatTurn
  -> DB: thread_qa

Domain: Knowledge.QA
  -> DB: qa + question + answer + question_translation + answer_translation

Domain: Retrieval.Reference
  -> DB: qa_embedding + question_translation + answer_translation
```

Controller から Repository を直接呼ばない。必ず UseCase を経由する。

Domain は FastAPI、HTTPException、JWT、psycopg、SQL、OpenAI SDK を知らない。

## 層の責務

### Controller

HTTP境界を担当する。

責務:

- FastAPI router
- request DTO / response DTO
- Depends による認証ユーザー取得
- HTTPステータスコード変換
- UseCase呼び出し

置かないもの:

- SQL
- DBトランザクションの詳細
- Agent/LLM呼び出しの詳細
- 業務ルール

### UseCase

アプリケーションの手順を担当する。

責務:

- 複数Repositoryの調整
- Transaction境界
- Domain model の呼び出し
- Agent/Embedding/TitleGenerator など外部サービス抽象の利用
- Controller向け出力DTOの組み立て

例:

```text
AskQuestionUseCase
1. thread_id があれば所有者確認
2. なければ新規スレッド作成
3. 直近会話履歴を取得
4. Agent に回答生成を依頼
5. RAG参照を整形
6. thread_qa に保存
7. threads.last_updated / thread_title を更新
8. 結果を返す
```

### Domain

業務概念とルールを担当する。

責務:

- Entity
- Value Object
- Domain Service
- Repository interface
- 業務エラー

置かないもの:

- JWT
- SQL
- HTTPException
- psycopg
- OpenAI SDK
- 環境変数

### Repository

Domain/UseCase が必要とする永続化操作の抽象。

Repository interface は Domain または UseCase 側に置く。
PostgreSQL向けの具体実装は Infrastructure 側に置く。

### Infrastructure

外部技術との接続を担当する。

責務:

- PostgreSQL接続
- psycopg実装
- SQL
- 既存DBからDomain modelへの変換
- Agent HTTP client
- OpenAI embedding client
- password hash実装
- JWT実装
- 環境変数読み込み

## ドメイン構成

### Identity

ユーザーと利用言語を扱う。

主なモデル:

- User
- UserId
- UserName
- PasswordHash
- SpokenLanguage
- Actor

主なルール:

- ユーザー名は一意
- ユーザーは既定の利用言語を持つ
- 認証済みユーザーは Actor としてUseCaseへ渡す
- Domain は JWT を扱わない

Repository:

- UserRepository

主な操作:

- find_by_id
- find_by_name
- create
- update_language
- delete

### Conversation

チャットスレッドと会話ターンを扱う。

主なモデル:

- Thread
- ThreadId
- ThreadTitle
- ChatTurn
- ChatReference
- ChatTurnType

主なルール:

- Thread は必ず User に属する
- User は自分の Thread だけ操作できる
- ChatTurn は thread_id、user_message、assistant_message、refs を持つ
- refs はRAG参照として保存される
- Thread は会話追加時に last_updated を更新する

Repository:

- ThreadRepository
- ChatTurnRepository

主な操作:

- create_thread
- find_thread_by_id
- list_threads_by_user
- update_thread_title
- touch_thread
- delete_thread
- append_chat_turn
- list_chat_turns
- list_recent_chat_turns

### Knowledge

カテゴリ付きQ&Aナレッジを扱う。

現行DBでは `question`, `answer`, `qa`, `question_translation`, `answer_translation`, `category`, `category_translation` に分かれているが、Domain では1つの `QA` として扱う。

主なモデル:

- QA
- QAId
- QATranslation
- Category
- CategoryId
- PublicationStatus

主なルール:

- QA はカテゴリに属する
- QA は言語ごとの question/answer/title を持つ
- public=false のQAは通常ユーザー向け一覧に出さない
- QA編集機能を追加する場合、本文更新後に embedding 再生成が必要

Repository:

- QARepository
- CategoryRepository

主な操作:

- find_qa_by_id
- list_qa_by_category
- list_categories
- find_category_by_id
- update_qa_translation
- update_public_status

### Retrieval

RAG検索と参照情報を扱う。

主なモデル:

- RetrievalQuery
- RetrievedReference
- RetrievalResult
- EmbeddingContent

主なルール:

- 検索言語を明示する
- public なQAのみ通常検索対象にする
- 参照結果は回答生成用とフロント表示用に整形できる

Repository / Gateway:

- EmbeddingRepository
- EmbeddingClient

主な操作:

- search_similar_qa
- upsert_embedding
- delete_embedding_by_qa

### Shared

複数ドメインで使う共通値オブジェクト。

主なモデル:

- LanguageCode
- DomainError
- PermissionDenied
- NotFound
- ValidationError

## 推奨ディレクトリ構成

```text
app/
  domain/
    identity/
      models.py
      repositories.py
      errors.py
    conversation/
      models.py
      repositories.py
      services.py
      errors.py
    knowledge/
      models.py
      repositories.py
      services.py
      errors.py
    retrieval/
      models.py
      repositories.py
      services.py
    shared/
      language.py
      errors.py

  usecases/
    identity/
      register_user.py
      login_user.py
      get_current_user.py
      change_language.py
    conversation/
      ask_question.py
      stream_answer.py
      list_threads.py
      get_thread_messages.py
      delete_thread.py
    knowledge/
      list_categories.py
      get_category_qa.py
      get_qa.py
      edit_qa.py
    retrieval/
      retrieve_references.py

  infrastructure/
    db/
      connection.py
      transaction.py
      repositories/
        user_repository.py
        thread_repository.py
        chat_turn_repository.py
        category_repository.py
        qa_repository.py
        embedding_repository.py
    auth/
      jwt_service.py
      password_hasher.py
    agent/
      agent_client.py
    llm/
      embedding_client.py
      title_generator.py

  controllers/
    user_controller.py
    chat_controller.py
    category_controller.py
    qa_controller.py
    notification_controller.py
    history_controller.py
```

既存の `app/api/routers/*` は段階的に `controllers/*` へ移す。
一度に全部移さず、機能単位で差し替える。

## 現行APIから新構成への対応

### User系

現行:

```text
POST /user/register
POST /user/token
GET  /user/current_user
POST /user/change_language
DELETE /user/user_delete
```

新構成:

```text
Controller: user_controller.py
UseCase:
- RegisterUserUseCase
- LoginUserUseCase
- GetCurrentUserUseCase
- ChangeLanguageUseCase
- DeleteUserUseCase
Domain: Identity
Repository: UserRepository
```

### Chat/Thread系

現行:

```text
POST /question/get_answer
POST /question/get_answer_stream
POST /question/create_thread
GET  /question/get_user_threads
GET  /question/get_thread_messages/{thread_id}
DELETE /question/delete_thread/{thread_id}
```

新構成:

```text
Controller: chat_controller.py
UseCase:
- AskQuestionUseCase
- StreamAnswerUseCase
- CreateThreadUseCase
- ListThreadsUseCase
- GetThreadMessagesUseCase
- DeleteThreadUseCase
Domain: Conversation
Repository:
- ThreadRepository
- ChatTurnRepository
Infrastructure:
- AgentClient
- ThreadTitleGenerator
```

### Category/QA系

現行:

```text
GET /category/category_translation/{category_id}
GET /category/category/{category_id}
GET /category/get_category_by_question
GET /question/get_qa
GET /question/get_qa_list
GET /keyword/search_with_language
```

新構成:

```text
Controller:
- category_controller.py
- qa_controller.py
UseCase:
- ListCategoriesUseCase
- GetCategoryQAUseCase
- GetQAUseCase
- SearchKeywordUseCase
Domain:
- Knowledge
- Retrieval
Repository:
- CategoryRepository
- QARepository
- EmbeddingRepository
```

### Notification/History系

当面は既存routerを維持する。

理由:

- 新DB案では削除候補
- 現在の主要機能ではない
- 先にChat/Knowledgeを整理した方が効果が大きい

ただし、残す判断をした場合は後で以下に分ける。

```text
Notification domain
ActivityHistory domain
```

## Repositoryで吸収する既存DBの複雑さ

### QARepository

Domainでは `QA` として扱う。

既存DBでは以下をJOINして組み立てる。

```text
qa
question
answer
question_translation
answer_translation
category
```

Repositoryの責務:

- `qa.id` を `QA.id` に変換
- `question.question_id` / `answer.id` を内部参照として保持する場合はRepository内に閉じる
- `question_translation` と `answer_translation` を `QATranslation` にまとめる
- `question.public` を `QA.public` として扱う
- `question.category_id` を `QA.category_id` として扱う

### ChatTurnRepository

Domainでは `ChatTurn` として扱う。

既存DBでは `thread_qa` を使う。

Repositoryの責務:

- `question` カラムを `user_message` として扱う
- `answer` カラムを `assistant_message` として扱う
- `rag_qa` JSON文字列を `ChatReference` list に変換する
- `type` を `ChatTurnType` に変換する

### EmbeddingRepository

Domainでは `RetrievedReference` を返す。

既存DBでは以下を使う。

```text
qa_embedding
question
question_translation
answer_translation
```

Repositoryの責務:

- pgvector検索SQLを隠す
- 言語IDと言語コードの変換を隠す
- 検索結果を `RetrievedReference` に変換する

## 認証と権限

JWTはDomainに渡さない。

ControllerまたはAuth InfrastructureでJWTを検証し、UseCaseには `Actor` を渡す。

```text
JWT
  -> JwtService.verify()
  -> Actor(user_id, role, language)
  -> UseCase
  -> Domain method
```

Domainで扱うのは以下のみ。

```text
- UserId
- Role
- Actor
- LanguageCode
```

例:

```text
Thread.assert_owner(actor)
QA.assert_editable_by(actor)
```

## トランザクション方針

UseCase単位でトランザクションを張る。

例:

```text
AskQuestionUseCase
- thread作成
- chat_turn保存
- thread更新
```

これらは同じトランザクションで扱う。

Agent/LLM呼び出しはDBトランザクション外で実行する。
外部API待ちの間にDBトランザクションを開き続けない。

推奨フロー:

```text
1. DB transaction: thread確認/作成、履歴取得
2. transaction close
3. Agent/LLM呼び出し
4. DB transaction: chat_turn保存、thread更新
```

## 段階的移行計画

### Phase 1: 土台作成

目的:

- 新しいディレクトリ構成を追加する
- 既存挙動は変えない

作業:

- `domain/shared` を作る
- `domain/identity`, `domain/conversation`, `domain/knowledge`, `domain/retrieval` を作る
- Repository interface を定義する
- Infrastructure のDB接続ラッパーを作る
- DomainError -> HTTPException 変換を作る

完了条件:

- 既存テスト/起動に影響がない
- 新旧コードが共存できる

### Phase 2: Identity移行

目的:

- User系routerをUseCase経由にする

対象:

- register
- login
- current_user
- change_language

作業:

- User model
- UserRepository interface
- PostgresUserRepository
- PasswordHasher
- JwtService
- User系UseCase
- user_controller

完了条件:

- ログイン/登録/言語変更が既存通り動く
- JWT処理がDomainから分離されている

### Phase 3: Conversation読み取り系移行

目的:

- スレッド一覧とメッセージ取得を整理する

対象:

- get_user_threads
- get_thread_messages
- delete_thread

作業:

- Thread model
- ChatTurn model
- ThreadRepository
- ChatTurnRepository
- ListThreadsUseCase
- GetThreadMessagesUseCase
- DeleteThreadUseCase

完了条件:

- サイドバーのスレッド一覧が動く
- スレッドを開くと会話履歴が表示される
- 他ユーザーのスレッドにアクセスできない

### Phase 4: Conversation書き込み系移行

目的:

- 質問送信と回答保存をUseCase化する

対象:

- get_answer
- get_answer_stream
- create_thread

作業:

- AskQuestionUseCase
- StreamAnswerUseCase
- CreateThreadUseCase
- AgentClient interface
- HTTP AgentClient実装
- ThreadTitleGenerator interface
- LLM ThreadTitleGenerator実装

完了条件:

- 通常回答が保存される
- streaming回答が保存される
- 初回スレッドタイトルが生成される
- RAG参照が `thread_qa.rag_qa` に保存される

### Phase 5: Knowledge移行

目的:

- カテゴリ別QA表示をDomain化する

対象:

- category_translation
- category/{category_id}
- get_category_by_question
- get_qa
- get_qa_list

作業:

- QA model
- QATranslation model
- Category model
- QARepository
- CategoryRepository
- GetCategoryQAUseCase
- GetQAUseCase
- ListCategoriesUseCase

完了条件:

- カテゴリ一覧/詳細が動く
- ユーザー言語に応じてQAが表示される
- public=false の扱いが明確になっている

### Phase 6: Retrieval移行

目的:

- RAG検索をRepository/Gatewayに閉じ込める

対象:

- apps/agent/lib/rag.py
- keyword search

作業:

- Retrieval model
- EmbeddingRepository
- RetrieveReferencesUseCase
- 既存 `qa_embedding` 検索SQLの移動
- language code / language id 変換の整理

完了条件:

- AgentのRAG検索が新Repository経由で動く
- pgvector SQL がUseCase/Controllerから見えない

### Phase 7: 旧router整理

目的:

- 移行済みrouterから重複コードを削除する

作業:

- `app/api/routers/question.py` の責務分割
- `app/api/services/thread_history.py` のUseCase統合
- `app/api/services/agent_client.py` のInfrastructure移動
- 古いマイグレーションヘルパ削除
- 使われていないAPIの棚卸し

完了条件:

- Controllerが薄い
- SQLがRepositoryにしかない
- Domainが外部ライブラリに依存していない

## テスト方針

### Domain test

DBなしで実行する。

対象:

- Thread ownership
- ChatTurn refs parse/validation
- QA translation取得
- LanguageCode正規化
- 権限エラー

### UseCase test

Repository fake を使う。

対象:

- AskQuestionUseCase
- ListThreadsUseCase
- GetCategoryQAUseCase
- ChangeLanguageUseCase

外部Agent/LLMはFakeに差し替える。

### Repository integration test

PostgreSQLを使う。

対象:

- 既存DB構造からDomain modelへ正しく変換できるか
- QA JOIN
- thread_qa JSON parse
- pgvector検索

### API test

Controllerの薄いテスト。

対象:

- 認証あり/なし
- 404/403/400変換
- レスポンス形式の互換性

## リスクと対策

### リスク: 一度に全面移行して壊す

対策:

- 機能単位で移行する
- 旧routerを残して新routerに差し替える
- APIレスポンス互換を維持する

### リスク: Repositoryが複雑になる

対策:

- 既存DB変換はRepositoryに閉じ込める
- Repository integration test を厚めに書く
- 将来DB移行時にRepositoryだけ差し替える

### リスク: DomainがDTO/DB dictに汚染される

対策:

- Domain model は dataclass / value object で定義する
- dict変換はControllerまたはRepository mapperに限定する

### リスク: Agent/LLM待ち中にDB transactionを保持する

対策:

- 外部API呼び出し前にtransactionを閉じる
- 保存時に再度transactionを開く

## 完了条件

以下を満たしたら、バックエンドDDD化の第一段階は完了とする。

- ControllerにSQLがない
- ControllerからRepositoryを直接呼んでいない
- UseCaseがアプリケーション手順を表している
- DomainがFastAPI/JWT/psycopg/OpenAI SDKに依存していない
- 既存DBへの依存がInfrastructure Repositoryに閉じている
- 主要機能が既存通り動く
  - 登録/ログイン
  - 言語変更
  - チャット送信
  - ストリーミング回答
  - スレッド一覧
  - スレッド履歴
  - カテゴリ別QA表示
  - RAG検索

## 次の計画

バックエンドの層分離が完了した後、DB再設計を行う。

その時はRepositoryの実装だけを新DB向けに差し替え、Domain/UseCase/Controllerへの影響を最小化する。
