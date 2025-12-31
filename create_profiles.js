import "dotenv/config";
import fs from "fs";
import csv from "csv-parser";
import { createClient } from "@supabase/supabase-js";

// Supabase client (service role required)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_PASSWORD = "Temp@1234";
const EMAIL_DOMAIN = "goodnews.com";
const ALLOWED_ROLES = ["admin", "cash_analyst", "mobile_banker"];

// helper: clean text for email
function clean(text) {
  return text.toLowerCase().replace(/[^a-z]/g, "");
}

// helper: build email
function buildEmail(fullName, accountNumber) {
  const parts = fullName.trim().split(/\s+/);
  const firstName = clean(parts[0]);
  const lastName = clean(parts[parts.length - 1]);
  const suffix = accountNumber.replace(/[^0-9]/g, "").slice(-3);

  return `${firstName}.${lastName[0]}.${suffix}@${EMAIL_DOMAIN}`;
}

async function run() {
  const rows = [];

  fs.createReadStream("agents.csv")
    .pipe(
      csv({
        mapHeaders: ({ header }) => header.replace(/^\uFEFF/, ""), // remove BOM
      })
    )
    .on("data", (data) => rows.push(data))
    .on("end", async () => {
      for (const row of rows) {
        const fullName = row["NAME"]?.trim();
        const accountNumber = row["ACCOUNT NUMBER"]?.trim();
        const branch = row["BRANCH"]?.trim();
        const role = row["ROLE"]?.trim() ?? "mobile_banker";

        if (!fullName || !accountNumber || !branch) {
          console.warn("Skipping invalid row:", row);
          continue;
        }

        if (!ALLOWED_ROLES.includes(role)) {
          console.warn("Invalid role, skipping row:", row);
          continue;
        }

        const email = buildEmail(fullName, accountNumber);

        try {
          // 1️⃣ Create auth user
          const { data: authData, error: authError } =
            await supabase.auth.admin.createUser({
              email,
              password: DEFAULT_PASSWORD,
              email_confirm: true,
              user_metadata: {
                full_name: fullName,
                branch,
                account_number: accountNumber,
                role,
              },
            });

          if (authError) {
            console.error("Auth error:", email, authError.message);
            continue;
          }

          // 2️⃣ Insert into users table (authoritative role source)
          const { error: userError } = await supabase.from("users").insert({
            id: authData.user.id,
            role,
            branch,
          });

          if (userError) {
            console.error("Users table error:", email, userError.message);
          } else {
            console.log(`Created [${role}]:`, email);
          }
        } catch (e) {
          console.error("Unexpected error:", email, e.message);
        }
      }

      console.log("Bulk user creation complete.");
    });
}

run();
