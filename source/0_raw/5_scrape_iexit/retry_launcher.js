/**
 * Simple launcher for the retry tool
 */

const { FailedUrlRetry } = require('./retry_failed_urls');

async function main() {
    console.log('🚀 iExit Failed URL Retry Launcher');
    console.log('='.repeat(50));
    console.log('This launcher will help you retry any failed URLs from batch processing');
    console.log('');
    
    try {
        const retryTool = new FailedUrlRetry();
        await retryTool.run();
    } catch (error) {
        console.error('❌ Error running retry tool:', error.message);
        process.exit(1);
    }
}

main();
