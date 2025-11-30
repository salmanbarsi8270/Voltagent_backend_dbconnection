// tools/smartQueryTool.ts
import { createTool } from "@voltagent/core";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";
import { generateSQLQuery } from "../agents/sqlGeneratorAgent";

export const sql = neon(process.env.NEON_DB_URL!);

export const executeSmartQueryTool = createTool({
  name: "execute_smart_query",
  description: "AI → SQL → Execute → Returns real users",

  parameters: z.object({naturalQuery: z.string()}),

  async execute({ naturalQuery }) {
    try {
      const q = await generateSQLQuery(naturalQuery);
      console.log("🔧 Generated Query:", q.query);
      console.log("🔧 Parameters:", q.parameters);

      // ✅ FIXED: Use .query() method for parameterized queries
      const result = await sql.query(q.query, q.parameters);
      
      // Neon returns { rows: [...], rowCount: N }
      const rows = result;

      return {
        success: true,
        users: rows,
        count: rows.length,
        message: `Retrieved ${rows.length} users`,
        operation: q.operation
      };
    }
    catch (e: any) {
      console.error("❌ Query execution error:", e.message);
      return { 
        success: false, 
        error: e.message 
      };
    }
  }
});