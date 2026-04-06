/**
 * Utility script to test batch file combination and missing entry detection
 * Run this after batch processing is complete to:
 * 1. Combine all batch_XXX_results.csv files into a single file
 * 2. Check for missing entries by comparing with states.csv
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    OUTPUT_DIR: path.join(__dirname, 'batch_output'),
    STATES_CSV_PATH: path.join(__dirname, 'states.csv'),
    COMBINED_OUTPUT_FILE: 'combined_exit_data_from_batches.csv',
    MISSING_ENTRIES_FILE: 'missing_entries_analysis.json'
};

class BatchAnalyzer {
    
    // Combine all batch CSV files into final combined file
    combineBatchFiles() {
        console.log('\n📋 Combining all batch CSV files...');
        
        const outputDir = CONFIG.OUTPUT_DIR;
        const combinedPath = path.join(outputDir, CONFIG.COMBINED_OUTPUT_FILE);
        
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
                console.log('📁 Looking for files matching pattern: iexit_*.csv');
                return { success: false, error: 'No iExit CSV files found' };
            }
            
            console.log(`📁 Found ${files.length} iExit CSV files to combine:`);
            files.forEach(file => console.log(`   - ${file}`));
            
            let combinedContent = '';
            let isFirstFile = true;
            let totalRows = 0;
            
            for (const file of files) {
                const filePath = path.join(outputDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split('\n').filter(line => line.trim());
                
                if (lines.length === 0) {
                    console.log(`   ⚠️  Skipping empty file: ${file}`);
                    continue;
                }
                
                // Include header only from first file
                if (isFirstFile) {
                    combinedContent += lines.join('\n') + '\n';
                    totalRows += lines.length - 1; // Exclude header
                    isFirstFile = false;
                    console.log(`   ✅ Processed (with header): ${file} (${lines.length - 1} data rows)`);
                } else {
                    // Skip header for subsequent files
                    const dataLines = lines.slice(1);
                    if (dataLines.length > 0) {
                        combinedContent += dataLines.join('\n') + '\n';
                        totalRows += dataLines.length;
                        console.log(`   ✅ Processed: ${file} (${dataLines.length} data rows)`);
                    } else {
                        console.log(`   ⚠️  No data rows in: ${file}`);
                    }
                }
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
    checkForMissingEntries(combinedFilePath = null) {
        console.log('\n🔍 Checking for missing entries...');
        
        try {
            // Use provided path or default
            const combinedPath = combinedFilePath || path.join(CONFIG.OUTPUT_DIR, CONFIG.COMBINED_OUTPUT_FILE);
            
            if (!fs.existsSync(combinedPath)) {
                console.log(`⚠️  Combined results file not found: ${combinedPath}`);
                console.log('   Run combineBatchFiles() first or provide correct path.');
                return null;
            }
            
            console.log(`📄 Reading combined file: ${combinedPath}`);
            const combinedContent = fs.readFileSync(combinedPath, 'utf8');
            const processedLines = combinedContent.split('\n').filter(line => line.trim());
            
            if (processedLines.length === 0) {
                console.log('⚠️  Combined file is empty');
                return null;
            }
            
            console.log(`📊 Found ${processedLines.length - 1} processed rows (excluding header)`);
            
            // Extract processed URLs from combined file
            const processedUrls = new Set();
            for (let i = 1; i < processedLines.length; i++) { // Skip header
                const line = processedLines[i];
                if (line.trim()) {
                    // Parse CSV line (handling quoted fields)
                    const columns = this.parseCSVLine(line);
                    if (columns.length > 4) {
                        const url = columns[4].replace(/"/g, '').trim(); // source_url column
                        if (url && url !== 'N/A') {
                            processedUrls.add(url);
                        }
                    }
                }
            }
            
            console.log(`🔗 Found ${processedUrls.size} unique processed URLs`);
            
            // Read original states.csv
            console.log(`📄 Reading original states file: ${CONFIG.STATES_CSV_PATH}`);
            const statesContent = fs.readFileSync(CONFIG.STATES_CSV_PATH, 'utf8');
            const statesLines = statesContent.split('\n').filter(line => line.trim());
            
            // Find missing entries
            const missingEntries = [];
            const processedEntries = [];
            const totalOriginalEntries = statesLines.length - 1; // Exclude header
            
            for (let i = 1; i < statesLines.length; i++) {
                const line = statesLines[i];
                if (line.trim()) {
                    const columns = this.parseCSVLine(line);
                    if (columns.length > 2) {
                        const exitLink = columns[2].replace(/"/g, '').trim(); // Exit_Link column
                        const state = columns[0].replace(/"/g, '').trim();
                        const highway = columns[1].replace(/"/g, '').trim();
                        
                        if (exitLink) {
                            if (processedUrls.has(exitLink)) {
                                processedEntries.push({
                                    lineNumber: i + 1,
                                    state: state,
                                    highway: highway,
                                    exitLink: exitLink
                                });
                            } else {
                                missingEntries.push({
                                    lineNumber: i + 1,
                                    state: state,
                                    highway: highway,
                                    exitLink: exitLink
                                });
                            }
                        }
                    }
                }
            }
            
            // Report results
            console.log(`\n📊 Missing Entry Analysis Results:`);
            console.log(`   📄 Total original entries: ${totalOriginalEntries}`);
            console.log(`   ✅ Successfully processed: ${processedEntries.length}`);
            console.log(`   ❌ Missing entries: ${missingEntries.length}`);
            console.log(`   📈 Coverage: ${((processedEntries.length / totalOriginalEntries) * 100).toFixed(2)}%`);
            
            if (missingEntries.length > 0) {
                console.log('\n❌ Missing entries found:');
                const displayCount = Math.min(missingEntries.length, 15);
                missingEntries.slice(0, displayCount).forEach((entry, index) => {
                    console.log(`   ${index + 1}. Line ${entry.lineNumber}: ${entry.state} - ${entry.highway}`);
                    console.log(`      URL: ${entry.exitLink}`);
                });
                
                if (missingEntries.length > displayCount) {
                    console.log(`   ... and ${missingEntries.length - displayCount} more`);
                }
                
                // Save missing entries to file
                const missingPath = path.join(CONFIG.OUTPUT_DIR, CONFIG.MISSING_ENTRIES_FILE);
                const analysisData = {
                    analysisDate: new Date().toISOString(),
                    totalOriginal: totalOriginalEntries,
                    processed: processedEntries.length,
                    missing: missingEntries.length,
                    coveragePercent: (processedEntries.length / totalOriginalEntries) * 100,
                    missingEntries: missingEntries,
                    processedEntries: processedEntries
                };
                
                fs.writeFileSync(missingPath, JSON.stringify(analysisData, null, 2));
                console.log(`\n📄 Complete analysis saved to: ${missingPath}`);
            } else {
                console.log('✅ Perfect! No missing entries found - all URLs processed!');
            }
            
            return {
                totalOriginal: totalOriginalEntries,
                processed: processedEntries.length,
                missing: missingEntries.length,
                missingEntries: missingEntries,
                processedEntries: processedEntries,
                coveragePercent: (processedEntries.length / totalOriginalEntries) * 100
            };
            
        } catch (error) {
            console.error('❌ Error checking missing entries:', error.message);
            return null;
        }
    }
    
    // Helper method to properly parse CSV lines with quoted fields
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current); // Add the last field
        return result;
    }
    
    // Run complete analysis
    async runCompleteAnalysis() {
        console.log('🚀 Starting Complete Batch Analysis');
        console.log('='.repeat(60));
        
        // Step 1: Combine batch files
        const combinationResult = this.combineBatchFiles();
        
        if (!combinationResult.success) {
            console.log('❌ Cannot proceed with missing entry analysis - combination failed');
            return;
        }
        
        // Step 2: Check for missing entries
        const missingAnalysis = this.checkForMissingEntries(combinationResult.outputPath);
        
        // Summary
        console.log('\n🎯 ANALYSIS COMPLETE');
        console.log('='.repeat(60));
        if (missingAnalysis) {
            console.log(`📊 Final Results:`);
            console.log(`   ✅ Processed: ${missingAnalysis.processed}/${missingAnalysis.totalOriginal}`);
            console.log(`   ❌ Missing: ${missingAnalysis.missing}`);
            console.log(`   📈 Coverage: ${missingAnalysis.coveragePercent.toFixed(2)}%`);
            
            if (missingAnalysis.missing > 0) {
                console.log(`\n⚠️  Action needed: Process ${missingAnalysis.missing} missing entries`);
                console.log(`📄 Missing entries list: ${path.join(CONFIG.OUTPUT_DIR, CONFIG.MISSING_ENTRIES_FILE)}`);
            } else {
                console.log('\n🎉 Perfect coverage achieved!');
            }
        }
    }
}

// Main execution
async function main() {
    const analyzer = new BatchAnalyzer();
    
    console.log('🔧 Batch File Analysis Utility');
    console.log('='.repeat(50));
    console.log('This tool will:');
    console.log('1. ✅ Combine all batch_XXX_results.csv files');
    console.log('2. 🔍 Check for missing entries vs states.csv');
    console.log('3. 📊 Generate detailed analysis report');
    console.log('');
    
    // Ask user what they want to do
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    console.log('Options:');
    console.log('1. Run complete analysis (combine + check missing)');
    console.log('2. Only combine batch files');
    console.log('3. Only check missing entries (requires existing combined file)');
    console.log('');
    
    const choice = await new Promise((resolve) => {
        rl.question('Enter your choice (1-3): ', resolve);
    });
    
    rl.close();
    
    switch (choice) {
        case '1':
            await analyzer.runCompleteAnalysis();
            break;
        case '2':
            analyzer.combineBatchFiles();
            break;
        case '3':
            analyzer.checkForMissingEntries();
            break;
        default:
            console.log('❌ Invalid choice. Exiting.');
    }
}

// Export for use in other modules
module.exports = { BatchAnalyzer, CONFIG };

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    });
}
