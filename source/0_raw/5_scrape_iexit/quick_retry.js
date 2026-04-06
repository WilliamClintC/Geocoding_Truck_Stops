/**
 * Quick launcher for the Failed URL Retry Tool
 * This provides an easy way to retry failed URLs from the command line
 */

console.log('🚀 Quick Retry Launcher');
console.log('='.repeat(40));
console.log('');

// Import and run the retry tool
const { FailedUrlRetry } = require('./retry_failed_urls');

async function quickRetry() {
    try {
        const retryTool = new FailedUrlRetry();
        await retryTool.run();
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

quickRetry();
