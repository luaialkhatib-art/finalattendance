#!/bin/bash
echo "=========================================================="
echo "رفع نظام حضور وغياب مدرسة ذكور مدينة اربد الاعدادية الثانية الى GitHub"
echo "=========================================================="
echo ""
read -p "يرجى ادخال رابط مستودع GitHub الخاص بك (مثال: https://github.com/username/repo.git): " REPO_URL

if [ -z "$REPO_URL" ]; then
    echo "خطأ: لم يتم ادخال رابط المستودع."
    exit 1
fi

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
