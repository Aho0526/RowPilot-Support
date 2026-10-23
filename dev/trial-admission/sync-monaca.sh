#!/bin/sh
# trial-admission の最新ファイルを monaca-project/www にコピーする
# 使い方: dev/trial-admission で ./sync-monaca.sh を実行
cd "$(dirname "$0")" || exit 1
for f in index.html style.css core.js config.js; do
    cp "$f" "monaca-project/www/$f"
done
cp -R assets/. monaca-project/www/assets/
echo "monaca-project/www を更新しました"
