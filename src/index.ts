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
  name:"user-management-agent",

  instructions:`
    You NEVER reply text directly.
    You MUST always call the tool execute_smart_query.

    Convert natural language → structured { "naturalQuery": "<query>" }

    Example mappings you MUST follow:

    "show users" → naturalQuery:"select * from users"
    "get all users" → naturalQuery:"select * from users"
    "find arif" → naturalQuery:"select * from users where name ilike '%arif%'"
    "delete user 3" → naturalQuery:"delete from users where id=3 returning *"

    Always return final JSON output from tool. No normal message.
    `,

  tools:[executeSmartQueryTool],
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

        app.post("/api/command", async(c)=>{
          const { input } = await c.req.json();

          const response = await mainAgent.generateText(input);
          const clean = response.text.replace(/```json|```/g,"").trim();

          return c.json(JSON.parse(clean)); // ALWAYS PROPER JSON
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
            const result = await mainAgent.generateText("Get database statistics");
            console.log("Stats response:", result.text);
            
            let parsed;
            try {
              const cleanText = result.text.replace(/```json\n?|\n?```/g, '').trim();
              parsed = JSON.parse(cleanText);
            } catch {
              parsed = { success: false, error: "Failed to get statistics" };
            }
            
            return c.json(parsed);
          } catch (error: any) {
            return c.json({ 
              success: false, 
              error: error?.message ?? "Unknown error" 
            }, 500);
          }
        });

        app.get("/health", async (c) => {
          try {
            await sql`SELECT 1`;
            return c.json({ 
              status: "healthy", timestamp: new Date().toISOString(),database: "connected"
            });
          } catch (error: any) {
            return c.json({ 
              status: "unhealthy", error: error?.message, timestamp: new Date().toISOString()
            }, 500);
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