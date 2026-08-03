// Load .env before anything reads process.env. Imported first by the server.
try {
  process.loadEnvFile?.();
} catch {
  // No .env file: environment variables may still be set by the runtime.
}
