// Usage: npm run create-centre -- --name "Reliable" --email owner@x.in --owner "Owner Name"
import { parseArgs } from "node:util";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCentre, supabaseCentreDeps } from "@/lib/orgs/createCentre";

const { values } = parseArgs({ options: { name: { type: "string" }, email: { type: "string" }, owner: { type: "string" } } });
if (!values.name || !values.email || !values.owner) {
  console.error('Usage: npm run create-centre -- --name "Centre" --email owner@x.in --owner "Owner Name"');
  process.exit(1);
}
createCentre({ name: values.name, ownerEmail: values.email, ownerName: values.owner }, supabaseCentreDeps(createAdminClient()))
  .then((r) => console.log(`Created centre ${r.orgId}; invite sent to ${values.email}`))
  .catch((e) => { console.error(e); process.exit(1); });
