class CopilotAgentService {
    constructor(copilotClient, gitRepository, fileSystem, logger) {
        this.copilotClient = copilotClient;
        this.gitRepository = gitRepository;
        this.fileSystem = fileSystem;
        this.logger = logger;
    }

    async executeProject(config) {
        this.logger.info('🚀 Starting Copilot Agent execution');
        
        try {
            // Validate environment
            await this.validateEnvironment(config);
            
            // Read context files
            const context = await this.gatherContext(config);
            
            // Process target files
            const changes = await this.processFiles(config, context);
            
            // Handle Git operations if auto-commit enabled
            if (config.autoCommit) {
                await this.handleGitOperations(config, changes);
            }
            
            this.logger.info('✅ Copilot Agent execution completed successfully');
            return { success: true, changes };
            
        } catch (error) {
            this.logger.error(`❌ Execution failed: ${error.message}`);
            throw error;
        }
    }

    async validateEnvironment(config) {
        // Check if root directory exists
        if (!await this.fileSystem.exists(config.rootDir)) {
            throw new Error(`Root directory does not exist: ${config.rootDir}`);
        }

        // Check Git repository
        if (config.autoCommit) {
            const isClean = await this.gitRepository.isWorkingTreeClean();
            if (!isClean) {
                this.logger.warn('⚠️ Working tree is not clean, proceeding anyway');
            }
        }
    }

    async gatherContext(config) {
        this.logger.info('📖 Gathering context from read files');
        const context = {};
        
        for (const filePath of config.readFiles) {
            const fullPath = this.fileSystem.resolve(config.rootDir, filePath);
            if (await this.fileSystem.exists(fullPath)) {
                context[filePath] = await this.fileSystem.readFile(fullPath);
                this.logger.debug(`Read context from: ${filePath}`);
            } else {
                this.logger.warn(`Context file not found: ${filePath}`);
            }
        }
        
        return context;
    }

    async processFiles(config, context) {
        this.logger.info('🔄 Processing target files with Copilot');
        const changes = [];
        
        await this.copilotClient.start();
        
        try {
            for (const targetFile of config.targetFiles) {
                const change = await this.processFile(config, targetFile, context);
                if (change) {
                    changes.push(change);
                }
            }
        } finally {
            await this.copilotClient.stop();
        }
        
        return changes;
    }

    async processFile(config, targetFile, context) {
        const fullPath = this.fileSystem.resolve(config.rootDir, targetFile);
        this.logger.info(`Processing file: ${targetFile}`);
        
        // Prepare enhanced prompt with context
        const enhancedPrompt = this.buildEnhancedPrompt(config.prompt, context, targetFile);
        
        // Check if file exists
        const fileExists = await this.fileSystem.exists(fullPath);
        
        if (fileExists) {
            // Get completions for existing file
            return await this.updateExistingFile(fullPath, enhancedPrompt);
        } else {
            // Create new file
            return await this.createNewFile(fullPath, enhancedPrompt);
        }
    }

    buildEnhancedPrompt(basePrompt, context, targetFile) {
        let prompt = `Target file: ${targetFile}\n\n`;
        
        if (Object.keys(context).length > 0) {
            prompt += 'Context files:\n';
            Object.entries(context).forEach(([file, content]) => {
                prompt += `\n--- ${file} ---\n${content}\n`;
            });
            prompt += '\n';
        }
        
        prompt += `Instructions: ${basePrompt}`;
        return prompt;
    }

    async updateExistingFile(filePath, prompt) {
        // Get file content and determine best completion position
        const content = await this.fileSystem.readFile(filePath);
        const lines = content.split('\n');
        
        // Use Copilot to get suggestions for the file
        const completions = await this.copilotClient.getCompletions(filePath, lines.length - 1, 0);
        
        if (completions.length > 0) {
            const suggestion = completions[0].insertText || completions[0].label;
            const updatedContent = content + '\n' + suggestion;
            
            await this.fileSystem.writeFile(filePath, updatedContent);
            
            return {
                file: filePath,
                type: 'update',
                changes: suggestion
            };
        }
        
        return null;
    }

    async createNewFile(filePath, prompt) {
        // Use prompt to generate file content
        // This is a simplified version - in reality, you'd use more sophisticated prompt engineering
        const directoryPath = this.fileSystem.dirname(filePath);
        await this.fileSystem.ensureDir(directoryPath);
        
        // Generate basic file structure based on extension
        const ext = this.fileSystem.extname(filePath);
        const content = this.generateFileTemplate(ext, prompt);
        
        await this.fileSystem.writeFile(filePath, content);
        
        return {
            file: filePath,
            type: 'create',
            changes: content
        };
    }

    generateFileTemplate(extension, prompt) {
        const templates = {
            '.js': `// Generated by Copilot Agent\n// ${prompt}\n\n`,
            '.py': `# Generated by Copilot Agent\n# ${prompt}\n\n`,
            '.md': `# Generated by Copilot Agent\n\n${prompt}\n\n`,
            '.json': '{\n  // Generated by Copilot Agent\n}\n'
        };
        
        return templates[extension] || `// Generated by Copilot Agent\n// ${prompt}\n\n`;
    }

    async handleGitOperations(config, changes) {
        if (changes.length === 0) {
            this.logger.info('No changes to commit');
            return;
        }

        this.logger.info('📝 Handling Git operations');
        
        // Stage changed files
        const changedFiles = changes.map(change => change.file);
        await this.gitRepository.stageFiles(changedFiles);
        
        // Generate commit message
        const commitMessage = config.commitMessage || this.generateCommitMessage(config, changes);
        
        // Commit changes
        await this.gitRepository.commit(commitMessage, changedFiles);
        
        // Handle squashing if previous goal was reached
        if (config.squashOnSuccess && this.isGoalReached(config.prompt)) {
            await this.handleSquashing(commitMessage);
        }
    }

    generateCommitMessage(config, changes) {
        const summary = changes.length === 1 ? 
            `Update ${changes[0].file}` : 
            `Update ${changes.length} files`;
        
        const details = changes.map(change => 
            `- ${change.type}: ${change.file}`
        ).join('\n');
        
        return `${summary}\n\n${details}\n\nGoal: ${config.prompt}`;
    }

    isGoalReached(prompt) {
        const successIndicators = [
            'goal is reached',
            'task completed',
            'objective achieved',
            'finished',
            'done',
            'success'
        ];
        
        const lowerPrompt = prompt.toLowerCase();
        return successIndicators.some(indicator => lowerPrompt.includes(indicator));
    }

    async handleSquashing(newCommitMessage) {
        try {
            const lastSuccess = await this.gitRepository.getLastSuccessCommit();
            if (lastSuccess) {
                const commits = await this.gitRepository.getCommitsSince(lastSuccess);
                if (commits.length > 1) {
                    await this.gitRepository.squashCommits(lastSuccess, 'HEAD', newCommitMessage);
                    this.logger.info('🔄 Squashed commits for completed goal');
                }
            }
        } catch (error) {
            this.logger.warn(`Could not squash commits: ${error.message}`);
        }
    }
}

module.exports = CopilotAgentService;
