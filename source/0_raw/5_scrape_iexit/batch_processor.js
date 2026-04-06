const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserAgent = require('user-agents');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { CoordinateScraper } = require('./3_coordinate_scraper');
const BATCH_CONFIG = require('./batch_config');

// Add stealth plugin
puppeteer.use(StealthPlugin());

class BatchProcessor {
    constructor() {
        this.progress = {
            currentBatch: 0,
            processedCount: 0,
            totalCount: 0,
            failedUrls: [],
            sessionStartTime: Date.now(),
            lastSuccessfulRequest: Date.now()
        };
        this.stateData = [];
        this.allResults = [];
        this.scraper = null;
        this.sessionExpired = false;
        this.browserConfig = null; // Store browser configuration
    }

    // Function to play system sound/bell
    playNotificationSound() {
        try {
            // System bell character - works on most systems
            process.stdout.write('\x07');
            
            // For Windows, we can also try to play a system sound
            if (process.platform === 'win32') {
                try {
                    const { exec } = require('child_process');
                    // Play Windows system sound asynchronously
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

    // Get initial curl command from user
    async getInitialCurlCommand() {
        console.log('\n🔧 CURL COMMAND SETUP');
        console.log('='.repeat(40));
        console.log('To scrape the iExit website, we need a curl command with proper headers.');
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
                
                this.progress.sessionStartTime = Date.now();
                this.progress.lastSuccessfulRequest = Date.now();
                this.sessionExpired = false;
                
                resolve();
            });
        });
    }

    // Initialize batch processing
    async initialize() {
        console.log('🚀 Initializing Batch Processor...');
        
        // Create output directory
        if (!fs.existsSync(BATCH_CONFIG.OUTPUT_DIR)) {
            fs.mkdirSync(BATCH_CONFIG.OUTPUT_DIR, { recursive: true });
            console.log(`📁 Created output directory: ${BATCH_CONFIG.OUTPUT_DIR}`);
        }

        // Get initial curl command
        await this.getInitialCurlCommand();

        // Load states data
        this.loadStatesData();
        
        // Load previous progress if exists
        this.loadProgress();
        
        // Initialize combined CSV file only if using row-by-row writing
        if (BATCH_CONFIG.USE_ROW_BY_ROW_WRITING) {
            this.initializeCombinedCsv();
            console.log('📝 Using row-by-row writing mode');
        } else {
            console.log('📦 Using batch file combination mode (recommended)');
        }
        
        console.log(`✅ Batch processor initialized`);
        console.log(`📊 Total entries to process: ${this.stateData.length}`);
        console.log(`📊 Already processed: ${this.progress.processedCount}`);
        console.log(`📊 Remaining: ${this.stateData.length - this.progress.processedCount}`);
        console.log(`🔄 Redundancy overlap: ${BATCH_CONFIG.REDUNDANCY_OVERLAP || 0} entries`);
    }

