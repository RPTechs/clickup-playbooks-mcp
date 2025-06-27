# ClickUp Playbooks MCP Server

A Model Context Protocol (MCP) server that provides access to ClickUp documents specifically from the RPNet->Playbooks folder. This server enables AI assistants to retrieve, analyze, and answer questions about playbook documents including estimations, descriptions, and requirements.

## Features

- **Folder-Specific Access**: Only retrieves documents from the RPNet->Playbooks folder in ClickUp
- **Document Analysis**: Automatically extracts estimations, requirements, descriptions, and complexity levels from playbook content
- **Question Answering**: Provides intelligent responses about playbook estimations, requirements, and descriptions
- **Search Functionality**: Search through playbooks using natural language queries
- **MCP Integration**: Full MCP protocol compliance for seamless integration with AI assistants

## Quick Start

### Install via npm (Recommended)

```bash
# Install globally
npm install -g @rptechs/clickup-playbooks-mcp

# Or use with npx (no installation required)
npx @rptechs/clickup-playbooks-mcp
```

### Claude Desktop Configuration

Add to your Claude Desktop config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "clickup-playbooks": {
      "command": "npx",
      "args": ["-y", "@rptechs/clickup-playbooks-mcp@latest"],
      "env": {
        "CLICKUP_API_TOKEN": "pk_your_token_here",
        "CLICKUP_PLAYBOOKS_FOLDER_ID": "20382935"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLICKUP_API_TOKEN` | ✅ | - | Your ClickUp API token |
| `CLICKUP_PLAYBOOKS_FOLDER_ID` | ❌ | `20382935` | RPNet Playbooks folder ID |
| `CLICKUP_WORKSPACE_ID` | ❌ | - | ClickUp workspace/team ID |
| `CLICKUP_SPACE_ID` | ❌ | - | ClickUp space ID |

### Getting Your ClickUp API Token

1. Go to ClickUp Settings → Apps
2. Click "Generate" under API Token
3. Copy the token (starts with `pk_`)

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
Search for playbooks in the RPNet->Playbooks folder.

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

Add this server to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "clickup-playbooks": {
      "command": "node",
      "args": ["/path/to/clickup-playbooks-mcp/build/index.js"]
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
- Uses ClickUp API v2
- Searches for RPNet folder and Playbooks subfolder
- Retrieves documents from folder lists
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
- Limited to documents within the RPNet->Playbooks folder structure

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
