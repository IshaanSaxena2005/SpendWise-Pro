
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        if (file === "node_modules" || file === ".git" || file === "dist" || file === "scratch") return;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(fullPath));
        } else {
            if (fullPath.match(/\.(tsx|ts|js|jsx|css)$/)) {
                results.push(fullPath);
            }
        }
    });
    return results;
}

const allFiles = walk(PROJECT_ROOT);
const fileContents = allFiles.map(f => ({ path: f, content: fs.readFileSync(f, "utf8") }));

let unusedFiles = [];
for (const file of allFiles) {
    const ext = path.extname(file);
    const basename = path.basename(file, ext);
    if (["index", "App", "main", "server", "db", "authController", "authService", "expenseController", "expenseService"].includes(basename)) continue; 
    
    let used = false;
    for (const fc of fileContents) {
        if (fc.path !== file && fc.content.includes(basename)) {
            used = true;
            break;
        }
    }
    if (!used) {
        unusedFiles.push(file.replace(PROJECT_ROOT, ""));
    }
}
console.log("UNUSED:");
unusedFiles.forEach(f => console.log(f));

