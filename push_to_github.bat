@echo off
chcp 65001 >nul
echo ==========================================================
echo رفع نظام حضور وغياب مدرسة ذكور مدينة اربد الاعدادية الثانية الى GitHub
echo ==========================================================
echo.
set REPO_URL=https://github.com/luaialkhatib-art/finalattendance.git
echo المستودع المستهدف: %REPO_URL%

git remote remove origin >nul 2>&1
git remote add origin %REPO_URL%
git branch -M main
echo جارٍ رفع الملفات إلى GitHub...
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ==========================================================
    echo تم رفع كامل المشروع بنجاح إلى GitHub!
    echo ==========================================================
) else (
    echo.
    echo فشل الرفع. يرجى التأكد من تسجيل الدخول إلى GitHub أو استخدام Personal Access Token.
)
pause
