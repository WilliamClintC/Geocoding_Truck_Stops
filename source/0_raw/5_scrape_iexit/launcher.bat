@echo off
echo 🚀 iExit Batch Processor Launcher
echo =====================================
echo.
echo This script will:
echo 1. Change to this script directory
echo 2. Start the batch processor launcher
echo.

cd /d "%~dp0"

echo 📁 Changed to: %CD%
echo.

echo 🎯 Starting batch launcher...
node run_batch_processor.js

echo.
echo 🎯 If tests passed, you can now run:
echo    node run_batch_processor.js
echo.
echo 📋 Available commands:
echo    node run_batch_processor.js     - Start fresh batch processing
echo    node resume_batch_processor.js  - Resume interrupted processing
echo    node analyze_batch_data.js      - Analyze collected data
echo    node retry_launcher.js          - Retry failed URLs from progress file
echo.

pause
