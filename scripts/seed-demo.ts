// Creates (or recreates) "Demo Admissions Centre" with setup data and one user per role.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCentre, supabaseCentreDeps } from "@/lib/orgs/createCentre";
import { unwrapKey, masterKey } from "@/lib/crypto/keyWrap";
import { buildLeadRow } from "@/lib/leads/row";

const FIRST = ["Aarav","Vivaan","Aditya","Sai","Arjun","Ishaan","Rohan","Kabir","Ananya","Diya","Saanvi","Aadhya","Pooja","Sneha","Priya","Neha","Rahul","Amit","Sachin","Meera","Kavya","Tanvi","Omkar","Pratik","Sakshi","Yash","Nikita","Shruti","Harsh","Riya"];
const LAST = ["Patil","Jadhav","Kulkarni","Deshmukh","Pawar","Shinde","More","Joshi","Gaikwad","Chavan","Sharma","Verma","Khan","Shaikh","Bhosale","Kale","Naik","Mane","Rane","Salunkhe"];
const CITIES = ["Pune","Pimpri","Mumbai","Nashik","Nagpur","Aurangabad","Kolhapur","Satara","Thane","Solapur"];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

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

  // 300 demo leads (fake names and numbers) with a realistic status mix.
  const keysRow = ok(await db.from("org_keys").select("key_id, data_key_wrapped, hash_key_wrapped").eq("org_id", orgId).single()) as { key_id: string; data_key_wrapped: string; hash_key_wrapped: string };
  const keys = { keyId: keysRow.key_id, dataKey: unwrapKey(keysRow.data_key_wrapped, masterKey()), hashKey: unwrapKey(keysRow.hash_key_wrapped, masterKey()) };
  const profs = ok(await db.from("profiles").select("user_id, role").eq("org_id", orgId)) as { user_id: string; role: string }[];
  const caller = profs.find((p) => p.role === "caller")!.user_id, tl = profs.find((p) => p.role === "team_leader")!.user_id;
  const disp = ok(await db.from("dispositions").select("id, process_id, outcome").eq("org_id", orgId)) as { id: string; process_id: string; outcome: string }[];
  const types = ok(await db.from("lead_types").select("id").eq("org_id", orgId)) as { id: string }[];
  const prods = ok(await db.from("products").select("id").eq("org_id", orgId)) as { id: string }[];
  const src = ok(await db.from("lead_sources").insert({ org_id: orgId, name: "Demo admissions list" }).select("id").single()) as { id: string };
  const used = new Set<string>();
  const leads = Array.from({ length: 300 }, (_, i) => {
    let phone; do { phone = String(pick([6, 7, 8, 9])) + String(Math.floor(Math.random() * 1e9)).padStart(9, "0"); } while (used.has(phone));
    used.add(phone);
    const proc = procs[i % 2 === 0 ? 0 : 1]; // team Reena works SGI + BNI Dynamic
    const status = pick(["new", "new", "in_progress", "in_progress", "in_progress", "won", "lost", "lost"]);
    const d = status === "new" ? null : pick(disp.filter((x) => x.process_id === proc.id && x.outcome === status) );
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const row = buildLeadRow({
      phone, name, city: pick(CITIES), email: i % 3 === 0 ? `${name.toLowerCase().replace(" ", ".")}${i}@example.com` : null,
      extra: i % 4 === 0 ? { "12th %": String(55 + (i % 40)), "Preferred batch": pick(["Morning", "Evening"]) } : {},
      process_id: proc.id, product_id: pick(prods).id, lead_type_id: pick(types).id, source_id: src.id,
      assigned_to: i % 5 === 0 ? tl : i % 7 === 0 ? null : caller,
    }, keys, orgId, {});
    const created = new Date(Date.now() - Math.floor(Math.random() * 30) * 86_400_000 - Math.floor(Math.random() * 8) * 3_600_000).toISOString();
    return { ...row, status, disposition_id: d?.id ?? null, created_at: created };
  });
  const ins = ok(await db.from("leads").insert(leads).select("id, status, created_at")) as { id: string; status: string; created_at: string }[];
  await db.from("lead_events").insert(ins.map((l) => ({ org_id: orgId, lead_id: l.id, type: "created", payload: { via: "import", source: "Demo admissions list" }, at: l.created_at })));
  await db.from("lead_status_history").insert(ins.flatMap((l) => [
    { org_id: orgId, lead_id: l.id, from_status: null, to_status: "new", at: l.created_at },
    ...(l.status === "new" ? [] : [{ org_id: orgId, lead_id: l.id, from_status: "new", to_status: l.status, at: new Date(Date.parse(l.created_at) + 86_400_000).toISOString() }]),
  ]));

  // Store demo logins in .env.local (gitignored), replacing old ones.
  const env = readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("DEMO_"));
  writeFileSync(".env.local", [...env, ...Object.entries(creds).map(([k, v]) => `${k}="${v}"`)].join("\n") + "\n");
  console.log(`Seeded ${ORG} (${orgId}) with 300 leads. Demo logins saved to .env.local as DEMO_*.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
