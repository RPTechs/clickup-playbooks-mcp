# ClickUp Playbooks MCP Server

A Model Context Protocol (MCP) server that provides access to ClickUp documents specifically from the RPNet->Playbooks->Playbook Instructions folder. This server enables AI assistants to retrieve, analyze, and answer questions about playbook documents including estimations, descriptions, and requirements.

## Features

- **Folder-Specific Access**: Only retrieves documents from the RPNet->Playbooks->Playbook Instructions folder in ClickUp
- **Document Analysis**: Automatically extracts estimations, requirements, descriptions, and complexity levels from playbook content
- **Question Answering**: Provides intelligent responses about playbook estimations, requirements, and descriptions
- **Search Functionality**: Search through playbooks using natural language queries
- **MCP Integration**: Full MCP protocol compliance for seamless integration with AI assistants

## Quick Start


### Claude Desktop Configuration

Add to your Claude Desktop config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "clickup-playbooks": {
      "command": "npx",
      "args": ["-y", "github:RPTechs/clickup-playbooks-mcp"],
      "env": {
        "CLICKUP_API_TOKEN": "pk_your_token_here",
        "CLICKUP_WORKSPACE_ID": "2285500",
        "CLICKUP_PLAYBOOKS_FOLDER_ID": "98107928"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLICKUP_API_TOKEN` | ✅ | - | Your ClickUp API token |
| `CLICKUP_WORKSPACE_ID` | ❌ | `2285500` | Your ClickUp workspace ID |
| `CLICKUP_PLAYBOOKS_FOLDER_ID` | ❌ | `98107928` | RPNet->Playbooks->Playbook Instructions folder ID |


### Getting Your ClickUp API Token

1. Go to ClickUp Settings → Apps
2. Click "Generate" under API Token
3. Copy the token (starts with `pk_`)

### Getting Your Workspace and Folder IDs

#### Workspace ID
1. In ClickUp, look at your URL when viewing your workspace
2. The workspace ID is in the URL: `https://app.clickup.com/{workspace_id}/...`
3. Or use the browser console: `window.location.pathname.split('/')[1]`

#### Folder ID  
1. Navigate to your RPNet->Playbooks->Playbook Instructions folder
2. Look at the URL or right-click and inspect element
3. The folder ID will be visible in the URL or data attributes

## Development Installation

If you want to modify or contribute to the code:

```bash
git clone https://github.com/RPTechs/clickup-playbooks-mcp.git
cd clickup-playbooks-mcp
npm install
npm run build
```

## Usage

### MCP Tools Available

#### `search_playbooks`
Search for playbooks in the RPNet->Playbooks->Playbook Instructions folder.

#### `get_playbook_estimations`
Get time estimations from all playbooks.

#### `get_playbook_requirements`
Get requirements from all playbooks.

#### `ask_playbook_question`
Ask a question about playbooks (estimation, description, requirements).

#### `analyze_playbook`
Analyze a specific playbook for estimation, requirements, and complexity.

### MCP Resources

The server exposes playbooks as MCP resources with URIs in the format:
```
clickup://playbook/{document_id}
```

Each resource includes:
- Document name and description
- Extracted estimation information
- Requirements list
- Tags and complexity assessment
- Original document content

### Integration with Claude Desktop

For production use, add this server to your Claude Desktop MCP configuration using the GitHub repository:

```json
{
  "mcpServers": {
    "clickup-playbooks": {
      "command": "npx",
      "args": ["-y", "github:RPTechs/clickup-playbooks-mcp"],
      "env": {
        "CLICKUP_API_TOKEN": "pk_your_token_here",
        "CLICKUP_WORKSPACE_ID": "your_workspace_id",
        "CLICKUP_PLAYBOOKS_FOLDER_ID": "your_folder_id"
      }
    }
  }
}
```

For local development:

```json
{
  "mcpServers": {
    "clickup-playbooks": {
      "command": "node",
      "args": ["/path/to/clickup-playbooks-mcp/build/index.js"],
      "env": {
        "CLICKUP_API_TOKEN": "pk_your_token_here",
        "CLICKUP_WORKSPACE_ID": "your_workspace_id",
        "CLICKUP_PLAYBOOKS_FOLDER_ID": "your_folder_id"
      }
    }
  }
}
```

## Document Analysis Features

The server automatically analyzes playbook documents to extract:

### Estimations
- Time estimates (hours, days, weeks)
- Story points
- Duration indicators in titles (e.g., "[2h]", "[3 days]")

### Requirements
- Prerequisites and dependencies
- Setup requirements
- Access permissions needed
- Configuration requirements

### Descriptions
- Document summaries
- Purpose and goals
- Overview information

### Tags and Complexity
- Automatically tagged based on content keywords
- Complexity assessment (low/medium/high/unknown)
- Technology and process categorization

## Development

### Building
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

### Watching for Changes
```bash
npm run watch
```

### Testing with MCP Inspector
```bash
npm run inspector
```

## API Structure

### ClickUp Integration
- Uses ClickUp API v3 for Docs endpoints
- Uses ClickUp API v2 for other endpoints
- Directly accesses workspace documents by ID
- Filters documents by Playbook Instructions folder
- Handles API rate limiting and error responses

### Document Processing
- Content analysis using regular expressions
- Keyword extraction and categorization
- Estimation parsing from various formats
- Requirements identification from structured content

## Error Handling

The server includes comprehensive error handling for:
- Invalid ClickUp API credentials
- Missing folders or permissions
- API rate limiting
- Network connectivity issues
- Malformed document content

## Security Considerations

- API tokens are handled securely and not logged
- Only read access to specified ClickUp folders
- No modification or deletion of ClickUp data
- Input validation for all tool parameters

## Limitations

- Currently supports English language content analysis
- Requires ClickUp API access and appropriate permissions
- Document analysis is based on content patterns and may not catch all variations
- Limited to documents within the RPNet->Playbooks->Playbook Instructions folder structure

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.