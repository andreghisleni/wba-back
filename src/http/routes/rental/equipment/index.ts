import Elysia from "elysia";
import { createEquipmentRoute } from "./create-equipment-route";
import { getEquipmentRoute } from "./get-equipment-route";
import { getEquipmentsRoute } from "./get-equipments-route";
import { updateEquipmentRoute } from "./update-equipment-route";

export const equipmentRoutes = new Elysia({
  prefix: "/equipments",
  tags: ["Equipments"],
})
  .use(createEquipmentRoute)
  .use(getEquipmentRoute)
  .use(getEquipmentsRoute)
  .use(updateEquipmentRoute);
