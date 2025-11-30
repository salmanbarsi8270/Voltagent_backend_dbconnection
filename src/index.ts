// index.ts
import "dotenv/config";
import { VoltAgent, Agent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { neon } from "@neondatabase/serverless";
import { cors } from 'hono/cors';
import { executeSmartQueryTool } from "./tools/smartQueryTool";

const sql = neon(process.env.NEON_DB_URL!);

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

async function initializeDatabase() {
  console.log("🚀 Checking/Creating users table...");

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log("✅ USERS TABLE READY!");
    return { success: true };

  } catch (err: any) {
    console.error("❌ DB Init Failed:", err.message);
    return { success: false, error: err.message };
  }
}

const mainAgent = new Agent({
  name: "user-management-agent",

  instructions: `You are a user management AI assistant. Your job is to:

      1. ALWAYS use the execute_smart_query tool for database operations
      2. Convert natural language requests into tool calls
      3. Return the tool's response directly as JSON

      EXAMPLES:

      User: "show all users"
      → Call execute_smart_query with naturalQuery: "show all users"
      → Return the tool's JSON response

      User: "add user John with email john@test.com"
      → Call execute_smart_query with naturalQuery: "add user John with email john@test.com"
      → Return the tool's JSON response

      User: "delete user 3"
      → Call execute_smart_query with naturalQuery: "delete user 3"
      → Return the tool's JSON response

      Example: 
      User: "hi" 
      Response: {"success": true, "message": "Hello! I'm your user management assistant. I can help you create, read, update, delete users, or get statistics. What would you like to do?", "type": "conversation"} 

      User: "what can you do?" 
      Response: {"success": true, "message": "I can help you manage users with these commands:\n
      - Add/create users\n- Show/list all users\n- Search for users\n
      - Update user information\n
      - Delete users\n
      - Get database statistics", "type": "conversation"} 

      IMPORTANT:
      - You MUST always call the tool for any database-related request
      - Return ONLY the tool's JSON response, no additional text
      - If the tool returns an error, pass it through as-is`,

  tools: [executeSmartQueryTool],
  model: openrouter.chat("x-ai/grok-4.1-fast:free"),
});


const startServer = async () => {
  console.log("🔧 Setting up database...");
  const initResult = await initializeDatabase();

  if (!initResult.success) {
    console.error("❌ Failed to initialize database. Server may not work properly.");
  }

  new VoltAgent({
    agents: { mainAgent },
    server: honoServer({
      port: 3141,
      configureApp: (app) => {
        app.use('/*', cors({
          origin: ['http://localhost:3001'],
          allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowHeaders: ['Content-Type', 'Authorization'],
          credentials: true,
        }));

        app.post("/api/command", async (c) => {
          try {
            const { input } = await c.req.json();
            console.log("📥 Received command:", input);

            const response = await mainAgent.generateText(input);
            console.log("🤖 Agent response:", response.text);

            // Clean and parse response
            const clean = response.text.replace(/```json|```/g, "").trim();
            const parsed = JSON.parse(clean);

            return c.json(parsed);
          } catch (error: any) {
            console.error("❌ Command error:", error.message);
            return c.json({
              success: false,
              error: error.message || "Failed to process command"
            }, 500);
          }
        });

        app.post("/api/init", async (c) => {
          try {
            const result = await initializeDatabase();
            return c.json(result);
          } catch (error: any) {
            return c.json({ 
              success: false, 
              error: error?.message ?? "Unknown error" 
            }, 500);
          }
        });

        app.get("/api/stats", async (c) => {
          try {
            const result = await sql`
              SELECT  COUNT(*) as total_users, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as recent_users, COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) as today_users FROM users
            `;
            
            const stats = result[0];
            
            return c.json({success: true,stats: { total_users: parseInt(stats.total_users), recent_users: parseInt(stats.recent_users), today_users: parseInt(stats.today_users)}});
          } catch (error: any) {
            return c.json({ success: false, error: error?.message ?? "Unknown error"}, 500);
          }
        });

        app.get("/health", async (c) => {
          try {
            await sql`SELECT 1`;
            return c.json({  status: "healthy", timestamp: new Date().toISOString(), database: "connected"});
          } catch (error: any) {
            return c.json({  status: "unhealthy", error: error?.message, timestamp: new Date().toISOString()}, 500);
          }
        });
      },
    }),
  });

  console.log(`🚀 User Management Server running → http://localhost:3141`);
  console.log(`🤖 Smart Agent endpoint → http://localhost:3141/api/command`);
  console.log(`📊 API Health → http://localhost:3141/health`);
  console.log(`🗄️  Re-init DB → http://localhost:3141/api/init`);
  console.log(`📈 Stats API → http://localhost:3141/api/stats`);
};

startServer().catch(console.error);