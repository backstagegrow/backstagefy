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

    // Colors mapping
    content = content.replace(/#c5a059/gi, '#22c55e');
    content = content.replace(/#c59f59/gi, '#22c55e');
    content = content.replace(/#e6be78/gi, '#4ade80');
    content = content.replace(/#f3e2b5/gi, '#4ade80');
    content = content.replace(/#FFD700/gi, '#22c55e');

    content = content.replace(/197, 160, 89/g, '34, 197, 94');
    content = content.replace(/197, 159, 89/g, '34, 197, 94');
    content = content.replace(/255, 215, 0/g, '34, 197, 94');

    // Classes nomenclature
    content = content.replace(/gold-pulse/g, 'primary-pulse');
    content = content.replace(/shadow-gold/g, 'shadow-primary');
    content = content.replace(/gold-glow/g, 'primary-glow');
    content = content.replace(/neon-gold/g, 'neon-primary');

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}

walkDir('./src', processFile);
console.log('Done coloring');
