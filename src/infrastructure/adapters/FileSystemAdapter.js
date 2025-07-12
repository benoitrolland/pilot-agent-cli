const FileSystem = require('../../domain/ports/FileSystem');
const fs = require('fs').promises;
const path = require('path');

class FileSystemAdapter extends FileSystem {
    async exists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async readFile(filePath) {
        return await fs.readFile(filePath, 'utf8');
    }

    async writeFile(filePath, content) {
        // Ensure directory exists
        const dir = path.dirname(filePath);
        await this.createDirectory(dir);
        
        await fs.writeFile(filePath, content, 'utf8');
    }

    async createDirectory(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    resolve(...paths) {
        return path.resolve(...paths);
    }
}

module.exports = FileSystemAdapter;
