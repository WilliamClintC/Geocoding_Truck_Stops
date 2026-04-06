const path = require('path');

// Batch Processing Configuration
// Adjust these settings based on your needs and system capabilities

const BATCH_CONFIG = {
    // File paths
    STATES_CSV_PATH: path.join(__dirname, 'states.csv'),
    OUTPUT_DIR: path.join(__dirname, 'batch_output'),
    
    // Output files
    COMBINED_OUTPUT_FILE: 'combined_exit_data.csv',
    PROGRESS_FILE: 'batch_progress.json',
    
    // Processing options
    USE_BATCH_FILE_COMBINATION: true,  // Use batch files + combination at end (recommended)
    USE_ROW_BY_ROW_WRITING: false,     // Use immediate row-by-row writing (legacy)
    
    // Batch processing settings
    BATCH_SIZE: 10, // Number of entries to process in each batch
    REDUNDANCY_OVERLAP: 2, // Number of entries to reprocess for redundancy (0 to disable)
    
    // Timing settings (in milliseconds)
    DELAYS: {
        BETWEEN_BATCHES: 60000,    // 1 minute between batches
        BETWEEN_REQUESTS: 5000,    // 5 seconds between individual requests
        SESSION_REFRESH: 300000,   // 5 minutes - when to ask for session refresh
    },
    
    // Retry and session management
    RETRY_ATTEMPTS: 3,
    // SESSION_TIMEOUT: 1800000,      // Disabled - using page-based detection only
    
    // Browser settings
    BROWSER_CONFIG: {
        HEADLESS: false,           // Set to true to hide browser window
        TIMEOUT: 30000,            // 30 seconds page load timeout
        WAIT_FOR_NAVIGATION: 60000 // 1 minute wait for navigation
    },
    
    // Error handling
    ERROR_HANDLING: {
        CONTINUE_ON_ERROR: true,   // Continue processing even if individual entries fail
        MAX_CONSECUTIVE_ERRORS: 5, // Stop if this many consecutive errors occur
        SAVE_ERROR_SCREENSHOTS: true
    }
};

module.exports = BATCH_CONFIG;
