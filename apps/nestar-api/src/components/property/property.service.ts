import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import {
  AgentPropertiesInquiry,
  AllPropertiesInquiry,
  OrdinaryInquiry,
  PropertiesInquiry,
  PropertyInput,
} from '../../libs/dto/property/property.input';
import { Properties, Property } from '../../libs/dto/property/property';
import { Direction, Message } from '../../libs/enums/common.enum';
import { MemberService } from '../member/member.service';

import { StatisticModifier, T } from '../../libs/types/common';
import { PropertyStatus } from '../../libs/enums/property.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { ViewService } from '../view/view.service';
import * as moment from 'moment';
import { PropertyUpdate } from '../../libs/dto/property/property.update';
import { lookupAuthMemberLiked, lookupMember, shapeIngoMongoObjectId } from '../../libs/config';
import { LikeService } from '../like/like.service';
import { LikeInput } from '../../libs/dto/like/like.input';
import { LikeGroup } from '../../libs/enums/like.enum';

@Injectable()
export class PropertyService {
  constructor(
    @InjectModel('Property') private readonly propertyModel: Model<Property>,
    private memberService: MemberService,
    private viewService: ViewService,
    private likeService: LikeService,
  ) {}

  public async createProperty(input: PropertyInput): Promise<Property> {
    try {
      const result = await this.propertyModel.create(input);
      // increase memberProperties
      await this.memberService.memberStatsEditor({
        _id: result.memberId,
        targetKey: 'memberProperties',
        modifier: 1,
      });
      return result;
    } catch (err) {
      console.log('Error, Service.model: ', err.message);
      throw new BadRequestException(Message.CREATE_FAILED);
    }
  }

  public async getProperty(memberId: ObjectId, propertyId: ObjectId): Promise<Property> {
    // 1. Find ACTIVE property only
    const search: T = {
      _id: propertyId,
      propertyStatus: PropertyStatus.ACTIVE, // ⭐ Only ACTIVE properties
    };

    const targetProperty: Property = await this.propertyModel.findOne(search).lean().exec();
    if (!targetProperty) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

    // 2. View tracking (only for authenticated users)
    if (memberId) {
      const viewInput = { memberId: memberId, viewRefId: propertyId, viewGroup: ViewGroup.PROPERTY }; // ⭐ Different from MEMBER views
      const newView = await this.viewService.recordView(viewInput);

      // First-time view: increment counter
      if (newView) {
        await this.propertyStatsEditor({ _id: propertyId, targetKey: 'propertyViews', modifier: 1 });
        targetProperty.propertyViews++; // Update response
      }
      // meLiked
      const likeInput: LikeInput = { memberId: memberId, likeRefId: propertyId, likeGroup: LikeGroup.PROPERTY };
      const meLiked = await this.likeService.checkLikeExistence(likeInput);
      targetProperty.meLiked = meLiked;
    }

    // 3. Fetch agent information
    targetProperty.memberData = await this.memberService.getMember(null, targetProperty.memberId);
    return targetProperty;
  }

  public async updateProperty(memberId: ObjectId, input: PropertyUpdate): Promise<Property> {
    // 1. Extract and prepare dates based on status
    let { propertyStatus, soldAt, deletedAt } = input;

    // 3. Update only if: agent owns it AND property is ACTIVE
    const search: T = {
      _id: input._id,
      memberId: memberId, // ⭐ Must own property
      propertyStatus: PropertyStatus.ACTIVE, // ⭐ Must be ACTIVE to update
    };

    // 2. Auto-set dates for status changes
    if (propertyStatus === PropertyStatus.SOLD)
      soldAt = moment().toDate(); // ⭐ Auto-set sold date
    else if (propertyStatus === PropertyStatus.DELETE) deletedAt = moment().toDate(); // ⭐ Auto-set deleted date

    const result = await this.propertyModel.findOneAndUpdate(search, input, { new: true }).exec();

    if (!result) throw new InternalServerErrorException(Message.UPDATE_FAILED);

    // 4. Update agent's property count if SOLD or DELETED
    if (soldAt || deletedAt) {
      await this.memberService.memberStatsEditor({ _id: memberId, targetKey: 'memberProperties', modifier: -1 });
    }
    return result;
  }

  public async getProperties(memberId: ObjectId, input: PropertiesInquiry): Promise<Properties> {
    // 1. Match documents based on filters
    const match: T = { propertyStatus: PropertyStatus.ACTIVE };

    // 2. Sort results
    const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

    this.shapeMatchQuery(match, input);
    console.log('match: ', match);

    const result = await this.propertyModel
      .aggregate([
        { $match: match },
        { $sort: sort },
        {
          // 3. Split into two pipelines
          $facet: {
            list: [
              { $skip: (input.page - 1) * input.limit }, // ⭐ Pagination
              { $limit: input.limit }, // ⭐ Page size
              // meLiked
              lookupAuthMemberLiked(memberId),
              lookupMember,
              { $unwind: '$memberData' }, // ⭐ Convert array to object
            ],
            metaCounter: [{ $count: 'total' }], // ⭐ Get total count for pagination
          },
        },
      ])
      .exec();
    if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

    return result[0];
  }

