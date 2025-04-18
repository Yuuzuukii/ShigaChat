// config/constants.js
export const API_BASE_URL = "http://localhost:8000";

export const translations = {
  ja: {
    welcome: "ようこそ！",
    guest: "ゲスト",
    askQuestion: "なんでも質問してみよう",
    questionLabel: "質問を入力：",
    placeholder: "ここに質問を入力してください...",
    askButton: "質問する",
    generatingAnswer: "回答を生成しています...",
    answer: "回答：",
    similarQuestions: "類似する質問と回答：",
    sortByDate: "日時順",
    sortBySimilarity: "類似度順",
    registerquestion: "🛠️質問を登録する",
    error: "エラーが発生しました：",
    official: "公式",
    publicToggle: "公開",
    privateToggle: "非公開",
    makepublicToggle: "質問を公開する",
    makeprivateToggle: "質問を公開しない",
    enterquestion: "質問を入力してください",
    failedtopost: "質問の投稿に失敗しました",
    failtogetanswer: "回答の取得に失敗しました",
    failtoupdate: "更新に失敗しました。",
    timeUnknown: "日時不明",
    keywordSearch: "キーワード検索",
    enterKeyword: "キーワードを入力...",
    search: "検索",
    noResults: "検索結果がありません。",
    errorLogin: "ログインが必要です。",
    keyworderror: "キーワードエラー",
    category: "カテゴリ",
    categorySearch: "カテゴリ検索",
    select: "下から選択してください",
    loading: "読み込み中...",
    noQuestions: "このカテゴリには質問がありません。",
    questionDate: "質問日時：",
    backButton: "カテゴリ検索画面に戻る",
    categorynotfound: "カテゴリが見つかりません。",
    viewedHistory: "閲覧履歴を見る",
    noHistory: "閲覧履歴はありません。",
    viewDate: "閲覧日：",
    clear: "閲覧履歴を削除",
    questionhistory: "質問履歴",
    publicerror: "公開ステータスの変更に失敗しました。",
    changecategory: "カテゴリを変更する",
    selectcategory: "カテゴリを選択",
    moveto: "カテゴリを移動：",
    cancel: "キャンセル",
    currentCategory: "現在のカテゴリ",
    personal: "個人",
    global: "全体",
    noNotifications: "通知はありません。",
    questionmanagement: "質問管理",
    register: "登録する",
    qtext: "質問：",
    unpublic: "非公開",
    unofficial: "非公式",
    close: "閉じる",
    questionerror: "質問を入力してください。",
    answererror: "回答を入力してください。",
    register_question: "質問を登録する",
    edit: "編集",
    save: "保存",
    give_official: "公式マークを付与する",
    takeaway_official: "公式マークを外す",
    delete: "削除",
    confirmDelete: "この質問を削除してもよろしいですか？",
    answerupdated: "回答が更新されました！",
    unofficialize: "公式マークを削除しますか？",
    officialize: "公式マークを付与しますか？",
    categorychanged: "カテゴリが変更されました！",
    failtochangecategory: "カテゴリの変更に失敗しました。",
    nickname: "ニックネーム",
    password: "パスワード",
    login: "ログイン",
    registerPrompt: "↓↓↓↓ 新規登録はこちら ↓↓↓↓",
    successLogin: "ログインに成功しました！",
    signUp: "新規登録",
    age: "年齢",
    gender: "性別",
    spokenLanguage: "使用言語",
    male: "男性",
    female: "女性",
    other: "その他",
    errorEmptyFields: "ニックネームとパスワードを入力してください。",
    errorInvalidLogin: "ニックネームまたはパスワードが正しくありません。",
    errorServer: "ログインに失敗しました。サーバーに問題がある可能性があります。",
    errorAllFields: "すべての項目を入力してください！",
    successRegistration: "登録が完了しました！",
    errorRegistration: "登録に失敗しました",
    selectLanguage: "言語を選択",
  },
  en: {
    welcome: "Welcome!",
    guest: "Guest",
    askQuestion: "Ask anything",
    questionLabel: "Enter your question:",
    placeholder: "Type your question here...",
    askButton: "Ask Question",
    generatingAnswer: "Generating answer...",
    answer: "Answer: ",
    similarQuestions: "Similar Questions and Answers:",
    sortByDate: "Sort by Date",
    sortBySimilarity: "Sort by Similarity",
    registerquestion: "🛠️Register a Question",
    error: "Error occurred: ",
    official: "Official",
    publicToggle: "Public",
    privateToggle: "Private",
    makepublicToggle: "Make Question public",
    makeprivateToggle: "Keep Question private", 
    enterquestion: "Please enter a question",
    failedtopost: "Failed to post question",
    failtogetanswer: "Failed to get answer",
    failtoupdate: "Failed to update.",
    timeUnknown: "Time unknown",
    keywordSearch: "Keyword Search",
    enterKeyword: "Enter a keyword...",
    search: "Search",
    noResults: "No results found.",
    errorLogin: "Login required.",
    keyworderror: "Keyword error",
    category: "Category",
    categorySearch: "Category Search",
    select: "Please select from below",
    loading: "Loading...",
    noQuestions: "No questions in this category.",
    questionDate: "Question Date:",
    backButton: "Back to Category Search",
    categorynotfound: "Category not found.",
    viewedHistory: "View History",
    noHistory: "No history available.",
    viewDate: "Viewed on:",
    clear: "Clear Viewing History",
    questionhistory: "Question History",
    publicerror: "Failed to change public status.",
    changecategory: "Change Category",
    selectcategory: "Select Category",
    moveto: "Move to category: ",
    cancel: "Cancel",
    currentCategory: "Current Category",
    personal: "Personal",
    global: "General",
    noNotifications: "No notifications.",
    questionmanagement: "Question Management",
    register: "Register",
    qtext: "Question: ",
    unpublic: "Unpublic",
    unofficial: "Unofficial",
    close: "Close",
    questionerror: "Please enter a question.",
    answererror: "Please enter an answer.",
    register_question: "Register a Question",
    edit: "Edit",
    save: "Save",
    give_official: "Grant Official Mark",
    takeaway_official: "Remove Official Mark",
    delete: "Delete",
    confirmDelete: "Are you sure you want to delete this question?",
    answerupdated: "Answer has been updated!",
    unofficialize: "Do you want to remove the official mark?",
    officialize: "Do you want to grant the official mark?",
    categorychanged: "Category has been changed!",
    failtochangecategory: "Failed to change category.",
    nickname: "Nickname",
    password: "Password",
    login: "Login",
    registerPrompt: "↓↓↓↓ Click here to register ↓↓↓↓",
    successLogin: "Login successful!",
    signUp: "Sign Up",
    age: "Age",
    gender: "Gender",
    spokenLanguage: "Spoken Language",
    male: "Male",
    female: "Female",
    other: "Other",
    errorEmptyFields: "Please enter your nickname and password.",
    errorInvalidLogin: "Invalid nickname or password.",
    errorServer: "Login failed. There might be an issue with the server.",
    errorAllFields: "Please fill in all fields!",
    successRegistration: "Registration successful!",
    errorRegistration: "Registration failed",
    selectLanguage: "Select Language",
  },  
  zh: {
    welcome: "欢迎！",
    guest: "访客",
    askQuestion: "尽管提问",
    questionLabel: "输入你的问题：",
    placeholder: "请在此输入你的问题...",
    askButton: "提交问题",
    generatingAnswer: "正在生成回答...",
    answer: "回答：",
    similarQuestions: "类似的问题与回答：",
    sortByDate: "按日期排序",
    sortBySimilarity: "按相似度排序",
    registerquestion: "🛠️注册问题",
    error: "发生错误：",
    official: "官方",
    publicToggle: "公开",
    privateToggle: "私密",
    makepublicToggle: "公开此问题",
    makeprivateToggle: "保留为私密", 
    enterquestion: "请输入问题",
    failedtopost: "提交问题失败",
    failtogetanswer: "获取回答失败",
    failtoupdate: "更新失败。",
    timeUnknown: "时间未知",
    keywordSearch: "关键词搜索",
    enterKeyword: "请输入关键词...",
    search: "搜索",
    noResults: "没有找到结果。",
    errorLogin: "请登录。",
    keyworderror: "关键词错误",
    category: "类别",
    categorySearch: "类别搜索",
    select: "请从下面选择",
    loading: "加载中...",
    noQuestions: "该类别下没有问题。",
    questionDate: "提问时间：",
    backButton: "返回类别搜索",
    categorynotfound: "未找到类别。",
    viewedHistory: "浏览历史",
    noHistory: "无浏览记录。",
    viewDate: "查看时间：",
    clear: "清除浏览记录",
    questionhistory: "问题历史记录",
    publicerror: "更改公开状态失败。",
    changecategory: "更改类别",
    selectcategory: "选择类别",
    moveto: "移动到类别：",
    cancel: "取消",
    currentCategory: "当前类别",
    personal: "个人",
    global: "全部",
    noNotifications: "无通知。",
    questionmanagement: "问题管理",
    register: "注册",
    qtext: "问题：",
    unpublic: "不公开",
    unofficial: "非官方",
    close: "关闭",
    questionerror: "请输入问题。",
    answererror: "请输入回答。",
    register_question: "注册问题",
    edit: "编辑",
    save: "保存",
    give_official: "授予官方标记",
    takeaway_official: "移除官方标记",
    delete: "删除",
    confirmDelete: "你确定要删除此问题吗？",
    answerupdated: "回答已更新！",
    unofficialize: "是否移除官方标记？",
    officialize: "是否授予官方标记？",
    categorychanged: "类别已更改！",
    failtochangecategory: "更改类别失败。",
    nickname: "昵称",
    password: "密码",
    login: "登录",
    registerPrompt: "↓↓↓↓ 点击此处注册 ↓↓↓↓",
    successLogin: "登录成功！",
    signUp: "注册",
    age: "年龄",
    gender: "性别",
    spokenLanguage: "使用语言",
    male: "男",
    female: "女",
    other: "其他",
    errorEmptyFields: "请输入昵称和密码。",
    errorInvalidLogin: "昵称或密码错误。",
    errorServer: "登录失败，服务器可能出错。",
    errorAllFields: "请填写所有字段！",
    successRegistration: "注册成功！",
    errorRegistration: "注册失败",
    selectLanguage: "选择语言",
  },
  vi: {
    welcome: "Chào mừng!",
    guest: "Khách",
    askQuestion: "Hãy hỏi bất cứ điều gì",
    questionLabel: "Nhập câu hỏi của bạn:",
    placeholder: "Nhập câu hỏi tại đây...",
    askButton: "Đặt câu hỏi",
    generatingAnswer: "Đang tạo câu trả lời...",
    answer: "Câu trả lời: ",
    similarQuestions: "Câu hỏi và câu trả lời tương tự:",
    sortByDate: "Sắp xếp theo ngày",
    sortBySimilarity: "Sắp xếp theo mức độ tương tự",
    registerquestion: "🛠️Đăng ký câu hỏi",
    error: "Đã xảy ra lỗi: ",
    official: "Chính thức",
    publicToggle: "Công khai",
    privateToggle: "Riêng tư",
    makepublicToggle: "Công khai câu hỏi",
    makeprivateToggle: "Giữ câu hỏi riêng tư", 
    enterquestion: "Vui lòng nhập câu hỏi",
    failedtopost: "Gửi câu hỏi thất bại",
    failtogetanswer: "Không thể lấy câu trả lời",
    failtoupdate: "Cập nhật thất bại.",
    timeUnknown: "Không rõ thời gian",
    keywordSearch: "Tìm kiếm từ khóa",
    enterKeyword: "Nhập từ khóa...",
    search: "Tìm kiếm",
    noResults: "Không tìm thấy kết quả.",
    errorLogin: "Yêu cầu đăng nhập.",
    keyworderror: "Lỗi từ khóa",
    category: "Danh mục",
    categorySearch: "Tìm kiếm danh mục",
    select: "Vui lòng chọn từ bên dưới",
    loading: "Đang tải...",
    noQuestions: "Không có câu hỏi nào trong danh mục này.",
    questionDate: "Ngày hỏi:",
    backButton: "Quay lại tìm kiếm danh mục",
    categorynotfound: "Không tìm thấy danh mục.",
    viewedHistory: "Lịch sử đã xem",
    noHistory: "Không có lịch sử.",
    viewDate: "Xem vào:",
    clear: "Xóa lịch sử đã xem",
    questionhistory: "Lịch sử câu hỏi",
    publicerror: "Thay đổi trạng thái công khai thất bại.",
    changecategory: "Thay đổi danh mục",
    selectcategory: "Chọn danh mục",
    moveto: "Chuyển đến danh mục: ",
    cancel: "Hủy",
    currentCategory: "Danh mục hiện tại",
    personal: "Cá nhân",
    global: "Toàn bộ",
    noNotifications: "Không có thông báo.",
    questionmanagement: "Quản lý câu hỏi",
    register: "Đăng ký",
    qtext: "Câu hỏi: ",
    unpublic: "Không công khai",
    unofficial: "Không chính thức",
    close: "Đóng",
    questionerror: "Vui lòng nhập câu hỏi.",
    answererror: "Vui lòng nhập câu trả lời.",
    register_question: "Đăng ký câu hỏi",
    edit: "Chỉnh sửa",
    save: "Lưu",
    give_official: "Gán dấu chính thức",
    takeaway_official: "Xóa dấu chính thức",
    delete: "Xóa",
    confirmDelete: "Bạn có chắc chắn muốn xóa câu hỏi này không?",
    answerupdated: "Câu trả lời đã được cập nhật!",
    unofficialize: "Bạn có muốn xóa dấu chính thức không?",
    officialize: "Bạn có muốn gán dấu chính thức không?",
    categorychanged: "Danh mục đã được thay đổi!",
    failtochangecategory: "Thay đổi danh mục thất bại.",
    nickname: "Tên người dùng",
    password: "Mật khẩu",
    login: "Đăng nhập",
    registerPrompt: "↓↓↓↓ Nhấn vào đây để đăng ký ↓↓↓↓",
    successLogin: "Đăng nhập thành công!",
    signUp: "Đăng ký",
    age: "Tuổi",
    gender: "Giới tính",
    spokenLanguage: "Ngôn ngữ sử dụng",
    male: "Nam",
    female: "Nữ",
    other: "Khác",
    errorEmptyFields: "Vui lòng nhập tên người dùng và mật khẩu.",
    errorInvalidLogin: "Tên người dùng hoặc mật khẩu không đúng.",
    errorServer: "Đăng nhập thất bại. Có thể có lỗi từ máy chủ.",
    errorAllFields: "Vui lòng điền đầy đủ thông tin!",
    successRegistration: "Đăng ký thành công!",
    errorRegistration: "Đăng ký thất bại",
    selectLanguage: "Chọn ngôn ngữ",
  },
  ko: {
    welcome: "환영합니다!",
    guest: "게스트",
    askQuestion: "무엇이든 물어보세요",
    questionLabel: "질문 입력:",
    placeholder: "여기에 질문을 입력하세요...",
    askButton: "질문하기",
    generatingAnswer: "답변 생성 중...",
    answer: "답변: ",
    similarQuestions: "유사한 질문 및 답변:",
    sortByDate: "날짜순 정렬",
    sortBySimilarity: "유사도순 정렬",
    registerquestion: "🛠️질문 등록",
    error: "오류 발생: ",
    official: "공식",
    publicToggle: "공개",
    privateToggle: "비공개",
    makepublicToggle: "질문을 공개하기",
    makeprivateToggle: "질문을 비공개로 유지하기", 
    enterquestion: "질문을 입력하세요",
    failedtopost: "질문 등록 실패",
    failtogetanswer: "답변을 가져오지 못했습니다",
    failtoupdate: "업데이트 실패.",
    timeUnknown: "시간 정보 없음",
    keywordSearch: "키워드 검색",
    enterKeyword: "키워드를 입력하세요...",
    search: "검색",
    noResults: "결과를 찾을 수 없습니다.",
    errorLogin: "로그인이 필요합니다.",
    keyworderror: "키워드 오류",
    category: "카테고리",
    categorySearch: "카테고리 검색",
    select: "아래에서 선택하세요",
    loading: "불러오는 중...",
    noQuestions: "이 카테고리에 질문이 없습니다.",
    questionDate: "질문 날짜:",
    backButton: "카테고리 검색으로 돌아가기",
    categorynotfound: "카테고리를 찾을 수 없습니다.",
    viewedHistory: "조회 기록",
    noHistory: "기록이 없습니다.",
    viewDate: "조회 날짜:",
    clear: "조회 기록 삭제",
    questionhistory: "질문 기록",
    publicerror: "공개 상태 변경 실패",
    changecategory: "카테고리 변경",
    selectcategory: "카테고리 선택",
    moveto: "다음 카테고리로 이동: ",
    cancel: "취소",
    currentCategory: "현재 카테고리",
    personal: "개인",
    global: "전체",
    noNotifications: "알림이 없습니다.",
    questionmanagement: "질문 관리",
    register: "등록",
    qtext: "질문: ",
    unpublic: "비공개",
    unofficial: "비공식",
    close: "닫기",
    questionerror: "질문을 입력하세요.",
    answererror: "답변을 입력하세요.",
    register_question: "질문 등록",
    edit: "수정",
    save: "저장",
    give_official: "공식 마크 부여",
    takeaway_official: "공식 마크 제거",
    delete: "삭제",
    confirmDelete: "이 질문을 삭제하시겠습니까?",
    answerupdated: "답변이 업데이트되었습니다!",
    unofficialize: "공식 마크를 제거하시겠습니까?",
    officialize: "공식 마크를 부여하시겠습니까?",
    categorychanged: "카테고리가 변경되었습니다!",
    failtochangecategory: "카테고리 변경 실패",
    nickname: "닉네임",
    password: "비밀번호",
    login: "로그인",
    registerPrompt: "↓↓↓↓ 여기를 클릭하여 가입 ↓↓↓↓",
    successLogin: "로그인 성공!",
    signUp: "회원가입",
    age: "나이",
    gender: "성별",
    spokenLanguage: "사용 언어",
    male: "남성",
    female: "여성",
    other: "기타",
    errorEmptyFields: "닉네임과 비밀번호를 입력해주세요.",
    errorInvalidLogin: "닉네임 또는 비밀번호가 잘못되었습니다.",
    errorServer: "로그인 실패. 서버에 문제가 있을 수 있습니다.",
    errorAllFields: "모든 필드를 입력해주세요!",
    successRegistration: "회원가입 성공!",
    errorRegistration: "회원가입 실패",
    selectLanguage: "언어 선택",
  },
};

