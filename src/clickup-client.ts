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
      // Note: ClickUp API doesn't have a direct "get docs in folder" endpoint
      // We'll use the tasks endpoint and filter for docs, or use lists if docs are in lists
      const folder = await this.getFolder(folderId);
      const docs: ClickUpDoc[] = [];
      
      // Get lists in the folder and then get tasks/docs from those lists
      for (const list of folder.lists) {
        const tasks = await this.getTasksInList(list.id);
        
        // Filter for document-type tasks or tasks with document content
        const docTasks = tasks.filter((task: any) => 
          task.description || task.text_content || 
          (task.custom_fields && task.custom_fields.some((field: any) => 
            field.name?.toLowerCase().includes('doc') || 
            field.name?.toLowerCase().includes('content')
          ))
        );
        
        docs.push(...docTasks.map((task: any) => ({
          id: task.id,
          name: task.name,
          content: task.description || task.text_content || '',
          date_created: task.date_created,
          date_updated: task.date_updated,
          creator: task.creator,
          folder: {
            id: folderId,
            name: folder.name
          }
        })));
      }
      
      return docs;
    } catch (error) {
      console.error('Error getting docs:', error);
      return [];
    }
  }

  private async getTasksInList(listId: string): Promise<any[]> {
    const response = await this.makeRequest<{ tasks: any[] }>(`/list/${listId}/task`);
    return response.tasks || [];
  }
}