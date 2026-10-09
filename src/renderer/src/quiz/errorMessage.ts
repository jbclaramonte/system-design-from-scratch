/** The message of a failed IPC call, without Electron's "Error invoking remote method" prefix. */
export function errorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
}
