import { ClickUpDoc } from './clickup-client.js';

export interface PlaybookAnalysis {
  estimation: string | null;
  description: string | null;
  requirements: string[];
  tags: string[];
  complexity: 'low' | 'medium' | 'high' | 'unknown';
  hours: string | null;
  prerequisites: string[];
  timing: string | null;
}

export class DocumentAnalyzer {
  
  analyzeDocument(doc: ClickUpDoc): PlaybookAnalysis {
    const content = doc.content.toLowerCase();
    const name = doc.name.toLowerCase();
    
    return {
      estimation: this.extractEstimation(content, name),
      description: this.extractDescription(doc),
      requirements: this.extractRequirements(content),
      tags: this.extractTags(content, name),
      complexity: this.assessComplexity(content),
      hours: this.extractHours(content, name),
      prerequisites: this.extractPrerequisites(content),
      timing: this.extractTiming(content)
    };
  }

  private extractEstimation(content: string, name: string): string | null {
    const estimationPatterns = [
      // Sprint points patterns (prioritize these)
      /(?:story points?|sprint points?|sp|points?)[\s:]*(\d+(?:\.\d+)?)/gi,
      /(\d+(?:\.\d+)?)\s*(?:story points?|sprint points?|sp|points?)\b/gi,
      // Time-based patterns
      /(?:estimate|estimation|time|duration|effort)[\s:]*(\d+(?:\.\d+)?)\s*(hours?|days?|weeks?|minutes?|hrs?)/gi,
      /(\d+(?:\.\d+)?)\s*(hours?|days?|weeks?|minutes?|hrs?)\s*(?:estimate|estimation|time|duration|effort)/gi,
      /(?:takes?|require[ds]?|need[s]?)\s*(?:about|around|approximately)?\s*(\d+(?:\.\d+)?)\s*(hours?|days?|weeks?|minutes?|hrs?)/gi,
      // Generic number + unit patterns
      /(\d+(?:\.\d+)?)\s*(story points?|sprint points?|sp|points?|hours?|hrs?|days?|weeks?)\b/gi
    ];

    for (const pattern of estimationPatterns) {
      const matches = [...content.matchAll(pattern)];
      if (matches.length > 0) {
        const match = matches[0];
        const value = match[1];
        const unit = match[2] || 'points';
        
        // Convert sprint points to hours if needed (assuming 8 hours per sprint point)
        if (unit.toLowerCase().includes('point') || unit.toLowerCase() === 'sp') {
          const points = parseFloat(value);
          return `${value} sprint points (${points * 8} hours)`;
        }
        
        return `${value} ${unit}`;
      }
    }

    // Check title for estimation clues
    const titlePattern = /\[(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|d|days?|w|weeks?|sp|points?)\]/gi;
    const titleMatch = name.match(titlePattern);
    if (titleMatch) {
      const valueMatch = titleMatch[0].match(/(\d+(?:\.\d+)?)/);
      const unitMatch = titleMatch[0].match(/(h|hr|hrs|hours?|d|days?|w|weeks?|sp|points?)/i);
      
      if (valueMatch && unitMatch) {
        const value = valueMatch[1];
        const unit = unitMatch[1];
        
        if (unit.toLowerCase() === 'sp' || unit.toLowerCase().includes('point')) {
          const points = parseFloat(value);
          return `${value} sprint points (${points * 8} hours)`;
        }
      }
      
      return titleMatch[0].replace(/[\[\]]/g, '');
    }

    return null;
  }

