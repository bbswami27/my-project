@echo off
setlocal
echo ===================================================
echo   Pushing ChatterPatter App to GitHub
echo   Repository: https://github.com/bbswami27/my-project
echo ===================================================
echo.

set "GIT_EXE=git"
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    if exist "C:\Users\Bharat Bhushan\.gemini\antigravity\scratch\mingit\cmd\git.exe" (
        set "GIT_EXE=C:\Users\Bharat Bhushan\.gemini\antigravity\scratch\mingit\cmd\git.exe"
    )
)

"%GIT_EXE%" remote set-url origin https://github.com/bbswami27/my-project.git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    "%GIT_EXE%" remote add origin https://github.com/bbswami27/my-project.git
)

"%GIT_EXE%" branch -M main
"%GIT_EXE%" add -A
"%GIT_EXE%" commit -m "Standardize project structure: clean js/ and css/ folders, fix message delivery and contact sync" 2>nul

echo.
echo Pushing commits to GitHub (Force update)...
echo.
"%GIT_EXE%" push -u origin main --force

echo.
if %ERRORLEVEL% equ 0 (
    echo ===================================================
    echo   SUCCESS: Saari files GitHub par upload ho gayi!
    echo   Check karein: https://github.com/bbswami27/my-project
    echo ===================================================
) else (
    echo ===================================================
    echo   ERROR: Push fail ho gaya. (Check GitHub Credentials/Token)
    echo ===================================================
)
echo.
pause
