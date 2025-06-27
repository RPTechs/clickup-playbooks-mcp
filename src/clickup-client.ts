import { z } from 'zod';

export interface ClickUpConfig {
  apiToken: string;
  workspaceId?: string;
  spaceId?: string;
}

export interface ClickUpFolder {
  id: string;
  name: string;
  orderindex: number;
  override_statuses: boolean;
  hidden: boolean;
  space: {
    id: string;
    name: string;
  };
  task_count: string;
  lists: any[];
}

export interface ClickUpDoc {
  id: string;
  name: string;
  content: string;
  date_created: string;
  date_updated: string;
  creator: {
    id: string;
    username: string;
    email: string;
  };
  folder?: {
    id: string;
    name: string;
  };
}

export interface ClickUpSpace {
  id: string;
  name: string;
  private: boolean;
  statuses: any[];
  multiple_assignees: boolean;
  features: any;
}

export class ClickUpClient {
  private baseUrl = 'https://api.clickup.com/api/v2';
  private config: ClickUpConfig;

  constructor(config: ClickUpConfig) {
    this.config = config;
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': this.config.apiToken,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`ClickUp API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getWorkspaces(): Promise<{ teams: ClickUpSpace[] }> {
    return this.makeRequest('/team');
  }

  async getSpaces(workspaceId: string): Promise<{ spaces: ClickUpSpace[] }> {
    return this.makeRequest(`/team/${workspaceId}/space`);
  }

  async getFolders(spaceId: string, archived: boolean = false): Promise<{ folders: ClickUpFolder[] }> {
    const params = new URLSearchParams({ archived: archived.toString() });
    return this.makeRequest(`/space/${spaceId}/folder?${params}`);
  }

  async getFolder(folderId: string): Promise<ClickUpFolder> {
    return this.makeRequest(`/folder/${folderId}`);
  }

  async getFolderByName(spaceId: string, folderName: string): Promise<ClickUpFolder | null> {
    const { folders } = await this.getFolders(spaceId);
    return folders.find(folder => folder.name === folderName) || null;
  }

  async findRPNetPlaybooksFolder(): Promise<ClickUpFolder | null> {
    try {
      const { teams } = await this.getWorkspaces();
      
      for (const team of teams) {
        const { spaces } = await this.getSpaces(team.id);
        
        for (const space of spaces) {
          const { folders } = await this.getFolders(space.id);
          
          // Look for RPNet folder
          const rpnetFolder = folders.find(folder => 
            folder.name.toLowerCase().includes('rpnet')
          );
          
          if (rpnetFolder) {
            // Look for Playbooks subfolder or check if this folder contains playbooks
            const playbooksFolder = folders.find(folder => 
              folder.name.toLowerCase().includes('playbooks') && 
              folder.space.id === space.id
            );
            
            return playbooksFolder || rpnetFolder;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error finding RPNet Playbooks folder:', error);
      return null;
    }
  }

  async getDocs(folderId: string): Promise<ClickUpDoc[]> {
    try {
      // Use ClickUp's Docs API to search for docs in the folder
      const response = await this.makeRequest<{ docs: any[] }>(`/docs/search`, {
        method: 'POST',
        body: JSON.stringify({
          folder_id: folderId,
          include_closed: true
        })
      });
      
      const docs: ClickUpDoc[] = [];
      
      for (const doc of response.docs || []) {
        try {
          // Get the doc pages content
          const docPages = await this.getDocPages(doc.id);
          let content = '';
          
          if (docPages.pages && docPages.pages.length > 0) {
            // Combine all page content
            content = docPages.pages.map((page: any) => page.content?.markdown || page.content?.text || '').join('\n\n');
          }
          
          docs.push({
            id: doc.id,
            name: doc.name,
            content: content,
            date_created: doc.date_created,
            date_updated: doc.date_updated,
            creator: doc.creator,
            folder: {
              id: folderId,
              name: doc.folder?.name || 'Unknown'
            }
          });
        } catch (pageError) {
          console.error(`Error getting pages for doc ${doc.id}:`, pageError);
          // Still include the doc even if we can't get its content
          docs.push({
            id: doc.id,
            name: doc.name,
            content: '',
            date_created: doc.date_created,
            date_updated: doc.date_updated,
            creator: doc.creator,
            folder: {
              id: folderId,
              name: doc.folder?.name || 'Unknown'
            }
          });
        }
      }
      
      return docs;
    } catch (error) {
      console.error('Error getting docs:', error);
      return [];
    }
  }

  async getDocPages(docId: string): Promise<{ pages: any[] }> {
    return this.makeRequest(`/docs/${docId}/pages`);
  }

  private async getTasksInList(listId: string): Promise<any[]> {
    const response = await this.makeRequest<{ tasks: any[] }>(`/list/${listId}/task`);
    return response.tasks || [];
  }
}