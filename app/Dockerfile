FROM python:3.9

# 必要なディレクトリ作成
RUN mkdir -p /var/www && chown -R root:root /var/www

# 作業ディレクトリを設定
WORKDIR /var/www

# requirements.txtをコピー
COPY requirements.txt ./

# pipをアップグレードして依存関係をインストール
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 必要なアプリケーションファイルをコピー
COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
