import Elysia from 'elysia';
import { createMemberRoute } from './create-member.route';
import { deleteMemberRoute } from './delete-member.route';
import { getMemberRoute } from './get-member.route';
import { getMembersRoute } from './get-members.route';
import { updateMemberRoute } from './update-member.route';

export const membersRoutes = new Elysia({
  prefix: '/:listId/members',
  tags: ['Whatsapp - Broadcast - List - Members'],
})
  .use(createMemberRoute)
  .use(updateMemberRoute)
  .use(deleteMemberRoute)
  .use(getMembersRoute)
  .use(getMemberRoute);
