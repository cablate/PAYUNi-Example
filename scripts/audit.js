const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('\x1b[36m%s\x1b[0m', '🚀 Starting Flight Check: Security & Configuration Audit...');

let passed = true;
const errors = [];
const warnings = [];

// Helper to check file existence
function checkFile(filePath, description) {
    if (fs.existsSync(filePath)) {
        console.log(`✅ [PASS] ${description} found.`);
        return true;
    } else {
        console.log(`❌ [FAIL] ${description} NOT found.`);
        errors.push(`${description} is missing.`);
        passed = false;
        return false;
    }
}

// 1. Check .env existence
const envPath = path.join(__dirname, '..', '.env');
if (checkFile(envPath, '.env configuration file')) {
    // 2. Check .env content
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Check SESSION_SECRET
    const sessionSecretMatch = envContent.match(/SESSION_SECRET=(.*)/);
    if (sessionSecretMatch) {
        const secret = sessionSecretMatch[1].trim();
        if (secret === 'keyboard cat' || secret === 'secret' || secret.length < 32) {
            console.log('❌ [FAIL] SESSION_SECRET is too weak.');
            errors.push('SESSION_SECRET is weak. Use a long random string (min 32 chars).');
            passed = false;
        } else {
            console.log('✅ [PASS] SESSION_SECRET looks strong enough.');
        }
    } else {
        console.log('❌ [FAIL] SESSION_SECRET not found in .env.');
        errors.push('SESSION_SECRET missing in .env.');
        passed = false;
    }

    // Check NODE_ENV
    const nodeEnvMatch = envContent.match(/NODE_ENV=(.*)/);
    if (nodeEnvMatch) {
        const env = nodeEnvMatch[1].trim();
        if (env !== 'production') {
            console.log('⚠️  [WARN] NODE_ENV is not set to "production". Ensure this is intentional for local dev.');
            warnings.push('NODE_ENV is not production.');
        } else {
            console.log('✅ [PASS] NODE_ENV is set to production.');
        }
    }
}

// 3. Check Critical Directories
checkFile(path.join(__dirname, '..', 'src', 'services', 'payment', 'PayuniSDK.js'), 'PayuniSDK.js (Core Payment Logic)');
checkFile(path.join(__dirname, '..', 'src', 'utils', 'crypto.js'), 'crypto.js (Encryption Utility)');

// 4. Check .gitignore
const gitignorePath = path.join(__dirname, '..', '.gitignore');
if (checkFile(gitignorePath, '.gitignore')) {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    if (!content.includes('.env')) {
        console.log('❌ [FAIL] .env is NOT ignored in .gitignore!');
        errors.push('Security Risk: .env is not in .gitignore.');
        passed = false;
    } else {
        console.log('✅ [PASS] .env is correctly ignored in git.');
    }
}

console.log('\n---------------------------------------------------');
if (passed) {
    console.log('\x1b[32m%s\x1b[0m', '🎉 SYSTEM READY FOR TAKEOFF');
    if (warnings.length > 0) {
        console.log('\x1b[33m%s\x1b[0m', '⚠️  Warnings (Non-blocking):');
        warnings.forEach(w => console.log(`   - ${w}`));
    }
} else {
    console.log('\x1b[31m%s\x1b[0m', '⛔ SYSTEM NOT READY. PLEASE FIX ERRORS:');
    errors.forEach(e => console.log(`   - ${e}`));
    process.exit(1);
}
