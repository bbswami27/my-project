@echo off
echo ===================================================
echo   Pushing ChatterPatter App to GitHub
echo   Repository: https://github.com/bbswami27/my-project
echo ===================================================
echo.

git remote set-url origin https://github.com/bbswami27/my-project.git
git branch -M main
git add .
git commit -m "Update ChatterPatter App" 2>nul
echo.
echo Pushing commits to GitHub...
echo (Agar browser login popup aaye toh please Sign In karein)
echo.
git push -u origin main

echo.
if %ERRORLEVEL% equ 0 (
    echo ===================================================
    echo   SUCCESS: Code GitHub par upload ho gaya!
    echo   Check karein: https://github.com/bbswami27/my-project
    echo ===================================================
) else (
    echo ===================================================
    echo   ERROR: Push fail ho gaya.
    echo   Agar password maang raha ho, toh GitHub Personal 
    echo   Access Token (PAT) use karein.
    echo ===================================================
)
echo.
pause
