# フロントエンド ディレクトリ構成リファクタ計画

## 目的

フロントエンドを、画面単位で追いやすい構成に整理します。

今回の方針では、`pages/` は React Router から直接参照される「ページ entry」と「そのページの API」だけを置きます。画面内で使うコンポーネント、状態管理、SSE、エラー処理、localStorage helper などは `features/` 配下に置きます。

`features/` には API client を置きません。`features/` は画面や画面部品の実装置き場として扱います。

## 目標構成

```txt
src/
  App.js
  index.js

  config/
    constants.js
    i18n.js
    categories.js

  contexts/
    UserContext.js

  api/
    apiClient.js
    apiErrors.js

  pages/
    home/
      HomePage.js
      api.js

    login/
      LoginPage.js
      api.js

    register/
      RegisterPage.js
      api.js

    category/
      api.js
      list/
        CategoryListPage.js
      detail/
        CategoryDetailPage.js
        CategoryDetailPage.test.jsx

    keyword-search/
      KeywordSearchPage.js
      api.js

    maintenance/
      MaintenancePage.js

    not-found/
      NotFoundPage.js

  features/
    layout/
      AppLayout.js
      AuthLayout.js
      Header.js
      Sidebar.js
      Toaster.jsx

    home/
      components/
        ActionBar.js
        ChatInput.js
        ChatMessages.js
        MessageBubble.js
      state/
        useThreads.js
      errors.js
      sse.js
      storage.js

    category/
      components/
      errors.js

    keyword-search/
      components/
      errors.js

    common/
      classNames.js
      toast.js
      language.js
```

## 配置ルール

- `pages/` にはページ entry とページ API だけを置く。
- `features/` には画面コンポーネント、画面状態、画面 helper を置く。
- Header、Sidebar、AppLayout、AuthLayout は画面を構成する部品なので `features/layout/` に置く。
- `features/` の中に API client や API endpoint は置かない。
- API endpoint は `pages/<page>/api.js` に置く。
- 共通 API client は `src/api/apiClient.js` に置く。
- response error の共通処理は `src/api/apiErrors.js` に置く。
- `UserContext` は画面 feature ではなくアプリ横断の状態なので `src/contexts/UserContext.js` に置く。
- `hooks/` フォルダは作らない。
- React custom hook が必要な場合は、役割が分かる feature 内に置く。例: `pages/home/state/useThreads.js`
- 共通 UI コンポーネントディレクトリは作らない。
- `shared/` ディレクトリは作らない。
- `src/App.js` と `src/index.js` は `src/` 直下に残す。
- `src/config/` は `src/` 直下に残す。
- React Router のルート定義は `App.js` 側に残す。
- ファイルシステムルーティングは導入しない。
- 初回は移動と import 修正を中心にし、挙動変更を混ぜない。

## context の置き場所

`UserContext` は `features/` には置きません。

理由:

- 認証状態は home、category、login など複数画面をまたぐ。
- Header や Sidebar だけの状態でもない。
- API client に渡す `onUnauthorized` やログアウト処理にも関係する。
- 画面 feature の一部ではなく、アプリ全体の runtime state に近い。

そのため、置き場所は以下にします。

```txt
src/contexts/UserContext.js
```

`UserContext` に集約するもの:

- `user`
- `token`
- `isLoading`
- `language`
- `t`
- `setUser`
- `setToken`
- `logout`
- `fetchUser`
- `redirectToLogin`

`useAuth` は作りません。必要な場所で `UserContext` を直接読みます。

`useLanguage` も作りません。`language` と `t` は `UserContext` 内で `user.spokenLanguage` から計算し、Provider value に含めます。

## API の置き場所

API は `features/` に置きません。

画面ごとの endpoint は `pages/<page>/api.js` に置きます。

```txt
pages/home/api.js
pages/login/api.js
pages/register/api.js
pages/category/api.js
pages/keyword-search/api.js
```

共通 fetch client は画面ではないため、`src/api/` に置きます。

```txt
src/api/apiClient.js
src/api/apiErrors.js
```

`apiClient.js` の責務:

- Base URL の解決
- 認証ヘッダーの付与
- 401 の共通処理
- token/user の削除
- `reset401Flag`

`apiErrors.js` に置く候補:

