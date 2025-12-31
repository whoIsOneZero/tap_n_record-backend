import "dotenv/config";
import fs from "fs";
import csv from "csv-parser";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_PASSWORD = "Temp@1234";
const EMAIL_DOMAIN = "goodnews.com";

// helper: clean text
function clean(text) {
  return text.toLowerCase().replace(/[^a-z]/g, "");
}

// helper: build email
function buildEmail(fullName, accountNumber) {
  const parts = fullName.trim().split(/\s+/);

  const firstName = clean(parts[0]);
  const lastName = clean(parts[parts.length - 1]);

  // suffix from account number for uniqueness
  const suffix = accountNumber.replace(/[^0-9]/g, "").slice(-3);

  return `${firstName}.${lastName[0]}.${suffix}@${EMAIL_DOMAIN}`;
}

async function run() {
  const rows = [];

  fs.createReadStream("agents.csv")
    .pipe(csv())
    .on("data", (data) => rows.push(data))
    .on("end", async () => {
      for (const row of rows) {
        const fullName = row["NAME"]?.trim();
        const accountNumber = row["ACCOUNT NUMBER"]?.trim();
        const branch = row["BRANCH"]?.trim();

        if (!fullName || !accountNumber) {
          console.warn("Skipping invalid row:", row);
          continue; // ← important: continue, not return
        }

        const email = buildEmail(fullName, accountNumber);

        try {
          const { data, error } = await supabase.auth.admin.createUser({
            email,
            password: DEFAULT_PASSWORD,
            email_confirm: true,
            user_metadata: {
              full_name: fullName,
              branch,
              account_number: accountNumber,
            },
          });

          if (error) {
            console.error("Auth error:", email, error.message);
            continue;
          }

          const { error: profileError } = await supabase
            .from("profiles")
            .insert({
              id: data.user.id,
              full_name: fullName, // ✅ fixed
              branch,
              account_number: accountNumber,
              must_change_password: true,
            });

          if (profileError) {
            console.error("Profile error:", email, profileError.message);
          } else {
            console.log("Created:", email);
          }
        } catch (e) {
          console.error("Unexpected error:", email, e.message);
        }
      }
    });
}

run();
