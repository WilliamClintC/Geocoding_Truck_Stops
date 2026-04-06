/**
 * Standalone retry script for failed URLs
 * This script reads the failed URLs from batch_progress.json and attempts to redownload them
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { CoordinateScraper } = require('./3_coordinate_scraper');
const BATCH_CONFIG = require('./batch_config');

class FailedUrlRetry {
    constructor() {
        this.progressFile = path.join(__dirname, 'batch_output', 'batch_progress.json');
        this.outputDir = path.join(__dirname, 'batch_output');
        this.scraper = null;
        this.browserConfig = null;
        this.successfulRetries = [];
        this.permanentFailures = [];
    }

    // Function to play system sound/bell
    playNotificationSound() {
        try {
            process.stdout.write('\x07');
            
            if (process.platform === 'win32') {
                try {
                    const { exec } = require('child_process');
                    exec('powershell -c "[console]::beep(800,300)"', (error) => {
                        if (error) {
                            console.log('🔔 Bell notification sent (PowerShell beep failed)');
                        } else {
                            console.log('🔔 Sound notification played');
                        }
                    });
                } catch (error) {
                    console.log('🔔 Bell notification sent (system sound unavailable)');
                }
            } else {
                console.log('🔔 Bell notification sent');
            }
        } catch (error) {
            console.log('🔔 Notification attempted');
        }
    }

    // Load failed URLs from progress file and filter genuine failures
    loadFailedUrls() {
        console.log('📁 Loading failed URLs from batch progress...');
        
        if (!fs.existsSync(this.progressFile)) {
            console.log('❌ No batch progress file found at:', this.progressFile);
            console.log('💡 Make sure you have run the batch processor first');
            return [];
        }
        
        try {
            const progressData = JSON.parse(fs.readFileSync(this.progressFile, 'utf8'));
            const allFailedUrls = progressData.failedUrls || [];
            
            console.log(`📊 Found ${allFailedUrls.length} total failed entries`);
            
            if (allFailedUrls.length === 0) {
                console.log('✅ No failed URLs found - all entries were processed successfully!');
                return [];
            }
            
            // Filter out URLs that failed due to "no exits found" (legitimate empty pages)
            const genuineFailures = allFailedUrls.filter(entry => {
                // Check if this was a genuine technical failure vs empty page
                const hasNoExitsReason = entry.reason && (
                    entry.reason.includes('No exits found') ||
                    entry.reason.includes('no exit data') ||
                    entry.reason.includes('empty page') ||
                    entry.reason.includes('No exit information found')
                );
                
                // If it has a "no exits" reason, it's not a genuine failure
                return !hasNoExitsReason;
            });
            
            const legitimateEmptyPages = allFailedUrls.length - genuineFailures.length;
            
            console.log(`🔍 Analysis of failed entries:`);
            console.log(`   ✅ Legitimate empty pages: ${legitimateEmptyPages}`);
            console.log(`   ❌ Genuine failures to retry: ${genuineFailures.length}`);
            
            if (legitimateEmptyPages > 0) {
                console.log('\n📋 Legitimate empty pages (will NOT be retried):');
                allFailedUrls.filter(entry => {
                    const hasNoExitsReason = entry.reason && (
                        entry.reason.includes('No exits found') ||
                        entry.reason.includes('no exit data') ||
                        entry.reason.includes('empty page') ||
                        entry.reason.includes('No exit information found')
                    );
                    return hasNoExitsReason;
                }).forEach((entry, index) => {
                    console.log(`  ${index + 1}. ${entry.state} - ${entry.highway} (${entry.reason})`);
                });
            }
            
            if (genuineFailures.length === 0) {
                console.log('\n🎉 No genuine failures found - all "failed" entries were legitimate empty pages!');
                return [];
            }
            
            console.log('\n📋 Genuine failures (will be retried):');
            genuineFailures.forEach((entry, index) => {
                console.log(`  ${index + 1}. ${entry.state} - ${entry.highway} (Index: ${entry.index})`);
                console.log(`     URL: ${entry.url}`);
                console.log(`     Reason: ${entry.reason || 'Network/Authentication error'}`);
                console.log(`     Failed at: ${new Date(entry.timestamp).toLocaleString()}`);
            });
            
            return genuineFailures;
            
        } catch (error) {
            console.error('❌ Error reading progress file:', error.message);
            return [];
        }
    }

    // Check for session expiration (copied from batch_processor.js)
    async checkSessionExpiry() {
        // Check if browser/page is available before attempting session check
        if (!this.scraper || !this.scraper.page || !this.scraper.browser) {
            console.log('🔍 Skipping session check - browser not initialized');
            return false;
        }

        // Check if page is still attached/valid
        try {
            // Try a simple operation to test if page is responsive
            await this.scraper.page.evaluate(() => true);
        } catch (error) {
            if (error.message.includes('detached') || error.message.includes('closed')) {
                console.log('🔍 Skipping session check - browser page is detached/closed');
                return false;
            }
            // If it's a different error, continue with session check
        }

        console.log('🔍 Checking for session expiration...');

        // Check for page-based expiration if scraper exists
        if (this.scraper && this.scraper.page) {
            try {
                const sessionStatus = await this.scraper.page.evaluate(() => {
                    const bodyText = document.body.textContent.toLowerCase();
                    const pageTitle = document.title.toLowerCase();

                    // Check for session expiration indicators
                    const sessionExpiredIndicators = [
                        'verifying you are human',
                        'checking your browser',
                        'captcha',
                        'verification is taking longer than expected',
                        'needs to review the security of your connection',
                        'enable javascript and cookies to continue',
                        'challenge-error-text',
                        'cf-turnstile-response'
                    ];

                    // Check for the specific HTML structure from the user's example
                    const hasMainContent = document.querySelector('.main-content');
                    const hasVerificationMessage = document.querySelector('#bkObw1');
                    const hasLoadingRing = document.querySelector('.lds-ring');

                    const hasSessionExpiredText = sessionExpiredIndicators.some(indicator => 
                        bodyText.includes(indicator) || pageTitle.includes(indicator)
                    );

                    return {
                        isSessionExpired: hasSessionExpiredText || (hasMainContent && hasVerificationMessage),
                        hasMainContent: !!hasMainContent,
                        hasVerificationMessage: !!hasVerificationMessage,
                        hasLoadingRing: !!hasLoadingRing,
                        bodyText: bodyText.substring(0, 500) // First 500 chars for debugging
                    };
                });

                if (sessionStatus.isSessionExpired) {
                    console.log('🚨 Session expired based on page content');
                    console.log('   - Has main content:', sessionStatus.hasMainContent);
                    console.log('   - Has verification message:', sessionStatus.hasVerificationMessage);
                    console.log('   - Has loading ring:', sessionStatus.hasLoadingRing);
                    console.log('   - Body text preview:', sessionStatus.bodyText.substring(0, 200) + '...');
                    
                    // Play notification sound
                    this.playNotificationSound();
                    
                    return true;
                } else {
                    console.log('✅ Session is valid');
                }
            } catch (error) {
                console.log('⚠️  Could not check page for session expiration:', error.message);
            }
        }

        return false;
    }

    // Request new session configuration from user
    async requestSessionRefresh() {
        // Play notification sound to alert user
        this.playNotificationSound();
        
        console.log('\n🚨🔔 SESSION REFRESH REQUIRED 🔔🚨');
        console.log('='.repeat(50));
        console.log('🎵 SOUND NOTIFICATION: New cURL command needed!');
        console.log('The session has expired and needs to be refreshed.');
        console.log('Please provide a new curl command to continue.');
        console.log('');
        console.log('How to get a fresh curl command:');
        console.log('1. Open your browser and go to https://www.iexitapp.com');
        console.log('2. Navigate to any exit page');
        console.log('3. Open Developer Tools (F12)');
        console.log('4. Go to the Network tab');
        console.log('5. Refresh the page');
        console.log('6. Right-click on the main request → Copy → Copy as cURL');
        console.log('7. Paste the command below');
        console.log('');
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        return new Promise((resolve) => {
            rl.question('Do you want to continue with session refresh? (y/n): ', (answer) => {
                if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                    rl.question('Please paste the new curl command: ', (curlCommand) => {
                        rl.close();
                        
                        if (curlCommand.trim()) {
                            console.log('✅ New curl command received, parsing...');
                            const config = this.parseCurlCommand(curlCommand);
                            this.browserConfig = config;
                            console.log(`📋 Parsed ${Object.keys(config.headers).length} headers`);
                            console.log(`🍪 Found ${config.cookies.length} cookies`);
                            resolve(config);
                        } else {
                            console.log('❌ No curl command provided');
                            resolve(false);
                        }
                    });
                } else {
                    rl.close();
                    resolve(false); // User wants to stop
                }
            });
        });
    }

    // Parse curl command to extract headers and cookies
    parseCurlCommand(curlCommand) {
        const config = {
            headers: {},
            cookies: []
        };
        
        // Extract headers (improved parsing)
        const headerMatches = curlCommand.match(/-H\s+['"]([^'"]+)['"]|\s--header\s+['"]([^'"]+)['"]/g);
        if (headerMatches) {
            headerMatches.forEach(match => {
                const headerContent = match.replace(/-H\s+['"]|--header\s+['"]|['"]/g, '');
                const [key, ...valueParts] = headerContent.split(':');
                if (key && valueParts.length > 0) {
                    config.headers[key.trim().toLowerCase()] = valueParts.join(':').trim();
                }
            });
        }
        
        // Extract cookies (improved parsing)
        const cookieMatch = curlCommand.match(/-b\s+['"]([^'"]+)['"]|\s--cookie\s+['"]([^'"]+)['"]/);
        if (cookieMatch) {
            const cookieString = cookieMatch[1] || cookieMatch[2];
            const cookies = cookieString.split(';').map(cookie => {
                const [name, value] = cookie.trim().split('=');
                return { 
                    name: name.trim(), 
                    value: value ? value.trim() : '',
                    domain: '.iexitapp.com', // Add domain for iExit website
                    path: '/' // Add path
                };
            });
            config.cookies = cookies;
        }
        
        return config;
    }

    // Get curl command from user
    async getCurlCommand() {
        console.log('\n🔧 CURL COMMAND SETUP FOR RETRY');
        console.log('='.repeat(50));
        console.log('To retry the failed URLs, we need a fresh curl command with proper authentication.');
        console.log('');
        console.log('How to get a curl command:');
        console.log('1. Open your browser and go to https://www.iexitapp.com');
        console.log('2. Navigate to any exit page (e.g., an Alabama I-10 exit)');
        console.log('3. Open Developer Tools (F12)');
        console.log('4. Go to the Network tab');
        console.log('5. Refresh the page');
        console.log('6. Right-click on the main request → Copy → Copy as cURL');
        console.log('7. Paste the command below');
        console.log('');
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        return new Promise((resolve) => {
            rl.question('Please paste your curl command (or press Enter to use default config): ', (curlCommand) => {
                rl.close();
                
                if (curlCommand.trim()) {
                    console.log('✅ Curl command received, parsing...');
                    const config = this.parseCurlCommand(curlCommand);
                    this.browserConfig = config;
                    console.log(`📋 Parsed ${Object.keys(config.headers).length} headers`);
                    console.log(`🍪 Found ${config.cookies.length} cookies`);
                } else {
                    console.log('⚠️  Using default configuration (may have limited success)');
                    this.browserConfig = null;
                }
                
                resolve();
            });
        });
    }

    // Sleep function
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Save individual result to CSV file
    async saveToIndividualFile(exitData, metadata) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const cleanState = metadata.state.replace(/[^a-zA-Z0-9]/g, '');
        const cleanHighway = metadata.highway.replace(/[^a-zA-Z0-9]/g, '');
        
        const filename = `iexit_${cleanState}_${cleanHighway}_RETRY_${timestamp}.csv`;
        const filepath = path.join(this.outputDir, filename);
        
        // Create CSV content
        const headers = [
            'Exit_Number', 'Exit_Name', 'State', 'Highway', 'Direction', 
            'Latitude', 'Longitude', 'Services', 'Source_URL', 'Processing_Timestamp',
            'Status'
        ];
        
        let csvContent = headers.join(',') + '\n';
        
        exitData.forEach(exit => {
            const row = [
                `"${exit.exitNumber || ''}"`,
                `"${exit.exitName || ''}"`,
                `"${metadata.state}"`,
                `"${metadata.highway}"`,
                `"${exit.direction || ''}"`,
                exit.latitude || '',
                exit.longitude || '',
                `"${exit.services ? exit.services.join('; ') : ''}"`,
                `"${metadata.sourceUrl}"`,
                `"${metadata.processingTimestamp}"`,
                `"RETRY_SUCCESS"`
            ];
            csvContent += row.join(',') + '\n';
        });
        
        fs.writeFileSync(filepath, csvContent);
        console.log(`📁 Saved retry result to: ${filename}`);
        
        return filename;
    }

    // Retry failed URLs
    async retryFailedUrls(failedUrls) {
        console.log('\n🔄 STARTING RETRY PROCESS');
        console.log('='.repeat(50));
        console.log(`🎯 Retrying ${failedUrls.length} failed URLs`);
        console.log('Each URL will be attempted up to 3 times with fresh browser sessions');
        console.log('');
        
        const maxRetryAttempts = 3;
        
        // Initial session check before starting retries
        if (this.scraper) {
            if (await this.checkSessionExpiry()) {
                console.log('🚨 Session expired before starting retries');
                
                const refreshResult = await this.requestSessionRefresh();
                if (!refreshResult) {
                    console.log('❌ Session refresh cancelled. Cannot proceed with retries.');
                    return;
                }
            }
        }
        
        for (let i = 0; i < failedUrls.length; i++) {
            const failedEntry = failedUrls[i];
            console.log(`\n🔄 Retry ${i + 1}/${failedUrls.length}: ${failedEntry.state} - ${failedEntry.highway}`);
            console.log(`🌐 URL: ${failedEntry.url}`);
            console.log(`📊 Original Index: ${failedEntry.index}`);
            
            let retrySuccess = false;
            
            for (let attempt = 1; attempt <= maxRetryAttempts; attempt++) {
                console.log(`   🎯 Attempt ${attempt}/${maxRetryAttempts}`);
                
                try {
                    // Initialize fresh browser for each retry
                    if (!this.scraper) {
                        this.scraper = new CoordinateScraper(this.browserConfig);
                    }
                    
                    // Always use fresh browser for retries
                    if (this.scraper.browser) {
                        await this.scraper.browser.close();
                    }
                    await this.scraper.initBrowser();
                    
                    // Check for session expiration before attempting to scrape
                    if (await this.checkSessionExpiry()) {
                        console.log('🚨 Session expired during retry attempt');
                        
                        // Request session refresh
                        const refreshResult = await this.requestSessionRefresh();
                        
                        if (!refreshResult) {
                            console.log('❌ Session refresh cancelled or failed. Stopping retry process.');
                            return;
                        }
                        
                        // Reinitialize scraper with new session
                        if (this.scraper.browser) {
                            await this.scraper.browser.close();
                        }
                        this.scraper = new CoordinateScraper(this.browserConfig);
                        await this.scraper.initBrowser();
                    }
                    
                    // Attempt to process the entry
                    const stateInfo = {
                        state: failedEntry.state,
                        highway: failedEntry.highway
                    };
                    
                    const result = await this.scraper.scrapeExitCoordinates(failedEntry.url, stateInfo);
                    
                    if (result && result.exitData && result.exitData.length > 0) {
                        console.log(`   ✅ Retry successful! Found ${result.exitData.length} exits`);
                        
                        // Save to individual CSV file
                        const metadata = {
                            state: failedEntry.state,
                            highway: failedEntry.highway,
                            sourceUrl: failedEntry.url,
                            processingTimestamp: new Date().toISOString(),
                            originalIndex: failedEntry.index
                        };
                        
                        const filename = await this.saveToIndividualFile(result.exitData, metadata);
                        
                        this.successfulRetries.push({
                            ...failedEntry,
                            retryFilename: filename,
                            exitCount: result.exitData.length,
                            retryTimestamp: new Date().toISOString()
                        });
                        
                        retrySuccess = true;
                        break; // Success, exit retry loop
                        
                    } else if (result && result.exitData && result.exitData.length === 0) {
                        // Successfully accessed page but found no exits
                        // Let's verify this is legitimate by checking page content
                        console.log(`   🔍 No exits found - verifying page is accessible...`);
                        
                        try {
                            const pageCheck = await this.scraper.page.evaluate(() => {
                                const bodyText = document.body.innerText.toLowerCase();
                                const title = document.title.toLowerCase();
                                
                                // Check for error indicators
                                const errorIndicators = [
                                    'error',
                                    'not found',
                                    'page not available',
                                    'access denied',
                                    'forbidden',
                                    'session expired',
                                    'verify you are human',
                                    'cloudflare'
                                ];
                                
                                const hasError = errorIndicators.some(indicator => 
                                    bodyText.includes(indicator) || title.includes(indicator)
                                );
                                
                                // Check for legitimate iExit page structure
                                const hasIExitStructure = document.querySelector('.main-content') ||
                                                         document.querySelector('.exit-info') ||
                                                         bodyText.includes('iexit') ||
                                                         bodyText.includes('interstate') ||
                                                         bodyText.includes('highway');
                                
                                return {
                                    hasError,
                                    hasIExitStructure,
                                    bodyLength: document.body.innerText.length,
                                    title: document.title,
                                    url: window.location.href
                                };
                            });
                            
                            if (pageCheck.hasError || !pageCheck.hasIExitStructure) {
                                console.log(`   ⚠️  Page shows error indicators or invalid structure`);
                                console.log(`      Title: ${pageCheck.title}`);
                                console.log(`      Has errors: ${pageCheck.hasError}`);
                                console.log(`      Has iExit structure: ${pageCheck.hasIExitStructure}`);
                                // This is likely a genuine failure, continue retry attempts
                            } else {
                                console.log(`   ✅ Confirmed legitimate empty page (no exits on this highway segment)`);
                                
                                // Mark as successful but with 0 exits
                                this.successfulRetries.push({
                                    ...failedEntry,
                                    retryFilename: null,
                                    exitCount: 0,
                                    retryTimestamp: new Date().toISOString(),
                                    legitimateEmpty: true
                                });
                                
                                retrySuccess = true;
                                break; // Success (empty page confirmed), exit retry loop
                            }
                            
                        } catch (pageCheckError) {
                            console.log(`   ⚠️  Could not verify page content: ${pageCheckError.message}`);
                            // Continue with retry attempts
                        }
                        
                    } else {
                        console.log(`   ⚠️  Attempt ${attempt} - page could not be accessed properly`);
                    }
                    
                } catch (error) {
                    console.log(`   ❌ Attempt ${attempt} failed: ${error.message}`);
                    
                    // Check if error indicates session expiration
                    const sessionRelatedErrors = [
                        'verification',
                        'captcha',
                        'session',
                        'expired',
                        'cloudflare',
                        'challenge',
                        'timeout',
                        'forbidden',
                        'unauthorized'
                    ];
                    
                    const isSessionError = sessionRelatedErrors.some(keyword => 
                        error.message.toLowerCase().includes(keyword)
                    );
                    
                    if (isSessionError) {
                        console.log(`   🚨 Error appears to be session-related, checking session status...`);
                        
                        if (await this.checkSessionExpiry()) {
                            console.log('   🔄 Session expired confirmed, requesting refresh...');
                            
                            const refreshResult = await this.requestSessionRefresh();
                            if (!refreshResult) {
                                console.log('   ❌ Session refresh cancelled. Stopping retry process.');
                                return;
                            }
                            
                            // Reinitialize scraper and skip the remaining retry delay
                            if (this.scraper && this.scraper.browser) {
                                await this.scraper.browser.close();
                            }
                            this.scraper = new CoordinateScraper(this.browserConfig);
                            
                            console.log('   ✅ Session refreshed, retrying this attempt...');
                            continue; // Skip to next attempt without delay
                        }
                    }
                    
                    if (attempt < maxRetryAttempts) {
                        console.log(`   ⏱️  Waiting 5 seconds before next attempt...`);
                        await this.sleep(5000);
                    }
                }
            }
            
            if (!retrySuccess) {
                console.log(`   💀 All ${maxRetryAttempts} retry attempts failed`);
                this.permanentFailures.push(failedEntry);
            }
            
            // Small delay between different URLs
            if (i < failedUrls.length - 1) {
                console.log(`⏱️  Waiting 3 seconds before next retry...`);
                await this.sleep(3000);
            }
        }
        
        // Close browser after retries
        if (this.scraper && this.scraper.browser) {
            await this.scraper.browser.close();
        }
    }

    // Update progress file to remove successfully retried URLs
    updateProgressFile() {
        if (this.successfulRetries.length === 0) {
            console.log('📝 No progress file updates needed');
            return;
        }
        
        try {
            const progressData = JSON.parse(fs.readFileSync(this.progressFile, 'utf8'));
            
            // Remove successfully retried URLs from failedUrls
            const successfulIndexes = this.successfulRetries.map(retry => retry.index);
            progressData.failedUrls = progressData.failedUrls.filter(
                failed => !successfulIndexes.includes(failed.index)
            );
            
            // Update processed count
            progressData.processedCount += this.successfulRetries.length;
            
            // Save updated progress
            fs.writeFileSync(this.progressFile, JSON.stringify(progressData, null, 2));
            console.log('📝 Updated progress file with retry results');
            
        } catch (error) {
            console.error('❌ Error updating progress file:', error.message);
        }
    }

    // Generate retry summary
    generateRetrySummary() {
        const retryResultsFile = path.join(this.outputDir, `retry_results_${Date.now()}.json`);
        
        const successfulWithData = this.successfulRetries.filter(r => r.exitCount > 0);
        const legitimateEmptyPages = this.successfulRetries.filter(r => r.legitimateEmpty);
        
        const summary = {
            retryTimestamp: new Date().toISOString(),
            totalRetryAttempts: this.successfulRetries.length + this.permanentFailures.length,
            successfulRetries: this.successfulRetries.length,
            successfulWithData: successfulWithData.length,
            legitimateEmptyPages: legitimateEmptyPages.length,
            permanentFailures: this.permanentFailures.length,
            successDetails: this.successfulRetries,
            failureDetails: this.permanentFailures
        };
        
        fs.writeFileSync(retryResultsFile, JSON.stringify(summary, null, 2));
        
        console.log('\n📊 RETRY PROCESS COMPLETE!');
        console.log('='.repeat(60));
        console.log(`✅ Total successful retries: ${this.successfulRetries.length}`);
        console.log(`   📁 Found data: ${successfulWithData.length}`);
        console.log(`   📄 Legitimate empty pages: ${legitimateEmptyPages.length}`);
        console.log(`❌ Genuine failures (still failed): ${this.permanentFailures.length}`);
        console.log(`📁 Retry summary saved to: ${path.basename(retryResultsFile)}`);
        
        if (successfulWithData.length > 0) {
            console.log('\n✅ Successfully retried with data found:');
            successfulWithData.forEach((entry, index) => {
                console.log(`  ${index + 1}. ${entry.state} - ${entry.highway} (${entry.exitCount} exits)`);
                console.log(`     📁 File: ${entry.retryFilename}`);
            });
        }
        
        if (legitimateEmptyPages.length > 0) {
            console.log('\n📄 Confirmed legitimate empty pages:');
            legitimateEmptyPages.forEach((entry, index) => {
                console.log(`  ${index + 1}. ${entry.state} - ${entry.highway} (no exits on this highway segment)`);
            });
        }
        
        if (this.permanentFailures.length > 0) {
            console.log('\n❌ Genuine failures that still need attention:');
            this.permanentFailures.forEach((entry, index) => {
                console.log(`  ${index + 1}. ${entry.state} - ${entry.highway}`);
                console.log(`     🌐 URL: ${entry.url}`);
                console.log(`     💡 This may need manual investigation`);
            });
        }
        
        // Play notification sound
        this.playNotificationSound();
        console.log('\n🔔 Retry process complete! Check the results above.');
        
        if (this.permanentFailures.length === 0) {
            console.log('\n🎉 All previously failed URLs have been resolved!');
            console.log('   Either they contained data or were confirmed as legitimate empty pages.');
        }
    }

    // Main retry function
    async run() {
        console.log('🔄 iExit Failed URL Retry Tool');
        console.log('='.repeat(50));
        console.log('This tool will retry all failed URLs from the previous batch processing run');
        console.log('');
        
        // Load failed URLs
        const failedUrls = this.loadFailedUrls();
        
        if (failedUrls.length === 0) {
            console.log('🎉 No failed URLs to retry. All done!');
            return;
        }
        
        // Get user confirmation
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const confirmRetry = await new Promise((resolve) => {
            rl.question(`\nDo you want to retry these ${failedUrls.length} failed URLs? (y/n): `, resolve);
        });
        
        if (confirmRetry.toLowerCase() !== 'y' && confirmRetry.toLowerCase() !== 'yes') {
            rl.close();
            console.log('🛑 Retry cancelled');
            return;
        }
        
        rl.close();
        
        // Get curl command for authentication
        await this.getCurlCommand();
        
        // Start retry process
        await this.retryFailedUrls(failedUrls);
        
        // Update progress file
        this.updateProgressFile();
        
        // Generate summary
        this.generateRetrySummary();
    }
}

// Run the retry tool
if (require.main === module) {
    const retryTool = new FailedUrlRetry();
    retryTool.run().catch(error => {
        console.error('❌ Fatal error in retry tool:', error.message);
        process.exit(1);
    });
}

module.exports = { FailedUrlRetry };
