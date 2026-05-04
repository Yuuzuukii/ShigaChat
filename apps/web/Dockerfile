FROM nginx:latest

# カスタムnginx.confをコピー
COPY ./nginx.conf /etc/nginx/nginx.conf

# Reactビルドファイルをコピー
COPY ./build /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]
