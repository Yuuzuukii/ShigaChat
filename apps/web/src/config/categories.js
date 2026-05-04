// カテゴリ一覧（13カテゴリ × 9言語）
export const categoryList = [
  { id: 1, name: { ja: "在留・住民手続", en: "Immigration & Residency Procedures", vi: "Thủ tục cư trú & dân cư", zh: "居留及居民手续", ko: "체류 및 주민 절차", pt: "Procedimento de imigração e de residência", es: "Procedimientos de inmigración y de residentes", tl: "Mga Pamamaraan sa Imigrasyon at Paninirahan", id: "Izin Tinggal & Prosedur Tinggal" }, className: "category-zairyu" },
  { id: 2, name: { ja: "生活", en: "Daily Life", vi: "Đời sống hằng ngày", zh: "生活", ko: "생활", pt: "Vida", es: "Vida", tl: "Pamumuhay", id: "Kehidupan sehari-hari" }, className: "category-seikatsu" },
  { id: 3, name: { ja: "医療", en: "Healthcare", vi: "Y tế", zh: "医疗", ko: "의료", pt: "Médico", es: "Médica", tl: "Pangangalagang Medikal", id: "Medis" }, className: "category-iryo" },
  { id: 4, name: { ja: "年金・保険", en: "Pension & Insurance", vi: "Lương hưu & bảo hiểm", zh: "养老金与保险", ko: "연금 및 보험", pt: "Pensões e seguros", es: "Pensiones y seguros", tl: "Pensiyon at Seguro", id: "Pensiun" }, className: "category-nenkin" },
  { id: 5, name: { ja: "労働", en: "Labor", vi: "Lao động", zh: "劳动", ko: "노동", pt: "Trabalho", es: "Trabajo", tl: "Trabaho", id: "Ketenagakerjaan" }, className: "category-roudou" },
  { id: 6, name: { ja: "教育", en: "Education", vi: "Giáo dục", zh: "教育", ko: "교육", pt: "Educação", es: "Educación", tl: "Edukasyon", id: "Pendidikan" }, className: "category-kyouiku" },
  { id: 7, name: { ja: "結婚・離婚", en: "Marriage & Divorce", vi: "Kết hôn & ly hôn", zh: "婚姻与离婚", ko: "결혼 및 이혼", pt: "Casamento e divórcio", es: "Matrimonio y divorcio", tl: "Kasal at Diborsiyo", id: "Pernikahan dan Perceraian" }, className: "category-kekkon" },
  { id: 8, name: { ja: "出産・育児", en: "Childbirth & Childcare", vi: "Sinh con & nuôi dạy con", zh: "生育与育儿", ko: "출산 및 육아", pt: "Parto e puericultura", es: "El parto y el cuidado infantil", tl: "Panganganak at Pag-aalaga ng Bata", id: "Melahirkan dan Mengasuh Anak" }, className: "category-shussan" },
  { id: 9, name: { ja: "住宅", en: "Housing", vi: "Nhà ở", zh: "住宅", ko: "주거", pt: "Habitação", es: "Vivienda", tl: "Pabahay", id: "Hunian" }, className: "category-jutaku" },
  { id: 10, name: { ja: "税金", en: "Taxes", vi: "Thuế", zh: "税务", ko: "세금", pt: "Impostos", es: "Impuestos", tl: "Buwis", id: "Pajak" }, className: "category-zeikin" },
  { id: 11, name: { ja: "福祉", en: "Welfare", vi: "Phúc lợi", zh: "福利", ko: "복지", pt: "Bem-estar", es: "Bienstar", tl: "Kapakanan", id: "Welfare" }, className: "category-fukushi" },
  { id: 12, name: { ja: "事件・事故", en: "Incidents & Accidents", vi: "Sự cố & tai nạn", zh: "事件及事故", ko: "사건 및 사고", pt: "Incidentes e acidentes", es: "Incidentes y accidentes", tl: "Mga Insidente at Aksidente", id: "Kasus Kriminal dan Kecelakaan" }, className: "category-jiken" },
  { id: 13, name: { ja: "災害", en: "Disasters", vi: "Thiên tai", zh: "灾害", ko: "재난", pt: "Desastre", es: "Desastre", tl: "Kalamidad", id: "Bencana" }, className: "category-saigai" },
];

// カテゴリ背景色
export const categoryColors = {
  "category-zairyu": { base: "#ffe599", hover: "#ffd966" },
  "category-seikatsu": { base: "#d9ead3", hover: "#b6d7a8" },
  "category-iryo": { base: "#f9cb9c", hover: "#f6b26b" },
  "category-nenkin": { base: "#c9daf8", hover: "#6d9eeb" },
  "category-roudou": { base: "#f6d7b0", hover: "#f4b183" },
  "category-kyouiku": { base: "#e06666", hover: "#cc0000" },
  "category-kekkon": { base: "#a4c2f4", hover: "#6fa8dc" },
  "category-shussan": { base: "#d9d2e9", hover: "#b4a7d6" },
  "category-jutaku": { base: "#b6d7a8", hover: "#93c47d" },
  "category-zeikin": { base: "#cfe2f3", hover: "#76a5af" },
  "category-fukushi": { base: "#f6e0b5", hover: "#e69138" },
  "category-jiken": { base: "#ea9999", hover: "#cc0000" },
  "category-saigai": { base: "#b4a7d6", hover: "#674ea7" },
};
