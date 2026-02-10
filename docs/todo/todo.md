# TODO

## 実装(今後は基本的にIssue駆動)
- [x] テスト環境の構築
    - [x] 開発ブランチをdevelopブランチに移行
    - [x] developブランチにて、最小限の実装を残す

- [x] エラー画面
    - [x] ページNot Found（NotFoundPage.js）
    - [x] メンテナンス画面（MaintenancePage.js）

- [x] フロントエンドリファクタリング
    - [x] constants.js スリム化（1722行→9行）
    - [x] config/i18n.js, config/categories.js 分離
    - [x] contexts/UserContext.js 移動
    - [x] services/api.js 集中API層
    - [x] hooks/ (useAuth, useLanguage, useThreads, useNotifications)
    - [x] components/layout/ (AppLayout, Header, Sidebar, AuthLayout, LanguageSelector)
    - [x] components/chat/ (ChatMessages, ChatInput, ActionBar, MessageBubble)
    - [x] components/common/ (ConfirmDialog, Tooltip)
    - [x] components/notifications/ (NotificationPopup)
    - [x] pages/ (LoginPage, RegisterPage, HomePage, KeywordSearchPage, CategoryListPage, CategoryDetailPage, NotFoundPage, MaintenancePage)
    - [x] App.js ルーティング再構成（/login, /register, MAINTENANCE_MODE, 404キャッチ）
    - [x] W01 遷移警告ダイアログ（ConfirmDialog）
    - [x] Admin routes 除外
    - [ ] 旧ファイル削除（安定確認後）

- [ ] ヘルプ画面

## 仕様書
- [ ] 画面仕様書
    - [x] エラーメッセージの表示
        - [x] 表示場所
        - [x] メッセージの内容
    - [x] S07: Not Found（404）画面
    - [x] S08: メンテナンス画面


- [ ] パスワードを忘れた時の対応