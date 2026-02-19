import Elysia from 'elysia';
import { createTagRoute } from './create-tag-route';
import { getTagByIdRoute } from './get-tag-by-id-route';
import { getTagsRoute } from './get-tags-route';
import { updateTagRoute } from './update-tag-route';

export const tagsRoutes = new Elysia({
  prefix: '/tags',
  tags: ['Tags'],
})
  .use(getTagByIdRoute)
  .use(getTagsRoute)
  .use(createTagRoute)
  .use(updateTagRoute);
