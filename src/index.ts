#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ClickUpClient, ClickUpConfig } from './clickup-client.js';
import { DocumentAnalyzer } from './document-analyzer.js';

class ClickUpPlaybooksMCP {
  private server: Server;
  private clickUpClient: ClickUpClient | null = null;
  private documentAnalyzer: DocumentAnalyzer;
  private playbooksFolderId: string;

  constructor() {
    // Initialize from environment variables
    const apiToken = process.env.CLICKUP_API_TOKEN;
    const folderId = process.env.CLICKUP_PLAYBOOKS_FOLDER_ID || '20382935';
    
    if (!apiToken) {
      throw new Error('CLICKUP_API_TOKEN environment variable is required');
    }

    this.playbooksFolderId = folderId;

    // Initialize ClickUp client immediately if we have the token
    const config: ClickUpConfig = {
      apiToken,
      workspaceId: process.env.CLICKUP_WORKSPACE_ID,
      spaceId: process.env.CLICKUP_SPACE_ID,
    };
    this.clickUpClient = new ClickUpClient(config);

    this.server = new Server(
      {
        name: 'clickup-playbooks-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.documentAnalyzer = new DocumentAnalyzer();
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      if (!this.clickUpClient) {
        return { resources: [] };
      }

      try {
        const docs = await this.clickUpClient.getDocs(this.playbooksFolderId);
        
        return {
          resources: docs.map(doc => ({
            uri: `clickup://playbook/${doc.id}`,
            name: doc.name,
            description: `Playbook: ${doc.name}`,
            mimeType: 'text/plain',
          })),
        };
      } catch (error) {
        console.error('Error listing resources:', error instanceof Error ? error.message : error);
        return { resources: [] };
      }
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (!this.clickUpClient) {
        throw new Error('ClickUp client not configured');
      }

      const uri = request.params.uri;
      if (!uri.startsWith('clickup://playbook/')) {
        throw new Error('Invalid resource URI');
      }

      const docId = uri.replace('clickup://playbook/', '');
      
      try {
        const docs = await this.clickUpClient.getDocs(this.playbooksFolderId);
        const doc = docs.find(d => d.id === docId);
        
        if (!doc) {
          throw new Error('Document not found');
        }

        const analysis = this.documentAnalyzer.analyzeDocument(doc);
        
        let content = `# ${doc.name}\n\n`;
        content += `**Description:** ${analysis.description || 'No description available'}\n\n`;
        
        if (analysis.estimation) {
          content += `**Estimation:** ${analysis.estimation}\n\n`;
        }
        
        if (analysis.requirements.length > 0) {
          content += `**Requirements:**\n`;
          analysis.requirements.forEach(req => {
            content += `- ${req}\n`;
          });
          content += '\n';
        }
        
        if (analysis.tags.length > 0) {
          content += `**Tags:** ${analysis.tags.join(', ')}\n\n`;
        }
        
        content += `**Complexity:** ${analysis.complexity}\n\n`;
        content += `**Original Content:**\n${doc.content}`;

        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: content,
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to read resource: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_playbooks',
            description: 'Search for playbooks in the RPNet->Playbooks folder',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for playbooks',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_playbook_estimations',
            description: 'Get time estimations from all playbooks',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_playbook_requirements',
            description: 'Get requirements from all playbooks',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'ask_playbook_question',
            description: 'Ask a question about playbooks (estimation, description, requirements)',
            inputSchema: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  description: 'Question about playbooks',
                },
              },
              required: ['question'],
            },
          },
          {
            name: 'analyze_playbook',
            description: 'Analyze a specific playbook for estimation, requirements, and complexity',
            inputSchema: {
              type: 'object',
              properties: {
                playbookId: {
                  type: 'string',
                  description: 'ID of the playbook to analyze',
                },
              },
              required: ['playbookId'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_playbooks':
            return await this.searchPlaybooks(args?.query as string);
          
          case 'get_playbook_estimations':
            return await this.getPlaybookEstimations();
          
          case 'get_playbook_requirements':
            return await this.getPlaybookRequirements();
          
          case 'ask_playbook_question':
            return await this.askPlaybookQuestion(args?.question as string);
          
          case 'analyze_playbook':
            return await this.analyzePlaybook(args?.playbookId as string);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    });
  }



