class FileSystem {
    async readFile(filePath) {
        throw new Error('Method not implemented');
    }

    async writeFile(filePath, content) {
        throw new Error('Method not implemented');
    }

    async exists(filePath) {
        throw new Error('Method not implemented');
    }

    async createDirectory(dirPath) {
        throw new Error('Method not implemented');
    }

    resolve(...paths) {
        throw new Error('Method not implemented');
    }
}

module.exports = FileSystem;
