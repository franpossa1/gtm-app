import type { NextConfig } from 'next';

const config: NextConfig = {
  agentRules: false,
  serverExternalPackages: ['@anthropic-ai/claude-agent-sdk'],
};
export default config;
