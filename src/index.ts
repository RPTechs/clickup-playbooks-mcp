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
    const folderId = process.env.CLICKUP_PLAYBOOKS_FOLDER_ID || '98107928';
    
    if (!apiToken) {
      throw new Error('CLICKUP_API_TOKEN environment variable is required');
    }

    this.playbooksFolderId = folderId;

    // Initialize ClickUp client immediately if we have the token
    const workspaceId = process.env.CLICKUP_WORKSPACE_ID || '2285500';
    const config: ClickUpConfig = {
      apiToken,
      workspaceId,
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
          {
            name: 'test_api_connection',
            description: 'Test ClickUp API connection and debug data retrieval',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'scan_all_playbooks',
            description: 'Scan entire workspace for all playbooks and rank by relevance',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'recommend_playbooks',
            description: 'Recommend playbooks based on client issue or question, returns structured table',
            inputSchema: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  description: 'The client issue or question (e.g. "which playbooks do you suggest for a hubspot audit?")',
                },
              },
              required: ['question'],
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
          
          case 'test_api_connection':
            return await this.testApiConnection();
          
          case 'scan_all_playbooks':
            return await this.scanAllPlaybooks();
          
          case 'recommend_playbooks':
            return await this.recommendPlaybooks(args?.question as string);
          
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
    console.error(`[DEBUG] Retrieved ${docs.length} docs from folder ${this.playbooksFolderId}`);
    
    if (docs.length > 0) {
      console.error(`[DEBUG] Sample docs:`, docs.slice(0, 3).map(doc => ({
        id: doc.id,
        name: doc.name,
        contentLength: doc.content.length
      })));
    }

    // If query is empty, "*", or "all", show all playbooks
    if (!query || query.trim() === '' || query === '*' || query.toLowerCase().includes('all')) {
      return {
        content: [
          {
            type: 'text',
            text: docs.length === 0 
              ? `No playbooks found in folder ${this.playbooksFolderId}. Check your folder ID and API permissions.`
              : `Found ${docs.length} total playbooks:\n\n` +
                docs.map((doc, index) => `${index + 1}. **${doc.name}**\n   - ID: ${doc.id}\n   - Content: ${doc.content.length} characters`).join('\n\n'),
          },
        ],
      };
    }
    
    const results = this.documentAnalyzer.searchDocuments(docs, query);
    console.error(`[DEBUG] Search for "${query}" returned ${results.length} results`);

    return {
      content: [
        {
          type: 'text',
          text: docs.length === 0 
            ? `No playbooks found in folder ${this.playbooksFolderId}. Check your folder ID and API permissions.`
            : results.length > 0 
            ? `Found ${results.length} playbook(s) matching "${query}":\n\n` +
              results.map(doc => `- **${doc.name}**\n  ${doc.content.substring(0, 150)}...`).join('\n\n')
            : `Found ${docs.length} total playbooks, but none matched "${query}". Available playbooks:\n\n` +
              docs.slice(0, 10).map(doc => `- **${doc.name}**`).join('\n') + 
              (docs.length > 10 ? `\n... and ${docs.length - 10} more` : ''),
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

  private async testApiConnection() {
    if (!this.clickUpClient) {
      throw new Error('ClickUp client not configured');
    }

    let response = `# API Connection Test\n\n`;
    
    try {
      // Test basic API connectivity
      response += `**Configuration:**\n`;
      response += `- Workspace ID: ${this.clickUpClient['config'].workspaceId}\n`;
      response += `- Folder ID: ${this.playbooksFolderId}\n`;
      response += `- API Token: ${this.clickUpClient['config'].apiToken ? 'Present' : 'Missing'}\n\n`;

      // Test workspace docs endpoint
      response += `**Testing workspace docs endpoint...**\n`;
      const docs = await this.clickUpClient.getDocs(this.playbooksFolderId);
      response += `✅ Retrieved ${docs.length} documents\n\n`;

      if (docs.length > 0) {
        response += `**First 3 documents:**\n`;
        docs.slice(0, 3).forEach((doc, index) => {
          response += `${index + 1}. **${doc.name}** (ID: ${doc.id})\n`;
          response += `   - Content length: ${doc.content.length} characters\n`;
          response += `   - Created: ${new Date(parseInt(doc.date_created)).toLocaleDateString()}\n`;
        });
      } else {
        response += `⚠️ No documents found in folder ${this.playbooksFolderId}\n`;
        response += `This could mean:\n`;
        response += `- Wrong folder ID\n`;
        response += `- No documents in the folder\n`;
        response += `- API permissions issue\n`;
      }

    } catch (error) {
      response += `❌ **Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n`;
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

  private async scanAllPlaybooks() {
    if (!this.clickUpClient) {
      throw new Error('ClickUp client not configured');
    }

    let response = `# Complete Playbook Scan\n\n`;
    
    try {
      // Get documents from the specific playbooks folder
      const playbookFolderDocs = await this.clickUpClient.getDocs(this.playbooksFolderId);
      
      // Also get ALL documents from workspace for comparison
      const allDocs = await this.clickUpClient.getAllDocs();
      response += `📊 **Scan Results:** Found ${allDocs.length} documents in workspace, ${playbookFolderDocs.length} in playbooks folder\n\n`;

      // Use the documents from the playbooks folder as the primary source
      const playbooks = playbookFolderDocs.length > 0 ? playbookFolderDocs : 
        // Fallback: filter all docs for playbook-like content
        allDocs.filter(doc => {
          const name = doc.name.toLowerCase();
          const content = doc.content.toLowerCase();
          
          // Look for playbook indicators
          return name.includes('playbook') || 
                 name.includes('guide') || 
                 name.includes('process') ||
                 name.includes('audit') ||
                 name.includes('implementation') ||
                 content.includes('playbook') ||
                 content.includes('process') ||
                 content.includes('steps') ||
                 content.includes('checklist');
        });

      response += `🎯 **Playbooks Found:** ${playbooks.length} relevant playbooks\n\n`;

      if (playbooks.length > 0) {
        response += `## 📋 Available Playbooks\n\n`;
        
        playbooks.forEach((doc, index) => {
          const analysis = this.documentAnalyzer.analyzeDocument(doc);
          
          response += `### ${index + 1}. **${doc.name}**\n`;
          response += `- **ID:** ${doc.id}\n`;
          response += `- **Folder:** ${doc.folder?.name || 'Unknown'} (${doc.folder?.id || 'Unknown'})\n`;
          response += `- **Content Length:** ${doc.content.length} characters\n`;
          response += `- **Complexity:** ${analysis.complexity}\n`;
          
          if (analysis.estimation) {
            response += `- **Estimation:** ${analysis.estimation}\n`;
          }
          
          if (analysis.description) {
            response += `- **Description:** ${analysis.description.substring(0, 150)}...\n`;
          }
          
          if (analysis.tags.length > 0) {
            response += `- **Tags:** ${analysis.tags.join(', ')}\n`;
          }
          
          response += `- **Last Updated:** ${new Date(parseInt(doc.date_updated)).toLocaleDateString()}\n\n`;
        });

        // Add summary by category
        response += `## 📊 Summary by Category\n\n`;
        const categories = {
          'HubSpot/CRM': playbooks.filter(p => p.name.toLowerCase().includes('hubspot') || p.content.toLowerCase().includes('hubspot')),
          'Custom Objects': playbooks.filter(p => p.name.toLowerCase().includes('custom') || p.name.toLowerCase().includes('object')),
          'Audits': playbooks.filter(p => p.name.toLowerCase().includes('audit') || p.content.toLowerCase().includes('audit')),
          'Implementation': playbooks.filter(p => p.name.toLowerCase().includes('implementation') || p.content.toLowerCase().includes('implementation'))
        };

        Object.entries(categories).forEach(([category, docs]) => {
          if (docs.length > 0) {
            response += `**${category}:** ${docs.length} playbook(s)\n`;
            docs.forEach(doc => response += `  - ${doc.name}\n`);
            response += '\n';
          }
        });

      } else {
        response += `⚠️ No playbooks found. Documents scanned:\n\n`;
        allDocs.slice(0, 10).forEach((doc, index) => {
          response += `${index + 1}. **${doc.name}** (${doc.folder?.name || 'Unknown'})\n`;
        });
        if (allDocs.length > 10) {
          response += `... and ${allDocs.length - 10} more documents\n`;
        }
      }

    } catch (error) {
      response += `❌ **Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n`;
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

  private async recommendPlaybooks(question: string) {
    if (!this.clickUpClient) {
      throw new Error('ClickUp client not configured');
    }

    try {
      // Get docs specifically from Playbooks Instructions folder
      const docs = await this.clickUpClient.getDocs(this.playbooksFolderId);
      console.error(`[DEBUG] Found ${docs.length} docs in Playbooks Instructions folder`);

      // Search for relevant playbooks based on the question
      const relevantPlaybooks = this.documentAnalyzer.searchDocuments(docs, question);
      
      if (relevantPlaybooks.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No relevant playbooks found for: "${question}"\n\nAvailable playbooks in folder:\n${docs.map(doc => `- ${doc.name}`).join('\n')}`
            }
          ]
        };
      }

      // Analyze each relevant playbook
      const analyses = relevantPlaybooks.map(doc => ({
        doc,
        analysis: this.documentAnalyzer.analyzeDocument(doc)
      }));

      // Create the structured response
      let response = `# Recommended Playbooks\n\n`;
      response += `**Question:** ${question}\n\n`;

      // Add each playbook with the exact format requested
      analyses.forEach(({ doc, analysis }, index) => {
        const url = `https://app.clickup.com/${this.clickUpClient!['config'].workspaceId}/docs/${doc.id}`;
        
        response += `## ${index + 1}. ${doc.name}\n\n`;
        
        response += `**Timing Question:** "How long does the playbook implementation take?"\n`;
        response += `- **Answer:** ${analysis.timing || analysis.estimation || 'Timeline not specified in the playbook'}\n\n`;
        
        response += `**Prerequisites:** "What playbooks are prerequisites to complete the entire process?"\n`;
        response += `- **Answer:** ${analysis.prerequisites.length > 0 ? analysis.prerequisites.join(', ') : 'No specific prerequisites mentioned'}\n\n`;
        
        response += `**Hours:** "How many hours will the implementation take?"\n`;
        response += `- **Answer:** ${analysis.hours || analysis.estimation || 'Hours not specified'}\n\n`;
        
        response += `**Description:** "What is the playbook about?"\n`;
        response += `- **Answer:** ${analysis.description || 'Description not available'}\n\n`;
        
        response += `**Name:** "What is the name of the playbook?"\n`;
        response += `- **Answer:** ${doc.name}\n\n`;
        
        response += `**URL:** "What is the link to find the playbook?"\n`;
        response += `- **Answer:** ${url}\n\n`;
        
        response += '---\n\n';
      });

      // Add Playbooks Prerequisites section
      response += `# Playbooks Prerequisites\n\n`;
      
      // Find any playbooks that are mentioned as prerequisites
      const allPrerequisites = analyses.reduce((acc, { analysis }) => {
        return acc.concat(analysis.prerequisites);
      }, [] as string[]);
      
      if (allPrerequisites.length > 0) {
        // Look for any playbooks in our docs that match the prerequisites
        const prerequisitePlaybooks = docs.filter(doc => 
          allPrerequisites.some(prereq => 
            doc.name.toLowerCase().includes(prereq.toLowerCase()) ||
            prereq.toLowerCase().includes(doc.name.toLowerCase())
          )
        );
        
        if (prerequisitePlaybooks.length > 0) {
          prerequisitePlaybooks.forEach((doc, index) => {
            const analysis = this.documentAnalyzer.analyzeDocument(doc);
            const url = `https://app.clickup.com/${this.clickUpClient!['config'].workspaceId}/docs/${doc.id}`;
            
            response += `## ${index + 1}. ${doc.name} (Prerequisite)\n\n`;
            
            response += `**Timing Question:** "How long does the playbook implementation take?"\n`;
            response += `- **Answer:** ${analysis.timing || analysis.estimation || 'Timeline not specified in the playbook'}\n\n`;
            
            response += `**Prerequisites:** "What playbooks are prerequisites to complete the entire process?"\n`;
            response += `- **Answer:** ${analysis.prerequisites.length > 0 ? analysis.prerequisites.join(', ') : 'No specific prerequisites mentioned'}\n\n`;
            
            response += `**Hours:** "How many hours will the implementation take?"\n`;
            response += `- **Answer:** ${analysis.hours || analysis.estimation || 'Hours not specified'}\n\n`;
            
            response += `**Description:** "What is the playbook about?"\n`;
            response += `- **Answer:** ${analysis.description || 'Description not available'}\n\n`;
            
            response += `**Name:** "What is the name of the playbook?"\n`;
            response += `- **Answer:** ${doc.name}\n\n`;
            
            response += `**URL:** "What is the link to find the playbook?"\n`;
            response += `- **Answer:** ${url}\n\n`;
            
            response += '---\n\n';
          });
        } else {
          response += `No specific prerequisite playbooks found in the current folder.\n\n`;
          response += `**Mentioned Prerequisites:**\n`;
          allPrerequisites.forEach(prereq => {
            response += `- ${prereq}\n`;
          });
        }
      } else {
        response += `No prerequisites identified for the recommended playbooks.\n\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error finding playbooks: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new ClickUpPlaybooksMCP();
server.run().catch(console.error);