- `normalizeErrorDetail`
- `readResponseErrorMessage`
- HTTP エラー用の共通 helper

各 `pages/<page>/api.js` は `apiClient.js` を使います。

```js
import { apiFetch } from "../../api/apiClient";
```

`onUnauthorized` は `UserContext` から取得して、画面または状態管理から API 呼び出しへ渡します。

## hooks の扱い

`hooks/` フォルダは作りません。

React custom hook が必要な場合でも、ファイルは役割が分かる場所に置きます。関数名は React のルールに従って `useXxx` にします。

現時点で残す custom hook は home 画面のスレッド状態管理だけです。

```txt
pages/home/state/useThreads.js
```

理由:

- `useThreads` は home/chat 画面専用で、React state/effect が多いため切り出す価値がある。
- `useAuth` は作らず、`UserContext` を直接読む。
- `useLanguage` は作らず、`UserContext` が `language` と `t` を返す。

## UI コンポーネントの扱い

共通 UI コンポーネント置き場は作りません。

既存の `components/ui` や `components/common` の中身は、使っている画面に寄せます。

例:

```txt
LoginPage/RegisterPage で使う Button/Input/Label/Card/Select/Flag
  -> features/auth または pages/login/register 側で必要になった時点で作る

CategoryDetailPage で使う Tabs/RichText/Flag
  -> features/category/components/

KeywordSearchPage で使う RichText
  -> features/keyword-search/components/

HomePage で使う Card/Button/Input など
  -> features/home/components/

Toaster
  -> features/layout/Toaster.jsx
```

複数 feature で同じ UI 部品が必要になった場合も、最初から共通化しません。重複が実際に痛くなった時点で、あらためて置き場所を決めます。

## Phase 1: context と service を整理する

1. `UserContext` に認証と言語の derived value を集約する。

```txt
src/contexts/UserContext.js
```

2. `useAuth` を削除し、`AppLayout` など必要な場所で `UserContext` を直接読む。
3. `useLanguage` を削除し、`language` と `t` は `UserContext` から取得する。
4. 現在の `src/services/api.js` を `src/api/` に分割する。

```txt
src/services/api.js -> src/api/apiClient.js
src/services/api.js -> src/api/apiErrors.js
```

5. endpoint 関数は後続 Phase で `pages/<page>/api.js` に移す。

## Phase 2: layout を features に移動する

layout 系コンポーネントを `features/layout` へ移動します。

```txt
src/components/layout/AppLayout.js  -> src/features/layout/AppLayout.js
src/components/layout/AuthLayout.js -> src/features/layout/AuthLayout.js
src/components/layout/Header.js     -> src/features/layout/Header.js
src/components/layout/Sidebar.js    -> src/features/layout/Sidebar.js
src/components/ui/toaster.jsx       -> src/features/layout/Toaster.jsx
```

`Header` と `Sidebar` は画面を構成する UI なので `features/layout` に置きます。

## Phase 3: home 画面を分割する

最初に `home` を整理します。現在もっとも複雑で、分割効果が大きいためです。

ファイル移動:

```txt
src/pages/HomePage.js                -> src/pages/home/HomePage.js
src/components/chat/ActionBar.js     -> src/features/home/components/ActionBar.js
src/components/chat/ChatInput.js     -> src/features/home/components/ChatInput.js
src/components/chat/ChatMessages.js  -> src/features/home/components/ChatMessages.js
src/components/chat/MessageBubble.js -> src/features/home/components/MessageBubble.js
src/hooks/useThreads.js              -> src/pages/home/state/useThreads.js
```

home 画面で使う UI 部品も `features/home/components/` に置きます。

`HomePage.js` から切り出す処理:

```txt
features/home/errors.js
  normalizeRequestError
  normalizeActionError
  エラー分類用の正規表現

features/home/sse.js
  parseSseEvent
  SSE event helper

features/home/storage.js
  chat message 用 localStorage key
  save/load helper

pages/home/api.js
  fetchUserThreads
  fetchThreadMessages
  deleteThread
  postGetAnswerStream
  postAction
```

完了後の状態:

