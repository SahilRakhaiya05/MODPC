import { reddit } from '@devvit/web/server';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: 'ModDesk OS - Private Moderator Operations Desk',
  });
};
