// agents/sqlGeneratorAgent.ts
import { Agent } from "@voltagent/core";
import { z } from "zod";
import { Output } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const sqlQuerySchema = z.object({
  query: z.string().describe("The complete SQL query to execute"),
  parameters: z.array(z.any()).describe("Array of parameters to bind to the query"),
  operation: z.enum(["SELECT", "INSERT", "UPDATE", "DELETE"]).describe("Type of SQL operation"),
  explanation: z.string().describe("Brief explanation of what the query does"),
});

export type SQLQuery = z.infer<typeof sqlQuerySchema>;

export const sqlGeneratorAgent = new Agent({
  name: "sql-generator",
  instructions: `You are an expert PostgreSQL query generator for the Neon serverless database.

        DATABASE SCHEMA:
        Table: users
        - id: SERIAL PRIMARY KEY
        - name: TEXT NOT NULL
        - email: TEXT UNIQUE NOT NULL
        - created_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        - updated_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP

        CRITICAL RULES:
        1. Use parameterized queries with $1, $2, etc. placeholders for user input
        2. NEVER include user input directly in the SQL string
        3. Use ILIKE for case-insensitive searches
        4. Include ORDER BY and LIMIT for SELECT queries
        5. Use RETURNING * for INSERT, UPDATE, DELETE operations
        6. For pattern matching, include % wildcards in parameters array

        EXAMPLES:

        Input: "show all users"
        Output: {
        "query": "SELECT * FROM users ORDER BY created_at DESC LIMIT 100",
        "parameters": [],
        "operation": "SELECT"
        }

        Input: "find user named john"
        Output: {
        "query": "SELECT * FROM users WHERE name ILIKE $1 ORDER BY created_at DESC",
        "parameters": ["%john%"],
        "operation": "SELECT"
        }

        Input: "add user John Doe with email john@example.com"
        Output: {
        "query": "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *",
        "parameters": ["John Doe", "john@example.com"],
        "operation": "INSERT"
        }

        Input: "delete user with id 5"
        Output: {
        "query": "DELETE FROM users WHERE id = $1 RETURNING *",
        "parameters": [5],
        "operation": "DELETE"
        }

        Input: "update user 3 set name to Jane Smith"
        Output: {
        "query": "UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
        "parameters": ["Jane Smith", 3],
        "operation": "UPDATE"
        }

        IMPORTANT: Always return valid JSON matching the schema.`,
  
  model: openrouter.chat("x-ai/grok-4.1-fast:free"),
});

export async function generateSQLQuery(request: string): Promise<SQLQuery> {
  const result = await sqlGeneratorAgent.generateText(request, {
    experimental_output: Output.object({ schema: sqlQuerySchema }),
  });

  const sqlQuery = JSON.parse(result.text) as SQLQuery;
  
  console.log("🔧 Generated SQL:", {
    operation: sqlQuery.operation,
    query: sqlQuery.query,
    parameters: sqlQuery.parameters,
    explanation: sqlQuery.explanation,
  });

  return sqlQuery;
}