- `pages/home/HomePage.js` は route entry と画面 orchestration を担当する。
- チャット固有コンポーネントは `features/home/components/` に閉じる。
- チャット固有 state は `pages/home/state/` に閉じる。
- チャット固有エラーは `features/home/errors.js` に閉じる。
- SSE パースは `features/home/sse.js` に閉じる。
- スレッド/メッセージ保存処理は `features/home/storage.js` に閉じる。
- home の endpoint は `pages/home/api.js` に閉じる。

## Phase 4: その他の画面を移動する

ページ entry を `pages/<page>/` に移動します。

```txt
src/pages/LoginPage.js          -> src/pages/login/LoginPage.js
src/pages/RegisterPage.js       -> src/pages/register/RegisterPage.js
src/pages/CategoryListPage.js   -> src/pages/category/list/CategoryListPage.js
src/pages/CategoryDetailPage.js -> src/pages/category/detail/CategoryDetailPage.js
src/pages/KeywordSearchPage.js  -> src/pages/keyword-search/KeywordSearchPage.js
src/pages/MaintenancePage.js    -> src/pages/maintenance/MaintenancePage.js
src/pages/NotFoundPage.js       -> src/pages/not-found/NotFoundPage.js
```

各画面の API endpoint を `pages/<page>/api.js` に移します。

画面固有 helper やコンポーネントが出てきたら `features/<page>/` に置きます。

```txt
features/category/
features/keyword-search/
```

`features/auth/` は今すぐ作りません。ログイン/登録で共通化したい UI や状態が出てから作ります。

テストは対象ページの近くに置きます。

```txt
src/pages/CategoryDetailPage.test.jsx -> src/pages/category/detail/CategoryDetailPage.test.jsx
src/pages/LanguageControls.test.jsx   -> 適切なページ配下へ移動し、名前を見直す
```

## Phase 5: 旧ディレクトリを片付ける

移動後に空になったディレクトリを削除します。

削除候補:

```txt
src/components/chat/
src/components/common/
src/components/layout/
src/components/ui/
src/hooks/
src/lib/
```

`src/config/`、`src/contexts/`、`src/api/` は残します。

## 検証

各 Phase の最後に最低限以下を実行します。

```sh
cd apps/web
npm run lint
npm test -- --watchAll=false
npm run build
```

手動確認項目:

- ログインできること。
- 新規登録できること。
- 401 時にログイン画面へ一度だけリダイレクトされること。
- チャットを送信できること。
- SSE の進捗表示と最終回答が表示されること。
- チャットエラー時に入力欄付近のエラーと toast が表示されること。
- スレッド一覧の取得、選択、作成、リネーム、削除が動くこと。
- カテゴリ一覧が表示されること。
- カテゴリ詳細と Q&A 言語タブが動くこと。
- キーワード検索が動くこと。
- メンテナンス画面と 404 画面が表示されること。

## リスク

- import パス変更が多いため、build error が出やすい。
- `apiClient` と `UserContext` は認証リダイレクトに関わるため、慎重に移動する。
- `HomePage.js` は一時スレッド ID、SSE 完了、スレッド更新の状態遷移が密に結合している。
- `catch {}` で握りつぶしている箇所があるため、手動確認も必要。

## 推奨コミット順

1. `UserContext` に認証、リダイレクト、`language/t` を集約し、`useAuth` と `useLanguage` を削除する。
2. `api/apiClient.js` と `api/apiErrors.js` を作る。
3. `features/layout/` を作り、AppLayout/AuthLayout/Header/Sidebar/Toaster を移動する。
4. `home` ページ entry を `pages/home/` に移動し、実装詳細を `features/home/` に移動する。
5. `home` の error、SSE、storage helper、`pages/home/api.js` を切り出す。
6. login/register/category/keyword/maintenance/not-found を `pages/<page>/` に移動する。
7. 旧ディレクトリと一時 re-export を削除する。
8. lint/test/build と手動確認を実行する。

## やらないこと

- Next.js へ移行しない。
- ファイルシステムルーティングを導入しない。
- `shared/` ディレクトリを作らない。
- `hooks/` ディレクトリを作らない。
- 共通 UI コンポーネントディレクトリを作らない。
- `features/` に API client や API endpoint を置かない。
- 新しいグローバル state 管理ライブラリを導入しない。
- ファイル移動と同時にチャットフローを書き換えない。
- このリファクタ内で UI デザイン変更をしない。
- 削除済みの通知 UI やログイン後言語変更 UI を復活させない。
