#!/bin/bash
echo "=========================================================="
echo "رفع نظام حضور وغياب مدرسة ذكور مدينة اربد الاعدادية الثانية الى GitHub"
echo "=========================================================="
echo ""
REPO_URL="https://github.com/luaialkhatib-art/finalattendance.git"
echo "المستودع المستهدف: $REPO_URL"

git remote remove origin 2>/dev/null
git remote add origin "$REPO_URL"
git branch -M main
echo "جارٍ رفع الملفات الى GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================================="
    echo "تم رفع كامل المشروع بنجاح الى GitHub!"
    echo "=========================================================="
else
    echo ""
    echo "فشل الرفع. يرجى التاكد من صلاحيات حسابك في GitHub او ادخال Personal Access Token."
fi