  private extractDescription(doc: ClickUpDoc): string | null {
    const content = doc.content;
    
    // Try to find description section
    const descriptionPatterns = [
      /(?:description|summary|overview)[\s\n]*[:]\s*([^\n]+(?:\n(?!#+|\*|\d+\.)[^\n]+)*)/gi,
      /(?:what|purpose|goal)[\s\n]*[:]\s*([^\n]+(?:\n(?!#+|\*|\d+\.)[^\n]+)*)/gi
    ];

    for (const pattern of descriptionPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // If no explicit description, use the first paragraph or sentence
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    const firstContent = lines.find(line => 
      !line.startsWith('#') && 
      !line.startsWith('*') && 
      !line.startsWith('-') && 
      !line.match(/^\d+\./) &&
      line.length > 20
    );

    return firstContent || doc.name;
  }

  private extractRequirements(content: string): string[] {
    const requirements: string[] = [];
    
    const requirementPatterns = [
      /(?:requirements?|prerequisite[s]?|dependencies|needed)[\s\n]*[:]\s*([^\n]+(?:\n[-*]\s*[^\n]+)*)/gi,
      /(?:must have|required|necessary)[\s\n]*[:]\s*([^\n]+(?:\n[-*]\s*[^\n]+)*)/gi,
      /(?:before starting|pre-req[s]?|setup)[\s\n]*[:]\s*([^\n]+(?:\n[-*]\s*[^\n]+)*)/gi
    ];

    for (const pattern of requirementPatterns) {
      const matches = [...content.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1]) {
          const reqText = match[1].trim();
          // Split by bullet points or new lines
          const items = reqText.split(/\n[-*]\s*|\n\d+\.\s*/).filter(item => item.trim());
          requirements.push(...items.map(item => item.trim()));
        }
      });
    }

    // Look for bullet point lists that might be requirements
    const bulletPoints = content.match(/[-*]\s+([^\n]+)/g);
    if (bulletPoints) {
      const contextWords = ['access', 'permission', 'install', 'configure', 'setup', 'account', 'credential'];
      bulletPoints.forEach(bullet => {
        const text = bullet.replace(/[-*]\s+/, '').trim();
        if (contextWords.some(word => text.toLowerCase().includes(word))) {
          requirements.push(text);
        }
      });
    }

    return [...new Set(requirements)]; // Remove duplicates
  }

  private extractTags(content: string, name: string): string[] {
    const tags: string[] = [];
    
    // Look for explicit tags
    const tagPatterns = [
      /(?:tags?|categories|labels?)[\s:]*([^\n]+)/gi,
      /#(\w+)/g
    ];

    for (const pattern of tagPatterns) {
      const matches = [...content.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1]) {
          const tagText = match[1].trim();
          const extractedTags = tagText.split(/[,\s]+/).filter(tag => tag.length > 1);
          tags.push(...extractedTags);
        }
      });
    }

    // Infer tags from content keywords
    const keywords = {
      'api': ['api', 'endpoint', 'rest', 'graphql', 'webhook'],
      'database': ['database', 'sql', 'nosql', 'mongodb', 'postgres', 'mysql'],
      'deployment': ['deploy', 'deployment', 'ci/cd', 'docker', 'kubernetes'],
      'security': ['security', 'auth', 'authentication', 'authorization', 'ssl', 'tls'],
      'monitoring': ['monitor', 'logging', 'metrics', 'alerting', 'observability'],
      'testing': ['test', 'testing', 'unit test', 'integration test', 'qa'],
      'documentation': ['document', 'documentation', 'readme', 'guide', 'manual'],
      'maintenance': ['maintenance', 'update', 'patch', 'upgrade', 'migration']
    };

    const combinedText = (content + ' ' + name).toLowerCase();
    
    Object.entries(keywords).forEach(([tag, keywordList]) => {
      if (keywordList.some(keyword => combinedText.includes(keyword))) {
        tags.push(tag);
      }
    });

    return [...new Set(tags)]; // Remove duplicates
  }

  private assessComplexity(content: string): 'low' | 'medium' | 'high' | 'unknown' {
    const complexityIndicators = {
      high: [
        'integration', 'architecture', 'migration', 'refactor', 'complex',
        'multiple systems', 'distributed', 'microservices', 'scalability'
      ],
      medium: [
        'configuration', 'setup', 'implementation', 'development',
        'multiple steps', 'dependencies', 'coordination'
      ],
      low: [
        'simple', 'basic', 'quick', 'straightforward', 'single step',
        'documentation', 'review', 'minor change'
      ]
    };

    const lowerContent = content.toLowerCase();
    
    let highScore = 0;
    let mediumScore = 0;
    let lowScore = 0;

    Object.entries(complexityIndicators).forEach(([level, indicators]) => {
      const score = indicators.reduce((count, indicator) => {
        return count + (lowerContent.split(indicator).length - 1);
      }, 0);

      if (level === 'high') highScore = score;
      else if (level === 'medium') mediumScore = score;
      else if (level === 'low') lowScore = score;
    });

    // Consider content length as a factor
    const contentLength = content.length;
    if (contentLength > 2000) highScore += 1;
    else if (contentLength > 500) mediumScore += 1;
    else lowScore += 1;

    if (highScore > mediumScore && highScore > lowScore) return 'high';
    if (mediumScore > lowScore) return 'medium';
    if (lowScore > 0) return 'low';
    
    return 'unknown';
  }

  searchDocuments(docs: ClickUpDoc[], query: string): ClickUpDoc[] {
    const lowerQuery = query.toLowerCase();
    const queryTerms = lowerQuery.split(/\s+/).filter(term => term.length > 2);
    
    return docs.filter(doc => {
      const searchText = (doc.name + ' ' + doc.content).toLowerCase();
      return queryTerms.some(term => searchText.includes(term));
    }).sort((a, b) => {
      // Sort by relevance - count of matching terms
      const aMatches = queryTerms.reduce((count, term) => 
        count + (a.name + ' ' + a.content).toLowerCase().split(term).length - 1, 0
      );
      const bMatches = queryTerms.reduce((count, term) => 
        count + (b.name + ' ' + b.content).toLowerCase().split(term).length - 1, 0
      );
      return bMatches - aMatches;
    });
  }

  answerQuestion(docs: ClickUpDoc[], question: string): string {
    const lowerQuestion = question.toLowerCase();
    
    // Determine question type
    if (lowerQuestion.includes('estimate') || lowerQuestion.includes('time') || lowerQuestion.includes('duration')) {
      return this.answerEstimationQuestion(docs, question);
    }
    
    if (lowerQuestion.includes('requirement') || lowerQuestion.includes('need') || lowerQuestion.includes('prerequisite')) {
      return this.answerRequirementsQuestion(docs, question);
    }
    
    if (lowerQuestion.includes('description') || lowerQuestion.includes('what') || lowerQuestion.includes('how')) {
      return this.answerDescriptionQuestion(docs, question);
    }
    
    // General search
    const relevantDocs = this.searchDocuments(docs, question);
    if (relevantDocs.length === 0) {
      return "I couldn't find any relevant documents for your question.";
    }
    
    const analyses = relevantDocs.slice(0, 3).map(doc => this.analyzeDocument(doc));
    return this.formatGeneralAnswer(relevantDocs.slice(0, 3), analyses, question);
  }

  private answerEstimationQuestion(docs: ClickUpDoc[], question: string): string {
    const analyses = docs.map(doc => ({ doc, analysis: this.analyzeDocument(doc) }))
      .filter(({ analysis }) => analysis.estimation);
    
    if (analyses.length === 0) {
      return "No estimation information found in the available playbooks.";
    }
    
    let response = "Here are the estimations found:\n\n";
    analyses.forEach(({ doc, analysis }) => {
      response += `**${doc.name}**: ${analysis.estimation}\n`;
      if (analysis.complexity !== 'unknown') {
        response += `  - Complexity: ${analysis.complexity}\n`;
      }
      response += '\n';
    });
    
    return response;
  }

  private answerRequirementsQuestion(docs: ClickUpDoc[], question: string): string {
    const analyses = docs.map(doc => ({ doc, analysis: this.analyzeDocument(doc) }))
      .filter(({ analysis }) => analysis.requirements.length > 0);
    
    if (analyses.length === 0) {
      return "No specific requirements found in the available playbooks.";
    }
    
    let response = "Here are the requirements found:\n\n";
    analyses.forEach(({ doc, analysis }) => {
      response += `**${doc.name}**:\n`;
      analysis.requirements.forEach(req => {
        response += `  - ${req}\n`;
      });
      response += '\n';
    });
    
    return response;
  }

  private answerDescriptionQuestion(docs: ClickUpDoc[], question: string): string {
    const relevantDocs = this.searchDocuments(docs, question).slice(0, 3);
    
    if (relevantDocs.length === 0) {
      return "No relevant playbooks found for your question.";
    }
    
    let response = "Here are the relevant playbooks:\n\n";
    relevantDocs.forEach(doc => {
      const analysis = this.analyzeDocument(doc);
      response += `**${doc.name}**\n`;
      response += `${analysis.description || 'No description available'}\n`;
      
      if (analysis.tags.length > 0) {
        response += `Tags: ${analysis.tags.join(', ')}\n`;
      }
      
      if (analysis.estimation) {
        response += `Estimated time: ${analysis.estimation}\n`;
      }
      
      response += '\n';
    });
    
    return response;
  }

  private formatGeneralAnswer(docs: ClickUpDoc[], analyses: PlaybookAnalysis[], question: string): string {
    let response = `Found ${docs.length} relevant playbook(s):\n\n`;
    
    docs.forEach((doc, index) => {
      const analysis = analyses[index];
      response += `**${doc.name}**\n`;
      response += `${analysis.description || 'No description available'}\n`;
      
      if (analysis.estimation) {
        response += `⏱️ Estimation: ${analysis.estimation}\n`;
      }
      
      if (analysis.requirements.length > 0) {
        response += `📋 Requirements: ${analysis.requirements.slice(0, 3).join(', ')}${analysis.requirements.length > 3 ? '...' : ''}\n`;
      }
      
      if (analysis.tags.length > 0) {
        response += `🏷️ Tags: ${analysis.tags.join(', ')}\n`;
      }
      
      response += '\n';
    });
    
    return response;
  }

  private extractHours(content: string, name: string): string | null {
    // First check for sprint points patterns (prioritize these)
    const sprintPatterns = [
      /(?:story points?|sprint points?|sp|points?)[\s:]*(\d+(?:\.\d+)?)/gi,
      /(\d+(?:\.\d+)?)\s*(?:story points?|sprint points?|sp|points?)\b/gi
    ];

    for (const pattern of sprintPatterns) {
      const matches = [...content.matchAll(pattern)];
      if (matches.length > 0) {
        const match = matches[0];
        const points = parseFloat(match[1]);
        return `${points * 8} hours (${points} sprint points)`;
      }
    }

    // Then check for direct hour patterns
    const hourPatterns = [
      /(\d+(?:\.\d+)?)\s*hours?/gi,
      /(\d+(?:\.\d+)?)\s*hrs?/gi,
      /(\d+(?:\.\d+)?)\s*h\b/gi,
      /hours?[\s:]*(\d+(?:\.\d+)?)/gi,
      /duration[\s:]*(\d+(?:\.\d+)?)\s*hours?/gi
    ];

    for (const pattern of hourPatterns) {
      const matches = [...content.matchAll(pattern)];
      if (matches.length > 0) {
        const match = matches[0];
        return `${match[1]} hours`;
      }
    }

    return null;
  }

  private extractPrerequisites(content: string): string[] {
    const prerequisites: string[] = [];
    
    const prerequisitePatterns = [
      /prerequisite[s]?[\s\n]*[:]\s*([^\n]+(?:\n[-*]\s*[^\n]+)*)/gi,
      /before\s+starting[\s\n]*[:]\s*([^\n]+(?:\n[-*]\s*[^\n]+)*)/gi,
      /dependencies[\s\n]*[:]\s*([^\n]+(?:\n[-*]\s*[^\n]+)*)/gi,
      /requires?[\s\n]*[:]\s*([^\n]+(?:\n[-*]\s*[^\n]+)*)/gi,
      /must\s+have[\s\n]*[:]\s*([^\n]+(?:\n[-*]\s*[^\n]+)*)/gi
    ];

    for (const pattern of prerequisitePatterns) {
      const matches = [...content.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1]) {
          const reqText = match[1].trim();
          // Split by bullet points or new lines
          const items = reqText.split(/\n[-*]\s*|\n\d+\.\s*/).filter(item => item.trim());
          prerequisites.push(...items.map(item => item.trim()));
        }
      });
    }

    return [...new Set(prerequisites)]; // Remove duplicates
  }

  private extractTiming(content: string): string | null {
    const timingPatterns = [
      /(?:timing|timeline|timeframe)[\s:]*([^\n]+)/gi,
      /(?:takes?|requires?)\s*(?:about|around|approximately)?\s*([^\n]+?(?:hours?|days?|weeks?|months?))/gi,
      /completion\s*time[\s:]*([^\n]+)/gi,
      /duration[\s:]*([^\n]+)/gi,
      /implementation\s*takes?[\s:]*([^\n]+)/gi,
      /how\s*long[\s:]*(.*?)(?:\n|$)/gi
    ];

    for (const pattern of timingPatterns) {
      const matches = [...content.matchAll(pattern)];
      if (matches.length > 0 && matches[0][1]) {
        let timing = matches[0][1].trim();
        // Clean up common unwanted text
        timing = timing.replace(/^does\s+the\s+playbook\s+implementation\s+take\??\s*/i, '');
        if (timing.length > 0) {
          return timing;
        }
      }
    }

    return null;
  }
}