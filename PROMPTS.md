# AI Prompts Used

This project was built using the Antigravity AI agent. Below is the exact prompt provided by the user that led to the creation and configuration of this full-stack Cloudflare AI application.

## User Prompt

> Optional Assignment: See instructions below for Cloudflare AI app assignment. SUBMIT GitHub repo URL for the AI project here. (Please do not submit irrelevant repositories.)
> Optional Assignment Instructions: We plan to fast track review of candidates who complete an assignment to build a type of AI-powered application on Cloudflare. An AI-powered application should include the following components:
> LLM (recommend using Llama 3.3 on Workers AI), or an external LLM of your choice
> Workflow / coordination (recommend using Workflows, Workers or Durable Objects)
> User input via chat or voice (recommend using Pages or Realtime)
> Memory or state
> 
> IMPORTANT NOTE:
> To be considered, your repository name must be prefixed with cf_ai_, must include a README.md file with project documentation and clear running instructions to try out components (either locally or via deployed link). AI-assisted coding is encouraged, but you must include AI prompts used in PROMPTS.md
> All work must be original; copying from other submissions is strictly prohibited.

## AI Execution Trace

1. **Scaffolding**: The agent recognized the requirements aligned perfectly with the `cloudflare/agents-starter` template and cloned it into the `cf_ai_cloudfare` workspace.
2. **Configuration**: Modified the `ChatAgent` implementation in `src/server.ts` to switch the default language model to `@cf/meta/llama-3.3-70b-instruct-fp8-fast` natively over Workers AI, per the assignment recommendation.
3. **Documentation**: Authored the `README.md` and `PROMPTS.md` to cleanly present the assignment criteria, the architecture, and instructions for local execution.