  private async searchPlaybooks(query: string) {
    if (!this.clickUpClient) {
      throw new Error('ClickUp client not configured');
    }

    const docs = await this.clickUpClient.getDocs(this.playbooksFolderId);
    const results = this.documentAnalyzer.searchDocuments(docs, query);

    return {
      content: [
        {
          type: 'text',
          text: results.length > 0 
            ? `Found ${results.length} playbook(s) matching "${query}":\n\n` +
              results.map(doc => `- **${doc.name}**\n  ${doc.content.substring(0, 150)}...`).join('\n\n')
            : `No playbooks found matching "${query}"`,
        },
      ],
    };
  }

  private async getPlaybookEstimations() {
    if (!this.clickUpClient) {
      throw new Error('ClickUp client not configured');
    }

    const docs = await this.clickUpClient.getDocs(this.playbooksFolderId);
    const estimations = docs
      .map(doc => ({ doc, analysis: this.documentAnalyzer.analyzeDocument(doc) }))
      .filter(({ analysis }) => analysis.estimation)
      .map(({ doc, analysis }) => `**${doc.name}**: ${analysis.estimation} (${analysis.complexity} complexity)`);

    return {
      content: [
        {
          type: 'text',
          text: estimations.length > 0
            ? `Playbook estimations:\n\n${estimations.join('\n')}`
            : 'No estimation information found in playbooks',
        },
      ],
    };
  }

  private async getPlaybookRequirements() {
    if (!this.clickUpClient) {
      throw new Error('ClickUp client not configured');
    }

    const docs = await this.clickUpClient.getDocs(this.playbooksFolderId);
    let response = 'Playbook requirements:\n\n';

    docs.forEach(doc => {
      const analysis = this.documentAnalyzer.analyzeDocument(doc);
      if (analysis.requirements.length > 0) {
        response += `**${doc.name}**:\n`;
        analysis.requirements.forEach(req => {
          response += `  - ${req}\n`;
        });
        response += '\n';
      }
    });

    return {
      content: [
        {
          type: 'text',
          text: response.includes('**') ? response : 'No specific requirements found in playbooks',
        },
      ],
    };
  }

  private async askPlaybookQuestion(question: string) {
    if (!this.clickUpClient) {
      throw new Error('ClickUp client not configured');
    }

    const docs = await this.clickUpClient.getDocs(this.playbooksFolderId);
    const answer = this.documentAnalyzer.answerQuestion(docs, question);

    return {
      content: [
        {
          type: 'text',
          text: answer,
        },
      ],
    };
  }

  private async analyzePlaybook(playbookId: string) {
    if (!this.clickUpClient) {
      throw new Error('ClickUp client not configured');
    }

    const docs = await this.clickUpClient.getDocs(this.playbooksFolderId);
    const doc = docs.find(d => d.id === playbookId);
    
    if (!doc) {
      throw new Error('Playbook not found');
    }

    const analysis = this.documentAnalyzer.analyzeDocument(doc);
    
    let response = `# Analysis of "${doc.name}"\n\n`;
    response += `**Description:** ${analysis.description || 'No description available'}\n\n`;
    response += `**Estimation:** ${analysis.estimation || 'No estimation found'}\n\n`;
    response += `**Complexity:** ${analysis.complexity}\n\n`;
    
    if (analysis.requirements.length > 0) {
      response += `**Requirements:**\n`;
      analysis.requirements.forEach(req => {
        response += `- ${req}\n`;
      });
      response += '\n';
    }
    
    if (analysis.tags.length > 0) {
      response += `**Tags:** ${analysis.tags.join(', ')}\n\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new ClickUpPlaybooksMCP();
server.run().catch(console.error);