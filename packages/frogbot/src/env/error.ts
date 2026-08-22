export type EnvIssue = {
  envName: string
  message: string
  name: string
}

export class FrogbotEnvError extends Error {
  issues: EnvIssue[]

  constructor(issues: EnvIssue[]) {
    super(`Invalid environment:\n${issues.map((issue) => `  - ${issue.name} (${issue.envName}): ${issue.message}`).join('\n')}`)
    this.name = 'FrogbotEnvError'
    this.issues = issues
  }
}
