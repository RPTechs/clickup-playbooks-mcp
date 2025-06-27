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
  private baseUrlV3 = 'https://api.clickup.com/api/v3';
  private config: ClickUpConfig;

  constructor(config: ClickUpConfig) {
    this.config = config;
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}, useV3: boolean = false): Promise<T> {
    const baseUrl = useV3 ? this.baseUrlV3 : this.baseUrl;
    const url = `${baseUrl}${endpoint}`;
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

  async getAllDocs(): Promise<ClickUpDoc[]> {
    try {
      if (!this.config.workspaceId) {
        throw new Error('Workspace ID is required for docs API');
      }

      console.error(`[DEBUG] Getting ALL docs from workspace: ${this.config.workspaceId}`);

      // Use ClickUp's v3 Docs API to get ALL docs from workspace
      const response = await this.makeRequest<{ docs: any[] }>(`/workspaces/${this.config.workspaceId}/docs`, {
        method: 'GET'
      }, true);
      
      console.error(`[DEBUG] API Response:`, {
        totalDocs: response.docs?.length || 0,
        allDocs: response.docs?.map(doc => ({
          id: doc.id,
          name: doc.name,
          parent: doc.parent
        })) || []
      });
      
      const docs: ClickUpDoc[] = [];
      
      // Get ALL documents, no folder filtering
      const allDocs = response.docs || [];
      
      console.error(`[DEBUG] Processing ${allDocs.length} documents`);
      
      for (const doc of allDocs) {
        try {
          console.error(`[DEBUG] Getting pages for doc: ${doc.id} (${doc.name})`);
          // Get the doc pages/content using v3 API
          const docPages = await this.getDocPages(doc.id);
          let content = '';
          
          console.error(`[DEBUG] Doc ${doc.id} pages:`, {
            pagesCount: docPages.pages?.length || 0,
            firstPage: docPages.pages?.[0] ? Object.keys(docPages.pages[0]) : null
          });
          
          // Extract content from pages
          if (docPages.pages && docPages.pages.length > 0) {
            content = docPages.pages.map((page: any) => {
              // Handle the actual content structure from your example
              if (page.content) {
                return page.content;
              }
              // Fallback to other possible content fields
              return page.content?.markdown || page.content?.text || '';
            }).filter(pageContent => pageContent.trim().length > 0).join('\n\n');
          }
          
          docs.push({
            id: doc.id,
            name: doc.name || 'Untitled',
            content: content,
            date_created: doc.date_created,
            date_updated: doc.date_updated,
            creator: this.formatCreator(doc.creator),
            folder: {
              id: doc.parent?.id || 'unknown',
              name: doc.parent?.name || 'Unknown Folder'
            }
          });
          
          console.error(`[DEBUG] Added doc: ${doc.name}, content length: ${content.length}, folder: ${doc.parent?.id}`);
        } catch (docError) {
          console.error(`[DEBUG] Error getting pages for doc ${doc.id}:`, docError);
          // Still include the doc even if we can't get its content
          docs.push({
            id: doc.id,
            name: doc.name || 'Untitled',
            content: '',
            date_created: doc.date_created,
            date_updated: doc.date_updated,
            creator: this.formatCreator(doc.creator),
            folder: {
              id: doc.parent?.id || 'unknown',
              name: doc.parent?.name || 'Unknown Folder'
            }
          });
        }
      }
      
      console.error(`[DEBUG] Final docs count: ${docs.length}`);
      return docs;
    } catch (error) {
      console.error('[DEBUG] Error getting all docs:', error);
      return [];
    }
  }

  async getDocs(folderId: string): Promise<ClickUpDoc[]> {
    try {
      if (!this.config.workspaceId) {
        throw new Error('Workspace ID is required for docs API');
      }

      console.error(`[DEBUG] Getting docs from workspace: ${this.config.workspaceId}, folder: ${folderId}`);

      // Use ClickUp's v3 Docs API with proper query parameters
      const params = new URLSearchParams({
        deleted: 'false',
        archived: 'false',
        limit: '50',
        parent_id: folderId
      });
      
      const response = await this.makeRequest<{ docs: any[] }>(`/workspaces/${this.config.workspaceId}/docs?${params}`, {
        method: 'GET'
      }, true);
      
      console.error(`[DEBUG] API Response:`, {
        totalDocs: response.docs?.length || 0,
        allDocs: response.docs?.map(doc => ({
          id: doc.id,
          name: doc.name,
          parent: doc.parent
        })) || []
      });
      
      const docs: ClickUpDoc[] = [];
      
      // The API already filtered by parent_id, so use all returned docs
      const filteredDocs = response.docs || [];
      
      console.error(`[DEBUG] API returned ${filteredDocs.length} docs for parent_id ${folderId}`);
      if (filteredDocs.length > 0) {
        console.error(`[DEBUG] Sample docs:`, filteredDocs.slice(0, 3).map(doc => ({
          id: doc.id,
          name: doc.name,
          parent: doc.parent
        })));
      }
      
      for (const doc of filteredDocs) {
        try {
          // Use doc_id if available, otherwise fall back to id
          const docIdToUse = doc.doc_id || doc.id;
          console.error(`[DEBUG] Getting pages for doc: ${doc.id}, using doc_id: ${docIdToUse}`);
          
          // Check if content is already available in the document response
          let content = '';
          if (doc.content && typeof doc.content === 'string') {
            content = doc.content;
            console.error(`[DEBUG] Using direct content from doc response, length: ${content.length}`);
          } else {
            // Get the doc pages/content using v3 API
            const docPages = await this.getDocPages(docIdToUse);
            
            console.error(`[DEBUG] Doc ${docIdToUse} pages:`, {
              pagesCount: docPages.pages?.length || 0,
              firstPage: docPages.pages?.[0] ? Object.keys(docPages.pages[0]) : null
            });
            
            // Extract content from pages
            if (docPages.pages && docPages.pages.length > 0) {
              content = docPages.pages.map((page: any) => {
                // Handle the actual content structure from your example
                if (page.content) {
                  return page.content;
                }
                // Fallback to other possible content fields
                return page.content?.markdown || page.content?.text || '';
              }).filter(pageContent => pageContent.trim().length > 0).join('\n\n');
            }
          }
          
          docs.push({
            id: doc.id,
            name: doc.name || 'Untitled',
            content: content,
            date_created: doc.date_created,
            date_updated: doc.date_updated,
            creator: this.formatCreator(doc.creator),
            folder: {
              id: folderId,
              name: 'Playbook Instructions'
            }
          });
          
          console.error(`[DEBUG] Added doc: ${doc.name}, content length: ${content.length}`);
        } catch (docError) {
          console.error(`[DEBUG] Error getting pages for doc ${doc.id}:`, docError);
          // Still include the doc even if we can't get its content
          docs.push({
            id: doc.id,
            name: doc.name || 'Untitled',
            content: '',
            date_created: doc.date_created,
            date_updated: doc.date_updated,
            creator: this.formatCreator(doc.creator),
            folder: {
              id: folderId,
              name: 'Playbook Instructions'
            }
          });
        }
      }
      
      console.error(`[DEBUG] Final docs count: ${docs.length}`);
      return docs;
    } catch (error) {
      console.error('[DEBUG] Error getting docs:', error);
      return [];
    }
  }

  async getDocPages(docId: string): Promise<{ pages: any[] }> {
    if (!this.config.workspaceId) {
      throw new Error('Workspace ID is required for docs API');
    }
    // Add required parameters for full content retrieval
    const params = new URLSearchParams({
      max_page_depth: '-1',
      content_format: 'text/md'
    });
    return this.makeRequest(`/workspaces/${this.config.workspaceId}/docs/${docId}/pages?${params}`, {}, true);
  }

  // New method to search specifically for documents by parent page ID
  async getDocsByParentPageId(parentPageId: string): Promise<ClickUpDoc[]> {
    try {
      if (!this.config.workspaceId) {
        throw new Error('Workspace ID is required for docs API');
      }

      console.error(`[DEBUG] Searching for docs with parent_page_id: ${parentPageId}`);

      // Get all docs from workspace
      const response = await this.makeRequest<{ docs: any[] }>(`/workspaces/${this.config.workspaceId}/docs`, {
        method: 'GET'
      }, true);
      
      // Filter specifically by parent_page_id
      const filteredDocs = (response.docs || []).filter((doc: any) => {
        return doc.parent_page_id === parentPageId;
      });

      console.error(`[DEBUG] Found ${filteredDocs.length} docs with parent_page_id ${parentPageId}`);

      const docs: ClickUpDoc[] = [];
      
      for (const doc of filteredDocs) {
        try {
          let content = doc.content || '';
          
          // If no direct content, try to get it from pages API
          if (!content) {
            const docIdToUse = doc.doc_id || doc.id;
            const docPages = await this.getDocPages(docIdToUse);
            
            if (docPages.pages && docPages.pages.length > 0) {
              content = docPages.pages.map((page: any) => {
                return page.content || page.content?.markdown || page.content?.text || '';
              }).filter(pageContent => pageContent.trim().length > 0).join('\n\n');
            }
          }
          
          docs.push({
            id: doc.id,
            name: doc.name || 'Untitled',
            content: content,
            date_created: doc.date_created,
            date_updated: doc.date_updated,
            creator: this.formatCreator(doc.creator),
            folder: {
              id: parentPageId,
              name: 'Playbooks'
            }
          });
          
          console.error(`[DEBUG] Added doc: ${doc.name}, content length: ${content.length}`);
        } catch (docError) {
          console.error(`[DEBUG] Error processing doc ${doc.id}:`, docError);
        }
      }
      
      return docs;
    } catch (error) {
      console.error('[DEBUG] Error getting docs by parent page ID:', error);
      return [];
    }
  }

  private formatCreator(creator: any): { id: string; username: string; email: string } {
    if (typeof creator === 'number') {
      return { id: creator.toString(), username: '', email: '' };
    }
    return creator || { id: '', username: '', email: '' };
  }

  private async getTasksInList(listId: string): Promise<any[]> {
    const response = await this.makeRequest<{ tasks: any[] }>(`/list/${listId}/task`);
    return response.tasks || [];
  }
}