import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

function processFile(filePath) {
    const ext = path.extname(filePath);
    if (!['.tsx', '.ts', '.css', '.html'].includes(ext)) return;

    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // Replace class prefixes and generic references
    content = content.replace(/sphaus-/g, 'backstagefy-');
    content = content.replace(/spHAUS/g, 'BackStageFy');
    content = content.replace(/SPHAUS/g, 'BACKSTAGEFY');
    content = content.replace(/sp haus/g, 'BackStageFy');
    content = content.replace(/SpHaus/g, 'BackStageFy');

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}

walkDir('./src', processFile);
console.log('Renaming done');
