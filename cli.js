#!/usr/bin/env node

const { fetchAndProcess } = require('./fetcher');
const { getConfig } = require('./config');
const db = require('./database');

// Parse command line arguments
const args = process.argv.slice(2);

// Check for --fetchXp flags
let maxWeekends = null;
for (const arg of args) {
    const match = arg.match(/^--fetch(\d+)p$/);
    if (match) {
        maxWeekends = parseInt(match[1]);
        break;
    }
}

// Check for reset flags
const isResetCache = args.includes('--reset-cache') || args.includes('--reset');
const isResetAll = args.includes('--reset-all');
const resetGpArg = args.find(arg => arg.startsWith('--reset-gp='));
let resetGp = null;
if (resetGpArg) {
    const match = resetGpArg.match(/^--reset-gp=(.+)$/);
    if (match) {
        resetGp = match[1];
    }
}

// Helper function to log all available CLI commands
function logAvailableCommands() {
    console.log('\n📋 Available CLI Commands:');
    console.log('   Fetch Commands:');
    console.log('     --fetch1p, --fetch2p, --fetch3p, etc.  Fetch specific number of weekends');
    console.log('     --force-weekend                        Override weekday check (fetch any day)');
    console.log('   Reset Commands:');
    console.log('     --reset-cache, --reset                 Reset processed posts cache');
    console.log('     --reset-all                            Reset all data');
    console.log('     --reset-gp="GP Name"                   Reset specific Grand Prix');
    console.log('     --reset-gp="GP Name R21"               Reset specific Grand Prix round');
    console.log('');
}

async function main() {
    // Log available commands
    logAvailableCommands();
    
    const config = getConfig();
    
    // Initialize database
    try {
        await db.initDatabase();
        console.log('✅ Database initialized');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        process.exit(1);
    }
    
    // Handle reset commands
    if (isResetAll) {
        console.log('🗑️  Resetting all cache and data...');
        try {
            const result = await db.resetAll();
            console.log(`✅ Reset complete:`);
            console.log(`   - ${result.postsDeleted} processed posts deleted`);
            console.log(`   - ${result.weekendsDeleted} weekends deleted`);
            console.log(`   - ${result.sessionsDeleted} sessions deleted`);
            console.log(`   - ${result.linksDeleted} streaming links deleted`);
            process.exit(0);
        } catch (error) {
            console.error('❌ Reset failed:', error);
            process.exit(1);
        }
    }
    
    if (resetGp) {
        console.log(`🗑️  Resetting cache for Grand Prix: ${resetGp}...`);
        try {
            // Try to parse as "GP Name R21" or just "GP Name"
            const gpMatch = resetGp.match(/^(.+?)\s*(?:R(\d+))?$/i);
            if (!gpMatch) {
                console.error('❌ Invalid GP format. Use: --reset-gp="Brazilian Grand Prix" or --reset-gp="Brazilian Grand Prix R21"');
                process.exit(1);
            }
            
            const gpName = gpMatch[1].trim();
            const round = gpMatch[2] ? parseInt(gpMatch[2]) : null;
            
            if (round) {
                const result = await db.resetGrandPrix(gpName, round);
                console.log(`✅ Reset complete for ${gpName} (R${round}):`);
                console.log(`   - ${result.postsDeleted} processed posts deleted`);
                console.log(`   - ${result.weekendDeleted} weekend deleted`);
                console.log(`   - ${result.sessionsDeleted} sessions deleted`);
                console.log(`   - ${result.linksDeleted} streaming links deleted`);
            } else {
                const result = await db.resetProcessedPosts(gpName);
                console.log(`✅ Reset complete for ${gpName}:`);
                console.log(`   - ${result} processed posts deleted`);
            }
            process.exit(0);
        } catch (error) {
            console.error('❌ Reset failed:', error);
            process.exit(1);
        }
    }
    
    if (isResetCache) {
        console.log('🗑️  Resetting processed posts cache (all posts can be re-processed)...');
        try {
            const result = await db.resetProcessedPosts();
            console.log(`✅ Reset complete: ${result} processed posts deleted`);
            console.log('   All posts can now be re-processed on next fetch');
            process.exit(0);
        } catch (error) {
            console.error('❌ Reset failed:', error);
            process.exit(1);
        }
    }
    
    // Check configuration
    if (!config.realdebrid.apiKey || !config.realdebrid.enabled) {
        console.error('❌ Real Debrid not configured');
        console.error('   Please configure Real Debrid API key in config.json');
        process.exit(1);
    }
    
    if (maxWeekends) {
        console.log(`\n🔍 Fetching up to ${maxWeekends} F1 weekend(s)...`);
    } else {
        console.log('\n🔍 Fetching until fully processed weekend found...');
    }
    
    try {
        await fetchAndProcess(maxWeekends);
        console.log('\n✅ Fetch complete!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Fetch failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };

