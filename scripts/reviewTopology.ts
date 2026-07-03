import { db } from "../packages/db/src/index.js";

type EntityType = "location" | "relationship" | "footprint" | "footprint-provider";
type Decision = "verified" | "rejected" | "unsupported" | "candidate";

const tableMap: Record<EntityType, string> = {
  location: "locations",
  relationship: "provider_relationships",
  footprint: "network_footprints",
  "footprint-provider": "footprint_providers",
};

async function main(): Promise<void> {
  const [entityArg, idArg, decisionArg] = process.argv.slice(2);
  const entity = entityArg as EntityType;
  const decision = decisionArg as Decision;
  const id = Number(idArg);

  if (!Object.hasOwn(tableMap, entity)) {
    throw new Error(
      "Entity must be location, relationship, footprint or footprint-provider",
    );
  }

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("ID must be a positive integer");
  }

  if (!["verified", "rejected", "unsupported", "candidate"].includes(decision)) {
    throw new Error(
      "Decision must be verified, rejected, unsupported or candidate",
    );
  }

  const tableName = tableMap[entity];
  const result = await db.query(
    `
      update ${tableName}
      set
        verification_status = $1,
        updated_at = now()
      where id = $2
      returning *;
    `,
    [decision, id],
  );

  if (result.rowCount !== 1) {
    throw new Error(`${entity} ${id} was not found`);
  }

  console.log(`${entity} ${id} marked ${decision}.`);
  console.log(result.rows[0]);
  await db.end();
}

main().catch(async (error) => {
  console.error("Topology review failed:", error);
  await db.end();
  process.exit(1);
});
