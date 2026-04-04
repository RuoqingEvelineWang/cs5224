# Unit Testing Guide

## Setup

Run the following commands inside the `backend/lambda/` directory:

```bash
npm install --save-dev jest babel-jest @babel/core @babel/preset-env
```

Create `babel.config.json` in `backend/lambda/`:

```json
{
  "presets": [["@babel/preset-env", { "targets": { "node": "current" } }]]
}
```

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage
```

Coverage reports are generated in `coverage/lcov-report/index.html`.

## Notes

- No AWS credentials or running backend required — all DynamoDB and external API calls are mocked.
- Test files are co-located with their source files in `handlers/` and follow the `*.test.js` naming convention.
- If a new handler is added, create a corresponding `handlerName.test.js` in the same directory.
- If a test fails after updating source code, check whether the failure is due to a logic change in the source (update the expected value) or an actual bug (fix the source first).