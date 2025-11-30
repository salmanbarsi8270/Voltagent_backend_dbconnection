// agents/sqlGeneratorAgent.ts
import { Agent } from "@voltagent/core";
import { z } from "zod";
import { Output } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

// Schema for SQL query generation
const sqlQuerySchema = z.object({
  query: z.string().describe("The complete SQL query to execute"),
  parameters: z.array(z.any()).describe("Array of parameters to bind to the query"),
  operation: z.enum(["SELECT", "INSERT", "UPDATE", "DELETE"]).describe("Type of SQL operation"),
  explanation: z.string().describe("Brief explanation of what the query does"),
});

export type SQLQuery = z.infer<typeof sqlQuerySchema>;  

// SQL Generator Sub-Agent
export const sqlGeneratorAgent = new Agent({
  name: "sql-generator",
  instructions: `You are an expert PostgreSQL query generator. Your job is to generate safe, efficient SQL queries based on natural language requirements.

DATABASE SCHEMA:
Table: users
Columns:
- id: SERIAL PRIMARY KEY
- name: TEXT NOT NULL
- email: TEXT UNIQUE NOT NULL
- created_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- updated_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP

sample example
run query like this
 const result = await sql "SELECT * FROM users"

QUERY GENERATION RULES:

1. ALWAYS use parameterized queries with $1, $2, etc. placeholders
2. NEVER include user input directly in the SQL string
3. Use ILIKE for case-insensitive pattern matching
4. Always include appropriate ORDER BY and LIMIT clauses
5. For searches, use pattern matching with % wildcards
6. Return ONLY the columns needed
7. Use RETURNING clause for INSERT, UPDATE, DELETE operations

EXAMPLES:

Request: "Find all users"

IMPORTANT:
- Always validate that parameters match the placeholders in the query
- For LIKE/ILIKE patterns, include % wildcards in the parameters, not in the query
- Use appropriate data types (numbers for IDs, strings for text)
- Include LIMIT clauses for SELECT queries to prevent large result sets
- Use RETURNING * or specific columns for INSERT/UPDATE/DELETE operations`,
  
  model: openrouter.chat("x-ai/grok-4.1-fast:free"),
});

// Function to generate SQL query using the sub-agent
export async function generateSQLQuery(request: string): Promise<SQLQuery> {
  const result = await sqlGeneratorAgent.generateText(request, {
    experimental_output: Output.object({schema: sqlQuerySchema}),
  });

  // Parse the structured output
  const sqlQuery = JSON.parse(result.text) as SQLQuery;
  
  console.log("🔧 Generated SQL:", {
    operation: sqlQuery.operation,
    query: sqlQuery.query,
    parameters: sqlQuery.parameters,
    explanation: sqlQuery.explanation,
  });

  return sqlQuery;
}