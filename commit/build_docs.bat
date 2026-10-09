@echo off
setlocal
chcp 65001 >nul

echo =======================================================
echo   SguanFOC v4.0.0 Docs Pandoc HTML Build
echo =======================================================
echo.

where pandoc >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Pandoc not found in PATH!
    echo Please install Pandoc from https://pandoc.org/installing.html
    pause
    exit /b 1
)

set "COMMIT_DIR=%~dp0"
set "OUTPUT_DIR=%COMMIT_DIR%html_docs"

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
if not exist "%OUTPUT_DIR%\assets" mkdir "%OUTPUT_DIR%\assets"
if exist "%COMMIT_DIR%assets" (
    xcopy /E /I /Y "%COMMIT_DIR%assets" "%OUTPUT_DIR%\assets" >nul
)

cd /d "%COMMIT_DIR%"

echo [0/4] Building interactive walkthrough dataset and copying workspace...
python "%COMMIT_DIR%build_walkthrough_data.py"
copy /Y "%COMMIT_DIR%code_walkthrough.html" "%OUTPUT_DIR%\code_walkthrough.html" >nul
copy /Y "%COMMIT_DIR%walkthrough_data.js" "%OUTPUT_DIR%\walkthrough_data.js" >nul

echo [1/4] Converting foc_code_analysis.md to HTML...
pandoc -s -N --toc --toc-depth=3 --katex=assets/ -H header.html -B navbar.html -o "%OUTPUT_DIR%\foc_code_analysis.html" foc_code_analysis.md
if errorlevel 1 (
    echo [FAIL] Error converting foc_code_analysis.md
    pause
    exit /b 1
)

echo [2/4] Converting source_code_function_guide.md to HTML...
pandoc -s -N --toc --toc-depth=3 --katex=assets/ -H header.html -B navbar.html -o "%OUTPUT_DIR%\source_code_function_guide.html" source_code_function_guide.md
if errorlevel 1 (
    echo [FAIL] Error converting source_code_function_guide.md
    pause
    exit /b 1
)

echo [3/4] Converting beginner_sbs_guide.md to HTML...
pandoc -s -N --toc --toc-depth=3 --katex=assets/ -H header.html -B navbar.html -o "%OUTPUT_DIR%\beginner_sbs_guide.html" beginner_sbs_guide.md
if errorlevel 1 (
    echo [FAIL] Error converting beginner_sbs_guide.md
    pause
    exit /b 1
)

echo [4/4] Converting walkthrough.md to HTML...
pandoc -s -N --toc --toc-depth=3 --katex=assets/ -H header.html -B navbar.html -o "%OUTPUT_DIR%\walkthrough.html" walkthrough.md
if errorlevel 1 (
    echo [FAIL] Error converting walkthrough.md
    pause
    exit /b 1
)

echo Generating index.html portal...
copy /Y "%OUTPUT_DIR%\foc_code_analysis.html" "%OUTPUT_DIR%\index.html" >nul

echo.
echo =======================================================
echo   HTML Docs Generated Successfully in commit\html_docs!
echo =======================================================
echo Output directory: %OUTPUT_DIR%
echo Files:
echo  - %OUTPUT_DIR%\index.html
echo  - %OUTPUT_DIR%\code_walkthrough.html
echo  - %OUTPUT_DIR%\foc_code_analysis.html
echo  - %OUTPUT_DIR%\source_code_function_guide.html
echo  - %OUTPUT_DIR%\beginner_sbs_guide.html
echo  - %OUTPUT_DIR%\walkthrough.html
echo.

if "%1"=="/q" goto finish
if "%1"=="-q" goto finish
if "%1"=="/noopen" goto finish

set /p OPEN_BROWSER="Open index.html in default browser? [Y/N]: "
if /i "%OPEN_BROWSER%"=="N" goto finish
start "" "%OUTPUT_DIR%\index.html"

:finish
endlocal
