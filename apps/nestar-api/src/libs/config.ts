import { ObjectId } from 'bson';

export const availableAgentSorts = ['createdAt', 'updatedAt', 'memberLikes', 'memberViews', 'memberRank'];

export const shapeIngoMongoObjectId = (target: any) => {
  return typeof target === 'string' ? new ObjectId(target) : target;
};
