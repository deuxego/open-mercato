import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'open-mercato',
  // v4: checkpointing is enabled by default. Set maxRuntime for serverless platforms.
  // Adjust if deploying to Vercel/serverless with different max duration.
  checkpointing: {
    maxRuntime: '50s',
  },
})
