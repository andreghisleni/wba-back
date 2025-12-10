import { prisma } from "~/db/client";

export async function findAllocationDeficits(eventId: string) {
  // Usa SQL raw para calcular déficit por alocação
  const results = await prisma.$queryRaw`
    SELECT
      a.id AS allocation_id,
      a.member_id,
      m.name AS member_name,
      a.event_ticket_range_id,
      a.quantity,
      COALESCE(linked.linked_count, 0) AS linked_count,
      (a.quantity - COALESCE(linked.linked_count, 0)) AS deficit
    FROM member_ticket_allocations a
    JOIN members m ON m.id = a.member_id
    LEFT JOIN LATERAL (
      SELECT count(1) AS linked_count
      FROM tickets t
      WHERE t.allocation_id = a.id
    ) linked ON true
    WHERE m.event_id = ${eventId}
      AND a.quantity > COALESCE(linked.linked_count, 0)
    ORDER BY m.order ASC, a.event_ticket_range_id;
  `;

  return results as Array<{
    allocation_id: string;
    member_id: string;
    member_name: string;
    event_ticket_range_id: string;
    quantity: number;
    linked_count: number;
    deficit: number;
  }>;
}

// exemplo de uso
if (require.main === module) {
  const eventId = process.argv[2];
  if (!eventId) {
    process.stderr.write("usage: node findAllocationDeficits.js <eventId>\n");
    process.exit(1);
  }
  findAllocationDeficits(eventId).then((r) => {
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    process.exit(0);
  });
}
