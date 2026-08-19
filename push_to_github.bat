@echo off
echo ===================================================
echo   Pushing ChatterPatter App to GitHub
echo   Repository: https://github.com/bbswami27/my-project
echo ===================================================
echo.

git remote set-url origin https://github.com/bbswami27/my-project.git
git branch -M main
git add .
git commit -m "Upload ChatterPatter project files" 2>nul
echo.
echo Pushing commits to GitHub (Force update)...
echo (Agar browser login popup aaye toh please Sign In karein)
echo.
git push -u origin main --force

echo.
if %ERRORLEVEL% equ 0 (
    echo ===================================================
    echo   SUCCESS: Saari files GitHub par upload ho gayi!
    echo   Check karein: https://github.com/bbswami27/my-project
    echo ===================================================
) else (
    echo ===================================================
    echo   ERROR: Push fail ho gaya.
    echo ===================================================
)
echo.
pause
