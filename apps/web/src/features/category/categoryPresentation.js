import {
  Baby, Briefcase, CloudLightning, GraduationCap, Heart, HeartHandshake,
  HelpingHand, Home, IdCard, PiggyBank, Receipt, Siren, Stethoscope, Tag,
} from "lucide-react";

const categoryIcons = {
  "category-zairyu": IdCard,
  "category-seikatsu": HeartHandshake,
  "category-iryo": Stethoscope,
  "category-nenkin": PiggyBank,
  "category-roudou": Briefcase,
  "category-kyouiku": GraduationCap,
  "category-kekkon": Heart,
  "category-shussan": Baby,
  "category-jutaku": Home,
  "category-zeikin": Receipt,
  "category-fukushi": HelpingHand,
  "category-jiken": Siren,
  "category-saigai": CloudLightning,
  "category-sonota": Tag,
};

export function getCategoryIcon(category) {
  return categoryIcons[category?.className] || Tag;
}

export function getCategoryName(category, language, fallback = "") {
  return category?.name?.[language] || category?.name?.ja || fallback;
}
