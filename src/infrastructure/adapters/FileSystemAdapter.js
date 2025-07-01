const fs = require('fs').promises;
const path = require('path');

class FileSystemAdapter {
    async exists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async readFile(filePath, encoding = 'utf8') {
        return await fs.readFile(filePath, encoding);
    }

    async writeFile(filePath, content, encoding = 'utf8') {
        return await fs.writeFile(filePath, content, encoding);
    }

    async ensureDir(dirPath) {
        return await fs.mkdir(dirPath, { recursive: true });
    }

    resolve(...paths) {
        return path.resolve(...paths);
    }

    dirname(filePath) {
        return path.dirname(filePath);
    }

    extname(filePath) {
        return path.extname(filePath);
    }

    async readdir(dirPath) {
        return await fs.readdir(dirPath);
    }

    async stat(filePath) {
        return await fs.stat(filePath);
    }
}

module.exports = FileSystemAdapter;