  private shapeMatchQuery(match: T, input: PropertiesInquiry): void {
    const {
      memberId,
      locationList,
      roomsList,
      bedsList,
      typeList,
      periodsRange,
      pricesRange,
      squaresRange,
      options,
      text,
    } = input.search;

    if (memberId) match.memberId = shapeIngoMongoObjectId(memberId);
    if (locationList && locationList.length > 0) match.propertyLocation = { $in: locationList };
    if (roomsList && roomsList.length > 0) match.propertyRooms = { $in: roomsList };
    if (bedsList && bedsList.length > 0) match.propertyBeds = { $in: bedsList };
    if (typeList && typeList.length > 0) match.propertyType = { $in: typeList };

    if (pricesRange) match.propertyPrice = { $gte: pricesRange.start, $lte: pricesRange.end };
    if (periodsRange) match.createdAt = { $gte: periodsRange.start, $lte: periodsRange.end };
    if (squaresRange) match.propertySquare = { $gte: squaresRange.start, $lte: squaresRange.end };

    if (text) match.propertyTitle = { $regex: new RegExp(text, 'i') };
    if (options) {
      match['$or'] = options.map((ele) => {
        return { [ele]: true };
      });
    }
  }

  public async getFavorites(memberId: ObjectId, input: OrdinaryInquiry): Promise<Properties> {
    return await this.likeService.getFavoriteProperties(memberId, input);
  }

  public async getVisited(memberId: ObjectId, input: OrdinaryInquiry): Promise<Properties> {
    return await this.viewService.getVisitedProperties(memberId, input);
  }

  public async getAgentProperties(memberId: ObjectId, input: AgentPropertiesInquiry): Promise<Properties> {
    const { propertyStatus } = input.search;

    // ⭐ CRITICAL: Block DELETE status requests
    if (propertyStatus === PropertyStatus.DELETE) throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);

    const match: T = {
      memberId: memberId, // ⭐ Filter by agent's own ID
      propertyStatus: propertyStatus ?? { $ne: PropertyStatus.DELETE }, // ⭐ Default: exclude DELETE
    };
    const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

    const result = await this.propertyModel
      .aggregate([
        { $match: match },
        { $sort: sort },
        {
          $facet: {
            list: [
              { $skip: (input.page - 1) * input.limit },
              { $limit: input.limit },
              lookupMember, // ⭐ Join agent data (same agent)
              { $unwind: '$memberData' },
            ],
            metaCounter: [{ $count: 'total' }],
          },
        },
      ])
      .exec();
    if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
    return result[0];
  }

  public async likeTargetProperty(memberId: ObjectId, likeRefId: ObjectId): Promise<Property> {
    const target: Property = await this.propertyModel
      .findOne({ _id: likeRefId, propertyStatus: PropertyStatus.ACTIVE })
      .exec();
    if (!target) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

    const input: LikeInput = {
      memberId: memberId,
      likeRefId: likeRefId,
      likeGroup: LikeGroup.PROPERTY,
    };

    // LIKE TOGGLE via Like Service
    const modifier = await this.likeService.toggleLike(input);
    const result = await this.propertyStatsEditor({ _id: likeRefId, targetKey: 'propertyLikes', modifier: modifier });
    if (!result) throw new InternalServerErrorException(Message.SOMETHING_WENT_WRONG);
    return result;
  }

  public async getAllPropertiesByAdmin(input: AllPropertiesInquiry): Promise<Properties> {
    const { propertyStatus, propertyLocationList } = input.search;
    const match: T = {}; // ⭐ EMPTY = ALL properties (including DELETED!)
    const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

    // ⭐ Admin-specific filters (optional)
    if (propertyStatus) match.propertyStatus = propertyStatus;
    if (propertyLocationList) match.propertyLocation = { $in: propertyLocationList };

    const result = await this.propertyModel
      .aggregate([
        { $match: match },
        { $sort: sort },
        {
          $facet: {
            list: [
              { $skip: (input.page - 1) * input.limit },
              { $limit: input.limit },
              lookupMember, // ⭐ Join agent data
              { $unwind: '$memberData' },
            ],
            metaCounter: [{ $count: 'total' }],
          },
        },
      ])
      .exec();
    if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
    return result[0];
  }

  public async updatePropertyByAdmin(input: PropertyUpdate): Promise<Property> {
    let { propertyStatus, soldAt, deletedAt } = input;
    const search: T = {
      _id: input._id,
      propertyStatus: PropertyStatus.ACTIVE, // ⭐ Cannot update SOLD or DELETE properties
    };

    if (propertyStatus === PropertyStatus.SOLD) soldAt = moment().toDate();
    else if (propertyStatus === PropertyStatus.DELETE) deletedAt = moment().toDate();

    const result = await this.propertyModel.findOneAndUpdate(search, input, { new: true }).exec();

    if (!result) throw new InternalServerErrorException(Message.UPDATE_FAILED);

    if (soldAt || deletedAt) {
      await this.memberService.memberStatsEditor({ _id: result.memberId, targetKey: 'memberProperties', modifier: -1 });
    }
    return result;
  }

  public async removePropertyByAdmin(propertyId: ObjectId): Promise<Property> {
    const search: T = { _id: propertyId, propertyStatus: PropertyStatus.DELETE };
    const result = await this.propertyModel.findOneAndDelete(search).exec();
    if (!result) throw new InternalServerErrorException(Message.REMOVE_FAILED);

    return result;
  }

  public async propertyStatsEditor(input: StatisticModifier): Promise<Property> {
    const { _id, targetKey, modifier } = input;
    return await this.propertyModel.findByIdAndUpdate(_id, { $inc: { [targetKey]: modifier } }, { new: true }).exec();
  }
}