export const categoryList = [
  { id: 1, name: { ja: "在留・住民手続", en: "Immigration & Residence Procedures", zh: "移民与居留手续", ko: "이민 및 거주 절차", vi: "Thủ tục nhập cư và cư trú" }, className: "category-zairyu" },
  { id: 2, name: { ja: "生活", en: "Life", zh: "生活", ko: "생활", vi: "Cuộc sống" }, className: "category-seikatsu" },
  { id: 3, name: { ja: "医療", en: "Medical", zh: "医疗", ko: "의료", vi: "Y tế" }, className: "category-iryo" },
  { id: 4, name: { ja: "年金・保険", en: "Pension & Insurance", zh: "养老金与保险", ko: "연금 및 보험", vi: "Lương hưu và bảo hiểm" }, className: "category-nenkin" },
  { id: 5, name: { ja: "労働", en: "Labor", zh: "劳动", ko: "노동", vi: "Lao động" }, className: "category-roudou" },
  { id: 6, name: { ja: "教育", en: "Education", zh: "教育", ko: "교육", vi: "Giáo dục" }, className: "category-kyouiku" },
  { id: 7, name: { ja: "結婚・離婚", en: "Marriage & Divorce", zh: "婚姻与离婚", ko: "결혼 및 이혼", vi: "Hôn nhân và ly hôn" }, className: "category-kekkon" },
  { id: 8, name: { ja: "出産・育児", en: "Childbirth & Parenting", zh: "分娩与育儿", ko: "출산 및 양육", vi: "Sinh đẻ và nuôi dạy con cái" }, className: "category-shussan" },
  { id: 9, name: { ja: "住宅", en: "Housing", zh: "住房", ko: "주택", vi: "Nhà ở" }, className: "category-jutaku" },
  { id: 10, name: { ja: "税金", en: "Taxation", zh: "税收", ko: "세금", vi: "Thuế" }, className: "category-zeikin" },
  { id: 11, name: { ja: "福祉", en: "Welfare", zh: "福利", ko: "복지", vi: "Phúc lợi" }, className: "category-fukushi" },
  { id: 12, name: { ja: "事件・事故", en: "Incidents & Accidents", zh: "事件与事故", ko: "사건 및 사고", vi: "Sự cố và tai nạn" }, className: "category-jiken" },
  { id: 13, name: { ja: "災害", en: "Disasters", zh: "灾难", ko: "재해", vi: "Thảm họa" }, className: "category-saigai" },
];

export const languageCodeToId = { en: 2, ja: 1, vi: 3, zh: 4, ko: 5 };
export const languageLabelToCode = {
  English: "en",
  日本語: "ja",
  "Tiếng Việt": "vi",
  中文: "zh",
  한국어: "ko"
};
export const languageCodeToLabel = Object.fromEntries(
  Object.entries(languageLabelToCode).map(([label, code]) => [code, label])
);