    // Load states data from CSV
    loadStatesData() {
        console.log('📄 Loading States.csv file...');
        
        try {
            const csvContent = fs.readFileSync(BATCH_CONFIG.STATES_CSV_PATH, 'utf8');
            const lines = csvContent.split('\n');
            const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
            
            this.stateData = [];
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    // Parse CSV line handling quoted fields
                    const values = [];
                    let currentValue = '';
                    let inQuotes = false;
                    
                    for (let j = 0; j < line.length; j++) {
                        const char = line[j];
                        if (char === '"') {
                            inQuotes = !inQuotes;
                        } else if (char === ',' && !inQuotes) {
                            values.push(currentValue.trim());
                            currentValue = '';
                        } else {
                            currentValue += char;
                        }
                    }
                    values.push(currentValue.trim()); // Add the last value
                    
                    // Create state object
                    const stateObj = {};
                    headers.forEach((header, index) => {
                        stateObj[header] = values[index] ? values[index].replace(/"/g, '') : '';
                    });
                    
                    // Only add entries with valid Exit_Link
                    if (stateObj.Exit_Link && stateObj.Exit_Link.trim() !== '' && stateObj.Exit_Link !== 'No exits found') {
                        this.stateData.push(stateObj);
                    }
                }
            }
            
            this.progress.totalCount = this.stateData.length;
            console.log(`✅ Loaded ${this.stateData.length} valid exit links from states.csv`);
            
        } catch (error) {
            console.error('❌ Error loading states.csv:', error.message);
            throw error;
        }
    }

    // Load previous progress
    loadProgress() {
        const progressPath = path.join(BATCH_CONFIG.OUTPUT_DIR, BATCH_CONFIG.PROGRESS_FILE);
        
        if (fs.existsSync(progressPath)) {
            try {
                const progressData = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
                this.progress = { ...this.progress, ...progressData };
                console.log(`📊 Loaded previous progress: ${this.progress.processedCount}/${this.progress.totalCount} completed`);
            } catch (error) {
                console.log('⚠️  Could not load previous progress, starting fresh');
            }
        }
    }

    // Save progress
    saveProgress() {
        const progressPath = path.join(BATCH_CONFIG.OUTPUT_DIR, BATCH_CONFIG.PROGRESS_FILE);
        try {
            fs.writeFileSync(progressPath, JSON.stringify(this.progress, null, 2));
            console.log(`💾 Progress saved: ${this.progress.processedCount}/${this.progress.totalCount}`);
        } catch (error) {
            console.error('❌ Error saving progress:', error.message);
        }
    }

    // Initialize combined CSV file
    initializeCombinedCsv() {
        const csvPath = path.join(BATCH_CONFIG.OUTPUT_DIR, BATCH_CONFIG.COMBINED_OUTPUT_FILE);
        
        // Only create header if file doesn't exist
        if (!fs.existsSync(csvPath)) {
            const headers = [
                'batch_id',
                'processing_timestamp',
                'state',
                'highway',
                'source_url',
                'exit_id',
                'title',
                'exit_name',
                'exit_description',
                'exit_location',
                'iexit_detail_link',
                'latitude',
                'longitude',
                'google_maps_link',
                'direction',
                'processing_status',
                'error_message'
            ];
            
            fs.writeFileSync(csvPath, headers.join(',') + '\n');
            console.log(`📄 Created combined CSV file: ${csvPath}`);
        }
    }

    // Enhanced session expiration check with comprehensive detection
    async checkSessionExpiry() {
        // Note: Time-based expiration removed - only checking page content now
        
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
                    this.sessionExpired = true;
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
                            
                            this.progress.sessionStartTime = Date.now();
                            this.progress.lastSuccessfulRequest = Date.now();
                            this.sessionExpired = false;
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

    // Simple curl command parser
    parseCurlCommand(curlCommand) {
        const config = {
            headers: {},
            cookies: []
        };
        
        // Extract headers
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
        
        // Extract cookies
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

    // Process a single batch
    async processBatch(batchIndex, adjustedProcessedCount = null) {
        const batchStart = batchIndex * BATCH_CONFIG.BATCH_SIZE;
        const batchEnd = Math.min(batchStart + BATCH_CONFIG.BATCH_SIZE, this.stateData.length);
        const batchData = this.stateData.slice(batchStart, batchEnd);
        
        console.log(`\n📦 Processing Batch ${batchIndex + 1}`);
        console.log(`📊 Items ${batchStart + 1} to ${batchEnd} of ${this.stateData.length}`);
        console.log(`🎯 Batch contains ${batchData.length} entries`);
        
        // Initialize scraper with browser configuration (reuse if exists)
        try {
            if (!this.scraper) {
                this.scraper = new CoordinateScraper(this.browserConfig);
            }
            
            // Always reinitialize browser for each batch to ensure clean state
            if (this.scraper.browser) {
                await this.scraper.browser.close();
            }
            
            await this.scraper.initBrowser();
            console.log('✅ Browser initialized for batch processing');
        } catch (error) {
            console.error('❌ Failed to initialize browser:', error.message);
            return false;
        }

        // Check session expiry AFTER browser is initialized
        if (await this.checkSessionExpiry()) {
            const refreshResult = await this.requestSessionRefresh();
            if (refreshResult === false) {
                console.log('🛑 User stopped the process');
                return false;
            }
        }

        // Process each entry in the batch
        for (let i = 0; i < batchData.length; i++) {
            const entry = batchData[i];
            const globalIndex = batchStart + i;
            
            // Use adjustedProcessedCount if provided, otherwise use the original logic
            const skipThreshold = adjustedProcessedCount !== null ? adjustedProcessedCount : this.progress.processedCount;
            
            // Skip if already processed (but allow redundancy if adjustedProcessedCount is provided)
            if (globalIndex < skipThreshold) {
                console.log(`⏭️  Skipping already processed item ${globalIndex + 1}: ${entry.State} - ${entry.Highway}`);
                continue;
            }
            
            // Check if this is a redundant entry (being reprocessed for safety)
            if (adjustedProcessedCount !== null && globalIndex < this.progress.processedCount) {
                console.log(`🔄 Reprocessing item ${globalIndex + 1}/${this.stateData.length} for redundancy: ${entry.State} - ${entry.Highway}`);
            } else {
                console.log(`\n🔄 Processing item ${globalIndex + 1}/${this.stateData.length}: ${entry.State} - ${entry.Highway}`);
            }
            
            // Check for session expiration before processing each entry
            if (await this.checkSessionExpiry()) {
                console.log('🚨 Session expired during batch processing');
                
                // Request session refresh
                const refreshResult = await this.requestSessionRefresh();
                
                if (!refreshResult) {
                    console.log('❌ Session refresh cancelled or failed. Stopping batch processing.');
                    return false;
                }
                
                // Reinitialize scraper with new session
                if (this.scraper) {
                    if (this.scraper.browser) {
                        await this.scraper.browser.close();
                    }
                    this.scraper.browserConfig = refreshResult;
                    await this.scraper.initBrowser();
                }
                
                console.log('✅ Session refreshed successfully. Continuing batch processing...');
            }

            const result = await this.processEntryWithDirectionHandling(entry, globalIndex);
            
            if (result) {
                // Only increment progress count if we're processing beyond the original processed count
                // This prevents double counting during redundancy reprocessing
                if (globalIndex >= this.progress.processedCount) {
                    this.progress.processedCount++;
                }
                this.progress.lastSuccessfulRequest = Date.now();
            } else {
                // Check if this URL is already in failed list to prevent duplicates
                const alreadyFailed = this.progress.failedUrls.some(failed => failed.url === entry.Exit_Link);
                
                if (!alreadyFailed) {
                    this.progress.failedUrls.push({
                        index: globalIndex,
                        state: entry.State,
                        highway: entry.Highway,
                        url: entry.Exit_Link,
                        timestamp: new Date().toISOString()
                    });
                    console.log(`➕ Added to failed URLs list: ${entry.State} - ${entry.Highway}`);
                } else {
                    console.log(`⚠️  Already in failed URLs list: ${entry.State} - ${entry.Highway}`);
                }
            }
            
            // Save progress after each entry
            this.saveProgress();
            
            // Delay between requests
            if (i < batchData.length - 1) {
                console.log(`⏱️  Waiting ${BATCH_CONFIG.DELAYS.BETWEEN_REQUESTS}ms before next request...`);
                await this.sleep(BATCH_CONFIG.DELAYS.BETWEEN_REQUESTS);
            }
        }
        
        // Close browser after batch
        if (this.scraper && this.scraper.browser) {
            await this.scraper.browser.close();
            console.log('🔒 Browser closed after batch completion');
        }
        
        return true;
    }

    // Process a single entry
    async processEntry(entry, globalIndex) {
        const batchId = Math.floor(globalIndex / BATCH_CONFIG.BATCH_SIZE) + 1;
        const processingTimestamp = new Date().toISOString();
        
        console.log(`🌐 Processing: ${entry.Exit_Link}`);
        
        try {
            // Create state info object
            const stateInfo = {
                state: entry.State,
                highway: entry.Highway
            };
            
            // Scrape exit data with retry logic for navigation errors
            let result = null;
            let retryCount = 0;
            const maxRetries = 2;
            
            while (retryCount <= maxRetries) {
                try {
                    result = await this.scraper.scrapeExitCoordinates(entry.Exit_Link, stateInfo);
                    break; // Success, exit retry loop
                } catch (error) {
                    if (error.message.includes('Navigating frame was detached') || 
                        error.message.includes('Navigation timeout') ||
                        error.message.includes('Protocol error') ||
                        error.message.includes('detached Frame')) {
                        
                        console.log(`⚠️  Navigation error (attempt ${retryCount + 1}/${maxRetries + 1}): ${error.message}`);
                        
                        if (retryCount < maxRetries) {
                            console.log('🔄 Retrying with fresh browser...');
                            
                            // Close and reinitialize browser
                            if (this.scraper.browser) {
                                await this.scraper.browser.close();
                            }
                            await this.scraper.initBrowser();
                            
                            retryCount++;
                            await this.sleep(2000); // Wait 2 seconds before retry
                        } else {
                            throw error; // Re-throw after max retries
                        }
                    } else {
                        throw error; // Re-throw non-navigation errors immediately
                    }
                }
            }
            
            if (result && result.exitData && result.exitData.length > 0) {
                console.log(`✅ Successfully scraped ${result.exitData.length} exits`);
                
                // Add to combined results
                this.appendToCombinedCsv(result.exitData, {
                    batchId,
                    processingTimestamp,
                    state: entry.State,
                    highway: entry.Highway,
                    sourceUrl: entry.Exit_Link,
                    status: 'SUCCESS'
                });
                
                return true;
            } else {
                console.log('⚠️  No data scraped for this entry');
                
                // Add failure record
                this.appendToCombinedCsv([], {
                    batchId,
                    processingTimestamp,
                    state: entry.State,
                    highway: entry.Highway,
                    sourceUrl: entry.Exit_Link,
                    status: 'NO_DATA',
                    errorMessage: 'No exit data found'
                });
                
                return false;
            }
            
        } catch (error) {
            console.error(`❌ Error processing entry: ${error.message}`);
            
            // Add error record
            this.appendToCombinedCsv([], {
                batchId,
                processingTimestamp,
                state: entry.State,
                highway: entry.Highway,
                sourceUrl: entry.Exit_Link,
                status: 'ERROR',
                errorMessage: error.message
            });
            
            return false;
        }
    }

    // Enhanced processing with direction switching browser restart
    async processEntryWithDirectionHandling(entry, globalIndex) {
        const batchId = Math.floor(globalIndex / BATCH_CONFIG.BATCH_SIZE) + 1;
        const processingTimestamp = new Date().toISOString();
        
        console.log(`🌐 Processing with enhanced direction handling: ${entry.Exit_Link}`);
        
        try {
            // Create state info object
            const stateInfo = {
                state: entry.State,
                highway: entry.Highway
            };
            
            // Scrape exit data with enhanced retry logic
            let result = null;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount <= maxRetries) {
                try {
                    result = await this.scraper.scrapeExitCoordinates(entry.Exit_Link, stateInfo);
                    break; // Success, exit retry loop
                } catch (error) {
                    console.log(`⚠️  Error during processing (attempt ${retryCount + 1}/${maxRetries + 1}): ${error.message}`);
                    
                    // Check if it's a session expiration error
                    if (error.message.includes('Session expired') || 
                        error.message.includes('verification') ||
                        error.message.includes('session refresh')) {
                        
                        console.log('🚨 Session expired during processing, requesting refresh...');
                        
                        const refreshResult = await this.requestSessionRefresh();
                        
                        if (!refreshResult) {
                            throw new Error('Session refresh cancelled or failed');
                        }
                        
                        // Update scraper config and reinitialize
                        this.scraper.browserConfig = refreshResult;
                        if (this.scraper.browser) {
                            await this.scraper.browser.close();
                        }
                        await this.scraper.initBrowser();
                        
                        console.log('✅ Session refreshed, retrying...');
                        retryCount++;
                        await this.sleep(2000);
                        continue;
                    }
                    
                    // Handle navigation/browser errors
                    if (error.message.includes('Navigating frame was detached') || 
                        error.message.includes('Navigation timeout') ||
                        error.message.includes('Protocol error') ||
                        error.message.includes('detached Frame') ||
                        error.message.includes('browser restart')) {
                        
                        if (retryCount < maxRetries) {
                            console.log('🔄 Retrying with fresh browser after navigation error...');
                            
                            // Close and reinitialize browser
                            if (this.scraper.browser) {
                                await this.scraper.browser.close();
                            }
                            await this.scraper.initBrowser();
                            
                            retryCount++;
                            await this.sleep(2000);
                        } else {
                            throw error;
                        }
                    } else {
                        throw error; // Re-throw non-recoverable errors
                    }
                }
            }
            
            if (result && result.exitData && result.exitData.length > 0) {
                console.log(`✅ Successfully scraped ${result.exitData.length} exits`);
                
                // Add to combined results
                this.appendToCombinedCsv(result.exitData, {
                    batchId,
                    processingTimestamp,
                    state: entry.State,
                    highway: entry.Highway,
                    sourceUrl: entry.Exit_Link,
                    status: 'SUCCESS'
                });
                
                return true;
            } else {
                console.log('⚠️  No data scraped for this entry');
                
                // Add failure record
                this.appendToCombinedCsv([], {
                    batchId,
                    processingTimestamp,
                    state: entry.State,
                    highway: entry.Highway,
                    sourceUrl: entry.Exit_Link,
                    status: 'NO_DATA',
                    errorMessage: 'No exit data found'
                });
                
                return false;
            }
            
        } catch (error) {
            console.error(`❌ Error processing entry: ${error.message}`);
            
            // Add error record
            this.appendToCombinedCsv([], {
                batchId,
                processingTimestamp,
                state: entry.State,
                highway: entry.Highway,
                sourceUrl: entry.Exit_Link,
                status: 'ERROR',
                errorMessage: error.message
            });
            
            return false;
        }
    }

    // Append data to combined CSV
    appendToCombinedCsv(exitData, metadata) {
        const csvPath = path.join(BATCH_CONFIG.OUTPUT_DIR, BATCH_CONFIG.COMBINED_OUTPUT_FILE);
        
        try {
            let csvContent = '';
            
            if (exitData.length > 0) {
                // Add each exit as a row
                exitData.forEach(exit => {
                    const row = [
                        metadata.batchId,
                        metadata.processingTimestamp,
                        metadata.state,
                        metadata.highway,
                        metadata.sourceUrl,
                        exit.exit_id || 'N/A',
                        exit.title || 'N/A',
                        exit.exit_name || 'N/A',
                        exit.exit_description || 'N/A',
                        exit.exit_location || 'N/A',
                        exit.iexit_detail_link || 'N/A',
                        exit.latitude || 'N/A',
                        exit.longitude || 'N/A',
                        exit.google_maps_link || 'N/A',
                        exit.direction || 'N/A',
                        metadata.status || 'SUCCESS',
                        metadata.errorMessage || ''
                    ];
                    
                    // Escape and quote fields that contain commas
                    const escapedRow = row.map(field => {
                        const fieldStr = String(field);
                        if (fieldStr.includes(',') || fieldStr.includes('"') || fieldStr.includes('\n')) {
                            return `"${fieldStr.replace(/"/g, '""')}"`;
                        }
                        return fieldStr;
                    });
                    
                    csvContent += escapedRow.join(',') + '\n';
                });
            } else {
                // Add a single row for failed entries
                const row = [
                    metadata.batchId,
                    metadata.processingTimestamp,
                    metadata.state,
                    metadata.highway,
                    metadata.sourceUrl,
                    'N/A', // exit_id
                    'N/A', // title
                    'N/A', // exit_name
                    'N/A', // exit_description
                    'N/A', // exit_location
                    'N/A', // iexit_detail_link
                    'N/A', // latitude
                    'N/A', // longitude
                    'N/A', // google_maps_link
                    'N/A', // direction
                    metadata.status || 'FAILED',
                    metadata.errorMessage || ''
                ];
                
                csvContent += row.join(',') + '\n';
            }
            
            fs.appendFileSync(csvPath, csvContent);
            console.log(`💾 Data appended to combined CSV`);
            
        } catch (error) {
            console.error('❌ Error appending to combined CSV:', error.message);
        }
    }

    // Combine all batch CSV files into final combined file
    combineBatchFiles() {
        console.log('\n📋 Combining all batch CSV files...');
        
        const outputDir = BATCH_CONFIG.OUTPUT_DIR;
        const combinedPath = path.join(outputDir, BATCH_CONFIG.COMBINED_OUTPUT_FILE);
        
        try {
            // Find all CSV files (excluding existing combined files and metadata files)
            const files = fs.readdirSync(outputDir)
                .filter(file => file.endsWith('.csv'))
                .filter(file => !file.includes('combined_'))
                .filter(file => !file.includes('batch_summary'))
                .filter(file => !file.includes('batch_progress'))
                .filter(file => file.startsWith('iexit_'))
                .sort((a, b) => a.localeCompare(b));
            
            if (files.length === 0) {
                console.log('⚠️  No iExit CSV files found to combine');
                return;
            }
            
            console.log(`📁 Found ${files.length} iExit CSV files to combine`);
            
            let combinedContent = '';
            let isFirstFile = true;
            let totalRows = 0;
            
            for (const file of files) {
                const filePath = path.join(outputDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split('\n').filter(line => line.trim());
                
                if (lines.length === 0) continue;
                
                // Include header only from first file
                if (isFirstFile) {
                    combinedContent += lines.join('\n') + '\n';
                    totalRows += lines.length - 1; // Exclude header
                    isFirstFile = false;
                } else {
                    // Skip header for subsequent files
                    const dataLines = lines.slice(1);
                    if (dataLines.length > 0) {
                        combinedContent += dataLines.join('\n') + '\n';
                        totalRows += dataLines.length;
                    }
                }
                
                console.log(`  ✅ Processed: ${file} (${lines.length - 1} data rows)`);
            }
            
            // Write combined file
            fs.writeFileSync(combinedPath, combinedContent);
            
            console.log(`\n✅ Successfully combined ${files.length} batch files`);
            console.log(`📊 Total data rows: ${totalRows}`);
            console.log(`📄 Combined file: ${combinedPath}`);
            
            return {
                success: true,
                filesProcessed: files.length,
                totalRows: totalRows,
                outputPath: combinedPath
            };
            
        } catch (error) {
            console.error('❌ Error combining batch files:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Method to check for missing entries by comparing states.csv with processed data
    async checkForMissingEntries() {
        console.log('\n🔍 Checking for missing entries...');
        
        try {
            // Read the combined results file
            const combinedPath = path.join(BATCH_CONFIG.OUTPUT_DIR, BATCH_CONFIG.COMBINED_OUTPUT_FILE);
            
            if (!fs.existsSync(combinedPath)) {
                console.log('⚠️  Combined results file not found. Run combineBatchFiles() first.');
                return null;
            }
            
            const combinedContent = fs.readFileSync(combinedPath, 'utf8');
            const processedLines = combinedContent.split('\n').filter(line => line.trim());
            
            // Extract processed URLs from combined file
            const processedUrls = new Set();
            for (let i = 1; i < processedLines.length; i++) { // Skip header
                const line = processedLines[i];
                if (line.trim()) {
                    // Extract source_url column (index 4 based on header structure)
                    const columns = line.split(',');
                    if (columns.length > 4) {
                        const url = columns[4].replace(/"/g, '').trim();
                        if (url && url !== 'N/A') {
                            processedUrls.add(url);
                        }
                    }
                }
            }
            
            // Read original states.csv
            const statesCsvPath = BATCH_CONFIG.STATES_CSV_PATH;
            const statesContent = fs.readFileSync(statesCsvPath, 'utf8');
            const statesLines = statesContent.split('\n').filter(line => line.trim());
            
            // Find missing entries
            const missingEntries = [];
            const totalOriginalEntries = statesLines.length - 1; // Exclude header
            
            for (let i = 1; i < statesLines.length; i++) {
                const line = statesLines[i];
                if (line.trim()) {
                    const columns = line.split(',');
                    if (columns.length > 2) {
                        const exitLink = columns[2].replace(/"/g, '').trim(); // Exit_Link column
                        if (exitLink && !processedUrls.has(exitLink)) {
                            missingEntries.push({
                                lineNumber: i + 1,
                                state: columns[0].replace(/"/g, '').trim(),
                                highway: columns[1].replace(/"/g, '').trim(),
                                exitLink: exitLink
                            });
                        }
                    }
                }
            }
            
            // Report results
            console.log(`📊 Missing Entry Analysis:`);
            console.log(`   Total original entries: ${totalOriginalEntries}`);
            console.log(`   Successfully processed: ${processedUrls.size}`);
            console.log(`   Missing entries: ${missingEntries.length}`);
            console.log(`   Coverage: ${((processedUrls.size / totalOriginalEntries) * 100).toFixed(2)}%`);
            
            if (missingEntries.length > 0) {
                console.log('\n❌ Missing entries found:');
                missingEntries.slice(0, 10).forEach((entry, index) => {
                    console.log(`   ${index + 1}. Line ${entry.lineNumber}: ${entry.state} - ${entry.highway}`);
                });
                
                if (missingEntries.length > 10) {
                    console.log(`   ... and ${missingEntries.length - 10} more`);
                }
                
                // Save missing entries to file
                const missingPath = path.join(BATCH_CONFIG.OUTPUT_DIR, 'missing_entries.json');
                fs.writeFileSync(missingPath, JSON.stringify(missingEntries, null, 2));
                console.log(`📄 Complete missing entries list saved to: ${missingPath}`);
            } else {
                console.log('✅ No missing entries found - all URLs processed!');
            }
            
            return {
                totalOriginal: totalOriginalEntries,
                processed: processedUrls.size,
                missing: missingEntries.length,
                missingEntries: missingEntries,
                coveragePercent: (processedUrls.size / totalOriginalEntries) * 100
            };
            
        } catch (error) {
            console.error('❌ Error checking missing entries:', error.message);
            return null;
        }
    }

    // Run the complete batch processing
    async runBatchProcessing() {
        console.log('\n🚀 Starting Batch Processing...');
        console.log('='.repeat(60));
        
        const totalBatches = Math.ceil(this.stateData.length / BATCH_CONFIG.BATCH_SIZE);
        
        // Add redundancy: start from N entries before the last processed entry
        // This ensures we have overlap to catch any potentially missed entries
        const REDUNDANCY_OVERLAP = BATCH_CONFIG.REDUNDANCY_OVERLAP || 2;
        let adjustedProcessedCount = Math.max(0, this.progress.processedCount - REDUNDANCY_OVERLAP);
        
        // Store the original processed count for comparison
        const originalProcessedCount = this.progress.processedCount;
        
        // If we have processed entries, apply redundancy
        if (this.progress.processedCount > 0 && REDUNDANCY_OVERLAP > 0) {
            console.log(`🔄 Applying redundancy (${REDUNDANCY_OVERLAP} entries overlap):`);
            console.log(`   Starting from entry ${adjustedProcessedCount + 1} instead of ${originalProcessedCount + 1}`);
            console.log(`   This will reprocess ${originalProcessedCount - adjustedProcessedCount} entries for safety`);
        } else if (this.progress.processedCount > 0 && REDUNDANCY_OVERLAP === 0) {
            console.log(`➡️  No redundancy configured - continuing from entry ${originalProcessedCount + 1}`);
        } else {
            console.log(`🚀 Starting fresh from entry 1`);
        }
        
        const startBatch = Math.floor(adjustedProcessedCount / BATCH_CONFIG.BATCH_SIZE);
        
        console.log(`📊 Total batches: ${totalBatches}`);
        console.log(`📊 Starting from batch: ${startBatch + 1}`);
        console.log(`📊 Entries to process: ${this.stateData.length - adjustedProcessedCount}`);
        
        for (let batchIndex = startBatch; batchIndex < totalBatches; batchIndex++) {
            console.log(`\n📦 Starting Batch ${batchIndex + 1}/${totalBatches}`);
            
            const batchResult = await this.processBatch(batchIndex, adjustedProcessedCount);
            
            if (!batchResult) {
                console.log('🛑 Batch processing stopped');
                break;
            }
            
            console.log(`✅ Batch ${batchIndex + 1} completed`);
            
            // Delay between batches (except for the last batch)
            if (batchIndex < totalBatches - 1) {
                console.log(`⏱️  Waiting ${BATCH_CONFIG.DELAYS.BETWEEN_BATCHES}ms before next batch...`);
                await this.sleep(BATCH_CONFIG.DELAYS.BETWEEN_BATCHES);
            }
        }
        
        // Retry failed URLs if any exist
        if (this.progress.failedUrls.length > 0) {
            console.log(`\n🔄 RETRY PHASE AVAILABLE`);
            console.log('='.repeat(40));
            console.log(`Found ${this.progress.failedUrls.length} failed URLs that could be retried.`);
            console.log('These URLs failed during the initial processing and might succeed with fresh attempts.');
            console.log('');
            
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            const retryAnswer = await new Promise((resolve) => {
                rl.question('Do you want to retry the failed URLs? (y/n): ', resolve);
            });
            
            rl.close();
            
            if (retryAnswer.toLowerCase() === 'y' || retryAnswer.toLowerCase() === 'yes') {
                console.log('\n🔄 Starting retry phase...');
                await this.retryFailedEntries();
            } else {
                console.log('⏭️  Skipping retry phase');
            }
        }
        
        // Final summary
        await this.generateFinalSummary();
    }

    // Retry failed entries with enhanced error handling
    async retryFailedEntries() {
        if (this.progress.failedUrls.length === 0) {
            console.log('✅ No failed URLs to retry');
            return;
        }
        
        // Remove duplicates from failed URLs (based on URL)
        const uniqueFailedUrls = this.progress.failedUrls.filter((url, index, self) => 
            index === self.findIndex(u => u.url === url.url)
        );
        
        if (uniqueFailedUrls.length < this.progress.failedUrls.length) {
            console.log(`🔄 Removed ${this.progress.failedUrls.length - uniqueFailedUrls.length} duplicate failed URLs`);
            this.progress.failedUrls = uniqueFailedUrls;
        }
        
        console.log(`🔄 Retrying ${this.progress.failedUrls.length} failed URLs...`);
        console.log('Each failed URL will be attempted up to 3 times with fresh browser sessions');
        console.log('');
        
        const maxRetryAttempts = 3;
        const successfulRetries = [];
        const permanentFailures = [];
        
        for (let i = 0; i < this.progress.failedUrls.length; i++) {
            const failedEntry = this.progress.failedUrls[i];
            console.log(`\n🔄 Retry ${i + 1}/${this.progress.failedUrls.length}: ${failedEntry.state} - ${failedEntry.highway}`);
            console.log(`🌐 URL: ${failedEntry.url}`);
            
            let retrySuccess = false;
            
            for (let attempt = 1; attempt <= maxRetryAttempts; attempt++) {
                console.log(`   🎯 Attempt ${attempt}/${maxRetryAttempts}`);
                
                try {
                    // Initialize fresh browser for retry
                    if (!this.scraper) {
                        this.scraper = new CoordinateScraper(this.browserConfig);
                    }
                    
                    // Always use fresh browser for retries
                    if (this.scraper.browser) {
                        await this.scraper.browser.close();
                    }
                    await this.scraper.initBrowser();
                    
                    // Check session before retry
                    if (await this.checkSessionExpiry()) {
                        console.log('🚨 Session expired during retry, requesting refresh...');
                        const refreshResult = await this.requestSessionRefresh();
                        if (!refreshResult) {
                            console.log('❌ Session refresh cancelled. Stopping retries.');
                            return;
                        }
                        this.scraper.browserConfig = refreshResult;
                        await this.scraper.browser.close();
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
                        
                        // Add to combined CSV
                        const batchId = Math.floor(failedEntry.index / BATCH_CONFIG.BATCH_SIZE) + 1;
                        this.appendToCombinedCsv(result.exitData, {
                            batchId,
                            processingTimestamp: new Date().toISOString(),
                            state: failedEntry.state,
                            highway: failedEntry.highway,
                            sourceUrl: failedEntry.url,
                            status: 'RETRY_SUCCESS'
                        });
                        
                        successfulRetries.push(failedEntry);
                        retrySuccess = true;
                        this.progress.processedCount++;
                        this.progress.lastSuccessfulRequest = Date.now();
                        break; // Success, exit retry loop
                        
                    } else {
                        console.log(`   ⚠️  Attempt ${attempt} returned no data`);
                    }
                    
                } catch (error) {
                    console.log(`   ❌ Attempt ${attempt} failed: ${error.message}`);
                    
                    if (attempt < maxRetryAttempts) {
                        console.log(`   ⏱️  Waiting 5 seconds before next attempt...`);
                        await this.sleep(5000);
                    }
                }
            }
            
            if (!retrySuccess) {
                console.log(`   💀 All ${maxRetryAttempts} retry attempts failed`);
                permanentFailures.push(failedEntry);
            }
            
            // Small delay between different URLs
            if (i < this.progress.failedUrls.length - 1) {
                console.log(`⏱️  Waiting 3 seconds before next retry...`);
                await this.sleep(3000);
            }
        }
        
        // Update failed URLs list to only include permanent failures
        this.progress.failedUrls = permanentFailures;
        
        // Close browser after retries
        if (this.scraper && this.scraper.browser) {
            await this.scraper.browser.close();
        }
        
        console.log('\n🔄 RETRY PHASE COMPLETE');
        console.log('='.repeat(40));
        console.log(`✅ Successful retries: ${successfulRetries.length}`);
        console.log(`❌ Permanent failures: ${permanentFailures.length}`);
        
        if (successfulRetries.length > 0) {
            console.log('\n✅ Successfully retried:');
            successfulRetries.forEach((entry, index) => {
                console.log(`  ${index + 1}. ${entry.state} - ${entry.highway}`);
            });
        }
        
        // Save updated progress
        this.saveProgress();
    }

    // Generate final summary
    async generateFinalSummary() {
        console.log('\n📊 BATCH PROCESSING COMPLETE!');
        console.log('='.repeat(60));
        console.log(`✅ Total processed: ${this.progress.processedCount}/${this.progress.totalCount}`);
        console.log(`❌ Failed entries: ${this.progress.failedUrls.length}`);
        
        if (this.progress.failedUrls.length > 0) {
            console.log('\n❌ Failed URLs:');
            this.progress.failedUrls.forEach((failed, index) => {
                console.log(`  ${index + 1}. ${failed.state} - ${failed.highway}: ${failed.url}`);
            });
        }
        
        // Combine all batch CSV files into final combined file
        console.log('\n🔄 Combining batch files into final output...');
        const combinationResult = this.combineBatchFiles();
        
        if (combinationResult.success) {
            console.log(`✅ Successfully combined ${combinationResult.filesProcessed} batch files`);
            console.log(`📊 Total rows combined: ${combinationResult.totalRows}`);
        } else {
            console.log(`❌ Failed to combine batch files: ${combinationResult.error}`);
        }
        
        // Check for missing entries
        console.log('\n🔍 Performing missing entry analysis...');
        const missingAnalysis = await this.checkForMissingEntries();
        
        const summaryPath = path.join(BATCH_CONFIG.OUTPUT_DIR, 'batch_summary.json');
        const summary = {
            totalProcessed: this.progress.processedCount,
            totalEntries: this.progress.totalCount,
            failedEntries: this.progress.failedUrls.length,
            failedUrls: this.progress.failedUrls,
            completedAt: new Date().toISOString(),
            batchCombination: combinationResult,
            missingEntryAnalysis: missingAnalysis,
            outputFiles: {
                combinedCsv: path.join(BATCH_CONFIG.OUTPUT_DIR, BATCH_CONFIG.COMBINED_OUTPUT_FILE),
                progressFile: path.join(BATCH_CONFIG.OUTPUT_DIR, BATCH_CONFIG.PROGRESS_FILE),
                missingEntriesFile: missingAnalysis && missingAnalysis.missing > 0 ? 
                    path.join(BATCH_CONFIG.OUTPUT_DIR, 'missing_entries.json') : null
            }
        };
        
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
        console.log(`\n📄 Final summary saved to: ${summaryPath}`);
        console.log(`📄 Combined results saved to: ${path.join(BATCH_CONFIG.OUTPUT_DIR, BATCH_CONFIG.COMBINED_OUTPUT_FILE)}`);
        
        if (missingAnalysis && missingAnalysis.missing > 0) {
            console.log(`⚠️  Found ${missingAnalysis.missing} missing entries (${missingAnalysis.coveragePercent.toFixed(2)}% coverage)`);
            console.log(`📄 Missing entries list: ${path.join(BATCH_CONFIG.OUTPUT_DIR, 'missing_entries.json')}`);
        } else if (missingAnalysis) {
            console.log(`✅ Perfect coverage: ${missingAnalysis.coveragePercent.toFixed(2)}% (${missingAnalysis.processed}/${missingAnalysis.totalOriginal})`);
        }
    }

    // Utility sleep function
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export for use in other modules
module.exports = { BatchProcessor, BATCH_CONFIG };

// Main execution if run directly
if (require.main === module) {
    async function main() {
        const processor = new BatchProcessor();
        
        try {
            await processor.initialize();
            await processor.runBatchProcessing();
        } catch (error) {
            console.error('❌ Fatal error in batch processing:', error.message);
            process.exit(1);
        }
    }
    
    main();
}
