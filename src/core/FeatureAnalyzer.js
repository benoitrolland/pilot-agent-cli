class FeatureAnalyzer {
    constructor(verbose = false) {
        this.verbose = verbose;
        this.featureFlags = null;
        this.preconditions = null;
    }

    analyzeFeatureFlags(flags) {
        this.featureFlags = flags;
        
        const analysis = {
            enabled: [],
            disabled: [],
            experimental: [],
            summary: this.generateSummary(flags)
        };

        this.categorizeFeatures(flags, analysis);
        this.displayAnalysis(analysis);
        
        return analysis;
    }

    categorizeFeatures(flags, analysis) {
        const featureMap = {
            rt: { name: 'Real-time Features', description: 'Advanced real-time code suggestions and live collaboration' },
            sn: { name: 'Snippet Suggestions', description: 'Code snippet and template suggestions' },
            chat: { name: 'Chat Integration', description: 'Copilot Chat for conversational coding assistance' },
            ic: { name: 'Inline Completions', description: 'Standard inline code completion suggestions' },
            pc: { name: 'Path Completion', description: 'File path and import statement completions' },
            ae: { name: 'Advanced Extensions', description: 'Advanced/experimental features' }
        };

        Object.entries(flags).forEach(([key, value]) => {
            const feature = featureMap[key] || { name: key.toUpperCase(), description: 'Unknown feature' };
            
            if (key === 'ae' && typeof value === 'object') {
                if (Object.keys(value).length > 0) {
                    analysis.experimental.push({ key, ...feature, value });
                } else {
                    analysis.disabled.push({ key, ...feature, reason: 'No experimental features enabled' });
                }
            } else if (value === true) {
                analysis.enabled.push({ key, ...feature });
            } else if (value === false) {
                analysis.disabled.push({ key, ...feature });
            }
        });
    }

    generateSummary(flags) {
        const total = Object.keys(flags).length;
        const enabled = Object.values(flags).filter(v => v === true).length;
        const disabled = Object.values(flags).filter(v => v === false).length;
        const experimental = Object.values(flags).filter(v => typeof v === 'object').length;

        return {
            total,
            enabled,
            disabled,
            experimental,
            coveragePercentage: Math.round((enabled / total) * 100)
        };
    }

    displayAnalysis(analysis) {
        console.log('\n🔍 GitHub Copilot Feature Analysis');
        console.log('=====================================');
        
        this.displaySummary(analysis.summary);
        this.displayEnabledFeatures(analysis.enabled);
        this.displayDisabledFeatures(analysis.disabled);
        this.displayExperimentalFeatures(analysis.experimental);
        this.displayCapabilities(analysis.enabled);
        this.displayRecommendations(analysis);
    }

    displaySummary(summary) {
        console.log(`\n📊 Summary:`);
        console.log(`   Total Features: ${summary.total}`);
        console.log(`   ✅ Enabled: ${summary.enabled}`);
        console.log(`   ❌ Disabled: ${summary.disabled}`);
        console.log(`   🧪 Experimental: ${summary.experimental}`);
        console.log(`   📈 Coverage: ${summary.coveragePercentage}%`);
    }

    displayEnabledFeatures(enabled) {
        if (enabled.length > 0) {
            console.log(`\n✅ Enabled Features (${enabled.length}):`);
            enabled.forEach(feature => {
                console.log(`   🟢 ${feature.name}`);
                console.log(`      ${feature.description}`);
            });
        }
    }

    displayDisabledFeatures(disabled) {
        if (disabled.length > 0) {
            console.log(`\n❌ Disabled Features (${disabled.length}):`);
            disabled.forEach(feature => {
                console.log(`   🔴 ${feature.name}`);
                console.log(`      ${feature.description}`);
                if (feature.reason) {
                    console.log(`      Reason: ${feature.reason}`);
                }
            });
        }
    }

    displayExperimentalFeatures(experimental) {
        if (experimental.length > 0) {
            console.log(`\n🧪 Experimental Features (${experimental.length}):`);
            experimental.forEach(feature => {
                console.log(`   🟡 ${feature.name}`);
                console.log(`      ${feature.description}`);
                console.log(`      Config: ${JSON.stringify(feature.value)}`);
            });
        }
    }

    displayCapabilities(enabled) {
        console.log('\n🚀 Available Capabilities:');
        
        const capabilities = this.mapFeaturesToCapabilities(enabled);
        capabilities.forEach(capability => {
            console.log(`   ✨ ${capability}`);
        });

        if (capabilities.length === 0) {
            console.log('   ⚠️  Limited functionality - most features are disabled');
        }
    }

    mapFeaturesToCapabilities(enabled) {
        const capabilities = [];
        const enabledKeys = enabled.map(f => f.key);

        if (enabledKeys.includes('ic')) {
            capabilities.push('Standard code completions');
        }
        if (enabledKeys.includes('sn')) {
            capabilities.push('Code snippet suggestions');
        }
        if (enabledKeys.includes('chat')) {
            capabilities.push('Conversational AI assistance');
        }
        if (enabledKeys.includes('pc')) {
            capabilities.push('Smart path completions');
        }
        if (enabledKeys.includes('rt')) {
            capabilities.push('Real-time collaboration');
        }

        return capabilities;
    }

    displayRecommendations(analysis) {
        console.log('\n💡 Recommendations:');
        
        const recommendations = this.generateRecommendations(analysis);
        if (recommendations.length > 0) {
            recommendations.forEach(rec => {
                console.log(`   ${rec}`);
            });
        } else {
            console.log('   ✅ Your configuration is optimal for current usage');
        }
    }

    generateRecommendations(analysis) {
        const recommendations = [];
        const enabledKeys = analysis.enabled.map(f => f.key);
        const disabledKeys = analysis.disabled.map(f => f.key);

        if (disabledKeys.includes('rt')) {
            recommendations.push('🔄 Consider enabling real-time features for enhanced collaboration');
        }

        if (enabledKeys.includes('chat')) {
            recommendations.push('💬 You can implement chat-based interactions in your client');
        }

        if (enabledKeys.includes('sn')) {
            recommendations.push('📝 Consider adding snippet request functionality');
        }

        if (analysis.summary.coveragePercentage < 70) {
            recommendations.push('⚠️  Consider upgrading your Copilot subscription for more features');
        }

        return recommendations;
    }

    handlePreconditions(params) {
        this.preconditions = params;
        console.log('\n🔧 Conversation Preconditions Check:');
        console.log(`   Status: ${params ? 'Received' : 'Pending'}`);
        
        if (this.verbose && params) {
            console.log(`   Details: ${JSON.stringify(params, null, 2)}`);
        }
    }

    getImplementationSuggestions() {
        if (!this.featureFlags) return [];

        const suggestions = [];
        const enabledKeys = Object.entries(this.featureFlags)
            .filter(([_, value]) => value === true)
            .map(([key, _]) => key);

        if (enabledKeys.includes('chat')) {
            suggestions.push({
                feature: 'Chat Integration',
                method: 'conversation/create',
                example: 'await client.sendChatMessage("Explain this code")'
            });
        }

        if (enabledKeys.includes('sn')) {
            suggestions.push({
                feature: 'Snippet Suggestions',
                method: 'textDocument/snippetSuggestion',
                example: 'await client.getSnippets(filePath, context)'
            });
        }

        if (enabledKeys.includes('pc')) {
            suggestions.push({
                feature: 'Path Completion',
                method: 'textDocument/pathCompletion',
                example: 'await client.getPathCompletions(partialPath)'
            });
        }

        return suggestions;
    }
}

module.exports = FeatureAnalyzer;
