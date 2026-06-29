
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const FRONTEND_SRC = path.join(PROJECT_ROOT, "Frontend", "src");
const BACKEND_DIR = path.join(PROJECT_ROOT, "Backend");

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
            if (fullPath.match(/\.(tsx|ts|js|jsx|css|png|jpg|svg)$/)) {
                results.push(fullPath);
            }
        }
    });
    return results;
}

const allFiles = walk(PROJECT_ROOT);
console.log(`Found ${allFiles.length} files.`);

function searchInFiles(query, ignorePath) {
    // Escape query
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
        const cmd = `findstr /M /S /C:"${safeQuery}" "${path.join(PROJECT_ROOT, "*.*")}"`;
        const output = execSync(cmd, { cwd: PROJECT_ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
        const lines = output.trim().split("\n").map(l => l.trim()).filter(Boolean);
        // Exclude the file itself and scratch dir
        const otherFiles = lines.filter(l => !l.includes(ignorePath) && !l.includes("scratch\\"));
        return otherFiles.length > 0;
    } catch (e) {
        return false;
    }
}

let unusedFiles = [];
for (const file of allFiles) {
    const ext = path.extname(file);
    const basename = path.basename(file, ext);
    if (["index", "App", "main", "server", "db", "authController", "authService", "expenseController", "expenseService"].includes(basename)) continue; // ignore entry points and some obvious ones for now
    
    const isUsed = searchInFiles(basename, file);
    if (!isUsed) {
        unusedFiles.push(file.replace(PROJECT_ROOT, ""));
    }
}
console.log("Potentially Unused Files:");
unusedFiles.forEach(f => console.log(f));

