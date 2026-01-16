import { processPipeline } from '@/lib/pipeline';

async function main() {
  console.log('Running leads stage...');
  
  const result = await processPipeline({
    mode: 'incremental',
    stages: {
      ingest: false,
      embed: false,
      patterns: false,
      leads: true
    },
    continueOnError: false
  });

  console.log('Pipeline result:', JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch(console.error);
