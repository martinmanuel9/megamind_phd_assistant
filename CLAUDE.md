# localopenbrainobsidian

## Description
I want to create the similar architecture and productionize my open-brain capability and mcp server, connect to my obsidian vault as a default and later sync to the openbrain, I also want to create a front end where I can start an MCP server and front end where I user can upload documents, we want a document repository, we want obsidian to tackle on the AI review and spit out the basic needs. We want to manage scripts and agents so that the user can have a PhD Research assistant and document management system that they can use obsidian to take notes, ai and perplexity to research and provide links and outputs synopsis synthesis. Create a knowledge base based on the articles downloaded and managed

## Tech Stack
recommend


## Architecture: Coding Harness
- **Quality gate:** Human reviews output
- **Governing principle:** Decompose on boundaries of isolation
- **Primary CLI:** claude

## Development Workflow (The Itzel Pipeline)

### Phase 1: Specify & Plan (spec-kit)
```bash
/speckit.specify    # Define requirements and acceptance criteria
/speckit.plan       # Create implementation plan with tasks
/speckit.tasks      # Generate Linear-ready task breakdown
```

### Phase 2: Build (GSD v1 — You Direct)
```bash
/gsd:create-roadmap # Create development roadmap from specs
/gsd:execute-plan   # Execute tasks with structured commits
/gsd:plan-phase     # Plan individual phases
```

### Phase 3: Review & Ship (gstack)
```bash
/review             # Code review with 18 specialist agents
/design-review      # UI/UX design review
/qa                 # Quality assurance pass
/ship               # Pre-deploy checks
/land-and-deploy    # Final deployment
```

## UI/UX Design Intelligence

### 21st.dev Component Library (MCP connected)
- Components available via Claude Code MCP integration (.mcp.json configured)
- Use for production-quality UI components (buttons, cards, forms, etc.)
- API key pre-configured in .env.local

### UI UX Pro Max Skill (design search)
Search for design recommendations:
```bash
python3 ~/repos/ui-ux-pro-max-skill/src/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>
```
Domains: `product`, `style`, `typography`, `color`, `landing`, `chart`, `ux`
Stacks: `--stack nextjs`, `--stack react`, `--stack shadcn`, `--stack html-tailwind`

### Design Defaults
- Dark mode default, zinc/neutral tokens, Geist Sans + Geist Mono
- shadcn/ui + Tailwind CSS for component foundation
- Mobile-first responsive design
- Minimum 44px touch targets on mobile

## Created by Itzel
- Date: 2026-06-03
- Complexity: production
- Architecture: Coding Harness
- Pipeline: spec-kit → claude → gstack
