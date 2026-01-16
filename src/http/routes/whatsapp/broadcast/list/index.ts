import Elysia from 'elysia';
import { campaignsRoutes } from './campaign';
import { createListRoute } from './create-list.route';
import { getListRoute } from './get-list.route';
import { getListsRoute } from './get-lists.route';
import { importMembersRoute } from './import-contacts.route';
import { membersRoutes } from './members';
import { updateListRoute } from './update-list.route';

export const listRoutes = new Elysia({
  prefix: '/list',
  tags: ['Whatsapp - Broadcast - lists'],
})
  .use(createListRoute)
  .use(updateListRoute)
  .use(getListsRoute)
  .use(getListRoute)
  .use(importMembersRoute)
  .use(membersRoutes)
  .use(campaignsRoutes);
