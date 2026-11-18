// Creates (or recreates) "Demo Admissions Centre" with setup data and one user per role.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCentre, supabaseCentreDeps } from "@/lib/orgs/createCentre";

const ORG = "Demo Admissions Centre";
const db = createAdminClient();
const ok = <T>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data; };
const pw = () => randomBytes(9).toString("base64url") + "Aa1!";

const DISPOSITIONS: [string, "in_progress" | "won" | "lost", boolean?][] = [
  ["INTERESTED FOLLOW-UP", "in_progress"],
  ["Not Interested", "lost"],
  ["Admission Done", "won"],
  ["Already Admission Done In SGI", "lost"],
  ["visit scheduled", "in_progress", true],
  ["ALREADY ADMISSION TAKEN IN OTHER COLLEGE", "lost"],
  ["Turned Not Interested - Other College", "lost"],
  ["Turned Not Interested - Location not suitable", "lost"],
  ["Visit Done Not Interested", "lost"],
  ["Visit Done Follow Up For Admission", "in_progress", true],
];

async function main() {
  // Remove a previous demo org and its users.
  const old = ok(await db.from("orgs").select("id").eq("name", ORG)) as { id: string }[];
  for (const o of old) {
    const users = ok(await db.from("profiles").select("user_id").eq("org_id", o.id)) as { user_id: string }[];
    for (const u of users) await db.auth.admin.deleteUser(u.user_id);
    await db.from("orgs").delete().eq("id", o.id);
  }

  const creds: Record<string, string> = {};
  const saEmail = "superadmin@demo.callopps.test", saPw = pw();
  const { orgId } = await createCentre(
    { name: ORG, ownerEmail: saEmail, ownerName: "Demo Owner", ownerPassword: saPw },
    supabaseCentreDeps(db),
  );
  creds.DEMO_SUPER_ADMIN = `${saEmail} ${saPw}`;

  const procs = ok(await db.from("processes").insert(["SGI", "BNI Dynamic", "EC Infosolution"].map((name) => ({ org_id: orgId, name }))).select("id,name")) as { id: string }[];
  const teams = ok(await db.from("teams").insert(["Team Reena", "Team Arjun"].map((name) => ({ org_id: orgId, name }))).select("id")) as { id: string }[];
  await db.from("team_processes").insert([
    { team_id: teams[0].id, process_id: procs[0].id, org_id: orgId },
    { team_id: teams[0].id, process_id: procs[1].id, org_id: orgId },
    { team_id: teams[1].id, process_id: procs[2].id, org_id: orgId },
  ]);
  const [ug, pg] = ok(await db.from("product_categories").insert([{ org_id: orgId, name: "UG" }, { org_id: orgId, name: "PG" }]).select("id")) as { id: string }[];
  await db.from("products").insert([
    ["BBA LLB", ug], ["B.Sc Computer Science (B.Sc. CS)", ug], ["Bachelor of Pharmacy (B.Pharm)", ug],
    ["Bachelor of Physiotherapy (B.P.T)", ug], ["Diploma in Cyber Laws (D.C.L.)", pg], ["General Nursing & Midwifery (GNM)", pg],
  ].map(([name, c]) => ({ org_id: orgId, name, category_id: (c as { id: string }).id })));
  await db.from("lead_types").insert(["Hot", "Warm", "Cold"].map((name) => ({ org_id: orgId, name })));
  await db.from("dispositions").insert(procs.flatMap((p) =>
    DISPOSITIONS.map(([label, outcome, pres], sort) => ({ org_id: orgId, process_id: p.id, label, outcome, counts_presentation: !!pres, sort }))));

  for (const [role, team] of [["admin", null], ["team_leader", teams[0].id], ["caller", teams[0].id]] as const) {
    const email = `${role.replace("_", "")}@demo.callopps.test`, password = pw();
    const u = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error) throw u.error;
    ok(await db.from("profiles").insert({ user_id: u.data.user.id, org_id: orgId, full_name: `Demo ${role.replace("_", " ")}`, role, team_id: team }));
    if (role === "team_leader") await db.from("teams").update({ team_leader_id: u.data.user.id }).eq("id", teams[0].id);
    creds[`DEMO_${role.toUpperCase()}`] = `${email} ${password}`;
  }

  // Store demo logins in .env.local (gitignored), replacing old ones.
  const env = readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("DEMO_"));
  writeFileSync(".env.local", [...env, ...Object.entries(creds).map(([k, v]) => `${k}="${v}"`)].join("\n") + "\n");
  console.log(`Seeded ${ORG} (${orgId}). Demo logins saved to .env.local as DEMO_*.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
