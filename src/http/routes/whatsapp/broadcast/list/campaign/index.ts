import Elysia from 'elysia';
import { createCampaignRoute } from './create-campaign.route';
import { getCampaignRoute } from './get-campaign.route';
import { getCampaignsRoute } from './get-campaigns.route';

export const campaignsRoutes = new Elysia({
  prefix: '/:listId/campaigns',
  tags: ['Whatsapp - Broadcast - List - Campaigns'],
})
  .use(createCampaignRoute)
  .use(getCampaignsRoute)
  .use(getCampaignRoute);
