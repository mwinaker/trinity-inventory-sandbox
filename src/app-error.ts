export function getAppErrorDiagnostic(error: unknown) {
  const diagnostic =
    error instanceof Error
      ? `${error.name || 'Error'}: ${error.message || 'Unknown display failure'}`
      : 'Unknown display failure'
  return diagnostic.slice(0, 500)
}
