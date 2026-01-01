import { ObjectId } from 'bson';

export const shapeIngoMongoObjectId = (target: any) => {
  return typeof target === 'string' ? new ObjectId(target) : target;
};
