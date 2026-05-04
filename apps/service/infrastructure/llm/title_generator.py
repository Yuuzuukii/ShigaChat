class ThreadTitleGenerator:
    def generate(self, question: str, language_name: str) -> str:
        compact = " ".join((question or "").split())
        if not compact:
            return "無題" if language_name == "日本語" else "Untitled"
        limit = 15 if language_name in {"日本語", "中文", "한국어"} else 30
        return compact[:limit]
