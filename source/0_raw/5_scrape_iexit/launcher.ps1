# iExit Batch Processor Launcher (PowerShell)
Write-Host "🚀 iExit Batch Processor Launcher" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "This script will:" -ForegroundColor Yellow
Write-Host "1. Change to this script directory" -ForegroundColor Yellow
Write-Host "2. Start the batch processor launcher" -ForegroundColor Yellow
Write-Host "3. Show available commands" -ForegroundColor Yellow
Write-Host ""

$targetDir = $PSScriptRoot
Set-Location -Path $targetDir

Write-Host "📁 Changed to: $PWD" -ForegroundColor Cyan
Write-Host ""

Write-Host "🎯 Starting batch launcher..." -ForegroundColor Yellow
& node run_batch_processor.js

Write-Host ""
Write-Host "🎯 If tests passed, you can now run:" -ForegroundColor Green
Write-Host "   node run_batch_processor.js" -ForegroundColor White
Write-Host ""
Write-Host "📋 Available commands:" -ForegroundColor Cyan
Write-Host "   node run_batch_processor.js     - Start fresh batch processing" -ForegroundColor White
Write-Host "   node resume_batch_processor.js  - Resume interrupted processing" -ForegroundColor White
Write-Host "   node analyze_batch_data.js      - Analyze collected data" -ForegroundColor White
Write-Host "   node retry_launcher.js          - Retry failed URLs from progress file" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to continue"
