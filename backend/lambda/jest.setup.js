// jest.setup.js
// Place this file in the backend/lambda/ directory.
// Purpose: set environment variables before any test file is loaded.
// Reason: TABLE_NAME = process.env.MAIN_TABLE is read at module top-level,
//         so it must exist before any import runs. setupFiles guarantees this.

process.env.MAIN_TABLE = "test-main-table";
process.env.MAIN_TABLE_GSI1 = "test-gsi1";
process.env.ONEMAP_EMAIL = "test@example.com";
process.env.ONEMAP_PASSWORD = "test-password";
jest.spyOn(console, "log").mockImplementation(() => {});
jest.spyOn(console, "warn").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});