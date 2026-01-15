import Elysia from 'elysia';
import { listRoutes } from './list';

export const broadcastRoutes = new Elysia({
  prefix: '/broadcast',
  tags: ['Broadcast'],
})
  .use(listRoutes)
