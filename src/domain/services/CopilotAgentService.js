class CopilotAgentService {
    constructor(copilotClient, gitRepository, fileSystem, logger) {
        this.copilotClient = copilotClient;
        this.gitRepository = gitRepository;
        this.fileSystem = fileSystem;
        this.logger = logger;
    }

    async executeProject(config) {
        this.logger.info('🚀 Starting project execution');
        
        const changes = [];
        let branchCreated = false;
        
        try {
            // Create working branch if auto-commit is enabled
            if (config.autoCommit) {
                const currentBranch = await this.gitRepository.getCurrentBranch();
                const workingBranch = `pilot-agent-${Date.now()}`;
                
                await this.gitRepository.createBranch(workingBranch);
                await this.gitRepository.checkoutBranch(workingBranch);
                branchCreated = true;
                
                this.logger.debug(`Created working branch: ${workingBranch}`);
            }

            // Read context files
            const contextContent = await this.readContextFiles(config);
            
            // Process target files
            for (const targetFile of config.targetFiles) {
                const change = await this.processFile(targetFile, config, contextContent);
                if (change) {
                    changes.push(change);
                }
            }

            // Commit changes if requested
            if (config.autoCommit && changes.length > 0) {
                await this.commitChanges(config, changes);
            }

            return {
                success: true,
                changes,
                branchCreated
            };

        } catch (error) {
            this.logger.error(`Project execution failed: ${error.message}`);
            throw error;
        }
    }

    async readContextFiles(config) {
        const contextContent = {};
        
        for (const filePath of config.readFiles) {
            try {
                const fullPath = this.fileSystem.resolve(config.rootDir, filePath);
                if (await this.fileSystem.exists(fullPath)) {
                    contextContent[filePath] = await this.fileSystem.readFile(fullPath);
                    this.logger.debug(`Read context file: ${filePath}`);
                }
            } catch (error) {
                this.logger.warn(`Could not read context file ${filePath}: ${error.message}`);
            }
        }
        
        return contextContent;
    }

    async processFile(targetFile, config, contextContent) {
        this.logger.info(`📝 Processing file: ${targetFile}`);
        
        const fullPath = this.fileSystem.resolve(config.rootDir, targetFile);
        let originalContent = '';
        
        // Read existing file or prepare for new file
        if (await this.fileSystem.exists(fullPath)) {
            originalContent = await this.fileSystem.readFile(fullPath);
        }

        // Prepare context for Copilot
        const context = this.buildCopilotContext(targetFile, originalContent, contextContent, config);
        
        // Get suggestions from Copilot
        const suggestions = await this.copilotClient.getSuggestions(context);
        
        if (suggestions && suggestions.length > 0) {
            const suggestion = suggestions[0]; // Use first suggestion
            
            if (config.autoAccept || await this.confirmSuggestion(suggestion)) {
                await this.fileSystem.writeFile(fullPath, suggestion.content);
                
                return {
                    type: await this.fileSystem.exists(fullPath) ? 'modified' : 'created',
                    file: targetFile,
                    suggestion: suggestion.description
                };
            }
        }
        
        return null;
    }

    buildCopilotContext(targetFile, originalContent, contextContent, config) {
        return {
            filePath: targetFile,
            content: originalContent,
            prompt: config.prompt,
            contextFiles: contextContent
        };
    }

    async confirmSuggestion(suggestion) {
        // In a real implementation, this would prompt the user
        // For now, return true if autoAccept is not explicitly false
        return true;
    }

    async commitChanges(config, changes) {
        const commitMessage = config.commitMessage ||
            `Pilot Agent: Applied ${changes.length} change(s) - ${config.prompt.substring(0, 50)}...`;

        // Stage all changes
        for (const change of changes) {
            await this.gitRepository.addFile(change.file);
        }

        // Commit changes
        await this.gitRepository.commit(commitMessage);

        this.logger.info(`📦 Committed ${changes.length} changes`);
    }
}

module.exports = CopilotAgentService;
