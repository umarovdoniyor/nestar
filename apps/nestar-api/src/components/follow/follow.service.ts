import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { Follower, Followers, Following, Followings } from '../../libs/dto/follow/follow';
import { MemberService } from '../member/member.service';
import { Direction, Message } from '../../libs/enums/common.enum';
import { MemberStatus } from '../../libs/enums/member.enum';
import { FollowInquiry } from '../../libs/dto/follow/follow.input';
import { T } from '../../libs/types/common';
import { lookupFollowerData, lookupFollowingData } from '../../libs/config';

@Injectable()
export class FollowService {
  constructor(
    @InjectModel('Follow') private readonly followModel: Model<Follower | Following>,
    private readonly memberService: MemberService,
  ) {}

  public async subscribe(followerId: ObjectId, followingId: ObjectId): Promise<Follower> {
    // Validate
    if (followerId.toString() === followingId.toString()) {
      throw new BadRequestException(Message.SELF_SUBSCRIPTION_DENIED);
    }

    const targetMember = await this.memberService.getMember(null, followingId);
    if (!targetMember || targetMember.memberStatus !== MemberStatus.ACTIVE)
      throw new BadRequestException(Message.NO_DATA_FOUND);

    // Check for existing subscription
    const existing = await this.followModel.findOne({ followerId, followingId });
    if (existing) throw new BadRequestException(Message.ALREADY_SUBSCRIBED);

    // Create subscription
    const result = await this.registerSubscription(followerId, followingId);

    try {
      await Promise.all([
        this.memberService.memberStatsEditor({ _id: followerId, targetKey: 'memberFollowings', modifier: 1 }),
        this.memberService.memberStatsEditor({ _id: followingId, targetKey: 'memberFollowers', modifier: 1 }),
      ]);
    } catch (err) {
      console.log('Error, FollowService.subscribe:', err.message);
      throw new InternalServerErrorException('Failed to update member statistics');
    }

    return result;
  }

  private async registerSubscription(followerId: ObjectId, followingId: ObjectId): Promise<Follower | null> {
    try {
      return await this.followModel.create({ followingId, followerId });
    } catch (err) {
      console.log('Error, Server.model:', err.message);
      throw new BadRequestException(Message.CREATE_FAILED);
    }
  }

  public async unsubscribe(followerId: ObjectId, followingId: ObjectId): Promise<Follower> {
    const targetMember = await this.memberService.getMember(null, followingId);
    if (!targetMember) throw new BadRequestException(Message.NO_DATA_FOUND);

    const result = await this.followModel.findOneAndDelete({ followerId, followingId }).exec();
    if (!result) throw new BadRequestException(Message.NO_DATA_FOUND);

    try {
      await Promise.all([
        this.memberService.memberStatsEditor({ _id: followerId, targetKey: 'memberFollowings', modifier: -1 }),
        this.memberService.memberStatsEditor({ _id: followingId, targetKey: 'memberFollowers', modifier: -1 }),
      ]);
    } catch (err) {
      console.log('Error, FollowService.unsubscribe:', err.message);
      throw new InternalServerErrorException('Failed to update member statistics');
    }

    return result;
  }

  public async getMemberFollowings(memberId: ObjectId, input: FollowInquiry): Promise<Followings> {
    const { page, limit, search } = input;
    if (!search?.followerId) throw new BadRequestException(Message.BAD_REQUEST);

    const match: T = { followerId: search?.followerId };
    console.log('match:', match);

    const result = await this.followModel
      .aggregate([
        { $match: match },
        { $sort: { createdAt: Direction.DESC } },
        {
          $facet: {
            list: [
              { $skip: (page - 1) * limit },
              { $limit: limit },
              // TODO: meLiked and meFollowed
              lookupFollowingData,
              { $unwind: '$followingData' },
            ],
            metaCounter: [{ $count: 'total' }],
          },
        },
      ])
      .exec();

    /**
     * Logic issue with empty results - if (!result.length) will throw an error even on successful queries with no results. Aggregation always returns an array. Better to just return the result:
     * return result[0] || { list: [], metaCounter: [] };
     */

    // if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
    return result[0] || { list: [], metaCounter: [] };
  }

  public async getMemberFollowers(memberId: ObjectId, input: FollowInquiry): Promise<Followers> {
    const { page, limit, search } = input;
    if (!search?.followingId) throw new BadRequestException(Message.BAD_REQUEST);

    const match: T = { followingId: search?.followingId };
    console.log('match:', match);

    const result = await this.followModel
      .aggregate([
        { $match: match },
        { $sort: { createdAt: Direction.DESC } },
        {
          $facet: {
            list: [
              { $skip: (page - 1) * limit },
              { $limit: limit },
              // TODO: meLiked and meFollowed
              lookupFollowerData,
              { $unwind: '$followerData' },
            ],
            metaCounter: [{ $count: 'total' }],
          },
        },
      ])
      .exec();

    /**
     * Logic issue with empty results - if (!result.length) will throw an error even on successful queries with no results. Aggregation always returns an array. Better to just return the result:
     * return result[0] || { list: [], metaCounter: [] };
     */

    if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
    return result[0];
  }

  // END
}
