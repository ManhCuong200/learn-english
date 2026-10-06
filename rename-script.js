const fs = require('fs');
const path = require('path');

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walkDir(file));
        } else { 
            if (file.endsWith('.ts')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walkDir(path.join(__dirname, 'src'));
let changedFiles = 0;

files.forEach(file => {
    const originalContent = fs.readFileSync(file, 'utf8');
    let newContent = originalContent;
    
    newContent = newContent.replace(/admin/g, 'moderator');
    newContent = newContent.replace(/Admin/g, 'Moderator');
    newContent = newContent.replace(/ADMIN/g, 'MODERATOR');
    
    if (newContent !== originalContent) {
        fs.writeFileSync(file, newContent, 'utf8');
        changedFiles++;
    }
});
console.log(`Updated ${changedFiles} files.`);
